"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
	Calculator,
	TrendingUp,
	TrendingDown,
	Minus,
	Info,
	BarChart3,
	Target
} from "lucide-react"

interface StatisticalMetrics {
	// Central Tendency
	mean: number
	median: number
	mode: number | null

	// Dispersion
	standardDeviation: number
	variance: number
	range: { min: number; max: number }
	interquartileRange: { q1: number; q3: number }
	coefficientOfVariation: number

	// Distribution Shape
	skewness: number
	kurtosis: number

	// Additional Stats
	count: number
	sum: number

	// Confidence Interval (95%)
	confidenceInterval: { lower: number; upper: number }

	// Percentiles
	percentiles: {
		p10: number
		p25: number
		p50: number
		p75: number
		p90: number
	}
}

interface StatisticalSummaryProps {
	title: string
	metrics: StatisticalMetrics
	unit?: string
	showAdvanced?: boolean
	comparisonValue?: number
	comparisonLabel?: string
}

export function StatisticalSummary({
	title,
	metrics,
	unit = '%',
	showAdvanced = false,
	comparisonValue,
	comparisonLabel
}: StatisticalSummaryProps) {
	const getSkewnessLabel = (skewness: number) => {
		if (skewness > 0.5) return { label: 'Right-skewed', color: 'text-amber-600' }
		if (skewness < -0.5) return { label: 'Left-skewed', color: 'text-blue-600' }
		return { label: 'Symmetric', color: 'text-green-600' }
	}

	const skewnessInfo = getSkewnessLabel(metrics.skewness)
	const variance = comparisonValue ? metrics.mean - comparisonValue : null

	return (
		<Card className="border-slate-200 dark:border-slate-800">
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Calculator className="h-4 w-4 text-purple-500" />
						<CardTitle className="text-sm font-semibold">{title}</CardTitle>
					</div>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger>
								<Info className="h-3.5 w-3.5 text-slate-400" />
							</TooltipTrigger>
							<TooltipContent className="max-w-xs">
								<p className="text-xs">
									Statistical summary based on {metrics.count.toLocaleString()} data points.
									95% Confidence Interval: {metrics.confidenceInterval.lower.toFixed(2)} - {metrics.confidenceInterval.upper.toFixed(2)}
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
				<CardDescription className="text-xs">
					N = {metrics.count.toLocaleString()} | Distribution: {skewnessInfo.label}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Primary Metrics */}
				<div className="grid grid-cols-3 gap-3">
					<div className="text-center p-3 rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20">
						<p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">Mean</p>
						<p className="text-xl font-bold text-purple-700 dark:text-purple-300">
							{metrics.mean.toFixed(2)}{unit}
						</p>
						{variance !== null && (
							<div className="flex items-center justify-center gap-1 mt-1">
								{variance > 0 ? (
									<TrendingUp className="h-3 w-3 text-green-500" />
								) : variance < 0 ? (
									<TrendingDown className="h-3 w-3 text-red-500" />
								) : (
									<Minus className="h-3 w-3 text-slate-400" />
								)}
								<span className={`text-xs ${
									variance > 0 ? 'text-green-600' : variance < 0 ? 'text-red-600' : 'text-slate-500'
								}`}>
									{variance > 0 ? '+' : ''}{variance.toFixed(1)} vs {comparisonLabel}
								</span>
							</div>
						)}
					</div>
					<div className="text-center p-3 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
						<p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Median</p>
						<p className="text-xl font-bold text-blue-700 dark:text-blue-300">
							{metrics.median.toFixed(2)}{unit}
						</p>
						<p className="text-xs text-blue-500 mt-1">
							50th percentile
						</p>
					</div>
					<div className="text-center p-3 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20">
						<p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">Std Dev</p>
						<p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
							{metrics.standardDeviation.toFixed(2)}
						</p>
						<p className="text-xs text-emerald-500 mt-1">
							CV: {metrics.coefficientOfVariation.toFixed(1)}%
						</p>
					</div>
				</div>

				{/* Range & IQR */}
				<div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
					<div>
						<p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Range</p>
						<p className="text-sm font-semibold">
							{metrics.range.min.toFixed(1)} - {metrics.range.max.toFixed(1)}{unit}
						</p>
					</div>
					<div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
					<div>
						<p className="text-xs text-slate-600 dark:text-slate-400 font-medium">IQR (Q1-Q3)</p>
						<p className="text-sm font-semibold">
							{metrics.interquartileRange.q1.toFixed(1)} - {metrics.interquartileRange.q3.toFixed(1)}{unit}
						</p>
					</div>
					<div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
					<div>
						<p className="text-xs text-slate-600 dark:text-slate-400 font-medium">95% CI</p>
						<p className="text-sm font-semibold">
							±{((metrics.confidenceInterval.upper - metrics.confidenceInterval.lower) / 2).toFixed(2)}
						</p>
					</div>
				</div>

				{/* Percentile Distribution */}
				<div className="space-y-2">
					<p className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
						<BarChart3 className="h-3.5 w-3.5" />
						Percentile Distribution
					</p>
					<div className="relative h-8 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
						{/* P10 marker */}
						<div
							className="absolute h-full w-0.5 bg-red-400"
							style={{ left: `${(metrics.percentiles.p10 / metrics.range.max) * 100}%` }}
						/>
						{/* P25 marker (Q1) */}
						<div
							className="absolute h-full w-0.5 bg-amber-400"
							style={{ left: `${(metrics.percentiles.p25 / metrics.range.max) * 100}%` }}
						/>
						{/* P50 marker (Median) */}
						<div
							className="absolute h-full w-1 bg-green-500"
							style={{ left: `${(metrics.percentiles.p50 / metrics.range.max) * 100}%` }}
						/>
						{/* P75 marker (Q3) */}
						<div
							className="absolute h-full w-0.5 bg-blue-400"
							style={{ left: `${(metrics.percentiles.p75 / metrics.range.max) * 100}%` }}
						/>
						{/* P90 marker */}
						<div
							className="absolute h-full w-0.5 bg-purple-400"
							style={{ left: `${(metrics.percentiles.p90 / metrics.range.max) * 100}%` }}
						/>
						{/* IQR fill */}
						<div
							className="absolute h-full bg-blue-200 dark:bg-blue-800/50 opacity-50"
							style={{
								left: `${(metrics.percentiles.p25 / metrics.range.max) * 100}%`,
								width: `${((metrics.percentiles.p75 - metrics.percentiles.p25) / metrics.range.max) * 100}%`
							}}
						/>
					</div>
					<div className="flex justify-between text-xs text-slate-500">
						<span>P10: {metrics.percentiles.p10.toFixed(1)}</span>
						<span>P25: {metrics.percentiles.p25.toFixed(1)}</span>
						<span className="font-semibold text-green-600">P50: {metrics.percentiles.p50.toFixed(1)}</span>
						<span>P75: {metrics.percentiles.p75.toFixed(1)}</span>
						<span>P90: {metrics.percentiles.p90.toFixed(1)}</span>
					</div>
				</div>

				{/* Advanced Metrics */}
				{showAdvanced && (
					<div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
						<div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50">
							<span className="text-xs text-slate-600 dark:text-slate-400">Skewness</span>
							<Badge variant="outline" className={`text-xs ${skewnessInfo.color}`}>
								{metrics.skewness.toFixed(3)}
							</Badge>
						</div>
						<div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50">
							<span className="text-xs text-slate-600 dark:text-slate-400">Kurtosis</span>
							<Badge variant="outline" className="text-xs">
								{metrics.kurtosis.toFixed(3)}
							</Badge>
						</div>
						<div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50">
							<span className="text-xs text-slate-600 dark:text-slate-400">Variance</span>
							<Badge variant="outline" className="text-xs">
								{metrics.variance.toFixed(2)}
							</Badge>
						</div>
						{metrics.mode !== null && (
							<div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50">
								<span className="text-xs text-slate-600 dark:text-slate-400">Mode</span>
								<Badge variant="outline" className="text-xs">
									{metrics.mode.toFixed(2)}{unit}
								</Badge>
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	)
}

// Helper function to calculate statistical metrics from an array of numbers
export function calculateStatisticalMetrics(data: number[]): StatisticalMetrics {
	const n = data.length
	if (n === 0) {
		return {
			mean: 0, median: 0, mode: null,
			standardDeviation: 0, variance: 0,
			range: { min: 0, max: 0 },
			interquartileRange: { q1: 0, q3: 0 },
			coefficientOfVariation: 0,
			skewness: 0, kurtosis: 0,
			count: 0, sum: 0,
			confidenceInterval: { lower: 0, upper: 0 },
			percentiles: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 }
		}
	}

	const sorted = [...data].sort((a, b) => a - b)
	const sum = data.reduce((a, b) => a + b, 0)
	const mean = sum / n

	// Variance and Standard Deviation
	const squaredDiffs = data.map(x => Math.pow(x - mean, 2))
	const variance = squaredDiffs.reduce((a, b) => a + b, 0) / n
	const standardDeviation = Math.sqrt(variance)

	// Median
	const median = n % 2 === 0
		? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
		: sorted[Math.floor(n / 2)]

	// Mode
	const frequency: Record<number, number> = {}
	data.forEach(x => {
		const rounded = Math.round(x * 10) / 10
		frequency[rounded] = (frequency[rounded] || 0) + 1
	})
	let mode: number | null = null
	let maxFreq = 0
	for (const [value, freq] of Object.entries(frequency)) {
		if (freq > maxFreq) {
			maxFreq = freq
			mode = parseFloat(value)
		}
	}
	if (maxFreq === 1) mode = null // No mode if all values are unique

	// Percentiles
	const getPercentile = (p: number) => {
		const index = (p / 100) * (n - 1)
		const lower = Math.floor(index)
		const upper = Math.ceil(index)
		if (lower === upper) return sorted[lower]
		return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
	}

	const percentiles = {
		p10: getPercentile(10),
		p25: getPercentile(25),
		p50: getPercentile(50),
		p75: getPercentile(75),
		p90: getPercentile(90)
	}

	// Coefficient of Variation
	const coefficientOfVariation = mean !== 0 ? (standardDeviation / mean) * 100 : 0

	// Skewness (Fisher's measure)
	const skewness = n > 2
		? (n / ((n - 1) * (n - 2))) * data.reduce((sum, x) => sum + Math.pow((x - mean) / standardDeviation, 3), 0)
		: 0

	// Kurtosis (excess kurtosis)
	const kurtosis = n > 3
		? ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) *
			data.reduce((sum, x) => sum + Math.pow((x - mean) / standardDeviation, 4), 0) -
			(3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3))
		: 0

	// 95% Confidence Interval
	const standardError = standardDeviation / Math.sqrt(n)
	const zScore = 1.96 // 95% confidence
	const confidenceInterval = {
		lower: mean - zScore * standardError,
		upper: mean + zScore * standardError
	}

	return {
		mean,
		median,
		mode,
		standardDeviation,
		variance,
		range: { min: sorted[0], max: sorted[n - 1] },
		interquartileRange: { q1: percentiles.p25, q3: percentiles.p75 },
		coefficientOfVariation,
		skewness,
		kurtosis,
		count: n,
		sum,
		confidenceInterval,
		percentiles
	}
}
