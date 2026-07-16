-- =====================================================
-- IA QUESTION PAPER TEMPLATES & AUTHORING MODULE
-- Created: 2026-07-17
-- Purpose: Configurable Internal Assessment question-paper
--          format templates (COE level) + per exam-session /
--          CIA-round / course question paper authoring + PDF.
-- Design doc: docs/plans/2026-07-17-ia-question-paper-templates.md
-- Mirrors conventions of internal_assessment_patterns.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: ia_question_types
-- Per-institution configurable question-type registry.
-- Institutions define their OWN types (MCQ-4, MCQ-3, Short,
-- Essay, Fill-blank, True/False, or anything they add).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ia_question_types (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code VARCHAR(50) NOT NULL,

	type_code VARCHAR(50) NOT NULL,
	type_label VARCHAR(150) NOT NULL,
	description TEXT,

	-- Behaviour flags
	is_objective BOOLEAN NOT NULL DEFAULT false,
	has_options BOOLEAN NOT NULL DEFAULT false,
	default_option_count INTEGER,           -- e.g. 4 or 3 for MCQ; NULL for descriptive

	display_order INTEGER NOT NULL DEFAULT 1,
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

	UNIQUE (institutions_id, type_code),
	CHECK (default_option_count IS NULL OR default_option_count BETWEEN 2 AND 8)
);

CREATE INDEX IF NOT EXISTS idx_ia_qtypes_institution
	ON public.ia_question_types(institutions_id);

COMMENT ON TABLE public.ia_question_types IS
'Configurable question types per institution; template parts reference these.';

-- =====================================================
-- TABLE: ia_paper_templates
-- Template header (versioned, mirrors internal_assessment_patterns).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ia_paper_templates (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code VARCHAR(50) NOT NULL,
	regulation_id UUID REFERENCES public.regulations(id) ON DELETE SET NULL,
	regulation_code VARCHAR(50),

	template_code VARCHAR(50) NOT NULL,
	template_name VARCHAR(255) NOT NULL,
	description TEXT,

	-- Scope: which exam this format is for
	exam_scope VARCHAR(20) NOT NULL DEFAULT 'cia'
		CHECK (exam_scope IN ('cia', 'ese', 'all')),

	-- Applicability (default resolution like internal_assessment_patterns)
	course_type_applicability VARCHAR(20) NOT NULL DEFAULT 'all'
		CHECK (course_type_applicability IN ('theory', 'practical', 'project', 'theory_practical', 'all')),
	program_type_applicability VARCHAR(20) NOT NULL DEFAULT 'all'
		CHECK (program_type_applicability IN ('ug', 'pg', 'diploma', 'certificate', 'all')),

	-- Totals (total_marks auto-maintained from parts by trigger)
	total_marks NUMERIC(6, 2) NOT NULL DEFAULT 0,
	duration_minutes INTEGER,

	-- Default capture toggles (override per part)
	capture_co BOOLEAN NOT NULL DEFAULT true,
	capture_klevel BOOLEAN NOT NULL DEFAULT true,

	-- Versioning
	wef_date DATE NOT NULL DEFAULT CURRENT_DATE,
	version_number INTEGER NOT NULL DEFAULT 1,

	status VARCHAR(20) NOT NULL DEFAULT 'draft'
		CHECK (status IN ('draft', 'active', 'archived')),
	is_default BOOLEAN NOT NULL DEFAULT false,

	created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
	approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
	approved_at TIMESTAMPTZ,
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

	UNIQUE (institutions_id, template_code, version_number)
);

CREATE INDEX IF NOT EXISTS idx_ia_templates_institution
	ON public.ia_paper_templates(institutions_id);
CREATE INDEX IF NOT EXISTS idx_ia_templates_status
	ON public.ia_paper_templates(status);
CREATE INDEX IF NOT EXISTS idx_ia_templates_scope
	ON public.ia_paper_templates(exam_scope);

-- One default per (institution, regulation, scope, applicability)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ia_templates_unique_default
	ON public.ia_paper_templates (institutions_id, regulation_code, exam_scope, course_type_applicability, program_type_applicability)
	WHERE is_default = true AND is_active = true;

