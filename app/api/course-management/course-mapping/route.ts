import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { handleDeleteWithDependencyCheck } from '@/lib/delete-helpers'

const ALLOWED_COURSE_MAPPING_STATUSES = ['Pending', 'BOS Approved', 'Locked'] as const
type AllowedCourseMappingStatus = typeof ALLOWED_COURSE_MAPPING_STATUSES[number]

function normalizeCourseMappingStatus(value: unknown): AllowedCourseMappingStatus | undefined {
	if (value === undefined || value === null || value === '') return undefined
	const v = String(value) as AllowedCourseMappingStatus
	if (!ALLOWED_COURSE_MAPPING_STATUSES.includes(v)) return null as any
	return v
}

// Helper function to filter out fields that don't belong to course_mapping table
function filterCourseMappingFields(data: any) {
	const {
		internal_max_mark,
		internal_pass_mark,
		internal_converted_mark,
		external_max_mark,
		external_pass_mark,
		external_converted_mark,
		total_pass_mark,
		total_max_mark,
		courses,
		...courseMappingData
	} = data
	return courseMappingData
}

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const includeDetails = searchParams.get('details') === 'true'
		const institutionCode = searchParams.get('institution_code')
		const programCode = searchParams.get('program_code')
		const regulationCode = searchParams.get('regulation_code')
		const semesterCode = searchParams.get('semester_code')
		const isActive = searchParams.get('is_active')

		if (includeDetails) {
			// Fetch course mappings
			let query = supabase
				.from('course_mapping')
				.select('*')
				.order('created_at', { ascending: false })

			if (institutionCode) query = query.eq('institution_code', institutionCode)
			if (programCode) query = query.eq('program_code', programCode)
			if (regulationCode) query = query.eq('regulation_code', regulationCode)
			if (semesterCode) query = query.eq('semester_code', semesterCode)
			if (isActive !== null) query = query.eq('is_active', isActive === 'true')

			const { data, error } = await query

			if (error) {
				console.error('Course mapping view error:', error)
				return NextResponse.json({ error: error.message }, { status: 500 })
			}

			return NextResponse.json(data || [])
		} else {
			// Fetch course mappings
			// Note: Join with courses causes errors, so fetch course details separately if needed
			let query = supabase
				.from('course_mapping')
				.select('*')
				.order('course_order', { ascending: true })
				.order('created_at', { ascending: false })

			if (institutionCode) query = query.eq('institution_code', institutionCode)
			if (programCode) query = query.eq('program_code', programCode)
			if (regulationCode) query = query.eq('regulation_code', regulationCode)
			if (semesterCode) query = query.eq('semester_code', semesterCode)
			if (isActive !== null) query = query.eq('is_active', isActive === 'true')

			console.log('[Course Mapping API] Query params:', { institutionCode, programCode, regulationCode, semesterCode, isActive })

			let { data, error } = await query

			if (error) {
				console.error('[Course Mapping API] Supabase error:', error)
				console.error('[Course Mapping API] Error details:', JSON.stringify(error, null, 2))
				return NextResponse.json({ error: error.message }, { status: 500 })
			}

			console.log('[Course Mapping API] Returned', data?.length || 0, 'course mappings')

			// Fetch course details for all course_ids
			if (data && data.length > 0) {
				try {
					const courseIds = Array.from(new Set(data.map(m => m.course_id).filter(Boolean)))
					console.log('[Course Mapping API] Fetching course details for', courseIds.length, 'course IDs')

					if (courseIds.length > 0) {
						const { data: coursesData, error: coursesError } = await supabase
							.from('courses')
							.select(`
								id,
								course_code,
								course_name,
								internal_max_mark,
								internal_pass_mark,
								internal_converted_mark,
								external_max_mark,
								external_pass_mark,
								external_converted_mark,
								total_pass_mark,
								total_max_mark
							`)
							.in('id', courseIds)

						if (coursesError) {
							console.error('[Course Mapping API] Error fetching courses:', coursesError)
						} else if (coursesData) {
							console.log('[Course Mapping API] Fetched', coursesData.length, 'course details:', coursesData)
							// Create a map for quick lookup
							const coursesMap = new Map(coursesData.map(c => [c.id, {
								course_code: c.course_code,
								course_title: c.course_name, // Map course_name to course_title for consistency
								internal_max_mark: c.internal_max_mark,
								internal_pass_mark: c.internal_pass_mark,
								internal_converted_mark: c.internal_converted_mark,
								external_max_mark: c.external_max_mark,
								external_pass_mark: c.external_pass_mark,
								external_converted_mark: c.external_converted_mark,
								total_pass_mark: c.total_pass_mark,
								total_max_mark: c.total_max_mark
							}]))
							console.log('[Course Mapping API] Courses map created with', coursesMap.size, 'entries')
							// Enrich mappings with course details
							data = data.map(m => ({
								...m,
								courses: coursesMap.get(m.course_id) || null
							}))
							console.log('[Course Mapping API] Enriched data sample:', data[0])
						}
					}
				} catch (err) {
					console.error('[Course Mapping API] Error enriching with course details:', err)
					// Continue without enrichment if it fails
				}
			}

			// Skip the complex display_order sorting for now - just return the enriched data
			// Data is already sorted by course_order from the initial query
			console.log('[Course Mapping API] Returning final data:', data?.length || 0, 'items')
			return NextResponse.json(data || [])
		}
	} catch (err) {
		console.error('Unexpected error in GET /api/course-mapping:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		// Check if it's a bulk operation (multiple semesters)
		if (body.bulk && Array.isArray(body.mappings)) {
			const errors: Array<{ semester_code: string; course_id: string; error: string }> = []
			const validMappings: typeof body.mappings = []

			// Step 1: Validate required fields and marks consistency upfront
			for (const mapping of body.mappings) {
				if (!mapping.course_id || !mapping.institution_code || !mapping.program_code || !mapping.regulation_code) {
					errors.push({
						semester_code: mapping.semester_code,
						course_id: mapping.course_id,
						error: 'Missing required fields'
					})
					continue
				}

				if (mapping.internal_pass_mark > mapping.internal_max_mark ||
					mapping.external_pass_mark > mapping.external_max_mark ||
					mapping.total_pass_mark > mapping.total_max_mark) {
					errors.push({
						semester_code: mapping.semester_code,
						course_id: mapping.course_id,
						error: 'Pass marks cannot exceed max marks'
					})
					continue
				}

				if (mapping.courses_status !== undefined && mapping.courses_status !== null && mapping.courses_status !== '') {
					const normalized = normalizeCourseMappingStatus(mapping.courses_status)
					if (normalized === null) {
						errors.push({
							semester_code: mapping.semester_code,
							course_id: mapping.course_id,
							error: `Invalid courses_status. Allowed: ${ALLOWED_COURSE_MAPPING_STATUSES.join(', ')}`
						})
						continue
					}
					mapping.courses_status = normalized
				}

				validMappings.push(mapping)
			}

			if (validMappings.length === 0) {
				return NextResponse.json({
					success: [],
					errors,
					message: `0 mappings created, ${errors.length} failed validation`
				})
			}

			// Step 2: Batch fetch all required lookup data in parallel
			const uniqueCourseIds = [...new Set(validMappings.map((m: any) => m.course_id))]
			const uniqueInstitutionCodes = [...new Set(validMappings.map((m: any) => m.institution_code))]

			// Parallel batch lookups - only courses and institutions are required
			const [coursesResult, institutionsResult] = await Promise.all([
				supabase.from('courses').select('id, course_code').in('id', uniqueCourseIds),
				supabase.from('institutions').select('id, institution_code').in('institution_code', uniqueInstitutionCodes)
			])

			// Create lookup maps for O(1) access
			const courseMap = new Map<string, { id: string; course_code: string }>()
			coursesResult.data?.forEach(c => courseMap.set(c.id, c))

			const institutionMap = new Map<string, string>()
			institutionsResult.data?.forEach(i => institutionMap.set(i.institution_code, i.id))

			// Step 3: Build upsert records with resolved IDs
			const upsertRecords: any[] = []
			const now = new Date().toISOString()

			for (const mapping of validMappings) {
				const course = courseMap.get(mapping.course_id)
				if (!course) {
					errors.push({ semester_code: mapping.semester_code, course_id: mapping.course_id, error: 'Course not found' })
					continue
				}

				const institutionId = institutionMap.get(mapping.institution_code) || null

				// Filter out mark fields that belong to courses table
				const filteredMapping = filterCourseMappingFields(mapping)

				upsertRecords.push({
					...filteredMapping,
					course_code: course.course_code,
					institutions_id: institutionId,
					// Use MyJKKN IDs from request body (program_id, regulation_id, semester_id)
					// These are UUIDs from MyJKKN system, not local database IDs
					program_id: mapping.program_id || null,
					regulation_id: mapping.regulation_id || null,
					semester_id: mapping.semester_id || null,
					updated_at: now
				})
			}

			if (upsertRecords.length === 0) {
				return NextResponse.json({
					success: [],
					errors,
					message: `0 mappings created, ${errors.length} failed`
				})
			}

			// Step 4: Batch upsert all records in a single operation
			// Using onConflict for records with existing IDs (updates) and inserting new ones
			const recordsWithId = upsertRecords.filter(r => r.id)
			const recordsWithoutId = upsertRecords.filter(r => !r.id)

			let allResults: any[] = []

			// Bulk update existing records (those with id)
			if (recordsWithId.length > 0) {
				const { data: updateData, error: updateError } = await supabase
					.from('course_mapping')
					.upsert(recordsWithId, {
						onConflict: 'id',
						ignoreDuplicates: false
					})
					.select('*')

				if (updateError) {
					console.error('Bulk update error:', updateError)
					// Add all as errors
					recordsWithId.forEach(r => {
						errors.push({ semester_code: r.semester_code, course_id: r.course_id, error: updateError.message })
					})
				} else if (updateData) {
					allResults = [...allResults, ...updateData]
				}
			}

			// Bulk insert new records (those without id)
			if (recordsWithoutId.length > 0) {
				// Add created_at for new records
				const newRecords = recordsWithoutId.map(r => ({ ...r, created_at: now }))

				const { data: insertData, error: insertError } = await supabase
					.from('course_mapping')
					.insert(newRecords)
					.select('*')

				if (insertError) {
					console.error('Bulk insert error:', insertError)
					// Report all records in the batch as failed rather than attempting N+1 individual inserts
					for (const record of newRecords) {
						errors.push({ semester_code: record.semester_code, course_id: record.course_id, error: insertError.message })
					}
				} else if (insertData) {
					allResults = [...allResults, ...insertData]
				}
			}

			return NextResponse.json({
				success: allResults,
				errors,
				message: `${allResults.length} mappings saved successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`
			})
		}

		// Single mapping creation (existing logic)
		// Validate required fields - support both course_id and course_code
		if (!body.course_id && !body.course_code) {
			return NextResponse.json(
				{ error: 'course_id or course_code is required' },
				{ status: 400 }
			)
		}

		if (!body.institution_code) {
			return NextResponse.json(
				{ error: 'institution_code is required' },
				{ status: 400 }
			)
		}

		if (!body.program_code) {
			return NextResponse.json(
				{ error: 'program_code is required' },
				{ status: 400 }
			)
		}

		if (!body.regulation_code) {
			return NextResponse.json(
				{ error: 'regulation_code is required' },
				{ status: 400 }
			)
		}

		// Validate marks consistency
		if (body.internal_pass_mark > body.internal_max_mark) {
			return NextResponse.json(
				{ error: 'Internal pass mark cannot exceed internal max mark' },
				{ status: 400 }
			)
		}

		if (body.external_pass_mark > body.external_max_mark) {
			return NextResponse.json(
				{ error: 'External pass mark cannot exceed external max mark' },
				{ status: 400 }
			)
		}

		if (body.total_pass_mark > body.total_max_mark) {
			return NextResponse.json(
				{ error: 'Total pass mark cannot exceed total max mark' },
				{ status: 400 }
			)
		}

		if (body.courses_status !== undefined && body.courses_status !== null && body.courses_status !== '') {
			const normalized = normalizeCourseMappingStatus(body.courses_status)
			if (normalized === null) {
				return NextResponse.json(
					{ error: `Invalid courses_status. Allowed: ${ALLOWED_COURSE_MAPPING_STATUSES.join(', ')}` },
					{ status: 400 }
				)
			}
			body.courses_status = normalized
		}

		// Lookup course_id from course_code if course_id not provided
		let courseId = body.course_id
		let courseCode = body.course_code

		if (!courseId && courseCode) {
			// Lookup course by course_code
			const { data: courseData, error: courseError } = await supabase
				.from('courses')
				.select('id, course_code')
				.eq('course_code', courseCode)
				.single()

			if (courseError || !courseData) {
				return NextResponse.json(
					{ error: `Course not found with code: ${courseCode}` },
					{ status: 404 }
				)
			}
			courseId = courseData.id
			courseCode = courseData.course_code
		} else if (courseId && !courseCode) {
			// Fetch course_code from courses table using course_id
			const { data: courseData, error: courseError } = await supabase
				.from('courses')
				.select('course_code')
				.eq('id', courseId)
				.single()

			if (courseError || !courseData) {
				return NextResponse.json(
					{ error: 'Course not found' },
					{ status: 404 }
				)
			}
			courseCode = courseData.course_code
		}

		// Fetch institution_id from institutions table based on institution_code
		const { data: institutionData, error: institutionError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', body.institution_code)
			.single()

		if (institutionError || !institutionData) {
			return NextResponse.json(
				{ error: `Institution not found: ${body.institution_code}` },
				{ status: 404 }
			)
		}

		// Use MyJKKN IDs from request body if provided, otherwise try to fetch from local DB
		// MyJKKN IDs are UUIDs from MyJKKN system (program.id, regulation.id, semester.id)
		let programId = body.program_id || null
		let regulationId = body.regulation_id || null
		let semesterId = body.semester_id || null

		// Fallback: Try to fetch from local DB if MyJKKN IDs not provided
		if (!programId) {
			const { data: programData, error: programError } = await supabase
				.from('programs')
				.select('id')
				.eq('program_code', body.program_code)
				.eq('institution_code', body.institution_code)
				.single()

			if (programError || !programData) {
				// Don't fail if program not found in local DB - MyJKKN IDs are preferred
				console.warn(`Program not found in local DB: ${body.program_code}, using MyJKKN ID if provided`)
			} else {
				programId = programData.id
			}
		}

		if (!regulationId && body.regulation_code) {
			const { data: regulationData, error: regulationError } = await supabase
				.from('regulations')
				.select('id')
				.eq('regulation_code', body.regulation_code)
				.eq('institution_code', body.institution_code)
				.single()

			if (regulationError || !regulationData) {
				// Don't fail if regulation not found in local DB - MyJKKN IDs are preferred
				console.warn(`Regulation not found in local DB: ${body.regulation_code}, using MyJKKN ID if provided`)
			} else {
				regulationId = regulationData.id
			}
		}

		// Check for duplicate mapping (NO BATCH)
		const { data: existing } = await supabase
			.from('course_mapping')
			.select('id')
			.eq('course_id', courseId)
			.eq('institution_code', body.institution_code)
			.eq('program_code', body.program_code)
			.eq('regulation_code', body.regulation_code)
			.eq('semester_code', body.semester_code || '')
			.eq('is_active', true)
			.single()

		if (existing) {
			return NextResponse.json(
				{ error: 'Course mapping already exists for this combination' },
				{ status: 409 }
			)
		}

		// Filter out mark fields that belong to courses table
		const filteredBody = filterCourseMappingFields(body)

		const { data, error } = await supabase
			.from('course_mapping')
			.insert([{
				...filteredBody,
				course_id: courseId,                  // Ensure course_id is set
				course_code: courseCode,              // Ensure course_code is set
				institutions_id: institutionData.id,  // Add institution ID
				program_id: programId,                // Use MyJKKN program.id if provided, otherwise local DB ID
				regulation_id: regulationId,          // Use MyJKKN regulation.id if provided, otherwise local DB ID
				semester_id: semesterId               // Use MyJKKN semester.id if provided
			}])
			.select('*')
			.single()

		if (error) {
			console.error('Error creating course mapping:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (err) {
		console.error('Unexpected error in POST /api/course-mapping:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function PUT(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		if (!body.id) {
			return NextResponse.json(
				{ error: 'Mapping ID is required' },
				{ status: 400 }
			)
		}

		// Filter out mark fields that belong to courses table, not course_mapping
		const { id, ...bodyWithoutId } = body
		const updateData = filterCourseMappingFields(bodyWithoutId)

		if (updateData.courses_status !== undefined && updateData.courses_status !== null && updateData.courses_status !== '') {
			const normalized = normalizeCourseMappingStatus(updateData.courses_status)
			if (normalized === null) {
				return NextResponse.json(
					{ error: `Invalid courses_status. Allowed: ${ALLOWED_COURSE_MAPPING_STATUSES.join(', ')}` },
					{ status: 400 }
				)
			}
			updateData.courses_status = normalized
		}

		// If course_id is being updated, fetch the new course_code
		if (updateData.course_id) {
			const { data: courseData, error: courseError } = await supabase
				.from('courses')
				.select('course_code')
				.eq('id', updateData.course_id)
				.single()

			if (courseError || !courseData) {
				return NextResponse.json(
					{ error: 'Course not found' },
					{ status: 404 }
				)
			}

			updateData.course_code = courseData.course_code
		}

		const { data, error } = await supabase
			.from('course_mapping')
			.update(updateData)
			.eq('id', id)
			.select('*')
			.single()

		if (error) {
			console.error('Error updating course mapping:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (err) {
		console.error('Unexpected error in PUT /api/course-mapping:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json(
				{ error: 'Mapping ID is required' },
				{ status: 400 }
			)
		}

		return handleDeleteWithDependencyCheck('course_mapping', id, request)
	} catch (err) {
		console.error('Unexpected error in DELETE /api/course-mapping:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
