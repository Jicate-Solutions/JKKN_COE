import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNPrograms } from '@/services/myjkkn-service'

// =====================================================
// GRADE CONVERSION TABLE (UG)
// =====================================================

const UG_GRADE_TABLE = [
	{ min: 90, max: 100, gradePoint: 10.0, letterGrade: 'O', description: 'Outstanding' },
	{ min: 80, max: 89, gradePoint: 9.0, letterGrade: 'A+', description: 'Excellent' },
	{ min: 70, max: 79, gradePoint: 8.0, letterGrade: 'A', description: 'Good' },
	{ min: 60, max: 69, gradePoint: 7.0, letterGrade: 'B+', description: 'Above Average' },
	{ min: 50, max: 59, gradePoint: 6.0, letterGrade: 'B', description: 'Average' },
	{ min: 40, max: 49, gradePoint: 5.0, letterGrade: 'C', description: 'Satisfactory' },
	{ min: 0, max: 39, gradePoint: 0.0, letterGrade: 'U', description: 'Re-Appear' },
	{ min: -1, max: -1, gradePoint: 0.0, letterGrade: 'AAA', description: 'ABSENT' }
]

// Part descriptions mapping
const PART_DESCRIPTIONS: Record<string, string> = {
	'Part I': 'Language I (Tamil/Hindi/French etc.)',
	'Part II': 'Language II (English)',
	'Part III': 'Core/Major Subjects',
	'Part IV': 'Allied/Skill Enhancement/Foundation',
	'Part V': 'Extension Activities/Projects'
}

// Part order for sorting
const PART_ORDER = ['Part I', 'Part II', 'Part III', 'Part IV', 'Part V']

/**
 * Get grade details from percentage
 * Supports continuous/interpolated grade points
 */
function getGradeFromPercentage(
	percentage: number,
	isAbsent: boolean = false
): { gradePoint: number; letterGrade: string; description: string } {
	if (isAbsent) {
		return { gradePoint: 0, letterGrade: 'AAA', description: 'ABSENT' }
	}

	// Use continuous grade point calculation
	// Grade point = percentage / 10 (capped at range boundaries)
	const continuousGP = Math.round((percentage / 10) * 10) / 10

	for (const grade of UG_GRADE_TABLE) {
		if (percentage >= grade.min && percentage <= grade.max) {
			return {
				gradePoint: continuousGP,
				letterGrade: grade.letterGrade,
				description: grade.description
			}
		}
	}

	return { gradePoint: 0, letterGrade: 'U', description: 'Re-Appear' }
}

/**
 * Check if student passed based on pass marks
 * UG: Passing requires 40% in ESE AND 40% in Total
 * PG: Passing requires 50% in ESE AND 50% in Total
 *
 * CIA-only (internal-only) courses have NO ESE component, so the separate ESE
 * threshold does not apply — only the Total threshold is checked. The course is
 * treated as CIA-only when evalType is 'CIA' or there is no ESE maximum.
 */
function checkPassStatus(
	eseMarks: number,
	eseMax: number,
	totalMarks: number,
	totalMax: number,
	passingPercentage: number = 40,  // Default to UG (40%), use 50 for PG
	evalType: string = 'CIA + ESE'
): { isPassing: boolean; result: string } {
	const totalPercentage = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0
	const passesTotal = totalPercentage >= passingPercentage

	// Only apply the ESE threshold when the course actually has an ESE component.
	const hasESE = evalType !== 'CIA' && eseMax > 0
	const esePercentage = hasESE ? (eseMarks / eseMax) * 100 : 0
	const passesESE = hasESE ? esePercentage >= passingPercentage : true

	if (passesESE && passesTotal) {
		return { isPassing: true, result: 'PASS' }
	}
	return { isPassing: false, result: 'RA' }
}

/**
 * Check if program is PG based on code or name
 */
function isPGProgram(programCode: string, programName?: string): boolean {
	const code = programCode?.toUpperCase() || ''
	const name = programName?.toUpperCase() || ''

	// Check code prefixes
	const pgCodePrefixes = ['M', 'MBA', 'MCA', 'MSW', 'MSC', 'MA', 'MCOM', 'PHD', 'PG']
	if (pgCodePrefixes.some(prefix => code.startsWith(prefix))) {
		return true
	}

	// Check if code contains 'PG'
	if (code.includes('PG')) {
		return true
	}

	// Check program name for PG indicators
	const pgNamePatterns = ['M.SC', 'MSC', 'M.A.', 'M.A ', 'MA ', 'M.COM', 'MCOM', 'MBA', 'MCA', 'M.PHIL', 'MPHIL', 'PH.D', 'PHD', 'POST GRADUATE', 'POSTGRADUATE', 'MASTER']
	if (pgNamePatterns.some(pattern => name.includes(pattern))) {
		return true
	}

	return false
}

/**
 * Get part order for sorting
 */
function getPartOrder(partName: string): number {
	const index = PART_ORDER.findIndex(p => p.toLowerCase() === partName?.toLowerCase())
	return index >= 0 ? index : 999
}

// =====================================================
// API HANDLERS
// =====================================================

