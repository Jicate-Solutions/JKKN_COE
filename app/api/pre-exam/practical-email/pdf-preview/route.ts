import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { generateAppointmentPdf } from '@/lib/pdf/practical-appointment-letter'
import { getPdfSettingsWithFallback } from '@/lib/pdf/settings-service'
import { fetchMyJKKNStaffById } from '@/services/myjkkn-service'
import type { AppointmentLetterData } from '@/types/practical-email'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a string for use in a filename:
 * - lowercase
 * - spaces → underscores
 * - strip characters that are not alphanumeric, underscore, or hyphen
 */
function sanitizeFilename(value: string): string {
	return value
		.toLowerCase()
		.replace(/\s+/g, '_')
		.replace(/[^a-z0-9_-]/g, '')
}

/**
 * Fetch all practical exam timetable rows assigned to a given examiner,
 * including course info and student counts.
 */
async function fetchExaminerCourses(
	supabase: ReturnType<typeof getSupabaseServer>,
	examinerType: 'internal' | 'external' | 'skilled' | 'programmer',
	examinerIdentifier: string,
	institutionsId: string,
	examinationSessionId: string
): Promise<
	Array<{
		exam_date: string
		session: string
		programme: string
		course_code: string
		course_name: string
		student_count: number
	}>
> {
	// 1. Resolve timetable IDs via the examiner assignment table
	let assignmentQuery = supabase
		.from('exam_timetable_examiners')
		.select('exam_timetable_id')
		.eq('examiner_type', examinerType)

	if (examinerType === 'external') {
		assignmentQuery = assignmentQuery.eq('examiner_id', examinerIdentifier)
	} else {
		assignmentQuery = assignmentQuery.eq('staff_id', examinerIdentifier)
	}

	const { data: assignments, error: assignErr } = await assignmentQuery

	if (assignErr) {
		console.error('Error fetching examiner assignments:', assignErr)
		return []
	}

	if (!assignments || assignments.length === 0) return []

	const timetableIds = assignments.map((a) => a.exam_timetable_id)

	// 2. Fetch timetable rows scoped to the given institution + session
	const { data: timetables, error: ttErr } = await supabase
		.from('exam_timetables')
		.select('id, exam_date, session, course_id')
		.in('id', timetableIds)
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', examinationSessionId)
		.eq('is_published', true)

	if (ttErr) {
		console.error('Error fetching timetables:', ttErr)
		return []
	}

	if (!timetables || timetables.length === 0) return []

	const courseIds = [...new Set(timetables.map((t) => t.course_id).filter(Boolean))]

	// 3. Parallel: fetch course details + student counts
	const [{ data: courses }, { data: batchStudents }] = await Promise.all([
		supabase
			.from('courses')
			.select('id, course_code, course_name, board_code')
			.in('id', courseIds),
		supabase
			.from('practical_batch_students')
			.select('exam_timetable_id')
			.in('exam_timetable_id', timetableIds),
	])

	// 4. Build course lookup map
	const courseMap = new Map<string, { course_code: string; course_name: string; board_code: string | null }>()
	for (const c of courses || []) {
		courseMap.set(c.id, {
			course_code: c.course_code || '',
			course_name: c.course_name || '',
			board_code: c.board_code || null,
		})
	}

	// 5. Fetch board names for the programme column
	const boardCodes = [
		...new Set(
			(courses || [])
				.map((c) => c.board_code)
				.filter((code): code is string => !!code)
		),
	]

	const boardMap = new Map<string, string>()
	if (boardCodes.length > 0) {
		const { data: boards } = await supabase
			.from('board')
			.select('board_code, board_name')
			.in('board_code', boardCodes)

		for (const b of boards || []) {
			boardMap.set(b.board_code, b.board_name || b.board_code)
		}
	}

	// 6. Build student count lookup map
	const studentCountMap = new Map<string, number>()
	for (const s of batchStudents || []) {
		studentCountMap.set(s.exam_timetable_id, (studentCountMap.get(s.exam_timetable_id) || 0) + 1)
	}

	// 7. Sort: exam_date ASC, FN before AN
	const sorted = [...timetables].sort((a, b) => {
		if (a.exam_date !== b.exam_date) return a.exam_date < b.exam_date ? -1 : 1
		return a.session === 'FN' ? -1 : 1
	})

	return sorted.map((t) => {
		const course = courseMap.get(t.course_id) || {
			course_code: '',
			course_name: '',
			board_code: null,
		}
		const programme = course.board_code
			? boardMap.get(course.board_code) || course.board_code
			: ''

		return {
			exam_date: t.exam_date,
			session: t.session,
			programme,
			course_code: course.course_code,
			course_name: course.course_name,
			student_count: studentCountMap.get(t.id) || 0,
		}
	})
}

