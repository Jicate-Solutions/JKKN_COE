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
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
	DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { cn } from '@/lib/utils'
import {
	Loader2, MoreHorizontal, FileText, FileDown, Wand2, Save, Trash2, Send, CheckCircle2, Lock,
	Check, ChevronsUpDown, RefreshCw, Plus, X, Download, GraduationCap, Layers, Split, AlertTriangle,
} from 'lucide-react'
import { K_LEVELS } from '@/types/ia-question-paper'
import type { IaQuestionPaper, IaPaperQuestion, IaPaperSubQuestion, IaPaperQuestionOption } from '@/types/ia-question-paper'
import {
	readSubQuestions, relabelSubs, subTotal, canSplit, validateSubMarks, newId, romanLabel,
	MAX_SUB_QUESTIONS,
} from '@/lib/ia/sub-questions'
import { QuestionRichEditor } from '@/components/ia/question-rich-editor'
import { formatApplicability } from '@/lib/ia/course-type-applicability'
import { TAMIL_FONT_FAMILIES } from '@/lib/ia/tamil-font-meta'
import { QuestionImageField } from '@/components/ia/question-image-field'
import { optionEditorValue, richTextToPlain } from '@/lib/ia/rich-text'
import { paperPdfFilename } from '@/lib/ia/paper-filename'

interface Institution {
	id: string
	name: string
	institution_code: string
}
interface SessionOpt {
	id: string
	session_name: string
	session_code: string
}
interface TemplateOpt {
	id: string
	template_name: string
	template_code: string
	course_type_applicability: string
	total_marks: number
}
interface BoardOpt {
	board_code: string
	board_name: string
	board_type?: string
	board_order?: number
}

// A CIA round offered by the institution's CIA Setting for the chosen exam session.
interface CiaRoundOpt {
	round: number
	round_name: string
}

type FilterMode = 'program' | 'board'

