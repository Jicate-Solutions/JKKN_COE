-- End-Semester Question Papers get their own table
-- Date: 2026-08-29
--
-- Until now an end-semester paper was an ia_question_papers row wearing a
-- disguise: cia_setting_id and cia_round left NULL, with a partial unique index
-- bolted on because the table's own UNIQUE key (which leads with those two
-- nullable columns) does not constrain NULLs at all. Every reader then had to
-- remember that "cia_round IS NULL means end-semester".
--
-- ESE now has its own table, and the flow becomes explicit:
--
--   End-Semester session -> pick subject -> pick FORMAT/TEMPLATE
--     -> generate paper (ese_question_papers) -> assign examiner
--     -> examiner authors it in the portal
--
-- The template is chosen when the paper is GENERATED, not inferred when the
-- examiner is appointed. Assignment now attaches an examiner to a paper that
-- already exists.
--
-- Safe to run as-is: ia_question_papers holds 934 rows and every one is a CIA
-- paper (none have cia_setting_id and cia_round both NULL), and
-- ia_qp_assignments is empty -- so nothing needs migrating and the FK repoint
-- cannot orphan a row.
--
-- Idempotent. Run in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- 0. Precondition: 20260828 must be applied first
--
-- This migration only repoints a foreign key and adds a table, so it would
-- APPLY cleanly on its own -- and then the feature would still not work, because
-- the assignment insert writes examiner_kind / exam_type_id / order_ref_no,
-- which 20260828 adds. Failing loudly here beats a screen that 500s later with
-- a column-not-found from deep inside a route.
-- ---------------------------------------------------------------------------
DO $precheck$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name = 'ia_qp_assignments'
		  AND column_name = 'examiner_kind'
	) THEN
		RAISE EXCEPTION
			'Run supabase/migrations/20260828_qp_examiner_assignment.sql first — ia_qp_assignments.examiner_kind is missing, so 20260828 has not been applied.';
	END IF;
END
$precheck$;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ese_question_papers (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code VARCHAR(50),

	examination_session_id UUID NOT NULL REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
	-- Denormalised from the session so a paper can be filtered by exam type
	-- without a join, and keeps its meaning if the session is later re-typed.
	exam_type_id UUID REFERENCES public.exam_types(id) ON DELETE SET NULL,

	course_offering_id UUID REFERENCES public.course_offerings(id) ON DELETE SET NULL,
	course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
	course_code VARCHAR(50),
	program_code VARCHAR(50),
	semester INTEGER,

	-- The chosen format. NOT NULL: an ESE paper without a format has no question
	-- structure, which is the whole point of generating it.
	template_id UUID NOT NULL REFERENCES public.ia_paper_templates(id) ON DELETE RESTRICT,
	template_version INTEGER,

	-- A/B sets when courses.multiple_qp_set is on
	set_number INTEGER NOT NULL DEFAULT 1,
	set_label VARCHAR(10),

	subject_title VARCHAR(255),
	exam_date DATE,
	duration_minutes INTEGER,
	max_marks NUMERIC(6, 2),

	-- Questions live in JSONB exactly as they do for CIA papers, so the shared
	-- scaffold / edit / validate / PDF code works unchanged on both.
	questions JSONB NOT NULL DEFAULT '[]'::jsonb,
	default_font VARCHAR(100),

	status VARCHAR(20) NOT NULL DEFAULT 'draft'
		CHECK (status IN ('draft', 'submitted', 'approved', 'locked')),

	submitted_at TIMESTAMPTZ,
	approved_by UUID,
	approved_at TIMESTAMPTZ,
	locked_at TIMESTAMPTZ,

	created_by UUID,   -- MyJKKN staff profile id; plain UUID (users live in MyJKKN)
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

	-- One paper per subject per set per session. No nullable column leads this
	-- key, so unlike the ia_question_papers version it actually constrains.
	CONSTRAINT ese_papers_unique UNIQUE (examination_session_id, course_offering_id, set_number)
);

