import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { EmailBatchStatus } from '@/types/practical-email'

// ---------------------------------------------------------------------------
// GET — Check the status of a practical email batch
// Query params: batch_id
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const batchId = searchParams.get('batch_id')

		if (!batchId?.trim()) {
			return NextResponse.json({ error: 'batch_id is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Fetch batch record
		const { data: batch, error: batchError } = await supabase
			.from('practical_email_batches')
			.select(
				'id, status, total_emails, sent_count, failed_count, started_at, completed_at, institution_code, examination_session_id'
			)
			.eq('id', batchId)
			.single()

		if (batchError || !batch) {
			console.error('Error fetching email batch:', batchError)
			return NextResponse.json({ error: 'Email batch not found' }, { status: 404 })
		}

		// Fetch related email logs for this batch
		const { data: logs, error: logsError } = await supabase
			.from('examiner_email_logs')
			.select(
				'id, email_to, email_subject, status, error_message, sent_at, examiner_type, examiner_id'
			)
			.eq('practical_batch_id', batchId)
			.order('created_at', { ascending: true })

		if (logsError) {
			console.error('Error fetching email logs:', logsError)
			// Return batch info even if logs fail — non-fatal
		}

		// Enrich external examiner names from the examiners table
		const externalExaminerIds = [
			...new Set(
				(logs || [])
					.filter((l) => l.examiner_id)
					.map((l) => l.examiner_id as string)
			),
		]

		const examinerNameMap = new Map<string, string>()
		if (externalExaminerIds.length > 0) {
			const { data: examiners } = await supabase
				.from('examiners')
				.select('id, full_name')
				.in('id', externalExaminerIds)

			for (const e of examiners || []) {
				examinerNameMap.set(e.id, e.full_name || '')
			}
		}

		// Build detail rows
		const details = (logs || []).map((log) => {
			const resolvedName = log.examiner_id
				? examinerNameMap.get(log.examiner_id) || log.email_to
				: log.email_to

			return {
				examiner_name: resolvedName,
				examiner_email: log.email_to,
				examiner_type: log.examiner_type || 'unknown',
				status: log.status as 'PENDING' | 'SENT' | 'FAILED',
				error_message: log.error_message || undefined,
				sent_at: log.sent_at || undefined,
			}
		})

		const statusResponse: EmailBatchStatus = {
			id: batch.id,
			status: batch.status,
			total_emails: batch.total_emails,
			sent_count: batch.sent_count,
			failed_count: batch.failed_count,
			details,
		}

		return NextResponse.json(statusResponse)
	} catch (error) {
		console.error('Unexpected error in GET /api/pre-exam/practical-email/status:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
