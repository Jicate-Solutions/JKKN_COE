/**
 * Internal Assessment Calculation Service
 *
 * This service handles all calculations related to internal assessment marks.
 * KEY PRINCIPLE: Components only have weightage_percentage, NOT max_mark.
 * Actual marks are calculated: (weightage_percentage/100) × courses.internal_max_mark
 *
 * JKKN Terminology:
 * - Learner (not Student)
 * - Learning Facilitator (not Faculty/Teacher)
 * - Learning Assessment (not Exam/Test)
 */

import {
	InternalAssessmentPattern,
	InternalAssessmentComponent,
	InternalAssessmentSubComponent,
	InternalAssessmentEligibilityRule,
	InternalAssessmentPassingRule,
	LearnerInternalMarksCalculation,
	ComponentMark,
	SubComponentMark,
	CalculationMethod,
	RoundingMethod
} from '@/types/internal-assessment-pattern'

/**
 * Raw marks input for a learner's assessment
 */
export interface LearnerAssessmentInput {
	learner_id: string
	course_id: string
	course_internal_max_mark: number // From courses.internal_max_mark
	component_inputs: ComponentInput[]
	attendance_percentage?: number
}

export interface ComponentInput {
	component_id: string
	sub_component_inputs?: SubComponentInput[]
	// If no sub-components, direct input
	marks_obtained?: number
	max_marks?: number // Max marks for this specific assessment instance
}

export interface SubComponentInput {
	sub_component_id: string
	marks_obtained: number
	max_marks: number
}

/**
 * Eligibility check result
 */
export interface EligibilityResult {
	is_eligible: boolean
	failure_reasons: string[]
	attendance_status: {
		percentage: number
		required: number
		is_met: boolean
		condonation_applied: boolean
		condonation_amount?: number
	} | null
	components_status: {
		total_mandatory: number
		completed: number
		is_met: boolean
	} | null
	overall_percentage_status: {
		achieved: number
		required: number
		is_met: boolean
	} | null
}

/**
 * Pass/fail check result
 */
export interface PassingResult {
	is_passed: boolean
	failure_reasons: string[]
	overall_status: {
		percentage: number
		required: number
		is_met: boolean
	}
	component_wise_status: {
		component_id: string
		component_name: string
		percentage: number
		required: number
		is_met: boolean
	}[] | null
	grace_marks_applied: {
		applied: boolean
		amount: number
		reason?: string
	}
	final_percentage: number
	final_marks: number
}

/**
 * Calculate internal marks for a learner
 */
