import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// Helper: generate dummy number from format string (matches /generate route logic)
function generateDummyNumber(format: string, index: number, startFrom: number): string {
	const number = startFrom + index
	const match = format.match(/\{N:?(\d+)?\}/)
	if (match) {
		const padding = match[1] ? parseInt(match[1]) : 0
		const paddedNumber = String(number).padStart(padding, '0')
		return format.replace(/\{N:?\d*\}/, paddedNumber)
	}
	return `${format}${number}`
}

// Helper: detect format from existing dummy_number string
// e.g. "DN0042" -> "DN{N:4}", "DUMMY-00100" -> "DUMMY-{N:5}", "X42" -> "X{N:2}"
function detectFormat(sample: string): string {
	const match = sample.match(/^(.*?)(\d+)$/)
	if (!match) return 'DN{N:4}'
	const prefix = match[1]
	const digits = match[2].length
	return `${prefix}{N:${digits}}`
}

// Helper: fetch all missing approved registrations (registrations without dummy numbers)
async function fetchMissingLearners(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutions_id: string,
	examination_session_id: string,
	filters: {
		board_code?: string | null
		program_code?: string | null
		course_codes?: string[]
		course_categories?: string[]
	}
) {
	// Fetch existing dummy number registration IDs + max roll + sample dummy_number
	const existingDummy: { exam_registration_id: string | null; dummy_number: string; roll_number_for_evaluation: number }[] = []
	{
		let offset = 0
		const limit = 1000
		let hasMore = true
		while (hasMore) {
			const { data, error } = await supabase
				.from('student_dummy_numbers')
				.select('exam_registration_id, dummy_number, roll_number_for_evaluation')
				.eq('institutions_id', institutions_id)
				.eq('examination_session_id', examination_session_id)
				.eq('is_active', true)
				.range(offset, offset + limit - 1)
			if (error) throw new Error('Failed to fetch existing dummy numbers: ' + error.message)
			if (data) existingDummy.push(...data)
			hasMore = !!data && data.length === limit
			offset += limit
		}
	}

	const existingRegIds = new Set(existingDummy.map(d => d.exam_registration_id).filter(Boolean) as string[])
	const maxRoll = existingDummy.length > 0
		? Math.max(...existingDummy.map(d => d.roll_number_for_evaluation || 0))
		: 0
	const sampleDummy = existingDummy[0]?.dummy_number || ''
	const existingFormat = sampleDummy ? detectFormat(sampleDummy) : 'DN{N:4}'

	// Pre-resolve allowed course offering IDs based on filters.
	// Default behavior: skip Practical courses (dummy numbers are only for theory/written papers — ESE & CIA).
	// Practicals are included only when the user explicitly selects 'Practical' in the category filter.
	const userCategoriesProvided = !!(filters.course_categories && filters.course_categories.length > 0)
	const effectiveCategories = userCategoriesProvided
		? filters.course_categories!
		: ['Theory', 'Project', 'Field Work'] // exclude 'Practical' by default

	let allowedOfferingIds: Set<string> = new Set()
	{
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

		if (filters.course_codes && filters.course_codes.length > 0) {
			if (filters.course_codes.length === 1) {
				coQuery = coQuery.eq('course_code', filters.course_codes[0])
			} else {
				coQuery = coQuery.in('course_code', filters.course_codes)
			}
		}
		if (filters.program_code) {
			coQuery = coQuery.eq('program_code', filters.program_code)
		}

		const { data: filteredOfferings, error: coError } = await coQuery.range(0, 9999)
		if (coError) throw new Error('Failed to filter course offerings: ' + coError.message)

		let offerings = filteredOfferings || []
		if (filters.board_code) {
			offerings = offerings.filter((co: any) => co.course?.board_code === filters.board_code)
		}

		// Always apply category filter (default excludes Practical)
		const catSet = new Set(effectiveCategories)
		offerings = offerings.filter((co: any) => catSet.has(co.course?.course_category))

		allowedOfferingIds = new Set(offerings.map((co: any) => co.id))
	}

	// If no offerings match the filters (including the default "skip Practical"), there are no missing learners
	if (allowedOfferingIds.size === 0) {
		return { missingStudents: [], maxRoll, existingFormat }
	}

	// Fetch all approved registrations
	const allRegs: any[] = []
	{
		let offset = 0
		const limit = 1000
		let hasMore = true
		while (hasMore) {
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
				.eq('registration_status', 'Approved')

			// Apply offering filter at query level when possible (.in() can't handle very large sets without HeadersOverflow)
			if (allowedOfferingIds.size <= 100) {
				query = query.in('course_offering_id', [...allowedOfferingIds])
			}

			query = query.range(offset, offset + limit - 1)
			const { data, error } = await query
			if (error) throw new Error('Failed to fetch registrations: ' + error.message)
			if (data) allRegs.push(...data)
			hasMore = !!data && data.length === limit
			offset += limit
		}
	}

	// Filter to missing only (not in existing dummy numbers)
	let missingRegs = allRegs.filter(r => !existingRegIds.has(r.id))

	// If we couldn't apply offering filter at query level (large set), apply client-side
	if (allowedOfferingIds.size > 100) {
		missingRegs = missingRegs.filter(r => allowedOfferingIds.has(r.course_offering_id))
	}

	// Enrich with course offering details
	const courseOfferingIds = [...new Set(missingRegs.map(r => r.course_offering_id).filter(Boolean))]
	const courseOfferingMap = new Map<string, any>()
	if (courseOfferingIds.length > 0) {
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

			if (!offeringsError && offerings) {
				offerings.forEach((co: any) => courseOfferingMap.set(co.id, co))
			}
		}
	}

	// Transform missing regs into the same shape as /generate uses
	const missingStudents = missingRegs.map((reg: any) => {
		const courseOffering = courseOfferingMap.get(reg.course_offering_id)
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

	return { missingStudents, maxRoll, existingFormat }
}

// Helper: enrich students with program_order from MyJKKN API (mirrors /generate route)
async function enrichWithProgramOrder(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutions_id: string,
	students: any[]
) {
	const programOrderMap = new Map<string, number>()
	const { data: inst } = await supabase
		.from('institutions')
		.select('myjkkn_institution_ids')
		.eq('id', institutions_id)
		.single()
	const myjkknIds: string[] = inst?.myjkkn_institution_ids || []

	if (myjkknIds.length > 0) {
		const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
		const myjkknApiKey = process.env.MYJKKN_API_KEY || ''
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
							for (const p of programs) {
								const code = p.program_id || p.program_code || ''
								if (code && !programOrderMap.has(code)) {
									programOrderMap.set(code, p.program_order ?? p.sort_order ?? 999)
								}
							}
							hasMorePages = programs.length === 200
							pg++
						} else {
							hasMorePages = false
						}
					}
				}
			} catch (e) {
				console.error('Error fetching program_order from MyJKKN:', e)
			}
		}
	}

	for (const s of students) {
		const prog = s.exam_registration?.course_offering?.program
		if (prog?.program_code) {
			prog.program_order = programOrderMap.get(prog.program_code) ?? 999
		}
	}
}

