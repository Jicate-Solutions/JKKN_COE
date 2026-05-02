/**
 * External Mark Entry Service
 * Simple utilities for mark conversion
 */

/**
 * Convert a number to digit-by-digit words for tamper-evident mark recording.
 *   0   → "ZERO"             (special-cased — no padding when total is zero)
 *   5   → "ZERO FIVE"        (single digits 1–9 are padded to two digits)
 *   28  → "TWO EIGHT"
 *   75  → "SEVEN FIVE"
 *   100 → "ONE ZERO ZERO"
 *   550 → "FIVE FIVE ZERO"
 *
 * Each digit is read out separately so altering a single character on a printed
 * sheet is visually obvious. Used across all CIA / internal / practical /
 * foil-sheet PDFs.
 */
export function numberToWords(num: number): string {
	const digitWords = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE']
	const n = Math.floor(Math.abs(num))
	if (n === 0) return num < 0 ? 'MINUS ZERO' : 'ZERO'
	const numStr = n.toString().padStart(2, '0')
	const words = numStr.split('').map(digit => digitWords[parseInt(digit, 10)]).join(' ')
	return num < 0 ? 'MINUS ' + words : words
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
