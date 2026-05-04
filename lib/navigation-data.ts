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
	FilePlus,
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
	coe_roles?: string[]
}

export interface NavItem {
	title: string
	url: string
	icon?: LucideIcon
	isActive?: boolean
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
 * Role Hierarchy:
 * - super_admin: Full system access (all institutions)
 * - coe: Controller of Examination (institution-specific)
 * - deputy_coe: Deputy Controller (institution-specific)
 * - coe_office: COE Office Staff (limited access)
 * - faculty_coe: Faculty member
 * - admin: System administrator
 *
 * Access Control:
 * - Empty roles array [] = Available to ALL authenticated users
 * - Specified roles = Only users with ANY of those roles can access
 * - Sub-items can have their own role restrictions for granular control
 */
export const navMain: NavItem[] = [
	{
		title: 'Dashboard',
		url: '/dashboard',
		icon: Home,
		isActive: true,
		coe_roles: [],
	},
	{
		title: 'Admin',
		url: '#',
		icon: Shield,
		isActive: false,
		coe_roles: ['admin', 'super_admin'],
		items: [
			{ title: 'Role Management', url: '/admin/role-management', icon: ShieldCheck },
			{ title: 'Roles', url: '/users/roles', icon: Shield },
			{ title: 'Permissions', url: '/users/permissions', icon: Key },
			{ title: 'Role Permission', url: '/users/role-permissions', icon: LibraryBig },
			{ title: 'User Log Activity', url: '/admin/user-log-activity', icon: ScrollText },
		],
	},
	{
		title: 'Master',
		url: '#',
		icon: Database,
		isActive: false,
		coe_roles: ['super_admin'],
		items: [
			{ title: 'Institutions', url: '/master/institutions', icon: School },
			{ title: 'Degree', url: '/master/degrees', icon: GraduationCap },
			{ title: 'Department', url: '/master/departments-myjkkn', icon: Grid2X2 },
			{ title: 'Program', url: '/master/programs-myjkkn', icon: GraduationCap },
			{ title: 'Semester', url: '/master/semesters-myjkkn', icon: CalendarCheck2 },
			{ title: 'Academic Year', url: '/master/academic-years', icon: Calendar },
			{ title: 'Batch', url: '/master/batches', icon: SquareStack },
			{ title: 'Regulations', url: '/master/regulations-myjkkn', icon: LibraryBig },
			{ title: 'Section', url: '/master/sections', icon: Shapes },
			{ title: 'Board', url: '/master/boards', icon: Shapes },
			{ title: 'PDF Settings', url: '/master/pdf-settings', icon: FileText },
			{ title: 'SMTP Configuration', url: '/master/smtp-config', icon: Mail },
			{ title: 'MyJKKN API Explorer', url: '/test-myjkkn-api', icon: Globe },
			{ title: 'Grade Card Report', url: '#', icon: FileText },
			{ title: 'Hall', url: '#', icon: Shapes },
			{ title: 'QP Template', url: '#', icon: NotepadText },
			{ title: 'COE Calendar', url: '/pre-exam/coe-calendar', icon: CalendarDays },
			{ title: 'Fee Details', url: '#', icon: Tags },
			{ title: 'Fee Structure', url: '#', icon: CreditCard },
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
			{ title: 'Courses', url: '/master/courses', icon: BookText },
			{ title: 'Course Mapping', url: '/course-management/course-mapping-index', icon: TableProperties },
			{ title: 'Course Offering', url: '/course-management/course-offering', icon: BookText },
		],
	},
	{
		title: 'Learners',
		url: '#',
		icon: GraduationCap,
		coe_roles: ['super_admin', 'coe'],
		items: [
			{ title: 'Learner Directory', url: '/users/learners-myjkkn', icon: GraduationCap },
			{ title: 'Learner Promotion', url: '#' },
		],
	},
	{
		title: 'Grading',
		url: '#',
		icon: Database,
		coe_roles: ['super_admin', 'coe'],
		items: [
			{ title: 'Grades', url: '/grading/grades', icon: BookText },
			{ title: 'Grade System', url: '/grading/grade-system', icon: CalendarDays },
			{ title: 'Generate Final Marks', url: '/grading/generate-final-marks', icon: Calculator },
			{ title: 'Semester Results', url: '/grading/semester-results', icon: BarChart3 },
			{ title: 'Learner Arrears', url: '/grading/learner-backlogs', icon: AlertTriangle },
			{ title: 'Galley Report', url: '/grading/galley-report/report', icon: FileText },
			{ title: 'Test GPA Workflow', url: '/grading/test-gpa-workflow', icon: TestTube },
			{ title: 'Comment Grade Entry', url: '/marks-management/comment-grades', icon: MessageSquare },
			{ title: 'Credit Entry', url: '/marks-management/credit-entry', icon: Award },
		],
	},
	{
		title: 'Pre-Exam',
		url: '#',
		icon: CalendarClock,
		coe_roles: ['super_admin', 'coe', 'coe_office_1'],
		items: [
			{ title: 'Exam Types', url: '/exam-management/exam-types', icon: Tags, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Examination Sessions', url: '/exam-management/examination-sessions', icon: CalendarDays, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Exam Registrations', url: '/exam-management/exam-registrations', icon: UserPlus, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Registration Lookup', url: '/exam-management/exam-registrations/lookup', icon: Search, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Exam Timetable', url: '/exam-management/exam-timetables', icon: Calendar, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Validate Timetable', url: '/exam-management/validate-timetable', icon: ShieldCheck, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Hall Tickets', url: '/pre-exam/hall-tickets', icon: Ticket, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Exam Attendance Sheet', url: '/pre-exam/exam-attendance-sheet', icon: ClipboardList, coe_roles: ['super_admin', 'coe', 'coe_office_1'] },
			{ title: 'Practical Allotment', url: '/pre-exam/practical-allotment', icon: FlaskConical, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Bulk Internal Marks', url: '/pre-exam/bulk-internal-marks', icon: FileText, coe_roles: ['super_admin', 'coe'] },
			{ title: 'CIA Entry Setting', url: '/pre-exam/internal-mark-entry-setting', icon: Settings2, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Mark Conversion Rules', url: '/pre-exam/mark-conversion-rules', icon: Scale, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Internal Mark Entry', url: '/pre-exam/internal-mark-entry', icon: Edit, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Internal Mark Report', url: '/pre-exam/internal-mark-report', icon: FileText, coe_roles: ['super_admin', 'coe'] },
			{ title: 'COE Calendar', url: '/pre-exam/coe-calendar', icon: CalendarDays, coe_roles: ['super_admin', 'coe'] },
		],
	},
	{
		title: 'Internal Marks',
		url: '#',
		icon: Percent,
		coe_roles: ['super_admin', 'coe'],
		items: [
			{ title: 'Assessment Patterns', url: '/pre-exam/internal-mark-setting', icon: Settings2 },
			{ title: 'Eligibility Rules', url: '/pre-exam/internal-mark-setting/eligibility-rules', icon: Shield },
			{ title: 'Passing Rules', url: '/pre-exam/internal-mark-setting/passing-rules', icon: Target },
			{ title: 'Course Associations', url: '/pre-exam/internal-mark-setting/course-associations', icon: Link2 },
			{ title: 'Program Associations', url: '/pre-exam/internal-mark-setting/program-associations', icon: Layers },
		],
	},
	{
		title: 'During-Exam',
		url: '#',
		icon: Play,
		coe_roles: ['super_admin', 'coe', 'coe_mark_entry', 'coe_office_1'],
		items: [
			{ title: 'Exam Attendance', url: '/exam-management/exam-attendance', icon: ClipboardCheck, coe_roles: ['super_admin', 'coe', 'coe_office_1'] },
			{ title: 'Practical Attendance', url: '/exam-management/practical-attendance', icon: ClipboardCheck, coe_roles: [] },
			{ title: 'Attendance Correction', url: '/exam-management/attendance-correction', icon: Edit, coe_roles: ['super_admin', 'coe', 'coe_office_1'] },
			{ title: 'Exam Rooms', url: '/exam-management/exam-rooms', icon: Shapes, coe_roles: ['super_admin', 'coe'] },
		],
	},
	{
		title: 'Examiners',
		url: '#',
		icon: GraduationCap,
		coe_roles: ['super_admin', 'coe', 'deputy_coe'],
		items: [
			{ title: 'Internal Examiners', url: '/exam-management/examiners/internal', icon: GraduationCap },
			{ title: 'Examiner Panel', url: '/exam-management/examiners', icon: Users },
			{ title: 'Send Appointment', url: '/exam-management/examiners/send-email', icon: FileText },
		],
	},
	{
		title: 'Post-Exam',
		url: '#',
		icon: CheckSquare,
		coe_roles: ['super_admin', 'coe', 'coe_mark_entry', 'coe_office_1'],
		items: [
			{ title: 'Dummy Numbers', url: '/utilities/dummy-numbers', icon: Hash, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Answer Sheet Packets', url: '/post-exam/answer-sheet-packets', icon: Package, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Central Valuation', url: '/post-exam/central-valuation/dates', icon: ClipboardCheck, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Attendance Bulk Upload', url: '/post-exam/exam-attendance-bulk', icon: ClipboardCheck, coe_roles: ['super_admin', 'coe'] },
			{ title: 'External Mark Entry', url: '/post-exam/external-mark-entry', icon: FileText, coe_roles: ['super_admin', 'coe', 'coe_mark_entry', 'coe_office_1'] },
			{ title: 'External Mark Bulk Upload', url: '/post-exam/external-mark-bulk-upload', icon: FileText, coe_roles: ['super_admin', 'coe'] },
			{ title: 'External Mark Correction', url: '/post-exam/external-mark-correction', icon: Edit, coe_roles: ['super_admin', 'coe', 'coe_mark_entry', 'coe_office_1'] },
			{ title: 'Practical Mark Entry', url: '/post-exam/practical-mark-entry', icon: FlaskConical, coe_roles: ['super_admin', 'coe', 'coe_mark_entry', 'coe_office_1'] },
			{ title: 'Foil Sheet Download', url: '/post-exam/foil-sheet-download', icon: Download, coe_roles: ['super_admin', 'coe', 'admin'] },
		],
	},
	{
		title: 'Revaluation',
		url: '#',
		icon: RefreshCcw,
		coe_roles: ['super_admin', 'coe'],
		items: [
			{ title: 'Create Revaluation', url: '/revaluation-management/create', icon: FilePlus },
			{ title: 'All Applications', url: '/revaluation-management?tab=applications', icon: List },
			{ title: 'Bulk Application', url: '/revaluation-management?tab=bulk-application', icon: Users },
			{ title: 'Payment Status', url: '/revaluation-management?tab=payment-status', icon: CreditCard },
			{ title: 'Marks Entry', url: '/revaluation-management?tab=marks-entry', icon: Edit },
			{ title: 'Results Publishing', url: '/revaluation-management?tab=results', icon: CheckSquare },
		],
	},
	{
		title: 'Pre-Exam Reports',
		url: '#',
		icon: ClipboardList,
		coe_roles: ['super_admin', 'coe'],
		items: [
			{ title: 'Student Strength', url: '/reports/pre-exam/student-strength', icon: Users },
		],
	},
	{
		title: 'Reports',
		url: '#',
		icon: PieChart,
		coe_roles: ['super_admin', 'coe', 'nad_coordinator', 'coe_office_1'],
		items: [
			{ title: 'Comprehensive Reports', url: '/reports/comprehensive', icon: BarChart3, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Exam Reports Summary', url: '/reports/exam-registration-reports', icon: ClipboardCheck, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Attendance Report', url: '/exam-management/reports/attendance', icon: PieChart, coe_roles: ['super_admin', 'coe', 'coe_office_1'] },
			{ title: 'Course Count Report', url: '/exam-management/reports/course-count', icon: Calculator, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Marksheet Distribution', url: '/reports/marksheet-distribution', icon: FileText, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Semester Marksheet', url: '/reports/semester-marksheet', icon: FileText, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Practical Exam Reports', url: '/reports/practical-exam/practical-need', icon: FlaskConical, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Dummy Number Report', url: '/reports/dummy-numbers', icon: Hash, coe_roles: ['super_admin', 'coe'] },
			{ title: 'NAD Report', url: '/reports/nad', icon: Shield, coe_roles: ['super_admin', 'coe', 'deputy_coe', 'nad_coordinator'] },
		],
	},
	{
		title: 'Result Analytics',
		url: '#',
		icon: BarChart3,
		coe_roles: ['super_admin', 'coe', 'deputy_coe'],
		items: [
			{ title: 'Dashboard', url: '/result/dashboard', icon: PieChart },
			{ title: 'College Analysis', url: '/result/dashboard?tab=college', icon: School, coe_roles: ['super_admin', 'coe', 'deputy_coe'] },
			{ title: 'Program Analysis', url: '/result/dashboard?tab=program', icon: GraduationCap, coe_roles: ['super_admin', 'coe', 'deputy_coe'] },
			{ title: 'Subject Analysis', url: '/result/dashboard?tab=subject', icon: BookText, coe_roles: ['super_admin', 'coe', 'deputy_coe'] },
			{ title: 'NAAC Reports', url: '/result/dashboard?tab=naac', icon: FileText, coe_roles: ['super_admin', 'coe', 'deputy_coe'] },
		],
	},
	{
		title: 'Developer Portal',
		url: '#',
		icon: Code2,
		isActive: false,
		coe_roles: ['admin', 'super_admin'],
		items: [
			{ title: 'Overview', url: '/developer-portal', icon: LayoutDashboard },
			{ title: 'Applications', url: '/developer-portal/applications', icon: AppWindow },
			{ title: 'Audit Logs', url: '/developer-portal/audit-logs', icon: ScrollText },
		],
	},
]

/**
 * Flatten the navigation tree into a searchable list of pages.
 * Filters out placeholder links (url === '#').
 */
export function getFlatNavItems(
	items: NavItem[],
	hasAnyRole: (roles: string[]) => boolean
): FlatNavItem[] {
	const flat: FlatNavItem[] = []

	for (const group of items) {
		// Check group-level access
		if (group.coe_roles.length > 0 && !hasAnyRole(group.coe_roles)) continue

		// Top-level pages (no sub-items)
		if (!group.items || group.items.length === 0) {
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

		// Sub-items
		for (const sub of group.items) {
			if (sub.url === '#') continue
			if (sub.coe_roles && sub.coe_roles.length > 0 && !hasAnyRole(sub.coe_roles)) continue
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
