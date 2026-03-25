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
	UserPlus,

	// Structure Icons
	Grid2X2,
	Shapes,
	SquareStack,
	TableProperties,

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
} from "lucide-react"

import { NavMain } from "@/components/layout/nav-main"
import { useAuth } from "@/lib/auth/auth-context-parent"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
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
			roles: [], // Available to all authenticated users
		},
		{
			title: "Admin",
			url: "#",
			icon: Shield,
			isActive: false,
			roles: ["admin", "super_admin"], // Admin and super admin
			items: [
				{ title: "Users",           url: "/users/users-list",     icon: Users },
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
			role: [ "super_admin"], // Admin and super admin
			
			items: [
				{ title: "Institutions",          url: "/master/institutions",    icon: School },
				{ title: "Degree",                url: "/master/degrees",         icon: GraduationCap },
				{ title: "Department",            url: "/master/departments",     icon: Grid2X2 },
				{ title: "Program",               url: "/master/programs",        icon: GraduationCap },
				{ title: "Semester",              url: "/master/semesters",       icon: CalendarCheck2 },
				{ title: "Academic Year",         url: "/master/academic-years",  icon: Calendar },
				{ title: "Batch",                 url: "/master/batches",         icon: SquareStack },
				{ title: "Regulations",           url: "/master/regulations",     icon: LibraryBig },
				{ title: "Section",               url: "/master/sections",        icon: Shapes },
				{ title: "Board",                 url: "/master/boards",          icon: Shapes },
				{ title: "Grade Card Report",     url: "#",                       icon: FileText },
				{ title: "Hall",                  url: "#",                       icon: Shapes },
				{ title: "QP Template",           url: "#",                       icon: NotepadText },
				{ title: "COE Calender",          url: "#",                       icon: CalendarDays },
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
			roles: ["admin", "super_admin"], 

			items: [
				{ title: "Courses",        url: "/master/courses",                      icon: BookText },
				{ title: "Courses (Temp)", url: "/master/courses-temp",                 icon: Database },
				{ title: "Course Offering",url: "/course-management/course-offering",   icon: BookText },
				{ title: "Course Mapping", url: "/course-management/course-mapping-index", icon: TableProperties },
			],
		},
		{
			title: "Student",
			url: "#",
			icon: GraduationCap,
			roles: [], // Available to all authenticated users
			items: [
				{ title: "Student List",      url: "/users/students-list", icon: GraduationCap },
				{ title: "Student Promotion", url: "#" },
			],
		},
		{
			title: "Grading",
			url: "#",
			icon: Database,
			roles: [], // COE and above
			items: [
				{ title: "Grades",       url: "/grading/grades",       icon: BookText },
				{ title: "Grade System", url: "/grading/grade-system", icon: CalendarDays },
			],
		},
		{
			title: "Pre-Exam",
			url: "#",
			icon: CalendarClock,
			roles: [], // COE and above
			items: [
				{ title: "Exam Types",            url: "/exam-management/exam-types",           icon: Tags },
				{ title: "Examination Sessions",  url: "/exam-management/examination-sessions", icon: CalendarDays },
				{ title: "Exam Registrations",    url: "/exam-management/exam-registrations",   icon: UserPlus },
				{ title: "Exam Timetable",        url: "/exam-management/exam-timetables",      icon: Calendar },
				{ title: "Bulk Internal Marks",   url: "/pre-exam/bulk-internal-marks",         icon: FileText },
			],
		},
		{
			title: "During-Exam",
			url: "#",
			icon: Play,
			roles: [],
			items: [
				// Granular access: coe_office can mark attendance but cannot correct it
				{ title: "Exam Attendance",        url: "/exam-management/exam-attendance",       icon: ClipboardCheck, roles: [] },
				{ title: "Attendance Correction",  url: "/exam-management/attendance-correction", icon: Edit,           roles: [] }, // Restricted: No coe_office access
				{ title: "Exam Rooms",             url: "/exam-management/exam-rooms",            icon: Shapes,         roles: [] },
			],
		},
		{
			title: "Post-Exam",
			url: "#",
			icon: CheckSquare,
			roles: [], // COE and above
			items: [
				{ title: "Dummy Numbers", url: "/utilities/dummy-numbers", icon: Hash },
				{ title: "Answer Sheet Packets", url: "/post-exam/answer-sheet-packets", icon: Package },
				{ title: "External Mark Entry", url: "/post-exam/external-mark-entry", icon: FileText },
				{ title: "External Mark Bulk Upload", url: "/post-exam/external-mark-bulk-upload", icon: FileText },
				{ title: "External Mark Correction", url: "/post-exam/external-mark-correction", icon: Edit },
			],
		},
		{
			title: "Reports",
			url: "#",
			icon: PieChart,
			roles: [],
			items: [
				{ title: "Attendance Report", url: "/exam-management/reports/attendance", icon: PieChart },
			],
		},



	],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const { hasAnyRole } = useAuth()

	// Filter navigation items based on current user's roles
	const filteredNavItems = data.navMain.filter(item => {
		// If no roles specified, item is available to all authenticated users
		if (!item.roles || item.roles.length === 0) return true

		// Check if user has any of the required roles
		return hasAnyRole(item.roles)
	})

	return (
		<Sidebar collapsible="icon" {...props}>
			{/* ===== Sidebar Header ===== */}
			<SidebarHeader className="h-16 flex items-center mb-8">
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

		  <div className="group-data-[collapsible=icon]:hidden flex flex-col items-center space-y-3">
            {/* Logo container with frame and transparency */}
            <div className="relative p-2 rounded-xl bg-gradient-to-br from-[#16a34a]/5 to-[#059669]/5 border border-[#16a34a]/20 shadow-lg backdrop-blur-sm">
              {/* Background pattern overlay */}
              <div className="absolute inset-0 opacity-10 rounded-xl" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2316a34a' fill-opacity='0.3'%3E%3Ccircle cx='10' cy='10' r='1'/%3E%3C/g%3E%3C/svg%3E")`,
                backgroundSize: '20px 20px'
              }}></div>
              
              {/* JKKN Logo Image */}
              <img 
                src="/jkkn_logo.png" 
                alt="JKKN | COE" 
                className="h-18 w-28 object-contain relative z-10 filter drop-shadow-sm"
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

			{/* ===== Sidebar Rail ===== */}
			<SidebarRail />
		</Sidebar>
	)
}
