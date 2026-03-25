-- Get all indexes
SELECT
	tablename AS table_name,
	indexname AS index_name,
	indexdef AS index_definition
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                  'verification_codes', 'institutions', 'departments', 'degrees',
                  'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
ORDER BY tablename, indexname;