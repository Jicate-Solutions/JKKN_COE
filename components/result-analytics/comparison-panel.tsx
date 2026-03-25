"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	ArrowLeftRight,
	TrendingUp,
	TrendingDown,
	Minus,
	BarChart3,
	Users,
	GraduationCap,
	CheckCircle2,
	AlertCircle,
	X
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ComparisonItem {
	id: string
	name: string
	code?: string
	metrics: {
		totalStudents: number
		passPercentage: number
		averageCGPA: number
		distinctionCount: number
		failCount: number
		avgMarks?: number
	}
}

interface ComparisonPanelProps {
	title: string
	description?: string
	items: ComparisonItem[]
	onClose?: () => void
}

function getVariance(a: number, b: number): { value: number; isPositive: boolean } {
	const diff = a - b
	return {
		value: Math.abs(diff),
		isPositive: diff >= 0
	}
}

function MetricComparison({
	label,
	valueA,
	valueB,
	suffix = "",
	higherIsBetter = true,
	icon: Icon
}: {
	label: string
	valueA: number
	valueB: number
	suffix?: string
	higherIsBetter?: boolean
	icon?: React.ElementType
}) {
	const variance = getVariance(valueA, valueB)
	const aWins = higherIsBetter ? valueA >= valueB : valueA <= valueB
	const bWins = higherIsBetter ? valueB >= valueA : valueB <= valueA

	return (
		<div className="grid grid-cols-7 gap-2 items-center py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
			{/* Item A Value */}
			<div className={cn(
				"col-span-2 text-right font-semibold tabular-nums transition-all",
				aWins && valueA !== valueB ? "text-green-600 dark:text-green-400 scale-105" : "text-slate-600 dark:text-slate-400"
			)}>
				{valueA.toLocaleString()}{suffix}
				{aWins && valueA !== valueB && (
					<Badge className="ml-1 text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
						<TrendingUp className="h-2 w-2 mr-0.5" />
					</Badge>
				)}
			</div>

			{/* Metric Label */}
			<div className="col-span-3 text-center">
				<div className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
					{Icon && <Icon className="h-3.5 w-3.5" />}
					{label}
				</div>
				{variance.value > 0 && (
					<div className="text-[10px] text-slate-400 mt-0.5">
						{variance.isPositive ? "+" : "-"}{variance.value.toFixed(1)}{suffix} diff
					</div>
				)}
			</div>

			{/* Item B Value */}
			<div className={cn(
				"col-span-2 font-semibold tabular-nums transition-all",
				bWins && valueA !== valueB ? "text-green-600 dark:text-green-400 scale-105" : "text-slate-600 dark:text-slate-400"
			)}>
				{valueB.toLocaleString()}{suffix}
				{bWins && valueA !== valueB && (
					<Badge className="ml-1 text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
						<TrendingUp className="h-2 w-2 mr-0.5" />
					</Badge>
				)}
			</div>
		</div>
	)
}

