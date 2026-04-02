'use client'

import { useEffect, useState, useMemo, useRef, memo } from 'react'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeaderWhite } from '@/components/layout/app-header-white'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition, CardAnimation } from '@/components/common/page-transition'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
	Users,
	BookOpen,
	CalendarCheck,
	ClipboardCheck,
	FileText,
	CheckCircle2,
	AlertCircle,
	Sparkles,
	Award,
	Zap,
	Shield,
	Globe,
} from 'lucide-react'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { useToast } from '@/hooks/common/use-toast'
import { cn } from '@/lib/utils'
import { ExamCalendar } from '@/components/dashboard/exam-calendar'
import { useCoeCalendar } from '@/hooks/use-coe-calendar'
import { PerformanceTrendsChart, AttendanceBarChart, GradeDistributionChart } from '@/components/dashboard/performance-charts'

// ── Types ────────────────────────────────────────────────────────────

interface DashboardStats {
	totalLearners: number
	activeCourses: number
	totalPrograms: number
	facultyMembers: number
	totalInstitutions: number
	totalDepartments: number
	totalSemesters: number
	activeExamSessions: number
	totalExaminers: number
	pendingEvaluations: number
	myJKKN: {
		learners: number
		staff: number
		institutions: number
		departments: number
		programs: number
	}
	attendanceRatio: string
	attendanceDetails: {
		total: number
		present: number
		absent: number
	}
	upcomingExams: Array<{
		id: string
		exam_date: string
		session: string
		exam_mode: string
		institution_name: string
		session_name: string
		course_code: string
		course_name: string
		program_name: string
	}>
	recentResults: Array<{
		id: string
		register_no: string
		semester: number
		gpa: number
		cgpa: number
		pass_status: string
		published_at: string
		session_name: string
	}>
	performanceTrends: Array<{
		session: string
		passRate: number
		avgGpa: number
		totalResults: number
	}>
	gradeDistribution: Array<{
		grade: string
		count: number
	}>
	calendarExams: Array<{
		id: string
		exam_date: string
		session: string
		exam_mode: string
		institution_name: string
		session_name: string
		course_code: string
		course_name: string
	}>
	isSuperAdmin: boolean
	institutionId: string | null
	userRole: string
	userRoleName: string
	userRoleDescription: string
	userRoles: Array<{
		name: string
		description: string
	}>
	userEmail: string
}

// ── Isolated Live Clock (prevents full-page re-renders) ─────────────

const LiveClock = memo(function LiveClock() {
	const [now, setNow] = useState<Date | null>(null)

	useEffect(() => {
		const update = () => setNow(new Date())
		update()
		const id = setInterval(update, 1000)
		return () => clearInterval(id)
	}, [])

	const timeString = now
		? now.toLocaleTimeString(undefined, { hour12: true })
		: '--:-- --'
	const dateString = now
		? now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' })
		: ''

	return (
		<div className="backdrop-blur-xl bg-white/10 border border-white/15 rounded-2xl p-5 shadow-2xl shadow-black/10 min-w-[200px]">
			<div className="text-3xl font-bold tracking-wider text-white tabular-nums">
				{timeString}
			</div>
			<div className="text-sm text-emerald-200/70 mt-1">{dateString}</div>
			<div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
				<span className="relative flex h-2 w-2">
					<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
					<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
				</span>
				<span className="text-xs text-emerald-300 font-medium">System Online</span>
			</div>
		</div>
	)
})

// ── Animated Counter Hook ────────────────────────────────────────────

