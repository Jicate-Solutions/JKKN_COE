-- Get all columns with data types, defaults, and nullability
SELECT
	table_name,
	column_name,
	data_type,
	character_maximum_length,
	column_default,
	is_nullable,
	udt_name,
	ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                   'verification_codes', 'institutions', 'departments', 'degrees',
                   'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
ORDER BY table_name, ordinal_position;