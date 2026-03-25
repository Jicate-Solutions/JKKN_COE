import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Bulk Reassign Registrations API
 * Allows reassigning exam registrations to correct session/course_offering
 */

// POST: Bulk reassign registrations to a new session
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			registration_ids,        // Array of registration IDs to reassign
			new_examination_session_id,  // New session to assign to
			new_course_offering_id,  // Optional: specific course_offering_id (if not provided, will be looked up)
		} = body

		// Validation
		if (!registration_ids || !Array.isArray(registration_ids) || registration_ids.length === 0) {
			return NextResponse.json({
				error: 'registration_ids must be a non-empty array'
			}, { status: 400 })
		}

		if (!new_examination_session_id) {
			return NextResponse.json({
				error: 'new_examination_session_id is required'
			}, { status: 400 })
		}

		// Get the new session details
		const { data: newSession, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id, session_code, session_name, institutions_id')
			.eq('id', new_examination_session_id)
			.single()

		if (sessionError || !newSession) {
			return NextResponse.json({
				error: 'Invalid examination session ID'
			}, { status: 400 })
		}

		// Get existing registrations
		const { data: existingRegs, error: regsError } = await supabase
			.from('exam_registrations')
			.select(`
				id,
				institutions_id,
				examination_session_id,
				course_offering_id,
				stu_register_no,
				student_name,
				program_code,
				course_code,
				course_offering:course_offerings(
					id,
					course_code,
					program_code
				)
			`)
			.in('id', registration_ids)

		if (regsError) {
			console.error('Error fetching registrations:', regsError)
			return NextResponse.json({
				error: 'Failed to fetch registrations'
			}, { status: 500 })
		}

		if (!existingRegs || existingRegs.length === 0) {
			return NextResponse.json({
				error: 'No registrations found with the provided IDs'
			}, { status: 404 })
		}

		// Process each registration
		const results = {
			success: [] as string[],
			failed: [] as { id: string; error: string }[],
			skipped: [] as { id: string; reason: string }[]
		}

		for (const reg of existingRegs) {
			try {
				// Check if already in the target session
				if (reg.examination_session_id === new_examination_session_id) {
					results.skipped.push({
						id: reg.id,
						reason: 'Already in target session'
					})
					continue
				}

				// Verify institution match
				if (reg.institutions_id !== newSession.institutions_id) {
					results.failed.push({
						id: reg.id,
						error: 'Institution mismatch: registration institution does not match target session institution'
					})
					continue
				}

				let targetCourseOfferingId = new_course_offering_id

				// If no specific course_offering_id provided, look up matching one in new session
				if (!targetCourseOfferingId) {
					const courseCode = reg.course_code || reg.course_offering?.course_code
					const programCode = reg.program_code || reg.course_offering?.program_code

					if (!courseCode) {
						results.failed.push({
							id: reg.id,
							error: 'Cannot determine course_code for lookup'
						})
						continue
					}

					// Find matching course_offering in new session
					let lookupQuery = supabase
						.from('course_offerings')
						.select('id, course_code, program_code')
						.eq('institutions_id', reg.institutions_id)
						.eq('examination_session_id', new_examination_session_id)
						.eq('course_code', courseCode)

					// If program_code is available, use it for more precise matching
					if (programCode) {
						lookupQuery = lookupQuery.eq('program_code', programCode)
					}

					const { data: matchingOfferings, error: offeringError } = await lookupQuery

					if (offeringError) {
						results.failed.push({
							id: reg.id,
							error: `Lookup error: ${offeringError.message}`
						})
						continue
					}

					if (!matchingOfferings || matchingOfferings.length === 0) {
						results.failed.push({
							id: reg.id,
							error: `No matching course_offering found for course "${courseCode}" in session "${newSession.session_code}"`
						})
						continue
					}

					// Use the first matching offering
					targetCourseOfferingId = matchingOfferings[0].id
				}

				// Update the registration
				const { error: updateError } = await supabase
					.from('exam_registrations')
					.update({
						examination_session_id: new_examination_session_id,
						course_offering_id: targetCourseOfferingId,
						session_code: newSession.session_code,
						updated_at: new Date().toISOString()
					})
					.eq('id', reg.id)

				if (updateError) {
					// Handle duplicate key violation
					if (updateError.code === '23505') {
						results.failed.push({
							id: reg.id,
							error: 'Duplicate: Registration already exists in target session for this student/course'
						})
					} else {
						results.failed.push({
							id: reg.id,
							error: `Update failed: ${updateError.message}`
						})
					}
					continue
				}

				results.success.push(reg.id)

			} catch (err) {
				results.failed.push({
					id: reg.id,
					error: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown'}`
				})
			}
		}

		return NextResponse.json({
			message: 'Bulk reassignment completed',
			target_session: {
				id: newSession.id,
				session_code: newSession.session_code,
				session_name: newSession.session_name
			},
			results: {
				total: registration_ids.length,
				success: results.success.length,
				failed: results.failed.length,
				skipped: results.skipped.length,
				details: results
			}
		})

	} catch (e) {
		console.error('Bulk reassign API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// GET: Preview what will happen with reassignment (dry run)
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const registration_ids = searchParams.get('ids')?.split(',').filter(Boolean)
		const new_examination_session_id = searchParams.get('new_session_id')

		if (!registration_ids || registration_ids.length === 0) {
			return NextResponse.json({
				error: 'ids query parameter required (comma-separated)'
			}, { status: 400 })
		}

		if (!new_examination_session_id) {
			return NextResponse.json({
				error: 'new_session_id query parameter required'
			}, { status: 400 })
		}

		// Get session info
		const { data: newSession } = await supabase
			.from('examination_sessions')
			.select('id, session_code, session_name, institutions_id')
			.eq('id', new_examination_session_id)
			.single()

		if (!newSession) {
			return NextResponse.json({
				error: 'Invalid session ID'
			}, { status: 400 })
		}

		// Get registrations
		const { data: regs } = await supabase
			.from('exam_registrations')
			.select(`
				id,
				stu_register_no,
				student_name,
				institutions_id,
				examination_session_id,
				course_code,
				program_code,
				examination_session:examination_sessions(session_code, session_name),
				course_offering:course_offerings(course_code, program_code)
			`)
			.in('id', registration_ids)

		if (!regs || regs.length === 0) {
			return NextResponse.json({
				error: 'No registrations found'
			}, { status: 404 })
		}

		// Preview results
		const preview = await Promise.all(regs.map(async (reg) => {
			const courseCode = reg.course_code || reg.course_offering?.course_code
			const programCode = reg.program_code || reg.course_offering?.program_code

			// Check for matching course_offering in target session
			const { data: matchingOfferings } = await supabase
				.from('course_offerings')
				.select('id, course_code, program_code')
				.eq('institutions_id', reg.institutions_id)
				.eq('examination_session_id', new_examination_session_id)
				.eq('course_code', courseCode || '')

			const hasMatch = matchingOfferings && matchingOfferings.length > 0
			const alreadyInSession = reg.examination_session_id === new_examination_session_id

			return {
				id: reg.id,
				stu_register_no: reg.stu_register_no,
				student_name: reg.student_name,
				current_session: reg.examination_session?.session_code,
				course_code: courseCode,
				program_code: programCode,
				will_succeed: hasMatch && !alreadyInSession,
				reason: alreadyInSession
					? 'Already in target session'
					: hasMatch
						? 'Matching course_offering found'
						: `No matching course_offering for ${courseCode} in target session`
			}
		}))

		return NextResponse.json({
			target_session: {
				id: newSession.id,
				session_code: newSession.session_code,
				session_name: newSession.session_name
			},
			preview,
			summary: {
				total: preview.length,
				will_succeed: preview.filter(p => p.will_succeed).length,
				will_fail: preview.filter(p => !p.will_succeed).length
			}
		})

	} catch (e) {
		console.error('Preview API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
