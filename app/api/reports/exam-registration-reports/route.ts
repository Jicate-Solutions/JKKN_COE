import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')
		const report_type = searchParams.get('report_type')

		if (!institutions_id || !examination_session_id || !report_type) {
			return NextResponse.json(
				{ error: 'institutions_id, examination_session_id, and report_type are required' },
				{ status: 400 }
			)
		}

		// Fetch institution and session details for report header
		const [{ data: institution }, { data: session }] = await Promise.all([
			supabase.from('institutions').select('id, institution_code, name, myjkkn_institution_ids').eq('id', institutions_id).single(),
			supabase.from('examination_sessions').select('id, session_code, session_name').eq('id', examination_session_id).single(),
		])

		if (!institution || !session) {
			return NextResponse.json({ error: 'Institution or Session not found' }, { status: 404 })
		}

		// Fetch all registrations for this institution + session with course details
		// Paginate to bypass Supabase 1000-row limit
		let allRegistrations: any[] = []
		let page = 0
		let hasMore = true
		const pageSize = 1000

		while (hasMore) {
			const { data, error } = await supabase
				.from('exam_registrations')
				.select(`
					id,
					stu_register_no,
					student_name,
					is_regular,
					attempt_number,
					fee_paid,
					fee_amount,
					program_code,
					course_offering_id
				`)
				.eq('institutions_id', institutions_id)
				.eq('examination_session_id', examination_session_id)
				.order('stu_register_no', { ascending: true })
				.range(page * pageSize, (page + 1) * pageSize - 1)

			if (error) {
				console.error('Error fetching registrations:', error)
				return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
			}

			if (data && data.length > 0) {
				allRegistrations = allRegistrations.concat(data)
				page++
				hasMore = data.length === pageSize
			} else {
				hasMore = false
			}
		}

		if (allRegistrations.length === 0) {
			return NextResponse.json({
				report_type,
				institution_name: institution.name,
				institution_code: institution.institution_code,
				session_name: session.session_name,
				session_code: session.session_code,
				generated_at: new Date().toISOString(),
				data: [],
			})
		}

		// Get unique course_offering_ids (filter nulls) and fetch course offering details
		const courseOfferingIds = [...new Set(allRegistrations.map(r => r.course_offering_id).filter(Boolean))]

		// Fetch course offerings with course details in batches (Supabase .in() limit)
		let allOfferings: any[] = []
		const batchSize = 100
		for (let i = 0; i < courseOfferingIds.length; i += batchSize) {
			const batch = courseOfferingIds.slice(i, i + batchSize)
			const { data: offerings, error: offeringsError } = await supabase
				.from('course_offerings')
				.select(`
					id,
					course_code,
					program_code,
					semester,
					course_id,
					courses:course_id(course_name, board_id, board_code, course_category)
				`)
				.in('id', batch)

			if (offeringsError) {
				console.error('Error fetching course offerings:', offeringsError)
			} else if (offerings) {
				allOfferings = allOfferings.concat(offerings)
			}
		}

		// Fetch ALL boards for both ID-based and code-based lookup
		const boardMap = new Map<string, { board_code: string, board_order: number, board_type: string | null }>()
		const boardCodeMap = new Map<string, { board_code: string, board_order: number, board_type: string | null }>()
		const boardNameMap = new Map<string, string>()
		{
			const { data: allBoards } = await supabase
				.from('board')
				.select('id, board_code, board_name, board_order, board_type')
			if (allBoards) {
				allBoards.forEach(b => {
					const info = { board_code: b.board_code, board_order: b.board_order ?? 999, board_type: b.board_type || null }
					boardMap.set(b.id, info)
					boardCodeMap.set(b.board_code, info)
					if (b.board_name) boardNameMap.set(b.board_code, b.board_name)
				})
			}
		}

		// Fetch course_order from course_mapping for proper course sorting
		const uniqueCourseIds = [...new Set(allOfferings.map(o => o.course_id).filter(Boolean))]
		const courseMappingOrderMap = new Map<string, number>() // course_id -> course_order
		if (uniqueCourseIds.length > 0) {
			for (let i = 0; i < uniqueCourseIds.length; i += batchSize) {
				const batch = uniqueCourseIds.slice(i, i + batchSize)
				const { data: mappings } = await supabase
					.from('course_mapping')
					.select('course_id, course_order')
					.in('course_id', batch)
				if (mappings) {
					for (const m of mappings) {
						if (m.course_id && !courseMappingOrderMap.has(m.course_id)) {
							courseMappingOrderMap.set(m.course_id, m.course_order ?? 999)
						}
					}
				}
			}
		}

		// Fetch program_name from local programs table
		const programNameMap = new Map<string, string>()
		{
			const { data: localPrograms } = await supabase
				.from('programs')
				.select('program_code, program_name')
				.eq('institutions_id', institutions_id)
				.eq('is_active', true)
			if (localPrograms) {
				for (const lp of localPrograms) {
					if (lp.program_code && lp.program_name) {
						programNameMap.set(lp.program_code, lp.program_name)
					}
				}
			}
		}

		// Fetch program_order and program_name from MyJKKN API (paginated)
		const programOrderMap = new Map<string, number>()
		const myjkknIds: string[] = institution.myjkkn_institution_ids || []
		if (myjkknIds.length > 0) {
			const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
			const myjkknApiKey = process.env.MYJKKN_API_KEY || ''
			if (myjkknApiKey) {
				try {
					for (const myjkknInstId of myjkknIds) {
						let pg = 1
						let hasMorePages = true

						while (hasMorePages) {
							const programParams = new URLSearchParams({
								institution_id: myjkknInstId,
								limit: '200',
								page: String(pg),
							})
							const programResponse = await fetch(
								`${myjkknApiUrl}/api-management/programs?${programParams.toString()}`,
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
							if (programResponse.ok) {
								const programData = await programResponse.json()
								const programs = programData.data || programData || []
								for (const p of programs) {
									const code = p.program_id || p.program_code || ''
									if (code && !programOrderMap.has(code)) {
										programOrderMap.set(code, p.program_order ?? p.sort_order ?? 999)
									}
									if (code && !programNameMap.has(code)) {
										const pName = p.program_name || p.name || ''
										if (pName) programNameMap.set(code, pName)
									}
								}
								hasMorePages = programs.length === 200
								pg++
							} else {
								hasMorePages = false
							}
						}
					}
				} catch (progError) {
					console.warn('[ExamReports] MyJKKN programs API error (non-critical):', progError)
				}
			}
		}

		// Create lookup map for course offerings
		const offeringMap = new Map(
			allOfferings.map(o => {
				const courseData = o.courses as any

				// Prefer board_code (text) over board_id (FK) — board_id can point to wrong board
				let boardInfo = courseData?.board_code
					? boardCodeMap.get(courseData.board_code)
					: boardMap.get(courseData?.board_id)

				// Derive board from course_code prefix when board lookup fails
				// Pattern: course_code like "24PCACP01" → prefix at chars 2-4 = "PCA" → matches board_code
				if (!boardInfo && o.course_code && o.course_code.length >= 5) {
					const prefix = o.course_code.substring(2, 5)
					boardInfo = boardCodeMap.get(prefix)
					// Fallback: try program_code as board_code (for shared courses)
					if (!boardInfo && o.program_code) {
						boardInfo = boardCodeMap.get(o.program_code)
					}
				}

				// program_board_order: board_order for the program itself (program_code = board_code)
				const programBoardInfo = boardCodeMap.get(o.program_code)

				return [o.id, {
					course_code: o.course_code,
					course_id: o.course_id,
					course_order: courseMappingOrderMap.get(o.course_id) ?? 999,
					board_type: boardInfo?.board_type || null,
					program_code: o.program_code,
					program_name: programNameMap.get(o.program_code) || boardNameMap.get(o.program_code) || null,
					semester: o.semester,
					course_name: (o.courses as any)?.course_name || null,
					course_category: (o.courses as any)?.course_category || null,
					board_code: boardInfo?.board_code || null,
					board_name: boardNameMap.get(boardInfo?.board_code || '') || null,
					board_order: boardInfo?.board_order ?? 999,
					program_order: programOrderMap.get(o.program_code) ?? 999,
					program_board_order: programBoardInfo?.board_order ?? 999,
				}]
			})
		)

		// Enrich registrations with course offering details
		const enriched = allRegistrations.map(r => ({
			...r,
			course_offering: offeringMap.get(r.course_offering_id) || null,
			// student_board_type: UG/PG based on student's own program (used for UG/PG PDF splitting)
			student_board_type: boardCodeMap.get(r.program_code)?.board_type || null,
		}))

		// Fetch name (all report types) and DOB (student-fee-details only) from MyJKKN learner profiles
		const registerNumbers = [...new Set(allRegistrations.map(r => r.stu_register_no).filter(Boolean))]

		if (registerNumbers.length > 0 && myjkknIds.length > 0) {
			const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
			const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

			if (myjkknApiKey) {
				const dobMap = new Map<string, string>()
				const nameMap = new Map<string, string>()
				const registerNumberSet = new Set(registerNumbers)

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
									if (regNo && registerNumberSet.has(regNo)) {
										const key = regNo.toUpperCase()
										// Extract name (all report types)
										if (!nameMap.has(key)) {
											const myjkknFullName = lp.student_name || lp.full_name || ''
											const constructedName = myjkknFullName ||
												[lp.first_name, lp.last_name].filter(Boolean).join(' ')
											if (constructedName) nameMap.set(key, constructedName)
										}
										// Extract DOB (student-fee-details only)
										if (report_type === 'student-fee-details' && !dobMap.has(key) && lp.date_of_birth) {
											try {
												const dob = new Date(lp.date_of_birth)
												if (!isNaN(dob.getTime())) {
													dobMap.set(key, `${String(dob.getDate()).padStart(2, '0')}-${String(dob.getMonth() + 1).padStart(2, '0')}-${dob.getFullYear()}`)
												} else {
													dobMap.set(key, lp.date_of_birth)
												}
											} catch {
												dobMap.set(key, lp.date_of_birth)
											}
										}
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
					console.warn('[ExamReports] MyJKKN API error (non-critical):', myjkknError)
				}

				// Enrich with name (always) and DOB (student-fee-details only)
				for (const r of enriched) {
					const regNo = r.stu_register_no?.toUpperCase()
					if (regNo) {
						if (nameMap.has(regNo)) r.student_name = nameMap.get(regNo)
						if (dobMap.has(regNo)) r.date_of_birth = dobMap.get(regNo)
					}
				}

				console.log(`[ExamReports] Names: ${nameMap.size}/${registerNumbers.length}, DOBs: ${dobMap.size}/${registerNumbers.length} from MyJKKN`)
			}
		}

		// ── Exam Date-wise reports: enrich with timetable + attendance data ──
		const isDateWiseReport = report_type === 'exam-date-wise-registration' || report_type === 'exam-date-wise-attendance'

		if (isDateWiseReport) {
			// Fetch exam_timetables — maps course_offering → exam_date + session
			// Two lookup strategies:
			//   1. By course_offering_id (regular courses — 1:1 mapping)
			//   2. By course_id fallback (shared courses like Tamil — one timetable entry for many offerings)
			const timetableByOfferingMap = new Map<string, { exam_date: string, session: string }>()
			const timetableByCourseIdMap = new Map<string, { exam_date: string, session: string }>()

			// Strategy 1: Lookup by course_offering_id
			for (let i = 0; i < courseOfferingIds.length; i += batchSize) {
				const batch = courseOfferingIds.slice(i, i + batchSize)
				const { data: timetables, error: ttError } = await supabase
					.from('exam_timetables')
					.select('course_offering_id, exam_date, session')
					.eq('institutions_id', institutions_id)
					.eq('examination_session_id', examination_session_id)
					.eq('is_published', true)
					.in('course_offering_id', batch)

				if (!ttError && timetables) {
					for (const tt of timetables) {
						if (tt.course_offering_id && !timetableByOfferingMap.has(tt.course_offering_id)) {
							timetableByOfferingMap.set(tt.course_offering_id, {
								exam_date: tt.exam_date,
								session: tt.session
							})
						}
					}
				}
			}

			// Strategy 2: Lookup by course_id for shared/common courses (Tamil, English, etc.)
			// Get course_ids that DON'T have a timetable match by course_offering_id
			const unmatchedCourseIds = new Set<string>()
			for (const offering of allOfferings) {
				if (!timetableByOfferingMap.has(offering.id) && offering.course_id) {
					unmatchedCourseIds.add(offering.course_id)
				}
			}

			if (unmatchedCourseIds.size > 0) {
				const unmatchedBatch = Array.from(unmatchedCourseIds)
				for (let i = 0; i < unmatchedBatch.length; i += batchSize) {
					const batch = unmatchedBatch.slice(i, i + batchSize)
					const { data: timetables, error: ttError } = await supabase
						.from('exam_timetables')
						.select('course_id, exam_date, session')
						.eq('institutions_id', institutions_id)
						.eq('examination_session_id', examination_session_id)
						.eq('is_published', true)
						.in('course_id', batch)

					if (!ttError && timetables) {
						for (const tt of timetables) {
							if (tt.course_id && !timetableByCourseIdMap.has(tt.course_id)) {
								timetableByCourseIdMap.set(tt.course_id, {
									exam_date: tt.exam_date,
									session: tt.session
								})
							}
						}
					}
				}
			}

			// Build offering_id → course_id lookup from allOfferings
			const offeringToCourseId = new Map<string, string>()
			for (const o of allOfferings) {
				if (o.id && o.course_id) offeringToCourseId.set(o.id, o.course_id)
			}

			// Attach timetable data to each enriched row (try offering_id first, then course_id fallback)
			for (const row of enriched) {
				const tt = timetableByOfferingMap.get(row.course_offering_id)
				if (tt) {
					row.exam_date = tt.exam_date
					row.exam_session = tt.session
				} else {
					// Fallback: lookup by course_id for shared courses
					const courseId = offeringToCourseId.get(row.course_offering_id)
					if (courseId) {
						const ttFallback = timetableByCourseIdMap.get(courseId)
						if (ttFallback) {
							row.exam_date = ttFallback.exam_date
							row.exam_session = ttFallback.session
						}
					}
				}
			}

			// For attendance report: fetch present counts from exam_attendance
			if (report_type === 'exam-date-wise-attendance') {
				// Build a count of 'Present' per course_offering_id from exam_attendance
				// exam_attendance links via exam_registration_id → exam_registrations.id
				const regIds = enriched.map((r: any) => r.id)
				const attendancePresentSet = new Set<string>() // registration IDs that are Present

				for (let i = 0; i < regIds.length; i += batchSize) {
					const batch = regIds.slice(i, i + batchSize)
					const { data: attendanceData, error: attError } = await supabase
						.from('exam_attendance')
						.select('exam_registration_id, attendance_status')
						.in('exam_registration_id', batch)

					if (!attError && attendanceData) {
						for (const att of attendanceData) {
							if (att.attendance_status === 'Present') {
								attendancePresentSet.add(att.exam_registration_id)
							}
						}
					}
				}

				// Attach is_present flag to each registration row
				for (const row of enriched) {
					row.is_present = attendancePresentSet.has(row.id)
				}
			}
		}

		return NextResponse.json({
			report_type,
			institution_name: institution.name,
			institution_code: institution.institution_code,
			session_name: session.session_name,
			session_code: session.session_code,
			generated_at: new Date().toISOString(),
			data: enriched,
		})
	} catch (e) {
		console.error('Exam registration reports API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
