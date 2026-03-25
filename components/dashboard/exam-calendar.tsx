'use client'

import { useState, useMemo, useCallback, memo } from 'react'
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { CoeCalendarEvent, CoeCalendarCategory, COE_CATEGORY_CONFIG } from '@/types/coe-calendar'

interface CalendarExam {
	id: string
	exam_date: string
	session: string
	exam_mode: string
	institution_name: string
	session_name: string
	course_code: string
	course_name: string
}

interface ExamCalendarProps {
	exams: CalendarExam[]
	calendarEvents?: CoeCalendarEvent[]
	showInstitution?: boolean
	loading?: boolean
}

type CalendarView = 'today' | 'week' | 'month'

const DAYS = [
	{ label: 'Mon', color: 'text-blue-600 dark:text-blue-400' },
	{ label: 'Tue', color: 'text-purple-600 dark:text-purple-400' },
	{ label: 'Wed', color: 'text-emerald-600 dark:text-emerald-400' },
	{ label: 'Thu', color: 'text-amber-600 dark:text-amber-400' },
	{ label: 'Fri', color: 'text-rose-600 dark:text-rose-400' },
	{ label: 'Sat', color: 'text-teal-600 dark:text-teal-400' },
	{ label: 'Sun', color: 'text-orange-600 dark:text-orange-400' },
]
const MONTHS = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
]

function getDaysInMonth(year: number, month: number) {
	return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
	const day = new Date(year, month, 1).getDay()
	return day === 0 ? 6 : day - 1
}

