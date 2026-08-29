// CoE-editable portal documents and Examiner Order design (spec §6 and §9).
//
// GET  /api/pre-exam/qp-portal-content?institutions_id=&examination_session_id=
//      → all six documents, each resolved session-row → institution default →
//        built-in text, with is_fallback telling the UI which is which.
// PUT  → save one document. Sending examination_session_id creates/updates the
//        session-specific row; omitting it edits the institution default.
// DELETE ?doc_type=&examination_session_id= → drop a session override so the
//        institution default applies again.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { getAllPortalContent, getPortalContent, readClauses } from '@/lib/qp-portal/content'
import type { QpPortalDocType } from '@/types/qp-examiner-assignment'

export const dynamic = 'force-dynamic'

const VIEW_PERMISSION = 'page.pre_exam.qp_portal_content.view'

const DOC_TYPES: QpPortalDocType[] = [
	'instructions',
	'guidelines',
	'checklist',
	'declaration',
	'claim',
	'order',
]

function isDocType(v: unknown): v is QpPortalDocType {
	return typeof v === 'string' && (DOC_TYPES as string[]).includes(v)
}

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const docType = searchParams.get('doc_type')

		if (!institutionsId) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		if (docType) {
			if (!isDocType(docType)) {
				return NextResponse.json({ error: `Unknown doc_type "${docType}"` }, { status: 400 })
			}
			const one = await getPortalContent(institutionsId, docType, sessionId)
			return NextResponse.json(one)
		}

		const all = await getAllPortalContent(institutionsId, sessionId)
		return NextResponse.json({ data: all, doc_types: DOC_TYPES })
	} catch (error) {
		console.error('[QP content] GET failed:', error)
		return NextResponse.json({ error: 'Failed to load the portal content' }, { status: 500 })
	}
}

export async function PUT(req: NextRequest) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const body = await req.json()
		const { institutions_id, doc_type } = body
		const sessionId = body.examination_session_id || null

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}
		if (!isDocType(doc_type)) {
			return NextResponse.json({ error: `Unknown doc_type "${doc_type}"` }, { status: 400 })
		}

		const rate =
			body.rate_per_paper === '' || body.rate_per_paper === null || body.rate_per_paper === undefined
				? null
				: Number(body.rate_per_paper)
		if (rate !== null && (isNaN(rate) || rate < 0)) {
			return NextResponse.json({ error: 'Rate per paper must be a positive amount.' }, { status: 400 })
		}

		const payload = {
			institutions_id,
			examination_session_id: sessionId,
			doc_type,
			title: body.title || null,
			subtitle: body.subtitle || null,
			// Clauses are re-read so a payload of loose strings, or one with missing
			// ids, still lands as a well-formed ordered list.
			body: readClauses(body.body),
			footer_note: body.footer_note || null,
			intro_text: body.intro_text || null,
			session_label: body.session_label || null,
			letter_ref: body.letter_ref || null,
			contact_email: body.contact_email || null,
			rate_per_paper: rate,
			rate_in_words: body.rate_in_words || null,
			signatory_name: body.signatory_name || null,
			signatory_designation: body.signatory_designation || null,
			is_active: body.is_active !== false,
			updated_by: perm.userId,
			updated_at: new Date().toISOString(),
		}

		// Two partial unique indexes cover this table (one for session rows, one for
		// the NULL-session default), and PostgREST cannot target a partial index by
		// name — so the row is found first and then updated or inserted.
		let existingQuery = supabase
			.from('ia_qp_portal_content')
			.select('id')
			.eq('institutions_id', institutions_id)
			.eq('doc_type', doc_type)
		existingQuery = sessionId
			? existingQuery.eq('examination_session_id', sessionId)
			: existingQuery.is('examination_session_id', null)

		const { data: existing } = await existingQuery.maybeSingle()

		const { data, error } = existing
			? await supabase.from('ia_qp_portal_content').update(payload).eq('id', existing.id).select().single()
			: await supabase.from('ia_qp_portal_content').insert(payload).select().single()

		if (error) {
			console.error('[QP content] save failed:', error.message)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			data: { ...data, body: readClauses(data.body) },
			message: sessionId
				? 'Saved for this examination session.'
				: 'Saved as the institution default.',
		})
	} catch (error: any) {
		console.error('[QP content] PUT failed:', error)
		return NextResponse.json({ error: error?.message || 'Failed to save the portal content' }, { status: 500 })
	}
}

export async function DELETE(req: NextRequest) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const institutionsId = searchParams.get('institutions_id')
		const docType = searchParams.get('doc_type')
		const sessionId = searchParams.get('examination_session_id')

		if (!institutionsId || !isDocType(docType)) {
			return NextResponse.json({ error: 'institutions_id and a valid doc_type are required' }, { status: 400 })
		}
		if (!sessionId) {
			return NextResponse.json(
				{ error: 'Only a session override can be removed. Edit the institution default instead of deleting it.' },
				{ status: 400 }
			)
		}

		const { error } = await supabase
			.from('ia_qp_portal_content')
			.delete()
			.eq('institutions_id', institutionsId)
			.eq('doc_type', docType)
			.eq('examination_session_id', sessionId)

		if (error) return NextResponse.json({ error: error.message }, { status: 500 })
		return NextResponse.json({ success: true, message: 'Session override removed — the institution default applies again.' })
	} catch (error) {
		console.error('[QP content] DELETE failed:', error)
		return NextResponse.json({ error: 'Failed to remove the override' }, { status: 500 })
	}
}
