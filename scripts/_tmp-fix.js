require('dotenv').config({ path: '.env' })
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const INST = '5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4'
const SESSION = 'a0702cf7-9943-4b2e-9e50-918110625cce'
const now = new Date().toISOString()
const today = now.split('T')[0]
const EXT_MAX = 75
const TOTAL_MAX = 100

const targets = [
	{ reg: '24JUGCHE003', rrId: 'aa29f013-9e66-49af-9850-1d4f9881d0cb', fmId: 'f7b6069b-02ad-48d9-9104-63400e38611a', erId: '8627e1b6-2b2e-4430-b497-1b5dee885037', coId: '6627fd0c-4c8b-419b-8100-368e5e7ff466', courseId: 'eb93462e-f59c-48fb-94b0-5e6d8b86ac03', stuId: '0ef57be0-4446-4f9e-afb6-bb6a5664b120', imId: '96e5b674-c06f-4337-935c-38ddd10a92c1', prog: 'UCH', credit: 2, newExt: 30 },
	{ reg: '24JUGCHE004', rrId: 'bc4c89fc-fea7-4c93-b1cc-4fcb0e6a91be', fmId: 'f40bbd4f-47bc-468c-a4f1-b34910dba748', erId: 'ff377c59-001e-4966-9e41-b8da98b97bcc', coId: '6627fd0c-4c8b-419b-8100-368e5e7ff466', courseId: 'eb93462e-f59c-48fb-94b0-5e6d8b86ac03', stuId: '5a708ee6-203f-40f3-b4e7-2f8215398637', imId: '954f047d-2a1b-47c7-ab11-a131fa8189ff', prog: 'UCH', credit: 2, newExt: 24 },
	{ reg: '24JUGMIC001', rrId: 'ec60bc06-4d9f-4765-ae7e-a338a7587466', fmId: '559a9daf-2935-44a7-be83-3e52d05948bb', erId: '40398599-12f6-4b34-9a2e-805b91f29cff', coId: '125f37eb-61ff-4b31-ace6-fdcb84cf57b1', courseId: 'd35506a1-73be-4866-a38d-0c0dacbd6859', stuId: '1059cdee-6b9e-46e9-afa7-7057680e9baa', imId: '8f8f4b84-81d4-42e7-9312-ef9094d4d0e9', prog: 'UMB', credit: 5, newExt: 38 },
]

;(async () => {
	// A. Keerthika: backlog attempt_count 5/5 blocked the re-publish trigger.
	// Real attempts for 24UZONM2 = NOV-DEC-2024 + APRIL-MAY-2025 arrear = 2.
	console.log('--- A. fix backlog + re-publish 24JUGCHE004')
	const { data: blBefore } = await sb.from('student_backlogs').select('id, attempt_count, max_attempts_allowed, is_cleared, last_attempt_session_id').eq('id', 'a38f9be9-b1eb-49a4-93ff-72052cba08b8').single()
	console.log('backlog before:', JSON.stringify(blBefore))
	const { error: blErr } = await sb.from('student_backlogs').update({ attempt_count: 2, updated_at: now }).eq('id', 'a38f9be9-b1eb-49a4-93ff-72052cba08b8')
	if (blErr) console.log('backlog fix failed:', blErr.message)
	const { error: pubErr } = await sb.from('final_marks').update({ result_status: 'Published', updated_at: now }).eq('id', 'f40bbd4f-47bc-468c-a4f1-b34910dba748')
	console.log(pubErr ? 'RE-PUBLISH FAILED: ' + pubErr.message : 're-published OK')
	const { data: blAfter } = await sb.from('student_backlogs').select('id, attempt_count, max_attempts_allowed, is_cleared, last_attempt_session_id, updated_at').eq('id', 'a38f9be9-b1eb-49a4-93ff-72052cba08b8').single()
	console.log('backlog after:', JSON.stringify(blAfter))

	// B. revaluation_marks + revaluation_final_marks (live tables have no institution_code)
	console.log('\n--- B. revaluation mark records')
	for (const t of targets) {
		const { data: fm } = await sb.from('final_marks').select('internal_marks_obtained, total_marks_obtained, percentage, letter_grade, grade_points, grade_description, total_grade_points, is_pass, pass_status, original_total_marks_obtained, original_percentage, original_letter_grade, grace_marks').eq('id', t.fmId).single()
		const { data: rm, error: rmErr } = await sb.from('revaluation_marks').insert({
			institutions_id: INST, examination_session_id: SESSION,
			revaluation_registration_id: t.rrId, exam_registration_id: t.erId, course_id: t.courseId,
			dummy_number: t.reg, total_marks_obtained: t.newExt, marks_out_of: EXT_MAX,
			evaluation_date: today, entry_status: 'Verified', submitted_at: now, verified_at: now, locked_at: now,
			program_code: t.prog, is_active: true,
		}).select('id').single()
		console.log(t.reg, 'revaluation_marks:', rmErr ? 'FAILED ' + rmErr.message : rm.id)
		const pct = Number(fm.percentage)
		const { error: rfmErr } = await sb.from('revaluation_final_marks').insert({
			institutions_id: INST, examination_session_id: SESSION,
			revaluation_registration_id: t.rrId, exam_registration_id: t.erId, course_offering_id: t.coId, course_id: t.courseId, student_id: t.stuId,
			internal_marks_id: t.imId, revaluation_marks_id: rm ? rm.id : null, original_final_marks_id: t.fmId,
			internal_marks_obtained: fm.internal_marks_obtained, internal_marks_maximum: 25,
			external_marks_obtained: t.newExt, external_marks_maximum: EXT_MAX,
			total_marks_obtained: fm.total_marks_obtained, total_marks_maximum: TOTAL_MAX, percentage: pct,
			grace_marks: fm.grace_marks || 0, letter_grade: fm.letter_grade, grade_points: fm.grade_points, grade_description: fm.grade_description, credit: t.credit, total_grade_points: fm.total_grade_points,
			is_pass: fm.is_pass, is_distinction: pct >= 75, is_first_class: pct >= 60, pass_status: fm.pass_status,
			original_marks_obtained: fm.original_total_marks_obtained, original_percentage: fm.original_percentage, original_grade: fm.original_letter_grade,
			marks_difference: Number(fm.total_marks_obtained) - Number(fm.original_total_marks_obtained), percentage_difference: pct - Number(fm.original_percentage),
			is_better_than_original: Number(fm.total_marks_obtained) > Number(fm.original_total_marks_obtained),
			result_status: 'Published', published_date: today, is_locked: true, locked_date: today,
			remarks: 'Revaluation marks used', calculated_at: now, is_active: true,
		})
		console.log(t.reg, 'revaluation_final_marks:', rfmErr ? 'FAILED ' + rfmErr.message : 'inserted')
	}

	console.log('\n--- VERIFY final_marks')
	const { data: v } = await sb.from('final_marks').select('register_number, internal_marks_obtained, external_marks_obtained, total_marks_obtained, letter_grade, grade_points, pass_status, result_status, is_revaluation_applied, original_external_marks_obtained, original_pass_status').in('id', targets.map(t => t.fmId))
	console.table(v)
})()
