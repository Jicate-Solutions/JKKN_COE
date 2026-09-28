-- =====================================================
-- External / Transfer / Migrated Results - foundation
-- Date: 2026-09-28
--
-- Some learners have results that were NOT produced by the COE examination
-- pipeline (course_offerings -> exam_registrations -> marks -> final_marks):
--   - lateral entry learners (semesters before entry are exempted)
--   - transfer learners (earlier semesters at another college/university)
--   - Anna University historical results of our own learners
--   - pre-COE legacy results
--
-- final_marks cannot hold these: exam_registration_id / course_offering_id are
-- NOT NULL and CASCADE. So they live in their own tables and are merged with
-- Published final_marks only at read time (consolidated marksheet, timeline,
-- CGPA step of semester-results generate-results).
--
-- Tables:
--   1. learner_academic_profiles    admission type, entry semester, exemptions
--   2. external_credit_rules        do external credits count in CGPA?
--   3. result_import_batches        one row per bulk migration upload
--   4. external_results             one row per external course attempt
--   5. external_result_corrections  audit of corrections to Final rows
--   6. result_import_errors         rejected rows of a batch
--   7. unified_result_items (view)  final_marks + external_results, one shape
--   8. page permissions
--
-- Learner identity: register_number is the key. student_id (MyJKKN learner
-- UUID) is nullable - old alumni may not exist in MyJKKN - and is backfilled
-- when found.
--
-- Idempotent: re-running this migration has no side effects.
-- =====================================================

-- -----------------------------------------------------
-- 1. Learner academic profile
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_academic_profiles (
	id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	institutions_id             UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code            VARCHAR(50),

	student_id                  UUID,
	register_number             VARCHAR(100) NOT NULL,
	learner_name                VARCHAR(255),
	program_code                VARCHAR(50),
	regulation_code             VARCHAR(50),

	admission_type              VARCHAR(30) NOT NULL DEFAULT 'REGULAR',
	entry_semester              INTEGER NOT NULL DEFAULT 1,
	-- Semesters that are neither internal nor external (lateral entry).
	-- Omitted on the consolidated marksheet / shown as "Exempted".
	exempted_semesters          INTEGER[] NOT NULL DEFAULT '{}',

	previous_university         VARCHAR(255),
	previous_institution        VARCHAR(255),
	previous_program            VARCHAR(255),
	previous_regulation         VARCHAR(100),
	previous_completion_status  VARCHAR(50),
	-- As printed by the previous university; never recalculated
	previous_cgpa               NUMERIC(6,3),
	previous_credit_total       NUMERIC(8,2),
	previous_grade_system       VARCHAR(100),

	remarks                     TEXT,

	created_by                  UUID REFERENCES public.users(id) ON DELETE SET NULL,
	updated_by                  UUID REFERENCES public.users(id) ON DELETE SET NULL,
	created_at                  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at                  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT uq_learner_academic_profiles_learner
		UNIQUE (institutions_id, register_number),
	CONSTRAINT chk_learner_academic_profiles_admission_type
		CHECK (admission_type IN ('REGULAR', 'TRANSFER', 'DIRECT_ADMISSION', 'LATERAL_ENTRY', 'MIGRATION')),
	CONSTRAINT chk_learner_academic_profiles_entry_semester
		CHECK (entry_semester BETWEEN 1 AND 12)
);

COMMENT ON TABLE public.learner_academic_profiles IS
	'Per-learner admission type, entry semester and exempted semesters. Decides which semesters are internal, external or exempted.';

CREATE INDEX IF NOT EXISTS idx_learner_academic_profiles_student
	ON public.learner_academic_profiles (student_id);
CREATE INDEX IF NOT EXISTS idx_learner_academic_profiles_program
	ON public.learner_academic_profiles (institutions_id, program_code);

-- -----------------------------------------------------
-- 2. External credit rules
-- -----------------------------------------------------
-- The most specific matching rule wins:
--   program_code + source_type > program_code > source_type > institution default.
-- No rule at all = CGPA_INCLUDED.
CREATE TABLE IF NOT EXISTS public.external_credit_rules (
	id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	institutions_id     UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code    VARCHAR(50),
	program_code        VARCHAR(50),
	regulation_code     VARCHAR(50),
	source_type         VARCHAR(20),

	-- CGPA_INCLUDED : credits and credit points count in CGPA
	-- CREDIT_ONLY   : credits count toward credits earned, not toward CGPA
	-- EXCLUDED      : shown on the marksheet only
	credit_treatment    VARCHAR(20) NOT NULL DEFAULT 'CGPA_INCLUDED',

	remarks             TEXT,
	is_active           BOOLEAN NOT NULL DEFAULT true,

	created_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
	created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT chk_external_credit_rules_treatment
		CHECK (credit_treatment IN ('CGPA_INCLUDED', 'CREDIT_ONLY', 'EXCLUDED')),
	CONSTRAINT chk_external_credit_rules_source_type
		CHECK (source_type IS NULL OR source_type IN ('EXTERNAL', 'TRANSFER', 'MIGRATED'))
);

