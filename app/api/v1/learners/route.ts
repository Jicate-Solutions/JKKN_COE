import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const programId = searchParams.get('program_id')
	const search = searchParams.get('search')

	let query = supabase
		.from('exam_registrations')
		.select(`
			student_id,
			student_name,
			register_number,
			institution_id,
			program_code,
			batch_code
		`)

	if (ctx.allowedInstitutionIds.length > 0) {
		query = query.in('institutions_id', ctx.allowedInstitutionIds)
	}

	if (programId) query = query.eq('program_code', programId)
	if (search) {
		query = query.or(`student_name.ilike.%${search}%,register_number.ilike.%${search}%`)
	}

	const { data, error } = await query.range(0, 9999)

	if (error) {
		return NextResponse.json({ error: 'Failed to fetch learners' }, { status: 500 })
	}

	const seen = new Set<string>()
	const unique = (data || []).filter(r => {
		if (seen.has(r.student_id)) return false
		seen.add(r.student_id)
		return true
	})

	return NextResponse.json({ data: unique, total: unique.length })
})
