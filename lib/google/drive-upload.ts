/**
 * Google Drive uploads for COE modules (replaces Supabase Storage).
 *
 * Folder tree, auto-created under GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID:
 *   <ROOT> / Examiner / Question Papers / <Institution code> / <Course code> / file
 *
 * Resolved folder ids are cached for the server process so repeat uploads skip
 * the lookup. Node runtime only (node:stream + googleapis).
 *
 * Question-paper figures are CONFIDENTIAL examination content, so NO file
 * uploaded here is ever given an `anyone:reader` permission. The bytes reach a
 * browser only through the authenticated proxy at
 * /api/examiner/question-paper/file/[fileId], which authorises the viewer
 * against the paper first. The `url` returned is the Drive web-view link for
 * someone who already has Drive access — it is not a shareable link.
 */
import { Readable } from 'node:stream'
import { createDriveClient, isDriveConfigured, type DriveClient } from './drive-client'
import { getSupabaseServer } from '@/lib/supabase-server'

// Cache: `${parentId}/${name}` → folderId. Lives for the server process.
const folderCache = new Map<string, string>()

// ── Resolved leaf folders, remembered across processes ──────────────────────
// Walking the chain costs one Drive list call per level (~1 s each), which a
// fresh server process paid on its first upload. The leaf id of a full path is
// kept in google_drive_folders (20260912_google_drive_folder_cache.sql); a
// missing table is simply a cache miss.
const FOLDER_TABLE = 'google_drive_folders'
const pathCache = new Map<string, string>()
let folderTableMissing = false

async function readCachedFolder(pathKey: string): Promise<string | null> {
	const hit = pathCache.get(pathKey)
	if (hit) return hit
	if (folderTableMissing) return null
	try {
		const { data, error } = await getSupabaseServer()
			.from(FOLDER_TABLE)
			.select('folder_id')
			.eq('path', pathKey)
			.maybeSingle()
		if (error) {
			if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) folderTableMissing = true
			return null
		}
		if (data?.folder_id) pathCache.set(pathKey, data.folder_id)
		return data?.folder_id || null
	} catch {
		return null
	}
}

async function writeCachedFolder(pathKey: string, folderId: string): Promise<void> {
	pathCache.set(pathKey, folderId)
	if (folderTableMissing) return
	try {
		await getSupabaseServer()
			.from(FOLDER_TABLE)
			.upsert({ path: pathKey, folder_id: folderId, updated_at: new Date().toISOString() }, { onConflict: 'path' })
	} catch {
		/* the in-process cache still holds it */
	}
}

/** Drop a remembered leaf so the next call walks Drive again (folder moved or deleted). */
export async function forgetCachedFolder(segments: Array<string | null | undefined>): Promise<void> {
	const root = process.env.GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID || ''
	const pathKey = folderPathKey(root, segments)
	pathCache.delete(pathKey)
	for (const k of [...folderCache.keys()]) folderCache.delete(k)
	if (folderTableMissing) return
	try {
		await getSupabaseServer().from(FOLDER_TABLE).delete().eq('path', pathKey)
	} catch {
		/* best effort */
	}
}

function folderPathKey(root: string, segments: Array<string | null | undefined>): string {
	return [root, ...segments.filter(s => s && s.trim()).map(s => (s as string).trim().slice(0, 120))].join('/')
}

