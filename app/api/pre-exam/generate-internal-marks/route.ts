import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { calculateFinalInternalMarks, type CIAMarkRow, type InternalMarkRow } from '@/lib/internal-marks/calculate-final'
import type { MarkConversionRule } from '@/types/mark-conversion-rule'

// POST /api/pre-exam/generate-internal-marks
// Body: { mode, institutions_id, examination_session_id, conversion_rule_id?, program_code?, semester?, course_offering_ids?, regulation_code?, created_by? }
// mode = 'preview' (no writes) | 'execute' (upsert internal_marks with status='Submitted')
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const {
			mode = 'preview',
			institutions_id,
			examination_session_id,
			conversion_rule_id,
			program_code,
			semester,
			course_offering_ids,
			regulation_code,
			created_by,
		} = body || {}

		if (!institutions_id || !examination_session_id) {
			return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
		}
		if (mode !== 'preview' && mode !== 'execute') {
			return NextResponse.json({ error: 'mode must be "preview" or "execute"' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// ─── 1. Resolve conversion rule ───
		let rule: MarkConversionRule | null = null
		if (conversion_rule_id) {
			const { data, error } = await supabase
				.from('mark_conversion_rules')
				.select('*')
				.eq('id', conversion_rule_id)
				.single()
			if (error || !data) {
				return NextResponse.json({ error: 'Conversion rule not found' }, { status: 404 })
			}
			rule = data as MarkConversionRule
		} else {
			// Auto-resolve: latest active rule for (institution, regulation_code) where wef_date <= today
			const today = new Date().toISOString().slice(0, 10)
			let q = supabase
				.from('mark_conversion_rules')
				.select('*')
				.eq('institutions_id', institutions_id)
				.eq('is_active', true)
				.lte('wef_date', today)
				.order('wef_date', { ascending: false })
				.limit(1)
			if (regulation_code) q = q.eq('regulation_code', regulation_code)
			const { data } = await q
			if (!data || data.length === 0) {
				return NextResponse.json({
					error: 'No active conversion rule found. Pass conversion_rule_id or configure one.',
				}, { status: 400 })
			}
			rule = data[0] as MarkConversionRule
		}

		// ─── 2. Enumerate course_offerings ───
		let coQuery = supabase
			.from('course_offerings')
			.select('id, course_id, course_code, program_id, program_code, semester, examination_session_id, institutions_id')
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.eq('is_active', true)

		if (course_offering_ids && Array.isArray(course_offering_ids) && course_offering_ids.length > 0) {
			coQuery = coQuery.in('id', course_offering_ids)
		} else {
			if (program_code) coQuery = coQuery.eq('program_code', program_code)
			if (semester != null) coQuery = coQuery.eq('semester', Number(semester))
		}

		const { data: offerings, error: coErr } = await coQuery.range(0, 9999)
		if (coErr) {
			console.error('generate-internal-marks: course_offerings fetch failed', coErr)
			return NextResponse.json({ error: 'Failed to fetch course offerings' }, { status: 500 })
		}
		if (!offerings || offerings.length === 0) {
			return NextResponse.json({
				mode,
				rule: { id: rule.id, rule_name: rule.rule_name, wef_date: rule.wef_date, regulation_code: rule.regulation_code },
				results: [],
				totals: { processed: 0, upserted: 0, errors: 0, no_data: 0 },
			})
		}

		// ─── 3. Bulk-fetch courses, exam_registrations, cia_marks, internal_marks ───
		const courseCodes = [...new Set(offerings.map(o => o.course_code))]
		const offeringIds = offerings.map(o => o.id)

		const [coursesRes, regsRes, ciaRes, imRes] = await Promise.all([
			supabase
				.from('courses')
				.select('id, course_code, course_name, internal_max_mark')
				.eq('institutions_id', institutions_id)
				.in('course_code', courseCodes),
			supabase
				.from('exam_registrations')
				.select('id, student_id, stu_register_no, student_name, course_offering_id, course_code, program_code, institutions_id, examination_session_id, is_regular')
				.eq('examination_session_id', examination_session_id)
				.eq('is_regular', true)
				.in('course_offering_id', offeringIds)
				.range(0, 49999),
			supabase
				.from('cia_marks')
				.select('exam_registration_id, student_id, course_offering_id, cia_round, assignment_marks, quiz_marks, mid_term_marks, presentation_marks, attendance_marks, lab_marks, project_marks, seminar_marks, viva_marks, test_1_mark, test_2_mark, test_3_mark, other_marks, extra_marks')
				.eq('examination_session_id', examination_session_id)
				.in('course_offering_id', offeringIds)
				.eq('is_active', true)
				.range(0, 49999),
			supabase
				.from('internal_marks')
				.select('id, exam_registration_id, student_id, course_offering_id, assignment_marks, quiz_marks, mid_term_marks, presentation_marks, attendance_marks, lab_marks, project_marks, seminar_marks, viva_marks, test_1_mark, test_2_mark, test_3_mark, other_marks, is_locked')
				.eq('examination_session_id', examination_session_id)
				.in('course_offering_id', offeringIds)
				.range(0, 49999),
		])

		if (coursesRes.error) console.error('courses fetch', coursesRes.error)
		if (regsRes.error) console.error('regs fetch', regsRes.error)
		if (ciaRes.error) console.error('cia fetch', ciaRes.error)
		if (imRes.error) console.error('im fetch', imRes.error)

		const courseByCode = new Map((coursesRes.data || []).map(c => [c.course_code, c]))
		const regsByCO = new Map<string, any[]>()
		for (const r of regsRes.data || []) {
			const arr = regsByCO.get(r.course_offering_id) || []
			arr.push(r)
			regsByCO.set(r.course_offering_id, arr)
		}
		// cia_marks: key by (student_id, course_offering_id) → array of rows by cia_round
		const ciaByKey = new Map<string, CIAMarkRow[]>()
		for (const m of ciaRes.data || []) {
			const k = `${m.student_id}|${m.course_offering_id}`
			const arr = ciaByKey.get(k) || []
			arr.push(m as CIAMarkRow)
			ciaByKey.set(k, arr)
		}
		// internal_marks: key by (student_id, course_offering_id)
		const imByKey = new Map<string, any>()
		for (const r of imRes.data || []) {
			imByKey.set(`${r.student_id}|${r.course_offering_id}`, r)
		}

		// ─── 4. Calculate per learner per course ───
		const results: any[] = []
		const totals = { processed: 0, upserted: 0, errors: 0, no_data: 0 }
		const upsertBatch: any[] = []

		for (const co of offerings) {
			const course = courseByCode.get(co.course_code)
			const courseMax = Number(course?.internal_max_mark) || 0
			const regs = regsByCO.get(co.id) || []
			const learners: any[] = []

			for (const reg of regs) {
				totals.processed++
				const key = `${reg.student_id}|${co.id}`
				const ciaRows = ciaByKey.get(key) || []
				const imRow = imByKey.get(key) as InternalMarkRow | undefined
				const hasCIA = ciaRows.length > 0
				const hasFallback = !!imRow && hasAnyMark(imRow)

				if (!hasCIA && !hasFallback) {
					totals.no_data++
					learners.push({
						exam_registration_id: reg.id,
						student_id: reg.student_id,
						stu_register_no: reg.stu_register_no,
						student_name: reg.student_name,
						status: 'no_data',
						total_internal_marks: 0,
						max_internal_marks: courseMax,
						warnings: ['No cia_marks or internal_marks data for this learner'],
						errors: [],
					})
					continue
				}

				if (courseMax <= 0) {
					totals.errors++
					learners.push({
						exam_registration_id: reg.id,
						student_id: reg.student_id,
						stu_register_no: reg.stu_register_no,
						student_name: reg.student_name,
						status: 'error',
						total_internal_marks: 0,
						max_internal_marks: 0,
						warnings: [],
						errors: ['courses.internal_max_mark is 0 or missing'],
					})
					continue
				}

				// Block updates to locked internal_marks
				const existing = imByKey.get(key)
				if (mode === 'execute' && existing?.is_locked) {
					totals.errors++
					learners.push({
						exam_registration_id: reg.id,
						student_id: reg.student_id,
						stu_register_no: reg.stu_register_no,
						student_name: reg.student_name,
						status: 'error',
						total_internal_marks: 0,
						max_internal_marks: courseMax,
						warnings: [],
						errors: ['internal_marks row is locked'],
					})
					continue
				}

				const calc = calculateFinalInternalMarks({
					rule,
					course_internal_max: courseMax,
					cia_marks: ciaRows,
					fallback: hasFallback ? (imRow as InternalMarkRow) : null,
				})

				const learnerResult = {
					exam_registration_id: reg.id,
					student_id: reg.student_id,
					stu_register_no: reg.stu_register_no,
					student_name: reg.student_name,
					status: calc.errors.length > 0 ? 'error' : 'ok',
					total_internal_marks: calc.total_internal_marks,
					max_internal_marks: calc.max_internal_marks,
					breakdown: calc.breakdown,
					warnings: calc.warnings,
					errors: calc.errors,
				}

				if (calc.errors.length > 0) {
					totals.errors++
				} else if (mode === 'execute') {
					upsertBatch.push({
						existing_id: existing?.id || null,
						row: {
							institutions_id,
							examination_session_id,
							exam_registration_id: reg.id,
							course_offering_id: co.id,
							program_id: co.program_id,
							course_id: course?.id,
							student_id: reg.student_id,
							total_internal_marks: calc.total_internal_marks,
							max_internal_marks: calc.max_internal_marks,
							marks_status: 'Submitted',
							is_active: true,
							submission_date: new Date().toISOString().split('T')[0],
							submitted_by: created_by || null,
							created_by: created_by || null,
							updated_by: created_by || null,
						},
					})
				}

				learners.push(learnerResult)
			}

			results.push({
				course_offering_id: co.id,
				course_code: co.course_code,
				course_name: course?.course_name || co.course_code,
				program_code: co.program_code,
				semester: co.semester,
				course_internal_max: courseMax,
				learners,
				summary: {
					total: learners.length,
					ok: learners.filter(l => l.status === 'ok').length,
					errors: learners.filter(l => l.status === 'error').length,
					no_data: learners.filter(l => l.status === 'no_data').length,
				},
			})
		}

		// ─── 5. Execute upserts ───
		if (mode === 'execute' && upsertBatch.length > 0) {
			// Update existing rows; insert new ones
			const updates = upsertBatch.filter(u => u.existing_id)
			const inserts = upsertBatch.filter(u => !u.existing_id)

			for (const u of updates) {
				const { error } = await supabase
					.from('internal_marks')
					.update(u.row)
					.eq('id', u.existing_id)
				if (error) {
					console.error('update failed for', u.existing_id, error)
					totals.errors++
				} else {
					totals.upserted++
				}
			}

			if (inserts.length > 0) {
				// Batch insert in chunks of 500
				for (let i = 0; i < inserts.length; i += 500) {
					const chunk = inserts.slice(i, i + 500).map(u => u.row)
					const { error, count } = await supabase
						.from('internal_marks')
						.insert(chunk, { count: 'exact' })
					if (error) {
						console.error('insert chunk failed', error)
						totals.errors += chunk.length
					} else {
						totals.upserted += count || chunk.length
					}
				}
			}
		}

		return NextResponse.json({
			mode,
			rule: {
				id: rule.id,
				rule_name: rule.rule_name,
				wef_date: rule.wef_date,
				regulation_code: rule.regulation_code,
			},
			results,
			totals,
		})
	} catch (e: any) {
		console.error('generate-internal-marks POST exception', e)
		return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 })
	}
}

function hasAnyMark(r: InternalMarkRow): boolean {
	const fields: (keyof InternalMarkRow)[] = [
		'assignment_marks', 'quiz_marks', 'mid_term_marks', 'presentation_marks',
		'attendance_marks', 'lab_marks', 'project_marks', 'seminar_marks', 'viva_marks',
		'test_1_mark', 'test_2_mark', 'test_3_mark', 'other_marks',
	]
	return fields.some(f => Number(r[f] ?? 0) > 0)
}
