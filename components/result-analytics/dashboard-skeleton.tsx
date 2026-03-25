"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Skeleton for stat cards grid
export function StatCardsGridSkeleton({ count = 6 }: { count?: number }) {
	return (
		<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
			{Array.from({ length: count }).map((_, i) => (
				<Card key={i} className="relative overflow-hidden">
					<div className="absolute top-0 right-0 w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full -mr-8 -mt-8" />
					<CardContent className="p-4 relative">
						<div className="flex items-start justify-between">
							<div className="flex-1">
								<Skeleton className="h-3 w-24 mb-2" />
								<Skeleton className="h-8 w-20 mb-2" />
								<Skeleton className="h-2 w-16" />
							</div>
							<Skeleton className="h-12 w-12 rounded-xl" />
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	)
}

// Skeleton for chart cards
export function ChartCardSkeleton({ height = 280 }: { height?: number }) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-4 rounded" />
					<Skeleton className="h-4 w-40" />
				</div>
			</CardHeader>
			<CardContent>
				<div
					style={{ height }}
					className="flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 rounded-lg"
				>
					<div className="flex flex-col items-center gap-2 text-slate-400">
						<Skeleton className="h-32 w-32 rounded-full" />
						<Skeleton className="h-3 w-24" />
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

// Skeleton for two-column chart layout
export function ChartGridSkeleton() {
	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<ChartCardSkeleton />
			<ChartCardSkeleton />
		</div>
	)
}

// Skeleton for data tables
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Skeleton className="h-8 w-8 rounded-lg" />
						<div>
							<Skeleton className="h-4 w-32 mb-1" />
							<Skeleton className="h-3 w-48" />
						</div>
					</div>
					<Skeleton className="h-6 w-20 rounded-full" />
				</div>
			</CardHeader>
			<CardContent className="p-0">
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="bg-slate-50 dark:bg-slate-800/50 border-b">
								{Array.from({ length: 7 }).map((_, i) => (
									<th key={i} className="py-3 px-4">
										<Skeleton className="h-3 w-16" />
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{Array.from({ length: rows }).map((_, rowIndex) => (
								<tr key={rowIndex} className="border-b border-slate-100 dark:border-slate-800">
									{Array.from({ length: 7 }).map((_, colIndex) => (
										<td key={colIndex} className="py-3 px-4">
											<Skeleton className={`h-4 ${colIndex === 0 ? 'w-24' : 'w-16'}`} />
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	)
}

// Skeleton for insights panel
export function InsightsPanelSkeleton() {
	return (
		<Card className="border-indigo-200/50 dark:border-indigo-800/50">
			<CardHeader className="pb-3">
				<div className="flex items-center gap-2">
					<Skeleton className="h-8 w-8 rounded-lg" />
					<div>
						<Skeleton className="h-4 w-48 mb-1" />
						<Skeleton className="h-3 w-32" />
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							key={i}
							className="p-3 rounded-lg border border-slate-200 dark:border-slate-700"
						>
							<div className="flex items-start gap-2 mb-2">
								<Skeleton className="h-5 w-5 rounded" />
								<Skeleton className="h-4 w-32" />
							</div>
							<Skeleton className="h-3 w-full mb-1" />
							<Skeleton className="h-3 w-3/4" />
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	)
}

// Full dashboard skeleton
export function DashboardSkeleton() {
	return (
		<div className="space-y-4">
			{/* KPI Cards */}
			<StatCardsGridSkeleton count={6} />

			{/* Insights Panel */}
			<InsightsPanelSkeleton />

			{/* Data Quality Row */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Skeleton className="h-5 w-5 rounded" />
								<Skeleton className="h-5 w-40" />
							</div>
							<Skeleton className="h-6 w-24 rounded-full" />
						</div>
						<Skeleton className="h-3 w-48 mt-1" />
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-3 gap-3">
							{Array.from({ length: 3 }).map((_, i) => (
								<div key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
									<Skeleton className="h-3 w-20 mb-2" />
									<Skeleton className="h-5 w-12 mb-2" />
									<Skeleton className="h-1.5 w-full" />
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-6 w-6 rounded" />
						</div>
					</CardHeader>
					<CardContent className="space-y-3">
						{Array.from({ length: 4 }).map((_, i) => (
							<div key={i} className="flex items-center gap-3">
								<Skeleton className="h-8 w-24" />
								<Skeleton className="h-5 flex-1" />
							</div>
						))}
					</CardContent>
				</Card>
			</div>

			{/* Charts */}
			<ChartGridSkeleton />

			{/* Top Performers Table */}
			<TableSkeleton rows={5} />
		</div>
	)
}

// NAAC/NAAD specific skeleton
export function ComplianceDashboardSkeleton() {
	return (
		<div className="space-y-4">
			{/* Header Card */}
			<Card className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-violet-600">
				<CardContent className="p-6">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-4">
							<Skeleton className="h-16 w-16 rounded-2xl bg-white/20" />
							<div>
								<Skeleton className="h-5 w-32 mb-2 bg-white/30" />
								<Skeleton className="h-7 w-64 mb-1 bg-white/30" />
								<Skeleton className="h-4 w-48 bg-white/20" />
							</div>
						</div>
						<div className="text-right">
							<Skeleton className="h-4 w-24 mb-1 bg-white/20" />
							<Skeleton className="h-10 w-20 bg-white/30" />
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Metrics Grid */}
			<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
				{Array.from({ length: 6 }).map((_, i) => (
					<Card key={i}>
						<CardContent className="p-4">
							<Skeleton className="h-3 w-20 mb-2" />
							<Skeleton className="h-7 w-16 mb-2" />
							<Skeleton className="h-1.5 w-full" />
						</CardContent>
					</Card>
				))}
			</div>

			{/* Compliance Breakdown */}
			<Card>
				<CardHeader className="pb-2">
					<Skeleton className="h-5 w-40" />
				</CardHeader>
				<CardContent className="space-y-4">
					{Array.from({ length: 3 }).map((_, i) => (
						<div key={i}>
							<div className="flex justify-between mb-1">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-4 w-12" />
							</div>
							<Skeleton className="h-2 w-full" />
						</div>
					))}
				</CardContent>
			</Card>

			{/* Table */}
			<TableSkeleton rows={5} />
		</div>
	)
}
