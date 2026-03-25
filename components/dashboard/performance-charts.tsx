'use client'

import { useMemo, memo } from 'react'
import {
	AreaChart,
	Area,
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	PieChart,
	Pie,
	Cell,
	Legend,
} from 'recharts'
import { TrendingUp, BarChart3, PieChart as PieChartIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Performance Trends Area Chart ────────────────────────────────────

interface PerformanceTrend {
	session: string
	passRate: number
	avgGpa: number
	totalResults: number
}

interface PerformanceTrendsChartProps {
	data: PerformanceTrend[]
	loading?: boolean
}

const CustomTooltip = ({ active, payload, label }: any) => {
	if (!active || !payload?.length) return null
	return (
		<div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 min-w-[160px]">
			<p className="text-xs font-semibold text-slate-900 dark:text-white mb-2 truncate max-w-[180px]">{label}</p>
			{payload.map((entry: any, index: number) => (
				<div key={index} className="flex items-center justify-between gap-4 text-xs">
					<div className="flex items-center gap-1.5">
						<div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
						<span className="text-slate-500 dark:text-slate-400">{entry.name}</span>
					</div>
					<span className="font-semibold text-slate-900 dark:text-white">
						{entry.name === 'Pass Rate' ? `${entry.value}%` : entry.value}
					</span>
				</div>
			))}
		</div>
	)
}

export const PerformanceTrendsChart = memo(function PerformanceTrendsChart({ data, loading }: PerformanceTrendsChartProps) {
	if (loading) {
		return (
			<div className="glass-card rounded-2xl p-6 h-full animate-pulse">
				<div className="h-6 w-40 bg-white/10 rounded-lg mb-4" />
				<div className="h-[220px] bg-white/5 rounded-xl" />
			</div>
		)
	}

	const hasData = data.length > 0

	return (
		<div className="glass-card rounded-2xl p-6 h-full">
			<div className="flex items-center gap-3 mb-5">
				<div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
					<TrendingUp className="h-4 w-4 text-white" />
				</div>
				<div>
					<h3 className="text-sm font-semibold text-slate-900 dark:text-white">Performance Trends</h3>
					<p className="text-[11px] text-slate-500 dark:text-slate-400">Pass rate & GPA by session</p>
				</div>
			</div>

			{hasData ? (
				<ResponsiveContainer width="100%" height={220}>
					<AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
						<defs>
							<linearGradient id="passRateGradient" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
								<stop offset="100%" stopColor="#34d399" stopOpacity={0} />
							</linearGradient>
							<linearGradient id="gpaGradient" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.3} />
								<stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
							</linearGradient>
						</defs>
						<CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
						<XAxis
							dataKey="session"
							tick={{ fontSize: 10, fill: '#94a3b8' }}
							tickLine={false}
							axisLine={false}
							interval={0}
							angle={-20}
							textAnchor="end"
							height={50}
						/>
						<YAxis
							yAxisId="left"
							tick={{ fontSize: 10, fill: '#94a3b8' }}
							tickLine={false}
							axisLine={false}
							domain={[0, 100]}
							tickFormatter={(v) => `${v}%`}
						/>
						<YAxis
							yAxisId="right"
							orientation="right"
							tick={{ fontSize: 10, fill: '#94a3b8' }}
							tickLine={false}
							axisLine={false}
							domain={[0, 10]}
						/>
						<Tooltip content={<CustomTooltip />} />
						<Area
							yAxisId="left"
							type="monotone"
							dataKey="passRate"
							name="Pass Rate"
							stroke="#34d399"
							strokeWidth={2.5}
							fill="url(#passRateGradient)"
							dot={{ r: 3, fill: '#34d399', stroke: '#fff', strokeWidth: 2 }}
							activeDot={{ r: 5, fill: '#34d399', stroke: '#fff', strokeWidth: 2 }}
						/>
						<Area
							yAxisId="right"
							type="monotone"
							dataKey="avgGpa"
							name="Avg GPA"
							stroke="#2dd4bf"
							strokeWidth={2}
							fill="url(#gpaGradient)"
							strokeDasharray="5 5"
							dot={{ r: 3, fill: '#2dd4bf', stroke: '#fff', strokeWidth: 2 }}
						/>
					</AreaChart>
				</ResponsiveContainer>
			) : (
				<div className="h-[220px] flex items-center justify-center">
					<p className="text-sm text-slate-400 dark:text-slate-500">No performance data available</p>
				</div>
			)}
		</div>
	)
})

// ── Registration & Attendance Bar Chart ──────────────────────────────

interface AttendanceBarChartProps {
	attendanceDetails: {
		total: number
		present: number
		absent: number
	}
	registrations: number
	sessions: number
	loading?: boolean
}

