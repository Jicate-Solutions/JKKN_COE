/**
 * MyJKKN API Client
 * Handles authentication and data fetching from MyJKKN API system
 */

const MYJKKN_BASE_URL = 'https://www.jkkn.ai/api'
const MYJKKN_API_KEY = process.env.MYJKKN_API_KEY || 'jk_2f13e1385d431c1368c69ef68780b11e_mh4h4ml7'

export interface MyJKKNResponse<T> {
	data: T[]
	metadata: {
		page: number
		totalPages: number
		total: number
	}
}

export interface MyJKKNStudent {
	id: string
	first_name: string
	last_name: string
	roll_number: string
	institution: string
	department: string
	program: string
	is_profile_complete: boolean
}

export interface FetchStudentsParams {
	page?: number
	limit?: number
}

/**
 * Fetches students from MyJKKN API with pagination
 */
export async function fetchMyJKKNStudents(
	params: FetchStudentsParams = {}
): Promise<MyJKKNResponse<MyJKKNStudent>> {
	const { page = 1, limit = 20 } = params

	try {
		const url = new URL(`${MYJKKN_BASE_URL}/api-management/students`)
		url.searchParams.set('page', page.toString())
		url.searchParams.set('limit', limit.toString())

		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${MYJKKN_API_KEY}`,
				'Content-Type': 'application/json',
			},
			cache: 'no-store', // Always fetch fresh data
		})

		if (!response.ok) {
			const errorText = await response.text()
			console.error('MyJKKN API Error:', {
				status: response.status,
				statusText: response.statusText,
				body: errorText,
			})

			if (response.status === 401) {
				throw new Error('Invalid API key. Please check your MyJKKN API credentials.')
			}

			if (response.status === 403) {
				throw new Error('Access forbidden. Please check your API key permissions.')
			}

			if (response.status === 404) {
				throw new Error('API endpoint not found. Please verify the API URL.')
			}

			if (response.status >= 500) {
				throw new Error('MyJKKN API server error. Please try again later.')
			}

			throw new Error(`Failed to fetch students: ${response.statusText}`)
		}

		const data: MyJKKNResponse<MyJKKNStudent> = await response.json()
		return data
	} catch (error) {
		if (error instanceof Error) {
			throw error
		}
		throw new Error('An unexpected error occurred while fetching students from MyJKKN API')
	}
}

/**
 * Validates MyJKKN API key format
 */
export function validateAPIKey(apiKey: string): boolean {
	const pattern = /^jk_[a-f0-9]{32}_[a-z0-9]{8}$/
	return pattern.test(apiKey)
}

/**
 * Tests MyJKKN API connection
 */
export async function testMyJKKNConnection(): Promise<{ success: boolean; message: string }> {
	try {
		if (!MYJKKN_API_KEY) {
			return {
				success: false,
				message: 'API key not configured',
			}
		}

		if (!validateAPIKey(MYJKKN_API_KEY)) {
			return {
				success: false,
				message: 'Invalid API key format',
			}
		}

		await fetchMyJKKNStudents({ page: 1, limit: 1 })

		return {
			success: true,
			message: 'Connection successful',
		}
	} catch (error) {
		return {
			success: false,
			message: error instanceof Error ? error.message : 'Connection failed',
		}
	}
}
