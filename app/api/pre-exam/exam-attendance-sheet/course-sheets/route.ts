/**
 * Course Assessment Sheets API
 *
 * GET /api/pre-exam/exam-attendance-sheet/course-sheets?institution_id=XXX&examination_session_id=YYY&course_code=24UHAWP01
 *
 * For one course code, returns every programme that has learners registered for
 * it in the session, with the learner list per programme. The page turns each
 * programme into its own PDF (attendance sheet + mark entry sheet).
 *
 * Learners are attributed by exam_registrations.program_code, not the offering's
 * program_code - a common paper is often registered against another programme's
 * offering copy.
 */

import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { CourseSheetData, CourseSheetProgram } from '@/types/course-assessment-sheet'

const PAGE_SIZE = 1000
// Registrations that must not be printed. Pending ones stay: the sheets are
// handed out before approval completes and the learner is still in the class.
const EXCLUDED_STATUSES = new Set(['cancelled', 'rejected', 'withdrawn'])
const ROMAN_YEARS = ['I', 'II', 'III', 'IV', 'V', 'VI']

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionId = searchParams.get('institution_id')
		const examinationSessionId = searchParams.get('examination_session_id')
		const courseCode = (searchParams.get('course_code') || '').trim().toUpperCase()

		if (!institutionId || !examinationSessionId || !courseCode) {
			return NextResponse.json(
				{ error: 'institution_id, examination_session_id and course_code are all required' },
				{ status: 400 }
			)
		}

		// ilike gives a case-insensitive exact match once the wildcards are escaped
		const courseCodePattern = courseCode.replace(/[\\%_]/g, '\\$&')

		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id, institution_code, name, myjkkn_institution_ids')
			.eq('id', institutionId)
			.single()

		if (instError || !institution) {
			console.error('[CourseSheets] Institution lookup error:', instError)
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		const { data: examSession, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id, session_code, session_name')
			.eq('id', examinationSessionId)
			.single()

		if (sessionError || !examSession) {
			return NextResponse.json({ error: 'Examination session not found' }, { status: 404 })
		}

		const { data: pdfSettings } = await supabase
			.from('pdf_institution_settings')
			.select('logo_url, secondary_logo_url')
			.eq('institution_code', institution.institution_code)
			.eq('active', true)
			.order('wef_date', { ascending: false })
			.limit(1)
			.maybeSingle()

		// Registrations - a common paper can pass Supabase's 1000-row cap, so page
		// through it. `id` is the unique tiebreaker that keeps pages from overlapping.
		const registrations: any[] = []
		for (let from = 0; ; from += PAGE_SIZE) {
			const { data: page, error: regError } = await supabase
				.from('exam_registrations')
				.select('id, stu_register_no, student_name, program_code, registration_status, course_offerings(semester)')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', examinationSessionId)
				.ilike('course_code', courseCodePattern)
				.order('stu_register_no', { ascending: true })
				.order('id', { ascending: true })
				.range(from, from + PAGE_SIZE - 1)

			if (regError) {
				console.error('[CourseSheets] Registrations fetch error:', regError)
				return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
			}

			registrations.push(...(page || []))
			if (!page || page.length < PAGE_SIZE) break
		}

		const liveRegistrations = registrations.filter(
			r => !EXCLUDED_STATUSES.has(String(r.registration_status || '').toLowerCase())
		)

		if (liveRegistrations.length === 0) {
			return NextResponse.json(
				{ error: `No registrations found for ${courseCode} in this session` },
				{ status: 404 }
			)
		}

		// Course title - duplicate master rows exist, any of them carries the name
		const { data: courseRows } = await supabase
			.from('courses')
			.select('course_code, course_name')
			.eq('institutions_id', institutionId)
			.ilike('course_code', courseCodePattern)
			.limit(1)

		const courseTitle = courseRows?.[0]?.course_name || courseCode

		// Programme names + order straight from MyJKKN (same as the attendance sheet route)
		const myjkknIds: string[] = institution.myjkkn_institution_ids || []
		const programInfoMap = new Map<string, { name: string; order: number }>()
		const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
		const myjkknApiKey = process.env.MYJKKN_API_KEY || ''

		if (myjkknApiKey) {
			for (const myjkknInstId of myjkknIds) {
				try {
					const res = await fetch(
						`${myjkknApiUrl}/api-management/organizations/programs?institution_id=${myjkknInstId}&is_active=true&limit=1000`,
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

					if (!res.ok) {
						console.error('[CourseSheets] MyJKKN programs fetch failed:', res.status, res.statusText)
						continue
					}

					const response = await res.json()
					const programs = response.data || response || []

					for (const p of programs) {
						// MyJKKN `program_id` IS the code (e.g. "UEN"), not a UUID
						const code = p.program_id || p.program_code
						if (code && p.institution_id === myjkknInstId && !programInfoMap.has(code)) {
							programInfoMap.set(code, {
								name: p.program_name || p.name || code,
								order: p.program_order ?? p.sort_order ?? 999,
							})
						}
					}
				} catch (err) {
					console.error('[CourseSheets] Error fetching programs from MyJKKN:', err)
				}
			}
		} else {
			console.warn('[CourseSheets] MYJKKN_API_KEY not configured; program names will fall back to codes')
		}

		// Group by programme, one row per learner
		const byProgram = new Map<string, { semester: number | null; learners: Map<string, string> }>()
		for (const reg of liveRegistrations) {
			const programCode = reg.program_code || '-'
			const registerNo = (reg.stu_register_no || '').trim()
			if (!registerNo) continue

			if (!byProgram.has(programCode)) byProgram.set(programCode, { semester: null, learners: new Map() })
			const group = byProgram.get(programCode)!
			if (group.semester === null && reg.course_offerings?.semester != null) {
				group.semester = Number(reg.course_offerings.semester)
			}
			if (!group.learners.has(registerNo)) group.learners.set(registerNo, (reg.student_name || '').trim())
		}

		const programs: CourseSheetProgram[] = [...byProgram.entries()].map(([programCode, group]) => {
			const info = programInfoMap.get(programCode)
			const programName = info?.name || programCode
			const year = group.semester ? ROMAN_YEARS[Math.ceil(group.semester / 2) - 1] : ''

			return {
				program_code: programCode,
				program_name: programName,
				program_order: info?.order ?? 999,
				semester: group.semester,
				class_label: year ? `${year}-${programName}` : programName,
				learners: [...group.learners.entries()]
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([registerNo, name], i) => ({
						serial_number: i + 1,
						register_number: registerNo,
						learner_name: name,
					})),
			}
		})

		programs.sort((a, b) => a.program_order - b.program_order || a.program_code.localeCompare(b.program_code))

		const responseData: CourseSheetData = {
			institution_name: institution.name,
			institution_code: institution.institution_code,
			session_name: examSession.session_name,
			session_code: examSession.session_code,
			course_code: courseCode,
			course_title: courseTitle,
			logo_image: pdfSettings?.logo_url || null,
			right_logo_image: pdfSettings?.secondary_logo_url || null,
			programs,
		}

		return NextResponse.json({
			success: true,
			data: responseData,
			total_programs: programs.length,
			total_learners: programs.reduce((sum, p) => sum + p.learners.length, 0),
		})
	} catch (error) {
		console.error('[CourseSheets] API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
