import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
	return (
		<div className="flex flex-1 flex-col gap-4 p-4 pt-0">
			{/* Header skeleton */}
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-10 w-32" />
			</div>

			{/* Stats cards skeleton */}
			<div className="grid auto-rows-min gap-4 md:grid-cols-4">
				{[...Array(4)].map((_, i) => (
					<Skeleton key={i} className="h-24 rounded-xl" />
				))}
			</div>

			{/* Table skeleton */}
			<div className="min-h-[50vh] flex-1 rounded-xl border bg-muted/50 p-4">
				<div className="space-y-3">
					<Skeleton className="h-10 w-full" />
					{[...Array(8)].map((_, i) => (
						<Skeleton key={i} className="h-12 w-full" />
					))}
				</div>
			</div>
		</div>
	)
}
