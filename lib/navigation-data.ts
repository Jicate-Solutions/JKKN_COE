import {
	// Navigation Icons
	Home,
	Database,
	PieChart,

	// Entity Icons
	GraduationCap,
	BookText,
	Users,
	Shield,
	School,

	// Calendar & Time Icons
	Calendar,
	CalendarPlus,
	CalendarDays,
	CalendarCheck2,
	CalendarClock,

	// Action Icons
	Play,
	CheckSquare,
	Edit,
	ClipboardCheck,
	ClipboardList,
	UserPlus,

	// Structure Icons
	Grid2X2,
	Shapes,
	SquareStack,
	TableProperties,
	Layers,

	// Document Icons
	FileText,
	NotepadText,
	LibraryBig,

	// Misc Icons
	Tags,
	CreditCard,
	ListChecks,
	Key,
	Hash,
	Package,
	Calculator,
	AlertTriangle,
	BarChart3,
	TestTube,
	Mail,
	Settings2,
	Target,
	Link2,
	Percent,
	Ticket,
	Globe,
	Search,
	RefreshCcw,
	List,
	MessageSquare,
	Award,
	FlaskConical,
	Download,
	ShieldCheck,

	// Developer Portal Icons
	Code2,
	LayoutDashboard,
	AppWindow,
	ScrollText,
	Scale,
	type LucideIcon,
} from 'lucide-react'

export interface NavSubItem {
	title: string
	url: string
	icon?: LucideIcon
	/**
	 * DB-driven page permission name (e.g. 'page.post_exam.external_mark_entry.view').
	 * When set, sidebar visibility is controlled by hasPermission() — change
	 * access via /users/role-permissions, no code change required.
	 */
	permission?: string
	/** Legacy role-based gate. Used as fallback when `permission` is not set. */
	coe_roles?: string[]
}

export interface NavItem {
	title: string
	url: string
	icon?: LucideIcon
	isActive?: boolean
	/** DB-driven permission for top-level items (e.g. Dashboard). */
	permission?: string
	coe_roles: string[]
	items?: NavSubItem[]
}

/**
 * Flat representation of a page for search / favorites
 */
export interface FlatNavItem {
	title: string
	url: string
	group: string
	icon?: LucideIcon
}

/**
 * Main Navigation Data with Role-Based Access Control (RBAC)
 *
 * Visibility model (after step 2):
 *   - If a sub-item has a `permission`, visibility = hasPermission(permission).
 *   - Else legacy fallback: empty/missing coe_roles = visible to all roles;
 *     otherwise hasAnyRole(coe_roles).
 *   - Group `coe_roles` still gate the parent menu. (Future step: drop these
 *     in favor of "visible if any child is visible".)
 *
 * To grant a role access to a page: go to /users/role-permissions and tick
 * the `page.<...>.view` permission for that role. No code change needed.
 */
