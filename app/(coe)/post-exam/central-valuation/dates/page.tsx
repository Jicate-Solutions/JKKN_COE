'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
} from '@/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/common/use-toast'
import {
	CalendarRange,
	Check,
	ChevronsUpDown,
	Loader2,
	CalendarCog,
	Save,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	Search,
	Download,
	Upload,
	FileSpreadsheet,
	FileJson,
	ChevronDown,
	RefreshCw,
	ChevronLeft,
	ChevronRight,
} from 'lucide-react'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import XLSX from '@/lib/utils/excel-compat'
import { cn } from '@/lib/utils'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useSessionSync } from '@/hooks/use-session-sync'
import type {
	CentralValuationBoardRow,
	BoardValuationWindow,
} from '@/types/central-valuation'

interface Institution {
	id: string
	name: string
	institution_code: string
}

interface Session {
	id: string
	session_name: string
	session_code: string
}

interface PacketDateRow {
	row_id: string
	packet_id: string | null
	course_id: string
	course_code: string
	course_name: string
	board_code: string
	packet_no: string | null
	packet_index: number
	total_packets: number
	total_sheets: number
	regular_count: number
	arrear_count: number
	student_count: number
	valuation_date: string | null
	packets_generated: boolean
}

export default function CentralValuationDatesPage() {
	const { toast } = useToast()

	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const effectiveInstitutionId = selectedInstitutionId || contextInstitutionId || ''

	const [boards, setBoards] = useState<CentralValuationBoardRow[]>([])
	const [loadingBoards, setLoadingBoards] = useState(false)
	const [boardSearch, setBoardSearch] = useState('')
	const [boardSortField, setBoardSortField] = useState<'board_code' | 'board_name' | 'board_type' | 'board_order' | 'course_count' | 'from_date' | 'to_date' | null>('board_order')
	const [boardSortDir, setBoardSortDir] = useState<'asc' | 'desc'>('asc')
	const importInputRef = useRef<HTMLInputElement>(null)
	const [importing, setImporting] = useState(false)
	const [boardPage, setBoardPage] = useState(1)
	const [boardPageSize, setBoardPageSize] = useState(10)

	const [windowSheetOpen, setWindowSheetOpen] = useState(false)
	const [editingBoard, setEditingBoard] = useState<CentralValuationBoardRow | null>(null)
	const [fromDate, setFromDate] = useState('')
	const [toDate, setToDate] = useState('')
	const [savingWindow, setSavingWindow] = useState(false)

	const [courseBoardCode, setCourseBoardCode] = useState('')
	const [courseBoardOpen, setCourseBoardOpen] = useState(false)
	const [courseCodeFilter, setCourseCodeFilter] = useState('')
	const [courseCodeOpen, setCourseCodeOpen] = useState(false)
	const [courseDates, setCourseDates] = useState<PacketDateRow[]>([])
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [dirtyDates, setDirtyDates] = useState<Record<string, string | null>>({})
	const [savingCourseDates, setSavingCourseDates] = useState(false)
	const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())
	const [bulkDate, setBulkDate] = useState('')
	const [courseSearch, setCourseSearch] = useState('')

	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId])

	useEffect(() => {
		if (isReady && mustSelectInstitution) loadInstitutions()
	}, [isReady, mustSelectInstitution])

	useEffect(() => {
		if (isReady && effectiveInstitutionId) {
			loadSessions(effectiveInstitutionId)
		}
	}, [isReady, effectiveInstitutionId])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			loadBoards()
		}
	}, [isReady, selectedSessionId, effectiveInstitutionId])

	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId && courseBoardCode) {
			loadCourseDates(courseBoardCode)
		} else {
			setCourseDates([])
			setDirtyDates({})
			setSelectedRowIds(new Set())
		}
		setCourseCodeFilter('')
	}, [isReady, selectedSessionId, effectiveInstitutionId, courseBoardCode])

	const loadInstitutions = useCallback(async () => {
		try {
			const url = appendToUrl('/api/pre-exam/examiner-allotment?action=institutions')
			const r = await fetch(url)
			if (!r.ok) throw new Error('Failed')
			setInstitutions(await r.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load institutions', variant: 'destructive' })
		}
	}, [appendToUrl, toast])

	const loadSessions = useCallback(async (institutionId: string) => {
		try {
			const url = appendToUrl(`/api/pre-exam/examiner-allotment?action=sessions&institutionId=${institutionId}`)
			const r = await fetch(url)
			if (!r.ok) throw new Error('Failed')
			setSessions(await r.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load sessions', variant: 'destructive' })
		}
	}, [appendToUrl, toast])

	const loadBoards = useCallback(async () => {
		try {
			setLoadingBoards(true)
			const url = `/api/post-exam/central-valuation/boards?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}`
			console.log('[loadBoards] GET', url)
			const r = await fetch(url)
			const text = await r.text()
			console.log('[loadBoards] status', r.status, 'body', text.slice(0, 300))
			if (!r.ok) {
				let msg = 'Failed'
				try { msg = JSON.parse(text).error || msg } catch {}
				throw new Error(msg)
			}
			setBoards(JSON.parse(text))
		} catch (e: any) {
			toast({ title: '❌ Error', description: e.message || 'Failed to load boards', variant: 'destructive' })
		} finally {
			setLoadingBoards(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, toast])

	const loadCourseDates = useCallback(async (boardCode: string) => {
		try {
			setLoadingCourses(true)
			const r = await fetch(`/api/post-exam/central-valuation/course-dates?institutions_id=${effectiveInstitutionId}&session_id=${selectedSessionId}&board_code=${boardCode}`)
			if (!r.ok) throw new Error('Failed')
			const rows = (await r.json()) as PacketDateRow[]
			setCourseDates(rows)
			setDirtyDates({})
			setSelectedRowIds(new Set())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load courses', variant: 'destructive' })
		} finally {
			setLoadingCourses(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, toast])

	const openWindowSheet = (b: CentralValuationBoardRow) => {
		setEditingBoard(b)
		setFromDate(b.window?.from_date || '')
		setToDate(b.window?.to_date || '')
		setWindowSheetOpen(true)
	}

	const saveWindow = async () => {
		if (!editingBoard || !fromDate || !toDate) {
			toast({ title: '❌ Missing fields', description: 'From-date and to-date are required', variant: 'destructive' })
			return
		}
		if (new Date(toDate) < new Date(fromDate)) {
			toast({ title: '❌ Invalid range', description: 'To-date must be after from-date', variant: 'destructive' })
			return
		}
		try {
			setSavingWindow(true)
			const r = await fetch('/api/post-exam/central-valuation/board-windows', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: effectiveInstitutionId,
					examination_session_id: selectedSessionId,
					board_code: editingBoard.board_code,
					board_name: editingBoard.board_name,
					from_date: fromDate,
					to_date: toDate,
				}),
			})
			if (!r.ok) {
				const j = await r.json().catch(() => ({}))
				throw new Error(j.error || 'Failed')
			}
			toast({
				title: '✅ Saved',
				description: `Window set for ${editingBoard.board_name}`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			setWindowSheetOpen(false)
			loadBoards()
		} catch (e: any) {
			toast({ title: '❌ Save failed', description: e.message || 'Unknown error', variant: 'destructive' })
		} finally {
			setSavingWindow(false)
		}
	}

	const toggleBoardSort = (field: typeof boardSortField) => {
		if (boardSortField === field) {
			setBoardSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
		} else {
			setBoardSortField(field)
			setBoardSortDir('asc')
		}
	}

	const boardSortIcon = (field: typeof boardSortField) => {
		if (boardSortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/60" />
		return boardSortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
	}

	const filteredSortedBoards = useMemo(() => {
		const term = boardSearch.trim().toLowerCase()
		const filtered = term
			? boards.filter(b =>
				(b.board_code || '').toLowerCase().includes(term) ||
				(b.board_name || '').toLowerCase().includes(term) ||
				(b.board_type || '').toLowerCase().includes(term)
			)
			: boards
		if (!boardSortField) return filtered
		const sorted = [...filtered].sort((a, b) => {
			let av: any
			let bv: any
			if (boardSortField === 'from_date') { av = a.window?.from_date || ''; bv = b.window?.from_date || '' }
			else if (boardSortField === 'to_date') { av = a.window?.to_date || ''; bv = b.window?.to_date || '' }
			else { av = (a as any)[boardSortField] ?? ''; bv = (b as any)[boardSortField] ?? '' }
			if (typeof av === 'number' && typeof bv === 'number') {
				return boardSortDir === 'asc' ? av - bv : bv - av
			}
			if (av < bv) return boardSortDir === 'asc' ? -1 : 1
			if (av > bv) return boardSortDir === 'asc' ? 1 : -1
			return 0
		})
		return sorted
	}, [boards, boardSearch, boardSortField, boardSortDir])

	const downloadBoardTemplate = async () => {
		const sample = [
			{ board_code: 'UTA', board_name: 'TAMIL (sample)', from_date: '2026-05-04', to_date: '2026-05-10' },
		]
		const ws = XLSX.utils.json_to_sheet(sample)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'BoardWindows')
		await XLSX.writeFile(wb, 'board-valuation-windows-template.xlsx')
		toast({ title: '📄 Template downloaded' })
	}

	const exportBoardWindowsExcel = async () => {
		const data = boards.map(b => ({
			board_code: b.board_code,
			board_name: b.board_name || '',
			board_type: b.board_type || '',
			board_order: b.board_order ?? '',
			courses: b.course_count,
			from_date: b.window?.from_date || '',
			to_date: b.window?.to_date || '',
		}))
		const ws = XLSX.utils.json_to_sheet(data)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'BoardWindows')
		await XLSX.writeFile(wb, `board-valuation-windows-${new Date().toISOString().split('T')[0]}.xlsx`)
		toast({ title: '✅ Excel exported', description: `${boards.length} rows` })
	}

	const exportBoardWindowsJSON = () => {
		const data = boards.map(b => ({
			board_code: b.board_code,
			board_name: b.board_name,
			board_type: b.board_type,
			board_order: b.board_order,
			course_count: b.course_count,
			from_date: b.window?.from_date || null,
			to_date: b.window?.to_date || null,
		}))
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
		const a = document.createElement('a')
		a.href = URL.createObjectURL(blob)
		a.download = `board-valuation-windows-${new Date().toISOString().split('T')[0]}.json`
		a.click()
		URL.revokeObjectURL(a.href)
		toast({ title: '✅ JSON exported', description: `${boards.length} rows` })
	}

	const fmtDate = (v: any): string => {
		if (v == null || v === '') return ''
		if (typeof v === 'number') {
			// Excel serial date → ISO YYYY-MM-DD
			const d = new Date(Math.round((v - 25569) * 86400 * 1000))
			if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
		}
		const s = String(v).trim()
		// accept YYYY-MM-DD or DD/MM/YYYY
		if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
		const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
		if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
		const d = new Date(s)
		if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
		return s
	}

	const onImportFile = async (file: File) => {
		try {
			setImporting(true)
			const ext = file.name.toLowerCase().split('.').pop()
			let rows: Array<Record<string, any>> = []

			if (ext === 'json') {
				const text = await file.text()
				const parsed = JSON.parse(text)
				rows = Array.isArray(parsed) ? parsed : (parsed.data || [])
			} else if (ext === 'xlsx' || ext === 'xls') {
				const buf = await file.arrayBuffer()
				const wb = XLSX.read(buf, { type: 'array' })
				const sheetName = wb.SheetNames[0]
				rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName])
			} else if (ext === 'csv') {
				const text = await file.text()
				const wb = XLSX.read(text, { type: 'string' })
				rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
			} else {
				toast({ title: '❌ Unsupported file', description: 'Use .xlsx, .json or .csv', variant: 'destructive' })
				return
			}

			if (rows.length === 0) {
				toast({ title: '⚠ Empty file', variant: 'destructive' })
				return
			}

			const existingCodes = new Set(boards.map(b => b.board_code))
			let saved = 0
			let skipped = 0
			for (const row of rows) {
				// Normalize keys to lowercase
				const normal: Record<string, any> = {}
				for (const k of Object.keys(row)) normal[k.trim().toLowerCase()] = row[k]
				const code = String(normal['board_code'] || '').trim()
				const name = normal['board_name'] ? String(normal['board_name']).trim() : ''
				const from = fmtDate(normal['from_date'])
				const to = fmtDate(normal['to_date'])
				if (!code || !from || !to) { skipped++; continue }
				if (!existingCodes.has(code)) { skipped++; continue }
				const r = await fetch('/api/post-exam/central-valuation/board-windows', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						institutions_id: effectiveInstitutionId,
						examination_session_id: selectedSessionId,
						board_code: code,
						board_name: name || null,
						from_date: from,
						to_date: to,
					}),
				})
				if (r.ok) saved++
				else skipped++
			}
			toast({
				title: '📥 Import complete',
				description: `Saved: ${saved} · Skipped: ${skipped}`,
				className: skipped > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200 text-green-800',
			})
			loadBoards()
		} catch (e: any) {
			toast({ title: '❌ Import failed', description: e.message, variant: 'destructive' })
		} finally {
			setImporting(false)
			if (importInputRef.current) importInputRef.current.value = ''
		}
	}

	const totalBoardPages = Math.max(1, Math.ceil(filteredSortedBoards.length / boardPageSize))
	const boardPageStart = (boardPage - 1) * boardPageSize
	const boardPageEnd = boardPageStart + boardPageSize
	const boardPageItems = useMemo(
		() => filteredSortedBoards.slice(boardPageStart, boardPageEnd),
		[filteredSortedBoards, boardPageStart, boardPageEnd]
	)

	useEffect(() => {
		setBoardPage(1)
	}, [boardSearch, boardSortField, boardSortDir, boardPageSize])

	useEffect(() => {
		if (boardPage > totalBoardPages) setBoardPage(totalBoardPages)
	}, [totalBoardPages, boardPage])

	const currentWindow: BoardValuationWindow | null = useMemo(() => {
		if (!courseBoardCode) return null
		const b = boards.find(b => b.board_code === courseBoardCode)
		return b?.window || null
	}, [courseBoardCode, boards])

	const handlePacketDateChange = (packetId: string, value: string) => {
		if (value && currentWindow) {
			if (value < currentWindow.from_date || value > currentWindow.to_date) {
				toast({
					title: '❌ Out of window',
					description: `Date must be between ${currentWindow.from_date} and ${currentWindow.to_date}`,
					variant: 'destructive',
				})
				return
			}
		}
		setDirtyDates(prev => ({ ...prev, [packetId]: value || null }))
	}

	const uniqueCourseCodes = useMemo(() => {
		const seen = new Map<string, string>()
		for (const c of courseDates) {
			if (c.course_code && !seen.has(c.course_code)) {
				seen.set(c.course_code, c.course_name || '')
			}
		}
		return [...seen.entries()]
			.map(([code, name]) => ({ code, name }))
			.sort((a, b) => a.code.localeCompare(b.code))
	}, [courseDates])

	const filteredCourseDates = useMemo(() => {
		const term = courseSearch.trim().toLowerCase()
		let rows = courseDates
		if (courseCodeFilter) {
			rows = rows.filter(c => c.course_code === courseCodeFilter)
		}
		if (term) {
			rows = rows.filter(c =>
				(c.course_code || '').toLowerCase().includes(term) ||
				(c.course_name || '').toLowerCase().includes(term)
			)
		}
		return rows
	}, [courseDates, courseSearch, courseCodeFilter])

	const applyBulkDate = () => {
		if (!bulkDate) {
			toast({ title: '⚠ Pick a date first', variant: 'destructive' })
			return
		}
		if (currentWindow) {
			if (bulkDate < currentWindow.from_date || bulkDate > currentWindow.to_date) {
				toast({
					title: '❌ Out of window',
					description: `Must be within ${currentWindow.from_date} to ${currentWindow.to_date}`,
					variant: 'destructive',
				})
				return
			}
		}
		const newDirty = { ...dirtyDates }
		for (const rowId of selectedRowIds) {
			const row = courseDates.find(c => c.row_id === rowId)
			if (row?.packet_id) newDirty[row.packet_id] = bulkDate
		}
		setDirtyDates(newDirty)
	}

	const saveCourseDates = async () => {
		const entries = Object.entries(dirtyDates)
			.map(([packetId, val]) => {
				const c = courseDates.find(c => c.packet_id === packetId)
				if (!c) return null
				return {
					packet_id: packetId,
					course_id: c.course_id,
					board_code: c.board_code,
					valuation_date: val,
				}
			})
			.filter((e): e is { packet_id: string; course_id: string; board_code: string; valuation_date: string | null } => e !== null)

		if (entries.length === 0) {
			toast({ title: 'Nothing to save', description: 'No changes made' })
			return
		}
		try {
			setSavingCourseDates(true)
			const r = await fetch('/api/post-exam/central-valuation/course-dates', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: effectiveInstitutionId,
					examination_session_id: selectedSessionId,
					entries,
				}),
			})
			if (!r.ok) {
				const j = await r.json().catch(() => ({}))
				throw new Error(j.error || 'Failed')
			}
			const res = await r.json()
			toast({
				title: '✅ Saved',
				description: `${res.upserted} updated, ${res.deleted} cleared`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			loadCourseDates(courseBoardCode)
		} catch (e: any) {
			toast({ title: '❌ Save failed', description: e.message || 'Unknown error', variant: 'destructive' })
		} finally {
			setSavingCourseDates(false)
		}
	}

	const toggleRowSelect = (rowId: string) => {
		const next = new Set(selectedRowIds)
		if (next.has(rowId)) next.delete(rowId)
		else next.add(rowId)
		setSelectedRowIds(next)
	}

	const toggleAllSelect = () => {
		const selectableRows = filteredCourseDates.filter(c => !!c.packet_id)
		const visibleIds = selectableRows.map(c => c.row_id)
		const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedRowIds.has(id))
		const next = new Set(selectedRowIds)
		if (allSelected) visibleIds.forEach(id => next.delete(id))
		else visibleIds.forEach(id => next.add(id))
		setSelectedRowIds(next)
	}

	const boardsWithWindow = boards.filter(b => !!b.window)

	return (
		<div className="space-y-2">
			{/* Compact inline institution + session picker */}
			<div className="flex items-center gap-2 flex-wrap rounded-md border bg-card px-2 py-1.5 shadow-sm">
				<CalendarCog className="h-3.5 w-3.5 text-violet-600 shrink-0" />
				<span className="text-xs font-medium">Dates:</span>
				{mustSelectInstitution && (
					<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
						<PopoverTrigger asChild>
							<Button variant="outline" role="combobox" className="h-7 text-xs px-2 min-w-[180px] max-w-[280px] justify-between">
								<span className="flex-1 pr-2 truncate text-left">
									{selectedInstitutionId
										? institutions.find(i => i.id === selectedInstitutionId)?.name || 'Institution'
										: 'Institution'}
								</span>
								<ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-[320px] p-0" align="start">
							<Command>
								<CommandInput placeholder="Search institution..." className="h-8 text-xs" />
								<CommandEmpty className="text-xs py-4">No institution found.</CommandEmpty>
								<CommandGroup className="max-h-56 overflow-auto">
									{institutions.map(i => (
										<CommandItem
											key={i.id}
											value={`${i.institution_code} ${i.name}`}
											onSelect={() => {
												setSelectedInstitutionId(i.id)
												setInstitutionOpen(false)
											}}
											className="py-2 text-xs"
										>
											<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', selectedInstitutionId === i.id ? 'opacity-100' : 'opacity-0')} />
											<span className="flex-1">{i.name}</span>
										</CommandItem>
									))}
								</CommandGroup>
							</Command>
						</PopoverContent>
					</Popover>
				)}
				<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
					<PopoverTrigger asChild>
						<Button variant="outline" role="combobox" className="h-7 text-xs px-2 min-w-[180px] max-w-[280px] justify-between" disabled={!effectiveInstitutionId}>
							<span className="flex-1 pr-2 truncate text-left">
								{selectedSessionId
									? sessions.find(s => s.id === selectedSessionId)?.session_name || 'Session'
									: 'Session'}
							</span>
							<ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-[320px] p-0" align="start">
						<Command>
							<CommandInput placeholder="Search session..." className="h-8 text-xs" />
							<CommandEmpty className="text-xs py-4">No session found.</CommandEmpty>
							<CommandGroup className="max-h-56 overflow-auto">
								{sessions.map(s => (
									<CommandItem
										key={s.id}
										value={`${s.session_code} ${s.session_name}`}
										onSelect={() => {
											setSelectedSessionId(s.id)
											setSessionOpen(false)
										}}
										className="py-2 text-xs"
									>
										<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', selectedSessionId === s.id ? 'opacity-100' : 'opacity-0')} />
										<span className="flex-1">{s.session_name}</span>
									</CommandItem>
								))}
							</CommandGroup>
						</Command>
					</PopoverContent>
				</Popover>
			</div>

			{isReady && selectedSessionId && effectiveInstitutionId && (
				<Tabs defaultValue="board-windows" className="space-y-2">
					<TabsList className="grid w-full max-w-md grid-cols-2 bg-violet-50 dark:bg-violet-950/30 p-1 h-10 rounded-lg border border-violet-200 dark:border-violet-800">
						<TabsTrigger value="board-windows" className="text-xs gap-1.5 rounded-md data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:font-semibold text-violet-700 dark:text-violet-300">
							<CalendarRange className="h-3.5 w-3.5" />
							Board Windows
						</TabsTrigger>
						<TabsTrigger value="course-dates" className="text-xs gap-1.5 rounded-md data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:font-semibold text-violet-700 dark:text-violet-300">
							<CalendarCog className="h-3.5 w-3.5" />
							Course Dates
						</TabsTrigger>
					</TabsList>

					{/* Tab 1: Board Windows */}
					<TabsContent value="board-windows" className="space-y-2">
						<Card className="shadow-md">
							<CardHeader className="pb-2 pt-2 px-3">
								<div className="flex items-center justify-between flex-wrap gap-2">
									<div className="flex items-center gap-2">
										<CardTitle className="text-sm">Board Valuation Windows</CardTitle>
										<Badge variant="outline" className="text-[10px] px-1.5 py-0">{filteredSortedBoards.length} / {boards.length}</Badge>
									</div>
									<div className="flex items-center gap-1.5 flex-wrap">
										<div className="relative">
											<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
											<Input
												value={boardSearch}
												onChange={e => setBoardSearch(e.target.value)}
												placeholder="Search board..."
												className="h-8 text-sm pl-6 w-[200px]"
											/>
										</div>
										<Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={loadBoards} disabled={loadingBoards} title="Refresh">
											<RefreshCw className={cn('h-3.5 w-3.5', loadingBoards && 'animate-spin')} />
										</Button>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="outline" size="sm" className="h-8 text-sm px-3">
													<Download className="h-3.5 w-3.5 mr-1.5" />Export<ChevronDown className="h-3 w-3 ml-1" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-44">
												<DropdownMenuItem onClick={downloadBoardTemplate}>
													<FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Download Template
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem onClick={exportBoardWindowsExcel}>
													<FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Export Excel
												</DropdownMenuItem>
												<DropdownMenuItem onClick={exportBoardWindowsJSON}>
													<FileJson className="h-3.5 w-3.5 mr-2" />Export JSON
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
										<Button variant="outline" size="sm" className="h-8 text-sm px-3" onClick={() => importInputRef.current?.click()} disabled={importing}>
											{importing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
											Import
										</Button>
										<input
											ref={importInputRef}
											type="file"
											accept=".xlsx,.xls,.csv,.json"
											className="hidden"
											onChange={e => {
												const f = e.target.files?.[0]
												if (f) onImportFile(f)
											}}
										/>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-0 px-3 pb-3">
								{loadingBoards ? (
									<div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
										<Loader2 className="h-4 w-4 animate-spin" />
										<span className="text-xs">Loading boards...</span>
									</div>
								) : boards.length === 0 ? (
									<div className="text-xs text-muted-foreground text-center py-6">
										No boards with exam registrations in this session.
									</div>
								) : (
									<>
									<div className="border rounded-md overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow className="bg-slate-800 hover:bg-slate-800">
													<TableHead className="text-white text-xs h-8 px-2 text-center w-14">
														<button onClick={() => toggleBoardSort('board_order')} className="inline-flex items-center gap-1 hover:text-slate-200">
															Order {boardSortIcon('board_order')}
														</button>
													</TableHead>
													<TableHead className="text-white text-xs h-8 px-2">
														<button onClick={() => toggleBoardSort('board_code')} className="inline-flex items-center gap-1 hover:text-slate-200">
															Board Code {boardSortIcon('board_code')}
														</button>
													</TableHead>
													<TableHead className="text-white text-xs h-8 px-2">
														<button onClick={() => toggleBoardSort('board_name')} className="inline-flex items-center gap-1 hover:text-slate-200">
															Board Name {boardSortIcon('board_name')}
														</button>
													</TableHead>
													<TableHead className="text-white text-xs h-8 px-2">
														<button onClick={() => toggleBoardSort('board_type')} className="inline-flex items-center gap-1 hover:text-slate-200">
															Type {boardSortIcon('board_type')}
														</button>
													</TableHead>
													<TableHead className="text-white text-xs h-8 px-2 text-center">
														<button onClick={() => toggleBoardSort('course_count')} className="inline-flex items-center gap-1 hover:text-slate-200">
															Courses {boardSortIcon('course_count')}
														</button>
													</TableHead>
													<TableHead className="text-white text-xs h-8 px-2">
														<button onClick={() => toggleBoardSort('from_date')} className="inline-flex items-center gap-1 hover:text-slate-200">
															From {boardSortIcon('from_date')}
														</button>
													</TableHead>
													<TableHead className="text-white text-xs h-8 px-2">
														<button onClick={() => toggleBoardSort('to_date')} className="inline-flex items-center gap-1 hover:text-slate-200">
															To {boardSortIcon('to_date')}
														</button>
													</TableHead>
													<TableHead className="text-white text-xs h-8 px-2 text-right">Action</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{boardPageItems.map((b, idx) => (
													<TableRow key={b.board_code} className={cn('h-8', idx % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-slate-50/70 dark:bg-slate-900/30')}>
														<TableCell className="text-xs text-center px-2 py-1 text-muted-foreground">{b.board_order ?? '-'}</TableCell>
														<TableCell className="text-xs font-medium px-2 py-1">{b.board_code}</TableCell>
														<TableCell className="text-xs px-2 py-1">{b.board_name}</TableCell>
														<TableCell className="text-xs px-2 py-1">{b.board_type || '-'}</TableCell>
														<TableCell className="text-xs text-center px-2 py-1">{b.course_count}</TableCell>
														<TableCell className="text-xs px-2 py-1">{b.window?.from_date || <span className="text-muted-foreground">—</span>}</TableCell>
														<TableCell className="text-xs px-2 py-1">{b.window?.to_date || <span className="text-muted-foreground">—</span>}</TableCell>
														<TableCell className="text-xs text-right px-2 py-1">
															<Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => openWindowSheet(b)}>
																{b.window ? 'Edit' : 'Set'}
															</Button>
														</TableCell>
													</TableRow>
												))}
												{filteredSortedBoards.length === 0 && (
													<TableRow>
														<TableCell colSpan={8} className="text-xs text-center text-muted-foreground py-4">
															{boardSearch ? `No boards match "${boardSearch}"` : 'No boards available.'}
														</TableCell>
													</TableRow>
												)}
											</TableBody>
										</Table>
									</div>

									{/* Pagination footer */}
									{filteredSortedBoards.length > 0 && (
										<div className="flex items-center justify-between flex-wrap gap-2 mt-2 px-1">
											<div className="flex items-center gap-2 text-xs text-muted-foreground">
												<span>
													Showing {boardPageStart + 1}-{Math.min(boardPageEnd, filteredSortedBoards.length)} of {filteredSortedBoards.length} boards
												</span>
												<span>·</span>
												<span>Rows:</span>
												<Select value={String(boardPageSize)} onValueChange={v => setBoardPageSize(Number(v))}>
													<SelectTrigger className="h-7 w-[70px] text-xs">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{[10, 25, 50, 100].map(n => (
															<SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
											<div className="flex items-center gap-1 text-xs">
												<span className="text-muted-foreground">Page {boardPage} of {totalBoardPages}</span>
												<Button
													variant="outline"
													size="sm"
													className="h-7 w-7 p-0"
													onClick={() => setBoardPage(p => Math.max(1, p - 1))}
													disabled={boardPage <= 1}
												>
													<ChevronLeft className="h-3.5 w-3.5" />
												</Button>
												<Button
													variant="outline"
													size="sm"
													className="h-7 w-7 p-0"
													onClick={() => setBoardPage(p => Math.min(totalBoardPages, p + 1))}
													disabled={boardPage >= totalBoardPages}
												>
													<ChevronRight className="h-3.5 w-3.5" />
												</Button>
											</div>
										</div>
									)}
									</>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					{/* Tab 2: Course Dates */}
					<TabsContent value="course-dates" className="space-y-4">
						<Card className="shadow-sm">
							<CardHeader className="pb-3">
								<CardTitle className="text-base">Select Board &amp; Course</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="flex flex-wrap items-end gap-3">
									<div className="space-y-1.5">
										<Label className="text-xs text-muted-foreground">Board</Label>
										<Popover open={courseBoardOpen} onOpenChange={setCourseBoardOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="w-full md:w-[280px] justify-between h-9 text-left text-xs truncate"
													disabled={boardsWithWindow.length === 0}
												>
													<span className="flex-1 pr-2 truncate">
														{courseBoardCode
															? (() => { const b = boards.find(b => b.board_code === courseBoardCode); return b ? `${b.board_code}-${b.board_name}` : courseBoardCode })()
															: boardsWithWindow.length === 0
																? 'Set a board window first'
																: 'Select board'}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[320px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search board..." className="h-8 text-xs" />
													<CommandEmpty className="text-xs py-4">No board found.</CommandEmpty>
													<CommandGroup className="max-h-56 overflow-auto">
														{boardsWithWindow.map(b => (
															<CommandItem
																key={b.board_code}
																value={`${b.board_code} ${b.board_name}`}
																onSelect={() => {
																	setCourseBoardCode(b.board_code)
																	setCourseBoardOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', courseBoardCode === b.board_code ? 'opacity-100' : 'opacity-0')} />
																<span className="flex-1">
																	{b.board_code}-{b.board_name}
																	<span className="text-muted-foreground ml-1">({b.window?.from_date} → {b.window?.to_date})</span>
																</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									<div className="space-y-1.5">
										<Label className="text-xs text-muted-foreground">Course Code</Label>
										<Popover open={courseCodeOpen} onOpenChange={setCourseCodeOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="w-full md:w-[280px] justify-between h-9 text-left text-xs truncate"
													disabled={!courseBoardCode || uniqueCourseCodes.length === 0}
												>
													<span className="flex-1 pr-2 truncate">
														{courseCodeFilter
															? (() => {
																const m = uniqueCourseCodes.find(u => u.code === courseCodeFilter)
																return m?.name ? `${courseCodeFilter} — ${m.name}` : courseCodeFilter
															})()
															: !courseBoardCode
																? 'Pick a board first'
																: uniqueCourseCodes.length === 0
																	? 'No courses'
																	: `All courses (${uniqueCourseCodes.length})`}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[320px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search course..." className="h-8 text-xs" />
													<CommandEmpty className="text-xs py-4">No course found.</CommandEmpty>
													<CommandGroup className="max-h-56 overflow-auto">
														<CommandItem
															key="__all__"
															value="all courses"
															onSelect={() => {
																setCourseCodeFilter('')
																setCourseCodeOpen(false)
															}}
															className="py-2 text-xs"
														>
															<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', !courseCodeFilter ? 'opacity-100' : 'opacity-0')} />
															<span className="flex-1 italic text-muted-foreground">All courses</span>
														</CommandItem>
														{uniqueCourseCodes.map(u => (
															<CommandItem
																key={u.code}
																value={`${u.code} ${u.name}`}
																onSelect={() => {
																	setCourseCodeFilter(u.code)
																	setCourseCodeOpen(false)
																}}
																className="py-2 text-xs"
															>
																<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', courseCodeFilter === u.code ? 'opacity-100' : 'opacity-0')} />
																<span className="flex-1">
																	<span className="font-medium">{u.code}</span>
																	<span className="text-muted-foreground ml-2">{u.name}</span>
																</span>
															</CommandItem>
														))}
													</CommandGroup>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{courseCodeFilter && (
										<Button
											variant="ghost"
											size="sm"
											className="h-9 text-xs"
											onClick={() => setCourseCodeFilter('')}
										>
											Clear
										</Button>
									)}
								</div>

								{currentWindow && (
									<p className="mt-3 text-xs text-muted-foreground">
										Valuation window: <span className="font-medium text-foreground">{currentWindow.from_date}</span> to <span className="font-medium text-foreground">{currentWindow.to_date}</span>
									</p>
								)}
							</CardContent>
						</Card>

						{courseBoardCode && (
							<Card className="shadow-md">
								<CardHeader className="pb-3">
									<div className="flex items-center justify-between flex-wrap gap-2">
										<div className="flex items-center gap-2">
											<CardTitle className="text-base">
												Courses in {boards.find(b => b.board_code === courseBoardCode)?.board_name}
											</CardTitle>
											<Badge variant="outline" className="text-[10px] px-1.5 py-0">
												{filteredCourseDates.length} / {courseDates.length}
											</Badge>
										</div>
										<div className="flex items-center gap-2 flex-wrap">
											<div className="relative">
												<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
												<Input
													value={courseSearch}
													onChange={e => setCourseSearch(e.target.value)}
													placeholder="Filter by course code/name..."
													className="h-8 text-xs pl-6 w-[220px]"
												/>
											</div>
											<Input
												type="date"
												value={bulkDate}
												onChange={e => setBulkDate(e.target.value)}
												min={currentWindow?.from_date}
												max={currentWindow?.to_date}
												className="h-8 text-xs w-[150px]"
												placeholder="Bulk date"
											/>
											<Button
												size="sm"
												variant="outline"
												onClick={applyBulkDate}
												disabled={selectedRowIds.size === 0 || !bulkDate}
											>
												Apply to {selectedRowIds.size} selected
											</Button>
											<Button
												size="sm"
												onClick={saveCourseDates}
												disabled={Object.keys(dirtyDates).length === 0 || savingCourseDates}
												className="bg-violet-600 hover:bg-violet-700"
											>
												{savingCourseDates ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
												Save ({Object.keys(dirtyDates).length})
											</Button>
										</div>
									</div>
								</CardHeader>
								<CardContent className="pt-0">
									{loadingCourses ? (
										<div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
											<Loader2 className="h-4 w-4 animate-spin" />
											<span className="text-sm">Loading courses...</span>
										</div>
									) : courseDates.length === 0 ? (
										<div className="text-sm text-muted-foreground text-center py-8">
											No courses with packets for this board.
										</div>
									) : (
										<div className="border rounded-lg overflow-x-auto">
											<Table>
												<TableHeader>
													<TableRow className="bg-slate-800 hover:bg-slate-800">
														<TableHead className="text-white text-xs w-10">
															<Checkbox
																checked={(() => {
																	const selectable = filteredCourseDates.filter(c => !!c.packet_id)
																	return selectable.length > 0 && selectable.every(c => selectedRowIds.has(c.row_id))
																})()}
																onCheckedChange={toggleAllSelect}
															/>
														</TableHead>
														<TableHead className="text-white text-xs">Course Code</TableHead>
														<TableHead className="text-white text-xs">Course Name</TableHead>
														<TableHead className="text-white text-xs text-center">Total</TableHead>
														<TableHead className="text-white text-xs text-center">Packets</TableHead>
														<TableHead className="text-white text-xs">Valuation Date</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{filteredCourseDates.length === 0 && (
														<TableRow>
															<TableCell colSpan={6} className="text-xs text-center text-muted-foreground py-4">
																No courses match &quot;{courseSearch}&quot;
															</TableCell>
														</TableRow>
													)}
													{filteredCourseDates.map((c, idx) => {
														const liveDate = c.packet_id && dirtyDates[c.packet_id] !== undefined
															? dirtyDates[c.packet_id] || ''
															: (c.valuation_date || '')
														const isDirty = c.packet_id ? dirtyDates[c.packet_id] !== undefined : false
														const prevRow = idx > 0 ? filteredCourseDates[idx - 1] : null
														const isFirstOfCourse = !prevRow || prevRow.course_id !== c.course_id
														return (
															<TableRow
																key={c.row_id}
																className={cn(
																	idx % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-slate-50/70 dark:bg-slate-900/30',
																	isDirty && 'bg-amber-50 dark:bg-amber-900/10'
																)}
															>
																<TableCell className="text-xs">
																	<Checkbox
																		checked={selectedRowIds.has(c.row_id)}
																		onCheckedChange={() => toggleRowSelect(c.row_id)}
																		disabled={!c.packet_id}
																	/>
																</TableCell>
																<TableCell className="text-xs font-medium">
																	{isFirstOfCourse ? c.course_code : <span className="text-muted-foreground/60">{c.course_code}</span>}
																</TableCell>
																<TableCell className="text-xs">
																	{isFirstOfCourse ? c.course_name : <span className="text-muted-foreground/60">{c.course_name}</span>}
																</TableCell>
																<TableCell className="text-xs text-center font-medium">
																	{c.packets_generated ? c.total_sheets : <span className="text-muted-foreground">—</span>}
																</TableCell>
																<TableCell className="text-xs text-center">
																	{c.packets_generated ? (
																		<Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-mono">
																			{c.packet_index}/{c.total_packets}
																		</Badge>
																	) : (
																		<Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">
																			Pending
																		</Badge>
																	)}
																</TableCell>
																<TableCell className="text-xs">
																	<Input
																		type="date"
																		value={liveDate}
																		min={currentWindow?.from_date}
																		max={currentWindow?.to_date}
																		onChange={e => c.packet_id && handlePacketDateChange(c.packet_id, e.target.value)}
																		disabled={!c.packet_id}
																		className="h-8 text-xs w-[150px]"
																		title={c.packet_id ? '' : 'Generate packets first'}
																	/>
																</TableCell>
															</TableRow>
														)
													})}
												</TableBody>
											</Table>
										</div>
									)}
								</CardContent>
							</Card>
						)}
					</TabsContent>
				</Tabs>
			)}

			{/* Sheet: set board window */}
			<Sheet open={windowSheetOpen} onOpenChange={setWindowSheetOpen}>
				<SheetContent className="sm:max-w-[480px]">
					<SheetHeader>
						<SheetTitle>{editingBoard?.board_name}</SheetTitle>
						<SheetDescription>Set the Central Valuation window for this board.</SheetDescription>
					</SheetHeader>
					<div className="space-y-4 mt-6">
						<div className="space-y-1.5">
							<Label className="text-xs">From date</Label>
							<Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9" />
						</div>
						<div className="space-y-1.5">
							<Label className="text-xs">To date</Label>
							<Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9" />
						</div>
					</div>
					<SheetFooter className="mt-6">
						<Button variant="outline" onClick={() => setWindowSheetOpen(false)}>Cancel</Button>
						<Button onClick={saveWindow} disabled={savingWindow} className="bg-violet-600 hover:bg-violet-700">
							{savingWindow ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
							Save Window
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</div>
	)
}
