// Shared assembly for one assignment: the row plus everything the Examiner
// Order, the Claim Form and the portal need. Used by the CoE routes and by the
// portal routes so both print exactly the same document from the same data.

import { getPdfSettingsWithFallback } from '@/lib/pdf/settings-service'
import { getInstitutionHeader } from '@/lib/utils/institution-header'
import { getJkknLetterhead } from '@/lib/pdf/jkkn-letterhead'
import { getPortalContent, buildOrderRef } from './content'
import type { ExaminerOrderData, ClaimFormData } from '@/lib/pdf/examiner-order'
import type { QpAssignment, QpPortalContent } from '@/types/qp-examiner-assignment'

export interface AssignmentBundle {
	/** courses row for assignment.course_id — regulation, programme name. */
	course?: Record<string, any> | null
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

	const [examinerRes, institutionRes, sessionRes, paperRes, courseRes] = await Promise.all([
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
		assignment.course_id
			? supabase
					.from('courses')
					.select('id, course_code, course_name, regulation_code, program_code, program_nam')
					.eq('id', assignment.course_id)
					.maybeSingle()
			: Promise.resolve({ data: null }),
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
		course: courseRes.data || null,
	}
}

/**
 * Absolute URL of the examiner portal, for the order's "sign in here" box.
 *
 * The short `/examiner` path, because this string is printed on the order and
 * read out over the phone to setters who cannot find the e-mail. The old
 * `/engg-examiner-registration` path serves the same page and stays public, so
 * orders issued before this change keep working.
 */
export function portalUrl(): string {
	const base = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '')
	return `${base || ''}/examiner`
}

/** Assemble everything the Examiner Order PDF needs. */
export async function buildOrderData(bundle: AssignmentBundle): Promise<ExaminerOrderData> {
	const { assignment, examiner, institution, session, examType, paper, course } = bundle

	const institutionCode = institution.institution_code || assignment.institution_code || ''
	const branding = getInstitutionHeader(institutionCode)
	const letterhead = getJkknLetterhead(institutionCode)

	const [content, pdfSettings] = await Promise.all([
		getPortalContent(assignment.institutions_id, 'order', assignment.examination_session_id),
		getPdfSettingsWithFallback(institutionCode, 'default'),
	])

	return {
		institution: {
			// The letterhead comes from the per-institution branding config — the
			// same source the hall ticket and the mark reports print from — because
			// the `institutions` table carries only a code and a name. It has no
			// accreditation, address or logo column, so an order built from the row
			// alone printed a bare name and nothing else.
			name: branding.name || institution.name || 'Institution',
			institution_code: institutionCode,
			address: branding.address || institutionAddress(institution) || null,
			accreditation: branding.accreditation || institution.accredited_by || null,
			subtitle: branding.subtitle || null,
			trust_line: branding.trust_line || null,
			logo_path: branding.logo_path || null,
		},
		examiner: {
			full_name: examiner.full_name || '',
			designation: examiner.designation || null,
			department: examiner.department || null,
			institution_name: examiner.institution_name || null,
			address: examiner.institution_address || examiner.address || null,
			email: examiner.email || '',
			mobile: examiner.mobile || null,
			kind: assignment.examiner_kind === 'internal' ? 'internal' : 'external',
		},
		regulation: course?.regulation_code || null,
		program_name: course?.program_nam || null,
		// The Order document's signatory fields win; the college's letterhead
		// config supplies the Controller's details otherwise.
		coe: {
			name: content.signatory_name || letterhead?.coe?.name || null,
			designation: content.signatory_designation || letterhead?.coe?.designation || 'Controller of Examinations',
			phone: letterhead?.coe?.phone || institution.phone || null,
			email: content.contact_email || letterhead?.coe?.email || institution.email || null,
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
			assignment_type: assignment.assignment_type || 'question_paper',
			qp_fee: assignment.qp_fee ?? null,
			ak_fee: assignment.ak_fee ?? null,
			portal_url: portalUrl(),
		},
		content: content as QpPortalContent,
		pdf_settings: pdfSettings,
	}
}

/**
 * One order for several appointments of the SAME examiner in one session: the
 * first appointment supplies the letterhead, addressee and content; every
 * appointment becomes a row in the course table. The window printed is the
 * earliest opening and the latest deadline; the reference lists every order
 * number covered.
 */
