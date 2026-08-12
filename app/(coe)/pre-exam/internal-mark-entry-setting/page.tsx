"use client"

import { useState, useEffect, useMemo } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { useSessionSync } from "@/hooks/use-session-sync"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { Plus, Pencil, Trash2, Save, Loader2, Check, ChevronsUpDown, X, Search, Settings2, ChevronLeft, ChevronRight, MoreHorizontal, Eye, PlusCircle, RefreshCw, ListChecks, Layers, Calendar } from "lucide-react"
import { featureFlags } from "@/lib/feature-flags"
import type { MarkConversionRule } from "@/types/mark-conversion-rule"
import { CIARoundTimetableDialog } from "@/components/cia/cia-round-timetable-dialog"

// ─── Constants ───
const ALL_COMPONENTS = [
	{ code: 'test_1', name: 'Test 1' },
	{ code: 'test_2', name: 'Test 2' },
	{ code: 'test_3', name: 'Test 3' },
	{ code: 'assignment', name: 'Assignment' },
	{ code: 'quiz', name: 'Quiz' },
	{ code: 'mid_term', name: 'Mid Term' },
	{ code: 'presentation', name: 'Presentation' },
	{ code: 'attendance', name: 'Attendance' },
	{ code: 'ai_tools_usage', name: 'AI Tools Usage/Interactive Mode' },
	{ code: 'lab', name: 'Lab' },
	{ code: 'project', name: 'Project' },
	{ code: 'seminar', name: 'Seminar' },
	{ code: 'viva', name: 'Viva' },
	{ code: 'other', name: 'Other' },
]

const COURSE_CATEGORIES = [
	'Theory', 'Practical', 'Theory + Practical', 'Project', 'Field Work', 'Non Academic',
]

// ─── Types ───
interface Institution {
	id: string
	name: string
	institution_code: string
	myjkkn_institution_ids: string[]
}

interface Session {
	id: string
	session_name: string
	session_code: string
	institutions_id: string
}

interface Program {
	id: string
	program_code: string
	program_name: string
	program_type: string | null
	program_order: number | null
}

interface RoundComponent {
	code: string
	name: string
	max_marks: number
	attendance_total_periods?: number
	attendance_attended_periods?: number
}

// How faculty key in marks for a round:
//   'direct'        → one total per component (Test 1 = 18)
//   'question_wise' → per-question marks summing to the component total; the question
//                     list comes from the round's approved question paper
//                     (ia_question_papers.questions), not from this setting.
type MarkEntryType = 'direct' | 'question_wise'

interface CIARound {
	round: number
	round_name: string
	entry_from?: string
	entry_to?: string
	session_from?: string
	session_to?: string
	conversion_rule_id?: string
	total_periods?: number     // total class periods in session window (manual now, MyJKKN later)
	attended_periods?: number  // default/template attended periods (manual now, MyJKKN later)
	mark_entry_type?: MarkEntryType
	components: RoundComponent[]
}

interface Regulation {
	id: string
	regulation_code: string
	regulation_name: string
}

interface CIAEntrySetting {
	id: string
	institutions_id: string
	institution_code: string
	examination_session_id: string
	setting_name: string
	regulation_code: string | null
	regulation_id: string | null
	program_codes: string[]
	course_type: string[]
	total_rounds: number
	use_course_max: boolean
	cia_rounds: CIARound[]
	is_active: boolean
	created_at: string
	updated_at: string
}

// ─── Empty form ───
const emptyRound = (): CIARound => ({ round: 1, round_name: 'CIA-1', mark_entry_type: 'direct', components: [] })
const emptyForm = () => ({
	institutions_id: '',
	setting_name: '',
	examination_session_id: '',
	regulation_code: '',
	regulation_id: '',
	program_codes: [] as string[],
	course_types: [] as string[],
	use_course_max: false,
	cia_rounds: [emptyRound()] as CIARound[],
	conversion_rule_id: '' as string,
})

