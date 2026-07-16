'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
	DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import {
	Loader2, MoreHorizontal, PlusCircle, Plus, X, Save, Trash2, FileText,
	CheckCircle2, Archive, Settings2, Search, RefreshCw,
} from 'lucide-react'
import type {
	IaPaperTemplate, IaTemplatePartFormData, IaQuestionType, ExamScope,
	CourseTypeApplicability, ProgramTypeApplicability,
} from '@/types/ia-question-paper'

interface Institution {
	id: string
	name: string
	institution_code: string
}

const emptyPart = (order: number): IaTemplatePartFormData => ({
	part_label: String.fromCharCode(64 + order), // A, B, C ...
	part_title: `PART ${String.fromCharCode(64 + order)}`,
	instruction: '',
	question_type_code: '',
	num_questions: '1',
	marks_per_question: '1',
	has_choice: false,
	choice_group_size: '1',
	option_count: '',
	capture_co: true,
	capture_klevel: true,
	display_order: String(order),
})

interface TemplateForm {
	template_code: string
	template_name: string
	description: string
	exam_scope: ExamScope
	course_type_applicability: CourseTypeApplicability
	program_type_applicability: ProgramTypeApplicability
	regulation_code: string
	duration_minutes: string
	capture_co: boolean
	capture_klevel: boolean
	wef_date: string
	is_default: boolean
	is_active: boolean
	parts: IaTemplatePartFormData[]
}

const emptyTemplateForm = (): TemplateForm => ({
	template_code: '',
	template_name: '',
	description: '',
	exam_scope: 'cia',
	course_type_applicability: 'all',
	program_type_applicability: 'all',
	regulation_code: '',
	duration_minutes: '60',
	capture_co: true,
	capture_klevel: true,
	wef_date: new Date().toISOString().slice(0, 10),
	is_default: false,
	is_active: true,
	parts: [emptyPart(1)],
})

interface TypeForm {
	type_code: string
	type_label: string
	description: string
	is_objective: boolean
	has_options: boolean
	default_option_count: string
	display_order: string
	is_active: boolean
}

const emptyTypeForm = (): TypeForm => ({
	type_code: '',
	type_label: '',
	description: '',
	is_objective: false,
	has_options: false,
	default_option_count: '',
	display_order: '1',
	is_active: true,
})

function partMax(p: IaTemplatePartFormData): number {
	return (parseInt(p.num_questions) || 0) * (parseFloat(p.marks_per_question) || 0)
}

