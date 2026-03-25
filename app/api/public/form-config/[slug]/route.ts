import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Public Form Config API
 * Fetch form configuration by URL slug (no auth required)
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ slug: string }> }
) {
	try {
		const { slug } = await params
		const supabase = getSupabaseServer()

		const { data, error } = await supabase
			.from('examiner_form_configs')
			.select('*')
			.eq('url_slug', slug)
			.eq('is_active', true)
			.single()

		if (error || !data) {
			return NextResponse.json(
				{ error: 'Form not found or inactive' },
				{ status: 404 }
			)
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Form config fetch error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
