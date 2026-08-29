// The audit trail for one assignment (spec §10).
//
// GET /api/pre-exam/qp-examiner-assignments/:id/logs?denied_only=1&limit=200
//
// Read-only: nothing in the app ever edits or deletes a log line.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'

export const dynamic = 'force-dynamic'

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const { id } = await params
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const deniedOnly = searchParams.get('denied_only') === '1'
		const limit = Math.min(Number(searchParams.get('limit')) || 200, 1000)

		let query = supabase
			.from('ia_qp_access_logs')
			.select('*')
			.eq('assignment_id', id)
			.order('created_at', { ascending: false })
			// created_at can repeat within a millisecond for a burst of saves; the id
			// keeps the page boundary stable.
			.order('id', { ascending: false })
			.limit(limit)

		if (deniedOnly) query = query.eq('denied', true)

		const { data, error } = await query
		if (error) {
			console.error('[QP assign] logs fetch failed:', error.message)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		const rows = data || []
		const summary = {
			total: rows.length,
			denied: rows.filter(r => r.denied).length,
			logins: rows.filter(r => String(r.action).startsWith('login_')).length,
			views: rows.filter(r => r.action === 'paper_view').length,
			downloads: rows.filter(r => String(r.action).includes('download')).length,
			saves: rows.filter(r => r.action === 'paper_save').length,
			submissions: rows.filter(r => r.action === 'paper_submit').length,
			last_activity: rows[0]?.created_at || null,
		}

		return NextResponse.json({ data: rows, summary })
	} catch (error) {
		console.error('[QP assign] logs route failed:', error)
		return NextResponse.json({ error: 'Failed to load the access log' }, { status: 500 })
	}
}
