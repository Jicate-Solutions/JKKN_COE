// One-off: move question-paper figures — CIA papers (ia_question_papers) AND
// End-Semester papers (ese_question_papers, the examiner portal's) — from the
// public Supabase `question-images` bucket to Google Drive (private), and point
// the question JSON at the authenticated proxy.
//
//   npx tsx scripts/migrate-question-images-to-drive.ts --dry-run
//   npx tsx scripts/migrate-question-images-to-drive.ts
//   npx tsx scripts/migrate-question-images-to-drive.ts --paper=<uuid>
//   npx tsx scripts/migrate-question-images-to-drive.ts --remove-supabase
//
// Run from the project root (reads .env). Requires the
// 20260912_ia_question_paper_files.sql and 20260912_ia_question_paper_files_ese.sql
// migrations to have been applied.
//
// Per figure: download the Supabase object → upload to Drive
// (Examiner / Question Papers / <inst> / <course>) → verify the Drive file's
// size matches → register in ia_question_paper_files (supabase_path kept) →
// rewrite the figure as { url: proxy, drive_file_id, drive_url, path: <old> }.
// One UPDATE per paper, only of the `questions` column.
//
// The Supabase copy is NEVER removed by the default run. `--remove-supabase`
// is a separate pass that deletes only objects whose registry row is verified
// (migrated_at set) and stamps supabase_removed_at. Frozen version snapshots
// (ia_qp_paper_versions.questions) still carry the old public URLs — they are
// immutable by trigger and are left alone.

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { isDriveConfigured } from '../lib/google/drive-client'
import { uploadQuestionPaperToFolder, getDriveFileMeta } from '../lib/google/drive-upload'

loadEnv({ path: '.env' })

const BUCKET = 'question-images'
const PROXY = '/api/examiner/question-paper/file'
const FILES_TABLE = 'ia_question_paper_files'
/** paper_kind → table. Both are migrated; the registry row records which. */
const PAPER_TABLES = { ia: 'ia_question_papers', ese: 'ese_question_papers' } as const
type PaperKind = keyof typeof PAPER_TABLES

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const removeSupabase = args.has('--remove-supabase')
const onlyPaper = [...args].find(a => a.startsWith('--paper='))?.slice('--paper='.length) || null

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
	auth: { persistSession: false },
})

type Img = Record<string, any>

/** Every figure slot on a question list, with a setter so the rewrite lands in place. */
function* figures(questions: any[]): Generator<{ where: string; img: Img; set: (v: Img) => void }> {
	for (const q of questions) {
		for (const key of ['image', 'answer_key_image']) {
			if (q?.[key]?.url) yield { where: `Q${q.question_number ?? '?'}.${key}`, img: q[key], set: v => (q[key] = v) }
		}
		for (const s of Array.isArray(q?.sub_questions) ? q.sub_questions : []) {
			for (const key of ['image', 'answer_key_image']) {
				if (s?.[key]?.url) {
					yield { where: `Q${q.question_number ?? '?'}(${s.label}).${key}`, img: s[key], set: v => (s[key] = v) }
				}
			}
		}
	}
}

function isSupabaseFigure(img: Img): boolean {
	return !img.drive_file_id && /\/storage\/v1\/object\/(public\/)?question-images\//.test(String(img.url || ''))
}

/** `<paperId>/<uuid>.<ext>` — from the stored path, else parsed off the public URL. */
function objectPath(img: Img): string | null {
	if (img.path) return String(img.path)
	const m = /question-images\/(.+?)(\?|$)/.exec(String(img.url || ''))
	return m ? decodeURIComponent(m[1]) : null
}

async function loadPapers(kind: PaperKind) {
	const out: any[] = []
	let from = 0
	while (true) {
		let q = supabase
			.from(PAPER_TABLES[kind])
			.select('id, status, institutions_id, course_code, questions')
			.order('id')
			.range(from, from + 499)
		if (onlyPaper) q = q.eq('id', onlyPaper)
		const { data, error } = await q
		if (error) throw error
		out.push(...(data || []).map((p: any) => ({ ...p, kind })))
		if (!data || data.length < 500) break
		from += 500
	}
	return out
}

async function institutionCodes(): Promise<Map<string, string>> {
	const { data } = await supabase.from('institutions').select('id, institution_code')
	return new Map((data || []).map((r: any) => [r.id, r.institution_code]))
}

