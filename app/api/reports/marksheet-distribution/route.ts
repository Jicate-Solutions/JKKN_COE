import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import {
	fetchAllMyJKKNLearnerProfiles,
	fetchAllMyJKKNPrograms,
	fetchAllMyJKKNBatches,
} from '@/lib/myjkkn-api'
import { normalizeDateOfBirth } from '@/lib/myjkkn-learner-enrichment'
import { institutionParam } from '@/lib/auth/institution-scope-request'

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionId = (await institutionParam(searchParams, 'institution_id'))
		const programCode = searchParams.get('program_code')
		const batchCode = searchParams.get('batch_code')

		if (!institutionId) {
			return NextResponse.json({ error: 'institution_id is required' }, { status: 400 })
		}
		if (!programCode) {
			return NextResponse.json({ error: 'program_code is required' }, { status: 400 })
		}
		if (!batchCode) {
			return NextResponse.json({ error: 'batch_code is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Get institution with myjkkn_institution_ids
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id, institution_code, myjkkn_institution_ids')
			.eq('id', institutionId)
			.single()

		if (instError || !institution) {
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		const myjkknIds: string[] = institution.myjkkn_institution_ids || []

		if (myjkknIds.length === 0) {
			return NextResponse.json({
				learners: [],
				metadata: { total: 0, institution_id: institutionId, program_code: programCode, batch_code: batchCode }
			})
		}

		// Step 1: Resolve program_code -> program UUIDs and batch_code -> batch UUIDs
		// Fetch programs and batches in parallel for all institution IDs
		const [programResults, batchResults] = await Promise.all([
			Promise.all(myjkknIds.map(instId =>
				fetchAllMyJKKNPrograms({ institution_id: instId, is_active: true, limit: 200 }).catch(() => [])
			)),
			Promise.all(myjkknIds.map(instId =>
				fetchAllMyJKKNBatches({ institution_id: instId, is_active: true, limit: 200 }).catch(() => [])
			))
		])

		// Collect program UUIDs matching the program_code
		const programUUIDs = new Set<string>()
		for (const programs of programResults) {
			for (const p of programs) {
				const code = (p as any).program_id || (p as any).program_code
				if (code === programCode && (p as any).id) {
					programUUIDs.add((p as any).id)
				}
			}
		}

		// Collect batch UUIDs matching the batch_code.
		// Deliberately NOT narrowed to our institutions: the batches API ignores
		// institution_id, and CAS learners are routinely attached to a batch row owned by
		// another institution (most PG learners are), so the code is the only reliable key.
		const batchUUIDs = new Set<string>()
		let batchName = ''
		for (const batches of batchResults) {
			for (const b of batches) {
				if ((b as any).batch_code === batchCode && (b as any).id) {
					batchUUIDs.add((b as any).id)
					if (!batchName) batchName = (b as any).batch_name || ''
				}
			}
		}

		// Two-digit intake year of the selected batch ("UGB26" / "2026-2029" -> "26"),
		// used to place learners MyJKKN has not attached to any batch yet.
		const batchYear = batchCode.match(/(\d{2})$/)?.[1] || batchName.match(/^\d{2}(\d{2})/)?.[1] || null

		if (programUUIDs.size === 0) {
			return NextResponse.json({
				learners: [],
				metadata: { total: 0, institution_id: institutionId, program_code: programCode, batch_code: batchCode }
			})
		}

		// Step 2: Fetch learners for each institution + program combination in parallel
		// Pass program_id filter (even if API may ignore it, it may help)
		const learnerFetches: Promise<any[]>[] = []

		for (const myjkknInstId of myjkknIds) {
			for (const progUUID of programUUIDs) {
				learnerFetches.push(
					fetchAllMyJKKNLearnerProfiles({
						institution_id: myjkknInstId,
						program_id: progUUID,
						lifecycle_status: 'all',
						all: true,
						limit: 200,
					}).catch(() => [])
				)
			}
		}

		const learnerResults = await Promise.all(learnerFetches)

		// Step 3: Combine and filter by institution + program + batch
		const allLearners: any[] = []
		const seenIds = new Set<string>()

		for (const learners of learnerResults) {
			for (const learner of learners) {
				if (!learner.id || seenIds.has(learner.id)) continue

				// Filter: must belong to one of our institutions
				if (!myjkknIds.includes(learner.institution_id)) continue
				// Filter: must match program UUID
				if (!programUUIDs.has(learner.program_id)) continue
				// Filter: must match batch UUID (if we found batch UUIDs)
				if (learner.batch_id) {
					if (batchUUIDs.size > 0 && !batchUUIDs.has(learner.batch_id)) continue
				} else if (batchYear) {
					// No batch in MyJKKN (the whole 2026 aided intake, and part of the
					// self-financing one) — fall back to the intake year in the learner's
					// register / roll number. Applicants with neither number stay out.
					if (learnerIntakeYear(learner) !== batchYear) continue
				} else if (batchUUIDs.size > 0) {
					continue
				}

				seenIds.add(learner.id)
				allLearners.push(learner)
			}
		}

		// Format for PDF
		const formattedLearners = allLearners.map((learner: any) => ({
			register_number: learner.register_number || learner.roll_number || '-',
			learner_name: formatLearnerName(learner),
			dob: formatDOB(learner.date_of_birth),
			email: learner.college_email || learner.student_email || learner.email || '-',
			phone: learner.student_mobile || learner.phone || '-',
		}))

		formattedLearners.sort((a, b) => a.register_number.localeCompare(b.register_number))

		return NextResponse.json({
			learners: formattedLearners,
			metadata: {
				total: formattedLearners.length,
				institution_id: institutionId,
				program_code: programCode,
				batch_code: batchCode
			}
		})

	} catch (error) {
		console.error('[Marksheet Distribution API] Error:', error)
		return NextResponse.json({ error: 'Failed to fetch learner data' }, { status: 500 })
	}
}

// Intake year from the register number (26JUGENG001, C23UG102ENG006) or, for learners
// not yet numbered, the roll number (AUG26EN01). Null when neither carries one.
function learnerIntakeYear(learner: any): string | null {
	for (const value of [learner.register_number, learner.roll_number]) {
		const text = String(value || '').trim().toUpperCase()
		const match = text.match(/^(\d{2})[A-Z]/) || text.match(/^[A-Z]+(\d{2})[A-Z]/)
		if (match) return match[1]
	}
	return null
}

function formatLearnerName(learner: any): string {
	const parts: string[] = []
	if (learner.first_name) parts.push(learner.first_name)
	if (learner.last_name) parts.push(learner.last_name)
	return parts.length > 0 ? parts.join(' ').toUpperCase() : '-'
}

function formatDOB(dob: string | null | undefined): string {
	// MyJKKN stores some DOBs as Excel serials ("39793"); new Date() reads those as the year
	const iso = normalizeDateOfBirth(dob)
	if (!iso) return '-'
	const [year, month, day] = iso.split('-')
	return `${day}-${month}-${year}`
}
