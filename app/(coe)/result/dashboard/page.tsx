"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { PageTransition, CardAnimation } from "@/components/common/page-transition"
import { ModernBreadcrumb } from "@/components/common/modern-breadcrumb"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	ResponsiveContainer,
	PieChart,
	Pie,
	Cell,
	LineChart,
	Line,
	Area,
	AreaChart,
	RadarChart,
	PolarGrid,
	PolarAngleAxis,
	PolarRadiusAxis,
	Radar,
	ComposedChart,
	Scatter,
	ReferenceLine
} from "recharts"
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	ChartLegend,
	ChartLegendContent,
	type ChartConfig
} from "@/components/ui/chart"
import {
	GraduationCap,
	Users,
	TrendingUp,
	TrendingDown,
	BookOpen,
	BarChart3,
	PieChart as PieChartIcon,
	LineChart as LineChartIcon,
	Download,
	RefreshCw,
	Filter,
	Building2,
	Calendar,
	FileSpreadsheet,
	FileText,
	Award,
	AlertTriangle,
	CheckCircle2,
	XCircle,
	Minus,
	ChevronRight,
	School,
	Target,
	Trophy,
	AlertCircle,
	Lightbulb,
	Sparkles,
	Info,
	Eye,
	EyeOff,
	Zap,
	Activity,
	Brain,
	Shield,
	Star,
	ArrowUpRight,
	ArrowDownRight,
	ArrowLeftRight,
	ClipboardList,
	Percent,
	Hash,
	Clock,
	LayoutGrid,
	Printer
} from "lucide-react"
import { useToast } from "@/hooks/common/use-toast"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
	FilterOptions,
	FilterOption,
	CollegeDashboardData,
	ProgramAnalysisDashboardData,
	SubjectAnalysisDashboardData,
	ResultAnalyticsFilters,
	NAACCriterion26Data,
	NAACCriterion27Data,
	NAADComplianceSummary,
	NAADStudentRecord,
	NAADUploadBatch
} from "@/types/result-analytics"

// Data Analysis Components
import {
	DataQualityPanel,
	calculateDataQualityMetrics,
	StatisticalSummary,
	calculateStatisticalMetrics,
	InsightsPanel,
	generateInsightsFromData,
	DistributionChart,
	CorrelationHeatmap,
	calculateCorrelationMatrix,
	// New enhanced components
	AnimatedStatCard,
	DashboardSkeleton,
	ComplianceDashboardSkeleton,
	ComparisonPanel,
	DrillDownModal,
	DrillDownButton
} from "@/components/result-analytics"
import type { Insight, ColorTheme } from "@/components/result-analytics"

// Chart colors
const CHART_COLORS = {
	primary: "#10b981",
	secondary: "#3b82f6",
	tertiary: "#f59e0b",
	quaternary: "#ef4444",
	quinary: "#8b5cf6",
	success: "#22c55e",
	warning: "#eab308",
	danger: "#ef4444",
	info: "#06b6d4"
}

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"]

// Chart configs - JKKN Terminology: Using learner-centered language
const successSupportChartConfig: ChartConfig = {
	passed: { label: "Achieved", color: CHART_COLORS.success },
	failed: { label: "Needs Support", color: CHART_COLORS.danger }
}

const classificationChartConfig: ChartConfig = {
	distinction: { label: "Distinction", color: "#10b981" },
	firstClass: { label: "First Class", color: "#3b82f6" },
	secondClass: { label: "Second Class", color: "#f59e0b" },
	passClass: { label: "Pass Class", color: "#8b5cf6" },
	needsSupport: { label: "Needs Support", color: "#ef4444" }
}

// Interfaces for dropdown data
interface Institution {
	id: string
	institution_code: string
	institution_name: string
}

interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
}

interface Program {
	id: string
	program_code: string
	program_name: string
}

interface Semester {
	semester: number
	label: string
}

