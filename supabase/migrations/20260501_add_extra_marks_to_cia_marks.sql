-- =====================================================
-- Add extra_marks JSONB to cia_marks (Option C — hybrid)
-- Created: 2026-05-01
-- Purpose: Support end-user-defined CIA components (e.g., AI Tools Usage,
--          Interactive Mode) without schema migrations for each new component.
--
-- Standard 13 components stay in their dedicated columns (assignment_marks,
-- quiz_marks, ..., test_3_mark) for back-compat with v1/sync and existing data.
-- Anything outside that set is stored in extra_marks JSONB keyed by component code.
-- =====================================================

-- Defensive: works whether base schema is 20260402 (fixed columns) or 20260427 (jsonb)
ALTER TABLE public.cia_marks
	ADD COLUMN IF NOT EXISTS extra_marks JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.cia_marks
	ADD COLUMN IF NOT EXISTS extra_marks_max JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.cia_marks.extra_marks IS
	'End-user-defined component scores keyed by component code (e.g., {"ai_tools": 8, "interactive_mode": 5}). Used for components not covered by the 13 fixed columns.';

COMMENT ON COLUMN public.cia_marks.extra_marks_max IS
	'Max marks for end-user-defined components, keyed by component code. Mirrors extra_marks structure.';

-- =====================================================
-- Helper: sum numeric values in a JSONB object
-- Returns 0 for non-numeric or null entries.
-- =====================================================
CREATE OR REPLACE FUNCTION public.cia_sum_jsonb_numeric(j JSONB)
RETURNS NUMERIC AS $$
DECLARE
	total NUMERIC := 0;
	v TEXT;
BEGIN
	IF j IS NULL THEN RETURN 0; END IF;
	FOR v IN SELECT value::text FROM jsonb_each_text(j) LOOP
		IF v ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
			total := total + v::numeric;
		END IF;
	END LOOP;
	RETURN total;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- Replace total-recalc triggers to include extra_marks
