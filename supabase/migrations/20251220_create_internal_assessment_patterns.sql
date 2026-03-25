-- =====================================================
-- INTERNAL ASSESSMENT PATTERNS MODULE
-- Created: 2025-12-20
-- Purpose: Define internal mark setting patterns without
--          max/min marks at component level
-- NOTE: Total internal max mark derived ONLY from courses.internal_max_mark
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: internal_assessment_patterns
-- Master pattern definition with W.E.F versioning
-- =====================================================

CREATE TABLE IF NOT EXISTS public.internal_assessment_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    institution_code VARCHAR(50) NOT NULL,
    regulation_id UUID REFERENCES public.regulations(id) ON DELETE SET NULL,
    regulation_code VARCHAR(50),

    -- Pattern identification
    pattern_code VARCHAR(50) NOT NULL,
    pattern_name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Applicability scope
    course_type_applicability VARCHAR(20) NOT NULL DEFAULT 'all'
        CHECK (course_type_applicability IN ('theory', 'practical', 'project', 'theory_practical', 'all')),
    program_type_applicability VARCHAR(20) NOT NULL DEFAULT 'all'
        CHECK (program_type_applicability IN ('ug', 'pg', 'diploma', 'certificate', 'all')),
    program_category_applicability VARCHAR(20) NOT NULL DEFAULT 'all'
        CHECK (program_category_applicability IN ('arts', 'science', 'skill_based', 'all')),

    -- Assessment configuration
    assessment_frequency VARCHAR(20) NOT NULL DEFAULT 'semester'
        CHECK (assessment_frequency IN ('monthly', 'periodic', 'semester', 'annual')),
    assessment_periods_per_semester INTEGER DEFAULT 1,

    -- W.E.F versioning
    wef_date DATE NOT NULL,
    wef_batch_code VARCHAR(50),
    version_number INTEGER NOT NULL DEFAULT 1,

    -- Calculation settings
    rounding_method VARCHAR(10) NOT NULL DEFAULT 'round'
        CHECK (rounding_method IN ('floor', 'ceil', 'round', 'none')),
    decimal_precision INTEGER NOT NULL DEFAULT 2 CHECK (decimal_precision >= 0 AND decimal_precision <= 2),

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'archived')),
    is_default BOOLEAN NOT NULL DEFAULT false,

    -- Metadata
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE (institutions_id, pattern_code, version_number)
);

-- Partial unique index for default patterns (one default per scope)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_default_pattern
    ON public.internal_assessment_patterns (institutions_id, regulation_code, course_type_applicability, program_type_applicability)
    WHERE is_default = true AND is_active = true;

COMMENT ON TABLE public.internal_assessment_patterns IS
'Master pattern definitions for internal learning assessment structure with W.E.F versioning';

COMMENT ON COLUMN public.internal_assessment_patterns.wef_date IS
'With Effect From date - pattern applicable from this date';

COMMENT ON COLUMN public.internal_assessment_patterns.version_number IS
'Auto-incremented version for pattern evolution';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_internal_patterns_institution
    ON public.internal_assessment_patterns(institutions_id);
CREATE INDEX IF NOT EXISTS idx_internal_patterns_regulation
    ON public.internal_assessment_patterns(regulation_id);
CREATE INDEX IF NOT EXISTS idx_internal_patterns_status
    ON public.internal_assessment_patterns(status);
CREATE INDEX IF NOT EXISTS idx_internal_patterns_wef
    ON public.internal_assessment_patterns(wef_date);
CREATE INDEX IF NOT EXISTS idx_internal_patterns_applicability
    ON public.internal_assessment_patterns(course_type_applicability, program_type_applicability);

-- =====================================================
-- TABLE: internal_assessment_components
-- Components that make up the assessment pattern
-- NOTE: Only weightage_percentage, NO max_mark or min_mark
-- =====================================================

