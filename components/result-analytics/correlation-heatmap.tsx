"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Grid3x3, Info } from "lucide-react"

interface CorrelationData {
	variables: string[]
	matrix: number[][]
}

interface CorrelationHeatmapProps {
	title?: string
	data: CorrelationData
	showValues?: boolean
	colorScale?: 'diverging' | 'sequential'
}

export function CorrelationHeatmap({
	title = "Correlation Matrix",
	data,
	showValues = true,
	colorScale = 'diverging'
}: CorrelationHeatmapProps) {
	const { variables, matrix } = data

	// Get color based on correlation value
	const getColor = (value: number) => {
		if (colorScale === 'diverging') {
			// Red (-1) to White (0) to Blue (+1)
			if (value >= 0) {
				const intensity = Math.round(value * 255)
				return `rgb(${255 - intensity}, ${255 - intensity}, 255)`
			} else {
				const intensity = Math.round(Math.abs(value) * 255)
				return `rgb(255, ${255 - intensity}, ${255 - intensity})`
			}
		} else {
			// Sequential: Light to Dark
			const intensity = Math.round((1 - Math.abs(value)) * 255)
			return `rgb(${intensity}, ${intensity}, 255)`
		}
	}

	// Get text color based on background
	const getTextColor = (value: number) => {
		return Math.abs(value) > 0.5 ? 'text-white' : 'text-slate-700 dark:text-slate-300'
	}

	// Interpret correlation strength
	const getCorrelationStrength = (value: number) => {
		const abs = Math.abs(value)
		if (abs >= 0.8) return 'Very Strong'
		if (abs >= 0.6) return 'Strong'
		if (abs >= 0.4) return 'Moderate'
		if (abs >= 0.2) return 'Weak'
		return 'Very Weak'
	}

	const getCorrelationDirection = (value: number) => {
		if (value > 0) return 'Positive'
		if (value < 0) return 'Negative'
		return 'None'
	}

	// Calculate key insights
	const insights = useMemo(() => {
		const correlations: { var1: string; var2: string; value: number }[] = []

		for (let i = 0; i < variables.length; i++) {
			for (let j = i + 1; j < variables.length; j++) {
				correlations.push({
					var1: variables[i],
					var2: variables[j],
					value: matrix[i][j]
				})
			}
		}

		const sorted = correlations.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
		const strongPositive = sorted.filter(c => c.value > 0.5).slice(0, 3)
		const strongNegative = sorted.filter(c => c.value < -0.5).slice(0, 3)

		return { strongPositive, strongNegative }
	}, [variables, matrix])

	if (variables.length === 0) {
		return (
			<Card className="border-slate-200 dark:border-slate-800">
				<CardContent className="flex items-center justify-center h-64 text-slate-500">
					<p>No correlation data available</p>
				</CardContent>
			</Card>
		)
	}

	return (
		<Card className="border-slate-200 dark:border-slate-800">
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Grid3x3 className="h-4 w-4 text-indigo-500" />
						<CardTitle className="text-sm font-semibold">{title}</CardTitle>
					</div>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger>
								<Info className="h-3.5 w-3.5 text-slate-400" />
							</TooltipTrigger>
							<TooltipContent className="max-w-xs">
								<p className="text-xs">
									Correlation coefficient ranges from -1 (perfect negative) to +1 (perfect positive).
									Values close to 0 indicate weak correlation.
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
				<CardDescription className="text-xs">
					{variables.length} variables analyzed for pairwise correlations
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Heatmap Grid */}
				<div className="overflow-x-auto">
					<div className="inline-block min-w-full">
						<div className="flex">
							{/* Empty corner cell */}
							<div className="w-20 h-8 flex-shrink-0" />
							{/* Column headers */}
							{variables.map((variable, index) => (
								<TooltipProvider key={index}>
									<Tooltip>
										<TooltipTrigger asChild>
											<div
												className="w-14 h-8 flex items-center justify-center text-xs font-medium text-slate-600 dark:text-slate-400 flex-shrink-0 overflow-hidden"
												style={{ transform: 'rotate(-45deg)', transformOrigin: 'left bottom' }}
											>
												{variable.length > 8 ? variable.slice(0, 8) + '...' : variable}
											</div>
										</TooltipTrigger>
										<TooltipContent>
											<p className="text-xs">{variable}</p>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							))}
						</div>

						{/* Rows */}
						{matrix.map((row, rowIndex) => (
							<div key={rowIndex} className="flex">
								{/* Row header */}
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<div className="w-20 h-14 flex items-center justify-end pr-2 text-xs font-medium text-slate-600 dark:text-slate-400 flex-shrink-0 overflow-hidden">
												{variables[rowIndex].length > 10 ? variables[rowIndex].slice(0, 10) + '...' : variables[rowIndex]}
											</div>
										</TooltipTrigger>
										<TooltipContent>
											<p className="text-xs">{variables[rowIndex]}</p>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>

								{/* Cells */}
								{row.map((value, colIndex) => (
									<TooltipProvider key={colIndex}>
										<Tooltip>
											<TooltipTrigger asChild>
												<div
													className={`w-14 h-14 flex items-center justify-center text-xs font-semibold flex-shrink-0 border border-white/20 ${getTextColor(value)}`}
													style={{ backgroundColor: getColor(value) }}
												>
													{showValues && (rowIndex !== colIndex ? value.toFixed(2) : '1.00')}
												</div>
											</TooltipTrigger>
											<TooltipContent>
												<div className="text-xs space-y-1">
													<p className="font-semibold">
														{variables[rowIndex]} vs {variables[colIndex]}
													</p>
													<p>Correlation: {value.toFixed(4)}</p>
													<p>
														{getCorrelationStrength(value)} {getCorrelationDirection(value)}
													</p>
												</div>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								))}
							</div>
						))}
					</div>
				</div>

				{/* Color Scale Legend */}
				<div className="flex items-center justify-center gap-4">
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(255, 0, 0)' }} />
						<span className="text-xs text-slate-600 dark:text-slate-400">-1 (Negative)</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 rounded bg-white border border-slate-200" />
						<span className="text-xs text-slate-600 dark:text-slate-400">0 (None)</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(0, 0, 255)' }} />
						<span className="text-xs text-slate-600 dark:text-slate-400">+1 (Positive)</span>
					</div>
				</div>

				{/* Key Insights */}
				{(insights.strongPositive.length > 0 || insights.strongNegative.length > 0) && (
					<div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
						<p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Key Correlations</p>

						{insights.strongPositive.length > 0 && (
							<div className="space-y-1">
								<p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Strong Positive:</p>
								<div className="flex flex-wrap gap-1">
									{insights.strongPositive.map((c, i) => (
										<Badge
											key={i}
											variant="outline"
											className="text-xs bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
										>
											{c.var1} ↔ {c.var2}: {c.value.toFixed(2)}
										</Badge>
									))}
								</div>
							</div>
						)}

						{insights.strongNegative.length > 0 && (
							<div className="space-y-1">
								<p className="text-xs text-red-600 dark:text-red-400 font-medium">Strong Negative:</p>
								<div className="flex flex-wrap gap-1">
									{insights.strongNegative.map((c, i) => (
										<Badge
											key={i}
											variant="outline"
											className="text-xs bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
										>
											{c.var1} ↔ {c.var2}: {c.value.toFixed(2)}
										</Badge>
									))}
								</div>
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	)
}

// Helper function to calculate correlation matrix from data
export function calculateCorrelationMatrix(
	data: Record<string, number>[],
	variables: string[]
): CorrelationData {
	const n = data.length
	if (n === 0) return { variables: [], matrix: [] }

	const matrix: number[][] = []

	for (let i = 0; i < variables.length; i++) {
		const row: number[] = []
		for (let j = 0; j < variables.length; j++) {
			if (i === j) {
				row.push(1)
			} else {
				const x = data.map(d => d[variables[i]] || 0)
				const y = data.map(d => d[variables[j]] || 0)
				row.push(pearsonCorrelation(x, y))
			}
		}
		matrix.push(row)
	}

	return { variables, matrix }
}

// Pearson correlation coefficient
function pearsonCorrelation(x: number[], y: number[]): number {
	const n = x.length
	if (n === 0 || n !== y.length) return 0

	const sumX = x.reduce((a, b) => a + b, 0)
	const sumY = y.reduce((a, b) => a + b, 0)
	const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0)
	const sumX2 = x.reduce((total, xi) => total + xi * xi, 0)
	const sumY2 = y.reduce((total, yi) => total + yi * yi, 0)

	const numerator = n * sumXY - sumX * sumY
	const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))

	if (denominator === 0) return 0
	return numerator / denominator
}
