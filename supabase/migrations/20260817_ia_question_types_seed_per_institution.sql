-- =====================================================
-- Keep the per-institution question-type catalogue self-maintaining.
--
-- ia_question_types is scoped per institution, but the seed in
-- 20260717_create_ia_question_paper_templates.sql was a ONE-TIME
-- INSERT over the institutions that existed when it ran. Any institution
-- created afterwards has ZERO question types, so its users cannot build
-- a single template part — the type dropdown is empty and there is no
-- indication why.
--
-- This migration replaces that one-shot seed with:
--   1. a reusable function holding the default catalogue
--   2. an AFTER INSERT trigger on institutions, so new ones seed themselves
--   3. a backfill for institutions currently missing the defaults
--
-- Institutions that already customised their catalogue are untouched:
-- the insert is ON CONFLICT (institutions_id, type_code) DO NOTHING.
-- =====================================================

-- -----------------------------------------------------
-- 1. Reusable seeder
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_ia_question_types(p_institution_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_institution_code VARCHAR(50);
	v_inserted INTEGER := 0;
BEGIN
	SELECT institution_code INTO v_institution_code
	FROM public.institutions
	WHERE id = p_institution_id;

	-- institution_code is NOT NULL on ia_question_types; nothing to seed without it
	IF v_institution_code IS NULL THEN
		RETURN 0;
	END IF;

	INSERT INTO public.ia_question_types
		(institutions_id, institution_code, type_code, type_label, description,
		 is_objective, has_options, default_option_count, display_order)
	SELECT
		p_institution_id, v_institution_code, t.type_code, t.type_label, t.description,
		t.is_objective, t.has_options, t.default_option_count, t.display_order
	FROM (VALUES
		('mcq',        'Multiple Choice (MCQ)', 'Objective question with 4 options', true,  true,  4,    1),
		('mcq3',       'Multiple Choice (3)',   'Objective question with 3 options', true,  true,  3,    2),
		('true_false', 'True / False',          'Objective true/false',              true,  true,  2,    3),
		('fill_blank', 'Fill in the Blank',     'Objective fill-in-the-blank',       true,  false, NULL, 4),
		('short',      'Short Answer',          'Short descriptive answer',          false, false, NULL, 5),
		('essay',      'Essay / Long Answer',   'Long descriptive answer',           false, false, NULL, 6)
	) AS t(type_code, type_label, description, is_objective, has_options, default_option_count, display_order)
	ON CONFLICT (institutions_id, type_code) DO NOTHING;

	GET DIAGNOSTICS v_inserted = ROW_COUNT;
	RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.seed_ia_question_types(UUID) IS
'Seeds the default Internal Assessment question types for one institution. Idempotent — existing/customised types are left alone.';

-- -----------------------------------------------------
-- 2. Seed every newly created institution
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_seed_ia_question_types()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	PERFORM public.seed_ia_question_types(NEW.id);
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_ia_question_types_on_institution ON public.institutions;
CREATE TRIGGER seed_ia_question_types_on_institution
	AFTER INSERT ON public.institutions
	FOR EACH ROW
	EXECUTE FUNCTION public.trg_seed_ia_question_types();

-- -----------------------------------------------------
-- 3. Backfill institutions created since the original seed
-- -----------------------------------------------------
DO $$
DECLARE
	r RECORD;
	v_rows INTEGER;
	v_total INTEGER := 0;
	v_institutions INTEGER := 0;
BEGIN
	FOR r IN SELECT id, institution_code FROM public.institutions LOOP
		v_rows := public.seed_ia_question_types(r.id);
		IF v_rows > 0 THEN
			v_institutions := v_institutions + 1;
			v_total := v_total + v_rows;
			RAISE NOTICE 'Seeded % question type(s) for institution %', v_rows, r.institution_code;
		END IF;
	END LOOP;
	RAISE NOTICE 'Backfill complete: % type(s) across % institution(s)', v_total, v_institutions;
END $$;
