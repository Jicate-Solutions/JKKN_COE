/**
 * PDF Settings API Routes
 *
 * GET  /api/pdf-settings?institution_code=XXX&template_name=YYY
 * GET  /api/pdf-settings?institution_code=XXX&template_type=default (fallback)
 * POST /api/pdf-settings - Create new PDF settings
 * PUT  /api/pdf-settings - Update existing PDF settings
 *
 * Template Resolution:
 * - If template_name is provided, exact match is used
 * - If only template_type is provided, most recent active template (by WEF) is returned
 * - Multiple templates of the same type are allowed for different WEF dates
 */

import { NextResponse, NextRequest } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import {
	validateCreatePdfSettings,
	validateUpdatePdfSettings,
	sanitizePdfSettingsHtml,
} from '@/lib/validations/pdf-settings'

// =============================================================================
// GET: Fetch PDF settings by institution code
// =============================================================================

export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institution_code = searchParams.get('institution_code')
		const template_name = searchParams.get('template_name')
		const template_type = searchParams.get('template_type') || 'default'
		const list_all = searchParams.get('list_all') === 'true' // List all templates for institution

		// If no institution_code provided, return all settings (admin use)
		if (!institution_code) {
			const { data, error } = await supabase
				.from('pdf_institution_settings')
				.select(
					`
					*,
					institution:institutions(id, institution_code, name)
				`
				)
				.order('institution_code', { ascending: true })
				.order('wef_date', { ascending: false })
				.order('wef_time', { ascending: false })

			if (error) {
				console.error('Error fetching all PDF settings:', error)
				return NextResponse.json({ error: 'Failed to fetch PDF settings' }, { status: 500 })
			}

			return NextResponse.json(data || [])
		}

		// If list_all=true, return all templates for this institution (for admin UI)
		if (list_all) {
			const { data, error } = await supabase
				.from('pdf_institution_settings')
				.select(
					`
					*,
					institution:institutions(id, institution_code, name)
				`
				)
				.eq('institution_code', institution_code)
				.order('template_type', { ascending: true })
				.order('wef_date', { ascending: false })
				.order('wef_time', { ascending: false })

			if (error) {
				console.error('Error fetching PDF settings list:', error)
				return NextResponse.json({ error: 'Failed to fetch PDF settings' }, { status: 500 })
			}

			return NextResponse.json(data || [])
		}

		// If template_name is provided, use exact match (preferred for PDF generation)
		if (template_name) {
			const { data, error } = await supabase
				.from('pdf_institution_settings')
				.select(
					`
					*,
					institution:institutions(id, institution_code, name)
				`
				)
				.eq('institution_code', institution_code)
				.eq('template_name', template_name)
				.eq('active', true)
				.single()

			if (error) {
				if (error.code === 'PGRST116') {
					return NextResponse.json({
						found: false,
						message: `No PDF template found with name "${template_name}". Using defaults.`,
						defaults: true,
					})
				}
				console.error('Error fetching PDF settings by name:', error)
				return NextResponse.json({ error: 'Failed to fetch PDF settings' }, { status: 500 })
			}

			return NextResponse.json(data)
		}

		// Fallback: WEF-based template resolution
		// Returns the most recent active template where WEF date/time has passed
		const now = new Date()
		const currentDate = now.toISOString().split('T')[0]
		const currentTime = now.toTimeString().slice(0, 5) // HH:mm format

		const { data, error } = await supabase
			.from('pdf_institution_settings')
			.select(
				`
				*,
				institution:institutions(id, institution_code, name)
			`
			)
			.eq('institution_code', institution_code)
			.eq('template_type', template_type)
			.eq('active', true)
			.or(`wef_date.lt.${currentDate},and(wef_date.eq.${currentDate},wef_time.lte.${currentTime})`)
			.order('wef_date', { ascending: false })
			.order('wef_time', { ascending: false })
			.limit(1)
			.single()

		if (error) {
			// If no settings found, return default structure
			if (error.code === 'PGRST116') {
				// Fetch institution details for default settings
				const { data: institution } = await supabase
					.from('institutions')
					.select('id, institution_code, name')
					.eq('institution_code', institution_code)
					.single()

				return NextResponse.json({
					found: false,
					message: 'No active PDF settings found for this institution. Using defaults.',
					institution,
					defaults: true,
				})
			}

			console.error('Error fetching PDF settings:', error)
			return NextResponse.json({ error: 'Failed to fetch PDF settings' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('PDF settings GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =============================================================================
// POST: Create new PDF settings
// =============================================================================

export async function POST(request: NextRequest) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Validate input
		const validation = validateCreatePdfSettings(body)
		if (!validation.success) {
			return NextResponse.json(
				{
					error: 'Validation failed',
					details: validation.error.errors.map((e) => ({
						field: e.path.join('.'),
						message: e.message,
					})),
				},
				{ status: 400 }
			)
		}

		// Sanitize HTML content
		const sanitizedData = sanitizePdfSettingsHtml(validation.data)

		// Check if institution exists
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', sanitizedData.institution_code)
			.single()

		if (instError || !institution) {
			return NextResponse.json(
				{ error: `Institution with code "${sanitizedData.institution_code}" not found` },
				{ status: 400 }
			)
		}

		// Check if template_name is unique (template_name must be unique within an institution)
		if (sanitizedData.template_name) {
			const { data: existingName } = await supabase
				.from('pdf_institution_settings')
				.select('id')
				.eq('institution_code', sanitizedData.institution_code)
				.eq('template_name', sanitizedData.template_name)
				.single()

			if (existingName) {
				return NextResponse.json(
					{
						error: `A template with name "${sanitizedData.template_name}" already exists for this institution. Please use a unique template name.`,
					},
					{ status: 409 }
				)
			}
		}

		// Insert new settings (multiple templates with same template_type are allowed)
		const { data, error } = await supabase
			.from('pdf_institution_settings')
			.insert({
				...sanitizedData,
				institution_id: institution.id,
			})
			.select()
			.single()

		if (error) {
			console.error('Error creating PDF settings:', error)

			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'A template with this name already exists for this institution' },
					{ status: 409 }
				)
			}

			return NextResponse.json({ error: 'Failed to create PDF settings' }, { status: 500 })
		}

		// Log the transaction
		await logTransaction(supabase, {
			action: 'CREATE_PDF_SETTINGS',
			resource_type: 'pdf_institution_settings',
			resource_id: data.id,
			new_values: data,
		})

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('PDF settings POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =============================================================================
// PUT: Update existing PDF settings
// =============================================================================

export async function PUT(request: NextRequest) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Validate input
		const validation = validateUpdatePdfSettings(body)
		if (!validation.success) {
			return NextResponse.json(
				{
					error: 'Validation failed',
					details: validation.error.errors.map((e) => ({
						field: e.path.join('.'),
						message: e.message,
					})),
				},
				{ status: 400 }
			)
		}

		const { id, ...updateData } = validation.data

		// Sanitize HTML content
		const sanitizedData = sanitizePdfSettingsHtml(updateData)

		// Fetch existing settings for audit log
		const { data: existing, error: fetchError } = await supabase
			.from('pdf_institution_settings')
			.select('*')
			.eq('id', id)
			.single()

		if (fetchError || !existing) {
			return NextResponse.json({ error: 'PDF settings not found' }, { status: 404 })
		}

		// Update settings
		const { data, error } = await supabase
			.from('pdf_institution_settings')
			.update(sanitizedData)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Error updating PDF settings:', error)

			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'A template with this name already exists for this institution' },
					{ status: 409 }
				)
			}

			return NextResponse.json({ error: 'Failed to update PDF settings' }, { status: 500 })
		}

		// Log the transaction with old and new values
		await logTransaction(supabase, {
			action: 'UPDATE_PDF_SETTINGS',
			resource_type: 'pdf_institution_settings',
			resource_id: id,
			old_values: existing,
			new_values: data,
		})

		return NextResponse.json(data)
	} catch (error) {
		console.error('PDF settings PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =============================================================================
// DELETE: Delete PDF settings
// =============================================================================

export async function DELETE(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Settings ID is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Fetch existing settings for audit log
		const { data: existing, error: fetchError } = await supabase
			.from('pdf_institution_settings')
			.select('*')
			.eq('id', id)
			.single()

		if (fetchError || !existing) {
			return NextResponse.json({ error: 'PDF settings not found' }, { status: 404 })
		}

		// Delete settings
		const { error } = await supabase.from('pdf_institution_settings').delete().eq('id', id)

		if (error) {
			console.error('Error deleting PDF settings:', error)
			return NextResponse.json({ error: 'Failed to delete PDF settings' }, { status: 500 })
		}

		// Log the transaction
		await logTransaction(supabase, {
			action: 'DELETE_PDF_SETTINGS',
			resource_type: 'pdf_institution_settings',
			resource_id: id,
			old_values: existing,
		})

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('PDF settings DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =============================================================================
// HELPER: Log transaction
// =============================================================================

async function logTransaction(
	supabase: ReturnType<typeof getSupabaseServer>,
	data: {
		action: string
		resource_type: string
		resource_id: string
		old_values?: any
		new_values?: any
	}
) {
	try {
		await supabase.from('transaction_logs').insert({
			action: data.action,
			resource_type: data.resource_type,
			resource_id: data.resource_id,
			old_values: data.old_values || null,
			new_values: data.new_values || null,
			metadata: {
				timestamp: new Date().toISOString(),
			},
		})
	} catch (error) {
		console.error('Failed to log transaction:', error)
		// Don't throw - transaction logging should not block the main operation
	}
}