export const AttendanceBarChart = memo(function AttendanceBarChart({ attendanceDetails, registrations, sessions, loading }: AttendanceBarChartProps) {
	if (loading) {
		return (
			<div className="glass-card rounded-2xl p-6 h-full animate-pulse">
				<div className="h-6 w-40 bg-white/10 rounded-lg mb-4" />
				<div className="h-[220px] bg-white/5 rounded-xl" />
			</div>
		)
	}

	const data = useMemo(() => [
		{ name: 'Registered', value: registrations, fill: '#10b981' },
		{ name: 'Present', value: attendanceDetails.present, fill: '#34d399' },
		{ name: 'Absent', value: attendanceDetails.absent, fill: '#f472b6' },
	], [registrations, attendanceDetails.present, attendanceDetails.absent])

	const attendanceRate = useMemo(() => attendanceDetails.total > 0
		? Math.round((attendanceDetails.present / attendanceDetails.total) * 100)
		: 0, [attendanceDetails.total, attendanceDetails.present])

	return (
		<div className="glass-card rounded-2xl p-6 h-full">
			<div className="flex items-center justify-between mb-5">
				<div className="flex items-center gap-3">
					<div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
						<BarChart3 className="h-4 w-4 text-white" />
					</div>
					<div>
						<h3 className="text-sm font-semibold text-slate-900 dark:text-white">Attendance Overview</h3>
						<p className="text-[11px] text-slate-500 dark:text-slate-400">Registration & attendance stats</p>
					</div>
				</div>
				<div className="text-right">
					<span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{attendanceRate}%</span>
					<p className="text-[10px] text-slate-500 dark:text-slate-400">Attendance Rate</p>
				</div>
			</div>

			<ResponsiveContainer width="100%" height={220}>
				<BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
					<CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
					<XAxis
						dataKey="name"
						tick={{ fontSize: 11, fill: '#94a3b8' }}
						tickLine={false}
						axisLine={false}
					/>
					<YAxis
						tick={{ fontSize: 10, fill: '#94a3b8' }}
						tickLine={false}
						axisLine={false}
					/>
					<Tooltip content={<CustomTooltip />} />
					<Bar dataKey="value" name="Count" radius={[8, 8, 0, 0]} maxBarSize={60}>
						{data.map((entry, index) => (
							<Cell key={index} fill={entry.fill} />
						))}
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</div>
	)
})

// ── Grade Distribution Donut Chart ───────────────────────────────────

interface GradeDistributionChartProps {
	data: Array<{ grade: string; count: number }>
	loading?: boolean
}

const GRADE_COLORS: Record<string, string> = {
	'O': '#059669',
	'A+': '#10b981',
	'A': '#34d399',
	'B+': '#14b8a6',
	'B': '#2dd4bf',
	'C': '#5eead4',
	'P': '#fb923c',
	'F': '#ef4444',
	'Ab': '#94a3b8',
	'W': '#64748b',
}

const DonutTooltip = ({ active, payload }: any) => {
	if (!active || !payload?.length) return null
	const data = payload[0]
	return (
		<div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3">
			<div className="flex items-center gap-2">
				<div className="h-3 w-3 rounded-full" style={{ backgroundColor: data.payload.fill }} />
				<span className="text-xs font-semibold text-slate-900 dark:text-white">
					Grade {data.name}: {data.value}
				</span>
			</div>
		</div>
	)
}

export const GradeDistributionChart = memo(function GradeDistributionChart({ data, loading }: GradeDistributionChartProps) {
	const totalGrades = useMemo(() => data.reduce((sum, d) => sum + d.count, 0), [data])

	if (loading) {
		return (
			<div className="glass-card rounded-2xl p-6 h-full animate-pulse">
				<div className="h-6 w-40 bg-white/10 rounded-lg mb-4" />
				<div className="h-[220px] bg-white/5 rounded-xl" />
			</div>
		)
	}

	const chartData = data.map((d) => ({
		name: d.grade,
		value: d.count,
		fill: GRADE_COLORS[d.grade] || '#94a3b8',
	}))

	return (
		<div className="glass-card rounded-2xl p-6 h-full">
			<div className="flex items-center gap-3 mb-5">
				<div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
					<PieChartIcon className="h-4 w-4 text-white" />
				</div>
				<div>
					<h3 className="text-sm font-semibold text-slate-900 dark:text-white">Grade Distribution</h3>
					<p className="text-[11px] text-slate-500 dark:text-slate-400">{totalGrades.toLocaleString()} total grades</p>
				</div>
			</div>

			{chartData.length > 0 ? (
				<ResponsiveContainer width="100%" height={220}>
					<PieChart>
						<Pie
							data={chartData}
							cx="50%"
							cy="50%"
							innerRadius={55}
							outerRadius={85}
							paddingAngle={2}
							dataKey="value"
							stroke="none"
						>
							{chartData.map((entry, index) => (
								<Cell key={index} fill={entry.fill} />
							))}
						</Pie>
						<Tooltip content={<DonutTooltip />} />
						<Legend
							layout="vertical"
							align="right"
							verticalAlign="middle"
							iconType="circle"
							iconSize={8}
							formatter={(value: string) => (
								<span className="text-[11px] text-slate-600 dark:text-slate-400">{value}</span>
							)}
						/>
					</PieChart>
				</ResponsiveContainer>
			) : (
				<div className="h-[220px] flex items-center justify-center">
					<p className="text-sm text-slate-400 dark:text-slate-500">No grade data available</p>
				</div>
			)}
		</div>
	)
})
