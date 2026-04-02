'use client'

import { useState, memo } from 'react'
import { Calendar, Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from '@/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { useExaminationSession, ExaminationSession } from '@/context/examination-session-context'

interface SessionSelectorProps {
	variant?: 'default' | 'compact'
	className?: string
}

export const SessionSelector = memo(function SessionSelector({
	variant = 'compact',
	className,
}: SessionSelectorProps) {
	const {
		currentSession,
		availableSessions,
		isLoading,
		selectSession,
		clearSessionSelection,
	} = useExaminationSession()

	const [open, setOpen] = useState(false)

	if (isLoading && availableSessions.length === 0) {
		return (
			<div className={cn('flex items-center gap-1.5 px-2 py-1 text-white/70 text-xs', className)}>
				<Calendar className="h-3.5 w-3.5 animate-pulse" />
				<span>Loading...</span>
			</div>
		)
	}

	if (availableSessions.length === 0) return null

	const getStatusColor = (status?: string) => {
		switch (status?.toLowerCase()) {
			case 'active': return 'bg-emerald-400'
			case 'planned': return 'bg-amber-400'
			case 'completed': return 'bg-slate-400'
			default: return 'bg-slate-400'
		}
	}

	if (variant === 'compact') {
		return (
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						className={cn(
							'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
							'bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm',
							'cursor-pointer select-none',
							className
						)}
					>
						<Calendar className="h-3.5 w-3.5 text-white/80" />
						<span className="hidden sm:inline max-w-[120px] truncate">
							{currentSession?.session_code || 'All Sessions'}
						</span>
						<ChevronsUpDown className="h-3 w-3 text-white/60" />
					</button>
				</PopoverTrigger>
				<PopoverContent className="w-[320px] p-0" align="end">
					<Command>
						<div className="flex items-center justify-between px-3 pt-3 pb-1">
							<div className="flex items-center gap-2">
								<Calendar className="h-4 w-4 text-emerald-600" />
								<span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Exam Session</span>
							</div>
							<span className="text-xs text-muted-foreground">{availableSessions.length}</span>
						</div>
						<div className="px-2 py-1.5">
							<CommandInput placeholder="Search sessions..." className="h-8" />
						</div>
						<CommandList className="max-h-[250px]">
							<CommandEmpty>No sessions found.</CommandEmpty>
							<CommandGroup>
								<CommandItem
									value="all-sessions"
									onSelect={() => {
										clearSessionSelection()
										setOpen(false)
									}}
									className="cursor-pointer"
								>
									<div className="flex items-center gap-2 w-full">
										<div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
											<Calendar className="h-3.5 w-3.5 text-slate-500" />
										</div>
										<div>
											<span className="font-medium text-sm">All Sessions</span>
											<p className="text-xs text-muted-foreground">View data across all sessions</p>
										</div>
										{!currentSession && <Check className="ml-auto h-4 w-4 text-emerald-600" />}
									</div>
								</CommandItem>
							</CommandGroup>
							<CommandSeparator />
							<CommandGroup>
								{availableSessions.map((session) => (
									<CommandItem
										key={session.id}
										value={`${session.session_code} ${session.session_name}`}
										onSelect={() => {
											selectSession(session)
											setOpen(false)
										}}
										className="cursor-pointer"
									>
										<div className="flex items-center gap-2 w-full">
											<div className={cn(
												'w-2 h-2 rounded-full',
												getStatusColor(session.session_status)
											)} />
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-1.5">
													<span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
														{session.session_code}
													</span>
													{session.session_status && (
														<span className={cn(
															'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
															session.session_status === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
															session.session_status === 'Planned' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
															'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
														)}>
															{session.session_status}
														</span>
													)}
												</div>
												{session.academic_year && (
													<span className="text-xs text-muted-foreground">{session.academic_year}</span>
												)}
											</div>
											{currentSession?.id === session.id && (
												<Check className="ml-auto h-4 w-4 text-emerald-600 flex-shrink-0" />
											)}
										</div>
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		)
	}

	// Default variant (for sidebar if needed later)
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left', className)}>
					<Calendar className="h-4 w-4 text-emerald-600" />
					<div className="flex-1 min-w-0">
						<div className="text-sm font-medium truncate">
							{currentSession?.session_name || 'All Sessions'}
						</div>
						{currentSession?.session_code && (
							<div className="text-xs text-muted-foreground">{currentSession.session_code}</div>
						)}
					</div>
					<ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-[320px] p-0">
				<Command>
					<CommandInput placeholder="Search sessions..." />
					<CommandList>
						<CommandEmpty>No sessions found.</CommandEmpty>
						<CommandGroup>
							<CommandItem onSelect={() => { clearSessionSelection(); setOpen(false) }}>
								<Calendar className="h-4 w-4 mr-2" />
								All Sessions
								{!currentSession && <Check className="ml-auto h-4 w-4" />}
							</CommandItem>
						</CommandGroup>
						<CommandSeparator />
						<CommandGroup>
							{availableSessions.map((session) => (
								<CommandItem
									key={session.id}
									value={`${session.session_code} ${session.session_name}`}
									onSelect={() => { selectSession(session); setOpen(false) }}
								>
									<div className={cn('w-2 h-2 rounded-full mr-2', getStatusColor(session.session_status))} />
									<span className="font-mono text-sm">{session.session_code}</span>
									<span className="ml-2 text-xs text-muted-foreground">{session.session_name}</span>
									{currentSession?.id === session.id && <Check className="ml-auto h-4 w-4" />}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
})
