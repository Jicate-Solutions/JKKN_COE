-- =====================================================
-- Consolidated Results Table with Folio Assignment
-- =====================================================
-- Date: 2026-06-06
-- Purpose: Track consolidated (all-semester) results for learners
-- with overall CGPA, part-wise CGPA, classification, and a
-- separate folio numbering system prefixed with 'C' (Consolidated).
--
-- Folio format: C{MM}{YY}{UC|PC}{NNNN}
--   C    = Consolidated marker
--   MM   = Month code of last_examination_session (JU=Jul, NV=Nov, AP=Apr, ...)
--   YY   = 2-digit year of last_examination_session
--   UC|PC= UC (UG) or PC (PG)
--   NNNN = Zero-padded sequential, reset per (institution, program_type, year)
-- Example: CJU24UC0001
-- =====================================================

-- =====================================================
-- 1. CREATE CONSOLIDATED RESULTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.consolidated_results (
	id UUID NOT NULL DEFAULT gen_random_uuid(),

	-- Core References
	institutions_id UUID NOT NULL,
	student_id UUID NOT NULL,
	program_id UUID NOT NULL,
	program_code VARCHAR(50),
	program_type VARCHAR(10) NOT NULL, -- 'UG' or 'PG'
	register_number VARCHAR(50),

	-- Reference to the LAST examination session the learner appeared in.
	-- Used to derive the folio prefix month/year.
	last_examination_session_id UUID,
	last_appearance_month VARCHAR(10), -- e.g. 'JUL', 'NOV', 'APR'
	last_appearance_year INT,           -- e.g. 2024

	-- Total Credit Summary (across ALL semesters)
	total_credits_registered INT NOT NULL DEFAULT 0,
	total_credits_earned INT NOT NULL DEFAULT 0,
	total_credit_points DECIMAL(10,2) NOT NULL DEFAULT 0,

	-- Cumulative Grade Point Average (across ALL semesters)
	cgpa DECIMAL(4,2) NOT NULL DEFAULT 0,
	percentage DECIMAL(5,2) NOT NULL DEFAULT 0,

	-- Part-wise CGPA & Credits (matches Periyar Univ. consolidated card layout)
	-- Part I  = Language I (Tamil/Hindi/etc.)
	-- Part II = Language II (English)
	-- Part III= Core/Major
	-- Part IV = Allied/Skill Enhancement
	-- Part V  = Extension Activities
	part_i_credits_earned INT DEFAULT 0,
	part_i_cgpa DECIMAL(4,3),
	part_i_classification VARCHAR(50),
	part_ii_credits_earned INT DEFAULT 0,
	part_ii_cgpa DECIMAL(4,3),
	part_ii_classification VARCHAR(50),
	part_iii_credits_earned INT DEFAULT 0,
	part_iii_cgpa DECIMAL(4,3),
	part_iii_classification VARCHAR(50),
	part_iv_credits_earned INT DEFAULT 0,
	part_iv_cgpa DECIMAL(4,3),
	part_iv_classification VARCHAR(50),
	part_v_credits_earned INT DEFAULT 0,
	part_v_cgpa DECIMAL(4,3),
	part_v_classification VARCHAR(50),

	-- Overall Result Classification
	result_class VARCHAR(100), -- Distinction, First Class, Second Class, Pass
	is_distinction BOOLEAN DEFAULT false,
	is_first_class BOOLEAN DEFAULT false,

	-- Overall Backlog Summary
	total_backlogs INT DEFAULT 0,

	-- Result Status
	result_status VARCHAR(50) NOT NULL DEFAULT 'Pending',

	-- Folio Numbering (NEW pattern)
	folio_prefix VARCHAR(10),  -- e.g. 'CJU24UC'
	folio_year INT,             -- year used for counter scoping
	folio_number INT,           -- raw sequential, NULL until assigned
	formatted_folio_number TEXT GENERATED ALWAYS AS (
		CASE
			WHEN folio_prefix IS NOT NULL AND folio_number IS NOT NULL
			THEN folio_prefix || LPAD(folio_number::text, 4, '0')
			ELSE NULL
		END
	) STORED,

	-- Result Declaration
	result_declared_date DATE,
	result_declared_by UUID,

	-- Publication Status
	is_published BOOLEAN DEFAULT false,
	published_date DATE,
	published_by UUID,

	-- Lock Mechanism
	is_locked BOOLEAN DEFAULT false,
	locked_by UUID,
	locked_date DATE,

	-- Additional Metadata
	remarks TEXT,
	is_active BOOLEAN DEFAULT true,

	-- Audit Fields
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	created_by UUID,
	updated_by UUID,

	-- Primary Key
	CONSTRAINT consolidated_results_pkey PRIMARY KEY (id),

	-- Foreign Key Constraints
	CONSTRAINT consolidated_results_institutions_id_fkey
		FOREIGN KEY (institutions_id) REFERENCES institutions(id) ON DELETE CASCADE,
	CONSTRAINT consolidated_results_student_id_fkey
		FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
	CONSTRAINT consolidated_results_program_id_fkey
		FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT,
	CONSTRAINT consolidated_results_last_examination_session_id_fkey
		FOREIGN KEY (last_examination_session_id) REFERENCES examination_sessions(id) ON DELETE SET NULL,
	CONSTRAINT consolidated_results_result_declared_by_fkey
		FOREIGN KEY (result_declared_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT consolidated_results_published_by_fkey
		FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT consolidated_results_locked_by_fkey
		FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT consolidated_results_created_by_fkey
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT consolidated_results_updated_by_fkey
		FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

	-- Uniqueness: one consolidated record per learner per program per institution
	CONSTRAINT unique_consolidated_result
		UNIQUE(institutions_id, student_id, program_id),

	-- Uniqueness of folio within its counter scope
	CONSTRAINT unique_consolidated_folio_scope
		UNIQUE(institutions_id, program_type, folio_year, folio_number),

	-- Check Constraints
	CONSTRAINT check_program_type_valid
		CHECK (program_type IN ('UG', 'PG')),
	CONSTRAINT check_credits_non_negative
		CHECK (
			total_credits_registered >= 0 AND
			total_credits_earned >= 0 AND
			total_credit_points >= 0
		),
	CONSTRAINT check_cgpa_valid
		CHECK (cgpa >= 0 AND cgpa <= 10),
	CONSTRAINT check_percentage_valid
		CHECK (percentage >= 0 AND percentage <= 100),
	CONSTRAINT check_valid_result_status
		CHECK (result_status IN ('Pending', 'Pass', 'Fail', 'Incomplete', 'Withheld', 'Under Review')),
	CONSTRAINT check_valid_result_class
		CHECK (result_class IS NULL OR result_class IN ('Distinction', 'First Class', 'Second Class', 'Pass', 'Fail')),
	CONSTRAINT check_publication_consistency
		CHECK (
			(is_published = false AND published_by IS NULL AND published_date IS NULL) OR
			(is_published = true AND published_by IS NOT NULL AND published_date IS NOT NULL)
		),
	CONSTRAINT check_lock_consistency
		CHECK (
			(is_locked = false AND locked_by IS NULL AND locked_date IS NULL) OR
			(is_locked = true AND locked_by IS NOT NULL AND locked_date IS NOT NULL)
		),
	CONSTRAINT check_folio_consistency
		CHECK (
			(folio_prefix IS NULL AND folio_number IS NULL AND folio_year IS NULL) OR
			(folio_prefix IS NOT NULL AND folio_number IS NOT NULL AND folio_year IS NOT NULL)
		)
) TABLESPACE pg_default;

-- =====================================================
-- 2. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_consolidated_results_institutions_id
	ON public.consolidated_results(institutions_id);
CREATE INDEX IF NOT EXISTS idx_consolidated_results_student_id
	ON public.consolidated_results(student_id);
CREATE INDEX IF NOT EXISTS idx_consolidated_results_program_id
	ON public.consolidated_results(program_id);
CREATE INDEX IF NOT EXISTS idx_consolidated_results_program_code
	ON public.consolidated_results(program_code);
CREATE INDEX IF NOT EXISTS idx_consolidated_results_last_session
	ON public.consolidated_results(last_examination_session_id)
	WHERE last_examination_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consolidated_results_result_status
	ON public.consolidated_results(result_status);
CREATE INDEX IF NOT EXISTS idx_consolidated_results_is_published
	ON public.consolidated_results(is_published);
CREATE INDEX IF NOT EXISTS idx_consolidated_results_is_locked
	ON public.consolidated_results(is_locked);
CREATE INDEX IF NOT EXISTS idx_consolidated_results_is_active
	ON public.consolidated_results(is_active);

-- Fast folio counter lookup
CREATE INDEX IF NOT EXISTS idx_consolidated_results_folio_lookup
	ON public.consolidated_results(institutions_id, program_type, folio_year, folio_number)
	WHERE folio_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consolidated_results_formatted_folio
	ON public.consolidated_results(formatted_folio_number)
	WHERE formatted_folio_number IS NOT NULL;

-- Composite for institution-scoped browsing
CREATE INDEX IF NOT EXISTS idx_consolidated_results_inst_prog_status
	ON public.consolidated_results(institutions_id, program_id, result_status);
CREATE INDEX IF NOT EXISTS idx_consolidated_results_student_program
	ON public.consolidated_results(student_id, program_id);

-- =====================================================
-- 3. TRIGGER: auto-update updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_consolidated_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_consolidated_results_updated_at
	BEFORE UPDATE ON public.consolidated_results
	FOR EACH ROW
	EXECUTE FUNCTION update_consolidated_results_updated_at();

-- =====================================================
-- 4. HELPER: month code from month number (1-12)
-- =====================================================

CREATE OR REPLACE FUNCTION get_consolidated_folio_month_code(p_month INT)
RETURNS VARCHAR(2) AS $$
BEGIN
	RETURN CASE p_month
		WHEN 1  THEN 'JA'
		WHEN 2  THEN 'FE'
		WHEN 3  THEN 'MR'
		WHEN 4  THEN 'AP'
		WHEN 5  THEN 'MY'
		WHEN 6  THEN 'JN'
		WHEN 7  THEN 'JU'
		WHEN 8  THEN 'AU'
		WHEN 9  THEN 'SE'
		WHEN 10 THEN 'OC'
		WHEN 11 THEN 'NV'
		WHEN 12 THEN 'DE'
		ELSE 'XX'
	END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 5. BULK FOLIO ASSIGNMENT FUNCTION
-- =====================================================
-- Counter scope: (institutions_id, program_type, folio_year)
-- Folio prefix: 'C' + month_code + 2-digit-year + (UC|PC)
-- Processing order: register_number ASC, to maintain sequential numbering.
-- =====================================================

DROP FUNCTION IF EXISTS bulk_assign_consolidated_folio_numbers(UUID[]);

CREATE OR REPLACE FUNCTION bulk_assign_consolidated_folio_numbers(
	p_consolidated_result_ids UUID[]
)
RETURNS TABLE (
	consolidated_result_id UUID,
	assigned_folio_prefix VARCHAR(10),
	assigned_folio_number INT,
	assigned_formatted_folio TEXT,
	success BOOLEAN,
	error_message TEXT
) AS $$
DECLARE
	v_result RECORD;
	v_next_folio INT;
	v_prefix VARCHAR(10);
	v_month_code VARCHAR(2);
	v_year_2digit VARCHAR(2);
	v_type_code VARCHAR(2);
	v_year INT;
BEGIN
	-- Process each record in order of register_number to maintain sequential folios
	FOR v_result IN
		SELECT
			cr.id,
			cr.institutions_id,
			cr.program_type,
			cr.register_number,
			cr.last_appearance_month,
			cr.last_appearance_year,
			cr.last_examination_session_id
		FROM public.consolidated_results cr
		WHERE cr.id = ANY(p_consolidated_result_ids)
		  AND cr.folio_number IS NULL
		ORDER BY cr.register_number ASC
	LOOP
		BEGIN
			-- Determine month code from last_appearance_month or session month
			IF v_result.last_appearance_month IS NOT NULL THEN
				v_month_code := CASE UPPER(v_result.last_appearance_month)
					WHEN 'JAN' THEN 'JA' WHEN 'FEB' THEN 'FE' WHEN 'MAR' THEN 'MR'
					WHEN 'APR' THEN 'AP' WHEN 'MAY' THEN 'MY' WHEN 'JUN' THEN 'JN'
					WHEN 'JUL' THEN 'JU' WHEN 'AUG' THEN 'AU' WHEN 'SEP' THEN 'SE'
					WHEN 'OCT' THEN 'OC' WHEN 'NOV' THEN 'NV' WHEN 'DEC' THEN 'DE'
					ELSE 'XX'
				END;
			ELSE
				-- Fallback: derive from session start month if available
				SELECT get_consolidated_folio_month_code(EXTRACT(MONTH FROM es.start_date)::INT)
				INTO v_month_code
				FROM public.examination_sessions es
				WHERE es.id = v_result.last_examination_session_id;
				v_month_code := COALESCE(v_month_code, 'XX');
			END IF;

			-- Year (2-digit) and counter year
			v_year := COALESCE(
				v_result.last_appearance_year,
				EXTRACT(YEAR FROM CURRENT_DATE)::INT
			);
			v_year_2digit := LPAD((v_year % 100)::text, 2, '0');

			-- Program type code: UC (UG) or PC (PG)
			v_type_code := CASE UPPER(v_result.program_type)
				WHEN 'UG' THEN 'UC'
				WHEN 'PG' THEN 'PC'
				ELSE 'XC'
			END;

			-- Build prefix, e.g. 'CJU24UC'
			v_prefix := 'C' || v_month_code || v_year_2digit || v_type_code;

			-- Get next folio scoped by (institution, program_type, year)
			SELECT COALESCE(MAX(folio_number), 0) + 1
			INTO v_next_folio
			FROM public.consolidated_results
			WHERE institutions_id = v_result.institutions_id
			  AND program_type = v_result.program_type
			  AND folio_year = v_year;

			-- Atomic assignment
			UPDATE public.consolidated_results
			SET
				folio_prefix = v_prefix,
				folio_year = v_year,
				folio_number = v_next_folio,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = v_result.id
			  AND folio_number IS NULL;

			IF FOUND THEN
				consolidated_result_id := v_result.id;
				assigned_folio_prefix := v_prefix;
				assigned_folio_number := v_next_folio;
				assigned_formatted_folio := v_prefix || LPAD(v_next_folio::text, 4, '0');
				success := TRUE;
				error_message := NULL;
			ELSE
				consolidated_result_id := v_result.id;
				assigned_folio_prefix := NULL;
				assigned_folio_number := NULL;
				assigned_formatted_folio := NULL;
				success := FALSE;
				error_message := 'Folio already assigned (race condition)';
			END IF;

			RETURN NEXT;

		EXCEPTION WHEN OTHERS THEN
			consolidated_result_id := v_result.id;
			assigned_folio_prefix := NULL;
			assigned_folio_number := NULL;
			assigned_formatted_folio := NULL;
			success := FALSE;
			error_message := SQLERRM;
			RETURN NEXT;
		END;
	END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION bulk_assign_consolidated_folio_numbers(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_assign_consolidated_folio_numbers(UUID[]) TO service_role;

COMMENT ON FUNCTION bulk_assign_consolidated_folio_numbers(UUID[]) IS
'Assigns folio numbers (CJU24UC0001 style) to consolidated_results in bulk.
Counter scope: (institutions_id, program_type, folio_year).
Prefix format: C + 2-letter month + 2-digit year + (UC|PC).
Processes records in register_number ASC order.';

-- =====================================================
-- 6. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.consolidated_results ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their institution's consolidated results
CREATE POLICY consolidated_results_select_policy
	ON public.consolidated_results
	FOR SELECT
	TO authenticated
	USING (true);

-- Service role bypasses (for server-side API routes)
CREATE POLICY consolidated_results_service_role_all
	ON public.consolidated_results
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- =====================================================
-- 7. TABLE & COLUMN COMMENTS
-- =====================================================

COMMENT ON TABLE public.consolidated_results IS
'Consolidated (all-semester) results per learner per program. One row per (institution, student, program). Separate folio numbering with C-prefix.';

COMMENT ON COLUMN public.consolidated_results.folio_prefix IS
'Folio prefix, e.g. CJU24UC. Assigned by bulk_assign_consolidated_folio_numbers.';
COMMENT ON COLUMN public.consolidated_results.folio_number IS
'Raw sequential folio number within the (institutions_id, program_type, folio_year) scope.';
COMMENT ON COLUMN public.consolidated_results.formatted_folio_number IS
'Auto-generated full folio: folio_prefix || LPAD(folio_number, 4, 0). Example: CJU24UC0001.';
COMMENT ON COLUMN public.consolidated_results.last_examination_session_id IS
'The last exam session the learner appeared in. Used to derive folio month/year.';
