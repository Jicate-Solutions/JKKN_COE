import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/reports/financial-summary
// Generate financial summary for revaluation fees
// =====================================================
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Extract filters
		const institutionCode = searchParams.get('institution_code')
		const institutionsId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')

		// Build base query
		let query = supabase.from('revaluation_registrations').select('*')

		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		} else if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		if (examinationSessionId) {
			query = query.eq('examination_session_id', examinationSessionId)
		}

		const { data: registrations, error: regError } = await query.range(0, 9999)

		if (regError) {
			console.error('[Financial Summary] Registrations error:', regError)
			return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
		}

		// =====================================================
		// CALCULATE FINANCIAL METRICS
		// =====================================================

		let totalRevenue = 0
		let attempt1Revenue = 0
		let attempt2Revenue = 0
		let attempt3Revenue = 0
		let pendingPayments = 0
		let verifiedPayments = 0
		let rejectedPayments = 0

		let attempt1Count = 0
		let attempt2Count = 0
		let attempt3Count = 0

		registrations?.forEach((r) => {
			const feeAmount = Number(r.fee_amount) || 0

			// Total revenue from all applications
			totalRevenue += feeAmount

			// Revenue by attempt number
			switch (r.attempt_number) {
				case 1:
					attempt1Revenue += feeAmount
					attempt1Count++
					break
				case 2:
					attempt2Revenue += feeAmount
					attempt2Count++
					break
				case 3:
					attempt3Revenue += feeAmount
					attempt3Count++
					break
			}

			// Revenue by payment status
			switch (r.payment_status) {
				case 'Pending':
					pendingPayments += feeAmount
					break
				case 'Verified':
					verifiedPayments += feeAmount
					break
				case 'Rejected':
					rejectedPayments += feeAmount
					break
			}
		})

		const totalApplications = registrations?.length || 0
		const paymentVerificationRate =
			totalApplications > 0
				? ((registrations?.filter((r) => r.payment_status === 'Verified').length || 0) /
						totalApplications) *
					100
				: 0

		// Average fee per attempt
		const avgAttempt1Fee = attempt1Count > 0 ? attempt1Revenue / attempt1Count : 0
		const avgAttempt2Fee = attempt2Count > 0 ? attempt2Revenue / attempt2Count : 0
		const avgAttempt3Fee = attempt3Count > 0 ? attempt3Revenue / attempt3Count : 0

		// Revenue by status
		const revenueByStatus = (registrations || []).reduce(
			(acc, r) => {
				const status = r.status
				const fee = Number(r.fee_amount) || 0
				acc[status] = (acc[status] || 0) + fee
				return acc
			},
			{} as Record<string, number>
		)

		// Build response
		const financialSummary = {
			total_revenue: totalRevenue,
			attempt_breakdown: {
				attempt_1: {
					count: attempt1Count,
					revenue: attempt1Revenue,
					avg_fee: avgAttempt1Fee,
				},
				attempt_2: {
					count: attempt2Count,
					revenue: attempt2Revenue,
					avg_fee: avgAttempt2Fee,
				},
				attempt_3: {
					count: attempt3Count,
					revenue: attempt3Revenue,
					avg_fee: avgAttempt3Fee,
				},
			},
			payment_status_breakdown: {
				pending: {
					amount: pendingPayments,
					count: registrations?.filter((r) => r.payment_status === 'Pending').length || 0,
				},
				verified: {
					amount: verifiedPayments,
					count: registrations?.filter((r) => r.payment_status === 'Verified').length || 0,
				},
				rejected: {
					amount: rejectedPayments,
					count: registrations?.filter((r) => r.payment_status === 'Rejected').length || 0,
				},
			},
			payment_verification_rate: paymentVerificationRate,
			revenue_by_workflow_status: revenueByStatus,
			total_applications: totalApplications,
		}

		return NextResponse.json(financialSummary)
	} catch (error) {
		console.error('[Financial Summary GET] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
