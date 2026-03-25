"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus, LucideIcon } from "lucide-react"

// Animated counter hook
function useAnimatedCounter(
	target: number,
	duration: number = 1000,
	decimals: number = 0
): number {
	const [count, setCount] = useState(0)
	const startTimeRef = useRef<number | null>(null)
	const rafRef = useRef<number | null>(null)

	useEffect(() => {
		const animate = (currentTime: number) => {
			if (startTimeRef.current === null) {
				startTimeRef.current = currentTime
			}

			const elapsed = currentTime - startTimeRef.current
			const progress = Math.min(elapsed / duration, 1)

			// Easing function (ease-out cubic)
			const easeOutCubic = 1 - Math.pow(1 - progress, 3)
			const currentValue = easeOutCubic * target

			setCount(currentValue)

			if (progress < 1) {
				rafRef.current = requestAnimationFrame(animate)
			}
		}

		startTimeRef.current = null
		rafRef.current = requestAnimationFrame(animate)

		return () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current)
			}
		}
	}, [target, duration])

	return parseFloat(count.toFixed(decimals))
}

// Sparkline component for mini trends
interface SparklineProps {
	data: number[]
	color?: string
	height?: number
	width?: number
}

function Sparkline({ data, color = "#10b981", height = 24, width = 60 }: SparklineProps) {
	if (!data || data.length < 2) return null

	const min = Math.min(...data)
	const max = Math.max(...data)
	const range = max - min || 1

	const points = data
		.map((value, index) => {
			const x = (index / (data.length - 1)) * width
			const y = height - ((value - min) / range) * height
			return `${x},${y}`
		})
		.join(" ")

	return (
		<svg width={width} height={height} className="overflow-visible">
			<polyline
				points={points}
				fill="none"
				stroke={color}
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{/* End dot */}
			<circle
				cx={(data.length - 1) / (data.length - 1) * width}
				cy={height - ((data[data.length - 1] - min) / range) * height}
				r="3"
				fill={color}
			/>
		</svg>
	)
}

// Color theme presets
export type ColorTheme =
	| "emerald"
	| "green"
	| "blue"
	| "purple"
	| "amber"
	| "red"
	| "indigo"
	| "pink"
	| "teal"
	| "orange"