// Sort using same order as /generate route
function sortStudents(students: any[]): any[] {
	return students.sort((a, b) => {
		const aCO = a.exam_registration?.course_offering
		const bCO = b.exam_registration?.course_offering

		const aBoardOrder = aCO?.course?.board?.board_order ?? 999
		const bBoardOrder = bCO?.course?.board?.board_order ?? 999
		if (aBoardOrder !== bBoardOrder) return aBoardOrder - bBoardOrder

		const aSemester = aCO?.semester ?? 999
		const bSemester = bCO?.semester ?? 999
		if (aSemester !== bSemester) return aSemester - bSemester

		const aCourseOrder = aCO?.course_order ?? 999
		const bCourseOrder = bCO?.course_order ?? 999
		if (aCourseOrder !== bCourseOrder) return aCourseOrder - bCourseOrder

		const aProgramOrder = aCO?.program?.program_order ?? 999
		const bProgramOrder = bCO?.program?.program_order ?? 999
		if (aProgramOrder !== bProgramOrder) return aProgramOrder - bProgramOrder

		const aRegular = a.exam_registration?.is_regular ?? false
		const bRegular = b.exam_registration?.is_regular ?? false
		if (aRegular !== bRegular) return bRegular ? 1 : -1

		const aRegNo = a.exam_registration?.stu_register_no || ''
		const bRegNo = b.exam_registration?.stu_register_no || ''
		return aRegNo.localeCompare(bRegNo)
	})
}

