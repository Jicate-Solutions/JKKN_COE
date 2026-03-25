import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// POST /api/revaluation/draft-applications/finalize
// Finalize all draft registrations for a session
// Converts status from 'Draft' to 'Payment Pending'
// =====================================================

export async function POST(request: Request) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()

		const { examination_session_id, institutions_id } = body

		// Validation
		if (!examination_session_id) {
			return NextResponse.json({ error: 'Examination session is required' }, { status: 400 })
		}

		if (!institutions_id) {
			return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		}

		// =====================================================
		// 1. COUNT DRAFT REGISTRATIONS
		// =====================================================

		const { data: drafts, error: fetchError } = await supabase
			.from('revaluation_registrations')
			.select('id, student_id, course_id')
			.eq('examination_session_id', examination_session_id)
			.eq('institutions_id', institutions_id)
			.eq('status', 'Draft')

		if (fetchError) {
			console.error('Draft fetch error:', fetchError)
			return NextResponse.json(
				{ error: 'Failed to fetch draft registrations' },
				{ status: 500 }
			)
		}

		if (!drafts || drafts.length === 0) {
			return NextResponse.json(
				{ error: 'No draft registrations found for this session' },
				{ status: 404 }
			)
		}

		// Count unique students
		const uniqueStudents = new Set(drafts.map((d) => d.student_id)).size

		// =====================================================
		// 2. UPDATE ALL DRAFTS TO 'Payment Pending'
		// =====================================================

		const { data, error } = await supabase
			.from('revaluation_registrations')
			.update({
				status: 'Payment Pending',
				application_date: new Date().toISOString().split('T')[0],
				updated_at: new Date().toISOString(),
			})
			.eq('examination_session_id', examination_session_id)
			.eq('institutions_id', institutions_id)
			.eq('status', 'Draft')
			.select()

		if (error) {
			console.error('Finalize error:', error)
			return NextResponse.json(
				{ error: 'Failed to finalize draft registrations' },
				{ status: 500 }
			)
		}

		// =====================================================
		// 3. UPDATE EXAM REGISTRATIONS REVALUATION ATTEMPTS
		// =====================================================

		// Group by exam_registration_id and course_id to update attempt arrays
		const updatePromises = data.map(async (reval: any) => {
			const { data: examReg } = await supabase
				.from('exam_registrations')
				.select('revaluation_attempts')
				.eq('id', reval.exam_registration_id)
				.single()

			const currentAttempts = examReg?.revaluation_attempts || []

			// Add attempt number if not already in array
			if (!currentAttempts.includes(reval.attempt_number)) {
				await supabase
					.from('exam_registrations')
					.update({
						revaluation_attempts: [...currentAttempts, reval.attempt_number],
					})
					.eq('id', reval.exam_registration_id)
			}
		})

		await Promise.all(updatePromises)

		// =====================================================
		// 4. RETURN SUCCESS RESPONSE
		// =====================================================

		return NextResponse.json({
			success: true,
			data: {
				total_registrations: data.length,
				total_students: uniqueStudents,
				examination_session_id,
			},
			message: `Successfully finalized ${data.length} revaluation registrations for ${uniqueStudents} students`,
		})
	} catch (error) {
		console.error('Finalize error:', error)
		return NextResponse.json(
			{ error: 'Failed to finalize draft registrations' },
			{ status: 500 }
		)
	}
}