COMMENT ON TABLE public.external_credit_rules IS
	'Whether external/transfer/migrated credits count in CGPA, per institution / program / regulation / source type.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_external_credit_rules_scope
	ON public.external_credit_rules (
		institutions_id,
		COALESCE(program_code, ''),
		COALESCE(regulation_code, ''),
		COALESCE(source_type, '')
	)
	WHERE is_active;

-- -----------------------------------------------------
-- 3. Import batches
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.result_import_batches (
	id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	batch_no            VARCHAR(30) UNIQUE,

	institutions_id     UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code    VARCHAR(50),
	program_code        VARCHAR(50),
	academic_year       VARCHAR(20),

	source_type         VARCHAR(20) NOT NULL,
	source_university   VARCHAR(255),
	source_institution  VARCHAR(255),

	file_name           VARCHAR(255),
	-- SHA-256 of the uploaded file; the same file cannot be imported twice
	file_hash           VARCHAR(64),
	file_path           TEXT,

	total_records       INTEGER NOT NULL DEFAULT 0,
	success_records     INTEGER NOT NULL DEFAULT 0,
	warning_records     INTEGER NOT NULL DEFAULT 0,
	failed_records      INTEGER NOT NULL DEFAULT 0,

	-- Validated -> Imported / Partially Imported / Failed -> Reversed
	status              VARCHAR(30) NOT NULL DEFAULT 'Validated',

	uploaded_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
	uploaded_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	reversed_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
	reversed_at         TIMESTAMP WITH TIME ZONE,
	reversal_reason     TEXT,

	created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT chk_result_import_batches_source_type
		CHECK (source_type IN ('EXTERNAL', 'TRANSFER', 'MIGRATED')),
	CONSTRAINT chk_result_import_batches_status
		CHECK (status IN ('Validated', 'Imported', 'Partially Imported', 'Failed', 'Reversed')),
	CONSTRAINT chk_result_import_batches_reversal
		CHECK (status <> 'Reversed' OR (reversed_at IS NOT NULL AND reversal_reason IS NOT NULL))
);

COMMENT ON TABLE public.result_import_batches IS
	'One row per bulk external result migration upload (/grading/result-migration).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_result_import_batches_file_hash
	ON public.result_import_batches (institutions_id, file_hash)
	WHERE file_hash IS NOT NULL AND status <> 'Reversed';

-- batch_no = MIG-<year>-<0001>, numbered per calendar year
CREATE OR REPLACE FUNCTION public.assign_result_import_batch_no()
RETURNS TRIGGER AS $$
DECLARE
	v_year TEXT := to_char(COALESCE(NEW.uploaded_at, CURRENT_TIMESTAMP), 'YYYY');
	v_next INTEGER;
BEGIN
	IF NEW.batch_no IS NOT NULL THEN
		RETURN NEW;
	END IF;
	PERFORM pg_advisory_xact_lock(hashtext('result_import_batch_no_' || v_year));
	SELECT COALESCE(MAX(split_part(batch_no, '-', 3)::INTEGER), 0) + 1
		INTO v_next
		FROM public.result_import_batches
		WHERE batch_no LIKE 'MIG-' || v_year || '-%';
	NEW.batch_no := 'MIG-' || v_year || '-' || lpad(v_next::TEXT, 4, '0');
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_assign_result_import_batch_no ON public.result_import_batches;
CREATE TRIGGER trigger_assign_result_import_batch_no
	BEFORE INSERT ON public.result_import_batches
	FOR EACH ROW EXECUTE FUNCTION public.assign_result_import_batch_no();

