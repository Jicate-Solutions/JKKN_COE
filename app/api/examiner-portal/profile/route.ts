// Examiner portal — the profile the examiner fills in once and reuses on every
// document: bank details for the claim, and a specimen signature.
//
// GET  /api/examiner-portal/profile
// PUT  /api/examiner-portal/profile          { bank fields }
// POST /api/examiner-portal/profile          (multipart: signature file)
//
// The signature lives in the PRIVATE `examiner-signatures` bucket. It is never
// given a public URL: the server pastes it into the claim PDF, and the preview
// below is a short-lived signed URL.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireExaminer, logAccess } from '@/lib/qp-portal/guard'
import { SIGNATURE_BUCKET, ensureSignatureBucket } from '@/lib/qp-portal/assignment-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_SIGNATURE_BYTES = 1 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/webp': 'webp',
}
const SIGNED_URL_TTL_SECONDS = 300

export async function GET(req: NextRequest) {
	const auth = await requireExaminer(req)
	if (!auth.ok) return auth.response

	const supabase = getSupabaseServer()
	let signatureUrl: string | null = null
	if (auth.examiner.signature_path) {
		const { data } = await supabase.storage
			.from(SIGNATURE_BUCKET)
			.createSignedUrl(auth.examiner.signature_path, SIGNED_URL_TTL_SECONDS)
		signatureUrl = data?.signedUrl || null
	}

	return NextResponse.json({
		full_name: auth.examiner.full_name,
		email: auth.examiner.email,
		mobile: auth.examiner.mobile,
		designation: auth.examiner.designation,
		department: auth.examiner.department,
		institution_name: auth.examiner.institution_name,
		bank: {
			account_holder: auth.examiner.bank_account_holder,
			bank_name: auth.examiner.bank_name,
			account_number: auth.examiner.bank_account_number,
			branch: auth.examiner.bank_branch,
			ifsc: auth.examiner.bank_ifsc,
		},
		signature_url: signatureUrl,
		has_signature: !!auth.examiner.signature_path,
	})
}

export async function PUT(req: NextRequest) {
	const auth = await requireExaminer(req)
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		const body = await req.json().catch(() => ({}))

		const ifsc = String(body.bank_ifsc || '').toUpperCase().trim()
		if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
			return NextResponse.json(
				{ error: 'That IFSC does not look right — it should be like SBIN0001234.' },
				{ status: 400 }
			)
		}
		const account = String(body.bank_account_number || '').replace(/\s+/g, '')
		if (account && !/^\d{6,20}$/.test(account)) {
			return NextResponse.json({ error: 'Enter a valid bank account number.' }, { status: 400 })
		}

		const patch = {
			bank_account_holder: body.bank_account_holder || null,
			bank_name: body.bank_name || null,
			bank_account_number: account || null,
			bank_branch: body.bank_branch || null,
			bank_ifsc: ifsc || null,
			// The examiner may correct their own contact details; identity fields
			// (name, e-mail) stay under the CoE's control.
			mobile: body.mobile || auth.examiner.mobile,
			updated_at: new Date().toISOString(),
		}

		const { error } = await supabase.from('examiners').update(patch).eq('id', auth.examiner.id)
		if (error) {
			console.error('[QP portal] profile update failed:', error.message)
			return NextResponse.json({ error: 'Your details could not be saved.' }, { status: 500 })
		}

		await logAccess(req, {
			action: 'profile_update',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			detail: { fields: Object.keys(patch).filter(k => k !== 'updated_at') },
		})

		return NextResponse.json({ success: true, message: 'Your details have been saved.' })
	} catch (error) {
		console.error('[QP portal] profile PUT failed:', error)
		return NextResponse.json({ error: 'Your details could not be saved.' }, { status: 500 })
	}
}

export async function POST(req: NextRequest) {
	const auth = await requireExaminer(req)
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		await ensureSignatureBucket(supabase)

		const form = await req.formData()
		const file = form.get('file') as File | null
		if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

		const ext = ALLOWED_TYPES[file.type]
		if (!ext) {
			return NextResponse.json({ error: 'Upload the signature as a PNG, JPEG or WebP image.' }, { status: 400 })
		}
		if (file.size > MAX_SIGNATURE_BYTES) {
			return NextResponse.json({ error: 'The signature image must be under 1 MB.' }, { status: 400 })
		}

		const previous = auth.examiner.signature_path
		const path = `${auth.examiner.id}/${randomUUID()}.${ext}`
		const buffer = Buffer.from(await file.arrayBuffer())

		const { error: upErr } = await supabase.storage
			.from(SIGNATURE_BUCKET)
			.upload(path, buffer, { contentType: file.type, upsert: false })
		if (upErr) {
			console.error('[QP portal] signature upload failed:', upErr.message)
			return NextResponse.json({ error: 'The signature could not be uploaded.' }, { status: 500 })
		}

		const { error: updErr } = await supabase
			.from('examiners')
			.update({ signature_path: path, signature_updated_at: new Date().toISOString() })
			.eq('id', auth.examiner.id)
		if (updErr) {
			// Do not leave an orphan object behind if the row could not be pointed at it.
			await supabase.storage.from(SIGNATURE_BUCKET).remove([path])
			console.error('[QP portal] signature link failed:', updErr.message)
			return NextResponse.json({ error: 'The signature could not be saved.' }, { status: 500 })
		}

		// Replace, don't accumulate.
		if (previous && previous !== path) {
			await supabase.storage.from(SIGNATURE_BUCKET).remove([previous])
		}

		const { data: signed } = await supabase.storage
			.from(SIGNATURE_BUCKET)
			.createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

		await logAccess(req, {
			action: 'profile_update',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			detail: { signature: true, bytes: file.size },
		})

		return NextResponse.json({
			success: true,
			signature_url: signed?.signedUrl || null,
			message: 'Signature saved.',
		})
	} catch (error) {
		console.error('[QP portal] signature POST failed:', error)
		return NextResponse.json({ error: 'The signature could not be uploaded.' }, { status: 500 })
	}
}
