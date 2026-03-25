import type { Regulation, RegulationFormData, InstitutionOption } from '@/types/regulations'

/**
 * Fetch all regulations from the API
 */
export async function fetchRegulations(): Promise<Regulation[]> {
	const response = await fetch('/api/regulations')

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to fetch regulations')
	}

	return response.json()
}

/**
 * Create a new regulation
 */
export async function createRegulation(data: RegulationFormData): Promise<Regulation> {
	const response = await fetch('/api/regulations', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		const errorMessage = errorData.error || errorData.details || 'Failed to create regulation'

		// Handle specific error cases
		if (errorMessage.includes('relation "regulations" does not exist')) {
			throw new Error('The regulations table needs to be created. Please contact your administrator.')
		}

		if (errorMessage.includes('duplicate key value')) {
			throw new Error('A regulation with this code already exists. Please use a different code.')
		}

		throw new Error(errorMessage)
	}

	return response.json()
}

/**
 * Update an existing regulation
 */
export async function updateRegulation(id: number, data: RegulationFormData): Promise<Regulation> {
	const response = await fetch('/api/regulations', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			id,
			...data
		})
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || errorData.details || 'Failed to update regulation')
	}

	return response.json()
}

/**
 * Delete a regulation by ID
 */
export async function deleteRegulation(id: number): Promise<void> {
	const response = await fetch(`/api/regulations/${id}`, {
		method: 'DELETE',
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to delete regulation')
	}
}

/**
 * Fetch institutions for dropdown
 */
export async function fetchInstitutions(): Promise<InstitutionOption[]> {
	const response = await fetch('/api/institutions')

	if (!response.ok) {
		console.error('Failed to fetch institutions:', response.status, response.statusText)
		return []
	}

	const data = await response.json()
	return Array.isArray(data)
		? data.filter((i: any) => i?.institution_code).map((i: any) => ({
			id: i.id,
			institution_code: i.institution_code,
			name: i.name
		}))
		: []
}
