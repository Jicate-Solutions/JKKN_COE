import { Skeleton } from '@/components/ui/skeleton'

export default function UsersLoading() {
	return (
		<div className="flex flex-1 flex-col gap-4 p-4 pt-0">
			{/* Header */}
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-40" />
				<div className="flex gap-2">
					<Skeleton className="h-10 w-24" />
					<Skeleton className="h-10 w-32" />
				</div>
			</div>

			{/* Filters */}
			<div className="flex flex-wrap gap-3">
				{[...Array(5)].map((_, i) => (
					<Skeleton key={i} className="h-10 w-40" />
				))}
			</div>

			{/* Table */}
			<div className="rounded-xl border bg-card">
				<div className="p-4 space-y-3">
					<Skeleton className="h-10 w-full" />
					{[...Array(10)].map((_, i) => (
						<Skeleton key={i} className="h-14 w-full" />
					))}
				</div>
			</div>

			{/* Pagination */}
			<div className="flex justify-between items-center">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="h-10 w-64" />
			</div>
		</div>
	)
}
