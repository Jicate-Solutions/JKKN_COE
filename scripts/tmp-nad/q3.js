require('dotenv').config({ path: '.env', quiet: true })
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
	for (const sid of ['0033c926-735c-475d-8a17-cec98f8dc80f', 'ef26b784-ddf1-425e-b2f7-ca9a4597445b']) {
		const { data } = await s.from('nad_abc_upload_view').select('SUBJECT_CODE, subject_order, subject_semester, is_regular_subject, credit, grade_points, letter_grade, raw_pass_status').eq('student_id', sid).eq('examination_session_id', 'b97baedf-aebc-4b57-b675-6ef17defdc08')
		console.log(sid, data.map(d => `${d.subject_order}:${d.SUBJECT_CODE}:cr${d.credit}:gp${d.grade_points}:${d.raw_pass_status}`).join(' | '))
	}
	const { data: tpl } = await s.from('nad_abc_upload_view').select('student_id, SUBJECT_CODE, subject_order').eq('program_id', '08aaa386-7129-4f0c-a492-0619264ea018').eq('examination_session_id', 'b97baedf-aebc-4b57-b675-6ef17defdc08').range(0, 999)
	const per = {}
	for (const r of tpl) (per[r.student_id] ||= []).push(r.subject_order + ':' + r.SUBJECT_CODE)
	const sigs = {}
	for (const v of Object.values(per)) { const k = v.sort().join(','); sigs[k] = (sigs[k] || 0) + 1 }
	console.log(sigs)
})()