export const navMain: NavItem[] = [
	{
		title: 'Dashboard',
		url: '/dashboard',
		icon: Home,
		isActive: true,
		permission: 'page.dashboard.view',
		coe_roles: [],
	},
	{
		title: 'Admin',
		url: '#',
		icon: Shield,
		isActive: false,
		coe_roles: ['admin', 'super_admin'],
		items: [
			{ title: 'Role Management', url: '/admin/role-management', icon: ShieldCheck, permission: 'page.admin.role_management.view' },
			{ title: 'Roles', url: '/users/roles', icon: Shield, permission: 'page.users.roles.view' },
			{ title: 'Permissions', url: '/users/permissions', icon: Key, permission: 'page.users.permissions.view' },
			{ title: 'Role Permission', url: '/users/role-permissions', icon: LibraryBig, permission: 'page.users.role_permissions.view' },
			{ title: 'User Log Activity', url: '/admin/user-log-activity', icon: ScrollText, permission: 'page.admin.user_log_activity.view' },
		],
	},
	{
		title: 'Master',
		url: '#',
		icon: Database,
		isActive: false,
		coe_roles: ['super_admin'],
		items: [
			{ title: 'Institutions', url: '/master/institutions', icon: School, permission: 'page.master.institutions.view' },
			{ title: 'Degree', url: '/master/degrees', icon: GraduationCap, permission: 'page.master.degrees.view' },
			{ title: 'Department', url: '/master/departments-myjkkn', icon: Grid2X2, permission: 'page.master.departments_myjkkn.view' },
			{ title: 'Program', url: '/master/programs-myjkkn', icon: GraduationCap, permission: 'page.master.programs_myjkkn.view' },
			{ title: 'Semester', url: '/master/semesters-myjkkn', icon: CalendarCheck2, permission: 'page.master.semesters_myjkkn.view' },
			{ title: 'Academic Year', url: '/master/academic-years', icon: Calendar, permission: 'page.master.academic_years.view' },
			{ title: 'Batch', url: '/master/batches', icon: SquareStack, permission: 'page.master.batches.view' },
			{ title: 'Regulations', url: '/master/regulations-myjkkn', icon: LibraryBig, permission: 'page.master.regulations_myjkkn.view' },
			{ title: 'Section', url: '/master/sections', icon: Shapes, permission: 'page.master.sections.view' },
			{ title: 'Board', url: '/master/boards', icon: Shapes, permission: 'page.master.boards.view' },
			{ title: 'PDF Settings', url: '/master/pdf-settings', icon: FileText, permission: 'page.master.pdf_settings.view' },
			{ title: 'SMTP Configuration', url: '/master/smtp-config', icon: Mail, permission: 'page.master.smtp_config.view' },
			{ title: 'MyJKKN API Explorer', url: '/test-myjkkn-api', icon: Globe, permission: 'page.test_myjkkn_api.view' },
			{ title: 'Grade Card Report', url: '#', icon: FileText },
			{ title: 'Hall', url: '#', icon: Shapes },
			{ title: 'QP Template', url: '#', icon: NotepadText },
			{ title: 'Fee Details', url: '/fee-details', icon: Tags },
			{ title: 'Fee Structure', url: '#', icon: CreditCard },
			{ title: 'BoS Compositions', url: '/bos/compositions', icon: ShieldCheck, coe_roles: ['super_admin'] },
			{ title: 'BoS TA/DA Rates', url: '/bos/ta-da-rates', icon: CreditCard, coe_roles: ['super_admin'] },
			{ title: 'Moderation Mark Setup', url: '#', icon: ListChecks },
		],
	},
	{
		title: 'Courses',
		url: '#',
		icon: BookText,
		isActive: false,
		coe_roles: ['super_admin', 'coe', 'coe_office'],
		items: [
			{ title: 'Courses', url: '/master/courses', icon: BookText, permission: 'page.master.courses.view' },
			{ title: 'Course Mapping', url: '/course-management/course-mapping-index', icon: TableProperties, permission: 'page.course_management.course_mapping_index.view' },
			{ title: 'Course Offering', url: '/course-management/course-offering', icon: BookText, permission: 'page.course_management.course_offering.view' },
		],
	},
	{
		title: 'Learners',
		url: '#',
		icon: GraduationCap,
		coe_roles: ['super_admin', 'coe'],
		items: [
			{ title: 'Learner Directory', url: '/users/learners-myjkkn', icon: GraduationCap, permission: 'page.users.learners_myjkkn.view' },
			{ title: 'Generate Register Number', url: '/users/generate-register-number', icon: Hash, permission: 'page.users.generate_register_number.view' },
			{ title: 'Learner Promotion', url: '#' },
		],
	},
	{
		title: 'Grading',
		url: '#',
		icon: Database,
		coe_roles: ['super_admin', 'coe'],
		items: [
			{ title: 'Grades', url: '/grading/grades', icon: BookText, permission: 'page.grading.grades.view' },
			{ title: 'Grade System', url: '/grading/grade-system', icon: CalendarDays, permission: 'page.grading.grade_system.view' },
			{ title: 'Curriculum Grade', url: '/grading/curriculum-grades', icon: BookText, permission: 'page.grading.grades.view' },
			{ title: 'Curriculum Grade System', url: '/grading/curriculum-grade-system', icon: CalendarDays, permission: 'page.grading.grade_system.view' },
			{ title: 'Generate Final Marks', url: '/grading/generate-final-marks', icon: Calculator, permission: 'page.grading.generate_final_marks.view' },
			{ title: 'Semester Results', url: '/grading/semester-results', icon: BarChart3, permission: 'page.grading.semester_results.view' },
			{ title: 'Consolidated Marksheet', url: '/grading/consolidated-marksheet', icon: Award, permission: 'page.grading.semester_results.view' },
			{ title: 'Learner Arrears', url: '/grading/learner-backlogs', icon: AlertTriangle, permission: 'page.grading.learner_backlogs.view' },
			{ title: 'Galley Report', url: '/grading/galley-report/report', icon: FileText, permission: 'page.grading.galley_report.report.view' },
			{ title: 'Test GPA Workflow', url: '/grading/test-gpa-workflow', icon: TestTube, permission: 'page.grading.test_gpa_workflow.view' },
			{ title: 'Credit Entry', url: '/marks-management/credit-entry', icon: Award, permission: 'page.marks_management.credit_entry.view' },
		],
	},
	{
		title: 'Pre-Exam',
		url: '#',
		icon: CalendarClock,
		coe_roles: ['super_admin', 'coe', 'coe_office_1'],
		items: [
			{ title: 'Exam Types', url: '/exam-management/exam-types', icon: Tags, permission: 'page.exam_management.exam_types.view' },
			{ title: 'Examination Sessions', url: '/exam-management/examination-sessions', icon: CalendarDays, permission: 'page.exam_management.examination_sessions.view' },
			{ title: 'Exam Registrations', url: '/exam-management/exam-registrations', icon: UserPlus, permission: 'page.exam_management.exam_registrations.view' },
			{ title: 'Exam Applications', url: '/exam-management/exam-applications', icon: ClipboardCheck, permission: 'page.exam_management.exam_applications.view' },
			{ title: 'Bulk Exam Application', url: '/exam-management/exam-applications/bulk', icon: ClipboardList, permission: 'page.exam_management.exam_applications.bulk.view' },
			{ title: 'Registration Lookup', url: '/exam-management/exam-registrations/lookup', icon: Search, permission: 'page.exam_management.exam_registrations.lookup.view' },
			{ title: 'Exam Timetable', url: '/exam-management/exam-timetables', icon: Calendar, permission: 'page.exam_management.exam_timetables.view' },
			{ title: 'Schedule Exams', url: '/exam-management/exam-timetables/schedule', icon: CalendarPlus, permission: 'page.exam_management.exam_timetables.view' },
			{ title: 'Validate Timetable', url: '/exam-management/validate-timetable', icon: ShieldCheck, permission: 'page.exam_management.validate_timetable.view' },
			{ title: 'Hall Tickets', url: '/pre-exam/hall-tickets', icon: Ticket, permission: 'page.pre_exam.hall_tickets.view' },
			{ title: 'Exam Attendance Sheet', url: '/pre-exam/exam-attendance-sheet', icon: ClipboardList, permission: 'page.pre_exam.exam_attendance_sheet.view' },
			{ title: 'Practical Allotment', url: '/pre-exam/practical-allotment', icon: FlaskConical, permission: 'page.pre_exam.practical_allotment.view' },
			{ title: 'Bulk Internal Marks', url: '/pre-exam/bulk-internal-marks', icon: FileText, permission: 'page.pre_exam.bulk_internal_marks.view' },
			{ title: 'CIA Entry Setting', url: '/pre-exam/internal-mark-entry-setting', icon: Settings2, permission: 'page.pre_exam.internal_mark_entry_setting.view' },
			{ title: 'Question Paper Templates', url: '/pre-exam/question-paper-templates', icon: FileText, permission: 'page.pre_exam.question_paper_templates.view' },
			{ title: 'Question Papers', url: '/pre-exam/question-papers', icon: FileText, permission: 'page.pre_exam.question_papers.view' },
			{ title: 'Mark Conversion Rules', url: '/pre-exam/mark-conversion-rules', icon: Scale, permission: 'page.pre_exam.mark_conversion_rules.view' },
			{ title: 'Internal Mark Entry', url: '/pre-exam/internal-mark-entry', icon: Edit, permission: 'page.pre_exam.internal_mark_entry.view' },
			{ title: 'Generate Internal Marks', url: '/pre-exam/generate-internal-marks', icon: Calculator, permission: 'page.pre_exam.generate_internal_marks.view' },
			{ title: 'Internal Mark Report', url: '/pre-exam/internal-mark-report', icon: FileText, permission: 'page.pre_exam.internal_mark_report.view' },
			{ title: 'COE Calendar', url: '/pre-exam/coe-calendar', icon: CalendarDays, permission: 'page.pre_exam.coe_calendar.view' },
		],
	},
	{
		title: 'Internal Marks',
		url: '#',
		icon: Percent,
		coe_roles: ['super_admin', 'coe'],
		items: [
			{ title: 'Assessment Patterns', url: '/pre-exam/internal-mark-setting', icon: Settings2, permission: 'page.pre_exam.internal_mark_setting.view' },
			{ title: 'Eligibility Rules', url: '/pre-exam/internal-mark-setting/eligibility-rules', icon: Shield, permission: 'page.pre_exam.internal_mark_setting.eligibility_rules.view' },
			{ title: 'Passing Rules', url: '/pre-exam/internal-mark-setting/passing-rules', icon: Target, permission: 'page.pre_exam.internal_mark_setting.passing_rules.view' },
			{ title: 'Course Associations', url: '/pre-exam/internal-mark-setting/course-associations', icon: Link2, permission: 'page.pre_exam.internal_mark_setting.course_associations.view' },
			{ title: 'Program Associations', url: '/pre-exam/internal-mark-setting/program-associations', icon: Layers, permission: 'page.pre_exam.internal_mark_setting.program_associations.view' },
		],
	},
	{
		title: 'During-Exam',
		url: '#',
		icon: Play,
		coe_roles: ['super_admin', 'coe', 'coe_mark_entry', 'coe_office_1'],
		items: [
			{ title: 'Exam Attendance', url: '/exam-management/exam-attendance', icon: ClipboardCheck, permission: 'page.exam_management.exam_attendance.view' },
			{ title: 'Practical Attendance', url: '/exam-management/practical-attendance', icon: ClipboardCheck, permission: 'page.exam_management.practical_attendance.view' },
			{ title: 'Attendance Correction', url: '/exam-management/attendance-correction', icon: Edit, permission: 'page.exam_management.attendance_correction.view' },
			{ title: 'Exam Rooms', url: '/exam-management/exam-rooms', icon: Shapes, permission: 'page.exam_management.exam_rooms.view' },
		],
	},
	{
		title: 'Examiners',
		url: '#',
		icon: GraduationCap,
		coe_roles: ['super_admin', 'coe', 'deputy_coe'],
		items: [
			{ title: 'Internal Examiners', url: '/exam-management/examiners/internal', icon: GraduationCap, permission: 'page.exam_management.examiners.internal.view' },
			{ title: 'Examiner Panel', url: '/exam-management/examiners', icon: Users, permission: 'page.exam_management.examiners.view' },
			{ title: 'Send Appointment', url: '/exam-management/examiners/send-email', icon: FileText, permission: 'page.exam_management.examiners.send_email.view' },
		],
	},
	{
		title: 'Post-Exam',
		url: '#',
		icon: CheckSquare,
		coe_roles: ['super_admin', 'coe', 'coe_mark_entry', 'coe_office_1'],
		items: [
			{ title: 'Result Release', url: '/post-exam/result-release', icon: CheckSquare },
			{ title: 'Dummy Numbers', url: '/utilities/dummy-numbers', icon: Hash, permission: 'page.utilities.dummy_numbers.view' },
			{ title: 'Answer Sheet Packets', url: '/post-exam/answer-sheet-packets', icon: Package, permission: 'page.post_exam.answer_sheet_packets.view' },
			{ title: 'Central Valuation', url: '/post-exam/central-valuation/dates', icon: ClipboardCheck, permission: 'page.post_exam.central_valuation.dates.view' },
			{ title: 'Attendance Bulk Upload', url: '/post-exam/exam-attendance-bulk', icon: ClipboardCheck, permission: 'page.post_exam.exam_attendance_bulk.view' },
			{ title: 'External Mark Entry', url: '/post-exam/external-mark-entry', icon: FileText, permission: 'page.post_exam.external_mark_entry.view' },
			{ title: 'Comment Grade Entry', url: '/marks-management/comment-grades', icon: MessageSquare, permission: 'page.marks_management.comment_grades.view' },
			{ title: 'External Mark Bulk Upload', url: '/post-exam/external-mark-bulk-upload', icon: FileText, permission: 'page.post_exam.external_mark_bulk_upload.view' },
			{ title: 'External Mark Correction', url: '/post-exam/external-mark-correction', icon: Edit, permission: 'page.post_exam.external_mark_correction.view' },
			{ title: 'Practical Mark Entry', url: '/post-exam/practical-mark-entry', icon: FlaskConical, permission: 'page.post_exam.practical_mark_entry.view' },
			{ title: 'Foil Sheet Download', url: '/post-exam/foil-sheet-download', icon: Download, permission: 'page.post_exam.foil_sheet_download.view' },
		],
	},
	{
		title: 'Revaluation',
		url: '#',
		icon: RefreshCcw,
		coe_roles: ['super_admin', 'coe'],
		items: [
			{ title: 'Revaluation Periods', url: '/revaluation-management/periods', icon: CalendarClock, permission: 'page.revaluation_management.create.view' },
			{ title: 'All Applications', url: '/revaluation-management?tab=applications', icon: List, permission: 'page.revaluation_management.view' },
			{ title: 'Bulk Application', url: '/revaluation-management?tab=bulk-application', icon: Users, permission: 'page.revaluation_management.view' },
			{ title: 'Payment Status', url: '/revaluation-management?tab=payment-status', icon: CreditCard, permission: 'page.revaluation_management.view' },
			{ title: 'Marks Entry', url: '/revaluation-management?tab=marks-entry', icon: Edit, permission: 'page.revaluation_management.view' },
			{ title: 'Results Publishing', url: '/revaluation-management?tab=results', icon: CheckSquare, permission: 'page.revaluation_management.view' },
		],
	},
	{
		title: 'Pre-Exam Reports',
		url: '#',
		icon: ClipboardList,
		coe_roles: ['super_admin', 'coe'],
		items: [
			{ title: 'Student Strength', url: '/reports/pre-exam/student-strength', icon: Users, permission: 'page.reports.pre_exam.student_strength.view' },
		],
	},
	{
		title: 'Reports',
		url: '#',
		icon: PieChart,
		coe_roles: ['super_admin', 'coe', 'nad_coordinator', 'coe_office_1'],
		items: [
			{ title: 'Comprehensive Reports', url: '/reports/comprehensive', icon: BarChart3, permission: 'page.reports.comprehensive.view' },
			{ title: 'Exam Registration Report', url: '/reports/exam-registration-reports', icon: ClipboardCheck, permission: 'page.reports.exam_registration_reports.view' },
			{ title: 'Attendance Report', url: '/exam-management/reports/attendance', icon: PieChart, permission: 'page.exam_management.reports.attendance.view' },
			{ title: 'Course Count Report', url: '/exam-management/reports/course-count', icon: Calculator, permission: 'page.exam_management.reports.course_count.view' },
			{ title: 'Marksheet Distribution', url: '/reports/marksheet-distribution', icon: FileText, permission: 'page.reports.marksheet_distribution.view' },
			{ title: 'Semester Marksheet', url: '/reports/semester-marksheet', icon: FileText, permission: 'page.reports.semester_marksheet.view' },
			{ title: 'Consolidated Marksheet', url: '/reports/consolidated-marksheet', icon: FileText, permission: 'page.reports.semester_marksheet.view' },
			{ title: 'Practical Exam Reports', url: '/reports/practical-exam/practical-need', icon: FlaskConical, permission: 'page.reports.practical_exam.practical_need.view' },
			{ title: 'CV Report', url: '/reports/cv-report', icon: ClipboardCheck, permission: 'page.reports.cv_report.view' },
			{ title: 'Dummy Number Report', url: '/reports/dummy-numbers', icon: Hash, permission: 'page.reports.dummy_numbers.view' },
			{ title: 'NAD Report', url: '/reports/nad', icon: Shield, permission: 'page.reports.nad.view' },
		],
	},
	{
		title: 'Result Analytics',
		url: '#',
		icon: BarChart3,
		coe_roles: ['super_admin', 'coe', 'deputy_coe'],
		items: [
			{ title: 'Dashboard', url: '/result/dashboard', icon: PieChart, permission: 'page.result.dashboard.view' },
			{ title: 'College Analysis', url: '/result/dashboard?tab=college', icon: School, permission: 'page.result.dashboard.view' },
			{ title: 'Program Analysis', url: '/result/dashboard?tab=program', icon: GraduationCap, permission: 'page.result.dashboard.view' },
			{ title: 'Subject Analysis', url: '/result/dashboard?tab=subject', icon: BookText, permission: 'page.result.dashboard.view' },
			{ title: 'NAAC Reports', url: '/result/dashboard?tab=naac', icon: FileText, permission: 'page.result.dashboard.view' },
		],
	},
	{
		title: 'Developer Portal',
		url: '#',
		icon: Code2,
		isActive: false,
		coe_roles: ['admin', 'super_admin'],
		items: [
			{ title: 'Overview', url: '/developer-portal', icon: LayoutDashboard, permission: 'page.developer_portal.view' },
			{ title: 'Applications', url: '/developer-portal/applications', icon: AppWindow, permission: 'page.developer_portal.applications.view' },
			{ title: 'Audit Logs', url: '/developer-portal/audit-logs', icon: ScrollText, permission: 'page.developer_portal.audit_logs.view' },
		],
	},
]

