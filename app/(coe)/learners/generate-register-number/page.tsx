'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { useToast } from '@/hooks/common/use-toast'
import { useAuth } from '@/context/auth-context'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import {
	RefreshCw,
	Download,
	Search,
	ChevronLeft,
	ChevronRight,
	Hash,
	Users,
	UserCheck,
	Sparkles,
	AlertCircle,
} from 'lucide-react'
import {
	buildRegisterNumber,
	hasRealRegisterNumber,
	learnerDisplayName,
	parseStartNumber,
	sortAlphabetically,
} from '@/lib/utils/register-number'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Institution {
	id: string
	institution_code: string
	name: string
	myjkkn_institution_ids?: string[] | null
}

interface ProgramOption {
	program_code: string
	program_name: string
}

interface SemesterOption {
	/** Cohort key. Always present. */
	code: string
	label: string
	number: number
	/** MyJKKN semester UUID - null on course_mapping rows predating the sync. */
	id: string | null
}

/** A learner in the selected Institution + Program + Semester cohort. */
interface CohortLearner {
	id: string
	name: string
	/** DD-MM-YYYY, or '' when MyJKKN has none. */
	date_of_birth: string
	roll_number: string
	/** Register number the learner already carries in MyJKKN, if any. */
	register_number: string
}

type RowStatus = 'new' | 'replace' | 'skipped' | 'excluded'

interface PreviewRow extends CohortLearner {
	slNo: number
	/** Number the learner holds in MyJKKN (may be the roll-number placeholder). */
	existing: string
	/** Number this run would issue. Empty when the learner is skipped. */
	generated: string
	status: RowStatus
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Page-size sentinel for "show every row". */
const ALL_ROWS = -1

/** Semester value can arrive as a number, a code ('EEE-6'), or a name. */
function parseSemesterNumber(value: unknown): number {
	if (value == null) return 0
	const n = Number(value)
	if (!isNaN(n) && n > 0) return n
	const roman = String(value).match(/(?:SEMESTER|SEM)\s*([IVXLC]+)/i)
	if (roman) {
		const map: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }
		const found = map[roman[1].toUpperCase()]
		if (found) return found
	}
	const digits = String(value).match(/(\d+)/)
	return digits ? parseInt(digits[1], 10) : 0
}

/** MyJKKN stores date_of_birth as text, usually YYYY-MM-DD. Show DD-MM-YYYY. */
function formatDob(value: unknown): string {
	const raw = String(value ?? '').trim()
	const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
	return iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : raw
}

/**
 * In dev, hitting a route mid-recompile returns an HTML page and res.json()
 * throws "Unexpected token '<'". Fail with the status instead.
 */
