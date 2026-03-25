-- Get all triggers
SELECT
	trigger_name,
	event_manipulation,
	event_object_table AS table_name,
	action_statement,
	action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                           'verification_codes', 'institutions', 'departments', 'degrees',
                           'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
ORDER BY event_object_table, trigger_name;