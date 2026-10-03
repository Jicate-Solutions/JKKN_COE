require('dotenv').config({ path: '.env' })
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
	const { data: c } = await s.from('courses').select('id, course_code, course_title, credit, result_type, course_category, course_type, part, regulation_code, institutions_id').in('course_code', ['25UDIM01', '24UCMNM2'])
	console.log(c)
	const { data: v, error } = await s.from('nad_abc_upload_view').select('student_id, examination_session_id, program_id, PROGRAM_CODE, SUBJECT_CODE, subject_order, subject_semester, credit, grade_points, is_regular_subject, ENROLLMENT_NUMBER').eq('SUBJECT_CODE', '25UDIM01').limit(50)
	console.log(error, v && v.length, v && v.slice(0, 5))
})()
