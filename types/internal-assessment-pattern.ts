// Internal Assessment Pattern Type Definitions
// Following JKKN terminology: learners, learning facilitators, learning assessments

/**
 * Assessment frequency types
 */
export type AssessmentFrequency = 'monthly' | 'periodic' | 'semester' | 'annual'

/**
 * Course type applicability
 */
export type CourseTypeApplicability = 'theory' | 'practical' | 'project' | 'theory_practical' | 'all'

/**
 * Program type applicability
 */
export type ProgramTypeApplicability = 'ug' | 'pg' | 'diploma' | 'certificate' | 'all'

/**
 * Program category applicability
 */
export type ProgramCategoryApplicability = 'arts' | 'science' | 'skill_based' | 'all'

/**
 * Pattern status lifecycle
 */
export type PatternStatus = 'draft' | 'active' | 'archived'

/**
 * Calculation method for components with multiple sub-components
 */
export type CalculationMethod = 'sum' | 'average' | 'best_of' | 'weighted_average'

/**
 * Rounding method for final marks calculation
 */
export type RoundingMethod = 'floor' | 'ceil' | 'round' | 'none'

/**
 * Main Internal Assessment Pattern
 * Defines the structure for internal mark setting
 */
export interface InternalAssessmentPattern {
	id: string
	institutions_id: string
	institution_code: string
	regulation_id?: string
	regulation_code?: string

	// Pattern identification
	pattern_code: string
	pattern_name: string
	description?: string

	// Applicability scope
	course_type_applicability: CourseTypeApplicability
	program_type_applicability: ProgramTypeApplicability
	program_category_applicability: ProgramCategoryApplicability

	// Assessment configuration
	assessment_frequency: AssessmentFrequency
	assessment_periods_per_semester?: number // e.g., 3 for monthly in a semester

	// W.E.F versioning
	wef_date: string // With Effect From date
	wef_batch_code?: string // Optional: applicable from specific batch
	version_number: number // Auto-incremented version

	// Calculation settings
	rounding_method: RoundingMethod
	decimal_precision: number // 0, 1, or 2

	// Status
	status: PatternStatus
	is_default: boolean // Default pattern for the applicability scope

	// Metadata
	created_by?: string
	approved_by?: string
	approved_at?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

/**
 * Internal Assessment Component
 * Individual components that make up the assessment pattern
 * NOTE: No max_mark or min_mark - only weightage percentage
 */
export interface InternalAssessmentComponent {
	id: string
	pattern_id: string

	// Component identification
	component_code: string
	component_name: string
	component_description?: string

	// Weightage (NOT marks)
	weightage_percentage: number // e.g., 30 for 30% of total internal marks

	// Display and ordering
	display_order: number
	is_visible_to_learner: boolean

	// Component behavior
	is_mandatory: boolean
	can_be_waived: boolean // By learning facilitator with justification
	waiver_requires_approval: boolean

	// Sub-component handling
	has_sub_components: boolean
	calculation_method?: CalculationMethod // How to aggregate sub-components
	best_of_count?: number // If calculation_method is 'best_of', how many to consider

	// Assessment source
	requires_scheduled_exam: boolean // Links to Internal Exam Schedule
	allows_continuous_assessment: boolean // Can be entered anytime

	// Active status
	is_active: boolean
	created_at: string
	updated_at: string
}

/**
 * Internal Assessment Sub-Component
 * Sub-divisions within a component (e.g., Test 1, Test 2, Test 3)
 * NOTE: No max_mark or min_mark - only sub-weightage within parent
 */
export interface InternalAssessmentSubComponent {
	id: string
	component_id: string

	// Sub-component identification
	sub_component_code: string
	sub_component_name: string
	sub_component_description?: string

	// Weightage within parent component
	sub_weightage_percentage: number // e.g., 33.33 for equal distribution among 3 tests

	// For best-of calculation
	instance_number: number // 1, 2, 3 for Test 1, Test 2, Test 3

	// Display and ordering
	display_order: number

	// Assessment scheduling
	scheduled_period?: number // Which period/month this sub-component is scheduled

	// Active status
	is_active: boolean
	created_at: string
	updated_at: string
}

/**
 * Eligibility Rules for External Examination
 * Defines when a learner is eligible to appear in external exam
 */
export interface InternalAssessmentEligibilityRule {
	id: string
	pattern_id: string

	// Rule identification
	rule_code: string
	rule_name: string
	rule_description?: string

	// Eligibility criteria (percentage-based, NOT mark-based)
	minimum_overall_percentage?: number // Minimum % of total internal marks
	minimum_attendance_percentage?: number // Minimum attendance %

	// Component-wise requirements
	mandatory_components_completion: boolean // All mandatory components must be attempted
	minimum_components_completion_percentage?: number // % of components that must be completed

	// Grace provisions
	condonation_allowed: boolean
	condonation_percentage_limit?: number // Max % that can be condoned

	// Rule priority (lower = higher priority)
	priority_order: number

