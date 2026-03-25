"""
Pre-defined user profiles for each JKKN COE role.
Used by auth_helper.py to inject the correct user data during dev login.
Mirrors the ROLE_PROFILES in app/dev-login/page.tsx.
"""

ROLE_PROFILES = {
	'super_admin': {
		'id': 'dev-super-admin-001',
		'email': 'superadmin@jkkn.ac.in',
		'name': 'Dev Super Admin',
		'role': 'super_admin',
		'is_super_admin': True,
		'institution_id': None,
		'institution_code': None,
		'department': 'Administration',
		'permissions': {
			'users': {'admin': True, 'view': True, 'create': True, 'edit': True, 'delete': True, 'report': True, 'import': True, 'export': True},
			'institutions': {'admin': True, 'view': True, 'create': True, 'edit': True, 'delete': True, 'report': True, 'import': True, 'export': True},
			'courses': {'admin': True, 'view': True, 'create': True, 'edit': True, 'delete': True, 'report': True, 'import': True, 'export': True},
			'regulations': {'admin': True, 'view': True, 'create': True, 'edit': True, 'delete': True, 'report': True, 'import': True, 'export': True},
			'batches': {'admin': True, 'view': True, 'create': True, 'edit': True, 'delete': True, 'report': True, 'import': True, 'export': True},
			'programs': {'admin': True, 'view': True, 'create': True, 'edit': True, 'delete': True, 'report': True, 'import': True, 'export': True},
			'sections': {'admin': True, 'view': True, 'create': True, 'edit': True, 'delete': True, 'report': True, 'import': True, 'export': True},
		},
	},
	'admin': {
		'id': 'dev-admin-001',
		'email': 'admin@jkkn.ac.in',
		'name': 'Dev Admin',
		'role': 'admin',
		'is_super_admin': False,
		'institution_id': None,
		'institution_code': None,
		'department': 'Administration',
		'permissions': {
			'users': {'admin': True, 'view': True, 'create': True, 'edit': True, 'delete': True},
			'institutions': {'view': True},
			'courses': {'view': True, 'create': True, 'edit': True},
			'regulations': {'view': True, 'create': True, 'edit': True},
			'batches': {'view': True, 'create': True, 'edit': True},
			'programs': {'view': True, 'create': True, 'edit': True},
			'sections': {'view': True, 'create': True, 'edit': True},
		},
	},
	'coe': {
		'id': 'dev-coe-001',
		'email': 'coe@jkkn.ac.in',
		'name': 'Dev COE',
		'role': 'coe',
		'is_super_admin': False,
		'institution_id': 'dev-institution-001',
		'institution_code': 'JKKN',
		'department': 'Examination Cell',
		'permissions': {
			'users': {'view': True},
			'courses': {'view': True, 'create': True, 'edit': True, 'delete': True, 'report': True, 'import': True, 'export': True},
			'regulations': {'view': True, 'create': True, 'edit': True, 'delete': True},
			'batches': {'view': True, 'create': True, 'edit': True, 'delete': True},
			'programs': {'view': True},
			'sections': {'view': True, 'create': True, 'edit': True},
		},
	},
	'deputy_coe': {
		'id': 'dev-deputy-coe-001',
		'email': 'deputy.coe@jkkn.ac.in',
		'name': 'Dev Deputy COE',
		'role': 'deputy_coe',
		'is_super_admin': False,
		'institution_id': 'dev-institution-001',
		'institution_code': 'JKKN',
		'department': 'Examination Cell',
		'permissions': {
			'courses': {'view': True, 'report': True, 'export': True},
			'regulations': {'view': True},
			'batches': {'view': True},
			'programs': {'view': True},
		},
	},
	'coe_office': {
		'id': 'dev-coe-office-001',
		'email': 'coe.office@jkkn.ac.in',
		'name': 'Dev COE Office',
		'role': 'coe_office',
		'is_super_admin': False,
		'institution_id': 'dev-institution-001',
		'institution_code': 'JKKN',
		'department': 'COE Office',
		'permissions': {
			'courses': {'view': True, 'create': True, 'edit': True},
			'regulations': {'view': True},
			'batches': {'view': True},
		},
	},
	'faculty_coe': {
		'id': 'dev-faculty-001',
		'email': 'faculty@jkkn.ac.in',
		'name': 'Dev Faculty',
		'role': 'faculty_coe',
		'is_super_admin': False,
		'institution_id': 'dev-institution-001',
		'institution_code': 'JKKN',
		'department': 'Computer Science',
		'permissions': {
			'courses': {'view': True},
			'regulations': {'view': True},
			'batches': {'view': True},
		},
	},
}

# Expected sidebar sections visible for each role
EXPECTED_SIDEBAR_SECTIONS = {
	'super_admin': [
		'Dashboard', 'Admin', 'Master', 'Courses', 'Learners', 'Grading',
		'Pre-Exam', 'Internal Marks', 'During-Exam', 'Examiners', 'Post-Exam',
		'Revaluation', 'Reports', 'Result Analytics',
	],
	'admin': ['Dashboard', 'Admin'],
	'coe': [
		'Dashboard', 'Courses', 'Learners', 'Grading', 'Pre-Exam',
		'Internal Marks', 'During-Exam', 'Examiners', 'Post-Exam',
		'Revaluation', 'Reports', 'Result Analytics',
	],
	'deputy_coe': ['Dashboard', 'Examiners', 'Result Analytics'],
	'coe_office': ['Dashboard', 'Courses'],
	'faculty_coe': ['Dashboard'],
}
