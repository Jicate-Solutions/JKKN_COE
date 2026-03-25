"""
Routes, selectors, and role definitions for JKKN COE automation.
Derived from app-sidebar.tsx navigation data.
"""

# All roles in the system
ALL_ROLES = ['super_admin', 'admin', 'coe', 'deputy_coe', 'coe_office', 'faculty_coe']

# ── Route definitions ──────────────────────────────────────────────────────
ROUTES = {
	'dashboard': '/dashboard',
	# Admin
	'users_list': '/users/users-list',
	'roles': '/users/roles',
	'permissions': '/users/permissions',
	'role_permissions': '/users/role-permissions',
	# Master
	'institutions': '/master/institutions',
	'degrees': '/master/degrees',
	'departments': '/master/departments-myjkkn',
	'programs': '/master/programs-myjkkn',
	'semesters': '/master/semesters-myjkkn',
	'academic_years': '/master/academic-years',
	'batches': '/master/batches',
	'regulations': '/master/regulations-myjkkn',
	'sections': '/master/sections',
	'boards': '/master/boards',
	'pdf_settings': '/master/pdf-settings',
	'smtp_config': '/master/smtp-config',
	# Courses
	'courses': '/master/courses',
	'course_mapping': '/course-management/course-mapping-index',
	'course_offering': '/course-management/course-offering',
	# Learners
	'learners': '/users/learners-myjkkn',
	# Grading
	'grades': '/grading/grades',
	'grade_system': '/grading/grade-system',
	'generate_final_marks': '/grading/generate-final-marks',
	'semester_results': '/grading/semester-results',
	'learner_backlogs': '/grading/learner-backlogs',
	'galley_report': '/grading/galley-report/report',
	# Pre-Exam
	'exam_types': '/exam-management/exam-types',
	'exam_sessions': '/exam-management/examination-sessions',
	'exam_registrations': '/exam-management/exam-registrations',
	'exam_timetables': '/exam-management/exam-timetables',
	'hall_tickets': '/pre-exam/hall-tickets',
	'bulk_internal_marks': '/pre-exam/bulk-internal-marks',
	# Internal Marks
	'assessment_patterns': '/pre-exam/internal-mark-setting',
	'eligibility_rules': '/pre-exam/internal-mark-setting/eligibility-rules',
	'passing_rules': '/pre-exam/internal-mark-setting/passing-rules',
	# During-Exam
	'exam_attendance': '/exam-management/exam-attendance',
	'exam_rooms': '/exam-management/exam-rooms',
	# Examiners
	'examiner_panel': '/exam-management/examiners',
	# Post-Exam
	'external_mark_entry': '/post-exam/external-mark-entry',
	'external_mark_bulk': '/post-exam/external-mark-bulk-upload',
	'external_mark_correction': '/post-exam/external-mark-correction',
	'answer_sheet_packets': '/post-exam/answer-sheet-packets',
	# Revaluation
	'revaluation': '/revaluation-management/create',
	# Reports
	'comprehensive_reports': '/reports/comprehensive',
	'exam_registration_reports': '/reports/exam-registration-reports',
	'attendance_report': '/exam-management/reports/attendance',
	'course_count_report': '/exam-management/reports/course-count',
	'marksheet_distribution': '/reports/marksheet-distribution',
	'semester_marksheet': '/reports/semester-marksheet',
	# Result Analytics
	'result_dashboard': '/result/dashboard',
}

# ── Role → Route Access Matrix ─────────────────────────────────────────────
# Based on sidebar roles arrays from app-sidebar.tsx
# Key: route category → list of allowed roles (empty = all authenticated)

