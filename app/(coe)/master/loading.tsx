import { Skeleton } from '@/components/ui/skeleton'

export default function MasterLoading() {
	return (
		<div className="flex flex-1 flex-col gap-4 p-4 pt-0">
			{/* Header */}
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-36" />
				<div className="flex gap-2">
					<Skeleton className="h-10 w-28" />
					<Skeleton className="h-10 w-28" />
				</div>
			</div>

			{/* Search and filters */}
			<div className="flex gap-3">
				<Skeleton className="h-10 flex-1 max-w-sm" />
				<Skeleton className="h-10 w-32" />
			</div>

			{/* Table */}
			<div className="rounded-xl border bg-card">
				<div className="p-4 space-y-3">
					<Skeleton className="h-10 w-full" />
					{[...Array(10)].map((_, i) => (
						<Skeleton key={i} className="h-12 w-full" />
					))}
				</div>
			</div>
		</div>
	)
}