export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const action = searchParams.get('action')

		// Get marksheet data for a specific student
		if (action === 'student-marksheet') {
			const studentId = searchParams.get('studentId')
			const sessionId = searchParams.get('sessionId')
			const semester = searchParams.get('semester')

			if (!studentId || !sessionId) {
				return NextResponse.json({ error: 'studentId and sessionId are required' }, { status: 400 })
			}

			// Fetch final marks with course details
			let query = supabase
				.from('final_marks')
				.select(`
					id,
					student_id,
					course_id,
					credit,
					internal_marks_obtained,
					internal_marks_maximum,
					external_marks_obtained,
					external_marks_maximum,
					total_marks_obtained,
					total_marks_maximum,
					percentage,
					grade_points,
					letter_grade,
					grade_description,
					is_pass,
					pass_status,
					course_offerings (
						semester,
						course_mapping (
							course_order,
							semester_code,
							courses (
								course_code,
								course_name,
								credit,
								credit_included,
								course_part_master,
								result_type,
								evaluation_type
							)
						)
					),
					exam_registrations (
						stu_register_no,
						student_name
					)
				`)
				.eq('student_id', studentId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			// ARREAR PAPERS: Don't filter by semester to include arrear papers from previous semesters
			// Example: Semester II marksheet will show Semester II courses + failed Semester I papers
			// if (semester) {
			// 	query = query.eq('course_offerings.semester', parseInt(semester))
			// }

			// Override default 1000-row limit so students with many courses/arrears aren't truncated
			const { data: finalMarks, error: fmError } = await query.range(0, 100000)

			if (fmError) {
				console.error('Error fetching final marks:', fmError)
				throw fmError
			}

			if (!finalMarks || finalMarks.length === 0) {
				return NextResponse.json({ error: 'No marks found for the student' }, { status: 404 })
			}

			// Get student details - exam_registrations may be array or single object
			const examReg = Array.isArray(finalMarks[0]?.exam_registrations)
				? finalMarks[0]?.exam_registrations[0]
				: finalMarks[0]?.exam_registrations
			const studentName = examReg?.student_name || ''
			const registerNo = examReg?.stu_register_no || ''

			// learnerName starts as the exam_registration name; overridden from MyJKKN profile below
			let learnerName = studentName

			// Get semester result for GPA summary (fetch early to get program_code for learner lookup)
			const { data: semesterResult } = await supabase
				.from('semester_results')
				.select('*')
				.eq('student_id', studentId)
				.eq('examination_session_id', sessionId)
				.single()

			// Fetch program name from MyJKKN API using program_code
			let programName = semesterResult?.program_name || ''
			const programCode = semesterResult?.program_code || ''

			// Fetch extended learner details from learners_profiles for JasperReports fields
			let dateOfBirth: string | null = null
			let photoUrl: string | null = null
			let learnerExtendedInfo: {
				firstName?: string
				middleName?: string
				lastName?: string
				fatherName?: string
				motherName?: string
				guardianName?: string
				gender?: string
				admissionYear?: string
				batchName?: string
			} = {}

			// Fetch learner profile from MyJKKN API (primary source)
			// Include program_id (UUID) and institution to help narrow down results since search by register_number may not work
			const institutionIdForLookup = semesterResult?.institutions_id
			console.log(`[Semester Marksheet] ===== LEARNER PROFILE LOOKUP =====`)
			console.log(`[Semester Marksheet] registerNo: "${registerNo}"`)
			console.log(`[Semester Marksheet] programCode: "${programCode}"`)
			console.log(`[Semester Marksheet] institutionIdForLookup (COE): "${institutionIdForLookup}"`)

			// Get MyJKKN institution IDs for filtering
			let myjkknInstitutionId: string | null = null
			let myjkknProgramId: string | null = null  // UUID, not string code
			if (institutionIdForLookup) {
				const { data: institution, error: instErr } = await supabase
					.from('institutions')
					.select('myjkkn_institution_ids, institution_code')
					.eq('id', institutionIdForLookup)
					.single()

				if (instErr) {
					console.error(`[Semester Marksheet] Failed to lookup institution:`, instErr)
				}

				console.log(`[Semester Marksheet] Institution lookup result:`, {
					institution_code: institution?.institution_code,
					myjkkn_institution_ids: institution?.myjkkn_institution_ids
				})

				const myjkknIds = institution?.myjkkn_institution_ids || []
				if (myjkknIds.length > 0) {
					myjkknInstitutionId = myjkknIds[0]  // Use first MyJKKN institution ID
					console.log(`[Semester Marksheet] Using MyJKKN institution_id: ${myjkknInstitutionId}`)

					// Look up MyJKKN program_id (UUID) from program_code
					// The external API needs program_id (UUID), not program_code (string)
					if (programCode) {
						try {
							// Use direct service call instead of internal HTTP request
							const programs = await fetchAllMyJKKNPrograms({
								institution_id: myjkknInstitutionId || undefined,
								limit: 100,
								is_active: true
							})
							// Find program by code (MyJKKN uses program_id as code field)
							const matchingProg = programs.find((p: any) =>
								(p.program_id === programCode || p.program_code === programCode)
							)

							if (matchingProg && matchingProg.id) {
								myjkknProgramId = matchingProg.id  // This is the UUID
								console.log(`[Semester Marksheet] Found MyJKKN program UUID: ${myjkknProgramId} for code ${programCode}`)
							}
						} catch (progErr) {
							console.error('[Semester Marksheet] Failed to look up program_id:', progErr)
							if (progErr instanceof Error) {
								console.error('[Semester Marksheet] Program lookup error details:', {
									name: progErr.name,
									message: progErr.message,
									stack: progErr.stack
								})
							}
						}
					}
				}
			}

			if (registerNo) {
				// ====================================================================
				// Fetch learner profile data from MyJKKN API (photo, DOB, extended info)
				// Query each myjkkn_institution_id until we find a matching profile
				// ====================================================================
				try {
					const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
					const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

					console.log(`[Semester Marksheet] Fetching learner profile from MyJKKN API for: ${registerNo}`)

					// Get myjkkn_institution_ids from the COE institution
					const profileInstitutionId = semesterResult?.institutions_id
					let myjkknInstIds: string[] = []

					if (profileInstitutionId) {
						const { data: profileInstitution } = await supabase
							.from('institutions')
							.select('myjkkn_institution_ids')
							.eq('id', profileInstitutionId)
							.single()

						myjkknInstIds = profileInstitution?.myjkkn_institution_ids || []
						console.log(`[Semester Marksheet] Institution ${profileInstitutionId} has ${myjkknInstIds.length} myjkkn_institution_ids:`, myjkknInstIds)
					}

					// Query MyJKKN API for each institution ID until we find a match
					let matchingProfile: any = null

					if (myjkknApiKey && myjkknInstIds.length > 0) {
						for (const myjkknInstId of myjkknInstIds) {
							if (matchingProfile) break // Stop if we found a match

							// Paginate through all profiles (raised from 200 → 1000 per page
							// so we cover larger institutions in fewer round-trips).
							let page = 1
							const pageSize = 1000
							let hasMorePages = true

							while (hasMorePages && !matchingProfile) {
								const profileParams = new URLSearchParams()
								profileParams.set('institution_id', myjkknInstId)
								profileParams.set('limit', String(pageSize))
								profileParams.set('page', String(page))

								console.log(`[Semester Marksheet] Querying MyJKKN API with institution_id: ${myjkknInstId}, page: ${page}`)

								const profileResponse = await fetch(
									`${myjkknApiUrl}/api-management/learners/profiles?${profileParams.toString()}`,
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

								if (profileResponse.ok) {
									const profileData = await profileResponse.json()
									const profiles = profileData.data || []
									console.log(`[Semester Marksheet] MyJKKN institution ${myjkknInstId} page ${page} returned ${profiles.length} profiles`)

									// Find matching profile by register_number only
									matchingProfile = profiles.find((p: any) =>
										p.register_number === registerNo
									)

									if (matchingProfile) {
										console.log(`[Semester Marksheet] Found profile in institution ${myjkknInstId}: register_number=${matchingProfile.register_number}, photo=${matchingProfile.student_photo_url?.substring(0, 60)}...`)
									}

									// Check if there are more pages
									hasMorePages = profiles.length === pageSize
									page++
								} else {
									hasMorePages = false
								}
							}
						}
					} else if (!myjkknApiKey) {
						console.log(`[Semester Marksheet] No MyJKKN API key configured`)
					} else {
						console.log(`[Semester Marksheet] No myjkkn_institution_ids found for institution`)
					}

					// Targeted fallback: if pagination missed the learner (e.g. they're
					// filed under a different institution_id in MyJKKN), do a direct
					// register_number lookup across all institutions.
					if (!matchingProfile && myjkknApiKey && registerNo) {
						console.log(`[Semester Marksheet] Pagination missed ${registerNo} — running targeted register_number lookup`)
						try {
							const targetParams = new URLSearchParams()
							targetParams.set('register_number', registerNo)
							targetParams.set('limit', '200')
							const targetResp = await fetch(
								`${myjkknApiUrl}/api-management/learners/profiles?${targetParams.toString()}`,
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
							if (targetResp.ok) {
								const targetData = await targetResp.json()
								const targetProfiles = targetData.data || []
								// IMPORTANT: only accept an exact register_number match.
								// Do NOT fall back to targetProfiles[0] — MyJKKN's
								// register_number query sometimes returns unrelated
								// profiles when no exact match exists, and picking
								// the first one would attach a stranger's data
								// (name, DOB, photo) to the wrong learner.
								matchingProfile = targetProfiles.find((p: any) =>
									p.register_number === registerNo
								) || null
								if (matchingProfile) {
									console.log(`[Semester Marksheet] Targeted lookup found profile for ${registerNo}`)
								}
							}
						} catch (e) {
							console.warn(`[Semester Marksheet] Targeted lookup error for ${registerNo}:`, e)
						}
					}

					if (matchingProfile) {
						console.log(`[Semester Marksheet] Found MyJKKN profile for: ${registerNo}`)

						// Get photo URL from MyJKKN (try multiple possible field names)
						const profilePhotoUrl = matchingProfile.student_photo_url ||
							matchingProfile.photo_url ||
							matchingProfile.profile_photo ||
							matchingProfile.image_url
						if (profilePhotoUrl) {
							photoUrl = profilePhotoUrl
							console.log(`[Semester Marksheet] Photo URL from MyJKKN: ${photoUrl}`)
						}

						// Get DOB from MyJKKN
						if (matchingProfile.date_of_birth) {
							const dob = new Date(matchingProfile.date_of_birth)
							const dobYear = dob.getFullYear()
							if (!isNaN(dob.getTime()) && dobYear >= 1900 && dobYear <= 2050) {
								dateOfBirth = `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dobYear}`
								console.log(`[Semester Marksheet] DOB from MyJKKN: ${dateOfBirth}`)
							}
						}

						// Extract extended info for JasperReports compatibility
						learnerExtendedInfo = {
							firstName: matchingProfile.first_name || undefined,
							middleName: undefined,
							lastName: matchingProfile.last_name || undefined,
							fatherName: matchingProfile.father_name || undefined,
							motherName: matchingProfile.mother_name || undefined,
							guardianName: undefined,
							gender: matchingProfile.gender || undefined,
							admissionYear: matchingProfile.admission_year?.toString() || undefined,
							batchName: undefined
						}

						// Override name with MyJKKN profile name (more accurate than exam_registrations)
						const myjkknFullName = matchingProfile.student_name || matchingProfile.full_name || ''
						const constructedName = myjkknFullName ||
							[matchingProfile.first_name, matchingProfile.last_name].filter(Boolean).join(' ')
						if (constructedName) {
							learnerName = constructedName
							console.log(`[Semester Marksheet] Name from MyJKKN: "${learnerName}"`)
						}
					} else {
						console.log(`[Semester Marksheet] No matching profile found in MyJKKN global query for: ${registerNo}`)
					}
				} catch (myjkknError) {
					console.error('[Semester Marksheet] MyJKKN API error (non-critical):', myjkknError)
				}

				// FALLBACK: the MyJKKN profiles API omits learners whose
				// lifecycle_status = 'inactive' (e.g. absent / discontinued), so they
				// return no photo/DOB even though the data exists. Fill from the synced
				// local learners_profiles mirror (no lifecycle filter), matched by
				// exact register_number. Same strategy as the batch action.
				if (!photoUrl || !dateOfBirth) {
					try {
						const { data: lpRows } = await supabase
							.from('learners_profiles')
							.select('first_name, last_name, date_of_birth, student_photo_url')
							.eq('register_number', registerNo)
							.limit(1)
						const lp: any = lpRows?.[0]
						if (lp) {
							if (!photoUrl && lp.student_photo_url) photoUrl = lp.student_photo_url
							if (!dateOfBirth && lp.date_of_birth) {
								const dob = new Date(lp.date_of_birth)
								if (!isNaN(dob.getTime())) {
									dateOfBirth = `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dob.getFullYear()}`
								}
							}
							if (!learnerName) {
								const nm = [lp.first_name, lp.last_name].filter(Boolean).join(' ')
								if (nm) learnerName = nm
							}
							console.log(`[Semester Marksheet] Filled photo/DOB for ${registerNo} from local learners_profiles mirror`)
						}
					} catch (lpErr) {
						console.warn('[Semester Marksheet] learners_profiles fallback error (non-critical):', lpErr)
					}
				}

				// Final status
				console.log(`[Semester Marksheet] Final values for ${registerNo}:`, {
					photoUrl: photoUrl?.substring(0, 100) || 'NULL',
					dateOfBirth: dateOfBirth || 'NULL'
				})
			}

			if (programCode && !programName) {
				// Get institution to look up program
				const institutionId = semesterResult?.institutions_id
				if (institutionId) {
					const { data: institution } = await supabase
						.from('institutions')
						.select('myjkkn_institution_ids')
						.eq('id', institutionId)
						.single()

					const myjkknIds: string[] = institution?.myjkkn_institution_ids || []

					if (myjkknIds.length > 0) {
						try {
							// Use direct service call instead of internal HTTP request
							for (const myjkknInstId of myjkknIds) {
								const programs = await fetchAllMyJKKNPrograms({
									institution_id: myjkknInstId,
									limit: 100,
									is_active: true
								})

								// Find program by code (MyJKKN uses program_id as code)
								const matchingProgram = programs.find((p: any) =>
									(p.program_id === programCode || p.program_code === programCode)
								)

								if (matchingProgram) {
									programName = matchingProgram.program_name || (matchingProgram as any).name || ''
									break
								}
							}
						} catch (error) {
							console.warn('[Semester Marksheet] Failed to fetch program name from MyJKKN:', error)
						}
					}
				}
			}

			// Process courses and group by part
			interface ProcessedCourse {
				courseCode: string
				courseName: string
				part: string
				partDescription: string
				semester: number
				semesterCode: string
				courseOrder: number
				credits: number
				eseMax: number
				ciaMax: number
				totalMax: number
				eseMarks: number
				ciaMarks: number
				totalMarks: number
				percentage: number
				gradePoint: number
				letterGrade: string
				creditPoints: number
				isPassing: boolean
				result: string
				resultType?: string
				passStatus?: string
				creditValue?: number
				// Enhanced status flags (optional - from JasperReports decode)
				assessmentType?: string
				passMarks?: number
				isAbsent?: boolean
				isMalpractice?: boolean
				isIneligible?: boolean
				isTermFail?: boolean
				isFinalFail?: boolean
			}

			const processedCourses: ProcessedCourse[] = []

			// Determine passing percentage based on program type (UG: 40%, PG: 50%)
			const isPG = isPGProgram(programCode, programName)
			const passingPercentage = isPG ? 50 : 40

			finalMarks.forEach((fm: any) => {
				const courseData = fm.course_offerings?.course_mapping?.courses
				if (!courseData) return

				const resultType: string = courseData.result_type || 'Mark'
				const isSpecialType = resultType === 'comment' || resultType === 'credit' || resultType === 'Status'
				const evalType: string = (courseData.evaluation_type || 'CIA + ESE').trim().toUpperCase()

				const eseMarks = fm.external_marks_obtained || 0
				const ciaMarks = fm.internal_marks_obtained || 0
				const totalMarks = fm.total_marks_obtained || 0
				const eseMax = fm.external_marks_maximum || 0
				const ciaMax = fm.internal_marks_maximum || 0
				const totalMax = fm.total_marks_maximum || 0
				const percentage = fm.percentage || (totalMax > 0 ? (totalMarks / totalMax) * 100 : 0)

				// Use grade values from database if available, otherwise calculate
				// For comment/credit/Status courses do NOT fall back to percentage-based grade
				// (their letter_grade is stored directly, e.g. "Highly Commended")
				let gradePoint = fm.grade_points
				let letterGrade = fm.letter_grade

				if (!isSpecialType && (gradePoint === null || gradePoint === undefined)) {
					const gradeInfo = getGradeFromPercentage(percentage)
					gradePoint = gradeInfo.gradePoint
					letterGrade = gradeInfo.letterGrade
				}

				// For special types: use DB is_pass; treat AAA grade as absent/failed
				const isAbsent = !isSpecialType && (
					(eseMarks === 0 && ciaMarks === 0 && totalMarks === 0) ||
					(letterGrade === 'AAA')
				)
				const passMarks = isSpecialType ? 0 : Math.ceil(totalMax * (passingPercentage / 100))

				// For comment/credit/Status courses: respect is_pass from DB (AAA = absent = not passing)
				const specialIsPassing = letterGrade === 'AAA' ? false : (fm.is_pass ?? true)
				const { isPassing, result } = isSpecialType
					? { isPassing: specialIsPassing, result: fm.pass_status || 'PASS' }
					: checkPassStatus(eseMarks, eseMax, totalMarks, totalMax, passingPercentage, evalType)

				// If failed, grade point becomes 0
				const finalGradePoint = isSpecialType ? 0 : ((isPassing && !isAbsent) ? (gradePoint || 0) : 0)
				const credits = courseData.credit || 0
				const creditIncluded = courseData.credit_included !== false
				const creditPoints = isSpecialType ? 0 : credits * finalGradePoint

				const part = courseData.course_part_master || 'Part III'

				processedCourses.push({
					courseCode: courseData.course_code,
					courseName: courseData.course_name,
					part,
					partDescription: PART_DESCRIPTIONS[part] || '',
					semester: fm.course_offerings?.semester || 1,
					semesterCode: fm.course_offerings?.course_mapping?.semester_code || '',
					courseOrder: fm.course_offerings?.course_mapping?.course_order || 0,
					credits,
					eseMax,
					ciaMax,
					totalMax,
					eseMarks,
					ciaMarks,
					totalMarks,
					percentage: Math.round(percentage * 100) / 100,
					gradePoint: Math.round(finalGradePoint * 10) / 10,
					letterGrade: letterGrade || (isSpecialType ? '-' : 'U'),
					creditPoints: Math.round(creditPoints * 10) / 10,
					isPassing,
					result,
					resultType,
					passStatus: fm.pass_status || undefined,
					creditValue: fm.credit != null ? Number(fm.credit) : undefined,
					// Enhanced fields
					assessmentType: undefined,
					passMarks,
					isAbsent,
					isMalpractice: false,
					isIneligible: false,
					isTermFail: !isSpecialType && !isPassing && !isAbsent,
					isFinalFail: !isSpecialType && !isPassing && !isAbsent,
					creditIncluded
				})
			})

			// Sort by semester ASC, then course order ASC
			// This ensures arrear papers from previous semesters appear first
			processedCourses.sort((a, b) => {
				const semesterDiff = a.semester - b.semester
				if (semesterDiff !== 0) return semesterDiff
				return a.courseOrder - b.courseOrder
			})

			// Group courses by part
			const partGroups: Record<string, {
				partName: string
				partDescription: string
				courses: ProcessedCourse[]
				totalCredits: number
				totalCreditPoints: number
				partGPA: number
				creditsEarned: number
			}> = {}

			processedCourses.forEach(course => {
				if (!partGroups[course.part]) {
					partGroups[course.part] = {
						partName: course.part,
						partDescription: course.partDescription,
						courses: [],
						totalCredits: 0,
						totalCreditPoints: 0,
						partGPA: 0,
						creditsEarned: 0
					}
				}
				partGroups[course.part].courses.push(course)
				if (course.creditIncluded !== false) {
					partGroups[course.part].totalCredits += course.credits
					partGroups[course.part].totalCreditPoints += course.creditPoints
					if (course.isPassing) {
						partGroups[course.part].creditsEarned += course.credits
					}
				}
			})

			// Calculate part-wise GPA
			Object.values(partGroups).forEach(part => {
				part.partGPA = part.totalCredits > 0
					? Math.round((part.totalCreditPoints / part.totalCredits) * 100) / 100
					: 0
			})

			// Sort parts by order
			const sortedParts = Object.values(partGroups).sort((a, b) =>
				getPartOrder(a.partName) - getPartOrder(b.partName)
			)

			// Calculate overall semester GPA (exclude credit_included = false courses)
			const totalCredits = processedCourses.reduce((sum, c) => sum + (c.creditIncluded !== false ? c.credits : 0), 0)
			const totalCreditPoints = processedCourses.reduce((sum, c) => sum + (c.creditIncluded !== false ? c.creditPoints : 0), 0)
			const semesterGPA = totalCredits > 0
				? Math.round((totalCreditPoints / totalCredits) * 100) / 100
				: 0

			// Calculate credits earned (only passed courses, excluding credit_included = false)
			const creditsEarned = processedCourses
				.filter(c => c.isPassing && c.creditIncluded !== false)
				.reduce((sum, c) => sum + c.credits, 0)

			// Determine overall result
			const hasFailures = processedCourses.some(c => !c.isPassing)
			const overallResult = hasFailures ? 'RA' : 'PASS'

			// Calculate totals for JasperReports summary fields
			const totalIAMax = processedCourses.reduce((sum, c) => sum + c.ciaMax, 0)
			const totalIASecured = processedCourses.reduce((sum, c) => sum + c.ciaMarks, 0)
			const totalEAMax = processedCourses.reduce((sum, c) => sum + c.eseMax, 0)
			const totalEASecured = processedCourses.reduce((sum, c) => sum + c.eseMarks, 0)
			const totalMaxMarks = processedCourses.reduce((sum, c) => sum + c.totalMax, 0)
			const totalSecured = processedCourses.reduce((sum, c) => sum + c.totalMarks, 0)
			const percentage = totalMaxMarks > 0 ? Math.round((totalSecured / totalMaxMarks) * 10000) / 100 : 0

			return NextResponse.json({
				student: {
					id: studentId,
					name: learnerName,
					firstName: learnerExtendedInfo.firstName,
					middleName: learnerExtendedInfo.middleName,
					lastName: learnerExtendedInfo.lastName,
					registerNo,
					dateOfBirth: dateOfBirth,
					photoUrl: photoUrl,
					fatherName: learnerExtendedInfo.fatherName,
					motherName: learnerExtendedInfo.motherName,
					guardianName: learnerExtendedInfo.guardianName,
					gender: learnerExtendedInfo.gender,
					admissionYear: learnerExtendedInfo.admissionYear,
					batchName: learnerExtendedInfo.batchName
				},
				semester: parseInt(semester || '1'),
				session: {
					id: sessionId,
					name: semesterResult?.session_name || '',
					monthYear: semesterResult?.month_year || ''
				},
				program: {
					code: programCode,
					name: programName,
					isPG: isPG
				},
				courses: processedCourses,
				partBreakdown: sortedParts,
				summary: {
					totalCourses: processedCourses.length,
					totalCredits,
					creditsEarned,
					totalCreditPoints: Math.round(totalCreditPoints * 100) / 100,
					semesterGPA,
					cgpa: semesterResult?.cgpa || semesterGPA,
					passedCount: processedCourses.filter(c => c.isPassing).length,
					failedCount: processedCourses.filter(c => !c.isPassing).length,
					overallResult,
					folio: semesterResult?.folio_number || null,
					// JasperReports-compatible fields
					totalIAMax,
					totalIASecured,
					totalEAMax,
					totalEASecured,
					totalMaxMarks,
					totalSecured,
					percentage,
					resultPublicationDate: semesterResult?.result_publication_date || null
				},
				// Generated date for PDF
				generatedDate: new Date().toLocaleDateString('en-IN', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric'
				})
			})
		}

		// Get marksheet data for multiple students (batch)
		if (action === 'batch-marksheet') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const programCode = searchParams.get('programCode')
			const semester = searchParams.get('semester')

			if (!institutionId || !sessionId) {
				return NextResponse.json({
					error: 'institutionId and sessionId are required'
				}, { status: 400 })
			}

			// Resolve the student cohort EXACTLY the way the learner dropdown does
			// (the `students` action), then union with final_marks, then fetch ALL of
			// their papers below WITHOUT a program_code filter.
			//
			// Why the dropdown's source (semester_results_detailed_view), not the
			// semester_results TABLE:
			//  - The VIEW derives program_code through joins, so it returns the full
			//    cohort (~174). The base table's program_code column is null/mismatched
			//    for many learners, so scoping the table by program_code silently
			//    dropped ~80 learners who DO have marks (the "still 90 students" report).
			// Why also union final_marks:
			//  - Catches any learner who has marks but no compiled semester_results row.
			// Fetching every paper for the unioned ids (no program_code filter) also
			// preserves arrear / language (Part I-II) / elective papers.
			let srScopeQuery = supabase
				.from('semester_results_detailed_view')
				.select('student_id')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)
			if (programCode) srScopeQuery = srScopeQuery.eq('program_code', programCode)
			if (semester) srScopeQuery = srScopeQuery.eq('semester', parseInt(semester))

			let fmScopeQuery = supabase
				.from('final_marks')
				.select('student_id')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)
			if (programCode) fmScopeQuery = fmScopeQuery.eq('program_code', programCode)

			// Override default 1000-row limit on both scope queries
			const [srScopeRes, fmScopeRes] = await Promise.all([
				srScopeQuery.range(0, 1000000),
				fmScopeQuery.range(0, 1000000),
			])
			if (srScopeRes.error) throw srScopeRes.error
			if (fmScopeRes.error) throw fmScopeRes.error

			const scopedStudentIds = [...new Set([
				...((srScopeRes.data || []).map((r: any) => r.student_id)),
				...((fmScopeRes.data || []).map((r: any) => r.student_id)),
			].filter(Boolean))]

			if (scopedStudentIds.length === 0) {
				return NextResponse.json({ marksheets: [], total: 0 })
			}

			// Fetch every paper for the scoped students (mirrors the single-student query:
			// no program_code filter, no semester filter — so arrears from earlier
			// semesters are included).
			//
			// IMPORTANT: fetch in CHUNKS of student_ids. A single `.in('student_id', [175
			// UUIDs])` combined with the large nested embed below produces a ~7-8 KB GET
			// URL, which PostgREST / the API gateway can TRUNCATE — silently returning
			// only the learners whose IDs survived in the cut-off `in.(…)` list (this is
			// what capped the batch at ~90 despite a 175-learner cohort). Chunking keeps
			// every URL short, and the chunks run concurrently.
			const FINAL_MARKS_SELECT = `
				id,
				student_id,
				course_id,
				credit,
				internal_marks_obtained,
				internal_marks_maximum,
				external_marks_obtained,
				external_marks_maximum,
				total_marks_obtained,
				total_marks_maximum,
				percentage,
				grade_points,
				letter_grade,
				grade_description,
				is_pass,
				pass_status,
				course_offerings (
					semester,
					course_mapping (
						course_order,
						semester_code,
						courses (
							course_code,
							course_name,
							credit,
							credit_included,
							course_part_master,
							result_type,
							evaluation_type
						)
					)
				),
				exam_registrations (
					stu_register_no,
					student_name
				)
			`

			const FM_CHUNK_SIZE = 40
			const idChunks: string[][] = []
			for (let i = 0; i < scopedStudentIds.length; i += FM_CHUNK_SIZE) {
				idChunks.push(scopedStudentIds.slice(i, i + FM_CHUNK_SIZE))
			}

			const fmChunkResults = await Promise.all(
				idChunks.map((chunk) =>
					supabase
						.from('final_marks')
						.select(FINAL_MARKS_SELECT)
						.in('student_id', chunk)
						.eq('examination_session_id', sessionId)
						.eq('is_active', true)
						.range(0, 1000000)
				)
			)

			const fmChunkError = fmChunkResults.find((r) => r.error)?.error
			if (fmChunkError) throw fmChunkError

			const finalMarks = fmChunkResults.flatMap((r) => r.data || [])
			console.log(`[Semester Marksheet Batch] Cohort=${scopedStudentIds.length}, fetched ${finalMarks.length} final_marks rows across ${idChunks.length} chunks`)

			// Fetch exam session and institution in parallel (performance optimization)
			const [examSessionResult, institutionResult] = await Promise.all([
				supabase
					.from('examination_sessions')
					.select('session_name, month_year')
					.eq('id', sessionId)
					.single(),
				supabase
					.from('institutions')
					.select('myjkkn_institution_ids')
					.eq('id', institutionId)
					.single()
			])

			const sessionName = examSessionResult.data?.session_name || ''
			const sessionMonthYear = examSessionResult.data?.month_year || ''
			const myjkknIds: string[] = institutionResult.data?.myjkkn_institution_ids || []

			// Fetch program name from MyJKKN API for PG detection
			let batchProgramName = ''
			if (programCode && myjkknIds.length > 0) {

				if (myjkknIds.length > 0) {
					try {
						// Use direct service call instead of internal HTTP request
						for (const myjkknInstId of myjkknIds) {
							const programs = await fetchAllMyJKKNPrograms({
								institution_id: myjkknInstId,
								limit: 100,
								is_active: true
							})

							const matchingProgram = programs.find((p: any) =>
								(p.program_id === programCode || p.program_code === programCode)
							)

							if (matchingProgram) {
								batchProgramName = matchingProgram.program_name || (matchingProgram as any).name || ''
								break
							}
						}
					} catch (error) {
						console.warn('[Semester Marksheet Batch] Failed to fetch program name from MyJKKN:', error)
					}
				}
			}

			// Determine if this is a PG program (for passing percentage)
			const batchIsPG = isPGProgram(programCode || '', batchProgramName)
			const batchPassingPercentage = batchIsPG ? 50 : 40

			// Group by student
			const studentMap: Record<string, any> = {}

			finalMarks?.forEach((fm: any) => {
				const studentId = fm.student_id
				if (!studentMap[studentId]) {
					studentMap[studentId] = {
						studentId,
						studentName: fm.exam_registrations?.student_name || '',
						registerNo: fm.exam_registrations?.stu_register_no || '',
						courses: []
					}
				}

				const courseData = fm.course_offerings?.course_mapping?.courses
				if (!courseData) return

				const resultType: string = courseData.result_type || 'Mark'
				const isSpecialType = resultType === 'comment' || resultType === 'credit' || resultType === 'Status'
				const evalType: string = (courseData.evaluation_type || 'CIA + ESE').trim().toUpperCase()

				const eseMarks = fm.external_marks_obtained || 0
				const ciaMarks = fm.internal_marks_obtained || 0
				const totalMarks = fm.total_marks_obtained || 0
				const eseMax = fm.external_marks_maximum || 0
				const ciaMax = fm.internal_marks_maximum || 0
				const totalMax = fm.total_marks_maximum || 0
				const percentage = fm.percentage || (totalMax > 0 ? (totalMarks / totalMax) * 100 : 0)

				let gradePoint = fm.grade_points
				let letterGrade = fm.letter_grade

				if (!isSpecialType && (gradePoint === null || gradePoint === undefined)) {
					const gradeInfo = getGradeFromPercentage(percentage)
					gradePoint = gradeInfo.gradePoint
					letterGrade = gradeInfo.letterGrade
				}

				// For special types: respect is_pass from DB; treat AAA grade as absent/failed
				const isAbsent = !isSpecialType && (
					(eseMarks === 0 && ciaMarks === 0 && totalMarks === 0) ||
					(letterGrade === 'AAA')
				)
				const passMarks = isSpecialType ? 0 : Math.ceil(totalMax * (batchPassingPercentage / 100))

				const specialIsPassingBatch = letterGrade === 'AAA' ? false : (fm.is_pass ?? true)
				const { isPassing, result } = isSpecialType
					? { isPassing: specialIsPassingBatch, result: fm.pass_status || 'PASS' }
					: checkPassStatus(eseMarks, eseMax, totalMarks, totalMax || 100, batchPassingPercentage, evalType)

				const finalGradePoint = isSpecialType ? 0 : ((isPassing && !isAbsent) ? (gradePoint || 0) : 0)
				const credits = courseData.credit || 0
				const creditIncluded = courseData.credit_included !== false
				const creditPoints = isSpecialType ? 0 : credits * finalGradePoint

				// CIA-only (evalType 'CIA') has no ESE max; ESE-only (evalType 'ESE') has no CIA max.
				// Don't apply the legacy 75/25 fallback to those legitimately-zero components.
				const resolvedEseMax = isSpecialType ? 0 : (evalType === 'CIA' ? 0 : (eseMax || 75))
				const resolvedCiaMax = isSpecialType ? 0 : (evalType === 'ESE' ? 0 : (ciaMax || 25))

				studentMap[studentId].courses.push({
					courseCode: courseData.course_code,
					courseName: courseData.course_name,
					part: courseData.course_part_master || 'Part III',
					semester: fm.course_offerings?.semester || 1,
					courseOrder: fm.course_offerings?.course_mapping?.course_order || 0,
					credits,
					eseMax: resolvedEseMax,
					ciaMax: resolvedCiaMax,
					totalMax: isSpecialType ? 0 : (totalMax || 100),
					eseMarks,
					ciaMarks,
					totalMarks,
					percentage: Math.round(percentage * 100) / 100,
					gradePoint: Math.round(finalGradePoint * 10) / 10,
					letterGrade: letterGrade || (isSpecialType ? '-' : 'U'),
					creditPoints: Math.round(creditPoints * 10) / 10,
					isPassing,
					result,
					resultType,
					passStatus: fm.pass_status || undefined,
					creditValue: fm.credit != null ? Number(fm.credit) : undefined,
					// Enhanced fields
					assessmentType: undefined,
					passMarks,
					isAbsent,
					isMalpractice: false,
					isIneligible: false,
					isTermFail: !isSpecialType && !isPassing && !isAbsent,
					isFinalFail: !isSpecialType && !isPassing && !isAbsent,
					creditIncluded
				})
			})

			// Fetch date of birth and photo for all students from MyJKKN API
			const registerNumbers = Object.values(studentMap).map((s: any) => s.registerNo).filter(Boolean)
			const dobMap: Record<string, string> = {}
			const photoMap: Record<string, string> = {}
			const nameMap: Record<string, string> = {}

			// PERFORMANCE: kick off the supplementary semester_results query (folio /
			// cgpa / published_date) NOW so it runs concurrently with the MyJKKN
			// photo/DOB enrichment below — the two are independent.
			// No program_code filter here: the base-table program_code is unreliable
			// (same reason the cohort is scoped via the view), and `studentIds`
			// already pins the exact cohort.
			const studentIds = Object.keys(studentMap)
			const folioMap: Record<string, string> = {}
			const cgpaMap: Record<string, number> = {}
			const resultPublicationDateMap: Record<string, string> = {}

			let folioPromise: any = null
			if (studentIds.length > 0) {
				let srQuery = supabase
					.from('semester_results')
					.select('student_id, folio_number, cgpa, published_date')
					.in('student_id', studentIds)
					.eq('examination_session_id', sessionId)
				if (semester) srQuery = srQuery.eq('semester', parseInt(semester))
				folioPromise = srQuery.range(0, 1000000)
			}

			if (registerNumbers.length > 0) {
				// ====================================================================
				// Fetch photo URL and DOB from MyJKKN API using myjkkn_institution_ids
				// ====================================================================
				console.log(`[Semester Marksheet Batch] Fetching from MyJKKN API for ${registerNumbers.length} students`)

				try {
					const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
					const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

					// Match register numbers tolerantly: normalize case/whitespace and
					// accept any of several MyJKKN id fields. Some profiles store the
					// register number under roll_number / application_number, or with
					// stray spacing/casing, which broke the strict `===` match and left
					// those learners without photo/DOB.
					const norm = (s: any) => (s ?? '').toString().trim().toUpperCase()
					const regNoByNorm = new Map<string, string>()  // normalized -> original COE regNo
					registerNumbers.forEach((rn) => regNoByNorm.set(norm(rn), rn))

					const applyProfile = (lp: any) => {
						const candidates = [
							lp.register_number, lp.registration_number,
							lp.roll_number, lp.rollno, lp.roll_no,
							lp.application_number,
						]
						let regNo: string | undefined
						for (const c of candidates) {
							const hit = regNoByNorm.get(norm(c))
							if (hit) { regNo = hit; break }
						}
						if (!regNo) return
						const profilePhotoUrl = lp.student_photo_url || lp.photo_url || lp.profile_photo || lp.image_url
						if (profilePhotoUrl && !photoMap[regNo]) photoMap[regNo] = profilePhotoUrl
						if (lp.date_of_birth && !dobMap[regNo]) {
							const dob = new Date(lp.date_of_birth)
							if (!isNaN(dob.getTime())) {
								dobMap[regNo] = `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dob.getFullYear()}`
							}
						}
						if (!nameMap[regNo]) {
							const constructedName = lp.student_name || lp.full_name || [lp.first_name, lp.last_name].filter(Boolean).join(' ')
							if (constructedName) nameMap[regNo] = constructedName
						}
					}

					if (myjkknApiKey && myjkknIds.length > 0) {
						const pageSize = 1000
						const MAX_PAGES = 1000      // safety cap
						const PAGE_CONCURRENCY = 5  // fetch 5 pages at a time instead of 1

						const fetchPage = async (myjkknInstId: string, page: number): Promise<any[] | null> => {
							const p = new URLSearchParams()
							p.set('institution_id', myjkknInstId)
							p.set('limit', String(pageSize))
							p.set('page', String(page))
							const resp = await fetch(`${myjkknApiUrl}/api-management/learners/profiles?${p.toString()}`, {
								method: 'GET',
								headers: {
									'Authorization': `Bearer ${myjkknApiKey}`,
									'Accept': 'application/json',
									'Content-Type': 'application/json',
								},
								cache: 'no-store',
							})
							if (!resp.ok) return null
							const json = await resp.json()
							return json.data || []
						}

						for (const myjkknInstId of myjkknIds) {
							let startPage = 1
							let done = false
							while (!done && startPage <= MAX_PAGES) {
								const pageNums = Array.from({ length: PAGE_CONCURRENCY }, (_, i) => startPage + i)
								const results = await Promise.all(pageNums.map((pg) => fetchPage(myjkknInstId, pg)))
								for (const profiles of results) {
									// null (HTTP error) or empty page => reached the end
									if (!profiles || profiles.length === 0) { done = true; continue }
									profiles.forEach(applyProfile)
								}
								// Early-exit once every learner has both photo and DOB
								if (registerNumbers.every((rn) => photoMap[rn] && dobMap[rn])) done = true
								startPage += PAGE_CONCURRENCY
							}
						}

						// Targeted fallback — for any learner the institution-paginated
						// sweep didn't find (commonly because they're filed under a
						// different MyJKKN institution_id), do a direct register_number
						// query. This catches alumni / cross-institution promotions.
						const stillMissingFromMyJKKN = registerNumbers.filter(
							(rn) => !(photoMap[rn] && dobMap[rn] && nameMap[rn])
						)
						if (stillMissingFromMyJKKN.length > 0) {
							console.log(`[Semester Marksheet Batch] ${stillMissingFromMyJKKN.length} learner(s) missing after pagination — running targeted register_number lookup`)
							for (const regNo of stillMissingFromMyJKKN) {
								try {
									const p = new URLSearchParams()
									p.set('register_number', regNo)
									p.set('limit', '200')
									const resp = await fetch(
										`${myjkknApiUrl}/api-management/learners/profiles?${p.toString()}`,
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
									if (resp.ok) {
										const json = await resp.json()
										const profiles: any[] = json.data || []
										profiles.forEach(applyProfile)
										if (profiles.length > 0) {
											console.log(`[Semester Marksheet Batch] Targeted lookup found ${profiles.length} profile(s) for ${regNo}`)
										}
									}
								} catch (e) {
									console.warn(`[Semester Marksheet Batch] Targeted lookup error for ${regNo}:`, e)
								}
							}
						}
					} else if (!myjkknApiKey) {
						console.log(`[Semester Marksheet Batch] No MyJKKN API key configured`)
					} else {
						console.log(`[Semester Marksheet Batch] No myjkkn_institution_ids found for institution`)
					}
				} catch (err) {
					console.error('[Semester Marksheet Batch] MyJKKN fetch error (non-critical):', err)
				}

				// FALLBACK (same strategy the /api/myjkkn/learner-profiles proxy uses):
				// the MyJKKN institution-pagination endpoint omits profiles whose
				// lifecycle_status = 'inactive' (e.g. absent / discontinued learners),
				// so they come back with no photo/DOB even though the data exists. Read
				// those stragglers from the synced local learners_profiles mirror, which
				// has no lifecycle filter. Matched by exact register_number, in chunks.
				const stillMissing = registerNumbers.filter((rn) => !photoMap[rn] || !dobMap[rn])
				if (stillMissing.length > 0) {
					console.log(`[Semester Marksheet Batch] ${stillMissing.length} learners missing photo/DOB from MyJKKN API — filling from local learners_profiles mirror`)
					const LP_CHUNK = 50
					for (let i = 0; i < stillMissing.length; i += LP_CHUNK) {
						const chunk = stillMissing.slice(i, i + LP_CHUNK)
						const { data: lpRows, error: lpErr } = await supabase
							.from('learners_profiles')
							.select('register_number, roll_number, first_name, last_name, date_of_birth, student_photo_url')
							.in('register_number', chunk)
						if (lpErr) {
							// learners_profiles table doesn't exist in this deployment — silently skip
							if (lpErr.code === 'PGRST205') break
							console.warn('[Semester Marksheet Batch] learners_profiles fallback error (non-critical):', lpErr)
							break
						}
						;(lpRows || []).forEach((lp: any) => {
							const regNo = lp.register_number
							if (!regNo) return
							if (!photoMap[regNo] && lp.student_photo_url) photoMap[regNo] = lp.student_photo_url
							if (!dobMap[regNo] && lp.date_of_birth) {
								const dob = new Date(lp.date_of_birth)
								if (!isNaN(dob.getTime())) {
									dobMap[regNo] = `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dob.getFullYear()}`
								}
							}
							if (!nameMap[regNo]) {
								const nm = [lp.first_name, lp.last_name].filter(Boolean).join(' ')
								if (nm) nameMap[regNo] = nm
							}
						})
					}
				}

				console.log(`[Semester Marksheet Batch] Final: ${Object.keys(photoMap).length} photos, ${Object.keys(dobMap).length} DOBs, ${Object.keys(nameMap).length} names`)
			}

			// Now await the folio query that was started in parallel above.
			if (folioPromise) {
				const { data: semesterResults, error: srError } = await folioPromise
				if (srError) {
					console.error('[Semester Marksheet Batch] semester_results query error:', srError)
				} else if (semesterResults) {
					semesterResults.forEach((sr: any) => {
						if (sr.folio_number) folioMap[sr.student_id] = sr.folio_number
						if (sr.cgpa !== null && sr.cgpa !== undefined) cgpaMap[sr.student_id] = sr.cgpa
						if (sr.published_date) resultPublicationDateMap[sr.student_id] = sr.published_date
					})
				}
			}

			// Filter students to only include those whose PRIMARY/CURRENT semester matches the selected semester
			// A student's primary semester = their highest semester (current enrollment level)
			// Then include ALL their courses (current semester courses + arrear papers from previous semesters)
			// This matches the learner dropdown filtering behavior
			const filteredStudentMap = semester
				? Object.fromEntries(
						Object.entries(studentMap).filter(([_, student]: [string, any]) => {
							if (student.courses.length === 0) return false
							// Determine student's primary/current semester (highest semester they're enrolled in)
							const primarySemester = Math.max(...student.courses.map((c: any) => c.semester))
							// Include only if primary semester matches selected semester
							// Example: Semester II students appear in Semester II batch (even if they have Semester I arrears)
							// Example: Semester III students do NOT appear in Semester II batch (even if they have Semester II arrears)
							return primarySemester === parseInt(semester)
						})
				  )
				: studentMap

			// Process each student's data into marksheet format
			const marksheets = Object.values(filteredStudentMap).map((student: any) => {
				// Sort courses by semester ASC, then course order ASC
				// This ensures arrear papers from previous semesters appear first
				student.courses.sort((a: any, b: any) => {
					const semesterDiff = a.semester - b.semester
					if (semesterDiff !== 0) return semesterDiff
					return a.courseOrder - b.courseOrder
				})

				// Group courses by part
				const partGroups: Record<string, {
					partName: string
					partDescription: string
					courses: any[]
					totalCredits: number
					totalCreditPoints: number
					partGPA: number
					creditsEarned: number
				}> = {}

				student.courses.forEach((course: any) => {
					if (!partGroups[course.part]) {
						partGroups[course.part] = {
							partName: course.part,
							partDescription: PART_DESCRIPTIONS[course.part] || '',
							courses: [],
							totalCredits: 0,
							totalCreditPoints: 0,
							partGPA: 0,
							creditsEarned: 0
						}
					}
					partGroups[course.part].courses.push(course)
					if (course.creditIncluded !== false) {
						partGroups[course.part].totalCredits += course.credits
						partGroups[course.part].totalCreditPoints += course.creditPoints
						if (course.isPassing) {
							partGroups[course.part].creditsEarned += course.credits
						}
					}
				})

				// Calculate part-wise GPA
				Object.values(partGroups).forEach(part => {
					part.partGPA = part.totalCredits > 0
						? Math.round((part.totalCreditPoints / part.totalCredits) * 100) / 100
						: 0
				})

				// Sort parts by order
				const sortedParts = Object.values(partGroups).sort((a, b) =>
					getPartOrder(a.partName) - getPartOrder(b.partName)
				)

				// Calculate GPA
				const totalCredits = student.courses.reduce((sum: number, c: any) => sum + (c.creditIncluded !== false ? c.credits : 0), 0)
				const totalCreditPoints = student.courses.reduce((sum: number, c: any) => sum + (c.creditIncluded !== false ? c.creditPoints : 0), 0)
				const semesterGPA = totalCredits > 0
					? Math.round((totalCreditPoints / totalCredits) * 100) / 100
					: 0

				const creditsEarned = student.courses
					.filter((c: any) => c.isPassing && c.creditIncluded !== false)
					.reduce((sum: number, c: any) => sum + c.credits, 0)

				const hasFailures = student.courses.some((c: any) => !c.isPassing)

				return {
					student: {
						id: student.studentId,
						name: nameMap[student.registerNo] || student.studentName,
						registerNo: student.registerNo,
						dateOfBirth: dobMap[student.registerNo] || null,
						photoUrl: photoMap[student.registerNo] || null
					},
					semester: parseInt(semester || '1'),
					session: {
						id: sessionId,
						name: sessionName,
						monthYear: sessionMonthYear
					},
					program: {
						code: programCode || '',
						name: batchProgramName || programCode || '',
						isPG: batchIsPG
					},
					courses: student.courses,
					partBreakdown: sortedParts,
					summary: {
						totalCourses: student.courses.length,
						totalCredits,
						creditsEarned,
						totalCreditPoints: Math.round(totalCreditPoints * 100) / 100,
						semesterGPA,
						cgpa: cgpaMap[student.studentId] || semesterGPA,
						passedCount: student.courses.filter((c: any) => c.isPassing).length,
						failedCount: student.courses.filter((c: any) => !c.isPassing).length,
						overallResult: hasFailures ? 'RA' : 'PASS',
						folio: folioMap[student.studentId] || null,
						resultPublicationDate: resultPublicationDateMap[student.studentId] || null
					}
				}
			})

			// Sort by register number
			marksheets.sort((a, b) => a.student.registerNo.localeCompare(b.student.registerNo))

			return NextResponse.json({
				marksheets,
				total: marksheets.length
			})
		}

		// Get programs for dropdown
		if (action === 'programs') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')

			console.log('[Semester Marksheet API - Programs] institutionId:', institutionId, 'sessionId:', sessionId)

			if (!institutionId) {
				return NextResponse.json({ error: 'institutionId is required' }, { status: 400 })
			}

			// Get institution's myjkkn_institution_ids for MyJKKN API call
			const { data: institution, error: instError } = await supabase
				.from('institutions')
				.select('id, institution_code, myjkkn_institution_ids')
				.eq('id', institutionId)
				.single()

			if (instError || !institution) {
				console.error('[Semester Marksheet API] Institution not found:', instError)
				return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
			}

			console.log('[Semester Marksheet API - Programs] Institution found:', institution.institution_code, 'myjkkn_ids:', institution.myjkkn_institution_ids)

			const myjkknInstitutionIds: string[] = institution.myjkkn_institution_ids || []

			if (myjkknInstitutionIds.length === 0) {
				console.log('[Semester Marksheet API] No myjkkn_institution_ids found - returning empty')
				return NextResponse.json({ programs: [] })
			}

			// Fetch programs from MyJKKN API for each institution ID
			// Use direct service call instead of internal HTTP request
			const allPrograms: any[] = []

			for (const myjkknInstId of myjkknInstitutionIds) {
				try {
					const programs = await fetchAllMyJKKNPrograms({
						institution_id: myjkknInstId,
						limit: 100,
						is_active: true
					})

					// Client-side filter by institution_id
					const filteredPrograms = Array.isArray(programs)
						? programs.filter((p: any) => p.institution_id === myjkknInstId && p.is_active !== false)
						: []

					allPrograms.push(...filteredPrograms)
				} catch (error) {
					console.error(`[Semester Marksheet API] Error fetching programs for inst ${myjkknInstId}:`, error)
				}
			}

			// Deduplicate by program_code (MyJKKN uses program_id as the CODE field, not UUID!)
			// Per myjkkn-coe-dev-rules: use program_id || program_code for the code field
			const programMap = new Map<string, { name: string; order: number }>()
			for (const prog of allPrograms) {
				// MyJKKN returns program_id as the CODE (e.g., "UEN"), not as a UUID
				const code = prog.program_id || prog.program_code
				if (code && !programMap.has(code)) {
					programMap.set(code, {
						name: prog.program_name || prog.name || code,
						order: prog.program_order ?? prog.sort_order ?? 999
					})
				}
			}

			// Convert to array and sort by program_order (UEN=1, UHI=2, etc.)
			const programs = Array.from(programMap.entries())
				.map(([code, { name, order }]) => ({
					program_code: code,
					program_name: name,
					program_order: order
				}))
				.sort((a, b) => {
					if (a.program_order !== b.program_order) return a.program_order - b.program_order
					return a.program_code.localeCompare(b.program_code)
				})

			console.log('[Semester Marksheet API - Programs] Returning', programs.length, 'programs:', programs.map(p => p.program_code))

			return NextResponse.json({ programs })
		}

		// Get semesters for dropdown
		if (action === 'semesters') {
			const institutionId = searchParams.get('institutionId')
			const programCode = searchParams.get('programCode')
			const sessionId = searchParams.get('sessionId')

			if (!institutionId) {
				return NextResponse.json({ error: 'institutionId is required' }, { status: 400 })
			}

			let query = supabase
				.from('semester_results')
				.select('semester')
				.eq('institutions_id', institutionId)
				.eq('is_active', true)

			if (programCode) {
				query = query.eq('program_code', programCode)
			}

			if (sessionId) {
				query = query.eq('examination_session_id', sessionId)
			}

			// Override default 1000-row limit so all distinct semesters are captured
			const { data, error } = await query.range(0, 100000)

			if (error) throw error

			const semesters = [...new Set(data?.map(d => d.semester))].sort((a, b) => a - b)

			return NextResponse.json({ semesters })
		}

		// Get students for dropdown
		if (action === 'students') {
			const institutionId = searchParams.get('institutionId')
			const sessionId = searchParams.get('sessionId')
			const programCode = searchParams.get('programCode')
			const semester = searchParams.get('semester')

			if (!institutionId || !sessionId) {
				return NextResponse.json({ error: 'institutionId and sessionId are required' }, { status: 400 })
			}

			// Use semester_results_detailed_view which has student_name pre-joined
			let query = supabase
				.from('semester_results_detailed_view')
				.select('student_id, register_number, student_name')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			if (programCode) {
				query = query.eq('program_code', programCode)
			}

			if (semester) {
				query = query.eq('semester', parseInt(semester))
			}

			// Override default 1000-row limit; the view has one row per student-course,
			// so a full program can exceed 1000 rows and drop students before dedup.
			const { data, error } = await query.order('register_number').range(0, 100000)

			if (error) throw error

			// Deduplicate by student_id
			const studentMap = new Map()
			data?.forEach(s => {
				if (!studentMap.has(s.student_id)) {
					studentMap.set(s.student_id, {
						id: s.student_id,
						registerNo: s.register_number,
						name: s.student_name
					})
				}
			})

			return NextResponse.json({ students: Array.from(studentMap.values()) })
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

	} catch (error) {
		console.error('Semester marksheet API error:', error)
		return NextResponse.json({
			error: error instanceof Error ? error.message : 'Failed to process request'
		}, { status: 500 })
	}
}
