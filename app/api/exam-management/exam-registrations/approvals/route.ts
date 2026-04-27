import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

interface ApprovalPayload {
	registration_ids: string[]
	approval_status: 'Approved' | 'Rejected'
	notes?: string
}

export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body: ApprovalPayload = await request.json()

		// Validate input
		if (!Array.isArray(body.registration_ids) || body.registration_ids.length === 0) {
			return NextResponse.json({ error: 'registration_ids array is required and cannot be empty' }, { status: 400 })
		}
		if (!body.approval_status || !['Approved', 'Rejected'].includes(body.approval_status)) {
			return NextResponse.json({ error: 'approval_status must be Approved or Rejected' }, { status: 400 })
		}

		// Get current user from auth
		const { data: { user }, error: authError } = await supabase.auth.getUser()
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		// Check user role (only super_admin and coe can approve)
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('role')
			.eq('id', user.id)
			.single()

		if (userError || !userData) {
			return NextResponse.json({ error: 'User not found' }, { status: 403 })
		}

		const userRole = userData.role
		if (!['super_admin', 'coe'].includes(userRole)) {
			return NextResponse.json({ error: 'Only super_admin and coe can approve registrations' }, { status: 403 })
		}

		// Batch update registrations
		const { error: updateError, count } = await supabase
			.from('exam_registrations')
			.update({
				registration_status: body.approval_status,
				updated_at: new Date().toISOString(),
			})
			.in('id', body.registration_ids)

		if (updateError) {
			console.error('[approvals] update error:', updateError)
			return NextResponse.json({ error: 'Failed to update registrations' }, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			message: `${count} registration(s) ${body.approval_status.toLowerCase()}`,
			updated: count,
		}, { status: 200 })
	} catch (e) {
		console.error('[approvals] unexpected error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// GET: Fetch pending registrations for approval
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const program_code = searchParams.get('program_code')
		const registration_status = searchParams.get('registration_status') || 'Pending'

		// Build query
		let query = supabase
			.from('exam_registrations')
			.select(`
				id,
				student_id,
				stu_register_no,
				student_name,
				program_code,
				course_code,
				registration_status,
				created_at,
				course_offering:course_offerings(
					id,
					course_code,
					course_mapping:course_mapping(course_title)
				)
			`)
			.eq('registration_status', registration_status)
			.order('program_code, stu_register_no', { ascending: true })
			.range(0, 9999)

		if (institutions_id) query = query.eq('institutions_id', institutions_id)
		if (examination_session_id) query = query.eq('examination_session_id', examination_session_id)
		if (program_code) query = query.eq('program_code', program_code)

		const { data, error } = await query

		if (error) {
			console.error('[approvals] fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch pending registrations' }, { status: 500 })
		}

		// Group by program
		const grouped = new Map<string, any[]>()
		for (const reg of data || []) {
			const prog = reg.program_code || 'Unknown'
			if (!grouped.has(prog)) grouped.set(prog, [])
			grouped.get(prog)!.push(reg)
		}

		return NextResponse.json({
			data: data || [],
			grouped: Object.fromEntries(grouped),
			count: data?.length || 0,
		})
	} catch (e) {
		console.error('[approvals] fetch error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