export function calculateInternalMarks(
	pattern: InternalAssessmentPattern,
	components: InternalAssessmentComponent[],
	subComponents: InternalAssessmentSubComponent[],
	input: LearnerAssessmentInput
): LearnerInternalMarksCalculation {
	const componentMarks: ComponentMark[] = []
	let totalWeightedPercentage = 0

	for (const component of components) {
		if (!component.is_active) continue

		const componentInput = input.component_inputs.find(ci => ci.component_id === component.id)
		if (!componentInput) continue

		let percentageAchieved = 0

		if (component.has_sub_components && componentInput.sub_component_inputs?.length) {
			// Get sub-components for this component
			const compSubComponents = subComponents.filter(sc => sc.component_id === component.id && sc.is_active)
			const subComponentMarks: SubComponentMark[] = []

			for (const subComp of compSubComponents) {
				const subInput = componentInput.sub_component_inputs.find(si => si.sub_component_id === subComp.id)
				if (subInput) {
					const subPercentage = subInput.max_marks > 0
						? (subInput.marks_obtained / subInput.max_marks) * 100
						: 0

					subComponentMarks.push({
						sub_component_id: subComp.id,
						sub_component_code: subComp.sub_component_code,
						marks_entered: subInput.marks_obtained,
						max_marks_entered: subInput.max_marks,
						percentage_achieved: subPercentage
					})
				}
			}

			// Calculate based on calculation method
			percentageAchieved = calculateComponentPercentage(
				subComponentMarks.map(sc => sc.percentage_achieved),
				component.calculation_method || 'average',
				component.best_of_count || 1
			)

			const rawMarksTotal = subComponentMarks.reduce((sum, sc) => sum + sc.marks_entered, 0)
			const maxMarksTotal = subComponentMarks.reduce((sum, sc) => sum + sc.max_marks_entered, 0)

			componentMarks.push({
				component_id: component.id,
				component_code: component.component_code,
				component_name: component.component_name,
				weightage_percentage: component.weightage_percentage,
				sub_component_marks: subComponentMarks,
				raw_marks_entered: rawMarksTotal,
				max_marks_entered: maxMarksTotal,
				percentage_achieved: percentageAchieved,
				weighted_contribution: (percentageAchieved * component.weightage_percentage) / 100
			})
		} else {
			// Direct component marks (no sub-components)
			const rawMarks = componentInput.marks_obtained || 0
			const maxMarks = componentInput.max_marks || 0
			percentageAchieved = maxMarks > 0 ? (rawMarks / maxMarks) * 100 : 0

			componentMarks.push({
				component_id: component.id,
				component_code: component.component_code,
				component_name: component.component_name,
				weightage_percentage: component.weightage_percentage,
				raw_marks_entered: rawMarks,
				max_marks_entered: maxMarks,
				percentage_achieved: percentageAchieved,
				weighted_contribution: (percentageAchieved * component.weightage_percentage) / 100
			})
		}

		totalWeightedPercentage += (percentageAchieved * component.weightage_percentage) / 100
	}

	// Calculate final marks from percentage
	const rawCalculatedMarks = (totalWeightedPercentage / 100) * input.course_internal_max_mark
	const roundedMarks = applyRounding(rawCalculatedMarks, pattern.rounding_method, pattern.decimal_precision)

	return {
		learner_id: input.learner_id,
		course_id: input.course_id,
		pattern_id: pattern.id,
		course_internal_max_mark: input.course_internal_max_mark,
		component_marks: componentMarks,
		total_raw_percentage: totalWeightedPercentage,
		total_calculated_marks: rawCalculatedMarks,
		total_after_rounding: roundedMarks,
		is_eligible_for_external: false, // Will be set by eligibility check
		is_passed: false // Will be set by passing check
	}
}

/**
 * Calculate component percentage based on calculation method
 */
function calculateComponentPercentage(
	percentages: number[],
	method: CalculationMethod,
	bestOfCount: number
): number {
	if (percentages.length === 0) return 0

	switch (method) {
		case 'sum':
			// Sum of all percentages (capped at 100)
			return Math.min(percentages.reduce((a, b) => a + b, 0), 100)

		case 'average':
			// Simple average
			return percentages.reduce((a, b) => a + b, 0) / percentages.length

		case 'best_of':
			// Best N scores
			const sorted = [...percentages].sort((a, b) => b - a)
			const bestScores = sorted.slice(0, bestOfCount)
			return bestScores.reduce((a, b) => a + b, 0) / bestScores.length

		case 'weighted_average':
			// For weighted average, we'd need sub-weightage
			// Fallback to simple average here
			return percentages.reduce((a, b) => a + b, 0) / percentages.length

		default:
			return percentages.reduce((a, b) => a + b, 0) / percentages.length
	}
}

/**
 * Apply rounding method to marks
 */
function applyRounding(
	value: number,
	method: RoundingMethod,
	precision: number
): number {
	const multiplier = Math.pow(10, precision)

	switch (method) {
		case 'floor':
			return Math.floor(value * multiplier) / multiplier
		case 'ceil':
			return Math.ceil(value * multiplier) / multiplier
		case 'round':
			return Math.round(value * multiplier) / multiplier
		case 'none':
			// Return with precision, no rounding
			return parseFloat(value.toFixed(precision))
		default:
			return Math.round(value * multiplier) / multiplier
	}
}

/**
 * Check learner eligibility for external examination
 */
