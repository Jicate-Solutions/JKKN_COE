'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
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
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { GraduationCap, Search, RefreshCw, Loader2, RotateCcw, Building2 } from 'lucide-react'
import { PROGRAM_LEVELS, type ProgramLevel } from '@/lib/exam-fee-catalog'
import { heuristicProgramLevel } from '@/lib/exam-fee/calculate'

// =====================================================
// Programme Fee Tier
// -----------------------------------------------------
// Links a programme to the exam fee tier its papers are priced at, which is
// what connects the rates on the Fee Rates tab to a learner's registration.
//
// Every programme of the institution is listed, not just the mapped ones — a
// programme with no row still gets priced, via the UG/PG heuristic, and seeing
// that fallback is the point: MCA is invisible to it (JKKN's code is "PCA",
// which every UG/PG rule reads as plain PG).
// =====================================================

interface TierMapping {
	id: string
	institutions_id: string
	institution_code: string | null
	program_code: string
	program_level: ProgramLevel
	notes: string | null
	is_active: boolean
}

interface ProgramRow {
	program_code: string
	program_name: string
	/** The tier in force — explicit mapping if there is one, else the heuristic */
	level: ProgramLevel
	/** Whether a row in exam_fee_program_levels drives it */
	isMapped: boolean
	mappingId: string | null
}

const ITEMS_PER_PAGE = 15

