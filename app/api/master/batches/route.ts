import { NextRequest, NextResponse } from 'next/server'
import { BATCHES_READ_ONLY_MESSAGE, loadBatches } from '@/lib/api-helpers/myjkkn-batches'
import { institutionParam } from '@/lib/auth/institution-scope-request'

// Batches are mastered in MyJKKN; COE has no batch table. This route used to
// read one and failed on every call. It now lists the MyJKKN batches in the
// shape the screens expect, limited to the caller's institution.
export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url)
		const status = searchParams.get('status')

		const batches = await loadBatches({
			institutionCode: await institutionParam(searchParams, 'institution_code'),
			search: searchParams.get('search'),
			status: status === null ? null : status === 'true',
		})
		return NextResponse.json(batches)
	} catch (err) {
		console.error('[master/batches] Could not load batches from MyJKKN:', err)
		return NextResponse.json({ error: 'Unable to load batches right now. Try again later.' }, { status: 502 })
	}
}

export async function POST() {
	return NextResponse.json({ error: BATCHES_READ_ONLY_MESSAGE }, { status: 405 })
}
