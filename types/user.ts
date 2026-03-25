/**
 * User Type Definitions
 *
 * This module contains all TypeScript interfaces for the user module.
 * These types are used across the application for type safety and consistency.
 */

/**
 * User - Main entity representing a user account
 */
export interface User {
	id: string
	email: string
	full_name: string
	username?: string
	avatar_url?: string
	bio?: string
	website?: string
	location?: string
	date_of_birth?: string
	phone?: string
	phone_number?: string
	is_active: boolean
	is_verified: boolean
	role?: string
	institution_id?: string
	institution_code?: string
	preferences?: Record<string, unknown>
	metadata?: Record<string, unknown>
	created_at: string
	updated_at: string
}

/**
 * Institution - Foreign key reference for institutions
 */
export interface Institution {
	id: string
	institution_code: string
	name: string
}

/**
 * Role - Foreign key reference for roles
 */
export interface Role {
	id: string
	name: string
}

/**
 * UserFormData - Form data structure for creating/updating users
 */
export interface UserFormData {
	email: string
	full_name: string
	username: string
	phone: string
	institution_id: string
	role: string
	is_active: boolean
	is_verified: boolean
}

/**
 * UserPayload - API payload structure for save operations
 */
export interface UserPayload {
	email: string
	full_name: string
	username?: string
	phone?: string
	institution_id?: string
	role?: string
	is_active: boolean
	is_verified: boolean
}
