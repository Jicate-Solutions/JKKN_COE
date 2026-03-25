/**
 * Exam Rooms Service Layer
 *
 * This module handles all API calls for the exam-rooms module.
 * It provides a clean interface for the UI layer to interact with the backend.
 */

import type { ExamRoom, Institution, ExamRoomFormData } from '@/types/exam-rooms'

/**
 * Fetches all exam rooms from the API
 * @returns Promise<ExamRoom[]>
 */
export async function fetchExamRooms(): Promise<ExamRoom[]> {
	const response = await fetch('/api/exam-management/exam-rooms')
	if (!response.ok) {
		throw new Error('Failed to fetch exam rooms')
	}
	return response.json()
}

/**
 * Fetches all institutions from the API
 * @returns Promise<Institution[]>
 */
export async function fetchInstitutions(): Promise<Institution[]> {
	const response = await fetch('/api/master/institutions')
	if (!response.ok) {
		throw new Error('Failed to fetch institutions')
	}
	return response.json()
}

/**
 * Creates a new exam room
 * @param data - Exam room form data
 * @returns Promise<ExamRoom>
 */
export async function createExamRoom(data: ExamRoomFormData): Promise<ExamRoom> {
	const payload = {
		...data,
		room_order: Number(data.room_order),
		seating_capacity: Number(data.seating_capacity),
		exam_capacity: Number(data.exam_capacity),
		rows: Number(data.rows),
		columns: Number(data.columns),
		facilities: data.facilities ? JSON.parse(data.facilities) : null,
	}

	const response = await fetch('/api/exam-management/exam-rooms', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to create exam room')
	}

	return response.json()
}

/**
 * Updates an existing exam room
 * @param data - Exam room form data (with id)
 * @returns Promise<ExamRoom>
 */
export async function updateExamRoom(data: ExamRoomFormData): Promise<ExamRoom> {
	const payload = {
		...data,
		room_order: Number(data.room_order),
		seating_capacity: Number(data.seating_capacity),
		exam_capacity: Number(data.exam_capacity),
		rows: Number(data.rows),
		columns: Number(data.columns),
		facilities: data.facilities ? JSON.parse(data.facilities) : null,
	}

	const response = await fetch('/api/exam-management/exam-rooms', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to update exam room')
	}

	return response.json()
}

/**
 * Deletes an exam room
 * @param id - Exam room ID
 * @returns Promise<void>
 */
export async function deleteExamRoom(id: string): Promise<void> {
	const response = await fetch(`/api/exam-management/exam-rooms?id=${id}`, {
		method: 'DELETE',
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to delete exam room')
	}
}
