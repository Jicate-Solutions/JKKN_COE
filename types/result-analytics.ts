// =============================================================================
// RESULT ANALYTICS - TYPE DEFINITIONS
// =============================================================================
// Comprehensive TypeScript types for Result Analysis Dashboard
// Includes: College, Program, Subject, Board analytics + NAAC/NAAD/ATR reports
// =============================================================================

// =============================================================================
// COMMON FILTER TYPES
// =============================================================================

export interface ResultAnalyticsFilters {
	institution_id?: string
	institution_code?: string
	academic_year_id?: string
	academic_year?: string
	program_id?: string
	program_code?: string
	semester?: number
	batch_id?: string
	batch_code?: string
	section_id?: string
	section_code?: string
	regulation_id?: string
	regulation_code?: string
	examination_session_id?: string
	board_id?: string
	board_code?: string
	degree_level?: 'UG' | 'PG' | 'Diploma' | 'Certificate' | 'All'
	gender?: 'Male' | 'Female' | 'Other' | 'All'
	category?: string
	date_from?: string
	date_to?: string
}

// =============================================================================
// COLLEGE-WISE RESULT ANALYTICS
// =============================================================================

export interface CollegeResultSummary {
	institution_id: string
	institution_code: string
	institution_name: string
	academic_year: string
	examination_session: string
	examination_session_code: string

	// Overall Statistics
	total_students_appeared: number
	total_students_passed: number
	total_students_failed: number
	total_students_absent: number
	pass_percentage: number
	fail_percentage: number
	absent_percentage: number

	// Classification Distribution
	distinction_count: number
	first_class_count: number
	second_class_count: number
	third_class_count: number
	pass_class_count: number

	// Percentage Distribution
	distinction_percentage: number
	first_class_percentage: number
	second_class_percentage: number
	third_class_percentage: number
	pass_class_percentage: number

	// Average Scores
	average_percentage: number
	average_gpa: number
	average_cgpa: number
	highest_percentage: number
	lowest_percentage: number
	median_percentage: number

	// Backlog Statistics
	total_backlogs: number
	students_with_backlogs: number
	backlog_percentage: number
	cleared_backlogs: number
	pending_backlogs: number
}

export interface CollegeResultTrend {
	academic_year: string
	examination_session: string
	total_appeared: number
	total_passed: number
	pass_percentage: number
	average_percentage: number
	distinction_count: number
	first_class_count: number
}

export interface GenderWiseResult {
	gender: string
	total_appeared: number
	total_passed: number
	total_failed: number
	pass_percentage: number
	average_percentage: number
	distinction_count: number
	first_class_count: number
}

export interface CategoryWiseResult {
	category: string
	total_appeared: number
	total_passed: number
	total_failed: number
	pass_percentage: number
	average_percentage: number
}

export interface CollegeDashboardData {
	summary: CollegeResultSummary
	trends: CollegeResultTrend[]
	gender_wise: GenderWiseResult[]
	category_wise: CategoryWiseResult[]
	semester_wise: SemesterWiseResult[]
	top_performers: TopPerformer[]
	recent_sessions: RecentSessionResult[]
}

export interface SemesterWiseResult {
	semester: number
	semester_name: string
	total_appeared: number
	total_passed: number
	pass_percentage: number
	average_gpa: number
	backlogs_count: number
}

export interface TopPerformer {
	student_id: string
	register_number: string
	student_name: string
	program_name: string
	semester: number
	cgpa: number
	percentage: number
	rank: number
}

export interface RecentSessionResult {
	examination_session_id: string
	session_code: string
	session_name: string
	exam_date: string
	total_students: number
	pass_percentage: number
	status: 'Published' | 'Processing' | 'Pending'
}

// =============================================================================
// PROGRAM-WISE RESULT ANALYTICS
// =============================================================================

export interface ProgramResultSummary {
	program_id: string
	program_code: string
	program_name: string
	degree_code: string
	degree_name: string
	degree_level: string
	department_code: string
	department_name: string
	regulation_code: string

