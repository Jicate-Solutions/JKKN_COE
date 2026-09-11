// Fees for a question paper setter's appointment, and the claim they add up to.
//
// The two components — Question Paper Setting and Answer Key — are rates in
// exam_fee_master (DEBIT / QP_HANDLING / QP_SETTING and ANSWER_KEY), versioned by
// effective_from. Nothing here is hard-coded: the applicable rate is the newest
// one whose W.E.F. date is on or before the appointment date.
//
// The claim is NOT the assignment type's total. It is the sum of the components
// the examiner has confirmed they are willing to do, so a setter appointed for
// "Both" who declines the answer key claims the paper fee alone.
//
// Pure helpers at the bottom (computeClaim, componentsForType) are shared by the
// CoE screen, the portal and the API, so the four-row table in the spec —
//   QP yes / AK yes → QP + AK,  yes / no → QP,  no / yes → AK,  no / no → 0
// — is written once.

import type { QpAssignmentType } from '@/types/qp-examiner-assignment'

export const QP_FEE_CATEGORY = 'QP_HANDLING'
export const QP_FEE_SUB_QP = 'QP_SETTING'
export const QP_FEE_SUB_AK = 'ANSWER_KEY'

export interface QpFeeRates {
	/** Question Paper Setting fee, or null when no rate is configured. */
	qp: number | null
	/** Answer Key fee, or null when no rate is configured. */
	ak: number | null
	/** Which rows were used — for the "from Fee Details, w.e.f. …" hint. */
	qp_effective_from: string | null
	ak_effective_from: string | null
}

interface FeeRow {
	fee_type: string
	category: string
	sub_category: string
	program_code?: string | null
	program_level?: string | null
	amount: number | string
	effective_from: string
	is_active?: boolean
}

/**
 * Pick the applicable QP / AK rates out of a fee_master row list. Tier rates
 * only (no programme scope) — these fees do not vary by programme. Newest
 * effective_from on or before `asOf` wins per component.
 */
export function pickQpFeeRates(rows: FeeRow[], asOf: Date = new Date()): QpFeeRates {
	const asOfStr = asOf.toISOString().slice(0, 10)
	const pick = (sub: string) => {
		let best: FeeRow | null = null
		for (const r of rows || []) {
			if (r.fee_type !== 'DEBIT' || r.category !== QP_FEE_CATEGORY || r.sub_category !== sub) continue
			if (r.is_active === false) continue
			if (r.program_code) continue
			if (!r.effective_from || r.effective_from > asOfStr) continue
			if (!best || r.effective_from > best.effective_from) best = r
		}
		return best
	}
	const qp = pick(QP_FEE_SUB_QP)
	const ak = pick(QP_FEE_SUB_AK)
	return {
		qp: qp ? Number(qp.amount) : null,
		ak: ak ? Number(ak.amount) : null,
		qp_effective_from: qp?.effective_from || null,
		ak_effective_from: ak?.effective_from || null,
	}
}

/** Server-side: read the institution's rates and pick the applicable ones. */
export async function resolveQpFeeRates(
	supabase: any,
	institutionsId: string,
	asOf: Date = new Date()
): Promise<QpFeeRates> {
	const { data, error } = await supabase
		.from('exam_fee_master')
		.select('fee_type, category, sub_category, program_code, program_level, amount, effective_from, is_active')
		.eq('institutions_id', institutionsId)
		.eq('fee_type', 'DEBIT')
		.eq('category', QP_FEE_CATEGORY)
		.eq('is_active', true)
	if (error) {
		console.error('[QP fees] fee master read failed:', error.message)
		return { qp: null, ak: null, qp_effective_from: null, ak_effective_from: null }
	}
	return pickQpFeeRates((data || []) as FeeRow[], asOf)
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Which components an assignment type carries. */
export function componentsForType(type: QpAssignmentType): { qp: boolean; ak: boolean } {
	return { qp: type !== 'answer_key', ak: type !== 'question_paper' }
}

/**
 * The claim for an appointment: each component's fee, counted only when the
 * component belongs to the type AND the examiner is willing. `null` willingness
 * (not yet confirmed) counts as willing, so the figure shown before confirmation
 * is the potential claim.
 */
export function computeClaim(input: {
	assignment_type: QpAssignmentType
	qp_fee: number | null | undefined
	ak_fee: number | null | undefined
	qp_willing: boolean | null | undefined
	ak_willing: boolean | null | undefined
}): { qp: number; ak: number; total: number } {
	const c = componentsForType(input.assignment_type)
	const qp = c.qp && input.qp_willing !== false ? Number(input.qp_fee || 0) : 0
	const ak = c.ak && input.ak_willing !== false ? Number(input.ak_fee || 0) : 0
	return { qp, ak, total: qp + ak }
}

/** The potential claim printed on the order: every component of the type. */
export function potentialClaim(type: QpAssignmentType, rates: { qp: number | null; ak: number | null }): number {
	return computeClaim({ assignment_type: type, qp_fee: rates.qp, ak_fee: rates.ak, qp_willing: true, ak_willing: true }).total
}

export const formatRupees = (v: number | null | undefined) =>
	v == null ? '—' : `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