COMMENT ON TABLE public.ia_paper_templates IS
'Configurable question-paper format templates (COE level), versioned by W.E.F date.';

-- =====================================================
-- TABLE: ia_template_parts
-- Parts of a template (Part A / B / C ...).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ia_template_parts (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	template_id UUID NOT NULL REFERENCES public.ia_paper_templates(id) ON DELETE CASCADE,

	part_label VARCHAR(10) NOT NULL,          -- "A", "B", "C"
	part_title VARCHAR(100),                  -- "PART A"
	instruction TEXT,                         -- "Answer ALL questions, choosing correct answer"

	question_type_code VARCHAR(50) NOT NULL,  -- FK-by-code into ia_question_types
	num_questions INTEGER NOT NULL DEFAULT 1 CHECK (num_questions >= 0),
	marks_per_question NUMERIC(5, 2) NOT NULL DEFAULT 1 CHECK (marks_per_question >= 0),

	-- Choice ("OR"): e.g. 6a / 6b, answer one of a pair
	has_choice BOOLEAN NOT NULL DEFAULT false,
	choice_group_size INTEGER NOT NULL DEFAULT 1,

	-- MCQ option count (nullable for descriptive parts)
	option_count INTEGER,

	-- Per-part capture overrides
	capture_co BOOLEAN NOT NULL DEFAULT true,
	capture_klevel BOOLEAN NOT NULL DEFAULT true,

	-- Computed max marks for the part (num_questions * marks_per_question)
	part_max_marks NUMERIC(6, 2) NOT NULL DEFAULT 0,

	display_order INTEGER NOT NULL DEFAULT 1,
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

	UNIQUE (template_id, part_label)
);

CREATE INDEX IF NOT EXISTS idx_ia_parts_template
	ON public.ia_template_parts(template_id, display_order);

COMMENT ON TABLE public.ia_template_parts IS
'Parts (A/B/C) of a paper template with type, count, marks and choice config.';

-- =====================================================
-- TABLE: ia_course_outcomes
-- CO master per course (CO1..CO5) for the paper CO dropdown.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ia_course_outcomes (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
	course_code VARCHAR(50) NOT NULL,

	co_code VARCHAR(20) NOT NULL,             -- "CO1"
	co_description TEXT,

	display_order INTEGER NOT NULL DEFAULT 1,
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

	UNIQUE (course_id, co_code)
);

CREATE INDEX IF NOT EXISTS idx_ia_co_course
	ON public.ia_course_outcomes(course_id);
CREATE INDEX IF NOT EXISTS idx_ia_co_institution
	ON public.ia_course_outcomes(institutions_id);

COMMENT ON TABLE public.ia_course_outcomes IS
'Course Outcomes master per course; paper questions pick co_code from here.';

-- =====================================================
-- TABLE: ia_question_papers
-- One paper instance per exam-session / CIA-round / course / set.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ia_question_papers (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

	examination_session_id UUID NOT NULL REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
	cia_setting_id UUID REFERENCES public.cia_entry_settings(id) ON DELETE SET NULL,
	cia_round INTEGER,
	cia_round_name VARCHAR(40),

	course_offering_id UUID REFERENCES public.course_offerings(id) ON DELETE SET NULL,
	course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
	course_code VARCHAR(50),
	program_code VARCHAR(50),
	semester INTEGER,

	template_id UUID REFERENCES public.ia_paper_templates(id) ON DELETE SET NULL,
	template_version INTEGER,

	-- A/B sets when courses.multiple_qp_set is enabled
	set_number INTEGER NOT NULL DEFAULT 1,
	set_label VARCHAR(10),                    -- "A", "B"

	subject_title VARCHAR(255),
	exam_date DATE,
	duration_minutes INTEGER,
	max_marks NUMERIC(6, 2),

	status VARCHAR(20) NOT NULL DEFAULT 'draft'
		CHECK (status IN ('draft', 'submitted', 'approved', 'locked')),
	paper_setter_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

	submitted_at TIMESTAMPTZ,
	approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
	approved_at TIMESTAMPTZ,
	locked_at TIMESTAMPTZ,

	created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

	UNIQUE (cia_setting_id, cia_round, course_offering_id, set_number)
);

