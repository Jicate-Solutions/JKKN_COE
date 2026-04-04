/**
 * Destination Edge Function: receive-sync
 * ─────────────────────────────────────────────────────────────────────────────
 * Deployed on: DESTINATION Supabase project (psfflrqjmplaljfpllyn)
 * Called by:   Source trigger-sync function
 * Purpose:     Writes to / deletes from destination courses + course_mappings
 *
 * Environment variables (set via `supabase secrets set`):
 *   DEST_FUNCTION_SECRET  - Bearer token this function validates
 *   DEST_SUPABASE_URL     - this project's URL
 *   DEST_SUPABASE_KEY     - this project's service-role key
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'INSERT' | 'UPDATE' | 'DELETE'

interface ForwardPayload {
	type: EventType
	table: string
	schema: string
	record: Record<string, unknown> | null
	old_record: Record<string, unknown> | null
	resolved_dest_institution_ids: string[]
}

interface SourceCourse {
	id: string
	course_code: string
	course_name: string
	theory_hours: number
	practical_hours: number
	class_hours: number
}

interface SourceCourseMapping {
	id: string
	course_id: string
	program_id: string
	semester_id: string
	degree_id: string | null
	department_id: string | null
}

interface SourceInstitution {
	id: string
}

// ─── courses ──────────────────────────────────────────────────────────────────

async function handleCourse(
	dst: ReturnType<typeof createClient>,
	event: EventType,
	row: SourceCourse,
	destInstitutionIds: string[],
): Promise<void> {
	if (event === 'DELETE') {
		for (const destInstId of destInstitutionIds) {
			const { error } = await dst
				.from('courses')
				.delete()
				.eq('coe_course_id', row.id)
				.eq('institution_id', destInstId)

			if (error) {
				throw new Error(`DELETE course failed for institution ${destInstId}: ${error.message}`)
			}
		}
		console.log(`Deleted dest courses with coe_course_id=${row.id}`)
		return
	}

	for (const destInstId of destInstitutionIds) {
		const payload = {
			institution_id: destInstId,
			course_code: row.course_code,
			course_name: row.course_name,
			theory_hours: row.theory_hours ?? 0,
			practical_hours: row.practical_hours ?? 0,
			learning_hours_target: row.class_hours ?? 0,
			coe_course_id: row.id,
			is_active: true,
			updated_at: new Date().toISOString(),
		}

		const { error } = await dst
			.from('courses')
			.upsert(payload, {
				onConflict: 'coe_course_id,institution_id',
				ignoreDuplicates: false,
			})

		if (error) {
			throw new Error(`UPSERT course failed for institution ${destInstId}: ${error.message}`)
		}
	}

	console.log(`Upserted dest course coe_course_id=${row.id} for ${destInstitutionIds.length} institution(s)`)
}

// ─── course_mappings ──────────────────────────────────────────────────────────

async function handleCourseMapping(
	dst: ReturnType<typeof createClient>,
	event: EventType,
	row: SourceCourseMapping,
	destInstitutionIds: string[],
): Promise<void> {
	if (event === 'DELETE') {
		for (const destInstId of destInstitutionIds) {
			const { error } = await dst
				.from('course_mappings')
				.delete()
				.eq('coe_mapping_id', row.id)
				.eq('institution_id', destInstId)

			if (error) {
				throw new Error(`DELETE course_mapping failed for institution ${destInstId}: ${error.message}`)
			}
		}
		console.log(`Deleted dest course_mappings with coe_mapping_id=${row.id}`)
		return
	}

	for (const destInstId of destInstitutionIds) {
		const { data: destCourse, error: courseErr } = await dst
			.from('courses')
			.select('id')
			.eq('coe_course_id', row.course_id)
			.eq('institution_id', destInstId)
			.maybeSingle()

		if (courseErr || !destCourse) {
			console.warn(
				`handleCourseMapping: dest course not found for coe_course_id=${row.course_id} ` +
				`institution=${destInstId}. Ensure course synced first. Skipping.`,
			)
			continue
		}

		const payload = {
			institution_id: destInstId,
			course_id: destCourse.id,
			program_id: row.program_id,
			semester_id: row.semester_id,
			degree_id: row.degree_id ?? null,
			department_id: row.department_id ?? null,
			coe_mapping_id: row.id,
			is_active: true,
			updated_at: new Date().toISOString(),
		}

		const { error } = await dst
			.from('course_mappings')
			.upsert(payload, {
				onConflict: 'coe_mapping_id,institution_id',
				ignoreDuplicates: false,
			})

		if (error) {
			throw new Error(`UPSERT course_mapping failed for institution ${destInstId}: ${error.message}`)
		}
	}

	console.log(`Upserted dest course_mapping coe_mapping_id=${row.id}`)
}

// ─── institutions ─────────────────────────────────────────────────────────────

async function handleInstitution(
	_dst: ReturnType<typeof createClient>,
	event: EventType,
	row: SourceInstitution,
	_destInstitutionIds: string[],
): Promise<void> {
	console.log(
		`Institution ${event} for src id=${row.id} received. ` +
		`No dest write needed — institutions are lookup-only.`,
	)
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function route(
	dst: ReturnType<typeof createClient>,
	payload: ForwardPayload,
): Promise<void> {
	const { type, table, record, old_record, resolved_dest_institution_ids } = payload
	const row = (type === 'DELETE' ? old_record : record) as Record<string, unknown>

	if (!row) throw new Error(`Missing row for ${type} on ${table}`)

	const destIds = resolved_dest_institution_ids
	if (destIds.length === 0 && table !== 'institutions') {
		throw new Error(`No resolved dest institution IDs for ${table} ${type}`)
	}

	switch (table) {
		case 'courses':
			await handleCourse(dst, type, row as unknown as SourceCourse, destIds)
			break
		case 'course_mapping':
			await handleCourseMapping(dst, type, row as unknown as SourceCourseMapping, destIds)
			break
		case 'institutions':
			await handleInstitution(dst, type, row as unknown as SourceInstitution, destIds)
			break
		default:
			console.warn(`receive-sync: unhandled table "${table}". Ignoring.`)
	}
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
	const DEST_FUNCTION_SECRET = Deno.env.get('DEST_FUNCTION_SECRET') ?? ''
	const DEST_URL = Deno.env.get('DEST_SUPABASE_URL') ?? ''
	const DEST_KEY = Deno.env.get('DEST_SUPABASE_KEY') ?? ''

	if (!DEST_URL || !DEST_KEY) {
		console.error('receive-sync: DEST_SUPABASE_URL or DEST_SUPABASE_KEY is not set')
		return new Response('Server misconfiguration', { status: 500 })
	}

	const dst = createClient(DEST_URL, DEST_KEY)

	if (req.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 })
	}

	const authHeader = req.headers.get('authorization') ?? ''
	const token = authHeader.replace(/^Bearer\s+/i, '').trim()
	if (!DEST_FUNCTION_SECRET || token !== DEST_FUNCTION_SECRET) {
		return new Response('Unauthorized', { status: 401 })
	}

	let payload: ForwardPayload
	try {
		payload = await req.json()
	} catch {
		return new Response('Invalid JSON', { status: 400 })
	}

	try {
		await route(dst, payload)
		return new Response(
			JSON.stringify({ ok: true }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } },
		)
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		console.error('receive-sync error:', message)
		return new Response(
			JSON.stringify({ ok: false, error: message }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } },
		)
	}
})
