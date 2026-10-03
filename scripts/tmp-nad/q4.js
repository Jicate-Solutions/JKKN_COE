require('dotenv').config({ path: '.env', quiet: true })
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
	const { data, error } = await s.from('courses').select('*').in('course_code', ['24UCMNM2', '24UCHNM2', '25UDIM01'])
	console.log(error, data)
	const { data: cm } = await s.from('course_mapping').select('course_code, program_code, course_order, semester_code, course_category, course_group').in('course_code', ['24UCMNM2', '24UCHNM2']).limit(20)
	console.log(cm)
})()
