import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// POST /api/revaluation/publish
// Publish revaluation results with admin selection
// Admin decides whether to use original or revaluation marks
// =====================================================
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		// Validate required fields
		if (!body.selections || body.selections.length === 0) {
			return NextResponse.json({ error: 'Select at least one result to publish' }, { status: 400 })
		}

		if (!body.published_by_user_id) {
			return NextResponse.json({ error: 'Publisher user ID is required' }, { status: 400 })
		}

		const selections = body.selections as Array<{
			revaluation_registration_id: string
			revaluation_final_marks_id: string
			use_revaluation_marks: boolean
		}>

		const publishedResults: any[] = []
		const errors: Array<{ revaluation_registration_id: string; error: string }> = []

		// Process each selection
		for (const selection of selections) {
			try {
				// Fetch revaluation registration
				const { data: reval, error: revalError } = await supabase
					.from('revaluation_registrations')
					.select(
						`
						id,
						institutions_id,
						institution_code,
						examination_session_id,
						exam_registration_id,
						course_offering_id,
						course_id,
						student_id,
						status
					`
					)
					.eq('id', selection.revaluation_registration_id)
					.single()

				if (revalError || !reval) {
					errors.push({
						revaluation_registration_id: selection.revaluation_registration_id,
						error: 'Revaluation not found',
					})
					continue
				}

				// Check status
				if (reval.status !== 'Verified') {
					errors.push({
						revaluation_registration_id: selection.revaluation_registration_id,
						error: `Cannot publish - status is ${reval.status}`,
					})
					continue
				}

				// Fetch revaluation final marks
				const { data: revalFinal, error: revalFinalError } = await supabase
					.from('revaluation_final_marks')
					.select('*')
					.eq('id', selection.revaluation_final_marks_id)
					.single()

				if (revalFinalError || !revalFinal) {
					errors.push({
						revaluation_registration_id: selection.revaluation_registration_id,
						error: 'Final marks not found',
					})
					continue
				}

				// Check if already published
				if (revalFinal.result_status === 'Published') {
					errors.push({
						revaluation_registration_id: selection.revaluation_registration_id,
						error: 'Already published',
					})
					continue
				}

				// =====================================================
				// UPDATE FINAL MARKS BASED ON ADMIN DECISION
				// =====================================================

				if (selection.use_revaluation_marks) {
					// Use revaluation marks - update original final_marks record
					const { error: updateError } = await supabase
						.from('final_marks')
						.update({
							// Replace external marks with revaluation marks
							external_marks_obtained: revalFinal.external_marks_obtained,
							external_marks_maximum: revalFinal.external_marks_maximum,
							external_percentage: revalFinal.external_percentage,
							// Update totals
							total_marks_obtained: revalFinal.total_marks_obtained,
							total_marks_maximum: revalFinal.total_marks_maximum,
							percentage: revalFinal.percentage,
							// Update grade
							letter_grade: revalFinal.letter_grade,
							grade_points: revalFinal.grade_points,
							grade_description: revalFinal.grade_description,
							total_grade_points: revalFinal.total_grade_points,
							// Update pass status
							is_pass: revalFinal.is_pass,
							is_distinction: revalFinal.is_distinction,
							is_first_class: revalFinal.is_first_class,
							pass_status: revalFinal.pass_status,
							// Mark as revaluation result
							remarks: 'Updated with revaluation marks',
							updated_at: new Date().toISOString(),
							updated_by: body.published_by_user_id,
						})
						.eq('id', revalFinal.original_final_marks_id)

					if (updateError) {
						console.error('[Publish] Final marks update error:', updateError)
						errors.push({
							revaluation_registration_id: selection.revaluation_registration_id,
							error: 'Failed to update final marks',
						})
						continue
					}
				}
				// If not using revaluation marks, original final_marks stays unchanged

				// =====================================================
				// UPDATE REVALUATION FINAL MARKS STATUS
				// =====================================================
				const { error: finalMarksError } = await supabase
					.from('revaluation_final_marks')
					.update({
						result_status: 'Published',
						published_by: body.published_by_user_id,
						published_date: new Date().toISOString().split('T')[0],
						is_locked: true,
						locked_by: body.published_by_user_id,
						locked_date: new Date().toISOString().split('T')[0],
						remarks: selection.use_revaluation_marks
							? 'Revaluation marks used'
							: 'Original marks retained',
						updated_at: new Date().toISOString(),
					})
					.eq('id', selection.revaluation_final_marks_id)

				if (finalMarksError) {
					console.error('[Publish] Revaluation final marks error:', finalMarksError)
					errors.push({
						revaluation_registration_id: selection.revaluation_registration_id,
						error: 'Failed to update revaluation status',
					})
					continue
				}

				// =====================================================
				// UPDATE REVALUATION REGISTRATION STATUS
				// =====================================================
				const { error: revalRegError } = await supabase
					.from('revaluation_registrations')
					.update({
						status: 'Published',
						published_by: body.published_by_user_id,
						published_date: new Date().toISOString(),
						updated_at: new Date().toISOString(),
					})
					.eq('id', selection.revaluation_registration_id)

				if (revalRegError) {
					console.error('[Publish] Revaluation registration error:', revalRegError)
					errors.push({
						revaluation_registration_id: selection.revaluation_registration_id,
						error: 'Failed to update revaluation registration',
					})
					continue
				}

				publishedResults.push({
					revaluation_registration_id: selection.revaluation_registration_id,
					used_revaluation_marks: selection.use_revaluation_marks,
					marks_difference: revalFinal.marks_difference,
					percentage_difference: revalFinal.percentage_difference,
				})
			} catch (err) {
				console.error('[Publish] Processing error:', err)
				errors.push({
					revaluation_registration_id: selection.revaluation_registration_id,
					error: err instanceof Error ? err.message : 'Unknown error',
				})
			}
		}

		// Return results
		if (publishedResults.length === 0) {
			return NextResponse.json(
				{
					success: false,
					errors,
					message: 'No results published',
				},
				{ status: 400 }
			)
		}

		return NextResponse.json(
			{
				success: true,
				data: publishedResults,
				errors: errors.length > 0 ? errors : undefined,
				message: `Published ${publishedResults.length} revaluation result(s)`,
			},
			{ status: 200 }
		)
	} catch (error) {
		console.error('[Revaluation Publish POST] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
