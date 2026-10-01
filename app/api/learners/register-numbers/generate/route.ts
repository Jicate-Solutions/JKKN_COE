import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import {
	buildRegisterNumber,
	hasRealRegisterNumber,
	parseStartNumber,
	sortAlphabetically,
} from '@/lib/utils/register-number'
import { describeSync, syncRegisterNumbers } from '@/lib/utils/register-number-sync'
import {
	describeProfileSync,
	findMyjkknRegisterNumberHolders,
	updateMyjkknRegisterNumbers,
} from '@/lib/myjkkn/learner-register-number'

/**
 * POST /api/learners/register-numbers/generate
 *
 * Assigns register numbers to the ticked learners of a cohort (institution +
 * program + semester).
 *
 * MyJKKN learners_profiles.register_number is the record of a learner's
 * number. Generation writes it there, then carries it into the COE tables
 * (exam registrations, marks, results) that still hold the old value —
 * usually the roll number pasted at exam registration.
 *
 * The client sends the learners it resolved from MyJKKN; the server re-sorts
 * A-Z and re-derives every number from prefix + start_number rather than
 * trusting the values the client previewed.
 *
 * Pass preview_only:true to get the computed result plus conflict detection
 * without writing anything.
 */

interface IncomingLearner {
	id: string
	name: string
	roll_number?: string
	register_number?: string
}

