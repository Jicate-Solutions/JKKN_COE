import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/smtp-config
 * List all SMTP configurations
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionCode = searchParams.get('institution_code')

		let query = supabase
			.from('smtp_configuration')
			.select('*')
			.order('created_at', { ascending: false })

		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		}

		const { data, error } = await query

		if (error) throw error

		// Don't expose encrypted passwords in response
		const sanitizedData = data?.map(config => ({
			...config,
			smtp_password_encrypted: config.smtp_password_encrypted ? '********' : null
		}))

		return NextResponse.json(sanitizedData || [])
	} catch (error) {
		console.error('Error fetching SMTP configs:', error)
		return NextResponse.json({ error: 'Failed to fetch SMTP configurations' }, { status: 500 })
	}
}

/**
 * POST /api/smtp-config
 * Create new SMTP configuration
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			institution_code = null,
			smtp_host,
			smtp_port = 587,
			smtp_secure = true,
			smtp_user,
			smtp_password,
			sender_email,
			sender_name = 'Controller of Examinations',
			default_cc_emails = [],
			is_active = true
		} = body

		// Validate required fields (institution_code is optional for global config)
		if (!smtp_host || !smtp_user || !smtp_password || !sender_email) {
			return NextResponse.json({
				error: 'Missing required fields: smtp_host, smtp_user, smtp_password, sender_email'
			}, { status: 400 })
		}

		const { data, error } = await supabase
			.from('smtp_configuration')
			.insert({
				institution_code: institution_code || null,
				smtp_host,
				smtp_port,
				smtp_secure,
				smtp_user,
				smtp_password_encrypted: smtp_password,
				sender_email,
				sender_name: sender_name || 'Controller of Examinations',
				default_cc_emails: default_cc_emails?.length ? default_cc_emails : null,
				is_active
			})
			.select()
			.single()

		if (error) {
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'SMTP configuration for this institution already exists'
				}, { status: 400 })
			}
			console.error('SMTP config insert error:', error)
			return NextResponse.json({ error: 'Failed to create SMTP configuration' }, { status: 500 })
		}

		return NextResponse.json({
			...data,
			smtp_password_encrypted: '********'
		}, { status: 201 })
	} catch (error) {
		console.error('Error creating SMTP config:', error)
		return NextResponse.json({ error: 'Failed to create SMTP configuration' }, { status: 500 })
	}
}

/**
 * PUT /api/smtp-config
 * Update existing SMTP configuration
 */
export async function PUT(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const { id } = body

		if (!id) {
			return NextResponse.json({ error: 'Missing configuration ID' }, { status: 400 })
		}

		// Build update object with only valid DB columns
		const updateData: Record<string, any> = {
			updated_at: new Date().toISOString(),
		}

		if (body.institution_code !== undefined) {
			updateData.institution_code = body.institution_code || null
		}
		if (body.smtp_host !== undefined) {
			updateData.smtp_host = body.smtp_host
		}
		if (body.smtp_port !== undefined) {
			updateData.smtp_port = body.smtp_port
		}
		if (body.smtp_secure !== undefined) {
			updateData.smtp_secure = body.smtp_secure
		}
		if (body.smtp_user !== undefined) {
			updateData.smtp_user = body.smtp_user
		}
		if (body.smtp_password) {
			updateData.smtp_password_encrypted = body.smtp_password
		}
		if (body.sender_email !== undefined) {
			updateData.sender_email = body.sender_email
		}
		if (body.sender_name !== undefined) {
			updateData.sender_name = body.sender_name || 'Controller of Examinations'
		}
		if (body.default_cc_emails !== undefined) {
			updateData.default_cc_emails = body.default_cc_emails?.length ? body.default_cc_emails : null
		}
		if (body.is_active !== undefined) {
			updateData.is_active = body.is_active
		}

		const { data, error } = await supabase
			.from('smtp_configuration')
			.update(updateData)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'SMTP configuration for this institution already exists'
				}, { status: 400 })
			}
			console.error('SMTP config update error:', error)
			return NextResponse.json({ error: 'Failed to update SMTP configuration' }, { status: 500 })
		}

		if (!data) {
			return NextResponse.json({ error: 'Configuration not found' }, { status: 404 })
		}

		return NextResponse.json({
			...data,
			smtp_password_encrypted: '********'
		})
	} catch (error) {
		console.error('Error updating SMTP config:', error)
		return NextResponse.json({ error: 'Failed to update SMTP configuration' }, { status: 500 })
	}
}

/**
 * DELETE /api/smtp-config
 * Delete SMTP configuration
 */
export async function DELETE(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Missing configuration ID' }, { status: 400 })
		}

		const { error } = await supabase
			.from('smtp_configuration')
			.delete()
			.eq('id', id)

		if (error) throw error

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error deleting SMTP config:', error)
		return NextResponse.json({ error: 'Failed to delete SMTP configuration' }, { status: 500 })
	}
}
