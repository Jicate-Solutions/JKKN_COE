import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import { mapCourseMappingToResponse } from '@/lib/api-helpers/course-mapping-mapper'
import type { ExternalApiContext } from '@/types/api-management'

const COURSE_MAPPING_SELECT = `
	id, institutions_id, institution_code,
	program_id, program_code,
	course_id, course_code,
	batch_id, batch_code,
	regulation_id, regulation_code,
	semester_id, semester_code,
	course_group, course_category, course_order, group_order,
	annual_semester, registration_based, is_active,
	created_at, updated_at
`

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

async function enrichWithCourseMarks(
	supabase: ReturnType<typeof getSupabaseServer>,
	mappings: any[],
	options: { includeCoursesDetails?: boolean } = {},
): Promise<any[]> {
	if (!mappings || mappings.length === 0) return mappings
	const courseIds = Array.from(new Set(mappings.map(m => m.course_id).filter(Boolean)))
	if (courseIds.length === 0) return mappings

	const { data: coursesData } = await supabase
		.from('courses')
		.select('id, course_code, course_name, internal_max_mark, internal_pass_mark, external_max_mark, external_pass_mark, total_max_mark, total_pass_mark, credit')
		.in('id', courseIds)

	if (!coursesData) return mappings

	const coursesMap = new Map(coursesData.map(c => [c.id, c]))
	return mappings.map(m => {
		const c: any = coursesMap.get(m.course_id)
		if (!c) return m
		const enriched: any = {
			...m,
			// Always surface the human course title at the row level so
			// consumers get it without requiring details=true.
			course_name: c.course_name,
			course_title: c.course_name,
			internal_max_mark: c.internal_max_mark,
			internal_pass_mark: c.internal_pass_mark,
			external_max_mark: c.external_max_mark,
			external_pass_mark: c.external_pass_mark,
			total_max_mark: c.total_max_mark,
			total_pass_mark: c.total_pass_mark,
		}
		if (options.includeCoursesDetails) {
			enriched.courses = {
				course_code: c.course_code,
				course_title: c.course_name,
				internal_max_mark: c.internal_max_mark,
				internal_pass_mark: c.internal_pass_mark,
				external_max_mark: c.external_max_mark,
				external_pass_mark: c.external_pass_mark,
				total_max_mark: c.total_max_mark,
				total_pass_mark: c.total_pass_mark,
				credits: c.credit,
			}
		}
		return enriched
	})
}

function checkInstitutionAccess(context: ExternalApiContext, institutionsId: string | null): boolean {
	if (!context.allowedInstitutionIds || context.allowedInstitutionIds.length === 0) return true
	if (!institutionsId) return false
	return context.allowedInstitutionIds.includes(institutionsId)
}

