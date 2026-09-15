// Registry of question-paper figures stored in Google Drive.
//
// A figure's bytes live in Drive (private — no link sharing); the question JSON
// carries `{ url, drive_file_id, drive_url, … }` and the row in
// ia_question_paper_files maps that drive_file_id back to its paper. The proxy
// route authorises a viewer against the PAPER (COE session, or an examiner
// whose assignment is for that paper) before streaming the bytes, and the
// paper-delete routes sweep Drive through the same rows.
//
// Node runtime only — imports googleapis via lib/google.

import { getSupabaseServer } from '@/lib/supabase-server'
import { deleteDriveFile, downloadDriveFile } from '@/lib/google/drive-upload'

export const QUESTION_PAPER_FILES_TABLE = 'ia_question_paper_files'

/**
 * Which table a paper lives in. CIA papers are ia_question_papers rows; the
 * End-Semester papers the examiner portal works on are ese_question_papers
 * rows. A registry row records the kind (paper_kind) because one paper_id
 * column cannot carry a foreign key to two tables.
 */
export type QuestionPaperKind = 'ia' | 'ese'
export const QUESTION_PAPER_TABLES: Record<QuestionPaperKind, string> = {
	ia: 'ia_question_papers',
	ese: 'ese_question_papers',
}

/** The little a figure route needs to know about the paper it is attached to. */
export interface QuestionPaperRef {
	kind: QuestionPaperKind
	id: string
	status: string
	institutions_id: string | null
	course_code: string | null
}

/**
 * Find a paper by id. With `kind` only that table is read; without it both are
 * tried (CIA first), since a CoE caller names a paper without saying which.
 */
export async function loadQuestionPaper(id: string, kind?: QuestionPaperKind): Promise<QuestionPaperRef | null> {
	const supabase = getSupabaseServer()
	const kinds: QuestionPaperKind[] = kind ? [kind] : ['ia', 'ese']
	for (const k of kinds) {
		const { data } = await supabase
			.from(QUESTION_PAPER_TABLES[k])
			.select('id, status, institutions_id, course_code')
			.eq('id', id)
			.maybeSingle()
		if (data) return { kind: k, ...(data as Omit<QuestionPaperRef, 'kind'>) }
	}
	return null
}

/** Same-origin path the <img> tags and the PDF renderer load a figure from. */
export const QUESTION_PAPER_FILE_ROUTE = '/api/examiner/question-paper/file'

export function questionPaperFileUrl(driveFileId: string): string {
	return `${QUESTION_PAPER_FILE_ROUTE}/${encodeURIComponent(driveFileId)}`
}

export type QuestionPaperFileUploader = 'coe' | 'examiner' | 'migration'

export interface QuestionPaperFileRow {
	id: string
	paper_id: string
	/** Table the paper lives in; absent on rows written before the column existed (= 'ia'). */
	paper_kind?: QuestionPaperKind | null
	institutions_id: string | null
	drive_file_id: string
	drive_url: string
	filename: string
	mime_type: string
	size_bytes: number
	kind: string
	uploaded_by_kind: QuestionPaperFileUploader
	uploaded_by: string | null
	supabase_path: string | null
	migrated_at: string | null
	supabase_removed_at: string | null
	deleted_at: string | null
	created_at: string
}

export interface RegisterQuestionPaperFileInput {
	paperId: string
	/** Table the paper lives in. Defaults to 'ia' (the column's own default). */
	paperKind?: QuestionPaperKind
	institutionsId?: string | null
	driveFileId: string
	driveUrl: string
	filename: string
	mimeType: string
	sizeBytes: number
	uploadedByKind: QuestionPaperFileUploader
	uploadedBy?: string | null
	/** Legacy Supabase object path when the row records a migrated figure. */
	supabasePath?: string | null
}

/** Insert the registry row for a freshly uploaded Drive file. */
export async function registerQuestionPaperFile(input: RegisterQuestionPaperFileInput): Promise<QuestionPaperFileRow> {
	const supabase = getSupabaseServer()
	const { data, error } = await supabase
		.from(QUESTION_PAPER_FILES_TABLE)
		.insert({
			paper_id: input.paperId,
			// The column's default is 'ia', so a CIA figure is registered the same
			// way whether or not 20260912_ia_question_paper_files_ese.sql has run.
			...(input.paperKind && input.paperKind !== 'ia' ? { paper_kind: input.paperKind } : {}),
			institutions_id: input.institutionsId ?? null,
			drive_file_id: input.driveFileId,
			drive_url: input.driveUrl,
			filename: input.filename,
			mime_type: input.mimeType,
			size_bytes: input.sizeBytes,
			uploaded_by_kind: input.uploadedByKind,
			uploaded_by: input.uploadedBy ?? null,
			supabase_path: input.supabasePath ?? null,
			migrated_at: input.supabasePath ? new Date().toISOString() : null,
		})
		.select('*')
		.single()
	if (error) throw new Error(`Could not register the Drive file: ${error.message}`)
	return data as QuestionPaperFileRow
}

