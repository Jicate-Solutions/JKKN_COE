'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
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
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
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
	PlusCircle,
	Search,
	RefreshCw,
	Trash2,
	TrendingUp,
	TrendingDown,
	Loader2,
	History,
} from 'lucide-react'
import { findCategory, CALC_BASIS_LABELS, type CalcBasis } from '@/lib/exam-fee-catalog'

interface FeeRow {
	id: string
	institutions_id: string
	institution_code: string | null
	fee_type: 'CREDIT' | 'DEBIT'
	category: string
	sub_category: string
	program_level: string | null
	label: string
	calc_basis: CalcBasis
	amount: number
	currency: string
	effective_from: string
	notes: string | null
	is_active: boolean
	created_at: string
}

const ITEMS_PER_PAGE = 15

export default function FeeDetailsPage() {
	const { toast } = useToast()
	const { isReady, appendToUrl, mustSelectInstitution } = useInstitutionFilter()

	const [fees, setFees] = useState<FeeRow[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState('')
	const [typeFilter, setTypeFilter] = useState<'all' | 'CREDIT' | 'DEBIT'>('all')
	const [currentOnly, setCurrentOnly] = useState(true)
	const [currentPage, setCurrentPage] = useState(1)
	const [deleteTarget, setDeleteTarget] = useState<FeeRow | null>(null)
	const [deleting, setDeleting] = useState(false)

	const fetchFees = async () => {
		setLoading(true)
		try {
			const url = appendToUrl('/api/fee-details')
			const response = await fetch(url)
			if (response.ok) {
				const data = await response.json()
				setFees(Array.isArray(data) ? data : [])
			} else {
				setFees([])
			}
		} catch (error) {
			console.error('Failed to fetch fee details:', error)
			setFees([])
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		if (!isReady) return
		fetchFees()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isReady, appendToUrl])

	const todayStr = useMemo(() => {
		const d = new Date()
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
	}, [])

	// Key that identifies a fee (ignoring effective_from) — used to find the current version
	const feeKey = (f: FeeRow) =>
		[f.institutions_id, f.fee_type, f.category, f.sub_category, f.program_level || '', f.calc_basis].join('|')

	// Current = latest effective_from <= today for each key
	const currentIds = useMemo(() => {
		const best: Record<string, FeeRow> = {}
		for (const f of fees) {
			if (f.effective_from > todayStr) continue
			const k = feeKey(f)
			if (!best[k] || f.effective_from > best[k].effective_from) best[k] = f
		}
		return new Set(Object.values(best).map((f) => f.id))
	}, [fees, todayStr])

	const filteredFees = useMemo(() => {
		const q = searchTerm.toLowerCase()
		return fees.filter((f) => {
			const matchesSearch =
				!q ||
				[f.label, f.category, f.sub_category, f.institution_code]
					.filter(Boolean)
					.some((v) => String(v).toLowerCase().includes(q))
			const matchesType = typeFilter === 'all' || f.fee_type === typeFilter
			const matchesCurrent = !currentOnly || currentIds.has(f.id)
			return matchesSearch && matchesType && matchesCurrent
		})
	}, [fees, searchTerm, typeFilter, currentOnly, currentIds])

	const totalPages = Math.ceil(filteredFees.length / ITEMS_PER_PAGE) || 1
	const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
	const pageItems = filteredFees.slice(startIndex, startIndex + ITEMS_PER_PAGE)

	useEffect(() => setCurrentPage(1), [searchTerm, typeFilter, currentOnly])

	const stats = useMemo(() => {
		const current = fees.filter((f) => currentIds.has(f.id))
		const credit = current.filter((f) => f.fee_type === 'CREDIT').length
		const debit = current.filter((f) => f.fee_type === 'DEBIT').length
		return { credit, debit, total: fees.length }
	}, [fees, currentIds])

	const formatDate = (value: string) => {
		if (!value) return '—'
		return new Date(value).toLocaleDateString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
		})
	}

	const handleDelete = async () => {
		if (!deleteTarget) return
		setDeleting(true)
		try {
			const response = await fetch(`/api/fee-details?id=${deleteTarget.id}`, { method: 'DELETE' })
			if (!response.ok) {
				const error = await response.json()
				throw new Error(error.error || 'Failed to delete fee')
			}
			setFees((prev) => prev.filter((f) => f.id !== deleteTarget.id))
			toast({
				title: '✅ Fee Deleted',
				description: `${deleteTarget.label} has been removed.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error: any) {
			toast({
				title: '❌ Delete Failed',
				description: error.message || 'Failed to delete fee',
				variant: 'destructive',
			})
		} finally {
			setDeleting(false)
			setDeleteTarget(null)
		}
	}

	const colSpan = mustSelectInstitution ? 8 : 7

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
									<BreadcrumbPage>Fee Details</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						{/* Header */}
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
									<Tags className="h-7 w-7 text-blue-600" />
									Fee Details
								</h1>
								<p className="text-gray-600 mt-1">
									Institution-wise exam fee configuration (credit &amp; debit)
								</p>
							</div>
							<Button asChild className="bg-blue-600 hover:bg-blue-700">
								<Link href="/fee-details/create">
									<PlusCircle className="mr-2 h-4 w-4" />
									Configure Fees
								</Link>
							</Button>
						</div>

						{/* Scorecards */}
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<Card>
								<CardContent className="flex items-center justify-between p-4">
									<div>
										<p className="text-sm text-gray-500">Credit Fees (current)</p>
										<p className="text-2xl font-bold text-green-600">{stats.credit}</p>
									</div>
									<TrendingUp className="h-8 w-8 text-green-500" />
								</CardContent>
							</Card>
							<Card>
								<CardContent className="flex items-center justify-between p-4">
									<div>
										<p className="text-sm text-gray-500">Debit Fees (current)</p>
										<p className="text-2xl font-bold text-rose-600">{stats.debit}</p>
									</div>
									<TrendingDown className="h-8 w-8 text-rose-500" />
								</CardContent>
							</Card>
							<Card>
								<CardContent className="flex items-center justify-between p-4">
									<div>
										<p className="text-sm text-gray-500">Total Rows (incl. history)</p>
										<p className="text-2xl font-bold text-gray-900">{stats.total}</p>
									</div>
									<History className="h-8 w-8 text-gray-400" />
								</CardContent>
							</Card>
						</div>

						{/* Action bar */}
						<Card>
							<CardContent className="p-4">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div className="relative w-full sm:max-w-xs">
										<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
										<Input
											placeholder="Search by fee name or category..."
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											className="pl-9"
										/>
									</div>
									<div className="flex items-center gap-2">
										<Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
											<SelectTrigger className="w-[140px]">
												<SelectValue placeholder="Type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Types</SelectItem>
												<SelectItem value="CREDIT">Credit</SelectItem>
												<SelectItem value="DEBIT">Debit</SelectItem>
											</SelectContent>
										</Select>
										<Select
											value={currentOnly ? 'current' : 'all'}
											onValueChange={(v) => setCurrentOnly(v === 'current')}
										>
											<SelectTrigger className="w-[150px]">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="current">Current only</SelectItem>
												<SelectItem value="all">Show history</SelectItem>
											</SelectContent>
										</Select>
										<Button variant="outline" size="icon" onClick={fetchFees} title="Refresh">
											<RefreshCw className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Table */}
						<Card>
							<CardContent className="p-0">
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow className="bg-gray-50">
												<TableHead>Fee Item</TableHead>
												{mustSelectInstitution && <TableHead>Institution</TableHead>}
												<TableHead>Type</TableHead>
												<TableHead>Charge Basis</TableHead>
												<TableHead className="text-right">Amount</TableHead>
												<TableHead>W.e.f</TableHead>
												<TableHead className="text-center">Status</TableHead>
												<TableHead className="text-right">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{loading ? (
												<TableRow>
													<TableCell colSpan={colSpan} className="h-32 text-center">
														<Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
														<p className="mt-2 text-sm text-gray-500">Loading fees...</p>
													</TableCell>
												</TableRow>
											) : pageItems.length === 0 ? (
												<TableRow>
													<TableCell colSpan={colSpan} className="h-32 text-center text-gray-500">
														<Tags className="mx-auto h-8 w-8 text-gray-300" />
														<p className="mt-2 text-sm">No fee details configured</p>
														<Button asChild variant="link" className="text-blue-600">
															<Link href="/fee-details/create">Configure your first fees</Link>
														</Button>
													</TableCell>
												</TableRow>
											) : (
												pageItems.map((f) => {
													const isCurrent = currentIds.has(f.id)
													const catLabel = findCategory(f.category)?.label || f.category
													return (
														<TableRow key={f.id} className={!isCurrent ? 'opacity-60' : ''}>
															<TableCell>
																<div className="font-medium text-gray-900">{f.label}</div>
																<div className="text-xs text-gray-500">{catLabel}</div>
															</TableCell>
															{mustSelectInstitution && (
																<TableCell className="text-sm text-gray-600">
																	{f.institution_code || '—'}
																</TableCell>
															)}
															<TableCell>
																{f.fee_type === 'CREDIT' ? (
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
																{CALC_BASIS_LABELS[f.calc_basis] || f.calc_basis}
															</TableCell>
															<TableCell className="text-right font-semibold tabular-nums">
																₹{Number(f.amount).toFixed(2)}
															</TableCell>
															<TableCell className="text-sm">{formatDate(f.effective_from)}</TableCell>
															<TableCell className="text-center">
																{isCurrent ? (
																	<Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
																		Current
																	</Badge>
																) : (
																	<Badge variant="secondary">Superseded</Badge>
																)}
															</TableCell>
															<TableCell className="text-right">
																<Button
																	variant="ghost"
																	size="icon"
																	className="h-8 w-8 text-red-500 hover:text-red-600"
																	onClick={() => setDeleteTarget(f)}
																	title="Delete"
																>
																	<Trash2 className="h-4 w-4" />
																</Button>
															</TableCell>
														</TableRow>
													)
												})
											)}
										</TableBody>
									</Table>
								</div>

								{/* Pagination */}
								{!loading && filteredFees.length > 0 && (
									<div className="flex items-center justify-between border-t p-4">
										<p className="text-sm text-gray-500">
											Showing {startIndex + 1}–
											{Math.min(startIndex + ITEMS_PER_PAGE, filteredFees.length)} of{' '}
											{filteredFees.length}
										</p>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												disabled={currentPage === 1}
												onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
											>
												Previous
											</Button>
											<span className="text-sm text-gray-600">
												Page {currentPage} of {totalPages}
											</span>
											<Button
												variant="outline"
												size="sm"
												disabled={currentPage === totalPages}
												onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
											>
												Next
											</Button>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>

			{/* Delete confirmation */}
			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Fee?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete{' '}
							<span className="font-semibold">{deleteTarget?.label}</span> (w.e.f{' '}
							{deleteTarget ? formatDate(deleteTarget.effective_from) : ''}). Deleting a historical
							version can affect back-dated fee calculations. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault()
								handleDelete()
							}}
							disabled={deleting}
							className="bg-red-600 hover:bg-red-700"
						>
							{deleting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Deleting...
								</>
							) : (
								'Delete'
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
