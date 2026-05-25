/**
 * Final Internal Marks Calculator (pure logic — no I/O)
 *
 * Input:  raw cia_marks rows (one per CIA round) for a single learner+course,
 *         the conversion rule, and the course's internal_max_mark.
 * Output: final total_internal_marks, max_internal_marks (= course max),
 *         breakdown + warnings.
 *
 * Fallback: when no cia_marks rows exist, accepts an internal_marks raw-fields
 *           row and treats it as a single synthetic "round" with all components.
 */

import type {
	AttendanceSlab,
	ComponentRule,
	FinalRule,
	MarkConversionRule,
	RoundRule,
} from '@/types/mark-conversion-rule'

// Standard 13 component codes that have dedicated columns on cia_marks / internal_marks.
// Any code NOT in this set is read from extra_marks JSONB (cia_marks) — and has no
// dedicated slot on internal_marks so the fallback path can't supply them.
export const STANDARD_COMPONENT_CODES = [
	'assignment', 'quiz', 'mid_term', 'presentation', 'attendance',
	'lab', 'project', 'seminar', 'viva', 'other',
	'test_1', 'test_2', 'test_3',
] as const

export type StandardComponentCode = typeof STANDARD_COMPONENT_CODES[number]

// Map component code → cia_marks / internal_marks column name
const STANDARD_FIELD_MAP: Record<string, string> = {
	assignment: 'assignment_marks',
	quiz: 'quiz_marks',
	mid_term: 'mid_term_marks',
	presentation: 'presentation_marks',
	attendance: 'attendance_marks',
	lab: 'lab_marks',
	project: 'project_marks',
	seminar: 'seminar_marks',
	viva: 'viva_marks',
	test_1: 'test_1_mark',
	test_2: 'test_2_mark',
	test_3: 'test_3_mark',
	other: 'other_marks',
}

// ─── Input types ───

export interface CIAMarkRow {
	cia_round: number
	cia_round_name?: string | null
	assignment_marks?: number | null
	quiz_marks?: number | null
	mid_term_marks?: number | null
	presentation_marks?: number | null
	attendance_marks?: number | null
	lab_marks?: number | null
	project_marks?: number | null
	seminar_marks?: number | null
	viva_marks?: number | null
	test_1_mark?: number | null
	test_2_mark?: number | null
	test_3_mark?: number | null
	other_marks?: number | null
	extra_marks?: Record<string, number> | null
	// optional attendance metadata (round-level) — used by attendance_slabs
	attendance_percentage?: number | null
}

export interface InternalMarkRow {
	assignment_marks?: number | null
	quiz_marks?: number | null
	mid_term_marks?: number | null
	presentation_marks?: number | null
	attendance_marks?: number | null
	lab_marks?: number | null
	project_marks?: number | null
	seminar_marks?: number | null
	viva_marks?: number | null
	test_1_mark?: number | null
	test_2_mark?: number | null
	test_3_mark?: number | null
	other_marks?: number | null
}

export interface CalculationInput {
	rule: Pick<MarkConversionRule, 'component_rules' | 'round_rules' | 'final_rule' | 'attendance_slabs'>
	course_internal_max: number
	cia_marks: CIAMarkRow[]
	fallback?: InternalMarkRow | null
	attendance_percentage_override?: number | null
}

// ─── Output types ───

export interface ComponentLine {
	component: string
	raw: number
	raw_out_of: number
	converted: number
	converts_to: number
	source: 'cia_marks' | 'extra_marks' | 'fallback' | 'attendance_slab'
}

export interface RoundLine {
	round_name: string
	components: ComponentLine[]
	round_total: number
	cap_total: number
	capped: boolean
}

export interface CalculationBreakdown {
	rounds: RoundLine[]
	final_formula: FinalRule['formula']
	final_before_scale: number
	rule_standard_total: number
	scale_factor: number
	total_internal_marks: number
	max_internal_marks: number
	attendance_award_pct?: number | null
	fallback_used: boolean
}

export interface CalculationResult {
	total_internal_marks: number
	max_internal_marks: number
	breakdown: CalculationBreakdown
	warnings: string[]
	errors: string[]
}

// ─── Helpers ───

function toNum(v: unknown): number {
	if (v == null) return 0
	const n = Number(v)
	return Number.isFinite(n) ? n : 0
}

function readComponentValue(
	row: CIAMarkRow | InternalMarkRow,
	code: string,
	extra?: Record<string, number> | null,
	allCIA?: CIAMarkRow[] | null,
): { value: number; source: ComponentLine['source'] } {
	// Meta codes: cia_1, cia_2, cia_3 → sum of all marks in that cia_round row
	const ciaMeta = /^cia_(\d+)$/.exec(code)
	if (ciaMeta && allCIA?.length) {
		const n = Number(ciaMeta[1])
		const r = allCIA.find(c => c.cia_round === n)
		if (r) {
			return { value: sumAllComponents(r), source: 'cia_marks' }
		}
		return { value: 0, source: 'cia_marks' }
	}

	const field = STANDARD_FIELD_MAP[code]
	if (field && field in row) {
		return { value: toNum((row as any)[field]), source: 'cia_marks' }
	}
	if (extra && code in extra) {
		return { value: toNum(extra[code]), source: 'extra_marks' }
	}
	return { value: 0, source: 'cia_marks' }
}

