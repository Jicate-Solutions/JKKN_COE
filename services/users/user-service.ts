/**
 * User Service Layer
 *
 * This module consolidates all API calls for the user module.
 * It provides a clean interface for fetching and managing users
 * and related entities (institutions, roles).
 */

import type {
	User,
	Institution,
	Role,
	UserPayload,
} from '@/types/user'

/**
 * Fetch all users with optional search query
 * @param searchTerm - Optional search query
 * @returns Promise<User[]>
 */
export async function fetchUsers(searchTerm?: string): Promise<User[]> {
	try {
		const url = searchTerm
			? `/api/users/users-list?q=${encodeURIComponent(searchTerm)}`
			: '/api/users/users-list'

		const response = await fetch(url, {
			cache: 'no-store',
			headers: {
				'Content-Type': 'application/json',
			}
		})

		if (!response.ok) {
			throw new Error(`Failed to fetch users: ${response.statusText}`)
		}

		const data = await response.json()

		if (Array.isArray(data)) {
			return data
		} else {
			console.error('Invalid response format:', data)
			return []
		}
	} catch (error) {
		console.error('Error fetching users:', error)
		throw error
	}
}

/**
 * Fetch all institutions with fallback to mock data
 * @returns Promise<Institution[]>
 */
export async function fetchInstitutions(): Promise<Institution[]> {
	try {
		const response = await fetch('/api/institutions')
		if (!response.ok) {
			throw new Error('Failed to fetch institutions')
		}
		const data = await response.json()
		return data
	} catch (error) {
		console.error('Error fetching institutions:', error)
		// Fallback to mock data on error
		return [
			{ id: "1", institution_code: "JKKN", name: "JKKN Main Campus" },
			{ id: "2", institution_code: "ENGG", name: "JKKN Engineering College" },
			{ id: "3", institution_code: "ONLINE", name: "JKKN Online Campus" }
		]
	}
}

/**
 * Fetch all roles with fallback to basic roles
 * @returns Promise<Role[]>
 */
export async function fetchRoles(): Promise<Role[]> {
	try {
		const response = await fetch('/api/users/roles')
		if (!response.ok) {
			throw new Error('Failed to fetch roles')
		}
		const data = await response.json()
		if (Array.isArray(data)) {
			return data
		}
		return []
	} catch (error) {
		console.error('Error fetching roles:', error)
		// Fallback basic roles
		return [
			{ id: 'role-user', name: 'user' },
			{ id: 'role-admin', name: 'admin' },
			{ id: 'role-moderator', name: 'moderator' },
		]
	}
}

/**
 * Create a new user
 * @param payload - User payload
 * @returns Promise<User>
 */
export async function createUser(
	payload: UserPayload
): Promise<User> {
	const response = await fetch('/api/users/users-list', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	})

	if (!response.ok) {
		const errorData = await response.json()
		throw new Error(errorData.error || 'Failed to create user')
	}

	return response.json()
}

/**
 * Update an existing user
 * @param id - User ID
 * @param payload - User payload
 * @returns Promise<User>
 */
export async function updateUser(
	id: string,
	payload: UserPayload
): Promise<User> {
	const response = await fetch(`/api/users/users-list/${id}`, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	})

	if (!response.ok) {
		const errorData = await response.json()
		throw new Error(errorData.error || 'Failed to update user')
	}

	return response.json()
}

/**
 * Delete a user by ID
 * @param id - User ID
 * @returns Promise<void>
 */
export async function deleteUser(id: string): Promise<void> {
	const response = await fetch(`/api/users/users-list/${id}`, {
		method: 'DELETE',
	})

	if (!response.ok) {
		const errorData = await response.json()
		throw new Error(errorData.error || 'Failed to delete user')
	}
}

/**
 * Toggle user active status
 * @param id - User ID
 * @param isActive - New active status
 * @returns Promise<User>
 */
export async function toggleUserStatus(
	id: string,
	isActive: boolean
): Promise<User> {
	const response = await fetch(`/api/users/users-list/${id}`, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ is_active: isActive }),
	})

	if (!response.ok) {
		const errorData = await response.json()
		throw new Error(errorData.error || 'Failed to update user status')
	}

	return response.json()
}