export default function CIAEntrySettingPage() {
	const { toast } = useToast()
	const { user } = useAuth()
	const {
		isReady, appendToUrl, mustSelectInstitution, shouldFilter, institutionId
	} = useInstitutionFilter()
	const { fetchPrograms: fetchMyJKKNPrograms, fetchRegulations: fetchMyJKKNRegulations } = useMyJKKNInstitutionFilter()
	const { selectedSessionId: globalSessionId } = useSessionSync()

	// Data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [regulations, setRegulations] = useState<Regulation[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [settings, setSettings] = useState<CIAEntrySetting[]>([])

	// Local institution for super_admin header
	const [localInstitutionId, setLocalInstitutionId] = useState("__all__")
	const effectiveInstitutionId = institutionId || (localInstitutionId === "__all__" ? "" : localInstitutionId) || ""

	// UI
	const [sheetOpen, setSheetOpen] = useState(false)
	const [editingId, setEditingId] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [loading, setLoading] = useState(false)
	const [programPickerOpen, setProgramPickerOpen] = useState(false)

	// Form — includes institutions_id for sheet dropdown
	const [form, setForm] = useState(emptyForm())
	// Effective institution for the form (could differ from page-level when super_admin)
	const formInstitutionId = form.institutions_id || effectiveInstitutionId

	// v2: conversion rules available for the form institution
	const [conversionRules, setConversionRules] = useState<MarkConversionRule[]>([])
	// v2: timetable dialog state
	const [timetableDialog, setTimetableDialog] = useState({ open: false, round: 1, roundName: 'CIA-1' })
	// v2: fetch attendance loading per round
	const [fetching, setFetching] = useState<number | null>(null)

	// Search & Pagination
	const [searchTerm, setSearchTerm] = useState("")
	const [sessionFilter, setSessionFilter] = useState("all")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)

	// Per-round "add custom component" inline form state, keyed by round index
	const [customCompDraft, setCustomCompDraft] = useState<Record<number, { code: string; name: string; max_marks: number }>>({})

	// ─── Derived ───
	const ugPrograms = useMemo(() =>
		programs.filter(p => (p.program_type || '').toUpperCase() !== 'PG')
			.sort((a, b) => (a.program_order ?? 999) - (b.program_order ?? 999)), [programs])
	const pgPrograms = useMemo(() =>
		programs.filter(p => (p.program_type || '').toUpperCase() === 'PG')
			.sort((a, b) => (a.program_order ?? 999) - (b.program_order ?? 999)), [programs])

	const pageFilteredSessions = useMemo(() => {
		if (!effectiveInstitutionId) return sessions
		return sessions.filter(s => s.institutions_id === effectiveInstitutionId)
	}, [sessions, effectiveInstitutionId])

	const formFilteredSessions = useMemo(() =>
		sessions.filter(s => s.institutions_id === formInstitutionId), [sessions, formInstitutionId])

	const totalMaxMarks = useMemo(() =>
		form.cia_rounds.reduce((sum, r) => sum + r.components.reduce((rs, c) => rs + (c.max_marks || 0), 0), 0), [form.cia_rounds])

	// Filtered + paginated (session filtering now done server-side)
	const filteredSettings = useMemo(() => {
		let result = settings
		if (searchTerm) {
			const term = searchTerm.toLowerCase()
			result = result.filter(s =>
				s.setting_name.toLowerCase().includes(term) ||
				s.institution_code.toLowerCase().includes(term) ||
				(s.program_codes || []).some(c => c.toLowerCase().includes(term))
			)
		}
		return result
	}, [settings, searchTerm])

	const totalPages = Math.max(1, Math.ceil(filteredSettings.length / itemsPerPage))
	const paginatedSettings = useMemo(() => {
		const start = (currentPage - 1) * itemsPerPage
		return filteredSettings.slice(start, start + itemsPerPage)
	}, [filteredSettings, currentPage, itemsPerPage])

	// Score cards
	const stats = useMemo(() => ({
		total: settings.length,
		active: settings.filter(s => s.is_active).length,
		sessions: new Set(settings.map(s => s.examination_session_id)).size,
		programs: new Set(settings.flatMap(s => s.program_codes || [])).size,
	}), [settings])

	// ===== Data Fetching =====

	useEffect(() => {
		if (isReady) { fetchInstitutions(); fetchSessions() }
	}, [isReady])

	useEffect(() => {
		if (isReady && institutions.length > 0) {
			if (effectiveInstitutionId) fetchPrograms(effectiveInstitutionId)
			fetchSettings(sessionFilter)
		}
	}, [isReady, institutionId, localInstitutionId, institutions.length, sessionFilter])

	const fetchInstitutions = async () => {
		try {
			const url = appendToUrl('/api/pre-exam/internal-marks?action=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.map((i: any) => ({
					id: i.id, name: i.name || i.institution_name,
					institution_code: i.institution_code,
					myjkkn_institution_ids: i.myjkkn_institution_ids || [],
				})))
			}
		} catch (error) { console.error('Failed to fetch institutions:', error) }
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch('/api/pre-exam/internal-marks?action=sessions')
			if (res.ok) setSessions(await res.json())
		} catch (error) { console.error('Failed to fetch sessions:', error) }
	}

	const fetchPrograms = async (instId: string) => {
		try {
			const institution = institutions.find(i => i.id === instId)
			const myjkknIds = institution?.myjkkn_institution_ids || []
			if (myjkknIds.length === 0) { setPrograms([]); setRegulations([]); return }
			const [progs, regs] = await Promise.all([
				fetchMyJKKNPrograms(myjkknIds),
				fetchMyJKKNRegulations(myjkknIds),
			])
			setPrograms(progs.map((p: any) => ({
				id: p.id, program_code: p.program_code || p.program_id,
				program_name: p.program_name || p.name,
				program_type: p.program_type || null, program_order: p.program_order ?? null,
			})))
			setRegulations(regs.map((r: any) => ({
				id: r.id, regulation_code: r.regulation_code, regulation_name: r.regulation_name || r.regulation_code,
			})))
		} catch (error) { console.error('Failed to fetch programs:', error); setPrograms([]); setRegulations([]) }
	}

	const fetchSettings = async (sessionId?: string) => {
		try {
			setLoading(true)
			const params = new URLSearchParams()
			if (effectiveInstitutionId) params.set('institutions_id', effectiveInstitutionId)
			if (sessionId && sessionId !== 'all') params.set('examination_session_id', sessionId)
			const res = await fetch(`/api/pre-exam/cia-entry-settings?${params.toString()}`)
			if (res.ok) setSettings(await res.json())
		} catch (error) { console.error('Failed to fetch settings:', error) }
		finally { setLoading(false) }
	}

	// ===== Form Handlers =====
	const resetForm = () => { setForm(emptyForm()); setEditingId(null) }

	const openCreate = () => {
		resetForm()
		setForm(prev => ({
			...prev,
			institutions_id: effectiveInstitutionId,
			examination_session_id: sessionFilter !== 'all' ? sessionFilter : (globalSessionId || ''),
			use_course_max: false,
		}))
		setSheetOpen(true)
	}

	const openEdit = (s: CIAEntrySetting) => {
		setEditingId(s.id)
		setForm({
			institutions_id: s.institutions_id,
			setting_name: s.setting_name,
			examination_session_id: s.examination_session_id,
			regulation_code: s.regulation_code || '',
			regulation_id: s.regulation_id || '',
			program_codes: s.program_codes || [],
			course_types: Array.isArray(s.course_type)
				? s.course_type.map((ct: string) => COURSE_CATEGORIES.find(c => c.toLowerCase() === ct.toLowerCase()) || ct)
				: [],
			use_course_max: s.use_course_max || false,
			cia_rounds: s.cia_rounds || [emptyRound()],
			conversion_rule_id: (s as any).conversion_rule_id || '',
		})
		// Fetch programs for the setting's institution
		fetchPrograms(s.institutions_id)
		if (featureFlags.ciaRoundsV2) fetchConversionRules(s.institutions_id)
		setSheetOpen(true)
	}

	// When form institution changes, reload programs + conversion rules
	const handleFormInstitutionChange = (instId: string) => {
		setForm(prev => ({ ...prev, institutions_id: instId, program_codes: [] }))
		fetchPrograms(instId)
		if (featureFlags.ciaRoundsV2) fetchConversionRules(instId)
	}

	// v2: fetch conversion rules for institution
	const fetchConversionRules = async (instId: string) => {
		if (!instId) return
		try {
			const res = await fetch(`/api/pre-exam/mark-conversion-rules?institutions_id=${instId}`)
			if (res.ok) setConversionRules(await res.json())
		} catch { setConversionRules([]) }
	}

	// v2: generic round field updater
	const updateRound = (idx: number, patch: Partial<CIARound>) => {
		setForm(prev => {
			const rounds = [...prev.cia_rounds]
			rounds[idx] = { ...rounds[idx], ...patch }
			return { ...prev, cia_rounds: rounds }
		})
	}

	// v2: fetch attendance from MyJKKN for a round
	const handleFetchAttendance = async (roundNumber: number) => {
		if (!editingId) return
		setFetching(roundNumber)
		try {
			const res = await fetch(`/api/pre-exam/cia-entry-settings/${editingId}/fetch-attendance`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ round_number: roundNumber, performed_by: user?.id }),
			})
			const data = await res.json()
			if (res.ok) {
				toast({
					title: '✅ Attendance fetched',
					description: `${data.fetched} learners · ${data.below_threshold} below 75% · ${data.missing_count} missing`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
			} else {
				toast({ title: '❌ Fetch failed', description: data.error, variant: 'destructive' })
			}
		} catch {
			toast({ title: '❌ Network error', variant: 'destructive' })
		} finally {
			setFetching(null)
		}
	}

	const addRound = () => {
		const n = form.cia_rounds.length + 1
		setForm(prev => ({ ...prev, cia_rounds: [...prev.cia_rounds, { round: n, round_name: `CIA-${n}`, mark_entry_type: 'direct', components: [] }] }))
	}
	const removeRound = (idx: number) => {
		setForm(prev => ({
			...prev, cia_rounds: prev.cia_rounds.filter((_, i) => i !== idx).map((r, i) => ({ ...r, round: i + 1, round_name: `CIA-${i + 1}` }))
		}))
	}
	const updateRoundName = (idx: number, name: string) => {
		setForm(prev => { const r = [...prev.cia_rounds]; r[idx] = { ...r[idx], round_name: name }; return { ...prev, cia_rounds: r } })
	}
	const toggleComponent = (rIdx: number, code: string, name: string) => {
		setForm(prev => {
			const rounds = [...prev.cia_rounds]; const round = { ...rounds[rIdx] }
			round.components = round.components.find(c => c.code === code)
				? round.components.filter(c => c.code !== code)
				: [...round.components, { code, name, max_marks: 0 }]
			rounds[rIdx] = round; return { ...prev, cia_rounds: rounds }
		})
	}
	const updateComponentMaxMarks = (rIdx: number, code: string, v: number) => {
		setForm(prev => {
			const rounds = [...prev.cia_rounds]; const round = { ...rounds[rIdx] }
			round.components = round.components.map(c => c.code === code ? { ...c, max_marks: v } : c)
			rounds[rIdx] = round; return { ...prev, cia_rounds: rounds }
		})
	}
	const updateComponentAttendance = (rIdx: number, field: 'total' | 'attended', v: number) => {
		setForm(prev => {
			const rounds = [...prev.cia_rounds]; const round = { ...rounds[rIdx] }
			round.components = round.components.map(c => c.code === 'attendance' ? { ...c, attendance_total_periods: field === 'total' ? v : c.attendance_total_periods, attendance_attended_periods: field === 'attended' ? v : c.attendance_attended_periods } : c)
			rounds[rIdx] = round; return { ...prev, cia_rounds: rounds }
		})
	}

	// Slugify a component name into a stable code (e.g., "Code Review" → "code_review").
	// Codes are what the marks-entry UI and API use as keys, so they must be lowercase
	// with underscores and stay stable across edits.
	const slugifyComponentCode = (name: string): string =>
		name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

	const addCustomComponent = (rIdx: number) => {
		const draft = customCompDraft[rIdx]
		if (!draft) return
		const name = draft.name.trim()
		if (!name) {
			toast({ title: '❌ Component name is required', variant: 'destructive' })
			return
		}
		const code = (draft.code || slugifyComponentCode(name)).trim()
		if (!/^[a-z][a-z0-9_]*$/.test(code)) {
			toast({ title: '❌ Invalid code', description: 'Use lowercase letters, digits, underscores; must start with a letter.', variant: 'destructive' })
			return
		}
		const max = Number(draft.max_marks) || 0
		const round = form.cia_rounds[rIdx]
		if (round.components.some(c => c.code === code)) {
			toast({ title: '❌ Duplicate code', description: `"${code}" already exists in ${round.round_name}`, variant: 'destructive' })
			return
		}
		setForm(prev => {
			const rounds = [...prev.cia_rounds]
			rounds[rIdx] = { ...rounds[rIdx], components: [...rounds[rIdx].components, { code, name, max_marks: max }] }
			return { ...prev, cia_rounds: rounds }
		})
		setCustomCompDraft(prev => ({ ...prev, [rIdx]: { code: '', name: '', max_marks: 0 } }))
	}

	const removeComponent = (rIdx: number, code: string) => {
		setForm(prev => {
			const rounds = [...prev.cia_rounds]
			rounds[rIdx] = { ...rounds[rIdx], components: rounds[rIdx].components.filter(c => c.code !== code) }
			return { ...prev, cia_rounds: rounds }
		})
	}

	// Render component with attendance tracking fields
	const renderComponentItem = (rIdx: number, comp: any) => {
		const sel = form.cia_rounds[rIdx].components.find(c => c.code === comp.code)
		if (comp.code === 'attendance' && sel) {
			return (
				<div key={comp.code} className="col-span-2 space-y-2">
					<div className="flex items-center gap-2">
						<Checkbox checked={true} onCheckedChange={() => toggleComponent(rIdx, comp.code, comp.name)} id={`r${rIdx}-${comp.code}`} />
						<label htmlFor={`r${rIdx}-${comp.code}`} className="text-xs flex-1 cursor-pointer">{comp.name}</label>
					</div>
					<div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md space-y-2 border border-blue-200 dark:border-blue-800">
						<div className="text-xs font-semibold text-blue-900 dark:text-blue-100">Attendance Tracking</div>
						<div className="grid grid-cols-2 gap-2">
							<div>
								<label className="text-xs text-foreground/70">Total Periods</label>
								<Input type="number" min={0} value={sel.attendance_total_periods || ''} onChange={e => updateComponentAttendance(rIdx, 'total', parseInt(e.target.value) || 0)} placeholder="60" className="h-7 text-xs" />
							</div>
							<div>
								<label className="text-xs text-foreground/70">Attended</label>
								<Input type="number" min={0} max={sel.attendance_total_periods || 0} value={sel.attendance_attended_periods || ''} onChange={e => updateComponentAttendance(rIdx, 'attended', parseInt(e.target.value) || 0)} placeholder="54" className="h-7 text-xs" />
							</div>
						</div>
						{sel.attendance_total_periods ? (
							<div className="text-xs text-foreground/70 pt-1">
								Attendance: <span className="font-semibold">{((sel.attendance_attended_periods || 0) / sel.attendance_total_periods * 100).toFixed(1)}%</span>
							</div>
						) : null}
					</div>
				</div>
			)
		}
		return (
			<div key={comp.code} className="flex items-center gap-2">
				<Checkbox checked={!!sel} onCheckedChange={() => toggleComponent(rIdx, comp.code, comp.name)} id={`r${rIdx}-${comp.code}`} />
				<label htmlFor={`r${rIdx}-${comp.code}`} className={cn("text-xs flex-1 cursor-pointer", !sel && "text-muted-foreground")}>{comp.name}</label>
				{sel && !form.use_course_max && (
					<Input type="number" min={1} value={sel.max_marks || ''} onChange={e => updateComponentMaxMarks(rIdx, comp.code, parseInt(e.target.value) || 0)} placeholder="Max" className="h-7 w-16 text-xs text-center" />
				)}
			</div>
		)
	}

	const toggleProgram = (code: string) => {
		setForm(prev => ({
			...prev, program_codes: prev.program_codes.includes(code)
				? prev.program_codes.filter(c => c !== code) : [...prev.program_codes, code]
		}))
	}
	const selectAllPrograms = () => setForm(prev => ({ ...prev, program_codes: programs.map(p => p.program_code) }))
	const clearAllPrograms = () => setForm(prev => ({ ...prev, program_codes: [] }))

	// ===== Save =====
	const handleSave = async () => {
		if (!formInstitutionId) { toast({ title: '❌ Institution is required', variant: 'destructive' }); return }
		if (!form.examination_session_id) { toast({ title: '❌ Exam session is required', variant: 'destructive' }); return }
		if (!form.setting_name.trim()) { toast({ title: '❌ Setting name is required', variant: 'destructive' }); return }
		if (form.program_codes.length === 0) { toast({ title: '❌ Select at least one program', variant: 'destructive' }); return }
		for (const round of form.cia_rounds) {
			if (round.components.length === 0) { toast({ title: `❌ ${round.round_name} has no components`, variant: 'destructive' }); return }
			if (!form.use_course_max) {
				for (const comp of round.components) {
					if (!comp.max_marks || comp.max_marks <= 0) { toast({ title: `❌ ${round.round_name} → ${comp.name}: max marks must be > 0`, variant: 'destructive' }); return }
				}
			}
		}
		const institution = institutions.find(i => i.id === formInstitutionId)
		if (!institution) { toast({ title: '❌ Institution not found', variant: 'destructive' }); return }

		try {
			setSaving(true)
			const reg = regulations.find(r => r.regulation_code === form.regulation_code)
			const payload = {
				...form, institutions_id: formInstitutionId, institution_code: institution.institution_code,
				regulation_code: form.regulation_code || null,
				regulation_id: reg?.id || form.regulation_id || null,
				course_type: form.course_types,
				total_rounds: form.cia_rounds.length, created_by: user?.email,
				conversion_rule_id: form.conversion_rule_id || null,
				...(editingId ? { id: editingId } : {}),
			}
			const res = await fetch('/api/pre-exam/cia-entry-settings', {
				method: editingId ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			const result = await res.json()
			if (res.ok) {
				toast({ title: `✅ ${editingId ? 'Updated' : 'Created'}`, description: `"${form.setting_name}" saved.`, className: 'bg-green-50 border-green-200 text-green-800' })
				setSheetOpen(false); resetForm(); fetchSettings()
			} else {
				toast({ title: '❌ Save Failed', description: result.error, variant: 'destructive' })
			}
		} catch { toast({ title: '❌ Network Error', variant: 'destructive' }) }
		finally { setSaving(false) }
	}

	const handleDelete = async (id: string) => {
		if (!confirm('Delete this CIA setting?')) return
		try {
			const res = await fetch(`/api/pre-exam/cia-entry-settings?id=${id}`, { method: 'DELETE' })
			const result = await res.json()
			if (res.ok) { toast({ title: '✅ Deleted', className: 'bg-green-50 border-green-200 text-green-800' }); fetchSettings() }
			else { toast({ title: '❌ Delete Failed', description: result.error, variant: 'destructive' }) }
		} catch { toast({ title: '❌ Network Error', variant: 'destructive' }) }
	}

	const getSessionName = (id: string) => sessions.find(s => s.id === id)?.session_name || id

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader>
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbLink>Pre-Exam</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>CIA Entry Setting</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto">
					{/* Score Cards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.total}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Settings</p>
									</div>
									<Settings2 className="h-5 w-5 text-blue-500/40" />
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
									<ListChecks className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.sessions}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Exam Sessions</p>
									</div>
									<Layers className="h-5 w-5 text-purple-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.programs}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Programs Covered</p>
									</div>
									<ListChecks className="h-5 w-5 text-amber-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Main Table Card */}
					<Card>
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between">
								<div>
									<h2 className="text-base font-semibold">All CIA Settings</h2>
									<p className="text-xs text-muted-foreground">Manage CIA round configurations</p>
								</div>
								<div className="flex items-center gap-1.5">
									<Button variant="outline" size="sm" className="h-8" onClick={fetchSettings}>
										<RefreshCw className="h-3.5 w-3.5" />
									</Button>
									<Button size="sm" className="h-8" onClick={openCreate} disabled={!effectiveInstitutionId}>
										<PlusCircle className="h-3.5 w-3.5 mr-1.5" />
										Add Setting
									</Button>
								</div>
							</div>
							{/* Filters Row */}
							<div className="flex items-center gap-2 flex-wrap mt-3">
								{mustSelectInstitution && (
									<Select value={localInstitutionId} onValueChange={setLocalInstitutionId}>
										<SelectTrigger className="h-8 text-sm w-[200px]"><SelectValue placeholder="Select Institution" /></SelectTrigger>
										<SelectContent>
											<SelectItem value="__all__">All Institutions</SelectItem>
											{institutions.map(inst => (
												<SelectItem key={inst.id} value={inst.id}>{inst.institution_code} - {inst.name}</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
								<Select value={sessionFilter} onValueChange={v => { setSessionFilter(v); setCurrentPage(1) }}>
									<SelectTrigger className="h-8 text-sm w-[180px]"><SelectValue placeholder="All Sessions" /></SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Sessions</SelectItem>
										{pageFilteredSessions.map(s => (
											<SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>
										))}
									</SelectContent>
								</Select>
								<div className="relative flex-1 max-w-sm">
									<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<Input value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1) }} placeholder="Search settings..." className="pl-8 h-8 text-sm" />
								</div>
							</div>
						</CardHeader>
						<CardContent className="pt-0">
							{loading ? (
								<div className="flex items-center justify-center py-12">
									<Loader2 className="h-6 w-6 animate-spin mr-2" /><span className="text-muted-foreground">Loading...</span>
								</div>
							) : paginatedSettings.length === 0 ? (
								<div className="text-center py-12 text-muted-foreground">
									<p>{settings.length === 0 ? 'No CIA settings configured yet.' : 'No matching settings found.'}</p>
								</div>
							) : (
								<>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="text-xs font-semibold">Setting Name</TableHead>
												<TableHead className="text-xs font-semibold">Exam Session</TableHead>
												<TableHead className="text-xs font-semibold">Regulation</TableHead>
												<TableHead className="text-xs font-semibold">Programs</TableHead>
												<TableHead className="text-xs font-semibold">Course Type</TableHead>
												<TableHead className="text-xs font-semibold text-center">Rounds</TableHead>
												<TableHead className="text-xs font-semibold text-center">Total Max</TableHead>
												<TableHead className="text-xs font-semibold text-center">Status</TableHead>
												<TableHead className="text-xs font-semibold text-right">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{paginatedSettings.map(s => {
												const totalMax = s.cia_rounds.reduce((sum, r) => sum + r.components.reduce((rs, c) => rs + (c.max_marks || 0), 0), 0)
												return (
													<TableRow key={s.id}>
														<TableCell className="text-sm font-medium">{s.setting_name}</TableCell>
														<TableCell className="text-sm">{getSessionName(s.examination_session_id)}</TableCell>
														<TableCell className="text-sm">{s.regulation_code || '-'}</TableCell>
														<TableCell>
															<div className="flex flex-wrap gap-1 max-w-[200px]">
																{(s.program_codes || []).slice(0, 3).map(code => (
																	<Badge key={code} variant="secondary" className="text-xs">{code}</Badge>
																))}
																{(s.program_codes || []).length > 3 && (
																	<Badge variant="outline" className="text-xs">+{s.program_codes.length - 3}</Badge>
																)}
															</div>
														</TableCell>
														<TableCell>
														<div className="flex flex-wrap gap-1">
															{(Array.isArray(s.course_type) ? s.course_type : []).length === 0
																? <Badge variant="outline" className="text-xs">All</Badge>
																: (s.course_type as string[]).map(ct => {
																	const normalized = COURSE_CATEGORIES.find(c => c.toLowerCase() === ct.toLowerCase()) || ct
																	return <Badge key={ct} variant="secondary" className="text-xs">{normalized}</Badge>
																})
															}
														</div>
													</TableCell>
														<TableCell className="text-center text-sm">{s.total_rounds}</TableCell>
														<TableCell className="text-center text-sm font-semibold">{totalMax}</TableCell>
														<TableCell className="text-center">
															<Badge variant={s.is_active ? 'default' : 'secondary'} className={cn("text-xs", s.is_active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "")}>
																{s.is_active ? 'Active' : 'Inactive'}
															</Badge>
														</TableCell>
														<TableCell className="text-right">
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end" className="w-36">
																	<DropdownMenuItem onClick={() => openEdit(s)}>
																		<Eye className="h-3.5 w-3.5 mr-2" />View / Edit
																	</DropdownMenuItem>
																	<DropdownMenuSeparator />
																	<DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50" onClick={() => handleDelete(s.id)}>
																		<Trash2 className="h-3.5 w-3.5 mr-2" />Delete
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</TableCell>
													</TableRow>
												)
											})}
										</TableBody>
									</Table>

									{/* Pagination */}
									<div className="flex items-center justify-between pt-3 px-4 pb-3 border-t">
										<div className="flex items-center gap-4">
											<div className="text-sm text-muted-foreground">
												Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredSettings.length)} of {filteredSettings.length}
											</div>
											<div className="flex items-center gap-2">
												<Label className="text-sm text-muted-foreground">Rows:</Label>
												<Select value={String(itemsPerPage)} onValueChange={v => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
													<SelectTrigger className="h-7 w-[70px] text-sm"><SelectValue /></SelectTrigger>
													<SelectContent>
														{[10, 25, 50].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
													</SelectContent>
												</Select>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
											<Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 w-7 p-0">
												<ChevronLeft className="h-4 w-4" />
											</Button>
											<Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-7 w-7 p-0">
												<ChevronRight className="h-4 w-4" />
											</Button>
										</div>
									</div>
								</>
							)}
						</CardContent>
					</Card>
				</div>

				{/* ===== Create/Edit Sheet ===== */}
				<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
					<SheetContent className="sm:max-w-[700px] overflow-y-auto">
						<SheetHeader className="pb-4 border-b">
							<SheetTitle className="text-lg font-semibold">{editingId ? 'Edit' : 'New'} CIA Entry Setting</SheetTitle>
							<p className="text-sm text-muted-foreground">
								{editingId ? 'Update CIA round configuration' : 'Configure CIA rounds and components'}
							</p>
						</SheetHeader>

						<div className="mt-6 space-y-8">
							{/* Section 1: Basic Info */}
							<div className="space-y-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</h3>
								{/* Institution dropdown: only show when super_admin */}
								{mustSelectInstitution && (
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Institution <span className="text-red-500">*</span></Label>
										<Select value={formInstitutionId} onValueChange={handleFormInstitutionChange} disabled={!!editingId}>
											<SelectTrigger><SelectValue placeholder="Select Institution" /></SelectTrigger>
											<SelectContent>
												<SelectItem value="__all__">All Institutions</SelectItem>
												<SelectItem value="__all__">All Institutions</SelectItem>
												{institutions.map(inst => (
													<SelectItem key={inst.id} value={inst.id}>{inst.institution_code} - {inst.name}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
								{/* Session dropdown: only show when "All Sessions" is selected on page */}
								{sessionFilter === 'all' && (
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Exam Session <span className="text-red-500">*</span></Label>
										<Select value={form.examination_session_id} onValueChange={val => setForm(prev => ({ ...prev, examination_session_id: val }))}>
											<SelectTrigger><SelectValue placeholder="Select Session" /></SelectTrigger>
											<SelectContent>
												{formFilteredSessions.map(s => <SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>)}
											</SelectContent>
										</Select>
									</div>
								)}
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Regulation</Label>
										<Select value={form.regulation_code} onValueChange={val => setForm(prev => ({ ...prev, regulation_code: val }))}>
											<SelectTrigger><SelectValue placeholder="All Regulations" /></SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Regulations</SelectItem>
												{regulations.map(r => <SelectItem key={r.regulation_code} value={r.regulation_code}>{r.regulation_name !== r.regulation_code ? `${r.regulation_code} - ${r.regulation_name}` : r.regulation_code}</SelectItem>)}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Setting Name <span className="text-red-500">*</span></Label>
										<Input value={form.setting_name} onChange={e => setForm(prev => ({ ...prev, setting_name: e.target.value }))} placeholder="e.g., CAS Theory CIA Config 2025-26" />
									</div>
								</div>
							</div>

							{/* Section 2: Scope */}
							<div className="space-y-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scope</h3>
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<Label className="text-sm font-semibold">Course Categories</Label>
										<div className="flex items-center gap-1">
											<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setForm(prev => ({ ...prev, course_types: [...COURSE_CATEGORIES] }))}>Select All</Button>
											<span className="text-xs text-muted-foreground">|</span>
											<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setForm(prev => ({ ...prev, course_types: [] }))}>Clear</Button>
										</div>
									</div>
									<div className="flex flex-wrap gap-2">
										{COURSE_CATEGORIES.map(cat => (
											<label key={cat} className={cn(
												"flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-colors",
												form.course_types.includes(cat)
													? "bg-emerald-50 border-emerald-300 text-emerald-700"
													: "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
											)}>
												<Checkbox
													checked={form.course_types.includes(cat)}
													onCheckedChange={(checked) => {
														setForm(prev => ({
															...prev,
															course_types: checked
																? [...prev.course_types, cat]
																: prev.course_types.filter(c => c !== cat)
														}))
													}}
													className="h-3.5 w-3.5"
												/>
												{cat}
											</label>
										))}
									</div>
								</div>
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<Label className="text-sm font-semibold">Programs <span className="text-red-500">*</span></Label>
										<div className="flex gap-1">
											<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={selectAllPrograms}>Select All</Button>
											<span className="text-xs text-muted-foreground">|</span>
											<Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={clearAllPrograms}>Clear</Button>
										</div>
									</div>
									{form.program_codes.length > 0 && (
										<div className="flex flex-wrap gap-1 mb-2">
											{form.program_codes.map(code => (
												<Badge key={code} variant="secondary" className="text-xs pr-1">
													{code}
													<button type="button" title={`Remove ${code}`} onClick={() => toggleProgram(code)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
												</Badge>
											))}
										</div>
									)}
									<Popover open={programPickerOpen} onOpenChange={setProgramPickerOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" className="w-full justify-between h-9 text-sm font-normal">
												{form.program_codes.length === 0 ? 'Select programs...' : `${form.program_codes.length} selected`}
												<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[350px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search program..." className="h-8 text-xs" />
												<CommandEmpty className="text-xs py-4">No program found.</CommandEmpty>
												{ugPrograms.length > 0 && (
													<CommandGroup heading="UG Programs" className="max-h-48 overflow-auto">
														{ugPrograms.map(p => (
															<CommandItem key={p.program_code} value={`${p.program_code} ${p.program_name}`} onSelect={() => toggleProgram(p.program_code)} className="py-1.5 text-xs">
																<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", form.program_codes.includes(p.program_code) ? "opacity-100" : "opacity-0")} />
																{p.program_code} - {p.program_name}
															</CommandItem>
														))}
													</CommandGroup>
												)}
												{pgPrograms.length > 0 && (
													<CommandGroup heading="PG Programs" className="max-h-48 overflow-auto">
														{pgPrograms.map(p => (
															<CommandItem key={p.program_code} value={`${p.program_code} ${p.program_name}`} onSelect={() => toggleProgram(p.program_code)} className="py-1.5 text-xs">
																<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", form.program_codes.includes(p.program_code) ? "opacity-100" : "opacity-0")} />
																{p.program_code} - {p.program_name}
															</CommandItem>
														))}
													</CommandGroup>
												)}
											</Command>
										</PopoverContent>
									</Popover>
								</div>
							</div>

							{/* v2: Setting-level Conversion Rule */}
							{featureFlags.ciaRoundsV2 && (
								<div className="space-y-2">
									<Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default Conversion Rule</Label>
									<Select
										value={form.conversion_rule_id || '__none__'}
										onValueChange={v => setForm(prev => ({ ...prev, conversion_rule_id: v === '__none__' ? '' : v }))}
									>
										<SelectTrigger className="h-8 text-sm"><SelectValue placeholder="None (rounds must have own rule)" /></SelectTrigger>
										<SelectContent>
											<SelectItem value="__none__">None</SelectItem>
											{conversionRules.map(r => (
												<SelectItem key={r.id} value={r.id}>{r.rule_name} (WEF {r.wef_date})</SelectItem>
											))}
										</SelectContent>
									</Select>
									<p className="text-xs text-muted-foreground">Applied to all rounds unless overridden per-round.</p>
								</div>
							)}

							{/* Section 3: CIA Rounds */}
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CIA Rounds</h3>
									<div className="flex items-center gap-2">
										{!form.use_course_max && <Badge variant="outline" className="text-xs">Total: {totalMaxMarks} marks</Badge>}
										<Button variant="outline" size="sm" onClick={addRound}>
											<Plus className="h-3.5 w-3.5 mr-1" />Add Round
										</Button>
									</div>
								</div>

								{/* Max marks source toggle */}
								<div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
									<Checkbox
										id="use_course_max"
										checked={form.use_course_max}
										onCheckedChange={(checked) => setForm(prev => ({ ...prev, use_course_max: !!checked }))}
									/>
									<label htmlFor="use_course_max" className="text-sm font-medium cursor-pointer">
										Set max marks from courses
									</label>
								</div>

								{form.cia_rounds.map((round, rIdx) => (
									<Card key={rIdx} className="border-dashed">
										<CardHeader className="pb-2 pt-3 px-4">
											<div className="flex items-center justify-between">
												<div className="flex items-center gap-2 flex-wrap">
													<Input value={round.round_name} onChange={e => updateRoundName(rIdx, e.target.value)} className="h-7 w-32 text-sm font-semibold" />
													{!form.use_course_max && (
														<Badge variant="secondary" className="text-xs">{round.components.reduce((s, c) => s + (c.max_marks || 0), 0)} marks</Badge>
													)}
													{form.use_course_max && (
														<Badge variant="outline" className="text-xs">From course</Badge>
													)}
													<Select
														value={round.mark_entry_type || 'direct'}
														onValueChange={(v: MarkEntryType) => updateRound(rIdx, { mark_entry_type: v })}
													>
														<SelectTrigger className="h-7 w-[150px] text-xs" title="How faculty enter marks for this round">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="direct" className="text-xs">Direct entry</SelectItem>
															<SelectItem value="question_wise" className="text-xs">Question-wise</SelectItem>
														</SelectContent>
													</Select>
													{featureFlags.ciaRoundsV2 && editingId && (
														<Button variant="outline" size="sm" className="h-7 text-xs" type="button"
															onClick={() => setTimetableDialog({ open: true, round: round.round, roundName: round.round_name })}>
															<Calendar className="h-3.5 w-3.5 mr-1" />Schedule
														</Button>
													)}
													{featureFlags.ciaRoundsV2 && editingId && round.components.some(c => c.code === "attendance") && round.session_from && round.session_to && (
														<Button variant="outline" size="sm" className="h-7 text-xs" type="button"
															disabled={fetching === round.round}
															onClick={() => handleFetchAttendance(round.round)}>
															{fetching === round.round ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
															Attendance
														</Button>
													)}
												</div>
												{form.cia_rounds.length > 1 && (
													<Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRound(rIdx)}><Trash2 className="h-3.5 w-3.5" /></Button>
												)}
											</div>
										</CardHeader>
										<CardContent className="px-4 pb-3 space-y-3">
											{/* Entry date window */}
											<div className="grid grid-cols-2 gap-3">
												<div className="space-y-1">
													<label className="text-xs font-medium text-muted-foreground">Entry From</label>
													<Input
														type="date"
														value={round.entry_from || ''}
														onChange={e => updateRound(rIdx, { entry_from: e.target.value })}
														className="h-7 text-xs"
													/>
												</div>
												<div className="space-y-1">
													<label className="text-xs font-medium text-muted-foreground">Entry To</label>
													<Input
														type="date"
														value={round.entry_to || ''}
														onChange={e => updateRound(rIdx, { entry_to: e.target.value })}
														className="h-7 text-xs"
													/>
												</div>
												<div className="space-y-1">
													<label className="text-xs font-medium text-muted-foreground">Attendance Period From</label>
													<Input
														type="date"
														value={round.session_from || ''}
														onChange={e => updateRound(rIdx, { session_from: e.target.value })}
														className="h-7 text-xs"
													/>
												</div>
												<div className="space-y-1">
													<label className="text-xs font-medium text-muted-foreground">Attendance Period To</label>
													<Input
														type="date"
														value={round.session_to || ''}
														onChange={e => updateRound(rIdx, { session_to: e.target.value })}
														className="h-7 text-xs"
													/>
												</div>
												{featureFlags.ciaRoundsV2 && (
													<>
														<div className="space-y-1">
															<label className="text-xs font-medium text-muted-foreground">Total Periods</label>
															<Input
																type="number"
																min={0}
																value={round.total_periods ?? ''}
																onChange={e => updateRound(rIdx, { total_periods: e.target.value === '' ? undefined : Number(e.target.value) })}
																placeholder="e.g., 60"
																className="h-7 text-xs"
															/>
														</div>
														<div className="space-y-1">
															<label className="text-xs font-medium text-muted-foreground">Attended Periods</label>
															<Input
																type="number"
																min={0}
																max={round.total_periods || undefined}
																value={round.attended_periods ?? ''}
																onChange={e => updateRound(rIdx, { attended_periods: e.target.value === '' ? undefined : Number(e.target.value) })}
																placeholder="e.g., 54"
																className="h-7 text-xs"
															/>
														</div>
														{round.total_periods != null && round.attended_periods != null && round.total_periods > 0 && (
															<div className="col-span-2 -mt-1">
																<p className="text-xs text-muted-foreground">
																	Attendance %: <span className="font-semibold text-foreground">
																		{((round.attended_periods / round.total_periods) * 100).toFixed(2)}%
																	</span>
																	<span className="ml-2 italic">— Will be auto-fetched from MyJKKN using session dates when API is connected.</span>
																</p>
															</div>
														)}
														<div className="col-span-2 space-y-1">
															<label className="text-xs font-medium text-muted-foreground">Conversion Rule (round override)</label>
															<Select
																value={round.conversion_rule_id || '__default__'}
																onValueChange={v => updateRound(rIdx, { conversion_rule_id: v === '__default__' ? '' : v })}
															>
																<SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Use setting default" /></SelectTrigger>
																<SelectContent>
																	<SelectItem value="__default__">Use setting default</SelectItem>
																	{conversionRules.map(r => (
																		<SelectItem key={r.id} value={r.id}>{r.rule_name} (WEF {r.wef_date})</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</div>
													</>
												)}
											</div>
											{/* Components */}
											<div className="grid grid-cols-2 gap-2">
												{ALL_COMPONENTS.map(comp => renderComponentItem(rIdx, comp))}
											</div>

											{/* Custom (end-user-defined) components for this round */}
											{(() => {
												const standardCodes = new Set(ALL_COMPONENTS.map(c => c.code))
												const customComps = round.components.filter(c => !standardCodes.has(c.code))
												return customComps.length > 0 ? (
													<div className="mt-3 space-y-1.5">
														<div className="text-xs font-semibold text-foreground/70">Custom Components</div>
														{customComps.map(c => (
															<div key={c.code} className="flex items-center gap-2 rounded-md border bg-violet-50/40 dark:bg-violet-950/20 px-2 py-1.5">
																<span className="text-xs flex-1">
																	{c.name} <span className="text-muted-foreground">({c.code})</span>
																</span>
																{!form.use_course_max && (
																	<Input
																		type="number"
																		min={1}
																		value={c.max_marks || ''}
																		onChange={e => updateComponentMaxMarks(rIdx, c.code, parseInt(e.target.value) || 0)}
																		placeholder="Max"
																		className="h-7 w-16 text-xs text-center"
																	/>
																)}
																<Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeComponent(rIdx, c.code)} title="Remove">
																	<X className="h-3.5 w-3.5" />
																</Button>
															</div>
														))}
													</div>
												) : null
											})()}

											{/* Question-wise rounds draw their questions from the generated question paper */}
											{(round.mark_entry_type || 'direct') === 'question_wise' && (
												<div className="mt-3 rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 px-2 py-1.5">
													<p className="text-[10px] text-muted-foreground">
														Questions are not configured here — they come from the question paper generated for this round in{' '}
														<Link href="/pre-exam/question-papers" className="font-medium text-foreground underline underline-offset-2">Question Papers</Link>
														{' '}(built from a <Link href="/pre-exam/question-paper-templates" className="font-medium text-foreground underline underline-offset-2">Question Paper Template</Link>).
														Faculty key in each question separately and the component total is the sum.
													</p>
												</div>
											)}

											{/* Add custom component inline */}
											<div className="mt-3 rounded-md border border-dashed bg-muted/30 p-2 space-y-2">
												<div className="text-xs font-semibold text-foreground/70">+ Add Custom Component</div>
												<div className="grid grid-cols-12 gap-1.5">
													<Input
														className="col-span-5 h-8 text-xs"
														placeholder="Name (e.g., Code Review)"
														value={customCompDraft[rIdx]?.name || ''}
														onChange={e => setCustomCompDraft(prev => ({
															...prev,
															[rIdx]: {
																code: prev[rIdx]?.code || '',
																max_marks: prev[rIdx]?.max_marks || 0,
																name: e.target.value,
															},
														}))}
													/>
													<Input
														className="col-span-4 h-8 text-xs font-mono"
														placeholder="code (auto)"
														value={customCompDraft[rIdx]?.code || ''}
														onChange={e => setCustomCompDraft(prev => ({
															...prev,
															[rIdx]: {
																name: prev[rIdx]?.name || '',
																max_marks: prev[rIdx]?.max_marks || 0,
																code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
															},
														}))}
													/>
													<Input
														type="number"
														min={1}
														className="col-span-2 h-8 text-xs text-center"
														placeholder="Max"
														value={customCompDraft[rIdx]?.max_marks || ''}
														onChange={e => setCustomCompDraft(prev => ({
															...prev,
															[rIdx]: {
																name: prev[rIdx]?.name || '',
																code: prev[rIdx]?.code || '',
																max_marks: parseInt(e.target.value) || 0,
															},
														}))}
													/>
													<Button size="sm" className="col-span-1 h-8 text-xs px-0" onClick={() => addCustomComponent(rIdx)}>Add</Button>
												</div>
												<p className="text-[10px] text-muted-foreground">Leave code blank to auto-generate from the name. Codes are stored as keys in <code className="px-1 bg-background rounded">extra_marks</code> on cia_marks.</p>
											</div>
										</CardContent>
									</Card>
								))}
							</div>

							{/* Save */}
							<div className="flex justify-end gap-2 pt-4 border-t">
								<Button variant="outline" size="sm" className="h-10 px-6" onClick={() => setSheetOpen(false)}>Cancel</Button>
								<Button size="sm" className="h-10 px-6" onClick={handleSave} disabled={saving}>
									{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
									{saving ? 'Saving...' : editingId ? 'Update Setting' : 'Add Setting'}
								</Button>
							</div>
						</div>
					</SheetContent>
				</Sheet>

				{/* v2: per-round timetable dialog */}
				{featureFlags.ciaRoundsV2 && editingId && (
					<CIARoundTimetableDialog
						open={timetableDialog.open}
						onClose={() => setTimetableDialog(prev => ({ ...prev, open: false }))}
						settingId={editingId}
						round={timetableDialog.round}
						roundName={timetableDialog.roundName}
					/>
				)}

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
