/**
 * Custom Hooks Index
 * Export all custom hooks for easy importing
 *
 * Organized by COE module structure:
 * - common/ - Shared hooks used across all modules
 * - auth/ - Authentication and authorization hooks
 * - course-management/ - Course-related hooks
 * - exam-management/ - Examination-related hooks
 * - grading/ - Grading and result processing hooks
 * - master/ - Master data management hooks
 * - users/ - User management hooks
 * - mobile/ - Mobile-specific hooks
 */

// ============================================================================
// COMMON HOOKS (shared across all modules)
// ============================================================================

// Data Fetching Hooks
export { useAPI } from './common/use-api'
export { useCRUD } from './common/use-crud'
export { useDropdownData, useMultipleDropdowns } from './common/use-dropdown-data'

// Table Management Hooks
export { useDataTable } from './common/use-data-table'

// Form & UI Hooks
export { useSheet } from './common/use-sheet'
export { useConfirmDialog } from './common/use-confirm-dialog'

// Excel Hooks
export { useExcelImport } from './common/use-excel-import'
export { useExcelExport } from './common/use-excel-export'

// Utility Hooks
export { useDebounce } from './common/use-debounce'
export { useLocalStorage } from './common/use-local-storage'
export { useToggle } from './common/use-toggle'
export { useAsync } from './common/use-async'
export { useCopyToClipboard } from './common/use-copy-to-clipboard'
export { useBugReporter } from './common/use-bug-reporter'

// UI/UX Hooks
export {
	useMediaQuery,
	useIsMobile,
	useIsTablet,
	useIsDesktop,
	useIsDarkMode
} from './common/use-media-query'
export { useWindowSize } from './common/use-window-size'
export { useOnClickOutside } from './common/use-on-click-outside'
export { useScrollPosition, useScrollThreshold } from './common/use-scroll-position'

// Interaction Hooks
export { useKeyPress, useKeyCombo } from './common/use-key-press'
export { useEventListener } from './common/use-event-listener'
export { useInterval, useTimeout } from './common/use-interval'

// Data Manipulation Hooks
export { useArray } from './common/use-array'
export { useAdvancedFilter } from './common/use-advanced-filter'
export { useAdvancedSort } from './common/use-advanced-sort'

// Form Validation & Toast
export { useFormValidation } from './common/use-form-validation'
export { useToast } from './common/use-toast'

// ============================================================================
// AUTH HOOKS (authentication & authorization)
// ============================================================================

export { useAuthGuard } from './auth/use-auth-guard'
export { usePermissionSync } from './auth/use-permission-sync'
export { useSessionTimeout } from './auth/use-session-timeout'

// ============================================================================
// COURSE MANAGEMENT HOOKS
// ============================================================================

export { useCourseMappings } from './course-management/use-course-mapping'

// ============================================================================
// EXAM MANAGEMENT HOOKS
// ============================================================================

export { useExamSchedule } from './exam-management/use-exam-schedule'
export { useExamRooms } from './exam-management/use-exam-rooms'
export { useExamRegistrations } from './exam-management/use-exam-registrations'
export { useExamTimetables } from './exam-management/use-exam_timetable'

// ============================================================================
// GRADING HOOKS
// ============================================================================

export { useGradeCalculator } from './grading/use-grade-calculator'
export { useResultProcessor } from './grading/use-result-processor'

// ============================================================================
// MASTER DATA HOOKS
// ============================================================================

export { useRegulations } from './master/use-regulations'

// ============================================================================
// USER MANAGEMENT HOOKS
// ============================================================================

export { useStudents } from './users/use-students'

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type { ImportError, ImportSummary } from './common/use-excel-import'
export type { ValidationRule, FieldValidationRules, ValidationErrors } from './common/use-form-validation'
