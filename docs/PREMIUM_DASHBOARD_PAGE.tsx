"use client"

/**
 * PREMIUM DASHBOARD PAGE - Production Ready
 *
 * Copy this to: app/coe/dashboard/page.tsx
 *
 * Features:
 * - Emerald accent (#059669)
 * - Space Grotesk headings + Inter body
 * - Exact spacing (4px grid)
 * - Premium cards with hover effects
 * - Zebra-striped tables
 * - Soft shadows
 * - Full dark mode support
 */

import { useEffect, useState } from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { PremiumSidebar } from "@/components/layout/premium-sidebar"
import { PremiumNavbar } from "@/components/layout/premium-navbar"
import { ModernBreadcrumb } from "@/components/common/modern-breadcrumb"
import { PageTransition, CardAnimation } from "@/components/common/page-transition"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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

// Navigation data
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
]

interface DashboardStats {
	totalStudents: number
	activeCourses: number
	totalPrograms: number
	facultyMembers: number
}

export default function PremiumDashboardPage() {
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

	return (
		<SidebarProvider>
			<PremiumSidebar navItems={navData} />
			<SidebarInset>
				<PremiumNavbar
					title="Dashboard"
					description="Welcome back! Here's an overview of your examination system."
					showSearch={true}
				/>

				<PageTransition>
					<div className="flex flex-1 flex-col gap-6 p-6 md:p-10">
						{/* Breadcrumb */}
						<ModernBreadcrumb
							items={[
								{ label: "Dashboard", current: true }
							]}
						/>

						{/* Stats Cards - Premium Design */}
						<div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
							{/* Total Students */}
							<CardAnimation delay={0}>
								<div className="card-premium-hover p-6">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-sm text-slate-600 dark:text-slate-400">Total Students</p>
											<p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
												{stats?.totalStudents?.toLocaleString() || 0}
											</p>
										</div>
										<div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
											<Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
										</div>
									</div>
									<p className="text-xs text-slate-500 dark:text-slate-400 mt-4 flex items-center gap-1">
										<TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
										<span className="text-emerald-600 dark:text-emerald-400 font-medium">+12%</span> from last month
									</p>
								</div>
							</CardAnimation>

							{/* Active Courses */}
							<CardAnimation delay={0.1}>
								<div className="card-premium-hover p-6">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-sm text-slate-600 dark:text-slate-400">Active Courses</p>
											<p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
												{stats?.activeCourses?.toLocaleString() || 0}
											</p>
										</div>
										<div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
											<BookOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
										</div>
									</div>
									<p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
										Across all programs
									</p>
								</div>
							</CardAnimation>

							{/* Total Programs */}
							<CardAnimation delay={0.2}>
								<div className="card-premium-hover p-6">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-sm text-slate-600 dark:text-slate-400">Total Programs</p>
											<p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
												{stats?.totalPrograms?.toLocaleString() || 0}
											</p>
										</div>
										<div className="h-12 w-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
											<GraduationCap className="h-6 w-6 text-amber-600 dark:text-amber-400" />
										</div>
									</div>
									<p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
										Undergraduate & Graduate
									</p>
								</div>
							</CardAnimation>

							{/* Faculty Members */}
							<CardAnimation delay={0.3}>
								<div className="card-premium-hover p-6">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-sm text-slate-600 dark:text-slate-400">Faculty Members</p>
											<p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
												{stats?.facultyMembers?.toLocaleString() || 0}
											</p>
										</div>
										<div className="h-12 w-12 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
											<BarChart3 className="h-6 w-6 text-red-600 dark:text-red-400" />
										</div>
									</div>
									<p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
										Active teaching staff
									</p>
								</div>
							</CardAnimation>
						</div>

						{/* Recent Activity - Premium Table */}
						<CardAnimation delay={0.4}>
							<div className="card-premium overflow-hidden">
								<div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800">
									<div className="flex items-center justify-between">
										<div>
											<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Activity</h3>
											<p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Latest updates and changes</p>
										</div>
										<Button
											variant="outline"
											size="sm"
											className="rounded-lg border-slate-300 dark:border-slate-700"
										>
											View All
										</Button>
									</div>
								</div>

								<table className="table-premium">
									<thead>
										<tr>
											<th>Event</th>
											<th>Details</th>
											<th>Time</th>
											<th>Status</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td className="font-medium">Exam Schedule Created</td>
											<td className="text-slate-600 dark:text-slate-400">Final semester examination - May 2025</td>
											<td className="text-slate-500 dark:text-slate-400">2h ago</td>
											<td>
												<span className="pill-success">Completed</span>
											</td>
										</tr>
										<tr>
											<td className="font-medium">Student Registration</td>
											<td className="text-slate-600 dark:text-slate-400">125 new registrations processed</td>
											<td className="text-slate-500 dark:text-slate-400">4h ago</td>
											<td>
												<span className="pill-success">Completed</span>
											</td>
										</tr>
										<tr>
											<td className="font-medium">Grade Submission</td>
											<td className="text-slate-600 dark:text-slate-400">Mid-term grades pending approval</td>
											<td className="text-slate-500 dark:text-slate-400">1d ago</td>
											<td>
												<span className="pill-warning">Pending</span>
											</td>
										</tr>
										<tr>
											<td className="font-medium">Course Mapping</td>
											<td className="text-slate-600 dark:text-slate-400">Updated course structure for 2025</td>
											<td className="text-slate-500 dark:text-slate-400">2d ago</td>
											<td>
												<span className="pill-success">Completed</span>
											</td>
										</tr>
									</tbody>
								</table>
							</div>
						</CardAnimation>
					</div>
				</PageTransition>
			</SidebarInset>
		</SidebarProvider>
	)
}