-- -----------------------------------------------------
-- 4. External results
-- -----------------------------------------------------
-- Original course identity is preserved: external_course_code is never
-- replaced by a JKKN course code. Grades are stored exactly as printed.
CREATE TABLE IF NOT EXISTS public.external_results (
	id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	institutions_id         UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code        VARCHAR(50),
	academic_profile_id     UUID REFERENCES public.learner_academic_profiles(id) ON DELETE SET NULL,
	batch_id                UUID REFERENCES public.result_import_batches(id) ON DELETE RESTRICT,

	student_id              UUID,
	register_number         VARCHAR(100) NOT NULL,
	learner_name            VARCHAR(255),
	program_code            VARCHAR(50),
	regulation_code         VARCHAR(50),

	semester                INTEGER NOT NULL,
	academic_year           VARCHAR(20),
	exam_month_year         VARCHAR(30),

	source_type             VARCHAR(20) NOT NULL,
	source_university       VARCHAR(255) NOT NULL,
	source_institution      VARCHAR(255),

	external_course_code    VARCHAR(50) NOT NULL,
	external_course_name    VARCHAR(255) NOT NULL,
	-- Same values as courses.course_part_master
	course_part             VARCHAR(20),
	credit                  NUMERIC(5,2),

	-- All nullable: universities may give grade only, grade + GP,
	-- marks + grade, or marks without an internal/external split
	max_mark                NUMERIC(6,2),
	internal_mark           NUMERIC(6,2),
	external_mark           NUMERIC(6,2),
	total_mark              NUMERIC(6,2),
	grade                   VARCHAR(10),
	grade_point             NUMERIC(4,2),
	is_pass                 BOOLEAN NOT NULL DEFAULT true,
	-- An external fail is cleared by a later attempt at the external body
	attempt_no              INTEGER NOT NULL DEFAULT 1,
	result_date             DATE,

	certificate_reference   VARCHAR(255),
	remarks                 TEXT,

	-- Draft -> Approved -> Final; a correction of a Final row creates a new
	-- version and marks the old one Superseded. Cancelled = batch reversal.
	status                  VARCHAR(20) NOT NULL DEFAULT 'Draft',
	version                 INTEGER NOT NULL DEFAULT 1,
	superseded_by           UUID REFERENCES public.external_results(id) ON DELETE SET NULL,

	approved_by             UUID REFERENCES public.users(id) ON DELETE SET NULL,
	approved_at             TIMESTAMP WITH TIME ZONE,
	finalized_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
	finalized_at            TIMESTAMP WITH TIME ZONE,

	created_by              UUID REFERENCES public.users(id) ON DELETE SET NULL,
	updated_by              UUID REFERENCES public.users(id) ON DELETE SET NULL,
	created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT chk_external_results_source_type
		CHECK (source_type IN ('EXTERNAL', 'TRANSFER', 'MIGRATED')),
	CONSTRAINT chk_external_results_status
		CHECK (status IN ('Draft', 'Approved', 'Final', 'Superseded', 'Cancelled')),
	CONSTRAINT chk_external_results_semester
		CHECK (semester BETWEEN 1 AND 12),
	CONSTRAINT chk_external_results_course_part
		CHECK (course_part IS NULL OR course_part IN
			('Part I', 'Part II', 'Part III', 'Part IV', 'Part V', 'Part A', 'Part B')),
	CONSTRAINT chk_external_results_marks
		CHECK ((credit IS NULL OR credit >= 0)
			AND (grade_point IS NULL OR grade_point >= 0)
			AND (total_mark IS NULL OR max_mark IS NULL OR total_mark <= max_mark)),
	CONSTRAINT chk_external_results_grade_present
		CHECK (grade IS NOT NULL OR grade_point IS NOT NULL OR total_mark IS NOT NULL),
	CONSTRAINT chk_external_results_approved
		CHECK (status NOT IN ('Approved', 'Final') OR approved_at IS NOT NULL),
	CONSTRAINT chk_external_results_final
		CHECK (status <> 'Final' OR finalized_at IS NOT NULL),
	CONSTRAINT chk_external_results_superseded
		CHECK (status <> 'Superseded' OR superseded_by IS NOT NULL)
);

COMMENT ON TABLE public.external_results IS
	'Results of courses examined outside the COE pipeline (other university, transfer, Anna University, pre-COE legacy). Merged with Published final_marks at read time.';

-- One live row per learner / external course / attempt
CREATE UNIQUE INDEX IF NOT EXISTS uq_external_results_live_attempt
	ON public.external_results (institutions_id, register_number, source_university, external_course_code, attempt_no)
	WHERE status NOT IN ('Superseded', 'Cancelled');

CREATE INDEX IF NOT EXISTS idx_external_results_learner
	ON public.external_results (institutions_id, register_number, semester);
CREATE INDEX IF NOT EXISTS idx_external_results_student
	ON public.external_results (student_id);