/** The live (not deleted) registry row for a Drive file id, or null. */
export async function getQuestionPaperFile(driveFileId: string): Promise<QuestionPaperFileRow | null> {
	const supabase = getSupabaseServer()
	const { data } = await supabase
		.from(QUESTION_PAPER_FILES_TABLE)
		.select('*')
		.eq('drive_file_id', driveFileId)
		.is('deleted_at', null)
		.maybeSingle()
	return (data as QuestionPaperFileRow | null) ?? null
}

/** Delete the Drive object and mark its row deleted (row kept for the audit trail). */
export async function removeQuestionPaperFile(row: QuestionPaperFileRow): Promise<boolean> {
	const gone = await deleteDriveFile(row.drive_file_id)
	if (!gone) return false
	await getSupabaseServer()
		.from(QUESTION_PAPER_FILES_TABLE)
		.update({ deleted_at: new Date().toISOString() })
		.eq('id', row.id)
	return true
}

/**
 * Sweep every Drive figure of a paper — called before the paper row is deleted
 * (the registry rows cascade with it). Best effort: a Drive hiccup must not turn
 * a completed delete into an error; whatever is left is logged.
 */
export async function deletePaperDriveFiles(paperId: string): Promise<{ removed: number; failed: number }> {
	const out = { removed: 0, failed: 0 }
	try {
		const { data } = await getSupabaseServer()
			.from(QUESTION_PAPER_FILES_TABLE)
			.select('*')
			.eq('paper_id', paperId)
			.is('deleted_at', null)
		for (const row of (data || []) as QuestionPaperFileRow[]) {
			if (await removeQuestionPaperFile(row)) out.removed++
			else out.failed++
		}
		if (out.failed) console.error('[QP files] Drive cleanup left', out.failed, 'file(s) for paper', paperId)
	} catch (e) {
		console.error('[QP files] Drive cleanup failed for paper', paperId, e)
	}
	return out
}

/**
 * Inline every Drive-backed figure of a question list as a data: URI on
 * `inline_src`, for the headless-Chromium PDF renderer. Chromium runs inside
 * the server with no session cookie, so it cannot load the proxy route; the
 * bytes are fetched here with the service credentials instead. Legacy public
 * Supabase URLs are left alone — Chromium loads those as before. Mutates in
 * place; a figure that cannot be fetched is logged and skipped.
 */
export async function inlineDriveImages(questions: any[]): Promise<void> {
	// One registry read for every figure on the paper spares a metadata round
	// trip per figure: the row carries the mime type the data: URI needs.
	const ids = new Set<string>()
	const collect = (holder: any) => {
		for (const key of ['image', 'answer_key_image']) {
			const fileId = holder?.[key]?.drive_file_id
			if (typeof fileId === 'string' && fileId) ids.add(fileId)
		}
	}
	for (const q of Array.isArray(questions) ? questions : []) {
		collect(q)
		for (const s of Array.isArray(q?.sub_questions) ? q.sub_questions : []) collect(s)
	}
	if (ids.size === 0) return
	const known = new Map<string, { mimeType: string; name: string }>()
	try {
		const { data } = await getSupabaseServer()
			.from(QUESTION_PAPER_FILES_TABLE)
			.select('drive_file_id, mime_type, filename')
			.in('drive_file_id', [...ids])
		for (const r of data || []) known.set(r.drive_file_id, { mimeType: r.mime_type, name: r.filename })
	} catch {
		/* fall back to a metadata call per figure */
	}

	const cache = new Map<string, Promise<string | null>>()
	const toDataUri = (fileId: string) => {
		let p = cache.get(fileId)
		if (!p) {
			p = downloadDriveFile(fileId, known.get(fileId))
				.then(f => (f ? `data:${f.mimeType};base64,${f.buffer.toString('base64')}` : null))
				.catch(e => {
					console.error('[QP PDF] figure download failed for Drive file', fileId, e?.message || e)
					return null
				})
			cache.set(fileId, p)
		}
		return p
	}

	const jobs: Promise<void>[] = []
	const visit = (holder: any) => {
		for (const key of ['image', 'answer_key_image']) {
			const img = holder?.[key]
			const fileId = typeof img?.drive_file_id === 'string' ? img.drive_file_id : ''
			if (!fileId) continue
			jobs.push(
				toDataUri(fileId).then(uri => {
					if (uri) img.inline_src = uri
				})
			)
		}
	}
	for (const q of Array.isArray(questions) ? questions : []) {
		visit(q)
		for (const s of Array.isArray(q?.sub_questions) ? q.sub_questions : []) visit(s)
	}
	await Promise.all(jobs)
}
