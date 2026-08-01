'use client'

import { useState, useEffect, useCallback, useMemo, useId } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeaderWhite } from '@/components/layout/app-header-white'
import { AppFooter } from '@/components/layout/app-footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetFooter,
} from '@/components/ui/sheet'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
	Plus, Upload, Download, Pencil, Trash2, CalendarDays, RefreshCw,
	MoreHorizontal, ChevronDown, ChevronLeft, ChevronRight, Search,
	FileSpreadsheet, X, Tags,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
	CoeCalendarEvent,
	CoeCalendarFormData,
	CoeCalendarCategory,
	CoeCalendarCategoryRecord,
	CoeCalendarProgrammeType,
	CoeCalendarStatus,
	resolveCategoryStyle,
	COE_PROGRAMME_TYPES,
} from '@/types/coe-calendar'
import {
	COE_ROLE_TAGS,
	COE_ROLE_TAG_CONFIG,
} from '@/lib/coe-calendar/visibility'
import { RoleTagPicker, RoleTagChips } from '@/components/coe-calendar/role-tag-picker'
import { CategoryManagerDialog } from '@/components/coe-calendar/category-manager-dialog'

// ── Constants ────────────────────────────────────────────────────────

const PAGE_SIZE = 25

const CURRENT_YEAR = new Date().getFullYear()

/** Academic years around today, so the list never goes stale. */
const ACADEMIC_YEARS = Array.from({ length: 6 }, (_, i) => {
	const start = CURRENT_YEAR - 2 + i
	return `${start}-${start + 1}`
})

const DEFAULT_ACADEMIC_YEAR = `${CURRENT_YEAR}-${CURRENT_YEAR + 1}`

const EMPTY_FORM: CoeCalendarFormData = {
	event_title: '',
	event_description: '',
	exam_category: '',
	programme_type: 'BOTH',
	academic_year: DEFAULT_ACADEMIC_YEAR,
	event_start_date: '',
	event_end_date: '',
	visible_to_roles: ['ALL'],
	program_codes: [],
	status: 'ACTIVE',
	institutions_id: '',
	institution_code: '',
}

interface ProgramOption {
	program_code: string
	program_name: string
}

/**
 * Programme multi-select. Empty means the event applies to every programme,
 * which is the common case — so the trigger reads "All programmes" when unset
 * rather than looking like a required field left blank.
 */
function ProgramPicker({
	value,
	options,
	onChange,
}: {
	value: string[]
	options: ProgramOption[]
	onChange: (codes: string[]) => void
}) {
	const fieldId = useId()

	const toggle = (code: string) => {
		onChange(value.includes(code) ? value.filter(c => c !== code) : [...value, code])
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" className="w-full justify-between font-normal">
					<span className="truncate">
						{value.length === 0
							? 'All programmes'
							: value.length <= 3
								? value.join(', ')
								: `${value.length} programmes`}
					</span>
					<ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[340px] p-2" align="start">
				{options.length === 0 ? (
					<p className="text-sm text-slate-400 px-2 py-3">
						No active programmes for this institution.
					</p>
				) : (
					<>
						<div className="max-h-64 overflow-y-auto space-y-0.5">
							{options.map(program => {
								const id = `${fieldId}-${program.program_code}`
								return (
									<div
										key={program.program_code}
										className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5"
									>
										<Checkbox
											id={id}
											checked={value.includes(program.program_code)}
											onCheckedChange={() => toggle(program.program_code)}
											className="mt-0.5"
										/>
										<label htmlFor={id} className="min-w-0 cursor-pointer select-none">
											<span className="block text-sm font-medium leading-tight">
												{program.program_code}
											</span>
											<span className="block text-xs text-slate-500 dark:text-slate-400 leading-tight">
												{program.program_name}
											</span>
										</label>
									</div>
								)
							})}
						</div>
						<div className="flex items-center justify-between border-t mt-2 pt-2 px-2">
							<span className="text-xs text-slate-400">
								Leave empty for all programmes
							</span>
							{value.length > 0 && (
								<Button
									variant="ghost"
									size="sm"
									className="h-6 text-xs"
									onClick={() => onChange([])}
								>
									Clear
								</Button>
							)}
						</div>
					</>
				)}
			</PopoverContent>
		</Popover>
	)
}

// ── Page ─────────────────────────────────────────────────────────────

