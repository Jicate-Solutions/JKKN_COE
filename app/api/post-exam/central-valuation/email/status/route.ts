import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const sessionId = searchParams.get('session_id')

	if (!institutionsId || !sessionId) {
		return NextResponse.json({ error: 'institutions_id and session_id are required' }, { status: 400 })
	}

	const supabase = getSupabaseServer()
	const { data, error } = await supabase
		.from('central_valuation_email_log')
		.select('*')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.order('sent_at', { ascending: false })
		.limit(500)

	if (error) {
		console.error('status route error:', error)
		return NextResponse.json({ error: 'Failed to load history' }, { status: 500 })
	}

	return NextResponse.json(data || [])
}
