// Examiner portal — the examiner's own registration record, read only.
//
// GET /api/examiner-portal/registration
//
// Returns the full `examiners` row the examiner submitted through the
// registration form (engineering or arts stream), plus the board
// associations for arts examiners. Nothing here is editable from the
// portal: corrections go through the Office of the CoE.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireExaminer } from '@/lib/qp-portal/guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Columns that never leave the server: bank details have their own endpoint,
// storage paths and audit columns are internal.
const PRIVATE_COLUMNS = new Set([
	'bank_account_holder',
	'bank_name',
	'bank_account_number',
	'bank_branch',
	'bank_ifsc',
	'signature_path',
	'notes',
	'created_by',
	'updated_by',
	'accepted_by',
])

export async function GET(req: NextRequest) {
	const auth = await requireExaminer(req)
	if (!auth.ok) return auth.response

	const supabase = getSupabaseServer()

	const [{ data: row, error }, { data: boards }] = await Promise.all([
		supabase.from('examiners').select('*').eq('id', auth.examiner.id).maybeSingle(),
		supabase
			.from('examiner_board_associations')
			.select(
				'board_code, willing_for_valuation, willing_for_practical, willing_for_scrutiny, board:board_id(board_name, board_type)'
			)
			.eq('examiner_id', auth.examiner.id)
			.eq('is_active', true),
	])

	if (error || !row) {
		console.error('[QP portal] registration fetch failed:', error?.message)
		return NextResponse.json({ error: 'Your registration could not be loaded.' }, { status: 500 })
	}

	const examiner = Object.fromEntries(
		Object.entries(row).filter(([key]) => !PRIVATE_COLUMNS.has(key))
	)

	return NextResponse.json({ examiner, boards: boards || [] })
}
