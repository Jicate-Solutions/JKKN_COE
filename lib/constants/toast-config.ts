/**
 * Toast Configuration Constants
 *
 * Centralized configuration for toast notifications across the application.
 * Ensures consistency in messaging, styling, and behavior.
 */

// Common entity names used across the application
export const ENTITY_NAMES = {
	course: 'Course',
	courses: 'Courses',
	department: 'Department',
	departments: 'Departments',
	degree: 'Degree',
	degrees: 'Degrees',
	institution: 'Institution',
	institutions: 'Institutions',
	program: 'Program',
	programs: 'Programs',
	regulation: 'Regulation',
	regulations: 'Regulations',
	section: 'Section',
	sections: 'Sections',
	semester: 'Semester',
	semesters: 'Semesters',
	student: 'Student',
	students: 'Students',
	courseMapping: 'Course Mapping',
	courseMappings: 'Course Mappings',
	user: 'User',
	users: 'Users',
	role: 'Role',
	roles: 'Roles',
	permission: 'Permission',
	permissions: 'Permissions'
} as const

// Standard success messages with emojis
export const SUCCESS_MESSAGES = {
	create: '✅ Created Successfully',
	update: '✅ Updated Successfully',
	delete: '✅ Deleted Successfully',
	save: '✅ Saved Successfully',
	upload: '✅ Upload Complete',
	download: '✅ Download Complete',
	export: '✅ Export Complete',
	import: '✅ Import Complete',
	copy: '✅ Copied Successfully',
	activate: '✅ Activated Successfully',
	deactivate: '✅ Deactivated Successfully',
	approve: '✅ Approved Successfully',
	reject: '✅ Rejected Successfully',
	submit: '✅ Submitted Successfully',
	send: '✅ Sent Successfully',
	sync: '✅ Synchronized Successfully',
	restore: '✅ Restored Successfully',
	reset: '✅ Reset Successfully'
} as const

// Standard warning messages with emojis
export const WARNING_MESSAGES = {
	validation: '⚠️ Validation Error',
	partialSuccess: '⚠️ Partial Success',
	duplicateFound: '⚠️ Duplicate Found',
	dataIncomplete: '⚠️ Incomplete Data',
	confirmAction: '⚠️ Confirm Action',
	unsavedChanges: '⚠️ Unsaved Changes',
	limitExceeded: '⚠️ Limit Exceeded',
	deprecatedFeature: '⚠️ Deprecated Feature',
	connectionSlow: '⚠️ Slow Connection'
} as const

// Standard error messages with emojis
export const ERROR_MESSAGES = {
	generic: '❌ Error',
	createFailed: '❌ Failed to Create',
	updateFailed: '❌ Failed to Update',
	deleteFailed: '❌ Failed to Delete',
	saveFailed: '❌ Save Failed',
	uploadFailed: '❌ Upload Failed',
	downloadFailed: '❌ Download Failed',
	exportFailed: '❌ Export Failed',
	importFailed: '❌ Import Failed',
	validationFailed: '❌ Validation Failed',
	authFailed: '❌ Authentication Failed',
	permissionDenied: '❌ Permission Denied',
	notFound: '❌ Not Found',
	networkError: '❌ Network Error',
	serverError: '❌ Server Error',
	timeout: '❌ Request Timeout'
} as const

// Info messages with emojis
export const INFO_MESSAGES = {
	loading: '⏳ Loading...',
	processing: '⏳ Processing...',
	saving: '💾 Saving...',
	uploading: '📤 Uploading...',
	downloading: '📥 Downloading...',
	deleting: '🗑️ Deleting...',
	searching: '🔍 Searching...',
	fetching: '📡 Fetching data...',
	sending: '📨 Sending...',
	preparing: '🔧 Preparing...',
	ready: 'ℹ️ Ready',
	info: 'ℹ️ Information',
	tip: '💡 Tip',
	help: '❓ Help'
} as const

