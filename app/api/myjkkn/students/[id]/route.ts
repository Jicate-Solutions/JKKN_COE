import { NextRequest, NextResponse } from 'next/server'

const MYJKKN_BASE_URL = 'https://www.jkkn.ai/api'
const MYJKKN_API_KEY = process.env.MYJKKN_API_KEY || 'jk_2f13e1385d431c1368c69ef68780b11e_mh4h4ml7'

/**
 * GET /api/myjkkn/students/[id]
 * Fetches detailed information for a single student from MyJKKN API
 *
 * Path params:
 * - id: string - Student ID
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: { id: string } }
) {
	try {
		const studentId = params.id

		if (!studentId) {
			return NextResponse.json(
				{ error: 'Student ID is required' },
				{ status: 400 }
			)
		}

		const url = `${MYJKKN_BASE_URL}/api-management/students/${studentId}`

		const response = await fetch(url, {
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
				return NextResponse.json(
					{ error: 'Invalid API key. Please check your MyJKKN API credentials.' },
					{ status: 401 }
				)
			}

			if (response.status === 403) {
				return NextResponse.json(
					{ error: 'Access forbidden. Please check your API key permissions.' },
					{ status: 403 }
				)
			}

			if (response.status === 404) {
				return NextResponse.json(
					{ error: 'Student not found' },
					{ status: 404 }
				)
			}

			if (response.status >= 500) {
				return NextResponse.json(
					{ error: 'MyJKKN API server error. Please try again later.' },
					{ status: 500 }
				)
			}

			return NextResponse.json(
				{ error: `Failed to fetch student details: ${response.statusText}` },
				{ status: response.status }
			)
		}

		const data = await response.json()
		return NextResponse.json(data, { status: 200 })
	} catch (error) {
		console.error('MyJKKN Student Details API Error:', error)

		const errorMessage =
			error instanceof Error ? error.message : 'Failed to fetch student details from MyJKKN API'

		return NextResponse.json({ error: errorMessage }, { status: 500 })
	}
}
