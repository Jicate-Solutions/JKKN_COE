'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CoeCalendarEvent } from '@/types/coe-calendar'

interface UseCoeCalendarOptions {
	institutionsId?: string | null
	status?: 'ACTIVE' | 'INACTIVE' | 'ALL'
	academicYear?: string
}

interface UseCoeCalendarReturn {
	events: CoeCalendarEvent[]
	eventsByDate: Map<string, CoeCalendarEvent[]>
	loading: boolean
	error: string | null
	refetch: () => void
}

export function useCoeCalendar({
	institutionsId,
	status = 'ACTIVE',
	academicYear,
}: UseCoeCalendarOptions): UseCoeCalendarReturn {
	const [events, setEvents] = useState<CoeCalendarEvent[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

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
	}, [institutionsId, status, academicYear])

	useEffect(() => {
		fetchEvents()
	}, [fetchEvents])

	// Build date → events map for O(1) calendar lookup
	const eventsByDate = useMemo(() => {
		const map = new Map<string, CoeCalendarEvent[]>()
		for (const event of events) {
			const date = event.event_start_date
			if (!map.has(date)) map.set(date, [])
			map.get(date)!.push(event)
		}
		return map
	}, [events])

	return { events, eventsByDate, loading, error, refetch: fetchEvents }
}
