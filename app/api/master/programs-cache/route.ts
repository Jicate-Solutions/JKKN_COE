import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url)
	const institution_code = searchParams.get('institution_code')

	const supabase = getSupabaseServer()

	const { data, error } = await supabase
		.from('myjkkn_reference_cache')
		.select('entity_data, entity_name')
		.eq('entity_type', 'program')
		.eq('is_active', true)

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 })
	}

	const programs = (data || [])
		.filter(row => {
			if (!institution_code) return true
			return row.entity_data?.institution?.counselling_code === institution_code
		})
		.map(row => ({
			program_code: (row.entity_data?.program_id as string) || '',
			program_name: (row.entity_name as string) || (row.entity_data?.program_name as string) || '',
			program_order: (row.entity_data?.program_order as number) ?? 999,
		}))
		.filter(p => p.program_code)
		.sort((a, b) => (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code))

	return NextResponse.json(programs)
}
