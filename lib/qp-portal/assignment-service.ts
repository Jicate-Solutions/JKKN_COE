// Shared assembly for one assignment: the row plus everything the Examiner
// Order, the Claim Form and the portal need. Used by the CoE routes and by the
// portal routes so both print exactly the same document from the same data.

import { getPdfSettingsWithFallback } from '@/lib/pdf/settings-service'
import { getPortalContent, buildOrderRef } from './content'
import type { ExaminerOrderData, ClaimFormData } from '@/lib/pdf/examiner-order'
import type { QpAssignment, QpPortalContent } from '@/types/qp-examiner-assignment'

export interface AssignmentBundle {
	assignment: QpAssignment
	examiner: Record<string, any>
	institution: Record<string, any>
	session: Record<string, any> | null
	examType: Record<string, any> | null
	paper: Record<string, any> | null
}

/** Single printable address line from the institutions row. */
export function institutionAddress(inst: Record<string, any> | null): string {
	if (!inst) return ''
	return [inst.address_line1, inst.address_line2, inst.address_line3, inst.city, inst.state, inst.pin_code]
		.filter(Boolean)
		.join(', ')
}

/**
 * Load the assignment and its neighbours. Returns null when the assignment is
 * gone — every caller turns that into a 404.
 */
export async function loadAssignmentBundle(
	supabase: any,
	assignmentId: string
): Promise<AssignmentBundle | null> {
	const { data: assignment, error } = await supabase
		.from('ia_qp_assignments')
		.select('*')
		.eq('id', assignmentId)
		.maybeSingle()
	if (error || !assignment) return null

	const [examinerRes, institutionRes, sessionRes, paperRes] = await Promise.all([
		supabase.from('examiners').select('*').eq('id', assignment.examiner_id).maybeSingle(),
		supabase.from('institutions').select('*').eq('id', assignment.institutions_id).maybeSingle(),
		assignment.examination_session_id
			? supabase
					.from('examination_sessions')
					.select('id, session_name, session_code, month_year, exam_type_id')
					.eq('id', assignment.examination_session_id)
					.maybeSingle()
			: Promise.resolve({ data: null }),
		supabase
			.from('ese_question_papers')
			.select('id, status, max_marks, duration_minutes, subject_title, course_code, set_label, semester, program_code, questions')
			.eq('id', assignment.paper_id)
			.maybeSingle(),
	])

	// exam_type_id may sit on the assignment or be inherited from the session.
	const examTypeId = assignment.exam_type_id || sessionRes.data?.exam_type_id || null
	const examTypeRes = examTypeId
		? await supabase
				.from('exam_types')
				.select('id, examination_code, examination_name')
				.eq('id', examTypeId)
				.maybeSingle()
		: { data: null }

	return {
		assignment: assignment as QpAssignment,
		examiner: examinerRes.data || {},
		institution: institutionRes.data || {},
		session: sessionRes.data || null,
		examType: examTypeRes.data || null,
		paper: paperRes.data || null,
	}
}

/** Absolute URL of the examiner portal, for the order's "sign in here" box. */
export function portalUrl(): string {
	const base = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '')
	return `${base || ''}/engg-examiner-registration`
}

