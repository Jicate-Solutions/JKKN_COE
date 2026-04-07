import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withAdminAuth } from '@/lib/security/admin-guard'
import { sanitizeSearch } from '@/lib/security/escape-like'

export const GET = withAdminAuth(async (request, _adminUser) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const search = sanitizeSearch(searchParams.get('search'))
	const coeInstitutionId = searchParams.get('institutions_id')

	// Fetch COE institutions to build MyJKKN ID → institution code map
	const { data: institutions } = await supabase
		.from('institutions')
		.select('id, institution_code, name, myjkkn_institution_ids')

	// Build lookup: MyJKKN UUID → COE institution info
	const myjkknToInstitution = new Map<string, { id: string; code: string; name: string }>()
	for (const inst of institutions || []) {
		const myjkknIds = inst.myjkkn_institution_ids || []
		for (const myjkknId of myjkknIds) {
			myjkknToInstitution.set(myjkknId, {
				id: inst.id,
				code: inst.institution_code,
				name: inst.name || inst.institution_code,
			})
		}
	}

	// If filtering by COE institution, resolve to MyJKKN IDs for the query
	let myjkknFilterIds: string[] | null = null
	if (coeInstitutionId) {
		const inst = (institutions || []).find(i => i.id === coeInstitutionId)
		myjkknFilterIds = inst?.myjkkn_institution_ids || []
	}

	let query = supabase
		.from('users')
		.select(`
			id,
			email,
			full_name,
			avatar_url,
			is_active,
			institution_id,
			user_roles(
				id,
				is_active,
				assigned_at,
				roles(id, name, description)
			)
		`)
		.order('full_name')

	// Filter by MyJKKN institution IDs when a specific COE institution is selected
	if (myjkknFilterIds !== null) {
		if (myjkknFilterIds.length > 0) {
			query = query.in('institution_id', myjkknFilterIds)
		} else {
			// No MyJKKN IDs mapped — return empty
			return NextResponse.json([])
		}
	}

	if (search) {
		query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
	}

	const { data, error } = await query.range(0, 999)

	if (error) {
		console.error('Failed to fetch users:', error)
		return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
	}

	const users = (data || []).map((u: any) => {
		// Resolve MyJKKN institution_id → COE institution info
		const resolved = u.institution_id ? myjkknToInstitution.get(u.institution_id) : null
		return {
			...u,
			institution_code: resolved?.code || null,
			institution_name: resolved?.name || null,
			coe_institution_id: resolved?.id || null,
			coe_roles: (u.user_roles || [])
				.filter((ur: any) => ur.is_active && ur.roles?.name)
				.map((ur: any) => ({
					id: ur.id,
					role_id: ur.roles.id,
					role_name: ur.roles.name,
					role_description: ur.roles.description,
					assigned_at: ur.assigned_at,
				})),
		}
	})

	return NextResponse.json(users)
})