function useAnimatedCounter(target: number, duration: number = 1200): number {
	const [count, setCount] = useState(0)
	const prevTarget = useRef(target)

	useEffect(() => {
		if (target === prevTarget.current && count !== 0) return
		prevTarget.current = target
		if (target === 0) { setCount(0); return }
		let startTime: number | null = null
		let animationFrame: number
		const animate = (currentTime: number) => {
			if (startTime === null) startTime = currentTime
			const elapsed = currentTime - startTime
			const progress = Math.min(elapsed / duration, 1)
			const easeOutCubic = 1 - Math.pow(1 - progress, 3)
			setCount(Math.round(easeOutCubic * target))
			if (progress < 1) animationFrame = requestAnimationFrame(animate)
		}
		animationFrame = requestAnimationFrame(animate)
		return () => cancelAnimationFrame(animationFrame)
	}, [target, duration])

	return count
}

// ── Premium Glass KPI Card ───────────────────────────────────────────

interface KPICardProps {
	title: string
	value: number
	icon: React.ElementType
	gradient: string
	iconGradient: string
	glowColor: string
	delay?: number
	loading?: boolean
}

const KPICard = memo(function KPICard({ title, value, icon: Icon, gradient, iconGradient, glowColor, delay = 0, loading }: KPICardProps) {
	const animatedValue = useAnimatedCounter(loading ? 0 : value)

	if (loading) {
		return (
			<div className="glass-card rounded-2xl p-5">
				<div className="flex items-start justify-between">
					<div className="flex-1">
						<Skeleton className="h-3 w-20 mb-3 bg-white/10" />
						<Skeleton className="h-8 w-16 bg-white/10" />
					</div>
					<Skeleton className="h-11 w-11 rounded-xl bg-white/10" />
				</div>
			</div>
		)
	}

	return (
		<CardAnimation delay={delay}>
			<div className={cn(
				'glass-card rounded-2xl p-5 group cursor-default',
				'transition-all duration-500 hover:scale-[1.03]',
				`hover:shadow-xl hover:shadow-${glowColor}/10`
			)}>
				{/* Glow orb */}
				<div className={cn(
					'absolute top-0 right-0 w-24 h-24 rounded-full -mr-10 -mt-10',
					'opacity-0 group-hover:opacity-20 transition-opacity duration-500',
					gradient
				)} />

				<div className="flex items-start justify-between relative">
					<div className="flex-1 min-w-0">
						<p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">
							{title}
						</p>
						<p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
							{animatedValue.toLocaleString()}
						</p>
					</div>
					<div className={cn(
						'h-11 w-11 rounded-xl flex items-center justify-center shadow-lg',
						iconGradient
					)}>
						<Icon className="h-5 w-5 text-white" />
					</div>
				</div>
			</div>
		</CardAnimation>
	)
})

// ── Main Dashboard Page ──────────────────────────────────────────────