-- (only applies if the 20260402 schema is in place; safe no-op otherwise
--  because the function bodies reference columns that exist there)
-- =====================================================
DO $$
BEGIN
	-- Only redefine triggers if the standard 20260402 columns exist
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'cia_marks' AND column_name = 'assignment_marks'
	) THEN
		-- Recreate INSERT trigger function
		CREATE OR REPLACE FUNCTION public.calculate_cia_total_on_insert()
		RETURNS TRIGGER AS $TRIGGER_FN$
		BEGIN
			IF NEW.total_internal_marks = 0 OR NEW.total_internal_marks IS NULL THEN
				NEW.total_internal_marks =
					COALESCE(NEW.assignment_marks, 0) +
					COALESCE(NEW.quiz_marks, 0) +
					COALESCE(NEW.mid_term_marks, 0) +
					COALESCE(NEW.presentation_marks, 0) +
					COALESCE(NEW.attendance_marks, 0) +
					COALESCE(NEW.lab_marks, 0) +
					COALESCE(NEW.project_marks, 0) +
					COALESCE(NEW.seminar_marks, 0) +
					COALESCE(NEW.viva_marks, 0) +
					COALESCE(NEW.other_marks, 0) +
					COALESCE(NEW.test_1_mark, 0) +
					COALESCE(NEW.test_2_mark, 0) +
					COALESCE(NEW.test_3_mark, 0) +
					public.cia_sum_jsonb_numeric(NEW.extra_marks);
			END IF;
			RETURN NEW;
		END;
		$TRIGGER_FN$ LANGUAGE plpgsql;

		-- Recreate UPDATE trigger function (always recalc on any change to mark columns
		-- or extra_marks JSONB — we compare JSONB equality to detect changes)
		CREATE OR REPLACE FUNCTION public.auto_calculate_total_cia_marks()
		RETURNS TRIGGER AS $TRIGGER_FN$
		BEGIN
			IF NEW.assignment_marks IS DISTINCT FROM OLD.assignment_marks OR
			   NEW.quiz_marks IS DISTINCT FROM OLD.quiz_marks OR
			   NEW.mid_term_marks IS DISTINCT FROM OLD.mid_term_marks OR
			   NEW.presentation_marks IS DISTINCT FROM OLD.presentation_marks OR
			   NEW.attendance_marks IS DISTINCT FROM OLD.attendance_marks OR
			   NEW.lab_marks IS DISTINCT FROM OLD.lab_marks OR
			   NEW.project_marks IS DISTINCT FROM OLD.project_marks OR
			   NEW.seminar_marks IS DISTINCT FROM OLD.seminar_marks OR
			   NEW.viva_marks IS DISTINCT FROM OLD.viva_marks OR
			   NEW.other_marks IS DISTINCT FROM OLD.other_marks OR
			   NEW.test_1_mark IS DISTINCT FROM OLD.test_1_mark OR
			   NEW.test_2_mark IS DISTINCT FROM OLD.test_2_mark OR
			   NEW.test_3_mark IS DISTINCT FROM OLD.test_3_mark OR
			   NEW.extra_marks IS DISTINCT FROM OLD.extra_marks
			THEN
				NEW.total_internal_marks =
					COALESCE(NEW.assignment_marks, 0) +
					COALESCE(NEW.quiz_marks, 0) +
					COALESCE(NEW.mid_term_marks, 0) +
					COALESCE(NEW.presentation_marks, 0) +
					COALESCE(NEW.attendance_marks, 0) +
					COALESCE(NEW.lab_marks, 0) +
					COALESCE(NEW.project_marks, 0) +
					COALESCE(NEW.seminar_marks, 0) +
					COALESCE(NEW.viva_marks, 0) +
					COALESCE(NEW.other_marks, 0) +
					COALESCE(NEW.test_1_mark, 0) +
					COALESCE(NEW.test_2_mark, 0) +
					COALESCE(NEW.test_3_mark, 0) +
					public.cia_sum_jsonb_numeric(NEW.extra_marks);
			END IF;
			RETURN NEW;
		END;
		$TRIGGER_FN$ LANGUAGE plpgsql;

		-- prevent_locked trigger: also block extra_marks changes when locked
		CREATE OR REPLACE FUNCTION public.prevent_locked_cia_marks_modification()
		RETURNS TRIGGER AS $TRIGGER_FN$
		BEGIN
			IF OLD.is_locked = true AND (
				NEW.assignment_marks IS DISTINCT FROM OLD.assignment_marks OR
				NEW.quiz_marks IS DISTINCT FROM OLD.quiz_marks OR
				NEW.mid_term_marks IS DISTINCT FROM OLD.mid_term_marks OR
				NEW.presentation_marks IS DISTINCT FROM OLD.presentation_marks OR
				NEW.attendance_marks IS DISTINCT FROM OLD.attendance_marks OR
				NEW.lab_marks IS DISTINCT FROM OLD.lab_marks OR
				NEW.project_marks IS DISTINCT FROM OLD.project_marks OR
				NEW.seminar_marks IS DISTINCT FROM OLD.seminar_marks OR
				NEW.viva_marks IS DISTINCT FROM OLD.viva_marks OR
				NEW.other_marks IS DISTINCT FROM OLD.other_marks OR
				NEW.test_1_mark IS DISTINCT FROM OLD.test_1_mark OR
				NEW.test_2_mark IS DISTINCT FROM OLD.test_2_mark OR
				NEW.test_3_mark IS DISTINCT FROM OLD.test_3_mark OR
				NEW.total_internal_marks IS DISTINCT FROM OLD.total_internal_marks OR
				NEW.extra_marks IS DISTINCT FROM OLD.extra_marks
			) THEN
				RAISE EXCEPTION 'Cannot modify locked CIA marks. Unlock first.';
			END IF;
			RETURN NEW;
		END;
		$TRIGGER_FN$ LANGUAGE plpgsql;
	END IF;
END $$;

-- Index to speed up extra_marks key lookups (e.g., "find all rows with ai_tools score > 0")
CREATE INDEX IF NOT EXISTS idx_cia_marks_extra_marks_gin
	ON public.cia_marks USING gin (extra_marks);
