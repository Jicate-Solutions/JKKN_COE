'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useFeePrograms } from '@/hooks/use-fee-programs'
import { ProgramMultiSelect } from '@/components/fee-details/program-multi-select'
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
import {
	Tags,
	Loader2,
	Plus,
	Trash2,
	TrendingUp,
	TrendingDown,
	ChevronDown,
	Search,
	AlertTriangle,
} from 'lucide-react'
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

// =====================================================
// Configure Fees
// -----------------------------------------------------
// One screen for the two things the CoE office actually does here:
//
//   1. MAP existing rates to programmes. The tier rates (UG / PG / MCA) are
//      already entered, so the common job is picking several of them at once
//      and attaching the programmes they price. The amount comes pre-filled
//      from the rate in force and only needs touching when a programme is
//      charged differently from its tier.
//
//   2. ADD a fee head that has never been configured, from the catalog.
//
// Both feed the same batch: every selected fee item is saved once per selected
// programme, all sharing one w.e.f date.
// =====================================================

/** A rate already configured for the institution, offered as a mapping template */
interface ExistingRate {
	id: string
	fee_type: FeeType
	category: string
	sub_category: string
	program_level: ProgramLevel | null
	program_code: string | null
	label: string
	calc_basis: CalcBasis
	amount: number
	effective_from: string
}

/** A fee head being configured for the first time */
interface NewFeeRow {
	uid: number
	fee_type: FeeType
	category: string
	sub_category: string
	program_level: ProgramLevel | ''
	calc_basis: CalcBasis | ''
	amount: string
	notes: string
}

