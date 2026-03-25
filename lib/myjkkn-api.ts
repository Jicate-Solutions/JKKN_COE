/**
 * MyJKKN API Re-exports
 *
 * Convenient imports for MyJKKN API integration
 */

// Re-export types
export type {
	MyJKKNPaginatedResponse,
	MyJKKNSingleResponse,
	MyJKKNInstitution,
	MyJKKNDepartment,
	MyJKKNProgram,
	MyJKKNDegree,
	MyJKKNCourse,
	MyJKKNSemester,
	MyJKKNStudent,
	MyJKKNStaff,
	MyJKKNRegulation,
	MyJKKNBatch,
	MyJKKNLearnerProfile,
	MyJKKNBaseFetchOptions,
	MyJKKNInstitutionFetchOptions,
	MyJKKNDepartmentFetchOptions,
	MyJKKNProgramFetchOptions,
	MyJKKNDegreeFetchOptions,
	MyJKKNCourseFetchOptions,
	MyJKKNSemesterFetchOptions,
	MyJKKNStudentFetchOptions,
	MyJKKNStaffFetchOptions,
	MyJKKNRegulationFetchOptions,
	MyJKKNBatchFetchOptions,
	MyJKKNLearnerProfileFetchOptions,
	MyJKKNEntityType,
} from '@/types/myjkkn'

export { MYJKKN_API_ENDPOINTS } from '@/types/myjkkn'

// Re-export service functions
export {
	MyJKKNApiError,
	// Institutions
	fetchMyJKKNInstitutions,
	fetchAllMyJKKNInstitutions,
	// Departments
	fetchMyJKKNDepartments,
	fetchAllMyJKKNDepartments,
	// Programs
	fetchMyJKKNPrograms,
	fetchAllMyJKKNPrograms,
	// Degrees
	fetchMyJKKNDegrees,
	fetchAllMyJKKNDegrees,
	// Courses
	fetchMyJKKNCourses,
	fetchAllMyJKKNCourses,
	// Semesters
	fetchMyJKKNSemesters,
	fetchAllMyJKKNSemesters,
	// Regulations
	fetchMyJKKNRegulations,
	fetchAllMyJKKNRegulations,
	// Batches
	fetchMyJKKNBatches,
	fetchAllMyJKKNBatches,
	fetchMyJKKNBatchById,
	// Students
	fetchMyJKKNStudents,
	fetchAllMyJKKNStudents,
	fetchMyJKKNStudentById,
	// Learner Profiles
	fetchMyJKKNLearnerProfiles,
	fetchAllMyJKKNLearnerProfiles,
	fetchMyJKKNLearnerProfileById,
	// Staff
	fetchMyJKKNStaff,
	fetchAllMyJKKNStaff,
	fetchMyJKKNStaffById,
} from '@/services/myjkkn-service'
