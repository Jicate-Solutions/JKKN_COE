import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { learnerKeyOf, loadPendingFinalApprovalCohort } from '@/lib/exam-registration-final-approval/cohort'
import {
	CONCESSION_LETTER_BUCKET,
	CONCESSION_LETTER_MAX_BYTES,
	CONCESSION_LETTER_MIME_TYPES,
	CONCESSION_MIGRATION_HINT,
	ensureConcessionLetterBucket,
	indexConcessionsByLearner,
	isConcessionMigrationReady,
	loadSessionConcessions,
} from '@/lib/exam-fee-concessions/concessions'
import { EXAM_FEE_CONCESSION_TYPES } from '@/types/exam-fee-concessions'
import type {
	ExamFeeConcessionLearner,
	ExamFeeConcessionListResponse,
	ExamFeeConcessionSaveResult,
} from '@/types/exam-fee-concessions'

/**
 * Exam Fee Concessions API
 * =====================================================
 * GET    - the session's applied learners (actual fee heads) with any concession
 *          recorded on them, plus every concession of the session.
 * POST   - multipart: record / change the concession of one or more learners
 *          against ONE approval letter (file + reference).
 * DELETE - remove a concession that has not been applied yet.
 *
 * Final Registration Approval takes an Active concession off the fee.
 * Migration: supabase/migrations/20260921_exam_fee_concessions.sql
 */

const VIEW_PERMISSION = 'page.exam_management.exam_fee_concessions.view'
const MANAGE_PERMISSION = 'page.exam_management.exam_fee_concessions.manage'

const MAX_LEARNERS_PER_REQUEST = 200

const round2 = (value: number) => Math.round(value * 100) / 100

/** A waiver typed by the office: a number >= 0, or null when it is not one */
function parseWaiver(raw: unknown): number | null {
	if (raw == null || raw === '') return 0
	const n = Number(raw)
	if (!Number.isFinite(n) || n < 0) return null
	return round2(n)
}

function safeFileName(name: string): string {
	const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
	return (cleaned || 'letter').slice(-120)
}