async function migrate() {
	if (!isDriveConfigured()) throw new Error('Google Drive env is not configured (.env GOOGLE_DRIVE_* / GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID).')
	const codes = await institutionCodes()
	const papers = [...(await loadPapers('ia')), ...(await loadPapers('ese'))]

	// Idempotency: a supabase_path already registered is never uploaded twice.
	const { data: existing, error: exErr } = await supabase
		.from(FILES_TABLE)
		.select('drive_file_id, drive_url, supabase_path, filename, size_bytes')
		.not('supabase_path', 'is', null)
		.is('deleted_at', null)
	if (exErr) throw new Error(`Cannot read ${FILES_TABLE} — has 20260912_ia_question_paper_files.sql been applied? ${exErr.message}`)
	const registered = new Map((existing || []).map((r: any) => [r.supabase_path, r]))

	const totals = { papers: 0, figures: 0, migrated: 0, reused: 0, skipped: 0, failed: 0 }

	for (const paper of papers) {
		const questions: any[] = Array.isArray(paper.questions) ? paper.questions : []
		const todo = [...figures(questions)].filter(f => isSupabaseFigure(f.img))
		if (todo.length === 0) continue
		totals.papers++
		console.log(`\n▶ [${paper.kind}] ${paper.course_code || paper.id} (${paper.status}) — ${todo.length} figure(s)`)

		let changed = false
		for (const { where, img, set } of todo) {
			totals.figures++
			const path = objectPath(img)
			if (!path) {
				console.log(`  ✗ ${where}: cannot derive object path from ${img.url}`)
				totals.skipped++
				continue
			}

			try {
				let driveFileId: string
				let driveUrl: string
				const prior = registered.get(path)
				if (prior) {
					// Uploaded on an earlier run whose JSON write did not land — reuse it.
					driveFileId = prior.drive_file_id
					driveUrl = prior.drive_url
					totals.reused++
					console.log(`  ↻ ${where}: reusing Drive file ${driveFileId}`)
				} else {
					const { data: blob, error } = await supabase.storage.from(BUCKET).download(path)
					if (error || !blob) throw new Error(`Supabase download failed: ${error?.message || 'no data'}`)
					const buffer = Buffer.from(await blob.arrayBuffer())
					const mimeType = blob.type || 'application/octet-stream'
					const filename = path.split('/').pop() || 'figure'

					if (dryRun) {
						console.log(`  · ${where}: would upload ${filename} (${buffer.byteLength} B, ${mimeType})`)
						continue
					}

					const uploaded = await uploadQuestionPaperToFolder({
						file: new Blob([buffer], { type: mimeType }),
						filename,
						mimeType,
						paperId: paper.id,
						institutionCode: codes.get(paper.institutions_id) || null,
						courseCode: paper.course_code,
					})

					// Verify before anything is written: the Drive copy must be whole.
					const meta = await getDriveFileMeta(uploaded.driveFileId)
					if (!meta || meta.sizeBytes !== buffer.byteLength) {
						throw new Error(`Drive verification failed (expected ${buffer.byteLength} B, got ${meta?.sizeBytes ?? 'missing'})`)
					}

					const { error: regErr } = await supabase.from(FILES_TABLE).insert({
						paper_id: paper.id,
						paper_kind: paper.kind,
						institutions_id: paper.institutions_id,
						drive_file_id: uploaded.driveFileId,
						drive_url: uploaded.url,
						filename: uploaded.filename,
						mime_type: mimeType,
						size_bytes: buffer.byteLength,
						uploaded_by_kind: 'migration',
						uploaded_by: 'scripts/migrate-question-images-to-drive.ts',
						supabase_path: path,
						migrated_at: new Date().toISOString(),
					})
					if (regErr) throw new Error(`registry insert failed: ${regErr.message}`)
					registered.set(path, { drive_file_id: uploaded.driveFileId, drive_url: uploaded.url, supabase_path: path })
					driveFileId = uploaded.driveFileId
					driveUrl = uploaded.url
					totals.migrated++
					console.log(`  ✓ ${where}: ${filename} → Drive ${driveFileId} (${buffer.byteLength} B verified)`)
				}

				set({
					...img,
					url: `${PROXY}/${encodeURIComponent(driveFileId)}`,
					drive_file_id: driveFileId,
					drive_url: driveUrl,
					path, // legacy object path retained until --remove-supabase
				})
				changed = true
			} catch (e: any) {
				totals.failed++
				console.log(`  ✗ ${where}: ${e?.message || e}`)
			}
		}

		if (changed && !dryRun) {
			const { error } = await supabase.from(PAPER_TABLES[paper.kind as PaperKind]).update({ questions }).eq('id', paper.id)
			if (error) {
				totals.failed++
				console.log(`  ✗ questions UPDATE failed for ${paper.id}: ${error.message} (Drive files are registered — rerun reuses them)`)
			} else {
				console.log(`  ✓ questions JSON updated`)
			}
		}
	}

	console.log(`\n${dryRun ? '[dry run] ' : ''}papers: ${totals.papers}, figures: ${totals.figures}, migrated: ${totals.migrated}, reused: ${totals.reused}, skipped: ${totals.skipped}, failed: ${totals.failed}`)
	if (totals.failed) process.exitCode = 1
}

/** Separate pass: delete Supabase objects only for verified, migrated rows. */
async function removeSupabaseCopies() {
	const { data, error } = await supabase
		.from(FILES_TABLE)
		.select('id, paper_id, drive_file_id, supabase_path, size_bytes')
		.not('supabase_path', 'is', null)
		.not('migrated_at', 'is', null)
		.is('supabase_removed_at', null)
		.is('deleted_at', null)
	if (error) throw error
	const rows = (data || []).filter((r: any) => !onlyPaper || r.paper_id === onlyPaper)
	console.log(`${rows.length} migrated figure(s) still have a Supabase copy`)

	let removed = 0
	let failed = 0
	for (const r of rows as any[]) {
		// Re-verify the Drive copy right before the bucket object is dropped.
		const meta = await getDriveFileMeta(r.drive_file_id)
		if (!meta || meta.sizeBytes !== r.size_bytes) {
			failed++
			console.log(`  ✗ ${r.supabase_path}: Drive file ${r.drive_file_id} missing or size mismatch — kept`)
			continue
		}
		if (dryRun) {
			console.log(`  · would remove ${r.supabase_path}`)
			continue
		}
		const { error: rmErr } = await supabase.storage.from(BUCKET).remove([r.supabase_path])
		if (rmErr) {
			failed++
			console.log(`  ✗ ${r.supabase_path}: ${rmErr.message}`)
			continue
		}
		await supabase.from(FILES_TABLE).update({ supabase_removed_at: new Date().toISOString() }).eq('id', r.id)
		removed++
		console.log(`  ✓ removed ${r.supabase_path}`)
	}
	console.log(`\n${dryRun ? '[dry run] ' : ''}removed: ${removed}, failed: ${failed}`)
	if (failed) process.exitCode = 1
}

;(removeSupabase ? removeSupabaseCopies() : migrate()).catch(e => {
	console.error(e)
	process.exit(1)
})
