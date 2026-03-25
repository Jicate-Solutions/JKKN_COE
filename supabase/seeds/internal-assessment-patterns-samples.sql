-- ============================================================================
-- SAMPLE INTERNAL ASSESSMENT PATTERNS FOR JKKN COE
-- ============================================================================
-- This file contains sample configurations for Theory and Practical courses
-- demonstrating the percentage-based weightage system.
--
-- KEY PRINCIPLE: No max_mark at component level!
-- - Components have weightage_percentage (0-100%)
-- - Actual marks calculated: (weightage_percentage/100) × courses.internal_max_mark
--
-- EXAMPLE CALCULATIONS:
-- Theory Course (internal_max_mark = 25):
--   - Test Component (60% weightage) → 0.60 × 25 = 15 marks
--   - Assignment Component (25% weightage) → 0.25 × 25 = 6.25 marks
--   - Attendance Component (15% weightage) → 0.15 × 25 = 3.75 marks
--   - Total: 25 marks ✓
--
-- Practical Course (internal_max_mark = 40):
--   - Lab Record Component (40% weightage) → 0.40 × 40 = 16 marks
--   - Practical Test Component (35% weightage) → 0.35 × 40 = 14 marks
--   - Viva Component (25% weightage) → 0.25 × 40 = 10 marks
--   - Total: 40 marks ✓
-- ============================================================================

-- Note: Replace 'YOUR_INSTITUTION_ID' with actual institution UUID
-- Run: SELECT id FROM institutions WHERE institution_code = 'JKKN';

DO $$
DECLARE
    v_institution_id UUID;
    v_theory_pattern_id UUID;
    v_practical_pattern_id UUID;
    v_project_pattern_id UUID;
    v_theory_test_component_id UUID;
    v_theory_assignment_component_id UUID;
    v_practical_record_component_id UUID;
    v_practical_test_component_id UUID;
