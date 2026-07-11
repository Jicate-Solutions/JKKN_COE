'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ProtectedRoute } from '@/components/protected-route'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import { useAuth } from '@/lib/auth/auth-context-parent'
import {
	CreditCard,
	Loader2,
	Pencil,
	Plus,
	Trash2,
	Wallet
} from 'lucide-react'

interface TaDaRate {
	id: string
	institutions_id: string
	category: string
	honorarium_amount: number
	da_rate_per_day: number
	ta_rate_per_km: number
	max_travel_amount: number | null
	effective_from: string
	effective_to: string | null
	is_active: boolean
	notes: string | null
}

const CATEGORY_OPTIONS = [
	{ value: 'all', label: 'All Categories (Default)' },
	{ value: 'university_nominee', label: 'University Nominee' },
	{ value: 'subject_expert', label: 'Subject Expert' },
	{ value: 'industry_expert', label: 'Industry Expert' },
	{ value: 'alumni', label: 'Alumni' }
]

const categoryLabel = (value: string) =>
	CATEGORY_OPTIONS.find(o => o.value === value)?.label || value

const emptyForm = {
	category: 'all',
	honorarium_amount: '',
	da_rate_per_day: '',
	ta_rate_per_km: '',
	max_travel_amount: '',
	effective_from: new Date().toISOString().split('T')[0],
	effective_to: '',
	is_active: true,
	notes: ''
}