export default function CoeCalendarPage() {
	const { toast } = useToast()
	const { isReady, appendToUrl, getInstitutionIdForCreate } = useInstitutionFilter()
	const { availableInstitutions } = useInstitution()

	const institutionLabels = useMemo(() => {
		const map: Record<string, string> = {}
		for (const inst of availableInstitutions) {
			map[inst.id] = inst.institution_name || inst.institution_code
		}
		return map
	}, [availableInstitutions])

	const [events, setEvents] = useState<CoeCalendarEvent[]>([])
	const [categories, setCategories] = useState<CoeCalendarCategoryRecord[]>([])
	const [programs, setPrograms] = useState<ProgramOption[]>([])
	const [loading, setLoading] = useState(false)
	const [sheetOpen, setSheetOpen] = useState(false)
	const [uploadSheetOpen, setUploadSheetOpen] = useState(false)
	const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
	const [editingEvent, setEditingEvent] = useState<CoeCalendarEvent | null>(null)
	const [form, setForm] = useState<CoeCalendarFormData>(EMPTY_FORM)
	const [errors, setErrors] = useState<Record<string, string>>({})
	const [saving, setSaving] = useState(false)
	const [deletingId, setDeletingId] = useState<string | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<CoeCalendarEvent | null>(null)

	// Filters
	const [filterCategory, setFilterCategory] = useState<string>('ALL')
	const [filterStatus, setFilterStatus] = useState<string>('ACTIVE')
	const [filterYear, setFilterYear] = useState<string>('ALL')
	const [filterRole, setFilterRole] = useState<string>('ALL')
	const [search, setSearch] = useState('')
	const [page, setPage] = useState(1)

	// Upload
	const [uploadFile, setUploadFile] = useState<File | null>(null)
	const [uploadYear, setUploadYear] = useState(DEFAULT_ACADEMIC_YEAR)
	const [uploading, setUploading] = useState(false)
	const [uploadErrors, setUploadErrors] = useState<string[]>([])

	// ── Fetch ──────────────────────────────────────────────────────────

	const buildQuery = useCallback(() => {
		const params = new URLSearchParams()
		if (filterCategory !== 'ALL') params.set('exam_category', filterCategory)
		if (filterStatus !== 'ALL') params.set('status', filterStatus)
		else params.set('status', 'ALL')
		if (filterYear !== 'ALL') params.set('academic_year', filterYear)
		if (filterRole !== 'ALL') params.set('roles', filterRole)
		return params
	}, [filterCategory, filterStatus, filterYear, filterRole])

	const fetchEvents = useCallback(async () => {
		if (!isReady) return
		setLoading(true)
		try {
			const url = appendToUrl(`/api/coe-calendar?${buildQuery().toString()}`)
			const res = await fetch(url)
			const data = await res.json()
			setEvents(Array.isArray(data) ? data : [])
		} catch {
			toast({ title: 'Error', description: 'Failed to load events', variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}, [isReady, appendToUrl, buildQuery, toast])

	const fetchCategories = useCallback(async () => {
		if (!isReady) return
		try {
			// Inactive ones are needed too: the manager must be able to switch
			// them back on, and existing events may still reference them.
			const res = await fetch(appendToUrl('/api/coe-calendar/categories?include_inactive=true'))
			const data = await res.json()
			setCategories(Array.isArray(data) ? data : [])
		} catch {
			// Non-fatal: the static fallback in resolveCategoryStyle keeps the
			// table readable, only the dropdown options are reduced.
			setCategories([])
		}
	}, [isReady, appendToUrl])

	const fetchPrograms = useCallback(async () => {
		if (!isReady) return
		const instId = getInstitutionIdForCreate()
		// Programme codes are only unique within an institution, so there is
		// nothing meaningful to offer until one is selected.
		if (!instId) {
			setPrograms([])
			return
		}
		try {
			// appendToUrl supplies institution_code, which this route filters on
			// server-side; it returns newest-first, so sort for the picker.
			const res = await fetch(appendToUrl('/api/master/programs?is_active=true'))
			const json = await res.json()
			const rows = Array.isArray(json) ? json : json.data || []
			setPrograms(
				rows
					.map((p: ProgramOption) => ({
						program_code: p.program_code,
						program_name: p.program_name,
					}))
					.filter((p: ProgramOption) => p.program_code)
					.sort((a: ProgramOption, b: ProgramOption) =>
						a.program_code.localeCompare(b.program_code),
					),
			)
		} catch {
			setPrograms([])
		}
	}, [isReady, appendToUrl, getInstitutionIdForCreate])

	useEffect(() => { fetchEvents() }, [fetchEvents])
	useEffect(() => { fetchCategories() }, [fetchCategories])
	useEffect(() => { fetchPrograms() }, [fetchPrograms])

	// Reset paging whenever the result set changes underneath it.
	useEffect(() => { setPage(1) }, [filterCategory, filterStatus, filterYear, filterRole, search])

	// ── Derived ────────────────────────────────────────────────────────

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase()
		if (!term) return events
		return events.filter(e =>
			e.event_title.toLowerCase().includes(term)
			|| (e.event_description || '').toLowerCase().includes(term),
		)
	}, [events, search])

	const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
	const currentPage = Math.min(page, totalPages)
	const paged = useMemo(
		() => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
		[filtered, currentPage],
	)

	const stats = useMemo(() => {
		// Local calendar date — toISOString() is UTC and would report yesterday
		// until 05:30 IST.
		const now = new Date()
		const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
		const internal = filtered.filter(
			e => !e.visible_to_roles?.includes('ALL') && !e.visible_to_roles?.includes('LEARNERS'),
		).length
		const coeOnly = filtered.filter(
			e => e.visible_to_roles?.length === 1 && e.visible_to_roles[0] === 'COE_OFFICE',
		).length
		const upcoming = filtered.filter(e => e.event_end_date >= today).length
		return { total: filtered.length, upcoming, internal, coeOnly }
	}, [filtered])

	const categoryOptions = useMemo(() => {
		const active = categories.filter(c => c.is_active)
		const scopeId = form.institutions_id || getInstitutionIdForCreate() || null
		if (!scopeId) return []
		return active.filter(c => c.institutions_id === scopeId)
	}, [categories, form.institutions_id, getInstitutionIdForCreate])

	/** Filter toolbar: unique codes (same label across institutions after fan-out). */
	const filterCategoryOptions = useMemo(() => {
		const seen = new Set<string>()
		const options: { code: string; label: string }[] = []
		for (const c of categories) {
			if (!c.is_active || seen.has(c.code)) continue
			seen.add(c.code)
			options.push({ code: c.code, label: c.label })
		}
		return options
	}, [categories])

	// ── Form Helpers ───────────────────────────────────────────────────

	const resetForm = () => {
		setForm(EMPTY_FORM)
		setErrors({})
		setEditingEvent(null)
	}

	const openAdd = () => {
		resetForm()
		const instId = getInstitutionIdForCreate()
		setForm(prev => ({
			...prev,
			institutions_id: instId || '',
			academic_year: filterYear !== 'ALL' ? filterYear : DEFAULT_ACADEMIC_YEAR,
		}))
		setSheetOpen(true)
	}

	const openEdit = (event: CoeCalendarEvent) => {
		setEditingEvent(event)
		setForm({
			event_title: event.event_title,
			event_description: event.event_description || '',
			exam_category: event.exam_category,
			programme_type: event.programme_type,
			academic_year: event.academic_year,
			event_start_date: event.event_start_date,
			event_end_date: event.event_end_date,
			visible_to_roles: event.visible_to_roles?.length ? event.visible_to_roles : ['ALL'],
			program_codes: event.program_codes || [],
			status: event.status,
			institutions_id: event.institutions_id,
			institution_code: event.institution_code || '',
		})
		setErrors({})
		setSheetOpen(true)
	}

	/** Selecting a category pre-fills its default audience on new events. */
	const onCategoryChange = (code: string) => {
		const record = categoryOptions.find(c => c.code === code)
		setForm(prev => ({
			...prev,
			exam_category: code as CoeCalendarCategory,
			visible_to_roles: !editingEvent && record?.default_visible_to_roles?.length
				? record.default_visible_to_roles
				: prev.visible_to_roles,
		}))
	}

	// ── Validation ─────────────────────────────────────────────────────

	const validate = (): boolean => {
		const e: Record<string, string> = {}
		if (!form.event_title.trim()) e.event_title = 'Event title is required'
		if (!form.exam_category) e.exam_category = 'Category is required'
		if (!form.programme_type) e.programme_type = 'Programme type is required'
		if (!/^\d{4}-\d{4}$/.test(form.academic_year)) e.academic_year = 'Use the format 2025-2026'
		if (!form.event_start_date) e.event_start_date = 'Start date is required'
		if (!form.event_end_date) e.event_end_date = 'End date is required'
		if (form.event_start_date && form.event_end_date && form.event_end_date < form.event_start_date) {
			e.event_end_date = 'End date must be on or after start date'
		}
		if (!form.visible_to_roles?.length) e.visible_to_roles = 'Select at least one audience'
		if (!form.institutions_id) e.institutions_id = 'Institution is required'
		setErrors(e)
		return Object.keys(e).length === 0
	}

	// ── Save ───────────────────────────────────────────────────────────

	const handleSave = async () => {
		if (!validate()) return
		setSaving(true)
		try {
			const isEdit = !!editingEvent
			const url = isEdit ? `/api/coe-calendar/${editingEvent!.id}` : '/api/coe-calendar'
			const method = isEdit ? 'PUT' : 'POST'

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form),
			})
			const result = await res.json()

			if (!res.ok) {
				// Surface per-field errors from the API next to the fields.
				if (result.errors) setErrors(result.errors)
				toast({ title: 'Failed', description: result.error || 'Save failed', variant: 'destructive' })
				return
			}

			toast({
				title: isEdit ? 'Updated' : 'Created',
				description: `"${form.event_title}" ${isEdit ? 'updated' : 'added'} successfully`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			setSheetOpen(false)
			resetForm()
			fetchEvents()
		} catch {
			toast({ title: 'Error', description: 'Unexpected error', variant: 'destructive' })
		} finally {
			setSaving(false)
		}
	}

	// ── Delete ─────────────────────────────────────────────────────────

	const handleDelete = async () => {
		if (!deleteTarget) return
		setDeletingId(deleteTarget.id)
		try {
			const res = await fetch(`/api/coe-calendar/${deleteTarget.id}`, { method: 'DELETE' })
			if (!res.ok) {
				toast({ title: 'Failed', description: 'Could not delete event', variant: 'destructive' })
				return
			}
			toast({
				title: 'Deleted',
				description: `"${deleteTarget.event_title}" removed`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			fetchEvents()
		} catch {
			toast({ title: 'Error', description: 'Unexpected error', variant: 'destructive' })
		} finally {
			setDeletingId(null)
			setDeleteTarget(null)
		}
	}

	// ── Upload / Export ────────────────────────────────────────────────

	const handleUpload = async () => {
		if (!uploadFile) return
		const instId = getInstitutionIdForCreate()
		if (!instId) {
			toast({ title: 'Error', description: 'Please select an institution first', variant: 'destructive' })
			return
		}
		setUploading(true)
		setUploadErrors([])
		try {
			const fd = new FormData()
			fd.append('file', uploadFile)
			fd.append('institutions_id', instId)
			// Sent explicitly — imports used to be stamped with a hardcoded year.
			fd.append('academic_year', uploadYear)

			const res = await fetch('/api/coe-calendar/bulk-upload', { method: 'POST', body: fd })
			const result = await res.json()

			if (!res.ok) {
				if (Array.isArray(result.errors)) setUploadErrors(result.errors)
				toast({
					title: 'Upload Failed',
					description: Array.isArray(result.errors)
						? `${result.errors.length} row(s) need attention`
						: result.error || 'Upload failed',
					variant: 'destructive',
				})
				return
			}

			toast({
				title: 'Uploaded',
				description: `${result.inserted} events imported into ${uploadYear}`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			setUploadSheetOpen(false)
			setUploadFile(null)
			fetchEvents()
		} catch {
			toast({ title: 'Error', description: 'Upload failed', variant: 'destructive' })
		} finally {
			setUploading(false)
		}
	}

	const handleTemplateDownload = () => {
		window.open(appendToUrl('/api/coe-calendar/template'), '_blank')
	}

	const handleExport = () => {
		const params = buildQuery()
		if (search.trim()) params.set('search', search.trim())
		window.open(appendToUrl(`/api/coe-calendar/export?${params.toString()}`), '_blank')
	}

	// ── Render ─────────────────────────────────────────────────────────

	const fmtDate = (iso: string) =>
		new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
			day: '2-digit', month: 'short', year: 'numeric',
		})

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeaderWhite />
				<div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">

					{/* Header */}
					<div className="flex items-start justify-between gap-4 flex-wrap">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
								<CalendarDays className="h-5 w-5 text-white" />
							</div>
							<div>
								<h1 className="text-2xl font-bold text-slate-900 dark:text-white">COE Calendar</h1>
								<p className="text-sm text-slate-500 dark:text-slate-400">
									Examination milestones and internal deadlines
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2 flex-wrap">
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button variant="outline" size="sm" onClick={fetchEvents} className="h-8 w-8 p-0">
											<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
										</Button>
									</TooltipTrigger>
									<TooltipContent>Refresh Events</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<Button variant="outline" size="sm" onClick={() => setCategoryDialogOpen(true)}>
								<Tags className="h-4 w-4 mr-1.5" />
								Categories
							</Button>

							<Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
								<Download className="h-4 w-4 mr-1.5" />
								Export
							</Button>

							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" size="sm">
										<FileSpreadsheet className="h-4 w-4 mr-1.5" />
										Import
										<ChevronDown className="h-3 w-3 ml-1" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onClick={handleTemplateDownload}>
										<Download className="h-4 w-4 mr-2" />
										Download Template
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={() => setUploadSheetOpen(true)}>
										<Upload className="h-4 w-4 mr-2" />
										Upload Excel
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>

							<Button
								size="sm"
								onClick={openAdd}
								className="bg-emerald-600 hover:bg-emerald-700 text-white"
							>
								<Plus className="h-4 w-4 mr-1.5" /> Add Event
							</Button>
						</div>
					</div>

					{/* Scorecards */}
					<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
						{[
							{ label: 'Total Events', value: stats.total, accent: 'text-slate-900 dark:text-white' },
							{ label: 'Upcoming', value: stats.upcoming, accent: 'text-emerald-600 dark:text-emerald-400' },
							{ label: 'Hidden from Learners', value: stats.internal, accent: 'text-amber-600 dark:text-amber-400' },
							{ label: 'COE Office Only', value: stats.coeOnly, accent: 'text-indigo-600 dark:text-indigo-400' },
						].map(card => (
							<div
								key={card.label}
								className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-white dark:bg-transparent"
							>
								<p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
								<p className={cn('text-2xl font-bold mt-1 tabular-nums', card.accent)}>
									{loading ? '—' : card.value}
								</p>
							</div>
						))}
					</div>

					{/* Toolbar */}
					<div className="flex gap-3 flex-wrap items-center">
						<div className="relative flex-1 min-w-[220px] max-w-sm">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
							<Input
								value={search}
								onChange={e => setSearch(e.target.value)}
								placeholder="Search events..."
								className="pl-8 pr-8"
							/>
							{search && (
								<button
									type="button"
									onClick={() => setSearch('')}
									className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
									aria-label="Clear search"
								>
									<X className="h-4 w-4" />
								</button>
							)}
						</div>

						<Select value={filterCategory} onValueChange={setFilterCategory}>
							<SelectTrigger className="w-[180px]">
								<SelectValue placeholder="All Categories" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ALL">All Categories</SelectItem>
								{filterCategoryOptions.map(cat => (
									<SelectItem key={cat.code} value={cat.code}>{cat.label}</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select value={filterRole} onValueChange={setFilterRole}>
							<SelectTrigger className="w-[170px]">
								<SelectValue placeholder="Visible To" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ALL">Any Audience</SelectItem>
								{COE_ROLE_TAGS.filter(t => t !== 'ALL').map(tag => (
									<SelectItem key={tag} value={tag}>
										{COE_ROLE_TAG_CONFIG[tag].label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						<Select value={filterStatus} onValueChange={setFilterStatus}>
							<SelectTrigger className="w-[140px]">
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ALL">All Status</SelectItem>
								<SelectItem value="ACTIVE">Active</SelectItem>
								<SelectItem value="INACTIVE">Inactive</SelectItem>
							</SelectContent>
						</Select>

						<Select value={filterYear} onValueChange={setFilterYear}>
							<SelectTrigger className="w-[160px]">
								<SelectValue placeholder="Academic Year" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ALL">All Years</SelectItem>
								{ACADEMIC_YEARS.map(year => (
									<SelectItem key={year} value={year}>{year}</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Table */}
					<div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow className="bg-slate-50 dark:bg-white/5">
										<TableHead className="w-10 text-xs text-slate-500">#</TableHead>
										<TableHead className="text-xs text-slate-500">Event Title</TableHead>
										<TableHead className="text-xs text-slate-500">Category</TableHead>
										<TableHead className="text-xs text-slate-500">Programme</TableHead>
									<TableHead className="text-xs text-slate-500">Programmes</TableHead>
										<TableHead className="text-xs text-slate-500">From</TableHead>
										<TableHead className="text-xs text-slate-500">To</TableHead>
										<TableHead className="text-xs text-slate-500">Visible To</TableHead>
										<TableHead className="text-xs text-slate-500">Year</TableHead>
										<TableHead className="text-xs text-slate-500">Status</TableHead>
										<TableHead className="text-xs text-right text-slate-500">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{loading ? (
										<TableRow>
											<TableCell colSpan={11} className="text-center py-12 text-slate-400">
												Loading...
											</TableCell>
										</TableRow>
									) : paged.length === 0 ? (
										<TableRow>
											<TableCell colSpan={11} className="text-center py-16">
												<div className="flex flex-col items-center gap-2">
													<CalendarDays className="h-10 w-10 text-slate-300" />
													<p className="text-sm text-slate-400">
														{search ? `No events match "${search}"` : 'No calendar events found'}
													</p>
												</div>
											</TableCell>
										</TableRow>
									) : (
										paged.map((event, idx) => {
											const style = resolveCategoryStyle(
												event.exam_category,
												categories,
												event.institutions_id,
											)
											return (
												<TableRow
													key={event.id}
													className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"
												>
													<TableCell className="text-slate-400 text-sm">
														{(currentPage - 1) * PAGE_SIZE + idx + 1}
													</TableCell>
													<TableCell className="font-medium text-sm text-slate-900 dark:text-white max-w-[240px]">
														<span className="line-clamp-1" title={event.event_title}>
															{event.event_title}
														</span>
													</TableCell>
													<TableCell>
														<Badge className={cn('text-xs border-0', style.bgColor, style.textColor)}>
															{style.label}
														</Badge>
													</TableCell>
													<TableCell className="text-slate-600 dark:text-slate-400 text-sm">
														{event.programme_type}
													</TableCell>
													<TableCell className="max-w-[190px]">
														{event.program_codes?.length ? (
															<div className="flex flex-wrap gap-1">
																{event.program_codes.map(code => (
																	<Badge
																		key={code}
																		className="bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 border-0 text-xs"
																	>
																		{code}
																	</Badge>
																))}
															</div>
														) : (
															<span className="text-xs text-slate-400">All</span>
														)}
													</TableCell>
													<TableCell className="text-slate-600 dark:text-slate-400 text-sm whitespace-nowrap">
														{fmtDate(event.event_start_date)}
													</TableCell>
													<TableCell className="text-slate-600 dark:text-slate-400 text-sm whitespace-nowrap">
														{fmtDate(event.event_end_date)}
													</TableCell>
													<TableCell className="max-w-[240px]">
														<RoleTagChips tags={event.visible_to_roles} />
													</TableCell>
													<TableCell className="text-slate-500 text-sm whitespace-nowrap">
														{event.academic_year}
													</TableCell>
													<TableCell>
														<Badge
															className={event.status === 'ACTIVE'
																? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-0 text-xs'
																: 'bg-slate-100 text-slate-500 dark:bg-slate-500/20 dark:text-slate-400 border-0 text-xs'
															}
														>
															{event.status}
														</Badge>
													</TableCell>
													<TableCell className="text-right">
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button
																	variant="ghost"
																	size="sm"
																	className="h-7 w-7 p-0"
																	disabled={deletingId === event.id}
																>
																	<MoreHorizontal className="h-4 w-4" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																<DropdownMenuItem onClick={() => openEdit(event)}>
																	<Pencil className="h-4 w-4 mr-2" />
																	Edit Event
																</DropdownMenuItem>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	className="text-destructive focus:text-destructive"
																	onClick={() => setDeleteTarget(event)}
																>
																	<Trash2 className="h-4 w-4 mr-2" />
																	Delete Event
																</DropdownMenuItem>
															</DropdownMenuContent>
														</DropdownMenu>
													</TableCell>
												</TableRow>
											)
										})
									)}
								</TableBody>
							</Table>
						</div>

						{/* Pagination */}
						{!loading && filtered.length > 0 && (
							<div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/10">
								<p className="text-xs text-slate-500 dark:text-slate-400">
									Showing {(currentPage - 1) * PAGE_SIZE + 1}–
									{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
								</p>
								<div className="flex items-center gap-1">
									<Button
										variant="outline"
										size="sm"
										className="h-7 w-7 p-0"
										disabled={currentPage <= 1}
										onClick={() => setPage(p => Math.max(1, p - 1))}
									>
										<ChevronLeft className="h-4 w-4" />
									</Button>
									<span className="text-xs text-slate-500 px-2 tabular-nums">
										{currentPage} / {totalPages}
									</span>
									<Button
										variant="outline"
										size="sm"
										className="h-7 w-7 p-0"
										disabled={currentPage >= totalPages}
										onClick={() => setPage(p => Math.min(totalPages, p + 1))}
									>
										<ChevronRight className="h-4 w-4" />
									</Button>
								</div>
							</div>
						)}
					</div>
				</div>

				{/* ── Add / Edit Sheet ───────────────────────────────────────── */}
				<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
					<SheetContent className="sm:max-w-[600px] overflow-y-auto">
						<SheetHeader>
							<SheetTitle>
								{editingEvent ? 'Edit Calendar Event' : 'Add Calendar Event'}
							</SheetTitle>
						</SheetHeader>

						<div className="space-y-5 py-6">
							{/* Event Title */}
							<div className="space-y-1.5">
								<Label htmlFor="event_title">
									Event Title <span className="text-red-500">*</span>
								</Label>
								<Input
									id="event_title"
									value={form.event_title}
									onChange={e => setForm(prev => ({ ...prev, event_title: e.target.value }))}
									placeholder="e.g. CIA-I Commencement"
								/>
								{errors.event_title && (
									<p className="text-xs text-red-500">{errors.event_title}</p>
								)}
							</div>

							{/* Category */}
							<div className="space-y-1.5">
								<Label>
									Category <span className="text-red-500">*</span>
								</Label>
								<Select value={form.exam_category} onValueChange={onCategoryChange}>
									<SelectTrigger>
										<SelectValue placeholder="Select category" />
									</SelectTrigger>
									<SelectContent>
										{categoryOptions.map(cat => (
											<SelectItem key={cat.id} value={cat.code}>
												<span className="flex items-center gap-2">
													<span
														className="h-2 w-2 rounded-full"
														style={{ backgroundColor: cat.color_code }}
													/>
													{cat.label}
												</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{categoryOptions.length === 0 && (
									<p className="text-xs text-slate-400">
										{form.institutions_id
											? 'No categories for this institution yet. Add some via Manage Categories.'
											: 'Select an institution first.'}
									</p>
								)}
								{errors.exam_category && (
									<p className="text-xs text-red-500">{errors.exam_category}</p>
								)}
							</div>

							{/* Visible To */}
							<div className="space-y-1.5">
								<Label>
									Visible To <span className="text-red-500">*</span>
								</Label>
								<RoleTagPicker
									value={form.visible_to_roles}
									onChange={tags => setForm(prev => ({ ...prev, visible_to_roles: tags }))}
								/>
								<p className="text-xs text-slate-500 dark:text-slate-400">
									Controls who sees this event in MyJKKN. Internal deadlines should exclude Learners.
								</p>
								{errors.visible_to_roles && (
									<p className="text-xs text-red-500">{errors.visible_to_roles}</p>
								)}
							</div>

							{/* Programmes */}
							<div className="space-y-1.5">
								<Label>Programmes</Label>
								<ProgramPicker
									value={form.program_codes}
									options={programs}
									onChange={codes => setForm(prev => ({ ...prev, program_codes: codes }))}
								/>
								<p className="text-xs text-slate-500 dark:text-slate-400">
									Leave empty to apply to every programme. Pick codes to target
									specific ones, e.g. a B.Pharm-only practical.
								</p>
							</div>

							{/* Programme Type */}
							<div className="space-y-1.5">
								<Label>
									Programme Type <span className="text-red-500">*</span>
								</Label>
								<Select
									value={form.programme_type}
									onValueChange={val =>
										setForm(prev => ({ ...prev, programme_type: val as CoeCalendarProgrammeType }))
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select programme" />
									</SelectTrigger>
									<SelectContent>
										{COE_PROGRAMME_TYPES.map(p => (
											<SelectItem key={p} value={p}>{p}</SelectItem>
										))}
									</SelectContent>
								</Select>
								{errors.programme_type && (
									<p className="text-xs text-red-500">{errors.programme_type}</p>
								)}
							</div>

							{/* Academic Year */}
							<div className="space-y-1.5">
								<Label>Academic Year <span className="text-red-500">*</span></Label>
								<Select
									value={form.academic_year}
									onValueChange={val => setForm(prev => ({ ...prev, academic_year: val }))}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select year" />
									</SelectTrigger>
									<SelectContent>
										{ACADEMIC_YEARS.map(year => (
											<SelectItem key={year} value={year}>{year}</SelectItem>
										))}
									</SelectContent>
								</Select>
								{errors.academic_year && (
									<p className="text-xs text-red-500">{errors.academic_year}</p>
								)}
							</div>

							{/* Date Range */}
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<Label htmlFor="start_date">
										Start Date <span className="text-red-500">*</span>
									</Label>
									<Input
										id="start_date"
										type="date"
										value={form.event_start_date}
										onChange={e =>
											setForm(prev => ({ ...prev, event_start_date: e.target.value }))
										}
									/>
									{errors.event_start_date && (
										<p className="text-xs text-red-500">{errors.event_start_date}</p>
									)}
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="end_date">
										End Date <span className="text-red-500">*</span>
									</Label>
									<Input
										id="end_date"
										type="date"
										min={form.event_start_date || undefined}
										value={form.event_end_date}
										onChange={e =>
											setForm(prev => ({ ...prev, event_end_date: e.target.value }))
										}
									/>
									{errors.event_end_date && (
										<p className="text-xs text-red-500">{errors.event_end_date}</p>
									)}
								</div>
							</div>

							{/* Description */}
							<div className="space-y-1.5">
								<Label htmlFor="description">Description</Label>
								<Textarea
									id="description"
									value={form.event_description}
									onChange={e =>
										setForm(prev => ({ ...prev, event_description: e.target.value }))
									}
									placeholder="Optional details..."
									rows={3}
								/>
							</div>

							{/* Status */}
							<div className="space-y-1.5">
								<Label>Status</Label>
								<Select
									value={form.status}
									onValueChange={val =>
										setForm(prev => ({ ...prev, status: val as CoeCalendarStatus }))
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="ACTIVE">Active</SelectItem>
										<SelectItem value="INACTIVE">Inactive</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						<SheetFooter>
							<Button variant="outline" onClick={() => setSheetOpen(false)}>
								Cancel
							</Button>
							<Button
								onClick={handleSave}
								disabled={saving}
								className="bg-emerald-600 hover:bg-emerald-700 text-white"
							>
								{saving ? 'Saving...' : editingEvent ? 'Update Event' : 'Create Event'}
							</Button>
						</SheetFooter>
					</SheetContent>
				</Sheet>

				{/* ── Upload Sheet ───────────────────────────────────────────── */}
				<Sheet
					open={uploadSheetOpen}
					onOpenChange={(o) => {
						if (!o) { setUploadFile(null); setUploadErrors([]) }
						setUploadSheetOpen(o)
					}}
				>
					<SheetContent className="sm:max-w-[520px] overflow-y-auto">
						<SheetHeader>
							<SheetTitle>Bulk Upload Calendar Events</SheetTitle>
						</SheetHeader>
						<div className="space-y-5 py-6">
							<p className="text-sm text-slate-500 dark:text-slate-400">
								Upload an Excel file using the template format. Re-uploading is safe —
								rows matching an existing category, title and start date are updated
								rather than duplicated.
							</p>

							<Button
								variant="outline"
								size="sm"
								onClick={handleTemplateDownload}
								className="w-full"
							>
								<Download className="h-4 w-4 mr-2" /> Download Template
							</Button>

							<div className="space-y-1.5">
								<Label>Import Into Academic Year <span className="text-red-500">*</span></Label>
								<Select value={uploadYear} onValueChange={setUploadYear}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ACADEMIC_YEARS.map(year => (
											<SelectItem key={year} value={year}>{year}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-1.5">
								<Label>Select Excel File (.xlsx)</Label>
								<Input
									type="file"
									accept=".xlsx,.xls"
									onChange={e => {
										setUploadFile(e.target.files?.[0] || null)
										setUploadErrors([])
									}}
								/>
							</div>

							{uploadFile && (
								<p className="text-sm text-emerald-600 dark:text-emerald-400">
									Selected: {uploadFile.name}
								</p>
							)}

							{uploadErrors.length > 0 && (
								<div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3">
									<p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
										{uploadErrors.length} row{uploadErrors.length !== 1 ? 's' : ''} need attention
									</p>
									<ul className="space-y-1 max-h-52 overflow-y-auto">
										{uploadErrors.map((err, i) => (
											<li key={i} className="text-xs text-red-600 dark:text-red-300">{err}</li>
										))}
									</ul>
								</div>
							)}
						</div>
						<SheetFooter>
							<Button variant="outline" onClick={() => setUploadSheetOpen(false)}>
								Cancel
							</Button>
							<Button
								onClick={handleUpload}
								disabled={!uploadFile || uploading}
								className="bg-emerald-600 hover:bg-emerald-700 text-white"
							>
								{uploading ? 'Uploading...' : 'Upload & Import'}
							</Button>
						</SheetFooter>
					</SheetContent>
				</Sheet>

				{/* ── Category Manager ───────────────────────────────────────── */}
				<CategoryManagerDialog
					open={categoryDialogOpen}
					onOpenChange={setCategoryDialogOpen}
					categories={categories}
					institutionsId={getInstitutionIdForCreate() || null}
					institutionLabels={institutionLabels}
					onChanged={fetchCategories}
				/>

				{/* ── Delete Confirmation Dialog ──────────────────────────────── */}
				<AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete Event?</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to delete &quot;{deleteTarget?.event_title}&quot;?
								This action cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								onClick={handleDelete}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
