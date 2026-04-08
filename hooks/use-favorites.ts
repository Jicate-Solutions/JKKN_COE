'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth/auth-context-parent'

export interface FavoriteRecord {
	id: string
	user_id: string
	page_url: string
	page_title: string | null
	page_group: string | null
	sort_order: number
	created_at: string
}

// ── localStorage cache for instant first-paint ──────────────────
const CACHE_PREFIX = 'coe_fav_cache_'

function getCachedFavorites(userId: string): string[] {
	try {
		const raw = localStorage.getItem(`${CACHE_PREFIX}${userId}`)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

function setCachedFavorites(userId: string, urls: string[]) {
	try {
		localStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(urls))
	} catch { /* ignore quota errors */ }
}

/**
 * Read user ID from localStorage synchronously.
 * Priority: coe_user_id → id (every authenticated user has `id`)
 */
function getStoredUserId(): string {
	try {
		const raw = localStorage.getItem('user_data')
		if (!raw) return ''
		const user = JSON.parse(raw)
		return user?.coe_user_id || user?.id || ''
	} catch {
		return ''
	}
}

export function useFavorites() {
	const { user } = useAuth()
	const userId = user?.coe_user_id || user?.id || getStoredUserId()
	// Track whether we've synced with API — don't overwrite cache until we have real data
	const hasSyncedRef = useRef(false)

	// Initialize from cache immediately
	const [favorites, setFavorites] = useState<string[]>(() => {
		const id = userId || getStoredUserId()
		return id ? getCachedFavorites(id) : []
	})
	const [records, setRecords] = useState<FavoriteRecord[]>([])
	const [loading, setLoading] = useState(false)

	// Fetch from API
	const fetchFavorites = useCallback(async () => {
		if (!userId) {
			setFavorites([])
			setRecords([])
			return
		}
		try {
			setLoading(true)
			const res = await fetch(`/api/user-favorites?user_id=${userId}`)
			if (!res.ok) throw new Error('Failed to fetch')
			const data: FavoriteRecord[] = await res.json()
			const urls = data.map(f => f.page_url)
			setRecords(data)
			setFavorites(urls)
			// Now we have real data from API — safe to cache
			hasSyncedRef.current = true
			setCachedFavorites(userId, urls)
		} catch (err) {
			console.error('Failed to load favorites:', err)
			// Even on error, mark synced so user actions can update cache
			hasSyncedRef.current = true
		} finally {
			setLoading(false)
		}
	}, [userId])

	// On mount / user change
	useEffect(() => {
		if (userId) {
			hasSyncedRef.current = false
			// Load from cache instantly
			const cached = getCachedFavorites(userId)
			if (cached.length > 0) setFavorites(cached)
			// Then sync from API
			fetchFavorites()
		} else {
			setFavorites([])
			setRecords([])
		}
	}, [userId, fetchFavorites])

	const isFavorite = useCallback(
		(url: string) => favorites.includes(url),
		[favorites]
	)

	// Helper: update state + cache (only after initial sync)
	const updateFavorites = useCallback((updater: (prev: string[]) => string[]) => {
		setFavorites(prev => {
			const next = updater(prev)
			if (userId && hasSyncedRef.current) setCachedFavorites(userId, next)
			return next
		})
	}, [userId])

	const addFavorite = useCallback(
		async (url: string, title?: string, group?: string) => {
			if (!userId || favorites.includes(url)) return

			updateFavorites(prev => [...prev, url])

			try {
				const res = await fetch('/api/user-favorites', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						user_id: userId,
						page_url: url,
						page_title: title || null,
						page_group: group || null,
					}),
				})
				if (!res.ok) throw new Error('Failed to add')
				fetchFavorites()
			} catch (err) {
				console.error('Failed to add favorite:', err)
				updateFavorites(prev => prev.filter(u => u !== url))
			}
		},
		[userId, favorites, updateFavorites, fetchFavorites]
	)

	const removeFavorite = useCallback(
		async (url: string) => {
			if (!userId) return

			const prevFavorites = favorites
			const prevRecords = records
			updateFavorites(prev => prev.filter(u => u !== url))
			setRecords(prev => prev.filter(r => r.page_url !== url))

			try {
				const res = await fetch(
					`/api/user-favorites?user_id=${userId}&page_url=${encodeURIComponent(url)}`,
					{ method: 'DELETE' }
				)
				if (!res.ok) throw new Error('Failed to remove')
			} catch (err) {
				console.error('Failed to remove favorite:', err)
				setFavorites(prevFavorites)
				setRecords(prevRecords)
				if (userId) setCachedFavorites(userId, prevFavorites)
			}
		},
		[userId, favorites, records, updateFavorites]
	)

	const toggleFavorite = useCallback(
		(url: string, title?: string, group?: string) => {
			if (favorites.includes(url)) {
				removeFavorite(url)
			} else {
				addFavorite(url, title, group)
			}
		},
		[favorites, addFavorite, removeFavorite]
	)

	const reorderFavorites = useCallback(
		async (newOrder: string[]) => {
			if (!userId) return

			const prevFavorites = favorites
			updateFavorites(() => newOrder)
			setRecords(prev => {
				const map = new Map(prev.map(r => [r.page_url, r]))
				return newOrder
					.map((url, i) => {
						const rec = map.get(url)
						return rec ? { ...rec, sort_order: i } : null
					})
					.filter(Boolean) as FavoriteRecord[]
			})

			try {
				const res = await fetch('/api/user-favorites', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						user_id: userId,
						items: newOrder.map((url, i) => ({ page_url: url, sort_order: i })),
					}),
				})
				if (!res.ok) throw new Error('Failed to reorder')
			} catch (err) {
				console.error('Failed to reorder favorites:', err)
				setFavorites(prevFavorites)
				if (userId) setCachedFavorites(userId, prevFavorites)
				fetchFavorites()
			}
		},
		[userId, favorites, updateFavorites, fetchFavorites]
	)

	return {
		favorites,
		records,
		loading,
		isFavorite,
		toggleFavorite,
		addFavorite,
		removeFavorite,
		reorderFavorites,
		refetch: fetchFavorites,
	}
}
