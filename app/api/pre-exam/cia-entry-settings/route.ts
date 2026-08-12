import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

const MARK_ENTRY_TYPES = ['direct', 'question_wise']

/**
 * Validates how marks are keyed in for a round. Question-wise rounds take their question
 * list from the round's question paper (ia_question_papers.questions), so nothing about
 * questions is stored on the setting itself.
 * Returns an error message, or null when the round is valid.
 */
function validateRoundMarkEntry(round: any): string | null {
	const entryType = round.mark_entry_type || 'direct'
	if (!MARK_ENTRY_TYPES.includes(entryType)) {
		return `${round.round_name}: mark_entry_type must be 'direct' or 'question_wise'`
	}
	return null
}

// GET: Fetch CIA entry settings with filters
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const supabase = getSupabaseServer()

		const institutionsId = searchParams.get('institutions_id')
		const institutionCode = searchParams.get('institution_code')
		const sessionId = searchParams.get('examination_session_id')
		const programCode = searchParams.get('program_code')
		const courseType = searchParams.get('course_type')

		let query = supabase
			.from('cia_entry_settings')
			.select('*')
			.order('created_at', { ascending: false })

		// Institution filter
		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		} else if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		// Session filter
		if (sessionId) {
			query = query.eq('examination_session_id', sessionId)
		}

		// Active only
		query = query.eq('is_active', true)

		const { data, error } = await query.range(0, 999)

		if (error) {
			console.error('Error fetching CIA entry settings:', error)
			return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
		}

		let results = data || []

		// Client-side filter by program_code (using ANY on text array)
		if (programCode) {
			results = results.filter((s: any) =>
				Array.isArray(s.program_codes) && s.program_codes.includes(programCode)
			)
		}

		// Client-side filter by course_type (now an array)
		if (courseType) {
			results = results.filter((s: any) => {
				const types = Array.isArray(s.course_type) ? s.course_type : []
				return types.length === 0 || types.includes(courseType)
			})
		}

		return NextResponse.json(results)
	} catch (error) {
		console.error('CIA entry settings GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST: Create a new CIA entry setting
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			institutions_id,
			institution_code,
			examination_session_id,
			setting_name,
			regulation_code,
			regulation_id,
			program_codes,
			course_type,
			use_course_max,
			total_rounds,
			cia_rounds,
			conversion_rule_id,
			created_by,
		} = body

		// Validation
		if (!institutions_id || !institution_code) {
			return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		}
		if (!examination_session_id) {
			return NextResponse.json({ error: 'Exam session is required' }, { status: 400 })
		}
		if (!setting_name?.trim()) {
			return NextResponse.json({ error: 'Setting name is required' }, { status: 400 })
		}
		if (!Array.isArray(program_codes) || program_codes.length === 0) {
			return NextResponse.json({ error: 'At least one program must be selected' }, { status: 400 })
		}
		if (!Array.isArray(cia_rounds) || cia_rounds.length === 0) {
			return NextResponse.json({ error: 'At least one CIA round must be configured' }, { status: 400 })
		}

		// Validate each round has components + v2 session dates
		for (const round of cia_rounds) {
			if (!round.round || !round.round_name) {
				return NextResponse.json({ error: 'Each CIA round must have a round number and name' }, { status: 400 })
			}
			if (!Array.isArray(round.components) || round.components.length === 0) {
				return NextResponse.json({ error: `${round.round_name} must have at least one component` }, { status: 400 })
			}
			for (const comp of round.components) {
				if (!comp.code || !comp.name) {
					return NextResponse.json({ error: `Invalid component in ${round.round_name}: code and name are required` }, { status: 400 })
				}
				if (!use_course_max && (comp.max_marks == null || comp.max_marks <= 0)) {
					return NextResponse.json({ error: `${round.round_name} → ${comp.name}: max marks must be > 0` }, { status: 400 })
				}
				// Validate attendance component periods
				if (comp.code === 'attendance') {
					if (comp.attendance_total_periods != null && comp.attendance_total_periods < 0) {
						return NextResponse.json({ error: `${round.round_name} → Attendance: total periods must be ≥ 0` }, { status: 400 })
					}
					if (comp.attendance_attended_periods != null && comp.attendance_attended_periods < 0) {
						return NextResponse.json({ error: `${round.round_name} → Attendance: attended periods must be ≥ 0` }, { status: 400 })
					}
					if (comp.attendance_total_periods != null && comp.attendance_attended_periods != null && comp.attendance_attended_periods > comp.attendance_total_periods) {
						return NextResponse.json({ error: `${round.round_name} → Attendance: attended periods cannot exceed total periods` }, { status: 400 })
					}
				}
			}
			// v2: validate session dates
			if (round.session_from && round.session_to && round.session_from > round.session_to) {
				return NextResponse.json({ error: `${round.round_name}: session_from must be ≤ session_to` }, { status: 400 })
			}
			if (round.entry_from && round.entry_to && round.entry_from > round.entry_to) {
				return NextResponse.json({ error: `${round.round_name}: entry_from must be ≤ entry_to` }, { status: 400 })
			}
			// v2: validate attendance periods
			if (round.total_periods != null && round.total_periods < 0) {
				return NextResponse.json({ error: `${round.round_name}: total_periods must be ≥ 0` }, { status: 400 })
			}
			if (round.attended_periods != null && round.attended_periods < 0) {
				return NextResponse.json({ error: `${round.round_name}: attended_periods must be ≥ 0` }, { status: 400 })
			}
			if (round.total_periods != null && round.attended_periods != null && round.attended_periods > round.total_periods) {
				return NextResponse.json({ error: `${round.round_name}: attended_periods cannot exceed total_periods` }, { status: 400 })
			}
			// Mark entry type
			const entryError = validateRoundMarkEntry(round)
			if (entryError) {
				return NextResponse.json({ error: entryError }, { status: 400 })
			}
		}

		const { data, error } = await supabase
			.from('cia_entry_settings')
			.insert({
				institutions_id,
				institution_code,
				examination_session_id,
				setting_name: setting_name.trim(),
				regulation_code: regulation_code || null,
				regulation_id: regulation_id || null,
				program_codes,
				course_type: Array.isArray(course_type) ? course_type : [],
				use_course_max: use_course_max || false,
				total_rounds: total_rounds || cia_rounds.length,
				cia_rounds,
				conversion_rule_id: conversion_rule_id || null,
				created_by,
				is_active: true,
			})
			.select()
			.single()

		if (error) {
			console.error('Error creating CIA entry setting:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'A setting with this configuration already exists' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create setting' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('CIA entry settings POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT: Update an existing CIA entry setting
export async function PUT(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()
		const { id, ...updateData } = body

		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		// Don't allow changing institution after creation
		delete updateData.institutions_id
		delete updateData.institution_code
		// Remove form-only fields that don't exist in DB
		delete updateData.course_types
		delete updateData.created_by

		// Validate cia_rounds if provided
		if (updateData.cia_rounds) {
			if (!Array.isArray(updateData.cia_rounds) || updateData.cia_rounds.length === 0) {
				return NextResponse.json({ error: 'At least one CIA round must be configured' }, { status: 400 })
			}
			for (const round of updateData.cia_rounds) {
				if (!round.round || !round.round_name) {
					return NextResponse.json({ error: 'Each CIA round must have a round number and name' }, { status: 400 })
				}
				if (!Array.isArray(round.components) || round.components.length === 0) {
					return NextResponse.json({ error: `${round.round_name} must have at least one component` }, { status: 400 })
				}
				if (round.session_from && round.session_to && round.session_from > round.session_to) {
					return NextResponse.json({ error: `${round.round_name}: session_from must be ≤ session_to` }, { status: 400 })
				}
				if (round.entry_from && round.entry_to && round.entry_from > round.entry_to) {
					return NextResponse.json({ error: `${round.round_name}: entry_from must be ≤ entry_to` }, { status: 400 })
				}
				if (round.total_periods != null && round.total_periods < 0) {
					return NextResponse.json({ error: `${round.round_name}: total_periods must be ≥ 0` }, { status: 400 })
				}
				if (round.attended_periods != null && round.attended_periods < 0) {
					return NextResponse.json({ error: `${round.round_name}: attended_periods must be ≥ 0` }, { status: 400 })
				}
				if (round.total_periods != null && round.attended_periods != null && round.attended_periods > round.total_periods) {
					return NextResponse.json({ error: `${round.round_name}: attended_periods cannot exceed total_periods` }, { status: 400 })
				}
				// Validate per-component attendance periods
				for (const comp of round.components) {
					if (comp.code === 'attendance') {
						if (comp.attendance_total_periods != null && comp.attendance_total_periods < 0) {
							return NextResponse.json({ error: `${round.round_name} → Attendance: total periods must be ≥ 0` }, { status: 400 })
						}
						if (comp.attendance_attended_periods != null && comp.attendance_attended_periods < 0) {
							return NextResponse.json({ error: `${round.round_name} → Attendance: attended periods must be ≥ 0` }, { status: 400 })
						}
						if (comp.attendance_total_periods != null && comp.attendance_attended_periods != null && comp.attendance_attended_periods > comp.attendance_total_periods) {
							return NextResponse.json({ error: `${round.round_name} → Attendance: attended periods cannot exceed total periods` }, { status: 400 })
						}
					}
				}
				// Mark entry type
				const entryError = validateRoundMarkEntry(round)
				if (entryError) {
					return NextResponse.json({ error: entryError }, { status: 400 })
				}
			}
			// Sync total_rounds
			updateData.total_rounds = updateData.cia_rounds.length
		}
		// Allow updating conversion_rule_id (null clears it)
		if ('conversion_rule_id' in updateData) {
			updateData.conversion_rule_id = updateData.conversion_rule_id || null
		}

		if (updateData.setting_name) {
			updateData.setting_name = updateData.setting_name.trim()
		}
		// Ensure course_type is always an array
		if (updateData.course_type && !Array.isArray(updateData.course_type)) {
			updateData.course_type = [updateData.course_type]
		}

		const { data, error } = await supabase
			.from('cia_entry_settings')
			.update(updateData)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Error updating CIA entry setting:', error)
			return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('CIA entry settings PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE: Delete a CIA entry setting
export async function DELETE(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		// Check if any cia_marks reference this setting's config
		// (soft check — we don't have a direct FK, but we can check by session)
		const { data: setting } = await supabase
			.from('cia_entry_settings')
			.select('examination_session_id, institutions_id')
			.eq('id', id)
			.single()

		if (setting) {
			const { data: existingMarks } = await supabase
				.from('cia_marks')
				.select('id')
				.eq('examination_session_id', setting.examination_session_id)
				.eq('institutions_id', setting.institutions_id)
				.limit(1)

			if (existingMarks && existingMarks.length > 0) {
				return NextResponse.json({
					error: 'Cannot delete — marks have already been entered using this setting. Deactivate it instead.'
				}, { status: 400 })
			}
		}

		const { error } = await supabase
			.from('cia_entry_settings')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting CIA entry setting:', error)
			return NextResponse.json({ error: 'Failed to delete setting' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('CIA entry settings DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