CREATE TABLE IF NOT EXISTS public.internal_assessment_components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_id UUID NOT NULL REFERENCES public.internal_assessment_patterns(id) ON DELETE CASCADE,

    -- Component identification
    component_code VARCHAR(50) NOT NULL,
    component_name VARCHAR(255) NOT NULL,
    component_description TEXT,

    -- Weightage (NOT marks)
    weightage_percentage NUMERIC(5, 2) NOT NULL CHECK (weightage_percentage >= 0 AND weightage_percentage <= 100),

    -- Display and ordering
    display_order INTEGER NOT NULL DEFAULT 1,
    is_visible_to_learner BOOLEAN NOT NULL DEFAULT true,

    -- Component behavior
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    can_be_waived BOOLEAN NOT NULL DEFAULT false,
    waiver_requires_approval BOOLEAN NOT NULL DEFAULT true,

    -- Sub-component handling
    has_sub_components BOOLEAN NOT NULL DEFAULT false,
    calculation_method VARCHAR(20) DEFAULT 'sum'
        CHECK (calculation_method IN ('sum', 'average', 'best_of', 'weighted_average')),
    best_of_count INTEGER,

    -- Assessment source
    requires_scheduled_exam BOOLEAN NOT NULL DEFAULT false,
    allows_continuous_assessment BOOLEAN NOT NULL DEFAULT true,

    -- Active status
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE (pattern_id, component_code)
);

COMMENT ON TABLE public.internal_assessment_components IS
'Individual components of internal assessment pattern - uses weightage percentage, NOT max marks';

COMMENT ON COLUMN public.internal_assessment_components.weightage_percentage IS
'Percentage of total internal marks this component contributes (0-100)';

COMMENT ON COLUMN public.internal_assessment_components.best_of_count IS
'If calculation_method is best_of, how many sub-components to consider';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_internal_components_pattern
    ON public.internal_assessment_components(pattern_id);
CREATE INDEX IF NOT EXISTS idx_internal_components_order
    ON public.internal_assessment_components(pattern_id, display_order);

-- =====================================================
-- TABLE: internal_assessment_sub_components
-- Sub-divisions within a component
-- NOTE: Only sub_weightage_percentage, NO max_mark or min_mark
-- =====================================================

CREATE TABLE IF NOT EXISTS public.internal_assessment_sub_components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    component_id UUID NOT NULL REFERENCES public.internal_assessment_components(id) ON DELETE CASCADE,

    -- Sub-component identification
    sub_component_code VARCHAR(50) NOT NULL,
    sub_component_name VARCHAR(255) NOT NULL,
    sub_component_description TEXT,

    -- Weightage within parent component
    sub_weightage_percentage NUMERIC(5, 2) NOT NULL CHECK (sub_weightage_percentage >= 0 AND sub_weightage_percentage <= 100),

    -- For best-of calculation
    instance_number INTEGER NOT NULL DEFAULT 1,

    -- Display and ordering
    display_order INTEGER NOT NULL DEFAULT 1,

    -- Assessment scheduling
    scheduled_period INTEGER, -- Which period/month

    -- Active status
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE (component_id, sub_component_code)
);

COMMENT ON TABLE public.internal_assessment_sub_components IS
'Sub-divisions of assessment components (e.g., Test 1, Test 2, Test 3)';

COMMENT ON COLUMN public.internal_assessment_sub_components.sub_weightage_percentage IS
'Percentage within the parent component (0-100)';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_internal_sub_components_parent
    ON public.internal_assessment_sub_components(component_id);

-- =====================================================
-- TABLE: internal_assessment_eligibility_rules
-- Rules for eligibility to appear in external exam
-- =====================================================

