-- =====================================================
-- SEED PERMISSION FOR "Question Papers" PAGE
-- Date: 2026-07-17
-- Purpose: Add page.pre_exam.question_papers.view permission
--          and grant it to super_admin + coe roles.
-- Idempotent: safe to re-run.
-- =====================================================

WITH new_perm AS (
	INSERT INTO public.permissions (name, description, resource, action, is_active)
	VALUES (
		'page.pre_exam.question_papers.view',
		'Access Question Papers authoring page',
		'page.pre_exam.question_papers',
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