/** Assemble everything the Examiner Order PDF needs. */
export async function buildOrderData(bundle: AssignmentBundle): Promise<ExaminerOrderData> {
	const { assignment, examiner, institution, session, examType, paper } = bundle

	const [content, pdfSettings] = await Promise.all([
		getPortalContent(assignment.institutions_id, 'order', assignment.examination_session_id),
		getPdfSettingsWithFallback(institution.institution_code || assignment.institution_code || '', 'default'),
	])

	return {
		institution: {
			name: institution.name || 'Institution',
			institution_code: institution.institution_code || assignment.institution_code || '',
			address: institutionAddress(institution),
			accreditation: institution.accredited_by || null,
		},
		examiner: {
			full_name: examiner.full_name || '',
			designation: examiner.designation || null,
			department: examiner.department || null,
			institution_name: examiner.institution_name || null,
			address: examiner.institution_address || examiner.address || null,
			email: examiner.email || '',
			kind: assignment.examiner_kind === 'internal' ? 'internal' : 'external',
		},
		examination: {
			exam_type_name: examType?.examination_name || 'End Semester Examinations',
			session_name: session?.session_name || null,
			session_label: content.session_label || session?.month_year || null,
			program_code: assignment.program_code || paper?.program_code || null,
			semester: assignment.semester ?? paper?.semester ?? null,
		},
		subject: {
			course_code: assignment.course_code || paper?.course_code || '',
			title: assignment.subject_title || paper?.subject_title || '',
			set_label: assignment.set_label || paper?.set_label || null,
			max_marks: paper?.max_marks ?? null,
			duration_minutes: paper?.duration_minutes ?? null,
		},
		assignment: {
			order_ref_no: assignment.order_ref_no || null,
			order_date: assignment.order_issued_at || assignment.assigned_at,
			valid_from: assignment.valid_from,
			valid_to: assignment.valid_to,
			remuneration: assignment.remuneration ?? null,
			portal_url: portalUrl(),
		},
		content: content as QpPortalContent,
		pdf_settings: pdfSettings,
	}
}

/** Same, for the Claim Form (adds bank details + the stored signature). */
export async function buildClaimData(
	supabase: any,
	bundle: AssignmentBundle
): Promise<ClaimFormData> {
	const base = await buildOrderData(bundle)
	const { assignment, examiner } = bundle

	const claimContent = await getPortalContent(
		assignment.institutions_id,
		'claim',
		assignment.examination_session_id
	)

	let signatureBase64: string | null = null
	if (examiner.signature_path) {
		// The signature bucket is PRIVATE — download the bytes server-side rather
		// than putting a URL in a document that gets e-mailed around.
		try {
			const { data, error } = await supabase.storage
				.from(SIGNATURE_BUCKET)
				.download(examiner.signature_path)
			if (!error && data) {
				const bytes = Buffer.from(await data.arrayBuffer())
				const ext = examiner.signature_path.split('.').pop()?.toLowerCase() || 'png'
				const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
				signatureBase64 = `data:${mime};base64,${bytes.toString('base64')}`
			}
		} catch (e) {
			console.warn('[QP portal] signature download failed:', e)
		}
	}

	return {
		...base,
		content: claimContent as QpPortalContent,
		bank: {
			account_holder: examiner.bank_account_holder || examiner.full_name || null,
			bank_name: examiner.bank_name || null,
			account_number: examiner.bank_account_number || null,
			branch: examiner.bank_branch || null,
			ifsc: examiner.bank_ifsc || null,
		},
		signatureBase64,
		claim_date: assignment.claim_submitted_at || null,
	}
}

export const SIGNATURE_BUCKET = 'examiner-signatures'

/**
 * Ensure the private signature bucket exists. Storage buckets can be created
 * with the service role (unlike DDL), so the portal is self-provisioning rather
 * than depending on a manual step.
 */
export async function ensureSignatureBucket(supabase: any): Promise<void> {
	try {
		const { data } = await supabase.storage.getBucket(SIGNATURE_BUCKET)
		if (data) return
		await supabase.storage.createBucket(SIGNATURE_BUCKET, {
			public: false,
			fileSizeLimit: 2 * 1024 * 1024,
			allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
		})
	} catch (e) {
		console.warn('[QP portal] signature bucket check failed:', e)
	}
}

/**
 * Allocate the next order reference for an institution. The unique index on
 * (institutions_id, order_ref_no) is the real guard; this only picks a free
 * number, and the caller retries once on a collision.
 */
export async function nextOrderRef(
	supabase: any,
	institutionsId: string,
	letterRef: string | null | undefined
): Promise<string> {
	const { count } = await supabase
		.from('ia_qp_assignments')
		.select('id', { count: 'exact', head: true })
		.eq('institutions_id', institutionsId)
		.not('order_ref_no', 'is', null)
	return buildOrderRef(letterRef, (count || 0) + 1)
}
