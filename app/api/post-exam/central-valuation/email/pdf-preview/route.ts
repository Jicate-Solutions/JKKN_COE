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
		? await supabase.from('boards').select('board_name').eq('board_code', boardCode).maybeSingle()
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

	const selectFields = ['course_id', 'total_sheets', ...(columnStaff ? [columnStaff, ...staffFields] : ['external_examiner_id'])].join(', ')
	let query = supabase
		.from('answer_sheet_packets')
		.select(selectFields)
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('is_active', true)
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
		.select('id, course_code, course_name, course_title, board_code')
		.in('id', courseIds)

	if (boardCode) coursesQuery = coursesQuery.eq('board_code', boardCode)

	const { data: courses } = await coursesQuery
	const courseMap = new Map((courses || []).map(c => [c.id, c]))

	const { data: cvDates } = await supabase
		.from('course_valuation_dates')
		.select('course_id, valuation_date')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
	const dateMap = new Map((cvDates || []).map(d => [d.course_id, d.valuation_date]))

	const courseAgg = new Map<string, { packet_count: number; sheet_count: number }>()
	for (const p of pList) {
		if (!courseMap.has(p.course_id)) continue
		const prev = courseAgg.get(p.course_id) || { packet_count: 0, sheet_count: 0 }
		prev.packet_count += 1
		prev.sheet_count += p.total_sheets || 0
		courseAgg.set(p.course_id, prev)
	}

	const courseEntries: CentralValuationCourseEntry[] = [...courseAgg.entries()].map(([cid, agg]) => {
		const c = courseMap.get(cid)!
		return {
			course_code: c.course_code,
			course_name: c.course_name || c.course_title,
			valuation_date: dateMap.get(cid) || '',
			packet_count: agg.packet_count,
			sheet_count: agg.sheet_count,
		}
	})

	// Date range display
	const dates = courseEntries.map(c => c.valuation_date).filter(Boolean).sort()
	const dateRange = dates.length === 0 ? '' : dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`

	const letterData: CentralValuationAppointmentData = {
		institution_name: inst?.name,
		institution_address: inst?.address,
		ref_number: `JKKNCAS/CoE/${(session?.session_code || '').slice(0, 8)}`,
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
		exam_session_name: session?.session_name || '',
		valuation_date_range: dateRange,
		courses: courseEntries,
		pdf_settings: settings,
		coe_email: 'coearts@jkkn.ac.in',
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