// GET: Detect missing learners (count + summary info)
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const board_code = searchParams.get('board_code')
		const program_code = searchParams.get('program_code')
		const course_code = searchParams.get('course_code') // comma-separated
		const course_category = searchParams.get('course_category') // comma-separated

		if (!institutions_id || !examination_session_id) {
			return NextResponse.json({ error: 'Institution ID and Examination Session ID are required' }, { status: 400 })
		}

		const filters = {
			board_code,
			program_code,
			course_codes: course_code ? course_code.split(',').filter(Boolean) : [],
			course_categories: course_category ? course_category.split(',').filter(Boolean) : [],
		}

		const { missingStudents, maxRoll, existingFormat } = await fetchMissingLearners(
			supabase,
			institutions_id,
			examination_session_id,
			filters
		)

		const nextRoll = maxRoll + 1
		const nextDummyPreview = generateDummyNumber(existingFormat, 0, nextRoll)

		return NextResponse.json({
			count: missingStudents.length,
			existing_format: existingFormat,
			max_roll_number: maxRoll,
			next_roll_number: nextRoll,
			next_dummy_number_preview: nextDummyPreview,
		})
	} catch (error) {
		console.error('Missing learners detection error:', error)
		return NextResponse.json({
			error: error instanceof Error ? error.message : 'Internal server error'
		}, { status: 500 })
	}
}

