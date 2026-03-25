import { createClient } from '@supabase/supabase-js'

/**
 * Client-side Supabase client for browser use (Realtime subscriptions).
 * Uses the anon key — RLS policies apply.
 */
let browserClient: ReturnType<typeof createClient> | null = null

export function getSupabaseBrowser() {
	if (browserClient) return browserClient

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
	const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

	browserClient = createClient(url, key, {
		auth: { persistSession: false },
		realtime: { params: { eventsPerSecond: 2 } },
	})

	return browserClient
}
