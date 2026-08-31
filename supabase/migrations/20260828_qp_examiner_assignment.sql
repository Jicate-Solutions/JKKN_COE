-- End-Semester Question Paper Examiner Assignment + Examiner Portal
-- Date: 2026-08-28
--
-- Builds on 20260823_qp_setter_portal.sql (already applied), which created
-- ia_qp_assignments, ia_qp_portal_content and the examiner signature/bank
-- columns. This migration closes the gaps that the assignment screen, the
-- Examiner Order and the secure portal need:
--
--   1. 'returned' assignment status (CoE returns a submitted paper for revision)
--   2. Assignment columns: examiner kind, exam type, order reference, review
--      and e-mail timestamps, window-extension counter
--   3. 'order' / 'guidelines' portal documents + a signatory block
--   4. examiners.myjkkn_staff_id -- internal staff are auto-created as examiner
--      rows on assignment, and must be matched back to their MyJKKN record
--   5. An ESE uniqueness guard on ia_question_papers. The table's own UNIQUE
--      key includes cia_setting_id, which is NULL for an end-semester paper --
--      and NULLs never collide, so without this a course could get two shells.
--   6. ia_qp_access_logs -- every portal login, view, download and submission
--   7. Page permissions for the two new CoE screens
--
-- Idempotent. Run in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- 1. Assignment status gains 'returned'
-- ---------------------------------------------------------------------------
ALTER TABLE public.ia_qp_assignments
	DROP CONSTRAINT IF EXISTS ia_qp_assignments_status_check;

ALTER TABLE public.ia_qp_assignments
	ADD CONSTRAINT ia_qp_assignments_status_check
	CHECK (status IN ('assigned', 'in_progress', 'submitted', 'returned', 'accepted', 'cancelled'));

-- ---------------------------------------------------------------------------
-- 2. Assignment columns for the order, the review cycle and the audit story
-- ---------------------------------------------------------------------------
ALTER TABLE public.ia_qp_assignments
	-- 'external' = examiner panel (willingness role Question Paper Setter);
	-- 'internal' = MyJKKN staff auto-created into examiners on assignment.
	ADD COLUMN IF NOT EXISTS examiner_kind VARCHAR(10) NOT NULL DEFAULT 'external',
	ADD COLUMN IF NOT EXISTS exam_type_id UUID REFERENCES public.exam_types(id) ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS order_ref_no VARCHAR(120),
	ADD COLUMN IF NOT EXISTS order_issued_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS order_email_sent_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS accepted_by UUID,
	ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS return_remarks TEXT,
	-- How many times CoE reopened the window; every change is also access-logged.
	ADD COLUMN IF NOT EXISTS window_extensions INTEGER NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS updated_by UUID;

ALTER TABLE public.ia_qp_assignments
	DROP CONSTRAINT IF EXISTS ia_qp_assignments_kind_check;
