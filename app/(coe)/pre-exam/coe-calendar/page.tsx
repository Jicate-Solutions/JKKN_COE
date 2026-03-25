'use client'

import { useState, useEffect, useCallback } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeaderWhite } from '@/components/layout/app-header-white'
import { AppFooter } from '@/components/layout/app-footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import { Plus, Upload, Download, Pencil, Trash2, CalendarDays, RefreshCw, MoreHorizontal, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
	CoeCalendarEvent,
	CoeCalendarFormData,
	CoeCalendarCategory,
	CoeCalendarProgrammeType,
	CoeCalendarStatus,
	COE_CATEGORY_CONFIG,
	COE_CATEGORIES,
	COE_PROGRAMME_TYPES,
} from '@/types/coe-calendar'

// ── Constants ────────────────────────────────────────────────────────

const EMPTY_FORM: CoeCalendarFormData = {
	event_title: '',
	event_description: '',
	exam_category: '',
	programme_type: 'BOTH',
	academic_year: '2025-2026',
	event_start_date: '',
	event_end_date: '',
	status: 'ACTIVE',
	institutions_id: '',
	institution_code: '',
}

// ── Page ─────────────────────────────────────────────────────────────

export default function CoeCalendarPage() {
	const { toast } = useToast()
	const { isReady, appendToUrl, getInstitutionIdForCreate } = useInstitutionFilter()

	const [events, setEvents] = useState<CoeCalendarEvent[]>([])
	const [loading, setLoading] = useState(false)
	const [sheetOpen, setSheetOpen] = useState(false)
	const [uploadSheetOpen, setUploadSheetOpen] = useState(false)
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

	// Upload
	const [uploadFile, setUploadFile] = useState<File | null>(null)
	const [uploading, setUploading] = useState(false)

	// ── Fetch ──────────────────────────────────────────────────────────

	const fetchEvents = useCallback(async () => {
		if (!isReady) return
		setLoading(true)
		try {
			const params = new URLSearchParams()
			if (filterCategory !== 'ALL') params.set('exam_category', filterCategory)
			if (filterStatus !== 'ALL') params.set('status', filterStatus)
			if (filterYear !== 'ALL') params.set('academic_year', filterYear)
			const url = appendToUrl(`/api/coe-calendar?${params.toString()}`)
			const res = await fetch(url)
			const data = await res.json()
			setEvents(Array.isArray(data) ? data : [])
		} catch {
			toast({ title: 'Error', description: 'Failed to load events', variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}, [isReady, appendToUrl, filterCategory, filterStatus, filterYear, toast])

	useEffect(() => { fetchEvents() }, [fetchEvents])

	// ── Form Helpers ───────────────────────────────────────────────────

	const resetForm = () => {
		setForm(EMPTY_FORM)
		setErrors({})
		setEditingEvent(null)
	}

	const openAdd = () => {
		resetForm()
		const instId = getInstitutionIdForCreate()
		setForm(prev => ({ ...prev, institutions_id: instId || '' }))
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
			status: event.status,
			institutions_id: event.institutions_id,
			institution_code: event.institution_code || '',
		})
		setErrors({})
		setSheetOpen(true)
	}

	// ── Validation ─────────────────────────────────────────────────────

	const validate = (): boolean => {
		const e: Record<string, string> = {}
		if (!form.event_title.trim()) e.event_title = 'Event title is required'
		if (!form.exam_category) e.exam_category = 'Category is required'
		if (!form.programme_type) e.programme_type = 'Programme type is required'
		if (!form.event_start_date) e.event_start_date = 'Start date is required'
		if (!form.event_end_date) e.event_end_date = 'End date is required'
		if (form.event_start_date && form.event_end_date && form.event_end_date < form.event_start_date) {
			e.event_end_date = 'End date must be on or after start date'
		}
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

	// ── Upload ─────────────────────────────────────────────────────────

	const handleUpload = async () => {
		if (!uploadFile) return
		const instId = getInstitutionIdForCreate()
		if (!instId) {
			toast({ title: 'Error', description: 'Please select an institution first', variant: 'destructive' })
			return
		}
		setUploading(true)
		try {
			const fd = new FormData()
			fd.append('file', uploadFile)
			const res = await fetch(`/api/coe-calendar/bulk-upload?institutions_id=${instId}`, {
				method: 'POST',
				body: fd,
			})
			const result = await res.json()
			if (!res.ok) {
				const errMsg = Array.isArray(result.errors)
					? result.errors.slice(0, 5).join('\n')
					: result.error || 'Upload failed'
				toast({ title: 'Upload Failed', description: errMsg, variant: 'destructive' })
				return
			}
			toast({
				title: 'Uploaded',
				description: `${result.inserted} events imported successfully`,
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
		window.open('/api/coe-calendar/template', '_blank')
	}

	// ── Render ─────────────────────────────────────────────────────────

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
								<p className="text-sm text-slate-500 dark:text-slate-400">{events.length} events</p>
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
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline" size="sm">
										<Download className="h-4 w-4 mr-1.5" />
										Export
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

					{/* Filters */}
					<div className="flex gap-3 flex-wrap">
						<Select value={filterCategory} onValueChange={setFilterCategory}>
							<SelectTrigger className="w-[180px]">
								<SelectValue placeholder="All Categories" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ALL">All Categories</SelectItem>
								{COE_CATEGORIES.map(cat => (
									<SelectItem key={cat} value={cat}>
										{COE_CATEGORY_CONFIG[cat].label}
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
								<SelectItem value="2025-2026">2025-2026</SelectItem>
								<SelectItem value="2024-2025">2024-2025</SelectItem>
								<SelectItem value="2026-2027">2026-2027</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Table */}
					<div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow className="bg-slate-50 dark:bg-white/5">
									<TableHead className="w-10 text-xs text-slate-500">#</TableHead>
									<TableHead className="text-xs text-slate-500">Event Title</TableHead>
									<TableHead className="text-xs text-slate-500">Category</TableHead>
									<TableHead className="text-xs text-slate-500">Programme</TableHead>
									<TableHead className="text-xs text-slate-500">From</TableHead>
									<TableHead className="text-xs text-slate-500">To</TableHead>
									<TableHead className="text-xs text-slate-500">Year</TableHead>
									<TableHead className="text-xs text-slate-500">Status</TableHead>
									<TableHead className="text-xs text-right text-slate-500">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{loading ? (
									<TableRow>
										<TableCell colSpan={9} className="text-center py-12 text-slate-400">
											Loading...
										</TableCell>
									</TableRow>
								) : events.length === 0 ? (
									<TableRow>
										<TableCell colSpan={9} className="text-center py-16">
											<div className="flex flex-col items-center gap-2">
												<CalendarDays className="h-10 w-10 text-slate-300" />
												<p className="text-sm text-slate-400">No calendar events found</p>
											</div>
										</TableCell>
									</TableRow>
								) : (
									events.map((event, idx) => {
										const config = COE_CATEGORY_CONFIG[event.exam_category as CoeCalendarCategory]
										return (
											<TableRow
												key={event.id}
												className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"
											>
												<TableCell className="text-slate-400 text-sm">{idx + 1}</TableCell>
												<TableCell className="font-medium text-sm text-slate-900 dark:text-white max-w-[220px]">
													<span className="line-clamp-1" title={event.event_title}>
														{event.event_title}
													</span>
												</TableCell>
												<TableCell>
													<Badge
														className={cn('text-xs border-0', config.bgColor, config.textColor)}
													>
														{config.label}
													</Badge>
												</TableCell>
												<TableCell className="text-slate-600 dark:text-slate-400 text-sm">
													{event.programme_type}
												</TableCell>
												<TableCell className="text-slate-600 dark:text-slate-400 text-sm">
													{new Date(event.event_start_date + 'T00:00:00').toLocaleDateString('en-IN', {
														day: '2-digit', month: 'short', year: 'numeric'
													})}
												</TableCell>
												<TableCell className="text-slate-600 dark:text-slate-400 text-sm">
													{new Date(event.event_end_date + 'T00:00:00').toLocaleDateString('en-IN', {
														day: '2-digit', month: 'short', year: 'numeric'
													})}
												</TableCell>
												<TableCell className="text-slate-500 text-sm">{event.academic_year}</TableCell>
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
								<Select
									value={form.exam_category}
									onValueChange={val =>
										setForm(prev => ({ ...prev, exam_category: val as CoeCalendarCategory }))
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select category" />
									</SelectTrigger>
									<SelectContent>
										{COE_CATEGORIES.map(cat => (
											<SelectItem key={cat} value={cat}>
												{COE_CATEGORY_CONFIG[cat].label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{errors.exam_category && (
									<p className="text-xs text-red-500">{errors.exam_category}</p>
								)}
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
								<Label htmlFor="academic_year">Academic Year</Label>
								<Input
									id="academic_year"
									value={form.academic_year}
									onChange={e =>
										setForm(prev => ({ ...prev, academic_year: e.target.value }))
									}
									placeholder="2025-2026"
								/>
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
					onOpenChange={(o) => { if (!o) setUploadFile(null); setUploadSheetOpen(o) }}
				>
					<SheetContent className="sm:max-w-[480px]">
						<SheetHeader>
							<SheetTitle>Bulk Upload Calendar Events</SheetTitle>
						</SheetHeader>
						<div className="space-y-5 py-6">
							<p className="text-sm text-slate-500 dark:text-slate-400">
								Upload an Excel file using the template format. Download the template first if needed.
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
								<Label>Select Excel File (.xlsx)</Label>
								<Input
									type="file"
									accept=".xlsx,.xls"
									onChange={e => setUploadFile(e.target.files?.[0] || null)}
								/>
							</div>
							{uploadFile && (
								<p className="text-sm text-emerald-600 dark:text-emerald-400">
									Selected: {uploadFile.name}
								</p>
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