// Searchable single-select combobox (matches exam-registrations/bulk-create)
function SearchableSelect({
	value, onValueChange, placeholder, options, disabled, searchPlaceholder,
}: {
	value: string
	onValueChange: (v: string) => void
	placeholder: string
	options: { value: string; label: string }[]
	disabled?: boolean
	searchPlaceholder?: string
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const filtered = useMemo(() => {
		if (!search.trim()) return options
		const q = search.toLowerCase()
		return options.filter(o => o.label.toLowerCase().includes(q))
	}, [options, search])
	const selected = options.find(o => o.value === value)

	return (
		<Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch('') }}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className="h-9 w-full justify-between rounded-md px-3 text-sm font-normal"
				>
					<span className={cn('truncate', !selected && 'text-muted-foreground')}>
						{selected?.label || placeholder}
					</span>
					<ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[220px] p-0" align="start">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={searchPlaceholder || 'Search...'}
						value={search}
						onValueChange={setSearch}
						className="h-9 text-sm"
					/>
					<CommandList className="max-h-60 overflow-y-auto">
						{filtered.length === 0 ? (
							<CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
								No results found
							</CommandEmpty>
						) : (
							filtered.map(opt => (
								<CommandItem
									key={opt.value}
									value={opt.value}
									onSelect={() => { onValueChange(opt.value); setOpen(false); setSearch('') }}
									className="cursor-pointer text-sm"
								>
									<Check className={cn('mr-2 h-4 w-4 shrink-0', value === opt.value ? 'opacity-100' : 'opacity-0')} />
									{opt.label}
								</CommandItem>
							))
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

// Searchable multi-select combobox (same look, checkboxes + "N selected")
function MultiSearchableSelect({
	values, onValuesChange, placeholder, options, disabled, searchPlaceholder,
}: {
	values: string[]
	onValuesChange: (v: string[]) => void
	placeholder: string
	options: { value: string; label: string }[]
	disabled?: boolean
	searchPlaceholder?: string
}) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')
	const filtered = useMemo(() => {
		if (!search.trim()) return options
		const q = search.toLowerCase()
		return options.filter(o => o.label.toLowerCase().includes(q))
	}, [options, search])
	const allSelected = options.length > 0 && values.length === options.length
	const toggle = (v: string) =>
		onValuesChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v])
	const label =
		values.length === 0 ? placeholder : values.length === 1 ? values[0] : `${values.length} selected`

	return (
		<Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch('') }}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className="h-9 w-full justify-between rounded-md px-3 text-sm font-normal"
				>
					<span className={cn('truncate', values.length === 0 && 'text-muted-foreground')}>{label}</span>
					<ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[220px] p-0" align="start">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={searchPlaceholder || 'Search...'}
						value={search}
						onValueChange={setSearch}
						className="h-9 text-sm"
					/>
					<CommandList className="max-h-60 overflow-y-auto">
						{options.length > 0 && (
							<CommandItem
								value="__all"
								onSelect={() => onValuesChange(allSelected ? [] : options.map(o => o.value))}
								className="cursor-pointer text-sm font-medium"
							>
								<Check className={cn('mr-2 h-4 w-4 shrink-0', allSelected ? 'opacity-100' : 'opacity-0')} />
								{allSelected ? 'Clear all' : 'Select all'}
							</CommandItem>
						)}
						{filtered.length === 0 ? (
							<CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
								No results found
							</CommandEmpty>
						) : (
							filtered.map(opt => (
								<CommandItem
									key={opt.value}
									value={opt.value}
									onSelect={() => toggle(opt.value)}
									className="cursor-pointer text-sm"
								>
									<Checkbox checked={values.includes(opt.value)} className="mr-2 h-4 w-4" />
									{opt.label}
								</CommandItem>
							))
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

interface PaperDetail extends IaQuestionPaper {
	template_parts?: any[]
	course_outcomes?: { id: string; co_code: string; co_description?: string }[]
}

export default function QuestionPapersPage() {
	const { toast } = useToast()
	const { isReady, appendToUrl, mustSelectInstitution, institutionId, institutionCode } =
		useInstitutionFilter()
	const { user, hasAnyRole } = useAuth()

	// CoE and super_admin can edit a paper at any status — approved and locked
	// included. Everyone else is limited to draft/submitted.
	const canEditAnyStatus = user?.is_super_admin === true || hasAnyRole(['super_admin', 'coe'])

	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [localInstitutionId, setLocalInstitutionId] = useState('')
	const effectiveInstitutionId = institutionId || localInstitutionId || ''
	const effectiveInstitutionCode =
		institutionCode || institutions.find(i => i.id === effectiveInstitutionId)?.institution_code || ''

	const [sessions, setSessions] = useState<SessionOpt[]>([])
	const [programs, setPrograms] = useState<{ code: string; name: string }[]>([])
	const [boards, setBoards] = useState<BoardOpt[]>([])
	const [semesters, setSemesters] = useState<number[]>([])

	const [templates, setTemplates] = useState<TemplateOpt[]>([])
	// CIA rounds come from the CIA Setting (Internal Mark Entry Setting) configured for
	// this institution + exam session — never a hardcoded 1/2/3 list.
	const [ciaRounds, setCiaRounds] = useState<CiaRoundOpt[]>([])
	const [loadingCiaRounds, setLoadingCiaRounds] = useState(false)

	const [filterMode, setFilterMode] = useState<FilterMode>('program')
	const [sessionId, setSessionId] = useState('')
	const [selectedPrograms, setSelectedPrograms] = useState<string[]>([])
	const [selectedBoard, setSelectedBoard] = useState('')
	const [semester, setSemester] = useState('')
	const [ciaRound, setCiaRound] = useState('')
	const [templateId, setTemplateId] = useState('')

	// Every filter is mandatory before generating — Generate stays disabled until
	// all are set, and the button tooltip names what's still missing. (Program-wise only)
	const missingFilters = useMemo(() => {
		const missing: string[] = []
		if (mustSelectInstitution && !effectiveInstitutionId) missing.push('institution')
		if (!sessionId) missing.push('exam session')
		if (selectedPrograms.length === 0) missing.push('program(s)')
		if (!semester) missing.push('semester')
		if (!ciaRound) missing.push('CIA round')
		if (!templateId) missing.push('template')
		return missing
	}, [mustSelectInstitution, effectiveInstitutionId, sessionId, selectedPrograms, semester, ciaRound, templateId])

	const boardFiltersReady = useMemo(() => {
		if (mustSelectInstitution && !effectiveInstitutionId) return false
		return Boolean(sessionId && selectedBoard && semester && ciaRound)
	}, [mustSelectInstitution, effectiveInstitutionId, sessionId, selectedBoard, semester, ciaRound])

	const selectedTemplate = useMemo(
		() => templates.find(t => t.id === templateId) || null,
		[templates, templateId]
	)

	const selectedCiaRound = useMemo(
		() => ciaRounds.find(r => String(r.round) === ciaRound) || null,
		[ciaRounds, ciaRound]
	)

	const ciaRoundPlaceholder = !sessionId
		? 'Select session'
		: loadingCiaRounds
			? 'Loading...'
			: ciaRounds.length === 0
				? 'No rounds'
				: 'Round'

	const [papers, setPapers] = useState<IaQuestionPaper[]>([])
	const [loading, setLoading] = useState(false)
	const [generating, setGenerating] = useState(false)
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [downloadingZip, setDownloadingZip] = useState(false)
	const [downloadingZip2up, setDownloadingZip2up] = useState(false)

	// Authoring
	const [sheetOpen, setSheetOpen] = useState(false)
	const [paper, setPaper] = useState<PaperDetail | null>(null)
	const [questions, setQuestions] = useState<IaPaperQuestion[]>([])
	const [loadingPaper, setLoadingPaper] = useState(false)
	const [savingPaper, setSavingPaper] = useState(false)
	const [dirty, setDirty] = useState(false) // unsaved edits in the open paper
	const [savedInfo, setSavedInfo] = useState<string | null>(null)

	// ===== Load base data =====
	useEffect(() => {
		if (isReady) fetchInstitutions()
	}, [isReady])

	useEffect(() => {
		if (isReady && effectiveInstitutionId) fetchSessions()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isReady, effectiveInstitutionId])

	// Active CIA templates for the Template picker. Reset the choice when the
	// institution changes so a template from another institution can't linger.
	useEffect(() => {
		setTemplateId('')
		if (effectiveInstitutionCode) fetchTemplates()
		else setTemplates([])
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [effectiveInstitutionCode])

	useEffect(() => {
		if (effectiveInstitutionId && sessionId) fetchPrograms()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [effectiveInstitutionId, sessionId])

	// CIA rounds are defined per institution + exam session in the CIA Setting, and the
	// program-wise tab narrows them further to the settings covering the chosen programs.
	useEffect(() => {
		if (effectiveInstitutionId && sessionId) fetchCiaRounds()
		else setCiaRounds([])
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [effectiveInstitutionId, sessionId, filterMode, selectedPrograms.join(',')])

	// Keep the selection valid: drop a round the current setting no longer offers, and
	// preselect when there is only one round to choose.
	useEffect(() => {
		if (ciaRounds.length === 0) {
			setCiaRound('')
			return
		}
		if (!ciaRounds.some(r => String(r.round) === ciaRound)) {
			setCiaRound(String(ciaRounds[0].round))
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ciaRounds])

	useEffect(() => {
		setSelectedBoard('')
		setBoards([])
		if (effectiveInstitutionId) fetchBoards()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [effectiveInstitutionId])

	useEffect(() => {
		setSemester('')
		setSemesters([])
		setSelected([])
		if (filterMode === 'program') {
			if (effectiveInstitutionId && sessionId && selectedPrograms.length > 0) fetchProgramSemesters()
		} else if (filterMode === 'board') {
			if (effectiveInstitutionId && sessionId && selectedBoard) fetchBoardSemesters()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filterMode, selectedPrograms, selectedBoard, sessionId, effectiveInstitutionId])

	useEffect(() => {
		setSelected(new Set())
		// Without a round the API would list every round's papers — wait for the CIA
		// Setting to resolve one first.
		if (!effectiveInstitutionId || !sessionId || !ciaRound) {
			setPapers([])
			return
		}
		if (filterMode === 'program') {
			fetchPapers()
		} else if (filterMode === 'board' && selectedBoard && semester) {
			fetchPapers()
		} else {
			setPapers([])
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filterMode, effectiveInstitutionId, sessionId, selectedPrograms, selectedBoard, semester, ciaRound])

	const handleFilterModeChange = (mode: string) => {
		const next = mode === 'board' ? 'board' : 'program'
		setFilterMode(next)
		setSemester('')
		setSemesters([])
		setSelected(new Set())
		setPapers([])
		if (next === 'program') setSelectedBoard('')
		else setSelectedPrograms([])
	}

	const fetchInstitutions = async () => {
		try {
			const res = await fetch(appendToUrl('/api/pre-exam/internal-marks?action=institutions'))
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
			console.error(e)
		}
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch(`/api/examination-sessions?institutions_id=${effectiveInstitutionId}`)
			if (res.ok) {
				const data = await res.json()
				const list = data.data || data || []
				setSessions(
					list.map((s: any) => ({
						id: s.id,
						session_name: s.session_name,
						session_code: s.session_code,
					}))
				)
			}
		} catch (e) {
			console.error(e)
		}
	}

	// Active CIA templates (the API's exam_scope=cia also returns 'all'-scope ones).
	const fetchTemplates = async () => {
		try {
			const res = await fetch(
				`/api/pre-exam/question-paper-templates?institution_code=${encodeURIComponent(effectiveInstitutionCode)}&exam_scope=cia&status=active`
			)
			if (!res.ok) return
			const data = await res.json()
			const list: TemplateOpt[] = (Array.isArray(data) ? data : [])
				.filter((t: any) => t.is_active)
				.map((t: any) => ({
					id: t.id,
					template_name: t.template_name,
					template_code: t.template_code,
					course_type_applicability: t.course_type_applicability,
					total_marks: Number(t.total_marks) || 0,
				}))
			setTemplates(list)
			// Only one choice — pick it so the common case needs no extra click
			if (list.length === 1) setTemplateId(list[0].id)
		} catch (e) {
			console.error(e)
		}
	}

	// Rounds authored in the CIA Setting (cia_entry_settings.cia_rounds) for this
	// institution + session. Several settings can cover different programs, so rounds are
	// merged and de-duplicated by round number, keeping the first name seen.
	const fetchCiaRounds = async () => {
		try {
			setLoadingCiaRounds(true)
			const res = await fetch(
				`/api/pre-exam/cia-entry-settings?institutions_id=${effectiveInstitutionId}&examination_session_id=${sessionId}`
			)
			if (!res.ok) {
				setCiaRounds([])
				return
			}
			const settings = await res.json()
			const list: any[] = Array.isArray(settings) ? settings : []

			// Program-wise: only settings that apply to a selected program. A setting with no
			// program_codes applies to all of them.
			const scoped =
				filterMode === 'program' && selectedPrograms.length > 0
					? list.filter(sset => {
							const codes = Array.isArray(sset.program_codes) ? sset.program_codes : []
							return codes.length === 0 || codes.some((c: string) => selectedPrograms.includes(c))
						})
					: list

			const byRound = new Map<number, CiaRoundOpt>()
			for (const sset of scoped) {
				for (const r of (sset.cia_rounds || [])) {
					const round = Number(r?.round)
					if (!Number.isFinite(round) || round <= 0 || byRound.has(round)) continue
					byRound.set(round, { round, round_name: r?.round_name || `CIA ${round}` })
				}
			}
			setCiaRounds([...byRound.values()].sort((a, b) => a.round - b.round))
		} catch (e) {
			console.error(e)
			setCiaRounds([])
		} finally {
			setLoadingCiaRounds(false)
		}
	}

	const fetchPrograms = async () => {
		try {
			const res = await fetch(
				`/api/pre-exam/internal-mark-entry?action=filter-cascade&step=programs&institutions_id=${effectiveInstitutionId}&examination_session_id=${sessionId}`
			)
			const codes: string[] = res.ok ? await res.json() : []

			// Enrich codes with program names from the programs cache
			let nameByCode = new Map<string, string>()
			if (effectiveInstitutionCode) {
				try {
					const cacheRes = await fetch(
						`/api/master/programs-cache?institution_code=${encodeURIComponent(effectiveInstitutionCode)}`
					)
					if (cacheRes.ok) {
						const cached = await cacheRes.json()
						nameByCode = new Map(
							(Array.isArray(cached) ? cached : []).map((p: any) => [p.program_code, p.program_name])
						)
					}
				} catch {
					/* names optional */
				}
			}

			setPrograms(codes.map(code => ({ code, name: nameByCode.get(code) || code })))
		} catch (e) {
			console.error(e)
		}
	}

	const fetchBoards = async () => {
		try {
			const res = await fetch(
				`/api/master/boards?institutions_id=${encodeURIComponent(effectiveInstitutionId)}`
			)
			if (!res.ok) {
				setBoards([])
				return
			}
			const data = await res.json()
			const list: BoardOpt[] = (Array.isArray(data) ? data : [])
				.filter((b: any) => b.board_code && (b.is_active !== false && b.status !== false))
				.map((b: any) => ({
					board_code: b.board_code,
					board_name: b.board_name || b.board_code,
					board_type: b.board_type || '',
					board_order: b.board_order ?? 999,
				}))
				.sort(
					(a: BoardOpt, b: BoardOpt) =>
						(a.board_order ?? 999) - (b.board_order ?? 999) ||
						a.board_code.localeCompare(b.board_code)
				)
			setBoards(list)
		} catch (e) {
			console.error(e)
			setBoards([])
		}
	}

	const fetchProgramSemesters = async () => {
		try {
			// Union of semesters across all selected programs
			const lists = await Promise.all(
				selectedPrograms.map(async pc => {
					const res = await fetch(
						`/api/pre-exam/internal-mark-entry?action=filter-cascade&step=semesters&institutions_id=${effectiveInstitutionId}&examination_session_id=${sessionId}&program_code=${encodeURIComponent(pc)}`
					)
					return res.ok ? ((await res.json()) as number[]) : []
				})
			)
			const union = [...new Set(lists.flat())].sort((a, b) => a - b)
			setSemesters(union)
		} catch (e) {
			console.error(e)
		}
	}

	const fetchBoardSemesters = async () => {
		try {
			const res = await fetch(
				`/api/pre-exam/question-papers?action=board-semesters&institutions_id=${effectiveInstitutionId}&examination_session_id=${sessionId}&board_code=${encodeURIComponent(selectedBoard)}`
			)
			if (!res.ok) {
				setSemesters([])
				return
			}
			const data = await res.json()
			setSemesters(Array.isArray(data) ? data.map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => a - b) : [])
		} catch (e) {
			console.error(e)
			setSemesters([])
		}
	}

	const fetchPapers = async () => {
		try {
			setLoading(true)
			let url = `/api/pre-exam/question-papers?institutions_id=${effectiveInstitutionId}&examination_session_id=${sessionId}&cia_round=${ciaRound}`
			if (semester) url += `&semester=${semester}`
			if (filterMode === 'board' && selectedBoard) {
				url += `&board_code=${encodeURIComponent(selectedBoard)}`
			}
			const res = await fetch(url)
			if (res.ok) {
				let data: IaQuestionPaper[] = await res.json()
				if (filterMode === 'program' && selectedPrograms.length > 0) {
					data = data.filter(p => selectedPrograms.includes(p.program_code || ''))
				}
				setPapers(data)
			} else {
				setPapers([])
			}
		} catch (e) {
			console.error(e)
			setPapers([])
		} finally {
			setLoading(false)
		}
	}

	const generate = async () => {
		if (missingFilters.length > 0) {
			toast({ title: `Select ${missingFilters.join(', ')} first`, variant: 'destructive' })
			return
		}
		try {
			setGenerating(true)
			let created = 0
			let skipped = 0
			const failures: string[] = []
			// Courses no active template covers — surfaced so a missing template is obvious
			const notApplicable: string[] = []
			// Programs with no courses at all in this semester — expected, not a failure
			const noCourses: string[] = []
			let templatesCover = ''

			// One generate call per selected program (semester + round shared)
			for (const pc of selectedPrograms) {
				const res = await fetch('/api/pre-exam/question-papers', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						institutions_id: effectiveInstitutionId,
						examination_session_id: sessionId,
						program_code: pc,
						semester: Number(semester),
						cia_round: Number(ciaRound),
						cia_round_name: selectedCiaRound?.round_name || `CIA ${ciaRound}`,
						template_id: templateId,
					}),
				})
				const data = await res.json()
				if (!res.ok) {
					failures.push(`${pc}: ${data.error || 'failed'}`)
					continue
				}
				created += data.created || 0
				skipped += data.skipped || 0
				if (data.no_offerings) noCourses.push(pc)
				if (Array.isArray(data.not_applicable_courses)) notApplicable.push(...data.not_applicable_courses)
				if (data.templates_cover) templatesCover = data.templates_cover
			}

			if (failures.length > 0) {
				toast({
					title: `Generated ${created}, ${failures.length} program(s) failed`,
					description: failures.join(' · '),
					variant: created > 0 ? 'default' : 'destructive',
				})
			} else {
				toast({
					title:
						created > 0
							? `✓ Successfully generated ${created} paper${created === 1 ? '' : 's'}`
							: skipped > 0
								? `No new papers — ${skipped} already existed`
								: 'No papers generated',
					description: [
						created > 0 && skipped ? `${skipped} already existed` : '',
						notApplicable.length
							? `${notApplicable.length} skipped — no template for their course type${templatesCover ? ` (templates cover: ${templatesCover})` : ''}: ${notApplicable.slice(0, 5).join(', ')}${notApplicable.length > 5 ? '…' : ''}`
							: '',
						noCourses.length
							? `${noCourses.length} program(s) have no courses in Semester ${semester}`
							: '',
					]
						.filter(Boolean)
						.join(' · '),
				})
			}
			fetchPapers()
		} catch (e: any) {
			toast({ title: 'Generation failed', description: e.message, variant: 'destructive' })
		} finally {
			setGenerating(false)
		}
	}

	// ===== Authoring =====
	const openPaper = async (p: IaQuestionPaper) => {
		setSheetOpen(true)
		setLoadingPaper(true)
		setPaper(null)
		setQuestions([])
		setDirty(false)
		setSavedInfo(null)
		try {
			const res = await fetch(`/api/pre-exam/question-papers/${p.id}`)
			if (res.ok) {
				const data: PaperDetail = await res.json()
				setPaper(data)
				setQuestions(data.questions || [])
			}
		} catch (e) {
			console.error(e)
		} finally {
			setLoadingPaper(false)
		}
	}

	const editable = paper ? canEditAnyStatus || ['draft', 'submitted'].includes(paper.status) : false

	const updateQuestion = (qid: string, patch: Partial<IaPaperQuestion>) => {
		setDirty(true)
		setQuestions(prev => prev.map(q => (q.id === qid ? { ...q, ...patch } : q)))
	}

	const updateOption = (qid: string, key: string, patch: Partial<IaPaperQuestionOption>) => {
		setDirty(true)
		setQuestions(prev =>
			prev.map(q =>
				q.id === qid
					? { ...q, options: (q.options || []).map(o => (o.key === key ? { ...o, ...patch } : o)) }
					: q
			)
		)
	}

	// ===== Sub-divisions (12 a) i. / ii.) =====
	// The template fixes the slot's total marks; the author decides how to split it.
	const patchSubs = (qid: string, next: IaPaperSubQuestion[]) => {
		setDirty(true)
		setQuestions(prev =>
			prev.map(q => (q.id === qid ? { ...q, sub_questions: next.length > 0 ? relabelSubs(next) : null } : q))
		)
	}

	const addSubQuestion = (q: IaPaperQuestion) => {
		const subs = readSubQuestions(q)
		if (subs.length >= MAX_SUB_QUESTIONS) return
		const parentMarks = Number(q.marks) || 0
		// First split seeds two halves of the parent budget (8 + 7 for a 15-mark slot);
		// later additions come in at 0 so the author allocates deliberately.
		const seeded: IaPaperSubQuestion[] =
			subs.length === 0
				? [
					{ id: newId(), label: romanLabel(0), question_text: null, marks: Math.ceil(parentMarks / 2), co_code: q.co_code || null, k_level: q.k_level || null, display_order: 1 },
					{ id: newId(), label: romanLabel(1), question_text: null, marks: Math.floor(parentMarks / 2), co_code: q.co_code || null, k_level: q.k_level || null, display_order: 2 },
				]
				: [...subs, { id: newId(), label: romanLabel(subs.length), question_text: null, marks: 0, co_code: null, k_level: null, display_order: subs.length + 1 }]
		patchSubs(q.id, seeded)
	}

	const updateSubQuestion = (qid: string, subId: string, patch: Partial<IaPaperSubQuestion>) => {
		const q = questions.find(x => x.id === qid)
		if (!q) return
		patchSubs(qid, readSubQuestions(q).map(s => (s.id === subId ? { ...s, ...patch } : s)))
	}

	const removeSubQuestion = (qid: string, subId: string) => {
		const q = questions.find(x => x.id === qid)
		if (!q) return
		patchSubs(qid, readSubQuestions(q).filter(s => s.id !== subId))
	}

	// Blocks Save/Submit while any split question's marks don't add up to its parent.
	const subMarkErrors = useMemo(() => validateSubMarks(questions), [questions])

	const saveQuestions = async (nextStatus?: string) => {
		if (!paper) return
		if (editable && subMarkErrors.length > 0) {
			toast({
				title: 'Sub-division marks don’t add up',
				description: subMarkErrors.slice(0, 3).join(' · '),
				variant: 'destructive',
			})
			return
		}
		try {
			setSavingPaper(true)
			const res = await fetch(`/api/pre-exam/question-papers/${paper.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					questions: editable ? questions : undefined,
					subject_title: paper.subject_title,
					exam_date: paper.exam_date,
					default_font: paper.default_font ?? null, // paper-wide common font
					base_updated_at: paper.updated_at, // optimistic-concurrency token
					...(nextStatus ? { status: nextStatus } : {}),
				}),
			})
			const data = await res.json()
			if (res.status === 409) {
				toast({
					title: 'Not saved — paper changed elsewhere',
					description: 'Reopen this paper to get the latest version, then re-enter.',
					variant: 'destructive',
				})
				return
			}
			if (!res.ok) throw new Error(data.error || 'Save failed')
			const savedN = typeof data.saved_count === 'number' ? data.saved_count : null
			toast({
				title: nextStatus ? `Paper ${nextStatus}` : 'Saved ✓',
				description: !nextStatus && savedN !== null ? `${savedN} question(s) saved` : undefined,
			})
			if (nextStatus) {
				setDirty(false)
				setSheetOpen(false)
				fetchPapers()
			} else if (data) {
				// Merge: the PUT response has no template_parts / course_outcomes — keep them
				setPaper(prev =>
					prev
						? { ...prev, ...data, template_parts: prev.template_parts, course_outcomes: prev.course_outcomes }
						: data
				)
				setQuestions(data.questions || questions)
				setDirty(false)
				setSavedInfo(`Saved ${savedN ?? ''} answer(s)`.replace('  ', ' '))
			}
		} catch (e: any) {
			toast({ title: 'Save failed', description: e.message, variant: 'destructive' })
		} finally {
			setSavingPaper(false)
		}
	}

	// Only papers with authored questions can be selected / downloaded
	const selectablePapers = papers.filter(p => p.authored)
	const allSelected = selectablePapers.length > 0 && selectablePapers.every(p => selected.has(p.id))
	const toggleSelect = (id: string) =>
		setSelected(prev => {
			const next = new Set(prev)
			next.has(id) ? next.delete(id) : next.add(id)
			return next
		})
	const toggleSelectAll = () =>
		setSelected(allSelected ? new Set() : new Set(selectablePapers.map(p => p.id)))

	const downloadSelectedZip = async (layout: 'single' | '2up' = 'single') => {
		// Board-wise: if nothing selected but filters are ready, download all authored papers listed
		let chosen = papers.filter(p => selected.has(p.id))
		if (chosen.length === 0 && filterMode === 'board') {
			if (!boardFiltersReady) {
				toast({
					title: 'Select board filters first',
					description: 'Institution, Exam Session, Board, Semester and CIA Round are required.',
					variant: 'destructive',
				})
				return
			}
			chosen = selectablePapers
			if (chosen.length === 0) {
				toast({
					title: 'No authored papers to download',
					description: 'Only papers with questions entered can be downloaded.',
					variant: 'destructive',
				})
				return
			}
		} else if (chosen.length === 0) {
			toast({ title: 'Select at least one paper', variant: 'destructive' })
			return
		}
		const setLoading = layout === '2up' ? setDownloadingZip2up : setDownloadingZip
		try {
			setLoading(true)
			const JSZip = (await import('jszip')).default
			const zip = new JSZip()
			let ok = 0
			for (const [i, p] of chosen.entries()) {
				const apiUrl = `/api/pre-exam/question-papers/${p.id}/pdf${layout === '2up' ? '?layout=2up' : ''}`
				const res = await fetch(apiUrl)
				if (!res.ok) continue
				const blob = await res.blob()
				// Same name as a single download, with an index prefix so the ZIP keeps
				// the on-screen order and two papers can never collide inside it.
				const name = `${String(i + 1).padStart(3, '0')}_${paperPdfFilename(p, { variant: layout })}`
				zip.file(name, blob)
				ok++
			}
			const content = await zip.generateAsync({ type: 'blob' })
			const objectUrl = URL.createObjectURL(content)
			const a = document.createElement('a')
			a.href = objectUrl
			const boardSuffix =
				filterMode === 'board' && selectedBoard ? `_${selectedBoard}` : ''
			a.download = `question-papers-CIA${ciaRound}${boardSuffix}${layout === '2up' ? '-2up' : ''}.zip`
			document.body.appendChild(a)
			a.click()
			a.remove()
			URL.revokeObjectURL(objectUrl)
			toast({ title: `Downloaded ${ok} paper(s)${layout === '2up' ? ' (2-up print layout)' : ''}` })
		} catch (e: any) {
			toast({ title: 'Download failed', description: e.message, variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}

	const [rebuildingAll, setRebuildingAll] = useState(false)
	const rebuildAll = async () => {
		const drafts = papers.filter(p => p.status === 'draft')
		if (drafts.length === 0) {
			toast({ title: 'No draft papers to rebuild', description: 'Only draft papers can be rebuilt.' })
			return
		}
		if (!confirm(`Rebuild ${drafts.length} draft paper(s)? Papers that already have questions entered are kept untouched.`)) return
		try {
			setRebuildingAll(true)
			let ok = 0
			let kept = 0
			let fail = 0
			for (const p of drafts) {
				try {
					const res = await fetch(`/api/pre-exam/question-papers/${p.id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ regenerate: true }), // no force → authored papers preserved
					})
					if (res.ok) ok++
					else if (res.status === 409) kept++
					else fail++
				} catch {
					fail++
				}
			}
			toast({
				title: `Rebuilt ${ok} paper(s)`,
				description: [kept ? `${kept} kept (already authored)` : '', fail ? `${fail} failed` : '']
					.filter(Boolean)
					.join(' · ') || undefined,
			})
			fetchPapers()
		} finally {
			setRebuildingAll(false)
		}
	}

	// ── Course Outcomes management (per course) ──
	const [newCoCode, setNewCoCode] = useState('')
	const [newCoDesc, setNewCoDesc] = useState('')
	const [showCoManager, setShowCoManager] = useState(false)

	const refreshCourseOutcomes = async () => {
		if (!paper?.course_id) return
		const res = await fetch(`/api/pre-exam/course-outcomes?course_id=${paper.course_id}`)
		if (res.ok) {
			const cos = await res.json()
			setPaper(prev => (prev ? { ...prev, course_outcomes: cos } : prev))
		}
	}

	const addCO = async (code?: string, desc?: string) => {
		if (!paper?.course_id) return
		const co_code = (code ?? newCoCode).trim()
		if (!co_code) return
		try {
			const res = await fetch('/api/pre-exam/course-outcomes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: paper.institutions_id,
					course_id: paper.course_id,
					course_code: paper.course_code,
					co_code,
					co_description: desc ?? newCoDesc,
					display_order: (paper.course_outcomes?.length || 0) + 1,
				}),
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data.error || 'Add failed')
			setNewCoCode('')
			setNewCoDesc('')
			await refreshCourseOutcomes()
		} catch (e: any) {
			toast({ title: 'Could not add CO', description: e.message, variant: 'destructive' })
		}
	}

	const seedDefaultCOs = async () => {
		if (!paper?.course_id) return
		try {
			const outcomes = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5'].map((c, i) => ({ co_code: c, display_order: i + 1 }))
			const res = await fetch('/api/pre-exam/course-outcomes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: paper.institutions_id,
					course_id: paper.course_id,
					course_code: paper.course_code,
					outcomes,
				}),
			})
			if (!res.ok) {
				const d = await res.json()
				throw new Error(d.error || 'Failed')
			}
			await refreshCourseOutcomes()
			toast({ title: 'Added CO1–CO5' })
		} catch (e: any) {
			toast({ title: 'Could not add COs', description: e.message, variant: 'destructive' })
		}
	}

	const deleteCO = async (coId: string) => {
		try {
			await fetch(`/api/pre-exam/course-outcomes?id=${coId}`, { method: 'DELETE' })
			await refreshCourseOutcomes()
		} catch (e) {
			console.error(e)
		}
	}

	const downloadPdf = async (
		p: { id: string; course_code?: string; subject_title?: string; cia_round?: number; cia_round_name?: string; set_label?: string },
		layout: 'single' | '2up' = 'single'
	) => {
		try {
			const url = `/api/pre-exam/question-papers/${p.id}/pdf${layout === '2up' ? '?layout=2up' : ''}`
			const res = await fetch(url)
			if (!res.ok) {
				let msg = `PDF failed (${res.status})`
				try { const d = await res.json(); if (d?.error) msg = d.error } catch { /* not json */ }
				throw new Error(msg)
			}
			const blob = await res.blob()
			const objectUrl = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = objectUrl
			// "<course code> - <course name> - <assessment>.pdf"
			a.download = paperPdfFilename(p, { variant: layout })
			document.body.appendChild(a)
			a.click()
			a.remove()
			URL.revokeObjectURL(objectUrl)
		} catch (e: any) {
			toast({ title: 'PDF download failed', description: e.message, variant: 'destructive' })
		}
	}

	const rebuildPaper = async (force = false) => {
		if (!paper) return
		if (!force && !confirm('Rebuild question slots from the current template? Any answered questions are kept.')) return
		try {
			setSavingPaper(true)
			const res = await fetch(`/api/pre-exam/question-papers/${paper.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ regenerate: true, ...(force ? { force: true } : {}) }),
			})
			const data = await res.json()
			if (res.status === 409 && data.error === 'AUTHORED') {
				if (confirm('This paper already has questions. Rebuild will refresh the structure and KEEP your answers. Continue?')) {
					await rebuildPaper(true)
				}
				return
			}
			if (!res.ok) throw new Error(data.error || 'Rebuild failed')
			setPaper(prev => (prev ? { ...prev, ...data, template_parts: prev.template_parts, course_outcomes: prev.course_outcomes } : data))
			setQuestions(data.questions || [])
			toast({ title: 'Rebuilt from template' })
		} catch (e: any) {
			toast({ title: 'Rebuild failed', description: e.message, variant: 'destructive' })
		} finally {
			setSavingPaper(false)
		}
	}

	const setStatus = async (p: IaQuestionPaper, status: string) => {
		try {
			const res = await fetch(`/api/pre-exam/question-papers/${p.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status }),
			})
			if (!res.ok) {
				const d = await res.json()
				throw new Error(d.error || 'Update failed')
			}
			toast({ title: `Paper ${status}` })
			fetchPapers()
		} catch (e: any) {
			toast({ title: 'Update failed', description: e.message, variant: 'destructive' })
		}
	}

	const removePaper = async (p: IaQuestionPaper) => {
		if (!confirm(`Delete paper for ${p.course_code} (Set ${p.set_label || 'A'})?`)) return
		try {
			const res = await fetch(`/api/pre-exam/question-papers/${p.id}`, { method: 'DELETE' })
			if (!res.ok) {
				const d = await res.json()
				throw new Error(d.error || 'Delete failed')
			}
			toast({ title: 'Paper deleted' })
			fetchPapers()
		} catch (e: any) {
			toast({ title: 'Delete failed', description: e.message, variant: 'destructive' })
		}
	}

	const statusBadge = (status: string) => {
		const map: Record<string, string> = {
			draft: 'bg-amber-100 text-amber-700 border-amber-200',
			submitted: 'bg-blue-100 text-blue-700 border-blue-200',
			approved: 'bg-green-100 text-green-700 border-green-200',
			locked: 'bg-gray-200 text-gray-700 border-gray-300',
		}
		return <Badge variant="outline" className={map[status] || ''}>{status}</Badge>
	}

	// Group authoring questions by part
	const groupedQuestions = useMemo(() => {
		const map = new Map<string, IaPaperQuestion[]>()
		for (const q of questions) {
			const key = q.part_label || '—'
			if (!map.has(key)) map.set(key, [])
			map.get(key)!.push(q)
		}
		return map
	}, [questions])

	const partByLabel = useMemo(() => {
		const m = new Map<string, any>()
		for (const p of paper?.template_parts || []) m.set(p.part_label, p)
		return m
	}, [paper])

	// CO options: defined COs for the course, else CO1–CO6 defaults so selection is never blocked
	const coOptions = useMemo(() => {
		const defined = (paper?.course_outcomes || []).map(c => c.co_code)
		return defined.length > 0 ? defined : ['CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6']
	}, [paper])

	// True once any question text/option has been entered — Rebuild is hidden for such papers
	const hasAuthored = useMemo(
		() =>
			questions.some(
				q =>
					(q.question_text || '').trim() !== '' ||
					(q.options || []).some(o => (o.text || '').trim() !== '') ||
					readSubQuestions(q).some(sb => (sb.question_text || '').trim() !== '')
			),
		[questions]
	)

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
								<BreadcrumbPage>Question Papers</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					<div>
						<h1 className="text-2xl font-semibold flex items-center gap-2">
							<FileText className="h-6 w-6 text-primary" /> Question Papers
						</h1>
						<p className="text-sm text-muted-foreground">
							Generate papers from templates for registered courses, then author the questions.
							Use Board-wise to download papers by board.
						</p>
					</div>

					<Tabs value={filterMode} onValueChange={handleFilterModeChange} className="space-y-4">
						<TabsList className="grid w-full max-w-md grid-cols-2 bg-slate-100 dark:bg-slate-800/60 p-1 h-10 rounded-lg">
							<TabsTrigger
								value="program"
								className="text-xs gap-1.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[state=active]:font-semibold dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-white"
							>
								<GraduationCap className="h-3.5 w-3.5" />
								Program-wise
							</TabsTrigger>
							<TabsTrigger
								value="board"
								className="text-xs gap-1.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[state=active]:font-semibold dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-white"
							>
								<Layers className="h-3.5 w-3.5" />
								Board-wise
							</TabsTrigger>
						</TabsList>

						{/* Program-wise: generate + filter */}
						<TabsContent value="program" className="mt-0 space-y-4">
							<Card>
								<CardContent className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2 lg:grid-cols-6">
									{mustSelectInstitution && (
										<div>
											<Label className="text-xs">Institution</Label>
											<SearchableSelect
												value={localInstitutionId}
												onValueChange={setLocalInstitutionId}
												placeholder="Select institution"
												searchPlaceholder="Search institution..."
												options={institutions.map(i => ({ value: i.id, label: `${i.name} (${i.institution_code})` }))}
											/>
										</div>
									)}
									<div>
										<Label className="text-xs">Exam Session</Label>
										<SearchableSelect
											value={sessionId}
											onValueChange={v => {
												setSessionId(v)
												setSelectedPrograms([])
												setSemester('')
											}}
											placeholder="Select session"
											searchPlaceholder="Search session..."
											options={sessions.map(s => ({ value: s.id, label: s.session_name }))}
										/>
									</div>
									<div>
										<Label className="text-xs">Program(s)</Label>
										<MultiSearchableSelect
											values={selectedPrograms}
											onValuesChange={setSelectedPrograms}
											placeholder="Select programs"
											searchPlaceholder="Search program..."
											disabled={!sessionId}
											options={programs.map(p => ({
												value: p.code,
												label: p.name && p.name !== p.code ? `${p.code} - ${p.name}` : p.code,
											}))}
										/>
									</div>
									<div>
										<Label className="text-xs">Semester</Label>
										<SearchableSelect
											value={semester}
											onValueChange={setSemester}
											placeholder="Sem"
											searchPlaceholder="Search semester..."
											disabled={selectedPrograms.length === 0}
											options={semesters.map(s => ({ value: String(s), label: `Semester ${s}` }))}
										/>
									</div>
									<div>
										<Label className="text-xs">CIA Round</Label>
										<SearchableSelect
											value={ciaRound}
											onValueChange={setCiaRound}
											placeholder={ciaRoundPlaceholder}
											searchPlaceholder="Search round..."
											disabled={ciaRounds.length === 0}
											options={ciaRounds.map(r => ({ value: String(r.round), label: r.round_name }))}
										/>
									</div>
									<div>
										<Label className="text-xs">Template</Label>
										<SearchableSelect
											value={templateId}
											onValueChange={setTemplateId}
											placeholder={templates.length === 0 ? 'No active template' : 'Select template'}
											searchPlaceholder="Search template..."
											disabled={!ciaRound || templates.length === 0}
											options={templates.map(t => ({
												value: t.id,
												label: `${t.template_name} · ${formatApplicability(t.course_type_applicability)}`,
											}))}
										/>
									</div>
									<div className="flex items-end">
										<Button
											onClick={generate}
											disabled={generating || missingFilters.length > 0}
											className="w-full"
											title={missingFilters.length > 0 ? `Select ${missingFilters.join(', ')} first` : undefined}
										>
											{generating ? (
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											) : (
												<Wand2 className="mr-2 h-4 w-4" />
											)}
											Generate
										</Button>
									</div>

									{sessionId && !loadingCiaRounds && ciaRounds.length === 0 && (
										<p className="col-span-full text-xs text-amber-600">
											No CIA rounds configured for this exam session — add them in Internal Mark Entry Setting
											for this institution and session.
										</p>
									)}
									{templates.length === 0 ? (
										<p className="col-span-full text-xs text-amber-600">
											No active CIA template for this institution — create one in Question Paper Templates and
											set its status to Active.
										</p>
									) : selectedTemplate ? (
										<p className="col-span-full text-xs text-muted-foreground">
											<span className="font-medium text-foreground">{selectedTemplate.template_name}</span>{' '}
											applies to{' '}
											<span className="font-medium text-foreground">
												{formatApplicability(selectedTemplate.course_type_applicability)}
											</span>{' '}
											courses · {selectedTemplate.total_marks} marks. Courses of any other type are skipped.
										</p>
									) : null}
								</CardContent>
							</Card>
						</TabsContent>

						{/* Board-wise: filter + download only */}
						<TabsContent value="board" className="mt-0 space-y-4">
							<Card>
								<CardContent className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2 lg:grid-cols-5">
									{mustSelectInstitution && (
										<div>
											<Label className="text-xs">Institution</Label>
											<SearchableSelect
												value={localInstitutionId}
												onValueChange={setLocalInstitutionId}
												placeholder="Select institution"
												searchPlaceholder="Search institution..."
												options={institutions.map(i => ({ value: i.id, label: `${i.name} (${i.institution_code})` }))}
											/>
										</div>
									)}
									<div>
										<Label className="text-xs">Exam Session</Label>
										<SearchableSelect
											value={sessionId}
											onValueChange={v => {
												setSessionId(v)
												setSelectedBoard('')
												setSemester('')
											}}
											placeholder="Select session"
											searchPlaceholder="Search session..."
											options={sessions.map(s => ({ value: s.id, label: s.session_name }))}
										/>
									</div>
									<div>
										<Label className="text-xs">Board</Label>
										<SearchableSelect
											value={selectedBoard}
											onValueChange={v => {
												setSelectedBoard(v)
												setSemester('')
											}}
											placeholder="Select board"
											searchPlaceholder="Search board..."
											disabled={!sessionId || boards.length === 0}
											options={boards.map(b => ({
												value: b.board_code,
												label: b.board_type
													? `${b.board_code} - ${b.board_name} (${b.board_type})`
													: `${b.board_code} - ${b.board_name}`,
											}))}
										/>
									</div>
									<div>
										<Label className="text-xs">Semester</Label>
										<SearchableSelect
											value={semester}
											onValueChange={setSemester}
											placeholder="Sem"
											searchPlaceholder="Search semester..."
											disabled={!selectedBoard}
											options={semesters.map(s => ({ value: String(s), label: `Semester ${s}` }))}
										/>
									</div>
									<div>
										<Label className="text-xs">CIA Round</Label>
										<SearchableSelect
											value={ciaRound}
											onValueChange={setCiaRound}
											placeholder={ciaRoundPlaceholder}
											searchPlaceholder="Search round..."
											disabled={ciaRounds.length === 0}
											options={ciaRounds.map(r => ({ value: String(r.round), label: r.round_name }))}
										/>
									</div>
									{sessionId && !loadingCiaRounds && ciaRounds.length === 0 && (
										<p className="col-span-full text-xs text-amber-600">
											No CIA rounds configured for this exam session — add them in Internal Mark Entry Setting
											for this institution and session.
										</p>
									)}
									<p className="col-span-full text-xs text-muted-foreground">
										Select filters, then use Download / 2-up ZIP below. If nothing is checked, all authored
										papers for this board are downloaded.
									</p>
								</CardContent>
							</Card>
						</TabsContent>
					</Tabs>

					{/* Papers table */}
					<Card>
						<CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3">
							<span className="text-sm font-medium">
								{papers.length} paper{papers.length === 1 ? '' : 's'}
								{filterMode === 'board' && selectedBoard && (
									<span className="ml-2 text-muted-foreground">· {selectedBoard}</span>
								)}
								{selected.size > 0 && (
									<span className="ml-2 text-primary">· {selected.size} selected</span>
								)}
								{papers.some(p => p.status === 'draft') && (
									<span className="ml-2 text-muted-foreground">
										· {papers.filter(p => p.status === 'draft').length} draft
									</span>
								)}
							</span>
							<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => downloadSelectedZip('single')}
								disabled={
									downloadingZip ||
									(filterMode === 'board'
										? !boardFiltersReady || selectablePapers.length === 0
										: selected.size === 0)
								}
								title={
									filterMode === 'board'
										? selected.size === 0
											? 'Download all authored papers for this board as a ZIP (A4 portrait)'
											: 'Download selected papers as a ZIP (A4 portrait)'
										: 'Download selected papers as a ZIP (A4 portrait)'
								}
							>
								{downloadingZip ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Download className="mr-2 h-4 w-4" />
								)}
								Download (
								{filterMode === 'board' && selected.size === 0
									? selectablePapers.length
									: selected.size}
								)
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => downloadSelectedZip('2up')}
								disabled={
									downloadingZip2up ||
									(filterMode === 'board'
										? !boardFiltersReady || selectablePapers.length === 0
										: selected.size === 0)
								}
								title={
									filterMode === 'board'
										? selected.size === 0
											? 'Download all authored papers for this board as 2-up ZIP'
											: 'Download selected papers as 2-up print layout ZIP'
										: 'Download selected papers as 2-up print layout (A4 landscape, 2 copies side-by-side) — ZIP'
								}
							>
								{downloadingZip2up ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<Download className="mr-2 h-4 w-4" />
								)}
								2-up ZIP (
								{filterMode === 'board' && selected.size === 0
									? selectablePapers.length
									: selected.size}
								)
							</Button>
								{filterMode === 'program' && (
								<Button
									variant="outline"
									size="sm"
									onClick={rebuildAll}
									disabled={rebuildingAll || !papers.some(p => p.status === 'draft')}
									title="Rebuild all draft papers from their templates"
								>
									{rebuildingAll ? (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									) : (
										<RefreshCw className="mr-2 h-4 w-4" />
									)}
									Rebuild All
								</Button>
								)}
							</div>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" /></TableHead>
											<TableHead className="w-12">S.No</TableHead>
											<TableHead>Course</TableHead>
										<TableHead>Course Name</TableHead>
										<TableHead>Program</TableHead>
										<TableHead>Sem</TableHead>
										<TableHead>Set</TableHead>
										<TableHead className="text-right">Max</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="w-10" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{loading ? (
										<TableRow>
											<TableCell colSpan={10} className="py-10 text-center">
												<Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
											</TableCell>
										</TableRow>
									) : papers.length === 0 ? (
										<TableRow>
											<TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
												{filterMode === 'board'
													? boardFiltersReady
														? 'No papers for this board / semester / CIA round.'
														: selectedBoard && semesters.length === 0
															? 'No course offerings found for this board in the selected session. Check that courses have board_code or board_id set.'
															: 'Select Exam Session, Board, Semester and CIA Round to list papers.'
													: 'No papers. Pick a session/program/semester and click Generate.'}
											</TableCell>
										</TableRow>
									) : (
										papers.map((p, idx) => (
											<TableRow key={p.id} data-state={selected.has(p.id) ? 'selected' : undefined}>
												<TableCell>
													<Checkbox
														checked={selected.has(p.id)}
														onCheckedChange={() => toggleSelect(p.id)}
														disabled={!p.authored}
														aria-label={`Select ${p.course_code}`}
													/>
												</TableCell>
												<TableCell className="text-muted-foreground">{idx + 1}</TableCell>
												<TableCell className="font-medium">{p.course_code}</TableCell>
												<TableCell className="max-w-[220px] truncate">{p.subject_title}</TableCell>
												<TableCell>{p.program_code}</TableCell>
												<TableCell>{p.semester}</TableCell>
												<TableCell>{p.set_label || 'A'}</TableCell>
												<TableCell className="text-right">{Number(p.max_marks) || 0}</TableCell>
												<TableCell>{statusBadge(p.status)}</TableCell>
												<TableCell>
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button variant="ghost" size="icon">
																<MoreHorizontal className="h-4 w-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem onClick={() => openPaper(p)}>
																<FileText className="mr-2 h-4 w-4" /> Author
															</DropdownMenuItem>
															<DropdownMenuItem onClick={() => downloadPdf(p)} disabled={!p.authored}>
																<FileDown className="mr-2 h-4 w-4" /> Export PDF
															</DropdownMenuItem>
															<DropdownMenuItem onClick={() => downloadPdf(p, '2up')} disabled={!p.authored}>
																<FileDown className="mr-2 h-4 w-4" /> Export PDF (2-up)
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															{p.status === 'submitted' && (
																<DropdownMenuItem onClick={() => setStatus(p, 'approved')}>
																	<CheckCircle2 className="mr-2 h-4 w-4" /> Approve
																</DropdownMenuItem>
															)}
															{p.status === 'approved' && (
																<DropdownMenuItem onClick={() => setStatus(p, 'locked')}>
																	<Lock className="mr-2 h-4 w-4" /> Lock
																</DropdownMenuItem>
															)}
															{(p.status !== 'locked' || canEditAnyStatus) && (
																<DropdownMenuItem className="text-destructive" onClick={() => removePaper(p)}>
																	<Trash2 className="mr-2 h-4 w-4" /> Delete
																</DropdownMenuItem>
															)}
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
				</div>
				<AppFooter />
			</SidebarInset>

			{/* ===== AUTHORING SHEET ===== */}
			<Sheet
				open={sheetOpen}
				onOpenChange={open => {
					if (!open && dirty && !confirm('You have unsaved changes. Close without saving?')) return
					setSheetOpen(open)
				}}
			>
				<SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
					<SheetHeader>
						<SheetTitle className="flex items-center gap-2">
							{paper ? `${paper.course_code} — ${paper.subject_title || ''}` : 'Question Paper'}
							{dirty ? (
								<span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-700">
									● Unsaved
								</span>
							) : savedInfo ? (
								<span className="rounded bg-green-100 px-2 py-0.5 text-xs font-normal text-green-700">
									✓ {savedInfo}
								</span>
							) : null}
						</SheetTitle>
						{/* Default language/font for the whole paper — asked once, here in
						    the heading, and inherited by every question & option (new ones
						    included). Persisted on Save. */}
						{paper && !loadingPaper && (
							<div className="flex flex-wrap items-center gap-2">
								<Label className="whitespace-nowrap text-xs font-semibold">Default Language</Label>
								<Select
									value={paper.default_font || 'default'}
									onValueChange={v => {
										setDirty(true)
										setPaper({ ...paper, default_font: v === 'default' ? null : v })
									}}
									disabled={!editable}
								>
									<SelectTrigger className="h-8 w-[170px] text-xs">
										<SelectValue placeholder="Default" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="default" className="text-xs">Default (English)</SelectItem>
										{TAMIL_FONT_FAMILIES.map(f => (
											<SelectItem key={f.id} value={f.cssName} className="text-xs">
												{f.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<span className="text-xs text-muted-foreground">
									Applies to every question &amp; option in this paper · Save to keep.
								</span>
							</div>
						)}
					</SheetHeader>

					{loadingPaper ? (
						<div className="py-16 text-center">
							<Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : paper ? (
						<div className="mt-4 space-y-4 pb-8">
							<div className="flex flex-wrap items-center gap-3 text-sm">
								{statusBadge(paper.status)}
								<span className="text-muted-foreground">
									Set {paper.set_label || 'A'} · Max {Number(paper.max_marks) || 0}
								</span>
								{!editable ? (
									<span className="text-xs text-muted-foreground">(read-only — {paper.status})</span>
								) : canEditAnyStatus && !['draft', 'submitted'].includes(paper.status) ? (
									<span className="text-xs text-amber-700">
										(editing a {paper.status} paper — CoE override)
									</span>
								) : null}
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div>
									<Label className="text-xs">Course Name</Label>
									<Input
										value={paper.subject_title || ''}
										onChange={e => { setDirty(true); setPaper({ ...paper, subject_title: e.target.value }) }}
									/>
								</div>
								<div>
									<Label className="text-xs">Exam Date</Label>
									<Input
										type="date"
										value={paper.exam_date ? paper.exam_date.slice(0, 10) : ''}
										disabled={!editable}
										onChange={e => { setDirty(true); setPaper({ ...paper, exam_date: e.target.value }) }}
									/>
								</div>
							</div>

							{/* Course Outcomes manager (collapsed by default) */}
							<div className="rounded-md border p-3">
								<button
									type="button"
									className="flex w-full items-center justify-between"
									onClick={() => setShowCoManager(o => !o)}
								>
									<Label className="cursor-pointer text-xs font-semibold">
										Course Outcomes ({paper.course_outcomes?.length || 0}) — {paper.course_code}
									</Label>
									<ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
								</button>
								{showCoManager && (
									<div className="mt-3">
										{(paper.course_outcomes?.length || 0) === 0 ? (
											<div className="mb-2 flex items-center justify-between gap-2">
												<p className="text-xs text-muted-foreground">
													No COs for this course yet — dropdowns fall back to CO1–CO6.
												</p>
												<Button variant="outline" size="sm" onClick={seedDefaultCOs}>
													<Plus className="mr-1 h-3 w-3" /> Add CO1–CO5
												</Button>
											</div>
										) : (
											<div className="mb-2 flex flex-wrap gap-2">
												{(paper.course_outcomes || []).map(co => (
													<span
														key={co.id}
														className="inline-flex items-center gap-1 rounded border bg-muted/40 px-2 py-1 text-xs"
														title={co.co_description || ''}
													>
														<span className="font-medium">{co.co_code}</span>
														{co.co_description ? (
															<span className="max-w-[160px] truncate text-muted-foreground">
																{co.co_description}
															</span>
														) : null}
														<button
															type="button"
															className="text-destructive hover:opacity-70"
															onClick={() => deleteCO(co.id)}
														>
															<X className="h-3 w-3" />
														</button>
													</span>
												))}
											</div>
										)}
										<div className="flex items-center gap-2">
											<Input
												className="h-8 w-24"
												placeholder="CO code"
												value={newCoCode}
												onChange={e => setNewCoCode(e.target.value)}
											/>
											<Input
												className="h-8 flex-1"
												placeholder="Description (optional)"
												value={newCoDesc}
												onChange={e => setNewCoDesc(e.target.value)}
											/>
											<Button size="sm" variant="outline" onClick={() => addCO()} disabled={!newCoCode.trim()}>
												<Plus className="h-4 w-4" />
											</Button>
										</div>
									</div>
								)}
							</div>

							<p className="rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
								Click <span className="font-medium text-foreground">Save</span> to persist questions — the header shows
								<span className="text-green-700"> ✓ Saved N answer(s)</span>. Once a paper has entered questions,
								<span className="font-medium text-foreground"> Rebuild will not erase it</span> (Rebuild All skips it; per-paper Rebuild asks to confirm).
							</p>

							{[...groupedQuestions.entries()].map(([label, qs]) => {
								const part = partByLabel.get(label)
								// "Answer any N": only num_to_answer questions count toward marks
								const answerCount =
									part && Number(part.num_to_answer) > 0 ? Number(part.num_to_answer) : part?.num_questions
								return (
									<div key={label} className="rounded-md border">
										<div className="border-b bg-muted/40 px-3 py-2">
											<div className="flex items-center justify-between">
												<div className="text-sm font-semibold">
													PART {label}
													{part
														? ` — (${answerCount} x ${part.marks_per_question} = ${answerCount * part.marks_per_question})${
															answerCount < part.num_questions ? ` · answer ${answerCount} of ${part.num_questions}` : ''
														}`
														: ''}
												</div>
												{part && (
													<Badge
														variant="outline"
														className={
															part.has_choice
																? 'bg-green-100 text-green-700 border-green-200'
																: 'text-muted-foreground'
														}
													>
														{part.has_choice ? 'Choice (OR): On' : 'Choice (OR): Off'}
													</Badge>
												)}
											</div>
											{part?.instruction && (
												<div className="text-xs text-muted-foreground">{part.instruction}</div>
											)}
											{part && !part.has_choice && (
												<div className="mt-1 text-[11px] text-amber-600">
													No (OR) — enable “Choice (OR)” on this part in Question Paper Templates, then Rebuild.
												</div>
											)}
										</div>
										<div className="space-y-3 p-3">
											{qs.map(q => {
												// Sub-divisions: the template fixes this slot's marks; the author
												// splits that budget across i. / ii. — it must add up exactly.
												const subs = readSubQuestions(q)
												const split = subs.length > 0
												const budget = Number(q.marks) || 0
												const allocated = subTotal(subs)
												const balanced = allocated === budget && subs.every(sb => sb.marks != null)
												const splittable = canSplit(q)
												return (
												<div key={q.id} className="rounded border bg-background p-2">
													<div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
														<span className="font-medium text-foreground">
															{q.is_choice_alternative ? '(OR) ' : ''}Q{q.question_number}
															{q.sub_label ? ` ${q.sub_label})` : ''}
														</span>
														<span>· {budget} marks</span>
														{split && (
															<Badge
																variant="outline"
																className={
																	balanced
																		? 'bg-green-100 text-green-700 border-green-200'
																		: 'bg-red-100 text-red-700 border-red-200'
																}
															>
																{subs.length} sub-division{subs.length > 1 ? 's' : ''} · {allocated}/{budget}
															</Badge>
														)}
														{editable && splittable && (
															<Button
																size="sm"
																variant="ghost"
																className="ml-auto h-6 px-2 text-xs"
																disabled={subs.length >= MAX_SUB_QUESTIONS}
																onClick={() => addSubQuestion(q)}
																title={
																	split
																		? 'Add another sub-division (i, ii, iii…)'
																		: `Split this ${budget}-mark question into sub-divisions`
																}
															>
																<Split className="mr-1 h-3 w-3" />
																{split ? 'Add sub-division' : 'Split into sub-divisions'}
															</Button>
														)}
													</div>
													<QuestionRichEditor
														value={q.question_text || ''}
														disabled={!editable}
														placeholder={
															split
																? 'Optional shared stem — e.g. “For the circuit shown below:” (leave blank to print nothing)'
																: 'Enter the question…'
														}
														defaultFontFamily={paper.default_font}
														onChange={html => updateQuestion(q.id, { question_text: html })}
													/>

													<QuestionImageField
														paperId={paper.id}
														value={q.image}
														disabled={!editable}
														onChange={image => updateQuestion(q.id, { image })}
													/>

													{Array.isArray(q.options) && q.options.length > 0 && (
														<div className="mt-2 grid grid-cols-2 gap-2">
															{q.options.map(o => (
																<div key={o.key} className="flex items-start gap-1">
																	<span className="mt-2 w-5 text-xs text-muted-foreground">{o.key})</span>
																	{/* Choices author exactly like questions do — equations,
																	    sub/superscript — and inherit the paper's language. */}
																	<QuestionRichEditor
																		variant="compact"
																		className="flex-1"
																		value={optionEditorValue(o)}
																		disabled={!editable}
																		placeholder={`Option ${o.key}`}
																		defaultFontFamily={q.option_font || paper.default_font}
																		onChange={html =>
																			updateOption(q.id, o.key, {
																				text_html: html || null,
																				text: richTextToPlain(html),
																			})
																		}
																	/>
																</div>
															))}
														</div>
													)}

													<div className="mt-2 flex flex-wrap items-center gap-2">
														{Array.isArray(q.options) && q.options.length > 0 && (
															<div className="flex items-center gap-1">
																<Label className="text-xs">Answer</Label>
																<Select
																	value={q.correct_option || ''}
																	onValueChange={v => updateQuestion(q.id, { correct_option: v })}
																	disabled={!editable}
																>
																	<SelectTrigger className="h-8 w-16">
																		<SelectValue placeholder="—" />
																	</SelectTrigger>
																	<SelectContent>
																		{q.options.map(o => (
																			<SelectItem key={o.key} value={o.key}>
																				{o.key}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															</div>
														)}
														{(part?.capture_co ?? true) && !split && (
															<div className="flex items-center gap-1">
																<Label className="text-xs">CO</Label>
																<Select
																	value={q.co_code || ''}
																	onValueChange={v => updateQuestion(q.id, { co_code: v })}
																	disabled={!editable}
																>
																	<SelectTrigger className="h-8 w-24">
																		<SelectValue placeholder="CO" />
																	</SelectTrigger>
																	<SelectContent>
																		{coOptions.map(code => (
																			<SelectItem key={code} value={code}>
																				{code}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															</div>
														)}
														{(part?.capture_klevel ?? true) && !split && (
															<div className="flex items-center gap-1">
																<Label className="text-xs">K</Label>
																<Select
																	value={q.k_level || ''}
																	onValueChange={v => updateQuestion(q.id, { k_level: v })}
																	disabled={!editable}
																>
																	<SelectTrigger className="h-8 w-20">
																		<SelectValue placeholder="K" />
																	</SelectTrigger>
																	<SelectContent>
																		{K_LEVELS.map(k => (
																			<SelectItem key={k.code} value={k.code}>
																				{k.code}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															</div>
														)}
													</div>

													{split && (
														<div className="mt-2 space-y-2 rounded border border-dashed bg-muted/20 p-2">
															<div className="flex items-center justify-between text-xs">
																<span className="font-medium">Sub-divisions</span>
																<span className={balanced ? 'text-green-700' : 'text-red-600'}>
																	{balanced ? (
																		`Allocated ${allocated} / ${budget} ✓`
																	) : (
																		<span className="inline-flex items-center gap-1">
																			<AlertTriangle className="h-3 w-3" />
																			Allocated {allocated} / {budget} — must total {budget}
																		</span>
																	)}
																</span>
															</div>
															{subs.map(sb => (
																<div key={sb.id} className="rounded border bg-background p-2">
																	<div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
																		<span className="font-medium">{sb.label}.</span>
																		<div className="flex items-center gap-1">
																			<Label className="text-xs">Marks</Label>
																			<Input
																				type="number"
																				min={0}
																				max={budget}
																				step="0.5"
																				className="h-7 w-20"
																				value={sb.marks ?? ''}
																				disabled={!editable}
																				onChange={e =>
																					updateSubQuestion(q.id, sb.id, {
																						marks: e.target.value === '' ? null : Number(e.target.value),
																					})
																				}
																			/>
																		</div>
																		{(part?.capture_co ?? true) && (
																			<div className="flex items-center gap-1">
																				<Label className="text-xs">CO</Label>
																				<Select
																					value={sb.co_code || ''}
																					onValueChange={v => updateSubQuestion(q.id, sb.id, { co_code: v })}
																					disabled={!editable}
																				>
																					<SelectTrigger className="h-7 w-24">
																						<SelectValue placeholder="CO" />
																					</SelectTrigger>
																					<SelectContent>
																						{coOptions.map(code => (
																							<SelectItem key={code} value={code}>
																								{code}
																							</SelectItem>
																						))}
																					</SelectContent>
																				</Select>
																			</div>
																		)}
																		{(part?.capture_klevel ?? true) && (
																			<div className="flex items-center gap-1">
																				<Label className="text-xs">K</Label>
																				<Select
																					value={sb.k_level || ''}
																					onValueChange={v => updateSubQuestion(q.id, sb.id, { k_level: v })}
																					disabled={!editable}
																				>
																					<SelectTrigger className="h-7 w-20">
																						<SelectValue placeholder="K" />
																					</SelectTrigger>
																					<SelectContent>
																						{K_LEVELS.map(k => (
																							<SelectItem key={k.code} value={k.code}>
																								{k.code}
																							</SelectItem>
																						))}
																					</SelectContent>
																				</Select>
																			</div>
																		)}
																		{editable && (
																			<Button
																				size="sm"
																				variant="ghost"
																				className="ml-auto h-6 px-2 text-xs text-destructive"
																				onClick={() => removeSubQuestion(q.id, sb.id)}
																				title="Remove this sub-division"
																			>
																				<X className="h-3 w-3" />
																			</Button>
																		)}
																	</div>
																	<QuestionRichEditor
																		value={sb.question_text || ''}
																		disabled={!editable}
																		placeholder={`Sub-division ${sb.label}…`}
																		defaultFontFamily={paper.default_font}
																		onChange={html => updateSubQuestion(q.id, sb.id, { question_text: html })}
																	/>
																	<QuestionImageField
																		paperId={paper.id}
																		value={sb.image}
																		disabled={!editable}
																		onChange={image => updateSubQuestion(q.id, sb.id, { image })}
																		label={`Add image to ${sb.label}.`}
																	/>
																</div>
															))}
														</div>
													)}
												</div>
												)
											})}
										</div>
									</div>
								)
							})}

							{/* Actions */}
							{editable && subMarkErrors.length > 0 && (
								<div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
									<div className="mb-1 flex items-center gap-1 font-medium">
										<AlertTriangle className="h-3.5 w-3.5" />
										Sub-division marks must total the question’s marks
									</div>
									<ul className="ml-4 list-disc space-y-0.5">
										{subMarkErrors.map(msg => (
											<li key={msg}>{msg}</li>
										))}
									</ul>
								</div>
							)}
							<div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background py-3">
							<Button variant="outline" onClick={() => downloadPdf(paper)}>
								<FileDown className="mr-2 h-4 w-4" /> PDF
							</Button>
							<Button variant="outline" onClick={() => downloadPdf(paper, '2up')} title="A4 landscape — two identical copies side by side (cut down the middle for printing)">
								<FileDown className="mr-2 h-4 w-4" /> PDF (2-up)
							</Button>
								{(paper.status === 'draft' || canEditAnyStatus) && !hasAuthored && (
									<Button variant="outline" onClick={() => rebuildPaper()} disabled={savingPaper} title="Rebuild empty slots from the current template">
										<RefreshCw className="mr-2 h-4 w-4" /> Rebuild
									</Button>
								)}
								{(paper.status !== 'locked' || canEditAnyStatus) && (
									<Button
										variant="outline"
										onClick={() => saveQuestions()}
										disabled={savingPaper || (editable && subMarkErrors.length > 0)}
									>
										{savingPaper ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<Save className="mr-2 h-4 w-4" />
										)}
										Save
									</Button>
								)}
								{paper.status === 'draft' && (
									<Button
										onClick={() => saveQuestions('submitted')}
										disabled={savingPaper || (editable && subMarkErrors.length > 0)}
									>
										<Send className="mr-2 h-4 w-4" /> Submit
									</Button>
								)}
								{paper.status === 'submitted' && (
									<Button onClick={() => saveQuestions('approved')} disabled={savingPaper}>
										<CheckCircle2 className="mr-2 h-4 w-4" /> Approve
									</Button>
								)}
								{paper.status === 'approved' && (
									<Button onClick={() => saveQuestions('locked')} disabled={savingPaper}>
										<Lock className="mr-2 h-4 w-4" /> Lock
									</Button>
								)}
							</div>
						</div>
					) : (
						<div className="py-16 text-center text-muted-foreground">Failed to load paper.</div>
					)}
				</SheetContent>
			</Sheet>
		</SidebarProvider>
	)
}
