import type { AttendanceSlab } from '@/types/mark-conversion-rule'

export function applyAttendanceSlabs(
	attendancePct: number,
	slabs: AttendanceSlab[],
	maxMarks: number
): number {
	const slab = slabs.find(s => attendancePct >= s.min_pct && attendancePct <= s.max_pct)
	if (!slab) return 0
	return Math.round((slab.award_pct / 100) * maxMarks * 100) / 100
}