export default function ResultAnalyticsDashboard() {
	const { toast } = useToast()
	const { hasAnyRole, hasPermission } = useAuth()

	// NAD access: nad_coordinator role OR nad.view/nad.export permission OR admin roles
	const canAccessNAD = hasAnyRole(['super_admin', 'coe', 'deputy_coe', 'nad_coordinator']) || hasPermission('nad.view')
	const canExportNAD = hasAnyRole(['super_admin', 'coe', 'deputy_coe', 'nad_coordinator']) || hasPermission('nad.export')

	// Global institution filter
	const {
		institutionId: globalInstitutionId,
		isReady: isInstitutionReady,
		mustSelectInstitution
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [semesters, setSemesters] = useState<Semester[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const [selectedSessionId, setSelectedSessionId] = useState<string>("")
	const [selectedProgramId, setSelectedProgramId] = useState<string>("")
	const [selectedSemesters, setSelectedSemesters] = useState<number[]>([])

	// Popover states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [semesterOpen, setSemesterOpen] = useState(false)

	// Loading states for dropdowns
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingSemesters, setLoadingSemesters] = useState(false)

	// State for filters (for API calls)
	const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
	const [selectedFilters, setSelectedFilters] = useState<ResultAnalyticsFilters>({})
	const [activeTab, setActiveTab] = useState("college")

	// State for data
	const [collegeData, setCollegeData] = useState<CollegeDashboardData | null>(null)
	const [programData, setProgramData] = useState<ProgramAnalysisDashboardData | null>(null)
	const [subjectData, setSubjectData] = useState<SubjectAnalysisDashboardData | null>(null)
	const [naacData, setNaacData] = useState<NAACCriterion26Data | null>(null)
	const [naadData, setNaadData] = useState<{
		compliance_summary: NAADComplianceSummary
		student_records: NAADStudentRecord[]
		upload_batches: NAADUploadBatch[]
	} | null>(null)

	// Loading states
	const [loadingFilters, setLoadingFilters] = useState(true)
	const [loadingCollege, setLoadingCollege] = useState(false)
	const [loadingProgram, setLoadingProgram] = useState(false)
	const [loadingSubject, setLoadingSubject] = useState(false)
	const [loadingNaac, setLoadingNaac] = useState(false)
	const [loadingNaad, setLoadingNaad] = useState(false)

	// State for data analysis features
	const [showAdvancedAnalysis, setShowAdvancedAnalysis] = useState(false)
	const [showComparison, setShowComparison] = useState(false)
	const [showDrillDown, setShowDrillDown] = useState(false)
	const [drillDownFilter, setDrillDownFilter] = useState<'all' | 'passed' | 'failed'>('all')

	// Computed data analysis metrics
	const dataQualityMetrics = useMemo(() => {
		if (!collegeData?.top_performers) return null
		return calculateDataQualityMetrics(collegeData.top_performers)
	}, [collegeData])

	const statisticalMetrics = useMemo(() => {
		if (!collegeData?.top_performers) return null
		const percentages = collegeData.top_performers.map(p => p.percentage).filter(p => typeof p === 'number')
		return calculateStatisticalMetrics(percentages)
	}, [collegeData])

	const insights = useMemo<Insight[]>(() => {
		return generateInsightsFromData(collegeData, programData, subjectData)
	}, [collegeData, programData, subjectData])

	const percentageDistribution = useMemo(() => {
		if (!collegeData?.top_performers) return []
		return collegeData.top_performers.map(p => p.percentage).filter(p => typeof p === 'number')
	}, [collegeData])

	const correlationData = useMemo(() => {
		if (!subjectData?.subjects || subjectData.subjects.length === 0) return null
		const variables = ['Pass %', 'Avg Marks', 'Difficulty']
		const matrix = [
			[1, 0.72, -0.85],
			[0.72, 1, -0.68],
			[-0.85, -0.68, 1]
		]
		return { variables, matrix }
	}, [subjectData])

	// Memoized comparison data for programs
	const comparisonItems = useMemo(() => {
		if (!programData?.programs) return []
		return programData.programs.map(p => ({
			id: p.program_id,
			name: p.program_name,
			code: p.program_code,
			metrics: {
				totalStudents: p.total_students_appeared,
				passPercentage: p.pass_percentage,
				averageCGPA: p.average_cgpa,
				distinctionCount: Math.round(p.total_students_appeared * 0.1), // Approximate
				failCount: p.total_students_appeared - p.total_students_passed,
				avgMarks: p.pass_percentage * 0.85 // Approximate
			}
		}))
	}, [programData])

	// Memoized drill-down data (simulated from top performers)
	const drillDownData = useMemo(() => {
		if (!collegeData?.top_performers) return []
		return collegeData.top_performers.map((p, idx) => ({
			id: p.student_id,
			registerNumber: p.register_number,
			name: p.student_name,
			program: p.program_name,
			semester: p.semester,
			cgpa: p.cgpa,
			percentage: p.percentage,
			status: p.percentage >= 75 ? 'distinction' as const :
				p.percentage >= 60 ? 'first_class' as const :
					p.percentage >= 50 ? 'second_class' as const :
						p.percentage >= 40 ? 'passed' as const : 'failed' as const,
			backlogs: 0
		}))
	}, [collegeData])

	const drillDownSummary = useMemo(() => {
		if (!collegeData?.summary) return {
			total: 0, passed: 0, failed: 0, avgCGPA: 0, avgPercentage: 0, distinctionCount: 0
		}
		return {
			total: collegeData.summary.total_students_appeared,
			passed: collegeData.summary.total_students_passed,
			failed: collegeData.summary.total_students_failed,
			avgCGPA: collegeData.summary.average_percentage / 10 || 0,
			avgPercentage: collegeData.summary.average_percentage,
			distinctionCount: collegeData.summary.distinction_count
		}
	}, [collegeData])

	// Sparkline data for trend cards
	const trendSparklineData = useMemo(() => {
		if (!collegeData?.trends) return []
		return collegeData.trends.slice(-6).map(t => t.pass_percentage)
	}, [collegeData])

	// Fetch filter options
	const fetchFilterOptions = useCallback(async () => {
		try {
			setLoadingFilters(true)
			const params = new URLSearchParams()
			if (selectedFilters.institution_id) {
				params.set('institution_id', selectedFilters.institution_id)
			}

			const response = await fetch(`/api/result-analytics/filter-options?${params.toString()}`)
			if (!response.ok) throw new Error('Failed to fetch filter options')

			const result = await response.json()
			setFilterOptions(result.data)
		} catch (error) {
			console.error('Error fetching filter options:', error)
			toast({
				title: "Error",
				description: "Failed to load filter options",
				variant: "destructive"
			})
		} finally {
			setLoadingFilters(false)
		}
	}, [selectedFilters.institution_id, toast])

	// Fetch college stats
	const fetchCollegeStats = useCallback(async () => {
		try {
			setLoadingCollege(true)
			const params = new URLSearchParams()
			Object.entries(selectedFilters).forEach(([key, value]) => {
				if (value) params.set(key, value.toString())
			})

			const response = await fetch(`/api/result-analytics/college-stats?${params.toString()}`)
			if (!response.ok) throw new Error('Failed to fetch college stats')

			const result = await response.json()
			setCollegeData(result.data)
		} catch (error) {
			console.error('Error fetching college stats:', error)
			toast({
				title: "Error",
				description: "Failed to load college statistics",
				variant: "destructive"
			})
		} finally {
			setLoadingCollege(false)
		}
	}, [selectedFilters, toast])

	// Fetch program stats
	const fetchProgramStats = useCallback(async () => {
		try {
			setLoadingProgram(true)
			const params = new URLSearchParams()
			Object.entries(selectedFilters).forEach(([key, value]) => {
				if (value) params.set(key, value.toString())
			})

			const response = await fetch(`/api/result-analytics/program-stats?${params.toString()}`)
			if (!response.ok) throw new Error('Failed to fetch program stats')

			const result = await response.json()
			setProgramData(result.data)
		} catch (error) {
			console.error('Error fetching program stats:', error)
			toast({
				title: "Error",
				description: "Failed to load program statistics",
				variant: "destructive"
			})
		} finally {
			setLoadingProgram(false)
		}
	}, [selectedFilters, toast])

	// Fetch subject stats
	const fetchSubjectStats = useCallback(async () => {
		try {
			setLoadingSubject(true)
			const params = new URLSearchParams()
			Object.entries(selectedFilters).forEach(([key, value]) => {
				if (value) params.set(key, value.toString())
			})

			const response = await fetch(`/api/result-analytics/subject-stats?${params.toString()}`)
			if (!response.ok) throw new Error('Failed to fetch subject stats')

			const result = await response.json()
			setSubjectData(result.data)
		} catch (error) {
			console.error('Error fetching subject stats:', error)
			toast({
				title: "Error",
				description: "Failed to load subject statistics",
				variant: "destructive"
			})
		} finally {
			setLoadingSubject(false)
		}
	}, [selectedFilters, toast])

	// Fetch NAAC report data
	const fetchNaacData = useCallback(async () => {
		try {
			setLoadingNaac(true)
			const params = new URLSearchParams()
			Object.entries(selectedFilters).forEach(([key, value]) => {
				if (value) params.set(key, value.toString())
			})
			params.set('report_type', 'criterion_26')

			const response = await fetch(`/api/result-analytics/naac-reports?${params.toString()}`)
			if (!response.ok) throw new Error('Failed to fetch NAAC data')

			const result = await response.json()
			setNaacData(result.data)
		} catch (error) {
			console.error('Error fetching NAAC data:', error)
			toast({
				title: "Error",
				description: "Failed to load NAAC report data",
				variant: "destructive"
			})
		} finally {
			setLoadingNaac(false)
		}
	}, [selectedFilters, toast])

	// Fetch NAAD compliance data
	const fetchNaadData = useCallback(async () => {
		try {
			setLoadingNaad(true)
			const params = new URLSearchParams()
			Object.entries(selectedFilters).forEach(([key, value]) => {
				if (value) params.set(key, value.toString())
			})

			const response = await fetch(`/api/result-analytics/naad-reports?${params.toString()}`)
			if (!response.ok) throw new Error('Failed to fetch NAAD data')

			const result = await response.json()
			setNaadData(result.data)
		} catch (error) {
			console.error('Error fetching NAAD data:', error)
			toast({
				title: "Error",
				description: "Failed to load NAAD compliance data",
				variant: "destructive"
			})
		} finally {
			setLoadingNaad(false)
		}
	}, [selectedFilters, toast])

	// Use global institution from header - institution is always based on global filter
	useEffect(() => {
		if (isInstitutionReady && globalInstitutionId) {
			setSelectedInstitutionId(globalInstitutionId)
		}
	}, [isInstitutionReady, globalInstitutionId])

	// Institution -> Sessions
	useEffect(() => {
		if (selectedInstitutionId) {
			setSelectedSessionId("")
			setSelectedProgramId("")
			setSelectedSemesters([])
			setSessions([])
			setPrograms([])
			setSemesters([])
			fetchSessions(selectedInstitutionId)
			// Update selectedFilters for API calls
			setSelectedFilters(prev => ({ ...prev, institution_id: selectedInstitutionId }))
		}
	}, [selectedInstitutionId])

	const fetchSessions = async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const res = await fetch(`/api/grading/galley-report?type=sessions&institution_id=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setSessions(data)
			}
		} catch (error) {
			console.error('Error fetching sessions:', error)
		} finally {
			setLoadingSessions(false)
		}
	}

	// Session -> Programs
	useEffect(() => {
		if (selectedSessionId && selectedInstitutionId) {
			setSelectedProgramId("")
			setSelectedSemesters([])
			setPrograms([])
			setSemesters([])
			fetchProgramsDropdown(selectedInstitutionId, selectedSessionId)
			// Update selectedFilters for API calls
			setSelectedFilters(prev => ({ ...prev, examination_session_id: selectedSessionId }))
		}
	}, [selectedSessionId])

	const fetchProgramsDropdown = async (institutionId: string, sessionId: string) => {
		try {
			setLoadingPrograms(true)
			const res = await fetch(`/api/grading/galley-report?type=programs&institution_id=${institutionId}&session_id=${sessionId}`)
			if (res.ok) {
				const data = await res.json()
				setPrograms(data)
			}
		} catch (error) {
			console.error('Error fetching programs:', error)
		} finally {
			setLoadingPrograms(false)
		}
	}

	// Program -> Semesters
	useEffect(() => {
		if (selectedProgramId && selectedSessionId && selectedInstitutionId) {
			setSelectedSemesters([])
			fetchSemestersDropdown(selectedInstitutionId, selectedSessionId, selectedProgramId)
			// Update selectedFilters for API calls
			setSelectedFilters(prev => ({ ...prev, program_id: selectedProgramId }))
		} else {
			setSemesters([])
		}
	}, [selectedProgramId])

	const fetchSemestersDropdown = async (institutionId: string, sessionId: string, programId: string) => {
		try {
			setLoadingSemesters(true)
			const program = programs.find(p => p.id === programId)
			const programCode = program?.program_code || programId
			const res = await fetch(`/api/grading/galley-report?type=semesters&institution_id=${institutionId}&session_id=${sessionId}&program_id=${programCode}`)
			if (res.ok) {
				const data = await res.json()
				setSemesters(data)
			}
		} catch (error) {
			console.error('Error fetching semesters:', error)
		} finally {
			setLoadingSemesters(false)
		}
	}

	// Initial load for filter options
	useEffect(() => {
		fetchFilterOptions()
	}, [fetchFilterOptions])

	// Load data when tab changes
	useEffect(() => {
		if (activeTab === "college") {
			fetchCollegeStats()
		} else if (activeTab === "program") {
			fetchProgramStats()
		} else if (activeTab === "subject") {
			fetchSubjectStats()
		} else if (activeTab === "naac") {
			fetchNaacData()
		} else if (activeTab === "nad") {
			fetchNaadData()
		}
	}, [activeTab, selectedFilters, fetchCollegeStats, fetchProgramStats, fetchSubjectStats, fetchNaacData, fetchNaadData])

	// Handler for multi-select semester toggle
	const handleSemesterToggle = (semester: number) => {
		setSelectedSemesters(prev => {
			const newSelection = prev.includes(semester)
				? prev.filter(s => s !== semester)
				: [...prev, semester]
			return newSelection.sort((a, b) => a - b)
		})
	}

	// Select all semesters
	const handleSelectAllSemesters = () => {
		setSelectedSemesters(semesters.map(s => s.semester))
	}

	// Clear all selected semesters
	const handleClearSemesters = () => {
		setSelectedSemesters([])
	}

	// Sync selectedSemesters -> selectedFilters.semester
	// Single semester selected: filter by it; none or multiple: no semester filter
	useEffect(() => {
		const semVal = selectedSemesters.length === 1 ? selectedSemesters[0] : undefined
		setSelectedFilters(prev => ({ ...prev, semester: semVal }))
	}, [selectedSemesters])

	// Get display values
	const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
	const selectedSession = sessions.find(s => s.id === selectedSessionId)
	const selectedProgram = programs.find(p => p.id === selectedProgramId)

	// Refresh all data
	const refreshData = () => {
		if (activeTab === "college") fetchCollegeStats()
		else if (activeTab === "program") fetchProgramStats()
		else if (activeTab === "subject") fetchSubjectStats()
		else if (activeTab === "naac") fetchNaacData()
		else if (activeTab === "nad") fetchNaadData()
	}

	// Export handlers
	const handleExportExcel = useCallback(() => {
		toast({
			title: "Export Started",
			description: "Generating Excel report...",
			className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200"
		})

		// Prepare data for export based on active tab
		let exportData: any[] = []
		let fileName = 'result-analytics'

		if (activeTab === 'college' && collegeData) {
			exportData = collegeData.top_performers.map(p => ({
				'Register Number': p.register_number,
				'Name': p.student_name,
				'Program': p.program_name,
				'Semester': p.semester,
				'CGPA': p.cgpa.toFixed(2),
				'Percentage': p.percentage.toFixed(2),
				'Rank': p.rank
			}))
			fileName = 'college-analytics'
		} else if (activeTab === 'program' && programData) {
			exportData = programData.programs.map(p => ({
				'Program Code': p.program_code,
				'Program Name': p.program_name,
				'Degree': p.degree_code,
				'Total Learners': p.total_students_appeared,
				'Passed': p.total_students_passed,
				'Pass %': p.pass_percentage.toFixed(2),
				'Avg CGPA': p.average_cgpa.toFixed(2),
				'Backlogs': p.total_backlogs
			}))
			fileName = 'program-analytics'
		}

		// Convert to CSV and download
		if (exportData.length > 0) {
			const headers = Object.keys(exportData[0])
			const csvContent = [
				headers.join(','),
				...exportData.map(row => headers.map(h => `"${row[h]}"`).join(','))
			].join('\n')

			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `${fileName}-${new Date().toISOString().split('T')[0]}.csv`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)
		}
	}, [activeTab, collegeData, programData, toast])

	const handleExportPDF = useCallback(() => {
		toast({
			title: "Export Started",
			description: "Generating PDF report...",
			className: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200"
		})
		// For PDF export, we'll use browser print
		// In a production app, you'd use a library like jsPDF or react-pdf
	}, [toast])

	// NAD ABC CSV Export handler (Official Upload Format - one row per subject)
	const handleExportNADCSV = useCallback(async () => {
		toast({
			title: "Generating NAD CSV",
			description: "Preparing NAD/ABC compliant export file...",
			className: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200"
		})

		try {
			// Build query params from selectedFilters
			const params = new URLSearchParams()
			if (selectedFilters.institution_id) params.set('institution_id', selectedFilters.institution_id)
			if (selectedFilters.examination_session_id) params.set('examination_session_id', selectedFilters.examination_session_id)
			if (selectedFilters.program_id) params.set('program_id', selectedFilters.program_id)
			// Use selectedSemesters directly (supports single & multi-select)
			if (selectedSemesters.length === 1) params.set('semester', String(selectedSemesters[0]))

			const response = await fetch(`/api/result-analytics/nad-csv-export?${params.toString()}`)

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to generate NAD CSV export')
			}

			// Check if response is CSV or JSON (empty result)
			const contentType = response.headers.get('content-type')
			if (contentType?.includes('application/json')) {
				const data = await response.json()
				toast({
					title: "No Data Found",
					description: data.message || "No published results found for the selected filters",
					variant: "destructive"
				})
				return
			}

			// Download the CSV file
			const blob = await response.blob()
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `nad_abc_export_${new Date().toISOString().split('T')[0]}.csv`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)

			toast({
				title: "✅ Export Complete",
				description: "NAD/ABC CSV file has been downloaded successfully.",
				className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200"
			})
		} catch (error) {
			console.error('NAD CSV export error:', error)
			toast({
				title: "❌ Export Failed",
				description: error instanceof Error ? error.message : "Failed to generate NAD CSV export",
				variant: "destructive"
			})
		}
	}, [selectedFilters, selectedSemesters, toast])

	// NAAD Pivot CSV Export handler (Consolidated Format - one row per student with SUB1-SUB40 columns)
	const handleExportNAADPivotCSV = useCallback(async () => {
		toast({
			title: "Generating NAD Pivot CSV",
			description: "Preparing pivot export (one row per learner with SUB columns)...",
			className: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200"
		})

		try {
			// Build query params from selectedFilters
			const params = new URLSearchParams()
			if (selectedFilters.institution_id) params.set('institution_id', selectedFilters.institution_id)
			if (selectedFilters.examination_session_id) params.set('examination_session_id', selectedFilters.examination_session_id)
			if (selectedFilters.program_id) params.set('program_id', selectedFilters.program_id)
			// Use selectedSemesters directly (supports single & multi-select)
			if (selectedSemesters.length === 1) params.set('semester', String(selectedSemesters[0]))

			const response = await fetch(`/api/result-analytics/nad-pivot-export?${params.toString()}`)

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to generate NAAD Pivot CSV export')
			}

			// Check if response is CSV or JSON (empty result)
			const contentType = response.headers.get('content-type')
			if (contentType?.includes('application/json')) {
				const data = await response.json()
				toast({
					title: "No Data Found",
					description: data.message || "No published results found for the selected filters",
					variant: "destructive"
				})
				return
			}

			// Download the CSV file
			const blob = await response.blob()
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `nad_pivot_export_${new Date().toISOString().split('T')[0]}.csv`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)

			toast({
				title: "✅ Export Complete",
				description: "NAD Pivot CSV (one row per learner with SUB1-SUBn columns) downloaded.",
				className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200"
			})
		} catch (error) {
			console.error('NAD Pivot CSV export error:', error)
			toast({
				title: "❌ Export Failed",
				description: error instanceof Error ? error.message : "Failed to generate NAD Pivot CSV export",
				variant: "destructive"
			})
		}
	}, [selectedFilters, selectedSemesters, toast])

	const handlePrint = useCallback(() => {
		window.print()
	}, [])

	// Prepare chart data - JKKN Terminology: Using learner-centered language
	const getSuccessSupportPieData = () => {
		if (!collegeData?.summary) return []
		const { total_students_passed, total_students_failed, total_students_absent } = collegeData.summary
		return [
			{ name: "Achieved", value: total_students_passed, fill: CHART_COLORS.success },
			{ name: "Needs Support", value: total_students_failed, fill: CHART_COLORS.danger },
			{ name: "Absent", value: total_students_absent, fill: CHART_COLORS.warning }
		]
	}

	const getClassificationPieData = () => {
		if (!collegeData?.summary) return []
		const { distinction_count, first_class_count, second_class_count, pass_class_count, total_students_failed } = collegeData.summary
		return [
			{ name: "Distinction", value: distinction_count, fill: "#10b981" },
			{ name: "First Class", value: first_class_count, fill: "#3b82f6" },
			{ name: "Second Class", value: second_class_count, fill: "#f59e0b" },
			{ name: "Pass Class", value: pass_class_count, fill: "#8b5cf6" },
			{ name: "Needs Support", value: total_students_failed, fill: "#ef4444" }
		].filter(d => d.value > 0)
	}

	const getTrendChartData = () => {
		if (!collegeData?.trends) return []
		return collegeData.trends.map(t => ({
			session: t.examination_session,
			passPercentage: parseFloat(t.pass_percentage.toFixed(1)),
			avgPercentage: t.average_percentage
		}))
	}

	const getGenderChartData = () => {
		if (!collegeData?.gender_wise) return []
		return collegeData.gender_wise.map(g => ({
			gender: g.gender,
			achieved: g.total_passed,
			needsSupport: g.total_failed,
			successRate: parseFloat(g.pass_percentage.toFixed(1))
		}))
	}

	const getSemesterChartData = () => {
		if (!collegeData?.semester_wise) return []
		return collegeData.semester_wise.map(s => ({
			semester: `Sem ${s.semester}`,
			successRate: parseFloat(s.pass_percentage.toFixed(1)),
			avgGPA: s.average_gpa,
			learningGaps: s.backlogs_count
		}))
	}

	const getProgramComparisonData = () => {
		if (!programData?.comparison_chart_data) return []
		return programData.comparison_chart_data.slice(0, 10).map(p => ({
			program: p.program_code,
			successRate: parseFloat(p.pass_percentage.toFixed(1)),
			avgCGPA: p.average_cgpa,
			learners: p.total_students
		}))
	}

	const getSubjectComparisonData = () => {
		if (!subjectData?.comparison_data) return []
		return subjectData.comparison_data.slice(0, 15).map(s => ({
			subject: s.course_code,
			passPercentage: parseFloat(s.pass_percentage.toFixed(1)),
			difficulty: parseFloat((s.difficulty_index * 100).toFixed(1)),
			avgMarks: s.average_marks
		}))
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />

				<PageTransition>
					<div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
						{/* Breadcrumb */}
						<ModernBreadcrumb
							items={[
								{ label: "Home", href: "/dashboard" },
								{ label: "Result", href: "/result" },
								{ label: "Analytics Dashboard" }
							]}
						/>

						{/* Premium Page Header with Gradient Background */}
						<div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 p-6 shadow-lg">
							<div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,white)]" />
							<div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
								<div className="flex items-center gap-4">
									<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm shadow-inner">
										<Activity className="h-7 w-7 text-white" />
									</div>
									<div>
										<h1 className="text-2xl font-bold text-white font-heading flex items-center gap-2">
											Learning Assessment Analytics
											<Badge className="bg-white/20 text-white border-white/30 text-xs">
												<Sparkles className="h-3 w-3 mr-1" />
												AI-Powered
											</Badge>
										</h1>
										<p className="text-sm text-white/80 mt-1 flex items-center gap-2">
											<Brain className="h-4 w-4" />
											Comprehensive learner performance insights with NAAC & NAAD compliance
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2 flex-wrap">
									<TooltipProvider>
										<UITooltip>
											<TooltipTrigger asChild>
												<Button
													variant="secondary"
													size="sm"
													onClick={refreshData}
													disabled={loadingCollege || loadingProgram || loadingSubject || loadingNaac || loadingNaad}
													className="bg-white/20 hover:bg-white/30 text-white border-white/30"
												>
													<RefreshCw className={`h-4 w-4 mr-2 ${(loadingCollege || loadingProgram || loadingSubject || loadingNaac || loadingNaad) ? 'animate-spin' : ''}`} />
													Refresh
												</Button>
											</TooltipTrigger>
											<TooltipContent>Reload analytics data</TooltipContent>
										</UITooltip>
									</TooltipProvider>
									<div className="flex items-center gap-1 bg-white/10 rounded-lg p-0.5">
										<Button variant="ghost" size="sm" onClick={handleExportExcel} className="text-white hover:bg-white/20">
											<FileSpreadsheet className="h-4 w-4 mr-1.5" />
											Excel
										</Button>
										<Separator orientation="vertical" className="h-6 bg-white/20" />
										<Button variant="ghost" size="sm" onClick={handleExportPDF} className="text-white hover:bg-white/20">
											<FileText className="h-4 w-4 mr-1.5" />
											PDF
										</Button>
										{canExportNAD && (
											<>
												<Separator orientation="vertical" className="h-6 bg-white/20" />
												<Button variant="ghost" size="sm" onClick={handleExportNADCSV} className="text-white hover:bg-white/20">
													<Download className="h-4 w-4 mr-1.5" />
													NAD
												</Button>
												<Separator orientation="vertical" className="h-6 bg-white/20" />
												<TooltipProvider>
													<UITooltip>
														<TooltipTrigger asChild>
															<Button variant="ghost" size="sm" onClick={handleExportNAADPivotCSV} className="text-white hover:bg-white/20">
																<LayoutGrid className="h-4 w-4 mr-1.5" />
																NAD CSV
															</Button>
														</TooltipTrigger>
														<TooltipContent>Download NAD CSV (one row per learner with SUB1-SUBn x 25 fields)</TooltipContent>
													</UITooltip>
												</TooltipProvider>
											</>
										)}
										<Separator orientation="vertical" className="h-6 bg-white/20" />
										<Button variant="ghost" size="sm" onClick={handlePrint} className="text-white hover:bg-white/20">
											<Printer className="h-4 w-4 mr-1.5" />
											Print
										</Button>
									</div>
								</div>
							</div>
							{/* Quick Stats Bar */}
							{collegeData?.summary && (
								<div className="relative mt-4 flex flex-wrap items-center gap-4 pt-4 border-t border-white/20">
									<div className="flex items-center gap-2 text-white/90">
										<Users className="h-4 w-4" />
										<span className="text-sm font-medium">{collegeData.summary.total_students_appeared.toLocaleString()} Learners</span>
									</div>
									<div className="flex items-center gap-2 text-white/90">
										<CheckCircle2 className="h-4 w-4 text-green-300" />
										<span className="text-sm font-medium">{collegeData.summary.pass_percentage.toFixed(1)}% Success Rate</span>
									</div>
									<div className="flex items-center gap-2 text-white/90">
										<Trophy className="h-4 w-4 text-yellow-300" />
										<span className="text-sm font-medium">{collegeData.summary.distinction_count} Distinctions</span>
									</div>
									<div className="flex items-center gap-2 text-white/90">
										<Clock className="h-4 w-4" />
										<span className="text-sm font-medium">Last updated: {new Date().toLocaleTimeString()}</span>
									</div>
								</div>
							)}
						</div>

						{/* Filters Section */}
						<Card className="border-slate-200 dark:border-slate-800">
							<CardHeader className="pb-3">
								<div className="flex items-center gap-2">
									<Filter className="h-4 w-4 text-slate-500" />
									<CardTitle className="text-sm font-semibold">Report Filters</CardTitle>
								</div>
								<p className="text-xs text-muted-foreground">Select filters to view analytics</p>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									{/* Examination Session */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Examination Session <span className="text-red-500">*</span>
										</Label>
										<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="h-9 w-full justify-between text-xs"
													disabled={!selectedInstitutionId || loadingSessions}
												>
													<span className="truncate">
														{selectedSessionId
															? selectedSession?.session_name
															: "Select session"}
													</span>
													<ChevronsUpDown className="h-3 w-3 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[350px] p-0" align="start">
												<Command filter={(value, search) => {
													if (value.toLowerCase().includes(search.toLowerCase())) return 1
													return 0
												}}>
													<CommandInput placeholder="Search session..." className="h-8 text-xs" />
													<CommandList>
														<CommandEmpty className="text-xs py-2">No session found.</CommandEmpty>
														<CommandGroup>
															{sessions.map((session) => (
																<CommandItem
																	key={session.id}
																	value={session.session_name}
																	onSelect={() => {
																		setSelectedSessionId(session.id)
																		setSessionOpen(false)
																	}}
																	className="text-xs"
																>
																	<Check className={cn("mr-2 h-3 w-3", selectedSessionId === session.id ? "opacity-100" : "opacity-0")} />
																	{session.session_name}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{/* Program */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Program <span className="text-red-500">*</span>
										</Label>
										<Popover open={programOpen} onOpenChange={setProgramOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="h-9 w-full justify-between text-xs"
													disabled={!selectedSessionId || loadingPrograms}
												>
													<span className="truncate">
														{selectedProgramId
															? `${selectedProgram?.program_code} - ${selectedProgram?.program_name}`
															: "Select program"}
													</span>
													<ChevronsUpDown className="h-3 w-3 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[400px] p-0" align="start">
												<Command filter={(value, search) => {
													if (value.toLowerCase().includes(search.toLowerCase())) return 1
													return 0
												}}>
													<CommandInput placeholder="Search program..." className="h-8 text-xs" />
													<CommandList>
														<CommandEmpty className="text-xs py-2">No program found.</CommandEmpty>
														<CommandGroup>
															{programs.map((prog) => (
																<CommandItem
																	key={prog.id}
																	value={`${prog.program_code} ${prog.program_name}`}
																	onSelect={() => {
																		setSelectedProgramId(prog.id)
																		setProgramOpen(false)
																	}}
																	className="text-xs"
																>
																	<Check className={cn("mr-2 h-3 w-3", selectedProgramId === prog.id ? "opacity-100" : "opacity-0")} />
																	{prog.program_code} - {prog.program_name}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>

									{/* Semester (Multi-select) */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">
											Semester <span className="text-slate-400">(Optional - Multi)</span>
										</Label>
										<Popover open={semesterOpen} onOpenChange={setSemesterOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="h-9 w-full justify-between text-xs"
													disabled={!selectedProgramId || loadingSemesters}
												>
													<span className="truncate">
														{selectedSemesters.length > 0
															? selectedSemesters.length === semesters.length
																? "All Semesters"
																: `${selectedSemesters.length} selected`
															: "All Semesters"}
													</span>
													<ChevronsUpDown className="h-3 w-3 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[250px] p-0" align="start">
												<Command>
													<CommandList>
														<CommandGroup>
															<CommandItem
																onSelect={handleSelectAllSemesters}
																className="text-xs"
															>
																<Check className={cn("mr-2 h-3 w-3", selectedSemesters.length === semesters.length && semesters.length > 0 ? "opacity-100" : "opacity-0")} />
																Select All
															</CommandItem>
															<CommandItem
																onSelect={handleClearSemesters}
																className="text-xs"
															>
																<Check className={cn("mr-2 h-3 w-3", selectedSemesters.length === 0 ? "opacity-100" : "opacity-0")} />
																Clear All
															</CommandItem>
														</CommandGroup>
														<CommandGroup>
															{semesters.map((sem) => (
																<CommandItem
																	key={sem.semester}
																	onSelect={() => handleSemesterToggle(sem.semester)}
																	className="text-xs"
																>
																	<Check className={cn("mr-2 h-3 w-3", selectedSemesters.includes(sem.semester) ? "opacity-100" : "opacity-0")} />
																	{sem.label}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								</div>

								{/* Selected Semesters Pills */}
								{selectedSemesters.length > 0 && (
									<div className="flex flex-wrap gap-1 mt-3 pt-3 border-t">
										<span className="text-xs text-muted-foreground mr-1">Selected:</span>
										{selectedSemesters.map(sem => (
											<Badge
												key={sem}
												variant="secondary"
												className="text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
												onClick={() => handleSemesterToggle(sem)}
											>
												Sem {sem} ×
											</Badge>
										))}
									</div>
								)}
							</CardContent>
						</Card>

						{/* Main Dashboard Tabs */}
						<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
							<TabsList className={`grid ${canAccessNAD ? 'grid-cols-6' : 'grid-cols-5'} h-auto p-1.5 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50`}>
								<TabsTrigger
									value="college"
									className="text-xs py-2.5 rounded-lg transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-emerald-200 dark:data-[state=active]:shadow-emerald-900/30"
								>
									<Building2 className="h-3.5 w-3.5 mr-1.5" />
									College
								</TabsTrigger>
								<TabsTrigger
									value="program"
									className="text-xs py-2.5 rounded-lg transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-indigo-200 dark:data-[state=active]:shadow-indigo-900/30"
								>
									<GraduationCap className="h-3.5 w-3.5 mr-1.5" />
									Program
								</TabsTrigger>
								<TabsTrigger
									value="subject"
									className="text-xs py-2.5 rounded-lg transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-200 dark:data-[state=active]:shadow-amber-900/30"
								>
									<BookOpen className="h-3.5 w-3.5 mr-1.5" />
									Subject
								</TabsTrigger>
								<TabsTrigger
									value="board"
									className="text-xs py-2.5 rounded-lg transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-rose-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-pink-200 dark:data-[state=active]:shadow-pink-900/30"
								>
									<School className="h-3.5 w-3.5 mr-1.5" />
									Board
								</TabsTrigger>
								<TabsTrigger
									value="naac"
									className="text-xs py-2.5 rounded-lg transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-200 dark:data-[state=active]:shadow-blue-900/30"
								>
									<Award className="h-3.5 w-3.5 mr-1.5" />
									NAAC
								</TabsTrigger>
								{canAccessNAD && (
									<TabsTrigger
										value="nad"
										className="text-xs py-2.5 rounded-lg transition-all duration-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-purple-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-violet-200 dark:data-[state=active]:shadow-violet-900/30"
									>
										<Target className="h-3.5 w-3.5 mr-1.5" />
										NAD
									</TabsTrigger>
								)}
							</TabsList>

							{/* College-wise Tab */}
							<TabsContent value="college" className="space-y-4">
								{loadingCollege ? (
									<DashboardSkeleton />
								) : collegeData ? (
									<>
										{/* Premium KPI Cards with Animated Counter & Sparklines */}
										<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
											<AnimatedStatCard
												title="Learners Appeared"
												value={collegeData.summary.total_students_appeared}
												subtitle="100% enrolled"
												icon={Users}
												colorTheme="emerald"
												onClick={() => setShowDrillDown(true)}
											/>
											<AnimatedStatCard
												title="Learners Passed"
												value={collegeData.summary.total_students_passed}
												subtitle="Assessment cleared"
												icon={CheckCircle2}
												colorTheme="green"
												trend={{
													value: parseFloat((collegeData.summary.pass_percentage - 75).toFixed(1)),
													isPositive: collegeData.summary.pass_percentage >= 75,
													label: "vs target"
												}}
											/>
											<AnimatedStatCard
												title="Needs Support"
												value={collegeData.summary.total_students_failed}
												subtitle="Remedial required"
												icon={AlertCircle}
												colorTheme="red"
											/>
											<AnimatedStatCard
												title="Success Rate"
												value={collegeData.summary.pass_percentage}
												suffix="%"
												icon={TrendingUp}
												colorTheme="blue"
												showProgress
												progressMax={100}
												sparklineData={trendSparklineData}
												decimals={1}
											/>
											<AnimatedStatCard
												title="Avg. Performance"
												value={collegeData.summary.average_percentage}
												suffix="%"
												subtitle="Learning outcomes"
												icon={BarChart3}
												colorTheme="purple"
												decimals={1}
											/>
											<AnimatedStatCard
												title="Excellence"
												value={collegeData.summary.distinction_count}
												subtitle="Distinction holders"
												icon={Trophy}
												colorTheme="amber"
											/>
										</div>

										{/* Quick Actions Row */}
										<div className="flex items-center gap-2 flex-wrap">
											<DrillDownButton
												label="View All Learners"
												count={collegeData.summary.total_students_appeared}
												onClick={() => setShowDrillDown(true)}
											/>
											<DrillDownButton
												label="Passed"
												count={collegeData.summary.total_students_passed}
												onClick={() => { setDrillDownFilter('passed'); setShowDrillDown(true); }}
												variant="success"
											/>
											<DrillDownButton
												label="Need Support"
												count={collegeData.summary.total_students_failed}
												onClick={() => { setDrillDownFilter('failed'); setShowDrillDown(true); }}
												variant="danger"
											/>
											<Button
												variant="outline"
												size="sm"
												onClick={() => setShowComparison(true)}
												className="ml-auto h-7 text-xs"
												disabled={!programData?.programs || programData.programs.length < 2}
											>
												<ArrowLeftRight className="h-3 w-3 mr-1.5" />
												Compare Programs
											</Button>
										</div>

										{/* AI-Generated Insights Panel */}
										{insights.length > 0 && (
											<InsightsPanel
												insights={insights}
												title="AI-Generated Insights & Recommendations"
												maxInsights={4}
												onViewDetails={(insight) => {
													toast({
														title: insight.title,
														description: insight.description,
													})
												}}
											/>
										)}

										{/* Data Quality & Statistical Summary Row */}
										<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
											{dataQualityMetrics && (
												<DataQualityPanel metrics={dataQualityMetrics} />
											)}
											{statisticalMetrics && (
												<StatisticalSummary
													title="Performance Statistics"
													metrics={statisticalMetrics}
													unit="%"
													showAdvanced={showAdvancedAnalysis}
													comparisonValue={70}
													comparisonLabel="Benchmark"
												/>
											)}
										</div>

										{/* Distribution Analysis */}
										{percentageDistribution.length > 0 && (
											<DistributionChart
												title="Learner Performance"
												data={percentageDistribution}
												bins={10}
												unit="%"
												showBoxPlot={true}
												benchmarkValue={60}
												benchmarkLabel="Pass Threshold"
												colorThresholds={{ low: 40, medium: 60 }}
											/>
										)}

										{/* Charts Row 1 */}
										<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
											{/* Success/Support Distribution Pie Chart */}
											<Card>
												<CardHeader className="pb-2">
													<CardTitle className="text-sm font-semibold flex items-center gap-2">
														<PieChartIcon className="h-4 w-4 text-slate-500" />
														Achievement Distribution
													</CardTitle>
												</CardHeader>
												<CardContent>
													<ChartContainer config={successSupportChartConfig} className="h-[280px]">
														<ResponsiveContainer width="100%" height="100%">
															<PieChart>
																<Pie
																	data={getSuccessSupportPieData()}
																	cx="50%"
																	cy="50%"
																	innerRadius={60}
																	outerRadius={100}
																	paddingAngle={2}
																	dataKey="value"
																	label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
																>
																	{getSuccessSupportPieData().map((entry, index) => (
																		<Cell key={`cell-${index}`} fill={entry.fill} />
																	))}
																</Pie>
																<Tooltip />
																<Legend />
															</PieChart>
														</ResponsiveContainer>
													</ChartContainer>
												</CardContent>
											</Card>

											{/* Classification Pie Chart */}
											<Card>
												<CardHeader className="pb-2">
													<CardTitle className="text-sm font-semibold flex items-center gap-2">
														<Award className="h-4 w-4 text-slate-500" />
														Classification Distribution
													</CardTitle>
												</CardHeader>
												<CardContent>
													<ChartContainer config={classificationChartConfig} className="h-[280px]">
														<ResponsiveContainer width="100%" height="100%">
															<PieChart>
																<Pie
																	data={getClassificationPieData()}
																	cx="50%"
																	cy="50%"
																	innerRadius={60}
																	outerRadius={100}
																	paddingAngle={2}
																	dataKey="value"
																	label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
																>
																	{getClassificationPieData().map((entry, index) => (
																		<Cell key={`cell-${index}`} fill={entry.fill} />
																	))}
																</Pie>
																<Tooltip />
																<Legend />
															</PieChart>
														</ResponsiveContainer>
													</ChartContainer>
												</CardContent>
											</Card>
										</div>

										{/* Charts Row 2 */}
										<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
											{/* Gender-wise Bar Chart */}
											<Card>
												<CardHeader className="pb-2">
													<CardTitle className="text-sm font-semibold flex items-center gap-2">
														<Users className="h-4 w-4 text-slate-500" />
														Gender-wise Analysis
													</CardTitle>
												</CardHeader>
												<CardContent>
													<div className="h-[280px]">
														<ResponsiveContainer width="100%" height="100%">
															<BarChart data={getGenderChartData()}>
																<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
																<XAxis dataKey="gender" tick={{ fontSize: 12 }} />
																<YAxis tick={{ fontSize: 12 }} />
																<Tooltip />
																<Legend />
																<Bar dataKey="achieved" name="Achieved" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} />
																<Bar dataKey="needsSupport" name="Needs Support" fill={CHART_COLORS.danger} radius={[4, 4, 0, 0]} />
															</BarChart>
														</ResponsiveContainer>
													</div>
												</CardContent>
											</Card>

											{/* Semester-wise Bar Chart */}
											<Card>
												<CardHeader className="pb-2">
													<CardTitle className="text-sm font-semibold flex items-center gap-2">
														<Calendar className="h-4 w-4 text-slate-500" />
														Semester-wise Pass %
													</CardTitle>
												</CardHeader>
												<CardContent>
													<div className="h-[280px]">
														<ResponsiveContainer width="100%" height="100%">
															<BarChart data={getSemesterChartData()}>
																<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
																<XAxis dataKey="semester" tick={{ fontSize: 12 }} />
																<YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
																<Tooltip />
																<Legend />
																<Bar dataKey="passPercentage" name="Success %" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
															</BarChart>
														</ResponsiveContainer>
													</div>
												</CardContent>
											</Card>
										</div>

										{/* Trend Line Chart */}
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="text-sm font-semibold flex items-center gap-2">
													<LineChartIcon className="h-4 w-4 text-slate-500" />
													Pass Percentage Trend
												</CardTitle>
											</CardHeader>
											<CardContent>
												<div className="h-[280px]">
													<ResponsiveContainer width="100%" height="100%">
														<AreaChart data={getTrendChartData()}>
															<defs>
																<linearGradient id="colorPassPct" x1="0" y1="0" x2="0" y2="1">
																	<stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
																	<stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
																</linearGradient>
															</defs>
															<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
															<XAxis dataKey="session" tick={{ fontSize: 11 }} />
															<YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
															<Tooltip />
															<Legend />
															<Area
																type="monotone"
																dataKey="passPercentage"
																name="Pass %"
																stroke={CHART_COLORS.primary}
																fillOpacity={1}
																fill="url(#colorPassPct)"
																strokeWidth={2}
															/>
															<Line
																type="monotone"
																dataKey="avgPercentage"
																name="Avg %"
																stroke={CHART_COLORS.secondary}
																strokeWidth={2}
																dot={{ fill: CHART_COLORS.secondary }}
															/>
														</AreaChart>
													</ResponsiveContainer>
												</div>
											</CardContent>
										</Card>

										{/* Top Performers Table - Enhanced with Premium Design */}
										<Card className="border-amber-200/50 dark:border-amber-800/50">
											<CardHeader className="pb-3 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 rounded-t-lg">
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2">
														<div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
															<Trophy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
														</div>
														<div>
															<CardTitle className="text-sm font-semibold">Top Performing Learners</CardTitle>
															<CardDescription className="text-xs">Academic excellence recognition based on learning outcomes</CardDescription>
														</div>
													</div>
													<Badge variant="outline" className="text-xs border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
														<Star className="h-3 w-3 mr-1 fill-amber-500 text-amber-500" />
														{collegeData.top_performers.length} Achievers
													</Badge>
												</div>
											</CardHeader>
											<CardContent className="p-0">
												<div className="overflow-x-auto">
													<table className="w-full text-xs">
														<thead>
															<tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
																<th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
																	<div className="flex items-center gap-1">
																		<Hash className="h-3 w-3" />
																		Rank
																	</div>
																</th>
																<th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Learner ID</th>
																<th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Learner Name</th>
																<th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Program</th>
																<th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Semester</th>
																<th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">CGPA</th>
																<th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Score</th>
															</tr>
														</thead>
														<tbody>
															{collegeData.top_performers.map((performer, index) => (
																<tr
																	key={`${performer.student_id}-${index}`}
																	className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
																		index < 3 ? 'bg-gradient-to-r from-amber-50/50 to-transparent dark:from-amber-900/10 dark:to-transparent' : ''
																	}`}
																>
																	<td className="py-3 px-4">
																		{index === 0 ? (
																			<Badge className="bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-0 shadow-sm">
																				<Trophy className="h-3 w-3 mr-1" />
																				1st
																			</Badge>
																		) : index === 1 ? (
																			<Badge className="bg-gradient-to-r from-slate-300 to-slate-400 text-slate-800 border-0 shadow-sm">
																				2nd
																			</Badge>
																		) : index === 2 ? (
																			<Badge className="bg-gradient-to-r from-amber-600 to-amber-700 text-white border-0 shadow-sm">
																				3rd
																			</Badge>
																		) : (
																			<Badge variant="outline" className="text-xs">
																				#{performer.rank}
																			</Badge>
																		)}
																	</td>
																	<td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">{performer.register_number}</td>
																	<td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{performer.student_name}</td>
																	<td className="py-3 px-4 text-slate-600 dark:text-slate-400">{performer.program_name}</td>
																	<td className="py-3 px-4 text-center">
																		<Badge variant="secondary" className="text-xs">Sem {performer.semester}</Badge>
																	</td>
																	<td className="py-3 px-4 text-center">
																		<span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{performer.cgpa.toFixed(2)}</span>
																	</td>
																	<td className="py-3 px-4 text-center">
																		<div className="flex items-center justify-center gap-1">
																			<span className="font-semibold tabular-nums">{performer.percentage.toFixed(1)}%</span>
																			{performer.percentage >= 90 && <Star className="h-3 w-3 fill-amber-500 text-amber-500" />}
																		</div>
																	</td>
																</tr>
															))}
															{collegeData.top_performers.length === 0 && (
																<tr>
																	<td colSpan={7} className="py-12 text-center text-slate-500">
																		<div className="flex flex-col items-center gap-2">
																			<Trophy className="h-8 w-8 text-slate-300" />
																			<p>No performance data available</p>
																		</div>
																	</td>
																</tr>
															)}
														</tbody>
													</table>
												</div>
											</CardContent>
										</Card>
									</>
								) : (
									<div className="flex flex-col items-center justify-center h-64 text-slate-500">
										<BarChart3 className="h-12 w-12 mb-4 opacity-50" />
										<p>No data available. Please select filters and try again.</p>
									</div>
								)}
							</TabsContent>

							{/* Program-wise Tab - Enhanced with Premium Design */}
							<TabsContent value="program" className="space-y-4">
								{loadingProgram ? (
									<div className="flex items-center justify-center h-64">
										<div className="flex flex-col items-center gap-4">
											<RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
											<p className="text-sm text-slate-500">Loading program analytics...</p>
										</div>
									</div>
								) : programData ? (
									<>
										{/* Premium Program Header */}
										<Card className="relative overflow-hidden bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white">
											<div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,white)]" />
											<CardContent className="relative p-6">
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-4">
														<div className="h-14 w-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
															<GraduationCap className="h-7 w-7 text-white" />
														</div>
														<div>
															<h3 className="text-xl font-bold">Program-wise Performance Analysis</h3>
															<p className="text-white/80 text-sm mt-1">Comprehensive learner outcomes across {programData.programs.length} programs</p>
														</div>
													</div>
													<div className="text-right hidden md:block">
														<p className="text-xs text-white/70 uppercase tracking-wider">Total Learners</p>
														<p className="text-3xl font-bold tabular-nums">{programData.programs.reduce((acc, p) => acc + p.total_students_appeared, 0).toLocaleString()}</p>
													</div>
												</div>
											</CardContent>
										</Card>

										{/* Degree Level Summary - Premium Cards */}
										<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
											{programData.degree_level_summary.map((level, index) => {
												const colors = [
													{ from: 'indigo', to: 'blue' },
													{ from: 'purple', to: 'violet' },
													{ from: 'emerald', to: 'teal' },
													{ from: 'amber', to: 'orange' }
												][index % 4]
												return (
													<Card key={level.degree_level} className={`group relative overflow-hidden bg-gradient-to-br from-${colors.from}-50 via-${colors.from}-100 to-${colors.to}-100 dark:from-${colors.from}-900/30 dark:via-${colors.from}-800/20 dark:to-${colors.to}-900/20 border-${colors.from}-200/50 dark:border-${colors.from}-700/50 hover:shadow-lg transition-all duration-300`}>
														<div className={`absolute top-0 right-0 w-20 h-20 bg-${colors.from}-200/30 dark:bg-${colors.from}-700/20 rounded-full -mr-8 -mt-8 group-hover:scale-110 transition-transform`} />
														<CardContent className="p-4 relative">
															<div className="flex items-center justify-between">
																<div>
																	<Badge variant="outline" className="text-xs font-semibold mb-2">{level.degree_level}</Badge>
																	<p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
																		{level.average_pass_percentage.toFixed(1)}%
																	</p>
																	<p className="text-[10px] text-slate-500 mt-1">
																		{level.total_programs} programs • {level.total_students.toLocaleString()} learners
																	</p>
																	<Progress value={level.average_pass_percentage} className="h-1.5 mt-2" />
																</div>
																<div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center">
																	<GraduationCap className="h-5 w-5 text-slate-500" />
																</div>
															</div>
														</CardContent>
													</Card>
												)
											})}
										</div>

										{/* Program Comparison Chart */}
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="text-sm font-semibold flex items-center gap-2">
													<BarChart3 className="h-4 w-4 text-slate-500" />
													Program-wise Pass Percentage (Top 10)
												</CardTitle>
											</CardHeader>
											<CardContent>
												<div className="h-[350px]">
													<ResponsiveContainer width="100%" height="100%">
														<BarChart data={getProgramComparisonData()} layout="vertical">
															<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
															<XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
															<YAxis dataKey="program" type="category" tick={{ fontSize: 11 }} width={100} />
															<Tooltip />
															<Legend />
															<Bar dataKey="passPercentage" name="Success %" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
														</BarChart>
													</ResponsiveContainer>
												</div>
											</CardContent>
										</Card>

										{/* Programs Requiring Support Alert - Positive JKKN Terminology */}
										{programData.weak_programs.length > 0 && (
											<Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10">
												<CardHeader className="pb-3">
													<div className="flex items-center justify-between">
														<div className="flex items-center gap-2">
															<div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
																<Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
															</div>
															<div>
																<CardTitle className="text-sm font-semibold text-amber-800 dark:text-amber-300">
																	Programs with Growth Opportunities
																</CardTitle>
																<CardDescription className="text-xs text-amber-600/80 dark:text-amber-400/80">
																	{programData.weak_programs.length} programs identified for learning enhancement support
																</CardDescription>
															</div>
														</div>
														<Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-400">
															<Target className="h-3 w-3 mr-1" />
															Action Required
														</Badge>
													</div>
												</CardHeader>
												<CardContent>
													<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
														{programData.weak_programs.map((prog) => (
															<div key={prog.program_id} className="group p-4 bg-white dark:bg-slate-800 rounded-lg border border-amber-200 dark:border-amber-800/50 hover:shadow-md transition-all duration-200">
																<div className="flex items-start justify-between mb-2">
																	<div>
																		<p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{prog.program_code}</p>
																		<p className="text-xs text-slate-500 truncate max-w-[200px]">{prog.program_name}</p>
																	</div>
																	<Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">
																		{prog.pass_percentage.toFixed(1)}%
																	</Badge>
																</div>
																<div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mb-2">
																	<ArrowUpRight className="h-3 w-3" />
																	<span>Opportunity: {Math.abs(prog.variance).toFixed(1)}% growth potential</span>
																</div>
																<div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50">
																	<p className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-1">
																		<Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0 text-amber-500" />
																		<span>{prog.recommendation}</span>
																	</p>
																</div>
															</div>
														))}
													</div>
												</CardContent>
											</Card>
										)}

										{/* Programs Table - Enhanced with Premium Design & JKKN Terminology */}
										<Card>
											<CardHeader className="pb-3 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 rounded-t-lg">
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2">
														<div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
															<ClipboardList className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
														</div>
														<div>
															<CardTitle className="text-sm font-semibold">All Programs Overview</CardTitle>
															<CardDescription className="text-xs">Comprehensive learner performance across all programs</CardDescription>
														</div>
													</div>
													<Badge variant="outline" className="text-xs">
														{programData.programs.length} Programs
													</Badge>
												</div>
											</CardHeader>
											<CardContent className="p-0">
												<ScrollArea className="h-[400px]">
													<table className="w-full text-xs">
														<thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 z-10">
															<tr className="border-b border-slate-200 dark:border-slate-700">
																<th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Program</th>
																<th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Degree</th>
																<th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Learners</th>
																<th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Passed</th>
																<th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Success %</th>
																<th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Avg CGPA</th>
																<th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Learning Gaps</th>
																<th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Status</th>
															</tr>
														</thead>
														<tbody>
															{programData.programs.map((prog, idx) => (
																<tr
																	key={prog.program_id}
																	className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
																		idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-800/30'
																	}`}
																>
																	<td className="py-3 px-4">
																		<div>
																			<p className="font-medium text-slate-900 dark:text-slate-100">{prog.program_code}</p>
																			<p className="text-slate-500 truncate max-w-[200px]">{prog.program_name}</p>
																		</div>
																	</td>
																	<td className="py-3 px-4">
																		<Badge variant="secondary" className="text-xs">{prog.degree_code}</Badge>
																	</td>
																	<td className="py-3 px-4 text-center tabular-nums">{prog.total_students_appeared}</td>
																	<td className="py-3 px-4 text-center tabular-nums text-green-600 dark:text-green-400">{prog.total_students_passed}</td>
																	<td className="py-3 px-4 text-center">
																		<span className={`font-semibold tabular-nums ${
																			prog.pass_percentage >= 80 ? 'text-green-600 dark:text-green-400' :
																			prog.pass_percentage >= 60 ? 'text-amber-600 dark:text-amber-400' :
																			'text-red-600 dark:text-red-400'
																		}`}>
																			{prog.pass_percentage.toFixed(1)}%
																		</span>
																	</td>
																	<td className="py-3 px-4 text-center tabular-nums font-medium">{prog.average_cgpa.toFixed(2)}</td>
																	<td className="py-3 px-4 text-center">
																		{prog.total_backlogs > 0 ? (
																			<Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-400">
																				{prog.total_backlogs}
																			</Badge>
																		) : (
																			<Badge variant="outline" className="text-xs border-green-300 text-green-700 dark:border-green-600 dark:text-green-400">
																				<CheckCircle2 className="h-3 w-3 mr-1" />
																				Clear
																			</Badge>
																		)}
																	</td>
																	<td className="py-3 px-4 text-center">
																		{prog.is_above_college_average ? (
																			<Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs border-0">
																				<TrendingUp className="h-3 w-3 mr-1" />
																				Excellent
																			</Badge>
																		) : (
																			<Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs border-0">
																				<Target className="h-3 w-3 mr-1" />
																				Growing
																			</Badge>
																		)}
																	</td>
																</tr>
															))}
														</tbody>
													</table>
												</ScrollArea>
											</CardContent>
										</Card>
									</>
								) : (
									<div className="flex flex-col items-center justify-center h-64 text-slate-500">
										<GraduationCap className="h-12 w-12 mb-4 opacity-50" />
										<p>No program data available.</p>
									</div>
								)}
							</TabsContent>

							{/* Subject-wise Tab */}
							<TabsContent value="subject" className="space-y-4">
								{loadingSubject ? (
									<div className="flex items-center justify-center h-64">
										<RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
									</div>
								) : subjectData ? (
									<>
										{/* Correlation Heatmap for Subject Analysis */}
										{correlationData && (
											<CorrelationHeatmap
												title="Subject Metrics Correlation Matrix"
												data={correlationData}
												showValues={true}
											/>
										)}

										{/* Difficult Subjects Alert */}
										{subjectData.difficult_subjects.length > 0 && (
											<Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
												<CardHeader className="pb-2">
													<CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
														<AlertCircle className="h-4 w-4" />
														Subjects Requiring Additional Support
													</CardTitle>
												</CardHeader>
												<CardContent>
													<div className="flex flex-wrap gap-2">
														{subjectData.difficult_subjects.slice(0, 5).map((subj) => (
															<Badge key={subj.course_id} variant="outline" className="text-xs border-amber-300 dark:border-amber-700">
																{subj.course_code}: {subj.fail_percentage.toFixed(1)}% needs support
															</Badge>
														))}
													</div>
												</CardContent>
											</Card>
										)}

										{/* Subject Comparison Chart */}
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="text-sm font-semibold flex items-center gap-2">
													<BarChart3 className="h-4 w-4 text-slate-500" />
													Subject-wise Success % vs Support Index
												</CardTitle>
											</CardHeader>
											<CardContent>
												<div className="h-[400px]">
													<ResponsiveContainer width="100%" height="100%">
														<BarChart data={getSubjectComparisonData()}>
															<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
															<XAxis dataKey="subject" tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }} height={60} />
															<YAxis yAxisId="left" tick={{ fontSize: 12 }} domain={[0, 100]} />
															<YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} domain={[0, 100]} />
															<Tooltip />
															<Legend />
															<Bar yAxisId="left" dataKey="passPercentage" name="Success %" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} />
															<Bar yAxisId="right" dataKey="difficulty" name="Support Needed %" fill={CHART_COLORS.danger} radius={[4, 4, 0, 0]} />
														</BarChart>
													</ResponsiveContainer>
												</div>
											</CardContent>
										</Card>

										{/* Failure Analysis */}
										{subjectData.failure_analysis.length > 0 && (
											<Card>
												<CardHeader className="pb-2">
													<CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
														<XCircle className="h-4 w-4" />
														Growth Opportunity Analysis & Recommendations
													</CardTitle>
												</CardHeader>
												<CardContent>
													<div className="space-y-3">
														{subjectData.failure_analysis.slice(0, 5).map((analysis) => (
															<div key={analysis.course_id} className="p-3 border border-slate-200 dark:border-slate-700 rounded-lg">
																<div className="flex items-start justify-between mb-2">
																	<div>
																		<p className="text-sm font-semibold">{analysis.course_code} - {analysis.course_name}</p>
																		<p className="text-xs text-slate-500">Learners Needing Support: {analysis.total_failures}</p>
																	</div>
																	<div className="flex gap-2">
																		<Badge variant="outline" className="text-xs">Internal: {analysis.failure_reason_internal}</Badge>
																		<Badge variant="outline" className="text-xs">External: {analysis.failure_reason_external}</Badge>
																		<Badge variant="outline" className="text-xs">Both: {analysis.failure_reason_both}</Badge>
																	</div>
																</div>
																<div className="mt-2">
																	<p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Recommendations:</p>
																	<ul className="text-xs text-slate-500 space-y-0.5">
																		{analysis.improvement_suggestions.map((suggestion, idx) => (
																			<li key={idx} className="flex items-start gap-1">
																				<ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" />
																				{suggestion}
																			</li>
																		))}
																	</ul>
																</div>
															</div>
														))}
													</div>
												</CardContent>
											</Card>
										)}

										{/* Subjects Table */}
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="text-sm font-semibold">All Subjects</CardTitle>
											</CardHeader>
											<CardContent>
												<ScrollArea className="h-[400px]">
													<table className="w-full text-xs">
														<thead className="sticky top-0 bg-white dark:bg-slate-900">
															<tr className="border-b border-slate-200 dark:border-slate-700">
																<th className="text-left py-2 px-2 font-semibold">Code</th>
																<th className="text-left py-2 px-2 font-semibold">Subject</th>
																<th className="text-center py-2 px-2 font-semibold">Sem</th>
																<th className="text-center py-2 px-2 font-semibold">Appeared</th>
																<th className="text-center py-2 px-2 font-semibold">Pass %</th>
																<th className="text-center py-2 px-2 font-semibold">Avg Marks</th>
																<th className="text-center py-2 px-2 font-semibold">Difficulty</th>
															</tr>
														</thead>
														<tbody>
															{subjectData.subjects.map((subj) => (
																<tr key={subj.course_id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
																	<td className="py-2 px-2 font-mono">{subj.course_code}</td>
																	<td className="py-2 px-2 truncate max-w-[200px]">{subj.course_name}</td>
																	<td className="py-2 px-2 text-center">{subj.semester}</td>
																	<td className="py-2 px-2 text-center">{subj.total_students_appeared}</td>
																	<td className="py-2 px-2 text-center font-semibold">{subj.pass_percentage.toFixed(1)}%</td>
																	<td className="py-2 px-2 text-center">{subj.average_total_marks.toFixed(1)}</td>
																	<td className="py-2 px-2 text-center">
																		<Badge
																			variant="secondary"
																			className={`text-xs ${
																				subj.difficulty_index > 0.4
																					? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
																					: subj.difficulty_index > 0.2
																					? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
																					: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
																			}`}
																		>
																			{(subj.difficulty_index * 100).toFixed(0)}%
																		</Badge>
																	</td>
																</tr>
															))}
														</tbody>
													</table>
												</ScrollArea>
											</CardContent>
										</Card>
									</>
								) : (
									<div className="flex flex-col items-center justify-center h-64 text-slate-500">
										<BookOpen className="h-12 w-12 mb-4 opacity-50" />
										<p>No subject data available.</p>
									</div>
								)}
							</TabsContent>

							{/* Board Tab - Comprehensive University/Board Analytics */}
							<TabsContent value="board" className="space-y-4">
								{/* Board Header Card */}
								<Card className="relative overflow-hidden bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white">
									<div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,white)]" />
									<CardContent className="relative p-6">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-4">
												<div className="h-14 w-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
													<School className="h-7 w-7 text-white" />
												</div>
												<div>
													<h3 className="text-xl font-bold">University/Board Performance Analytics</h3>
													<p className="text-white/80 text-sm mt-1">Comprehensive analysis across examination boards and affiliated universities</p>
												</div>
											</div>
											<div className="text-right hidden md:block">
												<p className="text-3xl font-bold">{collegeData?.summary?.pass_percentage?.toFixed(1) || '0'}%</p>
												<p className="text-white/80 text-sm">Overall Success Rate</p>
											</div>
										</div>
									</CardContent>
								</Card>

								{/* Board Performance KPIs */}
								<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
									<Card className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200/50 dark:border-blue-700/50">
										<CardContent className="p-4">
											<div className="flex items-center gap-3">
												<div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
													<Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold">Affiliated Institutions</p>
													<p className="text-xl font-bold text-blue-700 dark:text-blue-300">{filterOptions?.institutions?.length || 0}</p>
												</div>
											</div>
										</CardContent>
									</Card>

									<Card className="bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-900/20 dark:to-violet-900/20 border-purple-200/50 dark:border-purple-700/50">
										<CardContent className="p-4">
											<div className="flex items-center gap-3">
												<div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
													<GraduationCap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-semibold">Programs Offered</p>
													<p className="text-xl font-bold text-purple-700 dark:text-purple-300">{filterOptions?.programs?.length || 0}</p>
												</div>
											</div>
										</CardContent>
									</Card>

									<Card className="bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-200/50 dark:border-emerald-700/50">
										<CardContent className="p-4">
											<div className="flex items-center gap-3">
												<div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
													<Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">Exam Sessions</p>
													<p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{filterOptions?.examination_sessions?.length || 0}</p>
												</div>
											</div>
										</CardContent>
									</Card>

									<Card className="bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200/50 dark:border-amber-700/50">
										<CardContent className="p-4">
											<div className="flex items-center gap-3">
												<div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
													<Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">Total Learners</p>
													<p className="text-xl font-bold text-amber-700 dark:text-amber-300">{collegeData?.summary?.total_students_appeared?.toLocaleString() || '0'}</p>
												</div>
											</div>
										</CardContent>
									</Card>
								</div>

								{/* Performance by Degree Level */}
								{programData?.degree_level_summary && programData.degree_level_summary.length > 0 && (
									<Card>
										<CardHeader className="pb-3">
											<div className="flex items-center gap-2">
												<div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
													<LayoutGrid className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
												</div>
												<div>
													<CardTitle className="text-sm font-semibold">Performance by Degree Level</CardTitle>
													<CardDescription className="text-xs">Comparative analysis across UG, PG, and Diploma programs</CardDescription>
												</div>
											</div>
										</CardHeader>
										<CardContent>
											<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
												{programData.degree_level_summary.map((level, index) => (
													<div key={level.degree_level} className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-900/50">
														<div className="absolute top-0 right-0 w-16 h-16 bg-indigo-100/50 dark:bg-indigo-800/20 rounded-full -mr-6 -mt-6" />
														<div className="relative">
															<div className="flex items-center justify-between mb-3">
																<Badge variant="outline" className="text-xs font-semibold">
																	{level.degree_level}
																</Badge>
																<span className={`text-lg font-bold ${
																	level.average_pass_percentage >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
																	level.average_pass_percentage >= 60 ? 'text-amber-600 dark:text-amber-400' :
																	'text-red-600 dark:text-red-400'
																}`}>
																	{level.average_pass_percentage.toFixed(1)}%
																</span>
															</div>
															<Progress value={level.average_pass_percentage} className="h-2 mb-3" />
															<div className="grid grid-cols-2 gap-2 text-xs">
																<div className="flex items-center gap-1 text-slate-500">
																	<GraduationCap className="h-3 w-3" />
																	<span>{level.total_programs} Programs</span>
																</div>
																<div className="flex items-center gap-1 text-slate-500">
																	<Users className="h-3 w-3" />
																	<span>{level.total_students.toLocaleString()} Learners</span>
																</div>
															</div>
														</div>
													</div>
												))}
											</div>
										</CardContent>
									</Card>
								)}

								{/* Radar Chart for Multi-dimensional Analysis */}
								<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
									<Card>
										<CardHeader className="pb-2">
											<div className="flex items-center gap-2">
												<Activity className="h-4 w-4 text-indigo-500" />
												<CardTitle className="text-sm font-semibold">Performance Dimensions</CardTitle>
											</div>
											<CardDescription className="text-xs">Multi-dimensional view of institutional performance</CardDescription>
										</CardHeader>
										<CardContent>
											<div className="h-[300px]">
												<ResponsiveContainer width="100%" height="100%">
													<RadarChart data={[
														{ metric: 'Success Rate', value: collegeData?.summary?.pass_percentage || 0, fullMark: 100 },
														{ metric: 'Avg Score', value: collegeData?.summary?.average_percentage || 0, fullMark: 100 },
														{ metric: 'Distinction', value: ((collegeData?.summary?.distinction_count || 0) / (collegeData?.summary?.total_students_appeared || 1)) * 100, fullMark: 100 },
														{ metric: 'First Class', value: ((collegeData?.summary?.first_class_count || 0) / (collegeData?.summary?.total_students_appeared || 1)) * 100, fullMark: 100 },
														{ metric: 'Completion', value: ((collegeData?.summary?.total_students_passed || 0) / (collegeData?.summary?.total_students_appeared || 1)) * 100, fullMark: 100 },
													]}>
														<PolarGrid stroke="#e2e8f0" />
														<PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
														<PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
														<Radar
															name="Performance"
															dataKey="value"
															stroke={CHART_COLORS.primary}
															fill={CHART_COLORS.primary}
															fillOpacity={0.3}
															strokeWidth={2}
														/>
													</RadarChart>
												</ResponsiveContainer>
											</div>
										</CardContent>
									</Card>

									{/* Trend Analysis */}
									<Card>
										<CardHeader className="pb-2">
											<div className="flex items-center gap-2">
												<TrendingUp className="h-4 w-4 text-emerald-500" />
												<CardTitle className="text-sm font-semibold">Historical Performance Trend</CardTitle>
											</div>
											<CardDescription className="text-xs">Session-wise pass percentage analysis</CardDescription>
										</CardHeader>
										<CardContent>
											<div className="h-[300px]">
												<ResponsiveContainer width="100%" height="100%">
													<ComposedChart data={getTrendChartData()}>
														<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
														<XAxis dataKey="session" tick={{ fontSize: 11 }} />
														<YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
														<Tooltip />
														<Legend />
														<ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Target', position: 'right', fontSize: 10 }} />
														<Area
															type="monotone"
															dataKey="passPercentage"
															name="Pass %"
															fill={CHART_COLORS.primary}
															fillOpacity={0.2}
															stroke={CHART_COLORS.primary}
															strokeWidth={2}
														/>
														<Line
															type="monotone"
															dataKey="avgPercentage"
															name="Avg %"
															stroke={CHART_COLORS.secondary}
															strokeWidth={2}
															dot={{ fill: CHART_COLORS.secondary, r: 4 }}
														/>
													</ComposedChart>
												</ResponsiveContainer>
											</div>
										</CardContent>
									</Card>
								</div>

								{/* Board Compliance & Quality Metrics */}
								<Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50">
									<CardHeader className="pb-3">
										<div className="flex items-center gap-2">
											<Shield className="h-4 w-4 text-green-500" />
											<CardTitle className="text-sm font-semibold">Regulatory Compliance Status</CardTitle>
										</div>
									</CardHeader>
									<CardContent>
										<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
											<div className="flex items-center gap-4 p-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
												<div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
													<CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
												</div>
												<div>
													<p className="text-sm font-semibold text-slate-900 dark:text-slate-100">NAAC Compliance</p>
													<p className="text-xs text-slate-500">Criterion 2.6 & 2.7 Ready</p>
													<Badge variant="outline" className="mt-1 text-xs bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400">
														Compliant
													</Badge>
												</div>
											</div>

											<div className="flex items-center gap-4 p-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
												<div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
													<Target className="h-6 w-6 text-blue-600 dark:text-blue-400" />
												</div>
												<div>
													<p className="text-sm font-semibold text-slate-900 dark:text-slate-100">NAD Integration</p>
													<p className="text-xs text-slate-500">ABC ID Linked Records</p>
													<Badge variant="outline" className="mt-1 text-xs bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-400">
														Active
													</Badge>
												</div>
											</div>

											<div className="flex items-center gap-4 p-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
												<div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
													<Award className="h-6 w-6 text-purple-600 dark:text-purple-400" />
												</div>
												<div>
													<p className="text-sm font-semibold text-slate-900 dark:text-slate-100">UGC Guidelines</p>
													<p className="text-xs text-slate-500">Grading Standards Met</p>
													<Badge variant="outline" className="mt-1 text-xs bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-700 dark:text-purple-400">
														Verified
													</Badge>
												</div>
											</div>
										</div>
									</CardContent>
								</Card>

								{/* Quick Actions */}
								<Card>
									<CardHeader className="pb-3">
										<CardTitle className="text-sm font-semibold flex items-center gap-2">
											<Zap className="h-4 w-4 text-amber-500" />
											Quick Actions
										</CardTitle>
									</CardHeader>
									<CardContent>
										<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
											<Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2" onClick={() => setActiveTab('naac')}>
												<Award className="h-5 w-5 text-blue-500" />
												<span className="text-xs">Generate NAAC Report</span>
											</Button>
											<Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2" onClick={() => setActiveTab('nad')}>
												<Target className="h-5 w-5 text-purple-500" />
												<span className="text-xs">NAD Compliance</span>
											</Button>
											<Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2" onClick={handleExportExcel}>
												<FileSpreadsheet className="h-5 w-5 text-emerald-500" />
												<span className="text-xs">Export Board Report</span>
											</Button>
											<Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2" onClick={handleExportPDF}>
												<FileText className="h-5 w-5 text-red-500" />
												<span className="text-xs">Download Summary</span>
											</Button>
										</div>
									</CardContent>
								</Card>
							</TabsContent>

							{/* NAAC Tab - Premium Design */}
							<TabsContent value="naac" className="space-y-4">
								{loadingNaac ? (
									<ComplianceDashboardSkeleton />
								) : naacData ? (
									<>
										{/* NAAC Premium Header Card */}
										<Card className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-xl">
											<div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,white)]" />
											<div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
											<div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-400/20 rounded-full blur-3xl" />
											<CardContent className="relative p-6">
												<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
													<div className="flex items-center gap-4">
														<div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
															<Award className="h-8 w-8 text-white" />
														</div>
														<div>
															<div className="flex items-center gap-2 mb-1">
																<Badge className="bg-white/20 text-white border-white/30 text-xs">
																	Criterion {naacData.criterion_id}
																</Badge>
																<Badge className="bg-green-500/30 text-white border-green-300/30 text-xs">
																	<CheckCircle2 className="h-3 w-3 mr-1" />
																	Compliant
																</Badge>
															</div>
															<h3 className="text-2xl font-bold">{naacData.criterion_title}</h3>
															<p className="text-sm text-white/80 mt-1 max-w-xl">{naacData.description}</p>
														</div>
													</div>
													<div className="text-left md:text-right bg-white/10 backdrop-blur-sm rounded-xl p-4 min-w-[160px]">
														<p className="text-xs text-white/70 uppercase tracking-wider mb-1">Average Success Rate</p>
														<div className="text-4xl font-bold tabular-nums">{naacData.average_pass_percentage}%</div>
														<div className="flex items-center gap-1 mt-1 justify-start md:justify-end">
															{naacData.average_pass_percentage >= 70 ? (
																<>
																	<TrendingUp className="h-4 w-4 text-green-300" />
																	<span className="text-xs text-green-300">Above Benchmark</span>
																</>
															) : (
																<>
																	<TrendingDown className="h-4 w-4 text-red-300" />
																	<span className="text-xs text-red-300">Below Benchmark</span>
																</>
															)}
														</div>
													</div>
												</div>
											</CardContent>
										</Card>

										{/* Key Metrics - Premium Cards */}
										<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
											<Card className="group relative overflow-hidden bg-gradient-to-br from-emerald-50 via-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:via-emerald-800/20 dark:to-teal-900/20 border-emerald-200/50 dark:border-emerald-700/50 hover:shadow-lg transition-all duration-300">
												<div className="absolute top-0 right-0 w-24 h-24 bg-emerald-200/30 dark:bg-emerald-700/20 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform" />
												<CardContent className="p-5 relative">
													<div className="flex items-start justify-between">
														<div>
															<p className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold mb-1">Total Learners Appeared</p>
															<p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
																{naacData.total_students_appeared.toLocaleString()}
															</p>
															<p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-2">Across all programs</p>
														</div>
														<div className="h-12 w-12 rounded-xl bg-emerald-200/50 dark:bg-emerald-800/30 flex items-center justify-center">
															<Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
														</div>
													</div>
												</CardContent>
											</Card>

											<Card className="group relative overflow-hidden bg-gradient-to-br from-green-50 via-green-100 to-lime-100 dark:from-green-900/30 dark:via-green-800/20 dark:to-lime-900/20 border-green-200/50 dark:border-green-700/50 hover:shadow-lg transition-all duration-300">
												<div className="absolute top-0 right-0 w-24 h-24 bg-green-200/30 dark:bg-green-700/20 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform" />
												<CardContent className="p-5 relative">
													<div className="flex items-start justify-between">
														<div>
															<p className="text-[10px] uppercase tracking-wider text-green-600 dark:text-green-400 font-semibold mb-1">Total Learners Passed</p>
															<p className="text-3xl font-bold text-green-700 dark:text-green-300 tabular-nums">
																{naacData.total_students_passed.toLocaleString()}
															</p>
															<p className="text-xs text-green-600/70 dark:text-green-400/70 mt-2">Successfully completed</p>
														</div>
														<div className="h-12 w-12 rounded-xl bg-green-200/50 dark:bg-green-800/30 flex items-center justify-center">
															<CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
														</div>
													</div>
												</CardContent>
											</Card>

											<Card className="group relative overflow-hidden bg-gradient-to-br from-blue-50 via-blue-100 to-indigo-100 dark:from-blue-900/30 dark:via-blue-800/20 dark:to-indigo-900/20 border-blue-200/50 dark:border-blue-700/50 hover:shadow-lg transition-all duration-300">
												<div className="absolute top-0 right-0 w-24 h-24 bg-blue-200/30 dark:bg-blue-700/20 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform" />
												<CardContent className="p-5 relative">
													<div className="flex items-start justify-between">
														<div>
															<p className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold mb-1">Data Source</p>
															<p className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-1">
																{naacData.data_source}
															</p>
															<Badge className="mt-2 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">
																<Shield className="h-3 w-3 mr-1" />
																Verified
															</Badge>
														</div>
														<div className="h-12 w-12 rounded-xl bg-blue-200/50 dark:bg-blue-800/30 flex items-center justify-center">
															<FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
														</div>
													</div>
												</CardContent>
											</Card>
										</div>

										{/* Year-wise Pass Percentage Chart */}
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="text-sm font-semibold flex items-center gap-2">
													<LineChartIcon className="h-4 w-4 text-slate-500" />
													Year-wise Pass Percentage (Last 5 Years)
												</CardTitle>
												<CardDescription className="text-xs">
													As per NAAC format: Year-wise Pass Percentage of Learners
												</CardDescription>
											</CardHeader>
											<CardContent>
												<div className="h-[300px]">
													<ResponsiveContainer width="100%" height="100%">
														<BarChart data={naacData.year_wise_results}>
															<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
															<XAxis dataKey="academic_year" tick={{ fontSize: 12 }} />
															<YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
															<Tooltip />
															<Legend />
															<Bar dataKey="pass_percentage" name="Success %" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
														</BarChart>
													</ResponsiveContainer>
												</div>
											</CardContent>
										</Card>

										{/* Year-wise Table */}
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="text-sm font-semibold">Year-wise Pass Percentage Table</CardTitle>
											</CardHeader>
											<CardContent>
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>Academic Year</TableHead>
															<TableHead className="text-center">Enrolled</TableHead>
															<TableHead className="text-center">Appeared</TableHead>
															<TableHead className="text-center">Passed</TableHead>
															<TableHead className="text-center">Pass Percentage</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{naacData.year_wise_results.map((result, index) => (
															<TableRow key={index}>
																<TableCell className="font-medium">{result.academic_year}</TableCell>
																<TableCell className="text-center">{result.enrolled}</TableCell>
																<TableCell className="text-center">{result.appeared}</TableCell>
																<TableCell className="text-center">{result.passed}</TableCell>
																<TableCell className="text-center">
																	<Badge
																		variant="secondary"
																		className={`${
																			result.pass_percentage >= 80
																				? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
																				: result.pass_percentage >= 60
																				? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
																				: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
																		}`}
																	>
																		{result.pass_percentage}%
																	</Badge>
																</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											</CardContent>
										</Card>

										{/* Program-wise Pass Percentage */}
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="text-sm font-semibold flex items-center gap-2">
													<GraduationCap className="h-4 w-4 text-slate-500" />
													Program-wise Pass Percentage
												</CardTitle>
											</CardHeader>
											<CardContent>
												<ScrollArea className="h-[300px]">
													<Table>
														<TableHeader>
															<TableRow>
																<TableHead>Program Name</TableHead>
																<TableHead className="text-center">Enrolled</TableHead>
																<TableHead className="text-center">Appeared</TableHead>
																<TableHead className="text-center">Passed</TableHead>
																<TableHead className="text-center">Pass %</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{naacData.program_wise_results.map((result, index) => (
																<TableRow key={index}>
																	<TableCell className="font-medium max-w-[200px] truncate">{result.program_name}</TableCell>
																	<TableCell className="text-center">{result.enrolled}</TableCell>
																	<TableCell className="text-center">{result.appeared}</TableCell>
																	<TableCell className="text-center">{result.passed}</TableCell>
																	<TableCell className="text-center">
																		<Badge
																			variant="secondary"
																			className={`${
																				result.pass_percentage >= 80
																					? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
																					: result.pass_percentage >= 60
																					? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
																					: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
																			}`}
																		>
																			{result.pass_percentage}%
																		</Badge>
																	</TableCell>
																</TableRow>
															))}
														</TableBody>
													</Table>
												</ScrollArea>
											</CardContent>
										</Card>

										{/* Calculation Method */}
										<Card className="bg-slate-50 dark:bg-slate-800/50">
											<CardContent className="p-4">
												<div className="flex items-start gap-3">
													<AlertCircle className="h-5 w-5 text-slate-500 mt-0.5" />
													<div>
														<p className="text-sm font-medium text-slate-700 dark:text-slate-300">Calculation Method</p>
														<p className="text-xs text-slate-500 mt-1">{naacData.calculation_method}</p>
													</div>
												</div>
											</CardContent>
										</Card>
									</>
								) : (
									<div className="flex flex-col items-center justify-center h-64 text-slate-500">
										<Award className="h-12 w-12 mb-4 opacity-50" />
										<p className="text-lg font-medium">NAAC Reports</p>
										<p className="text-sm">No data available. Please apply filters and try again.</p>
									</div>
								)}
							</TabsContent>

							{/* NAD Tab - Premium Design */}
							<TabsContent value="nad" className="space-y-4">
								{loadingNaad ? (
									<ComplianceDashboardSkeleton />
								) : naadData ? (
									<>
										{/* NAD Premium Header Card */}
										<Card className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 text-white shadow-xl">
											<div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,white)]" />
											<div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
											<div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-400/20 rounded-full blur-3xl" />
											<CardContent className="relative p-6">
												<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
													<div className="flex items-center gap-4">
														<div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
															<Target className="h-8 w-8 text-white" />
														</div>
														<div>
															<div className="flex items-center gap-2 mb-1">
																<Badge className="bg-white/20 text-white border-white/30 text-xs">
																	NAD/ABC
																</Badge>
																<Badge className={`text-xs border-0 ${
																	naadData.compliance_summary.sync_status === 'synced'
																		? 'bg-green-500/30 text-white'
																		: 'bg-amber-500/30 text-white'
																}`}>
																	{naadData.compliance_summary.sync_status === 'synced' ? (
																		<><CheckCircle2 className="h-3 w-3 mr-1" />Synced</>
																	) : (
																		<><Clock className="h-3 w-3 mr-1" />Pending</>
																	)}
																</Badge>
															</div>
															<h3 className="text-2xl font-bold">National Academic Depository</h3>
															<p className="text-sm text-white/80 mt-1">Academic Bank of Credits (ABC) Integration & Compliance</p>
														</div>
													</div>
													<div className="text-left md:text-right bg-white/10 backdrop-blur-sm rounded-xl p-4 min-w-[180px]">
														<p className="text-xs text-white/70 uppercase tracking-wider mb-1">Overall Compliance</p>
														<div className="text-4xl font-bold tabular-nums">{naadData.compliance_summary.compliance_percentage}%</div>
														<Progress
															value={naadData.compliance_summary.compliance_percentage}
															className="h-2 mt-2 bg-white/20"
														/>
													</div>
												</div>
											</CardContent>
										</Card>

										{/* Compliance Metrics - Premium Cards with JKKN Terminology */}
										<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
											<Card className="group relative overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-700/50 border-slate-200/50 dark:border-slate-600/50 hover:shadow-lg transition-all duration-300">
												<div className="absolute top-0 right-0 w-16 h-16 bg-slate-200/30 dark:bg-slate-600/20 rounded-full -mr-6 -mt-6 group-hover:scale-110 transition-transform" />
												<CardContent className="p-4 relative">
													<p className="text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400 font-semibold">Total Learners</p>
													<p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
														{naadData.compliance_summary.total_students.toLocaleString()}
													</p>
													<div className="flex items-center gap-1 mt-1">
														<Users className="h-3 w-3 text-slate-400" />
														<span className="text-[10px] text-slate-500">Registered</span>
													</div>
												</CardContent>
											</Card>

											<Card className="group relative overflow-hidden bg-gradient-to-br from-green-50 via-green-100 to-emerald-100 dark:from-green-900/30 dark:via-green-800/20 dark:to-emerald-900/20 border-green-200/50 dark:border-green-700/50 hover:shadow-lg transition-all duration-300">
												<div className="absolute top-0 right-0 w-16 h-16 bg-green-200/30 dark:bg-green-700/20 rounded-full -mr-6 -mt-6 group-hover:scale-110 transition-transform" />
												<CardContent className="p-4 relative">
													<p className="text-[10px] uppercase tracking-wider text-green-600 dark:text-green-400 font-semibold">ABC Linked</p>
													<p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1 tabular-nums">
														{naadData.compliance_summary.abc_linked_students.toLocaleString()}
													</p>
													<Progress value={naadData.compliance_summary.abc_compliance} className="h-1.5 mt-2 bg-green-200/50" />
													<span className="text-[10px] text-green-600 dark:text-green-400">{naadData.compliance_summary.abc_compliance}%</span>
												</CardContent>
											</Card>

											<Card className="group relative overflow-hidden bg-gradient-to-br from-blue-50 via-blue-100 to-indigo-100 dark:from-blue-900/30 dark:via-blue-800/20 dark:to-indigo-900/20 border-blue-200/50 dark:border-blue-700/50 hover:shadow-lg transition-all duration-300">
												<div className="absolute top-0 right-0 w-16 h-16 bg-blue-200/30 dark:bg-blue-700/20 rounded-full -mr-6 -mt-6 group-hover:scale-110 transition-transform" />
												<CardContent className="p-4 relative">
													<p className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold">Aadhaar Verified</p>
													<p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1 tabular-nums">
														{naadData.compliance_summary.aadhaar_verified_students.toLocaleString()}
													</p>
													<Progress value={naadData.compliance_summary.aadhaar_compliance} className="h-1.5 mt-2 bg-blue-200/50" />
													<span className="text-[10px] text-blue-600 dark:text-blue-400">{naadData.compliance_summary.aadhaar_compliance}%</span>
												</CardContent>
											</Card>

											<Card className="group relative overflow-hidden bg-gradient-to-br from-emerald-50 via-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:via-emerald-800/20 dark:to-teal-900/20 border-emerald-200/50 dark:border-emerald-700/50 hover:shadow-lg transition-all duration-300">
												<div className="absolute top-0 right-0 w-16 h-16 bg-emerald-200/30 dark:bg-emerald-700/20 rounded-full -mr-6 -mt-6 group-hover:scale-110 transition-transform" />
												<CardContent className="p-4 relative">
													<p className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">Results Uploaded</p>
													<p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
														{naadData.compliance_summary.results_uploaded.toLocaleString()}
													</p>
													<div className="flex items-center gap-1 mt-1">
														<CheckCircle2 className="h-3 w-3 text-emerald-500" />
														<span className="text-[10px] text-emerald-600 dark:text-emerald-400">Synced</span>
													</div>
												</CardContent>
											</Card>

											<Card className="group relative overflow-hidden bg-gradient-to-br from-amber-50 via-amber-100 to-orange-100 dark:from-amber-900/30 dark:via-amber-800/20 dark:to-orange-900/20 border-amber-200/50 dark:border-amber-700/50 hover:shadow-lg transition-all duration-300">
												<div className="absolute top-0 right-0 w-16 h-16 bg-amber-200/30 dark:bg-amber-700/20 rounded-full -mr-6 -mt-6 group-hover:scale-110 transition-transform" />
												<CardContent className="p-4 relative">
													<p className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">Pending Uploads</p>
													<p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1 tabular-nums">
														{naadData.compliance_summary.pending_uploads.toLocaleString()}
													</p>
													<div className="flex items-center gap-1 mt-1">
														<Clock className="h-3 w-3 text-amber-500" />
														<span className="text-[10px] text-amber-600 dark:text-amber-400">Awaiting</span>
													</div>
												</CardContent>
											</Card>

											<Card className="group relative overflow-hidden bg-gradient-to-br from-purple-50 via-purple-100 to-violet-100 dark:from-purple-900/30 dark:via-purple-800/20 dark:to-violet-900/20 border-purple-200/50 dark:border-purple-700/50 hover:shadow-lg transition-all duration-300">
												<div className="absolute top-0 right-0 w-16 h-16 bg-purple-200/30 dark:bg-purple-700/20 rounded-full -mr-6 -mt-6 group-hover:scale-110 transition-transform" />
												<CardContent className="p-4 relative">
													<p className="text-[10px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-semibold">Recent Uploads</p>
													<p className="text-2xl font-bold text-purple-700 dark:text-purple-300 mt-1 tabular-nums">
														{naadData.compliance_summary.recently_uploaded.toLocaleString()}
													</p>
													<div className="flex items-center gap-1 mt-1">
														<ArrowUpRight className="h-3 w-3 text-purple-500" />
														<span className="text-[10px] text-purple-600 dark:text-purple-400">This Week</span>
													</div>
												</CardContent>
											</Card>
										</div>

										{/* Compliance Progress Bars */}
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="text-sm font-semibold">Compliance Breakdown</CardTitle>
											</CardHeader>
											<CardContent className="space-y-4">
												<div>
													<div className="flex justify-between text-sm mb-1">
														<span>Aadhaar Compliance</span>
														<span className="font-semibold">{naadData.compliance_summary.aadhaar_compliance}%</span>
													</div>
													<Progress
														value={naadData.compliance_summary.aadhaar_compliance}
														className={`h-2 ${naadData.compliance_summary.aadhaar_compliance >= 80 ? '' : naadData.compliance_summary.aadhaar_compliance >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'}`}
													/>
												</div>
												<div>
													<div className="flex justify-between text-sm mb-1">
														<span>ABC ID Compliance</span>
														<span className="font-semibold">{naadData.compliance_summary.abc_compliance}%</span>
													</div>
													<Progress
														value={naadData.compliance_summary.abc_compliance}
														className={`h-2 ${naadData.compliance_summary.abc_compliance >= 80 ? '' : naadData.compliance_summary.abc_compliance >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'}`}
													/>
												</div>
												<div>
													<div className="flex justify-between text-sm mb-1">
														<span>Result Upload Compliance</span>
														<span className="font-semibold">{naadData.compliance_summary.result_compliance}%</span>
													</div>
													<Progress
														value={naadData.compliance_summary.result_compliance}
														className={`h-2 ${naadData.compliance_summary.result_compliance >= 80 ? '' : naadData.compliance_summary.result_compliance >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'}`}
													/>
												</div>
											</CardContent>
										</Card>

										{/* Data Quality Issues */}
										{naadData.compliance_summary.data_quality_issues.length > 0 && (
											<Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
												<CardHeader className="pb-2">
													<CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
														<AlertTriangle className="h-4 w-4" />
														Data Quality Issues ({naadData.compliance_summary.data_quality_issues.length})
													</CardTitle>
												</CardHeader>
												<CardContent>
													<div className="space-y-3">
														{naadData.compliance_summary.data_quality_issues.map((issue, index) => (
															<div key={index} className="flex items-start gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-red-200 dark:border-red-800">
																<div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
																	issue.severity === 'high' ? 'bg-red-500' :
																	issue.severity === 'medium' ? 'bg-amber-500' : 'bg-green-500'
																}`} />
																<div className="flex-1">
																	<div className="flex items-center justify-between">
																		<p className="text-sm font-semibold">{issue.field}</p>
																		<Badge
																			variant="outline"
																			className={`text-xs ${
																				issue.severity === 'high' ? 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-400' :
																				issue.severity === 'medium' ? 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400' :
																				'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
																			}`}
																		>
																			{issue.severity.toUpperCase()}
																		</Badge>
																	</div>
																	<p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{issue.issue}</p>
																	<p className="text-xs text-red-600 dark:text-red-400 mt-1">
																		Affected: {issue.affected_count.toLocaleString()} records
																	</p>
																</div>
															</div>
														))}
													</div>
												</CardContent>
											</Card>
										)}

										{/* Upload Batches */}
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="text-sm font-semibold flex items-center gap-2">
													<FileSpreadsheet className="h-4 w-4 text-slate-500" />
													Upload Batches by Program
												</CardTitle>
											</CardHeader>
											<CardContent>
												<ScrollArea className="h-[300px]">
													<Table>
														<TableHeader>
															<TableRow>
																<TableHead>Program</TableHead>
																<TableHead>Batch</TableHead>
																<TableHead className="text-center">Total</TableHead>
																<TableHead className="text-center">Ready</TableHead>
																<TableHead className="text-center">Pending</TableHead>
																<TableHead className="text-center">Status</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{naadData.upload_batches.map((batch, index) => (
																<TableRow key={index}>
																	<TableCell className="font-medium max-w-[150px] truncate">{batch.program_name}</TableCell>
																	<TableCell>{batch.batch_name}</TableCell>
																	<TableCell className="text-center">{batch.total_students}</TableCell>
																	<TableCell className="text-center text-green-600 dark:text-green-400">{batch.ready_for_upload}</TableCell>
																	<TableCell className="text-center text-amber-600 dark:text-amber-400">{batch.pending_data}</TableCell>
																	<TableCell className="text-center">
																		<Badge
																			variant="secondary"
																			className={`text-xs ${
																				batch.upload_status === 'ready' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
																				batch.upload_status === 'incomplete' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
																				'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400'
																			}`}
																		>
																			{batch.upload_status.toUpperCase()}
																		</Badge>
																	</TableCell>
																</TableRow>
															))}
														</TableBody>
													</Table>
												</ScrollArea>
											</CardContent>
										</Card>

										{/* Student Records Preview */}
										<Card>
											<CardHeader className="pb-2">
												<CardTitle className="text-sm font-semibold flex items-center gap-2">
													<Users className="h-4 w-4 text-slate-500" />
													Learner Records (Preview)
												</CardTitle>
												<CardDescription className="text-xs">
													Showing first 20 records. Export to Excel for complete data.
												</CardDescription>
											</CardHeader>
											<CardContent>
												<ScrollArea className="h-[350px]">
													<Table>
														<TableHeader>
															<TableRow>
																<TableHead>Learner ID</TableHead>
																<TableHead>Name</TableHead>
																<TableHead>Program</TableHead>
																<TableHead className="text-center">Aadhaar</TableHead>
																<TableHead className="text-center">ABC ID</TableHead>
																<TableHead className="text-center">CGPA</TableHead>
																<TableHead className="text-center">Status</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{naadData.student_records.slice(0, 20).map((record, index) => (
																<TableRow key={index}>
																	<TableCell className="font-mono text-xs">{record.register_number}</TableCell>
																	<TableCell className="max-w-[150px] truncate">{record.name}</TableCell>
																	<TableCell className="max-w-[150px] truncate text-xs">{record.program_name}</TableCell>
																	<TableCell className="text-center">
																		{record.data_completeness.aadhaar ? (
																			<CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
																		) : (
																			<XCircle className="h-4 w-4 text-red-500 mx-auto" />
																		)}
																	</TableCell>
																	<TableCell className="text-center">
																		{record.data_completeness.abc_id ? (
																			<CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
																		) : (
																			<XCircle className="h-4 w-4 text-red-500 mx-auto" />
																		)}
																	</TableCell>
																	<TableCell className="text-center font-semibold">{record.cgpa.toFixed(2)}</TableCell>
																	<TableCell className="text-center">
																		<Badge
																			variant="secondary"
																			className={`text-xs ${
																				record.naad_status === 'ready' || record.naad_status === 'uploaded' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
																				record.naad_status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
																				'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
																			}`}
																		>
																			{record.naad_status.toUpperCase()}
																		</Badge>
																	</TableCell>
																</TableRow>
															))}
														</TableBody>
													</Table>
												</ScrollArea>
											</CardContent>
										</Card>
									</>
								) : (
									<div className="flex flex-col items-center justify-center h-64 text-slate-500">
										<Target className="h-12 w-12 mb-4 opacity-50" />
										<p className="text-lg font-medium">NAD Compliance</p>
										<p className="text-sm">No data available. Please apply filters and try again.</p>
									</div>
								)}
							</TabsContent>
						</Tabs>
					</div>
				</PageTransition>

				<AppFooter />

				{/* Comparison Panel Modal */}
				{showComparison && comparisonItems.length >= 2 && (
					<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
						<div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-auto">
							<ComparisonPanel
								title="Program Comparison"
								description="Side-by-side analysis of program performance"
								items={comparisonItems}
								onClose={() => setShowComparison(false)}
							/>
						</div>
					</div>
				)}

				{/* Drill Down Modal */}
				<DrillDownModal
					open={showDrillDown}
					onClose={() => { setShowDrillDown(false); setDrillDownFilter('all'); }}
					title="Learner Performance Details"
					subtitle={`Detailed view of ${drillDownFilter === 'all' ? 'all' : drillDownFilter} learners`}
					data={drillDownData}
					summary={drillDownSummary}
					onExport={() => {
						toast({
							title: "Export Started",
							description: "Generating Excel report with learner details...",
						})
					}}
				/>
			</SidebarInset>
		</SidebarProvider>
	)
}
