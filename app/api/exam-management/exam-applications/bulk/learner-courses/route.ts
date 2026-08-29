import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { buildBulkExamApplicationCourses } from '@/lib/exam-applications/bulk-course-list'
import {
	isFineApplicable,
	learnerChargeLines,
	priceCourseList,
	loadFeeRateBook,
	resolveProgramLevel,
	PAPER_FEE_HEAD_LABELS,
	type FeeLineItem,
	type PaperFeeHead,
} from '@/lib/exam-fee/calculate'
import type { BulkLearnerRef } from '@/types/exam-applications'

/** Guard rail - one page of learners at a time keeps the batched queries bounded */
const MAX_LEARNERS = 500

/**
 * Bulk Exam Application - Learner-wise course lists
 *
 * For each selected learner, returns the same merged course list the single-learner
 * Exam Application page shows: current papers from the offer list, pending backlogs,
 * and anything already registered - every row carrying its eligibility.
 *
 * POST because the learner list is unbounded in practice.
 */
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

		const learners: BulkLearnerRef[] = (Array.isArray(body.learners) ? body.learners : [])
			.map((l: any) => ({
				student_id: l?.student_id || l?.id || null,
				register_number: String(l?.register_number || l?.stu_register_no || '').trim(),
				student_name: String(l?.student_name || '').trim() || null,
				program_code: l?.program_code || null,
				semester: l?.semester != null ? Number(l.semester) : null,
			}))
			.filter((l: BulkLearnerRef) => l.register_number || l.student_id)

		if (learners.length === 0) {
			return NextResponse.json({ error: 'Select at least one learner' }, { status: 400 })
		}
		if (learners.length > MAX_LEARNERS) {
			return NextResponse.json(
				{ error: `Too many learners in one request (${learners.length}). Select at most ${MAX_LEARNERS}.` },
				{ status: 400 }
			)
		}

		// The course lists and the fee rate book are independent lookups, so they are
		// fetched together rather than one after the other.
		const asOf = new Date().toISOString().slice(0, 10)
		const [data, book] = await Promise.all([
			buildBulkExamApplicationCourses(supabase, {
				institutions_id,
				examination_session_id,
				learners,
			}),
			loadFeeRateBook(supabase, { institutions_id, examination_session_id, asOf }),
		])

		// ── Price every course, then quote each learner ──
		const fineApplicable = isFineApplicable(book.schedule, asOf)
		const fine = fineApplicable ? (book.schedule?.fine_amount || 0) : 0

		for (const learner of data) {
			const level = resolveProgramLevel(learner.program_code, book.levelByProgram)
			const priced = priceCourseList(book, level, learner.courses, learner.program_code)

			const paper_lines: FeeLineItem[] = []
			const unpriced_courses: string[] = []

			for (const course of learner.courses) {
				const quote = priced.get(course.course_code.trim().toUpperCase())
				course.fee_head = quote?.head ?? null
				course.fee_amount = quote?.amount ?? null

				// Only papers the learner can actually apply for are billed.
				if (!course.is_eligible || !quote?.head) continue
				if (quote.amount == null) {
					unpriced_courses.push(course.course_code)
					continue
				}
				paper_lines.push({
					head: quote.head,
					label: PAPER_FEE_HEAD_LABELS[quote.head as PaperFeeHead],
					course_code: course.course_code,
					amount: quote.amount,
				})
			}

			// Mark statement + application are charged once per session, so a learner
			// who already holds registrations this session has paid them already.
			const learner_lines =
				learner.registered_count > 0 ? [] : learnerChargeLines(book, level, learner.program_code)

			const paper_total = paper_lines.reduce((sum, l) => sum + l.amount, 0)
			const learner_total = learner_lines.reduce((sum, l) => sum + l.amount, 0)

			learner.fee = book.isEmpty ? null : {
				program_level: level,
				paper_lines,
				learner_lines,
				fine,
				paper_total,
				learner_total,
				total: paper_total + learner_total + fine,
				unpriced_courses,
			}
		}

		const summary = {
			learners: data.length,
			courses: data.reduce((sum, l) => sum + l.courses.length, 0),
			eligible: data.reduce((sum, l) => sum + l.eligible_count, 0),
			backlog: data.reduce((sum, l) => sum + l.backlog_count, 0),
			registered: data.reduce((sum, l) => sum + l.registered_count, 0),
		}

		return NextResponse.json({
			data,
			summary,
			fee: {
				configured: !book.isEmpty,
				circular_ref: book.schedule?.circular_ref || null,
				last_date_without_fine: book.schedule?.last_date_without_fine || null,
				last_date_with_fine: book.schedule?.last_date_with_fine || null,
				fine_amount: book.schedule?.fine_amount || 0,
				fine_applicable: fineApplicable,
				as_of: asOf,
			},
		})
	} catch (e) {
		console.error('[exam-applications:bulk] learner-courses error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
