import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { buildBulkExamApplicationCourses, learnerKey } from '@/lib/exam-applications/bulk-course-list'
import { buildRegistrationPricer } from '@/lib/exam-fee/calculate'
import {
	chargeKey,
	loadAlreadyChargedKeys,
	sessionChargeFor,
} from '@/lib/exam-applications/session-charges'
import type { BulkApplicationResult, BulkLearnerRef } from '@/types/exam-applications'

/**
 * Bulk Exam Application - submit
 *
 * Applies many (learner, course) pairs in one call. Rows land in exam_registrations
 * exactly as the single-learner Exam Application writes them, so the downstream exam
 * pipeline (timetables, hall tickets, marks) keeps working unchanged:
 *   - registration_status = 'Applied'
 *   - is_regular = false and attempt_number = attempt_count + 1 for arrear papers
 *   - the matching student_backlogs row is flagged as registered for arrear
 *
 * The submitted list is never trusted: the authoritative course list is rebuilt
 * server-side for every learner and each pair is re-validated against it.
 */

/** Status stamped on rows created through the Exam Application flow */
const APPLICATION_STATUS = 'Applied'
const MAX_LEARNERS = 500
const MAX_ITEMS = 5000
const INSERT_BATCH = 500

interface SubmitItem {
	student_id: string | null
	register_number: string
	student_name: string
	program_code: string | null
	semester: number | null
	course_code: string
	course_offering_id: string | null
}

