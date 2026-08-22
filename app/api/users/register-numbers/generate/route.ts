import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import {
	buildRegisterNumber,
	parseStartNumber,
	sortAlphabetically,
} from '@/lib/utils/register-number'

/**
 * POST /api/users/register-numbers/generate
 *
 * Assigns register numbers to a learner cohort (institution + program + semester).
 *
 * The client sends the cohort it resolved from MyJKKN; the server re-sorts A-Z and
 * re-derives every number from prefix + start_number rather than trusting the values
 * the client previewed, so a tampered or stale preview cannot write bad numbers.
 *
 * Pass preview_only:true to get the same computed result plus conflict detection
 * without writing anything.
 */

interface IncomingLearner {
	id: string
	name: string
	roll_number?: string
	register_number?: string
}

/**
 * Supabase encodes `.in()` values into the GET query string, so a long list
 * truncates the URL and silently returns partial rows. Query in chunks instead.
 */
const IN_CHUNK = 150

async function fetchExistingRows(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionsId: string,
	column: 'learner_id' | 'register_number',
	values: string[]
) {
	const rows: any[] = []
	for (let i = 0; i < values.length; i += IN_CHUNK) {
		const chunk = values.slice(i, i + IN_CHUNK)
		const { data, error } = await supabase
			.from('learner_register_numbers')
			.select('id, learner_id, learner_name, register_number, program_code, semester_code')
			.eq('institutions_id', institutionsId)
			.in(column, chunk)
			.range(0, 9999)
		if (error) throw error
		if (data) rows.push(...data)
	}
	return rows
}

