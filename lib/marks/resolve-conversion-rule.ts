import { getSupabaseServer } from '@/lib/supabase-server'
import type { MarkConversionRule } from '@/types/mark-conversion-rule'

export async function resolveConversionRule(opts: {
	institutions_id: string
	regulation_code: string | null
	session_start: string  // YYYY-MM-DD
}): Promise<MarkConversionRule | null> {
	const { institutions_id, regulation_code, session_start } = opts
	const supabase = getSupabaseServer()

	// 1. Try exact regulation match
	if (regulation_code) {
		const { data } = await supabase
			.from('mark_conversion_rules')
			.select('*')
			.eq('institutions_id', institutions_id)
			.eq('regulation_code', regulation_code)
			.eq('is_active', true)
			.lte('wef_date', session_start)
			.order('wef_date', { ascending: false })
			.limit(1)
			.maybeSingle()
		if (data) return data as MarkConversionRule
	}

	// 2. Fallback: catch-all rule (regulation_code IS NULL) for this institution
	const { data: fallback } = await supabase
		.from('mark_conversion_rules')
		.select('*')
		.eq('institutions_id', institutions_id)
		.is('regulation_code', null)
		.eq('is_active', true)
		.lte('wef_date', session_start)
		.order('wef_date', { ascending: false })
		.limit(1)
		.maybeSingle()

	return (fallback as MarkConversionRule | null) || null
}
