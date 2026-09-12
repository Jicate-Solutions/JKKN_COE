// One colour vocabulary for the whole examiner portal.
//
// Every badge, banner, border and inline message picks a TONE by meaning, never
// a colour by hand, so "locked" always looks the same wherever it appears and an
// examiner learns the palette once:
//
//   success   done, accepted, saved, paid                       green
//   info      in progress, the next step is yours               blue
//   warning   needs attention before you can go on              amber
//   danger    invalid, refused, access closed                   red
//   locked    not open yet, read-only, closed for good          grey
//   returned  sent back by the CoE for revision                 orange

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'locked' | 'returned'

export const TONE: Record<
	Tone,
	{
		/** Outline badge. */
		badge: string
		/** Card / banner surface. */
		card: string
		/** Card border only (no fill), for the stronger 2px frames. */
		frame: string
		/** Left accent bar on a list card (`border-l-4`). Literal, so Tailwind emits it. */
		bar: string
		/** Body text on a `card`. */
		text: string
		/** Heading text on a `card`. */
		heading: string
		/** Icon colour. */
		icon: string
		/** Solid dot / pill. */
		solid: string
	}
> = {
	success: {
		badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
		card: 'border-emerald-200 bg-emerald-50/60',
		frame: 'border-emerald-300',
		bar: 'border-l-emerald-300',
		text: 'text-emerald-800',
		heading: 'text-emerald-900',
		icon: 'text-emerald-600',
		solid: 'bg-emerald-600 text-white',
	},
	info: {
		badge: 'bg-blue-50 text-blue-700 border-blue-200',
		card: 'border-blue-200 bg-blue-50/60',
		frame: 'border-blue-300',
		bar: 'border-l-blue-300',
		text: 'text-blue-800',
		heading: 'text-blue-900',
		icon: 'text-blue-600',
		solid: 'bg-blue-600 text-white',
	},
	warning: {
		badge: 'bg-amber-50 text-amber-700 border-amber-200',
		card: 'border-amber-200 bg-amber-50/70',
		frame: 'border-amber-300',
		bar: 'border-l-amber-300',
		text: 'text-amber-800',
		heading: 'text-amber-900',
		icon: 'text-amber-600',
		solid: 'bg-amber-500 text-white',
	},
	danger: {
		badge: 'bg-rose-50 text-rose-700 border-rose-200',
		card: 'border-rose-200 bg-rose-50/70',
		frame: 'border-rose-300',
		bar: 'border-l-rose-300',
		text: 'text-rose-800',
		heading: 'text-rose-900',
		icon: 'text-rose-600',
		solid: 'bg-rose-600 text-white',
	},
	locked: {
		badge: 'bg-slate-100 text-slate-700 border-slate-200',
		card: 'border-slate-200 bg-slate-50',
		frame: 'border-slate-300',
		bar: 'border-l-slate-300',
		text: 'text-slate-700',
		heading: 'text-slate-900',
		icon: 'text-slate-500',
		solid: 'bg-slate-500 text-white',
	},
	returned: {
		badge: 'bg-orange-50 text-orange-700 border-orange-200',
		card: 'border-orange-200 bg-orange-50/70',
		frame: 'border-orange-300',
		bar: 'border-l-orange-300',
		text: 'text-orange-800',
		heading: 'text-orange-900',
		icon: 'text-orange-600',
		solid: 'bg-orange-500 text-white',
	},
}

/**
 * Tab triggers, coloured by what the tab holds. Literal class strings so
 * Tailwind emits them; applied on top of the base TabsTrigger styles.
 */
export const TAB_TONE: Record<Tone, string> = {
	success:
		'data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-emerald-50 hover:text-emerald-800',
	info:
		'data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-blue-50 hover:text-blue-800',
	warning:
		'data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-amber-50 hover:text-amber-800',
	danger:
		'data-[state=active]:bg-rose-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-rose-50 hover:text-rose-800',
	locked:
		'data-[state=active]:bg-slate-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-slate-100 hover:text-slate-800',
	returned:
		'data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-orange-50 hover:text-orange-800',
}

/** The legend shown on the dashboard so the palette is never a guess. */
export const TONE_LEGEND: { tone: Tone; label: string }[] = [
	{ tone: 'info', label: 'Your turn — something to do' },
	{ tone: 'warning', label: 'Needs attention before you can continue' },
	{ tone: 'success', label: 'Done / accepted' },
	{ tone: 'returned', label: 'Returned by the CoE for revision' },
	{ tone: 'danger', label: 'Invalid or closed' },
	{ tone: 'locked', label: 'Locked / not open yet' },
]

/** Field-level classes for an input that is required-and-empty or invalid. */
export const FIELD_INVALID = 'border-rose-400 focus-visible:ring-rose-400 bg-rose-50/40'
export const FIELD_OK = 'border-emerald-300'
