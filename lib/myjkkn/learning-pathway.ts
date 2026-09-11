// Learning pathway (BoS course syllabus) PDF — one resolver for every COE
// screen that offers it: the examiner portal, the CoE course master and the
// question paper screens.
//
// Sources, in order:
//   1. MyJKKN `api-management/academic/syllabus` (spec 2026-09-10, Phase 1):
//      by the COE course id first; on 409 AMBIGUOUS the newest candidate is
//      fetched by id; then by course code + each MyJKKN institution mapped to
//      the COE institution.
//   2. courses.syllabus_pdf_url on the COE course master, when one is filed.
//
// The MyJKKN key never leaves the server: callers stream the bytes on.

import { getSupabaseServer } from '@/lib/supabase-server'
import {
	fetchMyJKKNSyllabusPdf,
	fetchMyJKKNSyllabusPdfById,
	MyJKKNApiError,
	type SyllabusPdfFormat,
	type SyllabusPdfResult,
} from '@/services/myjkkn-service'

export const LEARNING_PATHWAY_FORMATS: SyllabusPdfFormat[] = ['official', 'v35', 'obe', 'meeting_summary']

export function parseLearningPathwayFormat(raw: string | null | undefined): SyllabusPdfFormat {
	return raw && (LEARNING_PATHWAY_FORMATS as string[]).includes(raw) ? (raw as SyllabusPdfFormat) : 'official'
}

export interface LearningPathwayQuery {
	/** COE courses.id — the preferred, stable key. */
	courseId?: string | null
	courseCode?: string | null
	/** COE institutions.id; expanded to its MyJKKN institution ids for the code lookup. */
	institutionsId?: string | null
	/** Fallbacks for the file name when the course master has no row. */
	courseTitle?: string | null
	regulation?: string | null
	format?: SyllabusPdfFormat
	ifNoneMatch?: string | null
}

export type LearningPathwayResult =
	| {
			kind: 'pdf'
			source: 'myjkkn' | 'coe_course_master'
			bytes: ArrayBuffer
			contentType: string
			etag: string | null
			syllabusId: string | null
			version: string | null
			academicModel: string | null
			/** "<code>_<title>_<regulation>.pdf" — the download name. */
			filename: string
			detail: Record<string, unknown>
	  }
	| { kind: 'not_modified'; source: 'myjkkn' }
	| { kind: 'miss'; rendererDown: boolean; attempts: number; detail: Record<string, unknown> }

/** Candidate ids from a 409 AMBIGUOUS body, newest first (the API already sorts them). */
function ambiguousCandidates(details: unknown): string[] {
	const body = details as any
	const list = body?.error?.candidates ?? body?.candidates
	return Array.isArray(list) ? list.map((c: any) => String(c?.id || '')).filter(Boolean) : []
}

export async function resolveLearningPathwayPdf(q: LearningPathwayQuery): Promise<LearningPathwayResult> {
	const supabase = getSupabaseServer()
	const format = q.format || 'official'

	const [{ data: course }, { data: institution }] = await Promise.all([
		q.courseId
			? supabase
					.from('courses')
					.select('id, course_code, course_name, regulation_code, syllabus_pdf_url')
					.eq('id', q.courseId)
					.maybeSingle()
			: Promise.resolve({ data: null as any }),
		q.institutionsId
			? supabase.from('institutions').select('id, myjkkn_institution_ids').eq('id', q.institutionsId).maybeSingle()
			: Promise.resolve({ data: null as any }),
	])

	const courseCode = course?.course_code || q.courseCode || null
	const filename = syllabusFilename(courseCode, course?.course_name || q.courseTitle, course?.regulation_code || q.regulation, format)
	const myjkknInstitutionIds: string[] = Array.isArray(institution?.myjkkn_institution_ids)
		? institution.myjkkn_institution_ids
		: []

	const attempts: Array<{ courseId?: string; courseCode?: string; institutionId?: string }> = []
	if (q.courseId) attempts.push({ courseId: q.courseId })
	if (courseCode) for (const inst of myjkknInstitutionIds) attempts.push({ courseCode, institutionId: inst })

	let rendererDown = false
	let lastStatus: number | null = null

	const ok = (pdf: SyllabusPdfResult, attempt: Record<string, unknown>): LearningPathwayResult => ({
		kind: 'pdf',
		source: 'myjkkn',
		bytes: pdf.bytes,
		contentType: pdf.contentType,
		etag: pdf.etag,
		syllabusId: pdf.syllabusId,
		version: pdf.version,
		academicModel: pdf.academicModel,
		filename,
		detail: { ...attempt, syllabus_id: pdf.syllabusId, version: pdf.version, bytes: pdf.bytes.byteLength },
	})

	for (const attempt of attempts) {
		try {
			return ok(await fetchMyJKKNSyllabusPdf({ ...attempt, format, ifNoneMatch: q.ifNoneMatch }), attempt)
		} catch (e) {
			const status = e instanceof MyJKKNApiError ? e.status : 0
			lastStatus = status
			if (status === 304) return { kind: 'not_modified', source: 'myjkkn' }
			if (status === 409) {
				// Several regulations carry this code: take the newest, as the API
				// orders candidates is_latest desc, last_modified_at desc.
				const [first] = ambiguousCandidates((e as MyJKKNApiError).details)
				if (first) {
					try {
						return ok(await fetchMyJKKNSyllabusPdfById(first, { format, ifNoneMatch: q.ifNoneMatch }), {
							...attempt,
							picked_candidate: first,
						})
					} catch (inner) {
						const s = inner instanceof MyJKKNApiError ? inner.status : 0
						if (s === 304) return { kind: 'not_modified', source: 'myjkkn' }
						if (s === 503 || s === 504) rendererDown = true
					}
				}
				continue
			}
			if (status === 404 || status === 422) continue
			if (status === 503 || status === 504) {
				rendererDown = true
				continue
			}
			// 502 = the endpoint answered with HTML, i.e. the MyJKKN routes are not
			// deployed on that host yet; 401/403 = key lacks the academic module.
			console.warn(
				`[Syllabus] MyJKKN answered ${status || 'error'} for ${JSON.stringify(attempt)}: ${(e as Error)?.message}`
			)
		}
	}

	const local = String(course?.syllabus_pdf_url || '').trim()
	if (/^https?:\/\//i.test(local)) {
		try {
			const res = await fetch(local, { cache: 'no-store' })
			if (res.ok) {
				const bytes = await res.arrayBuffer()
				return {
					kind: 'pdf',
					source: 'coe_course_master',
					bytes,
					contentType: res.headers.get('content-type') || 'application/pdf',
					etag: null,
					syllabusId: null,
					version: null,
					academicModel: null,
					filename,
					detail: { url: local, bytes: bytes.byteLength },
				}
			}
			console.warn('[Syllabus] course syllabus_pdf_url returned', res.status, 'for', local)
		} catch (e) {
			console.warn('[Syllabus] course syllabus_pdf_url fetch failed:', (e as Error)?.message)
		}
	}

	return {
		kind: 'miss',
		rendererDown,
		attempts: attempts.length,
		detail: { course_code: courseCode, last_status: lastStatus, local_url: !!local, myjkkn_institutions: myjkknInstitutionIds.length },
	}
}

