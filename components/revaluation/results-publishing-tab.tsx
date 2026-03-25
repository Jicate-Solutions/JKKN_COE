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
import { CheckCircle, RefreshCw, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import type { RevaluationComparisonData } from '@/types/revaluation'
import RevaluationStatusBadge from './revaluation-status-badge'

export default function ResultsPublishingTab() {
	const { toast } = useToast()
	const { hasPermission } = useAuth()
	const { filter, isReady, appendToUrl } = useInstitutionFilter()

	const [comparisonData, setComparisonData] = useState<any[]>([])
	const [loading, setLoading] = useState(false)
	const [selections, setSelections] = useState<Map<string, boolean>>(new Map())

	const canPublish = hasPermission('revaluation:publish')

	useEffect(() => {
		if (isReady) {
			fetchComparisonData()
		}
	}, [isReady, filter])

	const fetchComparisonData = async () => {
		setLoading(true)
		try {
			const url = appendToUrl('/api/revaluation/reports/comparison?status=Verified')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to fetch comparison data')

			const result = await response.json()
			setComparisonData(result.data || [])
		} catch (error) {
			console.error('Fetch error:', error)
			toast({
				title: '❌ Failed to fetch comparison data',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	const handleToggleSelection = (revaluationId: string, useRevaluation: boolean) => {
		setSelections((prev) => {
			const newMap = new Map(prev)
			newMap.set(revaluationId, useRevaluation)
			return newMap
		})
	}

	const handlePublish = async () => {
		if (selections.size === 0) {
			toast({
				title: '⚠️ No Selections',
				description: 'Please select which marks to use for at least one revaluation',
				variant: 'destructive',
			})
			return
		}

		const publishSelections = Array.from(selections.entries())
			.map(([revaluationId, useRevaluation]) => {
				const data = comparisonData.find((c) => c.revaluation_registration_id === revaluationId)
				return data
					? {
							revaluation_registration_id: revaluationId,
							revaluation_final_marks_id: data.final_marks_id,
							use_revaluation_marks: useRevaluation,
						}
					: null
			})
			.filter(Boolean)

		setLoading(true)
		try {
			const response = await fetch('/api/revaluation/publish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					selections: publishSelections,
					published_by_user_id: 'current-user-id', // TODO: Get from auth context
				}),
			})

			const result = await response.json()

			if (!response.ok) {
				throw new Error(result.error || 'Failed to publish results')
			}

			toast({
				title: '✅ Results Published',
				description: result.message || `Published ${result.data.length} result(s)`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			setSelections(new Map())
			fetchComparisonData()
		} catch (error) {
			console.error('Publish error:', error)
			toast({
				title: '❌ Failed to publish',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	const getMarksDifferenceIcon = (difference: number | null) => {
		if (!difference) return <Minus className="h-4 w-4 text-gray-400" />
		if (difference > 0) return <ArrowUp className="h-4 w-4 text-green-600" />
		if (difference < 0) return <ArrowDown className="h-4 w-4 text-red-600" />
		return <Minus className="h-4 w-4 text-gray-400" />
	}

	return (
		<div className="space-y-4">
			{/* Info Banner */}
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
				<h3 className="font-medium text-blue-900 mb-1">Result Publishing Decision</h3>
				<p className="text-sm text-blue-700">
					Review the comparison between original and revaluation marks. The system provides a
					recommendation, but you have the final decision on which marks to use.
				</p>
			</div>

			{/* Toolbar */}
			<div className="flex justify-between items-center">
				<div className="text-sm text-gray-600">
					Selected: <span className="font-medium text-blue-600">{selections.size}</span> /{' '}
					{comparisonData.length}
				</div>
				<div className="flex gap-2">
					<Button onClick={fetchComparisonData} variant="outline" disabled={loading}>
						<RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
						Refresh
					</Button>
					{canPublish && (
						<Button
							onClick={handlePublish}
							disabled={loading || selections.size === 0}
							className="bg-green-600 hover:bg-green-700"
						>
							<CheckCircle className="h-4 w-4 mr-2" />
							Publish Selected
						</Button>
					)}
				</div>
			</div>

			{/* Comparison Table */}
			<div className="border rounded-lg overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow className="bg-gray-50">
							<TableHead>Student & Course</TableHead>
							<TableHead>Attempt</TableHead>
							<TableHead className="text-center">Original</TableHead>
							<TableHead className="text-center">Revaluation</TableHead>
							<TableHead className="text-center">Difference</TableHead>
							<TableHead className="text-center">Recommendation</TableHead>
							<TableHead className="text-center">Your Decision</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={7} className="text-center py-8">
									<div className="flex items-center justify-center gap-2">
										<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
										<span className="text-sm text-gray-600">Loading...</span>
									</div>
								</TableCell>
							</TableRow>
						) : comparisonData.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="text-center py-8 text-gray-500">
									No verified revaluations pending publication
								</TableCell>
							</TableRow>
						) : (
							comparisonData.map((data) => (
								<TableRow key={data.revaluation_registration_id} className="hover:bg-gray-50">
									<TableCell>
										<div>
											<div className="font-medium">{data.student_name}</div>
											<div className="text-sm text-gray-500">{data.student_register_number}</div>
											<div className="text-sm font-medium mt-1">{data.course_code}</div>
										</div>
									</TableCell>
									<TableCell>
										<Badge variant="outline">Attempt {data.attempt_number}</Badge>
									</TableCell>
									<TableCell className="text-center">
										<div>
											<div className="font-medium">{data.original?.marks || '-'}</div>
											<div className="text-sm text-gray-500">
												{data.original?.percentage?.toFixed(2) || '-'}%
											</div>
											<Badge variant="outline" className="mt-1">
												{data.original?.grade || '-'}
											</Badge>
										</div>
									</TableCell>
									<TableCell className="text-center">
										<div>
											<div className="font-medium">{data.revaluation?.marks || '-'}</div>
											<div className="text-sm text-gray-500">
												{data.revaluation?.percentage?.toFixed(2) || '-'}%
											</div>
											<Badge variant="outline" className="mt-1">
												{data.revaluation?.grade || '-'}
											</Badge>
										</div>
									</TableCell>
									<TableCell className="text-center">
										<div className="flex items-center justify-center gap-1">
											{getMarksDifferenceIcon(data.comparison?.marks_difference)}
											<span
												className={`font-medium ${
													data.comparison?.marks_difference > 0
														? 'text-green-600'
														: data.comparison?.marks_difference < 0
															? 'text-red-600'
															: 'text-gray-600'
												}`}
											>
												{data.comparison?.marks_difference > 0 && '+'}
												{data.comparison?.marks_difference || 0}
											</span>
										</div>
										{data.comparison?.grade_changed && (
											<Badge variant="outline" className="mt-1 text-xs">
												Grade Changed
											</Badge>
										)}
									</TableCell>
									<TableCell className="text-center">
										{data.comparison?.recommended_use_revaluation ? (
											<Badge className="bg-green-100 text-green-800 border-green-300">
												Use Revaluation
											</Badge>
										) : (
											<Badge variant="outline">Keep Original</Badge>
										)}
									</TableCell>
									<TableCell className="text-center">
										<div className="flex gap-2 justify-center">
											<Button
												size="sm"
												variant={selections.get(data.revaluation_registration_id) === false ? 'default' : 'outline'}
												onClick={() => handleToggleSelection(data.revaluation_registration_id, false)}
												disabled={!canPublish}
											>
												Original
											</Button>
											<Button
												size="sm"
												variant={selections.get(data.revaluation_registration_id) === true ? 'default' : 'outline'}
												onClick={() => handleToggleSelection(data.revaluation_registration_id, true)}
												disabled={!canPublish}
												className={
													selections.get(data.revaluation_registration_id) === true
														? 'bg-blue-600 hover:bg-blue-700'
														: ''
												}
											>
												Revaluation
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Summary Stats */}
			{comparisonData.length > 0 && (
				<div className="grid grid-cols-4 gap-4 px-2">
					<div className="text-sm">
						<span className="text-gray-600">Total: </span>
						<span className="font-medium text-gray-900">{comparisonData.length}</span>
					</div>
					<div className="text-sm">
						<span className="text-gray-600">Improvements: </span>
						<span className="font-medium text-green-600">
							{comparisonData.filter((c) => c.comparison?.is_improvement).length}
						</span>
					</div>
					<div className="text-sm">
						<span className="text-gray-600">Grade Changes: </span>
						<span className="font-medium text-blue-600">
							{comparisonData.filter((c) => c.comparison?.grade_changed).length}
						</span>
					</div>
					<div className="text-sm">
						<span className="text-gray-600">Pass Status Changes: </span>
						<span className="font-medium text-purple-600">
							{comparisonData.filter((c) => c.comparison?.pass_status_changed).length}
						</span>
					</div>
				</div>
			)}
		</div>
	)
}