export function ComparisonPanel({ title, description, items, onClose }: ComparisonPanelProps) {
	const [selectedA, setSelectedA] = useState<string>(items[0]?.id || "")
	const [selectedB, setSelectedB] = useState<string>(items[1]?.id || items[0]?.id || "")

	const itemA = items.find(i => i.id === selectedA)
	const itemB = items.find(i => i.id === selectedB)

	if (!itemA || !itemB) return null

	const swapSelection = () => {
		const temp = selectedA
		setSelectedA(selectedB)
		setSelectedB(temp)
	}

	return (
		<Card className="border-indigo-200/50 dark:border-indigo-800/50">
			<CardHeader className="pb-3 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-t-lg">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
							<ArrowLeftRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
						</div>
						<div>
							<CardTitle className="text-sm font-semibold">{title}</CardTitle>
							{description && (
								<CardDescription className="text-xs">{description}</CardDescription>
							)}
						</div>
					</div>
					{onClose && (
						<Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
							<X className="h-4 w-4" />
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent className="p-4">
				{/* Selection Controls */}
				<div className="grid grid-cols-7 gap-2 mb-4 items-center">
					<div className="col-span-3">
						<Select value={selectedA} onValueChange={setSelectedA}>
							<SelectTrigger className="h-9 text-xs">
								<SelectValue placeholder="Select first item" />
							</SelectTrigger>
							<SelectContent>
								{items.map(item => (
									<SelectItem key={item.id} value={item.id} disabled={item.id === selectedB}>
										<span className="font-medium">{item.code || item.name}</span>
										{item.code && <span className="text-slate-500 ml-1">- {item.name}</span>}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="col-span-1 flex justify-center">
						<Button
							variant="outline"
							size="icon"
							className="h-8 w-8"
							onClick={swapSelection}
						>
							<ArrowLeftRight className="h-4 w-4" />
						</Button>
					</div>

					<div className="col-span-3">
						<Select value={selectedB} onValueChange={setSelectedB}>
							<SelectTrigger className="h-9 text-xs">
								<SelectValue placeholder="Select second item" />
							</SelectTrigger>
							<SelectContent>
								{items.map(item => (
									<SelectItem key={item.id} value={item.id} disabled={item.id === selectedA}>
										<span className="font-medium">{item.code || item.name}</span>
										{item.code && <span className="text-slate-500 ml-1">- {item.name}</span>}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				{/* Header Row */}
				<div className="grid grid-cols-7 gap-2 items-center pb-2 border-b-2 border-slate-200 dark:border-slate-700">
					<div className="col-span-2 text-right">
						<Badge variant="outline" className="text-xs bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-700 dark:text-indigo-400">
							{itemA.code || itemA.name}
						</Badge>
					</div>
					<div className="col-span-3 text-center text-xs font-medium text-slate-500">
						Comparison Metrics
					</div>
					<div className="col-span-2">
						<Badge variant="outline" className="text-xs bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-700 dark:text-purple-400">
							{itemB.code || itemB.name}
						</Badge>
					</div>
				</div>

				{/* Metrics Comparison */}
				<div className="space-y-0">
					<MetricComparison
						label="Total Learners"
						valueA={itemA.metrics.totalStudents}
						valueB={itemB.metrics.totalStudents}
						icon={Users}
					/>
					<MetricComparison
						label="Success Rate"
						valueA={itemA.metrics.passPercentage}
						valueB={itemB.metrics.passPercentage}
						suffix="%"
						icon={CheckCircle2}
					/>
					<MetricComparison
						label="Average CGPA"
						valueA={itemA.metrics.averageCGPA}
						valueB={itemB.metrics.averageCGPA}
						icon={GraduationCap}
					/>
					<MetricComparison
						label="Distinctions"
						valueA={itemA.metrics.distinctionCount}
						valueB={itemB.metrics.distinctionCount}
						icon={TrendingUp}
					/>
					<MetricComparison
						label="Needs Support"
						valueA={itemA.metrics.failCount}
						valueB={itemB.metrics.failCount}
						higherIsBetter={false}
						icon={AlertCircle}
					/>
					{itemA.metrics.avgMarks !== undefined && itemB.metrics.avgMarks !== undefined && (
						<MetricComparison
							label="Avg Marks"
							valueA={itemA.metrics.avgMarks}
							valueB={itemB.metrics.avgMarks}
							icon={BarChart3}
						/>
					)}
				</div>

				{/* Visual Progress Comparison */}
				<div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
					<div className="text-xs font-medium text-slate-500 mb-3">Visual Comparison - Success Rate</div>
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<span className="text-xs w-16 truncate text-right">{itemA.code || itemA.name.slice(0, 8)}</span>
							<Progress
								value={itemA.metrics.passPercentage}
								className="flex-1 h-3 [&>div]:bg-indigo-500"
							/>
							<span className="text-xs w-12 tabular-nums">{itemA.metrics.passPercentage.toFixed(1)}%</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-xs w-16 truncate text-right">{itemB.code || itemB.name.slice(0, 8)}</span>
							<Progress
								value={itemB.metrics.passPercentage}
								className="flex-1 h-3 [&>div]:bg-purple-500"
							/>
							<span className="text-xs w-12 tabular-nums">{itemB.metrics.passPercentage.toFixed(1)}%</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

// Quick comparison badge component
export function QuickComparisonBadge({
	valueA,
	valueB,
	labelA,
	labelB,
	suffix = "",
	higherIsBetter = true
}: {
	valueA: number
	valueB: number
	labelA: string
	labelB: string
	suffix?: string
	higherIsBetter?: boolean
}) {
	const diff = valueA - valueB
	const winner = higherIsBetter ? (diff >= 0 ? "A" : "B") : (diff <= 0 ? "A" : "B")

	return (
		<div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs">
			<span className={cn(
				"font-medium",
				winner === "A" ? "text-green-600 dark:text-green-400" : "text-slate-500"
			)}>
				{labelA}: {valueA.toFixed(1)}{suffix}
			</span>
			<span className="text-slate-400">vs</span>
			<span className={cn(
				"font-medium",
				winner === "B" ? "text-green-600 dark:text-green-400" : "text-slate-500"
			)}>
				{labelB}: {valueB.toFixed(1)}{suffix}
			</span>
			<span className={cn(
				"ml-1",
				diff > 0 ? "text-green-500" : diff < 0 ? "text-red-500" : "text-slate-400"
			)}>
				{diff > 0 ? <TrendingUp className="h-3 w-3" /> : diff < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
			</span>
		</div>
	)
}