ROLE_ACCESS = {
	# Dashboard - all authenticated users
	'dashboard': [],

	# Admin section - admin, super_admin
	'users_list': ['admin', 'super_admin'],
	'roles': ['admin', 'super_admin'],
	'permissions': ['admin', 'super_admin'],
	'role_permissions': ['admin', 'super_admin'],

	# Master data - super_admin only
	'institutions': ['super_admin'],
	'degrees': ['super_admin'],
	'departments': ['super_admin'],
	'programs': ['super_admin'],
	'semesters': ['super_admin'],
	'academic_years': ['super_admin'],
	'batches': ['super_admin'],
	'regulations': ['super_admin'],
	'sections': ['super_admin'],
	'boards': ['super_admin'],
	'pdf_settings': ['super_admin'],
	'smtp_config': ['super_admin'],

	# Courses - super_admin, coe, coe_office
	'courses': ['super_admin', 'coe', 'coe_office'],
	'course_mapping': ['super_admin', 'coe', 'coe_office'],
	'course_offering': ['super_admin', 'coe', 'coe_office'],

	# Learners - super_admin, coe
	'learners': ['super_admin', 'coe'],

	# Grading - super_admin, coe
	'grades': ['super_admin', 'coe'],
	'grade_system': ['super_admin', 'coe'],
	'generate_final_marks': ['super_admin', 'coe'],
	'semester_results': ['super_admin', 'coe'],
	'learner_backlogs': ['super_admin', 'coe'],
	'galley_report': ['super_admin', 'coe'],

	# Pre-Exam - super_admin, coe
	'exam_types': ['super_admin', 'coe'],
	'exam_sessions': ['super_admin', 'coe'],
	'exam_registrations': ['super_admin', 'coe'],
	'exam_timetables': ['super_admin', 'coe'],
	'hall_tickets': ['super_admin', 'coe'],
	'bulk_internal_marks': ['super_admin', 'coe'],

	# Internal Marks - super_admin, coe
	'assessment_patterns': ['super_admin', 'coe'],
	'eligibility_rules': ['super_admin', 'coe'],
	'passing_rules': ['super_admin', 'coe'],

	# During-Exam - super_admin, coe
	'exam_attendance': ['super_admin', 'coe'],
	'exam_rooms': ['super_admin', 'coe'],

	# Examiners - super_admin, coe, deputy_coe
	'examiner_panel': ['super_admin', 'coe', 'deputy_coe'],

	# Post-Exam - super_admin, coe
	'external_mark_entry': ['super_admin', 'coe'],
	'external_mark_bulk': ['super_admin', 'coe'],
	'external_mark_correction': ['super_admin', 'coe'],
	'answer_sheet_packets': ['super_admin', 'coe'],

	# Revaluation - super_admin, coe
	'revaluation': ['super_admin', 'coe'],

	# Reports - super_admin, coe
	'comprehensive_reports': ['super_admin', 'coe'],
	'exam_registration_reports': ['super_admin', 'coe'],
	'attendance_report': ['super_admin', 'coe'],
	'course_count_report': ['super_admin', 'coe'],
	'marksheet_distribution': ['super_admin', 'coe'],
	'semester_marksheet': ['super_admin', 'coe'],

	# Result Analytics - super_admin, coe, deputy_coe
	'result_dashboard': ['super_admin', 'coe', 'deputy_coe'],
}

# ── Sidebar section → roles (for visibility testing) ───────────────────────
SIDEBAR_SECTIONS = {
	'Dashboard': [],
	'Admin': ['admin', 'super_admin'],
	'Master': ['super_admin'],
	'Courses': ['super_admin', 'coe', 'coe_office'],
	'Learners': ['super_admin', 'coe'],
	'Grading': ['super_admin', 'coe'],
	'Pre-Exam': ['super_admin', 'coe'],
	'Internal Marks': ['super_admin', 'coe'],
	'During-Exam': ['super_admin', 'coe'],
	'Examiners': ['super_admin', 'coe', 'deputy_coe'],
	'Post-Exam': ['super_admin', 'coe'],
	'Revaluation': ['super_admin', 'coe'],
	'Reports': ['super_admin', 'coe'],
	'Result Analytics': ['super_admin', 'coe', 'deputy_coe'],
}

# ── UI Selectors (Shadcn UI / Radix primitives) ────────────────────────────
SELECTORS = {
	'google_login_btn': 'button:has-text("Continue with Google")',
	'dev_login_btn': 'button:has-text("Login as")',
	'institution_dropdown': 'button[role="combobox"]:has-text("Select institution")',
	'program_dropdown': 'button[role="combobox"]:has-text("Select program")',
	'session_dropdown': 'button[role="combobox"]:has-text("Select session")',
	'enabled_options': '[role="option"]:not([data-disabled]):not([aria-disabled="true"])',
	'add_button': 'button:has-text("Add")',
	'save_button': 'button:has-text("Save")',
	'export_button': 'button:has-text("Export")',
	'download_button': 'button:has-text("Download")',
	'generate_button': 'button:has-text("Generate")',
	'table': 'table',
	'loading': 'text=Loading',
	'toast': '[data-sonner-toast], li[role="status"]',
	'dialog': '[role="dialog"]',
	'search_input': 'input[placeholder*="Search"]',
	'sidebar_nav': 'nav[data-sidebar="menu"]',
	'sidebar_item': '[data-sidebar="menu-button"]',
}
