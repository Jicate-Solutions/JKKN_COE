"use client"

import { Skeleton } from "@/components/ui/skeleton"

/**
 * Table Loading Skeleton
 *
 * Shows a skeleton loader for data tables
 */
interface TableSkeletonProps {
	rows?: number
	columns?: number
}

export function TableSkeleton({ rows = 5, columns = 6 }: TableSkeletonProps) {
	return (
		<div className="w-full border border-border rounded-2xl overflow-hidden">
			{/* Table Header */}
			<div className="bg-muted/50 border-b border-border p-4">
				<div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
					{Array.from({ length: columns }).map((_, i) => (
						<Skeleton key={i} className="h-4 w-full" />
					))}
				</div>
			</div>

			{/* Table Rows */}
			<div className="divide-y divide-border">
				{Array.from({ length: rows }).map((_, rowIndex) => (
					<div key={rowIndex} className="p-4">
						<div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
							{Array.from({ length: columns }).map((_, colIndex) => (
								<Skeleton key={colIndex} className="h-4 w-full" />
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

/**
 * Card Grid Skeleton
 *
 * Shows skeleton loaders for card grids
 */
interface CardGridSkeletonProps {
	cards?: number
	cols?: 1 | 2 | 3 | 4
}

export function CardGridSkeleton({ cards = 4, cols = 4 }: CardGridSkeletonProps) {
	const gridCols = {
		1: 'grid-cols-1',
		2: 'grid-cols-1 md:grid-cols-2',
		3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
		4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
	}

	return (
		<div className={`grid gap-4 ${gridCols[cols]}`}>
			{Array.from({ length: cards }).map((_, i) => (
				<div key={i} className="bg-card border border-border rounded-2xl p-6">
					<Skeleton className="h-10 w-10 rounded-xl mb-4" />
					<Skeleton className="h-4 w-24 mb-2" />
					<Skeleton className="h-8 w-32" />
				</div>
			))}
		</div>
	)
}

/**
 * Stats Card Skeleton
 */
export function StatsCardSkeleton() {
	return (
		<div className="bg-card border border-border rounded-2xl p-6">
			<div className="flex items-center justify-between">
				<div className="space-y-2 flex-1">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-8 w-32" />
				</div>
				<Skeleton className="h-12 w-12 rounded-xl" />
			</div>
			<div className="mt-4">
				<Skeleton className="h-3 w-full" />
			</div>
		</div>
	)
}

/**
 * Form Skeleton
 */
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
	return (
		<div className="space-y-6">
			{Array.from({ length: fields }).map((_, i) => (
				<div key={i} className="space-y-2">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-10 w-full rounded-lg" />
				</div>
			))}
			<div className="flex gap-3 pt-4">
				<Skeleton className="h-10 w-24 rounded-lg" />
				<Skeleton className="h-10 w-24 rounded-lg" />
			</div>
		</div>
	)
}

/**
 * Page Header Skeleton
 */
export function PageHeaderSkeleton() {
	return (
		<div className="space-y-4">
			<div className="flex items-start justify-between">
				<div className="space-y-2">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-4 w-96" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="h-10 w-24 rounded-lg" />
					<Skeleton className="h-10 w-24 rounded-lg" />
				</div>
			</div>
		</div>
	)
}

/**
 * Full Page Skeleton
 *
 * Complete page loading state
 */
export function FullPageSkeleton() {
	return (
		<div className="p-6 md:p-10 space-y-6">
			{/* Breadcrumb */}
			<Skeleton className="h-4 w-48" />

			{/* Page Header */}
			<PageHeaderSkeleton />

			{/* Stats Cards */}
			<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<StatsCardSkeleton key={i} />
				))}
			</div>

			{/* Table */}
			<TableSkeleton rows={8} columns={6} />
		</div>
	)
}
