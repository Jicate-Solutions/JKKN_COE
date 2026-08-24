-- Question-Paper Setter portal: assigning an END-SEMESTER paper to an appointed
-- examiner, and everything that examiner needs in their own login.
--
-- Context:
--   • ia_paper_templates.exam_scope already distinguishes 'cia' | 'ese' | 'all'.
--     ESE papers are excluded from /api/v1 and handled only in this portal.
--   • examiners already exists (email is unique — it is the Google sign-in key).
--
-- Run in the Supabase SQL Editor.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Which examination a format belongs to (the specific exam_types row).
--    exam_scope says CIA vs ESE; this says WHICH end-semester examination, and
--    feeds the printed heading / claim-form session text.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ia_paper_templates
	ADD COLUMN IF NOT EXISTS exam_type_id UUID REFERENCES public.exam_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ia_templates_exam_type
	ON public.ia_paper_templates(exam_type_id);

COMMENT ON COLUMN public.ia_paper_templates.exam_type_id IS
'The examination this format is used for (exam_types). exam_scope stays the CIA/ESE marker.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. One assignment = one paper (course + set) handed to one examiner, open for
--    entry only between valid_from and valid_to.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ia_qp_assignments (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code VARCHAR(50),
	examination_session_id UUID,

	examiner_id UUID NOT NULL REFERENCES public.examiners(id) ON DELETE CASCADE,
	-- The paper the examiner authors. One paper is assigned to at most one examiner.
	paper_id UUID NOT NULL REFERENCES public.ia_question_papers(id) ON DELETE CASCADE,
	template_id UUID REFERENCES public.ia_paper_templates(id) ON DELETE SET NULL,

	course_id UUID,
	course_code VARCHAR(50),
	subject_title VARCHAR(500),
	program_code VARCHAR(50),
	semester INTEGER,
	set_label VARCHAR(10),

	-- Entry window. Outside it the questions are hidden; the forms stay reachable.
	valid_from TIMESTAMPTZ NOT NULL,
	valid_to TIMESTAMPTZ NOT NULL,

	status VARCHAR(20) NOT NULL DEFAULT 'assigned'
		CHECK (status IN ('assigned', 'in_progress', 'submitted', 'accepted', 'cancelled')),

	-- Claim: rate is copied from the portal content at assign time so a later rate
	-- change cannot silently restate an examiner's past claim.
	remuneration NUMERIC(10, 2),

	-- The setter's own check-list answers ({ "within_syllabus": "YES", ... }).
	checklist JSONB,
	declaration_accepted_at TIMESTAMPTZ,
	claim_submitted_at TIMESTAMPTZ,

	notes TEXT,
	assigned_by UUID,
	assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	CONSTRAINT ia_qp_assignments_paper_unique UNIQUE (paper_id),
	CONSTRAINT ia_qp_assignments_window CHECK (valid_to > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_qp_assign_examiner ON public.ia_qp_assignments(examiner_id);
CREATE INDEX IF NOT EXISTS idx_qp_assign_institution ON public.ia_qp_assignments(institutions_id);
CREATE INDEX IF NOT EXISTS idx_qp_assign_session ON public.ia_qp_assignments(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_qp_assign_status ON public.ia_qp_assignments(status);

COMMENT ON TABLE public.ia_qp_assignments IS
'An end-semester question paper appointed to an examiner, with the window during which they may enter it.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CoE-editable content for the four portal documents. One row per
--    (institution, session, doc_type); a NULL session is the institution default.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ia_qp_portal_content (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	examination_session_id UUID,
	doc_type VARCHAR(20) NOT NULL
		CHECK (doc_type IN ('instructions', 'checklist', 'declaration', 'claim')),

	title VARCHAR(255),
	subtitle VARCHAR(255),
	-- Ordered clauses / check-list rows / declaration points:
	--   [{ "id": "...", "text": "...", "note": "..." }, ...]
	body JSONB NOT NULL DEFAULT '[]'::jsonb,
	footer_note TEXT,

	-- Printed particulars, edited per session rather than in code.
	session_label VARCHAR(100),          -- "NOV / DEC - 2026"
	letter_ref VARCHAR(255),             -- "JKKNCET/COE/UG/NOV-DEC-2026/"
	contact_email VARCHAR(255),          -- "dcoe@jkkn.ac.in"
	rate_per_paper NUMERIC(10, 2),       -- claim form only
	rate_in_words VARCHAR(255),

	is_active BOOLEAN NOT NULL DEFAULT true,
	updated_by UUID,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per doc per session; a separate partial index covers the NULL-session
-- default, which a plain UNIQUE would let duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_qp_content_unique_session
	ON public.ia_qp_portal_content(institutions_id, examination_session_id, doc_type)
	WHERE examination_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_qp_content_unique_default
	ON public.ia_qp_portal_content(institutions_id, doc_type)
	WHERE examination_session_id IS NULL;

COMMENT ON TABLE public.ia_qp_portal_content IS
'CoE-maintained text for the setter portal: Instructions, Check List, Declaration, Claim Form.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. What the examiner fills in once and reuses on every document.
--    The signature lives in the PRIVATE examiner-signatures bucket; only the
--    server reads it (to paste into the PDFs) or issues a short-lived signed URL.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.examiners
	ADD COLUMN IF NOT EXISTS signature_path TEXT,
	ADD COLUMN IF NOT EXISTS signature_updated_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(255),
	ADD COLUMN IF NOT EXISTS bank_name VARCHAR(255),
	ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50),
	ADD COLUMN IF NOT EXISTS bank_branch VARCHAR(255),
	ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(20),
	ADD COLUMN IF NOT EXISTS portal_last_login_at TIMESTAMPTZ;

COMMENT ON COLUMN public.examiners.signature_path IS
'Object path in the private examiner-signatures bucket; pasted into the Declaration and Claim Form PDFs.';
