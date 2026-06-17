'use client'

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Tags, Loader2, Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react'
import {
	categoriesForType,
	findCategory,
	findSubCategory,
	buildFeeLabel,
	CALC_BASIS_LABELS,
	PROGRAM_LEVELS,
	type FeeType,
	type CalcBasis,
	type ProgramLevel,
} from '@/lib/exam-fee-catalog'

interface FeeRow {
	uid: number
	fee_type: FeeType
	category: string
	sub_category: string
	program_level: ProgramLevel | ''
	calc_basis: CalcBasis | ''
	amount: string
	notes: string
}

const emptyRow = (uid: number): FeeRow => ({
	uid,
	fee_type: 'CREDIT',
	category: '',
	sub_category: '',
	program_level: '',
	calc_basis: '',
	amount: '',
	notes: '',
})

export default function CreateFeeDetailsPage() {
	const { toast } = useToast()
	const router = useRouter()
	const { institutionId, filter, mustSelectInstitution, shouldFilter } = useInstitutionFilter()
	const { availableInstitutions } = useInstitution()

	// Institution
	const showInstitutionField = mustSelectInstitution || !shouldFilter || !institutionId
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const effectiveInstitutionId = showInstitutionField ? selectedInstitutionId : institutionId
	const effectiveInstitutionCode = showInstitutionField
		? availableInstitutions.find((i) => i.id === selectedInstitutionId)?.institution_code
		: filter?.institution_code

	// Shared effective-from ("w.e.f")
	const [effectiveFrom, setEffectiveFrom] = useState('')

	// Fee rows
	const uidRef = useRef(1)
	const newUid = () => uidRef.current++
	const [rows, setRows] = useState<FeeRow[]>([emptyRow(0)])

	const [errors, setErrors] = useState<Record<string, string>>({})
	const [saving, setSaving] = useState(false)

	const updateRow = (uid: number, patch: Partial<FeeRow>) => {
		setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
	}

	const addRow = () => setRows((prev) => [...prev, emptyRow(newUid())])
	const removeRow = (uid: number) =>
		setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.uid !== uid)))

	// Totals preview
	const totals = useMemo(() => {
		let credit = 0
		let debit = 0
		for (const r of rows) {
			const amt = Number(r.amount)
			if (!Number.isFinite(amt)) continue
			if (r.fee_type === 'CREDIT') credit += amt
			else debit += amt
		}
		return { credit, debit }
	}, [rows])

	const validate = (): boolean => {
		const e: Record<string, string> = {}
		if (showInstitutionField && !selectedInstitutionId) e.institution = 'Institution is required'
		if (!effectiveFrom) e.effective_from = 'Effective-from date is required'

		rows.forEach((r) => {
			if (!r.category) e[`cat-${r.uid}`] = 'Required'
			if (!r.sub_category) e[`sub-${r.uid}`] = 'Required'
			if (!r.calc_basis) e[`basis-${r.uid}`] = 'Required'
			const amt = Number(r.amount)
			if (r.amount === '' || !Number.isFinite(amt) || amt < 0) e[`amt-${r.uid}`] = 'Invalid'
			const sub = findSubCategory(r.category, r.sub_category)
			if (sub?.levelApplies && !r.program_level) e[`lvl-${r.uid}`] = 'Required'
		})

		// Duplicate key detection within the batch
		const seen = new Set<string>()
		rows.forEach((r) => {
			const key = [r.fee_type, r.category, r.sub_category, r.program_level, r.calc_basis].join('|')
			if (r.category && r.sub_category && r.calc_basis) {
				if (seen.has(key)) e[`dup-${r.uid}`] = 'Duplicate fee line'
				seen.add(key)
			}
		})

		setErrors(e)
		return Object.keys(e).length === 0
	}

	const handleSave = async () => {
		if (!validate()) {
			toast({
				title: 'Please fix the highlighted fields',
				variant: 'destructive',
			})
			return
		}

		setSaving(true)
		try {
			const items = rows.map((r) => {
				const sub = findSubCategory(r.category, r.sub_category)
				const level = sub?.levelApplies ? (r.program_level || null) : null
				return {
					fee_type: r.fee_type,
					category: r.category,
					sub_category: r.sub_category,
					program_level: level,
					calc_basis: r.calc_basis,
					amount: Number(r.amount),
					label: buildFeeLabel(r.category, r.sub_category, level as ProgramLevel | null),
					effective_from: effectiveFrom,
					notes: r.notes || null,
				}
			})

			const response = await fetch('/api/fee-details', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: effectiveInstitutionId,
					institution_code: effectiveInstitutionCode,
					items,
				}),
			})

			if (!response.ok) {
				const err = await response.json()
				throw new Error(err.error || 'Failed to save fee details')
			}

			toast({
				title: '✅ Fee Details Saved',
				description: `${items.length} fee item${items.length > 1 ? 's' : ''} configured w.e.f ${effectiveFrom}.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			router.push('/fee-details')
		} catch (error: any) {
			toast({
				title: '❌ Save Failed',
				description: error.message || 'Failed to save fee details',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
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
									<BreadcrumbLink asChild>
										<Link href="/fee-details">Fee Details</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Configure Fees</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						{/* Header */}
						<div>
							<h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
								<Tags className="h-7 w-7 text-blue-600" />
								Configure Exam Fees
							</h1>
							<p className="text-gray-600 mt-1">
								Set institution-wise exam fee amounts (credit &amp; debit) with effect from a date
							</p>
						</div>

						{/* Context: institution + w.e.f */}
						<Card>
							<CardHeader>
								<CardTitle className="text-lg">Applies To</CardTitle>
								<CardDescription>
									These settings apply to every fee item added below.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									{showInstitutionField && (
										<div className="space-y-2">
											<Label htmlFor="institution">
												Institution <span className="text-red-500">*</span>
											</Label>
											<Select
												value={selectedInstitutionId}
												onValueChange={(value) => {
													setSelectedInstitutionId(value)
													setErrors((p) => ({ ...p, institution: '' }))
												}}
											>
												<SelectTrigger
													id="institution"
													className={errors.institution ? 'border-red-500' : ''}
												>
													<SelectValue placeholder="Select institution" />
												</SelectTrigger>
												<SelectContent>
													{availableInstitutions.map((inst) => (
														<SelectItem key={inst.id} value={inst.id}>
															{inst.institution_name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{errors.institution && (
												<p className="text-sm text-red-500">{errors.institution}</p>
											)}
										</div>
									)}

									<div className="space-y-2">
										<Label htmlFor="effective_from">
											With Effect From (w.e.f) <span className="text-red-500">*</span>
										</Label>
										<Input
											id="effective_from"
											type="date"
											value={effectiveFrom}
											onChange={(e) => {
												setEffectiveFrom(e.target.value)
												setErrors((p) => ({ ...p, effective_from: '' }))
											}}
											className={errors.effective_from ? 'border-red-500' : ''}
										/>
										{errors.effective_from && (
											<p className="text-sm text-red-500">{errors.effective_from}</p>
										)}
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Fee rows */}
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<div>
									<CardTitle className="text-lg">Fee Items</CardTitle>
									<CardDescription>
										Credit = collected from learners · Debit = paid to staff/examiners
									</CardDescription>
								</div>
								<div className="flex items-center gap-3 text-sm">
									<Badge variant="secondary" className="bg-green-100 text-green-700">
										<TrendingUp className="mr-1 h-3.5 w-3.5" /> Credit ₹{totals.credit.toFixed(2)}
									</Badge>
									<Badge variant="secondary" className="bg-rose-100 text-rose-700">
										<TrendingDown className="mr-1 h-3.5 w-3.5" /> Debit ₹{totals.debit.toFixed(2)}
									</Badge>
								</div>
							</CardHeader>
							<CardContent className="space-y-4">
								{rows.map((row, idx) => {
									const cats = categoriesForType(row.fee_type)
									const sub = findSubCategory(row.category, row.sub_category)
									const bases = sub?.bases || []
									const levelApplies = !!sub?.levelApplies
									return (
										<div
											key={row.uid}
											className="rounded-lg border bg-gray-50/60 p-4"
										>
											<div className="mb-3 flex items-center justify-between">
												<span className="text-sm font-medium text-gray-700">
													Fee Item {idx + 1}
												</span>
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8 text-red-500 hover:text-red-600"
													onClick={() => removeRow(row.uid)}
													disabled={rows.length === 1}
													title="Remove"
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>

											<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
												{/* Fee type */}
												<div className="space-y-1.5">
													<Label className="text-xs">Type</Label>
													<Select
														value={row.fee_type}
														onValueChange={(v) =>
															updateRow(row.uid, {
																fee_type: v as FeeType,
																category: '',
																sub_category: '',
																program_level: '',
																calc_basis: '',
															})
														}
													>
														<SelectTrigger>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="CREDIT">Credit (collect)</SelectItem>
															<SelectItem value="DEBIT">Debit (pay)</SelectItem>
														</SelectContent>
													</Select>
												</div>

												{/* Category */}
												<div className="space-y-1.5">
													<Label className="text-xs">Category</Label>
													<Select
														value={row.category}
														onValueChange={(v) =>
															updateRow(row.uid, {
																category: v,
																sub_category: '',
																program_level: '',
																calc_basis: '',
															})
														}
													>
														<SelectTrigger className={errors[`cat-${row.uid}`] ? 'border-red-500' : ''}>
															<SelectValue placeholder="Select category" />
														</SelectTrigger>
														<SelectContent>
															{cats.map((c) => (
																<SelectItem key={c.code} value={c.code}>
																	{c.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>

												{/* Sub-category */}
												<div className="space-y-1.5">
													<Label className="text-xs">Item</Label>
													<Select
														value={row.sub_category}
														onValueChange={(v) => {
															const s = findSubCategory(row.category, v)
															updateRow(row.uid, {
																sub_category: v,
																program_level: '',
																calc_basis: (s?.bases[0] as CalcBasis) || '',
															})
														}}
														disabled={!row.category}
													>
														<SelectTrigger className={errors[`sub-${row.uid}`] ? 'border-red-500' : ''}>
															<SelectValue placeholder="Select item" />
														</SelectTrigger>
														<SelectContent>
															{(findCategory(row.category)?.subCategories || []).map((s) => (
																<SelectItem key={s.code} value={s.code}>
																	{s.label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>

												{/* Program level (conditional) */}
												{levelApplies && (
													<div className="space-y-1.5">
														<Label className="text-xs">Level</Label>
														<Select
															value={row.program_level}
															onValueChange={(v) =>
																updateRow(row.uid, { program_level: v as ProgramLevel })
															}
														>
															<SelectTrigger className={errors[`lvl-${row.uid}`] ? 'border-red-500' : ''}>
																<SelectValue placeholder="UG / PG" />
															</SelectTrigger>
															<SelectContent>
																{PROGRAM_LEVELS.map((l) => (
																	<SelectItem key={l} value={l}>
																		{l}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</div>
												)}

												{/* Charge basis */}
												<div className="space-y-1.5">
													<Label className="text-xs">Charge Basis</Label>
													<Select
														value={row.calc_basis}
														onValueChange={(v) => updateRow(row.uid, { calc_basis: v as CalcBasis })}
														disabled={!row.sub_category}
													>
														<SelectTrigger className={errors[`basis-${row.uid}`] ? 'border-red-500' : ''}>
															<SelectValue placeholder="Select basis" />
														</SelectTrigger>
														<SelectContent>
															{bases.map((b) => (
																<SelectItem key={b} value={b}>
																	{CALC_BASIS_LABELS[b]}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>

												{/* Amount */}
												<div className="space-y-1.5">
													<Label className="text-xs">Amount (₹)</Label>
													<Input
														type="number"
														min="0"
														step="0.01"
														placeholder="0.00"
														value={row.amount}
														onChange={(e) => updateRow(row.uid, { amount: e.target.value })}
														className={errors[`amt-${row.uid}`] ? 'border-red-500' : ''}
													/>
												</div>

												{/* Notes */}
												<div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
													<Label className="text-xs">Notes (optional)</Label>
													<Textarea
														rows={1}
														placeholder="e.g. revised by COE office order"
														value={row.notes}
														onChange={(e) => updateRow(row.uid, { notes: e.target.value })}
													/>
												</div>
											</div>
											{errors[`dup-${row.uid}`] && (
												<p className="mt-2 text-sm text-red-500">{errors[`dup-${row.uid}`]}</p>
											)}
										</div>
									)
								})}

								<Button variant="outline" onClick={addRow} className="w-full border-dashed">
									<Plus className="mr-2 h-4 w-4" />
									Add Fee Item
								</Button>
							</CardContent>
						</Card>

						{/* Actions */}
						<div className="flex items-center justify-end gap-3 pb-6">
							<Button variant="outline" asChild disabled={saving}>
								<Link href="/fee-details">Cancel</Link>
							</Button>
							<Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
								{saving ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Saving...
									</>
								) : (
									`Save ${rows.length} Fee Item${rows.length > 1 ? 's' : ''}`
								)}
							</Button>
						</div>
					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