	// Statistics
	total_students_appeared: number
	total_students_passed: number
	total_students_failed: number
	pass_percentage: number
	fail_percentage: number

	// Classification
	distinction_count: number
	first_class_count: number
	second_class_count: number
	pass_class_count: number
	fail_count: number

	// Scores
	average_percentage: number
	average_cgpa: number
	highest_cgpa: number
	lowest_cgpa: number

	// Backlogs
	total_backlogs: number
	students_with_backlogs: number
	avg_backlogs_per_student: number

	// Comparison
	is_above_college_average: boolean
	variance_from_average: number
}

export interface ProgramTrend {
	academic_year: string
	program_code: string
	program_name: string
	total_appeared: number
	total_passed: number
	pass_percentage: number
	average_cgpa: number
}

export interface WeakProgram {
	program_id: string
	program_code: string
	program_name: string
	pass_percentage: number
	college_average: number
	variance: number
	total_backlogs: number
	critical_subjects: string[]
	recommendation: string
}

export interface ProgramComparisonData {
	program_code: string
	program_name: string
	pass_percentage: number
	average_cgpa: number
	total_students: number
	backlogs_count: number
}

export interface ProgramAnalysisDashboardData {
	programs: ProgramResultSummary[]
	trends: ProgramTrend[]
	weak_programs: WeakProgram[]
	top_programs: ProgramResultSummary[]
	comparison_chart_data: ProgramComparisonData[]
	degree_level_summary: DegreeLevelSummary[]
}

export interface DegreeLevelSummary {
	degree_level: string
	total_programs: number
	total_students: number
	average_pass_percentage: number
	average_cgpa: number
}

// =============================================================================
// SUBJECT-WISE RESULT ANALYTICS
// =============================================================================

export interface SubjectResultSummary {
	course_id: string
	course_code: string
	course_name: string
	course_category: string
	credit: number
	semester: number
	program_code: string
	program_name: string

	// Examination Details
	max_internal_marks: number
	max_external_marks: number
	max_total_marks: number
	pass_marks: number

	// Statistics
	total_students_appeared: number
	total_students_passed: number
	total_students_failed: number
	total_students_absent: number
	pass_percentage: number
	fail_percentage: number
	absent_percentage: number

	// Marks Analysis
	average_internal_marks: number
	average_external_marks: number
	average_total_marks: number
	average_percentage: number
	highest_marks: number
	lowest_marks: number
	median_marks: number
	standard_deviation: number

	// Failure Analysis
	failed_internal: number
	failed_external: number
	failed_both: number
	internal_fail_percentage: number
	external_fail_percentage: number

	// Difficulty Index
	difficulty_index: number // 0-1 scale (higher = more difficult)
	discrimination_index: number

	// CO Attainment (if applicable)
	co_attainment_percentage?: number
}

export interface SubjectTrend {
	academic_year: string
	examination_session: string
	course_code: string
	course_name: string
	total_appeared: number
	total_passed: number
	pass_percentage: number
	average_marks: number
}

export interface SubjectFailureAnalysis {
	course_id: string
	course_code: string
	course_name: string
	total_failures: number
	failure_reason_internal: number
	failure_reason_external: number
	failure_reason_both: number
	failure_reason_absent: number
	improvement_suggestions: string[]
}

export interface SubjectComparisonData {
	course_code: string
	course_name: string
	pass_percentage: number
	average_marks: number
	difficulty_index: number
	total_students: number
}

export interface SubjectAnalysisDashboardData {
	subjects: SubjectResultSummary[]
	trends: SubjectTrend[]
	failure_analysis: SubjectFailureAnalysis[]
	difficult_subjects: SubjectResultSummary[]
	easy_subjects: SubjectResultSummary[]
	comparison_data: SubjectComparisonData[]
	internal_external_comparison: InternalExternalComparison[]
	heatmap_data: SubjectHeatmapData[]
}