/**
 * Map of (pathname → permission) for every nav route that declares one.
 * Sorted by path length descending so `getPermissionForPath()` can do
 * a longest-prefix match for nested routes (e.g. `/post-exam/central-valuation/dates/123`
 * resolves to the permission of `/post-exam/central-valuation/dates`).
 */
const pagePermissionMap: Array<{ path: string; permission: string }> = (() => {
	const entries: Array<{ path: string; permission: string }> = []
	for (const group of navMain) {
		if (group.url && group.url !== '#' && group.permission) {
			entries.push({ path: group.url.split('?')[0], permission: group.permission })
		}
		if (!group.items) continue
		for (const sub of group.items) {
			if (sub.url && sub.url !== '#' && sub.permission) {
				entries.push({ path: sub.url.split('?')[0], permission: sub.permission })
			}
		}
	}
	// Dedupe (a few items share the same URL — keep the first occurrence)
	const seen = new Set<string>()
	const unique = entries.filter(e => {
		if (seen.has(e.path)) return false
		seen.add(e.path)
		return true
	})
	return unique.sort((a, b) => b.path.length - a.path.length)
})()

/**
 * Returns the page-level permission required to view a given route, or
 * `undefined` for unlisted routes (e.g. `/unauthorized`, `/favorites`,
 * dynamic detail pages without their own nav entry).
 *
 * Used by the (coe) layout's PagePermissionGate to enforce URL-level
 * authorization — so users who guess a URL still get blocked even if the
 * sidebar doesn't show them the link.
 */
