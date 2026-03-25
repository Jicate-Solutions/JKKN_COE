-- Generate complete CREATE TABLE statements for all tables
SELECT
	'-- Table: ' || table_name || E'
' ||
	'CREATE TABLE ' || table_name || ' (' || E'
' ||
	string_agg(
		'  ' || column_name || ' ' ||
		CASE
			WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
			WHEN data_type = 'character' THEN 'CHAR(' || character_maximum_length || ')'
			WHEN data_type = 'timestamp with time zone' THEN 'TIMESTAMP WITH TIME ZONE'
			WHEN data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
			WHEN data_type = 'USER-DEFINED' THEN udt_name
			ELSE UPPER(data_type)
		END ||
		CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END ||
		CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
		',' || E'
'
		ORDER BY ordinal_position
	) || E'
' ||
	');' || E'
'
	AS create_statement
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('users', 'roles', 'permissions', 'role_permissions', 'user_roles',
                   'verification_codes', 'institutions', 'departments', 'degrees',
                   'programs', 'regulations', 'semesters', 'courses', 'sections', 'students')
GROUP BY table_name
ORDER BY table_name;