// Common validation messages
export const VALIDATION_MESSAGES = {
	required: 'This field is required',
	invalidFormat: 'Invalid format',
	tooShort: 'Value is too short',
	tooLong: 'Value is too long',
	invalidEmail: 'Invalid email address',
	invalidUrl: 'Invalid URL',
	invalidNumber: 'Must be a valid number',
	outOfRange: 'Value is out of range',
	duplicateValue: 'This value already exists',
	invalidReference: 'Invalid reference',
	invalidDate: 'Invalid date',
	pastDate: 'Date cannot be in the past',
	futureDate: 'Date cannot be in the future',
	invalidSelection: 'Invalid selection',
	noSelection: 'Please select an option',
	minSelection: 'Select at least {{count}} option(s)',
	maxSelection: 'Select at most {{count}} option(s)',
	passwordMismatch: 'Passwords do not match',
	weakPassword: 'Password is too weak',
	invalidCredentials: 'Invalid credentials',
	sessionExpired: 'Session expired. Please login again.',
	noPermission: 'You do not have permission to perform this action'
} as const

// Database error code mappings
export const DB_ERROR_CODES = {
	'23505': 'Duplicate entry. This record already exists.',
	'23503': 'Invalid reference. The selected item does not exist.',
	'23502': 'Required field is missing.',
	'23514': 'Invalid value. Please check your input.',
	'42P01': 'Database table not found.',
	'42703': 'Database column not found.',
	'42883': 'Database function not found.',
	'22P02': 'Invalid input syntax.',
	'22003': 'Numeric value out of range.',
	'22007': 'Invalid date/time format.',
	'28000': 'Invalid authorization.',
	'28P01': 'Invalid password.',
	'3D000': 'Database does not exist.',
	'42501': 'Insufficient privileges.',
	'57014': 'Query cancelled due to timeout.',
	'PGRST301': 'JWT token is expired.',
	'PGRST302': 'JWT token is invalid.'
} as const

// Operation verb mappings for dynamic messages
export const OPERATION_VERBS = {
	create: { present: 'creating', past: 'created' },
	update: { present: 'updating', past: 'updated' },
	delete: { present: 'deleting', past: 'deleted' },
	save: { present: 'saving', past: 'saved' },
	upload: { present: 'uploading', past: 'uploaded' },
	download: { present: 'downloading', past: 'downloaded' },
	export: { present: 'exporting', past: 'exported' },
	import: { present: 'importing', past: 'imported' },
	fetch: { present: 'fetching', past: 'fetched' },
	load: { present: 'loading', past: 'loaded' },
	submit: { present: 'submitting', past: 'submitted' },
	approve: { present: 'approving', past: 'approved' },
	reject: { present: 'rejecting', past: 'rejected' },
	activate: { present: 'activating', past: 'activated' },
	deactivate: { present: 'deactivating', past: 'deactivated' }
} as const

// Default toast durations (in milliseconds)
export const TOAST_DURATIONS = {
	instant: 1500,
	short: 3000,
	normal: 5000,
	long: 6000,
	veryLong: 8000,
	persistent: undefined // Won't auto-dismiss
} as const

// Toast style classes
export const TOAST_STYLES = {
	success: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
	warning: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
	error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
	info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200',
	neutral: 'bg-gray-50 border-gray-200 text-gray-800 dark:bg-gray-900/20 dark:border-gray-800 dark:text-gray-200'
} as const

// Common file upload errors
export const UPLOAD_ERRORS = {
	fileTooLarge: 'File size exceeds the maximum limit',
	invalidFileType: 'Invalid file type. Please upload a valid file',
	noFile: 'No file selected',
	corruptFile: 'File appears to be corrupted',
	emptyFile: 'File is empty',
	parseError: 'Failed to parse file contents',
	invalidStructure: 'File structure is invalid',
	missingHeaders: 'Required headers are missing',
	invalidData: 'File contains invalid data',
	tooManyRows: 'File contains too many rows',
	networkError: 'Failed to upload file. Check your connection.'
} as const

// Bulk operation messages
export const BULK_MESSAGES = {
	selectItems: 'Please select items to perform this action',
	confirmDelete: 'Are you sure you want to delete {{count}} item(s)?',
	processing: 'Processing {{current}} of {{total}} items...',
	completed: 'Successfully processed {{success}} of {{total}} items',
	failed: 'Failed to process {{failed}} of {{total}} items',
	partial: '{{success}} succeeded, {{failed}} failed out of {{total}} items'
} as const

export default {
	ENTITY_NAMES,
	SUCCESS_MESSAGES,
	WARNING_MESSAGES,
	ERROR_MESSAGES,
	INFO_MESSAGES,
	VALIDATION_MESSAGES,
	DB_ERROR_CODES,
	OPERATION_VERBS,
	TOAST_DURATIONS,
	TOAST_STYLES,
	UPLOAD_ERRORS,
	BULK_MESSAGES
}