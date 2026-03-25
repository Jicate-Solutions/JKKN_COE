'use client'

import { Card, CardContent } from '@/components/ui/card'
import { ClipboardList, FileUp, CheckCircle } from 'lucide-react'
import type { ExternalMark } from '@/types/external-marks'

interface ExternalMarksScorecardsProps {
	items: ExternalMark[]
	selectedCount: number
}

export function ExternalMarksScorecards({
	items,
	selectedCount
}: ExternalMarksScorecardsProps) {
	const draftCount = items.filter(i => i.entry_status === 'Draft').length
	const submittedCount = items.filter(i => i.entry_status === 'Submitted').length

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
			<Card>
				<CardContent className="p-3">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-xs font-medium text-muted-foreground">Total Records</p>
							<p className="text-xl font-bold font-grotesk mt-1">{items.length}</p>
						</div>
						<div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
							<ClipboardList className="h-3 w-3 text-blue-600 dark:text-blue-400" />
						</div>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardContent className="p-3">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-xs font-medium text-muted-foreground">Draft</p>
							<p className="text-xl font-bold text-yellow-600 font-grotesk mt-1">
								{draftCount}
							</p>
						</div>
						<div className="h-7 w-7 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
							<FileUp className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
						</div>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardContent className="p-3">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-xs font-medium text-muted-foreground">Submitted</p>
							<p className="text-xl font-bold text-green-600 font-grotesk mt-1">
								{submittedCount}
							</p>
						</div>
						<div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
							<CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
						</div>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardContent className="p-3">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-xs font-medium text-muted-foreground">Selected</p>
							<p className="text-xl font-bold text-purple-600 font-grotesk mt-1">{selectedCount}</p>
						</div>
						<div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
							<CheckCircle className="h-3 w-3 text-purple-600 dark:text-purple-400" />
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