const colorThemes: Record<ColorTheme, {
	from: string
	via: string
	to: string
	accent: string
	text: string
	textDark: string
	bg: string
	bgDark: string
	border: string
	borderDark: string
}> = {
	emerald: {
		from: "from-emerald-50",
		via: "via-emerald-100",
		to: "to-teal-100",
		accent: "bg-emerald-200/30 dark:bg-emerald-700/20",
		text: "text-emerald-600 dark:text-emerald-400",
		textDark: "text-emerald-700 dark:text-emerald-300",
		bg: "bg-emerald-200/50 dark:bg-emerald-800/30",
		bgDark: "dark:from-emerald-900/30 dark:via-emerald-800/20 dark:to-teal-900/20",
		border: "border-emerald-200/50",
		borderDark: "dark:border-emerald-700/50"
	},
	green: {
		from: "from-green-50",
		via: "via-green-100",
		to: "to-lime-100",
		accent: "bg-green-200/30 dark:bg-green-700/20",
		text: "text-green-600 dark:text-green-400",
		textDark: "text-green-700 dark:text-green-300",
		bg: "bg-green-200/50 dark:bg-green-800/30",
		bgDark: "dark:from-green-900/30 dark:via-green-800/20 dark:to-lime-900/20",
		border: "border-green-200/50",
		borderDark: "dark:border-green-700/50"
	},
	blue: {
		from: "from-blue-50",
		via: "via-blue-100",
		to: "to-indigo-100",
		accent: "bg-blue-200/30 dark:bg-blue-700/20",
		text: "text-blue-600 dark:text-blue-400",
		textDark: "text-blue-700 dark:text-blue-300",
		bg: "bg-blue-200/50 dark:bg-blue-800/30",
		bgDark: "dark:from-blue-900/30 dark:via-blue-800/20 dark:to-indigo-900/20",
		border: "border-blue-200/50",
		borderDark: "dark:border-blue-700/50"
	},
	purple: {
		from: "from-purple-50",
		via: "via-purple-100",
		to: "to-violet-100",
		accent: "bg-purple-200/30 dark:bg-purple-700/20",
		text: "text-purple-600 dark:text-purple-400",
		textDark: "text-purple-700 dark:text-purple-300",
		bg: "bg-purple-200/50 dark:bg-purple-800/30",
		bgDark: "dark:from-purple-900/30 dark:via-purple-800/20 dark:to-violet-900/20",
		border: "border-purple-200/50",
		borderDark: "dark:border-purple-700/50"
	},
	amber: {
		from: "from-amber-50",
		via: "via-amber-100",
		to: "to-yellow-100",
		accent: "bg-amber-200/30 dark:bg-amber-700/20",
		text: "text-amber-600 dark:text-amber-400",
		textDark: "text-amber-700 dark:text-amber-300",
		bg: "bg-amber-200/50 dark:bg-amber-800/30",
		bgDark: "dark:from-amber-900/30 dark:via-amber-800/20 dark:to-yellow-900/20",
		border: "border-amber-200/50",
		borderDark: "dark:border-amber-700/50"
	},
	red: {
		from: "from-red-50",
		via: "via-red-100",
		to: "to-rose-100",
		accent: "bg-red-200/30 dark:bg-red-700/20",
		text: "text-red-600 dark:text-red-400",
		textDark: "text-red-700 dark:text-red-300",
		bg: "bg-red-200/50 dark:bg-red-800/30",
		bgDark: "dark:from-red-900/30 dark:via-red-800/20 dark:to-rose-900/20",
		border: "border-red-200/50",
		borderDark: "dark:border-red-700/50"
	},
	indigo: {
		from: "from-indigo-50",
		via: "via-indigo-100",
		to: "to-blue-100",
		accent: "bg-indigo-200/30 dark:bg-indigo-700/20",
		text: "text-indigo-600 dark:text-indigo-400",
		textDark: "text-indigo-700 dark:text-indigo-300",
		bg: "bg-indigo-200/50 dark:bg-indigo-800/30",
		bgDark: "dark:from-indigo-900/30 dark:via-indigo-800/20 dark:to-blue-900/20",
		border: "border-indigo-200/50",
		borderDark: "dark:border-indigo-700/50"
	},
	pink: {
		from: "from-pink-50",
		via: "via-pink-100",
		to: "to-rose-100",
		accent: "bg-pink-200/30 dark:bg-pink-700/20",
		text: "text-pink-600 dark:text-pink-400",
		textDark: "text-pink-700 dark:text-pink-300",
		bg: "bg-pink-200/50 dark:bg-pink-800/30",
		bgDark: "dark:from-pink-900/30 dark:via-pink-800/20 dark:to-rose-900/20",
		border: "border-pink-200/50",
		borderDark: "dark:border-pink-700/50"
	},
	teal: {
		from: "from-teal-50",
		via: "via-teal-100",
		to: "to-cyan-100",
		accent: "bg-teal-200/30 dark:bg-teal-700/20",
		text: "text-teal-600 dark:text-teal-400",
		textDark: "text-teal-700 dark:text-teal-300",
		bg: "bg-teal-200/50 dark:bg-teal-800/30",
		bgDark: "dark:from-teal-900/30 dark:via-teal-800/20 dark:to-cyan-900/20",
		border: "border-teal-200/50",
		borderDark: "dark:border-teal-700/50"
	},
	orange: {
		from: "from-orange-50",
		via: "via-orange-100",
		to: "to-amber-100",
		accent: "bg-orange-200/30 dark:bg-orange-700/20",
		text: "text-orange-600 dark:text-orange-400",
		textDark: "text-orange-700 dark:text-orange-300",
		bg: "bg-orange-200/50 dark:bg-orange-800/30",
		bgDark: "dark:from-orange-900/30 dark:via-orange-800/20 dark:to-amber-900/20",
		border: "border-orange-200/50",
		borderDark: "dark:border-orange-700/50"
	}
}

export interface AnimatedStatCardProps {
	title: string
	value: number
	suffix?: string
	prefix?: string
	subtitle?: string
	icon: LucideIcon
	colorTheme: ColorTheme
	trend?: {
		value: number
		isPositive: boolean
		label?: string
	}
	sparklineData?: number[]
	showProgress?: boolean
	progressMax?: number
	onClick?: () => void
	className?: string
	decimals?: number
	animationDuration?: number
}

