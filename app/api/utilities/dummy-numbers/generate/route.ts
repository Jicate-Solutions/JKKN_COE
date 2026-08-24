import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { ACTIVE_REGISTRATION_STATUSES } from '@/lib/exam-registration-status'

// Helper function to shuffle array
function shuffleArray<T>(array: T[]): T[] {
	const shuffled = [...array]
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
	}
	return shuffled
}

// Helper function to generate dummy number from format
function generateDummyNumber(format: string, index: number, startFrom: number): string {
	const number = startFrom + index
	// Replace {N} with the number, padding with zeros if needed
	// Format examples: "DN{N:4}" -> "DN0001", "DUMMY-{N:5}" -> "DUMMY-00001"
	const match = format.match(/\{N:?(\d+)?\}/)
	if (match) {
		const padding = match[1] ? parseInt(match[1]) : 0
		const paddedNumber = String(number).padStart(padding, '0')
		return format.replace(/\{N:?\d*\}/, paddedNumber)
	}
	// If no format pattern, just append the number
	return `${format}${number}`
}

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Validate required fields
		const {
			institutions_id,
			examination_session_id,
			source_mode, // 'attendance' or 'registration'
			generation_mode, // 'sequence' or 'shuffle'
			dummy_number_format, // e.g., "DN{N:4}" or "DUMMY-{N:5}"
			start_from, // Starting number, e.g., 1, 100, 1000
			generated_by, // User ID
			board_code, // Optional filter
			course_code, // Optional filter (single, legacy)
			course_codes, // Optional filter (array, multi-select)
			program_code, // Optional filter
			course_category, // Optional filter (single, legacy)
			course_categories, // Optional filter (array, multi-select)
			preview_only // If true, return preview without inserting
		} = body

		// Support both single and multiple course_categories
		const categoryFilter: string[] = course_categories?.length > 0
			? course_categories
			: course_category ? [course_category] : []

		// Support both single course_code and multiple course_codes
		const courseCodeFilter: string[] = course_codes?.length > 0
			? course_codes
			: course_code ? [course_code] : []

		if (!institutions_id) {
			return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
		}
		if (!examination_session_id) {
			return NextResponse.json({ error: 'Examination session ID is required' }, { status: 400 })
		}
		if (!source_mode || !['attendance', 'registration'].includes(source_mode)) {
			return NextResponse.json({ error: 'Invalid source mode. Must be "attendance" or "registration"' }, { status: 400 })
		}
		if (!generation_mode || !['sequence', 'shuffle'].includes(generation_mode)) {
			return NextResponse.json({ error: 'Invalid generation mode. Must be "sequence" or "shuffle"' }, { status: 400 })
		}
		if (!dummy_number_format) {
			return NextResponse.json({ error: 'Dummy number format is required' }, { status: 400 })
		}

		const startNumber = start_from || 1

		console.log('🎲 Generating dummy numbers:', {
			institutions_id,
			examination_session_id,
			source_mode,
			generation_mode,
			dummy_number_format,
			start_from: startNumber,
			filters: { board_code, course_codes: courseCodeFilter, program_code }
		})

		// Pre-resolve course_offering IDs for filters (query-level filtering instead of client-side)
		let allowedOfferingIds: Set<string> | null = null
		if (courseCodeFilter.length > 0 || board_code || program_code || categoryFilter.length > 0) {
			let coQuery = supabase
				.from('course_offerings')
				.select(`
					id,
					course_code,
					program_code,
					course:courses!course_offerings_course_id_fkey1 (
						board_code,
						course_category
					)
				`)
				.eq('institutions_id', institutions_id)
				.eq('examination_session_id', examination_session_id)

			if (courseCodeFilter.length > 0) {
				if (courseCodeFilter.length === 1) {
					coQuery = coQuery.eq('course_code', courseCodeFilter[0])
				} else {
					coQuery = coQuery.in('course_code', courseCodeFilter)
				}
			}
			if (program_code) {
				coQuery = coQuery.eq('program_code', program_code)
			}

			// Retry on transient network errors (ECONNRESET / fetch failed)
			let filteredOfferings: any[] | null = null
			let coError: any = null
			for (let attempt = 1; attempt <= 3; attempt++) {
				const result = await coQuery.range(0, 9999)
				filteredOfferings = result.data
				coError = result.error
				if (!coError) break
				const msg = String(coError?.message || coError?.details || '')
				const isTransient = /ECONNRESET|fetch failed|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(msg)
				if (!isTransient || attempt === 3) break
				console.warn(`⚠️ Transient error pre-filtering course offerings (attempt ${attempt}/3): ${msg}. Retrying...`)
				await new Promise(r => setTimeout(r, 500 * attempt))
			}
			if (coError) {
				console.error('Error pre-filtering course offerings:', coError)
				return NextResponse.json({
					error: 'Failed to filter course offerings. This may be a temporary network issue — please try again.'
				}, { status: 503 })
			}

			// Apply board + category filter (needs client-side since they're on the joined courses table)
			let offerings = filteredOfferings || []
			if (board_code) {
				offerings = offerings.filter((co: any) => co.course?.board_code === board_code)
			}
			if (categoryFilter.length > 0) {
				const catSet = new Set(categoryFilter)
				offerings = offerings.filter((co: any) => catSet.has(co.course?.course_category))
			}

			allowedOfferingIds = new Set(offerings.map((co: any) => co.id))
			console.log(`📋 Pre-filtered to ${allowedOfferingIds.size} course offerings matching filters`)

			if (allowedOfferingIds.size === 0) {
				return NextResponse.json({
					error: 'No course offerings match the selected filters'
				}, { status: 400 })
			}
		}

		// Step 1: Fetch students based on source mode with filters
		let studentsData: any[] = []

		if (source_mode === 'attendance') {
			// Fetch from exam_attendance (Present students only, Theory papers only)
			// Support up to 100,000 records with efficient pagination
			const allData: any[] = []
			let offset = 0
			const limit = 1000 // Match Supabase default row limit per request
			const maxRecords = 100000 // Safety limit
			let hasMore = true

			while (hasMore && allData.length < maxRecords) {
				// Simplified query using relationship aliases (PostgREST auto-discovers FKs)
				let query = supabase
					.from('exam_attendance')
					.select(`
						id,
						exam_registration_id,
						exam_timetable_id,
						student_id,
						attendance_status,
						exam_registration:exam_registrations (
							id,
							stu_register_no,
							is_regular,
							student_name,
							course_offering_id
						)
					`)
					.eq('institutions_id', institutions_id)
					.eq('examination_session_id', examination_session_id)
					.eq('attendance_status', 'Present')
					.range(offset, offset + limit - 1)

				const { data, error } = await query

				if (error) {
					console.error('Error fetching attendance data:', error)
					return NextResponse.json({ error: 'Failed to fetch attendance data: ' + error.message }, { status: 500 })
				}

				if (data && data.length > 0) {
					allData.push(...data)
					console.log(`📥 Fetched batch: ${data.length} records (offset: ${offset}, total: ${allData.length})`)
				}

				hasMore = data && data.length === limit
				offset += limit

				// Safety check
				if (allData.length >= maxRecords) {
					console.warn(`⚠️ Reached maximum record limit of ${maxRecords}`)
					break
				}
			}

			console.log(`📊 Total attendance records fetched: ${allData.length}`)

			// Get unique course_offering_ids to fetch course and program details
			const courseOfferingIds = [...new Set(allData.map(att => att.exam_registration?.course_offering_id).filter(Boolean))]

			// Fetch course offerings with nested details
			let courseOfferingMap = new Map<string, any>()
			if (courseOfferingIds.length > 0) {
				console.log(`📊 Fetching details for ${courseOfferingIds.length} course offerings...`)
				// Batch in chunks of 50 to avoid HeadersOverflow with large .in() queries
				const batchSize = 50
				for (let i = 0; i < courseOfferingIds.length; i += batchSize) {
					const batch = courseOfferingIds.slice(i, i + batchSize)
					const { data: offerings, error: offeringsError } = await supabase
						.from('course_offerings')
						.select(`
							id,
							course_code,
							program_code,
							program_id,
							course_id,
							semester,
							course_mapping:course_mapping!course_offerings_course_mapping_id_fkey (
								course_order
							),
							course:courses!course_offerings_course_id_fkey1 (
								course_code,
								course_name,
								course_type,
								course_category,
								board_code,
								board:board!courses_board_id_fkey (
									board_code,
									board_order
								)
							)
						`)
						.in('id', batch)

					if (offeringsError) {
						console.error(`Error fetching course offerings batch ${i / batchSize + 1}:`, offeringsError)
					} else if (offerings) {
						offerings.forEach((co: any) => {
							courseOfferingMap.set(co.id, co)
						})
					}
				}
				console.log(`✅ Loaded ${courseOfferingMap.size} course offering details`)
			}

			// Transform attendance data with enriched course offering details
			studentsData = allData.map((att: any) => {
				const reg = att.exam_registration
				const courseOfferingId = reg?.course_offering_id
				const courseOffering = courseOfferingMap.get(courseOfferingId)
				const course = courseOffering?.course
				const board = course?.board
				const courseOrder = courseOffering?.course_mapping?.course_order
				const program = courseOffering ? { program_code: courseOffering.program_code } : null

				return {
					id: att.id,
					exam_registration_id: att.exam_registration_id,
					exam_timetable_id: att.exam_timetable_id,
					student_id: att.student_id,
					attendance_status: att.attendance_status,
					exam_registration: reg ? {
						id: reg.id,
						stu_register_no: reg.stu_register_no,
						is_regular: reg.is_regular,
						student_name: reg.student_name,
						course_offering: courseOffering ? {
							id: courseOffering.id,
							course_code: courseOffering.course_code,
							program_id: courseOffering.program_id,
							course_order: courseOrder,
							semester: courseOffering.semester ?? null,
							course: course ? {
								course_code: course.course_code,
								course_name: course.course_name,
								course_type: course.course_type,
								course_category: course.course_category,
								board_code: course.board_code,
								board: board
							} : null,
							program: program
						} : null
					} : null,
					student: { student_name: reg?.student_name }
				}
			})
		} else {
			// Fetch from exam_registrations (All approved students, Theory papers only)
			// Support up to 100,000 records with efficient pagination
			const allData: any[] = []
			let offset = 0
			const limit = 1000 // Match Supabase default row limit per request
			const maxRecords = 100000 // Safety limit
			let hasMore = true

			while (hasMore && allData.length < maxRecords) {
				// Simplified query using relationship aliases
				let query = supabase
					.from('exam_registrations')
					.select(`
						id,
						stu_register_no,
						is_regular,
						student_id,
						student_name,
						course_offering_id
					`)
					.eq('institutions_id', institutions_id)
					.eq('examination_session_id', examination_session_id)
					.in('registration_status', ACTIVE_REGISTRATION_STATUSES)

				// Pre-filter by allowed course_offering IDs (query-level, max 100 to avoid header overflow)
				if (allowedOfferingIds && allowedOfferingIds.size <= 100) {
					query = query.in('course_offering_id', [...allowedOfferingIds])
				}

				query = query.range(offset, offset + limit - 1)

				const { data, error } = await query

				if (error) {
					console.error('Error fetching registration data:', error)
					return NextResponse.json({ error: 'Failed to fetch registration data: ' + error.message }, { status: 500 })
				}

				if (data && data.length > 0) {
					allData.push(...data)
					console.log(`📥 Fetched batch: ${data.length} records (offset: ${offset}, total: ${allData.length})`)
				}

				hasMore = data && data.length === limit
				offset += limit

				// Safety check
				if (allData.length >= maxRecords) {
					console.warn(`⚠️ Reached maximum record limit of ${maxRecords}`)
					break
				}
			}

			console.log(`📊 Total registrations fetched: ${allData.length}`)

			if (!allData || allData.length === 0) {
				return NextResponse.json({
					error: 'No approved registrations found for the selected institution and session'
				}, { status: 400 })
			}

			// Get unique course_offering_ids to fetch course and program details
			const courseOfferingIds = [...new Set(allData.map(reg => reg.course_offering_id).filter(Boolean))]

			// Fetch course offerings with nested details
			let courseOfferingMap = new Map<string, any>()
			if (courseOfferingIds.length > 0) {
				console.log(`📊 Fetching details for ${courseOfferingIds.length} course offerings...`)
				// Batch in chunks of 50 to avoid HeadersOverflow with large .in() queries
				const batchSize = 50
				for (let i = 0; i < courseOfferingIds.length; i += batchSize) {
					const batch = courseOfferingIds.slice(i, i + batchSize)
					const { data: offerings, error: offeringsError } = await supabase
						.from('course_offerings')
						.select(`
							id,
							course_code,
							program_code,
							program_id,
							course_id,
							semester,
							course_mapping:course_mapping!course_offerings_course_mapping_id_fkey (
								course_order
							),
							course:courses!course_offerings_course_id_fkey1 (
								course_code,
								course_name,
								course_type,
								course_category,
								board_code,
								board:board!courses_board_id_fkey (
									board_code,
									board_order
								)
							)
						`)
						.in('id', batch)

					if (offeringsError) {
						console.error(`Error fetching course offerings batch ${i / batchSize + 1}:`, offeringsError)
					} else if (offerings) {
						offerings.forEach((co: any) => {
							courseOfferingMap.set(co.id, co)
						})
					}
				}
				console.log(`✅ Loaded ${courseOfferingMap.size} course offering details`)
			}

			// Transform registration data with enriched course offering details
			studentsData = allData.map((reg: any) => {
				const courseOfferingId = reg.course_offering_id
				const courseOffering = courseOfferingMap.get(courseOfferingId)
				const course = courseOffering?.course
				const board = course?.board
				const courseOrder = courseOffering?.course_mapping?.course_order
				const program = courseOffering ? { program_code: courseOffering.program_code } : null

				return {
					exam_registration_id: reg.id,
					exam_timetable_id: null,
					student_id: reg.student_id,
					exam_registration: {
						id: reg.id,
						stu_register_no: reg.stu_register_no,
						is_regular: reg.is_regular,
						student_name: reg.student_name,
						course_offering: courseOffering ? {
							id: courseOffering.id,
							course_code: courseOffering.course_code,
							program_id: courseOffering.program_id,
							course_order: courseOrder,
							semester: courseOffering.semester ?? null,
							course: course ? {
								course_code: course.course_code,
								course_name: course.course_name,
								course_type: course.course_type,
								course_category: course.course_category,
								board_code: course.board_code,
								board: board
							} : null,
							program: program
						} : null
					},
					student: { student_name: reg.student_name }
				}
			})
		}

		// Debug: Log course categories before filtering
		const categoryCounts: Record<string, number> = {}
		studentsData.forEach((student) => {
			const courseCategory = student.exam_registration?.course_offering?.course?.course_category
			const category = courseCategory || 'null/undefined'
			categoryCounts[category] = (categoryCounts[category] || 0) + 1
		})
		console.log('📊 Course category distribution:', categoryCounts)

		// Enrich with program_order from MyJKKN API (same pattern as exam-registration-reports)
		const programOrderMap = new Map<string, number>()
		const { data: inst } = await supabase
			.from('institutions')
			.select('myjkkn_institution_ids')
			.eq('id', institutions_id)
			.single()
		const myjkknIds: string[] = inst?.myjkkn_institution_ids || []
		console.log(`📋 MyJKKN institution IDs: ${JSON.stringify(myjkknIds)}`)
		if (myjkknIds.length > 0) {
			const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
			const myjkknApiKey = process.env.MYJKKN_API_KEY || ''
			console.log(`📋 MyJKKN API URL: ${myjkknApiUrl}, API key present: ${!!myjkknApiKey}`)
			if (myjkknApiKey) {
				try {
					for (const myjkknInstId of myjkknIds) {
						let pg = 1
						let hasMorePages = true
						while (hasMorePages) {
							const res = await fetch(
								`${myjkknApiUrl}/api-management/organizations/programs?institution_id=${myjkknInstId}&limit=200&page=${pg}`,
								{
									method: 'GET',
									headers: {
										'Authorization': `Bearer ${myjkknApiKey}`,
										'Accept': 'application/json',
										'Content-Type': 'application/json',
									},
									cache: 'no-store',
								}
							)
							if (res.ok) {
								const data = await res.json()
								const programs = data.data || data || []
								if (pg === 1) console.log(`📋 MyJKKN programs page 1: ${programs.length} programs, sample: ${programs[0]?.program_id || 'none'}`)
								for (const p of programs) {
									const code = p.program_id || p.program_code || ''
									if (code && !programOrderMap.has(code)) {
										programOrderMap.set(code, p.program_order ?? p.sort_order ?? 999)
									}
								}
								hasMorePages = programs.length === 200
								pg++
							} else {
								console.log(`📋 MyJKKN API error: ${res.status} ${res.statusText}`)
								hasMorePages = false
							}
						}
					}
					console.log(`📋 Loaded program_order for ${programOrderMap.size} programs from MyJKKN API`)
					if (programOrderMap.size === 0) {
						console.warn('⚠️ No programs returned from MyJKKN - check MYJKKN_API_KEY env var')
					}
				} catch (e) {
					console.error('Error fetching program_order from MyJKKN:', e)
				}
			}
		}
		// Attach program_order to each student's program
		for (const s of studentsData) {
			const prog = s.exam_registration?.course_offering?.program
			if (prog?.program_code) {
				prog.program_order = programOrderMap.get(prog.program_code) ?? 999
			}
			// Also attach semester from course_offering enrichment
			const co = s.exam_registration?.course_offering
			if (co && co.semester === undefined) {
				// semester should already be there from the enrichment, but ensure it's accessible
			}
		}

		// Apply client-side filtering by allowedOfferingIds (fallback for large sets or attendance mode)
		if (allowedOfferingIds && allowedOfferingIds.size > 100) {
			const before = studentsData.length
			studentsData = studentsData.filter((student) => {
				const coId = student.exam_registration?.course_offering?.id
				return coId && allowedOfferingIds!.has(coId)
			})
			console.log(`📋 Client-side filtered by ${allowedOfferingIds.size} allowed offerings: ${before} → ${studentsData.length}`)
		} else if (source_mode === 'attendance' && allowedOfferingIds) {
			// Attendance mode always needs client-side filter (can't use .in() on nested relation)
			const before = studentsData.length
			studentsData = studentsData.filter((student) => {
				const coId = student.exam_registration?.course_offering?.id
				return coId && allowedOfferingIds!.has(coId)
			})
			console.log(`📋 Attendance filtered by allowed offerings: ${before} → ${studentsData.length}`)
		}

		if (studentsData.length === 0) {
			return NextResponse.json({
				error: `No students found matching the criteria in the selected ${source_mode === 'attendance' ? 'attendance records' : 'registrations'}`
			}, { status: 400 })
		}

		console.log(`📋 Final filtered count: ${studentsData.length} students`)

		// Step 2: Sort students by program_order -> semester -> course_order -> stu_register_no -> is_regular
		// Order: Program → Semester → Course Order → Register Number → Type (Regular first)
		const sortedStudents = studentsData.sort((a, b) => {
			const aCO = a.exam_registration?.course_offering
			const bCO = b.exam_registration?.course_offering

			// 1. Board order
			const aBoardOrder = aCO?.course?.board?.board_order ?? 999
			const bBoardOrder = bCO?.course?.board?.board_order ?? 999
			if (aBoardOrder !== bBoardOrder) return aBoardOrder - bBoardOrder

			// 2. Semester
			const aSemester = aCO?.semester ?? 999
			const bSemester = bCO?.semester ?? 999
			if (aSemester !== bSemester) return aSemester - bSemester

			// 3. Course order
			const aCourseOrder = aCO?.course_order ?? 999
			const bCourseOrder = bCO?.course_order ?? 999
			if (aCourseOrder !== bCourseOrder) return aCourseOrder - bCourseOrder

			// 4. Program order (within same course, sort by program)
			const aProgramOrder = aCO?.program?.program_order ?? 999
			const bProgramOrder = bCO?.program?.program_order ?? 999
			if (aProgramOrder !== bProgramOrder) return aProgramOrder - bProgramOrder

			// 5. Regular students first
			const aRegular = a.exam_registration?.is_regular ?? false
			const bRegular = b.exam_registration?.is_regular ?? false
			if (aRegular !== bRegular) return bRegular ? 1 : -1

			// 6. Student register number (ASC)
			const aRegNo = a.exam_registration?.stu_register_no || ''
			const bRegNo = b.exam_registration?.stu_register_no || ''
			return aRegNo.localeCompare(bRegNo)
		})

		console.log('✅ Sorted: board_order -> semester -> course_order -> program_order -> is_regular DESC -> stu_register_no ASC')

		// Step 3: Apply shuffle if needed
		const finalStudents = generation_mode === 'shuffle' ? shuffleArray(sortedStudents) : sortedStudents

		console.log(`🎲 Generation mode: ${generation_mode}`)

		// Preview mode: return data without inserting
		if (preview_only) {
			const preview = finalStudents.map((s: any, i: number) => ({
				roll: i + 1,
				dummy_number: generateDummyNumber(dummy_number_format, i, startNumber),
				register_no: s.exam_registration?.stu_register_no || 'N/A',
				student_name: s.exam_registration?.student_name || s.student?.student_name || '-',
				board: s.exam_registration?.course_offering?.course?.board?.board_code || '-',
				program: s.exam_registration?.course_offering?.program?.program_code || '-',
				course: s.exam_registration?.course_offering?.course?.course_code || s.exam_registration?.course_offering?.course_code || '-',
				type: s.exam_registration?.is_regular ? 'Regular' : 'Arrear',
			}))

			return NextResponse.json({
				preview,
				count: finalStudents.length,
				message: `Preview: ${finalStudents.length} students will receive dummy numbers`,
			})
		}

		// Step 4: Generate dummy numbers
		const dummyNumberRecords = finalStudents.map((student, index) => {
			const dummyNumber = generateDummyNumber(dummy_number_format, index, startNumber)

			const record: any = {
				institutions_id,
				examination_session_id,
				exam_registration_id: student.exam_registration_id,
				exam_timetable_id: student.exam_timetable_id,
				dummy_number: dummyNumber,
				actual_register_number: student.exam_registration?.stu_register_no || 'N/A',
				roll_number_for_evaluation: index + 1,
				generated_at: new Date().toISOString(),
				is_active: true
			}

			// Only include generated_by if it's provided
			if (generated_by) {
				record.generated_by = generated_by
			}

			return record
		})

		console.log(`📝 Generated ${dummyNumberRecords.length} dummy number records`)

		// Step 5: Check if any dummy numbers already exist for this institution and session
		// We'll let the database unique constraint handle individual duplicates
		const { data: existingDummy, error: checkError } = await supabase
			.from('student_dummy_numbers')
			.select('id', { count: 'exact', head: true })
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.limit(1)

		if (checkError) {
			console.error('Error checking existing dummy numbers:', checkError)
			return NextResponse.json({ error: 'Failed to check existing dummy numbers' }, { status: 500 })
		}

		if (existingDummy && existingDummy.length > 0) {
			return NextResponse.json({
				error: 'Dummy numbers already exist for this institution and session. Please delete them first if you want to regenerate.'
			}, { status: 400 })
		}

		// Step 6: Insert dummy numbers into database in batches (max 1000 per batch)
		const batchSize = 1000
		const totalRecords = dummyNumberRecords.length
		let insertedCount = 0
		const allInsertedData: any[] = []

		console.log(`📤 Inserting ${totalRecords} dummy numbers in batches of ${batchSize}...`)

		for (let i = 0; i < totalRecords; i += batchSize) {
			const batch = dummyNumberRecords.slice(i, i + batchSize)
			const batchNumber = Math.floor(i / batchSize) + 1
			const totalBatches = Math.ceil(totalRecords / batchSize)

			console.log(`📤 Inserting batch ${batchNumber}/${totalBatches} (${batch.length} records)...`)

			const { data: insertedData, error: insertError } = await supabase
				.from('student_dummy_numbers')
				.insert(batch)
				.select()

			if (insertError) {
				console.error(`Error inserting batch ${batchNumber}:`, insertError)

				if (insertError.code === '23505') {
					return NextResponse.json({
						error: `Duplicate dummy numbers detected in batch ${batchNumber}. Please try a different format or starting number.`
					}, { status: 400 })
				}

				if (insertError.code === '23503') {
					// Foreign key constraint violation
					if (insertError.message?.includes('generated_by')) {
						return NextResponse.json({
							error: 'Invalid user reference. The user who is generating dummy numbers does not exist in the system.'
						}, { status: 400 })
					}
					return NextResponse.json({
						error: `Invalid reference in batch ${batchNumber}. Please ensure all referenced records (institution, session, registration) exist.`
					}, { status: 400 })
				}

				if (insertError.code === '23502') {
					// NOT NULL constraint violation
					return NextResponse.json({
						error: `Required field missing in batch ${batchNumber}: ${insertError.message || 'Unknown field'}`
					}, { status: 400 })
				}

				return NextResponse.json({
					error: `Failed to insert batch ${batchNumber} of dummy numbers. ${insertedCount} records inserted before error.`
				}, { status: 500 })
			}

			if (insertedData) {
				allInsertedData.push(...insertedData)
				insertedCount += insertedData.length
				console.log(`✅ Batch ${batchNumber}/${totalBatches} inserted successfully (${insertedData.length} records)`)
			}
		}

		console.log(`✅ Successfully inserted all ${insertedCount} dummy number records`)

		return NextResponse.json({
			success: true,
			message: `Successfully generated ${insertedCount} dummy numbers`,
			count: insertedCount,
			data: allInsertedData
		}, { status: 201 })

	} catch (error) {
		console.error('Dummy number generation error:', error)
		return NextResponse.json({
			error: error instanceof Error ? error.message : 'Internal server error'
		}, { status: 500 })
	}
}
