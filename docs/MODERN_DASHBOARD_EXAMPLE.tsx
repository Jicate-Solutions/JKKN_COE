"use client"

/**
 * MODERN DASHBOARD EXAMPLE
 *
 * This is a reference implementation showing how to use the modern components
 * Replace your current dashboard page with this structure
 *
 * File Location: app/coe/dashboard/page.tsx
 */

import { useEffect, useState } from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { ModernSidebar } from "@/components/layout/modern-sidebar"
import { ModernNavbar } from "@/components/layout/modern-navbar"
import { ModernBreadcrumb } from "@/components/common/modern-breadcrumb"
import { PageTransition, CardAnimation } from "@/components/common/page-transition"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FullPageSkeleton, StatsCardSkeleton } from "@/components/common/loading-skeleton"
import { useAuth } from "@/context/auth-context"
import { useToast } from "@/hooks/use-toast"
import {
	Users,
	BookOpen,
	GraduationCap,
	BarChart3,
	TrendingUp,
	Calendar,
	Home,
	Database,
	Shield,
	CalendarClock,
	Play,
	CheckSquare,
	PieChart,
} from "lucide-react"

// Navigation data (move this to a shared config file)
const navData = [
	{
		title: "Dashboard",
		url: "/dashboard",
		icon: Home,
		roles: [],
	},
	{
		title: "Admin",
		url: "#",
		icon: Shield,
		roles: ["admin", "super_admin"],
		items: [
			{ title: "Users", url: "/user", icon: Users },
			{ title: "Roles", url: "/roles", icon: Shield },
		],
	},
	{
		title: "Master",
		url: "#",
		icon: Database,
		roles: [],
		items: [
			{ title: "Institutions", url: "/institutions" },
			{ title: "Degree", url: "/degree" },
			{ title: "Department", url: "/department" },
			{ title: "Program", url: "/program" },
		],
	},
	{
		title: "Courses",
		url: "#",
		icon: BookOpen,
		roles: [],
		items: [
			{ title: "Courses", url: "/courses" },
			{ title: "Course Mapping", url: "/course-mapping-index" },
		],
	},
	{
		title: "Pre-Exam",
		url: "#",
		icon: CalendarClock,
		roles: [],
		items: [
			{ title: "Exam Types", url: "/exam-types" },
			{ title: "Exam Sessions", url: "/examination-sessions" },
		],
	},
	{
		title: "During-Exam",
		url: "#",
		icon: Play,
		roles: [],
		items: [
			{ title: "Exam Attendance", url: "/exam-attendance" },
		],
	},
	{
		title: "Reports",
		url: "#",
		icon: PieChart,
		roles: [],
		items: [
			{ title: "Attendance Report", url: "/reports/attendance" },
		],
	},
]

interface DashboardStats {
	totalStudents: number
	activeCourses: number
	totalPrograms: number
	facultyMembers: number
}