export function ProgramTierTab() {
	const { toast } = useToast()
	const { isReady, institutionId, filter, mustSelectInstitution } = useInstitutionFilter()

	const institutionCode = filter?.institution_code || null

	const [mappings, setMappings] = useState<TierMapping[]>([])
	const [programs, setPrograms] = useState<Array<{ program_code: string; program_name: string }>>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState('')
	const [tierFilter, setTierFilter] = useState<'all' | ProgramLevel>('all')
	const [sourceFilter, setSourceFilter] = useState<'all' | 'mapped' | 'auto'>('all')
	const [currentPage, setCurrentPage] = useState(1)
	const [savingCode, setSavingCode] = useState<string | null>(null)

	const fetchAll = useCallback(async () => {
		if (!institutionId) {
			setMappings([])
			setPrograms([])
			setLoading(false)
			return
		}

		setLoading(true)
		try {
			// programs-cache, not the COE programs table: that mirror holds a handful
			// of rows and leaves institution_code NULL, so filtering it by
			// institution returns nothing at all.
			const [tierRes, programRes] = await Promise.all([
				fetch(`/api/fee-details/program-levels?institutions_id=${institutionId}`),
				institutionCode
					? fetch(
							`/api/master/programs-cache?institution_code=${encodeURIComponent(institutionCode)}`
						)
					: Promise.resolve(null),
			])

			const tierData = tierRes.ok ? await tierRes.json() : []
			const programData = programRes && programRes.ok ? await programRes.json() : []

			setMappings(Array.isArray(tierData) ? tierData : [])
			setPrograms(
				(Array.isArray(programData) ? programData : []).map((p: any) => ({
					program_code: String(p.program_code || '').trim(),
					program_name: p.program_name || p.display_name || p.program_code || '',
				}))
			)
		} catch (error) {
			console.error('Failed to fetch programme fee tiers:', error)
			setMappings([])
			setPrograms([])
		} finally {
			setLoading(false)
		}
	}, [institutionId, institutionCode])

	useEffect(() => {
		if (!isReady) return
		fetchAll()
	}, [isReady, fetchAll])

	// A mapping can exist for a programme the master no longer lists — keep it
	// visible so a stale row can be cleared.
	const rows = useMemo<ProgramRow[]>(() => {
		const mappingByCode = new Map<string, TierMapping>()
		for (const m of mappings) {
			if (m.is_active) mappingByCode.set(m.program_code.trim().toUpperCase(), m)
		}

		const byCode = new Map<string, ProgramRow>()

		for (const p of programs) {
			const code = p.program_code.toUpperCase()
			if (!code) continue
			const mapping = mappingByCode.get(code)
			byCode.set(code, {
				program_code: p.program_code,
				program_name: p.program_name,
				level: mapping ? mapping.program_level : heuristicProgramLevel(code),
				isMapped: !!mapping,
				mappingId: mapping?.id || null,
			})
		}

		for (const [code, mapping] of mappingByCode) {
			if (byCode.has(code)) continue
			byCode.set(code, {
				program_code: mapping.program_code,
				program_name: '(not in programme master)',
				level: mapping.program_level,
				isMapped: true,
				mappingId: mapping.id,
			})
		}

		return [...byCode.values()].sort((a, b) => a.program_code.localeCompare(b.program_code))
	}, [mappings, programs])

	const filteredRows = useMemo(() => {
		const q = searchTerm.toLowerCase()
		return rows.filter((r) => {
			const matchesSearch =
				!q ||
				r.program_code.toLowerCase().includes(q) ||
				r.program_name.toLowerCase().includes(q)
			const matchesTier = tierFilter === 'all' || r.level === tierFilter
			const matchesSource =
				sourceFilter === 'all' ||
				(sourceFilter === 'mapped' ? r.isMapped : !r.isMapped)
			return matchesSearch && matchesTier && matchesSource
		})
	}, [rows, searchTerm, tierFilter, sourceFilter])

	const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE) || 1
	const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
	const pageItems = filteredRows.slice(startIndex, startIndex + ITEMS_PER_PAGE)

	useEffect(() => setCurrentPage(1), [searchTerm, tierFilter, sourceFilter])

	const stats = useMemo(
		() => ({
			total: rows.length,
			mapped: rows.filter((r) => r.isMapped).length,
			auto: rows.filter((r) => !r.isMapped).length,
		}),
		[rows]
	)

	const setTier = async (row: ProgramRow, level: ProgramLevel) => {
		if (!institutionId || level === row.level) return

		setSavingCode(row.program_code)
		try {
			const response = await fetch('/api/fee-details/program-levels', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionId,
					institution_code: institutionCode,
					program_code: row.program_code,
					program_level: level,
				}),
			})

			if (!response.ok) {
				const err = await response.json()
				throw new Error(err.error || 'Failed to save fee tier')
			}

			const saved: TierMapping[] = await response.json()
			const savedRow = Array.isArray(saved) ? saved[0] : saved

			setMappings((prev) => {
				const rest = prev.filter(
					(m) => m.program_code.trim().toUpperCase() !== row.program_code.trim().toUpperCase()
				)
				return savedRow ? [...rest, savedRow] : rest
			})

			toast({
				title: '✅ Fee Tier Updated',
				description: `${row.program_code} is now priced at the ${level} tier.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error: any) {
			toast({
				title: '❌ Save Failed',
				description: error.message || 'Failed to save fee tier',
				variant: 'destructive',
			})
		} finally {
			setSavingCode(null)
		}
	}

	const resetToAuto = async (row: ProgramRow) => {
		if (!row.mappingId) return

		setSavingCode(row.program_code)
		try {
			const response = await fetch(`/api/fee-details/program-levels?id=${row.mappingId}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				const err = await response.json()
				throw new Error(err.error || 'Failed to clear fee tier')
			}

			setMappings((prev) => prev.filter((m) => m.id !== row.mappingId))
			toast({
				title: '✅ Mapping Cleared',
				description: `${row.program_code} now uses the automatic UG/PG tier.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error: any) {
			toast({
				title: '❌ Delete Failed',
				description: error.message || 'Failed to clear fee tier',
				variant: 'destructive',
			})
		} finally {
			setSavingCode(null)
		}
	}

	// The map is per-institution, so "All Institutions" has nothing to edit
	if (mustSelectInstitution || !institutionId) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
					<Building2 className="h-8 w-8 text-gray-300" />
					<p className="text-sm font-medium text-gray-700">Select an institution</p>
					<p className="text-xs text-muted-foreground max-w-sm">
						Fee tiers are configured per institution. Pick one from the sidebar to map its
						programmes.
					</p>
				</CardContent>
			</Card>
		)
	}

	return (
		<div className="flex flex-col gap-3">
			{/* Scorecards */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<Card>
					<CardContent className="flex items-center justify-between p-4">
						<div>
							<p className="text-sm text-gray-500">Programmes</p>
							<p className="text-2xl font-bold text-gray-900">{stats.total}</p>
						</div>
						<GraduationCap className="h-8 w-8 text-gray-400" />
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center justify-between p-4">
						<div>
							<p className="text-sm text-gray-500">Explicitly mapped</p>
							<p className="text-2xl font-bold text-blue-600">{stats.mapped}</p>
						</div>
						<Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Mapped</Badge>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="flex items-center justify-between p-4">
						<div>
							<p className="text-sm text-gray-500">Using automatic tier</p>
							<p className="text-2xl font-bold text-amber-600">{stats.auto}</p>
						</div>
						<Badge variant="secondary">Auto</Badge>
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
								placeholder="Search by programme or code..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								className="pl-9"
							/>
						</div>
						<div className="flex items-center gap-2">
							<Select value={tierFilter} onValueChange={(v) => setTierFilter(v as typeof tierFilter)}>
								<SelectTrigger className="w-[130px]">
									<SelectValue placeholder="Tier" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Tiers</SelectItem>
									{PROGRAM_LEVELS.map((l) => (
										<SelectItem key={l} value={l}>
											{l}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={sourceFilter}
								onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}
							>
								<SelectTrigger className="w-[150px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Programmes</SelectItem>
									<SelectItem value="mapped">Mapped only</SelectItem>
									<SelectItem value="auto">Automatic only</SelectItem>
								</SelectContent>
							</Select>
							<Button variant="outline" size="icon" onClick={fetchAll} title="Refresh">
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
									<TableHead>Programme</TableHead>
									<TableHead>Code</TableHead>
									<TableHead className="w-[170px]">Fee Tier</TableHead>
									<TableHead className="text-center">Source</TableHead>
									<TableHead className="text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{loading ? (
									<TableRow>
										<TableCell colSpan={5} className="h-32 text-center">
											<Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
											<p className="mt-2 text-sm text-gray-500">Loading programmes...</p>
										</TableCell>
									</TableRow>
								) : pageItems.length === 0 ? (
									<TableRow>
										<TableCell colSpan={5} className="h-32 text-center text-gray-500">
											<GraduationCap className="mx-auto h-8 w-8 text-gray-300" />
											<p className="mt-2 text-sm">No programmes found</p>
										</TableCell>
									</TableRow>
								) : (
									pageItems.map((row) => (
										<TableRow key={row.program_code}>
											<TableCell className="font-medium text-gray-900">
												{row.program_name}
											</TableCell>
											<TableCell className="text-sm text-gray-600">{row.program_code}</TableCell>
											<TableCell>
												<Select
													value={row.level}
													onValueChange={(v) => setTier(row, v as ProgramLevel)}
													disabled={savingCode === row.program_code}
												>
													<SelectTrigger className="h-8">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{PROGRAM_LEVELS.map((l) => (
															<SelectItem key={l} value={l}>
																{l}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</TableCell>
											<TableCell className="text-center">
												{row.isMapped ? (
													<Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
														Mapped
													</Badge>
												) : (
													<Badge variant="secondary" title="Derived from the programme code">
														Auto
													</Badge>
												)}
											</TableCell>
											<TableCell className="text-right">
												{savingCode === row.program_code ? (
													<Loader2 className="ml-auto h-4 w-4 animate-spin text-blue-600" />
												) : (
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8"
														onClick={() => resetToAuto(row)}
														disabled={!row.isMapped}
														title={
															row.isMapped
																? 'Clear the mapping and fall back to the automatic tier'
																: 'Already using the automatic tier'
														}
													>
														<RotateCcw className="h-4 w-4" />
													</Button>
												)}
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>

					{/* Pagination */}
					{!loading && filteredRows.length > 0 && (
						<div className="flex items-center justify-between border-t p-4">
							<p className="text-sm text-gray-500">
								Showing {startIndex + 1}–
								{Math.min(startIndex + ITEMS_PER_PAGE, filteredRows.length)} of{' '}
								{filteredRows.length}
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

			<p className="text-xs text-muted-foreground">
				A programme with no mapping is priced by reading its code (UG or PG). MCA is never
				inferred that way — map it here so its papers pick up the MCA rates.
			</p>
		</div>
	)
}
