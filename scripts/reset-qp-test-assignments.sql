-- Reset the QP examiner-assignment TEST data (2026-09-16)
--
-- Removes the 15 trial appointments issued as JKKNCET/COE/QPS/001 … /019
-- together with everything the examiners produced under them, so the same
-- question papers can be handed to other examiners:
--
--   • ia_qp_assignments rows          → deleted (appointment, order, claim)
--   • ia_qp_paper_versions / _claim_versions → deleted (frozen submissions)
--   • ese_question_papers (14 papers)  → KEPT, questions reset to the empty
--                                        scaffold, status back to draft
--   • ia_question_paper_files          → figures registry rows soft-deleted
--   • ia_paper_templates, examiners    → untouched
--   • ia_qp_access_logs                → untouched (append-only audit trail;
--                                        assignment_id becomes a dangling UUID)
--
-- The version tables carry a trigger that refuses DELETE, and the access-log
-- FK (if migration 20260911_qp_access_logs_no_cascade has not been run yet)
-- would cascade into the append-only log. Both are handled below. Run the
-- whole file at once in the Supabase SQL Editor.

-- Scratch table (not TEMP: the SQL Editor does not keep one connection between statements).
DROP TABLE IF EXISTS public._qp_reset_assignments;
CREATE TABLE public._qp_reset_assignments AS
SELECT id, paper_id, order_ref_no, status, examiner_id
FROM public.ia_qp_assignments
WHERE order_ref_no IN (
	'JKKNCET/COE/QPS/001', 'JKKNCET/COE/QPS/002', 'JKKNCET/COE/QPS/003',
	'JKKNCET/COE/QPS/004', 'JKKNCET/COE/QPS/005', 'JKKNCET/COE/QPS/006',
	'JKKNCET/COE/QPS/008', 'JKKNCET/COE/QPS/010', 'JKKNCET/COE/QPS/011',
	'JKKNCET/COE/QPS/014', 'JKKNCET/COE/QPS/015', 'JKKNCET/COE/QPS/016',
	'JKKNCET/COE/QPS/017', 'JKKNCET/COE/QPS/018', 'JKKNCET/COE/QPS/019'
);

-- Preview: expect 15 rows.
SELECT order_ref_no, status FROM public._qp_reset_assignments ORDER BY order_ref_no;

-- 1. The audit log must outlive the assignment: drop the cascading FK if it is
--    still there (same block as migration 20260911_qp_access_logs_no_cascade).
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

-- 2. Frozen submission versions (trigger refuses DELETE → disable for this step only).
ALTER TABLE public.ia_qp_paper_versions DISABLE TRIGGER trg_ia_qp_paper_versions_freeze;
ALTER TABLE public.ia_qp_claim_versions DISABLE TRIGGER trg_ia_qp_claim_versions_freeze;

DELETE FROM public.ia_qp_paper_versions WHERE assignment_id IN (SELECT id FROM public._qp_reset_assignments);
DELETE FROM public.ia_qp_claim_versions WHERE assignment_id IN (SELECT id FROM public._qp_reset_assignments);

ALTER TABLE public.ia_qp_paper_versions ENABLE TRIGGER trg_ia_qp_paper_versions_freeze;
ALTER TABLE public.ia_qp_claim_versions ENABLE TRIGGER trg_ia_qp_claim_versions_freeze;

-- 3. The appointments themselves (order, willingness, claim, bank snapshot).
DELETE FROM public.ia_qp_assignments WHERE id IN (SELECT id FROM public._qp_reset_assignments);

-- 4. Question papers: keep the paper, wipe what the examiner authored.
--    Every slot keeps its structure (part, number, marks, type, choice) and
--    loses text, answer key, figures, CO / K-level, sub-divisions and the
--    option text — the same shape scaffoldQuestions() produces.
UPDATE public.ese_question_papers p
SET
	questions = COALESCE((
		SELECT jsonb_agg(
			jsonb_build_object(
				'id',                    q->'id',
				'part_label',            q->'part_label',
				'question_number',       q->'question_number',
				'sub_label',             q->'sub_label',
				'is_choice_alternative', COALESCE(q->'is_choice_alternative', 'false'::jsonb),
				'question_type_code',    q->'question_type_code',
				'question_text',         NULL,
				'marks',                 q->'marks',
				'options',               CASE
					WHEN jsonb_typeof(q->'options') = 'array' THEN (
						SELECT jsonb_agg(jsonb_build_object('key', o->'key', 'text', '') ORDER BY ord)
						FROM jsonb_array_elements(q->'options') WITH ORDINALITY AS t(o, ord)
					)
					ELSE NULL
				END,
				'correct_option',        NULL,
				'co_code',               NULL,
				'k_level',               NULL,
				'sub_questions',         NULL,
				'display_order',         q->'display_order'
			)
			ORDER BY (q->>'display_order')::int
		)
		FROM jsonb_array_elements(p.questions) q
	), '[]'::jsonb),
	status = 'draft',
	submitted_at = NULL,
	approved_by = NULL,
	approved_at = NULL,
	locked_at = NULL,
	updated_at = now()
WHERE p.id IN (SELECT paper_id FROM public._qp_reset_assignments);

-- 5. Figures the examiners uploaded (registry rows only; the Drive files stay).
UPDATE public.ia_question_paper_files
SET deleted_at = now()
WHERE deleted_at IS NULL
  AND paper_id IN (SELECT paper_id FROM public._qp_reset_assignments);

-- Verify: expect 0 assignments left, 14 papers in draft with nothing authored.
SELECT
	(SELECT count(*) FROM public.ia_qp_assignments)       AS assignments_left,
	(SELECT count(*) FROM public.ia_qp_paper_versions)    AS paper_versions_left,
	(SELECT count(*) FROM public.ia_qp_claim_versions)    AS claim_versions_left,
	(SELECT count(*) FROM public.ese_question_papers p
	  WHERE p.id IN (SELECT paper_id FROM public._qp_reset_assignments)
	    AND p.status = 'draft'
	    AND NOT EXISTS (
	    	SELECT 1 FROM jsonb_array_elements(p.questions) q
	    	WHERE coalesce(q->>'question_text', '') <> ''
	    ))                                                 AS papers_reset;

DROP TABLE public._qp_reset_assignments;
