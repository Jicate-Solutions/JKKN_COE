import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { handleDeleteWithDependencyCheck } from '@/lib/delete-helpers'
import type {
	StudentResultRow,
	GenerateFinalMarksPayload,
	GenerateFinalMarksResponse
} from '@/types/final-marks'

/**
 * Helper function to detect program type (UG/PG) from program code
 * This must match the database function get_program_type_from_code()
 * @param programCode - The program code (e.g., "BCA", "MSC", "24PCHC02")
 * @returns 'PG' for postgraduate programs, 'UG' for undergraduate
 */
function getProgramTypeFromCode(programCode?: string): 'UG' | 'PG' {
	if (!programCode) return 'UG'

	const upperCode = programCode.toUpperCase()

	// Check for common PG program prefixes
	// MSC, MBA, MCA, MA, MCom, MSW, MPhil, PhD, etc.
	const pgPrefixes = ['MSC', 'M.SC', 'M SC', 'MBA', 'MCA', 'MA', 'M.A', 'MCOM', 'M.COM', 'M COM', 'MSW', 'MPHIL', 'PHD', 'PH.D', 'MASTER', 'POST', 'PG']
	for (const prefix of pgPrefixes) {
		if (upperCode.startsWith(prefix)) {
			return 'PG'
		}
	}

	// Check for year-prefixed PG codes like "24PCHC02" where P after digits indicates PG
	// Pattern: 2 digits + P + letters = PG program
	const yearPrefixPgPattern = /^[0-9]{2}P[A-Z]/
	if (yearPrefixPgPattern.test(upperCode)) {
		return 'PG'
	}

	// Check for short PG program codes like "PCH" (P + 2-3 letters)
	// These are typically PG program abbreviations where P = Postgraduate
	// PCH = PG Chemistry, PMT = PG Mathematics, PCS = PG Computer Science, etc.
	const shortPgPattern = /^P[A-Z]{2,3}$/
	if (shortPgPattern.test(upperCode)) {
		return 'PG'
	}

	// Default to UG for all other patterns
	return 'UG'
}

