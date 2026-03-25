import { Skeleton } from '@/components/ui/skeleton'

export default function ExamManagementLoading() {
	return (
		<div className="flex flex-1 flex-col gap-4 p-4 pt-0">
			{/* Header */}
			<div className="flex items-center justify-between">
				<Skeleton className="h-8 w-52" />
				<Skeleton className="h-10 w-32" />
			</div>

			{/* Filters */}
			<div className="flex flex-wrap gap-3">
				{[...Array(3)].map((_, i) => (
					<Skeleton key={i} className="h-10 w-40" />
				))}
			</div>

			{/* Content */}
			<div className="rounded-xl border bg-card p-4">
				<div className="space-y-3">
					<Skeleton className="h-10 w-full" />
					{[...Array(8)].map((_, i) => (
						<Skeleton key={i} className="h-14 w-full" />
					))}
				</div>
			</div>
		</div>
	)
}
