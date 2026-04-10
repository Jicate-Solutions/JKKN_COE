import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { handleDeleteWithDependencyCheck } from '@/lib/delete-helpers'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const status = searchParams.get('status')
		const examiner_type = searchParams.get('examiner_type')
		const board_id = searchParams.get('board_id')
		const search = searchParams.get('search')
		const institution_code = searchParams.get('institution_code')
		const institutions_id = searchParams.get('institutions_id') // from global filter (maps to institution_id column)
		const page = parseInt(searchParams.get('page') || '1')
		const limit = parseInt(searchParams.get('limit') || '10')
		const sort_by = searchParams.get('sort_by') || 'created_at'
		const sort_dir = searchParams.get('sort_dir') || 'desc'
		const formType = searchParams.get('form_type')
		const exportAll = searchParams.get('export') === 'true'

		// Build the base query with only needed columns
		const selectColumns = `
			id,
			full_name,
			email,
			mobile,
			designation,
			department,
			institution_name,
			institution_address,
			ug_experience_years,
			pg_experience_years,
			examiner_type,
			is_internal,
			address,
			city,
			state,
			pincode,
			email_verified,
			status,
			status_remarks,
			institution_id,
			institution_code,
			notes,
			ug_board_id,
			pg_board_id,
			form_type,
			salutation,
			gender,
			highest_qualification,
			willingness_roles,
			additional_data,
			declaration_acknowledged,
			area_of_expertise,
			teaching_exp_years,
			industry_exp_years,
			total_exp_years,
			personal_email,
			official_email,
			aicte_faculty_code,
			institution_coe_contact,
			institution_coe_email,
			google_profile_picture,
			created_at,
			updated_at,
			boards:examiner_board_associations (
				id,
				board_id,
				board_code,
				willing_for_valuation,
				willing_for_practical,
				willing_for_scrutiny,
				is_active,
				board:board (
					id,
					board_code,
					board_name,
					board_type
				)
			)
		`

		// Count query (without pagination) for total
		let countQuery = supabase
			.from('examiners')
			.select('id', { count: 'exact', head: true })

		// Data query with pagination
		let query = supabase
			.from('examiners')
			.select(selectColumns)
			.order(sort_by, { ascending: sort_dir === 'asc' })




		// Apply filters to both queries
		if (status && status !== 'all') {
			query = query.eq('status', status)
			countQuery = countQuery.eq('status', status)
		}

		if (examiner_type && examiner_type !== 'all') {
			query = query.eq('examiner_type', examiner_type)
			countQuery = countQuery.eq('examiner_type', examiner_type)
		}

		if (formType && formType !== 'all') {
			query = query.eq('form_type', formType)
			countQuery = countQuery.eq('form_type', formType)
		}

		if (institution_code) {
			query = query.eq('institution_code', institution_code)
			countQuery = countQuery.eq('institution_code', institution_code)
		} else if (institutions_id) {
			// Global filter sends institutions_id (plural), DB column is institution_id (singular)
			query = query.eq('institution_id', institutions_id)
			countQuery = countQuery.eq('institution_id', institutions_id)
		}

		if (search) {
			const searchFilter = `full_name.ilike.%${search}%,email.ilike.%${search}%,mobile.ilike.%${search}%,department.ilike.%${search}%,institution_name.ilike.%${search}%`
			query = query.or(searchFilter)
			countQuery = countQuery.or(searchFilter)
		}

		// Stats queries (lightweight counts, institution-scoped) - run in parallel
		const buildStatsQuery = () => {
			let q = supabase.from('examiners').select('id', { count: 'exact', head: true })
			if (institution_code) q = q.eq('institution_code', institution_code)
			else if (institutions_id) q = q.eq('institution_id', institutions_id)
			return q
		}

		const statsPromises = Promise.all([
			buildStatsQuery(),
			buildStatsQuery().eq('status', 'ACTIVE'),
			buildStatsQuery().eq('status', 'PENDING'),
			buildStatsQuery().eq('email_verified', true),
		])

		// If board_id is specified, we need to fetch all and filter client-side
		// because Supabase can't filter on nested relations easily
		if (board_id) {
			const [{ data, error }, statsResults] = await Promise.all([
				query.range(0, 9999),
				statsPromises,
			])

			if (error) {
				console.error('Error fetching examiners:', error)
				return NextResponse.json({ error: 'Failed to fetch examiners' }, { status: 500 })
			}

			let filteredData = (data || []).filter((examiner: any) =>
				examiner.boards?.some((assoc: any) => assoc.board_id === board_id && assoc.is_active)
			)

			const total = filteredData.length

			// For export, return all filtered data
			if (exportAll) {
				return NextResponse.json({
					data: filteredData,
					total,
					page: 1,
					limit: total,
					stats: {
						total: statsResults[0]?.count || 0,
						active: statsResults[1]?.count || 0,
						pending: statsResults[2]?.count || 0,
						verified: statsResults[3]?.count || 0,
					},
				})
			}

			const start = (page - 1) * limit
			const paginatedData = filteredData.slice(start, start + limit)

			return NextResponse.json({
				data: paginatedData,
				total,
				page,
				limit,
				stats: {
					total: statsResults[0]?.count || 0,
					active: statsResults[1]?.count || 0,
					pending: statsResults[2]?.count || 0,
					verified: statsResults[3]?.count || 0,
				},
			})
		}

		// For export, return all data (no pagination)
		if (exportAll) {
			const [{ data, error }, { count }, statsResults] = await Promise.all([
				query.range(0, 9999),
				countQuery,
				statsPromises,
			])

			if (error) {
				console.error('Error fetching examiners:', error)
				return NextResponse.json({ error: 'Failed to fetch examiners' }, { status: 500 })
			}

			return NextResponse.json({
				data: data || [],
				total: count || 0,
				page: 1,
				limit: count || 0,
				stats: {
					total: statsResults[0]?.count || 0,
					active: statsResults[1]?.count || 0,
					pending: statsResults[2]?.count || 0,
					verified: statsResults[3]?.count || 0,
				},
			})
		}

		// Apply pagination
		const start = (page - 1) * limit
		const end = start + limit - 1

		const [{ data, error }, { count }, statsResults] = await Promise.all([
			query.range(start, end),
			countQuery,
			statsPromises,
		])

		if (error) {
			console.error('Error fetching examiners:', error)
			return NextResponse.json({ error: 'Failed to fetch examiners' }, { status: 500 })
		}

		return NextResponse.json({
			data: data || [],
			total: count || 0,
			page,
			limit,
			stats: {
				total: statsResults[0]?.count || 0,
				active: statsResults[1]?.count || 0,
				pending: statsResults[2]?.count || 0,
				verified: statsResults[3]?.count || 0,
			},
		})
	} catch (e) {
		console.error('Examiners API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Validate required fields
		if (!body.full_name?.trim()) {
			return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
		}
		if (!body.email?.trim()) {
			return NextResponse.json({ error: 'Email is required' }, { status: 400 })
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(body.email)) {
			return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
		}

		// Check for duplicate email
		const { data: existingExaminer } = await supabase
			.from('examiners')
			.select('id')
			.eq('email', body.email.toLowerCase().trim())
			.single()

		if (existingExaminer) {
			return NextResponse.json({ error: 'An examiner with this email already exists' }, { status: 400 })
		}

		// Resolve institution_id from institution_code if not provided directly
		let institution_id = body.institution_id || null
		let institution_code = body.institution_code?.trim() || null

		if (institution_code && !institution_id) {
			const { data: inst } = await supabase
				.from('institutions')
				.select('id')
				.eq('institution_code', institution_code)
				.maybeSingle()
			if (inst) institution_id = inst.id
		} else if (institution_id && !institution_code) {
			const { data: inst } = await supabase
				.from('institutions')
				.select('institution_code')
				.eq('id', institution_id)
				.maybeSingle()
			if (inst) institution_code = inst.institution_code
		}

		const insertPayload = {
			full_name: body.full_name.trim(),
			email: body.email.toLowerCase().trim(),
			mobile: body.mobile?.trim() || null,
			designation: body.designation?.trim() || null,
			department: body.department?.trim() || null,
			institution_name: body.institution_name?.trim() || null,
			institution_address: body.institution_address?.trim() || null,
			ug_experience_years: parseInt(body.ug_experience_years) || 0,
			pg_experience_years: parseInt(body.pg_experience_years) || 0,
			examiner_type: body.examiner_type || 'UG',
			is_internal: body.is_internal ?? false,
			address: body.address?.trim() || null,
			city: body.city?.trim() || null,
			state: body.state?.trim() || null,
			pincode: body.pincode?.trim() || null,
			email_verified: body.email_verified ?? false,
			status: body.status || 'PENDING',
			status_remarks: body.status_remarks?.trim() || null,
			institution_id,
			institution_code,
			notes: body.notes?.trim() || null,
			ug_board_id: body.ug_board_id || null,
			pg_board_id: body.pg_board_id || null,
			form_type: body.form_type || 'arts',
			salutation: body.salutation || null,
			gender: body.gender || null,
			highest_qualification: body.highest_qualification || null,
			aicte_faculty_code: body.aicte_faculty_code || null,
			personal_email: body.personal_email || null,
			official_email: body.official_email || null,
			institution_coe_contact: body.institution_coe_contact || null,
			institution_coe_email: body.institution_coe_email || null,
			teaching_exp_years: body.teaching_exp_years || null,
			industry_exp_years: body.industry_exp_years || null,
			total_exp_years: body.total_exp_years || null,
			area_of_expertise: body.area_of_expertise || null,
			willingness_roles: body.willingness_roles || null,
			declaration_acknowledged: body.declaration_acknowledged || false,
			additional_data: body.additional_data || {},
			google_profile_picture: body.google_profile_picture || null,
		}

		const { data, error } = await supabase
			.from('examiners')
			.insert([insertPayload])
			.select()
			.single()

		if (error) {
			console.error('Error creating examiner:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'An examiner with this email already exists' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create examiner' }, { status: 500 })
		}

		// Add board associations if provided
		if (body.board_associations && body.board_associations.length > 0) {
			const boardAssociations = body.board_associations.map((assoc: any) => ({
				examiner_id: data.id,
				board_id: assoc.board_id,
				board_code: assoc.board_code,
				willing_for_valuation: assoc.willing_for_valuation ?? true,
				willing_for_practical: assoc.willing_for_practical ?? false,
				willing_for_scrutiny: assoc.willing_for_scrutiny ?? false,
				is_active: true,
			}))

			await supabase.from('examiner_board_associations').insert(boardAssociations)
		}

		// Fetch the complete examiner with associations
		const { data: completeExaminer } = await supabase
			.from('examiners')
			.select(`
				*,
				boards:examiner_board_associations (
					id,
					board_id,
					board_code,
					willing_for_valuation,
					willing_for_practical,
					willing_for_scrutiny,
					is_active,
					board:board (
						id,
						board_code,
						board_name,
						board_type
					)
				)
			`)
			.eq('id', data.id)
			.single()

		return NextResponse.json(completeExaminer, { status: 201 })
	} catch (e) {
		console.error('Examiner creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		if (!body.id) {
			return NextResponse.json({ error: 'Examiner ID is required' }, { status: 400 })
		}

		// Validate email format if provided
		if (body.email) {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
			if (!emailRegex.test(body.email)) {
				return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
			}

			// Check for duplicate email (excluding current examiner)
			const { data: existingExaminer } = await supabase
				.from('examiners')
				.select('id')
				.eq('email', body.email.toLowerCase().trim())
				.neq('id', body.id)
				.single()

			if (existingExaminer) {
				return NextResponse.json({ error: 'An examiner with this email already exists' }, { status: 400 })
			}
		}

		const updatePayload: any = {
			updated_at: new Date().toISOString(),
		}

		// Only include fields that are provided
		// NOTE: institution_id and institution_code are NOT updatable after creation
		if (body.full_name !== undefined) updatePayload.full_name = body.full_name.trim()
		if (body.email !== undefined) updatePayload.email = body.email.toLowerCase().trim()
		if (body.mobile !== undefined) updatePayload.mobile = body.mobile?.trim() || null
		if (body.designation !== undefined) updatePayload.designation = body.designation?.trim() || null
		if (body.department !== undefined) updatePayload.department = body.department?.trim() || null
		if (body.institution_name !== undefined) updatePayload.institution_name = body.institution_name?.trim() || null
		if (body.institution_address !== undefined) updatePayload.institution_address = body.institution_address?.trim() || null
		if (body.ug_experience_years !== undefined) updatePayload.ug_experience_years = parseInt(body.ug_experience_years) || 0
		if (body.pg_experience_years !== undefined) updatePayload.pg_experience_years = parseInt(body.pg_experience_years) || 0
		if (body.examiner_type !== undefined) updatePayload.examiner_type = body.examiner_type
		if (body.is_internal !== undefined) updatePayload.is_internal = body.is_internal
		if (body.address !== undefined) updatePayload.address = body.address?.trim() || null
		if (body.city !== undefined) updatePayload.city = body.city?.trim() || null
		if (body.state !== undefined) updatePayload.state = body.state?.trim() || null
		if (body.pincode !== undefined) updatePayload.pincode = body.pincode?.trim() || null
		if (body.email_verified !== undefined) updatePayload.email_verified = body.email_verified
		if (body.status !== undefined) updatePayload.status = body.status
		if (body.status_remarks !== undefined) updatePayload.status_remarks = body.status_remarks?.trim() || null
		if (body.notes !== undefined) updatePayload.notes = body.notes?.trim() || null
		if (body.ug_board_id !== undefined) updatePayload.ug_board_id = body.ug_board_id || null
		if (body.pg_board_id !== undefined) updatePayload.pg_board_id = body.pg_board_id || null
		if (body.form_type !== undefined) updatePayload.form_type = body.form_type
		if (body.salutation !== undefined) updatePayload.salutation = body.salutation || null
		if (body.gender !== undefined) updatePayload.gender = body.gender || null
		if (body.highest_qualification !== undefined) updatePayload.highest_qualification = body.highest_qualification || null
		if (body.aicte_faculty_code !== undefined) updatePayload.aicte_faculty_code = body.aicte_faculty_code || null
		if (body.personal_email !== undefined) updatePayload.personal_email = body.personal_email || null
		if (body.official_email !== undefined) updatePayload.official_email = body.official_email || null
		if (body.institution_coe_contact !== undefined) updatePayload.institution_coe_contact = body.institution_coe_contact || null
		if (body.institution_coe_email !== undefined) updatePayload.institution_coe_email = body.institution_coe_email || null
		if (body.teaching_exp_years !== undefined) updatePayload.teaching_exp_years = body.teaching_exp_years || null
		if (body.industry_exp_years !== undefined) updatePayload.industry_exp_years = body.industry_exp_years || null
		if (body.total_exp_years !== undefined) updatePayload.total_exp_years = body.total_exp_years || null
		if (body.area_of_expertise !== undefined) updatePayload.area_of_expertise = body.area_of_expertise || null
		if (body.willingness_roles !== undefined) updatePayload.willingness_roles = body.willingness_roles || null
		if (body.declaration_acknowledged !== undefined) updatePayload.declaration_acknowledged = body.declaration_acknowledged
		if (body.additional_data !== undefined) updatePayload.additional_data = body.additional_data || {}
		if (body.google_profile_picture !== undefined) updatePayload.google_profile_picture = body.google_profile_picture || null

		const { data, error } = await supabase
			.from('examiners')
			.update(updatePayload)
			.eq('id', body.id)
			.select()
			.single()

		if (error) {
			console.error('Error updating examiner:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'An examiner with this email already exists' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to update examiner' }, { status: 500 })
		}

		// Update board associations if provided
		if (body.board_associations !== undefined) {
			// Remove existing associations
			await supabase
				.from('examiner_board_associations')
				.delete()
				.eq('examiner_id', body.id)

			// Add new associations
			if (body.board_associations.length > 0) {
				const boardAssociations = body.board_associations.map((assoc: any) => ({
					examiner_id: body.id,
					board_id: assoc.board_id,
					board_code: assoc.board_code,
					willing_for_valuation: assoc.willing_for_valuation ?? true,
					willing_for_practical: assoc.willing_for_practical ?? false,
					willing_for_scrutiny: assoc.willing_for_scrutiny ?? false,
					is_active: true,
				}))

				await supabase.from('examiner_board_associations').insert(boardAssociations)
			}
		}

		// Fetch the complete examiner with associations
		const { data: completeExaminer } = await supabase
			.from('examiners')
			.select(`
				*,
				boards:examiner_board_associations (
					id,
					board_id,
					board_code,
					willing_for_valuation,
					willing_for_practical,
					willing_for_scrutiny,
					is_active,
					board:board (
						id,
						board_code,
						board_name,
						board_type
					)
				)
			`)
			.eq('id', body.id)
			.single()

		return NextResponse.json(completeExaminer)
	} catch (e) {
		console.error('Examiner update error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'ID is required' }, { status: 400 })
		}

		return handleDeleteWithDependencyCheck('examiners', id, request)
	} catch (e) {
		console.error('Delete error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
