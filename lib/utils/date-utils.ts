/**
 * Date utility functions for Indian Standard Time (IST)
 */

/**
 * Get current date in IST timezone formatted as YYYY-MM-DD
 * @returns Date string in YYYY-MM-DD format
 */
export function getISTDate(): string {
	const now = new Date()

	// Convert to IST (UTC+5:30)
	const istOffset = 5.5 * 60 * 60 * 1000 // 5 hours 30 minutes in milliseconds
	const istTime = new Date(now.getTime() + istOffset)

	// Format as YYYY-MM-DD
	return istTime.toISOString().split('T')[0]
}

/**
 * Get current date and time in IST timezone
 * @returns Date object adjusted to IST
 */
export function getISTDateTime(): Date {
	const now = new Date()
	const istOffset = 5.5 * 60 * 60 * 1000 // 5 hours 30 minutes in milliseconds
	return new Date(now.getTime() + istOffset)
}

/**
 * Format a date to IST timezone string (YYYY-MM-DD)
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatToIST(date: Date): string {
	const istOffset = 5.5 * 60 * 60 * 1000
	const istTime = new Date(date.getTime() + istOffset)
	return istTime.toISOString().split('T')[0]
}
