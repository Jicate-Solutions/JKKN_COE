'use client'

// The one place that answers "where am I, and what do I do now?" for a paper.
//
// A sticky strip at the top of the paper page: the steps of the whole journey
// with the current one lit, and under it a single sentence saying what to do
// next, in the tone of the situation (blue = your turn, amber = something to
// fix first, green = done, grey = locked, red = closed, orange = returned).
//
// It knows nothing about the server: the portal computes the steps and the
// instruction from the assignment and the editor's problems and hands them in.

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
	CheckCircle2, Circle, Lock, AlertTriangle, Info, XCircle, RotateCcw, Loader2, ChevronRight,
} from 'lucide-react'
import { TONE, type Tone } from './tones'

export type StepState = 'done' | 'current' | 'todo' | 'blocked'

export interface TrackerStep {
	key: string
	label: string
	state: StepState
}

export interface TrackerInstruction {
	tone: Tone
	title: string
	detail?: string | null
	action?: {
		label: string
		onClick: () => void
		disabled?: boolean
		/** Shown beside a disabled action so the examiner knows why. */
		reason?: string | null
		busy?: boolean
	} | null
}

const ICON: Record<Tone, typeof Info> = {
	success: CheckCircle2,
	info: Info,
	warning: AlertTriangle,
	danger: XCircle,
	locked: Lock,
	returned: RotateCcw,
}

export function PaperStepTracker({
	steps,
	instruction,
	status,
	className,
}: {
	steps: TrackerStep[]
	instruction: TrackerInstruction
	/** Optional slim row under the instruction: progress, sync badge, Save Draft. */
	status?: React.ReactNode
	className?: string
}) {
	const t = TONE[instruction.tone]
	const Icon = ICON[instruction.tone]

	return (
		<div
			className={cn(
				'sticky top-[57px] z-20 -mx-3 sm:-mx-5 px-3 sm:px-5 pt-2 pb-2.5 bg-gray-50/95 backdrop-blur border-b',
				className
			)}
		>
			{/* Steps — scrolls sideways on a narrow screen instead of wrapping into a mess. */}
			<ol className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1 text-xs whitespace-nowrap [scrollbar-width:thin]">
				{steps.map((s, i) => {
					const StepIcon =
						s.state === 'done' ? CheckCircle2 : s.state === 'blocked' ? Lock : Circle
					return (
						<li key={s.key} className="flex items-center gap-1 shrink-0">
							<span
								className={cn(
									'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium',
									s.state === 'done' && TONE.success.badge,
									s.state === 'current' && cn(TONE.info.badge, 'ring-2 ring-blue-200'),
									s.state === 'todo' && 'bg-white text-slate-500 border-slate-200',
									s.state === 'blocked' && TONE.locked.badge
								)}
								aria-current={s.state === 'current' ? 'step' : undefined}
							>
								<StepIcon className={cn('h-3.5 w-3.5', s.state === 'current' && 'fill-blue-600 text-blue-600')} />
								<span>
									<span className="text-[10px] opacity-70 mr-1">{i + 1}</span>
									{s.label}
								</span>
							</span>
							{i < steps.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
						</li>
					)
				})}
			</ol>

			{/* What to do now. */}
			<div className={cn('mt-2 rounded-md border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5', t.card)}>
				<Icon className={cn('h-[18px] w-[18px] shrink-0', t.icon)} />
				<div className="flex-1 min-w-[200px]">
					<p className={cn('text-sm font-semibold leading-snug', t.heading)}>{instruction.title}</p>
					{instruction.detail && <p className={cn('text-xs mt-0.5', t.text)}>{instruction.detail}</p>}
				</div>
				{instruction.action && (
					<div className="flex flex-col items-end gap-0.5 shrink-0">
						<Button
							size="sm"
							onClick={instruction.action.onClick}
							disabled={instruction.action.disabled || instruction.action.busy}
							variant={instruction.tone === 'success' || instruction.tone === 'info' ? 'default' : 'outline'}
						>
							{instruction.action.busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							{instruction.action.label}
						</Button>
						{instruction.action.disabled && instruction.action.reason && (
							<span className="text-[11px] text-rose-700">{instruction.action.reason}</span>
						)}
					</div>
				)}
			</div>

			{status && <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs">{status}</div>}
		</div>
	)
}

/**
 * Small inline "why is this disabled" line, used beside every gated button.
 * `danger` (default) for something the examiner must fix; `muted` for a benign
 * reason such as "nothing new to save".
 */
export function DisabledReason({
	reason,
	tone = 'danger',
	className,
}: {
	reason?: string | null
	tone?: 'danger' | 'muted'
	className?: string
}) {
	if (!reason) return null
	return (
		<span
			className={cn(
				'text-xs flex items-center gap-1',
				tone === 'danger' ? 'text-rose-700' : 'text-muted-foreground',
				className
			)}
		>
			<Lock className="h-3 w-3 shrink-0" />
			{reason}
		</span>
	)
}

/** One status badge, coloured by tone. */
export function ToneBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
				TONE[tone].badge,
				className
			)}
		>
			{children}
		</span>
	)
}
