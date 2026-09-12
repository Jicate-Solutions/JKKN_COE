-- Audit log must outlive its subject
-- Date: 2026-09-11
--
-- ia_qp_access_logs.assignment_id was declared REFERENCES ia_qp_assignments
-- ON DELETE CASCADE, while the table also carries a trigger that refuses every
-- UPDATE and DELETE. The two together make ANY delete of an assignment — and,
-- through ese_question_papers → ia_qp_assignments, any delete of a generated
-- paper — fail with:
--
--   42501  ia_qp_access_logs is append-only: DELETE is not permitted
--
-- as soon as one log row names the assignment (the order e-mail always does).
-- The app's own "Remove paper" / "Remove assignment" actions therefore never
-- work once an order has been issued.
--
-- An audit trail is meant to survive the record it describes, so the foreign
-- key goes; assignment_id stays as a plain UUID. Nothing else changes: the
-- append-only trigger stays, and the version tables (which only exist after a
-- submission the app already refuses to delete) keep their cascade.
--
-- Idempotent. Run in the Supabase SQL Editor.

DO $$
DECLARE
	fk TEXT;
BEGIN
	SELECT c.conname INTO fk
	FROM pg_constraint c
	JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
	WHERE c.conrelid = 'public.ia_qp_access_logs'::regclass
	  AND c.contype = 'f'
	  AND a.attname = 'assignment_id';
	IF fk IS NOT NULL THEN
		EXECUTE format('ALTER TABLE public.ia_qp_access_logs DROP CONSTRAINT %I', fk);
	END IF;
END $$;

COMMENT ON COLUMN public.ia_qp_access_logs.assignment_id IS
'Assignment the event belongs to. Deliberately NOT a foreign key: the log row must survive the assignment being removed.';
