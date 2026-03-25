import { Skeleton } from '@/components/ui/skeleton'

export default function ResultLoading() {
	return (
		<div className="flex flex-1 flex-col gap-4 p-4 pt-0">
			{/* Header */}
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-10 w-40" />
			</div>

			{/* Stats grid */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{[...Array(4)].map((_, i) => (
					<Skeleton key={i} className="h-28 rounded-xl" />
				))}
			</div>

			{/* Charts placeholder */}
			<div className="grid gap-4 md:grid-cols-2">
				<Skeleton className="h-80 rounded-xl" />
				<Skeleton className="h-80 rounded-xl" />
			</div>

			{/* Table */}
			<Skeleton className="h-96 rounded-xl" />
		</div>
	)
}
