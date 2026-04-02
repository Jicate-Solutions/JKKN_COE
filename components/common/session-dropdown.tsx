'use client'

import { useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useExaminationSession } from '@/context/examination-session-context'

interface SessionOption {
	id: string
	session_name?: string
	session_code?: string
	[key: string]: unknown
}

interface SessionDropdownProps {
	/** The page-local selected session ID */
	value: string
	/** Callback when session changes (local or from global) */
	onValueChange: (sessionId: string) => void
	/** List of available sessions */
	sessions: SessionOption[]
	/** Whether the dropdown is disabled */
	disabled?: boolean
	/** Loading state */
	loading?: boolean
	/** Label text (default: "Examination Session") */
	label?: string
	/** Whether this is a required field */
	required?: boolean
	/** Error message */
	error?: string
	/** Placeholder text */
	placeholder?: string
	/** Additional class name for the trigger */
	className?: string
	/** Whether to include "All Sessions" option (for filter dropdowns) */
	showAllOption?: boolean
}

/**
 * SessionDropdown - Syncs with global Examination Session Selector in header.
 *
 * Behavior (mirrors Institution dropdown pattern):
 * - When a session is selected globally in header → auto-fills value, hides dropdown
 * - When "All Sessions" is selected globally → shows dropdown, user picks locally
 *
 * Usage:
 * ```tsx
 * <SessionDropdown
 *   value={selectedSessionId}
 *   onValueChange={setSelectedSessionId}
 *   sessions={sessions}
 * />
 * ```
 */
export function SessionDropdown({
	value,
	onValueChange,
	sessions,
	disabled = false,
	loading = false,
	label = 'Examination Session',
	required = false,
	error,
	placeholder = 'Select Examination Session',
	className,
	showAllOption = false,
}: SessionDropdownProps) {
	// Read global session from header selector
	let globalSession: { id: string; session_name?: string; session_code?: string } | null = null
	try {
		const ctx = useExaminationSession()
		globalSession = ctx.currentSession
	} catch {
		// Outside provider — render normally without global sync
	}

	const mustSelectSession = !globalSession

	// Auto-sync: when global session is set, push it to the page-local state
	useEffect(() => {
		if (globalSession && value !== globalSession.id) {
			onValueChange(globalSession.id)
		}
	}, [globalSession?.id])

	// When globally selected, hide the dropdown entirely (auto-filled)
	if (!mustSelectSession) {
		return null
	}

	// Render the dropdown (global = "All Sessions" → user picks locally)
	return (
		<div className="space-y-1.5">
			{label && (
				<Label className="text-sm font-medium">
					{label} {required && <span className="text-destructive">*</span>}
				</Label>
			)}
			<Select
				value={value}
				onValueChange={onValueChange}
				disabled={disabled || loading}
			>
				<SelectTrigger className={`h-10 ${error ? 'border-destructive' : ''} ${disabled ? 'bg-muted cursor-not-allowed' : ''} ${className || ''}`}>
					<SelectValue placeholder={loading ? 'Loading sessions...' : placeholder} />
				</SelectTrigger>
				<SelectContent>
					{showAllOption && (
						<SelectItem value="all">All Sessions</SelectItem>
					)}
					{sessions.map((session) => (
						<SelectItem key={session.id} value={session.id}>
							{session.session_name || session.session_code || session.id}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	)
}
