const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Missing Supabase credentials')
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testAttendanceCorrectionAPI() {
	console.log('🧪 Testing Attendance Correction API Query...\n')

	// Get a sample attendance record first
	const { data: sampleRecords, error: sampleError } = await supabase
		.from('exam_attendance')
		.select(`
			id,
			exam_registrations!inner (
				stu_register_no,
				course_code,
				student_name
			)
		`)
		.limit(1)

	if (sampleError || !sampleRecords || sampleRecords.length === 0) {
		console.log('❌ No attendance records found in database')
		console.log('Please add attendance records first before testing')
		process.exit(0)
	}

	const sample = sampleRecords[0]
	const registerNo = sample.exam_registrations.stu_register_no
	const courseCode = sample.exam_registrations.course_code

	console.log('📋 Sample Data Found:')
	console.log(`   Register No: ${registerNo}`)
	console.log(`   Course Code: ${courseCode}`)
	console.log(`   Student Name: ${sample.exam_registrations.student_name}\n`)

	// Test the actual query used in the API
	console.log('🔍 Testing API Query Pattern...\n')

	const { data: attendanceRecords, error: attendanceError } = await supabase
		.from('exam_attendance')
		.select(`
			id,
			exam_registration_id,
			attendance_status,
			status,
			remarks,
			exam_timetable_id,
			program_id,
			course_id,
			examination_session_id,
			updated_by,
			created_at,
			exam_registrations!inner (
				id,
				student_id,
				course_code,
				stu_register_no,
				student_name
			)
		`)
		.eq('exam_registrations.course_code', courseCode.trim())
		.ilike('exam_registrations.stu_register_no', registerNo.trim())
		.order('created_at', { ascending: false })
		.limit(1)

	if (attendanceError) {
		console.error('❌ Query Error:', attendanceError.message)
		console.error('Details:', attendanceError)
		process.exit(1)
	}

	if (!attendanceRecords || attendanceRecords.length === 0) {
		console.log('❌ No records found with the query')
		process.exit(1)
	}

	console.log('✅ Query Successful!\n')
	console.log('📊 Result Structure:')
	console.log(JSON.stringify(attendanceRecords[0], null, 2))

	// Test courses endpoint query
	console.log('\n\n🔍 Testing Courses Endpoint Query...\n')

	// Get a user with institution
	const { data: userData } = await supabase
		.from('users')
		.select('email, institution_id')
		.not('institution_id', 'is', null)
		.limit(1)
		.single()

	if (!userData) {
		console.log('⚠️ No users with institution found. Skipping courses test.')
		return
	}

	console.log(`   User Email: ${userData.email}`)
	console.log(`   Institution Code: ${userData.institution_id}\n`)

	// Get institution UUID
	const { data: institutionData } = await supabase
		.from('institutions')
		.select('id, institution_code')
		.eq('institution_code', userData.institution_id)
		.single()

	if (!institutionData) {
		console.log('⚠️ Institution not found')
		return
	}

	// Get unique course IDs
	const { data: courseIds, error: courseError } = await supabase
		.from('exam_attendance')
		.select('course_id')
		.eq('institutions_id', institutionData.id)

	if (courseError) {
		console.error('❌ Courses Query Error:', courseError.message)
		return
	}

	console.log(`✅ Found ${courseIds?.length || 0} attendance records for institution`)

	if (courseIds && courseIds.length > 0) {
		const uniqueCourseIds = [...new Set(courseIds.map(r => r.course_id).filter(Boolean))]
		console.log(`   Unique Courses: ${uniqueCourseIds.length}`)
	}
}

testAttendanceCorrectionAPI()
	.then(() => {
		console.log('\n✅ All tests completed successfully')
		process.exit(0)
	})
	.catch((error) => {
		console.error('\n❌ Test Error:', error)
		process.exit(1)
	})
