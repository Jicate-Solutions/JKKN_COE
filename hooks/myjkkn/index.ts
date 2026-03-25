/**
 * MyJKKN Hooks - Index Export
 *
 * Re-exports all MyJKKN data hooks for easy importing across the application.
 *
 * Usage:
 * import { useMyJKKNRegulations, useMyJKKNDepartmentsDropdown } from '@/hooks/myjkkn'
 */

// Entity Hooks - Full data with all fields
export {
	useMyJKKNRegulations,
	useMyJKKNDepartments,
	useMyJKKNPrograms,
	useMyJKKNSemesters,
	useMyJKKNLearners,
	useMyJKKNStaff,
} from './use-myjkkn-data'

// Dropdown Hooks - Simplified data for Select components
export {
	useMyJKKNRegulationsDropdown,
	useMyJKKNDepartmentsDropdown,
	useMyJKKNProgramsDropdown,
	useMyJKKNSemestersDropdown,
} from './use-myjkkn-data'

// Sync Hooks - For syncing MyJKKN data to local Supabase
export {
	useLearnerProfilesSync,
	type LearnerProfile,
	type LearnerProfileStats,
	type SyncResult,
	type UseLearnerProfilesSyncOptions,
	type UseLearnerProfilesSyncResult,
} from './use-learner-profiles-sync'

// Reference Lookup Hook - For resolving MyJKKN UUIDs to entity data
export { useMyJKKNReferenceLookup } from './use-myjkkn-reference-lookup'
