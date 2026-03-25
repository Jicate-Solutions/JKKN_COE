const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Missing Supabase credentials')
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testInstitutionFetch() {
	console.log('🧪 Testing Institution Fetch for Attendance Correction...\n')

	// Get a user with institution
	const { data: userData, error: userError } = await supabase
		.from('users')
		.select('email, institution_id')
		.not('institution_id', 'is', null)
		.limit(1)
		.single()

	if (userError || !userData) {
		console.error('❌ No users with institution found')
		process.exit(1)
	}

	console.log('📋 User Data:')
	console.log(`   Email: ${userData.email}`)
	console.log(`   Institution ID: ${userData.institution_id}`)
	console.log(`   Type: ${typeof userData.institution_id}\n`)

	// Verify this is a valid UUID in institutions table
	const { data: institutionData, error: institutionError } = await supabase
		.from('institutions')
		.select('id, institution_code, name')
		.eq('id', userData.institution_id)
		.single()

	if (institutionError || !institutionData) {
		console.error('❌ Institution not found for this UUID:', institutionError)
		process.exit(1)
	}

	console.log('✅ Institution Found:')
	console.log(`   ID: ${institutionData.id}`)
	console.log(`   Code: ${institutionData.institution_code}`)
	console.log(`   Name: ${institutionData.name}\n`)

	// Test the courses endpoint query
	console.log('🔍 Testing Courses Query...\n')

	const { data: attendanceRecords, error: attendanceError } = await supabase
		.from('exam_attendance')
		.select('course_id')
		.eq('institutions_id', userData.institution_id)

	if (attendanceError) {
		console.error('❌ Error fetching attendance records:', attendanceError.message)
		process.exit(1)
	}

	console.log(`✅ Found ${attendanceRecords?.length || 0} attendance records for this institution`)

	if (attendanceRecords && attendanceRecords.length > 0) {
		const uniqueCourseIds = [...new Set(attendanceRecords.map(r => r.course_id).filter(Boolean))]
		console.log(`   Unique Courses: ${uniqueCourseIds.length}\n`)

		// Fetch a sample course
		if (uniqueCourseIds.length > 0) {
			const { data: courseData } = await supabase
				.from('courses')
				.select('id, course_code, course_name')
				.eq('id', uniqueCourseIds[0])
				.single()

			if (courseData) {
				console.log('📚 Sample Course:')
				console.log(`   Code: ${courseData.course_code}`)
				console.log(`   Name: ${courseData.course_name}`)
			}
		}
	} else {
		console.log('⚠️ No attendance records found for this institution')
		console.log('   Please ensure attendance has been marked for some courses')
	}

	// Test the full API flow simulation
	console.log('\n\n🔍 Simulating Full API Flow...\n')

	console.log('Step 1: Fetch user institution_id')
	console.log(`   ✅ institution_id = ${userData.institution_id}`)

	console.log('\nStep 2: Query exam_attendance with institutions_id')
	console.log(`   ✅ Found ${attendanceRecords?.length || 0} records`)

	console.log('\nStep 3: Extract unique course IDs')
	const uniqueCourseIds = [...new Set(
		attendanceRecords?.map(record => record.course_id).filter(Boolean)
	)]
	console.log(`   ✅ Found ${uniqueCourseIds.length} unique courses`)

	console.log('\nStep 4: Fetch course details')
	const coursesPromises = uniqueCourseIds.slice(0, 3).map(async (courseId) => {
		const { data } = await supabase
			.from('courses')
			.select('id, course_code, course_name')
			.eq('id', courseId)
			.single()
		return data
	})

	const courses = (await Promise.all(coursesPromises)).filter(Boolean)
	console.log(`   ✅ Successfully fetched ${courses.length} course details`)

	if (courses.length > 0) {
		console.log('\n📊 Sample Courses:')
		courses.forEach((course, idx) => {
			console.log(`   ${idx + 1}. ${course.course_code} - ${course.course_name}`)
		})
	}
}

testInstitutionFetch()
	.then(() => {
		console.log('\n\n✅ All tests passed! Institution fetch is working correctly.')
		process.exit(0)
	})
	.catch((error) => {
		console.error('\n❌ Test Error:', error)
		process.exit(1)
	})
