// =====================================================
// Exam Fee Catalog
// -----------------------------------------------------
// Drives the Fee Details master dropdowns. A single source of truth for
// the controlled taxonomy stored in exam_fee_master:
//   fee_type -> category -> sub_category, plus the charge basis (calc_basis).
//
// CREDIT = fees collected FROM learners.
// DEBIT  = amounts PAID OUT to staff / examiners.
// =====================================================

export type FeeType = 'CREDIT' | 'DEBIT'

export type CalcBasis =
	| 'FLAT'
	| 'PER_PAPER'
	| 'PER_STUDENT'
	| 'PER_DAY'
	| 'PER_SESSION'
	| 'PER_KM'

export type ProgramLevel = 'UG' | 'PG' | 'MCA'

export interface FeeSubCategory {
	code: string
	label: string
	// Charge bases that make sense for this item (first = default)
	bases: CalcBasis[]
	// Whether UG/PG level applies (paper fees vary by level; fines don't)
	levelApplies: boolean
}

export interface FeeCategory {
	code: string
	label: string
	feeType: FeeType
	subCategories: FeeSubCategory[]
}

export const CALC_BASIS_LABELS: Record<CalcBasis, string> = {
	FLAT: 'Flat / fixed',
	PER_PAPER: 'Per paper',
	PER_STUDENT: 'Per student',
	PER_DAY: 'Per day',
	PER_SESSION: 'Per session (FN/AN)',
	PER_KM: 'Per km (travel)',
}

export const PROGRAM_LEVELS: ProgramLevel[] = ['UG', 'PG', 'MCA']

// -----------------------------------------------------
// CREDIT — collected from learners
// -----------------------------------------------------
const CREDIT_CATEGORIES: FeeCategory[] = [
	{
		code: 'EXAM_PAPER',
		label: 'Exam Paper Fee',
		feeType: 'CREDIT',
		subCategories: [
			{ code: 'THEORY', label: 'Theory Paper', bases: ['PER_PAPER'], levelApplies: true },
			{ code: 'PRACTICAL', label: 'Practical - up to 3 Hrs', bases: ['PER_PAPER', 'PER_STUDENT'], levelApplies: true },
			{ code: 'PRACTICAL_ABOVE_3H', label: 'Practical - above 3 Hrs', bases: ['PER_PAPER', 'PER_STUDENT'], levelApplies: true },
			{ code: 'PROJECT', label: 'Internship / Project / Viva-Voce', bases: ['PER_PAPER', 'FLAT', 'PER_STUDENT'], levelApplies: true },
			{ code: 'MARK_STATEMENT', label: 'Mark Statement', bases: ['PER_STUDENT', 'FLAT'], levelApplies: true },
			{ code: 'APPLICATION', label: 'Application Fee', bases: ['PER_STUDENT', 'FLAT'], levelApplies: true },
		],
	},
	{
		code: 'REVALUATION',
		label: 'Revaluation Fee',
		feeType: 'CREDIT',
		subCategories: [
			{ code: 'REVALUATION', label: 'Revaluation', bases: ['FLAT', 'PER_PAPER'], levelApplies: false },
			{ code: 'RETOTALING', label: 'Retotaling', bases: ['FLAT', 'PER_PAPER'], levelApplies: false },
			{
				code: 'COPY OF ANSWER SCRIPT',
				label: 'Copy of Answer Script',
				bases: ['FLAT', 'PER_PAPER'],
				levelApplies: false,
			},
		],
	},
	{
		code: 'FINE',
		label: 'Fine',
		feeType: 'CREDIT',
		subCategories: [
			{
				code: 'LATE_FEE',
				label: 'Late Exam Fee Fine',
				bases: ['FLAT'],
				levelApplies: false,
			},
			{
				code: 'HALL_TICKET_MISSING',
				label: 'Hall Ticket Missing Fine',
				bases: ['FLAT'],
				levelApplies: false,
			},
		],
	},
]

// -----------------------------------------------------
// DEBIT — paid out to staff / examiners
// -----------------------------------------------------
const DEBIT_CATEGORIES: FeeCategory[] = [
	{
		code: 'SUPERVISOR',
		label: 'Exam Hall Supervisor',
		feeType: 'DEBIT',
		subCategories: [
			{ code: 'DAY_PAY', label: 'Day Pay', bases: ['PER_DAY'], levelApplies: false },
			{ code: 'SESSION_PAY', label: 'Session Pay (FN/AN)', bases: ['PER_SESSION'], levelApplies: false },
			{ code: 'TRAVEL', label: 'Travel Allowance', bases: ['PER_KM'], levelApplies: false },
			{
				code: 'PRACTICAL_DUTY',
				label: 'Practical Duty',
				bases: ['PER_PAPER', 'PER_STUDENT'],
				levelApplies: false,
			},
		],
	},
	{
		code: 'EXAMINER',
		label: 'Examiner',
		feeType: 'DEBIT',
		subCategories: [
			{
				code: 'INTERNAL_EXAMINER',
				label: 'Internal Examiner',
				bases: ['PER_PAPER', 'PER_STUDENT'],
				levelApplies: false,
			},
			{
				code: 'EXTERNAL_EXAMINER',
				label: 'External Examiner',
				bases: ['PER_PAPER', 'PER_STUDENT'],
				levelApplies: false,
			},
		],
	},
	{
		code: 'QP_HANDLING',
		label: 'Question Paper Handling',
		feeType: 'DEBIT',
		subCategories: [
			{
				code: 'QP_QUARTERING',
				label: 'QP Quartering / Setting',
				bases: ['FLAT', 'PER_PAPER'],
				levelApplies: false,
			},
		],
	},
	{
		code: 'EVALUATION',
		label: 'Paper Evaluation',
		feeType: 'DEBIT',
		subCategories: [
			{
				code: 'PAPER_EVALUATION',
				label: 'Paper Evaluation',
				bases: ['PER_PAPER', 'PER_STUDENT'],
				levelApplies: false,
			},
		],
	},
]

export const FEE_CATALOG: FeeCategory[] = [...CREDIT_CATEGORIES, ...DEBIT_CATEGORIES]

export function categoriesForType(feeType: FeeType): FeeCategory[] {
	return FEE_CATALOG.filter((c) => c.feeType === feeType)
}

export function findCategory(code: string): FeeCategory | undefined {
	return FEE_CATALOG.find((c) => c.code === code)
}

export function findSubCategory(categoryCode: string, subCode: string): FeeSubCategory | undefined {
	return findCategory(categoryCode)?.subCategories.find((s) => s.code === subCode)
}

// Build a default human-readable label for a fee item.
// A programme-scoped rate is named after the programme rather than the tier —
// the tier it would otherwise sit in is not what prices it.
export function buildFeeLabel(
	categoryCode: string,
	subCode: string,
	level: ProgramLevel | null,
	programCode?: string | null
): string {
	const cat = findCategory(categoryCode)
	const sub = findSubCategory(categoryCode, subCode)
	const scope = (programCode || '').trim().toUpperCase() || level || ''
	const parts = [scope, sub?.label || subCode]
	const base = parts.filter(Boolean).join(' ')
	// Avoid duplicating the category when the sub-category already implies it
	if (cat && sub && cat.subCategories.length === 1) {
		return [scope, cat.label].filter(Boolean).join(' ')
	}
	return base
}