/**
 * GET /api/grading/final-marks
 * Fetch data for the final marks generation page
 * Actions: institutions, sessions, programs (DEPRECATED), courses, course-offerings, grades, final-marks
 * NOTE: Programs should be fetched from MyJKKN API using useMyJKKNInstitutionFilter hook
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const action = searchParams.get('action')
		const supabase = getSupabaseServer()

		switch (action) {
			case 'institutions': {
				const { data, error } = await supabase
					.from('institutions')
					.select('id, name, institution_code, myjkkn_institution_ids')
					.eq('is_active', true)
					.order('name')

				if (error) {
					console.error('Error fetching institutions:', error)
					return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 400 })
				}
				return NextResponse.json(data || [])
			}

			case 'sessions': {
				const institutionId = searchParams.get('institutionId')
				if (!institutionId) {
					return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
				}

				const { data, error } = await supabase
					.from('examination_sessions')
					.select('id, session_name, session_code')
					.eq('institutions_id', institutionId)
					.order('session_name', { ascending: false })

				if (error) {
					console.error('Error fetching sessions:', error)
					return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 400 })
				}
				return NextResponse.json(data || [])
			}

			case 'programs': {
				// DEPRECATED: Programs should be fetched from MyJKKN API
				// The local 'programs' table no longer exists
				// Frontend should use useMyJKKNInstitutionFilter hook instead
				console.warn('[final-marks API] DEPRECATED: programs action called. Programs should be fetched from MyJKKN API.')
				return NextResponse.json([])
			}

			case 'course-offerings': {
				const institutionId = searchParams.get('institutionId')
				const programId = searchParams.get('programId') // MyJKKN UUID (for reference)
				const programCode = searchParams.get('programCode') // Text code like "BCA"
				const sessionId = searchParams.get('sessionId')

				if (!programCode) {
					return NextResponse.json({ error: 'Program code is required' }, { status: 400 })
				}

				// Filter course_offerings by program_code (text code like "BCA")
				// course_offerings maintains program_code separately
				let query = supabase
					.from('course_offerings')
					.select(`
						id,
						course_id,
						course_mapping_id,
						program_id,
						program_code,
						semester,
						section
					`)
					.eq('program_code', programCode)
					.eq('is_active', true)

				if (sessionId) {
					query = query.eq('examination_session_id', sessionId)
				}

				const { data: offerings, error } = await query.order('semester')

				if (error) {
					console.error('Error fetching course offerings:', error)
					return NextResponse.json({ error: 'Failed to fetch course offerings' }, { status: 400 })
				}

				// Get course_mapping IDs to fetch course details
				// course_offerings.course_mapping_id is the FK to course_mapping.id
				// course_offerings.course_id is a denormalized FK to courses.id (different!)
				const courseMappingIds = (offerings || []).map((o: any) => o.course_mapping_id).filter(Boolean)

				let courseMappingData: any[] = []
				if (courseMappingIds.length > 0) {
					const { data: mappingData, error: mappingError } = await supabase
						.from('course_mapping')
						.select(`
							id,
							course_id,
							course_code,
							courses (
								id,
								course_code,
								course_name,
								course_type,
								credit,
								evaluation_type
							)
						`)
						.in('id', courseMappingIds)

					if (mappingError) {
						console.error('Course mapping fetch error:', mappingError)
					} else {
						courseMappingData = mappingData || []
					}
				}

				// Create a map for quick lookup: course_mapping_id -> course details
				const courseMappingMap = new Map(
					courseMappingData.map((cm: any) => [
						cm.id,
						{
							course_id: cm.courses?.id || cm.course_id,
							course_code: cm.courses?.course_code || cm.course_code,
							course_name: cm.courses?.course_name || cm.courses?.course_code || cm.course_code,
							course_type: cm.courses?.course_type,
							credit: cm.courses?.credit,
							evaluation_type: cm.courses?.evaluation_type
						}
					])
				)

				// FALLBACK: For offerings without course_mapping_id, fetch directly from courses table
				// This handles cases where course_offerings only has course_id set
				const courseIdsWithoutMapping = (offerings || [])
					.filter((o: any) => !o.course_mapping_id && o.course_id)
					.map((o: any) => o.course_id)

				let directCoursesMap = new Map<string, any>()
				if (courseIdsWithoutMapping.length > 0) {
					const { data: directCourses, error: directCoursesError } = await supabase
						.from('courses')
						.select('id, course_code, course_name, course_type, credit, evaluation_type')
						.in('id', courseIdsWithoutMapping)

					if (directCoursesError) {
						console.error('Direct courses fetch error:', directCoursesError)
					} else if (directCourses) {
						directCoursesMap = new Map(
							directCourses.map((c: any) => [
								c.id,
								{
									course_id: c.id,
									course_code: c.course_code,
									course_name: c.course_name || c.course_code,
									course_type: c.course_type,
									credit: c.credit,
									evaluation_type: c.evaluation_type
								}
							])
						)
					}
				}

				// Check which courses already have final marks saved and their result_status
				// Map: course_id -> { is_saved: boolean, result_status: string }
				const courseStatusMap = new Map<string, { is_saved: boolean; result_status: string }>()
				if (institutionId && sessionId && offerings && offerings.length > 0) {
					// Get actual course IDs from course_mapping or directly from course_offerings
					const courseIds = offerings
						.map((co: any) => {
							const mapping = courseMappingMap.get(co.course_mapping_id)
							// Fallback to course_id from course_offerings if no mapping
							return mapping?.course_id || co.course_id
						})
						.filter(Boolean)

					if (courseIds.length > 0) {
						// IMPORTANT: final_marks holds one row PER learner-course, so a
						// program-session can easily exceed Supabase's default 1000-row
						// cap (28 courses x N learners). Without pagination, rows for
						// some courses fall past row 1000 and are missed, making those
						// courses wrongly appear unsaved/generatable in Step 2 — while
						// the POST regeneration check (scoped to the few selected
						// courses) still finds them and blocks. Paginate to stay consistent.
						const FM_PAGE_SIZE = 1000
						let savedMarks: any[] = []
						let fmPage = 0
						let fmHasMore = true
						while (fmHasMore) {
							const from = fmPage * FM_PAGE_SIZE
							const to = from + FM_PAGE_SIZE - 1
							const { data: fmRows, error: fmErr } = await supabase
								.from('final_marks')
								.select('course_id, result_status')
								.eq('institutions_id', institutionId)
								.eq('program_id', programId)
								.eq('examination_session_id', sessionId)
								.in('course_id', courseIds)
								.eq('is_active', true)
								.range(from, to)

							if (fmErr) {
								console.error('Error fetching saved final_marks for course-offerings:', fmErr)
								break
							}

							if (fmRows && fmRows.length > 0) {
								savedMarks.push(...fmRows)
								fmHasMore = fmRows.length === FM_PAGE_SIZE
								fmPage++
							} else {
								fmHasMore = false
							}
						}

						if (savedMarks) {
							// Group by course_id and get the most restrictive status
							// Priority: Published > Under Review > Withheld > Cancelled > Pending
							const statusPriority: Record<string, number> = {
								'Published': 5,
								'Under Review': 4,
								'Withheld': 3,
								'Cancelled': 2,
								'Pending': 1
							}

							savedMarks.forEach((m: any) => {
								const existing = courseStatusMap.get(m.course_id)
								const currentPriority = statusPriority[m.result_status] || 0
								const existingPriority = existing ? (statusPriority[existing.result_status] || 0) : 0

								if (!existing || currentPriority > existingPriority) {
									courseStatusMap.set(m.course_id, {
										is_saved: true,
										result_status: m.result_status
									})
								}
							})
						}
					}
				}

				// =========================================================
				// CIA ONLY COURSES: Check internal marks availability
				// For courses with evaluation_type = 'CIA', check if internal marks exist
				// =========================================================
				const allCourseIds = (offerings || []).map((co: any) => {
					const mapping = courseMappingMap.get(co.course_mapping_id)
					return mapping?.course_id || co.course_id
				}).filter(Boolean)

				// Check internal marks availability for all courses (useful for CIA courses)
				const internalMarksAvailability = new Map<string, { count: number; has_marks: boolean }>()
				if (institutionId && sessionId && allCourseIds.length > 0) {
					// internal_marks is also one row per learner-course; paginate past
					// the 1000-row cap so per-course counts (and CIA availability) are accurate.
					const IM_PAGE_SIZE = 1000
					let internalMarksCount: any[] = []
					let imPage = 0
					let imHasMore = true
					while (imHasMore) {
						const from = imPage * IM_PAGE_SIZE
						const to = from + IM_PAGE_SIZE - 1
						const { data: imRows, error: imErr } = await supabase
							.from('internal_marks')
							.select('course_id')
							.eq('institutions_id', institutionId)
							.eq('examination_session_id', sessionId)
							.in('course_id', allCourseIds)
							.eq('is_active', true)
							.range(from, to)

						if (imErr) {
							console.error('Error fetching internal_marks for course-offerings:', imErr)
							break
						}

						if (imRows && imRows.length > 0) {
							internalMarksCount.push(...imRows)
							imHasMore = imRows.length === IM_PAGE_SIZE
							imPage++
						} else {
							imHasMore = false
						}
					}

					if (internalMarksCount) {
						// Count internal marks per course
						const countMap = new Map<string, number>()
						internalMarksCount.forEach((im: any) => {
							countMap.set(im.course_id, (countMap.get(im.course_id) || 0) + 1)
						})
						countMap.forEach((count, courseId) => {
							internalMarksAvailability.set(courseId, { count, has_marks: count > 0 })
						})
					}
				}

				// =========================================================
				// REGISTRATION CHECK: A course_offering can exist for a session
				// with ZERO learners registered (no exam_registrations). Such a
				// course is NOT registered in this session and must not appear as
				// generatable. We mirror the generation step, which treats
				// exam_registrations as the source of truth for who is registered.
				// This applies to ALL courses, including CIA-only — every course
				// requires exam registration to be generatable in this session.
				// =========================================================
				const registeredOfferingIds = new Set<string>()
				let registrationCheckOk = false
				const offeringIds = (offerings || []).map((o: any) => o.id).filter(Boolean)
				if (sessionId && offeringIds.length > 0) {
					const REG_PAGE_SIZE = 1000
					let regPage = 0
					let regHasMore = true
					registrationCheckOk = true
					while (regHasMore) {
						const from = regPage * REG_PAGE_SIZE
						const to = from + REG_PAGE_SIZE - 1
						const { data: regRows, error: regErr } = await supabase
							.from('exam_registrations')
							.select('course_offering_id')
							.eq('examination_session_id', sessionId)
							.in('course_offering_id', offeringIds)
							.range(from, to)

						if (regErr) {
							console.error('Error fetching exam registrations for course-offerings filter:', regErr)
							// On error, fall back to showing all offerings (old behavior)
							// rather than silently hiding every non-CIA course.
							registrationCheckOk = false
							break
						}

						if (regRows && regRows.length > 0) {
							regRows.forEach((r: any) => r.course_offering_id && registeredOfferingIds.add(r.course_offering_id))
							regHasMore = regRows.length === REG_PAGE_SIZE
							regPage++
						} else {
							regHasMore = false
						}
					}
				}

				// Transform to flatten course data and include result_status
				const transformed = (offerings || []).map((co: any) => {
					// Try course_mapping first, then fallback to direct courses lookup
					let courseDetails = courseMappingMap.get(co.course_mapping_id)
					if (!courseDetails && co.course_id) {
						courseDetails = directCoursesMap.get(co.course_id)
					}
					courseDetails = courseDetails || {}

					const actualCourseId = courseDetails.course_id || co.course_id
					const status = courseStatusMap.get(actualCourseId)
					const evalType = courseDetails.evaluation_type?.toUpperCase() || ''
					const isCIAOnly = evalType === 'CIA' || evalType === 'CIA ONLY'
					const internalStatus = internalMarksAvailability.get(actualCourseId)

					return {
						id: co.id,
						course_id: actualCourseId,
						course_mapping_id: co.course_mapping_id,
						program_id: co.program_id,
						semester: co.semester,
						section: co.section,
						course_code: courseDetails.course_code,
						course_name: courseDetails.course_name || courseDetails.course_code,
						course_type: courseDetails.course_type,
						credits: courseDetails.credit,
						evaluation_type: courseDetails.evaluation_type,
						is_cia_only: isCIAOnly,
						is_saved: status?.is_saved || false,
						result_status: status?.result_status || null,
						// Can regenerate only if no results exist for this course
						// Once results are saved, regeneration is blocked regardless of status
						can_regenerate: !status,
						// Internal marks info (especially useful for CIA courses)
						has_internal_marks: internalStatus?.has_marks || false,
						internal_marks_count: internalStatus?.count || 0,
						// Whether any learner is registered for this offering in this session
						has_registrations: registeredOfferingIds.has(co.id)
					}
				})

				// Exclude offerings with no learner registrations in this session.
				// Every course (including CIA-only) requires exam registration to be
				// generatable. If the registration check failed, keep all offerings
				// to avoid hiding valid courses.
				const filtered = registrationCheckOk
					? transformed.filter((co: any) => co.has_registrations)
					: transformed

				return NextResponse.json(filtered)
			}

			case 'courses': {
				const institutionId = searchParams.get('institutionId')
				const programId = searchParams.get('programId')

				if (!institutionId) {
					return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
				}

				let query = supabase
					.from('courses')
					.select(`
						id,
						course_code,
						course_type,
						credit
					`)
					.eq('institutions_id', institutionId)
					.eq('is_active', true)

				const { data, error } = await query.order('course_code')

				if (error) {
					console.error('Error fetching courses:', error)
					return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 400 })
				}
				return NextResponse.json(data || [])
			}

			case 'grades': {
				const institutionId = searchParams.get('institutionId')
				const regulationId = searchParams.get('regulationId')

				if (!institutionId) {
					return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
				}

				let query = supabase
					.from('grades')
					.select('*')
					.eq('institutions_id', institutionId)

				if (regulationId) {
					query = query.eq('regulation_id', regulationId)
				}

				const { data, error } = await query.order('min_mark', { ascending: false })

				if (error) {
					console.error('Error fetching grades:', error)
					return NextResponse.json({ error: 'Failed to fetch grades' }, { status: 400 })
				}
				return NextResponse.json(data || [])
			}

			case 'final-marks': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const programId = searchParams.get('programId')
				const courseId = searchParams.get('courseId')
				const resultStatus = searchParams.get('resultStatus')

				if (!institutionId) {
					return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
				}

				let query = supabase
					.from('final_marks_detailed_view')
					.select('*')
					.eq('institutions_id', institutionId)
					.eq('is_active', true)

				if (sessionId) query = query.eq('examination_session_id', sessionId)
				if (programId) query = query.eq('program_id', programId)
				if (courseId) query = query.eq('course_id', courseId)
				if (resultStatus) query = query.eq('result_status', resultStatus)

				const { data, error } = await query.order('created_at', { ascending: false })

				if (error) {
					console.error('Error fetching final marks:', error)
					return NextResponse.json({ error: 'Failed to fetch final marks' }, { status: 400 })
				}
				return NextResponse.json(data || [])
			}

			case 'exam-registrations': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const programId = searchParams.get('programId')

				if (!institutionId || !sessionId) {
					return NextResponse.json({ error: 'Institution ID and Session ID are required' }, { status: 400 })
				}

				let query = supabase
					.from('exam_registrations')
					.select(`
						id,
						stu_register_no,
						student_id,
						student_name,
						course_offering_id,
						examination_session_id,
						institutions_id,
						course_offerings!inner (
							id,
							course_id,
							program_id,
							semester,
							courses!inner (
								id,
								course_code,
								course_type,
								credit
							)
						)
					`)
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)

				if (programId) {
					query = query.eq('course_offerings.program_id', programId)
				}

				const { data, error } = await query.range(0, 19999) // Override Supabase's default 1000-row limit

				if (error) {
					console.error('Error fetching exam registrations:', error)
					return NextResponse.json({ error: 'Failed to fetch exam registrations' }, { status: 400 })
				}
				return NextResponse.json(data || [])
			}

			default: {
				// Handle direct query by exam_registration_id (for revaluation dialog)
				const examRegistrationId = searchParams.get('exam_registration_id')
				if (examRegistrationId) {
					const { data, error } = await supabase
						.from('final_marks')
						.select(`
							*,
							courses:course_id (
								id,
								course_code,
								course_name,
								course_type,
								course_category
							)
						`)
						.eq('exam_registration_id', examRegistrationId)
						.eq('is_active', true)
						.order('created_at', { ascending: false })

					if (error) {
						console.error('Error fetching final marks by exam registration:', error)
						return NextResponse.json({ error: 'Failed to fetch final marks' }, { status: 400 })
					}
					return NextResponse.json(data || [])
				}

				return NextResponse.json({ error: 'Invalid action or missing parameters' }, { status: 400 })
			}
		}
	} catch (error) {
		console.error('Final marks API GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * POST /api/grading/final-marks
 * Generate final marks for selected courses
 * HOTFIX: Grade point calculation uses percentage / 10 for all courses
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body: GenerateFinalMarksPayload = await request.json()

		const {
			institutions_id,
			program_id,
			program_code: providedProgramCode,
			examination_session_id,
			course_ids,
			regulation_id,
			grade_system_code,
			calculated_by,
			save_to_db = false
		} = body

		// Validate required fields
		if (!institutions_id || !program_id || !examination_session_id || !course_ids?.length) {
			return NextResponse.json({
				error: 'Missing required fields: institutions_id, program_id, examination_session_id, course_ids'
			}, { status: 400 })
		}

		// program_code must be provided from MyJKKN API (no local programs table fallback)
		const programCode = providedProgramCode
		if (!programCode) {
			return NextResponse.json({
				error: 'program_code is required. It must be provided from MyJKKN API since the local programs table no longer exists.'
			}, { status: 400 })
		}

		// =========================================================
		// PROGRAM TYPE DETECTION: Detect UG/PG from program code
		// If grade_system_code is not provided, auto-detect from program_code
		// This ensures PG programs use 50% pass mark, UG use 40%
		// =========================================================
		const detectedProgramType = getProgramTypeFromCode(programCode)
		const effectiveGradeSystemCode = grade_system_code || detectedProgramType
		console.log(`[Final Marks] Program ${programCode}: Detected type=${detectedProgramType}, Provided=${grade_system_code}, Using=${effectiveGradeSystemCode}`)

		// =========================================================
		// BUSINESS RULE: Check if results already exist
		// Generation is ONLY allowed when NO records exist for the course
		// Once results are saved, regeneration is blocked regardless of status
		// =========================================================
		const { data: existingResults, error: existingError } = await supabase
			.from('final_marks')
			.select('course_id, result_status')
			.eq('institutions_id', institutions_id)
			.eq('program_id', program_id)
			.eq('examination_session_id', examination_session_id)
			.in('course_id', course_ids)
			.eq('is_active', true)

		if (existingError) {
			console.error('Error checking existing results:', existingError)
		}

		// If any course has saved results, block regeneration
		if (existingResults && existingResults.length > 0) {
			// Get unique course IDs with saved results
			const blockedCourseIds = [...new Set(existingResults.map(r => r.course_id))]
			const blockedStatuses = [...new Set(existingResults.map(r => r.result_status))]

			return NextResponse.json({
				error: `Cannot regenerate results. ${blockedCourseIds.length} course(s) already have saved results (status: ${blockedStatuses.join(', ')}). Once results are saved, regeneration is not allowed.`,
				blocked_courses: blockedCourseIds,
				blocked_statuses: blockedStatuses
			}, { status: 400 })
		}

		// 1. Fetch grade_system table with grades info for percentage-based grading
		let gradesQuery = supabase
			.from('grade_system')
			.select(`
				id,
				grade_system_code,
				grade,
				grade_point,
				min_mark,
				max_mark,
				description,
				grades:grade_id (
					id,
					qualify,
					is_absent,
					exclude_cgpa,
					result_status
				)
			`)
			.eq('institutions_id', institutions_id)
			.eq('is_active', true)

		if (regulation_id) {
			gradesQuery = gradesQuery.eq('regulation_id', regulation_id)
		}
		// Use effectiveGradeSystemCode (auto-detected from program_code if not provided)
		if (effectiveGradeSystemCode) {
			gradesQuery = gradesQuery.eq('grade_system_code', effectiveGradeSystemCode)
		}

		const { data: grades, error: gradesError } = await gradesQuery.order('min_mark', { ascending: false })

		if (gradesError || !grades?.length) {
			console.error('Grade system error:', gradesError)
			return NextResponse.json({
				error: 'No grade system found. Please configure grades first.'
			}, { status: 400 })
		}

		// 2. First, get course codes for the given course IDs
		// course_ids from frontend are courses.id (UUIDs)
		// We need to get course_codes to filter course_offerings
		console.log('[Final Marks] Received course_ids from frontend:', course_ids)

		const { data: coursesData } = await supabase
			.from('courses')
			.select('id, course_code')
			.in('id', course_ids)

		console.log('[Final Marks] Found courses in DB:', coursesData?.length || 0, coursesData?.map((c: any) => c.course_code))

		const courseCodes = (coursesData || []).map((c: any) => c.course_code).filter(Boolean)

		if (courseCodes.length === 0) {
			return NextResponse.json({
				error: 'No courses found for the selected course IDs.'
			}, { status: 400 })
		}

		// Create a map of course_code -> course_id for later use
		const courseCodeToIdMap = new Map(
			(coursesData || []).map((c: any) => [c.course_code, c.id])
		)

		// 3. Fetch exam registrations with course_offerings
		// NOTE: Don't filter by program_code here because courses can be shared across programs
		// Instead, filter by course_code and let the course selection determine which courses to include
		console.log('[Final Marks] Query params:')
		console.log('  - institutions_id:', institutions_id)
		console.log('  - examination_session_id:', examination_session_id)
		console.log('  - program_code (for reference):', programCode)
		console.log('  - course_codes:', courseCodes)

		// Step 1: Get exam_registrations for the program
		// Note: We'll fetch course details separately since course_offerings.course_code may not be populated
		// IMPORTANT: Use pagination to overcome Supabase's 1000-row server limit
		// PAGE_SIZE must match server's max-rows limit for pagination to detect more pages
		const PAGE_SIZE = 1000
		let examRegsRaw: any[] = []
		let page = 0
		let hasMore = true

		while (hasMore) {
			const from = page * PAGE_SIZE
			const to = from + PAGE_SIZE - 1

			const { data: pageData, error: pageError } = await supabase
				.from('exam_registrations')
				.select(`
					id,
					stu_register_no,
					student_id,
					student_name,
					course_offering_id,
					examination_session_id,
					institutions_id,
					program_code,
					course_offerings (
						id,
						course_id,
						course_mapping_id,
						program_id,
						program_code,
						course_code,
						semester
					)
				`)
				.eq('institutions_id', institutions_id)
				.eq('examination_session_id', examination_session_id)
				.eq('program_code', programCode)
				.range(from, to)

			if (pageError) {
				console.error('Error fetching exam registrations page', page, ':', pageError)
				return NextResponse.json({ error: 'Failed to fetch exam registrations' }, { status: 400 })
			}

			if (pageData && pageData.length > 0) {
				examRegsRaw.push(...pageData)
				// If we got fewer records than PAGE_SIZE, we've reached the end
				hasMore = pageData.length === PAGE_SIZE
				page++
			} else {
				hasMore = false
			}
		}

		console.log('[Final Marks] Raw exam registrations for program:', examRegsRaw.length, '(fetched in', page, 'pages)')

		// Step 1a: Get all course_mapping_ids and course_ids from the exam registrations
		// to resolve course codes for filtering
		const allCourseMappingIds = [...new Set(
			(examRegsRaw || []).map((er: any) => er.course_offerings?.course_mapping_id).filter(Boolean)
		)]
		const allDirectCourseIds = [...new Set(
			(examRegsRaw || []).map((er: any) => er.course_offerings?.course_id).filter(Boolean)
		)]

		// Fetch course_mapping to get course_id and course_code
		let courseMappingToCodeMap = new Map<string, { course_id: string; course_code: string }>()
		if (allCourseMappingIds.length > 0) {
			const { data: cmData } = await supabase
				.from('course_mapping')
				.select('id, course_id, course_code')
				.in('id', allCourseMappingIds)

			cmData?.forEach((cm: any) => {
				courseMappingToCodeMap.set(cm.id, { course_id: cm.course_id, course_code: cm.course_code })
			})
		}

		// Fetch courses directly for course_code lookup (fallback)
		let directCourseCodeMap = new Map<string, string>()
		if (allDirectCourseIds.length > 0) {
			const { data: courseData } = await supabase
				.from('courses')
				.select('id, course_code')
				.in('id', allDirectCourseIds)

			courseData?.forEach((c: any) => {
				directCourseCodeMap.set(c.id, c.course_code)
			})
		}

		console.log('[Final Marks] Course mapping to code map size:', courseMappingToCodeMap.size)
		console.log('[Final Marks] Direct course code map size:', directCourseCodeMap.size)

		// Step 2: Filter by course_code client-side
		// Get course_code from: course_offerings.course_code OR course_mapping.course_code OR courses.course_code
		// Using 'let' to allow adding CIA virtual registrations later
		let examRegistrations = (examRegsRaw || []).filter((er: any) => {
			const co = er.course_offerings
			if (!co) return false

			// Try to get course_code from multiple sources
			let courseCode = co.course_code // Direct from course_offerings

			// If not available, try course_mapping
			if (!courseCode && co.course_mapping_id) {
				const mapping = courseMappingToCodeMap.get(co.course_mapping_id)
				courseCode = mapping?.course_code
			}

			// If still not available, try direct courses lookup
			if (!courseCode && co.course_id) {
				courseCode = directCourseCodeMap.get(co.course_id)
			}

			// Store resolved course_code back on the object for later use
			if (courseCode) {
				co._resolved_course_code = courseCode
			}

			return courseCode && courseCodes.includes(courseCode)
		})

		// =========================================================
		// CIA ONLY COURSES: Fallback to internal_marks for student list
		// CIA courses don't have external exams, so no exam_registrations exist.
		// For these courses, we fetch students from internal_marks instead.
		// =========================================================

		// Check if selected courses are CIA only
		const { data: selectedCoursesInfo } = await supabase
			.from('courses')
			.select('id, course_code, evaluation_type')
			.in('id', course_ids)

		const ciaOnlyCourseIds = (selectedCoursesInfo || [])
			.filter((c: any) => {
				const evalType = c.evaluation_type?.toUpperCase() || ''
				return evalType === 'CIA' || evalType === 'CIA ONLY'
			})
			.map((c: any) => c.id)

		const hasCIAOnlyCourses = ciaOnlyCourseIds.length > 0
		console.log('[Final Marks] CIA only courses detected:', ciaOnlyCourseIds.length, 'of', course_ids.length)

		// =========================================================
		// CIA COURSES: Always check for CIA courses that need virtual registrations
		// This runs ALWAYS when there are CIA courses, not just when examRegistrations is empty
		// =========================================================
		if (hasCIAOnlyCourses) {
			// Find which CIA courses already have exam registrations
			const ciaCourseCodesInRegs = new Set(
				examRegistrations
					.filter((er: any) => {
						const courseId = er.course_offerings?.course_id
						return ciaOnlyCourseIds.includes(courseId)
					})
					.map((er: any) => er.course_offerings?.course_id)
			)

			// CIA courses that DON'T have exam registrations yet
			const ciaCourseIdsWithoutRegs = ciaOnlyCourseIds.filter(
				(id: string) => !ciaCourseCodesInRegs.has(id)
			)

			console.log('[Final Marks] CIA courses without exam registrations:', ciaCourseIdsWithoutRegs.length)

			if (ciaCourseIdsWithoutRegs.length > 0) {
				console.log('[Final Marks] Fetching students from internal_marks for CIA courses without registrations')
				console.log('[Final Marks] CIA: Filtering by program_code:', programCode)

				// Fetch internal marks for CIA courses filtered by program_code directly
				// internal_marks table has program_code field, so filter on it directly
				const { data: ciaInternalMarks, error: ciaError } = await supabase
					.from('internal_marks')
					.select(`
						id,
						student_id,
						course_id,
						total_internal_marks,
						institutions_id,
						program_code,
						exam_registrations!inner (
							student_id,
							stu_register_no,
							student_name,
							program_code
						)
					`)
					.eq('institutions_id', institutions_id)
					.in('course_id', ciaCourseIdsWithoutRegs)
					.eq('is_active', true)
					.eq('program_code', programCode)
					.range(0, 19999) // Override Supabase's default 1000-row limit

				if (ciaError) {
					console.error('[Final Marks] Error fetching CIA internal marks:', ciaError)
					console.error('[Final Marks] CIA error details:', JSON.stringify(ciaError, null, 2))
				}

				console.log('[Final Marks] CIA: Raw internal marks fetched:', ciaInternalMarks?.length || 0)

				if (ciaInternalMarks && ciaInternalMarks.length > 0) {
					console.log('[Final Marks] Found', ciaInternalMarks.length, 'internal marks for CIA courses (filtered by program)')

					// Build students map directly from the joined data
					// Deduplicate by student_id (same student may have multiple internal marks or registrations)
					const studentsMap = new Map<string, any>()
					ciaInternalMarks.forEach((im: any) => {
						const er = im.exam_registrations
						if (er && !studentsMap.has(im.student_id)) {
							studentsMap.set(im.student_id, {
								id: im.student_id,
								register_number: er.stu_register_no,
								learner_name: er.student_name,
								program_code: er.program_code
							})
						}
					})

					console.log('[Final Marks] CIA: Found', ciaInternalMarks.length, 'internal marks records')
					console.log('[Final Marks] CIA: Found', studentsMap.size, 'unique students with exam registrations')

					// Get course_offering for these CIA courses
					const { data: ciaOfferings } = await supabase
						.from('course_offerings')
						.select('id, course_id, course_mapping_id, program_id, program_code, course_code, semester')
						.eq('examination_session_id', examination_session_id)
						.eq('program_code', programCode)
						.in('course_id', ciaCourseIdsWithoutRegs)

					const ciaOfferingsMap = new Map(
						(ciaOfferings || []).map((co: any) => [co.course_id, co])
					)

					// Create virtual exam registration records for CIA courses
					const ciaExamRegistrations: any[] = []
					const processedKeys = new Set<string>() // Prevent duplicates

					for (const im of ciaInternalMarks) {
						const key = `${im.student_id}|${im.course_id}`
						if (processedKeys.has(key)) continue
						processedKeys.add(key)

						const student = studentsMap.get(im.student_id)
						const courseOffering = ciaOfferingsMap.get(im.course_id)

						if (student && courseOffering) {
							ciaExamRegistrations.push({
								id: `cia-virtual-${im.id}`, // Virtual ID for CIA courses
								stu_register_no: student.register_number,
								student_id: im.student_id,
								student_name: student.learner_name,
								course_offering_id: courseOffering.id,
								examination_session_id: examination_session_id,
								institutions_id: institutions_id,
								program_code: programCode,
								course_offerings: {
									id: courseOffering.id,
									course_id: courseOffering.course_id,
									course_mapping_id: courseOffering.course_mapping_id,
									program_id: courseOffering.program_id,
									program_code: courseOffering.program_code,
									course_code: courseOffering.course_code,
									semester: courseOffering.semester,
									_resolved_course_code: courseOffering.course_code,
									_is_cia_only: true
								}
							})
						}
					}

					if (ciaExamRegistrations.length > 0) {
						console.log('[Final Marks] Created', ciaExamRegistrations.length, 'virtual exam registrations for CIA courses')
						// Continue processing with CIA virtual registrations
						examRegistrations.push(...ciaExamRegistrations)
					}
				}
			}
		}

		// If still no registrations after CIA fallback, return error
		if (!examRegistrations?.length) {
			// Debug: show what course codes we found
			const availableCodes = (examRegsRaw || []).map((er: any) => {
				const co = er.course_offerings
				if (!co) return null
				let code = co.course_code
				if (!code && co.course_mapping_id) {
					const mapping = courseMappingToCodeMap.get(co.course_mapping_id)
					code = mapping?.course_code
				}
				if (!code && co.course_id) {
					code = directCourseCodeMap.get(co.course_id)
				}
				return code
			}).filter(Boolean)
			console.log('[Final Marks] Available course_codes in exam_regs:', [...new Set(availableCodes)])
			console.log('[Final Marks] Requested course_codes:', courseCodes)

			// Provide more helpful error message for CIA courses
			if (hasCIAOnlyCourses) {
				return NextResponse.json({
					error: 'No internal marks found for the selected CIA courses. Please ensure internal marks have been entered for these courses.'
				}, { status: 400 })
			}

			return NextResponse.json({
				error: 'No exam registrations found for the selected courses and session.'
			}, { status: 400 })
		}

		console.log('[Final Marks] Exam registrations found after course filter:', examRegistrations.length)
		console.log('[Final Marks] Sample exam reg:', JSON.stringify(examRegistrations[0], null, 2))

		// 3a. Fetch course_mapping data for the course offerings
		// course_offerings.course_id references course_mapping.id
		// NOTE: course_offerings has both course_id (FK to course_mapping) and course_mapping_id
		const courseMappingIds = [...new Set(
			examRegistrations.map((er: any) => er.course_offerings?.course_mapping_id || er.course_offerings?.course_id).filter(Boolean)
		)]

		console.log('[Final Marks] Course mapping IDs to fetch:', courseMappingIds)

		const { data: courseMappingData } = await supabase
			.from('course_mapping')
			.select(`
				id,
				course_id,
				course_code
			`)
			.in('id', courseMappingIds)

		// Create course_mapping lookup map: course_mapping.id -> mapping data
		const courseMappingMap = new Map<string, any>()
		courseMappingData?.forEach((cm: any) => {
			courseMappingMap.set(cm.id, cm)
		})

		console.log('[Final Marks] Course mappings found:', courseMappingData?.length || 0)
		console.log('[Final Marks] Sample course mapping:', courseMappingData?.[0])

		// 3b. Fetch course details for the course_mapping entries
		// Also include direct course_ids from course_offerings as fallback
		const actualCourseIds = [...new Set([
			...(courseMappingData || []).map((cm: any) => cm.course_id).filter(Boolean),
			// FALLBACK: If course_mapping lookup fails, course_offerings.course_id might directly reference courses.id
			...examRegistrations.map((er: any) => er.course_offerings?.course_id).filter(Boolean)
		])]

		console.log('[Final Marks] Actual course IDs to fetch:', actualCourseIds)

		const { data: courseDetails } = await supabase
			.from('courses')
			.select(`
				id,
				course_code,
				course_name,
				course_type,
				credit,
				evaluation_type,
				result_type,
				internal_max_mark,
				internal_pass_mark,
				internal_converted_mark,
				external_max_mark,
				external_pass_mark,
				external_converted_mark,
				total_max_mark,
				total_pass_mark
			`)
			.in('id', actualCourseIds)

		// Create courses lookup map: courses.id -> course data
		const coursesMap = new Map<string, any>()
		courseDetails?.forEach((c: any) => {
			coursesMap.set(c.id, c)
		})

		console.log('[Final Marks] Courses found:', courseDetails?.length || 0)
		console.log('[Final Marks] Sample course:', courseDetails?.[0])

		// 4. Fetch internal marks for these students/courses
		// NOTE: NOT filtering by examination_session_id because internal marks are entered once
		// and should be reused across exam sessions (including reappear scenarios)
		// IMPORTANT: Batch the query to avoid "Bad Request" error with large IN clauses
		const INTERNAL_BATCH_SIZE = 200
		const studentIds = [...new Set(examRegistrations.map((er: any) => er.student_id))]
		const internalMarks: any[] = []

		console.log('[Final Marks] Unique students to fetch internal marks:', studentIds.length)
		console.log('[Final Marks] Course IDs for internal marks filter:', course_ids)

		for (let i = 0; i < studentIds.length; i += INTERNAL_BATCH_SIZE) {
			const batchStudentIds = studentIds.slice(i, i + INTERNAL_BATCH_SIZE)
			const batchNum = Math.floor(i / INTERNAL_BATCH_SIZE) + 1
			console.log(`[Final Marks] Internal marks batch ${batchNum}: ${batchStudentIds.length} students`)

			const { data: batchMarks, error: batchError } = await supabase
				.from('internal_marks')
				.select('*')
				.eq('institutions_id', institutions_id)
				.in('student_id', batchStudentIds)
				.in('course_id', course_ids)
				.eq('is_active', true)
				.order('created_at', { ascending: false })
				.range(0, 19999)

			if (batchError) {
				console.error(`Error fetching internal marks batch ${batchNum}:`, batchError)
			} else if (batchMarks) {
				console.log(`[Final Marks] Batch ${batchNum} returned ${batchMarks.length} internal marks`)
				internalMarks.push(...batchMarks)
			}
		}

		// Create internal marks lookup map: student_id + course_id -> marks
		// If multiple internal marks exist for same student+course, use the most recent (first in sorted results)
		const internalMarksMap = new Map<string, any>()
		internalMarks?.forEach((im: any) => {
			const key = `${im.student_id}|${im.course_id}`
			if (!internalMarksMap.has(key)) {
				internalMarksMap.set(key, im)
			}
		})

		console.log('[Final Marks] Internal marks found:', internalMarks?.length || 0)
		console.log('[Final Marks] Unique student-course pairs in map:', internalMarksMap.size)
		if (internalMarks && internalMarks.length > internalMarksMap.size) {
			console.log('[Final Marks] Note: Multiple internal marks found for same student-course pairs (using most recent)')
		}

		// Debug: Check if specific test student's marks are in the map
		const testStudentId = '09585567-4f53-4dc5-a542-31eb06ac1b03' // BALANATHAN I (24JUGCCA006)
		const testCourseId = '74983239-7595-4236-9d96-d2a1bfe3572b' // 24UCCS01
		const testKey = `${testStudentId}|${testCourseId}`
		const testMark = internalMarksMap.get(testKey)
		console.log(`[Final Marks] DEBUG: Test student (24JUGCCA006) internal mark for 24UCCS01:`, testMark ? testMark.total_internal_marks : 'NOT FOUND')
		if (!testMark) {
			// Check if student is in studentIds
			const studentInList = studentIds.includes(testStudentId)
			console.log(`[Final Marks] DEBUG: Test student in studentIds list: ${studentInList}`)
			// Check if any internal marks exist for this student
			const studentMarks = internalMarks.filter((im: any) => im.student_id === testStudentId)
			console.log(`[Final Marks] DEBUG: Internal marks for test student: ${studentMarks.length}`, studentMarks.map((m: any) => ({ course_id: m.course_id, marks: m.total_internal_marks })))
		}

		// 4. Fetch external marks (marks_entry table)
		// IMPORTANT: Batch the query to avoid "Bad Request" error with large IN clauses
		const BATCH_SIZE = 200
		const examRegIds = examRegistrations.map((er: any) => er.id)
		const externalMarks: any[] = []

		for (let i = 0; i < examRegIds.length; i += BATCH_SIZE) {
			const batchIds = examRegIds.slice(i, i + BATCH_SIZE)
			const { data: batchMarks, error: batchError } = await supabase
				.from('marks_entry')
				.select('*, grade')
				.in('exam_registration_id', batchIds)

			if (batchError) {
				console.error('Error fetching external marks batch:', batchError)
			} else if (batchMarks) {
				externalMarks.push(...batchMarks)
			}
		}

		console.log('[Final Marks] External marks found:', externalMarks.length)

		// Create external marks lookup map: exam_registration_id -> marks
		const externalMarksMap = new Map<string, any>()
		externalMarks?.forEach((em: any) => {
			externalMarksMap.set(em.exam_registration_id, em)
		})

		// 5. Fetch exam attendance records for absence checking
		// NOTE: Only attendance_status column exists (is_absent column doesn't exist)
		// IMPORTANT: exam_attendance is per course per student, so we need composite key for lookup
		// Batch the query to avoid "Bad Request" error with large IN clauses
		const examAttendance: any[] = []

		for (let i = 0; i < examRegIds.length; i += BATCH_SIZE) {
			const batchIds = examRegIds.slice(i, i + BATCH_SIZE)
			const { data: batchAttendance, error: batchError } = await supabase
				.from('exam_attendance')
				.select('id, exam_registration_id, course_id, attendance_status')
				.in('exam_registration_id', batchIds)

			if (batchError) {
				console.error('Error fetching exam attendance batch:', batchError)
			} else if (batchAttendance) {
				examAttendance.push(...batchAttendance)
			}
		}

		console.log('[Final Marks] Exam attendance records found:', examAttendance.length)
		console.log('[Final Marks] examRegIds count:', examRegIds.length)
		if (examAttendance.length > 0) {
			console.log('[Final Marks] Sample attendance record:', examAttendance[0])
		}

		// Create exam attendance lookup map: exam_registration_id|course_id -> attendance record
		// Using composite key because attendance is recorded per course per student
		const examAttendanceMap = new Map<string, any>()
		examAttendance.forEach((ea: any) => {
			const key = `${ea.exam_registration_id}|${ea.course_id}`
			examAttendanceMap.set(key, ea)
		})

		// 6. Process each exam registration and calculate final marks
		const results: StudentResultRow[] = []
		const errors: Array<{
			student_id: string
			student_name: string
			register_no: string
			course_code: string
			error: string
		}> = []

		const summary = {
			passed: 0,
			failed: 0,
			absent: 0,
			reappear: 0,
			withheld: 0,
			distinction: 0,
			first_class: 0,
			skipped_no_attendance: 0,
			skipped_missing_marks: 0
		}

		// Track skipped records for reporting
		const skippedRecords: Array<{
			student_name: string
			register_no: string
			course_code: string
			reason: string
		}> = []

		let skippedNoCourse = 0
		let skippedNoMapping = 0

		// =========================================================
		// STATUS PAPER VALIDATION: Define valid status values
		// =========================================================
		const VALID_STATUS_GRADES = ['Commended', 'Highly Commended', 'AAA'] as const
		type StatusGrade = typeof VALID_STATUS_GRADES[number]

		function isValidStatusGrade(grade: any): grade is StatusGrade {
			return typeof grade === 'string' && VALID_STATUS_GRADES.includes(grade as StatusGrade)
		}

		function getFinalGradeForStatusPaper(
			course: any,
			internalMark: any,
			externalMark: any,
			attendanceRecord: any
		): { grade: StatusGrade; isPass: boolean; failReason: 'EXTERNAL' | null } {
			const courseEvalType = course.evaluation_type?.toUpperCase() || ''
			const isCIAOnly = courseEvalType === 'CIA' || courseEvalType === 'CIA ONLY'
			const isExternalOnly = courseEvalType === 'ESE' || courseEvalType === 'ESE ONLY' || courseEvalType === 'EXTERNAL'

			let finalGrade: StatusGrade
			let isPass = true
			let failReason: 'EXTERNAL' | null = null

			if (isCIAOnly) {
				if (!internalMark || !internalMark.grade) {
					throw new Error('Missing internal grade for CIA status paper')
				}
				if (!isValidStatusGrade(internalMark.grade)) {
					throw new Error(`Invalid internal status grade: ${internalMark.grade}`)
				}
				finalGrade = internalMark.grade
			} else if (isExternalOnly) {
				const isAbsent = attendanceRecord?.attendance_status?.toLowerCase() === 'absent'
				if (isAbsent) {
					finalGrade = 'AAA'
					isPass = false
					failReason = 'EXTERNAL'
				} else {
					if (!externalMark || !externalMark.grade) {
						throw new Error('Missing external grade for external status paper')
					}
					if (!isValidStatusGrade(externalMark.grade)) {
						throw new Error(`Invalid external status grade: ${externalMark.grade}`)
					}
					finalGrade = externalMark.grade
				}
			} else {
				throw new Error(`Invalid evaluation_type "${course.evaluation_type}" for status-based paper`)
			}

			if (finalGrade === 'AAA') {
				isPass = false
				failReason = 'EXTERNAL'
			}

			return { grade: finalGrade, isPass, failReason }
		}

		for (const examReg of examRegistrations) {
			const courseOffering = (examReg as any).course_offerings
			// Look up course_mapping and course from our maps
			// course_offerings.course_mapping_id is the FK to course_mapping.id
			// FALLBACK: course_offerings.course_id might directly reference courses.id in some setups
			const courseMappingId = courseOffering?.course_mapping_id || courseOffering?.course_id
			const courseMapping = courseMappingMap.get(courseMappingId)

			// Get course: try through course_mapping first, then directly from course_id
			let course = courseMapping ? coursesMap.get(courseMapping.course_id) : null

			// FALLBACK: If course_mapping lookup fails, try direct course_id lookup
			if (!course && courseOffering?.course_id) {
				course = coursesMap.get(courseOffering.course_id)
			}

			// If still no course, skip with appropriate counter
			if (!courseMapping && !course) {
				skippedNoMapping++
				continue
			}
			if (!course) {
				skippedNoCourse++
				continue
			}

			const internalKey = `${examReg.student_id}|${course.id}`
			const internalMark = internalMarksMap.get(internalKey)
			const externalMark = externalMarksMap.get(examReg.id)
			// Use composite key for attendance lookup (exam_registration_id|course_id)
			const attendanceKey = `${examReg.id}|${course.id}`
			const attendanceRecord = examAttendanceMap.get(attendanceKey)

			// =========================================================
			// CREDIT COURSE HANDLING: Auto-grant full credit
			// Condition: result_type = 'Credit'
			// No internal/external marks needed, no attendance check
			// =========================================================
			const courseResultType = course.result_type?.toUpperCase() || 'MARK'

			if (courseResultType === 'CREDIT') {
				const resultRow: StudentResultRow = {
					student_id: examReg.student_id,
					student_name: examReg.student_name || 'Unknown',
					register_no: examReg.stu_register_no || 'N/A',
					exam_registration_id: examReg.id,
					course_offering_id: courseOffering.id,
					course_id: course.id,
					course_code: course.course_code,
					course_name: course.course_name || course.course_code,
					internal_marks: 0,
					internal_max: 0,
					internal_pass_mark: 0,
					external_marks: 0,
					external_max: 0,
					external_pass_mark: 0,
					total_marks: 0,
					total_max: 0,
					total_pass_mark: 0,
					percentage: 0,
					grade: 'Credit',
					grade_point: 0,
					grade_description: 'Credit',
					credits: course.credit || 0,
					credit_points: course.credit || 0,
					pass_status: 'Pass',
					is_pass: true,
					is_absent: false,
					fail_reason: null,
					internal_marks_id: null,
					marks_entry_id: null
				}
				results.push(resultRow)
				summary.passed++
				continue
			}

			// =========================================================
			// TYPE BRANCHING: Handle Status Papers vs Mark Papers
			// =========================================================

			// CIA-only courses with result_type='Status' but no status grade in internal_marks
			// (grade is null but total_internal_marks is set) should use MARK paper path.
			const _evalTypeForCheck = course.evaluation_type?.toUpperCase() || ''
			const _isCIAForCheck = _evalTypeForCheck === 'CIA' || _evalTypeForCheck === 'CIA ONLY'
			const _ciaNumericNoGrade = _isCIAForCheck && internalMark?.total_internal_marks != null && !internalMark?.grade
			const isStatusPaper = courseResultType === 'STATUS' && !_ciaNumericNoGrade

			if (isStatusPaper) {
				// STATUS PAPER PROCESSING
				const courseEvalType = course.evaluation_type?.toUpperCase() || ''
				const isCIAOnly = courseEvalType === 'CIA' || courseEvalType === 'CIA ONLY'

				// Validation
				if (isCIAOnly) {
					if (!internalMark || !internalMark.grade) {
						summary.skipped_missing_marks++
						skippedRecords.push({
							student_name: examReg.student_name || 'Unknown',
							register_no: examReg.stu_register_no || 'N/A',
							course_code: course.course_code || 'N/A',
							reason: 'Missing internal status grade'
						})
						continue
					}
				} else {
					if (!attendanceRecord) {
						summary.skipped_no_attendance++
						continue
					}
					if (!externalMark || !externalMark.grade) {
						const isAbsent = attendanceRecord.attendance_status?.toLowerCase() === 'absent'
						if (!isAbsent) {
							summary.skipped_missing_marks++
							skippedRecords.push({
								student_name: examReg.student_name || 'Unknown',
								register_no: examReg.stu_register_no || 'N/A',
								course_code: course.course_code || 'N/A',
								reason: 'Missing external status grade'
							})
							continue
						}
					}
				}

				// Calculate final grade
				let finalGrade: StatusGrade
				let isPass: boolean
				let failReason: 'EXTERNAL' | null

				try {
					const result = getFinalGradeForStatusPaper(course, internalMark, externalMark, attendanceRecord)
					finalGrade = result.grade
					isPass = result.isPass
					failReason = result.failReason
				} catch (error) {
					errors.push({
						student_id: examReg.student_id,
						student_name: examReg.student_name || 'Unknown',
						register_no: examReg.stu_register_no || 'N/A',
						course_code: course.course_code || 'N/A',
						error: error instanceof Error ? error.message : 'Failed to calculate status grade'
					})
					continue
				}

				// Determine pass status
				let passStatus: 'Pass' | 'Fail' | 'Reappear' | 'Absent' | 'Withheld' | 'Expelled' = 'Fail'
				if (finalGrade === 'AAA') {
					passStatus = 'Absent'
					summary.absent++
				} else if (isPass) {
					passStatus = 'Pass'
					summary.passed++
				} else {
					passStatus = 'Reappear'
					summary.failed++
					summary.reappear++
				}

				// Create result row
				const resultRow: StudentResultRow = {
					student_id: examReg.student_id,
					student_name: examReg.student_name || 'Unknown',
					register_no: examReg.stu_register_no || 'N/A',
					exam_registration_id: examReg.id,
					course_offering_id: courseOffering.id,
					course_id: course.id,
					course_code: course.course_code,
					course_name: course.course_name || course.course_code,
					internal_marks: 0,
					internal_max: 0,
					internal_pass_mark: 0,
					external_marks: 0,
					external_max: 0,
					external_pass_mark: 0,
					total_marks: 0,
					total_max: 0,
					total_pass_mark: 0,
					percentage: 0,
					grade: finalGrade,
					grade_point: 0,
					grade_description: finalGrade,
					credits: course.credit || 0,
					credit_points: 0,
					pass_status: passStatus,
					is_pass: isPass,
					is_absent: finalGrade === 'AAA',
					fail_reason: failReason,
					internal_marks_id: internalMark?.id || null,
					marks_entry_id: externalMark?.id || null
				}

				results.push(resultRow)
				continue // Skip mark-based processing
			}

			// =========================================================
			// BUSINESS RULE: Validation before generating final marks
			// 1. Attendance is mandatory - No attendance record → Skip
			//    EXCEPTION: CIA only courses don't require attendance (no external exam)
			// 2. Internal and External marks are required (both must exist)
			// 3. For courses with evaluation_type = 'CIA & ESE':
			//    - If internal exists but external missing → Skip
			//    - If external exists but internal missing → Skip
			// 4. Generate only when: attendance + internal + external all exist
			// =========================================================

			// Check evaluation type FIRST to determine if attendance is required
			const courseEvalType = course.evaluation_type?.toUpperCase() || ''
			const courseIsCIAOnly = courseEvalType === 'CIA' || courseEvalType === 'CIA ONLY'

			// Rule 1: Attendance is mandatory (EXCEPT for CIA only courses)
			if (!attendanceRecord && !courseIsCIAOnly) {
				// No attendance record means student didn't appear for exam
				// Skip this student-course combination (no result needed)
				summary.skipped_no_attendance++
				continue
			}

			// Check if student is marked absent in attendance
			// NOTE: Only attendance_status column exists (is_absent column doesn't exist)
			// For CIA only courses without attendance record, treat as present
			const isAbsent = attendanceRecord ? attendanceRecord.attendance_status?.toLowerCase() === 'absent' : false

			// Check marks availability
			const hasInternalMark = internalMark && internalMark.total_internal_marks !== null && internalMark.total_internal_marks !== undefined
			const hasExternalMark = externalMark && externalMark.total_marks_obtained !== null && externalMark.total_marks_obtained !== undefined
			const evaluationType = course.evaluation_type?.toUpperCase() || ''

			// Determine evaluation type category
			const isCIAandESE = evaluationType === 'CIA & ESE' || evaluationType === 'CIA AND ESE' || evaluationType === 'CIA&ESE'
			const isCIAOnly = evaluationType === 'CIA' || evaluationType === 'CIA ONLY'
			const isESEOnly = evaluationType === 'ESE' || evaluationType === 'ESE ONLY'

			// =========================================================
			// VALIDATION RULES:
			// 1. Absent in attendance → Generate with AAA grade, 0 GP (always)
			// 2. Present + CIA & ESE + missing internal OR external → Skip
			// 3. Present + CIA only + missing external → Generate normally (internal only)
			// 4. Present + ESE only + missing internal → Generate normally (external only)
			// 5. Present + Other types + both marks missing → Skip
			// 6. Present + all required marks exist → Generate normally
			// NOTE: CIA only courses without attendance record are treated as present (isAbsent=false)
			// =========================================================

			// If student is absent, we generate AAA grade regardless of marks availability
			// No validation needed for absent students

			// If student is present, validate marks based on evaluation type
			if (!isAbsent) {
				const studentName = examReg.student_name || 'Unknown'
				const registerNo = examReg.stu_register_no || 'N/A'
				const courseCode = course.course_code || courseOffering?.course_code || 'N/A'

				if (isCIAandESE) {
					// CIA & ESE: Both internal AND external marks are required
					if (!hasInternalMark || !hasExternalMark) {
						const missing = !hasInternalMark && !hasExternalMark ? 'Internal & External' :
							!hasInternalMark ? 'Internal' : 'External'
						skippedRecords.push({ student_name: studentName, register_no: registerNo, course_code: courseCode, reason: `Missing ${missing} marks` })
						summary.skipped_missing_marks++
						continue
					}
				} else if (isCIAOnly) {
					// CIA only: Internal mark is required (external is optional)
					if (!hasInternalMark) {
						skippedRecords.push({ student_name: studentName, register_no: registerNo, course_code: courseCode, reason: 'Missing Internal marks' })
						summary.skipped_missing_marks++
						continue
					}
				} else if (isESEOnly) {
					// ESE only: External mark is required (internal is optional)
					if (!hasExternalMark) {
						skippedRecords.push({ student_name: studentName, register_no: registerNo, course_code: courseCode, reason: 'Missing External marks' })
						summary.skipped_missing_marks++
						continue
					}
				} else {
					// Other evaluation types: At least one mark type should exist
					if (!hasInternalMark && !hasExternalMark) {
						skippedRecords.push({ student_name: studentName, register_no: registerNo, course_code: courseCode, reason: 'Missing Internal & External marks' })
						summary.skipped_missing_marks++
						continue
					}
				}
			}

			// Get marks configuration - ALWAYS use courses table values
			// courses table has the correct max marks for each course type (theory/practical)
			const internalMax = Number(course.internal_max_mark) || 0
			const externalMax = Number(course.external_max_mark) || 0
			const totalMax = Number(course.total_max_mark) || 0

			// =========================================================
			// PASS MARKS: Use course-specific values from courses table
			// Pass marks are configured per course in the courses table
			// (course_mapping no longer has pass mark fields)
			// =========================================================
			const internalPassMark = Number(course.internal_pass_mark) || 0
			const externalPassMark = Number(course.external_pass_mark) || 0
			const totalPassMark = Number(course.total_pass_mark) || 0

			// Get marks obtained (cap at max values)
			let internalMarksObtained = Number(internalMark?.total_internal_marks) || 0
			let externalMarksObtained = Number(externalMark?.total_marks_obtained) || 0

			// Validate: marks should not exceed max marks
			if (internalMarksObtained > internalMax) {
				internalMarksObtained = internalMax
			}
			if (externalMarksObtained > externalMax) {
				externalMarksObtained = externalMax
			}

			// Calculate total (cap at total max)
			let totalMarks = internalMarksObtained + externalMarksObtained
			if (totalMarks > totalMax) {
				totalMarks = totalMax
			}

			const percentage = totalMax > 0 ? Math.round((totalMarks / totalMax) * 100 * 100) / 100 : 0

			// =========================================================
			// MAX MARKS NORMALIZATION: For grade calculation
			// Percentage is already on 100-scale (totalMarks / totalMax * 100)
			// Grade lookup always uses this percentage regardless of totalMax
			// This works because: if max=200 & marks=180 → percentage=90%
			// which equals normalized value on 100-scale
			// =========================================================

			// Determine pass/fail based on course rules
			let failReason: 'INTERNAL' | 'EXTERNAL' | 'TOTAL' | null = null
			let isPass = true

			// Case 1: Student is absent in external exam (from exam_attendance)
			if (isAbsent) {
				isPass = false
				failReason = 'EXTERNAL'
			}
			// Case 2: Student is present, check pass conditions
			else {
				// Check internal pass condition
				if (internalPassMark > 0 && internalMarksObtained < internalPassMark) {
					isPass = false
					failReason = 'INTERNAL'
				}
				// Check external pass condition
				else if (externalPassMark > 0 && externalMarksObtained < externalPassMark) {
					isPass = false
					failReason = 'EXTERNAL'
				}
				// Check total pass condition
				else if (totalPassMark > 0 && totalMarks < totalPassMark) {
					isPass = false
					failReason = 'TOTAL'
				}
			}

			// Determine grade based on percentage
			let gradeEntry: any = undefined

			// Grade lookup based on attendance and pass status
			if (isAbsent) {
				// ABSENT: Find absent grade from grade_system (AAA grade)
				gradeEntry = grades.find((g: any) => g.grades?.is_absent === true || (g.min_mark === -1 && g.max_mark === -1))
			} else if (!isPass) {
				// FAILED: Find fail/reappear grade (U grade)
				gradeEntry = grades.find((g: any) => g.grade === 'U' || g.grades?.result_status === 'REAPPEAR')
			} else {
				// PASSED: Find grade by percentage range
				gradeEntry = grades.find((g: any) => percentage >= g.min_mark && percentage <= g.max_mark)

				// CRITICAL FIX: If grade found is 'U' (fail grade), student actually failed
				// This can happen when percentage is below the pass threshold in grade_system
				if (gradeEntry?.grade === 'U' || gradeEntry?.grades?.result_status === 'REAPPEAR') {
					isPass = false
					failReason = failReason || 'TOTAL'
				}
			}

			// Determine letter grade based on attendance and pass status
			let letterGrade: string
			let gradePoint: number
			let gradeDescription: string

			if (isAbsent) {
				// ABSENT (from exam_attendance): Always use AAA grade, grade_point = 0
				letterGrade = 'AAA'
				gradePoint = 0
				gradeDescription = 'Absent'
			} else if (!isPass) {
				// FAILED: Always use U grade, grade_point = 0
				letterGrade = 'U'
				gradePoint = 0
				gradeDescription = 'Re-Appear'
			} else {
				// PASSED: Use grade letter from grade_system
				// Grade point = percentage / 10 (percentage is always on 100-scale)
				// Works for all course types:
				// - Standard (max=100): marks=92 → percentage=92% → GP=9.2
				// - Project (max=200): marks=184 → percentage=92% → GP=9.2
				letterGrade = gradeEntry?.grade || 'RA'
				gradePoint = Math.round((percentage / 10) * 100) / 100
				gradeDescription = gradeEntry?.description || ''
			}
			const credits = course.credit || 0
			const creditPoints = gradePoint * credits

			// Determine pass status based on attendance and course rules
			let passStatus: 'Pass' | 'Fail' | 'Reappear' | 'Absent' | 'Withheld' | 'Expelled' = 'Fail'
			if (isAbsent) {
				passStatus = 'Absent'
				summary.absent++
			} else if (isPass) {
				passStatus = 'Pass'
				summary.passed++
				// Check distinction/first class based on grade description and calculated grade point
				const gradeDesc = (gradeEntry?.description || '').toUpperCase()
				const gradeLetter = (gradeEntry?.grade || '').toUpperCase()
				// Distinction: D, D+ grades or description contains 'DISTINCTION'
				if (gradeLetter === 'D' || gradeLetter === 'D+' || gradeDesc.includes('DISTINCTION')) {
					summary.distinction++
				}
				// First class: A, A+, D, D+, O grades or description contains 'FIRST' or grade_point >= 6.0
				if (gradeLetter === 'A' || gradeLetter === 'A+' || gradeLetter === 'D' || gradeLetter === 'D+' || gradeLetter === 'O' ||
					gradeDesc.includes('FIRST') || gradePoint >= 6.0) {
					summary.first_class++
				}
			} else {
				passStatus = 'Reappear'
				summary.failed++
				summary.reappear++
			}

			const resultRow: StudentResultRow = {
				student_id: examReg.student_id,
				student_name: examReg.student_name || 'Unknown',
				register_no: examReg.stu_register_no || 'N/A',
				exam_registration_id: examReg.id,
				course_offering_id: courseOffering.id,
				course_id: course.id,
				course_code: course.course_code,
				course_name: course.course_name || course.course_code,
				internal_marks: internalMarksObtained,
				internal_max: internalMax,
				internal_pass_mark: internalPassMark,
				external_marks: externalMarksObtained,
				external_max: externalMax,
				external_pass_mark: externalPassMark,
				total_marks: totalMarks,
				total_max: totalMax,
				total_pass_mark: totalPassMark,
				percentage,
				grade: letterGrade,
				grade_point: gradePoint,
				grade_description: gradeDescription,
				credits,
				credit_points: creditPoints,
				pass_status: passStatus,
				is_pass: isPass,
				is_absent: isAbsent,
				fail_reason: failReason,
				internal_marks_id: internalMark?.id || null,
				marks_entry_id: externalMark?.id || null
			}

			results.push(resultRow)
		}

		console.log('[Final Marks] Processing complete:')
		console.log('  - Total exam registrations:', examRegistrations.length)
		console.log('  - Skipped (no course mapping or course):', skippedNoMapping)
		console.log('  - Skipped (no course found):', skippedNoCourse)
		console.log('  - Skipped (no attendance):', summary.skipped_no_attendance)
		console.log('  - Skipped (missing marks):', summary.skipped_missing_marks)
		console.log('  - Results generated:', results.length)
		if (results.length === 0 && examRegistrations.length > 0) {
			console.log('[Final Marks] WARNING: No results generated despite having exam registrations!')
			console.log('[Final Marks] Check: attendance records, internal marks, and external marks data')
		}

		// 6. Save to database if requested
		// Batched upsert with retry + per-record fallback.
		// Previous implementation was one HTTP call per record, which caused
		// `TypeError: fetch failed` for transient network errors and was O(N) slow.
		let savedCount = 0
		if (save_to_db && results.length > 0) {
			const SAVE_BATCH_SIZE = 200
			const MAX_RETRIES = 2

			// Build insert payloads up-front so retry/fallback can reuse them
			const buildInsertData = (result: StudentResultRow) => {
				const isStatusResult = result.total_marks === 0 && result.percentage === 0 &&
					['Commended', 'Highly Commended', 'AAA'].includes(result.grade)
				const totalGradePoints = result.is_pass && !isStatusResult
					? result.credits * result.grade_point
					: 0
				return {
					institutions_id,
					examination_session_id,
					exam_registration_id: result.exam_registration_id,
					course_offering_id: result.course_offering_id,
					program_id,
					program_code: programCode,
					course_id: result.course_id,
					student_id: result.student_id,
					internal_marks_id: result.internal_marks_id,
					marks_entry_id: result.marks_entry_id,
					internal_marks_obtained: isStatusResult ? null : result.internal_marks,
					internal_marks_maximum: isStatusResult ? null : result.internal_max,
					external_marks_obtained: isStatusResult ? null : result.external_marks,
					external_marks_maximum: isStatusResult ? null : result.external_max,
					total_marks_obtained: isStatusResult ? null : result.total_marks,
					total_marks_maximum: isStatusResult ? null : result.total_max,
					percentage: isStatusResult ? null : result.percentage,
					grace_marks: 0,
					letter_grade: result.grade,
					grade_points: isStatusResult ? null : result.grade_point,
					grade_description: result.grade_description,
					is_pass: result.is_pass,
					pass_status: result.pass_status,
					result_status: 'Pending',
					calculated_by: calculated_by || null,
					calculated_at: new Date().toISOString(),
					is_active: true,
					credit: result.credits,
					total_grade_points: isStatusResult ? null : totalGradePoints,
					register_number: result.register_no || null
				}
			}

			// Detect transient network errors worth retrying
			const isTransientError = (err: any): boolean => {
				const msg = (err?.message || String(err || '')).toLowerCase()
				return msg.includes('fetch failed') ||
					msg.includes('network') ||
					msg.includes('econnreset') ||
					msg.includes('etimedout') ||
					msg.includes('timeout')
			}

			const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

			// Try a batched array upsert, with retries for transient errors
			const tryBatchUpsert = async (payloads: any[]): Promise<{ ok: boolean; error?: any }> => {
				for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
					try {
						const { error } = await supabase
							.from('final_marks')
							.upsert(payloads, {
								onConflict: 'institutions_id,exam_registration_id,course_offering_id'
							})
						if (!error) return { ok: true }
						// Non-transient DB errors should not be retried — fall through to fallback
						if (!isTransientError(error)) return { ok: false, error }
						if (attempt < MAX_RETRIES) await sleep(500 * (attempt + 1))
					} catch (err) {
						if (!isTransientError(err) || attempt === MAX_RETRIES) {
							return { ok: false, error: err }
						}
						await sleep(500 * (attempt + 1))
					}
				}
				return { ok: false, error: new Error('Batch upsert failed after retries') }
			}

			// Per-record fallback — isolates which specific records failed
			const fallbackPerRecord = async (batchResults: StudentResultRow[]) => {
				for (const result of batchResults) {
					const payload = buildInsertData(result)
					let lastErr: any = null
					for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
						try {
							const { error } = await supabase
								.from('final_marks')
								.upsert(payload, {
									onConflict: 'institutions_id,exam_registration_id,course_offering_id'
								})
							if (!error) { lastErr = null; break }
							lastErr = error
							if (!isTransientError(error)) break
							if (attempt < MAX_RETRIES) await sleep(300 * (attempt + 1))
						} catch (err) {
							lastErr = err
							if (!isTransientError(err) || attempt === MAX_RETRIES) break
							await sleep(300 * (attempt + 1))
						}
					}
					if (lastErr) {
						errors.push({
							student_id: result.student_id,
							student_name: result.student_name,
							register_no: result.register_no,
							course_code: result.course_code,
							error: lastErr?.message || 'Unknown error'
						})
					} else {
						savedCount++
					}
				}
			}

			// Process results in batches
			for (let i = 0; i < results.length; i += SAVE_BATCH_SIZE) {
				const batchResults = results.slice(i, i + SAVE_BATCH_SIZE)
				const payloads = batchResults.map(buildInsertData)
				const { ok, error } = await tryBatchUpsert(payloads)

				if (ok) {
					savedCount += batchResults.length
				} else {
					console.error(`Batch ${Math.floor(i / SAVE_BATCH_SIZE) + 1} upsert failed, falling back to per-record:`, error)
					await fallbackPerRecord(batchResults)
				}
			}
		}

		const response: GenerateFinalMarksResponse = {
			success: true,
			total_students: [...new Set(results.map(r => r.student_id))].length,
			total_courses: course_ids.length,
			results,
			summary,
			saved_count: savedCount,
			errors: errors.length > 0 ? errors : undefined,
			skipped_records: skippedRecords.length > 0 ? skippedRecords : undefined
		}

		return NextResponse.json(response)
	} catch (error) {
		console.error('Final marks API POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * DELETE /api/grading/final-marks
 * Delete final marks by ID
 */
export async function DELETE(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		// Check if the record is locked or published
		const { data: existing, error: fetchError } = await supabase
			.from('final_marks')
			.select('is_locked, result_status')
			.eq('id', id)
			.single()

		if (fetchError) {
			return NextResponse.json({ error: 'Record not found' }, { status: 404 })
		}

		if (existing.is_locked) {
			return NextResponse.json({ error: 'Cannot delete locked record' }, { status: 400 })
		}

		if (existing.result_status === 'Published') {
			return NextResponse.json({ error: 'Cannot delete published result' }, { status: 400 })
		}

		// Soft delete
		const { error } = await supabase
			.from('final_marks')
			.update({ is_active: false })
			.eq('id', id)

		if (error) {
			console.error('Error deleting final mark:', error)
			return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 })
		}

		return NextResponse.json({ message: 'Record deleted successfully' })
	} catch (error) {
		console.error('Final marks DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