CREATE INDEX IF NOT EXISTS idx_external_results_program
	ON public.external_results (institutions_id, program_code, status);
CREATE INDEX IF NOT EXISTS idx_external_results_batch
	ON public.external_results (batch_id);

-- A Final row is read-only. The only allowed changes are:
--   Final -> Superseded (with superseded_by)  - correction
--   Final -> Cancelled                        - admin batch reversal
--   backfilling student_id / academic_profile_id
CREATE OR REPLACE FUNCTION public.guard_final_external_results()
RETURNS TRIGGER AS $$
BEGIN
	IF OLD.status = 'Final' THEN
		IF NEW.status NOT IN ('Final', 'Superseded', 'Cancelled') THEN
			RAISE EXCEPTION 'External result % is Final; it cannot move back to %', OLD.id, NEW.status
				USING ERRCODE = 'check_violation';
		END IF;
		IF (NEW.register_number, NEW.semester, NEW.source_type, NEW.source_university,
			NEW.external_course_code, NEW.external_course_name, NEW.course_part, NEW.credit,
			NEW.max_mark, NEW.internal_mark, NEW.external_mark, NEW.total_mark,
			NEW.grade, NEW.grade_point, NEW.is_pass, NEW.attempt_no)
			IS DISTINCT FROM
			(OLD.register_number, OLD.semester, OLD.source_type, OLD.source_university,
			OLD.external_course_code, OLD.external_course_name, OLD.course_part, OLD.credit,
			OLD.max_mark, OLD.internal_mark, OLD.external_mark, OLD.total_mark,
			OLD.grade, OLD.grade_point, OLD.is_pass, OLD.attempt_no)
		THEN
			RAISE EXCEPTION 'External result % is Final; raise a correction instead of editing it', OLD.id
				USING ERRCODE = 'check_violation';
		END IF;
	END IF;
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_guard_final_external_results ON public.external_results;
CREATE TRIGGER trigger_guard_final_external_results
	BEFORE UPDATE ON public.external_results
	FOR EACH ROW EXECUTE FUNCTION public.guard_final_external_results();

CREATE OR REPLACE FUNCTION public.block_final_external_results_delete()
RETURNS TRIGGER AS $$
BEGIN
	IF OLD.status IN ('Final', 'Superseded') THEN
		RAISE EXCEPTION 'External result % is %; it cannot be deleted', OLD.id, OLD.status
			USING ERRCODE = 'check_violation';
	END IF;
	RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_block_final_external_results_delete ON public.external_results;
CREATE TRIGGER trigger_block_final_external_results_delete
	BEFORE DELETE ON public.external_results
	FOR EACH ROW EXECUTE FUNCTION public.block_final_external_results_delete();

-- -----------------------------------------------------
-- 5. Corrections
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_result_corrections (
	id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	institutions_id     UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	original_result_id  UUID NOT NULL REFERENCES public.external_results(id) ON DELETE RESTRICT,
	new_result_id       UUID REFERENCES public.external_results(id) ON DELETE RESTRICT,

	old_value           JSONB NOT NULL,
	new_value           JSONB NOT NULL,
	reason              TEXT NOT NULL,

	-- Requested -> Approved (new version created) / Rejected
	status              VARCHAR(20) NOT NULL DEFAULT 'Requested',

	changed_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
	changed_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	approved_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
	approved_at         TIMESTAMP WITH TIME ZONE,
	rejection_reason    TEXT,

	CONSTRAINT chk_external_result_corrections_status
		CHECK (status IN ('Requested', 'Approved', 'Rejected')),
	CONSTRAINT chk_external_result_corrections_reason
		CHECK (length(btrim(reason)) > 0),
	CONSTRAINT chk_external_result_corrections_approved
		CHECK (status <> 'Approved' OR (new_result_id IS NOT NULL AND approved_at IS NOT NULL))
);

COMMENT ON TABLE public.external_result_corrections IS
	'Append-only audit of corrections to Final external results. Approval creates a new external_results version.';

CREATE INDEX IF NOT EXISTS idx_external_result_corrections_original
	ON public.external_result_corrections (original_result_id);
CREATE INDEX IF NOT EXISTS idx_external_result_corrections_status
	ON public.external_result_corrections (institutions_id, status);

