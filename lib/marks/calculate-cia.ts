import type { MarkConversionRule, FinalRule } from '@/types/mark-conversion-rule'
import { applyAttendanceSlabs } from './apply-attendance-slabs'

export interface ComponentInput {
	code: string
	raw_marks?: number
	raw_attendance_pct?: number
	max_marks: number
}

export function calculateRoundMarks(
	roundName: string,
	components: ComponentInput[],
	rule: MarkConversionRule
): { converted: Record<string, number>; round_total: number; capped_at: number } {
	const roundRule = rule.round_rules[roundName]
	if (!roundRule) return { converted: {}, round_total: 0, capped_at: 0 }

	const converted: Record<string, number> = {}
	for (const comp of components) {
		if (!roundRule.components.includes(comp.code)) continue

		if (comp.code === 'attendance' && comp.raw_attendance_pct != null) {
			converted[comp.code] = applyAttendanceSlabs(comp.raw_attendance_pct, rule.attendance_slabs, comp.max_marks)
		} else if (comp.raw_marks != null) {
			const compRule = rule.component_rules[comp.code]
			if (compRule?.raw_out_of && compRule?.converts_to) {
				converted[comp.code] = Math.round((comp.raw_marks / compRule.raw_out_of) * compRule.converts_to * 100) / 100
			} else {
				converted[comp.code] = comp.raw_marks
			}
		}
	}

	const rawTotal = Object.values(converted).reduce((s, v) => s + v, 0)
	const capped_at = Math.min(rawTotal, roundRule.cap_total)
	return { converted, round_total: rawTotal, capped_at }
}

export interface RoundResult {
	round_name: string
	capped_total: number
}

export function calculateFinalInternal(
	roundResults: RoundResult[],
	extras: Record<string, number>,
	rule: FinalRule,
	courseInternalMax: number
): { raw: number; scaled_to_course_max: number } {
	const vals = roundResults
		.filter(r => rule.rounds.includes(r.round_name))
		.map(r => r.capped_total)

	let base = 0
	switch (rule.formula) {
		case 'sum':
			base = vals.reduce((s, v) => s + v, 0)
			break
		case 'average':
			base = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
			break
		case 'best_of': {
			const n = rule.best_of || vals.length
			base = [...vals].sort((a, b) => b - a).slice(0, n).reduce((s, v) => s + v, 0) / Math.min(n, vals.length || 1)
			break
		}
	}

	for (const extra of rule.extras || []) {
		base += extras[extra.component] ?? 0
	}

	const scaled = Math.round((base / 100) * courseInternalMax * 100) / 100
	return { raw: Math.round(base * 100) / 100, scaled_to_course_max: scaled }
}