BEGIN
    -- Get institution ID (adjust institution_code as needed)
    SELECT id INTO v_institution_id FROM institutions WHERE institution_code = 'JKKN' LIMIT 1;

    IF v_institution_id IS NULL THEN
        RAISE NOTICE 'Institution not found. Using placeholder. Please update with actual institution ID.';
        v_institution_id := gen_random_uuid();
    END IF;

    -- ========================================================================
    -- PATTERN 1: THEORY COURSE PATTERN (UG - Arts & Science)
    -- For courses with internal_max_mark = 25
    -- ========================================================================

    INSERT INTO internal_assessment_patterns (
        id,
        institutions_id,
        institution_code,
        pattern_code,
        pattern_name,
        description,
        course_type_applicability,
        program_type_applicability,
        program_category_applicability,
        assessment_frequency,
        assessment_periods_per_semester,
        wef_date,
        version_number,
        rounding_method,
        decimal_precision,
        status,
        is_default,
        is_active
    ) VALUES (
        gen_random_uuid(),
        v_institution_id,
        'JKKN',
        'IAP-TH-UG-2024',
        'Theory Internal Assessment - UG',
        'Standard internal assessment pattern for UG theory courses. Total weightage distributed across periodic tests, assignments, and attendance.',
        'theory',
        'ug',
        'all',
        'periodic',
        3, -- 3 assessment periods per semester
        '2024-06-01',
        1,
        'round',
        2,
        'active',
        true,
        true
    ) RETURNING id INTO v_theory_pattern_id;

    -- Theory Pattern: Component 1 - Periodic Tests (60% weightage)
    -- For 25-mark course: 60% × 25 = 15 marks
    INSERT INTO internal_assessment_components (
        id,
        pattern_id,
        component_code,
        component_name,
        component_description,
        weightage_percentage,
        display_order,
        is_visible_to_learner,
        is_mandatory,
        can_be_waived,
        waiver_requires_approval,
        has_sub_components,
        calculation_method,
        best_of_count,
        requires_scheduled_exam,
        allows_continuous_assessment,
        is_active
    ) VALUES (
        gen_random_uuid(),
        v_theory_pattern_id,
        'PT',
        'Periodic Tests',
        'Three periodic tests conducted during the semester. Best 2 out of 3 considered for final calculation.',
        60.00, -- 60% of total internal marks
        1,
        true,
        true,
        false,
        true,
        true, -- Has sub-components (Test 1, 2, 3)
        'best_of',
        2, -- Best 2 out of 3
        true, -- Requires scheduled exam
        false,
        true
    ) RETURNING id INTO v_theory_test_component_id;

    -- Theory Pattern: Sub-components for Periodic Tests
    INSERT INTO internal_assessment_sub_components (pattern_id, component_id, sub_component_code, sub_component_name, sub_component_description, sub_weightage_percentage, instance_number, display_order, scheduled_period, is_active) VALUES
    (v_theory_pattern_id, v_theory_test_component_id, 'PT1', 'Periodic Test 1', 'First periodic test - covers Units 1-2', 33.33, 1, 1, 1, true),
    (v_theory_pattern_id, v_theory_test_component_id, 'PT2', 'Periodic Test 2', 'Second periodic test - covers Units 3-4', 33.33, 2, 2, 2, true),
    (v_theory_pattern_id, v_theory_test_component_id, 'PT3', 'Periodic Test 3', 'Third periodic test - covers Units 5 & revision', 33.34, 3, 3, 3, true);

    -- Theory Pattern: Component 2 - Assignments (25% weightage)
    -- For 25-mark course: 25% × 25 = 6.25 marks
    INSERT INTO internal_assessment_components (
        id,
        pattern_id,
        component_code,
        component_name,
        component_description,
        weightage_percentage,
        display_order,
        is_visible_to_learner,
        is_mandatory,
        can_be_waived,
        waiver_requires_approval,
        has_sub_components,
        calculation_method,
        requires_scheduled_exam,
        allows_continuous_assessment,
        is_active
    ) VALUES (
        gen_random_uuid(),
        v_theory_pattern_id,
        'ASGN',
        'Assignments',
        'Two assignments submitted during the semester. Average of both considered.',
        25.00, -- 25% of total internal marks
        2,
        true,
        true,
        true, -- Can be waived
        true, -- Waiver needs approval
        true, -- Has sub-components
        'average',
        false,
        true, -- Continuous assessment
        true
    ) RETURNING id INTO v_theory_assignment_component_id;

    -- Theory Pattern: Sub-components for Assignments
    INSERT INTO internal_assessment_sub_components (pattern_id, component_id, sub_component_code, sub_component_name, sub_component_description, sub_weightage_percentage, instance_number, display_order, scheduled_period, is_active) VALUES
    (v_theory_pattern_id, v_theory_assignment_component_id, 'ASGN1', 'Assignment 1', 'First assignment - analytical/conceptual', 50.00, 1, 1, 1, true),
    (v_theory_pattern_id, v_theory_assignment_component_id, 'ASGN2', 'Assignment 2', 'Second assignment - application-based', 50.00, 2, 2, 2, true);

    -- Theory Pattern: Component 3 - Attendance (15% weightage)
    -- For 25-mark course: 15% × 25 = 3.75 marks
    INSERT INTO internal_assessment_components (
        pattern_id,
        component_code,
        component_name,
        component_description,
        weightage_percentage,
        display_order,
        is_visible_to_learner,
        is_mandatory,
        can_be_waived,
        waiver_requires_approval,
        has_sub_components,
        requires_scheduled_exam,
        allows_continuous_assessment,
        is_active
    ) VALUES (
        v_theory_pattern_id,
        'ATTN',
        'Attendance & Participation',
        'Based on class attendance percentage. Scaled proportionally.',
        15.00, -- 15% of total internal marks
        3,
        true,
        true,
        false, -- Cannot be waived
        false,
        false, -- No sub-components
        false,
        true, -- Continuous tracking
        true
    );

    -- ========================================================================
    -- PATTERN 2: PRACTICAL COURSE PATTERN (UG - All Categories)
    -- For courses with internal_max_mark = 40
    -- ========================================================================

    INSERT INTO internal_assessment_patterns (
        id,
        institutions_id,
        institution_code,
        pattern_code,
        pattern_name,
        description,
        course_type_applicability,
        program_type_applicability,
        program_category_applicability,
        assessment_frequency,
        assessment_periods_per_semester,
        wef_date,
        version_number,
        rounding_method,
        decimal_precision,
        status,
        is_default,
        is_active
    ) VALUES (
        gen_random_uuid(),
        v_institution_id,
        'JKKN',
        'IAP-PR-UG-2024',
        'Practical Internal Assessment - UG',
        'Standard internal assessment pattern for UG practical courses. Includes lab records, practical tests, and viva voce.',
        'practical',
        'ug',
        'all',
        'semester',
        1, -- Single assessment at semester end
        '2024-06-01',
        1,
        'round',
        2,
        'active',
        true,
        true
    ) RETURNING id INTO v_practical_pattern_id;

    -- Practical Pattern: Component 1 - Lab Record (40% weightage)
    -- For 40-mark course: 40% × 40 = 16 marks
    INSERT INTO internal_assessment_components (
        id,
        pattern_id,
        component_code,
        component_name,
        component_description,
        weightage_percentage,
        display_order,
        is_visible_to_learner,
        is_mandatory,
        can_be_waived,
        waiver_requires_approval,
        has_sub_components,
        requires_scheduled_exam,
        allows_continuous_assessment,
        is_active
    ) VALUES (
        gen_random_uuid(),
        v_practical_pattern_id,
        'REC',
        'Lab Record / Observation',
        'Complete lab record with all experiments documented. Evaluated based on neatness, accuracy, and completeness.',
        40.00, -- 40% of total internal marks
        1,
        true,
        true,
        false,
        true,
        false, -- No sub-components
        false,
        true, -- Continuous assessment
        true
    ) RETURNING id INTO v_practical_record_component_id;

    -- Practical Pattern: Component 2 - Practical Tests (35% weightage)
    -- For 40-mark course: 35% × 40 = 14 marks
    INSERT INTO internal_assessment_components (
        id,
        pattern_id,
        component_code,
        component_name,
        component_description,
        weightage_percentage,
        display_order,
        is_visible_to_learner,
        is_mandatory,
        can_be_waived,
        waiver_requires_approval,
        has_sub_components,
        calculation_method,
        best_of_count,
        requires_scheduled_exam,
        allows_continuous_assessment,
        is_active
    ) VALUES (
        gen_random_uuid(),
        v_practical_pattern_id,
        'PTEST',
        'Practical Tests',
        'Two practical tests during the semester. Best of 2 considered.',
        35.00, -- 35% of total internal marks
        2,
        true,
        true,
        false,
        true,
        true, -- Has sub-components
        'best_of',
        1, -- Best 1 out of 2
        true, -- Requires scheduling
        false,
        true
    ) RETURNING id INTO v_practical_test_component_id;

    -- Practical Pattern: Sub-components for Practical Tests
    INSERT INTO internal_assessment_sub_components (pattern_id, component_id, sub_component_code, sub_component_name, sub_component_description, sub_weightage_percentage, instance_number, display_order, scheduled_period, is_active) VALUES
    (v_practical_pattern_id, v_practical_test_component_id, 'PTEST1', 'Practical Test 1', 'Mid-semester practical examination', 50.00, 1, 1, 1, true),
    (v_practical_pattern_id, v_practical_test_component_id, 'PTEST2', 'Practical Test 2', 'End-semester practical examination', 50.00, 2, 2, 2, true);

    -- Practical Pattern: Component 3 - Viva Voce (25% weightage)
    -- For 40-mark course: 25% × 40 = 10 marks
    INSERT INTO internal_assessment_components (
        pattern_id,
        component_code,
        component_name,
        component_description,
        weightage_percentage,
        display_order,
        is_visible_to_learner,
        is_mandatory,
        can_be_waived,
        waiver_requires_approval,
        has_sub_components,
        requires_scheduled_exam,
        allows_continuous_assessment,
        is_active
    ) VALUES (
        v_practical_pattern_id,
        'VIVA',
        'Viva Voce',
        'Oral examination to assess practical knowledge and understanding of experiments.',
        25.00, -- 25% of total internal marks
        3,
        true,
        true,
        true, -- Can be waived for special cases
        true,
        false,
        true, -- Needs scheduling
        false,
        true
    );

    -- ========================================================================
    -- PATTERN 3: PROJECT/DISSERTATION PATTERN (UG - Final Year)
    -- For project courses with internal_max_mark = 50
    -- ========================================================================

    INSERT INTO internal_assessment_patterns (
        id,
        institutions_id,
        institution_code,
        pattern_code,
        pattern_name,
        description,
        course_type_applicability,
        program_type_applicability,
        program_category_applicability,
        assessment_frequency,
        assessment_periods_per_semester,
        wef_date,
        version_number,
        rounding_method,
        decimal_precision,
        status,
        is_default,
        is_active
    ) VALUES (
        gen_random_uuid(),
        v_institution_id,
        'JKKN',
        'IAP-PJ-UG-2024',
        'Project Internal Assessment - UG',
        'Assessment pattern for final year projects and dissertations. Includes reviews, documentation, and presentation.',
        'project',
        'ug',
        'all',
        'periodic',
        3, -- 3 review stages
        '2024-06-01',
        1,
        'round',
        2,
        'active',
        true,
        true
    ) RETURNING id INTO v_project_pattern_id;

    -- Project Pattern: Component 1 - Review Presentations (40% weightage)
    INSERT INTO internal_assessment_components (
        pattern_id,
        component_code,
        component_name,
        component_description,
        weightage_percentage,
        display_order,
        is_visible_to_learner,
        is_mandatory,
        can_be_waived,
        waiver_requires_approval,
        has_sub_components,
        calculation_method,
        requires_scheduled_exam,
        allows_continuous_assessment,
        is_active
    ) VALUES (
        v_project_pattern_id,
        'REV',
        'Review Presentations',
        'Three review presentations: Problem Definition, Progress Review, and Pre-Final Review.',
        40.00,
        1,
        true,
        true,
        false,
        true,
        true, -- Has 3 reviews
        'weighted_average',
        true, -- Scheduled reviews
        false,
        true
    );

    -- Project Pattern: Component 2 - Documentation (35% weightage)
    INSERT INTO internal_assessment_components (
        pattern_id,
        component_code,
        component_name,
        component_description,
        weightage_percentage,
        display_order,
        is_visible_to_learner,
        is_mandatory,
        can_be_waived,
        waiver_requires_approval,
        has_sub_components,
        requires_scheduled_exam,
        allows_continuous_assessment,
        is_active
    ) VALUES (
        v_project_pattern_id,
        'DOC',
        'Project Documentation',
        'Complete project report following prescribed format. Includes literature review, methodology, implementation, and results.',
        35.00,
        2,
        true,
        true,
        false,
        true,
        false,
        false,
        true, -- Continuous updates
        true
    );

    -- Project Pattern: Component 3 - Guide Evaluation (25% weightage)
    INSERT INTO internal_assessment_components (
        pattern_id,
        component_code,
        component_name,
        component_description,
        weightage_percentage,
        display_order,
        is_visible_to_learner,
        is_mandatory,
        can_be_waived,
        waiver_requires_approval,
        has_sub_components,
        requires_scheduled_exam,
        allows_continuous_assessment,
        is_active
    ) VALUES (
        v_project_pattern_id,
        'GUIDE',
        'Guide Evaluation',
        'Continuous evaluation by project guide based on regularity, initiative, and quality of work.',
        25.00,
        3,
        true,
        true,
        false,
        false,
        false,
        false,
        true,
        true
    );

    -- ========================================================================
    -- ELIGIBILITY RULES
    -- ========================================================================

    -- Theory Pattern: Eligibility Rule
    INSERT INTO internal_assessment_eligibility_rules (
        pattern_id,
        rule_code,
        rule_name,
        rule_description,
        minimum_overall_percentage,
        minimum_attendance_percentage,
        mandatory_components_completion,
        minimum_components_completion_percentage,
        condonation_allowed,
        condonation_percentage_limit,
        priority_order,
        is_active
    ) VALUES (
        v_theory_pattern_id,
        'ELIG-TH-01',
        'Theory Eligibility - Standard',
        'Learner must have 75% attendance and complete all mandatory assessments',
        NULL, -- No minimum internal percentage for eligibility
        75.00, -- 75% attendance required
        true, -- All mandatory components must be attempted
        NULL,
        true, -- Condonation allowed
        5.00, -- Up to 5% attendance can be condoned
        1,
        true
    );

    -- Practical Pattern: Eligibility Rule
    INSERT INTO internal_assessment_eligibility_rules (
        pattern_id,
        rule_code,
        rule_name,
        rule_description,
        minimum_overall_percentage,
        minimum_attendance_percentage,
        mandatory_components_completion,
        minimum_components_completion_percentage,
        condonation_allowed,
        condonation_percentage_limit,
        priority_order,
        is_active
    ) VALUES (
        v_practical_pattern_id,
        'ELIG-PR-01',
        'Practical Eligibility - Standard',
        'Learner must have 80% lab attendance and complete lab record',
        NULL,
        80.00, -- 80% attendance for practical
        true,
        NULL,
        true,
        3.00, -- Only 3% condonation for practical
        1,
        true
    );

    -- ========================================================================
    -- PASSING RULES
    -- ========================================================================

    -- Theory Pattern: Passing Rule
    INSERT INTO internal_assessment_passing_rules (
        pattern_id,
        rule_code,
        rule_name,
        rule_description,
        minimum_pass_percentage,
        component_wise_minimum_enabled,
        component_wise_minimum_percentage,
        grace_mark_enabled,
        grace_mark_percentage_limit,
        grace_mark_conditions,
        apply_rounding_before_pass_check,
        priority_order,
        is_active
    ) VALUES (
        v_theory_pattern_id,
        'PASS-TH-01',
        'Theory Passing - Standard',
        'Learner must secure minimum 40% overall in internal assessment',
        40.00, -- Minimum 40% to pass
        false, -- No component-wise minimum
        NULL,
        true, -- Grace marks allowed
        5.00, -- Up to 5% grace
        '{"conditions": ["final_semester", "single_subject_failure", "attendance_above_90"]}',
        true, -- Round before checking
        1,
        true
    );

    -- Practical Pattern: Passing Rule
    INSERT INTO internal_assessment_passing_rules (
        pattern_id,
        rule_code,
        rule_name,
        rule_description,
        minimum_pass_percentage,
        component_wise_minimum_enabled,
        component_wise_minimum_percentage,
        grace_mark_enabled,
        grace_mark_percentage_limit,
        apply_rounding_before_pass_check,
        priority_order,
        is_active
    ) VALUES (
        v_practical_pattern_id,
        'PASS-PR-01',
        'Practical Passing - Standard',
        'Learner must secure 50% overall and complete lab record',
        50.00, -- Minimum 50% for practical
        true, -- Component-wise minimum enabled
        40.00, -- At least 40% in each mandatory component
        true,
        3.00, -- Only 3% grace for practical
        true,
        1,
        true
    );

    RAISE NOTICE 'Sample patterns created successfully!';
    RAISE NOTICE 'Theory Pattern ID: %', v_theory_pattern_id;
    RAISE NOTICE 'Practical Pattern ID: %', v_practical_pattern_id;
    RAISE NOTICE 'Project Pattern ID: %', v_project_pattern_id;

