import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const category = searchParams.get('category')
	const isActive = searchParams.get('is_active')
	const search = searchParams.get('search')

	let query = supabase
		.from('bos_external_experts')
		.select(`
			id,
			institutions_id,
			name,
			title,
			designation,
			institution_name,
			department_name,
			email,
			contact_no,
			category,
			specialization,
			qualifications,
			is_active,
			created_at
		`)
		.order('name', { ascending: true })

	if (ctx.allowedInstitutionIds.length > 0) {
		query = query.in('institutions_id', ctx.allowedInstitutionIds)
	}

	if (category) query = query.eq('category', category)
	if (isActive !== null) query = query.eq('is_active', isActive === 'true')
	if (search) {
		query = query.or(`name.ilike.%${search}%,institution_name.ilike.%${search}%,specialization.ilike.%${search}%`)
	}

	const { data, error } = await query.range(0, 9999)

	if (error) {
		return NextResponse.json({ error: 'Failed to fetch experts' }, { status: 500 })
	}

	return NextResponse.json({ data: data || [], total: (data || []).length })
})
