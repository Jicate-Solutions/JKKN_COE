-- =====================================================
-- Discontinued Learners report
-- =====================================================
-- Date: 2026-09-21
-- Purpose:
--   Page permission for the "Discontinued Learners" sidebar entry
--   (/users/discontinued-learners). The report itself reads existing tables
--   only - exam_registrations, course_offerings, final_marks,
--   student_backlogs_detailed_view - so there is no schema change.
--
--   (naming convention: page.<url with / -> . and - -> _>.view)
-- =====================================================
WITH page_perms(name, description, resource, role_names) AS (
	VALUES (
		'page.users.discontinued_learners.view',
		'Access Discontinued Learners report',
		'page.users.discontinued_learners',
		ARRAY['super_admin', 'coe']::text[]
	)
),
upsert_perms AS (
	INSERT INTO public.permissions (name, description, resource, action, is_active)
	SELECT name, description, resource, 'view', true FROM page_perms
	ON CONFLICT (name) DO UPDATE
		SET description = EXCLUDED.description,
		    resource    = EXCLUDED.resource,
		    is_active   = true
	RETURNING id, name
),
exploded AS (
	SELECT up.id AS permission_id, unnest(pp.role_names) AS role_name
	FROM page_perms pp
	JOIN upsert_perms up ON up.name = pp.name
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, e.permission_id
FROM exploded e
JOIN public.roles r ON r.name = e.role_name
WHERE r.is_active IS NOT FALSE
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- Migration Complete
-- =====================================================
