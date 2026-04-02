'use client'

import { useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useExaminationSession } from '@/context/examination-session-context'

interface SessionOption {
	id: string
	session_name?: string
	session_code?: string
	[key: string]: unknown
}

interface SessionFilterSelectProps {
	/** Current filter value ("all" or session ID) */
	value: string
	/** Callback when filter changes */
	onValueChange: (value: string) => void
	/** Available sessions */
	sessions: SessionOption[]
	/** Class name */
	className?: string
}

/**
 * SessionFilterSelect - For table filter bars.
 *
 * Syncs with global session selector:
 * - Global session set → hidden (auto-filtered)
 * - Global "All Sessions" → visible (user filters locally)
 */
export function SessionFilterSelect({
	value,
	onValueChange,
	sessions,
	className,
}: SessionFilterSelectProps) {
	let globalSession: { id: string } | null = null
	try {
		const ctx = useExaminationSession()
		globalSession = ctx.currentSession
	} catch {
		// Outside provider
	}

	const mustSelectSession = !globalSession

	// Auto-sync filter when global session changes
	useEffect(() => {
		if (globalSession) {
			onValueChange(globalSession.id)
		}
	}, [globalSession?.id])

	// Hidden when global session is selected
	if (!mustSelectSession) return null

	return (
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger className={className || 'w-[180px]'}>
				<SelectValue placeholder="All Sessions" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">All Sessions</SelectItem>
				{sessions.map((s) => (
					<SelectItem key={s.id} value={s.id}>
						{s.session_name || s.session_code || s.id}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
