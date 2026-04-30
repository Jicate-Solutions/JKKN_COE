import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

/**
 * Public Developer Portal API for CIA Entry Settings.
 *
 * Auth: X-API-Key-Id + X-API-Secret headers (Developer Portal)
 *
 * Permissions:
 *   GET    → cia-settings:read
 *   POST   → cia-settings:create
 *   PUT    → cia-settings:update
 *   DELETE → cia-settings:delete
 *
 * Endpoints:
 *   GET    /api/v1/cia-settings?institutions_id=&examination_session_id=&program_code=
 *   POST   /api/v1/cia-settings   (body: full setting payload)
 *   PUT    /api/v1/cia-settings   (body: { id, ...updateFields })
 *   DELETE /api/v1/cia-settings?id=
 */

function checkInstitutionAccess(context: ExternalApiContext, institutionsId: string): NextResponse | null {
	if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
		if (!context.allowedInstitutionIds.includes(institutionsId)) {
			return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
		}
	}
	return null
}

function validateRound(round: any, useCourseMax: boolean): string | null {
	if (!round.round || !round.round_name) {
		return 'Each CIA round must have a round number and name'
	}
	if (!Array.isArray(round.components) || round.components.length === 0) {
		return `${round.round_name} must have at least one component`
	}
	for (const comp of round.components) {
		if (!comp.code || !comp.name) {
			return `Invalid component in ${round.round_name}: code and name are required`
		}
		if (!useCourseMax && (comp.max_marks == null || comp.max_marks <= 0)) {
			return `${round.round_name} → ${comp.name}: max marks must be > 0`
		}
		if (comp.code === 'attendance') {
			if (comp.attendance_total_periods != null && comp.attendance_total_periods < 0) {
				return `${round.round_name} → Attendance: total periods must be ≥ 0`
			}
			if (comp.attendance_attended_periods != null && comp.attendance_attended_periods < 0) {
				return `${round.round_name} → Attendance: attended periods must be ≥ 0`
			}
			if (comp.attendance_total_periods != null && comp.attendance_attended_periods != null && comp.attendance_attended_periods > comp.attendance_total_periods) {
				return `${round.round_name} → Attendance: attended periods cannot exceed total periods`
			}
		}
	}
	if (round.entry_from && round.entry_to && round.entry_from > round.entry_to) {
		return `${round.round_name}: entry_from must be ≤ entry_to`
	}
	if (round.session_from && round.session_to && round.session_from > round.session_to) {
		return `${round.round_name}: session_from must be ≤ session_to`
	}
	if (round.total_periods != null && round.total_periods < 0) {
		return `${round.round_name}: total_periods must be ≥ 0`
	}
	if (round.attended_periods != null && round.attended_periods < 0) {
		return `${round.round_name}: attended_periods must be ≥ 0`
	}
	if (round.total_periods != null && round.attended_periods != null && round.attended_periods > round.total_periods) {
		return `${round.round_name}: attended_periods cannot exceed total_periods`
	}
	return null
}

/**
 * GET /api/v1/cia-settings
 * Query params: institutions_id (required), examination_session_id (required), program_code (optional)
 */
export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const programCode = searchParams.get('program_code')

		if (!institutionsId || !sessionId) {
			return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
		}

		const accessError = checkInstitutionAccess(context, institutionsId)
		if (accessError) return accessError

		const { data, error } = await supabase
			.from('cia_entry_settings')
			.select('*')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.eq('is_active', true)

		if (error) {
			console.error('Error fetching CIA settings:', error)
			return NextResponse.json({ error: 'Failed to fetch CIA settings' }, { status: 500 })
		}

		let results = data || []

		if (programCode) {
			results = results.filter((s: any) =>
				Array.isArray(s.program_codes) && s.program_codes.includes(programCode)
			)
		}

		return NextResponse.json(results)
	} catch (error) {
		console.error('CIA settings GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

/**
 * POST /api/v1/cia-settings
 * Creates a new CIA entry setting.
 */
export const POST = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
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

		const accessError = checkInstitutionAccess(context, institutions_id)
		if (accessError) return accessError

		for (const round of cia_rounds) {
			const err = validateRound(round, !!use_course_max)
			if (err) return NextResponse.json({ error: err }, { status: 400 })
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
				created_by: created_by || `api:${context.appName}`,
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
		console.error('CIA settings POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

/**
 * PUT /api/v1/cia-settings
 * Updates an existing CIA entry setting.
 * Body: { id, ...updateFields }
 */
export const PUT = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()
		const { id, ...updateData } = body

		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		const { data: existing, error: fetchError } = await supabase
			.from('cia_entry_settings')
			.select('institutions_id')
			.eq('id', id)
			.single()

		if (fetchError || !existing) {
			return NextResponse.json({ error: 'CIA setting not found' }, { status: 404 })
		}

		const accessError = checkInstitutionAccess(context, existing.institutions_id)
		if (accessError) return accessError

		// Disallow changing institution
		delete updateData.institutions_id
		delete updateData.institution_code
		delete updateData.created_by

		if (updateData.cia_rounds) {
			if (!Array.isArray(updateData.cia_rounds) || updateData.cia_rounds.length === 0) {
				return NextResponse.json({ error: 'At least one CIA round must be configured' }, { status: 400 })
			}
			const useCourseMax = !!updateData.use_course_max
			for (const round of updateData.cia_rounds) {
				const err = validateRound(round, useCourseMax)
				if (err) return NextResponse.json({ error: err }, { status: 400 })
			}
			updateData.total_rounds = updateData.cia_rounds.length
		}

		if ('conversion_rule_id' in updateData) {
			updateData.conversion_rule_id = updateData.conversion_rule_id || null
		}
		if (updateData.setting_name) {
			updateData.setting_name = updateData.setting_name.trim()
		}
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
		console.error('CIA settings PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

/**
 * DELETE /api/v1/cia-settings?id=<uuid>
 * Soft-deletes by setting is_active = false. Hard delete blocked if marks exist.
 */
export const DELETE = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		const { data: setting, error: fetchError } = await supabase
			.from('cia_entry_settings')
			.select('institutions_id, examination_session_id')
			.eq('id', id)
			.single()

		if (fetchError || !setting) {
			return NextResponse.json({ error: 'CIA setting not found' }, { status: 404 })
		}

		const accessError = checkInstitutionAccess(context, setting.institutions_id)
		if (accessError) return accessError

		// Block hard delete if marks exist; soft-deactivate instead
		const { data: existingMarks } = await supabase
			.from('cia_marks')
			.select('id')
			.eq('examination_session_id', setting.examination_session_id)
			.eq('institutions_id', setting.institutions_id)
			.limit(1)

		if (existingMarks && existingMarks.length > 0) {
			const { error: deactErr } = await supabase
				.from('cia_entry_settings')
				.update({ is_active: false })
				.eq('id', id)

			if (deactErr) {
				console.error('Error deactivating CIA setting:', deactErr)
				return NextResponse.json({ error: 'Failed to deactivate setting' }, { status: 500 })
			}
			return NextResponse.json({ success: true, deactivated: true, reason: 'Marks already entered — setting deactivated instead of deleted' })
		}

		const { error } = await supabase
			.from('cia_entry_settings')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting CIA entry setting:', error)
			return NextResponse.json({ error: 'Failed to delete setting' }, { status: 500 })
		}

		return NextResponse.json({ success: true, deactivated: false })
	} catch (error) {
		console.error('CIA settings DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