export async function POST(request: Request) {
	try {
		const body = await request.json()

		const {
			institutions_id,
			institution_code,
			program_code,
			program_name,
			semester_code,
			semester_id,
			semester_number,
			prefix,
			start_number,
			learners,
			generated_by,
			preview_only = false,
			// When true (default) learners who already hold a register number keep it
			// and consume no slot in the new sequence. When false the whole cohort is
			// renumbered and any previously issued numbers are replaced.
			skip_existing = true,
		} = body as {
			institutions_id?: string
			institution_code?: string
			program_code?: string
			program_name?: string
			semester_code?: string
			semester_id?: string
			semester_number?: number
			prefix?: string
			start_number?: string
			learners?: IncomingLearner[]
			generated_by?: string
			preview_only?: boolean
			skip_existing?: boolean
		}

		// -- Validate --
		if (!institutions_id) {
			return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		}
		if (!program_code) {
			return NextResponse.json({ error: 'Program is required' }, { status: 400 })
		}
		// The cohort is keyed by semester_code; semester_id is stored alongside it
		// but is null for course_mapping rows predating the semester sync.
		if (!semester_code) {
			return NextResponse.json({ error: 'Semester is required' }, { status: 400 })
		}

		const cleanPrefix = String(prefix || '').trim()
		if (!cleanPrefix) {
			return NextResponse.json({ error: 'Register number prefix is required' }, { status: 400 })
		}

		const rawStart = String(start_number ?? '').trim()
		const startValue = parseStartNumber(rawStart)
		if (isNaN(startValue)) {
			return NextResponse.json(
				{ error: 'Starting number must contain digits only (e.g. 001)' },
				{ status: 400 }
			)
		}

		if (!Array.isArray(learners) || learners.length === 0) {
			return NextResponse.json({ error: 'No learners supplied for this cohort' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// -- Sort the cohort A-Z, then de-duplicate by learner id --
		// The client fetches per MyJKKN institution id and one COE institution can map
		// to several, so the same learner can arrive twice.
		const seen = new Set<string>()
		const cohort = sortAlphabetically(
			learners
				.filter(l => l && l.id && !seen.has(l.id) && seen.add(l.id))
				.map(l => ({
					id: String(l.id),
					name: String(l.name || '').trim(),
					roll_number: String(l.roll_number || '').trim(),
					register_number: String(l.register_number || '').trim(),
				}))
		)

		// -- What is already issued for these learners --
		let existingForLearners: any[] = []
		try {
			existingForLearners = await fetchExistingRows(
				supabase,
				institutions_id,
				'learner_id',
				cohort.map(l => l.id)
			)
		} catch (error: any) {
			if (error?.code === '42P01') {
				return NextResponse.json(
					{
						error: 'Table learner_register_numbers does not exist',
						hint: 'Run supabase/migrations/20260821_create_learner_register_numbers.sql in the Supabase SQL Editor.',
					},
					{ status: 404 }
				)
			}
			console.error('[register-numbers/generate] existing lookup failed:', error)
			return NextResponse.json({ error: 'Failed to read existing register numbers' }, { status: 500 })
		}

		const alreadyIssued = new Map<string, any>(existingForLearners.map(r => [r.learner_id, r]))

		// -- Split the cohort into "gets a new number" and "skipped" --
		const targets: typeof cohort = []
		const skipped: { id: string; name: string; register_number: string; reason: string }[] = []

		for (const learner of cohort) {
			const issued = alreadyIssued.get(learner.id)
			if (skip_existing && issued) {
				skipped.push({
					id: learner.id,
					name: learner.name,
					register_number: issued.register_number,
					reason: 'Already assigned',
				})
				continue
			}
			if (skip_existing && learner.register_number) {
				skipped.push({
					id: learner.id,
					name: learner.name,
					register_number: learner.register_number,
					reason: 'Has MyJKKN register number',
				})
				continue
			}
			targets.push(learner)
		}

		if (targets.length === 0) {
			return NextResponse.json(
				{
					error: 'Every learner in this cohort already has a register number. Turn off "Skip learners who already have a register number" to re-assign.',
					skipped,
				},
				{ status: 400 }
			)
		}

		// -- Derive the numbers --
		const assignments = targets.map((learner, index) => ({
			serial_no: startValue + index,
			register_number: buildRegisterNumber(cleanPrefix, rawStart, index),
			learner,
		}))

		// -- Collision check against numbers already issued in this institution --
		// Rows belonging to learners we are about to replace are not collisions:
		// they get deleted first.
		const replacedIds = new Set<string>(
			skip_existing
				? []
				: targets.map(l => alreadyIssued.get(l.id)?.id).filter(Boolean) as string[]
		)

		let clashes: any[] = []
		try {
			const found = await fetchExistingRows(
				supabase,
				institutions_id,
				'register_number',
				assignments.map(a => a.register_number)
			)
			clashes = found.filter(r => !replacedIds.has(r.id))
		} catch (error) {
			console.error('[register-numbers/generate] collision lookup failed:', error)
			return NextResponse.json({ error: 'Failed to check for duplicate register numbers' }, { status: 500 })
		}

		if (clashes.length > 0) {
			const sample = clashes
				.slice(0, 5)
				.map(c => `${c.register_number} (${c.learner_name})`)
				.join(', ')
			return NextResponse.json(
				{
					error: `${clashes.length} of these register numbers are already issued in this institution: ${sample}${clashes.length > 5 ? ', ...' : ''}. Change the prefix or starting number.`,
					conflicts: clashes.map(c => ({
						register_number: c.register_number,
						learner_name: c.learner_name,
						program_code: c.program_code,
					})),
				},
				{ status: 409 }
			)
		}

		// -- Preview: same computation, no writes --
		if (preview_only) {
			return NextResponse.json({
				preview: assignments.map((a, i) => ({
					sl_no: i + 1,
					learner_id: a.learner.id,
					learner_name: a.learner.name,
					roll_number: a.learner.roll_number,
					existing_register_number: a.learner.register_number,
					register_number: a.register_number,
					serial_no: a.serial_no,
				})),
				skipped,
				count: assignments.length,
				message: `Preview: ${assignments.length} learners will be assigned register numbers${skipped.length ? `, ${skipped.length} skipped` : ''}`,
			})
		}

		// -- Replace mode: drop the previously issued rows for these learners --
		if (replacedIds.size > 0) {
			const ids = [...replacedIds]
			for (let i = 0; i < ids.length; i += IN_CHUNK) {
				const { error: delError } = await supabase
					.from('learner_register_numbers')
					.delete()
					.eq('institutions_id', institutions_id)
					.in('id', ids.slice(i, i + IN_CHUNK))
				if (delError) {
					console.error('[register-numbers/generate] replace delete failed:', delError)
					return NextResponse.json(
						{ error: 'Failed to release the previously issued numbers' },
						{ status: 500 }
					)
				}
			}
		}

		// -- Insert --
		const records = assignments.map(a => ({
			institutions_id,
			institution_code: institution_code || null,
			program_code,
			program_name: program_name || null,
			semester_code,
			semester_id: semester_id || null,
			semester_number: semester_number ?? null,
			learner_id: a.learner.id,
			learner_name: a.learner.name,
			roll_number: a.learner.roll_number || null,
			previous_register_number: a.learner.register_number || null,
			register_number: a.register_number,
			serial_no: a.serial_no,
			prefix: cleanPrefix,
			start_number: rawStart,
			generated_by: generated_by || null,
			generated_at: new Date().toISOString(),
			is_active: true,
		}))

		const BATCH = 1000
		const inserted: any[] = []
		for (let i = 0; i < records.length; i += BATCH) {
			const { data, error } = await supabase
				.from('learner_register_numbers')
				.insert(records.slice(i, i + BATCH))
				.select()

			if (error) {
				console.error('[register-numbers/generate] insert failed:', error)
				if (error.code === '23505') {
					return NextResponse.json(
						{
							error: `Duplicate register number or learner detected. ${inserted.length} records were saved before the conflict - clear this cohort and re-generate.`,
						},
						{ status: 409 }
					)
				}
				return NextResponse.json(
					{ error: `Failed to save register numbers. ${inserted.length} records were saved before the error.` },
					{ status: 500 }
				)
			}
			if (data) inserted.push(...data)
		}

		console.log(
			`[register-numbers/generate] ${program_code} sem=${semester_code}: issued ${inserted.length}, skipped ${skipped.length}`
		)

		return NextResponse.json(
			{
				success: true,
				count: inserted.length,
				skipped,
				data: inserted,
				message: `Assigned ${inserted.length} register numbers${skipped.length ? `, skipped ${skipped.length}` : ''}`,
			},
			{ status: 201 }
		)
	} catch (error) {
		console.error('[register-numbers/generate] unexpected error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		)
	}
}