export function checkEligibility(
	rules: InternalAssessmentEligibilityRule[],
	components: InternalAssessmentComponent[],
	calculatedMarks: LearnerInternalMarksCalculation,
	attendancePercentage?: number
): EligibilityResult {
	const result: EligibilityResult = {
		is_eligible: true,
		failure_reasons: [],
		attendance_status: null,
		components_status: null,
		overall_percentage_status: null
	}

	// Get active rules sorted by priority
	const activeRules = rules
		.filter(r => r.is_active)
		.sort((a, b) => a.priority_order - b.priority_order)

	if (activeRules.length === 0) {
		// No rules defined - default to eligible
		return result
	}

	// Apply the highest priority rule
	const rule = activeRules[0]

	// Check attendance
	if (rule.minimum_attendance_percentage !== null && rule.minimum_attendance_percentage !== undefined) {
		const attendance = attendancePercentage ?? 0
		let effectiveAttendance = attendance
		let condonationApplied = false
		let condonationAmount = 0

		// Apply condonation if allowed
		if (rule.condonation_allowed && attendance < rule.minimum_attendance_percentage) {
			const shortage = rule.minimum_attendance_percentage - attendance
			const maxCondonation = rule.condonation_percentage_limit || 0

			if (shortage <= maxCondonation) {
				effectiveAttendance = rule.minimum_attendance_percentage
				condonationApplied = true
				condonationAmount = shortage
			}
		}

		const isMet = effectiveAttendance >= rule.minimum_attendance_percentage

		result.attendance_status = {
			percentage: attendance,
			required: rule.minimum_attendance_percentage,
			is_met: isMet,
			condonation_applied: condonationApplied,
			condonation_amount: condonationAmount
		}

		if (!isMet) {
			result.is_eligible = false
			result.failure_reasons.push(
				`Attendance ${attendance.toFixed(1)}% is below required ${rule.minimum_attendance_percentage}%`
			)
		}
	}

	// Check mandatory components completion
	if (rule.mandatory_components_completion) {
		const mandatoryComponents = components.filter(c => c.is_mandatory && c.is_active)
		const completedComponents = calculatedMarks.component_marks.filter(cm => {
			const component = components.find(c => c.id === cm.component_id)
			return component?.is_mandatory && cm.max_marks_entered > 0
		})

		const isMet = completedComponents.length >= mandatoryComponents.length

		result.components_status = {
			total_mandatory: mandatoryComponents.length,
			completed: completedComponents.length,
			is_met: isMet
		}

		if (!isMet) {
			result.is_eligible = false
			result.failure_reasons.push(
				`Completed ${completedComponents.length} of ${mandatoryComponents.length} mandatory assessments`
			)
		}
	}

	// Check minimum overall percentage
	if (rule.minimum_overall_percentage !== null && rule.minimum_overall_percentage !== undefined) {
		const isMet = calculatedMarks.total_raw_percentage >= rule.minimum_overall_percentage

		result.overall_percentage_status = {
			achieved: calculatedMarks.total_raw_percentage,
			required: rule.minimum_overall_percentage,
			is_met: isMet
		}

		if (!isMet) {
			result.is_eligible = false
			result.failure_reasons.push(
				`Overall ${calculatedMarks.total_raw_percentage.toFixed(1)}% is below required ${rule.minimum_overall_percentage}%`
			)
		}
	}

	return result
}

/**
 * Check if learner has passed internal assessment
 */
export function checkPassing(
	rules: InternalAssessmentPassingRule[],
	components: InternalAssessmentComponent[],
	calculatedMarks: LearnerInternalMarksCalculation,
	courseInternalMaxMark: number
): PassingResult {
	const result: PassingResult = {
		is_passed: true,
		failure_reasons: [],
		overall_status: {
			percentage: calculatedMarks.total_raw_percentage,
			required: 0,
			is_met: true
		},
		component_wise_status: null,
		grace_marks_applied: {
			applied: false,
			amount: 0
		},
		final_percentage: calculatedMarks.total_raw_percentage,
		final_marks: calculatedMarks.total_after_rounding
	}

	// Get active rules sorted by priority
	const activeRules = rules
		.filter(r => r.is_active)
		.sort((a, b) => a.priority_order - b.priority_order)

	if (activeRules.length === 0) {
		// No rules defined - default to passed
		return result
	}

	// Apply the highest priority rule
	const rule = activeRules[0]

	let effectivePercentage = calculatedMarks.total_raw_percentage

	// Check overall minimum
	result.overall_status.required = rule.minimum_pass_percentage

	// Apply rounding if specified
	if (rule.apply_rounding_before_pass_check) {
		effectivePercentage = Math.round(effectivePercentage * 100) / 100
	}

	// Check if grace marks can help
	if (
		effectivePercentage < rule.minimum_pass_percentage &&
		rule.grace_mark_enabled &&
		rule.grace_mark_percentage_limit
	) {
		const shortage = rule.minimum_pass_percentage - effectivePercentage

		if (shortage <= rule.grace_mark_percentage_limit) {
			result.grace_marks_applied = {
				applied: true,
				amount: shortage,
				reason: 'Applied to meet minimum passing requirement'
			}
			effectivePercentage = rule.minimum_pass_percentage
		}
	}

	const overallMet = effectivePercentage >= rule.minimum_pass_percentage
	result.overall_status.percentage = effectivePercentage
	result.overall_status.is_met = overallMet

	if (!overallMet) {
		result.is_passed = false
		result.failure_reasons.push(
			`Overall ${effectivePercentage.toFixed(1)}% is below minimum pass requirement of ${rule.minimum_pass_percentage}%`
		)
	}

	// Check component-wise minimum if enabled
	if (rule.component_wise_minimum_enabled && rule.component_wise_minimum_percentage) {
		result.component_wise_status = []

		for (const componentMark of calculatedMarks.component_marks) {
			const component = components.find(c => c.id === componentMark.component_id)
			if (!component?.is_mandatory) continue

			const isMet = componentMark.percentage_achieved >= rule.component_wise_minimum_percentage

			result.component_wise_status.push({
				component_id: componentMark.component_id,
				component_name: componentMark.component_name,
				percentage: componentMark.percentage_achieved,
				required: rule.component_wise_minimum_percentage,
				is_met: isMet
			})

			if (!isMet) {
				result.is_passed = false
				result.failure_reasons.push(
					`${componentMark.component_name}: ${componentMark.percentage_achieved.toFixed(1)}% is below required ${rule.component_wise_minimum_percentage}%`
				)
			}
		}
	}

	// Calculate final marks
	result.final_percentage = effectivePercentage
	result.final_marks = applyRounding(
		(effectivePercentage / 100) * courseInternalMaxMark,
		'round',
		2
	)

	return result
}