export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const format = (searchParams.get('format') || 'mapped') as 'mapped' | 'raw'
		const id = searchParams.get('id')
		const institutionsId = searchParams.get('institutions_id')
		const institutionCode = searchParams.get('institution_code')
		const programCode = searchParams.get('program_code')
		const courseCode = searchParams.get('course_code')
		const semesterCode = searchParams.get('semester_code')
		const batchCode = searchParams.get('batch_code')
		const regulationCode = searchParams.get('regulation_code')
		const courseCategory = searchParams.get('course_category')
		const isActiveParam = searchParams.get('is_active')
		const includeDetails = searchParams.get('details') === 'true'
		const limit = Math.min(Number(searchParams.get('limit')) || 5000, 10000)

		// Single record fetch
		if (id) {
			const { data, error } = await supabase
				.from('course_mapping')
				.select(COURSE_MAPPING_SELECT)
				.eq('id', id)
				.single()

			if (error || !data) {
				return NextResponse.json({ error: 'Course mapping not found' }, { status: 404 })
			}

			if (!checkInstitutionAccess(context, data.institutions_id)) {
				return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
			}

			const enriched = await enrichWithCourseMarks(supabase, [data])
			return NextResponse.json({ data: mapCourseMappingToResponse(enriched[0], format) })
		}

		let query = supabase
			.from('course_mapping')
			.select(COURSE_MAPPING_SELECT)
			.order('course_order', { ascending: true, nullsFirst: false })
			.order('program_code')
			.order('semester_code')
			.order('course_code')

		// Apply institution filter (request-based or auto from API key)
		if (institutionsId) {
			if (!checkInstitutionAccess(context, institutionsId)) {
				return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
			}
			query = query.eq('institutions_id', institutionsId)
		} else if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
			query = query.in('institutions_id', context.allowedInstitutionIds)
		}

		if (institutionCode) query = query.eq('institution_code', institutionCode)
		if (programCode) query = query.eq('program_code', programCode)
		if (courseCode) query = query.eq('course_code', courseCode)
		if (semesterCode) query = query.eq('semester_code', semesterCode)
		if (batchCode) query = query.eq('batch_code', batchCode)
		if (regulationCode) query = query.eq('regulation_code', regulationCode)
		if (courseCategory) query = query.eq('course_category', courseCategory)

		// Default to active rows unless caller asks for all/false
		if (isActiveParam === 'false') query = query.eq('is_active', false)
		else if (isActiveParam !== 'all') query = query.eq('is_active', true)

		const { data, error } = await query.range(0, limit - 1)

		if (error) {
			console.error('Error fetching course_mapping:', error)
			return NextResponse.json({ error: 'Failed to fetch course mapping' }, { status: 500 })
		}

		let result: any[] = data || []

		// Always enrich with pass/max marks from courses table (pass marks live there, not in course_mapping)
		result = await enrichWithCourseMarks(supabase, result, { includeCoursesDetails: includeDetails })

		const mapped = result.map(m => mapCourseMappingToResponse(m, format))
		return NextResponse.json({ data: mapped, total: mapped.length })
	} catch (error) {
		console.error('Course mapping GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

export const POST = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		// Detect bulk mode (array of mappings)
		const isBulk = Array.isArray(body?.mappings) || Array.isArray(body)
		const mappings = Array.isArray(body) ? body : (body.mappings || [body])

		if (isBulk) {
			const errors: Array<{ index: number; course_id?: string; error: string }> = []
			const validMappings: any[] = []

			// Validation pass
			mappings.forEach((mapping: any, index: number) => {
				if (!mapping.course_id && !mapping.course_code) {
					errors.push({ index, error: 'course_id or course_code is required' })
					return
				}
				if (!mapping.institution_code) {
					errors.push({ index, course_id: mapping.course_id, error: 'institution_code is required' })
					return
				}
				if (!mapping.program_code) {
					errors.push({ index, course_id: mapping.course_id, error: 'program_code is required' })
					return
				}
				if (!mapping.regulation_code) {
					errors.push({ index, course_id: mapping.course_id, error: 'regulation_code is required' })
					return
				}
				validMappings.push({ ...mapping, _index: index })
			})

			if (validMappings.length === 0) {
				return NextResponse.json({ data: [], errors, message: `0 mappings created, ${errors.length} failed validation` })
			}

			// Batch fetch lookup data
			const uniqueCourseIds = [...new Set(validMappings.map((m: any) => m.course_id).filter(Boolean))]
			const uniqueCourseCodes = [...new Set(validMappings.filter((m: any) => !m.course_id && m.course_code).map((m: any) => m.course_code))]
			const uniqueInstitutionCodes = [...new Set(validMappings.map((m: any) => m.institution_code))]

			const [coursesByIdResult, coursesByCodeResult, institutionsResult] = await Promise.all([
				uniqueCourseIds.length > 0
					? supabase.from('courses').select('id, course_code').in('id', uniqueCourseIds)
					: Promise.resolve({ data: [], error: null }),
				uniqueCourseCodes.length > 0
					? supabase.from('courses').select('id, course_code').in('course_code', uniqueCourseCodes)
					: Promise.resolve({ data: [], error: null }),
				supabase.from('institutions').select('id, institution_code').in('institution_code', uniqueInstitutionCodes),
			])

			const courseByIdMap = new Map<string, { id: string; course_code: string }>()
			coursesByIdResult.data?.forEach((c: any) => courseByIdMap.set(c.id, c))
			const courseByCodeMap = new Map<string, { id: string; course_code: string }>()
			coursesByCodeResult.data?.forEach((c: any) => courseByCodeMap.set(c.course_code, c))
			const institutionMap = new Map<string, string>()
			institutionsResult.data?.forEach((i: any) => institutionMap.set(i.institution_code, i.id))

			const upsertRecords: any[] = []
			const now = new Date().toISOString()

			for (const mapping of validMappings) {
				const idx = mapping._index
				let course = mapping.course_id ? courseByIdMap.get(mapping.course_id) : courseByCodeMap.get(mapping.course_code)
				if (!course) {
					errors.push({ index: idx, course_id: mapping.course_id, error: 'Course not found' })
					continue
				}

				const institutionId = institutionMap.get(mapping.institution_code)
				if (!institutionId) {
					errors.push({ index: idx, course_id: course.id, error: `Institution not found: ${mapping.institution_code}` })
					continue
				}

				if (!checkInstitutionAccess(context, institutionId)) {
					errors.push({ index: idx, course_id: course.id, error: 'Access denied for this institution' })
					continue
				}

				const { _index, ...mappingClean } = mapping
				const filtered = filterCourseMappingFields(mappingClean)

				upsertRecords.push({
					...filtered,
					course_id: course.id,
					course_code: course.course_code,
					institutions_id: institutionId,
					program_id: mapping.program_id || null,
					regulation_id: mapping.regulation_id || null,
					semester_id: mapping.semester_id || null,
					updated_at: now,
				})
			}

			if (upsertRecords.length === 0) {
				return NextResponse.json({ data: [], errors, message: `0 mappings created, ${errors.length} failed` })
			}

			let allResults: any[] = []
			const recordsWithId = upsertRecords.filter(r => r.id)
			const recordsWithoutId = upsertRecords.filter(r => !r.id)

			if (recordsWithId.length > 0) {
				const { data: updateData, error: updateError } = await supabase
					.from('course_mapping')
					.upsert(recordsWithId, { onConflict: 'id', ignoreDuplicates: false })
					.select(COURSE_MAPPING_SELECT)

				if (updateError) {
					recordsWithId.forEach(r => errors.push({ index: -1, course_id: r.course_id, error: updateError.message }))
				} else if (updateData) {
					allResults = [...allResults, ...updateData]
				}
			}

			if (recordsWithoutId.length > 0) {
				const newRecords = recordsWithoutId.map(r => ({ ...r, created_at: now }))
				const { data: insertData, error: insertError } = await supabase
					.from('course_mapping')
					.insert(newRecords)
					.select(COURSE_MAPPING_SELECT)

				if (insertError) {
					newRecords.forEach(r => errors.push({ index: -1, course_id: r.course_id, error: insertError.message }))
				} else if (insertData) {
					allResults = [...allResults, ...insertData]
				}
			}

			return NextResponse.json({
				data: allResults.map(m => mapCourseMappingToResponse(m, 'mapped')),
				errors,
				message: `${allResults.length} mappings saved${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
			}, { status: 201 })
		}

		// Single mapping creation
		if (!body.course_id && !body.course_code) {
			return NextResponse.json({ error: 'course_id or course_code is required' }, { status: 400 })
		}
		if (!body.institution_code) {
			return NextResponse.json({ error: 'institution_code is required' }, { status: 400 })
		}
		if (!body.program_code) {
			return NextResponse.json({ error: 'program_code is required' }, { status: 400 })
		}
		if (!body.regulation_code) {
			return NextResponse.json({ error: 'regulation_code is required' }, { status: 400 })
		}

		// Resolve course
		let courseId = body.course_id
		let courseCode = body.course_code

		if (!courseId && courseCode) {
			const { data: courseData } = await supabase
				.from('courses')
				.select('id, course_code')
				.eq('course_code', courseCode)
				.single()
			if (!courseData) {
				return NextResponse.json({ error: `Course not found with code: ${courseCode}` }, { status: 404 })
			}
			courseId = courseData.id
			courseCode = courseData.course_code
		} else if (courseId && !courseCode) {
			const { data: courseData } = await supabase
				.from('courses')
				.select('course_code')
				.eq('id', courseId)
				.single()
			if (!courseData) {
				return NextResponse.json({ error: 'Course not found' }, { status: 404 })
			}
			courseCode = courseData.course_code
		}

		// Resolve institution
		const { data: institutionData } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', body.institution_code)
			.single()
		if (!institutionData) {
			return NextResponse.json({ error: `Institution not found: ${body.institution_code}` }, { status: 404 })
		}

		if (!checkInstitutionAccess(context, institutionData.id)) {
			return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
		}

		// Check duplicate
		const { data: existing } = await supabase
			.from('course_mapping')
			.select('id')
			.eq('course_id', courseId)
			.eq('institution_code', body.institution_code)
			.eq('program_code', body.program_code)
			.eq('regulation_code', body.regulation_code)
			.eq('semester_code', body.semester_code || '')
			.eq('is_active', true)
			.maybeSingle()

		if (existing) {
			return NextResponse.json({ error: 'Course mapping already exists for this combination' }, { status: 409 })
		}

		const filteredBody = filterCourseMappingFields(body)
		const { data, error } = await supabase
			.from('course_mapping')
			.insert([{
				...filteredBody,
				course_id: courseId,
				course_code: courseCode,
				institutions_id: institutionData.id,
				program_id: body.program_id || null,
				regulation_id: body.regulation_id || null,
				semester_id: body.semester_id || null,
			}])
			.select(COURSE_MAPPING_SELECT)
			.single()

		if (error) {
			console.error('Error creating course mapping:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({ data: mapCourseMappingToResponse(data, 'mapped') }, { status: 201 })
	} catch (error) {
		console.error('Course mapping POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

export const PUT = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		if (!body.id) {
			return NextResponse.json({ error: 'Mapping ID is required' }, { status: 400 })
		}

		// Verify access
		const { data: existing, error: existingError } = await supabase
			.from('course_mapping')
			.select('id, institutions_id')
			.eq('id', body.id)
			.single()

		if (existingError || !existing) {
			return NextResponse.json({ error: 'Course mapping not found' }, { status: 404 })
		}

		if (!checkInstitutionAccess(context, existing.institutions_id)) {
			return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
		}

		const { id, ...rest } = body
		const updateData = filterCourseMappingFields(rest)
		updateData.updated_at = new Date().toISOString()

		// If course_id changed, update course_code too
		if (updateData.course_id) {
			const { data: courseData } = await supabase
				.from('courses')
				.select('course_code')
				.eq('id', updateData.course_id)
				.single()
			if (!courseData) {
				return NextResponse.json({ error: 'Course not found' }, { status: 404 })
			}
			updateData.course_code = courseData.course_code
		}

		// Never allow changing institutions_id
		delete updateData.institutions_id

		const { data, error } = await supabase
			.from('course_mapping')
			.update(updateData)
			.eq('id', id)
			.select(COURSE_MAPPING_SELECT)
			.single()

		if (error) {
			console.error('Error updating course mapping:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({ data: mapCourseMappingToResponse(data, 'mapped') })
	} catch (error) {
		console.error('Course mapping PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

export const DELETE = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Mapping ID is required' }, { status: 400 })
		}

		// Verify access
		const { data: existing, error: existingError } = await supabase
			.from('course_mapping')
			.select('id, institutions_id')
			.eq('id', id)
			.single()

		if (existingError || !existing) {
			return NextResponse.json({ error: 'Course mapping not found' }, { status: 404 })
		}

		if (!checkInstitutionAccess(context, existing.institutions_id)) {
			return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
		}

		const { error: deleteError } = await supabase
			.from('course_mapping')
			.delete()
			.eq('id', id)

		if (deleteError) {
			console.error('Error deleting course mapping:', deleteError)
			return NextResponse.json({ error: deleteError.message }, { status: 400 })
		}

		return NextResponse.json({ data: { id, deleted: true } })
	} catch (error) {
		console.error('Course mapping DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
