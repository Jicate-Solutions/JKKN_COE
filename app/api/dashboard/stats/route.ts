import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase-route-handler'
import {
	fetchMyJKKNLearnerProfiles,
	fetchMyJKKNStaff,
	fetchMyJKKNInstitutions,
	fetchMyJKKNDepartments,
	fetchMyJKKNPrograms,
} from '@/lib/myjkkn-api'

// Timeout wrapper - returns fallback if promise takes too long
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
	])
}

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const paramUserId = searchParams.get('user_id')
		const paramEmail = searchParams.get('email')
		const requestInstitutionId = searchParams.get('institutions_id')

		// ── Step 1: Auth + user lookup in PARALLEL ────────────────────────
		const [authResult, userByEmailResult, userByIdResult] = await Promise.all([
			createRouteHandlerSupabaseClient().then(c => c.auth.getUser()),
			paramEmail
				? supabase.from('users').select('id, is_super_admin, institution_id, email, role').eq('email', paramEmail).single()
				: Promise.resolve({ data: null }),
			paramUserId
				? supabase.from('users').select('id, is_super_admin, institution_id, email, role').eq('id', paramUserId).single()
				: Promise.resolve({ data: null }),
		])

		const authUser = authResult?.data?.user
		const userId = authUser?.id || paramUserId
		const userEmail = authUser?.email || paramEmail

		if (!userId && !userEmail) {
			return NextResponse.json({ error: 'User ID or email is required' }, { status: 400 })
		}

		// Resolve user data - prefer email match, then ID match
		let userData = userByEmailResult?.data || userByIdResult?.data || null

		// If auth user email differs from param, try auth email too
		if (!userData && authUser?.email && authUser.email !== paramEmail) {
			const { data } = await supabase.from('users').select('id, is_super_admin, institution_id, email, role').eq('email', authUser.email).single()
			userData = data
		}

		const isSuperAdmin = userData?.is_super_admin || false
		const userInstitutionId = userData?.institution_id || requestInstitutionId
		const institutionIdToFilter = requestInstitutionId || userInstitutionId

		// ── Step 2: Resolve institution UUID ONCE ─────────────────────────
		let institutionUUID: string | null = null
		let myjkknInstitutionIds: string[] = []

		if (institutionIdToFilter) {
			const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(institutionIdToFilter)
			if (isUUID) {
				institutionUUID = institutionIdToFilter
				const { data: instData } = await supabase.from('institutions').select('myjkkn_institution_ids').eq('id', institutionIdToFilter).single()
				myjkknInstitutionIds = instData?.myjkkn_institution_ids || []
			} else {
				const { data: instData } = await supabase.from('institutions').select('id, myjkkn_institution_ids').eq('institution_code', institutionIdToFilter).single()
				if (instData) {
					institutionUUID = instData.id
					myjkknInstitutionIds = instData.myjkkn_institution_ids || []
				}
			}
		}

		// ── Step 3: Build ALL queries ─────────────────────────────────────
		const today = new Date().toISOString().split('T')[0]
		const threeMonthsAgo = new Date()
		threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 1)
		const threeMonthsAhead = new Date()
		threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3)

		// Apply filter when:
		// 1. A specific institution was requested via URL (super admin selected specific institution)
		// 2. User is not super admin (always filter to their institution)
		// Skip filter only when super admin + "All Institutions" (no requestInstitutionId)
		const shouldApplyInstFilter = !!requestInstitutionId || !isSuperAdmin

		const withInstFilter = (query: any) => {
			if (shouldApplyInstFilter && institutionUUID) return query.eq('institutions_id', institutionUUID)
			return query
		}
		const withInstCodeFilter = (query: any) => {
			if (shouldApplyInstFilter && institutionIdToFilter) return query.eq('institution_code', institutionIdToFilter)
			return query
		}

		const rpcInstId = (shouldApplyInstFilter && institutionUUID) ? institutionUUID : null

		// MyJKKN - fire with 300ms timeout (non-blocking essentially)
		const myjkknInstId = myjkknInstitutionIds.length > 0 ? myjkknInstitutionIds[0] : undefined
		const myjkknOpts = myjkknInstId ? { institution_id: myjkknInstId } : {}
		const myjkknFallback = { metadata: { total: 0 } }

		const myJKKNPromises = Promise.all([
			withTimeout(fetchMyJKKNLearnerProfiles({ page: 1, limit: 1, is_active: true, ...myjkknOpts }), 300, myjkknFallback),
			withTimeout(fetchMyJKKNStaff({ page: 1, limit: 1, is_active: true, ...myjkknOpts }), 300, myjkknFallback),
			(isSuperAdmin && !shouldApplyInstFilter)
				? withTimeout(fetchMyJKKNInstitutions({ page: 1, limit: 1, is_active: true }), 300, myjkknFallback)
				: Promise.resolve(myjkknFallback),
			withTimeout(fetchMyJKKNDepartments({ page: 1, limit: 1, is_active: true, ...myjkknOpts }), 300, myjkknFallback),
			withTimeout(fetchMyJKKNPrograms({ page: 1, limit: 1, is_active: true, ...myjkknOpts }), 300, myjkknFallback),
		])

		// ── Execute ALL in parallel ───────────────────────────────────────
		const [
			rolesResult,
			studentsResult,
			coursesResult,
			programsResult,
			facultyRoleResult,
			upcomingExamsResult,
			attendanceTotalResult,
			attendancePresentResult,
			institutionsResult,
			departmentsResult,
			semestersResult,
			examSessionsResult,
			examinersResult,
			pendingEvalResult,
			recentResultsResult,
			trendsResult,
			gradeResult,
			calendarResult,
			myJKKNResults,
		] = await Promise.all([
			// User roles
			userData?.id
				? supabase.from('user_roles').select(`role_id, assigned_at, expires_at, roles!inner(id, name, description)`).eq('user_id', userData.id).eq('is_active', true).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
				: Promise.resolve({ data: [] as any[] }),
			// Students via RPC
			supabase.rpc('dashboard_student_count', { inst_id: rpcInstId }),
			// Courses
			withInstCodeFilter(supabase.from('courses').select('id', { count: 'exact', head: true })),
			// Programs
			withInstFilter(supabase.from('programs').select('id', { count: 'exact', head: true })),
			// Faculty role ID
			supabase.from('roles').select('id').eq('name', 'faculty_coe').single(),
			// Upcoming exams
			withInstFilter(
				supabase.from('exam_timetables')
					.select(`id, exam_date, session, exam_mode, institutions(id, institution_code, name), examination_sessions(id, session_code, session_name), courses(id, course_code, course_name)`)
					.gte('exam_date', today).order('exam_date', { ascending: true }).limit(5)
			),
			// Attendance total
			withInstFilter(supabase.from('exam_attendance').select('id', { count: 'exact', head: true })),
			// Attendance present
			withInstFilter(supabase.from('exam_attendance').select('id', { count: 'exact', head: true }).eq('attendance_status', 'Present')),
			// Institutions
			supabase.from('institutions').select('id', { count: 'exact', head: true }),
			// Departments
			withInstCodeFilter(supabase.from('departments').select('id', { count: 'exact', head: true })),
			// Semesters
			supabase.from('semesters').select('id', { count: 'exact', head: true }),
			// Exam sessions
			withInstFilter(supabase.from('examination_sessions').select('id', { count: 'exact', head: true })),
			// Examiners
			withInstCodeFilter(supabase.from('examiners').select('id', { count: 'exact', head: true })),
			// Pending evaluations
			withInstFilter(supabase.from('marks_entry').select('id', { count: 'exact', head: true }).eq('entry_status', 'pending')),
			// Recent results
			withInstFilter(
				supabase.from('semester_results_detailed_view')
					.select('id, register_number, student_name, semester, sgpa, cgpa, result_status, published_date, session_name')
					.eq('is_published', true).eq('is_active', true)
					.order('published_date', { ascending: false }).limit(5)
			),
			// Performance trends via RPC
			supabase.rpc('dashboard_performance_trends', { inst_id: rpcInstId }),
			// Grade distribution via RPC
			supabase.rpc('dashboard_grade_distribution', { inst_id: rpcInstId }),
			// Calendar exams
			withInstFilter(
				supabase.from('exam_timetables')
					.select(`id, exam_date, session, exam_mode, institutions(id, institution_code, name), examination_sessions(id, session_code, session_name), courses(id, course_code, course_name)`)
					.gte('exam_date', threeMonthsAgo.toISOString().split('T')[0])
					.lte('exam_date', threeMonthsAhead.toISOString().split('T')[0])
					.order('exam_date', { ascending: true })
			).range(0, 9999),
			// MyJKKN with 300ms timeout
			myJKKNPromises,
		])

		// ── Process results ───────────────────────────────────────────────

		// User roles
		const userRolesData = (rolesResult as any).data || []
		const userRoles = userRolesData
			.filter((ur: any) => ur.roles)
			.map((ur: any) => ({
				name: ur.roles.name,
				description: ur.roles.description || '',
				assigned_at: ur.assigned_at,
				expires_at: ur.expires_at
			}))

		let displayRole = 'user'
		let roleDescription = ''
		if (userRoles.length > 0) {
			const rolePriority = ['super_admin', 'coe', 'deputy_coe', 'coe_office', 'admin', 'faculty_coe']
			for (const priority of rolePriority) {
				const foundRole = userRoles.find((r: any) => r.name === priority)
				if (foundRole) {
					displayRole = foundRole.name
					roleDescription = foundRole.description || ''
					break
				}
			}
			if (displayRole === 'user') {
				displayRole = userRoles[0].name
				roleDescription = userRoles[0].description || ''
			}
		}

		const formatRoleName = (role: string) => {
			const roleMap: Record<string, string> = {
				'super_admin': 'Super Admin', 'coe': 'Controller of Examination',
				'deputy_coe': 'Deputy COE', 'coe_office': 'COE Office',
				'admin': 'Administrator', 'faculty_coe': 'Faculty COE', 'user': 'User'
			}
			return roleMap[role] || role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
		}

		// Faculty count (sequential - depends on role ID)
		let facultyCount = 0
		if (facultyRoleResult.data?.id) {
			let fq = supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role_id', facultyRoleResult.data.id).eq('is_active', true)
			if (shouldApplyInstFilter && userInstitutionId) {
				const { data: instUsers } = await supabase.from('users').select('id').eq('institution_id', userInstitutionId)
				if (instUsers && instUsers.length > 0) fq = fq.in('user_id', instUsers.map(u => u.id))
			}
			const { count } = await fq
			facultyCount = count || 0
		}

		// Attendance
		const totalAttendanceRecords = attendanceTotalResult.count || 0
		const presentCount = attendancePresentResult.count || 0
		const attendanceRatio = totalAttendanceRecords > 0
			? ((presentCount / totalAttendanceRecords) * 100).toFixed(1) : '0.0'

		// MyJKKN
		const [learnersRes, staffRes, instRes, deptRes, progRes] = myJKKNResults as any[]

		return NextResponse.json({
			totalLearners: studentsResult.data ?? 0,
			activeCourses: coursesResult.count || 0,
			totalPrograms: programsResult.count || 0,
			facultyMembers: facultyCount,
			totalInstitutions: institutionsResult.count || 0,
			totalDepartments: departmentsResult.count || 0,
			totalSemesters: semestersResult.count || 0,
			activeExamSessions: examSessionsResult.count || 0,
			totalExaminers: examinersResult.count || 0,
			pendingEvaluations: pendingEvalResult.count || 0,
			myJKKN: {
				learners: learnersRes?.metadata?.total || 0,
				staff: staffRes?.metadata?.total || 0,
				institutions: instRes?.metadata?.total || 0,
				departments: deptRes?.metadata?.total || 0,
				programs: progRes?.metadata?.total || 0
			},
			attendanceRatio: `${attendanceRatio}%`,
			attendanceDetails: {
				total: totalAttendanceRecords,
				present: presentCount,
				absent: totalAttendanceRecords - presentCount
			},
			upcomingExams: (upcomingExamsResult.data || []).map((e: any) => ({
				id: e.id, exam_date: e.exam_date, session: e.session, exam_mode: e.exam_mode,
				institution_name: e.institutions?.name || 'N/A',
				session_name: e.examination_sessions?.session_name || 'N/A',
				course_code: e.courses?.course_code || 'N/A',
				course_name: e.courses?.course_name || 'N/A'
			})),
			recentResults: (recentResultsResult.data || []).map((r: any) => ({
				id: r.id, register_no: r.register_number || 'N/A',
				student_name: r.student_name || 'N/A', semester: r.semester,
				gpa: r.sgpa, cgpa: r.cgpa, pass_status: r.result_status,
				published_at: r.published_date, session_name: r.session_name || 'N/A'
			})),
			performanceTrends: (trendsResult.data || []).map((r: any) => ({
				session: r.session, passRate: r.pass_rate,
				avgGpa: Number(r.avg_gpa), totalResults: Number(r.total_results)
			})),
			gradeDistribution: (gradeResult.data || []).map((r: any) => ({
				grade: r.grade, count: Number(r.count)
			})),
			calendarExams: (calendarResult.data || []).map((e: any) => ({
				id: e.id, exam_date: e.exam_date, session: e.session, exam_mode: e.exam_mode,
				institution_name: (e.institutions as any)?.name || 'N/A',
				session_name: (e.examination_sessions as any)?.session_name || 'N/A',
				course_code: (e.courses as any)?.course_code || 'N/A',
				course_name: (e.courses as any)?.course_name || 'N/A'
			})),
			isSuperAdmin,
			institutionId: userInstitutionId,
			userRole: displayRole,
			userRoleName: formatRoleName(displayRole),
			userRoleDescription: roleDescription,
			userRoles: userRoles,
			userEmail: userData?.email || userEmail || ''
		})
	} catch (e) {
		console.error('Dashboard stats API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