	// Active status
	is_active: boolean
	created_at: string
	updated_at: string
}

/**
 * Passing Rules for Internal Assessment
 * Defines when a learner is considered to have passed/needs support
 */
export interface InternalAssessmentPassingRule {
	id: string
	pattern_id: string

	// Rule identification
	rule_code: string
	rule_name: string
	rule_description?: string

	// Overall passing criteria (percentage-based)
	minimum_pass_percentage: number // Minimum % to pass overall

	// Component-wise minimum (optional)
	component_wise_minimum_enabled: boolean
	component_wise_minimum_percentage?: number // Minimum % in each mandatory component

	// Grace mark provision
	grace_mark_enabled: boolean
	grace_mark_percentage_limit?: number // Max % of grace marks allowed
	grace_mark_conditions?: string // JSON: conditions for applying grace marks

	// Rounding rules
	apply_rounding_before_pass_check: boolean

	// Rule priority
	priority_order: number

	// Active status
	is_active: boolean
	created_at: string
	updated_at: string
}

/**
 * Pattern-Course Association
 * Links specific courses to patterns (for overriding default patterns)
 */
export interface PatternCourseAssociation {
	id: string
	pattern_id: string
	course_id: string
	course_code: string

	// Override settings
	effective_from_date: string
	effective_to_date?: string // null = indefinite

	// Metadata
	created_by?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

/**
 * Pattern-Program Association
 * Links patterns to specific programs
 */
export interface PatternProgramAssociation {
	id: string
	pattern_id: string
	program_id: string
	program_code: string

	// Override settings
	effective_from_date: string
	effective_to_date?: string

	// Metadata
	created_by?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

// ============================================================================
// FORM DATA TYPES
// ============================================================================

export interface InternalAssessmentPatternFormData {
	institution_code: string
	regulation_code: string
	pattern_code: string
	pattern_name: string
	description: string
	course_type_applicability: CourseTypeApplicability
	program_type_applicability: ProgramTypeApplicability
	program_category_applicability: ProgramCategoryApplicability
	assessment_frequency: AssessmentFrequency
	assessment_periods_per_semester: string
	wef_date: string
	wef_batch_code: string
	rounding_method: RoundingMethod
	decimal_precision: string
	is_default: boolean
	is_active: boolean
}

export interface InternalAssessmentComponentFormData {
	pattern_id: string
	component_code: string
	component_name: string
	component_description: string
	weightage_percentage: string
	display_order: string
	is_visible_to_learner: boolean
	is_mandatory: boolean
	can_be_waived: boolean
	waiver_requires_approval: boolean
	has_sub_components: boolean
	calculation_method: CalculationMethod
	best_of_count: string
	requires_scheduled_exam: boolean
	allows_continuous_assessment: boolean
	is_active: boolean
}

export interface InternalAssessmentSubComponentFormData {
	component_id: string
	sub_component_code: string
	sub_component_name: string
	sub_component_description: string
	sub_weightage_percentage: string
	instance_number: string
	display_order: string
	scheduled_period: string
	is_active: boolean
}

// ============================================================================
// IMPORT/EXPORT TYPES
// ============================================================================

export interface PatternImportError {
	row: number
	pattern_code: string
	pattern_name: string
	errors: string[]
}

export interface ComponentImportError {
	row: number
	component_code: string
	component_name: string
	errors: string[]
}

export interface PatternUploadSummary {
	total: number
	success: number
	failed: number
}

// ============================================================================
// CALCULATION TYPES
// ============================================================================

/**
 * Calculated internal marks for a learner
 */
export interface LearnerInternalMarksCalculation {
	learner_id: string
	course_id: string
	pattern_id: string

	// Source marks
	course_internal_max_mark: number // From courses.internal_max_mark

	// Component-wise calculated marks
	component_marks: ComponentMark[]

	// Totals
	total_raw_percentage: number
	total_calculated_marks: number // Derived from percentage × internal_max_mark
	total_after_rounding: number

	// Status
	is_eligible_for_external: boolean
	eligibility_failure_reason?: string
	is_passed: boolean
	pass_failure_reason?: string
}

export interface ComponentMark {
	component_id: string
	component_code: string
	component_name: string
	weightage_percentage: number

	// Sub-component marks (if any)
	sub_component_marks?: SubComponentMark[]

	// Calculated values
	raw_marks_entered: number // Total marks entered
	max_marks_entered: number // Max marks for the entered assessment
	percentage_achieved: number // (raw / max) × 100
	weighted_contribution: number // percentage × weightage / 100
}

export interface SubComponentMark {
	sub_component_id: string
	sub_component_code: string
	marks_entered: number
	max_marks_entered: number
	percentage_achieved: number
}

// ============================================================================
// DROPDOWN OPTION TYPES
// ============================================================================

export interface PatternDropdownOption {
	id: string
	pattern_code: string
	pattern_name: string
	course_type_applicability: CourseTypeApplicability
	program_type_applicability: ProgramTypeApplicability
}

export interface ComponentDropdownOption {
	id: string
	component_code: string
	component_name: string
	weightage_percentage: number
}