export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const institutions_id = body.institutions_id
		const examination_session_id = body.examination_session_id

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}
		if (!examination_session_id) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}

		// ── 1. Normalise + de-duplicate the submitted pairs ──
		const rawItems: any[] = Array.isArray(body.items) ? body.items : []
		const seenPairs = new Set<string>()
		const items: SubmitItem[] = []

		for (const raw of rawItems) {
			const register_number = String(raw?.register_number || raw?.stu_register_no || '').trim()
			const student_id = String(raw?.student_id || raw?.id || '').trim() || null
			const course_code = String(raw?.course_code || '').trim()
			if ((!register_number && !student_id) || !course_code) continue

			const key = `${learnerKey({ student_id, register_number })}|${course_code.toUpperCase()}`
			if (seenPairs.has(key)) continue
			seenPairs.add(key)

			const semesterValue = raw?.semester != null ? Number(raw.semester) : NaN

			items.push({
				student_id,
				register_number,
				student_name: String(raw?.student_name || '').trim(),
				program_code: String(raw?.program_code || '').trim() || null,
				semester: Number.isFinite(semesterValue) && semesterValue > 0 ? semesterValue : null,
				course_code,
				course_offering_id: String(raw?.course_offering_id || '').trim() || null,
			})
		}

		if (items.length === 0) {
			return NextResponse.json({ error: 'Select at least one learner-course pair to apply for' }, { status: 400 })
		}
		if (items.length > MAX_ITEMS) {
			return NextResponse.json(
				{ error: `Too many selections in one request (${items.length}). Apply in batches of at most ${MAX_ITEMS}.` },
				{ status: 400 }
			)
		}

		// ── 2. Collapse to distinct learners ──
		const learnerByKey = new Map<string, BulkLearnerRef>()
		for (const item of items) {
			const key = learnerKey(item)
			const existing = learnerByKey.get(key)
			if (existing) {
				// Later rows may carry details an earlier one lacked
				if (!existing.student_id && item.student_id) existing.student_id = item.student_id
				if (!existing.student_name && item.student_name) existing.student_name = item.student_name
				if (!existing.program_code && item.program_code) existing.program_code = item.program_code
				if (existing.semester == null && item.semester != null) existing.semester = item.semester
				continue
			}
			learnerByKey.set(key, {
				student_id: item.student_id,
				register_number: item.register_number,
				student_name: item.student_name,
				program_code: item.program_code,
				semester: item.semester,
			})
		}

		if (learnerByKey.size > MAX_LEARNERS) {
			return NextResponse.json(
				{ error: `Too many learners in one request (${learnerByKey.size}). Apply in batches of at most ${MAX_LEARNERS}.` },
				{ status: 400 }
			)
		}

		// ── 3. Resolve the denormalised code columns once ──
		let institution_code = String(body.institution_code || '').trim() || null
		if (!institution_code) {
			const { data: inst } = await supabase
				.from('institutions')
				.select('institution_code')
				.eq('id', institutions_id)
				.maybeSingle()
			institution_code = inst?.institution_code || null
		}
		if (!institution_code) {
			return NextResponse.json({ error: 'Institution not found' }, { status: 400 })
		}

		let session_code = String(body.session_code || '').trim() || null
		if (!session_code) {
			const { data: sess } = await supabase
				.from('examination_sessions')
				.select('session_code')
				.eq('id', examination_session_id)
				.maybeSingle()
			session_code = sess?.session_code || null
		}
		if (!session_code) {
			return NextResponse.json({ error: 'Examination session not found' }, { status: 400 })
		}

		// ── 4. Rebuild the authoritative course list for every learner ──
		const learnerLists = await buildBulkExamApplicationCourses(supabase, {
			institutions_id,
			examination_session_id,
			learners: [...learnerByKey.values()],
		})

		const coursesByLearner = new Map(
			learnerLists.map(l => [l.key, new Map(l.courses.map(c => [c.key, c]))])
		)

		// One rate-book load prices every learner on the screen. The amount stamped
		// is the paper's own fee; mark statement / application / late fine are
		// once-per-session charges and never land on a paper row.
		const allCourses = learnerLists.flatMap(l => l.courses)
		const pricer = await buildRegistrationPricer(supabase, {
			institutions_id,
			examination_session_id,
			course_codes: allCourses.map(c => c.course_code),
			courses: allCourses,
		})

		// ── 5. Validate each pair and build the insert rows ──
		const results: BulkApplicationResult[] = []
		const payloads: any[] = []
		const backlogIdByRow: (string | null)[] = []
		const now = new Date().toISOString()
		const today = now.slice(0, 10)

		for (const item of items) {
			const key = learnerKey(item)
			const courseKey = item.course_code.toUpperCase()
			const course = coursesByLearner.get(key)?.get(courseKey)

			const fail = (reason: string) =>
				results.push({ register_number: item.register_number, course_code: item.course_code, status: 'failed', reason })

			if (!item.register_number) {
				fail('Register number is required')
				continue
			}
			if (!item.student_name) {
				fail('Learner name is required')
				continue
			}
			if (!course) {
				fail('Course is not part of this learner application list')
				continue
			}
			if (course.is_registered) {
				results.push({
					register_number: item.register_number,
					course_code: item.course_code,
					status: 'skipped',
					reason: 'Already registered in this session',
				})
				continue
			}
			if (!course.is_eligible || !course.course_offering_id) {
				fail(course.eligibility_reason || `Not eligible (${course.eligibility_status})`)
				continue
			}

			payloads.push({
				institutions_id,
				institution_code,
				student_id: item.student_id,
				stu_register_no: item.register_number,
				student_name: item.student_name,
				examination_session_id,
				session_code,
				course_offering_id: course.course_offering_id,
				course_code: course.course_code,
				program_code: course.program_code || item.program_code,
				registration_date: now,
				applied_date: today,
				registration_status: APPLICATION_STATUS,
				is_regular: !course.is_backlog,
				attempt_number: course.attempt_number,
				fee_paid: false,
				fee_amount: pricer.priceFor(course.program_code || item.program_code, course.course_code),
				// Stamped below on one anchor row per learner - see the charge pass.
				application_fee: 0,
				mark_statement_fee: 0,
				late_fine: 0,
			})
			backlogIdByRow.push(course.is_backlog ? course.backlog_id : null)
		}

		// ── 5b. Once-per-session charges, on one anchor row per learner ──
		//
		// The application fee, mark statement fee and late fine are charged once per
		// learner per session, not per paper. Each is stamped on a single row - the
		// learner's first row in this batch - and left at 0 on the rest, so summing a
		// learner's registrations gives the true amount owed. A learner who was
		// already charged in this session (their current papers, or an earlier arrear
		// batch) is skipped entirely.
		{
			const alreadyCharged = await loadAlreadyChargedKeys(supabase, {
				institutions_id,
				examination_session_id,
				registerNumbers: payloads.map(p => String(p.stu_register_no || '')).filter(Boolean),
			})

			const anchorByLearner = new Map<string, any>()
			for (const row of payloads) {
				const key = chargeKey({ student_id: row.student_id, register_number: row.stu_register_no })
				if (anchorByLearner.has(key)) continue
				if (alreadyCharged.has(key) || (row.student_id && alreadyCharged.has(`sid:${row.student_id}`))) {
					// Mark as handled so a later row of the same learner is not charged.
					anchorByLearner.set(key, null)
					continue
				}
				anchorByLearner.set(key, row)

				const charge = sessionChargeFor(
					pricer.book,
					pricer.levelFor(row.program_code),
					today
				)
				row.application_fee = charge.application_fee
				row.mark_statement_fee = charge.mark_statement_fee
				row.late_fine = charge.late_fine
			}
		}

		// ── 6. Batched insert, falling back to per-row so a partial success survives ──
		const backlogIdsToFlag: string[] = []

		const recordInsert = (row: any, backlogId: string | null) => {
			results.push({ register_number: row.stu_register_no, course_code: row.course_code, status: 'created' })
			if (backlogId) backlogIdsToFlag.push(backlogId)
		}

		const recordRowError = (row: any, error: any) => {
			if (error.code === '23505') {
				results.push({
					register_number: row.stu_register_no,
					course_code: row.course_code,
					status: 'skipped',
					reason: 'Already registered in this session',
				})
				return
			}
			let reason = error.message || 'Failed to save'
			if (error.code === '23503') reason = 'Invalid reference (offering or session no longer exists)'
			else if (error.code === '23502') {
				const field = error.message?.match(/column "(\w+)"/)?.[1]?.replace(/_/g, ' ') || 'a required field'
				reason = `Missing required value: ${field}`
			} else if (error.code === '23514') reason = 'Rejected by a database check constraint'
			results.push({ register_number: row.stu_register_no, course_code: row.course_code, status: 'failed', reason })
		}

		for (let i = 0; i < payloads.length; i += INSERT_BATCH) {
			const batch = payloads.slice(i, i + INSERT_BATCH)
			const batchBacklogIds = backlogIdByRow.slice(i, i + INSERT_BATCH)

			const { error } = await supabase.from('exam_registrations').insert(batch)

			if (!error) {
				batch.forEach((row, idx) => recordInsert(row, batchBacklogIds[idx]))
				continue
			}

			// One bad row fails the whole batch - retry individually so the rest still land.
			console.error('[exam-applications:bulk] batch insert error:', error)
			for (let idx = 0; idx < batch.length; idx++) {
				const row = batch[idx]
				const { error: rowError } = await supabase.from('exam_registrations').insert([row])
				if (rowError) recordRowError(row, rowError)
				else recordInsert(row, batchBacklogIds[idx])
			}
		}

		// ── 7. Flag the backlogs that were applied for as arrear-registered ──
		if (backlogIdsToFlag.length > 0) {
			const uniqueBacklogIds = [...new Set(backlogIdsToFlag)]
			for (let i = 0; i < uniqueBacklogIds.length; i += INSERT_BATCH) {
				const batch = uniqueBacklogIds.slice(i, i + INSERT_BATCH)
				const { error: backlogError } = await supabase
					.from('student_backlogs')
					.update({
						is_registered_for_arrear: true,
						arrear_registration_date: now.slice(0, 10),
						arrear_exam_session_id: examination_session_id,
						updated_at: now,
					})
					.in('id', batch)

				if (backlogError) {
					// The registrations are already saved - surface it but do not fail the request.
					console.error('[exam-applications:bulk] backlog flag error:', backlogError)
				}
			}
		}

		const created = results.filter(r => r.status === 'created').length
		const skipped = results.filter(r => r.status === 'skipped').length
		const failed = results.filter(r => r.status === 'failed').length

		const parts: string[] = []
		if (created > 0) parts.push(`${created} applied`)
		if (skipped > 0) parts.push(`${skipped} already registered (skipped)`)
		if (failed > 0) parts.push(`${failed} rejected`)

		return NextResponse.json(
			{
				success: failed === 0,
				summary: { total: results.length, created, skipped, failed },
				// Only the rejected rows are worth sending back in full - a 5,000 row
				// success list would dwarf the response for no benefit.
				results: results.filter(r => r.status !== 'created').slice(0, 200),
				message: parts.join(', ') || 'No changes',
			},
			{ status: created > 0 ? 201 : 200 }
		)
	} catch (e) {
		console.error('[exam-applications:bulk] submit error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