function sumAllComponents(row: CIAMarkRow): number {
	let total = 0
	for (const code of STANDARD_COMPONENT_CODES) {
		const field = STANDARD_FIELD_MAP[code]
		total += toNum((row as any)[field])
	}
	if (row.extra_marks) {
		for (const v of Object.values(row.extra_marks)) total += toNum(v)
	}
	return total
}

function applyAttendanceSlabs(pct: number, slabs: AttendanceSlab[]): number | null {
	if (!slabs || slabs.length === 0) return null
	// slabs are lower- and upper-bound inclusive per types/mark-conversion-rule.ts
	for (const s of slabs) {
		if (pct >= s.min_pct && pct <= s.max_pct) return s.award_pct
	}
	return null
}

function applyComponentRule(
	raw: number,
	rule: ComponentRule | undefined,
	defaultRawOutOf: number,
	defaultConvertsTo: number,
): { converted: number; raw_out_of: number; converts_to: number } {
	const raw_out_of = rule?.raw_out_of ?? defaultRawOutOf
	const converts_to = rule?.converts_to ?? defaultConvertsTo
	if (raw_out_of <= 0) return { converted: 0, raw_out_of, converts_to }
	const converted = (raw / raw_out_of) * converts_to
	return { converted: Math.max(0, converted), raw_out_of, converts_to }
}

function sumConvertsTo(rule: CalculationInput['rule']): number {
	// Sum of cap_total across rounds participating in final_rule, plus any extras.
	const rounds = rule.final_rule?.rounds || Object.keys(rule.round_rules || {})
	let total = 0
	for (const name of rounds) {
		const rr = rule.round_rules?.[name]
		if (rr) total += toNum(rr.cap_total)
	}
	for (const ex of rule.final_rule?.extras || []) total += toNum(ex.marks)
	return total
}

// ─── Main calculator ───