/**
 * Get applicable pattern for a course
 * Priority: Course-specific > Program-specific > Default for applicability scope
 */
export async function getApplicablePattern(
	supabase: ReturnType<typeof import('@/lib/supabase-server').getSupabaseServer>,
	courseId: string,
	courseType: string,
	programId?: string,
	institutionId?: string
): Promise<InternalAssessmentPattern | null> {
	// 1. Check for course-specific pattern
	const { data: courseAssoc } = await supabase
		.from('pattern_course_associations')
		.select(`
			pattern_id,
			internal_assessment_patterns!inner (*)
		`)
		.eq('course_id', courseId)
		.eq('is_active', true)
		.lte('effective_from_date', new Date().toISOString().split('T')[0])
		.or('effective_to_date.is.null,effective_to_date.gte.' + new Date().toISOString().split('T')[0])
		.single()

	if (courseAssoc?.internal_assessment_patterns) {
		return courseAssoc.internal_assessment_patterns as unknown as InternalAssessmentPattern
	}

	// 2. Check for program-specific pattern
	if (programId) {
		const { data: programAssoc } = await supabase
			.from('pattern_program_associations')
			.select(`
				pattern_id,
				internal_assessment_patterns!inner (*)
			`)
			.eq('program_id', programId)
			.eq('is_active', true)
			.lte('effective_from_date', new Date().toISOString().split('T')[0])
			.or('effective_to_date.is.null,effective_to_date.gte.' + new Date().toISOString().split('T')[0])
			.single()

		if (programAssoc?.internal_assessment_patterns) {
			return programAssoc.internal_assessment_patterns as unknown as InternalAssessmentPattern
		}
	}

	// 3. Get default pattern for the course type and institution
	const { data: defaultPattern } = await supabase
		.from('internal_assessment_patterns')
		.select('*')
		.eq('institutions_id', institutionId || '')
		.eq('is_default', true)
		.eq('status', 'active')
		.eq('is_active', true)
		.or(`course_type_applicability.eq.${courseType},course_type_applicability.eq.all`)
		.order('wef_date', { ascending: false })
		.limit(1)
		.single()

	return defaultPattern as InternalAssessmentPattern | null
}

/**
 * Format marks for display
 */
export function formatMarks(marks: number, precision: number = 2): string {
	return marks.toFixed(precision)
}

/**
 * Calculate percentage from marks
 */
export function marksToPercentage(marks: number, maxMarks: number): number {
	if (maxMarks <= 0) return 0
	return (marks / maxMarks) * 100
}

/**
 * Calculate marks from percentage
 */
export function percentageToMarks(percentage: number, maxMarks: number): number {
	return (percentage / 100) * maxMarks
}
