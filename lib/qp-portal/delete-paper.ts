// Removing a generated End-Semester question paper.
//
// One place for the rule, shared by the single-paper DELETE and the bulk DELETE:
//
//   • A paper nobody has been appointed to is simply removed.
//   • A paper with a live appointment is refused (409 ASSIGNED) unless the
//     caller asks for `force` AND holds an unrestricted role — then the
//     appointment goes with it. That is the "admin delete" for a paper that was
//     generated with the wrong format and already handed out.
//   • A paper whose examiner has ever SUBMITTED is never deleted, by anyone:
//     the submitted versions are frozen rows (ia_qp_paper_versions refuses
//     DELETE) and the order and claim behind them are part of the record.
//     Reopen or cancel through the assignment instead.
//
// Every removal writes the audit log first — assignment_deleted per appointment
// and paper_deleted for the paper — keyed by record_id so the rows outlive what
// they describe.

import type { NextRequest } from 'next/server'
import { logAccess } from '@/lib/qp-portal/guard'
import { countAuthored } from '@/lib/ia/sub-questions'
import { deletePaperDriveFiles } from '@/lib/ia/question-paper-files'

export interface DeleteActor {
	userId?: string | null
	email?: string | null
}

export interface DeletePaperOptions {
	/** Remove a live appointment along with the paper (unrestricted roles only). */
	force: boolean
	/** Caller holds super_admin / coe — may force, and may delete a locked paper. */
	unrestricted: boolean
	actor: DeleteActor
}

export type DeletePaperResult =
	| { ok: true; course_code: string; assignments_removed: number; authored_count: number }
	| { ok: false; status: number; code: 'NOT_FOUND' | 'ASSIGNED' | 'SUBMITTED' | 'LOCKED' | 'FORBIDDEN' | 'DB' | 'SCHEMA'; error: string }

/** True once the examiner has handed anything in — the point of no deletion. */
export function assignmentEverSubmitted(a: any): boolean {
	return (
		['submitted', 'accepted'].includes(String(a?.status)) ||
		!!a?.submitted_at ||
		(Number(a?.paper_version) || 0) > 0 ||
		(!!a?.submission_stage && a.submission_stage !== 'authoring')
	)
}

export async function deleteEsePaper(
	supabase: any,
	req: NextRequest,
	paperId: string,
	opts: DeletePaperOptions
): Promise<DeletePaperResult> {
	const { data: paper } = await supabase
		.from('ese_question_papers')
		.select('id, status, course_code, program_code, semester, set_number, template_id, institutions_id, examination_session_id, questions')
		.eq('id', paperId)
		.maybeSingle()
	if (!paper) return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Paper not found' }

	const label = paper.course_code || 'This paper'
	const qs = Array.isArray(paper.questions) ? paper.questions : []
	const authoredCount = countAuthored(qs)

	const { data: assignments } = await supabase
		.from('ia_qp_assignments')
		.select('id, examiner_id, status, order_ref_no, submitted_at, paper_version, submission_stage')
		.eq('paper_id', paperId)
	const all: any[] = assignments || []
	const live = all.filter(a => a.status !== 'cancelled')

	if (all.some(assignmentEverSubmitted)) {
		return {
			ok: false,
			status: 409,
			code: 'SUBMITTED',
			error: `${label} has a question paper submitted by its examiner. Submitted work is never deleted — reopen it with a reason, or accept it.`,
		}
	}
	if (live.length > 0) {
		if (!opts.force) {
			return {
				ok: false,
				status: 409,
				code: 'ASSIGNED',
				error: `${label} is assigned to an examiner. Cancel the assignment before deleting the paper.`,
			}
		}
		if (!opts.unrestricted) {
			return {
				ok: false,
				status: 403,
				code: 'FORBIDDEN',
				error: `${label} is assigned to an examiner. Only the Controller of Examinations or a super admin can remove an assigned paper.`,
			}
		}
	}
	if (paper.status === 'locked' && !opts.unrestricted) {
		return { ok: false, status: 400, code: 'LOCKED', error: `${label} is locked and cannot be deleted.` }
	}

	const actor = {
		performed_by_user_id: opts.actor.userId || null,
		performed_by_email: opts.actor.email || null,
		performed_by_role: 'coe' as const,
		institutions_id: paper.institutions_id,
		paper_id: paper.id,
	}

	// Audit first, keyed by record_id — never assignment_id, which would tie the
	// row to the assignment about to disappear.
	for (const a of all) {
		await logAccess(req, {
			...actor,
			action: 'assignment_deleted',
			examiner_id: a.examiner_id,
			module: 'assignment',
			record_id: a.id,
			reason: live.includes(a) ? 'Removed with the question paper (forced delete)' : 'Removed with the question paper',
			detail: { course_code: paper.course_code, order_ref_no: a.order_ref_no, forced: live.includes(a) },
			old_value: { status: a.status },
			new_value: null,
		})
	}
	if (all.length > 0) {
		const { error } = await supabase
			.from('ia_qp_assignments')
			.delete()
			.in('id', all.map(a => a.id))
		if (error) return dbFailure(error.message)
	}

	await logAccess(req, {
		...actor,
		action: 'paper_deleted',
		module: 'paper',
		record_id: paper.id,
		detail: {
			course_code: paper.course_code,
			program_code: paper.program_code,
			semester: paper.semester,
			set_number: paper.set_number,
			template_id: paper.template_id,
			examination_session_id: paper.examination_session_id,
			authored_count: authoredCount,
			assignments_removed: all.length,
		},
		old_value: { status: paper.status, template_id: paper.template_id },
		new_value: null,
	})
	// Figures uploaded through the portal live in Google Drive; their registry
	// rows are marked deleted by the sweep (best effort — never blocks the delete).
	await deletePaperDriveFiles(paperId)

	const { error } = await supabase.from('ese_question_papers').delete().eq('id', paperId)
	if (error) return dbFailure(error.message)

	// Older question and answer-key images live in storage under <paper id>/…;
	// nothing in the database points at them once the paper is gone, so sweep
	// the folder. Best effort: a storage hiccup must not turn a completed delete
	// into an error.
	await removePaperImages(supabase, paperId)

	return { ok: true, course_code: label, assignments_removed: all.length, authored_count: authoredCount }
}

/** Bucket used by both the CoE image upload and the examiner portal upload. */
const IMAGE_BUCKET = 'question-images'

async function removePaperImages(supabase: any, paperId: string): Promise<void> {
	try {
		const { data: files } = await supabase.storage.from(IMAGE_BUCKET).list(paperId, { limit: 1000 })
		const paths = (files || []).map((f: any) => `${paperId}/${f.name}`)
		if (paths.length) await supabase.storage.from(IMAGE_BUCKET).remove(paths)
	} catch (e) {
		console.error('[ESE paper] image cleanup failed for', paperId, e)
	}
}

/**
 * The one database error worth translating: the audit-log cascade. It is a
 * known schema state, not a crash, so it answers 409 with the fix spelled out.
 */
function dbFailure(message: string): DeletePaperResult {
	if (/append-only/i.test(message)) {
		return {
			ok: false,
			status: 409,
			code: 'SCHEMA',
			error:
				'The database still cascades the audit log from assignments, so this paper cannot be deleted yet. ' +
				'Run supabase/migrations/20260911_qp_access_logs_no_cascade.sql in the Supabase SQL Editor, then try again.',
		}
	}
	return { ok: false, status: 500, code: 'DB', error: message }
}
