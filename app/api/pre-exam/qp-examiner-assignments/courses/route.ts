// Superseded by ./papers.
//
// This endpoint used to list course offerings and INFER a question paper format
// for each one, creating the paper shell as a side effect of assigning an
// examiner. Since 20260829 the format is chosen deliberately in the Generate
// step and the paper exists before anyone is appointed to it, so there is no
// longer anything for this route to infer.
//
// Kept as an explicit 410 rather than deleted: a stale browser tab calling the
// old path should be told what happened, not silently handed an empty list.

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
	return NextResponse.json(
		{
			error:
				'This endpoint has been replaced. End-semester papers are now generated first (Generate Papers tab) and assigned afterwards — use /api/pre-exam/qp-examiner-assignments/papers.',
			moved_to: '/api/pre-exam/qp-examiner-assignments/papers',
		},
		{ status: 410 }
	)
}