const emptyRow = (uid: number): NewFeeRow => ({
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

	// ── Institution ──
	const showInstitutionField = mustSelectInstitution || !shouldFilter || !institutionId
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const effectiveInstitutionId = showInstitutionField ? selectedInstitutionId : institutionId
	const effectiveInstitutionCode = showInstitutionField
		? availableInstitutions.find((i) => i.id === selectedInstitutionId)?.institution_code
		: filter?.institution_code

	// ── Applies to: programmes + w.e.f ──
	const { programs, loading: programsLoading } = useFeePrograms({
		institutionsId: effectiveInstitutionId,
		institutionCode: effectiveInstitutionCode,
	})
	const [programCodes, setProgramCodes] = useState<string[]>([])
	const [effectiveFrom, setEffectiveFrom] = useState('')

	// ── Existing rates to map ──
	const [rates, setRates] = useState<ExistingRate[]>([])
	const [ratesLoading, setRatesLoading] = useState(false)
	const [rateSearch, setRateSearch] = useState('')
	const [rateTypeFilter, setRateTypeFilter] = useState<'all' | FeeType>('all')
	/** rate id -> amount to save. Presence in the map means "selected". */
	const [picked, setPicked] = useState<Record<string, string>>({})

	// ── New fee heads (collapsed by default — the rates usually exist already) ──
	const uidRef = useRef(1)
	const newUid = () => uidRef.current++
	const [rows, setRows] = useState<NewFeeRow[]>([])
	const [newOpen, setNewOpen] = useState(false)

	const [errors, setErrors] = useState<Record<string, string>>({})
	const [saving, setSaving] = useState(false)

	const todayStr = useMemo(() => {
		const d = new Date()
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
	}, [])

	// The tier rates in force today — the templates worth mapping. Programme-scoped
	// rows are left out: mapping a rate that is already scoped to one programme
	// onto another programme is not a thing the office does.
	const fetchRates = useCallback(async () => {
		if (!effectiveInstitutionId) {
			setRates([])
			return
		}

		setRatesLoading(true)
		try {
			const response = await fetch(
				`/api/fee-details?institutions_id=${effectiveInstitutionId}&is_active=true`
			)
			const data = response.ok ? await response.json() : []
			const all: ExistingRate[] = Array.isArray(data) ? data : []

			// Newest effective_from on or before today wins, per fee key
			const current: Record<string, ExistingRate> = {}
			for (const r of all) {
				if (r.program_code) continue
				if (!r.effective_from || r.effective_from > todayStr) continue
				const key = [r.fee_type, r.category, r.sub_category, r.program_level || '', r.calc_basis].join('|')
				if (!current[key] || r.effective_from > current[key].effective_from) current[key] = r
			}

			setRates(
				Object.values(current).sort(
					(a, b) =>
						a.fee_type.localeCompare(b.fee_type) ||
						a.category.localeCompare(b.category) ||
						a.label.localeCompare(b.label)
				)
			)
		} catch (error) {
			console.error('Failed to fetch configured fee rates:', error)
			setRates([])
		} finally {
			setRatesLoading(false)
		}
	}, [effectiveInstitutionId, todayStr])

	useEffect(() => {
		fetchRates()
		setPicked({})
	}, [fetchRates])

	const visibleRates = useMemo(() => {
		const q = rateSearch.toLowerCase()
		return rates.filter((r) => {
			const matchesType = rateTypeFilter === 'all' || r.fee_type === rateTypeFilter
			const matchesSearch =
				!q ||
				[r.label, r.category, r.sub_category, r.program_level]
					.filter(Boolean)
					.some((v) => String(v).toLowerCase().includes(q))
			return matchesType && matchesSearch
		})
	}, [rates, rateSearch, rateTypeFilter])

	const pickedIds = useMemo(() => Object.keys(picked), [picked])

	const togglePick = (rate: ExistingRate) => {
		setPicked((prev) => {
			const next = { ...prev }
			if (next[rate.id] !== undefined) delete next[rate.id]
			else next[rate.id] = String(rate.amount)
			return next
		})
		setErrors((p) => ({ ...p, picked: '', [`pick-${rate.id}`]: '' }))
	}

	const setPickedAmount = (id: string, amount: string) => {
		setPicked((prev) => (prev[id] === undefined ? prev : { ...prev, [id]: amount }))
		setErrors((p) => ({ ...p, [`pick-${id}`]: '' }))
	}

	const toggleAllVisible = () => {
		const allOn = visibleRates.length > 0 && visibleRates.every((r) => picked[r.id] !== undefined)
		setPicked((prev) => {
			const next = { ...prev }
			for (const r of visibleRates) {
				if (allOn) delete next[r.id]
				else if (next[r.id] === undefined) next[r.id] = String(r.amount)
			}
			return next
		})
		setErrors((p) => ({ ...p, picked: '' }))
	}

	// ── New fee heads ──
	const updateRow = (uid: number, patch: Partial<NewFeeRow>) => {
		setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
	}
	const addRow = () => {
		setNewOpen(true)
		setRows((prev) => [...prev, emptyRow(newUid())])
	}
	const removeRow = (uid: number) => setRows((prev) => prev.filter((r) => r.uid !== uid))

	// ── Batch shape ──
	const scopeCount = Math.max(1, programCodes.length)
	const itemCount = pickedIds.length + rows.length
	const totalRows = itemCount * scopeCount

	const totals = useMemo(() => {
		let credit = 0
		let debit = 0
		for (const rate of rates) {
			const raw = picked[rate.id]
			if (raw === undefined) continue
			const amt = Number(raw)
			if (!Number.isFinite(amt)) continue
			if (rate.fee_type === 'CREDIT') credit += amt
			else debit += amt
		}
		for (const r of rows) {
			const amt = Number(r.amount)
			if (!Number.isFinite(amt)) continue
			if (r.fee_type === 'CREDIT') credit += amt
			else debit += amt
		}
		return { credit, debit }
	}, [rates, picked, rows])

	// A UG rate mapped onto a PG-only selection is almost always a slip — the
	// tier of the rate and the tier of the programmes should agree.
	const tierMismatches = useMemo(() => {
		if (programCodes.length === 0) return []
		const selectedLevels = new Set(
			programs.filter((p) => programCodes.includes(p.program_code)).map((p) => p.level)
		)
		if (selectedLevels.size === 0) return []
		return rates.filter(
			(r) => picked[r.id] !== undefined && r.program_level && !selectedLevels.has(r.program_level)
		)
	}, [rates, picked, programCodes, programs])

	const validate = (): boolean => {
		const e: Record<string, string> = {}
		if (showInstitutionField && !selectedInstitutionId) e.institution = 'Institution is required'
		if (!effectiveFrom) e.effective_from = 'Effective-from date is required'
		if (itemCount === 0) e.picked = 'Select at least one fee item to save'

		for (const id of pickedIds) {
			const amt = Number(picked[id])
			if (picked[id] === '' || !Number.isFinite(amt) || amt < 0) e[`pick-${id}`] = 'Invalid'
		}

		rows.forEach((r) => {
			if (!r.category) e[`cat-${r.uid}`] = 'Required'
			if (!r.sub_category) e[`sub-${r.uid}`] = 'Required'
			if (!r.calc_basis) e[`basis-${r.uid}`] = 'Required'
			const amt = Number(r.amount)
			if (r.amount === '' || !Number.isFinite(amt) || amt < 0) e[`amt-${r.uid}`] = 'Invalid'
			const sub = findSubCategory(r.category, r.sub_category)
			// A programme-scoped rate is priced by the programme, so the tier is
			// only asked for when the line applies to a whole tier.
			if (sub?.levelApplies && programCodes.length === 0 && !r.program_level)
				e[`lvl-${r.uid}`] = 'Required'
		})

		// Duplicate key detection within the batch — two lines pricing the same
		// head at the same scope would save over each other.
		const seen = new Set<string>()
		const keyOf = (
			feeType: string,
			category: string,
			subCategory: string,
			level: string,
			basis: string
		) => [feeType, category, subCategory, level, basis].join('|')

		for (const id of pickedIds) {
			const rate = rates.find((r) => r.id === id)
			if (!rate) continue
			const level = programCodes.length > 0 ? '' : rate.program_level || ''
			const key = keyOf(rate.fee_type, rate.category, rate.sub_category, level, rate.calc_basis)
			if (seen.has(key)) e.picked = 'Two selected rates would be saved as the same fee item'
			seen.add(key)
		}
		rows.forEach((r) => {
			if (!r.category || !r.sub_category || !r.calc_basis) return
			const level = programCodes.length > 0 ? '' : r.program_level
			const key = keyOf(r.fee_type, r.category, r.sub_category, level, r.calc_basis)
			if (seen.has(key)) e[`dup-${r.uid}`] = 'Already covered by another line in this batch'
			seen.add(key)
		})

		setErrors(e)
		return Object.keys(e).length === 0
	}

	const handleSave = async () => {
		if (!validate()) {
			toast({ title: 'Please fix the highlighted fields', variant: 'destructive' })
			return
		}

		setSaving(true)
		try {
			// No programme selected keeps the existing behaviour: the rate applies to
			// its whole tier. Naming programmes saves one row per programme, each
			// overriding the tier for that programme only.
			const scopes: (string | null)[] = programCodes.length > 0 ? programCodes : [null]

			const items = scopes.flatMap((programCode) => {
				const fromExisting = pickedIds.map((id) => {
					const rate = rates.find((r) => r.id === id)!
					// A programme-scoped rate carries no tier — the programme identifies
					// it, and storing a tier as well would mis-price a batch that mixes
					// UG and PG programmes.
					const level = programCode ? null : rate.program_level
					return {
						fee_type: rate.fee_type,
						category: rate.category,
						sub_category: rate.sub_category,
						program_level: level,
						program_code: programCode,
						calc_basis: rate.calc_basis,
						amount: Number(picked[id]),
						label: buildFeeLabel(rate.category, rate.sub_category, level, programCode),
						effective_from: effectiveFrom,
						notes: null,
					}
				})

				const fromNew = rows.map((r) => {
					const sub = findSubCategory(r.category, r.sub_category)
					const level = programCode ? null : sub?.levelApplies ? r.program_level || null : null
					return {
						fee_type: r.fee_type,
						category: r.category,
						sub_category: r.sub_category,
						program_level: level,
						program_code: programCode,
						calc_basis: r.calc_basis,
						amount: Number(r.amount),
						label: buildFeeLabel(
							r.category,
							r.sub_category,
							level as ProgramLevel | null,
							programCode
						),
						effective_from: effectiveFrom,
						notes: r.notes || null,
					}
				})

				return [...fromExisting, ...fromNew]
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
				description:
					programCodes.length > 0
						? `${itemCount} fee item${itemCount > 1 ? 's' : ''} mapped to ${programCodes.length} programme${programCodes.length > 1 ? 's' : ''} w.e.f ${effectiveFrom}.`
						: `${items.length} fee item${items.length > 1 ? 's' : ''} configured w.e.f ${effectiveFrom}.`,
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

	const allVisiblePicked =
		visibleRates.length > 0 && visibleRates.every((r) => picked[r.id] !== undefined)

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
								Map configured fee rates to programmes, with effect from a date
							</p>
						</div>

						{/* Context: institution + programmes + w.e.f */}
						<Card>
							<CardHeader>
								<CardTitle className="text-lg">Applies To</CardTitle>
								<CardDescription>
									These settings apply to every fee item selected below.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-6">
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
													setProgramCodes([])
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

								<div className="space-y-2">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<Label>Programmes</Label>
										<span className="text-xs text-muted-foreground">
											{programCodes.length > 0
												? 'Each selected fee item is saved once per programme, overriding its tier rate'
												: 'Leave empty to price every programme at the rate’s own UG / PG / MCA tier'}
										</span>
									</div>
									<ProgramMultiSelect
										programs={programs}
										value={programCodes}
										onChange={setProgramCodes}
										loading={programsLoading}
										disabled={!effectiveInstitutionId}
										placeholder={
											effectiveInstitutionId
												? 'All programmes (tier rate)'
												: 'Select an institution first'
										}
									/>
								</div>
							</CardContent>
						</Card>

						{/* Fee items */}
						<Card>
							<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div>
									<CardTitle className="text-lg">Fee Items</CardTitle>
									<CardDescription>
										Rates already configured for this institution. Tick the ones to apply and
										adjust the amount only where it differs.
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
								{/* Toolbar */}
								<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div className="relative w-full sm:max-w-xs">
										<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
										<Input
											placeholder="Search fee item..."
											value={rateSearch}
											onChange={(e) => setRateSearch(e.target.value)}
											className="pl-9"
										/>
									</div>
									<div className="flex items-center gap-2">
										<Select
											value={rateTypeFilter}
											onValueChange={(v) => setRateTypeFilter(v as typeof rateTypeFilter)}
										>
											<SelectTrigger className="w-[140px]">
												<SelectValue placeholder="Type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Types</SelectItem>
												<SelectItem value="CREDIT">Credit</SelectItem>
												<SelectItem value="DEBIT">Debit</SelectItem>
											</SelectContent>
										</Select>
										<Button
											variant="outline"
											size="sm"
											onClick={toggleAllVisible}
											disabled={visibleRates.length === 0}
										>
											{allVisiblePicked ? 'Clear all' : 'Select all'}
										</Button>
									</div>
								</div>

								{/* Rate table */}
								<div className="overflow-x-auto rounded-lg border">
									<Table>
										<TableHeader>
											<TableRow className="bg-gray-50">
												<TableHead className="w-[44px]"></TableHead>
												<TableHead>Fee Item</TableHead>
												<TableHead className="w-[90px]">Tier</TableHead>
												<TableHead className="w-[80px]">Type</TableHead>
												<TableHead>Charge Basis</TableHead>
												<TableHead className="w-[110px] text-right">Current</TableHead>
												<TableHead className="w-[150px] text-right">Amount to save</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{!effectiveInstitutionId ? (
												<TableRow>
													<TableCell colSpan={7} className="h-28 text-center text-gray-500">
														<p className="text-sm">Select an institution to load its fee rates</p>
													</TableCell>
												</TableRow>
											) : ratesLoading ? (
												<TableRow>
													<TableCell colSpan={7} className="h-28 text-center">
														<Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
														<p className="mt-2 text-sm text-gray-500">Loading fee rates...</p>
													</TableCell>
												</TableRow>
											) : visibleRates.length === 0 ? (
												<TableRow>
													<TableCell colSpan={7} className="h-28 text-center text-gray-500">
														<Tags className="mx-auto h-8 w-8 text-gray-300" />
														<p className="mt-2 text-sm">
															{rates.length === 0
																? 'No fee rates configured yet — add one below'
																: 'No fee item matches this filter'}
														</p>
													</TableCell>
												</TableRow>
											) : (
												visibleRates.map((rate) => {
													const isPicked = picked[rate.id] !== undefined
													const catLabel = findCategory(rate.category)?.label || rate.category
													return (
														<TableRow
															key={rate.id}
															className={`cursor-pointer ${isPicked ? 'bg-blue-50/50' : ''}`}
															onClick={() => togglePick(rate)}
														>
															<TableCell onClick={(e) => e.stopPropagation()}>
																<Checkbox
																	checked={isPicked}
																	onCheckedChange={() => togglePick(rate)}
																	aria-label={`Select ${rate.label}`}
																/>
															</TableCell>
															<TableCell>
																<div className="font-medium text-gray-900">{rate.label}</div>
																<div className="text-xs text-gray-500">{catLabel}</div>
															</TableCell>
															<TableCell>
																{rate.program_level ? (
																	<Badge variant="outline">{rate.program_level}</Badge>
																) : (
																	<span className="text-xs text-gray-400">Any</span>
																)}
															</TableCell>
															<TableCell>
																{rate.fee_type === 'CREDIT' ? (
																	<Badge className="bg-green-100 text-green-700 hover:bg-green-100">
																		Credit
																	</Badge>
																) : (
																	<Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">
																		Debit
																	</Badge>
																)}
															</TableCell>
															<TableCell className="text-sm text-gray-600">
																{CALC_BASIS_LABELS[rate.calc_basis] || rate.calc_basis}
															</TableCell>
															<TableCell className="text-right text-sm text-gray-500 tabular-nums">
																₹{Number(rate.amount).toFixed(2)}
															</TableCell>
															<TableCell onClick={(e) => e.stopPropagation()}>
																<Input
																	type="number"
																	min="0"
																	step="0.01"
																	disabled={!isPicked}
																	value={isPicked ? picked[rate.id] : ''}
																	placeholder={Number(rate.amount).toFixed(2)}
																	onChange={(e) => setPickedAmount(rate.id, e.target.value)}
																	className={`h-8 text-right ${
																		errors[`pick-${rate.id}`] ? 'border-red-500' : ''
																	}`}
																/>
															</TableCell>
														</TableRow>
													)
												})
											)}
										</TableBody>
									</Table>
								</div>

								{errors.picked && <p className="text-sm text-red-500">{errors.picked}</p>}

								{tierMismatches.length > 0 && (
									<div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
										<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
										<div>
											<p className="font-medium">Tier does not match the programmes selected</p>
											<p className="text-xs mt-0.5">
												{tierMismatches.map((r) => r.label).join(', ')} —{' '}
												{tierMismatches.length > 1 ? 'these rates are' : 'this rate is'} priced for
												a tier none of the selected programmes belong to. Saving still works; the
												programme scope is what will price them.
											</p>
										</div>
									</div>
								)}

								<Separator />

								{/* A head that has never been configured */}
								<Collapsible open={newOpen} onOpenChange={setNewOpen}>
									<CollapsibleTrigger asChild>
										<Button variant="ghost" className="w-full justify-between px-2">
											<span className="text-sm font-medium text-gray-700">
												Add a fee item that isn&apos;t listed
												{rows.length > 0 && (
													<Badge variant="secondary" className="ml-2">
														{rows.length}
													</Badge>
												)}
											</span>
											<ChevronDown
												className={`h-4 w-4 transition-transform ${newOpen ? 'rotate-180' : ''}`}
											/>
										</Button>
									</CollapsibleTrigger>
									<CollapsibleContent className="space-y-4 pt-4">
										{rows.map((row, idx) => {
											const cats = categoriesForType(row.fee_type)
											const sub = findSubCategory(row.category, row.sub_category)
											const bases = sub?.bases || []
											// Naming programmes above replaces the tier: the rate is priced
											// by the programme, whatever level it sits at.
											const levelApplies = !!sub?.levelApplies && programCodes.length === 0
											return (
												<div key={row.uid} className="rounded-lg border bg-gray-50/60 p-4">
													<div className="mb-3 flex items-center justify-between">
														<span className="text-sm font-medium text-gray-700">
															New Fee Item {idx + 1}
														</span>
														<Button
															variant="ghost"
															size="icon"
															className="h-8 w-8 text-red-500 hover:text-red-600"
															onClick={() => removeRow(row.uid)}
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
																<SelectTrigger
																	className={errors[`cat-${row.uid}`] ? 'border-red-500' : ''}
																>
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
																<SelectTrigger
																	className={errors[`sub-${row.uid}`] ? 'border-red-500' : ''}
																>
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

														{/* Tier — only when the batch is not scoped to programmes */}
														{levelApplies && (
															<div className="space-y-1.5">
																<Label className="text-xs">Level</Label>
																<Select
																	value={row.program_level}
																	onValueChange={(v) =>
																		updateRow(row.uid, { program_level: v as ProgramLevel })
																	}
																>
																	<SelectTrigger
																		className={errors[`lvl-${row.uid}`] ? 'border-red-500' : ''}
																	>
																		<SelectValue placeholder="UG / PG / MCA" />
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
																onValueChange={(v) =>
																	updateRow(row.uid, { calc_basis: v as CalcBasis })
																}
																disabled={!row.sub_category}
															>
																<SelectTrigger
																	className={errors[`basis-${row.uid}`] ? 'border-red-500' : ''}
																>
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
									</CollapsibleContent>
								</Collapsible>
							</CardContent>
						</Card>

						{/* Actions */}
						<div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-sm text-gray-600">
								{itemCount === 0 ? (
									'No fee item selected yet'
								) : (
									<>
										<span className="font-semibold text-gray-900">{itemCount}</span> fee item
										{itemCount > 1 ? 's' : ''}
										{programCodes.length > 0 && (
											<>
												{' × '}
												<span className="font-semibold text-gray-900">{programCodes.length}</span>{' '}
												programme{programCodes.length > 1 ? 's' : ''}
											</>
										)}
										{' = '}
										<span className="font-semibold text-gray-900">{totalRows}</span> rate row
										{totalRows > 1 ? 's' : ''}
									</>
								)}
							</p>
							<div className="flex items-center justify-end gap-3">
								<Button variant="outline" asChild disabled={saving}>
									<Link href="/fee-details">Cancel</Link>
								</Button>
								<Button
									onClick={handleSave}
									disabled={saving}
									className="bg-blue-600 hover:bg-blue-700"
								>
									{saving ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Saving...
										</>
									) : (
										`Save ${totalRows} Rate Row${totalRows === 1 ? '' : 's'}`
									)}
								</Button>
							</div>
						</div>
					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
