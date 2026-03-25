import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client for the parent MyJKKN auth platform.
 * Used server-side only (API routes) to manage auth_sessions on logout.
 * Uses service_role key to bypass RLS.
 */
export function getSupabaseParent() {
	const url = process.env.PARENT_SUPABASE_URL
	const key = process.env.PARENT_SUPABASE_SERVICE_ROLE_KEY

	if (!url || !key) {
		throw new Error('Missing PARENT_SUPABASE_URL or PARENT_SUPABASE_SERVICE_ROLE_KEY')
	}

	return createClient(url, key, {
		auth: { persistSession: false },
	})
}