export function calculateFinalInternalMarks(input: CalculationInput): CalculationResult {
	const warnings: string[] = []
	const errors: string[] = []
	const { rule, course_internal_max } = input

	if (!rule || !rule.round_rules || !rule.final_rule) {
		errors.push('Conversion rule is missing round_rules or final_rule')
		return emptyResult(course_internal_max, errors)
	}
	if (course_internal_max <= 0) {
		errors.push('course_internal_max must be > 0')
		return emptyResult(course_internal_max, errors)
	}

	const hasCIA = (input.cia_marks?.length || 0) > 0
	const fallbackUsed = !hasCIA && !!input.fallback

	// Build map of round_name → cia_marks row (try name first, then number)
	const ciaByName = new Map<string, CIAMarkRow>()
	const ciaByNum = new Map<number, CIAMarkRow>()
	for (const row of input.cia_marks || []) {
		if (row.cia_round_name) ciaByName.set(row.cia_round_name, row)
		ciaByNum.set(row.cia_round, row)
	}

	const participatingRounds = rule.final_rule.rounds && rule.final_rule.rounds.length > 0
		? rule.final_rule.rounds
		: Object.keys(rule.round_rules)

	const roundLines: RoundLine[] = []
	let attendanceAwardPct: number | null = null

	for (let idx = 0; idx < participatingRounds.length; idx++) {
		const roundName = participatingRounds[idx]
		const rr: RoundRule | undefined = rule.round_rules[roundName]
		if (!rr) {
			warnings.push(`Round "${roundName}" referenced in final_rule.rounds but missing from round_rules`)
			continue
		}

		// Source row: try by name, then by index+1 (CIA-1 → cia_round=1)
		const row = (ciaByName.get(roundName) ||
			ciaByNum.get(idx + 1) ||
			(fallbackUsed && idx === 0 ? (input.fallback as CIAMarkRow) : null)) as CIAMarkRow | null

		const extra = row && 'extra_marks' in row ? row.extra_marks ?? null : null

		const componentLines: ComponentLine[] = []
		let roundTotal = 0

		for (const compCode of rr.components) {
			const cRule = rule.component_rules?.[compCode]

			// Attendance with slabs: use percentage → award_pct → marks
			if (compCode === 'attendance' && cRule?.strategy === 'use_slabs' && rule.attendance_slabs?.length) {
				const pct = input.attendance_percentage_override ?? row?.attendance_percentage ?? null
				if (pct == null) {
					warnings.push(`Round "${roundName}": attendance % not provided; skipping slab logic`)
				} else {
					const awardPct = applyAttendanceSlabs(pct, rule.attendance_slabs)
					attendanceAwardPct = awardPct
					if (awardPct == null) {
						warnings.push(`Round "${roundName}": attendance ${pct}% did not match any slab`)
					} else {
						const convertsTo = cRule.converts_to ?? 5
						const converted = (awardPct / 100) * convertsTo
						componentLines.push({
							component: compCode,
							raw: pct,
							raw_out_of: 100,
							converted,
							converts_to: convertsTo,
							source: 'attendance_slab',
						})
						roundTotal += converted
					}
					continue
				}
			}

			// Read raw from source row (or fallback)
			const sourceRow = row || (fallbackUsed ? input.fallback : null)
			if (!sourceRow) {
				warnings.push(`Round "${roundName}" (${compCode}): no source mark row`)
				continue
			}
			const { value: raw, source } = readComponentValue(sourceRow, compCode, extra, input.cia_marks)
			const { converted, raw_out_of, converts_to } = applyComponentRule(
				raw, cRule, cRule?.raw_out_of ?? 0, cRule?.converts_to ?? 0,
			)
			componentLines.push({
				component: compCode, raw, raw_out_of, converted, converts_to,
				source: fallbackUsed ? 'fallback' : source,
			})
			roundTotal += converted
		}

		const cap = toNum(rr.cap_total)
		const capped = cap > 0 && roundTotal > cap
		const finalRoundTotal = capped ? cap : roundTotal

		roundLines.push({
			round_name: roundName,
			components: componentLines,
			round_total: finalRoundTotal,
			cap_total: cap,
			capped,
		})
	}

	// Apply final formula
	const formula = rule.final_rule.formula
	const roundTotals = roundLines.map(r => r.round_total)
	let finalBeforeScale = 0

	if (roundTotals.length === 0) {
		warnings.push('No participating rounds had data')
	} else if (formula === 'sum') {
		finalBeforeScale = roundTotals.reduce((a, b) => a + b, 0)
	} else if (formula === 'average') {
		finalBeforeScale = roundTotals.reduce((a, b) => a + b, 0) / roundTotals.length
	} else if (formula === 'best_of') {
		const n = rule.final_rule.best_of ?? roundTotals.length
		const top = [...roundTotals].sort((a, b) => b - a).slice(0, n)
		finalBeforeScale = top.reduce((a, b) => a + b, 0)
	}

	for (const ex of rule.final_rule.extras || []) {
		finalBeforeScale += toNum(ex.marks)
	}

	// Reconcile to course max — behavior depends on scale_mode.
	// 'none' (mark/1 pass-through use case): keep raw computed total, only cap at course max.
	// 'auto' (default, back-compat): scale by course_max / rule_total when they differ.
	const ruleStandardTotal = sumConvertsTo(rule)
	const scaleMode = rule.final_rule?.scale_mode ?? 'auto'
	let scaleFactor = 1
	if (scaleMode === 'auto' && ruleStandardTotal > 0) {
		scaleFactor = course_internal_max / ruleStandardTotal
		if (Math.abs(scaleFactor - 1) > 0.001) {
			warnings.push(
				`Rule standard total = ${ruleStandardTotal}, course max = ${course_internal_max}. ` +
				`Scaling by ${scaleFactor.toFixed(4)}.`,
			)
		}
	} else if (scaleMode === 'none' && ruleStandardTotal !== course_internal_max && ruleStandardTotal > 0) {
		warnings.push(
			`Rule standard total = ${ruleStandardTotal}, course max = ${course_internal_max}. ` +
			`scale_mode='none' — value used as-is, capped at course max.`,
		)
	}

	let total = finalBeforeScale * scaleFactor
	// Cap at course max and floor at 0
	if (total > course_internal_max) total = course_internal_max
	if (total < 0) total = 0

	const breakdown: CalculationBreakdown = {
		rounds: roundLines,
		final_formula: formula,
		final_before_scale: round2(finalBeforeScale),
		rule_standard_total: round2(ruleStandardTotal),
		scale_factor: round2(scaleFactor),
		total_internal_marks: round2(total),
		max_internal_marks: course_internal_max,
		attendance_award_pct: attendanceAwardPct,
		fallback_used: fallbackUsed,
	}

	return {
		total_internal_marks: Math.round(total),
		max_internal_marks: course_internal_max,
		breakdown,
		warnings,
		errors,
	}
}

function emptyResult(courseMax: number, errors: string[]): CalculationResult {
	return {
		total_internal_marks: 0,
		max_internal_marks: courseMax,
		breakdown: {
			rounds: [],
			final_formula: 'sum',
			final_before_scale: 0,
			rule_standard_total: 0,
			scale_factor: 1,
			total_internal_marks: 0,
			max_internal_marks: courseMax,
			attendance_award_pct: null,
			fallback_used: false,
		},
		warnings: [],
		errors,
	}
}

function round2(n: number): number {
	return Math.round(n * 100) / 100
}