-- -----------------------------------------------------
-- 6. Import errors
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.result_import_errors (
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	batch_id        UUID NOT NULL REFERENCES public.result_import_batches(id) ON DELETE CASCADE,
	row_number      INTEGER NOT NULL,
	register_number VARCHAR(100),
	student_id      UUID,
	-- 'error' rows were not imported; 'warning' rows were imported
	severity        VARCHAR(10) NOT NULL DEFAULT 'error',
	error_code      VARCHAR(50) NOT NULL,
	error_message   TEXT NOT NULL,
	raw_data        JSONB,
	created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT chk_result_import_errors_severity
		CHECK (severity IN ('error', 'warning'))
);

CREATE INDEX IF NOT EXISTS idx_result_import_errors_batch
	ON public.result_import_errors (batch_id, row_number);

-- -----------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_external_results_module_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_learner_academic_profiles_updated_at ON public.learner_academic_profiles;
CREATE TRIGGER trigger_update_learner_academic_profiles_updated_at
	BEFORE UPDATE ON public.learner_academic_profiles
	FOR EACH ROW EXECUTE FUNCTION public.set_external_results_module_updated_at();

DROP TRIGGER IF EXISTS trigger_update_external_credit_rules_updated_at ON public.external_credit_rules;
CREATE TRIGGER trigger_update_external_credit_rules_updated_at
	BEFORE UPDATE ON public.external_credit_rules
	FOR EACH ROW EXECUTE FUNCTION public.set_external_results_module_updated_at();

DROP TRIGGER IF EXISTS trigger_update_result_import_batches_updated_at ON public.result_import_batches;
CREATE TRIGGER trigger_update_result_import_batches_updated_at
	BEFORE UPDATE ON public.result_import_batches
	FOR EACH ROW EXECUTE FUNCTION public.set_external_results_module_updated_at();

-- -----------------------------------------------------
-- 7. Unified result items
-- -----------------------------------------------------
-- One shape for Published internal marks and Final external results.
-- Used by the academic timeline and listings. The consolidated marksheet and
-- the semester-results CGPA step merge in TypeScript (they need the nested
-- course_mapping / courses joins), but must follow the same rules.
CREATE OR REPLACE VIEW public.unified_result_items AS
SELECT
	'INTERNAL'::VARCHAR(20)         AS result_source,
	fm.id                           AS result_id,
	fm.institutions_id,
	fm.student_id,
	er.stu_register_no              AS register_number,
	fm.program_code,
	co.semester,
	fm.examination_session_id,
	NULL::VARCHAR(255)              AS source_university,
	c.course_code,
	c.course_name,
	c.course_part_master            AS course_part,
	COALESCE(NULLIF(c.credit, 0), fm.credit) AS credit,
	fm.total_marks_obtained         AS total_mark,
	fm.total_marks_maximum          AS max_mark,
	fm.letter_grade                 AS grade,
	fm.grade_points                 AS grade_point,
	fm.is_pass,
	c.credit_included,
	NULL::UUID                      AS batch_id
FROM public.final_marks fm
JOIN public.exam_registrations er ON er.id = fm.exam_registration_id
JOIN public.course_offerings co   ON co.id = fm.course_offering_id
JOIN public.courses c             ON c.id  = fm.course_id
WHERE fm.is_active = true
	AND fm.result_status = 'Published'
UNION ALL
SELECT
	xr.source_type                  AS result_source,
	xr.id                           AS result_id,
	xr.institutions_id,
	xr.student_id,
	xr.register_number,
	xr.program_code,
	xr.semester,
	NULL::UUID                      AS examination_session_id,
	xr.source_university,
	xr.external_course_code         AS course_code,
	xr.external_course_name         AS course_name,
	xr.course_part,
	xr.credit,
	xr.total_mark,
	xr.max_mark,
	xr.grade,
	xr.grade_point,
	xr.is_pass,
	true                            AS credit_included,
	xr.batch_id
FROM public.external_results xr
WHERE xr.status = 'Final';

COMMENT ON VIEW public.unified_result_items IS
	'Published final_marks (INTERNAL) + Final external_results (EXTERNAL/TRANSFER/MIGRATED) in one shape. Not de-duplicated by attempt.';

-- -----------------------------------------------------
-- 8. Page permissions
-- (naming convention: page.<url with / -> . and - -> _>.view)
-- -----------------------------------------------------
WITH page_perms(name, description, resource, role_names) AS (
	VALUES
		('page.grading.view',                  'Access Grading dashboard',      'page.grading',                  ARRAY['super_admin', 'coe']::text[]),
		('page.grading.external_results.view', 'Access External Results page',  'page.grading.external_results', ARRAY['super_admin', 'coe']::text[]),
		('page.grading.result_migration.view', 'Access Result Migration page',  'page.grading.result_migration', ARRAY['super_admin', 'coe']::text[])
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