// ---------------------------------------------------------------------------
// GET — Generate and return a PDF appointment letter for preview/download
//
// Query params:
//   institutions_id          (required)
//   institution_code         (required)
//   examination_session_id   (required)
//   examiner_key             (required) — "external_<uuid>" | "internal_<staffid>" | "skilled_<staffid>"
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const institutionCode = searchParams.get('institution_code')
		const examinationSessionId = searchParams.get('examination_session_id')
		const examinerKey = searchParams.get('examiner_key')

		// ---- Validate required params ----
		if (!institutionsId?.trim()) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}
		if (!institutionCode?.trim()) {
			return NextResponse.json({ error: 'institution_code is required' }, { status: 400 })
		}
		if (!examinationSessionId?.trim()) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}
		if (!examinerKey?.trim()) {
			return NextResponse.json({ error: 'examiner_key is required' }, { status: 400 })
		}

		// ---- Parse examiner_key ----
		const underscoreIdx = examinerKey.indexOf('_')
		if (underscoreIdx === -1) {
			return NextResponse.json({ error: 'Invalid examiner_key format' }, { status: 400 })
		}

		const examinerType = examinerKey.substring(0, underscoreIdx) as 'internal' | 'external' | 'skilled' | 'programmer'
		const examinerIdentifier = examinerKey.substring(underscoreIdx + 1)

		if (!['internal', 'external', 'skilled', 'programmer'].includes(examinerType)) {
			return NextResponse.json(
				{ error: `Unknown examiner type "${examinerType}" in examiner_key` },
				{ status: 400 }
			)
		}

		if (!examinerIdentifier) {
			return NextResponse.json({ error: 'examiner_key identifier part is empty' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// ---- Step 1: Fetch institution basic info ----
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id, institution_code, name')
			.eq('id', institutionsId)
			.single()

		if (instError || !institution) {
			console.error('Error fetching institution:', instError)
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		// ---- Step 2: Fetch PDF settings (all visual settings + institution details) ----
		const pdfSettings = await getPdfSettingsWithFallback(institutionCode, 'report')

		// Institution details come from pdf_institution_settings with hardcoded fallbacks
		const institutionName = (pdfSettings as any)?.institution_name || institution.name || 'J.K.K. NATARAJA COLLEGE OF ARTS & SCIENCE'
		const institutionAddress = 'Komarapalayam- 638 183, Namakkal District, Tamil Nadu'
		const institutionAccreditation = '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)'

		// COE details from pdf_institution_settings
		const coeName = (pdfSettings as any)?.coe_name || 'Controller of Examinations'
		const coeQualifications = (pdfSettings as any)?.coe_qualifications || ''
		const coeContact = (pdfSettings as any)?.coe_contact || ''
		const coeEmail = process.env.COE_EMAIL || 'coearts@jkkn.ac.in'

		// ---- Step 3: Fetch examination session name ----
		const { data: session, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('session_name')
			.eq('id', examinationSessionId)
			.single()

		if (sessionError || !session) {
			console.error('Error fetching examination session:', sessionError)
			return NextResponse.json({ error: 'Examination session not found' }, { status: 404 })
		}

		const examSessionName = session.session_name || ''

		// ---- Step 4: Fetch examiner details ----
		let examinerName = ''
		let examinerDesignation = ''
		let examinerDepartment = ''
		let examinerInstitution = ''
		let examinerAddress = ''
		let examinerMobile = ''

		const examinerRole =
			examinerType === 'internal'
				? 'an Internal Examiner'
				: examinerType === 'external'
					? 'an External Examiner'
					: examinerType === 'programmer'
						? 'a Programmer'
						: 'a Skilled Examiner'

		if (examinerType === 'external') {
			// External: identifier is the examiners.id UUID
			const { data: examiner, error: exErr } = await supabase
				.from('examiners')
				.select('full_name, email, designation, department, mobile, institution_name, institution_address, address, city, state')
				.eq('id', examinerIdentifier)
				.single()

			if (exErr || !examiner) {
				console.error('Error fetching external examiner:', exErr)
				return NextResponse.json(
					{ error: `External examiner with id "${examinerIdentifier}" not found` },
					{ status: 404 }
				)
			}

			examinerName = examiner.full_name || ''
			examinerDesignation = examiner.designation || ''
			examinerDepartment = examiner.department || ''
			examinerMobile = examiner.mobile || ''
			examinerInstitution = examiner.institution_name || ''
			examinerAddress = [
				examiner.institution_address || examiner.address,
				examiner.city,
				examiner.state,
			]
				.filter(Boolean)
				.join(', ')
		} else {
			// Internal / skilled / programmer: identifier is staff_id from exam_timetable_examiners
			const { data: assignment, error: staffErr } = await supabase
				.from('exam_timetable_examiners')
				.select('staff_name, staff_email, staff_mobile, staff_designation')
				.eq('staff_id', examinerIdentifier)
				.eq('examiner_type', examinerType)
				.limit(1)
				.single()

			if (staffErr || !assignment) {
				console.error('Error fetching staff examiner assignment:', staffErr)
				return NextResponse.json(
					{ error: `${examinerType} examiner with staff_id "${examinerIdentifier}" not found` },
					{ status: 404 }
				)
			}

			examinerName = assignment.staff_name || ''
			examinerDesignation = assignment.staff_designation || ''
			examinerMobile = assignment.staff_mobile || ''
			examinerInstitution = institutionName
			examinerAddress = institutionAddress

			// Fetch designation & department from MyJKKN staff API
			try {
				const staffData = await fetchMyJKKNStaffById(examinerIdentifier)
				if (staffData) {
					if (!examinerDesignation && staffData.designation) {
						examinerDesignation = staffData.designation
					}
					if (staffData.department_code) {
						examinerDepartment = staffData.department_code
					}
				}
			} catch {
				console.warn(`Failed to fetch MyJKKN staff details for ${examinerIdentifier}`)
			}
		}

		// ---- Step 5: Fetch examiner's assigned courses ----
		const courses = await fetchExaminerCourses(
			supabase,
			examinerType,
			examinerIdentifier,
			institutionsId,
			examinationSessionId
		)

		if (courses.length === 0) {
			return NextResponse.json(
				{ error: 'No course assignments found for this examiner in the given session' },
				{ status: 404 }
			)
		}

		// ---- Step 6: Build AppointmentLetterData ----
		const refNumber = buildPracticalRefNumber(institutionCode, examSessionName)
		const letterDate = new Date().toISOString().split('T')[0] // ISO date, formatDate() inside the PDF lib handles display

		const appointmentData: AppointmentLetterData = {
			institution_name: institutionName,
			institution_address: institutionAddress,
			institution_accreditation: institutionAccreditation,
			coe_name: coeName,
			coe_qualifications: coeQualifications,
			coe_contact: coeContact,
			coe_email: coeEmail,
			header_image_url: pdfSettings?.logo_url || null,
			coe_signature_url: (pdfSettings as any)?.coe_signature_url || null,
			coe_seal_url: (pdfSettings as any)?.coe_seal_url || null,
			ref_number: refNumber,
			letter_date: letterDate,
			exam_session_name: examSessionName,
			examiner_name: examinerName,
			examiner_designation: examinerDesignation,
			examiner_department: examinerDepartment,
			examiner_institution: examinerInstitution,
			examiner_address: examinerAddress,
			examiner_mobile: examinerMobile,
			examiner_type: examinerType,
			examiner_role: examinerRole,
			courses: courses.map((c) => ({
				date: c.exam_date,
				session: c.session,
				programme: c.programme,
				course_code: c.course_code,
				course_name: c.course_name,
				student_count: c.student_count,
			})),
			pdf_settings: pdfSettings,
		}

		// ---- Step 7: Generate PDF ----
		let pdfBuffer: Buffer
		try {
			pdfBuffer = await generateAppointmentPdf(appointmentData)
		} catch (pdfErr) {
			console.error('PDF generation failed:', pdfErr)
			return NextResponse.json(
				{ error: 'Failed to generate PDF' },
				{ status: 500 }
			)
		}

		// ---- Step 8: Build filename and return response ----
		const safeSession = sanitizeFilename(examSessionName)
		const safeExaminerName = sanitizeFilename(examinerName)
		const safeInstitutionCode = sanitizeFilename(institutionCode)
		const filename = `${safeInstitutionCode}_${safeSession}_${examinerType}_${safeExaminerName}.pdf`

		return new Response(pdfBuffer, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="${filename}"`,
				'Content-Length': String(pdfBuffer.length),
			},
		})
	} catch (error) {
		console.error('Unexpected error in GET /api/pre-exam/practical-email/pdf-preview:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * Build practical appointment ref number.
 * Format: JKKN{code}/ CoE/ YY-YY, {session months}/Sem Practicals
 */
function buildPracticalRefNumber(institutionCode: string, examSessionName: string): string {
	const yearMatch = examSessionName.match(/\d{4}/)
	const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear()
	const academicYear = `${String(year - 1).slice(-2)}-${String(year).slice(-2)}`

	const sessionMonths = examSessionName
		.replace(/[-\s]*\d{4}/, '')
		.trim()
		.split(/[-\s]+/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join('-')

	return `JKKN${institutionCode}/ CoE/ ${academicYear}, ${sessionMonths}/Sem Practicals`
}