export interface InternalExternalComparison {
	course_code: string
	course_name: string
	avg_internal_percentage: number
	avg_external_percentage: number
	correlation: number
}

export interface SubjectHeatmapData {
	program_code: string
	semester: number
	course_code: string
	pass_percentage: number
	color_intensity: number // 0-100 for heatmap coloring
}

// =============================================================================
// BOARD/UNIVERSITY-WISE ANALYTICS
// =============================================================================

export interface BoardResultSummary {
	board_id: string
	board_code: string
	board_name: string
	board_type: string // State Board, CBSE, ICSE, University

	// Statistics
	total_students: number
	total_passed: number
	total_failed: number
	pass_percentage: number

	// Classification
	distinction_count: number
	first_class_count: number
	second_class_count: number

	// Scores
	average_percentage: number
	highest_percentage: number
	topper_name?: string
	topper_percentage?: number
}

export interface BoardTrend {
	academic_year: string
	board_code: string
	board_name: string
	total_students: number
	pass_percentage: number
	average_percentage: number
}

export interface BoardComparisonData {
	board_code: string
	board_name: string
	pass_percentage: number
	average_percentage: number
	total_students: number
}

export interface BoardAnalysisDashboardData {
	boards: BoardResultSummary[]
	trends: BoardTrend[]
	comparison_data: BoardComparisonData[]
	rank_holders: BoardRankHolder[]
}

export interface BoardRankHolder {
	board_code: string
	board_name: string
	student_name: string
	register_number: string
	percentage: number
	rank: number
	academic_year: string
}

// =============================================================================
// NAAC REPORTS
// =============================================================================

export interface NAACCriterion26Data {
	// Criterion 2.6 - Student Performance and Learning Outcomes
	criterion_code: '2.6.1' | '2.6.2' | '2.6.3'
	criterion_title: string
	academic_year: string

	// 2.6.1 - Program outcomes, program specific outcomes and course outcomes
	program_outcomes?: ProgramOutcomeData[]

	// 2.6.2 - Attainment of program outcomes and course outcomes
	co_attainment_data?: COAttainmentData[]
	po_attainment_data?: POAttainmentData[]

	// 2.6.3 - Pass percentage of students during last five years
	pass_percentage_data?: YearWisePassPercentage[]

	// Supporting Data
	supporting_documents: string[]
	generated_at: string
}

export interface ProgramOutcomeData {
	program_code: string
	program_name: string
	po_code: string
	po_description: string
	attainment_level: number
	target_level: number
	is_achieved: boolean
}

export interface COAttainmentData {
	course_code: string
	course_name: string
	co_code: string
	co_description: string
	attainment_percentage: number
	target_percentage: number
	is_achieved: boolean
}

export interface POAttainmentData {
	program_code: string
	program_name: string
	po_code: string
	po_description: string
	direct_attainment: number
	indirect_attainment: number
	overall_attainment: number
	target: number
}

export interface YearWisePassPercentage {
	academic_year: string
	program_code: string
	program_name: string
	total_appeared: number
	total_passed: number
	pass_percentage: number
}

export interface NAACCriterion13Data {
	// Criterion 1.3 - Curriculum Enrichment
	criterion_code: '1.3.4'
	criterion_title: string
	academic_year: string

	// Project/Internship Results
	internship_data: InternshipResultData[]
	project_data: ProjectResultData[]

	generated_at: string
}

export interface InternshipResultData {
	program_code: string
	program_name: string
	total_students: number
	completed_internships: number
	completion_percentage: number
	average_grade: string
}

export interface ProjectResultData {
	program_code: string
	program_name: string
	total_projects: number
	completed_projects: number
	excellent_count: number
	good_count: number
	average_count: number
}

export interface NAACCriterion27Data {
	// Criterion 2.7 - Student Satisfaction Survey
	criterion_code: '2.7.1'
	criterion_title: string
	academic_year: string

