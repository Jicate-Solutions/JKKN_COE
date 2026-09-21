import type { DiscontinuedSessionOption } from '@/types/discontinued-learners'

/**
 * Session ordering for the Discontinued Learners report.
 *
 * The report compares an End Semester session with the End Semester session
 * before it (NOV-2026 -> APR-2026). "Before" is decided by examination_sessions
 * .month_year ("NOV-2026"), not by created_at or the session code, with
 * exam_start_date standing in for a session that carries no month_year.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** Only these sessions take part - CIA and supplementary sessions are not a semester's fee */
export function isEndSemesterExamType(name: string | null | undefined): boolean {
	return /end\s*semester/i.test(String(name || ''))
}

/** "NOV-2026" -> 2026 * 12 + 10. 0 when neither value yields a date. */
export function sessionSortKey(monthYear: string | null | undefined, examStartDate?: string | null): number {
	const match = String(monthYear || '').trim().toUpperCase().match(/^([A-Z]{3})[A-Z]*-(\d{4})$/)
	if (match) {
		const month = MONTHS.indexOf(match[1])
		if (month >= 0) return parseInt(match[2], 10) * 12 + month
	}
	if (examStartDate) {
		const date = new Date(examStartDate)
		if (!isNaN(date.getTime())) return date.getFullYear() * 12 + date.getMonth()
	}
	return 0
}

/** Sessions held before `currentId`, latest first - the first entry is the default previous session */
export function earlierSessions(
	sessions: DiscontinuedSessionOption[],
	currentId: string
): DiscontinuedSessionOption[] {
	const current = sessions.find(s => s.id === currentId)
	if (!current) return []
	return sessions
		// A session with no usable date cannot be ordered, so every other one stays selectable
		.filter(s => s.id !== current.id && (current.sort_key === 0 || (s.sort_key > 0 && s.sort_key < current.sort_key)))
		.sort((a, b) => b.sort_key - a.sort_key)
}
