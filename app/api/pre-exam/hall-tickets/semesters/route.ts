/**
 * Hall Ticket Semesters API
 *
 * GET /api/pre-exam/hall-tickets/semesters?institution_code=XXX&examination_session_id=YYY&program_code=ZZZ
 *
 * Returns distinct semesters derived from exam_registrations + course_offerings
 * where is_regular = true, registration_status = 'Approved', fee_paid = true.
 * This replaces the empty `semesters` table lookup for the hall tickets page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { ACTIVE_REGISTRATION_STATUSES } from '@/lib/exam-registration-status'

export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institution_code = searchParams.get('institution_code')
		const examination_session_id = searchParams.get('examination_session_id')
		const program_code = searchParams.get('program_code')

		if (!institution_code || !examination_session_id) {
			return NextResponse.json(
				{ error: 'institution_code and examination_session_id are required' },
				{ status: 400 }
			)
		}

		// Look up institution ID
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', institution_code)
			.single()

		if (instError || !institution) {
			return NextResponse.json(
				{ error: `Institution "${institution_code}" not found` },
				{ status: 404 }
			)
		}

		// Query: distinct semesters from exam_registrations (is_regular=true, Approved, fee_paid)
		// joined with course_offerings to get the semester number
		const { data, error } = await supabase.rpc('get_hall_ticket_semesters', {
			p_institutions_id: institution.id,
			p_examination_session_id: examination_session_id,
			p_program_code: program_code || null,
		})

		if (error) {
			// Fallback: direct query if RPC doesn't exist
			console.warn('[HallTicket Semesters] RPC not found, using direct query:', error.message)

			const { data: fallbackData, error: fallbackError } = await supabase
				.from('exam_registrations')
				.select('course_offering_id, is_regular, course_offerings(semester)')
				.eq('institutions_id', institution.id)
				.eq('examination_session_id', examination_session_id)
				.in('registration_status', ACTIVE_REGISTRATION_STATUSES)
				.eq('fee_paid', true)
				.eq('is_regular', true)
				.range(0, 49999)

			if (fallbackError) {
				console.error('[HallTicket Semesters] Fallback query error:', fallbackError)
				return NextResponse.json({ error: 'Failed to fetch semesters' }, { status: 500 })
			}

			// Apply program_code filter if provided
			let filtered = fallbackData || []
			if (program_code) {
				// Re-query with program_code filter
				const { data: filteredData } = await supabase
					.from('exam_registrations')
					.select('course_offering_id, is_regular, course_offerings(semester)')
					.eq('institutions_id', institution.id)
					.eq('examination_session_id', examination_session_id)
					.in('registration_status', ACTIVE_REGISTRATION_STATUSES)
					.eq('fee_paid', true)
					.eq('is_regular', true)
					.eq('program_code', program_code)
					.range(0, 49999)

				filtered = filteredData || []
			}

			// Extract distinct semester numbers
			const semesterSet = new Set<number>()
			for (const reg of filtered) {
				const co = reg.course_offerings as any
				if (co?.semester) {
					semesterSet.add(co.semester)
				}
			}

			const semesters = Array.from(semesterSet)
				.sort((a, b) => a - b)
				.map(semNum => {
					const yearNum = Math.ceil(semNum / 2)
					const yearLabels = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
					return {
						id: `sem-${semNum}`,
						semester_code: `SEM${semNum}`,
						semester_name: `Semester ${semNum}`,
						display_order: semNum,
						semester_group: yearLabels[yearNum - 1] || `Year ${yearNum}`,
					}
				})

			return NextResponse.json(semesters)
		}

		// RPC returned data - format it
		const semesters = (data || []).map((row: any) => {
			const semNum = row.semester
			const yearNum = Math.ceil(semNum / 2)
			const yearLabels = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
			return {
				id: `sem-${semNum}`,
				semester_code: `SEM${semNum}`,
				semester_name: `Semester ${semNum}`,
				display_order: semNum,
				semester_group: yearLabels[yearNum - 1] || `Year ${yearNum}`,
			}
		})

		return NextResponse.json(semesters)
	} catch (err) {
		console.error('[HallTicket Semesters] Error:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
