"use client"

import * as React from "react"
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
	Crown,
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
	PanelLeftClose,
	PanelLeft,
	RefreshCcw,
	FilePlus,
	List,
	Clock,
	MessageSquare,
	Award,
	FlaskConical,
	Download,
	ShieldCheck,
} from "lucide-react"

import { NavMain } from "@/components/layout/nav-main"
import { useAuth } from "@/lib/auth/auth-context-parent"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

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
 *
 * Note: Users can have multiple roles simultaneously (RBAC system)
 */
const data = {
	navMain: [
		{
			title: "Dashboard",
			url: "/dashboard",
			icon: Home,
			isActive: true,
			coe_roles: [], // Available to all authenticated users
		},
		{
			title: "Admin",
			url: "#",
			icon: Shield,
			isActive: false,
			coe_roles: ["admin", "super_admin"], // Admin and super admin
			items: [
				{ title: "Users",           url: "/users/users-list",     icon: Users },
				{ title: "Role Management", url: "/admin/role-management", icon: ShieldCheck },
				{ title: "Roles",           url: "/users/roles",          icon: Shield },
				{ title: "Permissions",     url: "/users/permissions",    icon: Key },
				{ title: "Role Permission", url: "/users/role-permissions", icon: LibraryBig },
			],
		},
		{
			title: "Master",
			url: "#",
			icon: Database,
			isActive: false,
			coe_roles: ["super_admin"], // Super admin only

			items: [
				{ title: "Institutions",          url: "/master/institutions",    icon: School },
				{ title: "Degree",                url: "/master/degrees",         icon: GraduationCap },
				{ title: "Department",            url: "/master/departments-myjkkn",     icon: Grid2X2 },
				{ title: "Program",               url: "/master/programs-myjkkn",        icon: GraduationCap },
				{ title: "Semester",              url: "/master/semesters-myjkkn",       icon: CalendarCheck2 },
				{ title: "Academic Year",         url: "/master/academic-years",  icon: Calendar },
				{ title: "Batch",                 url: "/master/batches",         icon: SquareStack },
				{ title: "Regulations",           url: "/master/regulations-myjkkn",     icon: LibraryBig },
				{ title: "Section",               url: "/master/sections",        icon: Shapes },
				{ title: "Board",                 url: "/master/boards",          icon: Shapes },
				{ title: "PDF Settings",          url: "/master/pdf-settings",    icon: FileText },
				{ title: "SMTP Configuration",    url: "/master/smtp-config",     icon: Mail },
				{ title: "MyJKKN API Explorer",   url: "/test-myjkkn-api",        icon: Globe },
				{ title: "Grade Card Report",     url: "#",                       icon: FileText },
				{ title: "Hall",                  url: "#",                       icon: Shapes },
				{ title: "QP Template",           url: "#",                       icon: NotepadText },
				{ title: "COE Calendar",          url: "/pre-exam/coe-calendar",  icon: CalendarDays },
				{ title: "Fee Details",           url: "#",                       icon: Tags },
				{ title: "Fee Structure",         url: "#",                       icon: CreditCard },
				{ title: "Moderation Mark Setup", url: "#",                       icon: ListChecks },
			],
		},
		{
			title: "Courses",
			url: "#",
			icon: BookText,
			isActive: false,
			coe_roles: ["super_admin", "coe", "coe_office"], // Super admin only
			items: [
				{ title: "Courses",        url: "/master/courses",                      icon: BookText },
				{ title: "Course Mapping", url: "/course-management/course-mapping-index", icon: TableProperties },
				{ title: "Course Offering",url: "/course-management/course-offering",   icon: BookText },
				
			],
		},
		{
			title: "Learners",
			url: "#",
			icon: GraduationCap,
			coe_roles: ["super_admin", "coe"],
			items: [
				{ title: "Learner Directory",  url: "/users/learners-myjkkn", icon: GraduationCap },
				{ title: "Learner Promotion",  url: "#" },
			],
		},
		{
			title: "Grading",
			url: "#",
			icon: Database,
			coe_roles: ["super_admin", "coe"],
			items: [
				{ title: "Grades",              url: "/grading/grades",               icon: BookText },
				{ title: "Grade System",        url: "/grading/grade-system",         icon: CalendarDays },
				{ title: "Generate Final Marks", url: "/grading/generate-final-marks", icon: Calculator },
				{ title: "Semester Results",    url: "/grading/semester-results",     icon: BarChart3 },
				{ title: "Learner Arrears",     url: "/grading/learner-backlogs",     icon: AlertTriangle },
				{ title: "Galley Report",       url: "/grading/galley-report/report", icon: FileText },
				{ title: "Test GPA Workflow",   url: "/grading/test-gpa-workflow",    icon: TestTube },
				{ title: "Comment Grade Entry", url: "/marks-management/comment-grades", icon: MessageSquare },
				{ title: "Credit Entry",        url: "/marks-management/credit-entry",   icon: Award },
			],
		},
		{
			title: "Pre-Exam",
			url: "#",
			icon: CalendarClock,
			coe_roles: ["super_admin", "coe"],
			items: [
				{ title: "Exam Types",            url: "/exam-management/exam-types",           icon: Tags },
				{ title: "Examination Sessions",  url: "/exam-management/examination-sessions", icon: CalendarDays },
				{ title: "Exam Registrations",    url: "/exam-management/exam-registrations",   icon: UserPlus },
				{ title: "Registration Lookup",   url: "/exam-management/exam-registrations/lookup", icon: Search },
				{ title: "Exam Timetable",        url: "/exam-management/exam-timetables",      icon: Calendar },
				{ title: "Validate Timetable",    url: "/exam-management/validate-timetable",   icon: ShieldCheck },
				{ title: "Hall Tickets",          url: "/pre-exam/hall-tickets",                icon: Ticket },
				{ title: "Exam Attendance Sheet", url: "/pre-exam/exam-attendance-sheet",       icon: ClipboardList },
				{ title: "Practical Allotment",   url: "/pre-exam/practical-allotment",         icon: FlaskConical },
				{ title: "Bulk Internal Marks",   url: "/pre-exam/bulk-internal-marks",         icon: FileText },
				{ title: "COE Calendar",          url: "/pre-exam/coe-calendar",               icon: CalendarDays },
			],
		},
		{
			title: "Internal Marks",
			url: "#",
			icon: Percent,
			coe_roles: ["super_admin", "coe"],
			items: [
				{ title: "Assessment Patterns",    url: "/pre-exam/internal-mark-setting",                   icon: Settings2 },
				{ title: "Eligibility Rules",      url: "/pre-exam/internal-mark-setting/eligibility-rules", icon: Shield },
				{ title: "Passing Rules",          url: "/pre-exam/internal-mark-setting/passing-rules",     icon: Target },
				{ title: "Course Associations",    url: "/pre-exam/internal-mark-setting/course-associations", icon: Link2 },
				{ title: "Program Associations",   url: "/pre-exam/internal-mark-setting/program-associations", icon: Layers },
			],
		},
		{
			title: "During-Exam",
			url: "#",
			icon: Play,
			coe_roles: ["super_admin", "coe", "coe_mark_entry"],
			items: [
				{ title: "Exam Attendance",        url: "/exam-management/exam-attendance",          icon: ClipboardCheck, coe_roles: ["super_admin", "coe"] },
				{ title: "Practical Attendance",   url: "/exam-management/practical-attendance",     icon: ClipboardCheck, coe_roles: [] },
				{ title: "Attendance Correction",  url: "/exam-management/attendance-correction",    icon: Edit,           coe_roles: ["super_admin", "coe"] },
				{ title: "Exam Rooms",             url: "/exam-management/exam-rooms",               icon: Shapes,         coe_roles: ["super_admin", "coe"] },
			],
		},
		{
			title: "Examiners",
			url: "#",
			icon: GraduationCap,
			coe_roles: ["super_admin", "coe", "deputy_coe"],
			items: [
				{ title: "Internal Examiners", url: "/exam-management/examiners/internal", icon: GraduationCap },
				{ title: "Examiner Panel", url: "/exam-management/examiners", icon: Users },
				{ title: "Send Appointment", url: "/exam-management/examiners/send-email", icon: FileText },
			],
		},
		{
			title: "Post-Exam",
			url: "#",
			icon: CheckSquare,
			coe_roles: ["super_admin", "coe", "coe_mark_entry"],
			items: [
				{ title: "Dummy Numbers", url: "/utilities/dummy-numbers", icon: Hash, coe_roles: ["super_admin", "coe"] },
				{ title: "Answer Sheet Packets", url: "/post-exam/answer-sheet-packets", icon: Package, coe_roles: ["super_admin", "coe"] },
				{ title: "Attendance Bulk Upload", url: "/post-exam/exam-attendance-bulk", icon: ClipboardCheck, coe_roles: ["super_admin", "coe"] },
				{ title: "External Mark Entry", url: "/post-exam/external-mark-entry", icon: FileText, coe_roles: ["super_admin", "coe"] },
				{ title: "External Mark Bulk Upload", url: "/post-exam/external-mark-bulk-upload", icon: FileText, coe_roles: ["super_admin", "coe"] },
				{ title: "External Mark Correction", url: "/post-exam/external-mark-correction", icon: Edit, coe_roles: ["super_admin", "coe"] },
				{ title: "Practical Mark Entry", url: "/post-exam/practical-mark-entry", icon: FlaskConical, coe_roles: [] },
				{ title: "Foil Sheet Download", url: "/post-exam/foil-sheet-download", icon: Download, coe_roles: ["super_admin", "coe", "admin"] },
			],
		},
		{
			title: "Revaluation",
			url: "#",
			icon: RefreshCcw,
			coe_roles: ["super_admin", "coe"],
			items: [
				{ title: "Create Revaluation", url: "/revaluation-management/create", icon: FilePlus },
				{ title: "All Applications", url: "/revaluation-management?tab=applications", icon: List },
				{ title: "Bulk Application", url: "/revaluation-management?tab=bulk-application", icon: Users },
				{ title: "Payment Status", url: "/revaluation-management?tab=payment-status", icon: CreditCard },
				{ title: "Marks Entry", url: "/revaluation-management?tab=marks-entry", icon: Edit },
				{ title: "Results Publishing", url: "/revaluation-management?tab=results", icon: CheckSquare },
			],
		},
		{
			title: "Pre-Exam Reports",
			url: "#",
			icon: ClipboardList,
			coe_roles: ["super_admin", "coe"],
			items: [
				{ title: "Student Strength", url: "/reports/pre-exam/student-strength", icon: Users },
			],
		},
		{
			title: "Reports",
			url: "#",
			icon: PieChart,
			coe_roles: ["super_admin", "coe"],
			items: [
				{ title: "Comprehensive Reports", url: "/reports/comprehensive", icon: BarChart3 },
				{ title: "Exam Registration Reports", url: "/reports/exam-registration-reports", icon: ClipboardCheck },
				{ title: "Attendance Report", url: "/exam-management/reports/attendance", icon: PieChart },
				{ title: "Course Count Report", url: "/exam-management/reports/course-count", icon: Calculator },
				{ title: "Marksheet Distribution", url: "/reports/marksheet-distribution", icon: FileText },
				{ title: "Semester Marksheet", url: "/reports/semester-marksheet", icon: FileText },
				{ title: "Practical Exam Reports", url: "/reports/practical-exam/practical-need", icon: FlaskConical },
			],
		},
		{
			title: "Result Analytics",
			url: "#",
			icon: BarChart3,
			coe_roles: ["super_admin", "coe", "deputy_coe", "nad_coordinator"],
			items: [
				{ title: "Dashboard",          url: "/result/dashboard",         icon: PieChart },
				{ title: "College Analysis",   url: "/result/dashboard?tab=college",  icon: School, coe_roles: ["super_admin", "coe", "deputy_coe"] },
				{ title: "Program Analysis",   url: "/result/dashboard?tab=program",  icon: GraduationCap, coe_roles: ["super_admin", "coe", "deputy_coe"] },
				{ title: "Subject Analysis",   url: "/result/dashboard?tab=subject",  icon: BookText, coe_roles: ["super_admin", "coe", "deputy_coe"] },
				{ title: "NAAC Reports",       url: "/result/dashboard?tab=naac",     icon: FileText, coe_roles: ["super_admin", "coe", "deputy_coe"] },
				{ title: "NAD Compliance",    url: "/result/dashboard?tab=nad",     icon: Shield, coe_roles: ["super_admin", "coe", "deputy_coe", "nad_coordinator"] },
			],
		},


	],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const { hasAnyRole } = useAuth()
	const { toggleSidebar, state } = useSidebar()
	const isCollapsed = state === "collapsed"

	// Filter navigation items based on current user's roles
	const filteredNavItems = data.navMain
		.filter(item => {
			if (!item.coe_roles || item.coe_roles.length === 0) return true
			return hasAnyRole(item.coe_roles)
		})
		.map(item => {
			if (!item.items) return item
			// Filter sub-items by coe_roles too
			const filteredItems = item.items.filter((sub: any) => {
				if (!sub.coe_roles || sub.coe_roles.length === 0) return true
				return hasAnyRole(sub.coe_roles)
			})
			return { ...item, items: filteredItems }
		})

	return (
		<Sidebar collapsible="icon" {...props}>
			{/* ===== Sidebar Header ===== */}
			<SidebarHeader className="h-16 flex items-center overflow-hidden">
				 <div className="flex items-center gap-3 px-3">
          {/* Logo - Collapsed version (Icon only) */}
          <div className="group-data-[collapsible=icon]:block hidden">
            <div className="flex flex-col items-center space-y-1">
              {/* Crown Icon with frame */}
              <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-[#16a34a]/10 to-[#059669]/10 border border-[#16a34a]/20 shadow-sm">
                <Crown className='h-5 w-5 text-[#16a34a] dark:text-[#16a34a] drop-shadow-sm' />
              </div>
              {/* JKKN Text */}
              <div className='font-grotesk text-xs font-extrabold tracking-widest text-[#16a34a] dark:text-[#16a34a] drop-shadow-lg'>
                JKKN
              </div>
            </div>
          </div>

		  <div className="group-data-[collapsible=icon]:hidden flex items-center">
            {/* Logo container with frame and transparency */}
            <div className="relative p-1.5 rounded-lg bg-gradient-to-br from-[#16a34a]/5 to-[#059669]/5 border border-[#16a34a]/20 shadow-sm backdrop-blur-sm">
              {/* JKKN Logo Image */}
              <img
                src="/jkkn_logo.png"
                alt="JKKN | COE"
                className="h-10 w-20 object-contain relative z-10 filter drop-shadow-sm"
              />
            </div>
          </div>
				</div>
			</SidebarHeader>

			{/* ===== Sidebar Content ===== */}
			<SidebarContent className="px1 py-4">
				{/* Filtered Navigation based on user roles */}
				<NavMain items={filteredNavItems} />
			</SidebarContent>

			{/* ===== Sidebar Footer with Toggle ===== */}
			<SidebarFooter className="border-t border-sidebar-border">
				<button
					onClick={toggleSidebar}
					className="flex items-center justify-center gap-2 w-full p-2 rounded-md hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
					title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					{isCollapsed ? (
						<PanelLeft className="h-5 w-5 text-[#16a34a]" />
					) : (
						<>
							<PanelLeftClose className="h-5 w-5 text-[#16a34a]" />
							<span className="text-sm font-medium text-slate-600 dark:text-slate-300">Collapse</span>
						</>
					)}
				</button>
			</SidebarFooter>

			{/* ===== Sidebar Rail ===== */}
			<SidebarRail />
		</Sidebar>
	)
}