CREATE TABLE IF NOT EXISTS public.internal_assessment_eligibility_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_id UUID NOT NULL REFERENCES public.internal_assessment_patterns(id) ON DELETE CASCADE,

    -- Rule identification
    rule_code VARCHAR(50) NOT NULL,
    rule_name VARCHAR(255) NOT NULL,
    rule_description TEXT,

    -- Eligibility criteria (percentage-based)
    minimum_overall_percentage NUMERIC(5, 2) CHECK (minimum_overall_percentage >= 0 AND minimum_overall_percentage <= 100),
    minimum_attendance_percentage NUMERIC(5, 2) CHECK (minimum_attendance_percentage >= 0 AND minimum_attendance_percentage <= 100),

    -- Component-wise requirements
    mandatory_components_completion BOOLEAN NOT NULL DEFAULT true,
    minimum_components_completion_percentage NUMERIC(5, 2),

    -- Grace provisions
    condonation_allowed BOOLEAN NOT NULL DEFAULT false,
    condonation_percentage_limit NUMERIC(5, 2),

    -- Rule priority
    priority_order INTEGER NOT NULL DEFAULT 1,

    -- Active status
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE (pattern_id, rule_code)
);

COMMENT ON TABLE public.internal_assessment_eligibility_rules IS
'Rules for determining learner eligibility for external examination';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eligibility_rules_pattern
    ON public.internal_assessment_eligibility_rules(pattern_id);

-- =====================================================
-- TABLE: internal_assessment_passing_rules
-- Rules for determining pass/needs support status
-- =====================================================

CREATE TABLE IF NOT EXISTS public.internal_assessment_passing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_id UUID NOT NULL REFERENCES public.internal_assessment_patterns(id) ON DELETE CASCADE,

    -- Rule identification
    rule_code VARCHAR(50) NOT NULL,
    rule_name VARCHAR(255) NOT NULL,
    rule_description TEXT,

    -- Overall passing criteria (percentage-based)
    minimum_pass_percentage NUMERIC(5, 2) NOT NULL CHECK (minimum_pass_percentage >= 0 AND minimum_pass_percentage <= 100),

    -- Component-wise minimum
    component_wise_minimum_enabled BOOLEAN NOT NULL DEFAULT false,
    component_wise_minimum_percentage NUMERIC(5, 2),

    -- Grace mark provision
    grace_mark_enabled BOOLEAN NOT NULL DEFAULT false,
    grace_mark_percentage_limit NUMERIC(5, 2),
    grace_mark_conditions JSONB,

    -- Rounding rules
    apply_rounding_before_pass_check BOOLEAN NOT NULL DEFAULT true,

    -- Rule priority
    priority_order INTEGER NOT NULL DEFAULT 1,

    -- Active status
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE (pattern_id, rule_code)
);

COMMENT ON TABLE public.internal_assessment_passing_rules IS
'Rules for determining if learner has passed or needs support in internal assessment';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_passing_rules_pattern
    ON public.internal_assessment_passing_rules(pattern_id);

-- =====================================================
-- TABLE: pattern_course_associations
-- Links specific courses to override default patterns
-- =====================================================

CREATE TABLE IF NOT EXISTS public.pattern_course_associations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_id UUID NOT NULL REFERENCES public.internal_assessment_patterns(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    course_code VARCHAR(50) NOT NULL,

    -- Override settings
    effective_from_date DATE NOT NULL,
    effective_to_date DATE,

    -- Metadata
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE (course_id, effective_from_date)
);

