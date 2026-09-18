// Examiner portal — the three-step submission walk.
//
// POST /api/examiner-portal/assignments/:id/submission
//   { step: 'checklist', checklist: { <clause id>: 'YES' | 'NO' } }
//   { step: 'signature', signature: '<data:image/png;base64,...>',
//                        declaration_accepted: true, complete?: true }
//   { step: 'final' }
//
// `complete: true` on the signature step signs AND completes in one request —
// what the portal sends. `final` remains for a signature saved earlier.
// The check list step requires the claim form to be in first.
//
// The paper's content is handed over by the paper route (PUT ?submit); this
// route owns everything after it:
//
//     checklist ──all answered──► signature ──signed + declared──► completed
//
// Each step refuses to run out of turn. The stage lives in the database, so an
// examiner who closes the browser mid-walk resumes exactly where they stopped,
// and one who skips straight to `final` with a crafted request is refused —
// the wizard's ordering is enforced here, not by which screen is on show.
//
// NOT window-gated. These steps expose no question content, and a paper already
// delivered must not be left un-attested because the clock ran out. See
// AssignmentAccess.canCompleteSubmission.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireAssignment, logAccess } from '@/lib/qp-portal/guard'
import { getPortalContent } from '@/lib/qp-portal/content'
import { SIGNATURE_BUCKET, ensureSignatureBucket } from '@/lib/qp-portal/assignment-service'
import type { QpSubmissionStage } from '@/types/qp-examiner-assignment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Step = 'checklist' | 'signature' | 'final'

/** The stage a step is allowed to run from. */
const REQUIRED_STAGE: Record<Step, QpSubmissionStage> = {
	checklist: 'checklist',
	signature: 'signature',
	final: 'signature',
}

const MAX_SIGNATURE_BYTES = 1_000_000