export async function buildCombinedOrderData(bundles: AssignmentBundle[]): Promise<ExaminerOrderData> {
	if (bundles.length === 0) throw new Error('buildCombinedOrderData: no assignments')
	const base = await buildOrderData(bundles[0])
	if (bundles.length === 1) return base

	const courses = bundles.map(b => ({
		semester: b.assignment.semester ?? b.paper?.semester ?? null,
		program_code: b.assignment.program_code || b.paper?.program_code || null,
		program_name: b.course?.program_nam || null,
		regulation: b.course?.regulation_code || null,
		course_code: b.assignment.course_code || b.paper?.course_code || '',
		title: b.assignment.subject_title || b.paper?.subject_title || '',
		set_label: b.assignment.set_label || b.paper?.set_label || null,
		max_marks: b.paper?.max_marks ?? null,
		assignment_type: b.assignment.assignment_type || 'question_paper',
		valid_to: b.assignment.valid_to,
		qp_fee: b.assignment.qp_fee ?? null,
		ak_fee: b.assignment.ak_fee ?? null,
	}))
	// One letter, one reference: the combined reference every covered appointment
	// shares once the letter has been issued. Before that (a preview, or the
	// column not yet migrated) the lowest of the covered numbers stands in.
	const shared = bundles.map(b => b.assignment.combined_order_ref_no).filter(Boolean) as string[]
	const combinedRef =
		shared.length === bundles.length && new Set(shared).size === 1 ? shared[0] : null
	const refs = combinedRef
		? [combinedRef]
		: ([...new Set(bundles.map(b => b.assignment.order_ref_no).filter(Boolean))] as string[]).sort().slice(0, 1)
	const validFrom = bundles.map(b => b.assignment.valid_from).sort()[0]
	const validTo = bundles.map(b => b.assignment.valid_to).sort().slice(-1)[0]
	const types = new Set(bundles.map(b => b.assignment.assignment_type || 'question_paper'))
	const combinedType = types.has('both') || (types.has('question_paper') && types.has('answer_key')) ? 'both' : [...types][0]
	const sum = (k: 'qp_fee' | 'ak_fee') => bundles.reduce((t, b) => t + Number(b.assignment[k] || 0), 0)

	return {
		...base,
		courses,
		assignment: {
			...base.assignment,
			order_ref_no: compactOrderRefs(refs) || base.assignment.order_ref_no,
			valid_from: validFrom,
			valid_to: validTo,
			assignment_type: combinedType,
			// Fees on a combined order: per-paper rates are the same for every
			// paper of one examiner, so the first appointment's rates stand; the
			// total remuneration is the sum across papers.
			remuneration: bundles.reduce((t, b) => t + Number(b.assignment.remuneration || 0), 0),
			qp_fee: base.assignment.qp_fee ?? (sum('qp_fee') / bundles.length || null),
			ak_fee: base.assignment.ak_fee ?? (sum('ak_fee') / bundles.length || null),
		},
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

	// The signature bucket is PRIVATE — download the bytes server-side rather
	// than putting a URL in a document that gets e-mailed around.
	const downloadSignature = async (path: string | null | undefined): Promise<string | null> => {
		if (!path) return null
		try {
			const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET).download(path)
			if (error || !data) return null
			const bytes = Buffer.from(await data.arrayBuffer())
			const ext = path.split('.').pop()?.toLowerCase() || 'png'
			const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
			return `data:${mime};base64,${bytes.toString('base64')}`
		} catch (e) {
			console.warn('[QP portal] signature download failed:', e)
			return null
		}
	}

	// The signature the examiner gave for THIS submission (drawn or attached in
	// the wizard) is what the claim should carry. The profile specimen is only a
	// fallback for claims that predate the wizard.
	const submissionSignature = await downloadSignature(assignment.submission_signature_path)
	const signatureBase64 = submissionSignature ?? (await downloadSignature(examiner.signature_path))

	// A submitted claim prints the account it was submitted with (the snapshot
	// on the assignment), never the profile as it stands today.
	const snap = assignment.claim_account_number ? assignment : null

	// One claim form per examination session: every paper this examiner has
	// CLAIMED in the same session joins this form, the current one included even
	// while it is still pending (that is the form being previewed).
	const { data: siblings } = await supabase
		.from('ia_qp_assignments')
		.select('id, course_code, subject_title, program_code, semester, set_label, remuneration, claim_amount, assignment_type, qp_willing, ak_willing, claim_status, claim_submitted_at')
		.eq('examiner_id', assignment.examiner_id)
		.eq('examination_session_id', assignment.examination_session_id)
		.neq('status', 'cancelled')
		.order('course_code', { ascending: true })
	const claimContentRate = (claimContent as any)?.rate_per_paper ?? null
	const papers = ((siblings || []) as any[])
		.filter(r => r.id === assignment.id || ['submitted', 'approved', 'paid'].includes(r.claim_status))
		.map(r => ({
			course_code: r.course_code || '',
			title: r.subject_title || '',
			program_code: r.program_code || null,
			semester: r.semester ?? null,
			set_label: r.set_label || null,
			// The claim pays what the examiner ACCEPTED (claim_amount); the order's
			// potential figure (remuneration) is only the fallback for rows that
			// predate willingness, and the content rate for rows with neither.
			rate: r.claim_amount ?? r.remuneration ?? claimContentRate ?? null,
			work: describeAcceptedWork(r),
			claim_submitted_at: r.claim_submitted_at || null,
		}))

	return {
		...base,
		content: claimContent as QpPortalContent,
		bank: {
			account_holder: snap?.claim_account_holder || examiner.bank_account_holder || examiner.full_name || null,
			bank_name: snap?.claim_bank_name || examiner.bank_name || null,
			account_number: snap?.claim_account_number || examiner.bank_account_number || null,
			branch: snap?.claim_branch || examiner.bank_branch || null,
			ifsc: snap?.claim_ifsc || examiner.bank_ifsc || null,
		},
		signatureBase64,
		signed_at: submissionSignature ? assignment.signed_at || null : null,
		// The form is dated by the latest claim it covers.
		claim_date:
			papers.map(p => p.claim_submitted_at).filter(Boolean).sort().pop() ||
			assignment.claim_submitted_at ||
			null,
		papers,
	}
}

