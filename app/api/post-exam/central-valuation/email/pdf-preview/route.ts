import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { generateCentralValuationAppointmentPdf } from '@/lib/pdf/central-valuation-appointment-letter'
import { getPdfSettingsWithFallback } from '@/lib/pdf/settings-service'
import type {
	CentralValuationAppointmentData,
	CentralValuationCourseEntry,
	CentralValuationExaminerType,
} from '@/types/central-valuation-email'

export const maxDuration = 60

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const sessionId = searchParams.get('session_id')
	const examinerType = searchParams.get('examiner_type') as CentralValuationExaminerType | null
	const examinerKey = searchParams.get('examiner_key')
	const boardCode = searchParams.get('board_code')

	if (!institutionsId || !sessionId || !examinerType || !examinerKey) {
		return NextResponse.json(
			{ error: 'institutions_id, session_id, examiner_type, examiner_key are required' },
			{ status: 400 }
		)
	}

	const supabase = getSupabaseServer()

	const { data: inst } = await supabase
		.from('institutions')
		.select('id, name, institution_code, address')
		.eq('id', institutionsId)
		.single()

	const { data: session } = await supabase
		.from('examination_sessions')
		.select('session_name, session_code')
		.eq('id', sessionId)
		.single()

	const { data: board } = boardCode
		? await supabase.from('board').select('board_name, board_type').eq('board_code', boardCode).maybeSingle()
		: { data: null }

	const settings = await getPdfSettingsWithFallback(inst?.institution_code || '', 'default')

	// Locate this examiner's courses
	let columnStaff: string | null = null
	let columnExternal = false
	let staffFields: string[] = []

	switch (examinerType) {
		case 'internal':
			columnStaff = 'internal_examiner_staff_id'
			staffFields = ['internal_examiner_name', 'internal_examiner_mobile', 'internal_examiner_designation', 'internal_examiner_email']
			break
		case 'chief':
			columnStaff = 'chief_examiner_staff_id'
			staffFields = ['chief_examiner_name', 'chief_examiner_mobile', 'chief_examiner_designation', 'chief_examiner_email']
			break
		case 'assistant':
			columnStaff = 'assistant_examiner_staff_id'
			staffFields = ['assistant_examiner_name', 'assistant_examiner_mobile', 'assistant_examiner_designation', 'assistant_examiner_email']
			break
		case 'external':
			columnExternal = true
			break
	}

	const selectFields = ['id', 'course_id', 'packet_no', 'total_sheets', 'valuation_date', ...(columnStaff ? [columnStaff, ...staffFields] : ['external_examiner_id'])].join(', ')
	let query = supabase
		.from('answer_sheet_packets')
		.select(selectFields)
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('is_active', true)
		.order('packet_no', { ascending: true })
		.range(0, 99999)

	if (columnStaff) query = query.eq(columnStaff, examinerKey)
	if (columnExternal) query = query.eq('external_examiner_id', examinerKey)

	const { data: packets, error } = await query
	if (error) {
		console.error('pdf-preview packet error:', error)
		return NextResponse.json({ error: 'Failed to load assignment' }, { status: 500 })
	}
	if (!packets || packets.length === 0) {
		return NextResponse.json({ error: 'No assignments found' }, { status: 404 })
	}

	const pList = packets as any[]

	// Examiner contact details
	let examinerName = ''
	let examinerMobile: string | undefined
	let examinerDesignation: string | undefined
	let examinerEmail: string | undefined
	let examinerDepartment: string | undefined
	let examinerInstitution: string | undefined
	let examinerAddress: string | undefined

	if (columnStaff) {
		const first = pList[0] || {}
		examinerName = first[staffFields[0]] || ''
		examinerMobile = first[staffFields[1]] || undefined
		examinerDesignation = first[staffFields[2]] || undefined
		examinerEmail = first[staffFields[3]] || undefined
	} else {
		const { data: ext } = await supabase
			.from('examiners')
			.select('full_name, mobile, designation, department, institution_name, email, address, city, state, pincode')
			.eq('id', examinerKey)
			.maybeSingle()

		if (ext) {
			examinerName = ext.full_name || ''
			examinerMobile = ext.mobile || undefined
			examinerDesignation = ext.designation || undefined
			examinerEmail = ext.email || undefined
			examinerDepartment = ext.department || undefined
			examinerInstitution = ext.institution_name || undefined
			examinerAddress = [ext.address, ext.city, ext.state, ext.pincode].filter(Boolean).join(', ') || undefined
		}
	}

	// Build course entries
	const courseIds = [...new Set(pList.map(p => p.course_id))]
	let coursesQuery = supabase
		.from('courses')
		.select('id, course_code, course_name, board_code')
		.in('id', courseIds)

	if (boardCode) coursesQuery = coursesQuery.eq('board_code', boardCode)

	const { data: courses } = await coursesQuery
	const courseMap = new Map((courses || []).map(c => [c.id, c]))

	// Total packets per course across the WHOLE session (so packet_index/total
	// reads "1/9" even when this examiner only handles a subset)
	const { data: allCoursePackets } = await supabase
		.from('answer_sheet_packets')
		.select('course_id, packet_no, id')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('is_active', true)
		.in('course_id', courseIds)
		.order('packet_no', { ascending: true })
		.range(0, 99999)

	const totalPacketsByCourse = new Map<string, number>()
	const indexById = new Map<string, number>()
	const seenSeq = new Map<string, number>()
	for (const p of allCoursePackets || []) {
		totalPacketsByCourse.set(p.course_id, (totalPacketsByCourse.get(p.course_id) || 0) + 1)
		const next = (seenSeq.get(p.course_id) || 0) + 1
		seenSeq.set(p.course_id, next)
		indexById.set(p.id, next)
	}

	const courseEntries: CentralValuationCourseEntry[] = pList
		.filter(p => courseMap.has(p.course_id))
		.map(p => {
			const c = courseMap.get(p.course_id)! as any
			return {
				course_code: c.course_code,
				course_name: c.course_name,
				valuation_date: p.valuation_date || '',
				packet_no: p.packet_no,
				packet_index: indexById.get(p.id) || 0,
				total_packets: totalPacketsByCourse.get(p.course_id) || 0,
				packet_count: 1,
				sheet_count: p.total_sheets || 0,
			}
		})
		.sort((a, b) => {
			const cmp = (a.course_code || '').localeCompare(b.course_code || '')
			if (cmp !== 0) return cmp
			return (a.packet_index || 0) - (b.packet_index || 0)
		})

	// Date range display
	const dates = courseEntries.map(c => c.valuation_date).filter(Boolean).sort()
	const dateRange = dates.length === 0 ? '' : dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`

	const letterData: CentralValuationAppointmentData = {
		institution_name: (settings as any)?.institution_name || inst?.name || 'J.K.K. NATARAJA COLLEGE OF ARTS & SCIENCE (Autonomous)',
		institution_address: (settings as any)?.institution_address || inst?.address,
		ref_number: `JKKNCAS/ CoE/ ${session?.session_name || session?.session_code || ''}/ Sem Valuation`,
		letter_date: new Date().toISOString().slice(0, 10),
		examiner_name: examinerName || 'Examiner',
		examiner_type: examinerType,
		examiner_role: {
			internal: 'Internal Examiner',
			external: 'External Examiner',
			chief: 'Chief Examiner',
			assistant: 'Assistant Examiner',
		}[examinerType],
		examiner_designation: examinerDesignation,
		examiner_department: examinerDepartment,
		examiner_institution: examinerInstitution,
		examiner_address: examinerAddress,
		examiner_mobile: examinerMobile,
		board_name: board?.board_name || boardCode || '',
		board_code: boardCode || '',
		board_type: board?.board_type || '',
		exam_session_name: session?.session_name || '',
		valuation_date_range: dateRange,
		courses: courseEntries,
		pdf_settings: settings,
		coe_name: (settings as any)?.coe_name || 'Dr. S. UMAVATHI',
		coe_qualifications: (settings as any)?.coe_qualifications || 'M.Sc., Ph.D',
		coe_contact: (settings as any)?.coe_contact || '93605 12090',
		coe_email: process.env.COE_EMAIL || 'coearts@jkkn.ac.in',
		coe_signature_url: (settings as any)?.coe_signature_url || null,
		coe_seal_url: (settings as any)?.coe_seal_url || null,
	}

	const pdfBuffer = await generateCentralValuationAppointmentPdf(letterData)

	return new NextResponse(pdfBuffer as any, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename="appointment-${examinerName.replace(/\s+/g, '-')}.pdf"`,
			'Cache-Control': 'no-store',
		},
	})
}
