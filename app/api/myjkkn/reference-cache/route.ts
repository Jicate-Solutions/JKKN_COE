/**
 * MyJKKN Reference Cache API
 *
 * GET: Retrieve cached entities by IDs
 * POST: Save/update cached entities
 *
 * This API manages the local cache of MyJKKN entity data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

type MyJKKNEntityType =
	| 'program'
	| 'semester'
	| 'regulation'
	| 'batch'
	| 'learner_profile'
	| 'staff'
	| 'department'
	| 'institution'

interface CacheItem {
	myjkkn_id: string
	entity_type: MyJKKNEntityType
	entity_code: string | null
	entity_name: string | null
	entity_data: Record<string, unknown>
	institution_id: string | null
	is_active: boolean
}

/**
 * GET - Retrieve cached entities by IDs
 *
 * Query params:
 * - ids: comma-separated list of MyJKKN UUIDs
 * - entity_type: the type of entity to look up
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const idsParam = searchParams.get('ids')
		const entityType = searchParams.get('entity_type') as MyJKKNEntityType

		if (!idsParam) {
			return NextResponse.json(
				{ error: 'Missing required parameter: ids' },
				{ status: 400 }
			)
		}

		if (!entityType) {
			return NextResponse.json(
				{ error: 'Missing required parameter: entity_type' },
				{ status: 400 }
			)
		}

		const validEntityTypes: MyJKKNEntityType[] = [
			'program', 'semester', 'regulation', 'batch',
			'learner_profile', 'staff', 'department', 'institution'
		]

		if (!validEntityTypes.includes(entityType)) {
			return NextResponse.json(
				{ error: `Invalid entity_type. Valid types: ${validEntityTypes.join(', ')}` },
				{ status: 400 }
			)
		}

		const ids = idsParam.split(',').filter(id => id.trim())

		if (ids.length === 0) {
			return NextResponse.json({ data: {}, cached_count: 0 })
		}

		const supabase = getSupabaseServer()

		const { data, error } = await supabase
			.from('myjkkn_reference_cache')
			.select('myjkkn_id, entity_code, entity_name, entity_data')
			.in('myjkkn_id', ids)
			.eq('entity_type', entityType)
			.eq('is_active', true)

		if (error) {
			console.error('[reference-cache] Error fetching from cache:', error)
			return NextResponse.json(
				{ error: 'Failed to fetch from cache', details: error.message },
				{ status: 500 }
			)
		}

		// Build response map keyed by myjkkn_id
		const result: Record<string, Record<string, unknown>> = {}
		for (const row of data || []) {
			result[row.myjkkn_id] = row.entity_data as Record<string, unknown>
		}

		return NextResponse.json({
			data: result,
			cached_count: Object.keys(result).length,
			requested_count: ids.length,
		})
	} catch (error) {
		console.error('[reference-cache] Unexpected error:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}

/**
 * POST - Save/update cached entities
 *
 * Body:
 * - items: array of CacheItem objects
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json()
		const items: CacheItem[] = body.items

		if (!items || !Array.isArray(items) || items.length === 0) {
			return NextResponse.json(
				{ error: 'Missing or empty items array' },
				{ status: 400 }
			)
		}

		const supabase = getSupabaseServer()
		const results = { inserted: 0, updated: 0, errors: 0 }

		// Process items in batches
		const BATCH_SIZE = 100
		for (let i = 0; i < items.length; i += BATCH_SIZE) {
			const batch = items.slice(i, i + BATCH_SIZE)

			const upsertData = batch.map(item => ({
				myjkkn_id: item.myjkkn_id,
				entity_type: item.entity_type,
				entity_code: item.entity_code,
				entity_name: item.entity_name,
				entity_data: item.entity_data,
				institution_id: item.institution_id,
				is_active: item.is_active !== false,
				last_synced_at: new Date().toISOString(),
			}))

			const { error } = await supabase
				.from('myjkkn_reference_cache')
				.upsert(upsertData, {
					onConflict: 'myjkkn_id,entity_type',
					ignoreDuplicates: false,
				})

			if (error) {
				console.error('[reference-cache] Error upserting batch:', error)
				results.errors += batch.length
			} else {
				results.inserted += batch.length
			}
		}

		return NextResponse.json({
			success: true,
			results,
		})
	} catch (error) {
		console.error('[reference-cache] Unexpected error:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}

/**
 * DELETE - Clear cache entries
 *
 * Query params:
 * - entity_type: optional, clear only specific entity type
 * - older_than_days: optional, clear entries older than N days
 */
export async function DELETE(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const entityType = searchParams.get('entity_type') as MyJKKNEntityType | null
		const olderThanDays = searchParams.get('older_than_days')

		const supabase = getSupabaseServer()
		let query = supabase.from('myjkkn_reference_cache').delete()

		if (entityType) {
			query = query.eq('entity_type', entityType)
		}

		if (olderThanDays) {
			const days = parseInt(olderThanDays, 10)
			if (!isNaN(days) && days > 0) {
				const cutoffDate = new Date()
				cutoffDate.setDate(cutoffDate.getDate() - days)
				query = query.lt('last_synced_at', cutoffDate.toISOString())
			}
		}

		// Need a condition for delete - if no filters, require explicit confirmation
		if (!entityType && !olderThanDays) {
			return NextResponse.json(
				{ error: 'Must specify entity_type or older_than_days parameter for deletion' },
				{ status: 400 }
			)
		}

		const { error, count } = await query.select('id', { count: 'exact' })

		if (error) {
			console.error('[reference-cache] Error deleting from cache:', error)
			return NextResponse.json(
				{ error: 'Failed to delete from cache', details: error.message },
				{ status: 500 }
			)
		}

		return NextResponse.json({
			success: true,
			deleted_count: count || 0,
		})
	} catch (error) {
		console.error('[reference-cache] Unexpected error:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}
