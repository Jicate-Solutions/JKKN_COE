import type { ValidationResult } from '@/types/validate-timetable'

export async function runTimetableValidation(
	institutionsId: string,
	examinationSessionId: string
): Promise<ValidationResult> {
	const response = await fetch('/api/exam-management/validate-timetable', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			institutions_id: institutionsId,
			examination_session_id: examinationSessionId,
		}),
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Validation failed')
	}

	return response.json()
}

export function hasValidationErrors(result: ValidationResult): boolean {
	return result.summary.errors_count > 0
}

export function hasValidationWarnings(result: ValidationResult): boolean {
	return result.summary.warnings_count > 0
}

export function hasAnyIssues(result: ValidationResult): boolean {
	return result.summary.errors_count > 0 || result.summary.warnings_count > 0
}