export function getPermissionForPath(pathname: string): string | undefined {
	const cleanPath = pathname.split('?')[0]
	for (const entry of pagePermissionMap) {
		if (cleanPath === entry.path || cleanPath.startsWith(entry.path + '/')) {
			return entry.permission
		}
	}
	return undefined
}

/**
 * Flatten the navigation tree into a searchable list of pages.
 * Filters out placeholder links (url === '#').
 *
 * Visibility resolution per item:
 *   1. If `permission` is set, use hasPermission().
 *   2. Else if `coe_roles` is set and non-empty, use hasAnyRole().
 *   3. Else visible to all authenticated users.
 */
export function getFlatNavItems(
	items: NavItem[],
	hasAnyRole: (roles: string[]) => boolean,
	hasPermission: (permission: string) => boolean
): FlatNavItem[] {
	const flat: FlatNavItem[] = []

	// Super admin sees everything regardless of permission cache state.
	const isSuperAdmin = hasAnyRole(['super_admin'])

	const isVisible = (node: { permission?: string; coe_roles?: string[] }): boolean => {
		if (isSuperAdmin) return true
		// Preferred: DB-driven permission check
		if (node.permission && hasPermission(node.permission)) return true
		// Legacy fallback: role check (covers users whose permissions JSONB cache
		// hasn't been refreshed since the page-permission migration)
		if (node.coe_roles) {
			if (node.coe_roles.length === 0) return true
			if (hasAnyRole(node.coe_roles)) return true
		}
		// No permission AND no coe_roles → treat as public
		if (!node.permission && !node.coe_roles) return true
		return false
	}

	for (const group of items) {
		// Top-level pages (no sub-items): direct visibility check
		if (!group.items || group.items.length === 0) {
			if (!isVisible(group)) continue
			if (group.url && group.url !== '#') {
				flat.push({
					title: group.title,
					url: group.url,
					group: group.title,
					icon: group.icon,
				})
			}
			continue
		}

		// Groups: no group-level gate — rely entirely on per-sub-item permission.
		for (const sub of group.items) {
			if (sub.url === '#') continue
			if (!isVisible(sub)) continue
			flat.push({
				title: sub.title,
				url: sub.url,
				group: group.title,
				icon: sub.icon,
			})
		}
	}

	return flat
}