	// Survey Data
	total_responses: number
	satisfaction_score: number // Out of 5 or 100
	response_rate: number

	// Category-wise Satisfaction
	category_wise_satisfaction: CategorySatisfactionData[]

	generated_at: string
}

export interface CategorySatisfactionData {
	category: string
	score: number
	response_count: number
}

export interface NAACReportGenerationRequest {
	criterion: '2.6' | '1.3' | '2.7'
	sub_criterion?: string
	academic_year: string
	institution_id?: string
	program_ids?: string[]
	include_charts: boolean
	export_format: 'pdf' | 'excel' | 'both'
}

export interface NAACReportResponse {
	report_id: string
	criterion: string
	generated_at: string
	file_url?: string
	data: NAACCriterion26Data | NAACCriterion13Data | NAACCriterion27Data
}

// =============================================================================
// NAAD (NATIONAL ACADEMIC DEPOSITORY) REPORTS
// =============================================================================

export interface NAADComplianceSummary {
	institution_id: string
	institution_code: string
	institution_name: string
	academic_year: string
	report_date: string

	// Registration Statistics
	total_students_registered: number
	pending_registrations: number
	registration_percentage: number

	// Marksheet Upload Statistics
	total_marksheets_required: number
	marksheets_uploaded: number
	marksheets_pending: number
	marksheets_upload_percentage: number

	// Certificate Statistics
	total_certificates_required: number
	certificates_uploaded: number
	certificates_pending: number
	certificate_upload_percentage: number

	// Verification Statistics
	total_verification_requests: number
	verifications_completed: number
	verifications_pending: number

	// Compliance Score
	overall_compliance_percentage: number
	compliance_status: 'Compliant' | 'Partially Compliant' | 'Non-Compliant'
}

export interface NAADStudentRecord {
	student_id: string
	register_number: string
	student_name: string
	program_code: string
	program_name: string
	admission_year: string
	graduation_year?: string

	// NAD Registration
	nad_id?: string
	is_nad_registered: boolean
	nad_registration_date?: string

	// Document Status
	marksheets_status: DocumentUploadStatus[]
	degree_certificate_status?: DocumentUploadStatus

	// Verification
	verification_status: 'Verified' | 'Pending' | 'Not Requested'
	last_verified_date?: string
}

export interface DocumentUploadStatus {
	document_type: 'Marksheet' | 'Degree Certificate' | 'Provisional Certificate'
	semester?: number
	academic_year?: string
	is_uploaded: boolean
	upload_date?: string
	nad_document_id?: string
	verification_status: 'Verified' | 'Pending' | 'Failed'
}

export interface NAADPendingUpload {
	student_id: string
	register_number: string
	student_name: string
	program_code: string
	document_type: string
	semester?: number
	due_date?: string
	days_pending: number
	priority: 'High' | 'Medium' | 'Low'
}

export interface NAADReportDashboardData {
	summary: NAADComplianceSummary
	pending_uploads: NAADPendingUpload[]
	program_wise_compliance: ProgramWiseNAADCompliance[]
	upload_trends: NAADUploadTrend[]
}

export interface ProgramWiseNAADCompliance {
	program_code: string
	program_name: string
	total_students: number
	registered_count: number
	marksheets_uploaded: number
	certificates_uploaded: number
	compliance_percentage: number
}

export interface NAADUploadTrend {
	month: string
	marksheets_uploaded: number
	certificates_uploaded: number
	registrations: number
}

// =============================================================================
// ACTION TAKEN REPORTS (ATR)
// =============================================================================

export interface ActionTakenReport {
	id: string
	institution_id: string
	academic_year: string
	created_at: string
	updated_at: string
	created_by: string
	status: 'Open' | 'In Progress' | 'Closed' | 'Verified'

	// Issue Identification
	issue_type: 'Weak Subject' | 'Weak Program' | 'High Failure Rate' | 'Low Attendance' | 'Other'
	issue_category: string
	issue_title: string
	issue_description: string

