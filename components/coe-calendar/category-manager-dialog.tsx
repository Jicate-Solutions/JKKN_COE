'use client'

import { useState, useEffect, useCallback } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/common/use-toast'
import { Plus, Pencil, Trash2, Tags, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CoeCalendarCategoryRecord } from '@/types/coe-calendar'
import type { CoeRoleTag } from '@/lib/coe-calendar/visibility'
import { RoleTagPicker, RoleTagChips } from './role-tag-picker'

interface CategoryForm {
	code: string
	label: string
	description: string
	color_code: string
	default_visible_to_roles: CoeRoleTag[]
	sort_order: number
	is_active: boolean
}

const EMPTY_FORM: CategoryForm = {
	code: '',
	label: '',
	description: '',
	color_code: '#3B82F6',
	default_visible_to_roles: ['ALL'],
	sort_order: 0,
	is_active: true,
}

export function CategoryManagerDialog({
	open,
	onOpenChange,
	categories,
	institutionsId,
	institutionLabels,
	onChanged,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	categories: CoeCalendarCategoryRecord[]
	institutionsId: string | null
	/** Map of institution id → display name, used when viewing all institutions. */
	institutionLabels?: Record<string, string>
	onChanged: () => void
}) {
	const { toast } = useToast()

	const [mode, setMode] = useState<'list' | 'form'>('list')
	const [editing, setEditing] = useState<CoeCalendarCategoryRecord | null>(null)
	const [form, setForm] = useState<CategoryForm>(EMPTY_FORM)
	const [errors, setErrors] = useState<Record<string, string>>({})
	const [saving, setSaving] = useState(false)
	const [busyId, setBusyId] = useState<string | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<CoeCalendarCategoryRecord | null>(null)

	// Always reopen on the list — otherwise a half-filled form reappears later.
	useEffect(() => {
		if (open) {
			setMode('list')
			setEditing(null)
			setErrors({})
		}
	}, [open])

	const openCreate = () => {
		setEditing(null)
		setForm({
			...EMPTY_FORM,
			sort_order: (categories.reduce((max, c) => Math.max(max, c.sort_order), 0) || 0) + 10,
		})
		setErrors({})
		setMode('form')
	}

	const openEdit = (category: CoeCalendarCategoryRecord) => {
		setEditing(category)
		setForm({
			code: category.code,
			label: category.label,
			description: category.description || '',
			color_code: category.color_code || '#3B82F6',
			default_visible_to_roles: category.default_visible_to_roles?.length
				? category.default_visible_to_roles
				: ['ALL'],
			sort_order: category.sort_order,
			is_active: category.is_active,
		})
		setErrors({})
		setMode('form')
	}

	const validate = (): boolean => {
		const e: Record<string, string> = {}
		if (!editing) {
			if (!form.code.trim()) e.code = 'Code is required'
			else if (!/^[A-Z][A-Z0-9_]*$/.test(form.code.trim().toUpperCase().replace(/[\s-]+/g, '_'))) {
				e.code = 'Use letters, numbers and underscores, starting with a letter'
			} else if (categories.some(c => c.code === form.code.trim().toUpperCase().replace(/[\s-]+/g, '_'))) {
				e.code = 'That code already exists'
			}
		}
		if (!form.label.trim()) e.label = 'Label is required'
		if (!/^#[0-9a-fA-F]{6}$/.test(form.color_code)) e.color_code = 'Pick a colour'
		if (!form.default_visible_to_roles.length) e.default_visible_to_roles = 'Select at least one audience'
		if (!editing && !institutionsId) {
			e.institution = 'Select a specific institution before adding a category'
		}
		setErrors(e)
		return Object.keys(e).length === 0
	}

	const handleSave = async () => {
		if (!validate()) return
		setSaving(true)
		try {
			const payload = {
				code: form.code.trim().toUpperCase().replace(/[\s-]+/g, '_'),
				label: form.label.trim(),
				description: form.description.trim(),
				color_code: form.color_code,
				default_visible_to_roles: form.default_visible_to_roles,
				sort_order: form.sort_order,
				// Institution is fixed at creation and never changes on edit
				// (leaving it undefined omits it from the PUT payload).
				institutions_id: editing ? undefined : institutionsId,
				is_active: form.is_active,
			}

			const res = await fetch(
				editing ? `/api/coe-calendar/categories/${editing.id}` : '/api/coe-calendar/categories',
				{
					method: editing ? 'PUT' : 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				},
			)
			const result = await res.json()

			if (!res.ok) {
				toast({ title: 'Failed', description: result.error || 'Save failed', variant: 'destructive' })
				return
			}

			toast({
				title: editing ? 'Category updated' : 'Category created',
				description: `"${payload.label}" saved`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			onChanged()
			setMode('list')
		} catch {
			toast({ title: 'Error', description: 'Unexpected error', variant: 'destructive' })
		} finally {
			setSaving(false)
		}
	}

	const toggleActive = useCallback(async (category: CoeCalendarCategoryRecord) => {
		setBusyId(category.id)
		try {
			const res = await fetch(`/api/coe-calendar/categories/${category.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_active: !category.is_active }),
			})
			if (!res.ok) {
				const result = await res.json()
				toast({ title: 'Failed', description: result.error || 'Could not update', variant: 'destructive' })
				return
			}
			onChanged()
		} catch {
			toast({ title: 'Error', description: 'Unexpected error', variant: 'destructive' })
		} finally {
			setBusyId(null)
		}
	}, [onChanged, toast])

	const handleDelete = async () => {
		if (!deleteTarget) return
		setBusyId(deleteTarget.id)
		try {
			const res = await fetch(`/api/coe-calendar/categories/${deleteTarget.id}`, { method: 'DELETE' })
			const result = await res.json().catch(() => ({}))
			if (!res.ok) {
				// 409 carries the in-use count, which is the useful part.
				toast({
					title: 'Cannot delete',
					description: result.error || 'Could not delete category',
					variant: 'destructive',
				})
				return
			}
			toast({
				title: 'Deleted',
				description: `"${deleteTarget.label}" removed`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			onChanged()
		} catch {
			toast({ title: 'Error', description: 'Unexpected error', variant: 'destructive' })
		} finally {
			setBusyId(null)
			setDeleteTarget(null)
		}
	}

	const sorted = [...categories].sort(
		(a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code),
	)

	// When viewing all institutions, group categories under each institution
	// so the same code (CIA_I, etc.) is clearly owned per campus.
	const groupedByInstitution = (() => {
		if (institutionsId) return null
		const groups = new Map<string, CoeCalendarCategoryRecord[]>()
		for (const cat of sorted) {
			const key = cat.institutions_id || '_unknown'
			const list = groups.get(key)
			if (list) list.push(cat)
			else groups.set(key, [cat])
		}
		return Array.from(groups.entries()).sort(([a], [b]) => {
			const labelA = institutionLabels?.[a] || a
			const labelB = institutionLabels?.[b] || b
			return labelA.localeCompare(labelB)
		})
	})()

	const renderCategoryRow = (category: CoeCalendarCategoryRecord) => (
		<div
			key={category.id}
			className={cn(
				'flex items-start gap-3 rounded-lg border p-3 transition-colors',
				'border-slate-200 dark:border-white/10',
				!category.is_active && 'opacity-55',
			)}
		>
			<span
				className="h-4 w-4 rounded-full mt-0.5 shrink-0 ring-2 ring-white dark:ring-slate-900"
				style={{ backgroundColor: category.color_code }}
			/>

			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 flex-wrap">
					<p className="text-sm font-medium text-slate-900 dark:text-white">
						{category.label}
					</p>
					<code className="text-xs text-slate-400">{category.code}</code>
				</div>
				{category.description && (
					<p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
						{category.description}
					</p>
				)}
				<div className="mt-1.5">
					<RoleTagChips tags={category.default_visible_to_roles} />
				</div>
			</div>

			<div className="flex items-center gap-1 shrink-0">
				<Switch
					checked={category.is_active}
					disabled={busyId === category.id}
					onCheckedChange={() => toggleActive(category)}
					aria-label={`${category.is_active ? 'Deactivate' : 'Activate'} ${category.label}`}
				/>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 w-7 p-0"
					onClick={() => openEdit(category)}
				>
					<Pencil className="h-3.5 w-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 w-7 p-0 text-destructive hover:text-destructive"
					disabled={busyId === category.id}
					onClick={() => setDeleteTarget(category)}
				>
					<Trash2 className="h-3.5 w-3.5" />
				</Button>
			</div>
		</div>
	)

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-hidden flex flex-col">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Tags className="h-5 w-5 text-emerald-600" />
							{mode === 'list'
								? 'Calendar Categories'
								: editing ? `Edit ${editing.code}` : 'New Category'}
						</DialogTitle>
						<DialogDescription>
							{mode === 'list'
								? 'Categories belong to one institution and set the default audience for new events.'
								: 'The default audience is applied to new events in this category, including Excel imports that leave Visible To blank.'}
						</DialogDescription>
					</DialogHeader>

					{mode === 'list' ? (
						<>
							<div className="flex-1 overflow-y-auto -mx-6 px-6">
								{!institutionsId && (
									<div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
										Select a specific institution to add or manage its categories.
										Categories below are grouped by institution.
									</div>
								)}
								<div className="space-y-2">
									{sorted.length === 0 && (
										<p className="text-sm text-slate-400 text-center py-10">
											No categories found.
										</p>
									)}
									{groupedByInstitution
										? groupedByInstitution.map(([instId, cats]) => (
											<div key={instId} className="space-y-2">
												<p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 pt-2 first:pt-0">
													{institutionLabels?.[instId] || instId}
													<span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">
														({cats.length})
													</span>
												</p>
												{cats.map(renderCategoryRow)}
											</div>
										))
										: sorted.map(renderCategoryRow)}
								</div>
							</div>

							<div className="flex justify-between items-center pt-3 border-t">
								<p className="text-xs text-slate-400">
									{sorted.length} categor{sorted.length === 1 ? 'y' : 'ies'}
								</p>
								<Button
									size="sm"
									onClick={openCreate}
									disabled={!institutionsId}
									title={!institutionsId ? 'Select a specific institution first' : undefined}
									className="bg-emerald-600 hover:bg-emerald-700 text-white"
								>
									<Plus className="h-4 w-4 mr-1.5" /> Add Category
								</Button>
							</div>
						</>
					) : (
						<>
							<div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-5 py-1">
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-1.5">
										<Label htmlFor="cat_code">
											Code <span className="text-red-500">*</span>
										</Label>
										<Input
											id="cat_code"
											value={form.code}
											disabled={!!editing}
											onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
											placeholder="COE_TASK"
											className="font-mono"
										/>
										{editing ? (
											<p className="text-xs text-slate-400">
												Code cannot change — events reference it.
											</p>
										) : (
											<p className="text-xs text-slate-400">
												Stable identifier used in Excel imports.
											</p>
										)}
										{errors.code && <p className="text-xs text-red-500">{errors.code}</p>}
									</div>

									<div className="space-y-1.5">
										<Label htmlFor="cat_label">
											Label <span className="text-red-500">*</span>
										</Label>
										<Input
											id="cat_label"
											value={form.label}
											onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
											placeholder="COE Task"
										/>
										{errors.label && <p className="text-xs text-red-500">{errors.label}</p>}
									</div>
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="cat_desc">Description</Label>
									<Textarea
										id="cat_desc"
										rows={2}
										value={form.description}
										onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
										placeholder="Shown in the Excel template reference sheet"
									/>
								</div>

								<div className="space-y-1.5">
									<Label>
										Default Audience <span className="text-red-500">*</span>
									</Label>
									<RoleTagPicker
										value={form.default_visible_to_roles}
										onChange={tags => setForm(p => ({ ...p, default_visible_to_roles: tags }))}
									/>
									<p className="text-xs text-slate-500 dark:text-slate-400">
										New events in this category start with this audience.
									</p>
									{errors.default_visible_to_roles && (
										<p className="text-xs text-red-500">{errors.default_visible_to_roles}</p>
									)}
								</div>

								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-1.5">
										<Label htmlFor="cat_color">
											Colour <span className="text-red-500">*</span>
										</Label>
										<div className="flex items-center gap-2">
											<input
												id="cat_color"
												type="color"
												value={form.color_code}
												onChange={e => setForm(p => ({ ...p, color_code: e.target.value }))}
												className="h-9 w-10 rounded-md border border-slate-200 dark:border-white/15 bg-transparent cursor-pointer"
											/>
											<Input
												value={form.color_code}
												onChange={e => setForm(p => ({ ...p, color_code: e.target.value }))}
												className="font-mono text-xs"
											/>
										</div>
										{errors.color_code && (
											<p className="text-xs text-red-500">{errors.color_code}</p>
										)}
									</div>

									<div className="space-y-1.5">
										<Label htmlFor="cat_sort">Sort Order</Label>
										<Input
											id="cat_sort"
											type="number"
											value={form.sort_order}
											onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))}
										/>
									</div>
								</div>

								<div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-white/10 p-3">
									<div>
										<p className="text-sm font-medium">Active</p>
										<p className="text-xs text-slate-500 dark:text-slate-400">
											Inactive categories are hidden from the event form and import template.
										</p>
									</div>
									<Switch
										checked={form.is_active}
										onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))}
									/>
								</div>
							</div>

							<div className="flex justify-between items-center pt-3 border-t">
								<Button variant="ghost" size="sm" onClick={() => setMode('list')}>
									<ArrowLeft className="h-4 w-4 mr-1.5" /> Back
								</Button>
								<div className="flex gap-2">
									<Button variant="outline" onClick={() => setMode('list')}>
										Cancel
									</Button>
									<Button
										onClick={handleSave}
										disabled={saving}
										className="bg-emerald-600 hover:bg-emerald-700 text-white"
									>
										{saving ? 'Saving...' : editing ? 'Update Category' : 'Create Category'}
									</Button>
								</div>
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>

			<AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null) }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete category?</AlertDialogTitle>
						<AlertDialogDescription>
							Delete &quot;{deleteTarget?.label}&quot;? Categories still in use by events
							cannot be deleted — deactivate them instead.
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
		</>
	)
}