export default function Page() {
	const { user } = useAuth()
	const { toast } = useToast()
	const { filter, isReady, appendToUrl, institutionId, mustSelectInstitution } = useInstitutionFilter()
	const { currentInstitution } = useInstitution()

	const [stats, setStats] = useState<DashboardStats | null>(null)
	const [loading, setLoading] = useState(true)

	// COE Calendar events for dashboard widget
	// undefined = not ready yet (skip fetch); null = all institutions (super_admin); string = specific institution
	const { events: coeCalendarEvents, loading: coeLoading } = useCoeCalendar({
		institutionsId: isReady ? institutionId : undefined,
	})

	// Stabilize dependencies - only re-fetch when actual values change
	const userId = user?.id
	const userEmail = user?.email
	const userName = user?.full_name
	const toastRef = useRef(toast)
	toastRef.current = toast
	const appendToUrlRef = useRef(appendToUrl)
	appendToUrlRef.current = appendToUrl

	// Fetch stats - stable deps only
	useEffect(() => {
		const fetchStats = async () => {
			if (!userId && !userEmail) return
			if (!isReady) return
			try {
				setLoading(true)
				const params = new URLSearchParams()
				if (userId) params.set('user_id', userId)
				if (userEmail) params.set('email', userEmail)
				const url = appendToUrlRef.current(`/api/dashboard/stats?${params.toString()}`)
				const response = await fetch(url, { credentials: 'include' })
				if (!response.ok) throw new Error('Failed to fetch dashboard stats')
				const data = await response.json()
				setStats(data)
			} catch (error) {
				console.error('Error fetching dashboard stats:', error)
				toastRef.current({ title: 'Error', description: 'Failed to load dashboard statistics', variant: 'destructive' })
			} finally {
				setLoading(false)
			}
		}
		fetchStats()
	}, [userId, userEmail, isReady, filter])

	// Stable fallback references (avoid new object on every render)
	const emptyTrends = useMemo(() => [] as DashboardStats['performanceTrends'], [])
	const emptyAttendance = useMemo(() => ({ total: 0, present: 0, absent: 0 }), [])
	const emptyCalendarExams = useMemo(() => [] as DashboardStats['calendarExams'], [])
	const emptyGradeDistribution = useMemo(() => [] as DashboardStats['gradeDistribution'], [])

	const performanceTrends = stats?.performanceTrends || emptyTrends
	const attendanceDetails = stats?.attendanceDetails || emptyAttendance
	const calendarExams = stats?.calendarExams || emptyCalendarExams
	const gradeDistribution = stats?.gradeDistribution || emptyGradeDistribution

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeaderWhite />

				<PageTransition>
					<div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">

						{/* ══════════ PREMIUM HERO BANNER ══════════ */}
						<div className="relative rounded-3xl overflow-hidden">
							{/* Gradient Background */}
							<div className="absolute inset-0 bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-900" />

							{/* Animated Orbs */}
							<div className="absolute inset-0 overflow-hidden">
								<div className="absolute top-[10%] left-[15%] w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl animate-float-slow" />
								<div className="absolute bottom-[10%] right-[10%] w-48 h-48 bg-emerald-400/20 rounded-full blur-3xl animate-float-delayed" />
								<div className="absolute top-[40%] right-[30%] w-32 h-32 bg-emerald-300/15 rounded-full blur-2xl animate-float-slow" />
							</div>

							{/* Glass Overlay Pattern */}
							<div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_50%)]" />
							<div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.05),transparent_40%)]" />

							{/* Content */}
							<div className="relative z-10 px-8 py-10 md:py-12">
								<div className="flex flex-col lg:flex-row items-start justify-between gap-6">
									<div className="space-y-4">
										<div className="flex items-center gap-2">
											<div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/10">
												<Sparkles className="h-3.5 w-3.5 text-yellow-300" />
												<span className="text-emerald-200 text-xs font-medium">Dashboard</span>
											</div>
											{stats?.isSuperAdmin && (
												<div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 backdrop-blur-sm border border-amber-400/20">
													<Shield className="h-3.5 w-3.5 text-amber-300" />
													<span className="text-amber-200 text-xs font-medium">Super Admin</span>
												</div>
											)}
										</div>

										<h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
											Welcome back{userName ? `, ${userName.split(' ')[0]}` : ''}
											<span className="text-emerald-300">.</span>
										</h1>

										<p className="text-base text-emerald-200/80 max-w-md leading-relaxed">
											Here's your examination management overview. Track exams, results, and performance at a glance.
										</p>

										{/* Quick Stat Badges */}
										<div className="flex flex-wrap gap-2 pt-1">
											{stats?.myJKKN && stats.myJKKN.learners > 0 && (
												<Badge className="bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur-sm transition-all">
													<Users className="h-3 w-3 mr-1.5" />
													{stats.myJKKN.learners.toLocaleString()} Learners
												</Badge>
											)}
											{(stats?.activeExamSessions ?? 0) > 0 && (
												<Badge className="bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur-sm transition-all">
													<CalendarCheck className="h-3 w-3 mr-1.5" />
													{stats!.activeExamSessions} Active Sessions
												</Badge>
											)}
											{(stats?.pendingEvaluations ?? 0) > 0 && (
												<Badge className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/20 backdrop-blur-sm transition-all">
													<Zap className="h-3 w-3 mr-1.5" />
													{stats!.pendingEvaluations} Pending
												</Badge>
											)}
										</div>
									</div>

									{/* Clock Card - isolated to prevent full-page re-renders */}
									<LiveClock />
								</div>
							</div>
						</div>

						{/* ══════════ INTERACTIVE CHARTS ROW ══════════ */}
						<div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
							<PerformanceTrendsChart
								data={performanceTrends}
								loading={loading}
							/>
							<AttendanceBarChart
								attendanceDetails={attendanceDetails}
								registrations={stats?.totalLearners || 0}
								sessions={stats?.activeExamSessions || 0}
								loading={loading}
							/>
						</div>

						{/* ══════════ KPI STATS ROW ══════════ */}
						<div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
							<KPICard
								title="Learners"
								value={stats?.totalLearners || 0}
								icon={Users}
								gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
								iconGradient="bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/30"
								glowColor="emerald"
								delay={0.1}
								loading={loading}
							/>
							<KPICard
								title="Sessions"
								value={stats?.activeExamSessions || 0}
								icon={CalendarCheck}
								gradient="bg-gradient-to-br from-emerald-600 to-emerald-700"
								iconGradient="bg-gradient-to-br from-emerald-600 to-emerald-700 shadow-emerald-500/30"
								glowColor="emerald"
								delay={0.15}
								loading={loading}
							/>
							<KPICard
								title="Courses"
								value={stats?.activeCourses || 0}
								icon={BookOpen}
								gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
								iconGradient="bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/30"
								glowColor="emerald"
								delay={0.2}
								loading={loading}
							/>
							<KPICard
								title="Pending"
								value={stats?.pendingEvaluations || 0}
								icon={ClipboardCheck}
								gradient="bg-gradient-to-br from-amber-500 to-orange-600"
								iconGradient="bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30"
								glowColor="amber"
								delay={0.25}
								loading={loading}
							/>
						</div>

						{/* ══════════ EXAM CALENDAR (FULL WIDTH) ══════════ */}
						<CardAnimation delay={0.3}>
							<ExamCalendar
								exams={calendarExams}
								calendarEvents={coeCalendarEvents}
								showInstitution={mustSelectInstitution}
								loading={loading || coeLoading}
							/>
						</CardAnimation>

						{/* ══════════ BOTTOM ROW: Grade Dist + Results + User ══════════ */}
						<div className="grid gap-6 grid-cols-1 md:grid-cols-3">
							{/* Grade Distribution Donut */}
							<CardAnimation delay={0.35}>
								<GradeDistributionChart
									data={gradeDistribution}
									loading={loading}
								/>
							</CardAnimation>

							{/* Recent Results */}
							<CardAnimation delay={0.4}>
								<div className="glass-card rounded-2xl overflow-hidden h-full flex flex-col">
									<div className="px-6 py-4 border-b border-slate-200/50 dark:border-white/5 flex items-center gap-3">
										<div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
											<FileText className="h-4 w-4 text-white" />
										</div>
										<div>
											<h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Results</h3>
											<p className="text-[11px] text-slate-500 dark:text-slate-400">Latest published results</p>
										</div>
									</div>

									<div className="p-4 flex-1">
										{loading ? (
											<div className="space-y-3">
												{[1, 2, 3].map((i) => (
													<div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5">
														<div className="space-y-2">
															<Skeleton className="h-4 w-24 bg-white/10" />
															<Skeleton className="h-3 w-16 bg-white/10" />
														</div>
														<Skeleton className="h-6 w-12 bg-white/10" />
													</div>
												))}
											</div>
										) : stats?.recentResults && stats.recentResults.length > 0 ? (
											<div className="space-y-2">
												{stats.recentResults.map((result) => (
													<div
														key={result.id}
														className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 dark:bg-white/[0.03] hover:bg-emerald-50/50 dark:hover:bg-emerald-500/5 transition-colors group"
													>
														<div className="flex-1 min-w-0">
															<p className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
																{result.register_no}
															</p>
															<div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
																<span>Sem {result.semester}</span>
																<span className="text-slate-300 dark:text-slate-600">|</span>
																<span>GPA {result.gpa?.toFixed(2) || 'N/A'}</span>
																<span className="text-slate-300 dark:text-slate-600">|</span>
																<span>CGPA {result.cgpa?.toFixed(2) || 'N/A'}</span>
															</div>
														</div>
														<Badge className={cn(
															'text-[10px] border-0',
															result.pass_status === 'Pass'
																? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
																: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
														)}>
															{result.pass_status === 'Pass' ? (
																<CheckCircle2 className="h-3 w-3 mr-1" />
															) : (
																<AlertCircle className="h-3 w-3 mr-1" />
															)}
															{result.pass_status}
														</Badge>
													</div>
												))}
											</div>
										) : (
											<div className="flex flex-col items-center justify-center py-8 text-center">
												<FileText className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-2" />
												<p className="text-sm text-slate-400 dark:text-slate-500">No recent results</p>
											</div>
										)}
									</div>
								</div>
							</CardAnimation>

							{/* User & Access Status */}
							<CardAnimation delay={0.45}>
								<div className="glass-card rounded-2xl overflow-hidden h-full flex flex-col">
									<div className="px-6 py-4 border-b border-slate-200/50 dark:border-white/5 flex items-center gap-3">
										<div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
											<Award className="h-4 w-4 text-white" />
										</div>
										<div>
											<h3 className="text-sm font-semibold text-slate-900 dark:text-white">Access Status</h3>
											<p className="text-[11px] text-slate-500 dark:text-slate-400">Your role & permissions</p>
										</div>
									</div>

									<div className="p-5 flex-1 space-y-4">
										{/* Role Badge */}
										<div className="flex items-center justify-center">
											<div className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500/10 to-emerald-400/10 dark:from-emerald-500/20 dark:to-emerald-400/20 border border-emerald-200/30 dark:border-emerald-500/20">
												<span className="text-sm font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 dark:from-emerald-400 dark:to-emerald-300 bg-clip-text text-transparent">
													{stats?.userRoleName || 'User'}
												</span>
											</div>
										</div>

										{/* Details */}
										<div className="space-y-3">
											<div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50/50 dark:bg-white/[0.03]">
												<span className="text-[11px] text-slate-500 dark:text-slate-400">Email</span>
												<span className="text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
													{stats?.userEmail || 'N/A'}
												</span>
											</div>

											<div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50/50 dark:bg-white/[0.03]">
												<span className="text-[11px] text-slate-500 dark:text-slate-400">Access Level</span>
												<div className="flex items-center gap-1.5">
													<Globe className="h-3 w-3 text-emerald-500" />
													<span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
														{stats?.isSuperAdmin
															? (currentInstitution?.institution_name || 'All Institutions')
															: (currentInstitution?.institution_name || 'Institution Only')
														}
													</span>
												</div>
											</div>

											<div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50/50 dark:bg-white/[0.03]">
												<span className="text-[11px] text-slate-500 dark:text-slate-400">Status</span>
												<div className="flex items-center gap-1.5">
													<span className="relative flex h-2 w-2">
														<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
														<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
													</span>
													<span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Online</span>
												</div>
											</div>
										</div>

										{/* Other Roles */}
										{stats?.userRoles && stats.userRoles.length > 1 && (
											<div className="pt-2 border-t border-slate-200/50 dark:border-white/5">
												<span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block mb-2">
													Other Roles
												</span>
												<div className="flex flex-wrap gap-1.5">
													{stats.userRoles.slice(1).map((role, index) => (
														<Badge
															key={index}
															variant="outline"
															className="text-[10px] border-emerald-200/50 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
														>
															{role.name}
														</Badge>
													))}
												</div>
											</div>
										)}
									</div>
								</div>
							</CardAnimation>
						</div>

					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