	// Evidence
	evidence_type: 'Result Data' | 'Attendance Data' | 'Feedback' | 'Other'
	evidence_data: ATREvidence

	// Affected Entity
	affected_entity_type: 'Program' | 'Subject' | 'Department' | 'Batch'
	affected_entity_id: string
	affected_entity_name: string

	// Action Details
	action_taken: string
	action_start_date: string
	action_end_date?: string
	responsible_person: string
	responsible_department: string

	// Outcome
	expected_outcome: string
	actual_outcome?: string
	improvement_percentage?: number
	is_improvement_achieved?: boolean

	// Follow-up
	follow_up_required: boolean
	follow_up_date?: string
	follow_up_notes?: string

	// NAAC Mapping
	naac_criterion?: string
	naac_relevance?: string
}

export interface ATREvidence {
	metric_name: string
	before_value: number
	after_value?: number
	target_value: number
	unit: string // '%', 'count', 'score'
	data_source: string
	measurement_period: string
}

export interface ATRSummary {
	total_issues: number
	open_issues: number
	in_progress_issues: number
	closed_issues: number
	verified_issues: number

	// By Type
	weak_subjects_count: number
	weak_programs_count: number
	high_failure_count: number

	// Improvement Metrics
	issues_with_improvement: number
	average_improvement_percentage: number
}

export interface ATRDashboardData {
	summary: ATRSummary
	recent_atrs: ActionTakenReport[]
	pending_actions: ActionTakenReport[]
	improvement_trends: ATRImprovementTrend[]
	category_distribution: ATRCategoryDistribution[]
}

export interface ATRImprovementTrend {
	month: string
	issues_identified: number
	issues_resolved: number
	improvement_achieved: number
}

export interface ATRCategoryDistribution {
	category: string
	count: number
	percentage: number
}

// =============================================================================
// EXPORT TYPES
// =============================================================================

export interface ExportRequest {
	report_type: 'college' | 'program' | 'subject' | 'board' | 'naac' | 'naad' | 'atr'
	format: 'excel' | 'pdf'
	filters: ResultAnalyticsFilters
	include_charts?: boolean
	include_summary?: boolean
	include_details?: boolean
	custom_title?: string
	branding?: ExportBranding
}

export interface ExportBranding {
	institution_name: string
	institution_logo_url?: string
	right_logo_url?: string
	address?: string
	contact?: string
	website?: string
}

export interface ExportResponse {
	success: boolean
	file_url?: string
	file_name?: string
	error?: string
	generated_at: string
}

// =============================================================================
// CHART DATA TYPES
// =============================================================================

export interface ChartDataPoint {
	name: string
	value: number
	fill?: string
	label?: string
}

export interface TrendChartData {
	period: string
	value: number
	comparison_value?: number
	label?: string
}

export interface BarChartData {
	category: string
	value: number
	fill?: string
	label?: string
}

export interface PieChartData {
	name: string
	value: number
	percentage: number
	fill: string
}

export interface HeatmapCell {
	x: string
	y: string
	value: number
	label?: string
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface ResultAnalyticsAPIResponse<T> {
	success: boolean
	data?: T
	error?: string
	message?: string
	filters_applied?: ResultAnalyticsFilters
	generated_at: string
	cache_key?: string
}

export interface PaginatedResultResponse<T> {
	data: T[]
	total: number
	page: number
	page_size: number
	total_pages: number
	has_next: boolean
	has_previous: boolean
}

// =============================================================================
// DROPDOWN/FILTER OPTIONS
// =============================================================================

export interface FilterOption {
	value: string
	label: string
	disabled?: boolean
}

export interface FilterOptions {
	institutions: FilterOption[]
	academic_years: FilterOption[]
	programs: FilterOption[]
	semesters: FilterOption[]
	batches: FilterOption[]
	sections: FilterOption[]
	regulations: FilterOption[]
	examination_sessions: FilterOption[]
	boards: FilterOption[]
	degree_levels: FilterOption[]
}