/** Drive query strings can't contain an unescaped single quote. */
function escapeQ(name: string): string {
	return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Find-or-create one folder named `name` under `parentId`. */
export async function ensureFolder(drive: DriveClient, parentId: string, name: string): Promise<string> {
	const clean = (name || 'Unknown').trim().slice(0, 120) || 'Unknown'
	const cacheKey = `${parentId}/${clean}`
	const cached = folderCache.get(cacheKey)
	if (cached) return cached

	const { data } = await drive.files.list({
		q: `name = '${escapeQ(clean)}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
		fields: 'files(id, name)',
		pageSize: 1,
		supportsAllDrives: true,
		includeItemsFromAllDrives: true,
	})

	let id = data.files?.[0]?.id ?? undefined
	if (!id) {
		const created = await drive.files.create({
			requestBody: {
				name: clean,
				mimeType: 'application/vnd.google-apps.folder',
				parents: [parentId],
			},
			fields: 'id',
			supportsAllDrives: true,
		})
		id = created.data.id ?? undefined
	}
	if (!id) throw new Error(`Could not resolve Drive folder "${clean}"`)
	folderCache.set(cacheKey, id)
	return id
}

/** Ensure the full chain from the root and return the leaf folder id. Empty segments are skipped. */
export async function ensureFolderPath(
	drive: DriveClient,
	segments: Array<string | null | undefined>
): Promise<string> {
	const root = process.env.GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID
	if (!root) throw new Error('GOOGLE_SHARED_DRIVE_ROOT_FOLDER_ID is not set.')
	const pathKey = folderPathKey(root, segments)
	const remembered = await readCachedFolder(pathKey)
	if (remembered) return remembered

	let parent = root
	for (const seg of segments) {
		if (!seg || !seg.trim()) continue
		parent = await ensureFolder(drive, parent, seg)
	}
	await writeCachedFolder(pathKey, parent)
	return parent
}

/** Top-level folders for the examiner module — one place to rename them. */
export const QUESTION_PAPER_FOLDER = ['Examiner', 'Question Papers'] as const

export interface QuestionPaperUploadOptions {
	/** The bytes. A `Blob` is accepted so migrations can pass a buffer wrapped in one. */
	file: File | Blob
	/** Original filename (a Blob has none). */
	filename?: string | null
	/** Overrides file.type when the caller knows better. */
	mimeType?: string | null
	/** Paper the figure belongs to — goes in the stored filename so a folder listing stays readable. */
	paperId: string
	/** Folder grouping: institution code ("CAS") then course code ("24UCSC01"). */
	institutionCode?: string | null
	courseCode?: string | null
}

export interface QuestionPaperUploadResult {
	/** Drive web-view link. NOT public — see the file header. */
	url: string
	driveFileId: string
	/** Name the object was stored under in Drive. */
	filename: string
	sizeBytes: number
	mimeType: string
}

/**
 * Upload one question-paper figure to
 *   Examiner / Question Papers / <institution code> / <course code> / <ts>-<paper8>-<filename>
 *
 * No public permission is granted (confidential examination content).
 */
export async function uploadQuestionPaperToFolder(
	opts: QuestionPaperUploadOptions
): Promise<QuestionPaperUploadResult> {
	if (!isDriveConfigured()) throw new Error('Google Drive is not configured for this server.')
	const drive = createDriveClient()

	const segments = [
		...QUESTION_PAPER_FOLDER,
		(opts.institutionCode || 'Unknown Institution').trim().toUpperCase(),
		(opts.courseCode || opts.paperId).trim().toUpperCase(),
	]
	// The folder id and the bytes are independent — resolve both at once.
	const [folderIdFirst, buffer] = await Promise.all([
		ensureFolderPath(drive, segments),
		opts.file.arrayBuffer().then(b => Buffer.from(b)),
	])
	const mimeType = opts.mimeType || (opts.file as File).type || 'application/octet-stream'
	const originalName =
		opts.filename || ((opts.file as File).name as string | undefined) || `figure.${mimeType.split('/')[1] || 'bin'}`
	const safeName = originalName.replace(/[\r\n/\\]/g, ' ').trim().slice(0, 160) || 'figure'
	const storedName = `${Date.now()}-${opts.paperId.slice(0, 8)}-${safeName}`

	const createIn = (folderId: string) =>
		drive.files.create({
			requestBody: { name: storedName, parents: [folderId] },
			media: { mimeType, body: Readable.from(buffer) },
			fields: 'id, webViewLink',
			supportsAllDrives: true,
		})

	let created
	try {
		created = await createIn(folderIdFirst)
	} catch (err) {
		// A remembered folder that has since been moved or deleted in Drive:
		// forget it, walk the chain again, and try once more.
		if (driveStatus(err) !== 404) throw err
		await forgetCachedFolder(segments)
		created = await createIn(await ensureFolderPath(drive, segments))
	}

	const fileId = created.data.id
	if (!fileId) throw new Error('Drive upload returned no file id.')

	// Deliberately NO drive.permissions.create — the file stays private.

	return {
		url: created.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
		driveFileId: fileId,
		filename: storedName,
		sizeBytes: buffer.byteLength,
		mimeType,
	}
}

export interface DriveFileBytes {
	buffer: Buffer
	mimeType: string
	name: string
}

/**
 * Read a Drive file's bytes server-side, for the authenticated proxy and for
 * inlining figures into the printed PDF. Null when the file is gone (404) or
 * Drive isn't configured; other errors are thrown.
 *
 * Pass `known` (mime type + name, e.g. from the registry row) to skip the
 * metadata round trip — one Drive call instead of two.
 */
export async function downloadDriveFile(
	fileId: string,
	known?: { mimeType?: string | null; name?: string | null }
): Promise<DriveFileBytes | null> {
	if (!isDriveConfigured() || !fileId) return null
	const drive = createDriveClient()
	try {
		const mediaReq = drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' })
		if (known?.mimeType) {
			const media = await mediaReq
			return { buffer: Buffer.from(media.data as ArrayBuffer), mimeType: known.mimeType, name: known.name || fileId }
		}
		const [meta, media] = await Promise.all([
			drive.files.get({ fileId, fields: 'id, name, mimeType, size', supportsAllDrives: true }),
			mediaReq,
		])
		return {
			buffer: Buffer.from(media.data as ArrayBuffer),
			mimeType: meta.data.mimeType || 'application/octet-stream',
			name: meta.data.name || fileId,
		}
	} catch (err) {
		if (driveStatus(err) === 404) return null
		throw err
	}
}

/** Size + name of a Drive file, for post-upload verification. Null when missing. */
export async function getDriveFileMeta(
	fileId: string
): Promise<{ id: string; name: string; mimeType: string; sizeBytes: number } | null> {
	if (!isDriveConfigured() || !fileId) return null
	try {
		const { data } = await createDriveClient().files.get({
			fileId,
			fields: 'id, name, mimeType, size',
			supportsAllDrives: true,
		})
		if (!data.id) return null
		return {
			id: data.id,
			name: data.name || '',
			mimeType: data.mimeType || '',
			sizeBytes: Number(data.size || 0),
		}
	} catch (err) {
		if (driveStatus(err) === 404) return null
		throw err
	}
}

/**
 * Permanently delete a Drive file (skips the trash — a trashed figure is still
 * a readable figure). Returns false instead of throwing when Drive isn't
 * configured or the delete failed; an already-missing file counts as deleted.
 */
export async function deleteDriveFile(fileId: string): Promise<boolean> {
	if (!isDriveConfigured() || !fileId) return false
	try {
		await createDriveClient().files.delete({ fileId, supportsAllDrives: true })
		return true
	} catch (err) {
		if (driveStatus(err) === 404) return true
		console.error(`[drive] delete failed for file ${fileId}`, err)
		return false
	}
}

function driveStatus(err: unknown): number | undefined {
	const e = err as { code?: number | string; status?: number; response?: { status?: number } }
	return Number(e?.code ?? e?.status ?? e?.response?.status) || undefined
}
