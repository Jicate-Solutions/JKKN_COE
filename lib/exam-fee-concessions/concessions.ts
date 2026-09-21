import type { SupabaseClient } from '@supabase/supabase-js'
import { tryFetchAllRows } from '@/lib/exam-applications/paginate'
import { chargeKey } from '@/lib/exam-applications/session-charges'
import type { ExamFeeConcession } from '@/types/exam-fee-concessions'

/**
 * Exam fee concessions
 * -----------------------------------------------------
 * Shared by the concession screen (records them) and Final Registration
 * Approval (takes them off the fee). Table + functions arrive with
 * supabase/migrations/20260921_exam_fee_concessions.sql; until it is run every
 * lookup here simply finds no concession, so final approval keeps working.
 */

export const CONCESSION_MIGRATION_HINT =
	'Run supabase/migrations/20260921_exam_fee_concessions.sql in the Supabase SQL Editor (creates exam_fee_concessions and lets final approval take the concession off the fee).'

/** Private bucket holding the approval letters */
export const CONCESSION_LETTER_BUCKET = 'exam-fee-concession-letters'
export const CONCESSION_LETTER_MAX_BYTES = 5 * 1024 * 1024
export const CONCESSION_LETTER_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

const COLUMNS =
	'id, institutions_id, institution_code, examination_session_id, session_code, student_id, stu_register_no, student_name, program_code, concession_type, exam_fee_waiver, application_fee_waiver, mark_statement_fee_waiver, letter_ref_no, letter_date, letter_file_path, letter_file_name, remarks, status, applied_at, created_at, updated_at'

const num = (value: unknown): number => {
	const n = Number(value)
	return Number.isFinite(n) ? n : 0
}

function normalize(row: any): ExamFeeConcession {
	return {
		...row,
		exam_fee_waiver: num(row.exam_fee_waiver),
		application_fee_waiver: num(row.application_fee_waiver),
		mark_statement_fee_waiver: num(row.mark_statement_fee_waiver),
	}
}

/** exam_fee_concessions exists - i.e. the migration has been applied */
export async function isConcessionMigrationReady(supabase: SupabaseClient): Promise<boolean> {
	const { error } = await supabase.from('exam_fee_concessions').select('id').limit(1)
	return !error
}

/** Every concession of the session; `status` narrows it. Empty when the table is missing. */
export async function loadSessionConcessions(
	supabase: SupabaseClient,
	params: { institutions_id: string; examination_session_id: string; status?: 'Active' | 'Applied' }
): Promise<ExamFeeConcession[]> {
	const rows = await tryFetchAllRows<any>(
		() => {
			let query = supabase
				.from('exam_fee_concessions')
				.select(COLUMNS)
				.eq('institutions_id', params.institutions_id)
				.eq('examination_session_id', params.examination_session_id)
			if (params.status) query = query.eq('status', params.status)
			return query
		},
		{ label: 'exam fee concessions' }
	)
	return rows.map(normalize)
}

/** Concessions indexed by the learner merge key used across the exam-application screens */
export function indexConcessionsByLearner(concessions: ExamFeeConcession[]): Map<string, ExamFeeConcession> {
	const map = new Map<string, ExamFeeConcession>()
	for (const c of concessions) {
		map.set(chargeKey({ student_id: c.student_id, register_number: c.stu_register_no }), c)
	}
	return map
}

/**
 * Ensure the private letter bucket exists. Storage buckets can be created with
 * the service role (unlike DDL), so this needs no manual step.
 */
export async function ensureConcessionLetterBucket(supabase: SupabaseClient): Promise<void> {
	try {
		const { data } = await supabase.storage.getBucket(CONCESSION_LETTER_BUCKET)
		if (data) return
		await supabase.storage.createBucket(CONCESSION_LETTER_BUCKET, {
			public: false,
			fileSizeLimit: CONCESSION_LETTER_MAX_BYTES,
			allowedMimeTypes: CONCESSION_LETTER_MIME_TYPES,
		})
	} catch (e) {
		console.warn('[exam-fee-concessions] letter bucket check failed:', e)
	}
}
