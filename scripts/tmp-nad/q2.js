require('dotenv').config({ path: '.env', quiet: true })
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
	const { data: nm } = await s.from('nad_abc_upload_view').select('student_id, examination_session_id, program_id, PROGRAM_CODE, subject_order, subject_semester').eq('SUBJECT_CODE', '24UCMNM2').range(0, 999)
	const combos = {}
	for (const r of nm) { const k = r.examination_session_id + '|' + r.program_id + '|' + r.PROGRAM_CODE; combos[k] = (combos[k] || 0) + 1 }
	console.log('24UCMNM2 combos', combos)
	const progs = [...new Set(nm.map(r => r.program_id))]
	const sess = [...new Set(nm.map(r => r.examination_session_id))]
	const { data: dm } = await s.from('nad_abc_upload_view').select('student_id, examination_session_id, program_id, PROGRAM_CODE, subject_order, subject_semester, ENROLLMENT_NUMBER, STUDENT_NAME').eq('SUBJECT_CODE', '25UDIM01').in('program_id', progs).in('examination_session_id', sess)
	console.log('25UDIM01 in same', dm)
	const nmSet = new Set(nm.map(r => r.student_id))
	console.log('DM learners who also have NME:', dm.filter(r => nmSet.has(r.student_id)).length)
	if (dm.length) {
		const sid = dm[0].student_id
		const { data: all } = await s.from('nad_abc_upload_view').select('SUBJECT_CODE, SUBJECT_NAME, subject_order, subject_semester, is_regular_subject, credit, grade_points, letter_grade, raw_pass_status').eq('student_id', sid).eq('examination_session_id', dm[0].examination_session_id)
		console.log('DM learner subjects', all)
		const other = nm.find(r => r.program_id === dm[0].program_id && r.examination_session_id === dm[0].examination_session_id)
		const { data: all2 } = await s.from('nad_abc_upload_view').select('SUBJECT_CODE, SUBJECT_NAME, subject_order, subject_semester, is_regular_subject, credit').eq('student_id', other.student_id).eq('examination_session_id', other.examination_session_id)
		console.log('typical learner subjects', all2)
	}
})()
