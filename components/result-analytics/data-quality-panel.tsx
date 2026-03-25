"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
	AlertTriangle,
	CheckCircle2,
	XCircle,
	Info,
	Database,
	FileWarning,
	TrendingUp,
	AlertCircle
} from "lucide-react"

interface DataQualityMetrics {
	totalRecords: number
	missingValues: {
		field: string
		count: number
		percentage: number
		severity: 'low' | 'medium' | 'high'
	}[]
	outliers: {
		field: string
		count: number
		description: string
	}[]
	dataCompleteness: number
	dataAccuracy: number
	dataConsistency: number
	lastUpdated: string
}

interface DataQualityPanelProps {
	metrics: DataQualityMetrics
	onFixIssue?: (field: string) => void
}

export function DataQualityPanel({ metrics, onFixIssue }: DataQualityPanelProps) {
	const overallScore = Math.round(
		(metrics.dataCompleteness + metrics.dataAccuracy + metrics.dataConsistency) / 3
	)

	const getScoreColor = (score: number) => {
		if (score >= 90) return 'text-green-600 dark:text-green-400'
		if (score >= 70) return 'text-amber-600 dark:text-amber-400'
		return 'text-red-600 dark:text-red-400'
	}

	const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
		switch (severity) {
			case 'high': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200'
			case 'medium': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200'
			case 'low': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200'
		}
	}

	const criticalIssues = metrics.missingValues.filter(m => m.severity === 'high')
	const hasOutliers = metrics.outliers.length > 0

	return (
		<Card className="border-slate-200 dark:border-slate-800">
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Database className="h-5 w-5 text-blue-500" />
						<CardTitle className="text-base font-semibold">Data Quality Assessment</CardTitle>
					</div>
					<Badge
						variant="outline"
						className={`text-sm font-bold ${getScoreColor(overallScore)}`}
					>
						{overallScore}% Overall Score
					</Badge>
				</div>
				<CardDescription className="text-xs">
					Analyzing {metrics.totalRecords.toLocaleString()} records | Last updated: {metrics.lastUpdated}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Quality Metrics */}
				<div className="grid grid-cols-3 gap-3">
					<div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs text-slate-600 dark:text-slate-400">Completeness</span>
							<span className={`text-sm font-bold ${getScoreColor(metrics.dataCompleteness)}`}>
								{metrics.dataCompleteness}%
							</span>
						</div>
						<Progress
							value={metrics.dataCompleteness}
							className={`h-1.5 ${
								metrics.dataCompleteness >= 90 ? '[&>div]:bg-green-500' :
								metrics.dataCompleteness >= 70 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'
							}`}
						/>
					</div>
					<div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs text-slate-600 dark:text-slate-400">Accuracy</span>
							<span className={`text-sm font-bold ${getScoreColor(metrics.dataAccuracy)}`}>
								{metrics.dataAccuracy}%
							</span>
						</div>
						<Progress
							value={metrics.dataAccuracy}
							className={`h-1.5 ${
								metrics.dataAccuracy >= 90 ? '[&>div]:bg-green-500' :
								metrics.dataAccuracy >= 70 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'
							}`}
						/>
					</div>
					<div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs text-slate-600 dark:text-slate-400">Consistency</span>
							<span className={`text-sm font-bold ${getScoreColor(metrics.dataConsistency)}`}>
								{metrics.dataConsistency}%
							</span>
						</div>
						<Progress
							value={metrics.dataConsistency}
							className={`h-1.5 ${
								metrics.dataConsistency >= 90 ? '[&>div]:bg-green-500' :
								metrics.dataConsistency >= 70 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'
							}`}
						/>
					</div>
				</div>

				{/* Critical Issues Alert */}
				{criticalIssues.length > 0 && (
					<Alert variant="destructive" className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
						<AlertTriangle className="h-4 w-4" />
						<AlertTitle className="text-sm font-semibold">Critical Data Issues Found</AlertTitle>
						<AlertDescription className="text-xs mt-1">
							{criticalIssues.length} field(s) have significant missing data that may affect analysis accuracy.
							{criticalIssues.map(issue => (
								<span key={issue.field} className="ml-2 font-medium">
									{issue.field}: {issue.percentage.toFixed(1)}% missing
								</span>
							))}
						</AlertDescription>
					</Alert>
				)}

				{/* Missing Values Details */}
				{metrics.missingValues.length > 0 && (
					<div className="space-y-2">
						<h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
							<FileWarning className="h-3.5 w-3.5" />
							Missing Values Analysis
						</h4>
						<div className="grid grid-cols-2 gap-2">
							{metrics.missingValues.slice(0, 6).map((item) => (
								<div
									key={item.field}
									className={`p-2 rounded-lg border text-xs ${getSeverityColor(item.severity)}`}
								>
									<div className="flex items-center justify-between">
										<span className="font-medium">{item.field}</span>
										<span>{item.count.toLocaleString()} ({item.percentage.toFixed(1)}%)</span>
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Outliers Detection */}
				{hasOutliers && (
					<div className="space-y-2">
						<h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
							<TrendingUp className="h-3.5 w-3.5" />
							Outliers Detected
						</h4>
						<div className="space-y-1">
							{metrics.outliers.slice(0, 3).map((outlier) => (
								<div
									key={outlier.field}
									className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-xs"
								>
									<AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
									<span>
										<span className="font-medium">{outlier.field}:</span> {outlier.description}
										<span className="text-amber-600 dark:text-amber-400 ml-1">
											({outlier.count} records)
										</span>
									</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Data Quality Summary */}
				{overallScore >= 90 && (
					<div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
						<CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
						<span className="text-xs text-green-700 dark:text-green-300">
							Data quality is excellent. Analysis results will be highly reliable.
						</span>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

// Helper function to calculate data quality metrics from result data
export function calculateDataQualityMetrics(data: any[]): DataQualityMetrics {
	const totalRecords = data.length
	if (totalRecords === 0) {
		return {
			totalRecords: 0,
			missingValues: [],
			outliers: [],
			dataCompleteness: 100,
			dataAccuracy: 100,
			dataConsistency: 100,
			lastUpdated: new Date().toLocaleDateString()
		}
	}

	// Check common fields for missing values
	const fieldsToCheck = [
		{ key: 'student_id', label: 'Student ID' },
		{ key: 'percentage', label: 'Percentage' },
		{ key: 'cgpa', label: 'CGPA' },
		{ key: 'program_id', label: 'Program' },
		{ key: 'semester', label: 'Semester' },
		{ key: 'gender', label: 'Gender' }
	]

	const missingValues = fieldsToCheck
		.map(field => {
			const missingCount = data.filter(d => !d[field.key] && d[field.key] !== 0).length
			const percentage = (missingCount / totalRecords) * 100
			return {
				field: field.label,
				count: missingCount,
				percentage,
				severity: percentage > 20 ? 'high' : percentage > 5 ? 'medium' : 'low' as 'low' | 'medium' | 'high'
			}
		})
		.filter(m => m.count > 0)
		.sort((a, b) => b.percentage - a.percentage)

	// Detect outliers in percentage/CGPA
	const percentages = data.map(d => d.percentage).filter(p => typeof p === 'number')
	const outliers: DataQualityMetrics['outliers'] = []

	if (percentages.length > 0) {
		const mean = percentages.reduce((a, b) => a + b, 0) / percentages.length
		const stdDev = Math.sqrt(
			percentages.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / percentages.length
		)
		const outlierCount = percentages.filter(p => Math.abs(p - mean) > 3 * stdDev).length

		if (outlierCount > 0) {
			outliers.push({
				field: 'Percentage',
				count: outlierCount,
				description: `Values more than 3 standard deviations from mean (${mean.toFixed(1)}%)`
			})
		}
	}

	// Calculate quality scores
	const totalMissing = missingValues.reduce((sum, m) => sum + m.count, 0)
	const totalFields = fieldsToCheck.length * totalRecords
	const dataCompleteness = Math.round(((totalFields - totalMissing) / totalFields) * 100)

	// Accuracy based on valid ranges
	const validPercentages = data.filter(d => d.percentage >= 0 && d.percentage <= 100).length
	const dataAccuracy = Math.round((validPercentages / totalRecords) * 100)

	// Consistency - check for duplicate records
	const uniqueIds = new Set(data.map(d => d.student_id)).size
	const dataConsistency = Math.round((uniqueIds / totalRecords) * 100)

	return {
		totalRecords,
		missingValues,
		outliers,
		dataCompleteness,
		dataAccuracy,
		dataConsistency,
		lastUpdated: new Date().toLocaleDateString()
	}
}
