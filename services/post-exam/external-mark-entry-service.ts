/**
 * External Mark Entry Service
 * Simple utilities for mark conversion
 */

/**
 * Convert number to words format (e.g., 75 -> "SEVEN FIVE")
 */
export function numberToWords(num: number): string {
	const digitWords = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE']
	const numStr = num.toString().padStart(2, '0')
	const words = numStr.split('').map(digit => digitWords[parseInt(digit)])
	return words.join(' ')
}

/**
 * Save external marks
 */
export async function saveExternalMarks(data: {
	institutions_id: string
	examination_session_id: string
	program_id: string
	course_id: string
	packet_no: string
	marks_out_of: number
	marks: Array<{
		student_dummy_number_id: string
		exam_registration_id: string
		dummy_number: string
		total_marks_obtained: number
		total_marks_in_words: string
		remarks: 'PASS' | 'FAIL'
	}>
}): Promise<{ success: boolean; message: string; data?: any }> {
	const response = await fetch('/api/post-exam/external-marks/save', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(data),
	})

	if (!response.ok) {
		const error = await response.json()
		throw new Error(error.error || 'Failed to save marks')
	}

	return response.json()
}
