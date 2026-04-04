/**
 * Source Edge Function: trigger-sync
 * ─────────────────────────────────────────────────────────────────────────────
 * Deployed on: SOURCE Supabase project
 * Triggered by: Database webhooks on courses, course_mapping, institutions
 * Purpose: Validates the webhook, enriches the payload with institution
 *          resolution data, and forwards it to the destination receiver.
 *
 * Environment variables (set via `supabase secrets set`):
 *   WEBHOOK_SECRET        - shared secret set in the DB webhook Authorization header
 *   DEST_FUNCTION_URL     - full URL of the destination receive-sync function
 *   DEST_FUNCTION_SECRET  - Bearer token the destination function expects
 *   SOURCE_SUPABASE_URL   - this project's URL (for institution lookup)
 *   SOURCE_SUPABASE_KEY   - this project's service-role key
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'INSERT' | 'UPDATE' | 'DELETE'

interface WebhookPayload {
	type: EventType
	table: string
	schema: string
	record: Record<string, unknown> | null
	old_record: Record<string, unknown> | null
}

interface ForwardPayload extends WebhookPayload {
	resolved_dest_institution_ids: string[]
}

// ─── Institution resolution ───────────────────────────────────────────────────

async function resolveMyjkknIds(
	src: ReturnType<typeof createClient>,
	srcInstitutionsId: string,
): Promise<string[]> {
	const { data, error } = await src
		.from('institutions')
		.select('myjkkn_institution_ids')
		.eq('id', srcInstitutionsId)
		.maybeSingle()

	if (error || !data) {
		console.error(`resolveMyjkknIds: lookup failed for ${srcInstitutionsId}`, error)
		return []
	}

	return (data.myjkkn_institution_ids as string[]) ?? []
}

function extractInstitutionId(
	table: string,
	row: Record<string, unknown>,
): string | null {
	switch (table) {
		case 'courses':
		case 'course_mapping':
			return (row.institutions_id as string) ?? null
		case 'institutions':
			return (row.id as string) ?? null
		default:
			return null
	}
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
	const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? ''
	const DEST_FUNCTION_URL = Deno.env.get('DEST_FUNCTION_URL') ?? ''
	const DEST_FUNCTION_SECRET = Deno.env.get('DEST_FUNCTION_SECRET') ?? ''
	const SOURCE_URL = Deno.env.get('SOURCE_SUPABASE_URL') ?? ''
	const SOURCE_KEY = Deno.env.get('SOURCE_SUPABASE_KEY') ?? ''

	if (!SOURCE_URL || !SOURCE_KEY) {
		console.error('trigger-sync: SOURCE_SUPABASE_URL or SOURCE_SUPABASE_KEY is not set')
		return new Response('Server misconfiguration', { status: 500 })
	}

	if (!DEST_FUNCTION_URL) {
		console.error('trigger-sync: DEST_FUNCTION_URL is not set')
		return new Response('Server misconfiguration', { status: 500 })
	}

	const src = createClient(SOURCE_URL, SOURCE_KEY)

	// 1. Validate method
	if (req.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 })
	}

	// 2. Validate webhook secret
	const authHeader = req.headers.get('authorization') ?? ''
	const token = authHeader.replace(/^Bearer\s+/i, '').trim()
	if (!WEBHOOK_SECRET || token !== WEBHOOK_SECRET) {
		return new Response('Unauthorized', { status: 401 })
	}

	// 3. Parse body
	let payload: WebhookPayload
	try {
		payload = await req.json()
	} catch {
		return new Response('Invalid JSON', { status: 400 })
	}

	const { type, table, record, old_record } = payload
	const row = (type === 'DELETE' ? old_record : record) as Record<string, unknown> | null

	if (!row) {
		return new Response(
			JSON.stringify({ ok: false, error: 'Missing row data in payload' }),
			{ status: 400, headers: { 'Content-Type': 'application/json' } },
		)
	}

	// 4. Resolve destination institution IDs
	const institutionId = extractInstitutionId(table, row)
	let resolvedDestIds: string[] = []

	if (institutionId) {
		resolvedDestIds = await resolveMyjkknIds(src, institutionId)
		if (resolvedDestIds.length === 0) {
			console.warn(
				`trigger-sync: no myjkkn_institution_ids found for src institution ${institutionId}. ` +
				`Table=${table}, event=${type}. Skipping forward.`,
			)
			return new Response(
				JSON.stringify({ ok: true, skipped: true, reason: 'no_dest_institutions_mapped' }),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
			)
		}
	}

	// 5. Build forward payload
	const forwardPayload: ForwardPayload = {
		...payload,
		resolved_dest_institution_ids: resolvedDestIds,
	}

	// 6. Forward to destination function
	let destResponse: Response
	try {
		destResponse = await fetch(DEST_FUNCTION_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${DEST_FUNCTION_SECRET}`,
			},
			body: JSON.stringify(forwardPayload),
		})
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		console.error('trigger-sync: failed to reach destination function:', msg)
		return new Response(
			JSON.stringify({ ok: false, error: `Destination unreachable: ${msg}` }),
			{ status: 502, headers: { 'Content-Type': 'application/json' } },
		)
	}

	// 7. Return destination response
	const destBody = await destResponse.text()
	console.log(
		`trigger-sync: forwarded ${type} on ${table} → dest responded ${destResponse.status}: ${destBody}`,
	)

	return new Response(destBody, {
		status: destResponse.status,
		headers: { 'Content-Type': 'application/json' },
	})
})
