// Resolving the CoE-editable portal documents.
//
// ia_qp_portal_content holds one row per (institution, session, doc_type). A row
// with a NULL session is the institution's default, used whenever that session
// has no row of its own — so a CoE that never edits per-session still gets text,
// and one that does gets it only where they asked for it.
//
// If neither exists, QP_CONTENT_DEFAULTS supplies the wording, so no examiner
// ever meets an empty Instructions page.

import { getSupabaseServer } from '@/lib/supabase-server'
import {
	QP_CONTENT_DEFAULTS,
	type QpContentClause,
	type QpPortalContent,
	type QpPortalDocType,
} from '@/types/qp-examiner-assignment'

/** Coerce whatever is in the JSONB body into ordered clauses with ids. */
export function readClauses(raw: unknown): QpContentClause[] {
	if (!Array.isArray(raw)) return []
	return raw
		.map((item, i) => {
			if (typeof item === 'string') return { id: `c${i + 1}`, text: item }
			if (item && typeof item === 'object') {
				const o = item as Record<string, unknown>
				const text = typeof o.text === 'string' ? o.text : ''
				if (!text.trim()) return null
				return {
					id: typeof o.id === 'string' && o.id ? o.id : `c${i + 1}`,
					text,
					...(typeof o.note === 'string' && o.note ? { note: o.note } : {}),
				}
			}
			return null
		})
		.filter((c): c is QpContentClause => c !== null)
}

function defaultsFor(docType: QpPortalDocType, institutionsId: string): QpPortalContent {
	const d = QP_CONTENT_DEFAULTS[docType]
	const now = new Date().toISOString()
	return {
		id: `default:${docType}`,
		institutions_id: institutionsId,
		examination_session_id: null,
		doc_type: docType,
		title: d.title,
		subtitle: null,
		body: d.body.map((text, i) => ({ id: `d${i + 1}`, text })),
		footer_note: d.footer || null,
		intro_text: null,
		session_label: null,
		letter_ref: null,
		contact_email: null,
		rate_per_paper: null,
		rate_in_words: null,
		signatory_name: null,
		signatory_designation: 'Controller of Examinations',
		is_active: true,
		created_at: now,
		updated_at: now,
	}
}

function normalize(row: Record<string, unknown>): QpPortalContent {
	return {
		...(row as unknown as QpPortalContent),
		body: readClauses(row.body),
	}
}

/**
 * The document to show, resolved session-row → institution default → built-in.
 * `isFallback` tells the CoE config screen that nothing is saved yet.
 */
export async function getPortalContent(
	institutionsId: string,
	docType: QpPortalDocType,
	sessionId?: string | null
): Promise<QpPortalContent & { is_fallback: boolean }> {
	const supabase = getSupabaseServer()

	const { data, error } = await supabase
		.from('ia_qp_portal_content')
		.select('*')
		.eq('institutions_id', institutionsId)
		.eq('doc_type', docType)
		.eq('is_active', true)

	if (error) {
		console.error('[QP portal] content lookup failed:', error.message)
		return { ...defaultsFor(docType, institutionsId), is_fallback: true }
	}

	const rows = data || []
	const forSession = sessionId ? rows.find(r => r.examination_session_id === sessionId) : undefined
	const institutionDefault = rows.find(r => r.examination_session_id === null)
	const chosen = forSession || institutionDefault

	if (!chosen) return { ...defaultsFor(docType, institutionsId), is_fallback: true }

	const normalized = normalize(chosen)
	// A saved row with an empty body still deserves the built-in clauses rather
	// than a blank page — the CoE cleared the list, they did not choose silence.
	if (normalized.body.length === 0) {
		normalized.body = defaultsFor(docType, institutionsId).body
	}
	return { ...normalized, is_fallback: false }
}

/** All six documents at once — what the portal loads on sign-in. */
export async function getAllPortalContent(
	institutionsId: string,
	sessionId?: string | null
): Promise<Record<QpPortalDocType, QpPortalContent & { is_fallback: boolean }>> {
	const types: QpPortalDocType[] = [
		'instructions',
		'guidelines',
		'checklist',
		'declaration',
		'claim',
		'order',
	]
	const resolved = await Promise.all(types.map(t => getPortalContent(institutionsId, t, sessionId)))
	return Object.fromEntries(types.map((t, i) => [t, resolved[i]])) as Record<
		QpPortalDocType,
		QpPortalContent & { is_fallback: boolean }
	>
}

/**
 * Next order reference for an institution, e.g. "JKKNCET/COE/QPS/NOV-DEC-2026/007".
 * Derived from the configured letter_ref plus a per-institution running count;
 * the unique index on (institutions_id, order_ref_no) is the real guard, and the
 * caller retries on a collision.
 */
export function buildOrderRef(letterRef: string | null | undefined, sequence: number): string {
	const base = (letterRef || 'COE/QPS').replace(/\/+$/, '')
	return `${base}/${String(sequence).padStart(3, '0')}`
}