/**
 * "Question Paper + Answer Key", "Question Paper", "Answer Key" — the work the
 * examiner accepted, for the claim form's particulars. Rows from before
 * willingness existed read as question-paper work.
 */
export function describeAcceptedWork(r: {
	assignment_type?: string | null
	qp_willing?: boolean | null
	ak_willing?: boolean | null
}): string {
	const type = r.assignment_type || 'question_paper'
	const qp = type !== 'answer_key' && r.qp_willing !== false
	const ak = type !== 'question_paper' && r.ak_willing === true
	if (qp && ak) return 'Question Paper + Answer Key'
	if (ak) return 'Answer Key'
	if (qp) return 'Question Paper'
	return 'Declined'
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
/**
 * The reference prefix when the Order document has no letter_ref of its own:
 * the college's short name in front of the office code — JKKNCET/COE/QPS.
 */
export function defaultLetterRef(institutionCode: string | null | undefined): string {
	const short = getInstitutionHeader(institutionCode || undefined).short_name
	return short ? `${short}/COE/QPS` : 'COE/QPS'
}

export async function nextOrderRef(
	supabase: any,
	institutionsId: string,
	letterRef: string | null | undefined,
	institutionCode?: string | null
): Promise<string> {
	const prefix = (letterRef || defaultLetterRef(institutionCode)).replace(/\/+$/, '')
	// Single orders and combined orders draw from ONE running sequence, so no two
	// letters of the institution ever carry the same number. The next number is
	// one past the highest already issued under this prefix (a count would
	// repeat a number after a deletion, or ignore combined letters).
	const seqOf = (ref: unknown) => {
		const r = String(ref || '')
		if (!r.startsWith(`${prefix}/`)) return 0
		const n = Number(r.slice(prefix.length + 1))
		return Number.isFinite(n) ? n : 0
	}
	let max = 0
	const { data: singles } = await supabase
		.from('ia_qp_assignments')
		.select('order_ref_no')
		.eq('institutions_id', institutionsId)
		.not('order_ref_no', 'is', null)
		.range(0, 9999)
	for (const r of singles || []) max = Math.max(max, seqOf(r.order_ref_no))
	// The combined column arrives with 20260911_qp_assignment_combined_ref; before
	// that migration the query errors and is simply skipped.
	const { data: combined, error } = await supabase
		.from('ia_qp_assignments')
		.select('combined_order_ref_no')
		.eq('institutions_id', institutionsId)
		.not('combined_order_ref_no', 'is', null)
		.range(0, 9999)
	if (!error) for (const r of combined || []) max = Math.max(max, seqOf(r.combined_order_ref_no))
	// Numbers issued under an older prefix (before the short name was added)
	// still count, so the sequence continues rather than restarting at 001.
	if (max === 0) {
		const { count } = await supabase
			.from('ia_qp_assignments')
			.select('id', { count: 'exact', head: true })
			.eq('institutions_id', institutionsId)
			.not('order_ref_no', 'is', null)
		max = count || 0
	}
	return buildOrderRef(prefix, max + 1)
}

/**
 * Several order numbers on one combined order, written once:
 * "JKKNCET/COE/QPS/001, 004 & 006". Numbers under a different prefix are
 * listed in full after it.
 */
export function compactOrderRefs(refs: string[]): string {
	const clean = [...new Set(refs.filter(Boolean))]
	if (clean.length <= 1) return clean[0] || ''
	const groups = new Map<string, string[]>()
	for (const r of clean) {
		const i = r.lastIndexOf('/')
		const prefix = i > 0 ? r.slice(0, i) : ''
		const num = i > 0 ? r.slice(i + 1) : r
		if (!groups.has(prefix)) groups.set(prefix, [])
		groups.get(prefix)!.push(num)
	}
	return [...groups.entries()]
		.map(([prefix, nums]) => {
			const sorted = nums.sort()
			const list = sorted.length > 1 ? `${sorted.slice(0, -1).join(', ')} & ${sorted.slice(-1)[0]}` : sorted[0]
			return prefix ? `${prefix}/${list}` : list
		})
		.join('; ')
}
