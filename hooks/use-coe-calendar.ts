'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CoeCalendarEvent } from '@/types/coe-calendar'
import type { CoeRoleTag } from '@/lib/coe-calendar/visibility'

interface UseCoeCalendarOptions {
	institutionsId?: string | null
	status?: 'ACTIVE' | 'INACTIVE' | 'ALL'
	academicYear?: string
	/** Only return events visible to at least one of these audience tags. */
	roles?: CoeRoleTag[]
}

interface UseCoeCalendarReturn {
	events: CoeCalendarEvent[]
	eventsByDate: Map<string, CoeCalendarEvent[]>
	loading: boolean
	error: string | null
	refetch: () => void
}

function toDateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function useCoeCalendar({
	institutionsId,
	status = 'ACTIVE',
	academicYear,
	roles,
}: UseCoeCalendarOptions): UseCoeCalendarReturn {
	const [events, setEvents] = useState<CoeCalendarEvent[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const rolesKey = roles?.join(',') || ''

	const fetchEvents = useCallback(async () => {
		// undefined = filter context not ready yet; null = all institutions (super_admin)
		if (institutionsId === undefined) {
			setEvents([])
			return
		}

		setLoading(true)
		setError(null)

		try {
			const params = new URLSearchParams()
			if (institutionsId) params.set('institutions_id', institutionsId)
			if (status !== 'ALL') params.set('status', status)
			if (academicYear) params.set('academic_year', academicYear)
			if (rolesKey) params.set('roles', rolesKey)

			const res = await fetch(`/api/coe-calendar?${params.toString()}`)
			if (!res.ok) throw new Error('Failed to fetch COE calendar')
			const data = await res.json()
			setEvents(Array.isArray(data) ? data : [])
		} catch (err) {
			console.error('useCoeCalendar error:', err)
			setError('Failed to load calendar events')
		} finally {
			setLoading(false)
		}
	}, [institutionsId, status, academicYear, rolesKey])

	useEffect(() => {
		fetchEvents()
	}, [fetchEvents])

	// Date -> events map for O(1) calendar lookup. Every day the event spans is
	// keyed, not just its start date — a multi-day exam window used to appear
	// on day one only.
	const eventsByDate = useMemo(() => {
		const map = new Map<string, CoeCalendarEvent[]>()

		for (const event of events) {
			const start = new Date(event.event_start_date + 'T00:00:00')
			const end = new Date(event.event_end_date + 'T00:00:00')
			if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue

			const cursor = new Date(start)
			while (cursor <= end) {
				const key = toDateKey(cursor)
				const bucket = map.get(key)
				if (bucket) bucket.push(event)
				else map.set(key, [event])
				cursor.setDate(cursor.getDate() + 1)
			}
		}

		return map
	}, [events])

	return { events, eventsByDate, loading, error, refetch: fetchEvents }
}
