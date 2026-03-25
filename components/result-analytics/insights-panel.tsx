"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
	Lightbulb,
	TrendingUp,
	TrendingDown,
	AlertTriangle,
	CheckCircle2,
	ArrowRight,
	Target,
	Users,
	BookOpen,
	Award,
	ChevronRight,
	Sparkles
} from "lucide-react"

export interface Insight {
	id: string
	type: 'success' | 'warning' | 'danger' | 'info' | 'trend'
	category: 'performance' | 'pattern' | 'anomaly' | 'recommendation' | 'trend'
	title: string
	description: string
	metric?: {
		label: string
		value: number | string
		unit?: string
		change?: number
		changeType?: 'increase' | 'decrease' | 'stable'
	}
	recommendation?: string
	affectedEntity?: {
		type: 'program' | 'subject' | 'batch' | 'student' | 'institution'
		name: string
		id: string
	}
	priority: 'high' | 'medium' | 'low'
	actionable: boolean
}

interface InsightsPanelProps {
	insights: Insight[]
	title?: string
	maxInsights?: number
	onViewDetails?: (insight: Insight) => void
	onTakeAction?: (insight: Insight) => void
}

export function InsightsPanel({
	insights,
	title = "Key Insights & Recommendations",
	maxInsights = 6,
	onViewDetails,
	onTakeAction
}: InsightsPanelProps) {
	const sortedInsights = [...insights]
		.sort((a, b) => {
			const priorityOrder = { high: 0, medium: 1, low: 2 }
			return priorityOrder[a.priority] - priorityOrder[b.priority]
		})
		.slice(0, maxInsights)

	const getTypeIcon = (type: Insight['type']) => {
		switch (type) {
			case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />
			case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />
			case 'danger': return <AlertTriangle className="h-4 w-4 text-red-500" />
			case 'trend': return <TrendingUp className="h-4 w-4 text-blue-500" />
			case 'info': return <Lightbulb className="h-4 w-4 text-purple-500" />
		}
	}

	const getTypeStyles = (type: Insight['type']) => {
		switch (type) {
			case 'success': return 'border-l-green-500 bg-green-50/50 dark:bg-green-900/10'
			case 'warning': return 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10'
			case 'danger': return 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10'
			case 'trend': return 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
			case 'info': return 'border-l-purple-500 bg-purple-50/50 dark:bg-purple-900/10'
		}
	}

	const getCategoryIcon = (category: Insight['category']) => {
		switch (category) {
			case 'performance': return <Target className="h-3 w-3" />
			case 'pattern': return <Sparkles className="h-3 w-3" />
			case 'anomaly': return <AlertTriangle className="h-3 w-3" />
			case 'recommendation': return <Lightbulb className="h-3 w-3" />
			case 'trend': return <TrendingUp className="h-3 w-3" />
		}
	}

	const getPriorityBadge = (priority: Insight['priority']) => {
		switch (priority) {
			case 'high':
				return <Badge variant="destructive" className="text-xs">High Priority</Badge>
			case 'medium':
				return <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Medium</Badge>
			case 'low':
				return <Badge variant="outline" className="text-xs">Low</Badge>
		}
	}

	const highPriorityCount = insights.filter(i => i.priority === 'high').length
	const actionableCount = insights.filter(i => i.actionable).length

	return (
		<Card className="border-slate-200 dark:border-slate-800">
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Lightbulb className="h-5 w-5 text-amber-500" />
						<CardTitle className="text-base font-semibold">{title}</CardTitle>
					</div>
					<div className="flex items-center gap-2">
						{highPriorityCount > 0 && (
							<Badge variant="destructive" className="text-xs">
								{highPriorityCount} Critical
							</Badge>
						)}
						<Badge variant="outline" className="text-xs">
							{actionableCount} Actionable
						</Badge>
					</div>
				</div>
				<CardDescription className="text-xs">
					AI-generated insights based on result analysis patterns and statistical anomalies
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{sortedInsights.length === 0 ? (
					<div className="text-center py-8 text-slate-500">
						<Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
						<p className="text-sm">No insights available yet</p>
						<p className="text-xs">Apply filters and load data to generate insights</p>
					</div>
				) : (
					sortedInsights.map((insight) => (
						<div
							key={insight.id}
							className={`p-3 rounded-lg border-l-4 ${getTypeStyles(insight.type)}`}
						>
							<div className="flex items-start justify-between gap-3">
								<div className="flex-1">
									<div className="flex items-center gap-2 mb-1">
										{getTypeIcon(insight.type)}
										<span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
											{insight.title}
										</span>
										{getPriorityBadge(insight.priority)}
									</div>

									<p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
										{insight.description}
									</p>

									{/* Metric Display */}
									{insight.metric && (
										<div className="flex items-center gap-3 mb-2">
											<div className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
												<span className="text-xs text-slate-500">{insight.metric.label}:</span>
												<span className="text-sm font-bold ml-1">
													{insight.metric.value}{insight.metric.unit}
												</span>
												{insight.metric.change !== undefined && (
													<span className={`text-xs ml-1 ${
														insight.metric.changeType === 'increase' ? 'text-green-600' :
														insight.metric.changeType === 'decrease' ? 'text-red-600' : 'text-slate-500'
													}`}>
														{insight.metric.change > 0 ? '+' : ''}
														{insight.metric.change}%
														{insight.metric.changeType === 'increase' && <TrendingUp className="h-3 w-3 inline ml-0.5" />}
														{insight.metric.changeType === 'decrease' && <TrendingDown className="h-3 w-3 inline ml-0.5" />}
													</span>
												)}
											</div>

											{insight.affectedEntity && (
												<Badge variant="outline" className="text-xs">
													{getCategoryIcon(insight.category)}
													<span className="ml-1">
														{insight.affectedEntity.type}: {insight.affectedEntity.name}
													</span>
												</Badge>
											)}
										</div>
									)}

									{/* Recommendation */}
									{insight.recommendation && (
										<div className="flex items-start gap-2 p-2 rounded bg-white/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50">
											<ArrowRight className="h-3.5 w-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
											<p className="text-xs text-slate-700 dark:text-slate-300">
												<span className="font-medium">Recommendation:</span> {insight.recommendation}
											</p>
										</div>
									)}
								</div>

								{/* Actions */}
								{insight.actionable && (
									<div className="flex flex-col gap-1">
										{onViewDetails && (
											<Button
												variant="ghost"
												size="sm"
												className="h-7 text-xs"
												onClick={() => onViewDetails(insight)}
											>
												Details
												<ChevronRight className="h-3 w-3 ml-1" />
											</Button>
										)}
										{onTakeAction && (
											<Button
												variant="outline"
												size="sm"
												className="h-7 text-xs"
												onClick={() => onTakeAction(insight)}
											>
												Take Action
											</Button>
										)}
									</div>
								)}
							</div>
						</div>
					))
				)}
			</CardContent>
		</Card>
	)
}

