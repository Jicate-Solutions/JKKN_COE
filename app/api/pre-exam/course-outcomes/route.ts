import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET - list COs for a course (by course_id, or course_code + institution)
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const courseId = searchParams.get('course_id')
		const courseCode = searchParams.get('course_code')
		const institutionsId = searchParams.get('institutions_id')

		let query = supabase
			.from('ia_course_outcomes')
			.select('*')
			.eq('is_active', true)
			.order('display_order', { ascending: true })

		if (courseId) {
			query = query.eq('course_id', courseId)
		} else if (courseCode && institutionsId) {
			query = query.eq('course_code', courseCode).eq('institutions_id', institutionsId)
		} else {
			return NextResponse.json(
				{ error: 'course_id, or course_code + institutions_id, is required' },
				{ status: 400 }
			)
		}

		const { data, error } = await query
		if (error) {
			console.error('Error fetching course outcomes:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json(data)
	} catch (error) {
		console.error('Error in GET course outcomes:', error)
		return NextResponse.json({ error: 'Failed to fetch course outcomes' }, { status: 500 })
	}
}

// POST - create a CO (or bulk create when `outcomes` array is provided)
export async function POST(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()
		const { institutions_id, course_id, course_code, co_code, co_description, display_order, outcomes } =
			body

		if (!institutions_id || !course_id || !course_code) {
			return NextResponse.json(
				{ error: 'institutions_id, course_id and course_code are required' },
				{ status: 400 }
			)
		}

		if (Array.isArray(outcomes) && outcomes.length > 0) {
			const rows = outcomes.map((o: any, i: number) => ({
				institutions_id,
				course_id,
				course_code,
				co_code: o.co_code,
				co_description: o.co_description || null,
				display_order: o.display_order ? parseInt(o.display_order) : i + 1,
			}))
			const { data, error } = await supabase
				.from('ia_course_outcomes')
				.upsert(rows, { onConflict: 'course_id,co_code' })
				.select()
			if (error) {
				console.error('Error bulk-creating COs:', error)
				return NextResponse.json({ error: error.message }, { status: 500 })
			}
			return NextResponse.json(data, { status: 201 })
		}

		if (!co_code) return NextResponse.json({ error: 'co_code is required' }, { status: 400 })

		const { data, error } = await supabase
			.from('ia_course_outcomes')
			.insert({
				institutions_id,
				course_id,
				course_code,
				co_code,
				co_description: co_description || null,
				display_order: display_order ? parseInt(display_order) : 1,
			})
			.select()
			.single()

		if (error) {
			if (error.code === '23505') {
				return NextResponse.json({ error: 'This CO code already exists for the course' }, { status: 400 })
			}
			console.error('Error creating CO:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('Error in POST course outcome:', error)
		return NextResponse.json({ error: 'Failed to create course outcome' }, { status: 500 })
	}
}

// PUT - update a CO
export async function PUT(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()
		const { id, ...updateData } = body
		if (!id) return NextResponse.json({ error: 'CO ID is required' }, { status: 400 })

		delete updateData.institutions_id
		delete updateData.course_id
		if (updateData.display_order !== undefined) {
			updateData.display_order = parseInt(updateData.display_order) || 1
		}

		const { data, error } = await supabase
			.from('ia_course_outcomes')
			.update(updateData)
			.eq('id', id)
			.select()
			.single()
		if (error) {
			console.error('Error updating CO:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json(data)
	} catch (error) {
		console.error('Error in PUT course outcome:', error)
		return NextResponse.json({ error: 'Failed to update course outcome' }, { status: 500 })
	}
}

// DELETE - remove a CO
export async function DELETE(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const id = searchParams.get('id')
		if (!id) return NextResponse.json({ error: 'CO ID is required' }, { status: 400 })

		const { error } = await supabase.from('ia_course_outcomes').delete().eq('id', id)
		if (error) {
			console.error('Error deleting CO:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in DELETE course outcome:', error)
		return NextResponse.json({ error: 'Failed to delete course outcome' }, { status: 500 })
	}
}