export default function QuestionPaperTemplatesPage() {
	const { toast } = useToast()
	const { isReady, appendToUrl, mustSelectInstitution, institutionId, institutionCode } =
		useInstitutionFilter()

	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [localInstitutionId, setLocalInstitutionId] = useState('')
	const effectiveInstitutionId = institutionId || localInstitutionId || ''
	const effectiveInstitution = institutions.find(i => i.id === effectiveInstitutionId)
	const effectiveInstitutionCode = institutionCode || effectiveInstitution?.institution_code || ''

	const [templates, setTemplates] = useState<IaPaperTemplate[]>([])
	const [questionTypes, setQuestionTypes] = useState<IaQuestionType[]>([])
	const [loading, setLoading] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')

	// Template sheet
	const [sheetOpen, setSheetOpen] = useState(false)
	const [editingId, setEditingId] = useState<string | null>(null)
	const [form, setForm] = useState<TemplateForm>(emptyTemplateForm())
	const [saving, setSaving] = useState(false)

	// Type sheet
	const [typeSheetOpen, setTypeSheetOpen] = useState(false)
	const [typeEditingId, setTypeEditingId] = useState<string | null>(null)
	const [typeForm, setTypeForm] = useState<TypeForm>(emptyTypeForm())
	const [typeSaving, setTypeSaving] = useState(false)

	// ===== Data =====
	useEffect(() => {
		if (isReady) fetchInstitutions()
	}, [isReady])

	useEffect(() => {
		if (isReady && effectiveInstitutionCode) {
			fetchTemplates()
			fetchQuestionTypes()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isReady, institutionId, localInstitutionId, effectiveInstitutionCode])

	const fetchInstitutions = async () => {
		try {
			const url = appendToUrl('/api/pre-exam/internal-marks?action=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(
					(data || []).map((i: any) => ({
						id: i.id,
						name: i.name || i.institution_name,
						institution_code: i.institution_code,
					}))
				)
			}
		} catch (e) {
			console.error('Failed to fetch institutions:', e)
		}
	}

	const fetchTemplates = async () => {
		try {
			setLoading(true)
			const res = await fetch(
				`/api/pre-exam/question-paper-templates?institution_code=${encodeURIComponent(effectiveInstitutionCode)}`
			)
			if (res.ok) setTemplates(await res.json())
		} catch (e) {
			console.error('Failed to fetch templates:', e)
		} finally {
			setLoading(false)
		}
	}

	const fetchQuestionTypes = async () => {
		try {
			const res = await fetch(
				`/api/pre-exam/question-types?institution_code=${encodeURIComponent(effectiveInstitutionCode)}&include_inactive=true`
			)
			if (res.ok) setQuestionTypes(await res.json())
		} catch (e) {
			console.error('Failed to fetch question types:', e)
		}
	}

	const activeTypes = useMemo(() => questionTypes.filter(t => t.is_active), [questionTypes])

	// ===== Derived =====
	const filtered = useMemo(() => {
		if (!searchTerm) return templates
		const t = searchTerm.toLowerCase()
		return templates.filter(
			x =>
				x.template_name.toLowerCase().includes(t) ||
				x.template_code.toLowerCase().includes(t) ||
				(x.description || '').toLowerCase().includes(t)
		)
	}, [templates, searchTerm])

	const stats = useMemo(
		() => ({
			total: templates.length,
			active: templates.filter(t => t.status === 'active').length,
			defaults: templates.filter(t => t.is_default).length,
			types: activeTypes.length,
		}),
		[templates, activeTypes]
	)

	const formTotal = useMemo(() => form.parts.reduce((s, p) => s + partMax(p), 0), [form.parts])

	// ===== Template form handlers =====
	const openCreate = () => {
		setForm(emptyTemplateForm())
		setEditingId(null)
		setSheetOpen(true)
	}

	const openEdit = (t: IaPaperTemplate) => {
		setEditingId(t.id)
		setForm({
			template_code: t.template_code,
			template_name: t.template_name,
			description: t.description || '',
			exam_scope: t.exam_scope,
			course_type_applicability: t.course_type_applicability,
			program_type_applicability: t.program_type_applicability,
			regulation_code: t.regulation_code || '',
			duration_minutes: t.duration_minutes ? String(t.duration_minutes) : '',
			capture_co: t.capture_co,
			capture_klevel: t.capture_klevel,
			wef_date: t.wef_date ? t.wef_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
			is_default: t.is_default,
			is_active: t.is_active,
			parts:
				(t.ia_template_parts || [])
					.slice()
					.sort((a, b) => a.display_order - b.display_order)
					.map((p, i) => ({
						part_label: p.part_label,
						part_title: p.part_title || '',
						instruction: p.instruction || '',
						question_type_code: p.question_type_code,
						num_questions: String(p.num_questions),
						marks_per_question: String(p.marks_per_question),
						has_choice: p.has_choice,
						choice_group_size: String(p.choice_group_size),
						option_count: p.option_count != null ? String(p.option_count) : '',
						capture_co: p.capture_co,
						capture_klevel: p.capture_klevel,
						display_order: String(p.display_order || i + 1),
					})) || [emptyPart(1)],
		})
		setSheetOpen(true)
	}

	const updatePart = (index: number, patch: Partial<IaTemplatePartFormData>) => {
		setForm(prev => ({
			...prev,
			parts: prev.parts.map((p, i) => (i === index ? { ...p, ...patch } : p)),
		}))
	}

	const addPart = () => {
		setForm(prev => ({ ...prev, parts: [...prev.parts, emptyPart(prev.parts.length + 1)] }))
	}

	const removePart = (index: number) => {
		setForm(prev => ({
			...prev,
			parts: prev.parts
				.filter((_, i) => i !== index)
				.map((p, i) => ({ ...p, display_order: String(i + 1) })),
		}))
	}

	// When a part's type changes, prefill option_count from the type's default
	const onPartTypeChange = (index: number, code: string) => {
		const t = questionTypes.find(q => q.type_code === code)
		updatePart(index, {
			question_type_code: code,
			option_count: t?.has_options && t.default_option_count ? String(t.default_option_count) : '',
		})
	}

	const validate = (): string | null => {
		if (!effectiveInstitutionCode) return 'Select an institution first'
		if (!form.template_code.trim()) return 'Template code is required'
		if (!form.template_name.trim()) return 'Template name is required'
		if (form.parts.length === 0) return 'Add at least one part'
		for (const [i, p] of form.parts.entries()) {
			if (!p.part_label.trim()) return `Part ${i + 1}: label is required`
			if (!p.question_type_code) return `Part ${p.part_label}: choose a question type`
			if ((parseInt(p.num_questions) || 0) <= 0) return `Part ${p.part_label}: questions must be > 0`
		}
		return null
	}

	const save = async () => {
		const err = validate()
		if (err) {
			toast({ title: 'Check the form', description: err, variant: 'destructive' })
			return
		}
		try {
			setSaving(true)
			const payload = {
				...form,
				institution_code: effectiveInstitutionCode,
				...(editingId ? { id: editingId } : {}),
			}
			const res = await fetch('/api/pre-exam/question-paper-templates', {
				method: editingId ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data.error || 'Save failed')
			toast({ title: editingId ? 'Template updated' : 'Template created' })
			setSheetOpen(false)
			fetchTemplates()
		} catch (e: any) {
			toast({ title: 'Save failed', description: e.message, variant: 'destructive' })
		} finally {
			setSaving(false)
		}
	}

	const setStatus = async (t: IaPaperTemplate, status: 'draft' | 'active' | 'archived') => {
		try {
			const res = await fetch('/api/pre-exam/question-paper-templates', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: t.id, status }),
			})
			if (!res.ok) {
				const d = await res.json()
				throw new Error(d.error || 'Update failed')
			}
			toast({ title: `Template ${status === 'active' ? 'activated' : status}` })
			fetchTemplates()
		} catch (e: any) {
			toast({ title: 'Update failed', description: e.message, variant: 'destructive' })
		}
	}

	const remove = async (t: IaPaperTemplate) => {
		if (!confirm(`Delete template "${t.template_name}"? This cannot be undone.`)) return
		try {
			const res = await fetch(`/api/pre-exam/question-paper-templates?id=${t.id}`, {
				method: 'DELETE',
			})
			if (!res.ok) {
				const d = await res.json()
				throw new Error(d.error || 'Delete failed')
			}
			toast({ title: 'Template deleted' })
			fetchTemplates()
		} catch (e: any) {
			toast({ title: 'Delete failed', description: e.message, variant: 'destructive' })
		}
	}

	// ===== Question type handlers =====
	const openCreateType = () => {
		setTypeForm(emptyTypeForm())
		setTypeEditingId(null)
		setTypeSheetOpen(true)
	}

	const openEditType = (t: IaQuestionType) => {
		setTypeEditingId(t.id)
		setTypeForm({
			type_code: t.type_code,
			type_label: t.type_label,
			description: t.description || '',
			is_objective: t.is_objective,
			has_options: t.has_options,
			default_option_count: t.default_option_count != null ? String(t.default_option_count) : '',
			display_order: String(t.display_order),
			is_active: t.is_active,
		})
		setTypeSheetOpen(true)
	}

	const saveType = async () => {
		if (!effectiveInstitutionCode) {
			toast({ title: 'Select an institution first', variant: 'destructive' })
			return
		}
		if (!typeForm.type_code.trim() || !typeForm.type_label.trim()) {
			toast({ title: 'Code and label are required', variant: 'destructive' })
			return
		}
		try {
			setTypeSaving(true)
			const payload = {
				...typeForm,
				institution_code: effectiveInstitutionCode,
				...(typeEditingId ? { id: typeEditingId } : {}),
			}
			const res = await fetch('/api/pre-exam/question-types', {
				method: typeEditingId ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data.error || 'Save failed')
			toast({ title: typeEditingId ? 'Question type updated' : 'Question type added' })
			setTypeSheetOpen(false)
			fetchQuestionTypes()
		} catch (e: any) {
			toast({ title: 'Save failed', description: e.message, variant: 'destructive' })
		} finally {
			setTypeSaving(false)
		}
	}

	const removeType = async (t: IaQuestionType) => {
		if (!confirm(`Delete question type "${t.type_label}"?`)) return
		try {
			const res = await fetch(`/api/pre-exam/question-types?id=${t.id}`, { method: 'DELETE' })
			if (!res.ok) {
				const d = await res.json()
				throw new Error(d.error || 'Delete failed')
			}
			toast({ title: 'Question type deleted' })
			fetchQuestionTypes()
		} catch (e: any) {
			toast({ title: 'Delete failed', description: e.message, variant: 'destructive' })
		}
	}

	const statusBadge = (status: string) => {
		const map: Record<string, string> = {
			active: 'bg-green-100 text-green-700 border-green-200',
			draft: 'bg-amber-100 text-amber-700 border-amber-200',
			archived: 'bg-gray-100 text-gray-600 border-gray-200',
		}
		return <Badge variant="outline" className={map[status] || ''}>{status}</Badge>
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink href="/">Home</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink href="#">Pre-Exam</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Question Paper Templates</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Header */}
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h1 className="text-2xl font-semibold flex items-center gap-2">
								<FileText className="h-6 w-6 text-primary" /> Question Paper Templates
							</h1>
							<p className="text-sm text-muted-foreground">
								Configure question types and build reusable Internal Assessment paper formats.
							</p>
						</div>
					</div>

					{/* Super-admin institution picker */}
					{mustSelectInstitution && (
						<Card>
							<CardContent className="flex items-center gap-3 py-4">
								<Label className="whitespace-nowrap">Institution</Label>
								<Select value={localInstitutionId} onValueChange={setLocalInstitutionId}>
									<SelectTrigger className="max-w-sm">
										<SelectValue placeholder="Select an institution to manage templates" />
									</SelectTrigger>
									<SelectContent>
										{institutions.map(i => (
											<SelectItem key={i.id} value={i.id}>
												{i.name} ({i.institution_code})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</CardContent>
						</Card>
					)}

					{/* Stats */}
					<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
						{[
							{ label: 'Templates', value: stats.total, icon: FileText },
							{ label: 'Active', value: stats.active, icon: CheckCircle2 },
							{ label: 'Defaults', value: stats.defaults, icon: Settings2 },
							{ label: 'Question Types', value: stats.types, icon: Settings2 },
						].map(s => (
							<Card key={s.label}>
								<CardContent className="flex items-center justify-between py-4">
									<div>
										<p className="text-xs text-muted-foreground">{s.label}</p>
										<p className="text-2xl font-semibold">{s.value}</p>
									</div>
									<s.icon className="h-5 w-5 text-muted-foreground" />
								</CardContent>
							</Card>
						))}
					</div>

					<Tabs defaultValue="templates">
						<TabsList>
							<TabsTrigger value="templates">Templates</TabsTrigger>
							<TabsTrigger value="types">Question Types</TabsTrigger>
						</TabsList>

						{/* ===== TEMPLATES TAB ===== */}
						<TabsContent value="templates" className="space-y-3">
							<Card>
								<CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
									<div className="relative max-w-xs flex-1">
										<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
										<Input
											placeholder="Search templates..."
											value={searchTerm}
											onChange={e => setSearchTerm(e.target.value)}
											className="pl-8"
										/>
									</div>
									<div className="flex items-center gap-2">
										<Button variant="outline" size="icon" onClick={fetchTemplates} title="Refresh">
											<RefreshCw className="h-4 w-4" />
										</Button>
										<Button onClick={openCreate} disabled={mustSelectInstitution && !localInstitutionId}>
											<PlusCircle className="mr-2 h-4 w-4" /> New Template
										</Button>
									</div>
								</CardHeader>
								<CardContent>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Code</TableHead>
												<TableHead>Name</TableHead>
												<TableHead>Scope</TableHead>
												<TableHead>Parts</TableHead>
												<TableHead className="text-right">Total</TableHead>
												<TableHead>Status</TableHead>
												<TableHead>Default</TableHead>
												<TableHead className="w-10" />
											</TableRow>
										</TableHeader>
										<TableBody>
											{loading ? (
												<TableRow>
													<TableCell colSpan={8} className="py-10 text-center">
														<Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
													</TableCell>
												</TableRow>
											) : filtered.length === 0 ? (
												<TableRow>
													<TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
														No templates yet. Click “New Template” to build one.
													</TableCell>
												</TableRow>
											) : (
												filtered.map(t => (
													<TableRow key={t.id}>
														<TableCell className="font-medium">{t.template_code}</TableCell>
														<TableCell>{t.template_name}</TableCell>
														<TableCell className="uppercase text-xs">{t.exam_scope}</TableCell>
														<TableCell>{t.ia_template_parts?.length || 0}</TableCell>
														<TableCell className="text-right font-medium">{Number(t.total_marks)}</TableCell>
														<TableCell>{statusBadge(t.status)}</TableCell>
														<TableCell>{t.is_default ? <Badge>Default</Badge> : '—'}</TableCell>
														<TableCell>
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button variant="ghost" size="icon">
																		<MoreHorizontal className="h-4 w-4" />
																	</Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end">
																	<DropdownMenuItem onClick={() => openEdit(t)}>Edit</DropdownMenuItem>
																	{t.status !== 'active' && (
																		<DropdownMenuItem onClick={() => setStatus(t, 'active')}>
																			<CheckCircle2 className="mr-2 h-4 w-4" /> Activate
																		</DropdownMenuItem>
																	)}
																	{t.status !== 'archived' && (
																		<DropdownMenuItem onClick={() => setStatus(t, 'archived')}>
																			<Archive className="mr-2 h-4 w-4" /> Archive
																		</DropdownMenuItem>
																	)}
																	<DropdownMenuSeparator />
																	<DropdownMenuItem
																		className="text-destructive"
																		onClick={() => remove(t)}
																	>
																		<Trash2 className="mr-2 h-4 w-4" /> Delete
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>
								</CardContent>
							</Card>
						</TabsContent>

						{/* ===== QUESTION TYPES TAB ===== */}
						<TabsContent value="types" className="space-y-3">
							<Card>
								<CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
									<p className="text-sm text-muted-foreground">
										Types available when building template parts. Institutions can add their own.
									</p>
									<Button onClick={openCreateType} disabled={mustSelectInstitution && !localInstitutionId}>
										<PlusCircle className="mr-2 h-4 w-4" /> Add Type
									</Button>
								</CardHeader>
								<CardContent>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Code</TableHead>
												<TableHead>Label</TableHead>
												<TableHead>Objective</TableHead>
												<TableHead>Options</TableHead>
												<TableHead>Active</TableHead>
												<TableHead className="w-10" />
											</TableRow>
										</TableHeader>
										<TableBody>
											{questionTypes.length === 0 ? (
												<TableRow>
													<TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
														No question types. Add one to start building templates.
													</TableCell>
												</TableRow>
											) : (
												questionTypes.map(t => (
													<TableRow key={t.id}>
														<TableCell className="font-mono text-xs">{t.type_code}</TableCell>
														<TableCell>{t.type_label}</TableCell>
														<TableCell>{t.is_objective ? 'Yes' : 'No'}</TableCell>
														<TableCell>
															{t.has_options ? `${t.default_option_count ?? '—'} options` : '—'}
														</TableCell>
														<TableCell>
															{t.is_active ? (
																<Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
																	Active
																</Badge>
															) : (
																<Badge variant="outline">Inactive</Badge>
															)}
														</TableCell>
														<TableCell>
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button variant="ghost" size="icon">
																		<MoreHorizontal className="h-4 w-4" />
																	</Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end">
																	<DropdownMenuItem onClick={() => openEditType(t)}>Edit</DropdownMenuItem>
																	<DropdownMenuSeparator />
																	<DropdownMenuItem className="text-destructive" onClick={() => removeType(t)}>
																		<Trash2 className="mr-2 h-4 w-4" /> Delete
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>
				</div>
				<AppFooter />
			</SidebarInset>

			{/* ===== TEMPLATE BUILDER SHEET ===== */}
			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
					<SheetHeader>
						<SheetTitle>{editingId ? 'Edit Template' : 'New Template'}</SheetTitle>
					</SheetHeader>

					<div className="mt-4 space-y-4">
						<div className="grid grid-cols-2 gap-3">
							<div>
								<Label>Template Code *</Label>
								<Input
									value={form.template_code}
									onChange={e => setForm({ ...form, template_code: e.target.value })}
									placeholder="CIA-30"
								/>
							</div>
							<div>
								<Label>Exam Scope</Label>
								<Select
									value={form.exam_scope}
									onValueChange={(v: ExamScope) => setForm({ ...form, exam_scope: v })}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="cia">CIA (Internal)</SelectItem>
										<SelectItem value="ese">ESE (External)</SelectItem>
										<SelectItem value="all">All</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						<div>
							<Label>Template Name *</Label>
							<Input
								value={form.template_name}
								onChange={e => setForm({ ...form, template_name: e.target.value })}
								placeholder="CIA I & II — 30 Marks"
							/>
						</div>

						<div>
							<Label>Description</Label>
							<Textarea
								value={form.description}
								onChange={e => setForm({ ...form, description: e.target.value })}
								rows={2}
							/>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div>
								<Label>Course Type</Label>
								<Select
									value={form.course_type_applicability}
									onValueChange={(v: CourseTypeApplicability) =>
										setForm({ ...form, course_type_applicability: v })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All</SelectItem>
										<SelectItem value="theory">Theory</SelectItem>
										<SelectItem value="practical">Practical</SelectItem>
										<SelectItem value="project">Project</SelectItem>
										<SelectItem value="theory_practical">Theory + Practical</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label>Program Type</Label>
								<Select
									value={form.program_type_applicability}
									onValueChange={(v: ProgramTypeApplicability) =>
										setForm({ ...form, program_type_applicability: v })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All</SelectItem>
										<SelectItem value="ug">UG</SelectItem>
										<SelectItem value="pg">PG</SelectItem>
										<SelectItem value="diploma">Diploma</SelectItem>
										<SelectItem value="certificate">Certificate</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div>
								<Label>Duration (minutes)</Label>
								<Input
									type="number"
									value={form.duration_minutes}
									onChange={e => setForm({ ...form, duration_minutes: e.target.value })}
								/>
							</div>
							<div>
								<Label>W.E.F Date</Label>
								<Input
									type="date"
									value={form.wef_date}
									onChange={e => setForm({ ...form, wef_date: e.target.value })}
								/>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-6">
							<label className="flex items-center gap-2 text-sm">
								<Switch
									checked={form.capture_co}
									onCheckedChange={v => setForm({ ...form, capture_co: v })}
								/>
								Capture CO
							</label>
							<label className="flex items-center gap-2 text-sm">
								<Switch
									checked={form.capture_klevel}
									onCheckedChange={v => setForm({ ...form, capture_klevel: v })}
								/>
								Capture K-level
							</label>
							<label className="flex items-center gap-2 text-sm">
								<Switch
									checked={form.is_default}
									onCheckedChange={v => setForm({ ...form, is_default: v })}
								/>
								Set as default
							</label>
						</div>

						{/* Parts builder */}
						<div className="rounded-md border">
							<div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
								<span className="text-sm font-medium">Parts</span>
								<span className="text-sm">
									Total: <span className="font-semibold">{formTotal}</span> marks
								</span>
							</div>
							<div className="space-y-3 p-3">
								{form.parts.map((p, i) => {
									const type = activeTypes.find(t => t.type_code === p.question_type_code)
									return (
										<div key={i} className="rounded-md border bg-background p-3">
											<div className="mb-2 flex items-center justify-between">
												<span className="text-sm font-medium">
													Part {p.part_label || i + 1}{' '}
													<span className="text-muted-foreground">= {partMax(p)} marks</span>
												</span>
												<Button
													variant="ghost"
													size="icon"
													className="h-7 w-7"
													onClick={() => removePart(i)}
													disabled={form.parts.length === 1}
												>
													<X className="h-4 w-4" />
												</Button>
											</div>

											<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
												<div>
													<Label className="text-xs">Label</Label>
													<Input
														value={p.part_label}
														onChange={e => updatePart(i, { part_label: e.target.value })}
													/>
												</div>
												<div className="sm:col-span-3">
													<Label className="text-xs">Title</Label>
													<Input
														value={p.part_title}
														onChange={e => updatePart(i, { part_title: e.target.value })}
													/>
												</div>
											</div>

											<div className="mt-2">
												<Label className="text-xs">Instruction</Label>
												<Input
													value={p.instruction}
													onChange={e => updatePart(i, { instruction: e.target.value })}
													placeholder="Answer ALL questions..."
												/>
											</div>

											<div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
												<div>
													<Label className="text-xs">Question Type</Label>
													<Select
														value={p.question_type_code}
														onValueChange={v => onPartTypeChange(i, v)}
													>
														<SelectTrigger>
															<SelectValue placeholder="Type" />
														</SelectTrigger>
														<SelectContent>
															{activeTypes.map(t => (
																<SelectItem key={t.id} value={t.type_code}>
																	{t.type_label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
												<div>
													<Label className="text-xs">Questions</Label>
													<Input
														type="number"
														value={p.num_questions}
														onChange={e => updatePart(i, { num_questions: e.target.value })}
													/>
												</div>
												<div>
													<Label className="text-xs">Marks each</Label>
													<Input
														type="number"
														value={p.marks_per_question}
														onChange={e => updatePart(i, { marks_per_question: e.target.value })}
													/>
												</div>
												{type?.has_options && (
													<div>
														<Label className="text-xs">Options</Label>
														<Input
															type="number"
															value={p.option_count}
															onChange={e => updatePart(i, { option_count: e.target.value })}
														/>
													</div>
												)}
											</div>

											<div className="mt-2 flex flex-wrap items-center gap-4">
												<label className="flex items-center gap-2 text-xs">
													<Switch
														checked={p.has_choice}
														onCheckedChange={v => updatePart(i, { has_choice: v })}
													/>
													Choice (OR)
												</label>
												<label className="flex items-center gap-2 text-xs">
													<Switch
														checked={p.capture_co}
														onCheckedChange={v => updatePart(i, { capture_co: v })}
													/>
													CO
												</label>
												<label className="flex items-center gap-2 text-xs">
													<Switch
														checked={p.capture_klevel}
														onCheckedChange={v => updatePart(i, { capture_klevel: v })}
													/>
													K-level
												</label>
											</div>
										</div>
									)
								})}
								<Button variant="outline" size="sm" onClick={addPart} className="w-full">
									<Plus className="mr-2 h-4 w-4" /> Add Part
								</Button>
							</div>
						</div>

						<div className="flex justify-end gap-2 pb-8">
							<Button variant="outline" onClick={() => setSheetOpen(false)}>
								Cancel
							</Button>
							<Button onClick={save} disabled={saving}>
								{saving ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Save className="mr-2 h-4 w-4" />
								)}
								{editingId ? 'Update' : 'Create'}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* ===== QUESTION TYPE SHEET ===== */}
			<Sheet open={typeSheetOpen} onOpenChange={setTypeSheetOpen}>
				<SheetContent className="w-full overflow-y-auto sm:max-w-md">
					<SheetHeader>
						<SheetTitle>{typeEditingId ? 'Edit Question Type' : 'Add Question Type'}</SheetTitle>
					</SheetHeader>
					<div className="mt-4 space-y-4">
						<div className="grid grid-cols-2 gap-3">
							<div>
								<Label>Code *</Label>
								<Input
									value={typeForm.type_code}
									disabled={!!typeEditingId}
									onChange={e => setTypeForm({ ...typeForm, type_code: e.target.value })}
									placeholder="mcq"
								/>
							</div>
							<div>
								<Label>Order</Label>
								<Input
									type="number"
									value={typeForm.display_order}
									onChange={e => setTypeForm({ ...typeForm, display_order: e.target.value })}
								/>
							</div>
						</div>
						<div>
							<Label>Label *</Label>
							<Input
								value={typeForm.type_label}
								onChange={e => setTypeForm({ ...typeForm, type_label: e.target.value })}
								placeholder="Multiple Choice (MCQ)"
							/>
						</div>
						<div>
							<Label>Description</Label>
							<Textarea
								value={typeForm.description}
								onChange={e => setTypeForm({ ...typeForm, description: e.target.value })}
								rows={2}
							/>
						</div>
						<div className="flex flex-wrap items-center gap-6">
							<label className="flex items-center gap-2 text-sm">
								<Switch
									checked={typeForm.is_objective}
									onCheckedChange={v => setTypeForm({ ...typeForm, is_objective: v })}
								/>
								Objective
							</label>
							<label className="flex items-center gap-2 text-sm">
								<Switch
									checked={typeForm.has_options}
									onCheckedChange={v =>
										setTypeForm({
											...typeForm,
											has_options: v,
											default_option_count: v ? typeForm.default_option_count || '4' : '',
										})
									}
								/>
								Has options
							</label>
						</div>
						{typeForm.has_options && (
							<div>
								<Label>Default option count</Label>
								<Input
									type="number"
									value={typeForm.default_option_count}
									onChange={e =>
										setTypeForm({ ...typeForm, default_option_count: e.target.value })
									}
									placeholder="4"
								/>
							</div>
						)}
						<label className="flex items-center gap-2 text-sm">
							<Switch
								checked={typeForm.is_active}
								onCheckedChange={v => setTypeForm({ ...typeForm, is_active: v })}
							/>
							Active
						</label>

						<div className="flex justify-end gap-2">
							<Button variant="outline" onClick={() => setTypeSheetOpen(false)}>
								Cancel
							</Button>
							<Button onClick={saveType} disabled={typeSaving}>
								{typeSaving ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Save className="mr-2 h-4 w-4" />
								)}
								{typeEditingId ? 'Update' : 'Add'}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>
		</SidebarProvider>
	)
}