COMMENT ON TABLE public.pattern_course_associations IS
'Course-specific pattern assignments overriding default patterns';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pattern_course_pattern
    ON public.pattern_course_associations(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_course_course
    ON public.pattern_course_associations(course_id);
CREATE INDEX IF NOT EXISTS idx_pattern_course_dates
    ON public.pattern_course_associations(effective_from_date, effective_to_date);

-- =====================================================
-- TABLE: pattern_program_associations
-- Links patterns to specific programs
-- =====================================================

CREATE TABLE IF NOT EXISTS public.pattern_program_associations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_id UUID NOT NULL REFERENCES public.internal_assessment_patterns(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    program_code VARCHAR(50) NOT NULL,

    -- Override settings
    effective_from_date DATE NOT NULL,
    effective_to_date DATE,

    -- Metadata
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE (program_id, effective_from_date)
);

COMMENT ON TABLE public.pattern_program_associations IS
'Program-specific pattern assignments';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pattern_program_pattern
    ON public.pattern_program_associations(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_program_program
    ON public.pattern_program_associations(program_id);

-- =====================================================
-- TRIGGER: Update timestamp
-- =====================================================

CREATE OR REPLACE FUNCTION update_internal_pattern_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables
CREATE TRIGGER trg_internal_patterns_updated_at
    BEFORE UPDATE ON public.internal_assessment_patterns
    FOR EACH ROW EXECUTE FUNCTION update_internal_pattern_timestamp();

CREATE TRIGGER trg_internal_components_updated_at
    BEFORE UPDATE ON public.internal_assessment_components
    FOR EACH ROW EXECUTE FUNCTION update_internal_pattern_timestamp();

CREATE TRIGGER trg_internal_sub_components_updated_at
    BEFORE UPDATE ON public.internal_assessment_sub_components
    FOR EACH ROW EXECUTE FUNCTION update_internal_pattern_timestamp();

CREATE TRIGGER trg_eligibility_rules_updated_at
    BEFORE UPDATE ON public.internal_assessment_eligibility_rules
    FOR EACH ROW EXECUTE FUNCTION update_internal_pattern_timestamp();

CREATE TRIGGER trg_passing_rules_updated_at
    BEFORE UPDATE ON public.internal_assessment_passing_rules
    FOR EACH ROW EXECUTE FUNCTION update_internal_pattern_timestamp();

CREATE TRIGGER trg_pattern_course_updated_at
    BEFORE UPDATE ON public.pattern_course_associations
    FOR EACH ROW EXECUTE FUNCTION update_internal_pattern_timestamp();

CREATE TRIGGER trg_pattern_program_updated_at
    BEFORE UPDATE ON public.pattern_program_associations
    FOR EACH ROW EXECUTE FUNCTION update_internal_pattern_timestamp();

-- =====================================================
-- FUNCTION: Validate component weightages sum to 100%
-- =====================================================

CREATE OR REPLACE FUNCTION validate_component_weightages()
RETURNS TRIGGER AS $$
DECLARE
    total_weightage NUMERIC(5, 2);
BEGIN
    -- Calculate total weightage for the pattern
    SELECT COALESCE(SUM(weightage_percentage), 0)
    INTO total_weightage
    FROM public.internal_assessment_components
    WHERE pattern_id = NEW.pattern_id AND is_active = true;

    -- Check if exceeds 100%
    IF total_weightage > 100 THEN
        RAISE EXCEPTION 'Total component weightages (%) exceed 100%% for this pattern', total_weightage;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_component_weightages
    AFTER INSERT OR UPDATE ON public.internal_assessment_components
    FOR EACH ROW EXECUTE FUNCTION validate_component_weightages();

-- =====================================================
-- FUNCTION: Validate sub-component weightages sum to 100%
-- =====================================================

CREATE OR REPLACE FUNCTION validate_sub_component_weightages()
RETURNS TRIGGER AS $$
DECLARE
    total_weightage NUMERIC(5, 2);
BEGIN
    -- Calculate total sub-weightage for the component
    SELECT COALESCE(SUM(sub_weightage_percentage), 0)
    INTO total_weightage
    FROM public.internal_assessment_sub_components
    WHERE component_id = NEW.component_id AND is_active = true;

    -- Check if exceeds 100%
    IF total_weightage > 100 THEN
        RAISE EXCEPTION 'Total sub-component weightages (%) exceed 100%% for this component', total_weightage;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_sub_component_weightages
    AFTER INSERT OR UPDATE ON public.internal_assessment_sub_components
    FOR EACH ROW EXECUTE FUNCTION validate_sub_component_weightages();

-- =====================================================
-- FUNCTION: Get applicable pattern for a course
-- =====================================================

CREATE OR REPLACE FUNCTION get_applicable_pattern(
    p_course_id UUID,
    p_program_id UUID,
    p_assessment_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID AS $$
DECLARE
    v_pattern_id UUID;
    v_course_type VARCHAR(20);
    v_program_type VARCHAR(20);
    v_institution_id UUID;
BEGIN
    -- Get course details
    SELECT c.course_type, c.institutions_id
    INTO v_course_type, v_institution_id
    FROM public.courses c
    WHERE c.id = p_course_id;

    -- Get program type (UG/PG)
    SELECT LOWER(d.degree_level)
    INTO v_program_type
    FROM public.programs p
    JOIN public.degrees d ON p.degree_id = d.id
    WHERE p.id = p_program_id;

    -- 1. First check for course-specific pattern
    SELECT pca.pattern_id
    INTO v_pattern_id
    FROM public.pattern_course_associations pca
    JOIN public.internal_assessment_patterns iap ON pca.pattern_id = iap.id
    WHERE pca.course_id = p_course_id
      AND pca.is_active = true
      AND iap.is_active = true
      AND iap.status = 'active'
      AND pca.effective_from_date <= p_assessment_date
      AND (pca.effective_to_date IS NULL OR pca.effective_to_date >= p_assessment_date)
    LIMIT 1;

    IF v_pattern_id IS NOT NULL THEN
        RETURN v_pattern_id;
    END IF;

    -- 2. Check for program-specific pattern
    SELECT ppa.pattern_id
    INTO v_pattern_id
    FROM public.pattern_program_associations ppa
    JOIN public.internal_assessment_patterns iap ON ppa.pattern_id = iap.id
    WHERE ppa.program_id = p_program_id
      AND ppa.is_active = true
      AND iap.is_active = true
      AND iap.status = 'active'
      AND ppa.effective_from_date <= p_assessment_date
      AND (ppa.effective_to_date IS NULL OR ppa.effective_to_date >= p_assessment_date)
    LIMIT 1;

    IF v_pattern_id IS NOT NULL THEN
        RETURN v_pattern_id;
    END IF;

    -- 3. Fall back to default pattern based on applicability
    SELECT iap.id
    INTO v_pattern_id
    FROM public.internal_assessment_patterns iap
    WHERE iap.institutions_id = v_institution_id
      AND iap.is_active = true
      AND iap.status = 'active'
      AND iap.is_default = true
      AND (iap.course_type_applicability = v_course_type OR iap.course_type_applicability = 'all')
      AND (iap.program_type_applicability = v_program_type OR iap.program_type_applicability = 'all')
      AND iap.wef_date <= p_assessment_date
    ORDER BY iap.wef_date DESC
    LIMIT 1;

    RETURN v_pattern_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =====================================================
-- FUNCTION: Calculate internal marks from pattern
-- =====================================================

CREATE OR REPLACE FUNCTION calculate_internal_marks(
    p_course_id UUID,
    p_learner_id UUID,
    p_pattern_id UUID,
    p_component_marks JSONB -- Array of {component_id, percentage_achieved}
)
RETURNS JSONB AS $$
DECLARE
    v_internal_max_mark NUMERIC;
    v_total_percentage NUMERIC := 0;
    v_calculated_marks NUMERIC;
    v_rounding_method VARCHAR(10);
    v_decimal_precision INTEGER;
    v_component RECORD;
    v_result JSONB;
BEGIN
    -- Get course internal max mark
    SELECT internal_max_mark
    INTO v_internal_max_mark
    FROM public.courses
    WHERE id = p_course_id;

    -- Get pattern settings
    SELECT rounding_method, decimal_precision
    INTO v_rounding_method, v_decimal_precision
    FROM public.internal_assessment_patterns
    WHERE id = p_pattern_id;

    -- Calculate weighted total percentage
    FOR v_component IN
        SELECT
            iac.id,
            iac.weightage_percentage,
            (p_component_marks -> iac.id::text ->> 'percentage_achieved')::NUMERIC as achieved
        FROM public.internal_assessment_components iac
        WHERE iac.pattern_id = p_pattern_id AND iac.is_active = true
    LOOP
        IF v_component.achieved IS NOT NULL THEN
            v_total_percentage := v_total_percentage +
                (v_component.achieved * v_component.weightage_percentage / 100);
        END IF;
    END LOOP;

    -- Calculate marks from percentage
    v_calculated_marks := (v_total_percentage * v_internal_max_mark) / 100;

    -- Apply rounding
    CASE v_rounding_method
        WHEN 'floor' THEN v_calculated_marks := FLOOR(v_calculated_marks);
        WHEN 'ceil' THEN v_calculated_marks := CEIL(v_calculated_marks);
        WHEN 'round' THEN v_calculated_marks := ROUND(v_calculated_marks, v_decimal_precision);
        ELSE NULL; -- 'none' - keep as is
    END CASE;

    -- Build result
    v_result := jsonb_build_object(
        'course_id', p_course_id,
        'learner_id', p_learner_id,
        'pattern_id', p_pattern_id,
        'internal_max_mark', v_internal_max_mark,
        'total_percentage', ROUND(v_total_percentage, 2),
        'calculated_marks', v_calculated_marks,
        'calculation_timestamp', CURRENT_TIMESTAMP
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- =====================================================
-- Enable RLS
-- =====================================================

ALTER TABLE public.internal_assessment_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_assessment_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_assessment_sub_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_assessment_eligibility_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_assessment_passing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pattern_course_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pattern_program_associations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES (Using service role for now)
-- =====================================================

-- Patterns - Allow authenticated users to read
CREATE POLICY "patterns_select_policy" ON public.internal_assessment_patterns
    FOR SELECT TO authenticated
    USING (true);

-- Patterns - Allow authenticated users with appropriate role to insert/update/delete
CREATE POLICY "patterns_insert_policy" ON public.internal_assessment_patterns
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "patterns_update_policy" ON public.internal_assessment_patterns
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "patterns_delete_policy" ON public.internal_assessment_patterns
    FOR DELETE TO authenticated
    USING (true);

-- Apply same policies to child tables
CREATE POLICY "components_select_policy" ON public.internal_assessment_components
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "components_insert_policy" ON public.internal_assessment_components
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "components_update_policy" ON public.internal_assessment_components
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "components_delete_policy" ON public.internal_assessment_components
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "sub_components_select_policy" ON public.internal_assessment_sub_components
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "sub_components_insert_policy" ON public.internal_assessment_sub_components
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sub_components_update_policy" ON public.internal_assessment_sub_components
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sub_components_delete_policy" ON public.internal_assessment_sub_components
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "eligibility_rules_select_policy" ON public.internal_assessment_eligibility_rules
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "eligibility_rules_insert_policy" ON public.internal_assessment_eligibility_rules
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eligibility_rules_update_policy" ON public.internal_assessment_eligibility_rules
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eligibility_rules_delete_policy" ON public.internal_assessment_eligibility_rules
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "passing_rules_select_policy" ON public.internal_assessment_passing_rules
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "passing_rules_insert_policy" ON public.internal_assessment_passing_rules
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "passing_rules_update_policy" ON public.internal_assessment_passing_rules
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "passing_rules_delete_policy" ON public.internal_assessment_passing_rules
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "pattern_course_select_policy" ON public.pattern_course_associations
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "pattern_course_insert_policy" ON public.pattern_course_associations
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pattern_course_update_policy" ON public.pattern_course_associations
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pattern_course_delete_policy" ON public.pattern_course_associations
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "pattern_program_select_policy" ON public.pattern_program_associations
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "pattern_program_insert_policy" ON public.pattern_program_associations
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pattern_program_update_policy" ON public.pattern_program_associations
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pattern_program_delete_policy" ON public.pattern_program_associations
    FOR DELETE TO authenticated USING (true);

-- =====================================================
-- END OF MIGRATION
-- =====================================================
