-- Examiner workflow: controlled reopening, version history, immutable audit
-- Date: 2026-09-10
--
-- Once an examiner has submitted the question paper and the claim form, nothing
-- is simply "made editable again". Every later change goes through an
-- AUTHORISED reopen with a reason, every submission is kept as a numbered
-- version that is never overwritten, and every event lands in an append-only
-- audit log that records who, what, old value, new value, version and reason.
--
--   Submit → Lock → Authorised reopen (reason) → Edit → Resubmit → Lock
--
--   1. ia_qp_paper_versions   — one row per question paper submission (V1, V2 …)
--   2. ia_qp_claim_versions   — one row per claim form submission
--   3. ia_qp_assignments      — version counters + who reopened what, and why
--   4. ia_qp_access_logs      — performed-by, module, record, old/new, version,
--                               and a trigger that refuses UPDATE / DELETE
--
-- Idempotent. Run in the Supabase SQL Editor.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Question paper versions
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ia_qp_paper_versions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	assignment_id UUID NOT NULL REFERENCES public.ia_qp_assignments(id) ON DELETE CASCADE,
	paper_id UUID NOT NULL,
	institutions_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE,
	version INTEGER NOT NULL,

	-- 'current'    the submission the CoE is looking at
	-- 'reopened'   sent back for revision; a later version will supersede it
	-- 'superseded' replaced by a later submission
	status VARCHAR(20) NOT NULL DEFAULT 'current'
		CHECK (status IN ('current', 'reopened', 'superseded')),

	-- Exactly what was submitted. Never edited after insert.
	questions JSONB NOT NULL,
	default_font TEXT,
	question_total INTEGER,
	question_done INTEGER,

	submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	submitted_by_examiner_id UUID REFERENCES public.examiners(id) ON DELETE SET NULL,
	submitted_ip VARCHAR(64),
	submitted_user_agent TEXT,

	-- Filled in when THIS version is reopened by the CoE.
	reopened_at TIMESTAMPTZ,
	reopened_by UUID,
	reopened_by_email VARCHAR(255),
	reopen_reason TEXT,
	reopen_remarks TEXT,

	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT ia_qp_paper_versions_unique UNIQUE (assignment_id, version)
);
CREATE INDEX IF NOT EXISTS idx_qp_paper_versions_assignment
	ON public.ia_qp_paper_versions(assignment_id, version DESC);
COMMENT ON TABLE public.ia_qp_paper_versions IS
'Every question paper submission by an examiner, numbered V1, V2 … Rows are never updated except to mark them reopened / superseded; the questions JSON is immutable.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Claim form versions
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ia_qp_claim_versions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	assignment_id UUID NOT NULL REFERENCES public.ia_qp_assignments(id) ON DELETE CASCADE,
	institutions_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE,
	version INTEGER NOT NULL,
	status VARCHAR(20) NOT NULL DEFAULT 'current'
		CHECK (status IN ('current', 'reopened', 'superseded')),

	-- The complete claim as submitted: bank details, rate, papers covered.
	data JSONB NOT NULL,

	submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	submitted_by_examiner_id UUID REFERENCES public.examiners(id) ON DELETE SET NULL,
	submitted_ip VARCHAR(64),
	submitted_user_agent TEXT,

	reopened_at TIMESTAMPTZ,
	reopened_by UUID,
	reopened_by_email VARCHAR(255),
	reopen_reason TEXT,
	reopen_remarks TEXT,

	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT ia_qp_claim_versions_unique UNIQUE (assignment_id, version)
);
CREATE INDEX IF NOT EXISTS idx_qp_claim_versions_assignment
	ON public.ia_qp_claim_versions(assignment_id, version DESC);
COMMENT ON TABLE public.ia_qp_claim_versions IS
'Every claim form submission by an examiner, numbered V1, V2 … The data JSON is immutable.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Assignment: version counters and the reopen record
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ia_qp_assignments
	ADD COLUMN IF NOT EXISTS paper_version INTEGER NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS claim_version INTEGER NOT NULL DEFAULT 0,
	-- Question paper reopen (status becomes 'returned').
	ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS reopened_by UUID,
	ADD COLUMN IF NOT EXISTS reopen_reason TEXT,
	-- Claim form reopen (claim_status goes back to 'pending').
	ADD COLUMN IF NOT EXISTS claim_reopened_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS claim_reopened_by UUID,
	ADD COLUMN IF NOT EXISTS claim_reopen_reason TEXT,
	ADD COLUMN IF NOT EXISTS claim_reopen_remarks TEXT;