/** A short readable page for a new tab — never raw JSON in front of a person. */
export function learningPathwayMessagePage(status: number, title: string, body: string): Response {
	const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
	const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px 32px;max-width:540px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h1{font-size:17px;margin:0 0 8px}p{font-size:14px;color:#475569;margin:0;line-height:1.5}</style></head>
<body><div class="card"><h1>${esc(title)}</h1><p>${esc(body)}</p></div></body></html>`
	return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export function learningPathwayMissPage(result: Extract<LearningPathwayResult, { kind: 'miss' }>, courseCode: string | null): Response {
	if (result.rendererDown) {
		return learningPathwayMessagePage(
			503,
			'The syllabus service is busy',
			'The PDF could not be produced right now. Close this tab and try again in a minute.'
		)
	}
	return learningPathwayMessagePage(
		404,
		'Syllabus not available yet',
		`The syllabus for ${courseCode || 'this course'} has not been published in MyJKKN, and no syllabus PDF is filed on the course master. Contact the Office of the Controller of Examinations if you need it.`
	)
}

/** Response headers for a resolved PDF. */
export function learningPathwayHeaders(result: Extract<LearningPathwayResult, { kind: 'pdf' }>, filename: string, disposition: 'inline' | 'attachment' = 'inline'): Record<string, string> {
	return {
		'Content-Type': result.contentType || 'application/pdf',
		'Content-Disposition': `${disposition}; filename="${filename}"`,
		'Cache-Control': 'private, no-store',
		'X-Frame-Options': 'SAMEORIGIN',
		'X-Learning-Pathway-Source': result.source,
		...(result.etag ? { ETag: result.etag } : {}),
		...(result.syllabusId ? { 'X-Syllabus-Id': result.syllabusId } : {}),
		...(result.version ? { 'X-Syllabus-Version': result.version } : {}),
		...(result.academicModel ? { 'X-Academic-Model': result.academicModel } : {}),
	}
}

/** "CS25C08_DATA_STRUCTURES_R-2025.pdf": subject code, subject name, regulation. */
export function syllabusFilename(
	courseCode: string | null | undefined,
	courseTitle: string | null | undefined,
	regulation: string | null | undefined,
	format: SyllabusPdfFormat = 'official'
): string {
	const part = (v: unknown) =>
		String(v ?? '')
			.trim()
			.replace(/[^A-Za-z0-9-]+/g, '_')
			.replace(/^_+|_+$/g, '')
	const parts = [part(courseCode) || 'course', part(courseTitle).toUpperCase(), part(regulation)].filter(Boolean)
	if (format !== 'official') parts.push(format)
	return `${parts.join('_')}.pdf`
}

/** @deprecated use syllabusFilename — kept so older imports still compile. */
export const learningPathwayFilename = (courseCode: string | null | undefined, format: SyllabusPdfFormat) =>
	syllabusFilename(courseCode, null, null, format)
