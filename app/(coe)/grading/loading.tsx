import { Skeleton } from '@/components/ui/skeleton'

export default function GradingLoading() {
	return (
		<div className="flex flex-1 flex-col gap-4 p-4 pt-0">
			{/* Header */}
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-44" />
				<Skeleton className="h-10 w-36" />
			</div>

			{/* Filters row */}
			<div className="flex flex-wrap gap-3">
				{[...Array(4)].map((_, i) => (
					<Skeleton key={i} className="h-10 w-44" />
				))}
			</div>

			{/* Content area */}
			<div className="rounded-xl border bg-card p-4">
				<div className="space-y-4">
					<Skeleton className="h-10 w-full" />
					{[...Array(8)].map((_, i) => (
						<Skeleton key={i} className="h-12 w-full" />
					))}
				</div>
			</div>
		</div>
	)
}