/** Decode a `data:image/png;base64,...` payload from the signature canvas. */
function decodeSignature(dataUrl: unknown): { buffer: Buffer; contentType: string; ext: string } | null {
	const s = String(dataUrl ?? '')
	const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(s)
	if (!m) return null
	const buffer = Buffer.from(m[3], 'base64')
	if (buffer.length === 0 || buffer.length > MAX_SIGNATURE_BYTES) return null
	return { buffer, contentType: m[1], ext: m[2] === 'jpeg' ? 'jpg' : m[2] }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const body = await req.json().catch(() => ({}))
	const step = body.step as Step

	// Authenticate BEFORE validating the payload, so an anonymous caller learns
	// nothing about the shape of this route.
	const auth = await requireAssignment(req, id, { action: `submission ${step}` })
	if (!auth.ok) return auth.response

	if (!['checklist', 'signature', 'final'].includes(step)) {
		return NextResponse.json({ error: `Unknown submission step "${step}".` }, { status: 400 })
	}

	const { assignment, stage } = auth.access
	const supabase = getSupabaseServer()

	if (stage === 'authoring') {
		return NextResponse.json(
			{ error: 'Submit the question paper first.', submission_stage: stage },
			{ status: 400 }
		)
	}
	if (stage === 'completed') {
		return NextResponse.json(
			{ error: 'This submission is already complete.', submission_stage: stage },
			{ status: 409 }
		)
	}
	if (stage !== REQUIRED_STAGE[step]) {
		return NextResponse.json(
			{
				error:
					step === 'checklist'
						? 'The check list has already been completed.'
						: 'Complete the check list before signing.',
				submission_stage: stage,
			},
			{ status: 409 }
		)
	}

	const now = new Date().toISOString()

	try {
		// ── Step 1: the check list ──────────────────────────────────────────
		if (step === 'checklist') {
			// The claim form comes BEFORE the check list: one of its items asks the
			// examiner to confirm the bank details on the claim form, which cannot
			// be answered while no claim exists. An examiner whose claim is already
			// in (an earlier submission, a resubmission after a return) goes
			// straight on.
			if ((assignment.claim_status || 'pending') === 'pending') {
				return NextResponse.json(
					{ error: 'Fill in and submit your claim form first — it comes before the check list.', needs_claim: true },
					{ status: 409 }
				)
			}

			const answers = (body.checklist || {}) as Record<string, unknown>

			// Completeness is judged against the CoE's OWN clause list, not against
			// whatever the client happened to send — a request carrying one answer
			// for one invented clause would otherwise pass as "all answered".
			const content = await getPortalContent(
				assignment.institutions_id,
				'checklist',
				assignment.examination_session_id
			)
			const clauses: { id: string; text: string; detail_label?: string }[] = (content as any)?.body || []

			if (clauses.length === 0) {
				return NextResponse.json(
					{ error: 'No check list has been published for this examination. Contact the Office of the Controller of Examinations.' },
					{ status: 409 }
				)
			}

			// Every item is answered YES or NO; an item that asks for a detail
			// (tables / charts, data book, graph paper) must carry it when YES.
			// Only answers to real clauses are stored, so junk keys cannot land, and
			// the clause text is stored WITH the answer so the record still reads
			// correctly after the CoE edits the list.
			const clean: Record<string, { question: string; answer: 'YES' | 'NO'; detail?: string }> = {}
			const unanswered: string[] = []
			const missingDetail: string[] = []
			for (const c of clauses) {
				const raw = answers[c.id]
				const o = (typeof raw === 'string' ? { answer: raw } : raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
				const answer = String(o.answer || '').trim().toUpperCase()
				if (answer !== 'YES' && answer !== 'NO') {
					unanswered.push(c.id)
					continue
				}
				const detail = String(o.detail || '').trim().slice(0, 200)
				if (c.detail_label && answer === 'YES' && !detail) {
					missingDetail.push(c.id)
					continue
				}
				clean[c.id] = { question: c.text, answer, ...(detail ? { detail } : {}) }
			}

			if (unanswered.length > 0) {
				return NextResponse.json(
					{
						error: `Answer YES or NO to every check list item — ${unanswered.length} still to go.`,
						unanswered,
					},
					{ status: 400 }
				)
			}
			if (missingDetail.length > 0) {
				return NextResponse.json(
					{
						error: `Fill in the detail asked for on the item${missingDetail.length > 1 ? 's' : ''} you answered YES — ${missingDetail.length} still to go.`,
						unanswered: missingDetail,
					},
					{ status: 400 }
				)
			}

			const { error } = await supabase
				.from('ia_qp_assignments')
				.update({
					checklist: clean,
					checklist_completed_at: now,
					submission_stage: 'signature',
					updated_at: now,
				})
				.eq('id', id)
				.eq('submission_stage', 'checklist')

			if (error) {
				console.error('[QP portal] checklist save failed:', error.message)
				return NextResponse.json({ error: 'The check list could not be saved.' }, { status: 500 })
			}

			await logAccess(req, {
				action: 'checklist_complete',
				module: 'checklist',
				performed_by_role: 'examiner',
				version: assignment.paper_version || null,
				new_value: clean,
				examiner_id: auth.examiner.id,
				examiner_email: auth.examiner.email,
				assignment_id: id,
				paper_id: assignment.paper_id,
				institutions_id: assignment.institutions_id,
				detail: { items: clauses.length },
			})

			return NextResponse.json({
				success: true,
				submission_stage: 'signature',
				checklist_completed_at: now,
				message: 'Check list completed. Now add your signature.',
			})
		}

		// ── Step 2: the declaration + signature ─────────────────────────────
		if (step === 'signature') {
			if (body.declaration_accepted !== true) {
				return NextResponse.json(
					{ error: 'Accept the declaration before signing.' },
					{ status: 400 }
				)
			}

			const decoded = decodeSignature(body.signature)
			if (!decoded) {
				return NextResponse.json(
					{ error: 'Your signature could not be read. Sign in the box and try again.' },
					{ status: 400 }
				)
			}

			await ensureSignatureBucket(supabase)
			// Per assignment, so the specimen signature on the profile is untouched.
			const path = `submissions/${id}/signature-${Date.now()}.${decoded.ext}`
			const { error: upErr } = await supabase.storage
				.from(SIGNATURE_BUCKET)
				.upload(path, decoded.buffer, { contentType: decoded.contentType, upsert: false })
			if (upErr) {
				console.error('[QP portal] submission signature upload failed:', upErr.message)
				return NextResponse.json({ error: 'The signature could not be saved.' }, { status: 500 })
			}

			// `complete: true` signs AND completes in this one request. For the
			// examiner signing is the final act, so the portal sends both together
			// rather than paying for a second round trip. The check list is already
			// guaranteed: the stage only reaches 'signature' once it is done.
			const completing = body.complete === true && !!assignment.checklist_completed_at
			const { error } = await supabase
				.from('ia_qp_assignments')
				.update({
					submission_signature_path: path,
					signed_at: now,
					declaration_accepted_at: assignment.declaration_accepted_at || now,
					...(completing ? { submission_stage: 'completed', final_submitted_at: now } : {}),
					updated_at: now,
				})
				.eq('id', id)
				.eq('submission_stage', 'signature')

			if (error) {
				// Don't leave an orphan object behind if the row write failed.
				await supabase.storage.from(SIGNATURE_BUCKET).remove([path])
				console.error('[QP portal] signature save failed:', error.message)
				return NextResponse.json({ error: 'The signature could not be saved.' }, { status: 500 })
			}

			await logAccess(req, {
				action: 'submission_signed',
				module: 'signature',
				performed_by_role: 'examiner',
				version: assignment.paper_version || null,
				examiner_id: auth.examiner.id,
				examiner_email: auth.examiner.email,
				assignment_id: id,
				paper_id: assignment.paper_id,
				institutions_id: assignment.institutions_id,
			})

			if (completing) {
				await logAccess(req, {
					action: 'submission_completed',
					module: 'paper',
					performed_by_role: 'examiner',
					version: assignment.paper_version || null,
					old_value: { submission_stage: 'signature' },
					new_value: { submission_stage: 'completed' },
					examiner_id: auth.examiner.id,
					examiner_email: auth.examiner.email,
					assignment_id: id,
					paper_id: assignment.paper_id,
					institutions_id: assignment.institutions_id,
				})
				return NextResponse.json({
					success: true,
					submission_stage: 'completed',
					signed_at: now,
					final_submitted_at: now,
					message: 'Submission completed. Your signed claim form can now be downloaded.',
				})
			}

			return NextResponse.json({
				success: true,
				submission_stage: 'signature',
				signed_at: now,
				message: 'Signature saved. Submit to complete.',
			})
		}

		// ── Step 3: final submit ────────────────────────────────────────────
		if (!assignment.checklist_completed_at) {
			return NextResponse.json({ error: 'Complete the check list first.' }, { status: 400 })
		}
		if (!assignment.submission_signature_path) {
			return NextResponse.json({ error: 'Add your signature first.' }, { status: 400 })
		}

		const { error } = await supabase
			.from('ia_qp_assignments')
			.update({
				submission_stage: 'completed',
				final_submitted_at: now,
				updated_at: now,
			})
			.eq('id', id)
			.eq('submission_stage', 'signature')

		if (error) {
			console.error('[QP portal] final submit failed:', error.message)
			return NextResponse.json({ error: 'The submission could not be completed.' }, { status: 500 })
		}

		await logAccess(req, {
			action: 'submission_completed',
			module: 'paper',
			performed_by_role: 'examiner',
			version: assignment.paper_version || null,
			old_value: { submission_stage: 'signature' },
			new_value: { submission_stage: 'completed' },
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
		})

		return NextResponse.json({
			success: true,
			submission_stage: 'completed',
			final_submitted_at: now,
			message: 'Submission completed. Your claim form is now available.',
		})
	} catch (error: any) {
		console.error('[QP portal] submission step', step, 'failed:', error)
		return NextResponse.json(
			{ error: error?.message || 'The submission step could not be completed.' },
			{ status: 500 }
		)
	}
}
