'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useAuth } from '@/context/auth-context'
import { PenTool, RefreshCw, Eye } from 'lucide-react'
import type { RevaluationRegistration } from '@/types/revaluation'
import RevaluationStatusBadge from './revaluation-status-badge'

export default function MarksEntryTab() {
	const { toast } = useToast()
	const { hasPermission } = useAuth()
	const { filter, isReady, appendToUrl } = useInstitutionFilter()

	const [revaluations, setRevaluations] = useState<RevaluationRegistration[]>([])
	const [loading, setLoading] = useState(false)

	const canEnterMarks = hasPermission('revaluation_marks:create')

	useEffect(() => {
		if (isReady) {
			fetchAssignedRevaluations()
		}
	}, [isReady, filter])

	const fetchAssignedRevaluations = async () => {
		setLoading(true)
		try {
			const url = appendToUrl('/api/revaluation/registrations?status=Assigned,In Progress')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to fetch revaluations')

			const data = await response.json()
			setRevaluations(data)
		} catch (error) {
			console.error('Fetch error:', error)
			toast({
				title: '❌ Failed to fetch revaluations',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="space-y-4">
			{/* Info Banner */}
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
				<h3 className="font-medium text-blue-900 mb-1">Blind Evaluation Mode</h3>
				<p className="text-sm text-blue-700">
					During revaluation marks entry, the examiner cannot see the original marks or previous
					revaluation marks. This ensures unbiased evaluation.
				</p>
			</div>

			{/* Toolbar */}
			<div className="flex justify-end">
				<Button onClick={fetchAssignedRevaluations} variant="outline" disabled={loading}>
					<RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
					Refresh
				</Button>
			</div>

			{/* Revaluations Table */}
			<div className="border rounded-lg overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow className="bg-gray-50">
							<TableHead>Dummy Number</TableHead>
							<TableHead>Course</TableHead>
							<TableHead>Attempt</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Deadline</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={6} className="text-center py-8">
									<div className="flex items-center justify-center gap-2">
										<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
										<span className="text-sm text-gray-600">Loading...</span>
									</div>
								</TableCell>
							</TableRow>
						) : revaluations.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6} className="text-center py-8 text-gray-500">
									No revaluations assigned for marks entry
								</TableCell>
							</TableRow>
						) : (
							revaluations.map((reval) => (
								<TableRow key={reval.id} className="hover:bg-gray-50">
									<TableCell>
										<Badge variant="outline" className="font-mono">
											{reval.id.slice(0, 8).toUpperCase()}
										</Badge>
									</TableCell>
									<TableCell>
										<div>
											<div className="font-medium">{reval.course_code}</div>
											<div className="text-sm text-gray-500 max-w-[200px] truncate">
												{reval.course_title}
											</div>
										</div>
									</TableCell>
									<TableCell>
										<Badge variant="outline">Attempt {reval.attempt_number}</Badge>
									</TableCell>
									<TableCell>
										<RevaluationStatusBadge status={reval.status} />
									</TableCell>
									<TableCell>
										{reval.evaluation_deadline ? (
											<div className="text-sm">
												<div>{new Date(reval.evaluation_deadline).toLocaleDateString()}</div>
												<div className="text-xs text-gray-500">
													{Math.ceil(
														(new Date(reval.evaluation_deadline).getTime() - new Date().getTime()) /
															(1000 * 60 * 60 * 24)
													)}{' '}
													days left
												</div>
											</div>
										) : (
											<span className="text-gray-400">-</span>
										)}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex items-center justify-end gap-1">
											{canEnterMarks && reval.status === 'Assigned' && (
												<Button size="sm" className="bg-blue-600 hover:bg-blue-700">
													<PenTool className="h-4 w-4 mr-1" />
													Enter Marks
												</Button>
											)}
											{reval.status === 'In Progress' && (
												<Button size="sm" variant="outline">
													<Eye className="h-4 w-4 mr-1" />
													View Draft
												</Button>
											)}
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Stats */}
			<div className="text-sm text-gray-600 px-2">
				Showing <span className="font-medium text-gray-900">{revaluations.length}</span>{' '}
				revaluation(s)
				{revaluations.length > 0 && (
					<span className="ml-4">
						Assigned:{' '}
						<span className="font-medium text-blue-600">
							{revaluations.filter((r) => r.status === 'Assigned').length}
						</span>
						, In Progress:{' '}
						<span className="font-medium text-cyan-600">
							{revaluations.filter((r) => r.status === 'In Progress').length}
						</span>
					</span>
				)}
			</div>
		</div>
	)
}
