"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
	Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
	DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { cn } from "@/lib/utils"
import {
	Loader2, MoreHorizontal, Eye, PlusCircle, RefreshCw, Search, Scale,
	Calendar, Shield, ListChecks, Trash2, Save, ChevronLeft, ChevronRight,
} from "lucide-react"
import type {
	MarkConversionRule, AttendanceSlab, ComponentRule, RoundRule, FinalRule,
} from "@/types/mark-conversion-rule"
import { AttendanceSlabEditor } from "@/components/cia/attendance-slab-editor"
import { ComponentRuleEditor } from "@/components/cia/component-rule-editor"
import { RoundRuleEditor } from "@/components/cia/round-rule-editor"
import { FinalRuleEditor } from "@/components/cia/final-rule-editor"

interface Institution {
	id: string
	name: string
	institution_code: string
	myjkkn_institution_ids: string[]
}

interface Regulation {
	id: string
	regulation_code: string
	regulation_name: string
}

interface FormState {
	institutions_id: string
	regulation_code: string
	regulation_id: string
	wef_date: string
	rule_name: string
	description: string
	attendance_slabs: AttendanceSlab[]
	component_rules: Record<string, ComponentRule>
	round_rules: Record<string, RoundRule>
	final_rule: FinalRule
}

const emptyForm = (): FormState => ({
	institutions_id: '',
	regulation_code: '',
	regulation_id: '',
	wef_date: new Date().toISOString().slice(0, 10),
	rule_name: '',
	description: '',
	attendance_slabs: [],
	component_rules: {},
	round_rules: {},
	final_rule: { formula: 'average', rounds: [], compare_to: 'course.internal_max_marks' },
})