END $$;

-- ============================================================================
-- CALCULATION EXAMPLES
-- ============================================================================
--
-- THEORY COURSE (internal_max_mark = 25):
-- ----------------------------------------
-- Component          | Weightage | Marks
-- -------------------|-----------|-------
-- Periodic Tests     |   60%     | 15.00
-- Assignments        |   25%     |  6.25
-- Attendance         |   15%     |  3.75
-- -------------------|-----------|-------
-- TOTAL              |  100%     | 25.00
--
-- Example Learner Calculation:
-- - Periodic Test 1: 18/25 = 72%
-- - Periodic Test 2: 20/25 = 80%
-- - Periodic Test 3: 15/25 = 60%
-- - Best 2 of 3: (72% + 80%) / 2 = 76%
-- - PT Contribution: 76% × 60% = 45.6% weighted
--
-- - Assignment 1: 8/10 = 80%
-- - Assignment 2: 7/10 = 70%
-- - Average: (80% + 70%) / 2 = 75%
-- - Assignment Contribution: 75% × 25% = 18.75% weighted
--
-- - Attendance: 85% class attendance
-- - Attendance Contribution: 85% × 15% = 12.75% weighted
--
-- - Total Percentage: 45.6% + 18.75% + 12.75% = 77.1%
-- - Final Internal Marks: 77.1% × 25 = 19.275 → 19 marks (rounded)
--
--
-- PRACTICAL COURSE (internal_max_mark = 40):
-- ------------------------------------------
-- Component          | Weightage | Marks
-- -------------------|-----------|-------
-- Lab Record         |   40%     | 16.00
-- Practical Tests    |   35%     | 14.00
-- Viva Voce          |   25%     | 10.00
-- -------------------|-----------|-------
-- TOTAL              |  100%     | 40.00
--
-- Example Learner Calculation:
-- - Lab Record: 14/16 = 87.5%
-- - Record Contribution: 87.5% × 40% = 35% weighted
--
-- - Practical Test 1: 12/20 = 60%
-- - Practical Test 2: 17/20 = 85%
-- - Best 1 of 2: 85%
-- - PT Contribution: 85% × 35% = 29.75% weighted
--
-- - Viva: 8/10 = 80%
-- - Viva Contribution: 80% × 25% = 20% weighted
--
-- - Total Percentage: 35% + 29.75% + 20% = 84.75%
-- - Final Internal Marks: 84.75% × 40 = 33.9 → 34 marks (rounded)
--
-- ============================================================================