CREATE INDEX IF NOT EXISTS idx_ia_papers_institution
	ON public.ia_question_papers(institutions_id);
CREATE INDEX IF NOT EXISTS idx_ia_papers_session
	ON public.ia_question_papers(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_ia_papers_cia
	ON public.ia_question_papers(cia_setting_id, cia_round);
CREATE INDEX IF NOT EXISTS idx_ia_papers_course_offering
	ON public.ia_question_papers(course_offering_id);
CREATE INDEX IF NOT EXISTS idx_ia_papers_status
	ON public.ia_question_papers(status);

COMMENT ON TABLE public.ia_question_papers IS
'Question paper instance per exam-session / CIA round / course / set.';

-- =====================================================
-- TABLE: ia_paper_questions
-- Actual authored questions inside a paper (scaffolded from template).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ia_paper_questions (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	paper_id UUID NOT NULL REFERENCES public.ia_question_papers(id) ON DELETE CASCADE,
	part_id UUID REFERENCES public.ia_template_parts(id) ON DELETE SET NULL,
	part_label VARCHAR(10),

	question_number INTEGER NOT NULL,         -- 1..N (7, 8 in the sample)
	sub_label VARCHAR(5),                     -- "a", "b"
	is_choice_alternative BOOLEAN NOT NULL DEFAULT false,  -- the "(OR)" branch

	question_type_code VARCHAR(50),
	question_text TEXT,
	marks NUMERIC(5, 2),

	-- MCQ / objective
	options JSONB,                            -- [{"key":"a","text":"..."}, ...]
	correct_option VARCHAR(5),

	-- Outcome tagging (sample columns: CO, K level)
	co_code VARCHAR(20),
	k_level VARCHAR(10),

	display_order INTEGER NOT NULL DEFAULT 1,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ia_questions_paper
	ON public.ia_paper_questions(paper_id, display_order);
CREATE INDEX IF NOT EXISTS idx_ia_questions_part
	ON public.ia_paper_questions(part_id);

COMMENT ON TABLE public.ia_paper_questions IS
'Authored questions (text, options, CO, K-level) inside a paper.';

-- =====================================================
-- TABLE: ia_paper_setters
-- Faculty assigned to author a course paper (scoped access).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ia_paper_setters (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	examination_session_id UUID REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
	cia_setting_id UUID REFERENCES public.cia_entry_settings(id) ON DELETE CASCADE,
	cia_round INTEGER,
	course_offering_id UUID REFERENCES public.course_offerings(id) ON DELETE CASCADE,
	course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
	course_code VARCHAR(50),

	faculty_id UUID,                          -- MyJKKN staff id (external)
	faculty_name VARCHAR(255),
	faculty_email VARCHAR(255),
	set_number INTEGER NOT NULL DEFAULT 1,

	assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

	UNIQUE (cia_setting_id, cia_round, course_offering_id, set_number, faculty_id)
);

CREATE INDEX IF NOT EXISTS idx_ia_setters_offering
	ON public.ia_paper_setters(course_offering_id);
CREATE INDEX IF NOT EXISTS idx_ia_setters_faculty
	ON public.ia_paper_setters(faculty_id);

COMMENT ON TABLE public.ia_paper_setters IS
'Faculty assignments for authoring a course paper (paper-setter scoping).';

-- =====================================================
-- TRIGGERS: updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_ia_qp_timestamp()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ia_qtypes_updated_at BEFORE UPDATE ON public.ia_question_types
	FOR EACH ROW EXECUTE FUNCTION update_ia_qp_timestamp();
CREATE TRIGGER trg_ia_templates_updated_at BEFORE UPDATE ON public.ia_paper_templates
	FOR EACH ROW EXECUTE FUNCTION update_ia_qp_timestamp();
CREATE TRIGGER trg_ia_parts_updated_at BEFORE UPDATE ON public.ia_template_parts
	FOR EACH ROW EXECUTE FUNCTION update_ia_qp_timestamp();
CREATE TRIGGER trg_ia_co_updated_at BEFORE UPDATE ON public.ia_course_outcomes
	FOR EACH ROW EXECUTE FUNCTION update_ia_qp_timestamp();
CREATE TRIGGER trg_ia_papers_updated_at BEFORE UPDATE ON public.ia_question_papers
	FOR EACH ROW EXECUTE FUNCTION update_ia_qp_timestamp();
CREATE TRIGGER trg_ia_questions_updated_at BEFORE UPDATE ON public.ia_paper_questions
	FOR EACH ROW EXECUTE FUNCTION update_ia_qp_timestamp();
CREATE TRIGGER trg_ia_setters_updated_at BEFORE UPDATE ON public.ia_paper_setters
	FOR EACH ROW EXECUTE FUNCTION update_ia_qp_timestamp();

-- =====================================================
-- TRIGGERS: keep part_max_marks + template total_marks in sync
-- =====================================================

-- BEFORE trigger: compute part_max_marks on the row itself.
CREATE OR REPLACE FUNCTION ia_part_before()
RETURNS TRIGGER AS $$
BEGIN
	NEW.part_max_marks := COALESCE(NEW.num_questions, 0) * COALESCE(NEW.marks_per_question, 0);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ia_part_before
	BEFORE INSERT OR UPDATE ON public.ia_template_parts
	FOR EACH ROW EXECUTE FUNCTION ia_part_before();

-- AFTER trigger: roll part_max_marks up into the template total_marks.
CREATE OR REPLACE FUNCTION ia_template_total_after()
RETURNS TRIGGER AS $$
DECLARE
	v_template_id UUID;
	v_total NUMERIC(6,2);
BEGIN
	v_template_id := COALESCE(NEW.template_id, OLD.template_id);
	SELECT COALESCE(SUM(part_max_marks), 0) INTO v_total
	FROM public.ia_template_parts
	WHERE template_id = v_template_id AND is_active = true;

	UPDATE public.ia_paper_templates
	SET total_marks = v_total
	WHERE id = v_template_id;

	RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ia_template_total_after
	AFTER INSERT OR UPDATE OR DELETE ON public.ia_template_parts
	FOR EACH ROW EXECUTE FUNCTION ia_template_total_after();

-- =====================================================
-- SEED: default question types for every existing institution
-- =====================================================

INSERT INTO public.ia_question_types
	(institutions_id, institution_code, type_code, type_label, description, is_objective, has_options, default_option_count, display_order)
SELECT i.id, i.institution_code, t.type_code, t.type_label, t.description, t.is_objective, t.has_options, t.default_option_count, t.display_order
FROM public.institutions i
CROSS JOIN (VALUES
	('mcq',        'Multiple Choice (MCQ)', 'Objective question with 4 options', true,  true,  4,    1),
	('mcq3',       'Multiple Choice (3)',   'Objective question with 3 options', true,  true,  3,    2),
	('true_false', 'True / False',          'Objective true/false',              true,  true,  2,    3),
	('fill_blank', 'Fill in the Blank',     'Objective fill-in-the-blank',       true,  false, NULL, 4),
	('short',      'Short Answer',          'Short descriptive answer',          false, false, NULL, 5),
	('essay',      'Essay / Long Answer',   'Long descriptive answer',           false, false, NULL, 6)
) AS t(type_code, type_label, description, is_objective, has_options, default_option_count, display_order)
ON CONFLICT (institutions_id, type_code) DO NOTHING;

-- =====================================================
-- RLS (authenticated read + service_role manage — matches
-- the permissive baseline used by internal_assessment_patterns)
-- =====================================================

DO $$
DECLARE
	tbl TEXT;
BEGIN
	FOREACH tbl IN ARRAY ARRAY[
		'ia_question_types', 'ia_paper_templates', 'ia_template_parts',
		'ia_course_outcomes', 'ia_question_papers', 'ia_paper_questions', 'ia_paper_setters'
	]
	LOOP
		EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
		EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true);', tbl || '_select', tbl);
		EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true);', tbl || '_insert', tbl);
		EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', tbl || '_update', tbl);
		EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true);', tbl || '_delete', tbl);
	END LOOP;
END $$;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