CREATE INDEX IF NOT EXISTS idx_ese_papers_institution ON public.ese_question_papers(institutions_id);
CREATE INDEX IF NOT EXISTS idx_ese_papers_session ON public.ese_question_papers(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_ese_papers_offering ON public.ese_question_papers(course_offering_id);
CREATE INDEX IF NOT EXISTS idx_ese_papers_status ON public.ese_question_papers(status);
CREATE INDEX IF NOT EXISTS idx_ese_papers_template ON public.ese_question_papers(template_id);
CREATE INDEX IF NOT EXISTS idx_ese_papers_program_sem
	ON public.ese_question_papers(examination_session_id, program_code, semester);

COMMENT ON TABLE public.ese_question_papers IS
'End-semester question paper per session / course offering / set. The format (ia_paper_templates) is chosen at generation time; an examiner is assigned to the paper afterwards via ia_qp_assignments.';
COMMENT ON COLUMN public.ese_question_papers.template_id IS
'The End-Semester format this paper was generated from. Chosen by the CoE when generating, not inferred at assignment time.';
COMMENT ON COLUMN public.ese_question_papers.questions IS
'Scaffolded question slots (lib/ia/paper-scaffold). Same shape as ia_question_papers.questions so the editor, validator and PDF renderer are shared.';

-- ---------------------------------------------------------------------------
-- 2. updated_at (reuses the function created by 20260717)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_ese_papers_updated_at ON public.ese_question_papers;
CREATE TRIGGER trg_ese_papers_updated_at
	BEFORE UPDATE ON public.ese_question_papers
	FOR EACH ROW EXECUTE FUNCTION update_ia_qp_timestamp();

-- ---------------------------------------------------------------------------
-- 3. Assignments now point at the ESE table
--    ia_qp_assignments is empty, so the FK swap cannot orphan anything.
-- ---------------------------------------------------------------------------
-- Drop whatever foreign key currently sits on paper_id, by looking it up rather
-- than by assuming its name. If the name were guessed wrong the old constraint
-- would survive and paper_id would have to satisfy BOTH -- which nothing can,
-- silently breaking every assignment insert.
DO $repoint$
DECLARE
	fk_name TEXT;
BEGIN
	FOR fk_name IN
		SELECT con.conname
		FROM pg_constraint con
		JOIN pg_class rel ON rel.oid = con.conrelid
		JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
		WHERE nsp.nspname = 'public'
		  AND rel.relname = 'ia_qp_assignments'
		  AND con.contype = 'f'
		  AND con.conkey = ARRAY[
				(SELECT attnum FROM pg_attribute
				 WHERE attrelid = rel.oid AND attname = 'paper_id' AND NOT attisdropped)
			]::smallint[]
	LOOP
		EXECUTE format('ALTER TABLE public.ia_qp_assignments DROP CONSTRAINT %I;', fk_name);
	END LOOP;
END
$repoint$;

ALTER TABLE public.ia_qp_assignments
	ADD CONSTRAINT ia_qp_assignments_paper_id_fkey
	FOREIGN KEY (paper_id) REFERENCES public.ese_question_papers(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.ia_qp_assignments.paper_id IS
'The ese_question_papers row this appointment covers. The paper is generated first; assignment attaches an examiner to it.';

-- The ESE guard on ia_question_papers is obsolete now that ESE has its own
-- table -- leaving it would silently keep half the old flow alive.
DROP INDEX IF EXISTS public.idx_ia_papers_ese_unique;

-- ---------------------------------------------------------------------------
-- 4. RLS -- same permissive baseline as ia_question_papers; every write goes
--    through the service-role server client.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ese_question_papers ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE
	pol TEXT;
	cmd TEXT;
BEGIN
	FOREACH pol IN ARRAY ARRAY['select', 'insert', 'update', 'delete']
	LOOP
		IF NOT EXISTS (
			SELECT 1 FROM pg_policies
			WHERE schemaname = 'public'
			  AND tablename = 'ese_question_papers'
			  AND policyname = 'ese_question_papers_' || pol
		) THEN
			cmd := CASE pol
				WHEN 'select' THEN 'FOR SELECT TO authenticated USING (true)'
				WHEN 'insert' THEN 'FOR INSERT TO authenticated WITH CHECK (true)'
				WHEN 'update' THEN 'FOR UPDATE TO authenticated USING (true) WITH CHECK (true)'
				ELSE 'FOR DELETE TO authenticated USING (true)'
			END;
			EXECUTE format(
				'CREATE POLICY %I ON public.ese_question_papers %s;',
				'ese_question_papers_' || pol, cmd
			);
		END IF;
	END LOOP;
END
$policies$;

-- ---------------------------------------------------------------------------
-- 5. Page permission for the generation step (same screen and audience as the
--    assignment tab it precedes).
-- ---------------------------------------------------------------------------
WITH page_perms(name, description, resource, role_names) AS (
	VALUES (
		'page.pre_exam.ese_question_papers.view',
		'Generate End-Semester question papers from a format template',
		'page.pre_exam.ese_question_papers',
		-- The deputy CoE role is spelled 'dupty_coe' in this database. Both
		-- spellings are listed so the grant lands today and keeps landing if the
		-- name is ever corrected; the JOIN below silently ignores the one that
		-- does not exist.
		ARRAY['super_admin', 'coe', 'dupty_coe', 'deputy_coe']
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