// =====================================================
// GET
// =====================================================
export async function GET(request: Request) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id') || ''
		const examination_session_id = searchParams.get('examination_session_id') || ''

		if (!institutions_id) return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		if (!examination_session_id) return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })

		const [cohort, concessions, migrationReady] = await Promise.all([
			loadPendingFinalApprovalCohort(supabase, { institutions_id, examination_session_id }),
			loadSessionConcessions(supabase, { institutions_id, examination_session_id }),
			isConcessionMigrationReady(supabase),
		])

		const concessionByLearner = indexConcessionsByLearner(concessions)

		const learners: ExamFeeConcessionLearner[] = cohort.learners.map(l => ({
			key: l.key,
			student_id: l.student_id,
			register_number: l.register_number,
			student_name: l.student_name,
			program_code: l.program_code,
			program_name: l.program_name,
			regulation_code: l.regulation_code,
			semester: l.semester,
			batch_year: l.batch_year,
			total_subjects: l.total_subjects,
			exam_fee: l.exam_fee,
			application_fee: l.application_fee,
			mark_statement_fee: l.mark_statement_fee,
			concession: concessionByLearner.get(l.key) || null,
		}))

		const response: ExamFeeConcessionListResponse = {
			learners,
			concessions: concessions.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no)),
			migration_ready: migrationReady,
		}
		return NextResponse.json(response)
	} catch (e) {
		console.error('[exam-fee-concessions] GET error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

// =====================================================
// POST - record concessions against one approval letter
// =====================================================
export async function POST(request: Request) {
	try {
		const perm = await requireUserPermission(MANAGE_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const form = await request.formData()

		const institutions_id = String(form.get('institutions_id') || '')
		const examination_session_id = String(form.get('examination_session_id') || '')
		const concession_type = String(form.get('concession_type') || '').trim()
		const letter_ref_no = String(form.get('letter_ref_no') || '').trim()
		const letter_date = String(form.get('letter_date') || '').trim() || null
		const remarks = String(form.get('remarks') || '').trim() || null
		const fileEntry = form.get('letter')
		const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null

		if (!institutions_id) return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		if (!examination_session_id) return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		if (!(EXAM_FEE_CONCESSION_TYPES as readonly string[]).includes(concession_type)) {
			return NextResponse.json({ error: 'Select the concession type' }, { status: 400 })
		}
		if (!letter_ref_no) return NextResponse.json({ error: 'Enter the approval letter reference number' }, { status: 400 })
		if (letter_ref_no.length > 100) return NextResponse.json({ error: 'Letter reference is too long (100 characters at most)' }, { status: 400 })
		if (letter_date && !/^\d{4}-\d{2}-\d{2}$/.test(letter_date)) {
			return NextResponse.json({ error: 'Letter date must be a valid date' }, { status: 400 })
		}

		let entries: any[]
		try {
			entries = JSON.parse(String(form.get('entries') || '[]'))
		} catch {
			return NextResponse.json({ error: 'entries must be valid JSON' }, { status: 400 })
		}
		if (!Array.isArray(entries) || entries.length === 0) {
			return NextResponse.json({ error: 'Enter a concession amount for at least one learner' }, { status: 400 })
		}
		if (entries.length > MAX_LEARNERS_PER_REQUEST) {
			return NextResponse.json({ error: `Too many learners in one request (${entries.length}). Save at most ${MAX_LEARNERS_PER_REQUEST} at a time.` }, { status: 400 })
		}

		if (file) {
			if (file.size > CONCESSION_LETTER_MAX_BYTES) {
				return NextResponse.json({ error: 'The approval letter must be 5 MB or smaller' }, { status: 400 })
			}
			if (!CONCESSION_LETTER_MIME_TYPES.includes(file.type)) {
				return NextResponse.json({ error: 'The approval letter must be a PDF or an image (PNG / JPG / WEBP)' }, { status: 400 })
			}
		}

		if (!(await isConcessionMigrationReady(supabase))) {
			return NextResponse.json({ error: `Fee concessions are not set up yet. ${CONCESSION_MIGRATION_HINT}` }, { status: 503 })
		}

		// The actual fee comes from the database, never from the browser
		const [cohort, existing] = await Promise.all([
			loadPendingFinalApprovalCohort(supabase, { institutions_id, examination_session_id }),
			loadSessionConcessions(supabase, { institutions_id, examination_session_id }),
		])
		const learnerByKey = new Map(cohort.learners.map(l => [l.key, l]))
		const existingByLearner = indexConcessionsByLearner(existing)

		const skipped: ExamFeeConcessionSaveResult['skipped'] = []
		const accepted: { learner: (typeof cohort.learners)[number]; exam: number; application: number; markStatement: number; existingId: string | null; hasLetter: boolean }[] = []

		for (const entry of entries) {
			const register_number = String(entry?.register_number || '').trim()
			const key = learnerKeyOf({ student_id: entry?.student_id || null, register_number })
			const learner = learnerByKey.get(key)
			if (!learner) {
				skipped.push({ register_number: register_number || key, reason: 'Not awaiting final approval (not applied, or already approved)' })
				continue
			}

			const exam = parseWaiver(entry?.exam_fee_waiver)
			const application = parseWaiver(entry?.application_fee_waiver)
			const markStatement = parseWaiver(entry?.mark_statement_fee_waiver)
			if (exam == null || application == null || markStatement == null) {
				return NextResponse.json({ error: `Concession amounts for ${learner.register_number} must be numbers of 0 or more` }, { status: 400 })
			}
			if (exam > learner.exam_fee || application > learner.application_fee || markStatement > learner.mark_statement_fee) {
				return NextResponse.json(
					{ error: `Concession for ${learner.register_number} is more than the actual fee (Exam ₹${learner.exam_fee}, Application ₹${learner.application_fee}, Mark Statement ₹${learner.mark_statement_fee})` },
					{ status: 400 }
				)
			}
			if (exam + application + markStatement <= 0) {
				skipped.push({ register_number: learner.register_number, reason: 'No concession amount entered' })
				continue
			}

			const current = existingByLearner.get(key)
			if (current?.status === 'Applied') {
				skipped.push({ register_number: learner.register_number, reason: 'Concession already applied at final approval' })
				continue
			}
			accepted.push({ learner, exam, application, markStatement, existingId: current?.id || null, hasLetter: !!current?.letter_file_path })
		}

		if (accepted.length === 0) {
			return NextResponse.json({ error: 'None of the learners could be given a concession. Refresh the list and try again.', skipped }, { status: 400 })
		}

		// A new concession needs its letter; a change may keep the one on file
		if (!file && accepted.some(a => !a.hasLetter)) {
			return NextResponse.json({ error: 'Attach the fee concession approval letter' }, { status: 400 })
		}

		// ── One upload, shared by every learner the letter covers ──
		let letter_file_path: string | null = null
		let letter_file_name: string | null = null
		if (file) {
			await ensureConcessionLetterBucket(supabase)
			letter_file_name = file.name.slice(-255)
			letter_file_path = `${institutions_id}/${examination_session_id}/${Date.now()}-${safeFileName(file.name)}`
			const { error: uploadError } = await supabase.storage
				.from(CONCESSION_LETTER_BUCKET)
				.upload(letter_file_path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
			if (uploadError) {
				console.error('[exam-fee-concessions] letter upload failed:', uploadError)
				return NextResponse.json({ error: `Could not upload the approval letter: ${uploadError.message}` }, { status: 500 })
			}
		}

		const base = {
			institutions_id,
			institution_code: cohort.institution?.institution_code || null,
			examination_session_id,
			session_code: cohort.session?.session_code || null,
			concession_type,
			letter_ref_no,
			letter_date,
			remarks,
		}

		let saved = 0
		for (const a of accepted) {
			const row = {
				...base,
				student_id: a.learner.student_id,
				stu_register_no: a.learner.register_number,
				student_name: a.learner.student_name || null,
				program_code: a.learner.program_code,
				exam_fee_waiver: a.exam,
				application_fee_waiver: a.application,
				mark_statement_fee_waiver: a.markStatement,
				// No new file = keep the letter already on the concession
				...(letter_file_path ? { letter_file_path, letter_file_name } : {}),
			}

			const { error } = a.existingId
				// Atomic guard: a concession applied in the meantime is left alone
				? await supabase.from('exam_fee_concessions').update(row).eq('id', a.existingId).eq('status', 'Active')
				: await supabase.from('exam_fee_concessions').insert({ ...row, status: 'Active', created_by: perm.userId || null })

			if (error) {
				console.error('[exam-fee-concessions] save failed:', error)
				skipped.push({ register_number: a.learner.register_number, reason: error.message })
				continue
			}
			saved++
		}

		const result: ExamFeeConcessionSaveResult = {
			success: saved > 0 && skipped.length === 0,
			message: `Fee concession saved for ${saved} learner${saved === 1 ? '' : 's'}.`,
			saved,
			skipped,
		}
		return NextResponse.json(result, { status: saved > 0 ? 200 : 400 })
	} catch (e) {
		console.error('[exam-fee-concessions] POST error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

// =====================================================
// DELETE - remove a concession that has not been applied
// =====================================================
export async function DELETE(request: Request) {
	try {
		const perm = await requireUserPermission(MANAGE_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const id = new URL(request.url).searchParams.get('id') || ''
		if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

		// Only an unused concession can go: an Applied one is part of an approval
		const { data, error } = await supabase
			.from('exam_fee_concessions')
			.delete()
			.eq('id', id)
			.eq('status', 'Active')
			.select('id, letter_file_path')

		if (error) {
			console.error('[exam-fee-concessions] DELETE failed:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		if (!data || data.length === 0) {
			return NextResponse.json(
				{ error: 'This concession has already been applied at final approval (or was removed). Unapprove the learner first to change it.' },
				{ status: 409 }
			)
		}

		// The letter file goes too - unless another learner's concession shares it
		const path = data[0].letter_file_path
		if (path) {
			const { count } = await supabase
				.from('exam_fee_concessions')
				.select('id', { count: 'exact', head: true })
				.eq('letter_file_path', path)
			if (!count) await supabase.storage.from(CONCESSION_LETTER_BUCKET).remove([path])
		}

		return NextResponse.json({ success: true })
	} catch (e) {
		console.error('[exam-fee-concessions] DELETE error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