function formatDateStr(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Exam mode colors — dot + chip bg + chip text
const examModeStyles: Record<string, { dot: string; bg: string; text: string }> = {
	'Written':   { dot: 'bg-blue-500',    bg: 'bg-blue-50 dark:bg-blue-500/10',    text: 'text-blue-700 dark:text-blue-400' },
	'Online':    { dot: 'bg-purple-500',   bg: 'bg-purple-50 dark:bg-purple-500/10', text: 'text-purple-700 dark:text-purple-400' },
	'Practical': { dot: 'bg-amber-500',    bg: 'bg-amber-50 dark:bg-amber-500/10',   text: 'text-amber-700 dark:text-amber-400' },
	'Viva':      { dot: 'bg-rose-500',     bg: 'bg-rose-50 dark:bg-rose-500/10',     text: 'text-rose-700 dark:text-rose-400' },
	'default':   { dot: 'bg-emerald-500',  bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
}

const VIEW_LABELS: Record<CalendarView, string> = {
	today: 'Today',
	week: 'Week',
	month: 'Month',
}

export const ExamCalendar = memo(function ExamCalendar({
	exams,
	calendarEvents = [],
	showInstitution = false,
	loading,
}: ExamCalendarProps) {
	const [currentDate, setCurrentDate] = useState(new Date())
	const [view, setView] = useState<CalendarView>('month')
	const currentYear = currentDate.getFullYear()
	const currentMonth = currentDate.getMonth()

	const today = new Date()
	const todayStr = formatDateStr(today)

	const isToday = (day: number) =>
		day === today.getDate() &&
		currentMonth === today.getMonth() &&
		currentYear === today.getFullYear()

	// ── Current week range (Mon–Sun) ────────────────────────────────
	const weekRange = useMemo(() => {
		const dayOfWeek = today.getDay() // 0=Sun
		const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
		const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset)
		const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
		return { monday, sunday }
	}, [today.getFullYear(), today.getMonth(), today.getDate()])

	const isInCurrentWeek = useCallback((year: number, month: number, day: number) => {
		const date = new Date(year, month, day)
		return date >= weekRange.monday && date <= weekRange.sunday
	}, [weekRange])

	// ── Event maps ──────────────────────────────────────────────────
	const examsByDate = useMemo(() => {
		const map = new Map<string, CalendarExam[]>()
		for (const exam of exams) {
			const date = exam.exam_date
			if (!map.has(date)) map.set(date, [])
			map.get(date)!.push(exam)
		}
		return map
	}, [exams])

	const coeEventsByDate = useMemo(() => {
		const map = new Map<string, CoeCalendarEvent[]>()
		for (const event of calendarEvents) {
			const start = new Date(event.event_start_date + 'T00:00:00')
			const end = new Date(event.event_end_date + 'T00:00:00')
			const cursor = new Date(start)
			while (cursor <= end) {
				const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
				if (!map.has(dateStr)) map.set(dateStr, [])
				map.get(dateStr)!.push(event)
				cursor.setDate(cursor.getDate() + 1)
			}
		}
		return map
	}, [calendarEvents])

	const getEventsForDay = useCallback((day: number) => {
		const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
		return {
			exams: examsByDate.get(dateStr) || [],
			coeEvents: coeEventsByDate.get(dateStr) || [],
		}
	}, [currentYear, currentMonth, examsByDate, coeEventsByDate])

	// ── Calendar grid data ──────────────────────────────────────────
	const daysInMonth = getDaysInMonth(currentYear, currentMonth)
	const firstDay = getFirstDayOfMonth(currentYear, currentMonth)
	const prevMonthDays = getDaysInMonth(currentYear, currentMonth - 1)

	const prevMonth = useCallback(() => {
		setCurrentDate(new Date(currentYear, currentMonth - 1, 1))
		if (view !== 'month') setView('month')
	}, [currentYear, currentMonth, view])

	const nextMonth = useCallback(() => {
		setCurrentDate(new Date(currentYear, currentMonth + 1, 1))
		if (view !== 'month') setView('month')
	}, [currentYear, currentMonth, view])

	const handleViewChange = useCallback((newView: CalendarView) => {
		setView(newView)
		if (newView === 'today' || newView === 'week') {
			setCurrentDate(new Date())
		}
	}, [])

	const calendarDays = useMemo(() => {
		const days: Array<{
			day: number
			isCurrentMonth: boolean
			exams: CalendarExam[]
			coeEvents: CoeCalendarEvent[]
		}> = []

		for (let i = firstDay - 1; i >= 0; i--) {
			days.push({ day: prevMonthDays - i, isCurrentMonth: false, exams: [], coeEvents: [] })
		}
		for (let day = 1; day <= daysInMonth; day++) {
			const { exams, coeEvents } = getEventsForDay(day)
			days.push({ day, isCurrentMonth: true, exams, coeEvents })
		}
		const remaining = 42 - days.length
		for (let i = 1; i <= remaining; i++) {
			days.push({ day: i, isCurrentMonth: false, exams: [], coeEvents: [] })
		}

		return days
	}, [firstDay, prevMonthDays, daysInMonth, getEventsForDay])

	const totalEventsThisMonth = useMemo(() =>
		calendarDays
			.filter(d => d.isCurrentMonth)
			.reduce((n, d) => n + d.exams.length + d.coeEvents.length, 0),
		[calendarDays]
	)

	// ── Filtered events for Today / Week panel ──────────────────────
	interface EventGroup {
		dateStr: string
		label: string
		isToday: boolean
		exams: CalendarExam[]
		coeEvents: CoeCalendarEvent[]
	}

	const viewEvents = useMemo((): EventGroup[] => {
		if (view === 'month') return []

		if (view === 'today') {
			const dayExams = examsByDate.get(todayStr) || []
			const dayCoeEvents = coeEventsByDate.get(todayStr) || []
			return [{
				dateStr: todayStr,
				label: today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
				isToday: true,
				exams: dayExams,
				coeEvents: dayCoeEvents,
			}]
		}

		// week view — collect events for Mon–Sun
		const groups: EventGroup[] = []
		const cursor = new Date(weekRange.monday)
		for (let i = 0; i < 7; i++) {
			const dateStr = formatDateStr(cursor)
			const dayExams = examsByDate.get(dateStr) || []
			const dayCoeEvents = coeEventsByDate.get(dateStr) || []
			if (dayExams.length > 0 || dayCoeEvents.length > 0) {
				groups.push({
					dateStr,
					label: cursor.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
					isToday: dateStr === todayStr,
					exams: dayExams,
					coeEvents: dayCoeEvents,
				})
			}
			cursor.setDate(cursor.getDate() + 1)
		}
		return groups
	}, [view, examsByDate, coeEventsByDate, weekRange, todayStr])

	const totalViewEvents = useMemo(() =>
		viewEvents.reduce((n, g) => n + g.exams.length + g.coeEvents.length, 0),
		[viewEvents]
	)

	// ── Loading skeleton ────────────────────────────────────────────
	if (loading) {
		return (
			<div className="bg-white dark:bg-slate-950/50 rounded-xl border overflow-hidden animate-pulse">
				<div className="px-6 py-4 border-b flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="h-9 w-9 rounded-lg bg-muted" />
						<div className="space-y-1.5">
							<div className="h-4 w-32 bg-muted rounded" />
							<div className="h-3 w-20 bg-muted rounded" />
						</div>
					</div>
					<div className="flex items-center gap-2">
						<div className="h-7 w-44 bg-muted rounded-lg" />
						<div className="h-8 w-8 bg-muted rounded-lg" />
						<div className="h-4 w-32 bg-muted rounded" />
						<div className="h-8 w-8 bg-muted rounded-lg" />
					</div>
				</div>
				<div className="grid grid-cols-7 border-b">
					{DAYS.map(d => (
						<div key={d.label} className="py-2.5 text-center">
							<div className="h-3 w-8 bg-muted rounded mx-auto" />
						</div>
					))}
				</div>
				<div className="grid grid-cols-7">
					{Array.from({ length: 35 }).map((_, i) => (
						<div key={i} className={cn(
							'min-h-[100px] p-2',
							i % 7 > 0 && 'border-l border-border/50',
							Math.floor(i / 7) > 0 && 'border-t border-border/50',
						)}>
							<div className="h-5 w-5 bg-muted rounded-full ml-auto" />
						</div>
					))}
				</div>
			</div>
		)
	}

	// ── Week label for subtitle ─────────────────────────────────────
	const weekLabel = view === 'week'
		? `${weekRange.monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekRange.sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
		: null

	return (
		<div className="bg-white dark:bg-slate-950/50 rounded-xl border overflow-hidden">

			{/* ── Header ─────────────────────────────────────── */}
			<div className="px-6 py-4 flex items-center justify-between border-b">
				<div className="flex items-center gap-3">
					<div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
						<Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
					</div>
					<div>
						<h3 className="text-base font-semibold">Exam Schedule</h3>
						<p className="text-xs text-muted-foreground">
							{view === 'today'
								? `${totalViewEvents} event${totalViewEvents !== 1 ? 's' : ''} today`
								: view === 'week'
									? `${totalViewEvents} event${totalViewEvents !== 1 ? 's' : ''} this week · ${weekLabel}`
									: `${totalEventsThisMonth} event${totalEventsThisMonth !== 1 ? 's' : ''} this month`
							}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-3">
					{/* View toggle — segmented control */}
					<div className="flex items-center rounded-lg border p-0.5 bg-muted/40">
						{(['today', 'week', 'month'] as const).map(v => (
							<button
								type="button"
								key={v}
								onClick={() => handleViewChange(v)}
								className={cn(
									'px-3 py-1 text-xs font-medium rounded-md transition-all',
									view === v
										? 'bg-white dark:bg-slate-800 text-foreground shadow-sm'
										: 'text-muted-foreground hover:text-foreground'
								)}
							>
								{VIEW_LABELS[v]}
							</button>
						))}
					</div>

					{/* Month navigation — only in month view */}
					{view === 'month' && (
						<div className="flex items-center gap-0.5">
							<button
								type="button"
								title="Previous month"
								onClick={prevMonth}
								className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted/80 transition-colors"
							>
								<ChevronLeft className="h-4 w-4 text-muted-foreground" />
							</button>
							<span className="text-sm font-semibold min-w-[150px] text-center tabular-nums">
								{MONTHS[currentMonth]} {currentYear}
							</span>
							<button
								type="button"
								title="Next month"
								onClick={nextMonth}
								className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted/80 transition-colors"
							>
								<ChevronRight className="h-4 w-4 text-muted-foreground" />
							</button>
						</div>
					)}
				</div>
			</div>

			{/* ── Month Grid (hidden in today/week views) ────── */}
			{view === 'month' && <>
			<div className="grid grid-cols-7 border-b bg-white dark:bg-transparent">
				{DAYS.map((d, i) => (
					<div
						key={d.label}
						className={cn(
							'py-2.5 text-center text-xs font-bold uppercase tracking-wider',
							d.color,
							i > 0 && 'border-l border-border/50'
						)}
					>
						{d.label}
					</div>
				))}
			</div>

			{/* ── Calendar Grid ───────────────────────────────── */}
			<div className="grid grid-cols-7">
				{calendarDays.map((cell, index) => {
					const hasExams = cell.isCurrentMonth && cell.exams.length > 0
					const hasCoeEvents = cell.isCurrentMonth && cell.coeEvents.length > 0
					const hasAnyEvents = hasExams || hasCoeEvents
					const isTodayCell = cell.isCurrentMonth && isToday(cell.day)
					const isWeekend = index % 7 >= 5
					const rowIndex = Math.floor(index / 7)
					const colIndex = index % 7

					// View-based highlighting
					const inWeekHighlight = view === 'week' && cell.isCurrentMonth && isInCurrentWeek(currentYear, currentMonth, cell.day)
					const isTodayHighlight = view === 'today' && isTodayCell

					const MAX_CHIPS = 3
					const totalChips = cell.exams.length + cell.coeEvents.length
					const overflowCount = Math.max(0, totalChips - MAX_CHIPS)

					const examChips = cell.exams.slice(0, MAX_CHIPS).map(e => ({ type: 'exam' as const, data: e }))
					const coeChips = cell.coeEvents
						.slice(0, Math.max(0, MAX_CHIPS - cell.exams.length))
						.map(e => ({ type: 'coe' as const, data: e }))
					const chips = [...examChips, ...coeChips]

					const cellBody = (
						<div className="p-1.5 flex flex-col h-full min-h-[100px]">
							{/* Day number — right-aligned */}
							<div className="flex justify-end mb-1">
								<span className={cn(
									'text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full transition-colors',
									isTodayCell
										? 'bg-emerald-500 text-white font-bold shadow-sm shadow-emerald-500/30'
										: !cell.isCurrentMonth
											? 'text-muted-foreground/40'
											: colIndex === 6
												? 'text-orange-500 dark:text-orange-400 font-semibold'
												: 'text-foreground'
								)}>
									{cell.day}
								</span>
							</div>

							{/* Event chips */}
							<div className="flex flex-col gap-0.5 flex-1">
								{chips.map((chip, i) => {
									if (chip.type === 'exam') {
										const exam = chip.data as CalendarExam
										const style = examModeStyles[exam.exam_mode] || examModeStyles['default']
										return (
											<div
												key={`exam-${i}`}
												className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium truncate', style.bg, style.text)}
												title={exam.course_name}
											>
												<div className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', style.dot)} />
												<span className="truncate">{exam.course_code}</span>
											</div>
										)
									}

									const event = chip.data as CoeCalendarEvent
									const config = COE_CATEGORY_CONFIG[event.exam_category as CoeCalendarCategory]
									const shortTitle = event.event_title
										.replace(' - Last Date', '')
										.replace('Last date for ', '')
										.replace('Commencement', 'Start')
									return (
										<div
											key={`coe-${i}`}
											className={cn(
												'px-1.5 py-0.5 rounded text-xs font-semibold truncate leading-tight',
												config.bgColor,
												config.textColor
											)}
											title={event.event_title}
										>
											{shortTitle}
										</div>
									)
								})}

								{overflowCount > 0 && (
									<span className="text-xs text-muted-foreground px-1.5 font-medium">
										+{overflowCount} more
									</span>
								)}
							</div>
						</div>
					)

					return (
						<div
							key={index}
							className={cn(
								'transition-colors',
								// Grid borders
								colIndex > 0 && 'border-l border-border/50',
								rowIndex > 0 && 'border-t border-border/50',
								// Background states — view highlights take priority
								isTodayHighlight
									? 'bg-emerald-50 dark:bg-emerald-950/30 ring-2 ring-inset ring-emerald-400/50'
									: inWeekHighlight
										? 'bg-emerald-50/40 dark:bg-emerald-950/15'
										: isTodayCell
											? 'bg-emerald-50/50 dark:bg-emerald-950/20'
											: !cell.isCurrentMonth
												? 'bg-muted/20'
												: 'bg-white dark:bg-transparent'
							)}
						>
							{hasAnyEvents ? (
								<Popover>
									<PopoverTrigger asChild>
										<button type="button" title="View events" className="w-full h-full text-left hover:bg-muted/50 dark:hover:bg-white/5 transition-colors">
											{cellBody}
										</button>
									</PopoverTrigger>
									<PopoverContent
										className="w-80 p-0 shadow-xl"
										align="center"
										sideOffset={4}
									>
										<div className="px-4 py-3 border-b bg-muted/30">
											<p className="text-sm font-semibold">
												{new Date(currentYear, currentMonth, cell.day).toLocaleDateString('en-US', {
													weekday: 'long', month: 'long', day: 'numeric',
												})}
											</p>
											<p className="text-xs text-muted-foreground mt-0.5">
												{cell.exams.length + cell.coeEvents.length} event{cell.exams.length + cell.coeEvents.length !== 1 ? 's' : ''}
											</p>
										</div>

										<div className="p-2 max-h-72 overflow-y-auto space-y-1.5">
											{cell.exams.map(exam => {
												const style = examModeStyles[exam.exam_mode] || examModeStyles['default']
												return (
													<div key={exam.id} className={cn('p-3 rounded-lg space-y-1.5', style.bg)}>
														<div className="flex items-start gap-2">
															<div className={cn('h-2 w-2 rounded-full mt-1.5 flex-shrink-0', style.dot)} />
															<div className="flex-1 min-w-0">
																<p className={cn('text-sm font-semibold', style.text)}>{exam.course_code}</p>
																<p className="text-xs text-muted-foreground line-clamp-1">{exam.course_name}</p>
															</div>
														</div>
														<div className="flex items-center gap-2 pl-4 flex-wrap">
															<div className="flex items-center gap-1 text-xs text-muted-foreground">
																<Clock className="h-3 w-3" />
																{exam.session}
															</div>
															<Badge className={cn('text-xs py-0 h-5 border-0', style.bg, style.text)}>
																{exam.exam_mode}
															</Badge>
														</div>
													</div>
												)
											})}

											{cell.coeEvents.map(event => {
												const config = COE_CATEGORY_CONFIG[event.exam_category as CoeCalendarCategory]
												return (
													<div
														key={event.id}
														className={cn('p-3 rounded-lg space-y-1', config.bgColor)}
													>
														<div className="flex items-start gap-2">
															<div className={cn('h-2 w-2 rounded-full mt-1.5 flex-shrink-0', config.color)} />
															<div>
																<p className={cn('text-sm font-semibold', config.textColor)}>
																	{event.event_title}
																</p>
																<p className="text-xs text-muted-foreground mt-0.5">
																	{config.label} · {event.programme_type} · {event.academic_year}
																	{showInstitution && event.institution_code ? ` · ${event.institution_code}` : ''}
																</p>
																{event.event_description && (
																	<p className="text-xs text-muted-foreground mt-1">
																		{event.event_description}
																	</p>
																)}
															</div>
														</div>
													</div>
												)
											})}
										</div>
									</PopoverContent>
								</Popover>
							) : (
								<div className={cn(!cell.isCurrentMonth && 'opacity-40')}>
									{cellBody}
								</div>
							)}
						</div>
					)
				})}
			</div>
			</>}

			{/* ── Events Summary Panel (Today / Week views) ──── */}
			{view !== 'month' && (
				<div>
					<div className="px-5 py-3 flex items-center justify-between bg-muted/20">
						<h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							{view === 'today' ? "Today's Events" : "This Week's Events"}
						</h4>
						<span className="text-xs text-muted-foreground">
							{totalViewEvents} event{totalViewEvents !== 1 ? 's' : ''}
						</span>
					</div>

					{totalViewEvents === 0 ? (
						<div className="px-5 py-8 text-center">
							<Calendar className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
							<p className="text-sm text-muted-foreground">No events scheduled</p>
						</div>
					) : (
						<div className="max-h-72 overflow-y-auto">
							{viewEvents.map((group) => (
								<div key={group.dateStr}>
									{/* Date header — only show for week view (today view has single group) */}
									{view === 'week' && (
										<div className="flex items-center gap-2 px-5 py-2 bg-muted/10 border-b">
											<span className={cn(
												'text-xs font-semibold',
												group.isToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
											)}>
												{group.label}
											</span>
											{group.isToday && (
												<Badge className="text-xs py-0 h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-0">
													Today
												</Badge>
											)}
										</div>
									)}

									{/* Exam events */}
									{group.exams.map(exam => {
										const style = examModeStyles[exam.exam_mode] || examModeStyles['default']
										return (
											<div
												key={exam.id}
												className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/30 transition-colors border-b border-border/30 last:border-b-0"
											>
												<div className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', style.dot)} />
												<div className="flex-1 min-w-0">
													<p className="text-sm font-medium truncate">
														<span className={style.text}>{exam.course_code}</span>
														<span className="text-muted-foreground font-normal"> · {exam.course_name}</span>
													</p>
												</div>
												<div className="flex items-center gap-2 flex-shrink-0">
													<div className="flex items-center gap-1 text-xs text-muted-foreground">
														<Clock className="h-3 w-3" />
														{exam.session}
													</div>
													<Badge className={cn('text-xs py-0 h-5 border-0', style.bg, style.text)}>
														{exam.exam_mode}
													</Badge>
												</div>
											</div>
										)
									})}

									{/* COE Calendar events */}
									{group.coeEvents.map(event => {
										const config = COE_CATEGORY_CONFIG[event.exam_category as CoeCalendarCategory]
										return (
											<div
												key={event.id}
												className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/30 transition-colors border-b border-border/30 last:border-b-0"
											>
												<div className={cn('h-2 w-2 rounded-full flex-shrink-0', config.color)} />
												<div className="flex-1 min-w-0">
													<p className={cn('text-sm font-medium truncate', config.textColor)}>
														{event.event_title}
													</p>
												</div>
												<span className="text-xs text-muted-foreground flex-shrink-0">
													{config.label}
												</span>
											</div>
										)
									})}
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	)
})