export async function POST(request: Request) {
	try {
		const body = await request.json()

		const {
			institutions_id,
			program_code,
			semester_code,
			prefix,
			start_number,
			learners,
			preview_only = false,
		} = body as {
			institutions_id?: string
			program_code?: string
			semester_code?: string
			prefix?: string
			start_number?: string
			learners?: IncomingLearner[]
			preview_only?: boolean
		}

		// Existing numbers are locked: a learner who already holds a real register
		// number keeps it and consumes no slot, whatever the client sends. A number
		// equal to the roll number is a placeholder and does not count. Allowing
		// renumbering needs a deliberate option, not this flag.
		const skip_existing = true

		// -- Validate --
		if (!institutions_id) {
			return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		}
		if (!program_code) {
			return NextResponse.json({ error: 'Program is required' }, { status: 400 })
		}
		if (!semester_code) {
			return NextResponse.json({ error: 'Semester is required' }, { status: 400 })
		}

		const cleanPrefix = String(prefix || '').trim()
		if (!cleanPrefix) {
			return NextResponse.json({ error: 'Register number prefix is required' }, { status: 400 })
		}

		const rawStart = String(start_number ?? '').trim()
		if (isNaN(parseStartNumber(rawStart))) {
			return NextResponse.json(
				{ error: 'Starting number must contain digits only (e.g. 001)' },
				{ status: 400 }
			)
		}

		if (!Array.isArray(learners) || learners.length === 0) {
			return NextResponse.json({ error: 'No learners selected' }, { status: 400 })
		}

		// -- Sort A-Z, de-duplicate by learner id --
		// One COE institution can map to several MyJKKN ones, so the same learner
		// can arrive twice.
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

		// -- Split into "gets a new number" and "skipped" --
		const targets: typeof cohort = []
		const skipped: { id: string; name: string; register_number: string; reason: string }[] = []
		for (const learner of cohort) {
			if (skip_existing && hasRealRegisterNumber(learner.register_number, learner.roll_number)) {
				skipped.push({
					id: learner.id,
					name: learner.name,
					register_number: learner.register_number,
					reason: 'Has register number',
				})
				continue
			}
			targets.push(learner)
		}

		if (targets.length === 0) {
			return NextResponse.json(
				{
					error: 'Every selected learner already has a register number. Existing register numbers are locked and cannot be re-assigned here.',
					skipped,
				},
				{ status: 400 }
			)
		}

		const assignments = targets.map((learner, index) => ({
			register_number: buildRegisterNumber(cleanPrefix, rawStart, index),
			learner,
		}))

		// -- Collision check against MyJKKN --
		// A number held by one of the learners being renumbered is not a clash:
		// it is about to be replaced.
		const targetIds = new Set(targets.map(l => l.id))
		const holders = await findMyjkknRegisterNumberHolders(assignments.map(a => a.register_number))
		if (holders === null) {
			return NextResponse.json(
				{ error: 'MyJKKN is not configured: set MYJKKN_SUPABASE_URL and MYJKKN_SUPABASE_SERVICE_ROLE_KEY.' },
				{ status: 500 }
			)
		}
		const clashes = holders.filter(h => !targetIds.has(h.id))
		if (clashes.length > 0) {
			const sample = clashes
				.slice(0, 5)
				.map(c => `${c.register_number} (${c.name})`)
				.join(', ')
			return NextResponse.json(
				{
					error: `${clashes.length} of these register numbers already belong to other learners: ${sample}${clashes.length > 5 ? ', ...' : ''}. Change the prefix or starting number.`,
					conflicts: clashes,
				},
				{ status: 409 }
			)
		}

		// -- Collision check against COE exam registrations --
		// Exam registrations can carry a number MyJKKN no longer shows (or never
		// had), so a clash-free MyJKKN is not enough.
		const supabase = getSupabaseServer()
		const coeClashes: { register_number: string; name: string }[] = []
		const numbers = assignments.map(a => a.register_number)
		for (let i = 0; i < numbers.length; i += 150) {
			const { data, error } = await supabase
				.from('exam_registrations')
				.select('stu_register_no, student_id, student_name')
				.eq('institutions_id', institutions_id)
				.in('stu_register_no', numbers.slice(i, i + 150))
				.range(0, 999)
			if (error) {
				console.error('[register-numbers/generate] COE collision lookup failed:', error)
				return NextResponse.json({ error: 'Failed to check exam registrations for duplicate numbers' }, { status: 500 })
			}
			for (const row of data || []) {
				if (targetIds.has(row.student_id)) continue
				if (!coeClashes.some(c => c.register_number === row.stu_register_no)) {
					coeClashes.push({ register_number: row.stu_register_no, name: row.student_name })
				}
			}
		}
		if (coeClashes.length > 0) {
			const sample = coeClashes
				.slice(0, 5)
				.map(c => `${c.register_number} (${c.name})`)
				.join(', ')
			return NextResponse.json(
				{
					error: `${coeClashes.length} of these register numbers are already on other learners' exam registrations: ${sample}${coeClashes.length > 5 ? ', ...' : ''}. Change the prefix or starting number.`,
					conflicts: coeClashes,
				},
				{ status: 409 }
			)
		}

		if (preview_only) {
			return NextResponse.json({
				preview: assignments.map((a, i) => ({
					sl_no: i + 1,
					learner_id: a.learner.id,
					learner_name: a.learner.name,
					roll_number: a.learner.roll_number,
					existing_register_number: a.learner.register_number,
					register_number: a.register_number,
				})),
				skipped,
				count: assignments.length,
				message: `Preview: ${assignments.length} learners will be assigned register numbers${skipped.length ? `, ${skipped.length} skipped` : ''}`,
			})
		}

		// -- 1. MyJKKN learners_profiles --
		const profileSync = await updateMyjkknRegisterNumbers(
			assignments.map(a => ({
				learnerId: a.learner.id,
				from: a.learner.register_number,
				to: a.register_number,
			}))
		)
		if (profileSync.errors.length > 0) {
			console.error('[register-numbers/generate] MyJKKN profile errors:', profileSync.errors)
		}

		// -- 2. COE tables still carrying the old value --
		// Only learners whose profile actually changed, so COE never runs ahead of MyJKKN.
		const updatedIds = new Set(profileSync.updatedIds)
		const written = assignments.filter(a => updatedIds.has(a.learner.id))

		const { updated: synced, errors: syncErrors } = await syncRegisterNumbers(
			supabase,
			institutions_id,
			written.map(a => ({
				learnerId: a.learner.id,
				from: a.learner.register_number,
				// Exam registration pasted the roll number in when there was no
				// register number — accept it too, whatever MyJKKN held.
				alsoFrom: [a.learner.roll_number],
				to: a.register_number,
			}))
		)
		if (syncErrors.length > 0) {
			console.error('[register-numbers/generate] COE sync errors:', syncErrors)
		}
		const syncSummary = describeSync(synced)

		console.log(
			`[register-numbers/generate] ${program_code} sem=${semester_code}: profiles ${profileSync.updated}/${assignments.length}, skipped ${skipped.length}, COE ${syncSummary || 'none'}`
		)

		const failed = profileSync.updated === 0
		return NextResponse.json(
			{
				success: !failed,
				count: profileSync.updated,
				skipped,
				unchanged: profileSync.unchanged,
				synced,
				errors: [...profileSync.errors, ...syncErrors],
				message:
					`${describeProfileSync(profileSync)}` +
					(skipped.length ? ` Skipped ${skipped.length}.` : '') +
					(syncSummary ? ` COE updated: ${syncSummary}.` : '') +
					(syncErrors.length ? ` ${syncErrors.length} COE table update(s) failed — see server log.` : ''),
			},
			{ status: failed ? 500 : 200 }
		)
	} catch (error) {
		console.error('[register-numbers/generate] unexpected error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		)
	}
}
