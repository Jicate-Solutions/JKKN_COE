import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * BoS Compositions API (internal) — list constituted Boards of Studies.
 * The /bos/compositions page (super_admin) is the consumer.
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutionId')
		const boardId = searchParams.get('boardId')
		const academicYear = searchParams.get('academicYear')
		const isActive = searchParams.get('isActive')

		let query = supabase
			.from('bos_compositions')
			.select(`
				id,
				institutions_id,
				board_id,
				composition_title,
				term_start_date,
				term_end_date,
				academic_year,
				is_active,
				ratified_by_gc,
				ratified_date,
				created_at
			`)
			.order('term_start_date', { ascending: false })

		if (institutionId) query = query.eq('institutions_id', institutionId)
		if (boardId) query = query.eq('board_id', boardId)
		if (academicYear) query = query.eq('academic_year', academicYear)
		if (isActive !== null) query = query.eq('is_active', isActive === 'true')

		const { data: compositions, error } = await query.range(0, 9999)

		if (error) {
			console.error('[BoS Compositions] GET error:', error)
			return NextResponse.json({ error: 'Failed to fetch compositions' }, { status: 500 })
		}

		// Attach board names + member counts without an N+1 per row
		const boardIds = [...new Set((compositions || []).map(c => c.board_id).filter(Boolean))]
		const compositionIds = (compositions || []).map(c => c.id)

		const [boardsRes, membersRes] = await Promise.all([
			boardIds.length > 0
				? supabase.from('board').select('id, board_code, board_name, display_name').in('id', boardIds)
				: Promise.resolve({ data: [] as any[] }),
			compositionIds.length > 0
				? supabase.from('bos_members').select('composition_id').in('composition_id', compositionIds).eq('is_active', true).range(0, 9999)
				: Promise.resolve({ data: [] as any[] })
		])

		const boardMap = new Map((boardsRes.data || []).map((b: any) => [b.id, b]))
		const memberCountMap = new Map<string, number>()
		for (const m of (membersRes.data || [])) {
			memberCountMap.set(m.composition_id, (memberCountMap.get(m.composition_id) || 0) + 1)
		}

		const enriched = (compositions || []).map(c => {
			const board = boardMap.get(c.board_id)
			return {
				...c,
				board_code: board?.board_code || null,
				board_name: board?.display_name || board?.board_name || null,
				member_count: memberCountMap.get(c.id) || 0
			}
		})

		return NextResponse.json(enriched)
	} catch (error) {
		console.error('[BoS Compositions] GET exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
