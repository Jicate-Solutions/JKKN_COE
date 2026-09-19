// Sentinel for learners whose register number carries no admission year
export const UNMAPPED_BATCH = 0

// The learner's batch = the admission year inside the register number. Read from the
// register number rather than MyJKKN because every row of every report carries it,
// and MyJKKN profiles omit inactive learners - exactly the arrear-only learners of
// older batches. Three shapes are live:
//   24JUGAID012  -> 2024 (leading year)
//   AUG26CS44    -> 2026 (provisional admission number, year after the letters)
//   731325405002 -> 2025 (12-digit university number, year after the college code)
export function batchYearOf(registerNo: string | null | undefined): number {
	const reg = String(registerNo || '').trim().toUpperCase()
	const match = /^\d{12}$/.test(reg)
		? reg.slice(4, 6)
		: (reg.match(/^(\d{2})[A-Z]/) || reg.match(/^[A-Z]+(\d{2})/))?.[1]
	return match ? 2000 + parseInt(match, 10) : UNMAPPED_BATCH
}

export function batchLabel(year: number): string {
	return year === UNMAPPED_BATCH ? 'Not Mapped' : `${year} Batch`
}
