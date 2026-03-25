/**
 * PDF Settings Individual Record API Routes
 *
 * GET    /api/pdf-settings/[id] - Get settings by ID
 * PUT    /api/pdf-settings/[id] - Update settings by ID
 * DELETE /api/pdf-settings/[id] - Delete settings by ID
 * PATCH  /api/pdf-settings/[id] - Toggle active status
 */

import { NextResponse, NextRequest } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { validateUpdatePdfSettings, sanitizePdfSettingsHtml } from '@/lib/validations/pdf-settings'

// =============================================================================
// GET: Fetch PDF settings by ID
// =============================================================================

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params
		const supabase = getSupabaseServer()

		const { data, error } = await supabase
			.from('pdf_institution_settings')
			.select(
				`
				*,
				institution:institutions(id, institution_code, name)
			`
			)
			.eq('id', id)
			.single()

		if (error) {
			if (error.code === 'PGRST116') {
				return NextResponse.json({ error: 'PDF settings not found' }, { status: 404 })
			}
			console.error('Error fetching PDF settings:', error)
			return NextResponse.json({ error: 'Failed to fetch PDF settings' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('PDF settings GET by ID error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =============================================================================
// PUT: Update PDF settings by ID
// =============================================================================

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Add ID to body for validation
		const dataWithId = { ...body, id }

		// Validate input
		const validation = validateUpdatePdfSettings(dataWithId)
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

		const { id: _, ...updateData } = validation.data

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

		// Check template_name uniqueness if being changed
		if (sanitizedData.template_name && sanitizedData.template_name !== existing.template_name) {
			const { data: existingName } = await supabase
				.from('pdf_institution_settings')
				.select('id')
				.eq('institution_code', existing.institution_code)
				.eq('template_name', sanitizedData.template_name)
				.neq('id', id)
				.single()

			if (existingName) {
				return NextResponse.json(
					{ error: `A template with name "${sanitizedData.template_name}" already exists for this institution.` },
					{ status: 409 }
				)
			}
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

		// Log the transaction
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
// DELETE: Delete PDF settings by ID
// =============================================================================

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params
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
// PATCH: Toggle active status or partial update
// =============================================================================

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Fetch existing settings
		const { data: existing, error: fetchError } = await supabase
			.from('pdf_institution_settings')
			.select('*')
			.eq('id', id)
			.single()

		if (fetchError || !existing) {
			return NextResponse.json({ error: 'PDF settings not found' }, { status: 404 })
		}

		// Handle active toggle
		if (body.action === 'toggle_active') {
			const newActiveStatus = !existing.active

			const { data, error } = await supabase
				.from('pdf_institution_settings')
				.update({ active: newActiveStatus })
				.eq('id', id)
				.select()
				.single()

			if (error) {
				console.error('Error toggling active status:', error)
				return NextResponse.json({ error: 'Failed to toggle active status' }, { status: 500 })
			}

			// Log the transaction
			await logTransaction(supabase, {
				action: newActiveStatus ? 'ACTIVATE_PDF_SETTINGS' : 'DEACTIVATE_PDF_SETTINGS',
				resource_type: 'pdf_institution_settings',
				resource_id: id,
				old_values: { active: existing.active },
				new_values: { active: newActiveStatus },
			})

			return NextResponse.json(data)
		}

		// Handle duplicate for new template type
		if (body.action === 'duplicate') {
			const newTemplateType = body.template_type

			if (!newTemplateType) {
				return NextResponse.json({ error: 'template_type is required for duplicate action' }, { status: 400 })
			}

			// Generate a unique template_name for the duplicate
			const baseName = existing.template_name || `${existing.institution_code}_${newTemplateType}`
			let newTemplateName = `${baseName}_copy`
			let counter = 1

			// Check if template_name already exists and generate unique name
			while (true) {
				const { data: existingName } = await supabase
					.from('pdf_institution_settings')
					.select('id')
					.eq('institution_code', existing.institution_code)
					.eq('template_name', newTemplateName)
					.single()

				if (!existingName) break

				counter++
				newTemplateName = `${baseName}_copy_${counter}`
			}

			// Create duplicate with new template type and unique template_name
			const { id: _, created_at, updated_at, created_by, updated_by, ...settingsToDuplicate } = existing

			const { data, error } = await supabase
				.from('pdf_institution_settings')
				.insert({
					...settingsToDuplicate,
					template_type: newTemplateType,
					template_name: newTemplateName,
					wef_date: new Date().toISOString().split('T')[0], // Set WEF to today
					wef_time: '00:00',
					active: false, // New duplicate starts as inactive
				})
				.select()
				.single()

			if (error) {
				console.error('Error duplicating PDF settings:', error)

				if (error.code === '23505') {
					return NextResponse.json(
						{ error: 'A template with this name already exists' },
						{ status: 409 }
					)
				}

				return NextResponse.json({ error: 'Failed to duplicate PDF settings' }, { status: 500 })
			}

			// Log the transaction
			await logTransaction(supabase, {
				action: 'DUPLICATE_PDF_SETTINGS',
				resource_type: 'pdf_institution_settings',
				resource_id: data.id,
				old_values: { source_id: id, source_template: existing.template_type },
				new_values: data,
			})

			return NextResponse.json(data, { status: 201 })
		}

		return NextResponse.json({ error: 'Invalid action. Use "toggle_active" or "duplicate"' }, { status: 400 })
	} catch (error) {
		console.error('PDF settings PATCH error:', error)
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
	}
}
