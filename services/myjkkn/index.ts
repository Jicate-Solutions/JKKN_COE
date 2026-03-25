/**
 * MyJKKN Services - Index Export
 *
 * Re-exports all MyJKKN adapter services and types for easy importing.
 *
 * Usage:
 * import { COERegulation, adaptRegulation } from '@/services/myjkkn'
 */

// COE-compatible Types
export type {
	COERegulation,
	COEDepartment,
	COEProgram,
	COESemester,
	COELearner,
	COEStaff,
} from './myjkkn-adapter-service'

// Adapter Functions - Single entity
export {
	adaptRegulation,
	adaptDepartment,
	adaptProgram,
	adaptSemester,
	adaptLearner,
	adaptStaff,
} from './myjkkn-adapter-service'

// Adapter Functions - Batch (arrays)
export {
	adaptRegulations,
	adaptDepartments,
	adaptPrograms,
	adaptSemesters,
	adaptLearners,
	adaptStaffList,
} from './myjkkn-adapter-service'

// Response Helpers
export {
	extractDataFromResponse,
	extractMetadata,
} from './myjkkn-adapter-service'
