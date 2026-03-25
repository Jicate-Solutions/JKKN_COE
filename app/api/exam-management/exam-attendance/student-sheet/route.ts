import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Fetch student-wise attendance sheets
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const sessionCode = searchParams.get('session_code')
		const examDate = searchParams.get('exam_date') || null
		const session = searchParams.get('session') || null
		const programCode = searchParams.get('program_code') || null
		const courseCode = searchParams.get('course_code') || null

		// Validate required parameters
		if (!sessionCode) {
			return NextResponse.json(
				{ error: 'session_code is required' },
				{ status: 400 }
			)
		}

		console.log('Fetching student attendance sheet with params:', {
			sessionCode,
			examDate,
			session,
			programCode,
			courseCode
		})

		// Call the database function
		const { data, error } = await supabase.rpc('get_student_attendance_sheet', {
			p_session_code: sessionCode,
			p_exam_date: examDate,
			p_session: session,
			p_program_code: programCode,
			p_course_code: courseCode
		})

		if (error) {
			console.error('Error fetching student attendance sheet:', error)
			return NextResponse.json(
				{ error: 'Failed to fetch student attendance sheet', details: error.message },
				{ status: 500 }
			)
		}

		console.log('Student attendance sheet records found:', data?.length || 0)

		// Group data by exam_date and session (merge all courses in same date+session into one sheet)
		const groupedByDateSession: Record<string, any> = {}

		data?.forEach((record: any) => {
			const dateSessionKey = `${record.exam_date}_${record.session}`

			if (!groupedByDateSession[dateSessionKey]) {
				groupedByDateSession[dateSessionKey] = {
					exam_date: record.exam_date,
					session: record.session,
					session_name: record.session_name,
					institution_name: record.institution_name,
					institution_code: record.institution_code,
					regulation_code: record.regulation_code,
					courses: {}
				}
			}

			// Group by course within the date+session
			const courseKey = `${record.course_code}`

			if (!groupedByDateSession[dateSessionKey].courses[courseKey]) {
				groupedByDateSession[dateSessionKey].courses[courseKey] = {
					course_code: record.course_code,
					course_title: record.course_title,
					program_code: record.program_code,
					program_name: record.program_name,
					program_order: record.program_order || 999,
					semester: record.semester,
					students: []
				}
			}

			groupedByDateSession[dateSessionKey].courses[courseKey].students.push({
				register_number: record.register_number,
				student_name: record.student_name,
				attendance_status: record.attendance_status.toUpperCase(),
				program_code: record.program_code,
				program_name: record.program_name,
				semester: record.semester
			})
		})

		// Convert to array of sheets (one sheet per date+session with all courses)
		const sheets = Object.values(groupedByDateSession).map((dateSessionGroup: any) => {
			// Sort courses by program_order, then by program_code
			const sortedCourses = Object.values(dateSessionGroup.courses).sort((a: any, b: any) => {
				if (a.program_order !== b.program_order) {
					return a.program_order - b.program_order
				}
				return a.program_code.localeCompare(b.program_code)
			})

			return {
				metadata: {
					exam_date: dateSessionGroup.exam_date,
					session: dateSessionGroup.session,
					session_name: dateSessionGroup.session_name,
					institution_name: dateSessionGroup.institution_name,
					institution_code: dateSessionGroup.institution_code,
					regulation_code: dateSessionGroup.regulation_code
				},
				courses: sortedCourses
			}
		})

		console.log('Generated sheets:', sheets.length, 'date+session combinations')

		// Override student names from MyJKKN learner profiles
		if (sheets.length > 0) {
			const institutionCode = (sheets[0] as any).metadata?.institution_code
			if (institutionCode) {
				const { data: institutionRow } = await supabase
					.from('institutions')
					.select('myjkkn_institution_ids')
					.eq('institution_code', institutionCode)
					.maybeSingle()

				const myjkknIds: string[] = institutionRow?.myjkkn_institution_ids || []
				if (myjkknIds.length > 0) {
					// Collect all register numbers
					const allRegNos = new Set<string>()
					for (const sheet of sheets as any[]) {
						for (const course of sheet.courses as any[]) {
							for (const stu of course.students as any[]) {
								if (stu.register_number) allRegNos.add(stu.register_number)
							}
						}
					}

					const nameMap = new Map<string, string>()
					const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
					const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

					if (myjkknApiKey && allRegNos.size > 0) {
						try {
							for (const myjkknInstId of myjkknIds) {
								let pg = 1
								const pgSize = 200
								let hasMorePages = true

								while (hasMorePages) {
									const profileParams = new URLSearchParams({
										institution_id: myjkknInstId,
										limit: String(pgSize),
										page: String(pg),
									})
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
										for (const lp of profiles) {
											const regNo = lp.register_number
											if (regNo && allRegNos.has(regNo) && !nameMap.has(regNo.toUpperCase())) {
												const myjkknFullName = lp.student_name || lp.full_name || ''
												const constructedName = myjkknFullName ||
													[lp.first_name, lp.last_name].filter(Boolean).join(' ')
												if (constructedName) nameMap.set(regNo.toUpperCase(), constructedName)
											}
										}
										hasMorePages = profiles.length === pgSize
										pg++
									} else {
										hasMorePages = false
									}
								}
							}
						} catch (myjkknError) {
							console.warn('[AttendanceSheet] MyJKKN API error (non-critical):', myjkknError)
						}

						// Override student names in all sheets
						if (nameMap.size > 0) {
							for (const sheet of sheets as any[]) {
								for (const course of sheet.courses as any[]) {
									for (const stu of course.students as any[]) {
										const key = stu.register_number?.toUpperCase()
										if (key && nameMap.has(key)) stu.student_name = nameMap.get(key)
									}
								}
							}
							console.log(`[AttendanceSheet] Names overridden from MyJKKN: ${nameMap.size}/${allRegNos.size}`)
						}
					}
				}
			}
		}

		return NextResponse.json({ sheets })

	} catch (error) {
		console.error('Student attendance sheet API error:', error)
		const errorMessage = error instanceof Error ? error.message : 'Internal server error'
		return NextResponse.json(
			{ error: 'Failed to fetch student attendance sheet', details: errorMessage },
			{ status: 500 }
		)
	}
}
