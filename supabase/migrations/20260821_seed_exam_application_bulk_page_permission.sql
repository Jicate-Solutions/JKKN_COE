-- =====================================================
-- SEED PAGE PERMISSION FOR THE BULK EXAM APPLICATION PAGE
-- Date: 2026-08-21
-- Purpose:
--   Register `page.exam_management.exam_applications.bulk.view` so the new
--   Bulk Exam Application page (subject-code wise / learner wise) appears in
--   the sidebar for the same roles that can already reach Exam Applications.
--
-- Follows the convention established in 20260513_seed_page_permissions.sql:
--   name      = 'page.<slug>.view'
--   resource  = 'page.<slug>'
--   action    = 'view'
--
-- Idempotent: re-running this migration has no side effects.
-- =====================================================

WITH page_perms(name, description, resource, role_names) AS (
	VALUES
		(
			'page.exam_management.exam_applications.bulk.view',
			'Access Bulk Exam Application page',
			'page.exam_management.exam_applications.bulk',
			ARRAY['super_admin', 'coe']
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
	SELECT
		up.id AS permission_id,
		unnest(pp.role_names) AS role_name
	FROM page_perms pp
	JOIN upsert_perms up ON up.name = pp.name
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, e.permission_id
FROM exploded e
JOIN public.roles r ON (
	e.role_name = '*' OR r.name = e.role_name
)
WHERE r.is_active IS NOT FALSE
ON CONFLICT (role_id, permission_id) DO NOTHING;