async function parseJsonResponse(res: Response): Promise<any> {
	const contentType = res.headers.get('content-type') || ''
	if (!contentType.includes('application/json')) {
		const text = await res.text().catch(() => '')
		throw new Error(
			`Expected JSON but received ${contentType || 'unknown'} (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`
		)
	}
	return res.json()
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function GenerateRegisterNumberPage() {
	const { toast } = useToast()
	const { user } = useAuth()
	const {
		isReady,
		institutionId: contextInstitutionId,
		institutionCode: contextInstitutionCode,
		myjkknInstitutionIds: contextMyjkknIds,
		mustSelectInstitution,
	} = useInstitutionFilter()

	// ── Step 1: Institution ──
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')

	// A super_admin on "All Institutions" picks here; everyone else inherits the
	// global selection and sees the field pre-filled and locked.
	const institutionId = selectedInstitutionId || contextInstitutionId || ''
	const institution = useMemo(
		() => institutions.find(i => i.id === institutionId) || null,
		[institutions, institutionId]
	)
	const institutionCode = institution?.institution_code || contextInstitutionCode || ''
	const myjkknInstitutionIds = useMemo(() => {
		const fromRow = institution?.myjkkn_institution_ids
		if (fromRow && fromRow.length > 0) return fromRow
		return contextMyjkknIds || []
	}, [institution, contextMyjkknIds])

	// ── Step 2 & 3: Program → Semester ──
	const [programs, setPrograms] = useState<ProgramOption[]>([])
	const [programCode, setProgramCode] = useState('')
	const [semesters, setSemesters] = useState<SemesterOption[]>([])
	const [semesterCode, setSemesterCode] = useState('')
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingSemesters, setLoadingSemesters] = useState(false)

	const selectedProgram = useMemo(
		() => programs.find(p => p.program_code === programCode) || null,
		[programs, programCode]
	)
	const selectedSemester = useMemo(
		() => semesters.find(s => s.code === semesterCode) || null,
		[semesters, semesterCode]
	)
	const programOptions = useMemo<SearchableSelectOption[]>(
		() => programs.map(p => ({ value: p.program_code, label: `${p.program_code} — ${p.program_name}` })),
		[programs]
	)
	const semesterOptions = useMemo<SearchableSelectOption[]>(
		() => semesters.map(s => ({ value: s.code, label: s.label })),
		[semesters]
	)

	// ── Step 4: Prefix & start number ──
	const [prefix, setPrefix] = useState('')
	const [startNumber, setStartNumber] = useState('001')
	const [skipExisting, setSkipExisting] = useState(true)

	// ── Cohort (MyJKKN learners_profiles holds the register numbers) ──
	const [learners, setLearners] = useState<CohortLearner[]>([])
	const [loadingLearners, setLoadingLearners] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [generating, setGenerating] = useState(false)
	// Learners ticked for this run. Every reload starts with the whole cohort ticked.
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

	useEffect(() => {
		setSelectedIds(new Set(learners.map(l => l.id)))
	}, [learners])

	// ── Table state ──
	const [search, setSearch] = useState('')
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(ALL_ROWS)

	// ── Dialogs ──
	const [confirmGenerate, setConfirmGenerate] = useState(false)

	// ─── Load institutions ───
	useEffect(() => {
		fetch('/api/master/institutions?local_only=true')
			.then(parseJsonResponse)
			.then(data => setInstitutions(Array.isArray(data) ? data : data?.data || []))
			.catch(() => setInstitutions([]))
	}, [])

	// ─── Reset the cascade when the institution changes ───
	useEffect(() => {
		setProgramCode('')
		setSemesterCode('')
		setSemesters([])
		setLearners([])
	}, [institutionId])

	// ─── Load programs for the institution ───
	useEffect(() => {
		if (!institutionCode) {
			setPrograms([])
			return
		}
		setLoadingPrograms(true)
		// Sourced from course_mapping, the same source the bulk exam-registration
		// page uses. The local `programs` mirror is not populated per institution,
		// so querying it leaves this dropdown empty.
		const params = new URLSearchParams({ type: 'programs', institution_code: institutionCode })
		fetch(`/api/learners/register-numbers/lookups?${params}`)
			.then(parseJsonResponse)
			.then((data: any) => {
				const rows: any[] = Array.isArray(data) ? data : data?.data || []
				setPrograms(
					rows.map(row => ({
						program_code: row.program_code,
						program_name: row.program_name || row.program_code,
					}))
				)
			})
			.catch(() => setPrograms([]))
			.finally(() => setLoadingPrograms(false))
	}, [institutionCode])

	// ─── Load semesters for the program ───
	useEffect(() => {
		setSemesterCode('')
		setLearners([])
		if (!institutionCode || !programCode) {
			setSemesters([])
			return
		}
		setLoadingSemesters(true)
		// Also from course_mapping: it is the table learner-profiles resolves a
		// learner semester from, so these ids line up with learner records.
		const params = new URLSearchParams({
			type: 'semesters',
			institution_code: institutionCode,
			program_code: programCode,
		})
		fetch(`/api/learners/register-numbers/lookups?${params}`)
			.then(parseJsonResponse)
			.then((data: any) => {
				const rows: any[] = Array.isArray(data) ? data : data?.data || []
				setSemesters(
					rows.map(row => {
						const code: string = row.semester_code
						const number: number = row.semester_number || parseSemesterNumber(code)
						// Codes read as "BCS-3"; show a friendlier label, keep the code.
						return {
							code,
							id: row.semester_id || null,
							number,
							label: number > 0 ? `Semester ${number} (${code})` : code,
						}
					})
				)
			})
			.catch(() => setSemesters([]))
			.finally(() => setLoadingSemesters(false))
	}, [institutionCode, programCode])

	// ─── MyJKKN learner sweep, cached per institution ───
	// MyJKKN ignores program_code / current_semester server-side and returns a
	// stripped record shape when they are passed, so the whole institution is
	// fetched and filtered here. That sweep is the slow part (thousands of rows),
	// so it runs once per institution — prefetched as soon as the institution is
	// known — and program/semester changes only re-filter the cached rows.
	const sweepRef = useRef<{ key: string; promise: Promise<any[]> } | null>(null)

	const fetchInstitutionLearners = useCallback(
		(force: boolean): Promise<any[]> => {
			const key = myjkknInstitutionIds.join(',')
			if (!force && sweepRef.current?.key === key) return sweepRef.current.promise

			// One COE institution can map to several MyJKKN ones — fetch them in parallel.
			const promise = Promise.all(
				myjkknInstitutionIds.map(async myjkknId => {
					const params = new URLSearchParams({ institution_id: myjkknId, fetchAll: 'true' })
					const res = await fetch(`/api/myjkkn/learner-profiles?${params}`)
					if (!res.ok) return []
					const json = await parseJsonResponse(res)
					return (json?.data || json || []) as any[]
				})
			).then(lists => lists.flat())

			sweepRef.current = { key, promise }
			// A failed sweep must not stay cached.
			promise.catch(() => {
				if (sweepRef.current?.promise === promise) sweepRef.current = null
			})
			return promise
		},
		[myjkknInstitutionIds]
	)

	// Warm the cache while the user is still choosing program and semester.
	useEffect(() => {
		if (isReady && myjkknInstitutionIds.length > 0) fetchInstitutionLearners(false).catch(() => {})
	}, [isReady, myjkknInstitutionIds, fetchInstitutionLearners])

	// ─── Load the cohort from MyJKKN ───
	const loadCohort = useCallback(async (force = false) => {
		// The institution context resolves asynchronously; fetching before it settles
		// would query with an empty institution and return an empty cohort.
		if (!isReady) return
		if (!institutionId || !programCode || !semesterCode) {
			setLearners([])
			setLoadError(null)
			return
		}
		if (myjkknInstitutionIds.length === 0) {
			setLearners([])
			setLoadError('This institution has no linked MyJKKN institution IDs, so learners cannot be fetched.')
			return
		}

		setLoadingLearners(true)
		setLoadError(null)
		try {
			const targetSemesterNumber = selectedSemester?.number || 0
			const rows = await fetchInstitutionLearners(force)

			const collected: CohortLearner[] = []
			const seen = new Set<string>()
			for (const row of rows) {
				if (!row?.id || seen.has(row.id)) continue

				// program_id from MyJKKN is a CODE string ("BCA"), not a UUID.
				const learnerProgram = row.program_code || row.program_id
				if (learnerProgram && learnerProgram !== programCode) continue

				// Match on the semester UUID when it resolves, else on the number —
				// MyJKKN semester ids do not always line up with the COE mirror.
				const semesterMatches =
					(selectedSemester?.id && row.semester_id === selectedSemester.id) ||
					(targetSemesterNumber > 0 &&
						parseSemesterNumber(row.current_semester) === targetSemesterNumber)
				if (!semesterMatches) continue

				seen.add(row.id)
				collected.push({
					id: row.id,
					name: learnerDisplayName(row),
					date_of_birth: formatDob(row.date_of_birth),
					roll_number: row.roll_number || '',
					register_number: row.register_number || '',
				})
			}

			setLearners(collected)
		} catch (error) {
			console.error('[generate-register-number] cohort load failed:', error)
			setLoadError(error instanceof Error ? error.message : 'Failed to load learners')
			toast({
				title: 'Load failed',
				description: 'Could not load learners for this cohort.',
				variant: 'destructive',
			})
		} finally {
			setLoadingLearners(false)
		}
	}, [isReady, institutionId, programCode, semesterCode, myjkknInstitutionIds, selectedSemester, fetchInstitutionLearners, toast])

	useEffect(() => {
		loadCohort()
	}, [loadCohort])

	// ─── Preview: sort A–Z, then number program-wise ───
	const previewRows = useMemo<PreviewRow[]>(() => {
		const sorted = sortAlphabetically(learners)
		let offset = 0
		return sorted.map((learner, index) => {
			const existing = learner.register_number
			// A register number equal to the roll number is the placeholder pasted at
			// exam registration, so that learner still gets a real number.
			const numbered = hasRealRegisterNumber(learner.register_number, learner.roll_number)

			// Skipped learners consume no slot in the sequence — the same rule the
			// save endpoint applies, so preview and saved output stay identical.
			if (skipExisting && numbered) {
				return { ...learner, slNo: index + 1, existing, generated: '', status: 'skipped' as RowStatus }
			}

			// Unticked learners are left out of this run and, like skipped ones,
			// consume no slot — the server only ever sees the ticked learners.
			if (!selectedIds.has(learner.id)) {
				return { ...learner, slNo: index + 1, existing, generated: '', status: 'excluded' as RowStatus }
			}

			return {
				...learner,
				slNo: index + 1,
				existing,
				generated: buildRegisterNumber(prefix, startNumber, offset++),
				status: (numbered ? 'replace' : 'new') as RowStatus,
			}
		})
	}, [learners, skipExisting, prefix, startNumber, selectedIds])

	// ─── Scorecards (cohort totals, unaffected by the search box) ───
	const toAssignCount = useMemo(
		() => previewRows.filter(r => r.status === 'new' || r.status === 'replace').length,
		[previewRows]
	)
	const isNumbered = (r: PreviewRow) => hasRealRegisterNumber(r.register_number, r.roll_number)
	const alreadyNumberedCount = useMemo(() => previewRows.filter(isNumbered).length, [previewRows])
	// Already-numbered learners among the ticked ones — what the confirm dialog warns about.
	const selectedNumberedCount = useMemo(
		() => previewRows.filter(r => selectedIds.has(r.id) && isNumbered(r)).length,
		[previewRows, selectedIds]
	)
	const numberRange = useMemo(() => {
		const issuing = previewRows.filter(r => r.generated)
		if (issuing.length === 0) return '—'
		const first = issuing[0].generated
		const last = issuing[issuing.length - 1].generated
		return issuing.length === 1 ? first : `${first} – ${last}`
	}, [previewRows])

	// ─── Search + pagination ───
	const filteredRows = useMemo(() => {
		const term = search.trim().toLowerCase()
		if (!term) return previewRows
		return previewRows.filter(
			row =>
				row.name.toLowerCase().includes(term) ||
				row.roll_number.toLowerCase().includes(term) ||
				row.existing.toLowerCase().includes(term) ||
				row.generated.toLowerCase().includes(term)
		)
	}, [previewRows, search])

	const pageSizeOptions = useMemo(() => {
		const base = [10, 25, 50, 100].filter(size => size <= Math.max(filteredRows.length, 10))
		// The current size must stay in the list — dropping it when the cohort
		// shrinks leaves the Select showing nothing.
		if (itemsPerPage !== ALL_ROWS && !base.includes(itemsPerPage)) base.push(itemsPerPage)
		return base.sort((a, b) => a - b)
	}, [filteredRows.length, itemsPerPage])

	const pageSize = itemsPerPage === ALL_ROWS ? Math.max(filteredRows.length, 1) : itemsPerPage
	const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
	const pagedRows = useMemo(
		() => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
		[filteredRows, currentPage, pageSize]
	)

	useEffect(() => {
		setCurrentPage(1)
	}, [search, itemsPerPage, institutionId, programCode, semesterCode, skipExisting])

	useEffect(() => {
		if (currentPage > totalPages) setCurrentPage(totalPages)
	}, [currentPage, totalPages])

	// ─── Validation ───
	const startNumberValid = !isNaN(parseStartNumber(startNumber))
	const cohortSelected = Boolean(institutionId && programCode && semesterCode)
	const canGenerate =
		cohortSelected &&
		prefix.trim().length > 0 &&
		startNumberValid &&
		toAssignCount > 0 &&
		!generating &&
		!loadingLearners

	// ─── Generate & assign ───
	const handleGenerate = useCallback(async () => {
		setGenerating(true)
		try {
			const res = await fetch('/api/learners/register-numbers/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionId,
					institution_code: institutionCode,
					program_code: programCode,
					program_name: selectedProgram?.program_name || null,
					semester_code: semesterCode,
					semester_id: selectedSemester?.id || null,
					semester_number: selectedSemester?.number || null,
					prefix: prefix.trim(),
					start_number: startNumber.trim(),
					skip_existing: skipExisting,
					generated_by: user?.coe_user_id || undefined,
					learners: learners.filter(l => selectedIds.has(l.id)).map(l => ({
						id: l.id,
						name: l.name,
						roll_number: l.roll_number,
						register_number: l.register_number,
					})),
				}),
			})

			const json = await parseJsonResponse(res)

			if (!res.ok) {
				toast({
					title: 'Generation failed',
					description: json?.error || json?.hint || 'Could not assign register numbers.',
					variant: 'destructive',
				})
				return
			}

			toast({
				title: 'Register numbers assigned',
				description: json?.message || `Assigned ${json?.count ?? 0} register numbers.`,
			})
			// Re-sweep MyJKKN so the new numbers show as existing.
			await loadCohort(true)
		} catch (error) {
			console.error('[generate-register-number] generate failed:', error)
			toast({
				title: 'Generation failed',
				description: error instanceof Error ? error.message : 'Unexpected error',
				variant: 'destructive',
			})
		} finally {
			setGenerating(false)
			setConfirmGenerate(false)
		}
	}, [
		institutionId,
		institutionCode,
		programCode,
		selectedProgram,
		semesterCode,
		selectedSemester,
		prefix,
		startNumber,
		skipExisting,
		learners,
		selectedIds,
		user,
		toast,
		loadCohort,
	])

	// ─── Row selection ───
	// Skipped rows can't be issued a number, so they are never tickable.
	const selectableFiltered = useMemo(
		() => filteredRows.filter(r => r.status !== 'skipped'),
		[filteredRows]
	)
	const allFilteredSelected =
		selectableFiltered.length > 0 && selectableFiltered.every(r => selectedIds.has(r.id))
	const someFilteredSelected = selectableFiltered.some(r => selectedIds.has(r.id))

	const toggleAllFiltered = (checked: boolean) => {
		setSelectedIds(prev => {
			const next = new Set(prev)
			for (const r of selectableFiltered) {
				if (checked) next.add(r.id)
				else next.delete(r.id)
			}
			return next
		})
	}

	const toggleRow = (id: string, checked: boolean) => {
		setSelectedIds(prev => {
			const next = new Set(prev)
			if (checked) next.add(id)
			else next.delete(id)
			return next
		})
	}

	// ─── Export ───
	const handleExport = useCallback(async () => {
		if (previewRows.length === 0) return
		const { default: XLSX } = await import('@/lib/utils/excel-compat')
		const sheet = XLSX.utils.json_to_sheet(
			previewRows.map(row => ({
				'Sl.No': row.slNo,
				'Learner Name': row.name,
				'Date of Birth': row.date_of_birth || '',
				'Roll Number': row.roll_number || '',
				'Existing Register Number': row.existing || '',
				'Generated Register Number': row.generated || '',
				Status:
					row.status === 'skipped'
						? 'Skipped'
						: row.status === 'excluded'
							? 'Not selected'
							: row.status === 'replace'
								? 'Re-assigned'
								: 'New',
			}))
		)
		const book = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(book, sheet, 'Register Numbers')
		const name = [institutionCode, programCode, selectedSemester?.label]
			.filter(Boolean)
			.join('_')
			.replace(/\s+/g, '-')
		await XLSX.writeFile(book, `register-numbers_${name || 'export'}.xlsx`)
		toast({ title: 'Exported', description: `${previewRows.length} rows written to Excel.` })
	}, [previewRows, institutionCode, programCode, selectedSemester, toast])

	const columnCount = 8

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					<Breadcrumb className="-mb-3">
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/dashboard">Dashboard</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/learners/directory">Learners</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Generate Register Number</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* ===== Scorecards ===== */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{learners.length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Learners in Cohort</p>
									</div>
									<Users className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{alreadyNumberedCount}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Already Numbered</p>
									</div>
									<UserCheck className="h-5 w-5 text-amber-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{toAssignCount}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">To Be Assigned</p>
									</div>
									<Sparkles className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div className="min-w-0">
										<p className="text-2xl font-bold tracking-tight truncate">{numberRange}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Number Range</p>
									</div>
									<Hash className="h-5 w-5 text-purple-500/40 shrink-0" />
								</div>
							</CardContent>
						</Card>
					</div>

					{/* ===== Configuration ===== */}
					<Card>
						<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
							<div className="flex items-center justify-between">
								<div>
									<h2 className="text-base font-semibold">Register Number Configuration</h2>
									<p className="text-xs text-muted-foreground">
										Institution → Program → Semester → prefix &amp; starting number. Learners are sorted A–Z
										by name and numbered program-wise.
									</p>
								</div>
							</div>
						</CardHeader>
						<CardContent className="p-4">
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
								{/* Institution - shown only when the global selector sits on
								    "All Institutions". Otherwise it already scopes the page and
								    repeating it here is dead weight. */}
								{mustSelectInstitution && (
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Institution</Label>
										<Select value={selectedInstitutionId} onValueChange={setSelectedInstitutionId}>
											<SelectTrigger className="h-9 text-sm">
												<SelectValue placeholder="Select institution" />
											</SelectTrigger>
											<SelectContent>
												{institutions.map(inst => (
													<SelectItem key={inst.id} value={inst.id}>
														{inst.institution_code} — {inst.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}

								{/* Program */}
								<div className="space-y-2">
									<Label className="text-sm font-semibold">Program</Label>
									<SearchableSelect
										value={programCode}
										onValueChange={setProgramCode}
										options={programOptions}
										disabled={!institutionId}
										loading={loadingPrograms}
										loadingText="Loading programs…"
										placeholder={!institutionId ? 'Select an institution first' : 'Select program'}
										searchPlaceholder="Search program code or name…"
										emptyText="No program found."
										wrapText={false}
										className="h-9 text-sm"
									/>
								</div>

								{/* Semester */}
								<div className="space-y-2">
									<Label className="text-sm font-semibold">Semester</Label>
									<SearchableSelect
										value={semesterCode}
										onValueChange={setSemesterCode}
										options={semesterOptions}
										disabled={!programCode}
										loading={loadingSemesters}
										loadingText="Loading semesters…"
										placeholder={!programCode ? 'Select a program first' : 'Select semester'}
										searchPlaceholder="Search semester…"
										emptyText="No semester found."
										wrapText={false}
										className="h-9 text-sm"
									/>
								</div>

								{/* Prefix */}
								<div className="space-y-2">
									<Label className="text-sm font-semibold">Register Number Prefix</Label>
									<Input
										value={prefix}
										onChange={e => setPrefix(e.target.value.toUpperCase())}
										placeholder="e.g. BCS26"
										className="h-9 text-sm"
									/>
								</div>

								{/* Start number */}
								<div className="space-y-2">
									<Label className="text-sm font-semibold">Starting Number</Label>
									<Input
										value={startNumber}
										onChange={e => setStartNumber(e.target.value)}
										placeholder="e.g. 001"
										inputMode="numeric"
										className="h-9 text-sm"
									/>
									<p className="text-xs text-muted-foreground">
										{startNumberValid ? (
											<>
												Padded to {startNumber.trim().length || 1} digit
												{startNumber.trim().length === 1 ? '' : 's'} — first number{' '}
												<span className="font-medium text-foreground">
													{buildRegisterNumber(prefix || 'PREFIX', startNumber, 0)}
												</span>
											</>
										) : (
											<span className="text-red-600">Digits only, e.g. 001</span>
										)}
									</p>
								</div>

								{/* Skip toggle */}
								<div className="space-y-2">
									<Label className="text-sm font-semibold">Existing Register Numbers</Label>
									<div className="flex items-center gap-3 h-9">
										<Switch
											id="skip-existing"
											checked={skipExisting}
											onCheckedChange={setSkipExisting}
										/>
										<label htmlFor="skip-existing" className="text-sm cursor-pointer">
											Skip learners who already have one
										</label>
									</div>
									<p className="text-xs text-muted-foreground">
										{skipExisting
											? 'Skipped learners keep their number and consume no slot in the sequence.'
											: 'Every learner is renumbered — previously issued numbers are replaced.'}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* ===== Preview table ===== */}
					<TooltipProvider delayDuration={300}>
						<Card className="flex-1 flex flex-col min-h-0">
							<CardHeader className="flex-shrink-0 px-4 py-3 border-b space-y-3">
								<div className="flex items-center justify-between">
									<div>
										<h2 className="text-base font-semibold">Preview</h2>
										<p className="text-xs text-muted-foreground">
											{cohortSelected
												? `${filteredRows.length} of ${previewRows.length} learners · sorted A–Z by name`
												: 'Select institution, program and semester to load learners'}
										</p>
									</div>
									<div className="flex items-center gap-1.5">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="outline"
													size="sm"
													className="h-8 w-8 p-0"
													onClick={() => loadCohort(true)}
													disabled={!cohortSelected || loadingLearners}
												>
													<RefreshCw className={`h-4 w-4 ${loadingLearners ? 'animate-spin' : ''}`} />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Reload learners</TooltipContent>
										</Tooltip>

										<Button
											variant="outline"
											size="sm"
											className="h-8 text-sm px-3"
											onClick={handleExport}
											disabled={previewRows.length === 0}
										>
											<Download className="h-4 w-4 mr-1.5" />
											Export
										</Button>

										<Button
											size="sm"
											className="h-8 text-sm px-4"
											onClick={() => setConfirmGenerate(true)}
											disabled={!canGenerate}
										>
											<Sparkles className="h-4 w-4 mr-1.5" />
											Generate &amp; Assign
										</Button>
									</div>
								</div>

								<div className="flex items-center gap-2 flex-wrap">
									<div className="relative flex-1 max-w-sm">
										<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
										<Input
											value={search}
											onChange={e => setSearch(e.target.value)}
											placeholder="Search name, roll or register number…"
											className="pl-8 h-8 text-sm"
										/>
									</div>
									{selectedProgram && (
										<Badge variant="secondary" className="text-xs">
											{selectedProgram.program_code}
										</Badge>
									)}
									{selectedSemester && (
										<Badge variant="secondary" className="text-xs">
											{selectedSemester.label}
										</Badge>
									)}
								</div>
							</CardHeader>

							<CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col min-h-0">
								{loadError && (
									<div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
										<AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
										<p className="text-xs text-amber-800 dark:text-amber-300">{loadError}</p>
									</div>
								)}

								<div className="rounded-md border flex-1 overflow-hidden mt-3 min-h-[380px] max-h-[520px]">
									<div className="h-full overflow-auto">
										<Table>
											<TableHeader className="sticky top-0 z-10 bg-muted/50">
												<TableRow>
													<TableHead className="w-10">
														<Checkbox
															checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
															onCheckedChange={checked => toggleAllFiltered(checked === true)}
															disabled={selectableFiltered.length === 0}
															aria-label="Select all learners"
														/>
													</TableHead>
													<TableHead className="text-xs font-semibold w-16">Sl.No</TableHead>
													<TableHead className="text-xs font-semibold">Learner Name</TableHead>
												<TableHead className="text-xs font-semibold">Date of Birth</TableHead>
													<TableHead className="text-xs font-semibold">Roll Number</TableHead>
													<TableHead className="text-xs font-semibold">Existing Reg. No</TableHead>
													<TableHead className="text-xs font-semibold">Generated Reg. No</TableHead>
													<TableHead className="text-xs font-semibold">Status</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{loadingLearners ? (
													<TableRow>
														<TableCell colSpan={columnCount} className="h-32 text-center">
															<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
																<RefreshCw className="animate-spin h-5 w-5" />
																<span className="text-sm">Loading learners from MyJKKN…</span>
															</div>
														</TableCell>
													</TableRow>
												) : !cohortSelected ? (
													<TableRow>
														<TableCell colSpan={columnCount} className="h-32 text-center">
															<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
																<Hash className="h-8 w-8 opacity-20" />
																<span className="text-sm">No cohort selected</span>
																<span className="text-xs">
																	Choose an institution, program and semester above
																</span>
															</div>
														</TableCell>
													</TableRow>
												) : pagedRows.length === 0 ? (
													<TableRow>
														<TableCell colSpan={columnCount} className="h-32 text-center">
															<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
																<Users className="h-8 w-8 opacity-20" />
																<span className="text-sm">No learners found</span>
																<span className="text-xs">
																	{search
																		? 'No learner matches your search'
																		: 'No learner in MyJKKN matches this program and semester'}
																</span>
															</div>
														</TableCell>
													</TableRow>
												) : (
													pagedRows.map(row => (
														<TableRow
															key={row.id}
															className={`hover:bg-muted/50 ${row.status === 'excluded' ? 'opacity-60' : ''}`}
														>
															<TableCell>
																<Checkbox
																	checked={row.status !== 'skipped' && selectedIds.has(row.id)}
																	onCheckedChange={checked => toggleRow(row.id, checked === true)}
																	disabled={row.status === 'skipped'}
																	aria-label={`Select ${row.name}`}
																/>
															</TableCell>
															<TableCell className="text-sm tabular-nums">{row.slNo}</TableCell>
															<TableCell className="text-sm font-medium">{row.name || '—'}</TableCell>
														<TableCell className="text-sm tabular-nums">{row.date_of_birth || '—'}</TableCell>
															<TableCell className="text-sm">{row.roll_number || '—'}</TableCell>
															<TableCell className="text-sm">{row.existing || '—'}</TableCell>
															<TableCell className="text-sm font-semibold tabular-nums">
																{row.generated || '—'}
															</TableCell>
															<TableCell>
																{row.status === 'skipped' ? (
																	<Badge variant="secondary" className="text-xs">
																		Skipped
																	</Badge>
																) : row.status === 'excluded' ? (
																	<Badge variant="outline" className="text-xs text-muted-foreground">
																		Not selected
																	</Badge>
																) : row.status === 'replace' ? (
																	<Badge variant="outline" className="text-xs">
																		Re-assign
																	</Badge>
																) : (
																	<Badge className="text-xs">New</Badge>
																)}
															</TableCell>
														</TableRow>
													))
												)}
											</TableBody>
										</Table>
									</div>
								</div>

								{/* Pagination */}
								<div className="flex items-center justify-between pt-3 px-4 pb-3 border-t">
									<div className="flex items-center gap-2">
										<Select
											value={String(itemsPerPage)}
											onValueChange={value => setItemsPerPage(Number(value))}
										>
											<SelectTrigger className="h-7 w-[70px] text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{pageSizeOptions.map(size => (
													<SelectItem key={size} value={String(size)}>
														{size}
													</SelectItem>
												))}
												<SelectItem value={String(ALL_ROWS)}>All</SelectItem>
											</SelectContent>
										</Select>
										<span className="text-xs text-muted-foreground">per page</span>
									</div>
									<div className="flex items-center gap-1">
										<Button
											variant="outline"
											size="sm"
											className="h-7 w-7 p-0"
											onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
											disabled={currentPage <= 1}
										>
											<ChevronLeft className="h-4 w-4" />
										</Button>
										<span className="text-xs text-muted-foreground px-2 tabular-nums">
											{currentPage} / {totalPages}
										</span>
										<Button
											variant="outline"
											size="sm"
											className="h-7 w-7 p-0"
											onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
											disabled={currentPage >= totalPages}
										>
											<ChevronRight className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					</TooltipProvider>
				</div>
			</SidebarInset>

			{/* ===== Confirm generate ===== */}
			<AlertDialog open={confirmGenerate} onOpenChange={setConfirmGenerate}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Assign register numbers?</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-2 text-sm">
								<p>
									{toAssignCount} learner{toAssignCount === 1 ? '' : 's'} in{' '}
									<span className="font-medium">{selectedProgram?.program_code}</span> ·{' '}
									<span className="font-medium">{selectedSemester?.label}</span> will be numbered{' '}
									<span className="font-medium">{numberRange}</span>.
								</p>
								{!skipExisting && selectedNumberedCount > 0 && (
									<p className="text-red-600">
										{selectedNumberedCount} selected learner{selectedNumberedCount === 1 ? '' : 's'} already
										hold a register number and will be re-assigned, replacing the existing one.
									</p>
								)}
								{skipExisting && alreadyNumberedCount > 0 && (
									<p>
										{alreadyNumberedCount} learner{alreadyNumberedCount === 1 ? '' : 's'} already hold a
										register number and will be skipped.
									</p>
								)}
								{learners.length - selectedIds.size > 0 && (
									<p>
										{learners.length - selectedIds.size} learner
										{learners.length - selectedIds.size === 1 ? ' is' : 's are'} not selected and will be left
										unchanged.
									</p>
								)}
								<p>
									Exam registrations and any marks or results still carrying the old number (usually the
									roll number) are updated to the new one.
								</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={generating}>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleGenerate} disabled={generating}>
							{generating ? 'Assigning…' : 'Generate & Assign'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>


		</SidebarProvider>
	)
}
