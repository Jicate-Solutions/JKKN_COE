// Examination sessions for the assignment screen, each carrying its exam type.
//
// GET /api/pre-exam/qp-examiner-assignments/sessions?institutions_id=
//
// The screen must verify "Exam Type = End Semester Examinations" (spec §4.2),
// so the flag is computed here rather than leaving the page to guess from a
// name. Every session is returned — a non-ESE one is shown disabled with the
// reason, which is more useful than silently hiding it.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { isEndSemesterExamType } from '@/lib/qp-portal/exam-type'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const institutionsId = new URL(req.url).searchParams.get('institutions_id')
		if (!institutionsId) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		const { data: sessions, error } = await supabase
			.from('examination_sessions')
			.select('id, session_name, session_code, month_year, exam_type_id, session_status, exam_start_date, exam_end_date')
			.eq('institutions_id', institutionsId)
			.order('exam_start_date', { ascending: false })
			.order('id', { ascending: false })
		if (error) {
			console.error('[QP assign] session list failed:', error.message)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		const typeIds = [...new Set((sessions || []).map(s => s.exam_type_id).filter(Boolean))]
		const typeById = new Map<string, any>()
		if (typeIds.length) {
			const { data: types } = await supabase
				.from('exam_types')
				.select('id, examination_code, examination_name')
				.in('id', typeIds)
			for (const t of types || []) typeById.set(t.id, t)
		}

		const data = (sessions || []).map(s => {
			const examType = s.exam_type_id ? typeById.get(s.exam_type_id) : null
			return {
				id: s.id,
				session_name: s.session_name,
				session_code: s.session_code,
				month_year: s.month_year,
				session_status: s.session_status,
				exam_start_date: s.exam_start_date,
				exam_end_date: s.exam_end_date,
				exam_type_id: s.exam_type_id,
				exam_type_name: examType?.examination_name || null,
				exam_type_code: examType?.examination_code || null,
				is_end_semester: isEndSemesterExamType(examType),
			}
		})

		return NextResponse.json({
			data,
			end_semester_count: data.filter(s => s.is_end_semester).length,
		})
	} catch (error) {
		console.error('[QP assign] sessions route failed:', error)
		return NextResponse.json({ error: 'Failed to load examination sessions' }, { status: 500 })
	}
}
