-- =====================================================
-- SEED PERMISSION FOR "Generate Internal Marks" PAGE
-- Date: 2026-05-18
-- Purpose: Add page.pre_exam.generate_internal_marks.view permission
--          and grant it to super_admin + coe roles.
-- Idempotent: ON CONFLICT DO NOTHING keeps re-runs safe.
-- =====================================================

WITH new_perm AS (
	INSERT INTO public.permissions (name, description, resource, action, is_active)
	VALUES (
		'page.pre_exam.generate_internal_marks.view',
		'Access Generate Internal Marks page',
		'page.pre_exam.generate_internal_marks',
		'view',
		true
	)
	ON CONFLICT (name) DO UPDATE SET
		description = EXCLUDED.description,
		resource    = EXCLUDED.resource,
		is_active   = true
	RETURNING id
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, np.id
FROM new_perm np
CROSS JOIN public.roles r
WHERE r.name IN ('super_admin', 'coe')
	AND r.is_active IS NOT FALSE
ON CONFLICT (role_id, permission_id) DO NOTHING;
