import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/payment-status
// Fetch payment status for revaluation applications
// =====================================================

export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const institutionsId = searchParams.get('institutions_id')
	const examinationSessionId = searchParams.get('examination_session_id')
	const paymentStatus = searchParams.get('payment_status')

	try {
		if (!examinationSessionId) {
			return NextResponse.json({ error: 'Examination session ID is required' }, { status: 400 })
		}

		// Get all revaluation registrations grouped by student
		let query = supabase
			.from('revaluation_registrations')
			.select('*')
			.eq('examination_session_id', examinationSessionId)
			.in('status', ['Payment Pending', 'Payment Verified', 'Payment Failed'])
			.order('student_register_number', { ascending: true })

		if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		if (paymentStatus) {
			query = query.eq('payment_status', paymentStatus)
		}

		const { data: registrations, error } = await query

		if (error) {
			console.error('Payment status fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch payment status' }, { status: 500 })
		}

		// Group by student and aggregate
		const studentMap = new Map<string, any>()

		for (const reg of registrations || []) {
			const studentKey = `${reg.student_id}-${reg.examination_session_id}`

			if (!studentMap.has(studentKey)) {
				studentMap.set(studentKey, {
					id: reg.id,
					student_id: reg.student_id,
					student_register_number: reg.student_register_number,
					student_name: reg.student_name,
					program_code: reg.program_code,
					program_name: reg.program_name,
					course_count: 0,
					total_fee: 0,
					payment_status: reg.payment_status || 'Payment Pending',
					payment_method: reg.payment_method,
					payment_reference: reg.payment_reference,
					payment_date: reg.payment_date,
					verified_by: reg.verified_by,
					verified_at: reg.verified_at,
					created_at: reg.created_at,
					courses: [],
				})
			}

			const student = studentMap.get(studentKey)
			student.course_count += 1
			student.total_fee += reg.fee_amount || 0
			student.courses.push({
				course_code: reg.course_code,
				course_name: reg.course_name,
				fee_amount: reg.fee_amount,
			})
		}

		const paymentRecords = Array.from(studentMap.values())

		return NextResponse.json(paymentRecords)
	} catch (error) {
		console.error('Payment status fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch payment status' }, { status: 500 })
	}
}

// =====================================================
// PUT /api/revaluation/payment-status
// Update payment status for a student's revaluation applications
// =====================================================

export async function PUT(request: Request) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()

		if (!body.student_id) {
			return NextResponse.json({ error: 'Student ID is required' }, { status: 400 })
		}

		if (!body.examination_session_id) {
			return NextResponse.json({ error: 'Examination session ID is required' }, { status: 400 })
		}

		if (!body.payment_status) {
			return NextResponse.json({ error: 'Payment status is required' }, { status: 400 })
		}

		// Prepare update data
		const updateData: any = {
			payment_status: body.payment_status,
			payment_method: body.payment_method || null,
			payment_reference: body.payment_reference || null,
			payment_date: body.payment_date || null,
		}

		// If verifying payment, set verified timestamp
		if (body.payment_status === 'Payment Verified') {
			updateData.verified_at = new Date().toISOString()
			updateData.status = 'Payment Verified'
		}

		// Update all registrations for this student in this session
		const { data, error } = await supabase
			.from('revaluation_registrations')
			.update(updateData)
			.eq('student_id', body.student_id)
			.eq('examination_session_id', body.examination_session_id)
			.select()

		if (error) {
			console.error('Payment status update error:', error)
			return NextResponse.json({ error: 'Failed to update payment status' }, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			updated_count: data?.length || 0,
			data: data,
		})
	} catch (error) {
		console.error('Payment status update error:', error)
		return NextResponse.json({ error: 'Failed to update payment status' }, { status: 500 })
	}
}
