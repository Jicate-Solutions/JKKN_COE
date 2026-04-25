import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { resolveConversionRule } from '@/lib/marks/resolve-conversion-rule'
import { applyAttendanceSlabs } from '@/lib/marks/apply-attendance-slabs'
import { fetchMyJKKNAttendance } from '@/lib/myjkkn-attendance'

type Ctx = { params: Promise<{ id: string }> }

// POST { round_number: number, performed_by?: string }
export async function POST(request: Request, { params }: Ctx) {
	try {
		const { id: settingId } = await params
		const body = await request.json()
		const roundNumber: number = body.round_number
		const performedBy: string | null = body.performed_by || null

		if (!roundNumber) {
			return NextResponse.json({ error: 'round_number is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// 1. Load setting
		const { data: setting, error: setErr } = await supabase
			.from('cia_entry_settings')
			.select('institutions_id, institution_code, regulation_code, examination_session_id, program_codes, course_type, cia_rounds, conversion_rule_id')
			.eq('id', settingId)
			.single()
		if (setErr || !setting) return NextResponse.json({ error: 'Setting not found' }, { status: 404 })

		const round = (setting.cia_rounds as any[]).find(r => r.round === roundNumber)
		if (!round) return NextResponse.json({ error: `Round ${roundNumber} not found` }, { status: 404 })
		if (!round.session_from || !round.session_to) {
			return NextResponse.json({ error: 'Round missing session_from / session_to. Set them in the CIA setting first.' }, { status: 400 })
		}

		// 2. Resolve conversion rule (round override > setting default > registry lookup)
		let rule = null
		if (round.conversion_rule_id) {
			const { data } = await supabase.from('mark_conversion_rules').select('*').eq('id', round.conversion_rule_id).single()
			rule = data
		} else if (setting.conversion_rule_id) {
			const { data } = await supabase.from('mark_conversion_rules').select('*').eq('id', setting.conversion_rule_id).single()
			rule = data
		} else {
			rule = await resolveConversionRule({
				institutions_id: setting.institutions_id,
				regulation_code: setting.regulation_code,
				session_start: round.session_from,
			})
		}

		if (!rule) {
			return NextResponse.json({
				error: `No conversion rule effective on ${round.session_from}. Create one at /pre-exam/mark-conversion-rules.`
			}, { status: 400 })
		}
		if (!Array.isArray(rule.attendance_slabs) || rule.attendance_slabs.length === 0) {
			return NextResponse.json({ error: 'Resolved rule has no attendance_slabs defined.' }, { status: 400 })
		}

		// 3. Attendance component max_marks
		const attendanceComp = (round.components || []).find((c: any) => c.code === 'attendance')
		if (!attendanceComp) {
			return NextResponse.json({ error: 'Round has no Attendance component' }, { status: 400 })
		}
		const maxMarks = attendanceComp.max_marks || 0

		// 4. Load myjkkn_institution_ids
		const { data: inst } = await supabase
			.from('institutions').select('myjkkn_institution_ids').eq('id', setting.institutions_id).single()
		const myjkknIds: string[] = inst?.myjkkn_institution_ids || []
		if (myjkknIds.length === 0) {
			return NextResponse.json({ error: 'Institution has no MyJKKN institution IDs configured' }, { status: 400 })
		}

		// 5. Fetch MyJKKN attendance
		let attendanceByRegNo: Map<string, number>
		try {
			attendanceByRegNo = await fetchMyJKKNAttendance({
				myjkkn_institution_ids: myjkknIds,
				from: round.session_from,
				to: round.session_to,
			})
		} catch (e) {
			console.error('MyJKKN attendance fetch failed:', e)
			return NextResponse.json({ error: 'Attendance service unavailable, try again' }, { status: 503 })
		}

		// 6. Load exam_registrations in scope
		let regQ = supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, course_offering_id, program_id, program_code, institutions_id, examination_session_id')
			.eq('institutions_id', setting.institutions_id)
			.eq('examination_session_id', setting.examination_session_id)
		if (Array.isArray(setting.program_codes) && setting.program_codes.length > 0) {
			regQ = regQ.in('program_code', setting.program_codes)
		}
		const { data: registrations } = await regQ.range(0, 19999)
		if (!registrations?.length) {
			return NextResponse.json({ error: 'No registrations found for this setting scope' }, { status: 400 })
		}

		// 7. Snapshot the rule (frozen copy, never mutated)
		const ruleSnapshot = JSON.parse(JSON.stringify(rule))

		// 8. Upsert internal_marks for each registration
		let fetched = 0
		let belowThreshold = 0
		const missing: string[] = []
		const THRESHOLD_PCT = 75

		for (const reg of registrations) {
			const pct = attendanceByRegNo.get((reg.stu_register_no || '').trim())
			if (pct == null) {
				missing.push(reg.stu_register_no || reg.id)
				continue
			}

			const convertedMarks = applyAttendanceSlabs(pct, rule.attendance_slabs, maxMarks)
			if (pct < THRESHOLD_PCT) belowThreshold++

			const { data: existing } = await supabase
				.from('internal_marks')
				.select('id, attendance_marks, raw_attendance_pct')
				.eq('exam_registration_id', reg.id)
				.eq('course_offering_id', reg.course_offering_id)
				.eq('cia_setting_id', settingId)
				.eq('cia_round', roundNumber)
				.maybeSingle()

			const beforeValue = existing
				? { attendance_marks: existing.attendance_marks, raw_attendance_pct: existing.raw_attendance_pct }
				: null

			const markPayload = {
				attendance_marks: Math.round(convertedMarks),
				max_attendance_marks: maxMarks,
				raw_attendance_pct: pct,
				rule_snapshot: ruleSnapshot,
				rule_snapshot_id: rule.id,
				cia_setting_id: settingId,
				cia_round: roundNumber,
				cia_round_name: round.round_name,
				fetched_at: new Date().toISOString(),
			}

			if (existing) {
				await supabase.from('internal_marks').update(markPayload).eq('id', existing.id)
			} else {
				await supabase.from('internal_marks').insert({
					institutions_id: setting.institutions_id,
					examination_session_id: setting.examination_session_id,
					exam_registration_id: reg.id,
					course_offering_id: reg.course_offering_id,
					program_id: reg.program_id,
					student_id: reg.student_id,
					total_internal_marks: Math.round(convertedMarks),
					max_internal_marks: maxMarks,
					submission_date: new Date().toISOString().slice(0, 10),
					...markPayload,
				})
			}

			// Audit trail
			await supabase.from('internal_marks_audit').insert({
				internal_mark_id: existing?.id || null,
				cia_setting_id: settingId,
				cia_round: roundNumber,
				action: existing ? 'fetch' : 'insert',
				before_value: beforeValue,
				after_value: markPayload,
				rule_snapshot_id: rule.id,
				performed_by: performedBy,
			})

			fetched++
		}

		// Audit fetch-run summary
		await supabase.from('internal_marks_audit').insert({
			internal_mark_id: null,
			cia_setting_id: settingId,
			cia_round: roundNumber,
			action: 'fetch-run',
			extra: {
				fetched,
				below_threshold: belowThreshold,
				missing_count: missing.length,
				missing_sample: missing.slice(0, 10),
			},
			rule_snapshot_id: rule.id,
			performed_by: performedBy,
		})

		return NextResponse.json({
			success: true,
			fetched,
			below_threshold: belowThreshold,
			missing_count: missing.length,
			missing_sample: missing.slice(0, 10),
		})
	} catch (e) {
		console.error('Fetch-attendance error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