-- Papers submitted before versioning existed are V1 of themselves.
UPDATE public.ia_qp_assignments
SET paper_version = 1
WHERE paper_version = 0 AND submitted_at IS NOT NULL;

UPDATE public.ia_qp_assignments
SET claim_version = 1
WHERE claim_version = 0 AND claim_submitted_at IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Audit log: who did it, on what, from what to what — and make it immutable
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ia_qp_access_logs
	-- The CoE user (users.id) when the actor is not the examiner.
	ADD COLUMN IF NOT EXISTS performed_by_user_id UUID,
	ADD COLUMN IF NOT EXISTS performed_by_email VARCHAR(255),
	-- 'examiner' | 'coe' | 'system'
	ADD COLUMN IF NOT EXISTS performed_by_role VARCHAR(20),
	-- 'session' | 'paper' | 'checklist' | 'signature' | 'claim' | 'assignment' | 'profile' | 'document'
	ADD COLUMN IF NOT EXISTS module VARCHAR(30),
	ADD COLUMN IF NOT EXISTS record_id UUID,
	ADD COLUMN IF NOT EXISTS old_value JSONB,
	ADD COLUMN IF NOT EXISTS new_value JSONB,
	ADD COLUMN IF NOT EXISTS version INTEGER;

CREATE INDEX IF NOT EXISTS idx_qp_logs_module ON public.ia_qp_access_logs(module, created_at DESC);

-- Append-only: nothing, not even the service role, may rewrite history.
CREATE OR REPLACE FUNCTION public.ia_qp_access_logs_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'ia_qp_access_logs is append-only: % is not permitted', TG_OP
		USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_ia_qp_access_logs_immutable ON public.ia_qp_access_logs;
CREATE TRIGGER trg_ia_qp_access_logs_immutable
	BEFORE UPDATE OR DELETE ON public.ia_qp_access_logs
	FOR EACH ROW EXECUTE FUNCTION public.ia_qp_access_logs_immutable();

-- The version tables may only move a row's status forward; the snapshot
-- itself (questions / data) is frozen.
CREATE OR REPLACE FUNCTION public.ia_qp_versions_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF TG_TABLE_NAME = 'ia_qp_paper_versions' AND NEW.questions IS DISTINCT FROM OLD.questions THEN
		RAISE EXCEPTION 'A submitted question paper version cannot be altered' USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF TG_TABLE_NAME = 'ia_qp_claim_versions' AND NEW.data IS DISTINCT FROM OLD.data THEN
		RAISE EXCEPTION 'A submitted claim version cannot be altered' USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF NEW.version <> OLD.version OR NEW.assignment_id <> OLD.assignment_id OR NEW.submitted_at <> OLD.submitted_at THEN
		RAISE EXCEPTION 'Version identity is immutable' USING ERRCODE = 'insufficient_privilege';
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ia_qp_paper_versions_freeze ON public.ia_qp_paper_versions;
CREATE TRIGGER trg_ia_qp_paper_versions_freeze
	BEFORE UPDATE OR DELETE ON public.ia_qp_paper_versions
	FOR EACH ROW EXECUTE FUNCTION public.ia_qp_versions_freeze();

DROP TRIGGER IF EXISTS trg_ia_qp_claim_versions_freeze ON public.ia_qp_claim_versions;
CREATE TRIGGER trg_ia_qp_claim_versions_freeze
	BEFORE UPDATE OR DELETE ON public.ia_qp_claim_versions
	FOR EACH ROW EXECUTE FUNCTION public.ia_qp_versions_freeze();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. RLS — read for signed-in staff, writes only through the service role
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ia_qp_paper_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ia_qp_claim_versions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'ia_qp_paper_versions' AND policyname = 'ia_qp_paper_versions_select'
	) THEN
		CREATE POLICY ia_qp_paper_versions_select ON public.ia_qp_paper_versions
			FOR SELECT TO authenticated USING (true);
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'ia_qp_claim_versions' AND policyname = 'ia_qp_claim_versions_select'
	) THEN
		CREATE POLICY ia_qp_claim_versions_select ON public.ia_qp_claim_versions
			FOR SELECT TO authenticated USING (true);
	END IF;
END $$;
