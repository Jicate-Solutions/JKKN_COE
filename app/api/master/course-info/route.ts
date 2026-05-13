import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url)
		const status = searchParams.get('status')

		const supabase = getSupabaseServer()
		let query = supabase
			.from('course_info')
			.select('id, course_type, display_code, description, sort_order, status, created_at, updated_at')
			.order('sort_order', { ascending: true })
			.order('course_type', { ascending: true })
			.range(0, 9999)

		if (status === 'active') {
			query = query.eq('status', true)
		} else if (status === 'inactive') {
			query = query.eq('status', false)
		}

		const { data, error } = await query

		if (error) {
			console.error('course_info GET error:', error)
			return NextResponse.json({
				error: 'Failed to fetch course info',
				details: error.message,
			}, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (err) {
		console.error('course_info GET exception:', err)
		return NextResponse.json({
			error: 'Failed to fetch course info',
			details: err instanceof Error ? err.message : 'Unknown error',
		}, { status: 500 })
	}
}
