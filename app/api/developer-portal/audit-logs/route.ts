import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const appId = searchParams.get('app_id')
	const method = searchParams.get('method')
	const endpoint = searchParams.get('endpoint')
	const statusCode = searchParams.get('status_code')
	const dateFrom = searchParams.get('date_from')
	const dateTo = searchParams.get('date_to')
	const page = Number(searchParams.get('page') || '1')
	const limit = Number(searchParams.get('limit') || '50')
	const format = searchParams.get('format')

	let query = supabase
		.from('api_audit_logs')
		.select(`
			*,
			api_applications(id, name)
		`, { count: 'exact' })
		.order('created_at', { ascending: false })

	if (appId) query = query.eq('app_id', appId)
	if (method) query = query.eq('method', method)
	if (endpoint) query = query.ilike('endpoint', `%${endpoint}%`)
	if (statusCode) query = query.eq('response_status', Number(statusCode))
	if (dateFrom) query = query.gte('created_at', dateFrom)
	if (dateTo) query = query.lte('created_at', dateTo)

	if (format) {
		const { data, error } = await query.range(0, 9999)
		if (error) {
			return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
		}
		return NextResponse.json({ data: data || [], total: data?.length || 0 })
	}

	const from = (page - 1) * limit
	const to = from + limit - 1
	const { data, error, count } = await query.range(from, to)

	if (error) {
		console.error('Fetch audit logs error:', error)
		return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
	}

	return NextResponse.json({
		data: data || [],
		total: count || 0,
		page,
		limit,
		total_pages: Math.ceil((count || 0) / limit),
	})
}
