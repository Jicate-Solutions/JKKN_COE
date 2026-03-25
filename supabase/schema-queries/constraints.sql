-- Get all constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK)
SELECT
	tc.table_name,
	tc.constraint_name,
	tc.constraint_type,
	kcu.column_name,
	ccu.table_name AS foreign_table_name,
	ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
	ON tc.constraint_name = kcu.constraint_name
	AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
	ON ccu.constraint_name = tc.constraint_name
	AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
AND tc.table_name IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                      'verification_codes', 'institutions', 'departments', 'degrees',
                      'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;