export default function ModernDashboardPage() {
	const { user } = useAuth()
	const { toast } = useToast()
	const [stats, setStats] = useState<DashboardStats | null>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		// Fetch dashboard stats
		const fetchStats = async () => {
			try {
				setLoading(true)
				const response = await fetch(`/api/dashboard/stats?user_id=${user?.id}`)

				if (!response.ok) {
					throw new Error('Failed to fetch stats')
				}

				const data = await response.json()
				setStats(data)
			} catch (error) {
				console.error('Error fetching dashboard stats:', error)
				toast({
					title: "Error",
					description: "Failed to load dashboard statistics",
					variant: "destructive"
				})
			} finally {
				setLoading(false)
			}
		}

		if (user?.id) {
			fetchStats()
		}
	}, [user, toast])

	if (loading) {
		return (
			<SidebarProvider>
				<ModernSidebar navItems={navData} />
				<SidebarInset>
					<ModernNavbar showSearch={true} />
					<FullPageSkeleton />
				</SidebarInset>
			</SidebarProvider>
		)
	}

	return (
		<SidebarProvider>
			<ModernSidebar navItems={navData} />
			<SidebarInset>
				<ModernNavbar showSearch={true} />

				<PageTransition>
					<div className="flex flex-1 flex-col gap-6 p-6 md:p-10">
						{/* Breadcrumb */}
						<ModernBreadcrumb
							items={[
								{ label: "Dashboard", current: true }
							]}
						/>

						{/* Page Header */}
						<div className="flex flex-col gap-2">
							<h1 className="text-page-title">Dashboard</h1>
							<p className="text-caption">
								Welcome back! Here's an overview of your examination system.
							</p>
						</div>

						{/* Stats Cards */}
						<div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
							<CardAnimation delay={0}>
								<Card className="card-modern-hover">
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="text-sm font-medium text-muted-foreground">
											Total Students
										</CardTitle>
										<div className="h-10 w-10 rounded-xl bg-saas-primary-100 dark:bg-saas-primary-900/20 flex items-center justify-center">
											<Users className="h-5 w-5 text-saas-primary-600 dark:text-saas-primary-400" />
										</div>
									</CardHeader>
									<CardContent>
										<div className="text-3xl font-bold">
											{stats?.totalStudents?.toLocaleString() || 0}
										</div>
										<p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
											<TrendingUp className="h-3 w-3 text-saas-accent-600" />
											<span className="text-saas-accent-600">+12%</span> from last month
										</p>
									</CardContent>
								</Card>
							</CardAnimation>

							<CardAnimation delay={0.1}>
								<Card className="card-modern-hover">
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="text-sm font-medium text-muted-foreground">
											Active Courses
										</CardTitle>
										<div className="h-10 w-10 rounded-xl bg-saas-accent-100 dark:bg-saas-accent-900/20 flex items-center justify-center">
											<BookOpen className="h-5 w-5 text-saas-accent-600 dark:text-saas-accent-400" />
										</div>
									</CardHeader>
									<CardContent>
										<div className="text-3xl font-bold">
											{stats?.activeCourses?.toLocaleString() || 0}
										</div>
										<p className="text-xs text-muted-foreground mt-1">
											Across all programs
										</p>
									</CardContent>
								</Card>
							</CardAnimation>

							<CardAnimation delay={0.2}>
								<Card className="card-modern-hover">
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="text-sm font-medium text-muted-foreground">
											Total Programs
										</CardTitle>
										<div className="h-10 w-10 rounded-xl bg-warning/20 dark:bg-warning/10 flex items-center justify-center">
											<GraduationCap className="h-5 w-5 text-warning" />
										</div>
									</CardHeader>
									<CardContent>
										<div className="text-3xl font-bold">
											{stats?.totalPrograms?.toLocaleString() || 0}
										</div>
										<p className="text-xs text-muted-foreground mt-1">
											Undergraduate & Graduate
										</p>
									</CardContent>
								</Card>
							</CardAnimation>

							<CardAnimation delay={0.3}>
								<Card className="card-modern-hover">
									<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
										<CardTitle className="text-sm font-medium text-muted-foreground">
											Faculty Members
										</CardTitle>
										<div className="h-10 w-10 rounded-xl bg-destructive/20 dark:bg-destructive/10 flex items-center justify-center">
											<BarChart3 className="h-5 w-5 text-destructive" />
										</div>
									</CardHeader>
									<CardContent>
										<div className="text-3xl font-bold">
											{stats?.facultyMembers?.toLocaleString() || 0}
										</div>
										<p className="text-xs text-muted-foreground mt-1">
											Active teaching staff
										</p>
									</CardContent>
								</Card>
							</CardAnimation>
						</div>

						{/* Recent Activity */}
						<CardAnimation delay={0.4}>
							<Card className="card-modern">
								<CardHeader>
									<div className="flex items-center justify-between">
										<div>
											<CardTitle className="text-section-title">Recent Activity</CardTitle>
											<p className="text-caption mt-1">Latest updates and changes</p>
										</div>
										<Button variant="outline" size="sm" className="rounded-lg">
											View All
										</Button>
									</div>
								</CardHeader>
								<CardContent>
									<div className="space-y-4">
										{[1, 2, 3, 4].map((item) => (
											<div key={item} className="flex items-start gap-4 pb-4 border-b border-border last:border-0 last:pb-0">
												<div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
													<Calendar className="h-4 w-4 text-muted-foreground" />
												</div>
												<div className="flex-1">
													<p className="text-sm font-medium">New exam schedule created</p>
													<p className="text-xs text-muted-foreground mt-1">
														Final semester examination - May 2025
													</p>
												</div>
												<span className="text-xs text-muted-foreground">2h ago</span>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						</CardAnimation>
					</div>
				</PageTransition>
			</SidebarInset>
		</SidebarProvider>
	)
}
