// Examiner portal — who am I, and sign out.
//
// GET    → the signed-in examiner plus their portal profile (bank, signature)
// DELETE → clear the session cookie

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireExaminer, logAccess } from '@/lib/qp-portal/guard'
import { readPortalSession, clearPortalCookie } from '@/lib/qp-portal/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
	const auth = await requireExaminer(req)
	// A missing session is the normal state of the sign-in page, not an error the
	// client should surface — answer with a plain "not signed in".
	if (!auth.ok) {
		const session = await readPortalSession(req)
		if (!session) return NextResponse.json({ authenticated: false }, { status: 200 })
		return auth.response
	}

	const { examiner, session } = auth
	const supabase = getSupabaseServer()

	const { count } = await supabase
		.from('ia_qp_assignments')
		.select('id', { count: 'exact', head: true })
		.eq('examiner_id', examiner.id)
		.neq('status', 'cancelled')

	return NextResponse.json({
		authenticated: true,
		examiner: {
			id: examiner.id,
			full_name: examiner.full_name,
			email: examiner.email,
			mobile: examiner.mobile,
			designation: examiner.designation,
			department: examiner.department,
			institution_name: examiner.institution_name,
			kind: examiner.is_internal ? 'internal' : 'external',
			has_signature: !!examiner.signature_path,
			bank: {
				account_holder: examiner.bank_account_holder,
				bank_name: examiner.bank_name,
				account_number: examiner.bank_account_number,
				branch: examiner.bank_branch,
				ifsc: examiner.bank_ifsc,
			},
		},
		assignment_count: count || 0,
		session: { via: session.via, expires_at: new Date(session.exp * 1000).toISOString() },
	})
}

export async function DELETE(req: NextRequest) {
	const session = await readPortalSession(req)
	if (session) {
		await logAccess(req, {
			action: 'logout',
			examiner_id: session.sub,
			examiner_email: session.email,
		})
	}
	return clearPortalCookie(NextResponse.json({ success: true }))
}
