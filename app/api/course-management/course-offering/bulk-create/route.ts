import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { checkDependencies } from '@/lib/delete-helpers'

interface BulkSyncItem {
	course_mapping_id: string
	course_id: string
	course_code: string
	semester: number
	semester_code: string
}

interface BulkSyncPayload {
	institutions_id: string
	institution_code: string
	examination_session_id: string
	session_code: string
	program_id: string
	program_code: string
	items: BulkSyncItem[]          // courses that should exist (checked)
	delete_ids?: string[]           // offering IDs to remove (unchecked)
}

// POST - Sync course offerings: insert new, delete unchecked
export async function POST(request: Request) {
	try {
		const body: BulkSyncPayload = await request.json()
		const supabase = getSupabaseServer()

		// Validate required fields
		if (!body.institutions_id || !body.institution_code) {
			return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		}
		if (!body.examination_session_id || !body.session_code) {
			return NextResponse.json({ error: 'Examination session is required' }, { status: 400 })
		}
		if (!body.program_id || !body.program_code) {
			return NextResponse.json({ error: 'Program is required' }, { status: 400 })
		}

		const items = body.items || []
		const deleteIds = body.delete_ids || []

		if (items.length === 0 && deleteIds.length === 0) {
			return NextResponse.json({ error: 'No changes to apply' }, { status: 400 })
		}

		let created = 0
		let deleted = 0
		let skipped = 0
		const errors: string[] = []
		const blocked: Array<{
			offering_id: string
			total: number
			dependencies: Array<{ table: string; column: string; count: number }>
		}> = []

		// ── DELETE unchecked offerings ──
		// An offering that already carries learner data (exam registrations,
		// marks, question papers) is NEVER removed here. Unticking a course on
		// the sync screen must not be able to destroy a completed registration —
		// that is exactly how UZO Sem-5 and UCC Sem-3 were wiped. Offerings with
		// dependents are reported back as `blocked` so the user can see why.
		if (deleteIds.length > 0) {
			const safeToDelete: string[] = []

			for (const id of deleteIds) {
				const deps = await checkDependencies('course_offerings', id)
				if (deps.has_dependencies) {
					blocked.push({
						offering_id: id,
						total: deps.total_count,
						dependencies: deps.dependencies,
					})
				} else {
					safeToDelete.push(id)
				}
			}

			const BATCH = 500
			for (let i = 0; i < safeToDelete.length; i += BATCH) {
				const batch = safeToDelete.slice(i, i + BATCH)
				const { error } = await supabase
					.from('course_offerings')
					.delete()
					.in('id', batch)
					.eq('institutions_id', body.institutions_id)
					.eq('examination_session_id', body.examination_session_id)

				if (error) {
					console.error('Bulk delete error:', error)
					// 23503 = the DB-level RESTRICT caught a dependent row the
					// pre-check missed. Report it, never retry with a cascade.
					errors.push(
						error.code === '23503'
							? 'Delete blocked: those offerings still have linked records.'
							: `Delete batch: ${error.message}`
					)
				} else {
					deleted += batch.length
				}
			}
		}

		// ── INSERT new offerings ──
		if (items.length > 0) {
			// Check which already exist to skip
			const semCodes = [...new Set(items.map(i => i.semester_code))]
			const { data: existing } = await supabase
				.from('course_offerings')
				.select('course_mapping_id, semester_code')
				.eq('institutions_id', body.institutions_id)
				.eq('examination_session_id', body.examination_session_id)
				.eq('program_code', body.program_code)
				.in('semester_code', semCodes)

			const existingSet = new Set(
				(existing || []).map(e => `${e.course_mapping_id}|${e.semester_code}`)
			)

			const newItems = items.filter(
				item => !existingSet.has(`${item.course_mapping_id}|${item.semester_code}`)
			)
			skipped = items.length - newItems.length

			if (newItems.length > 0) {
				const payloads = newItems.map(item => ({
					institutions_id: body.institutions_id,
					institution_code: body.institution_code,
					course_mapping_id: item.course_mapping_id,
					course_id: item.course_id,
					course_code: item.course_code,
					examination_session_id: body.examination_session_id,
					session_code: body.session_code,
					program_id: body.program_id,
					program_code: body.program_code,
					semester: item.semester,
					semester_code: item.semester_code,
					is_active: true,
					enrolled_count: 0,
				}))

				const BATCH = 500
				for (let i = 0; i < payloads.length; i += BATCH) {
					const batch = payloads.slice(i, i + BATCH)
					const { data, error } = await supabase
						.from('course_offerings')
						.insert(batch)
						.select('id')

					if (error) {
						console.error('Bulk insert error:', error)
						errors.push(`Insert batch: ${error.message}`)
					} else {
						created += data?.length || 0
					}
				}
			}
		}

		// Build message
		const parts: string[] = []
		if (created > 0) parts.push(`${created} created`)
		if (deleted > 0) parts.push(`${deleted} removed`)
		if (skipped > 0) parts.push(`${skipped} unchanged`)
		if (blocked.length > 0) {
			const rows = blocked.reduce((sum, b) => sum + b.total, 0)
			parts.push(`${blocked.length} kept — still has ${rows} linked record${rows !== 1 ? 's' : ''} (registrations/marks)`)
		}
		const message = parts.join(', ') || 'No changes made'

		return NextResponse.json({
			created,
			deleted,
			skipped,
			blocked: blocked.length > 0 ? blocked : undefined,
			errors: errors.length > 0 ? errors : undefined,
			message,
		}, { status: created > 0 || deleted > 0 ? 201 : 200 })
	} catch (e) {
		console.error('Bulk sync error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