export default function MarkConversionRulesPage() {
	const { toast } = useToast()
	const { user } = useAuth()
	const { isReady, appendToUrl, mustSelectInstitution, institutionId } = useInstitutionFilter()
	const { fetchRegulations: fetchMyJKKNRegulations } = useMyJKKNInstitutionFilter()

	// Data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [regulations, setRegulations] = useState<Regulation[]>([])
	const [rules, setRules] = useState<MarkConversionRule[]>([])

	// Local institution for super_admin header (page-level filter)
	const [localInstitutionId, setLocalInstitutionId] = useState("")
	const effectiveInstitutionId = institutionId || localInstitutionId || ""

	// UI
	const [sheetOpen, setSheetOpen] = useState(false)
	const [editingId, setEditingId] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [loading, setLoading] = useState(false)

	// Form
	const [form, setForm] = useState<FormState>(emptyForm())
	const formInstitutionId = form.institutions_id || effectiveInstitutionId

	// Search & pagination
	const [searchTerm, setSearchTerm] = useState("")
	const [regulationFilter, setRegulationFilter] = useState("all")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)

	// ===== Data fetching =====
	useEffect(() => {
		if (isReady) fetchInstitutions()
	}, [isReady])

	useEffect(() => {
		if (isReady && effectiveInstitutionId && institutions.length > 0) {
			fetchRegulationsForInstitution(effectiveInstitutionId)
			fetchRules()
		}
	}, [isReady, institutionId, localInstitutionId, institutions.length])

	const fetchInstitutions = async () => {
		try {
			const url = appendToUrl('/api/pre-exam/internal-marks?action=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.map((i: any) => ({
					id: i.id,
					name: i.name || i.institution_name,
					institution_code: i.institution_code,
					myjkkn_institution_ids: i.myjkkn_institution_ids || [],
				})))
			}
		} catch (error) {
			console.error('Failed to fetch institutions:', error)
		}
	}

	const fetchRegulationsForInstitution = async (instId: string) => {
		try {
			const institution = institutions.find(i => i.id === instId)
			const myjkknIds = institution?.myjkkn_institution_ids || []
			if (myjkknIds.length === 0) { setRegulations([]); return }
			const regs = await fetchMyJKKNRegulations(myjkknIds)
			setRegulations(regs.map((r: any) => ({
				id: r.id,
				regulation_code: r.regulation_code,
				regulation_name: r.regulation_name || r.regulation_code,
			})))
		} catch (error) {
			console.error('Failed to fetch regulations:', error)
			setRegulations([])
		}
	}

	const fetchRules = async () => {
		try {
			setLoading(true)
			const url = `/api/pre-exam/mark-conversion-rules?institutions_id=${effectiveInstitutionId}`
			const res = await fetch(url)
			if (res.ok) setRules(await res.json())
		} catch (error) {
			console.error('Failed to fetch rules:', error)
		} finally {
			setLoading(false)
		}
	}

	// ===== Derived =====
	const filtered = useMemo(() => {
		let result = rules
		if (regulationFilter !== 'all') {
			result = result.filter(r =>
				regulationFilter === '__none__'
					? !r.regulation_code
					: r.regulation_code === regulationFilter
			)
		}
		if (searchTerm) {
			const t = searchTerm.toLowerCase()
			result = result.filter(r =>
				r.rule_name.toLowerCase().includes(t) ||
				(r.description || '').toLowerCase().includes(t) ||
				(r.regulation_code || '').toLowerCase().includes(t)
			)
		}
		return result
	}, [rules, regulationFilter, searchTerm])

	const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
	const paginated = useMemo(() => {
		const start = (currentPage - 1) * itemsPerPage
		return filtered.slice(start, start + itemsPerPage)
	}, [filtered, currentPage, itemsPerPage])

	const stats = useMemo(() => ({
		total: rules.length,
		active: rules.filter(r => r.is_active).length,
		withRegulation: rules.filter(r => !!r.regulation_code).length,
		institutions: new Set(rules.map(r => r.institutions_id)).size,
	}), [rules])

	const enabledComponents = Object.keys(form.component_rules)
	const definedRounds = Object.keys(form.round_rules)

	// ===== Form handlers =====
	const resetForm = () => { setForm(emptyForm()); setEditingId(null) }

	const openCreate = () => {
		resetForm()
		setForm(prev => ({ ...prev, institutions_id: effectiveInstitutionId }))
		setSheetOpen(true)
	}

	const openEdit = (r: MarkConversionRule) => {
		setEditingId(r.id)
		setForm({
			institutions_id: r.institutions_id,
			regulation_code: r.regulation_code || '',
			regulation_id: r.regulation_id || '',
			wef_date: r.wef_date,
			rule_name: r.rule_name,
			description: r.description || '',
			attendance_slabs: r.attendance_slabs || [],
			component_rules: r.component_rules || {},
			round_rules: r.round_rules || {},
			final_rule: r.final_rule || { formula: 'average', rounds: [], compare_to: 'course.internal_max_marks' },
		})
		if (r.institutions_id) fetchRegulationsForInstitution(r.institutions_id)
		setSheetOpen(true)
	}

	const handleFormInstitutionChange = (val: string) => {
		setForm(prev => ({ ...prev, institutions_id: val, regulation_code: '', regulation_id: '' }))
		fetchRegulationsForInstitution(val)
	}

	const validate = (): string | null => {
		if (!formInstitutionId) return 'Institution is required'
		if (!form.wef_date) return 'WEF date is required'
		const today = new Date().toISOString().slice(0, 10)
		if (form.wef_date < today) return 'WEF date cannot be in the past'
		if (!form.rule_name.trim()) return 'Rule name is required'
		const sorted = [...form.attendance_slabs].sort((a, b) => a.min_pct - b.min_pct)
		for (let i = 1; i < sorted.length; i++) {
			if (sorted[i].min_pct <= sorted[i - 1].max_pct) {
				return `Attendance slabs overlap near ${sorted[i].min_pct}%`
			}
		}
		return null
	}

	const handleSave = async () => {
		const err = validate()
		if (err) { toast({ title: `❌ ${err}`, variant: 'destructive' }); return }

		const institution = institutions.find(i => i.id === formInstitutionId)
		if (!institution) { toast({ title: '❌ Institution not found', variant: 'destructive' }); return }

		try {
			setSaving(true)
			const reg = regulations.find(r => r.regulation_code === form.regulation_code)
			const payload = {
				institutions_id: formInstitutionId,
				institution_code: institution.institution_code,
				regulation_code: form.regulation_code || null,
				regulation_id: reg?.id || form.regulation_id || null,
				wef_date: form.wef_date,
				rule_name: form.rule_name.trim(),
				description: form.description?.trim() || null,
				attendance_slabs: form.attendance_slabs,
				component_rules: form.component_rules,
				round_rules: form.round_rules,
				final_rule: form.final_rule,
				created_by: user?.id,
				...(editingId ? { id: editingId } : {}),
			}
			const res = await fetch('/api/pre-exam/mark-conversion-rules', {
				method: editingId ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			const result = await res.json()
			if (res.ok) {
				toast({
					title: `✅ ${editingId ? 'Updated' : 'Created'}`,
					description: `"${form.rule_name}" saved.`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
				setSheetOpen(false)
				resetForm()
				fetchRules()
			} else {
				toast({ title: '❌ Save failed', description: result.error, variant: 'destructive' })
			}
		} catch {
			toast({ title: '❌ Network error', variant: 'destructive' })
		} finally {
			setSaving(false)
		}
	}

	const handleDelete = async (id: string) => {
		if (!confirm('Delete this conversion rule? If referenced, it will be deactivated instead.')) return
		try {
			const res = await fetch(`/api/pre-exam/mark-conversion-rules?id=${id}`, { method: 'DELETE' })
			const result = await res.json()
			if (res.ok) {
				toast({
					title: result.deactivated ? '✅ Deactivated' : '✅ Deleted',
					description: result.deactivated ? 'Rule preserved for historical snapshots.' : 'Rule removed.',
					className: 'bg-green-50 border-green-200 text-green-800',
				})
				fetchRules()
			} else {
				toast({ title: '❌ Delete failed', description: result.error, variant: 'destructive' })
			}
		} catch {
			toast({ title: '❌ Network error', variant: 'destructive' })
		}
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader>
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild><Link href="/">Dashboard</Link></BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbLink>Pre-Exam</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>Mark Conversion Rules</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto">
					{/* Score cards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.total}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Rules</p>
									</div>
									<Scale className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.active}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Active</p>
									</div>
									<Shield className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.withRegulation}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Regulation-specific</p>
									</div>
									<ListChecks className="h-5 w-5 text-purple-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.institutions}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Institutions</p>
									</div>
									<Calendar className="h-5 w-5 text-amber-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Main Table Card */}
					<Card>
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between">
								<div>
									<h2 className="text-base font-semibold">All Conversion Rules</h2>
									<p className="text-xs text-muted-foreground">
										Versioned by (institution, regulation, WEF date). Drives CIA attendance→marks and final roll-up.
									</p>
								</div>
								<div className="flex items-center gap-1.5">
									<Button variant="outline" size="sm" className="h-8" onClick={fetchRules}>
										<RefreshCw className="h-3.5 w-3.5" />
									</Button>
									<Button size="sm" className="h-8" onClick={openCreate} disabled={!effectiveInstitutionId}>
										<PlusCircle className="h-3.5 w-3.5 mr-1.5" />
										Add Rule
									</Button>
								</div>
							</div>
							<div className="flex items-center gap-2 flex-wrap mt-3">
								{mustSelectInstitution && (
									<Select value={localInstitutionId} onValueChange={setLocalInstitutionId}>
										<SelectTrigger className="h-8 text-sm w-[200px]">
											<SelectValue placeholder="Select Institution" />
										</SelectTrigger>
										<SelectContent>
											{institutions.map(inst => (
												<SelectItem key={inst.id} value={inst.id}>
													{inst.institution_code} - {inst.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
								<Select
									value={regulationFilter}
									onValueChange={v => { setRegulationFilter(v); setCurrentPage(1) }}
								>
									<SelectTrigger className="h-8 text-sm w-[180px]">
										<SelectValue placeholder="All Regulations" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Regulations</SelectItem>
										<SelectItem value="__none__">No regulation (catch-all)</SelectItem>
										{regulations.map(r => (
											<SelectItem key={r.regulation_code} value={r.regulation_code}>
												{r.regulation_code}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<div className="relative flex-1 max-w-sm">
									<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<Input
										value={searchTerm}
										onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1) }}
										placeholder="Search rules..."
										className="pl-8 h-8 text-sm"
									/>
								</div>
							</div>
						</CardHeader>
						<CardContent className="pt-0">
							{loading ? (
								<div className="flex items-center justify-center py-12">
									<Loader2 className="h-6 w-6 animate-spin mr-2" />
									<span className="text-muted-foreground">Loading...</span>
								</div>
							) : paginated.length === 0 ? (
								<div className="text-center py-12 text-muted-foreground">
									<p>{rules.length === 0 ? 'No conversion rules configured yet.' : 'No matching rules.'}</p>
								</div>
							) : (
								<>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="text-xs font-semibold">Rule Name</TableHead>
												<TableHead className="text-xs font-semibold">Regulation</TableHead>
												<TableHead className="text-xs font-semibold">WEF Date</TableHead>
												<TableHead className="text-xs font-semibold text-center">Slabs</TableHead>
												<TableHead className="text-xs font-semibold text-center">Components</TableHead>
												<TableHead className="text-xs font-semibold text-center">Rounds</TableHead>
												<TableHead className="text-xs font-semibold text-center">Status</TableHead>
												<TableHead className="text-xs font-semibold text-right">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{paginated.map(r => (
												<TableRow key={r.id}>
													<TableCell className="text-sm font-medium">{r.rule_name}</TableCell>
													<TableCell className="text-sm">
														{r.regulation_code || <Badge variant="outline" className="text-xs">All</Badge>}
													</TableCell>
													<TableCell className="text-sm">{r.wef_date}</TableCell>
													<TableCell className="text-center text-sm">
														{Array.isArray(r.attendance_slabs) ? r.attendance_slabs.length : 0}
													</TableCell>
													<TableCell className="text-center text-sm">
														{Object.keys(r.component_rules || {}).length}
													</TableCell>
													<TableCell className="text-center text-sm">
														{Object.keys(r.round_rules || {}).length}
													</TableCell>
													<TableCell className="text-center">
														<Badge
															variant={r.is_active ? 'default' : 'secondary'}
															className={cn("text-xs", r.is_active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "")}
														>
															{r.is_active ? 'Active' : 'Inactive'}
														</Badge>
													</TableCell>
													<TableCell className="text-right">
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
																	<MoreHorizontal className="h-4 w-4" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end" className="w-36">
																<DropdownMenuItem onClick={() => openEdit(r)}>
																	<Eye className="h-3.5 w-3.5 mr-2" />View / Edit
																</DropdownMenuItem>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	className="text-red-600 focus:text-red-600 focus:bg-red-50"
																	onClick={() => handleDelete(r.id)}
																>
																	<Trash2 className="h-3.5 w-3.5 mr-2" />Delete
																</DropdownMenuItem>
															</DropdownMenuContent>
														</DropdownMenu>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>

									<div className="flex items-center justify-between pt-3 px-4 pb-3 border-t">
										<div className="flex items-center gap-4">
											<div className="text-sm text-muted-foreground">
												Showing {(currentPage - 1) * itemsPerPage + 1}-
												{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
											</div>
											<div className="flex items-center gap-2">
												<Label className="text-sm text-muted-foreground">Rows:</Label>
												<Select
													value={String(itemsPerPage)}
													onValueChange={v => { setItemsPerPage(Number(v)); setCurrentPage(1) }}
												>
													<SelectTrigger className="h-7 w-[70px] text-sm"><SelectValue /></SelectTrigger>
													<SelectContent>
														{[10, 25, 50].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
													</SelectContent>
												</Select>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
											<Button
												variant="outline" size="sm"
												onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
												disabled={currentPage === 1}
												className="h-7 w-7 p-0"
											>
												<ChevronLeft className="h-4 w-4" />
											</Button>
											<Button
												variant="outline" size="sm"
												onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
												disabled={currentPage >= totalPages}
												className="h-7 w-7 p-0"
											>
												<ChevronRight className="h-4 w-4" />
											</Button>
										</div>
									</div>
								</>
							)}
						</CardContent>
					</Card>
				</div>

				{/* ===== Create / Edit Sheet ===== */}
				<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
					<SheetContent className="sm:max-w-[900px] overflow-y-auto">
						<SheetHeader className="pb-4 border-b">
							<SheetTitle className="text-lg font-semibold">
								{editingId ? 'Edit' : 'New'} Mark Conversion Rule
							</SheetTitle>
							<p className="text-sm text-muted-foreground">
								{editingId ? 'Update versioned rule' : 'Define attendance slabs, component scaling, round roll-up, and final CIA formula.'}
							</p>
						</SheetHeader>

						<div className="mt-6 space-y-8">
							{/* Section 1: Scope */}
							<section className="space-y-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scope</h3>

								{mustSelectInstitution && (
									<div className="space-y-2">
										<Label className="text-sm font-semibold">
											Institution <span className="text-red-500">*</span>
										</Label>
										<Select
											value={formInstitutionId}
											onValueChange={handleFormInstitutionChange}
											disabled={!!editingId}
										>
											<SelectTrigger><SelectValue placeholder="Select Institution" /></SelectTrigger>
											<SelectContent>
												{institutions.map(inst => (
													<SelectItem key={inst.id} value={inst.id}>
														{inst.institution_code} - {inst.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}

								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Regulation</Label>
										<Select
											value={form.regulation_code || '__all__'}
											onValueChange={val => setForm(prev => ({
												...prev,
												regulation_code: val === '__all__' ? '' : val,
											}))}
										>
											<SelectTrigger><SelectValue placeholder="All Regulations" /></SelectTrigger>
											<SelectContent>
												<SelectItem value="__all__">All Regulations (catch-all)</SelectItem>
												{regulations.map(r => (
													<SelectItem key={r.regulation_code} value={r.regulation_code}>
														{r.regulation_code}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label className="text-sm font-semibold">
											WEF Date <span className="text-red-500">*</span>
										</Label>
										<Input
											type="date"
											value={form.wef_date}
											min={new Date().toISOString().slice(0, 10)}
											onChange={e => setForm(prev => ({ ...prev, wef_date: e.target.value }))}
										/>
									</div>
								</div>

								<div className="space-y-2">
									<Label className="text-sm font-semibold">
										Rule Name <span className="text-red-500">*</span>
									</Label>
									<Input
										value={form.rule_name}
										onChange={e => setForm(prev => ({ ...prev, rule_name: e.target.value }))}
										placeholder="e.g., Engineering CBCS 2026-27 CIA Rules"
									/>
								</div>

								<div className="space-y-2">
									<Label className="text-sm font-semibold">Description</Label>
									<Input
										value={form.description}
										onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
										placeholder="Optional — when to use this rule"
									/>
								</div>
							</section>

							{/* Section 2: Attendance Slabs */}
							<section className="space-y-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									Attendance Slabs
								</h3>
								<AttendanceSlabEditor
									value={form.attendance_slabs}
									onChange={slabs => setForm(prev => ({ ...prev, attendance_slabs: slabs }))}
								/>
							</section>

							{/* Section 3: Component Scaling */}
							<section className="space-y-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									Component Scaling
								</h3>
								<ComponentRuleEditor
									value={form.component_rules}
									onChange={rules => setForm(prev => ({ ...prev, component_rules: rules }))}
								/>
							</section>

							{/* Section 4: Round Rules */}
							<section className="space-y-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									Round Rules
								</h3>
								<RoundRuleEditor
									availableComponents={enabledComponents}
									value={form.round_rules}
									onChange={rules => setForm(prev => ({ ...prev, round_rules: rules }))}
								/>
							</section>

							{/* Section 5: Final Rule */}
							<section className="space-y-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									Final CIA Rule
								</h3>
								<FinalRuleEditor
									availableRounds={definedRounds}
									availableComponents={enabledComponents}
									value={form.final_rule}
									onChange={rule => setForm(prev => ({ ...prev, final_rule: rule }))}
								/>
							</section>

							<div className="flex justify-end gap-2 pt-4 border-t">
								<Button variant="outline" size="sm" className="h-10 px-6" onClick={() => setSheetOpen(false)}>
									Cancel
								</Button>
								<Button size="sm" className="h-10 px-6" onClick={handleSave} disabled={saving}>
									{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
									{saving ? 'Saving...' : editingId ? 'Update Rule' : 'Add Rule'}
								</Button>
							</div>
						</div>
					</SheetContent>
				</Sheet>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
