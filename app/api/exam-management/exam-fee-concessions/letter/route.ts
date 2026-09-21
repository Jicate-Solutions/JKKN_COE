import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { CONCESSION_LETTER_BUCKET } from '@/lib/exam-fee-concessions/concessions'

/**
 * GET ?id=<concession id> - a short-lived link to the concession's approval
 * letter. The bucket is private, so the letter is only ever reachable through
 * this permission-checked route.
 */

const VIEW_PERMISSION = 'page.exam_management.exam_fee_concessions.view'
const SIGNED_URL_TTL_SECONDS = 5 * 60

export async function GET(request: Request) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const id = new URL(request.url).searchParams.get('id') || ''
		if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

		const { data: concession, error } = await supabase
			.from('exam_fee_concessions')
			.select('id, letter_file_path, letter_file_name')
			.eq('id', id)
			.maybeSingle()

		if (error) return NextResponse.json({ error: error.message }, { status: 500 })
		if (!concession?.letter_file_path) {
			return NextResponse.json({ error: 'No approval letter is attached to this concession' }, { status: 404 })
		}

		const { data: signed, error: signError } = await supabase.storage
			.from(CONCESSION_LETTER_BUCKET)
			.createSignedUrl(concession.letter_file_path, SIGNED_URL_TTL_SECONDS)

		if (signError || !signed?.signedUrl) {
			console.error('[exam-fee-concessions] letter link failed:', signError)
			return NextResponse.json({ error: 'Could not open the approval letter' }, { status: 500 })
		}

		return NextResponse.json({ url: signed.signedUrl, file_name: concession.letter_file_name })
	} catch (e) {
		console.error('[exam-fee-concessions] letter GET error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
