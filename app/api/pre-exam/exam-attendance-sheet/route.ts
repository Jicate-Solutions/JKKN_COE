/**
 * Exam Attendance Sheet Bulk API
 *
 * GET /api/pre-exam/exam-attendance-sheet?institution_id=XXX&examination_session_id=YYY&exam_date=YYYY-MM-DD&session=FN
 *
 * Returns all registrations grouped by (program, subject) for a given exam date & session.
 * Includes student photos from MyJKKN API.
 * Sorted by semester ASC, then program_order ASC, then course_code ASC.
 * This matches the QP count report ordering.
 * Within each sheet, students sorted: regular first then arrears, both by register_number.
 *
 * KEY: Sheet keys are built from exam_registrations (not timetables), because
 * timetables may have only one course_offering_id per subject while registrations
 * span ALL programs.
 */

import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { AttendanceSheetPdfData, AttendanceSheet, AttendanceSheetStudent } from '@/types/exam-attendance-sheet'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionId = searchParams.get('institution_id')
		const examinationSessionId = searchParams.get('examination_session_id')
		const examDate = searchParams.get('exam_date')
		const session = searchParams.get('session') // FN or AN
		const batchTimetableId = searchParams.get('batch_timetable_id') // optional, for practical batches

		if (!institutionId || !examinationSessionId || !examDate || !session) {
			return NextResponse.json(
				{ error: 'institution_id, examination_session_id, exam_date, and session are all required' },
				{ status: 400 }
			)
		}

		// Step 1: Get institution details
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id, institution_code, name, myjkkn_institution_ids')
			.eq('id', institutionId)
			.single()

		if (instError || !institution) {
			console.error('[AttendanceSheet] Institution lookup error:', instError)
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		// Step 2: Get examination session (with exam type name for the PDF heading)
		const { data: examSession, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id, session_code, session_name, exam_type_id, exam_types(examination_name)')
			.eq('id', examinationSessionId)
			.single()

		if (sessionError || !examSession) {
			return NextResponse.json({ error: 'Examination session not found' }, { status: 404 })
		}

		// Step 3: Get PDF settings for logos
		const { data: pdfSettings } = await supabase
			.from('pdf_institution_settings')
			.select('logo_url, secondary_logo_url')
			.eq('institution_code', institution.institution_code)
			.eq('active', true)
			.order('wef_date', { ascending: false })
			.limit(1)
			.single()

		// Step 4: Find all exam_timetables for this date + session → get course_ids
		const { data: timetables, error: ttError } = await supabase
			.from('exam_timetables')
			.select('id, course_id')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', examinationSessionId)
			.eq('exam_date', examDate)
			.eq('session', session)
			.eq('is_published', true)
			.range(0, 9999)

		if (ttError) {
			return NextResponse.json({ error: 'Failed to fetch exam timetables', details: ttError }, { status: 500 })
		}

		if (!timetables || timetables.length === 0) {
			return NextResponse.json({ error: 'No exams scheduled for this date and session' }, { status: 404 })
		}

		// Step 5: Get course details (course_code, course_name) from timetable course_ids
		const courseIds = [...new Set(timetables.map(t => t.course_id).filter(Boolean))]

		const { data: courses, error: coursesError } = await supabase
			.from('courses')
			.select('id, course_code, course_name')
			.in('id', courseIds)
			.range(0, 9999)

		if (coursesError) {
			return NextResponse.json({ error: 'Failed to fetch courses', details: coursesError }, { status: 500 })
		}

		const courseMap = new Map((courses || []).map(c => [c.id, c]))
		// Build course_code list from timetable courses
		const timetableCourseCodeSet = new Set<string>()
		const courseCodeToTitle = new Map<string, string>()
		for (const tt of timetables) {
			const course = courseMap.get(tt.course_id)
			if (course) {
				timetableCourseCodeSet.add(course.course_code)
				courseCodeToTitle.set(course.course_code, course.course_name || course.course_code)
			}
		}

		const allCourseCodesFromTimetable = [...timetableCourseCodeSet]

		if (allCourseCodesFromTimetable.length === 0) {
			return NextResponse.json({ error: 'No courses found for scheduled exams' }, { status: 404 })
		}

		// Step 6: Fetch ALL registrations for these course_codes (across ALL programs)
		// Include course_offerings join to get semester for proper ordering
		const { data: allRegistrations, error: regError } = await supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, student_name, is_regular, attempt_number, program_code, course_code, course_offering_id, course_offerings(semester)')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', examinationSessionId)
			.in('course_code', allCourseCodesFromTimetable)
			.eq('fee_paid', true)
			.order('stu_register_no', { ascending: true })
			.range(0, 9999)

		if (regError) {
			return NextResponse.json({ error: 'Failed to fetch registrations', details: regError }, { status: 500 })
		}

		if (!allRegistrations || allRegistrations.length === 0) {
			return NextResponse.json({ error: 'No registrations found for scheduled exams' }, { status: 404 })
		}

		// Step 7: Build sheet keys from registrations (not timetables)
		// Group by unique (program_code, course_code) pairs
		const registrationMap = new Map<string, typeof allRegistrations>()
		const sheetKeySet = new Set<string>()

		for (const reg of allRegistrations) {
			const key = `${reg.program_code}::${reg.course_code}`
			if (!registrationMap.has(key)) registrationMap.set(key, [])
			registrationMap.get(key)!.push(reg)
			sheetKeySet.add(key)
		}

		// Step 7b: If a practical batch is specified, filter to only batch-assigned students
		if (batchTimetableId) {
			const { data: batchAssignments } = await supabase
				.from('practical_batch_students')
				.select('exam_registration_id')
				.eq('exam_timetable_id', batchTimetableId)

			if (batchAssignments && batchAssignments.length > 0) {
				const batchRegIds = new Set(batchAssignments.map((a: any) => a.exam_registration_id))

				// Filter registrationMap to only include batch students
				const newMap = new Map<string, typeof allRegistrations>()
				const newSheetKeySet = new Set<string>()

				for (const [key, regs] of registrationMap) {
					const filtered = regs.filter(reg => batchRegIds.has(reg.id))
					if (filtered.length > 0) {
						newMap.set(key, filtered)
						newSheetKeySet.add(key)
					}
				}

				registrationMap.clear()
				for (const [k, v] of newMap) registrationMap.set(k, v)
				sheetKeySet.clear()
				for (const k of newSheetKeySet) sheetKeySet.add(k)
			} else {
				// No students assigned to this batch
				registrationMap.clear()
				sheetKeySet.clear()
			}
		}

		// Step 8: Fetch program names and order directly from MyJKKN API.
		// We call MyJKKN directly (same as Step 9 photo fetch below) instead of
		// going through our own /api/myjkkn/programs route — self-referencing
		// fetch from a server-side route is unreliable across environments.
		const myjkknIds = institution.myjkkn_institution_ids || []
		const programInfoMap = new Map<string, { name: string; order: number }>()

		if (myjkknIds.length > 0) {
			const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
			const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

			if (myjkknApiKey) {
				for (const myjkknInstId of myjkknIds) {
					try {
						const url = `${myjkknApiUrl}/api-management/organizations/programs?institution_id=${myjkknInstId}&is_active=true&limit=1000`
						const res = await fetch(url, {
							method: 'GET',
							headers: {
								'Authorization': `Bearer ${myjkknApiKey}`,
								'Accept': 'application/json',
								'Content-Type': 'application/json',
							},
							cache: 'no-store',
						})

						if (!res.ok) {
							console.error('[AttendanceSheet] MyJKKN programs fetch failed:', res.status, res.statusText)
							continue
						}

						const response = await res.json()
						const programs = response.data || response || []

						for (const p of programs) {
							// MyJKKN `program_id` IS the code (e.g. "PCA"), not a UUID. See CLAUDE.md.
							const code = p.program_id || p.program_code
							// Filter client-side by institution_id (server-side filter is unreliable).
							if (
								code &&
								p.institution_id === myjkknInstId &&
								!programInfoMap.has(code)
							) {
								programInfoMap.set(code, {
									name: p.program_name || p.name || code,
									order: p.program_order ?? p.sort_order ?? 999
								})
							}
						}
					} catch (err) {
						console.error('[AttendanceSheet] Error fetching programs from MyJKKN:', err)
					}
				}
			} else {
				console.warn('[AttendanceSheet] MYJKKN_API_KEY not configured; program names will fall back to codes')
			}
		}

		// Build and sort sheet keys from registrations
		interface SheetKey {
			program_code: string
			course_code: string
			course_title: string
			semester: number
		}

		const sheetKeys: SheetKey[] = []
		for (const key of sheetKeySet) {
			const [programCode, courseCode] = key.split('::')
			// Get semester from the first registration's course_offering
			const regs = registrationMap.get(key) || []
			const firstReg = regs[0] as any
			const semester = firstReg?.course_offerings?.semester ?? 999
			sheetKeys.push({
				program_code: programCode,
				course_code: courseCode,
				course_title: courseCodeToTitle.get(courseCode) || courseCode,
				semester
			})
		}

		// Sort by semester ASC, then program_order ASC, then course_code ASC
		// This matches the QP count report ordering
		sheetKeys.sort((a, b) => {
			// Primary: semester ascending
			if (a.semester !== b.semester) return a.semester - b.semester
			// Secondary: program_order ascending
			const orderA = programInfoMap.get(a.program_code)?.order ?? 999
			const orderB = programInfoMap.get(b.program_code)?.order ?? 999
			if (orderA !== orderB) return orderA - orderB
			// Tertiary: course_code ascending
			return a.course_code.localeCompare(b.course_code)
		})

		const totalSheets = sheetKeys.length

		// Step 9: Fetch student photos from MyJKKN API
		const allRegNumbers = [...new Set(allRegistrations.map(r => r.stu_register_no).filter(Boolean))]
		const photoMap = new Map<string, string | null>()

		if (allRegNumbers.length > 0 && myjkknIds.length > 0) {
			try {
				const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
				const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

				if (myjkknApiKey) {
					const registerNumberSet = new Set(allRegNumbers)

					for (const myjkknInstId of myjkknIds) {
						let page = 1
						const pageSize = 200
						let hasMorePages = true

						while (hasMorePages) {
							const profileParams = new URLSearchParams()
							profileParams.set('institution_id', myjkknInstId)
							profileParams.set('limit', String(pageSize))
							profileParams.set('page', String(page))

							const profileResponse = await fetch(
								`${myjkknApiUrl}/api-management/learners/profiles?${profileParams.toString()}`,
								{
									method: 'GET',
									headers: {
										'Authorization': `Bearer ${myjkknApiKey}`,
										'Accept': 'application/json',
										'Content-Type': 'application/json',
									},
									cache: 'no-store',
								}
							)

							if (profileResponse.ok) {
								const profileData = await profileResponse.json()
								const profiles = profileData.data || []

								for (const lp of profiles) {
									const regNo = lp.register_number
									if (regNo && registerNumberSet.has(regNo) && !photoMap.has(regNo.toUpperCase())) {
										const photoUrl = lp.student_photo_url || lp.photo_url || lp.profile_photo || lp.image_url || null
										photoMap.set(regNo.toUpperCase(), photoUrl)
									}
								}

								hasMorePages = profiles.length === pageSize
								page++

								if (photoMap.size >= registerNumberSet.size) {
									hasMorePages = false
								}
							} else {
								hasMorePages = false
							}
						}
					}
				}
			} catch (err) {
				console.error('[AttendanceSheet] Error fetching photos from MyJKKN:', err)
			}
		}

		// Step 10: Build sheets array
		const sheets: AttendanceSheet[] = []
		let totalStudentCount = 0

		sheetKeys.forEach((sk, index) => {
			const key = `${sk.program_code}::${sk.course_code}`
			const registrations = registrationMap.get(key) || []

			// Sort: regular first, then arrears; within each group by register_number
			const sortedRegs = [...registrations].sort((a, b) => {
				const aRegular = a.is_regular !== false ? 1 : 0
				const bRegular = b.is_regular !== false ? 1 : 0
				if (aRegular !== bRegular) return bRegular - aRegular
				return (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
			})

			const students: AttendanceSheetStudent[] = sortedRegs.map((reg, i) => ({
				serial_number: i + 1,
				register_number: reg.stu_register_no || '',
				student_name: reg.student_name || '',
				student_photo_url: photoMap.get((reg.stu_register_no || '').toUpperCase()) || null,
				is_regular: reg.is_regular !== false,
				attempt_number: reg.attempt_number ?? 1
			}))

			totalStudentCount += students.length

			const programInfo = programInfoMap.get(sk.program_code)

			sheets.push({
				sheet_number: index + 1,
				total_sheets: totalSheets,
				program_code: sk.program_code,
				program_name: programInfo?.name || sk.program_code,
				program_order: programInfo?.order ?? 999,
				semester: sk.semester,
				course_code: sk.course_code,
				course_title: sk.course_title,
				exam_date: examDate,
				session: session,
				students: students
			})
		})

		// Build response
		const responseData: AttendanceSheetPdfData = {
			institution_name: institution.name,
			institution_code: institution.institution_code,
			session_name: examSession.session_name,
			session_code: examSession.session_code,
			exam_heading: /supplement/i.test((examSession.exam_types as any)?.examination_name || '')
				? 'SUPPLEMENTARY EXAMINATION'
				: 'SEMESTER EXAMINATION',
			exam_date: examDate,
			session_type: session,
			logo_image: pdfSettings?.logo_url || null,
			right_logo_image: pdfSettings?.secondary_logo_url || null,
			sheets: sheets
		}

		return NextResponse.json({
			success: true,
			data: responseData,
			total_sheets: totalSheets,
			total_students: totalStudentCount
		})

	} catch (error) {
		console.error('[AttendanceSheet] API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
