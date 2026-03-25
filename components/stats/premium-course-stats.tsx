import { Card, CardContent } from "@/components/ui/card"
import { BookText, CheckCircle, XCircle, TrendingUp, LucideIcon } from "lucide-react"

interface Course {
	id: string
	course_code: string
	course_title: string
	is_active: boolean
	created_at: string
	[key: string]: any
}

interface StatConfig {
	label: string
	value: number
	icon: LucideIcon
	iconBg: string
	iconColor: string
	valueColor: string
}

interface PremiumCourseStatsProps {
	items: Course[]
	loading?: boolean
}

export function PremiumCourseStats({ items = [], loading = false }: PremiumCourseStatsProps) {
	// Calculate statistics
	const total = items.length
	const active = items.filter((i) => i.is_active).length
	const inactive = items.filter((i) => !i.is_active).length
	const newThisMonth = items.filter((i) => {
		const itemDate = new Date(i.created_at)
		const currentDate = new Date()
		return (
			itemDate.getMonth() === currentDate.getMonth() &&
			itemDate.getFullYear() === currentDate.getFullYear()
		)
	}).length

	// Define stat configurations
	const stats: StatConfig[] = [
		{
			label: "Total Courses",
			value: total,
			icon: BookText,
			iconBg: "bg-blue-50 dark:bg-blue-900/20",
			iconColor: "text-blue-600 dark:text-blue-400",
			valueColor: "text-slate-900 dark:text-slate-100",
		},
		{
			label: "Active",
			value: active,
			icon: CheckCircle,
			iconBg: "bg-emerald-50 dark:bg-emerald-900/20",
			iconColor: "text-emerald-600 dark:text-emerald-400",
			valueColor: "text-emerald-600 dark:text-emerald-400",
		},
		{
			label: "Inactive",
			value: inactive,
			icon: XCircle,
			iconBg: "bg-red-50 dark:bg-red-900/20",
			iconColor: "text-red-600 dark:text-red-400",
			valueColor: "text-red-600 dark:text-red-400",
		},
		{
			label: "New This Month",
			value: newThisMonth,
			icon: TrendingUp,
			iconBg: "bg-purple-50 dark:bg-purple-900/20",
			iconColor: "text-purple-600 dark:text-purple-400",
			valueColor: "text-purple-600 dark:text-purple-400",
		},
	]

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			{stats.map((stat, index) => (
				<div key={index} className="card-premium-hover p-2">
					<Card>
						<CardContent className="p-3">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm text-slate-600 dark:text-slate-400">
										{stat.label}
									</p>
									{loading ? (
										<div className="h-9 w-20 bg-slate-200 dark:bg-slate-700 animate-pulse rounded mt-1" />
									) : (
										<p
											className={`text-3xl font-bold mt-1 font-grotesk ${stat.valueColor}`}
											aria-label={`${stat.label}: ${stat.value}`}
										>
											{stat.value}
										</p>
									)}
								</div>
								<div
									className={`h-12 w-12 rounded-xl flex items-center justify-center ${stat.iconBg}`}
									aria-hidden="true"
								>
									<stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			))}
		</div>
	)
}