// POST: Generate dummy numbers for missing learners (continues sequence)
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		const {
			institutions_id,
			examination_session_id,
			generated_by,
			dummy_number_format, // optional: override format
			board_code,
			program_code,
			course_codes,
			course_code,
			course_categories,
			course_category,
			exam_registration_ids, // optional: subset to fill (selected learners only)
			preview_only,
		} = body

		if (!institutions_id) {
			return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
		}
		if (!examination_session_id) {
			return NextResponse.json({ error: 'Examination session ID is required' }, { status: 400 })
		}

		const courseCodeFilter: string[] = course_codes?.length > 0
			? course_codes
			: course_code ? [course_code] : []
		const categoryFilter: string[] = course_categories?.length > 0
			? course_categories
			: course_category ? [course_category] : []

		const filters = {
			board_code: board_code || null,
			program_code: program_code || null,
			course_codes: courseCodeFilter,
			course_categories: categoryFilter,
		}

		console.log('🔍 Detecting missing learners:', { institutions_id, examination_session_id, filters, selected_count: exam_registration_ids?.length ?? 'all' })

		const { missingStudents, maxRoll, existingFormat } = await fetchMissingLearners(
			supabase,
			institutions_id,
			examination_session_id,
			filters
		)

		if (missingStudents.length === 0) {
			return NextResponse.json({
				error: 'No missing learners found for the selected institution and session'
			}, { status: 400 })
		}

		// Apply per-learner selection filter if provided
		let scopedStudents = missingStudents
		if (Array.isArray(exam_registration_ids) && exam_registration_ids.length > 0) {
			const selectedSet = new Set<string>(exam_registration_ids)
			scopedStudents = missingStudents.filter(s => selectedSet.has(s.exam_registration_id))
			if (scopedStudents.length === 0) {
				return NextResponse.json({
					error: 'None of the selected learners are missing dummy numbers'
				}, { status: 400 })
			}
		}

		// Enrich with program_order
		await enrichWithProgramOrder(supabase, institutions_id, scopedStudents)

		// Sort (always sequence mode for fill missing)
		const sortedStudents = sortStudents(scopedStudents)

		const formatToUse = dummy_number_format || existingFormat
		const startNumber = maxRoll + 1

		console.log(`📋 Found ${sortedStudents.length} missing learners. Continuing from roll ${startNumber} with format ${formatToUse}`)

		// Preview mode
		if (preview_only) {
			const preview = sortedStudents.map((s: any, i: number) => ({
				exam_registration_id: s.exam_registration_id,
				roll: startNumber + i,
				dummy_number: generateDummyNumber(formatToUse, i, startNumber),
				register_no: s.exam_registration?.stu_register_no || 'N/A',
				student_name: s.exam_registration?.student_name || s.student?.student_name || '-',
				board: s.exam_registration?.course_offering?.course?.board?.board_code || '-',
				program: s.exam_registration?.course_offering?.program?.program_code || '-',
				course: s.exam_registration?.course_offering?.course?.course_code || s.exam_registration?.course_offering?.course_code || '-',
				type: s.exam_registration?.is_regular ? 'Regular' : 'Arrear',
			}))

			return NextResponse.json({
				preview,
				count: sortedStudents.length,
				existing_format: existingFormat,
				next_roll_number: startNumber,
				message: `Preview: ${sortedStudents.length} missing learners will receive dummy numbers starting from roll ${startNumber}`,
			})
		}

		// Build records to insert
		const dummyNumberRecords = sortedStudents.map((student, index) => {
			const dummyNumber = generateDummyNumber(formatToUse, index, startNumber)
			const record: any = {
				institutions_id,
				examination_session_id,
				exam_registration_id: student.exam_registration_id,
				exam_timetable_id: student.exam_timetable_id,
				dummy_number: dummyNumber,
				actual_register_number: student.exam_registration?.stu_register_no || 'N/A',
				roll_number_for_evaluation: startNumber + index,
				generated_at: new Date().toISOString(),
				is_active: true,
			}
			if (generated_by) record.generated_by = generated_by
			return record
		})

		// Insert in batches
		const batchSize = 1000
		let insertedCount = 0
		const allInsertedData: any[] = []

		for (let i = 0; i < dummyNumberRecords.length; i += batchSize) {
			const batch = dummyNumberRecords.slice(i, i + batchSize)
			const batchNumber = Math.floor(i / batchSize) + 1
			const totalBatches = Math.ceil(dummyNumberRecords.length / batchSize)

			console.log(`📤 Inserting batch ${batchNumber}/${totalBatches} (${batch.length} records)...`)

			const { data: insertedData, error: insertError } = await supabase
				.from('student_dummy_numbers')
				.insert(batch)
				.select()

			if (insertError) {
				console.error(`Error inserting batch ${batchNumber}:`, insertError)
				if (insertError.code === '23505') {
					return NextResponse.json({
						error: `Duplicate dummy numbers detected in batch ${batchNumber}. The sequence may have collided with existing records.`
					}, { status: 400 })
				}
				if (insertError.code === '23503') {
					return NextResponse.json({
						error: `Invalid reference in batch ${batchNumber}: ${insertError.message}`
					}, { status: 400 })
				}
				return NextResponse.json({
					error: `Failed to insert batch ${batchNumber}. ${insertedCount} records inserted before error.`
				}, { status: 500 })
			}

			if (insertedData) {
				allInsertedData.push(...insertedData)
				insertedCount += insertedData.length
			}
		}

		console.log(`✅ Successfully filled ${insertedCount} missing dummy numbers`)

		return NextResponse.json({
			success: true,
			message: `Successfully filled ${insertedCount} missing dummy numbers (rolls ${startNumber}-${startNumber + insertedCount - 1})`,
			count: insertedCount,
			next_roll_number: startNumber,
			data: allInsertedData,
		}, { status: 201 })
	} catch (error) {
		console.error('Fill missing dummy numbers error:', error)
		return NextResponse.json({
			error: error instanceof Error ? error.message : 'Internal server error'
		}, { status: 500 })
	}
}
