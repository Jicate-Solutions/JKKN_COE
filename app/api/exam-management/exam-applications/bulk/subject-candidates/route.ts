import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { buildSubjectWiseCandidates } from '@/lib/exam-applications/bulk-course-list'
import {
	isFineApplicable,
	learnerChargeLines,
	loadFeeRateBook,
	priceCourseList,
	resolveProgramLevel,
} from '@/lib/exam-fee/calculate'
import type { BulkLearnerRef } from '@/types/exam-applications'

/**
 * Bulk Exam Application - Subject-wise candidates
 *
 * Given one course offering, returns every learner who can apply for it:
 *   - Current paper : the programme + semester cohort, posted in by the caller
 *                     (only the browser session can page the MyJKKN learner API)
 *   - Backlog       : anyone in the institution holding an uncleared backlog for
 *                     this course code, whatever semester they are now in
 *
 * Learners already registered in the session come back marked ineligible so the
 * operator can see the full picture without re-selecting them.
 *
 * POST because the cohort can run to thousands of learners - far past a URL limit.
 */
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const institutions_id = body.institutions_id
		const examination_session_id = body.examination_session_id
		const course_offering_id = body.course_offering_id

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}
		if (!examination_session_id) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}
		if (!course_offering_id) {
			return NextResponse.json({ error: 'course_offering_id is required' }, { status: 400 })
		}

		const cohort: BulkLearnerRef[] = (Array.isArray(body.cohort) ? body.cohort : [])
			.map((l: any) => ({
				student_id: l?.student_id || l?.id || null,
				register_number: String(l?.register_number || l?.stu_register_no || '').trim(),
				student_name: String(l?.student_name || '').trim() || null,
				program_code: l?.program_code || null,
				semester: l?.semester != null ? Number(l.semester) : null,
			}))
			.filter((l: BulkLearnerRef) => l.register_number || l.student_id)

		const { offering, candidates } = await buildSubjectWiseCandidates(supabase, {
			institutions_id,
			examination_session_id,
			course_offering_id,
			cohort,
		})

		// course_category + exam_duration decide which fee head this paper falls under
		const { data: offeringCourse } = await supabase
			.from('courses')
			.select('course_code, course_category, exam_duration')
			.eq('course_code', offering.course_code)
			.maybeSingle()

		// ── Price each candidate for this one paper ──
		const asOf = new Date().toISOString().slice(0, 10)
		const book = await loadFeeRateBook(supabase, { institutions_id, examination_session_id, asOf })
		const fineApplicable = isFineApplicable(book.schedule, asOf)
		const fine = fineApplicable ? (book.schedule?.fine_amount || 0) : 0

		if (!book.isEmpty) {
			// The paper is the same for everyone, but the rate depends on each
			// learner's own fee tier - a backlog holder can sit in a different
			// programme than the one the offering belongs to.
			const rateByLevel = new Map<string, number | null>()

			for (const candidate of candidates) {
				const level = resolveProgramLevel(candidate.program_code || offering.program_code, book.levelByProgram)

				if (!rateByLevel.has(level)) {
					const priced = priceCourseList(book, level, [{
						course_code: offering.course_code,
						course_category: offeringCourse?.course_category ?? null,
						exam_duration: offeringCourse?.exam_duration ?? null,
					}])
					rateByLevel.set(level, priced.get(offering.course_code.trim().toUpperCase())?.amount ?? null)
				}

				const paperFee = rateByLevel.get(level) ?? null
				const learnerCharge = candidate.has_session_registration
					? 0
					: learnerChargeLines(book, level).reduce((sum, l) => sum + l.amount, 0)
				const rowFine = candidate.is_eligible ? fine : 0

				candidate.fee_level = level
				candidate.fee_amount = paperFee
				candidate.learner_charge = candidate.is_eligible ? learnerCharge : 0
				candidate.fine = rowFine
				candidate.fee_total = candidate.is_eligible
					? (paperFee || 0) + learnerCharge + rowFine
					: 0
			}
		}

		const summary = {
			total: candidates.length,
			eligible: candidates.filter(c => c.is_eligible).length,
			current_paper: candidates.filter(c => c.sources.includes('Offer List')).length,
			backlog: candidates.filter(c => c.is_backlog).length,
			registered: candidates.filter(c => c.is_registered).length,
			not_eligible: candidates.filter(c => !c.is_eligible).length,
		}

		return NextResponse.json({
			offering,
			data: candidates,
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
		console.error('[exam-applications:bulk] subject-candidates error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