ALTER TABLE public.ia_qp_assignments
	ADD CONSTRAINT ia_qp_assignments_kind_check
	CHECK (examiner_kind IN ('internal', 'external'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_qp_assign_order_ref
	ON public.ia_qp_assignments(institutions_id, order_ref_no)
	WHERE order_ref_no IS NOT NULL;

COMMENT ON COLUMN public.ia_qp_assignments.examiner_kind IS
'external = examiner panel row; internal = MyJKKN staff mirrored into examiners on assignment.';

-- ---------------------------------------------------------------------------
-- 3. Portal content: the Examiner Order and the Guidelines are documents too
-- ---------------------------------------------------------------------------
ALTER TABLE public.ia_qp_portal_content
	DROP CONSTRAINT IF EXISTS ia_qp_portal_content_doc_type_check;

ALTER TABLE public.ia_qp_portal_content
	ADD CONSTRAINT ia_qp_portal_content_doc_type_check
	CHECK (doc_type IN ('instructions', 'checklist', 'declaration', 'claim', 'order', 'guidelines'));

ALTER TABLE public.ia_qp_portal_content
	-- Printed under the order's content, above the signature rule.
	ADD COLUMN IF NOT EXISTS signatory_name VARCHAR(255),
	ADD COLUMN IF NOT EXISTS signatory_designation VARCHAR(255),
	-- Free-form paragraph placed between the particulars table and the terms.
	ADD COLUMN IF NOT EXISTS intro_text TEXT;

COMMENT ON COLUMN public.ia_qp_portal_content.signatory_name IS
'Name printed over the signature rule on the Examiner Order; NULL prints the designation alone.';

-- ---------------------------------------------------------------------------
-- 4. Internal examiners are MyJKKN staff mirrored into examiners
-- ---------------------------------------------------------------------------
ALTER TABLE public.examiners
	ADD COLUMN IF NOT EXISTS myjkkn_staff_id UUID;

CREATE INDEX IF NOT EXISTS idx_examiners_myjkkn_staff
	ON public.examiners(myjkkn_staff_id)
	WHERE myjkkn_staff_id IS NOT NULL;

COMMENT ON COLUMN public.examiners.myjkkn_staff_id IS
'MyJKKN staff profile id for an internal examiner auto-created by the QP assignment screen.';

-- ---------------------------------------------------------------------------
-- 5. One end-semester shell per (session, offering, set)
--    The table UNIQUE key is (cia_setting_id, cia_round, course_offering_id,
--    set_number); an ESE paper has NULL for the first two, and NULL != NULL, so
--    that key does not constrain ESE rows at all. This partial index does.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_ia_papers_ese_unique
	ON public.ia_question_papers(examination_session_id, course_offering_id, set_number)
	WHERE cia_setting_id IS NULL AND cia_round IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Portal audit trail -- login, paper view, download, save, submit, denial
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_qp_access_logs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	examiner_id UUID REFERENCES public.examiners(id) ON DELETE SET NULL,
	-- Kept as plain text as well: a login attempt by an unknown address has no
	-- examiner row to point at, and that is exactly the event worth recording.
	examiner_email VARCHAR(255),
	assignment_id UUID REFERENCES public.ia_qp_assignments(id) ON DELETE CASCADE,
	paper_id UUID,
	institutions_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE,

	action VARCHAR(40) NOT NULL,
	-- true = the request was refused (outside window, not the assignee, bad OTP)
	denied BOOLEAN NOT NULL DEFAULT false,
	reason TEXT,
	detail JSONB,

	ip_address VARCHAR(64),
	user_agent TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qp_logs_assignment ON public.ia_qp_access_logs(assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qp_logs_examiner ON public.ia_qp_access_logs(examiner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qp_logs_action ON public.ia_qp_access_logs(action);
CREATE INDEX IF NOT EXISTS idx_qp_logs_denied ON public.ia_qp_access_logs(created_at DESC) WHERE denied = true;

COMMENT ON TABLE public.ia_qp_access_logs IS
'Append-only trail of examiner-portal activity: logins, paper views, downloads, saves, submissions and refused attempts.';

ALTER TABLE public.ia_qp_access_logs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'ia_qp_access_logs' AND policyname = 'ia_qp_access_logs_select'
	) THEN
		CREATE POLICY ia_qp_access_logs_select ON public.ia_qp_access_logs
			FOR SELECT TO authenticated USING (true);
	END IF;
END $$;

-- The 0823 migration created ia_qp_assignments / ia_qp_portal_content without
-- RLS. Everything reaches them through the service-role server client, so turn
-- RLS on and grant authenticated read only.
DO $$
DECLARE
	tbl TEXT;
BEGIN
	FOREACH tbl IN ARRAY ARRAY['ia_qp_assignments', 'ia_qp_portal_content']
	LOOP
		EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
		IF NOT EXISTS (
			SELECT 1 FROM pg_policies
			WHERE schemaname = 'public' AND tablename = tbl AND policyname = tbl || '_select'
		) THEN
			EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true);', tbl || '_select', tbl);
		END IF;
	END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6b. Portal one-time passwords
--     examiner_email_verification already exists, but it stores the code in
--     plain text in a VARCHAR(10) and is shared with the public self-registration
--     form. A portal that releases question papers gets its own store, holding a
--     SHA-256 hash rather than the code itself.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ia_qp_portal_otps (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email VARCHAR(255) NOT NULL,
	-- SHA-256 of (code + email); the code itself is never stored.
	code_hash VARCHAR(64) NOT NULL,
	attempts INTEGER NOT NULL DEFAULT 0,
	consumed_at TIMESTAMPTZ,
	expires_at TIMESTAMPTZ NOT NULL,
	ip_address VARCHAR(64),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qp_otp_email ON public.ia_qp_portal_otps(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qp_otp_expiry ON public.ia_qp_portal_otps(expires_at);

COMMENT ON TABLE public.ia_qp_portal_otps IS
'One-time passwords for examiner-portal sign-in. Stores a hash, never the code.';

ALTER TABLE public.ia_qp_portal_otps ENABLE ROW LEVEL SECURITY;
-- No policy at all: only the service-role server client may touch this table.

-- ---------------------------------------------------------------------------
-- 7. Page permissions (convention from 20260513_seed_page_permissions.sql)
-- ---------------------------------------------------------------------------
WITH page_perms(name, description, resource, role_names) AS (
	VALUES
		(
			'page.pre_exam.qp_examiner_assignment.view',
			'Access Question Paper Examiner Assignment page',
			'page.pre_exam.qp_examiner_assignment',
			-- 'dupty_coe' is how the deputy CoE role is actually spelled in this
			-- database; both spellings are listed so the grant lands either way.
			-- The JOIN on roles silently ignores whichever does not exist.
			ARRAY['super_admin', 'coe', 'dupty_coe', 'deputy_coe']
		),
		(
			'page.pre_exam.qp_portal_content.view',
			'Access Examiner Portal Content / Order Design configuration',
			'page.pre_exam.qp_portal_content',
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

-- END OF MIGRATION
