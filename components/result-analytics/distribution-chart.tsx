"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Cell,
	ReferenceLine,
	ReferenceArea
} from "recharts"
import { BarChart3, BoxSelect, TrendingUp } from "lucide-react"

interface DistributionData {
	bin: string
	count: number
	percentage: number
	cumulative: number
}

interface BoxPlotData {
	name: string
	min: number
	q1: number
	median: number
	q3: number
	max: number
	mean: number
	outliers?: number[]
}

interface DistributionChartProps {
	title: string
	data: number[]
	bins?: number
	unit?: string
	showBoxPlot?: boolean
	benchmarkValue?: number
	benchmarkLabel?: string
	colorThresholds?: {
		low: number
		medium: number
	}
}

const CHART_COLORS = {
	primary: '#3b82f6',
	success: '#22c55e',
	warning: '#f59e0b',
	danger: '#ef4444',
	purple: '#8b5cf6',
	teal: '#14b8a6'
}

export function DistributionChart({
	title,
	data,
	bins = 10,
	unit = '%',
	showBoxPlot = true,
	benchmarkValue,
	benchmarkLabel = 'Benchmark',
	colorThresholds = { low: 40, medium: 60 }
}: DistributionChartProps) {
	if (data.length === 0) {
		return (
			<Card className="border-slate-200 dark:border-slate-800">
				<CardContent className="flex items-center justify-center h-64 text-slate-500">
					<p>No data available for distribution analysis</p>
				</CardContent>
			</Card>
		)
	}

	// Calculate histogram data
	const min = Math.min(...data)
	const max = Math.max(...data)
	const binWidth = (max - min) / bins

	const histogramData: DistributionData[] = []
	let cumulative = 0

	for (let i = 0; i < bins; i++) {
		const binStart = min + i * binWidth
		const binEnd = i === bins - 1 ? max + 0.1 : min + (i + 1) * binWidth
		const binLabel = `${binStart.toFixed(0)}-${binEnd.toFixed(0)}`

		const count = data.filter(v => v >= binStart && v < binEnd).length
		const percentage = (count / data.length) * 100
		cumulative += percentage

		histogramData.push({
			bin: binLabel,
			count,
			percentage: parseFloat(percentage.toFixed(1)),
			cumulative: parseFloat(cumulative.toFixed(1))
		})
	}

	// Calculate box plot data
	const sorted = [...data].sort((a, b) => a - b)
	const n = sorted.length
	const q1 = sorted[Math.floor(n * 0.25)]
	const median = sorted[Math.floor(n * 0.5)]
	const q3 = sorted[Math.floor(n * 0.75)]
	const iqr = q3 - q1
	const mean = data.reduce((a, b) => a + b, 0) / n

	// Identify outliers (1.5 * IQR rule)
	const lowerFence = q1 - 1.5 * iqr
	const upperFence = q3 + 1.5 * iqr
	const outliers = data.filter(v => v < lowerFence || v > upperFence)

	const boxPlotData: BoxPlotData = {
		name: title,
		min: Math.max(min, lowerFence),
		q1,
		median,
		q3,
		max: Math.min(max, upperFence),
		mean,
		outliers
	}

	// Get bar color based on value
	const getBarColor = (value: number) => {
		if (value < colorThresholds.low) return CHART_COLORS.danger
		if (value < colorThresholds.medium) return CHART_COLORS.warning
		return CHART_COLORS.success
	}

	// Custom tooltip
	const CustomTooltip = ({ active, payload }: any) => {
		if (active && payload && payload.length) {
			const data = payload[0].payload
			return (
				<div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
					<p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
						{data.bin}{unit}
					</p>
					<p className="text-xs text-slate-600 dark:text-slate-400">
						Count: <span className="font-semibold">{data.count}</span>
					</p>
					<p className="text-xs text-slate-600 dark:text-slate-400">
						Percentage: <span className="font-semibold">{data.percentage}%</span>
					</p>
					<p className="text-xs text-blue-600 dark:text-blue-400">
						Cumulative: <span className="font-semibold">{data.cumulative}%</span>
					</p>
				</div>
			)
		}
		return null
	}

	return (
		<Card className="border-slate-200 dark:border-slate-800">
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<BarChart3 className="h-4 w-4 text-blue-500" />
						<CardTitle className="text-sm font-semibold">{title} Distribution</CardTitle>
					</div>
					<div className="flex items-center gap-2">
						<Badge variant="outline" className="text-xs">
							N = {data.length}
						</Badge>
						{outliers.length > 0 && (
							<Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
								{outliers.length} outliers
							</Badge>
						)}
					</div>
				</div>
				<CardDescription className="text-xs">
					Range: {min.toFixed(1)} - {max.toFixed(1)}{unit} | Mean: {mean.toFixed(2)}{unit} | Median: {median.toFixed(2)}{unit}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="histogram" className="space-y-4">
					<TabsList className="grid w-full grid-cols-2 h-8">
						<TabsTrigger value="histogram" className="text-xs">
							<BarChart3 className="h-3.5 w-3.5 mr-1" />
							Histogram
						</TabsTrigger>
						{showBoxPlot && (
							<TabsTrigger value="boxplot" className="text-xs">
								<BoxSelect className="h-3.5 w-3.5 mr-1" />
								Box Plot
							</TabsTrigger>
						)}
					</TabsList>

					<TabsContent value="histogram" className="mt-0">
						<div className="h-[280px]">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={histogramData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
									<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
									<XAxis
										dataKey="bin"
										tick={{ fontSize: 10 }}
										angle={-45}
										textAnchor="end"
										height={50}
										interval={0}
									/>
									<YAxis
										yAxisId="left"
										tick={{ fontSize: 11 }}
										label={{ value: 'Count', angle: -90, position: 'insideLeft', fontSize: 11 }}
									/>
									<YAxis
										yAxisId="right"
										orientation="right"
										tick={{ fontSize: 11 }}
										domain={[0, 100]}
										label={{ value: 'Cumulative %', angle: 90, position: 'insideRight', fontSize: 11 }}
									/>
									<Tooltip content={<CustomTooltip />} />

									{/* Benchmark reference line */}
									{benchmarkValue && (
										<ReferenceLine
											x={histogramData.find(d => {
												const [start, end] = d.bin.split('-').map(Number)
												return benchmarkValue >= start && benchmarkValue < end
											})?.bin}
											yAxisId="left"
											stroke={CHART_COLORS.purple}
											strokeWidth={2}
											strokeDasharray="5 5"
											label={{
												value: benchmarkLabel,
												position: 'top',
												fill: CHART_COLORS.purple,
												fontSize: 10
											}}
										/>
									)}

									<Bar yAxisId="left" dataKey="count" radius={[4, 4, 0, 0]}>
										{histogramData.map((entry, index) => {
											const midPoint = parseFloat(entry.bin.split('-')[0]) + binWidth / 2
											return (
												<Cell
													key={`cell-${index}`}
													fill={getBarColor(midPoint)}
													fillOpacity={0.8}
												/>
											)
										})}
									</Bar>
								</BarChart>
							</ResponsiveContainer>
						</div>

						{/* Distribution Summary */}
						<div className="grid grid-cols-4 gap-2 mt-4">
							<div className="text-center p-2 rounded bg-red-50 dark:bg-red-900/20">
								<p className="text-xs text-red-600 dark:text-red-400">Below {colorThresholds.low}</p>
								<p className="text-sm font-bold text-red-700 dark:text-red-300">
									{data.filter(v => v < colorThresholds.low).length}
								</p>
							</div>
							<div className="text-center p-2 rounded bg-amber-50 dark:bg-amber-900/20">
								<p className="text-xs text-amber-600 dark:text-amber-400">{colorThresholds.low}-{colorThresholds.medium}</p>
								<p className="text-sm font-bold text-amber-700 dark:text-amber-300">
									{data.filter(v => v >= colorThresholds.low && v < colorThresholds.medium).length}
								</p>
							</div>
							<div className="text-center p-2 rounded bg-green-50 dark:bg-green-900/20">
								<p className="text-xs text-green-600 dark:text-green-400">{colorThresholds.medium}+</p>
								<p className="text-sm font-bold text-green-700 dark:text-green-300">
									{data.filter(v => v >= colorThresholds.medium).length}
								</p>
							</div>
							<div className="text-center p-2 rounded bg-blue-50 dark:bg-blue-900/20">
								<p className="text-xs text-blue-600 dark:text-blue-400">Total</p>
								<p className="text-sm font-bold text-blue-700 dark:text-blue-300">
									{data.length}
								</p>
							</div>
						</div>
					</TabsContent>

					{showBoxPlot && (
						<TabsContent value="boxplot" className="mt-0">
							<div className="h-[280px] flex items-center justify-center">
								<div className="w-full max-w-md">
									{/* Box Plot Visualization */}
									<div className="relative h-40">
										{/* Scale */}
										<div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-slate-500">
											<span>{min.toFixed(0)}</span>
											<span>{((min + max) / 2).toFixed(0)}</span>
											<span>{max.toFixed(0)}</span>
										</div>

										{/* Box Plot Elements */}
										<div className="absolute bottom-8 left-0 right-0 h-20">
											{/* Whisker Line */}
											<div
												className="absolute top-1/2 h-0.5 bg-slate-400"
												style={{
													left: `${((boxPlotData.min - min) / (max - min)) * 100}%`,
													right: `${100 - ((boxPlotData.max - min) / (max - min)) * 100}%`
												}}
											/>

											{/* Min Whisker */}
											<div
												className="absolute top-1/4 h-1/2 w-0.5 bg-slate-400"
												style={{ left: `${((boxPlotData.min - min) / (max - min)) * 100}%` }}
											/>

											{/* Max Whisker */}
											<div
												className="absolute top-1/4 h-1/2 w-0.5 bg-slate-400"
												style={{ left: `${((boxPlotData.max - min) / (max - min)) * 100}%` }}
											/>

											{/* IQR Box */}
											<div
												className="absolute top-1/4 h-1/2 bg-blue-200 dark:bg-blue-800/50 border-2 border-blue-500 rounded"
												style={{
													left: `${((boxPlotData.q1 - min) / (max - min)) * 100}%`,
													right: `${100 - ((boxPlotData.q3 - min) / (max - min)) * 100}%`
												}}
											/>

											{/* Median Line */}
											<div
												className="absolute top-1/4 h-1/2 w-1 bg-blue-600"
												style={{ left: `${((boxPlotData.median - min) / (max - min)) * 100}%` }}
											/>

											{/* Mean Diamond */}
											<div
												className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-green-500 rotate-45"
												style={{ left: `${((boxPlotData.mean - min) / (max - min)) * 100}%` }}
											/>

											{/* Outliers */}
											{outliers.map((outlier, i) => (
												<div
													key={i}
													className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500"
													style={{ left: `${((outlier - min) / (max - min)) * 100}%` }}
												/>
											))}
										</div>
									</div>

									{/* Legend */}
									<div className="flex flex-wrap justify-center gap-4 mt-4 text-xs">
										<div className="flex items-center gap-1">
											<div className="w-3 h-3 bg-blue-200 border-2 border-blue-500 rounded" />
											<span>IQR (Q1-Q3)</span>
										</div>
										<div className="flex items-center gap-1">
											<div className="w-3 h-0.5 bg-blue-600" />
											<span>Median</span>
										</div>
										<div className="flex items-center gap-1">
											<div className="w-2 h-2 bg-green-500 rotate-45" />
											<span>Mean</span>
										</div>
										{outliers.length > 0 && (
											<div className="flex items-center gap-1">
												<div className="w-2 h-2 bg-red-500 rounded-full" />
												<span>Outliers</span>
											</div>
										)}
									</div>
								</div>
							</div>

							{/* Box Plot Statistics */}
							<div className="grid grid-cols-5 gap-2 mt-4 text-center">
								<div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
									<p className="text-xs text-slate-500">Min</p>
									<p className="text-sm font-bold">{boxPlotData.min.toFixed(1)}</p>
								</div>
								<div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
									<p className="text-xs text-blue-600 dark:text-blue-400">Q1</p>
									<p className="text-sm font-bold text-blue-700 dark:text-blue-300">{boxPlotData.q1.toFixed(1)}</p>
								</div>
								<div className="p-2 rounded bg-blue-100 dark:bg-blue-900/30">
									<p className="text-xs text-blue-700 dark:text-blue-300">Median</p>
									<p className="text-sm font-bold text-blue-800 dark:text-blue-200">{boxPlotData.median.toFixed(1)}</p>
								</div>
								<div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
									<p className="text-xs text-blue-600 dark:text-blue-400">Q3</p>
									<p className="text-sm font-bold text-blue-700 dark:text-blue-300">{boxPlotData.q3.toFixed(1)}</p>
								</div>
								<div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
									<p className="text-xs text-slate-500">Max</p>
									<p className="text-sm font-bold">{boxPlotData.max.toFixed(1)}</p>
								</div>
							</div>
						</TabsContent>
					)}
				</Tabs>
			</CardContent>
		</Card>
	)
}
