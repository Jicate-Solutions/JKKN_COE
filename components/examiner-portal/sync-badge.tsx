'use client'

// Where the examiner's draft stands right now.
//
// Shown in two places — the editor's save bar and beside Submit — from one
// component, so the two can never disagree about whether the work is safe.
//
// The wording is deliberately about the WORK, not about the request: an examiner
// wants to know "is my paper safe?", not "did the PUT succeed?". An unsynced
// draft is still safe, because it is held in this browser and pushed when the
// connection returns, and the badge says so rather than just showing an error.

import { CheckCircle2, Loader2, CloudOff, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SyncState = 'idle' | 'saving' | 'saved' | 'unsynced'

/** "just now", "2 min ago", "14:05" — the useful precision at each distance. */
export function savedAgo(iso: string | null): string {
	if (!iso) return ''
	const then = new Date(iso).getTime()
	if (Number.isNaN(then)) return ''
	const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
	if (secs < 45) return 'just now'
	const mins = Math.round(secs / 60)
	if (mins < 60) return `${mins} min ago`
	return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

interface Props {
	state: SyncState
	dirty: boolean
	savedAt: string | null
	error?: string | null
	className?: string
}

export function SyncBadge({ state, dirty, savedAt, error, className }: Props) {
	if (state === 'saving') {
		return (
			<span className={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}>
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
				Saving…
			</span>
		)
	}

	if (state === 'unsynced') {
		return (
			<span
				className={cn('flex items-center gap-1 text-xs text-amber-700', className)}
				title={
					error
						? `${error}. Your work is kept in this browser and will be sent when the connection returns.`
						: 'Your work is kept in this browser and will be sent when the connection returns.'
				}
			>
				<CloudOff className="h-3.5 w-3.5" />
				Changes not yet synced
			</span>
		)
	}

	// Unsaved edits that have not yet hit the autosave debounce.
	if (dirty) {
		return (
			<span className={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}>
				<Clock className="h-3.5 w-3.5" />
				Saving shortly…
			</span>
		)
	}

	if (savedAt) {
		return (
			<span className={cn('flex items-center gap-1 text-xs text-emerald-700', className)}>
				<CheckCircle2 className="h-3.5 w-3.5" />
				Saved {savedAgo(savedAt)}
			</span>
		)
	}

	return null
}
