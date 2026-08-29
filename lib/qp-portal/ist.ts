// Indian Standard Time helpers for the question-paper assignment window.
//
// Every date the CoE types and every date the examiner reads is IST. The column
// is timestamptz, so the DB holds a real instant — these functions are the only
// place the +05:30 offset is applied, in both directions.
//
// IST has no daylight saving and has been a fixed UTC+05:30 since 1945, so a
// constant offset is exact; Intl is used only for display formatting.

export const IST_OFFSET_MINUTES = 330 // +05:30
const IST_SUFFIX = '+05:30'

/**
 * A `datetime-local` input value ("2026-11-04T10:00") read as IST, returned as
 * an ISO instant. Empty / malformed input returns null rather than an Invalid
 * Date, so a caller can reject it with a real message.
 */
export function istLocalToIso(local: string | null | undefined): string | null {
	if (!local) return null
	const trimmed = String(local).trim()
	// Accept "YYYY-MM-DDTHH:mm" and "YYYY-MM-DDTHH:mm:ss".
	const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
	if (!m) {
		// Already a full ISO instant (has a zone) — pass it through if it parses.
		const d = new Date(trimmed)
		return isNaN(d.getTime()) ? null : d.toISOString()
	}
	const [, y, mo, d, h, mi, s] = m
	const iso = `${y}-${mo}-${d}T${h}:${mi}:${s || '00'}${IST_SUFFIX}`
	const parsed = new Date(iso)
	return isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/** An ISO instant rendered as the IST `datetime-local` value an input expects. */
export function isoToIstLocal(iso: string | null | undefined): string {
	if (!iso) return ''
	const d = new Date(iso)
	if (isNaN(d.getTime())) return ''
	const shifted = new Date(d.getTime() + IST_OFFSET_MINUTES * 60_000)
	return shifted.toISOString().slice(0, 16)
}

const DATE_TIME_FMT = new Intl.DateTimeFormat('en-IN', {
	timeZone: 'Asia/Kolkata',
	day: '2-digit',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hour12: true,
})

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
	timeZone: 'Asia/Kolkata',
	day: '2-digit',
	month: 'short',
	year: 'numeric',
})

/** "04 Nov 2026, 10:00 am IST" — what every screen and PDF prints. */
export function formatIst(iso: string | null | undefined, withZone = true): string {
	if (!iso) return '—'
	const d = new Date(iso)
	if (isNaN(d.getTime())) return '—'
	const text = DATE_TIME_FMT.format(d).replace(/ /g, ' ')
	return withZone ? `${text} IST` : text
}

/** "04 Nov 2026" — dates without a time (order date, deadline day). */
export function formatIstDate(iso: string | null | undefined): string {
	if (!iso) return '—'
	const d = new Date(iso)
	if (isNaN(d.getTime())) return '—'
	return DATE_FMT.format(d)
}

export type WindowState = 'pending' | 'open' | 'closed'

/**
 * Where `at` sits relative to the window. The window is inclusive of valid_from
 * and exclusive of valid_to: at exactly valid_to the paper is already closed,
 * which is what "access closes at 5:00 pm" means to a reader.
 */
export function windowState(
	validFrom: string | null | undefined,
	validTo: string | null | undefined,
	at: Date = new Date()
): WindowState {
	const from = validFrom ? new Date(validFrom).getTime() : NaN
	const to = validTo ? new Date(validTo).getTime() : NaN
	const now = at.getTime()
	// A row with no usable window is treated as closed — never accidentally open.
	if (isNaN(from) || isNaN(to)) return 'closed'
	if (now < from) return 'pending'
	if (now >= to) return 'closed'
	return 'open'
}

export function isWindowOpen(
	validFrom: string | null | undefined,
	validTo: string | null | undefined,
	at: Date = new Date()
): boolean {
	return windowState(validFrom, validTo, at) === 'open'
}

/** "opens in 2 days" / "closes in 5 hours" / "closed 3 days ago". */
export function windowHint(
	validFrom: string | null | undefined,
	validTo: string | null | undefined,
	at: Date = new Date()
): string {
	const state = windowState(validFrom, validTo, at)
	const now = at.getTime()
	const target = state === 'pending' ? new Date(validFrom!).getTime() : new Date(validTo!).getTime()
	if (isNaN(target)) return 'No access window set'

	const diffMs = Math.abs(target - now)
	const mins = Math.round(diffMs / 60_000)
	const hours = Math.round(diffMs / 3_600_000)
	const days = Math.round(diffMs / 86_400_000)
	const span = days >= 2 ? `${days} days` : hours >= 2 ? `${hours} hours` : `${Math.max(mins, 1)} min`

	if (state === 'pending') return `Opens in ${span}`
	if (state === 'open') return `Closes in ${span}`
	return `Closed ${span} ago`
}
