const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Missing Supabase credentials')
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkTableStructures() {
	console.log('🔍 Checking table structures for attendance correction...\n')

	// Check exam_attendance table structure
	console.log('📋 EXAM_ATTENDANCE TABLE:')
	const { data: examAttendanceData, error: examAttendanceError } = await supabase
		.from('exam_attendance')
		.select('*')
		.limit(1)

	if (examAttendanceError) {
		console.error('Error:', examAttendanceError.message)
	} else {
		console.log('Columns:', examAttendanceData.length > 0 ? Object.keys(examAttendanceData[0]) : 'No data')
	}

	// Check exam_registrations table structure
	console.log('\n📋 EXAM_REGISTRATIONS TABLE:')
	const { data: examRegData, error: examRegError } = await supabase
		.from('exam_registrations')
		.select('*')
		.limit(1)

	if (examRegError) {
		console.error('Error:', examRegError.message)
	} else {
		console.log('Columns:', examRegData.length > 0 ? Object.keys(examRegData[0]) : 'No data')
	}

	// Check students table structure
	console.log('\n📋 STUDENTS TABLE:')
	const { data: studentsData, error: studentsError } = await supabase
		.from('students')
		.select('*')
		.limit(1)

	if (studentsError) {
		console.error('Error:', studentsError.message)
	} else {
		console.log('Columns:', studentsData.length > 0 ? Object.keys(studentsData[0]) : 'No data')
	}

	// Check courses table structure
	console.log('\n📋 COURSES TABLE:')
	const { data: coursesData, error: coursesError } = await supabase
		.from('courses')
		.select('*')
		.limit(1)

	if (coursesError) {
		console.error('Error:', coursesError.message)
	} else {
		console.log('Columns:', coursesData.length > 0 ? Object.keys(coursesData[0]) : 'No data')
	}

	// Test the actual query used in attendance-correction
	console.log('\n\n🔍 Testing attendance correction query...')
	console.log('Looking for student with stu_register_no and course_code...\n')

	const { data: testData, error: testError } = await supabase
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
		.limit(1)

	if (testError) {
		console.error('❌ Query Error:', testError.message)
	} else {
		console.log('✅ Query successful!')
		if (testData.length > 0) {
			console.log('Sample record structure:')
			console.log(JSON.stringify(testData[0], null, 2))
		} else {
			console.log('No attendance records found in database')
		}
	}
}

checkTableStructures()
	.then(() => {
		console.log('\n✅ Table structure check complete')
		process.exit(0)
	})
	.catch((error) => {
		console.error('\n❌ Error:', error)
		process.exit(1)
	})
