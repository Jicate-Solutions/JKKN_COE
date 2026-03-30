import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Fetch dummy numbers with filters (supports up to 100,000 records)
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const dummy_number = searchParams.get('dummy_number')
		const actual_register_number = searchParams.get('actual_register_number')
		const board_code = searchParams.get('board_code')
		const course_code = searchParams.get('course_code')
		const program_code = searchParams.get('program_code')

		// Fetch with pagination to handle large datasets
		const allData: any[] = []
		let offset = 0
		const limit = 1000
		const maxRecords = 100000
		let hasMore = true

		while (hasMore && allData.length < maxRecords) {
			let query = supabase
				.from('student_dummy_numbers')
				.select(`
					*,
					institution:institutions(id, institution_code, name),
					examination_session:examination_sessions(id, session_name, session_code),
					exam_registration:exam_registrations(
						id,
						stu_register_no,
						is_regular,
						student_name,
						course_offering:course_offerings(
							id,
							course_code,
							program_code,
							course:courses!course_offerings_course_id_fkey1(
								course_code,
								course_name,
								course_category,
								board_code,
								board:board!courses_board_id_fkey(
									board_code,
									board_order
								)
							)
						)
					)
				`)
				.eq('is_active', true)
				.order('roll_number_for_evaluation', { ascending: true })
				.range(offset, offset + limit - 1)

			if (institutions_id) {
				query = query.eq('institutions_id', institutions_id)
			}
			if (examination_session_id) {
				query = query.eq('examination_session_id', examination_session_id)
			}
			if (dummy_number) {
				query = query.eq('dummy_number', dummy_number)
			}
			if (actual_register_number) {
				query = query.eq('actual_register_number', actual_register_number)
			}

			const { data, error } = await query

			if (error) {
				console.error('Error fetching dummy numbers:', error)
				return NextResponse.json({ error: 'Failed to fetch dummy numbers' }, { status: 500 })
			}

			if (data && data.length > 0) {
				allData.push(...data)
			}

			hasMore = data && data.length === limit
			offset += limit

			// Safety check
			if (allData.length >= maxRecords) {
				console.warn(`⚠️ Reached maximum record limit of ${maxRecords}`)
				break
			}
		}

		let filteredData = allData

		// Apply client-side filters for related data
		if (board_code) {
			filteredData = filteredData.filter(item => {
				const course = item.exam_registration?.course_offering?.course
				return course?.board_code === board_code || course?.board?.board_code === board_code
			})
		}

		if (course_code) {
			const codes = course_code.split(',').filter(Boolean)
			const codeSet = new Set(codes)
			filteredData = filteredData.filter(item => {
				const courseCode = item.exam_registration?.course_offering?.course?.course_code
					|| item.exam_registration?.course_offering?.course_code
				return codeSet.has(courseCode)
			})
		}

		if (program_code) {
			filteredData = filteredData.filter(item =>
				item.exam_registration?.course_offering?.program_code === program_code
			)
		}

		return NextResponse.json({
			data: filteredData,
			count: filteredData.length
		})
	} catch (error) {
		console.error('Dummy numbers fetch error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE: Delete dummy numbers for a specific institution and session
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const id = searchParams.get('id')

		const supabase = getSupabaseServer()

		if (id) {
			// Delete a specific dummy number by ID
			const { error } = await supabase
				.from('student_dummy_numbers')
				.delete()
				.eq('id', id)

			if (error) {
				console.error('Error deleting dummy number:', error)
				return NextResponse.json({ error: 'Failed to delete dummy number' }, { status: 500 })
			}

			return NextResponse.json({ success: true, message: 'Dummy number deleted successfully' })
		}

		if (!institutions_id || !examination_session_id) {
			return NextResponse.json({
				error: 'Institution ID and Examination Session ID are required for bulk deletion'
			}, { status: 400 })
		}

		// Delete all dummy numbers for the institution and session
		const { error } = await supabase
			.from('student_dummy_numbers')
			.delete()
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)

		if (error) {
			console.error('Error deleting dummy numbers:', error)
			return NextResponse.json({ error: 'Failed to delete dummy numbers' }, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			message: 'All dummy numbers deleted successfully for the selected institution and session'
		})
	} catch (error) {
		console.error('Dummy number deletion error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
