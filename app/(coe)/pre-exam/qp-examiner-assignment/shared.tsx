'use client'

// Shared pieces of the Question Paper Examiner Assignment screen: the client
// types, the status/window badges and the searchable select the tabs reuse.

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QpAssignmentStatus, QpExaminerKind, QpWindowState } from '@/types/qp-examiner-assignment'

// ── Types the page and its tabs share ───────────────────────────────────────

export interface InstitutionOpt {
	id: string
	name: string
	institution_code: string
}

export interface SessionOpt {
	id: string
	session_name: string
	session_code: string
	month_year: string | null
	exam_type_name: string | null
	exam_type_code: string | null
	is_end_semester: boolean
	session_status: string | null
}

export interface CourseRow {
	course_offering_id: string
	course_id: string | null
	course_code: string
	subject_title: string
	course_category: string | null
	program_code: string
	semester: number
	set_number: number
	set_label: string | null
	template_id: string
	template_name: string
	template_total_marks: number
	duration_minutes: number | null
	paper_id: string | null
	paper_status: string | null
	authored: boolean
	assignment: {
		id: string
		status: QpAssignmentStatus
		examiner_kind: QpExaminerKind
		valid_from: string
		valid_to: string
		order_ref_no: string | null
		examiner_name: string | null
		examiner_email: string | null
	} | null
}

export interface ExaminerOpt {
	id: string
	kind: QpExaminerKind
	full_name: string
	email: string
	mobile?: string | null
	designation?: string | null
	department?: string | null
	institution_name?: string | null
	myjkkn_staff_id?: string | null
	already_mirrored?: boolean
	willingness_roles?: string[] | null
	status?: string | null
	active_assignments?: number
}

export interface AssignmentRow {
	id: string
	institutions_id: string
	examination_session_id: string | null
	course_code: string | null
	subject_title: string | null
	program_code: string | null
	semester: number | null
	set_label: string | null
	examiner_kind: QpExaminerKind
	status: QpAssignmentStatus
	valid_from: string
	valid_to: string
	window_state: QpWindowState
	order_ref_no: string | null
	order_email_sent_at: string | null
	remuneration: number | null
	return_remarks: string | null
	submitted_at: string | null
	accepted_at: string | null
	claim_submitted_at: string | null
	window_extensions: number
	notes: string | null
	paper_id: string
	paper_status: string | null
	authored: boolean
	authored_count: number
	question_count: number
	session_name: string | null
	examiner: {
		id: string
		full_name: string
		email: string
		mobile?: string | null
		designation?: string | null
		department?: string | null
		institution_name?: string | null
	} | null
}

// ── Badges ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<QpAssignmentStatus, { label: string; className: string }> = {
	assigned: { label: 'Assigned', className: 'bg-slate-100 text-slate-700 border-slate-200' },
	in_progress: { label: 'In Progress', className: 'bg-blue-50 text-blue-700 border-blue-200' },
	submitted: { label: 'Submitted', className: 'bg-amber-50 text-amber-700 border-amber-200' },
	returned: { label: 'Returned', className: 'bg-orange-50 text-orange-700 border-orange-200' },
	accepted: { label: 'Accepted', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
	cancelled: { label: 'Cancelled', className: 'bg-rose-50 text-rose-700 border-rose-200' },
}

export function StatusBadge({ status }: { status: QpAssignmentStatus }) {
	const s = STATUS_STYLES[status] || STATUS_STYLES.assigned
	return (
		<Badge variant="outline" className={cn('font-medium', s.className)}>
			{s.label}
		</Badge>
	)
}

const WINDOW_STYLES: Record<QpWindowState, { label: string; className: string }> = {
	pending: { label: 'Not open yet', className: 'bg-slate-50 text-slate-600 border-slate-200' },
	open: { label: 'Open', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
	closed: { label: 'Closed', className: 'bg-rose-50 text-rose-700 border-rose-200' },
}

export function WindowBadge({ state }: { state: QpWindowState }) {
	const s = WINDOW_STYLES[state] || WINDOW_STYLES.closed
	return (
		<Badge variant="outline" className={cn('font-medium', s.className)}>
			{s.label}
		</Badge>
	)
}

export function KindBadge({ kind }: { kind: QpExaminerKind }) {
	return (
		<Badge
			variant="outline"
			className={cn(
				'font-medium',
				kind === 'internal'
					? 'bg-violet-50 text-violet-700 border-violet-200'
					: 'bg-cyan-50 text-cyan-700 border-cyan-200'
			)}
		>
			{kind === 'internal' ? 'Internal' : 'External'}
		</Badge>
	)
}

// ── Searchable single-select (same shape as the question-papers screen) ─────

export function SearchableSelect({
	value,
	onValueChange,
	placeholder,
	options,
	disabled,
	searchPlaceholder,
	className,
}: {
	value: string
	onValueChange: (v: string) => void
	placeholder: string
	options: { value: string; label: string; hint?: string; disabled?: boolean }[]
	disabled?: boolean
	searchPlaceholder?: string
	className?: string
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')

	const filtered = useMemo(() => {
		if (!search.trim()) return options
		const q = search.toLowerCase()
		return options.filter(o => o.label.toLowerCase().includes(q) || (o.hint || '').toLowerCase().includes(q))
	}, [options, search])

	const selected = options.find(o => o.value === value)

	return (
		<Popover
			open={open}
			onOpenChange={o => {
				setOpen(o)
				if (!o) setSearch('')
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn('h-9 w-full justify-between rounded-md px-3 text-sm font-normal', className)}
				>
					<span className={cn('truncate', !selected && 'text-muted-foreground')}>
						{selected?.label || placeholder}
					</span>
					<ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0" align="start">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={searchPlaceholder || 'Search…'}
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList>
						<CommandEmpty>No match.</CommandEmpty>
						{filtered.map(o => (
							<CommandItem
								key={o.value}
								value={o.value}
								disabled={o.disabled}
								onSelect={() => {
									if (o.disabled) return
									onValueChange(o.value)
									setOpen(false)
									setSearch('')
								}}
								className={cn(o.disabled && 'opacity-50')}
							>
								<Check className={cn('mr-2 h-4 w-4', value === o.value ? 'opacity-100' : 'opacity-0')} />
								<span className="flex-1 truncate">
									{o.label}
									{o.hint ? <span className="ml-2 text-xs text-muted-foreground">{o.hint}</span> : null}
								</span>
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

// ── Fetch helper ────────────────────────────────────────────────────────────

/**
 * Read the CSRF cookie the proxy sets and send it back on writes. Every
 * state-changing call to /api/pre-exam/* goes through here.
 */
function csrfToken(): string {
	if (typeof document === 'undefined') return ''
	const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
	return match ? decodeURIComponent(match[1]) : ''
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<any> {
	const method = (init.method || 'GET').toUpperCase()
	const headers = new Headers(init.headers)
	if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
		headers.set('Content-Type', 'application/json')
	}
	if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
		headers.set('x-csrf-token', csrfToken())
	}

	const res = await fetch(url, { ...init, headers })
	const text = await res.text()
	let json: any = null
	try {
		json = text ? JSON.parse(text) : null
	} catch {
		// A non-JSON body means an unexpected failure; surface the first line.
		if (!res.ok) throw new Error(text.slice(0, 200) || `HTTP ${res.status}`)
	}
	if (!res.ok) {
		throw new Error(json?.message || json?.error || `HTTP ${res.status}`)
	}
	return json
}