export function AnimatedStatCard({
	title,
	value,
	suffix = "",
	prefix = "",
	subtitle,
	icon: Icon,
	colorTheme,
	trend,
	sparklineData,
	showProgress = false,
	progressMax = 100,
	onClick,
	className,
	decimals = 0,
	animationDuration = 1200
}: AnimatedStatCardProps) {
	const theme = colorThemes[colorTheme]
	const animatedValue = useAnimatedCounter(value, animationDuration, decimals)

	const TrendIcon = trend
		? trend.value === 0
			? Minus
			: trend.isPositive
				? TrendingUp
				: TrendingDown
		: null

	return (
		<Card
			className={cn(
				"group relative overflow-hidden transition-all duration-300",
				`bg-gradient-to-br ${theme.from} ${theme.via} ${theme.to} ${theme.bgDark}`,
				`${theme.border} ${theme.borderDark}`,
				"hover:shadow-lg hover:scale-[1.02]",
				onClick && "cursor-pointer",
				className
			)}
			onClick={onClick}
		>
			{/* Decorative circle */}
			<div
				className={cn(
					"absolute top-0 right-0 w-20 h-20 rounded-full -mr-8 -mt-8",
					"group-hover:scale-125 transition-transform duration-500",
					theme.accent
				)}
			/>

			<CardContent className="p-4 relative">
				<div className="flex items-start justify-between">
					<div className="flex-1 min-w-0">
						{/* Title */}
						<p className={cn(
							"text-[10px] uppercase tracking-wider font-semibold mb-1",
							theme.text
						)}>
							{title}
						</p>

						{/* Value with animation */}
						<p className={cn(
							"text-2xl font-bold tabular-nums truncate",
							theme.textDark
						)}>
							{prefix}{animatedValue.toLocaleString()}{suffix}
						</p>

						{/* Trend indicator */}
						{trend && TrendIcon && (
							<div className="flex items-center gap-1 mt-1">
								<TrendIcon
									className={cn(
										"h-3 w-3",
										trend.isPositive ? "text-green-500" : "text-red-500"
									)}
								/>
								<span className={cn(
									"text-[10px] font-medium",
									trend.isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
								)}>
									{trend.value > 0 ? "+" : ""}{trend.value}%
									{trend.label && ` ${trend.label}`}
								</span>
							</div>
						)}

						{/* Subtitle */}
						{subtitle && !trend && (
							<div className={cn("flex items-center gap-1 mt-1", theme.text)}>
								<span className="text-[10px]">{subtitle}</span>
							</div>
						)}

						{/* Sparkline */}
						{sparklineData && sparklineData.length > 1 && (
							<div className="mt-2">
								<Sparkline
									data={sparklineData}
									color={colorTheme === "red" ? "#ef4444" : "#10b981"}
								/>
							</div>
						)}

						{/* Progress bar */}
						{showProgress && (
							<Progress
								value={(value / progressMax) * 100}
								className={cn("h-1.5 mt-2", theme.bg)}
							/>
						)}
					</div>

					{/* Icon */}
					<div className={cn(
						"h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0",
						theme.bg
					)}>
						<Icon className={cn("h-6 w-6", theme.text)} />
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

// Compact variant for dense layouts
export function AnimatedStatCardCompact({
	title,
	value,
	suffix = "",
	icon: Icon,
	colorTheme,
	className
}: Omit<AnimatedStatCardProps, 'trend' | 'sparklineData' | 'showProgress' | 'progressMax' | 'onClick' | 'subtitle' | 'prefix' | 'decimals' | 'animationDuration'>) {
	const theme = colorThemes[colorTheme]
	const animatedValue = useAnimatedCounter(value, 800, 0)

	return (
		<div className={cn(
			"flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
			`bg-gradient-to-br ${theme.from} ${theme.via} ${theme.to} ${theme.bgDark}`,
			`${theme.border} ${theme.borderDark}`,
			"hover:shadow-md",
			className
		)}>
			<div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", theme.bg)}>
				<Icon className={cn("h-5 w-5", theme.text)} />
			</div>
			<div>
				<p className={cn("text-[10px] uppercase tracking-wider font-semibold", theme.text)}>
					{title}
				</p>
				<p className={cn("text-xl font-bold tabular-nums", theme.textDark)}>
					{animatedValue.toLocaleString()}{suffix}
				</p>
			</div>
		</div>
	)
}

// Export the hook for external use
export { useAnimatedCounter, Sparkline }