// Helper function to generate insights from result analytics data
export function generateInsightsFromData(
	collegeData: any,
	programData: any,
	subjectData: any
): Insight[] {
	const insights: Insight[] = []

	if (collegeData?.summary) {
		const summary = collegeData.summary

		// Pass Rate Insight
		if (summary.pass_percentage >= 90) {
			insights.push({
				id: 'high-pass-rate',
				type: 'success',
				category: 'performance',
				title: 'Excellent Pass Rate',
				description: `Overall pass rate of ${summary.pass_percentage.toFixed(1)}% exceeds benchmark. This indicates effective teaching and learning outcomes.`,
				metric: {
					label: 'Pass Rate',
					value: summary.pass_percentage.toFixed(1),
					unit: '%'
				},
				priority: 'low',
				actionable: false
			})
		} else if (summary.pass_percentage < 70) {
			insights.push({
				id: 'low-pass-rate',
				type: 'danger',
				category: 'performance',
				title: 'Pass Rate Below Target',
				description: `Overall pass rate of ${summary.pass_percentage.toFixed(1)}% is below the 70% target. Immediate intervention may be required.`,
				metric: {
					label: 'Pass Rate',
					value: summary.pass_percentage.toFixed(1),
					unit: '%',
					change: summary.pass_percentage - 70,
					changeType: 'decrease'
				},
				recommendation: 'Analyze subject-wise performance to identify specific areas needing improvement. Consider remedial classes for at-risk students.',
				priority: 'high',
				actionable: true
			})
		}

		// Distinction Analysis
		const distinctionRate = (summary.distinction_count / summary.total_students_appeared) * 100
		if (distinctionRate >= 20) {
			insights.push({
				id: 'high-distinction',
				type: 'success',
				category: 'performance',
				title: 'High Distinction Achievement',
				description: `${distinctionRate.toFixed(1)}% students achieved distinction. This is an indicator of academic excellence.`,
				metric: {
					label: 'Distinction Rate',
					value: distinctionRate.toFixed(1),
					unit: '%'
				},
				priority: 'low',
				actionable: false
			})
		}

		// Backlog Analysis
		if (summary.backlog_percentage > 15) {
			insights.push({
				id: 'high-backlogs',
				type: 'warning',
				category: 'anomaly',
				title: 'High Backlog Rate Detected',
				description: `${summary.backlog_percentage.toFixed(1)}% of students have backlogs, affecting timely graduation.`,
				metric: {
					label: 'Backlog Rate',
					value: summary.backlog_percentage.toFixed(1),
					unit: '%'
				},
				recommendation: 'Schedule supplementary examinations and provide additional support for students with backlogs.',
				priority: 'medium',
				actionable: true
			})
		}
	}

	// Program-level Insights
	if (programData?.weak_programs?.length > 0) {
		const weakestProgram = programData.weak_programs[0]
		insights.push({
			id: 'weak-program',
			type: 'danger',
			category: 'performance',
			title: 'Program Performance Alert',
			description: `${weakestProgram.program_name} is performing ${Math.abs(weakestProgram.variance).toFixed(1)}% below college average.`,
			metric: {
				label: 'Pass Rate',
				value: weakestProgram.pass_percentage.toFixed(1),
				unit: '%',
				change: -weakestProgram.variance,
				changeType: 'decrease'
			},
			affectedEntity: {
				type: 'program',
				name: weakestProgram.program_code,
				id: weakestProgram.program_id
			},
			recommendation: weakestProgram.recommendation || 'Review curriculum and teaching methodology for this program.',
			priority: 'high',
			actionable: true
		})
	}

	// Subject-level Insights
	if (subjectData?.difficult_subjects?.length > 0) {
		const difficultSubjects = subjectData.difficult_subjects.slice(0, 3)
		insights.push({
			id: 'difficult-subjects',
			type: 'warning',
			category: 'pattern',
			title: 'High-Difficulty Subjects Identified',
			description: `${difficultSubjects.length} subjects have failure rates above 30%: ${difficultSubjects.map((s: any) => s.course_code).join(', ')}`,
			recommendation: 'Consider additional tutorials, bridge courses, or revision of question paper difficulty for these subjects.',
			priority: 'medium',
			actionable: true
		})
	}

	// Trend Analysis
	if (collegeData?.trends?.length >= 2) {
		const latestTrend = collegeData.trends[collegeData.trends.length - 1]
		const previousTrend = collegeData.trends[collegeData.trends.length - 2]
		const change = latestTrend.pass_percentage - previousTrend.pass_percentage

		if (Math.abs(change) > 5) {
			insights.push({
				id: 'trend-change',
				type: change > 0 ? 'success' : 'warning',
				category: 'trend',
				title: change > 0 ? 'Positive Performance Trend' : 'Declining Performance Trend',
				description: `Pass percentage ${change > 0 ? 'improved' : 'decreased'} by ${Math.abs(change).toFixed(1)}% compared to previous session.`,
				metric: {
					label: 'Change',
					value: Math.abs(change).toFixed(1),
					unit: '%',
					change: change,
					changeType: change > 0 ? 'increase' : 'decrease'
				},
				recommendation: change < 0 ? 'Investigate factors contributing to the decline and implement corrective measures.' : undefined,
				priority: change < 0 ? 'high' : 'low',
				actionable: change < 0
			})
		}
	}

	return insights.sort((a, b) => {
		const priorityOrder = { high: 0, medium: 1, low: 2 }
		return priorityOrder[a.priority] - priorityOrder[b.priority]
	})
}
