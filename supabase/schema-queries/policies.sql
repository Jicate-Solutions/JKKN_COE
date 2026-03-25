-- Get all RLS policies
SELECT
	schemaname,
	tablename AS table_name,
	policyname AS policy_name,
	permissive,
	roles,
	cmd,
	qual,
	with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                  'verification_codes', 'institutions', 'departments', 'degrees',
                  'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
ORDER BY tablename, policyname;