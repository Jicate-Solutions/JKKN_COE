'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ModernBreadcrumb } from '@/components/common/modern-breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/common/use-toast'
import { Download, Check, ChevronsUpDown, FileText, FlaskConical, RefreshCw, Package, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { ProtectedRoute } from '@/components/common/protected-route'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface Course {
	id: string
	course_code: string
	course_name: string
}

interface Batch {
	id: string
	exam_date: string
	session: string
	exam_time: string | null
	batch_capacity: number
	batch_no: number
}

interface Packet {
	id: string
	packet_no: string
	total_sheets: number
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function FoilSheetDownloadPage() {
	const { toast } = useToast()

	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	// Active tab
	const [activeTab, setActiveTab] = useState<'theory' | 'practical'>('theory')

	// Shared dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])

	// Theory-specific
	const [theoryCourses, setTheoryCourses] = useState<Course[]>([])
	const [packets, setPackets] = useState<Packet[]>([])
	const [selectedTheoryCourseId, setSelectedTheoryCourseId] = useState('')
	const [selectedPacketId, setSelectedPacketId] = useState('')

	// Practical-specific
	const [practicalCourses, setPracticalCourses] = useState<Course[]>([])
	const [batches, setBatches] = useState<Batch[]>([])
	const [selectedPracticalCourseId, setSelectedPracticalCourseId] = useState('')
	const [selectedBatchId, setSelectedBatchId] = useState('')

	// Shared selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const [selectedSessionId, setSelectedSessionId] = useState('')

	// Combobox open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [theoryCourseOpen, setTheoryCourseOpen] = useState(false)
	const [packetOpen, setPacketOpen] = useState(false)
	const [practicalCourseOpen, setPracticalCourseOpen] = useState(false)

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [loadingPackets, setLoadingPackets] = useState(false)
	const [loadingBatches, setLoadingBatches] = useState(false)
	const [downloading, setDownloading] = useState(false)

	// Marks count for info badge
	const [marksCount, setMarksCount] = useState<number | null>(null)

	const effectiveInstitutionId = selectedInstitutionId || contextInstitutionId || ''

	// ---------------------------------------------------------------------------
	// Auto-fill institution for non-super-admin
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId])

	// ---------------------------------------------------------------------------
	// Load institutions (only for super_admin)
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && mustSelectInstitution) {
			loadInstitutions()
		}
	}, [isReady, mustSelectInstitution])

	// Load sessions when institution changes
	useEffect(() => {
		if (isReady && effectiveInstitutionId) {
			loadSessions(effectiveInstitutionId)
			resetFromSession()
		}
	}, [isReady, effectiveInstitutionId])

	// Load courses when session changes (based on active tab)
	useEffect(() => {
		if (isReady && selectedSessionId && effectiveInstitutionId) {
			if (activeTab === 'theory') {
				loadTheoryCourses(effectiveInstitutionId, selectedSessionId)
				resetTheoryFromCourse()
			} else {
				loadPracticalCourses(effectiveInstitutionId, selectedSessionId)
				resetPracticalFromCourse()
			}
		}
	}, [isReady, selectedSessionId, activeTab])

	// Load packets when theory course changes
	useEffect(() => {
		if (isReady && selectedTheoryCourseId && effectiveInstitutionId && selectedSessionId) {
			loadPackets(effectiveInstitutionId, selectedSessionId, selectedTheoryCourseId)
			setSelectedPacketId('')
			setMarksCount(null)
		}
	}, [isReady, selectedTheoryCourseId])

	// Load batches when practical course changes
	useEffect(() => {
		if (isReady && selectedPracticalCourseId && effectiveInstitutionId && selectedSessionId) {
			loadBatches(effectiveInstitutionId, selectedSessionId, selectedPracticalCourseId)
			setSelectedBatchId('')
			setMarksCount(null)
		}
	}, [isReady, selectedPracticalCourseId])

	// ---------------------------------------------------------------------------
	// Reset helpers
	// ---------------------------------------------------------------------------

	const resetFromSession = () => {
		setSelectedSessionId('')
		setSessions([])
		resetTheoryFromCourse()
		resetPracticalFromCourse()
	}

	const resetTheoryFromCourse = () => {
		setSelectedTheoryCourseId('')
		setTheoryCourses([])
		setSelectedPacketId('')
		setPackets([])
		setMarksCount(null)
	}

	const resetPracticalFromCourse = () => {
		setSelectedPracticalCourseId('')
		setPracticalCourses([])
		setSelectedBatchId('')
		setBatches([])
		setMarksCount(null)
	}

	// ---------------------------------------------------------------------------
	// Tab change handler
	// ---------------------------------------------------------------------------

	const handleTabChange = (tab: string) => {
		setActiveTab(tab as 'theory' | 'practical')
		setMarksCount(null)
		if (selectedSessionId && effectiveInstitutionId) {
			if (tab === 'theory') {
				loadTheoryCourses(effectiveInstitutionId, selectedSessionId)
				resetTheoryFromCourse()
			} else {
				loadPracticalCourses(effectiveInstitutionId, selectedSessionId)
				resetPracticalFromCourse()
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Data loaders
	// ---------------------------------------------------------------------------

	const loadInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/post-exam/foil-sheet-download?action=institutions')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load institutions')
			setInstitutions(await response.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load institutions', variant: 'destructive' })
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, toast])

	const loadSessions = useCallback(async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const url = appendToUrl(`/api/post-exam/foil-sheet-download?action=sessions&institutionId=${institutionId}`)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load sessions')
			setSessions(await response.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load sessions', variant: 'destructive' })
		} finally {
			setLoadingSessions(false)
		}
	}, [appendToUrl, toast])

	const loadTheoryCourses = useCallback(async (institutionId: string, sessionId: string) => {
		try {
			setLoadingCourses(true)
			const url = appendToUrl(
				`/api/post-exam/foil-sheet-download?action=external-courses&institutionId=${institutionId}&sessionId=${sessionId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load courses')
			setTheoryCourses(await response.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load courses', variant: 'destructive' })
		} finally {
			setLoadingCourses(false)
		}
	}, [appendToUrl, toast])

	const loadPracticalCourses = useCallback(async (institutionId: string, sessionId: string) => {
		try {
			setLoadingCourses(true)
			const url = appendToUrl(
				`/api/post-exam/foil-sheet-download?action=practical-courses&institutionId=${institutionId}&sessionId=${sessionId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load courses')
			setPracticalCourses(await response.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load courses', variant: 'destructive' })
		} finally {
			setLoadingCourses(false)
		}
	}, [appendToUrl, toast])

	const loadPackets = useCallback(async (institutionId: string, sessionId: string, courseId: string) => {
		try {
			setLoadingPackets(true)
			const url = appendToUrl(
				`/api/post-exam/foil-sheet-download?action=external-packets&institutionId=${institutionId}&sessionId=${sessionId}&courseId=${courseId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load packets')
			setPackets(await response.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load packets', variant: 'destructive' })
		} finally {
			setLoadingPackets(false)
		}
	}, [appendToUrl, toast])

	const loadBatches = useCallback(async (institutionId: string, sessionId: string, courseId: string) => {
		try {
			setLoadingBatches(true)
			const url = appendToUrl(
				`/api/post-exam/foil-sheet-download?action=practical-batches&institutionId=${institutionId}&sessionId=${sessionId}&courseId=${courseId}`
			)
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to load batches')
			setBatches(await response.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load batches', variant: 'destructive' })
		} finally {
			setLoadingBatches(false)
		}
	}, [appendToUrl, toast])

	// ---------------------------------------------------------------------------
	// Batch label helper
	// ---------------------------------------------------------------------------

	const getBatchLabel = (batch: Batch): string => {
		const date = batch.exam_date
			? new Date(batch.exam_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
			: ''
		return `Batch ${batch.batch_no} — ${date} ${batch.session}${batch.batch_capacity ? ` (Cap: ${batch.batch_capacity})` : ''}`
	}

	// ---------------------------------------------------------------------------
	// PDF download handlers
	// ---------------------------------------------------------------------------

	const loadImageAsBase64 = async (url: string): Promise<string> => {
		const response = await fetch(url)
		const blob = await response.blob()
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result as string)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	}

	const downloadTheoryFoilSheet = async () => {
		if (!selectedPacketId) {
			toast({ title: '⚠️ Selection Required', description: 'Please select all fields', variant: 'destructive' })
			return
		}

		try {
			setDownloading(true)

			const response = await fetch(
				`/api/post-exam/foil-sheet-download?action=external-marks-data&packetId=${selectedPacketId}`
			)

			if (!response.ok) {
				const err = await response.json()
				throw new Error(err.error || 'Failed to fetch marks data')
			}

			const data = await response.json()

			if (!data.students || data.students.length === 0) {
				toast({ title: '⚠️ No Data', description: 'No marks found for this packet', variant: 'destructive' })
				return
			}

			setMarksCount(data.students.length)

			const { generateExternalMarksPDF } = await import('@/lib/utils/generate-external-marks-pdf')

			const now = new Date()
			const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
			const examMonthYear = `${monthNames[now.getMonth()]}, ${now.getFullYear()}`

			const [leftLogo, rightLogo] = await Promise.all([
				loadImageAsBase64('/jkkncas_logo.png'),
				loadImageAsBase64('/jkkn_logo.png'),
			])

			const pdfData = {
				subject_code: data.course_details.subject_code,
				subject_name: data.course_details.subject_name,
				packet_no: data.course_details.packet_no,
				bundle_no: data.course_details.packet_no,
				total_sheets: data.course_details.total_sheets,
				maximum_marks: data.course_details.maximum_marks,
				minimum_pass_marks: data.course_details.minimum_pass_marks,
				exam_date: now.toLocaleDateString('en-GB'),
				exam_month_year: examMonthYear,
				program_code: '',
				program_name: '',
				semester: data.course_details.semester_number || 'I',
				year: data.course_details.semester_year || '1',
				students: data.students,
				logoImage: leftLogo,
				rightLogoImage: rightLogo,
			}

			const fileName = generateExternalMarksPDF(pdfData)

			toast({
				title: '✅ PDF Downloaded',
				description: `Foil sheet saved as ${fileName}`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('PDF generation error:', error)
			toast({
				title: '❌ Download Failed',
				description: error instanceof Error ? error.message : 'Failed to generate PDF',
				variant: 'destructive',
			})
		} finally {
			setDownloading(false)
		}
	}

	const downloadPracticalFoilSheet = async () => {
		if (!selectedBatchId || !effectiveInstitutionId || !selectedSessionId || !selectedPracticalCourseId) {
			toast({ title: '⚠️ Selection Required', description: 'Please select all fields', variant: 'destructive' })
			return
		}

		try {
			setDownloading(true)

			const response = await fetch(
				`/api/post-exam/foil-sheet-download?action=practical-marks-data` +
				`&institutionId=${effectiveInstitutionId}` +
				`&sessionId=${selectedSessionId}` +
				`&courseId=${selectedPracticalCourseId}` +
				`&timetableId=${selectedBatchId}`
			)

			if (!response.ok) {
				const err = await response.json()
				throw new Error(err.error || 'Failed to fetch marks data')
			}

			const data = await response.json()

			if (!data.students || data.students.length === 0) {
				toast({ title: '⚠️ No Data', description: 'No marks found for this batch', variant: 'destructive' })
				return
			}

			setMarksCount(data.students.length)

			const { generatePracticalMarksPDF } = await import('@/lib/utils/generate-practical-marks-pdf')

			const now = new Date()
			const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
			const examMonthYear = `${monthNames[now.getMonth()]}, ${now.getFullYear()}`
			const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

			const selectedBatch = batches.find(b => b.id === selectedBatchId)
			const batchLabel = selectedBatch ? getBatchLabel(selectedBatch) : 'Unknown Batch'

			const [leftLogo, rightLogo] = await Promise.all([
				loadImageAsBase64('/jkkncas_logo.png'),
				loadImageAsBase64('/jkkn_logo.png'),
			])

			const pdfData = {
				course_code: data.course_details.course_code,
				course_name: data.course_details.course_name,
				maximum_marks: data.course_details.maximum_marks,
				minimum_pass_marks: data.course_details.minimum_pass_marks || 0,
				batch_label: batchLabel,
				exam_date: dateStr,
				exam_month_year: examMonthYear,
				students: data.students,
				logoImage: leftLogo,
				rightLogoImage: rightLogo,
				internalExaminer: data.examiners?.internal || null,
				externalExaminer: data.examiners?.external || null,
			}

			const fileName = generatePracticalMarksPDF(pdfData)

			toast({
				title: '✅ PDF Downloaded',
				description: `Foil sheet saved as ${fileName}`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('PDF generation error:', error)
			toast({
				title: '❌ Download Failed',
				description: error instanceof Error ? error.message : 'Failed to generate PDF',
				variant: 'destructive',
			})
		} finally {
			setDownloading(false)
		}
	}

	// ---------------------------------------------------------------------------
	// Can download checks
	// ---------------------------------------------------------------------------

	const canDownloadTheory = !!selectedPacketId
	const canDownloadPractical = !!selectedBatchId

	// ---------------------------------------------------------------------------
	// Progress steps
	// ---------------------------------------------------------------------------

	const getTheoryProgress = () => {
		let steps = 0
		if (effectiveInstitutionId) steps++
		if (selectedSessionId) steps++
		if (selectedTheoryCourseId) steps++
		if (selectedPacketId) steps++
		return steps
	}

	const getPracticalProgress = () => {
		let steps = 0
		if (effectiveInstitutionId) steps++
		if (selectedSessionId) steps++
		if (selectedPracticalCourseId) steps++
		if (selectedBatchId) steps++
		return steps
	}

	// ---------------------------------------------------------------------------
	// Render — Combobox helper
	// ---------------------------------------------------------------------------

	const renderCombobox = (
		label: string,
		items: { id: string; label: string }[],
		selectedId: string,
		onSelect: (id: string) => void,
		open: boolean,
		setOpen: (v: boolean) => void,
		disabled: boolean,
		loading: boolean,
		placeholder: string,
		popoverWidth = 'w-[350px]',
	) => (
		<div className="space-y-1.5">
			<Label className="text-xs font-medium">
				{label} <span className="text-red-500">*</span>
			</Label>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						role="combobox"
						aria-expanded={open}
						className="w-full justify-between h-8 text-left text-xs truncate"
						disabled={disabled || loading}
					>
						<span className="flex-1 pr-2 truncate">
							{selectedId
								? items.find(i => i.id === selectedId)?.label
								: loading ? 'Loading...' : placeholder}
						</span>
						<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className={cn(popoverWidth, 'p-0')} align="start">
					<Command>
						<CommandInput placeholder={`Search ${label.toLowerCase()}...`} className="h-8 text-xs" />
						<CommandEmpty className="text-xs py-4">No {label.toLowerCase()} found.</CommandEmpty>
						<CommandGroup className="max-h-56 overflow-auto">
							{items.map(item => (
								<CommandItem
									key={item.id}
									value={item.label}
									onSelect={() => {
										onSelect(item.id)
										setOpen(false)
									}}
									className="py-2 text-xs"
								>
									<Check className={cn('mr-2 h-3.5 w-3.5 shrink-0', selectedId === item.id ? 'opacity-100' : 'opacity-0')} />
									<span className="flex-1 line-clamp-2">{item.label}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	)

	// ---------------------------------------------------------------------------
	// Render — Filter card content (shared between tabs)
	// ---------------------------------------------------------------------------

	const renderFilters = (
		type: 'theory' | 'practical',
		courses: Course[],
		selectedCourseId: string,
		onCourseSelect: (id: string) => void,
		courseOpen: boolean,
		setCourseOpen: (v: boolean) => void,
	) => (
		<div className={cn(
			'grid grid-cols-1 gap-3',
			mustSelectInstitution
				? 'md:grid-cols-2 lg:grid-cols-4'
				: 'md:grid-cols-3'
		)}>
			{/* Institution */}
			{mustSelectInstitution && renderCombobox(
				'Institution',
				institutions.map(i => ({ id: i.id, label: `${i.institution_code} - ${i.name}` })),
				selectedInstitutionId,
				(id) => {
					setSelectedInstitutionId(id)
					resetFromSession()
				},
				institutionOpen,
				setInstitutionOpen,
				false,
				loadingInstitutions,
				'Select institution...',
				'w-[400px]',
			)}

			{/* Exam Session */}
			{renderCombobox(
				'Exam Session',
				sessions.map(s => ({ id: s.id, label: s.session_name })),
				selectedSessionId,
				(id) => {
					setSelectedSessionId(id)
					if (type === 'theory') resetTheoryFromCourse()
					else resetPracticalFromCourse()
				},
				sessionOpen,
				setSessionOpen,
				!effectiveInstitutionId,
				loadingSessions,
				'Select session...',
				'w-[300px]',
			)}

			{/* Course */}
			{renderCombobox(
				'Course',
				courses.map(c => ({ id: c.id, label: `${c.course_code} - ${c.course_name}` })),
				selectedCourseId,
				onCourseSelect,
				courseOpen,
				setCourseOpen,
				!selectedSessionId,
				loadingCourses,
				'Select course...',
				'w-[400px]',
			)}

			{/* Last filter: Packet or Batch */}
			{type === 'theory' ? (
				<div className="space-y-1.5">
					<Label className="text-xs font-medium">
						Packet No <span className="text-red-500">*</span>
					</Label>
					<Select
						value={selectedPacketId}
						onValueChange={(v) => {
							setSelectedPacketId(v)
							setMarksCount(null)
						}}
						disabled={!selectedTheoryCourseId || loadingPackets}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue placeholder={loadingPackets ? 'Loading...' : 'Select packet...'} />
						</SelectTrigger>
						<SelectContent>
							{packets.map(p => (
								<SelectItem key={p.id} value={p.id} className="text-xs">
									Packet {p.packet_no} ({p.total_sheets} sheets)
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			) : (
				<div className="space-y-1.5">
					<Label className="text-xs font-medium">
						Batch <span className="text-red-500">*</span>
					</Label>
					<Select
						value={selectedBatchId}
						onValueChange={(v) => {
							setSelectedBatchId(v)
							setMarksCount(null)
						}}
						disabled={!selectedPracticalCourseId || loadingBatches}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue placeholder={loadingBatches ? 'Loading...' : 'Select batch...'} />
						</SelectTrigger>
						<SelectContent>
							{batches.map(b => (
								<SelectItem key={b.id} value={b.id} className="text-xs">
									{getBatchLabel(b)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}
		</div>
	)

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<ProtectedRoute requiredRoles={['super_admin', 'coe', 'admin']} requireAnyRole>
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="flex flex-col min-h-screen">
					<AppHeader />

					<div className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto">

						{/* Breadcrumb */}
						<ModernBreadcrumb
							items={[
								{ label: 'Post-Exam', href: '#' },
								{ label: 'Foil Sheet Download', current: true },
							]}
						/>

						{/* Scorecards */}
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
							<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{theoryCourses.length}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Theory Courses</p>
										</div>
										<FileText className="h-5 w-5 text-blue-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{practicalCourses.length}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Practical Courses</p>
										</div>
										<FlaskConical className="h-5 w-5 text-purple-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{packets.length}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Available Packets</p>
										</div>
										<Package className="h-5 w-5 text-amber-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{batches.length}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Available Batches</p>
										</div>
										<Layers className="h-5 w-5 text-emerald-500/40" />
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Loading context */}
						{!isReady && (
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center justify-center gap-2 text-muted-foreground h-32">
										<RefreshCw className="h-5 w-5 animate-spin" />
										<span className="text-sm">Loading institution context...</span>
									</div>
								</CardContent>
							</Card>
						)}

						{isReady && (
							<Tabs value={activeTab} onValueChange={handleTabChange}>
								<TabsList className="grid grid-cols-2 max-w-lg h-auto p-1.5 bg-muted/50 dark:bg-muted/30 rounded-xl backdrop-blur-sm border">
									<TabsTrigger
										value="theory"
										className="text-xs py-2.5 rounded-lg transition-all duration-200 gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-200 dark:data-[state=active]:shadow-blue-900/30"
									>
										<FileText className="h-3.5 w-3.5" />
										Theory (External)
									</TabsTrigger>
									<TabsTrigger
										value="practical"
										className="text-xs py-2.5 rounded-lg transition-all duration-200 gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-purple-200 dark:data-[state=active]:shadow-purple-900/30"
									>
										<FlaskConical className="h-3.5 w-3.5" />
										Practical
									</TabsTrigger>
								</TabsList>

								{/* ============================================================ */}
								{/* Theory Tab */}
								{/* ============================================================ */}
								<TabsContent value="theory" className="mt-4">
									<Card className="border-t-2 border-t-blue-500">
										<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
											<div className="flex items-center justify-between">
												<div>
													<p className="text-base font-semibold">Theory Foil Sheet</p>
													<p className="text-xs text-muted-foreground">
														Select institution, session, course and packet to download
													</p>
												</div>
												<div className="flex items-center gap-2">
													<Badge
														variant="outline"
														className={cn(
															'text-xs tabular-nums',
															getTheoryProgress() === 4
																? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/30'
																: ''
														)}
													>
														{getTheoryProgress()}/4 selected
													</Badge>
												</div>
											</div>
										</CardHeader>
										<CardContent className="p-4 space-y-4">
											{renderFilters(
												'theory',
												theoryCourses,
												selectedTheoryCourseId,
												(id) => {
													setSelectedTheoryCourseId(id)
													setSelectedPacketId('')
													setPackets([])
													setMarksCount(null)
												},
												theoryCourseOpen,
												setTheoryCourseOpen,
											)}

											{/* Download section */}
											<div className="flex items-center gap-3 pt-3 border-t">
												<Button
													onClick={downloadTheoryFoilSheet}
													disabled={!canDownloadTheory || downloading}
													size="sm"
													className="gap-2 h-8 text-sm px-4"
												>
													{downloading ? (
														<RefreshCw className="h-4 w-4 animate-spin" />
													) : (
														<Download className="h-4 w-4" />
													)}
													{downloading ? 'Generating PDF...' : 'Download Foil Sheet'}
												</Button>
												{marksCount !== null && activeTab === 'theory' && (
													<Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 text-xs">
														{marksCount} learner{marksCount !== 1 ? 's' : ''}
													</Badge>
												)}
												{!canDownloadTheory && selectedSessionId && (
													<span className="text-xs text-muted-foreground">
														Complete all selections to download
													</span>
												)}
											</div>
										</CardContent>
									</Card>
								</TabsContent>

								{/* ============================================================ */}
								{/* Practical Tab */}
								{/* ============================================================ */}
								<TabsContent value="practical" className="mt-4">
									<Card className="border-t-2 border-t-purple-500">
										<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
											<div className="flex items-center justify-between">
												<div>
													<p className="text-base font-semibold">Practical Foil Sheet</p>
													<p className="text-xs text-muted-foreground">
														Select institution, session, course and batch to download
													</p>
												</div>
												<div className="flex items-center gap-2">
													<Badge
														variant="outline"
														className={cn(
															'text-xs tabular-nums',
															getPracticalProgress() === 4
																? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/30'
																: ''
														)}
													>
														{getPracticalProgress()}/4 selected
													</Badge>
												</div>
											</div>
										</CardHeader>
										<CardContent className="p-4 space-y-4">
											{renderFilters(
												'practical',
												practicalCourses,
												selectedPracticalCourseId,
												(id) => {
													setSelectedPracticalCourseId(id)
													setSelectedBatchId('')
													setBatches([])
													setMarksCount(null)
												},
												practicalCourseOpen,
												setPracticalCourseOpen,
											)}

											{/* Download section */}
											<div className="flex items-center gap-3 pt-3 border-t">
												<Button
													onClick={downloadPracticalFoilSheet}
													disabled={!canDownloadPractical || downloading}
													size="sm"
													className="gap-2 h-8 text-sm px-4"
												>
													{downloading ? (
														<RefreshCw className="h-4 w-4 animate-spin" />
													) : (
														<Download className="h-4 w-4" />
													)}
													{downloading ? 'Generating PDF...' : 'Download Foil Sheet'}
												</Button>
												{marksCount !== null && activeTab === 'practical' && (
													<Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 text-xs">
														{marksCount} learner{marksCount !== 1 ? 's' : ''}
													</Badge>
												)}
												{!canDownloadPractical && selectedSessionId && (
													<span className="text-xs text-muted-foreground">
														Complete all selections to download
													</span>
												)}
											</div>
										</CardContent>
									</Card>
								</TabsContent>
							</Tabs>
						)}
					</div>
				</SidebarInset>
			</SidebarProvider>
		</ProtectedRoute>
	)
}
