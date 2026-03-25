// Result Analytics Components
// Enhanced data analysis components following best practices from data-analysis skill

// NAAD Types (re-exported for convenience)
export type {
	NAADCSVRow,
	NAADUploadRow,
	NAADOrganization,
	NAADStudentInfo,
	NAADResultInfo,
	NAADSubjectMarks,
	NAADParsedRecord,
	NAADParsedSubject,
	NAADUploadExportConfig,
	NAADUploadStudentData,
	NAADUploadSubjectData,
	NAADValidationResult,
	NAADValidationError,
	NAADValidationWarning,
	NAADParserConfig,
	NAADExportConfig
} from '@/types/naad-csv-format'

export {
	NAAD_CSV_COLUMNS,
	NAAD_UPLOAD_COLUMNS,
	NAAD_GRADE_POINTS,
	NAAD_GRADE_POINT_TO_LETTER,
	NAAD_GRADE_DESCRIPTIONS,
	NAAD_SUBJECT_COLUMN_SUFFIXES,
	DEFAULT_NAAD_PARSER_CONFIG,
	getNAADSubjectColumns,
	getAllNAADColumns,
	generateNAADUploadRows,
	formatNAADDate,
	formatNAADUploadDate,
	parseNAADDate,
	parseNAADUploadDate,
	validateNAADUploadRow,
	generateSampleNAADUploadData,
	convertToUploadFormat,
	isValidNAADResultStatus,
	isValidNAADExamType,
	isValidNAADGender,
	isValidAbcAccountId
} from '@/types/naad-csv-format'

// Data Quality Assessment
export { DataQualityPanel, calculateDataQualityMetrics } from './data-quality-panel'

// Statistical Analysis
export { StatisticalSummary, calculateStatisticalMetrics } from './statistical-summary'

// AI-Generated Insights
export { InsightsPanel, generateInsightsFromData } from './insights-panel'
export type { Insight } from './insights-panel'

// Distribution Analysis
export { DistributionChart } from './distribution-chart'

// Correlation Analysis
export { CorrelationHeatmap, calculateCorrelationMatrix } from './correlation-heatmap'

// Animated Stat Cards with Sparklines
export {
	AnimatedStatCard,
	AnimatedStatCardCompact,
	useAnimatedCounter,
	Sparkline
} from './animated-stat-card'
export type { AnimatedStatCardProps, ColorTheme } from './animated-stat-card'

// Dashboard Loading Skeletons
export {
	StatCardsGridSkeleton,
	ChartCardSkeleton,
	ChartGridSkeleton,
	TableSkeleton,
	InsightsPanelSkeleton,
	DashboardSkeleton,
	ComplianceDashboardSkeleton
} from './dashboard-skeleton'

// Comparison Panel for Side-by-Side Analysis
export { ComparisonPanel, QuickComparisonBadge } from './comparison-panel'

// Drill-Down Modal for Detailed Learner Data
export { DrillDownModal, DrillDownButton } from './drill-down-modal'