function BosTaDaRatesContent() {
	const { toast } = useToast()
	const { user } = useAuth()
	const {
		isReady,
		getInstitutionIdForCreate,
		mustSelectInstitution,
		institutionId
	} = useInstitutionFilter()
	const { availableInstitutions } = useInstitution()

	const [selectedInstitution, setSelectedInstitution] = useState('')
	const [rates, setRates] = useState<TaDaRate[]>([])
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)

	// Dialog state
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editingId, setEditingId] = useState<string | null>(null)
	const [form, setForm] = useState({ ...emptyForm })
	const [deleteTarget, setDeleteTarget] = useState<TaDaRate | null>(null)
	const [deleting, setDeleting] = useState(false)

	// Sync selected institution with the global filter
	useEffect(() => {
		if (!isReady) return
		if (mustSelectInstitution) {
			setSelectedInstitution('')
			return
		}
		const autoId = getInstitutionIdForCreate()
		if (autoId) setSelectedInstitution(autoId)
	}, [isReady, mustSelectInstitution, institutionId, getInstitutionIdForCreate]) // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (selectedInstitution) {
			fetchRates(selectedInstitution)
		} else {
			setRates([])
		}
	}, [selectedInstitution])

	const fetchRates = async (instId: string) => {
		try {
			setLoading(true)
			const res = await fetch(`/api/bos/ta-da-rates?institutionId=${instId}`)
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error || 'Failed to fetch rates')
			}
			setRates(await res.json())
		} catch (e) {
			console.error('Failed to fetch TA/DA rates:', e)
			toast({
				title: 'Load Failed',
				description: e instanceof Error ? e.message : 'Failed to fetch TA/DA rates',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}

	const openCreate = () => {
		setEditingId(null)
		setForm({ ...emptyForm })
		setDialogOpen(true)
	}

	const openEdit = (rate: TaDaRate) => {
		setEditingId(rate.id)
		setForm({
			category: rate.category,
			honorarium_amount: String(rate.honorarium_amount ?? ''),
			da_rate_per_day: String(rate.da_rate_per_day ?? ''),
			ta_rate_per_km: String(rate.ta_rate_per_km ?? ''),
			max_travel_amount: rate.max_travel_amount !== null ? String(rate.max_travel_amount) : '',
			effective_from: rate.effective_from,
			effective_to: rate.effective_to || '',
			is_active: rate.is_active !== false,
			notes: rate.notes || ''
		})
		setDialogOpen(true)
	}

	const handleSave = async () => {
		if (!selectedInstitution) {
			toast({ title: 'Select Institution', description: 'Please select an institution first.', variant: 'destructive' })
			return
		}
		if (!form.effective_from) {
			toast({ title: 'Missing Field', description: 'Effective from date is required.', variant: 'destructive' })
			return
		}

		try {
			setSaving(true)
			const payload = {
				id: editingId || undefined,
				institutions_id: selectedInstitution,
				category: form.category,
				honorarium_amount: Number(form.honorarium_amount || 0),
				da_rate_per_day: Number(form.da_rate_per_day || 0),
				ta_rate_per_km: Number(form.ta_rate_per_km || 0),
				max_travel_amount: form.max_travel_amount.trim() === '' ? null : Number(form.max_travel_amount),
				effective_from: form.effective_from,
				effective_to: form.effective_to || null,
				is_active: form.is_active,
				notes: form.notes || null,
				created_by: user?.id || null
			}

			const res = await fetch('/api/bos/ta-da-rates', {
				method: editingId ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data.error || 'Failed to save rate')

			toast({
				title: editingId ? 'Rate Updated' : 'Rate Created',
				description: `TA/DA rate for ${categoryLabel(form.category)} saved.`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
			setDialogOpen(false)
			fetchRates(selectedInstitution)
		} catch (e) {
			toast({
				title: 'Save Failed',
				description: e instanceof Error ? e.message : 'Failed to save rate',
				variant: 'destructive'
			})
		} finally {
			setSaving(false)
		}
	}

	const handleDelete = async () => {
		if (!deleteTarget) return
		try {
			setDeleting(true)
			const res = await fetch(`/api/bos/ta-da-rates?id=${deleteTarget.id}`, { method: 'DELETE' })
			const data = await res.json()
			if (!res.ok) throw new Error(data.error || 'Failed to delete rate')

			toast({
				title: 'Rate Deleted',
				description: `TA/DA rate for ${categoryLabel(deleteTarget.category)} removed.`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
			setDeleteTarget(null)
			fetchRates(selectedInstitution)
		} catch (e) {
			toast({
				title: 'Delete Failed',
				description: e instanceof Error ? e.message : 'Failed to delete rate',
				variant: 'destructive'
			})
		} finally {
			setDeleting(false)
		}
	}

	const activeCount = useMemo(() => rates.filter(r => r.is_active).length, [rates])

	const formatAmount = (value: number | null) =>
		value === null || value === undefined ? '-' : `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/dashboard">Dashboard</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>BoS TA/DA Rates</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex items-center justify-between flex-wrap gap-3">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
								<Wallet className="h-5 w-5 text-white" />
							</div>
							<div>
								<h1 className="text-2xl font-bold">BoS TA/DA Rates</h1>
								<p className="text-sm text-muted-foreground">
									TA/DA rate master for Board of Studies external experts (super admin only)
								</p>
							</div>
						</div>
						<Button onClick={openCreate} disabled={!selectedInstitution}>
							<Plus className="h-4 w-4 mr-1" />
							Add Rate
						</Button>
					</div>

					{/* Institution selector (super admin viewing All Institutions) */}
					{mustSelectInstitution && (
						<Card>
							<CardContent className="p-4">
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									<div className="space-y-2">
										<Label>Institution *</Label>
										<Select value={selectedInstitution} onValueChange={setSelectedInstitution}>
											<SelectTrigger>
												<SelectValue placeholder="Select institution" />
											</SelectTrigger>
											<SelectContent>
												{availableInstitutions.map(inst => (
													<SelectItem key={inst.id} value={inst.id}>
														{inst.institution_code} - {inst.institution_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Rates table */}
					<Card>
						<CardHeader className="p-4">
							<div className="flex items-center gap-3">
								<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
									<CreditCard className="h-4 w-4 text-white" />
								</div>
								<div>
									<CardTitle className="text-lg">Configured Rates</CardTitle>
									<CardDescription>
										{rates.length} rate(s) • {activeCount} active
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="p-4 pt-0">
							{!selectedInstitution ? (
								<div className="text-center py-8 text-muted-foreground">
									<Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
									<p>Select an institution to view TA/DA rates.</p>
								</div>
							) : loading ? (
								<div className="flex items-center justify-center py-8">
									<Loader2 className="h-6 w-6 animate-spin mr-2" />
									<span>Loading rates...</span>
								</div>
							) : rates.length === 0 ? (
								<div className="text-center py-8 text-muted-foreground">
									<Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
									<p>No TA/DA rates configured yet. Click "Add Rate" to create one.</p>
								</div>
							) : (
								<div className="rounded-md border overflow-x-auto">
									<Table>
										<TableHeader className="bg-slate-50 dark:bg-slate-900/50">
											<TableRow>
												<TableHead className="text-xs">Category</TableHead>
												<TableHead className="text-xs text-right">Honorarium</TableHead>
												<TableHead className="text-xs text-right">DA / Day</TableHead>
												<TableHead className="text-xs text-right">TA / Km</TableHead>
												<TableHead className="text-xs text-right">Travel Cap</TableHead>
												<TableHead className="text-xs text-center">Effective From</TableHead>
												<TableHead className="text-xs text-center">Effective To</TableHead>
												<TableHead className="text-xs text-center">Status</TableHead>
												<TableHead className="text-xs text-center w-[90px]">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{rates.map(rate => (
												<TableRow key={rate.id}>
													<TableCell className="text-sm font-medium">{categoryLabel(rate.category)}</TableCell>
													<TableCell className="text-sm text-right">{formatAmount(rate.honorarium_amount)}</TableCell>
													<TableCell className="text-sm text-right">{formatAmount(rate.da_rate_per_day)}</TableCell>
													<TableCell className="text-sm text-right">{formatAmount(rate.ta_rate_per_km)}</TableCell>
													<TableCell className="text-sm text-right">{rate.max_travel_amount !== null ? formatAmount(rate.max_travel_amount) : 'Actual fare'}</TableCell>
													<TableCell className="text-sm text-center">{rate.effective_from}</TableCell>
													<TableCell className="text-sm text-center">{rate.effective_to || '-'}</TableCell>
													<TableCell className="text-center">
														<Badge
															variant={rate.is_active ? 'default' : 'outline'}
															className={rate.is_active ? 'bg-green-600 text-xs' : 'text-xs text-muted-foreground'}
														>
															{rate.is_active ? 'Active' : 'Inactive'}
														</Badge>
													</TableCell>
													<TableCell className="text-center">
														<div className="flex items-center justify-center gap-1">
															<Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(rate)}>
																<Pencil className="h-3.5 w-3.5" />
															</Button>
															<Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700" onClick={() => setDeleteTarget(rate)}>
																<Trash2 className="h-3.5 w-3.5" />
															</Button>
														</div>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
				<AppFooter />
			</SidebarInset>

			{/* Create / Edit dialog */}
			<Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>{editingId ? 'Edit TA/DA Rate' : 'Add TA/DA Rate'}</DialogTitle>
						<DialogDescription>
							Rates apply to BoS external experts of the selected category.
						</DialogDescription>
					</DialogHeader>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2 md:col-span-2">
							<Label>Expert Category *</Label>
							<Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CATEGORY_OPTIONS.map(o => (
										<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Honorarium (per meeting) ₹</Label>
							<Input type="number" min={0} step="0.01" value={form.honorarium_amount}
								onChange={(e) => setForm(f => ({ ...f, honorarium_amount: e.target.value }))} placeholder="0.00" />
						</div>
						<div className="space-y-2">
							<Label>DA Rate (per day) ₹</Label>
							<Input type="number" min={0} step="0.01" value={form.da_rate_per_day}
								onChange={(e) => setForm(f => ({ ...f, da_rate_per_day: e.target.value }))} placeholder="0.00" />
						</div>
						<div className="space-y-2">
							<Label>TA Rate (per km) ₹</Label>
							<Input type="number" min={0} step="0.01" value={form.ta_rate_per_km}
								onChange={(e) => setForm(f => ({ ...f, ta_rate_per_km: e.target.value }))} placeholder="0.00" />
						</div>
						<div className="space-y-2">
							<Label>Max Travel Amount ₹ (blank = actual fare)</Label>
							<Input type="number" min={0} step="0.01" value={form.max_travel_amount}
								onChange={(e) => setForm(f => ({ ...f, max_travel_amount: e.target.value }))} placeholder="Actual fare" />
						</div>
						<div className="space-y-2">
							<Label>Effective From *</Label>
							<Input type="date" value={form.effective_from}
								onChange={(e) => setForm(f => ({ ...f, effective_from: e.target.value }))} />
						</div>
						<div className="space-y-2">
							<Label>Effective To (blank = open-ended)</Label>
							<Input type="date" value={form.effective_to}
								onChange={(e) => setForm(f => ({ ...f, effective_to: e.target.value }))} />
						</div>
						<div className="space-y-2 md:col-span-2">
							<Label>Notes</Label>
							<Textarea rows={2} value={form.notes}
								onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
						</div>
						<div className="flex items-center gap-2 md:col-span-2">
							<Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
							<Label>Active</Label>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
						<Button onClick={handleSave} disabled={saving}>
							{saving ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Saving...
								</>
							) : (
								editingId ? 'Update Rate' : 'Create Rate'
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete confirmation */}
			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => !deleting && !open && setDeleteTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete TA/DA Rate?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete the {deleteTarget ? categoryLabel(deleteTarget.category) : ''} rate
							effective from {deleteTarget?.effective_from}. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
							{deleting ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Deleting...
								</>
							) : (
								<>
									<Trash2 className="h-4 w-4 mr-2" />
									Delete
								</>
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}

export default function BosTaDaRatesPage() {
	return (
		<ProtectedRoute requiredRoles={['super_admin']} requireAnyRole>
			<BosTaDaRatesContent />
		</ProtectedRoute>
	)
}
