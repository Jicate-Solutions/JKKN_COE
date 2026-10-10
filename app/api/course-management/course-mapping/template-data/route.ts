import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { type BatchRow, loadBatches } from '@/lib/api-helpers/myjkkn-batches'

export async function GET() {
	try {
		const supabase = getSupabaseServer()

		// Fetch all reference data in parallel
		const [
			institutionsResult,
			programsResult,
			regulationsResult,
			batchesResult,
			semestersResult,
			coursesResult
		] = await Promise.all([
			supabase
				.from('institutions')
				.select('institution_code, name')
				.eq('is_active', true)
				.order('institution_code'),
			supabase
				.from('programs')
				.select('program_code, program_name')
				.eq('is_active', true)
				.order('program_code'),
			supabase
				.from('regulations')
				.select('regulation_code, regulation_year')
				.eq('status', true)
				.order('regulation_code'),
			// Batches are mastered in MyJKKN — there is no local batch table.
			loadBatches({ status: true })
				.then((data) => ({ data, error: null as { message: string } | null }))
				.catch((err: unknown) => ({ data: [] as BatchRow[], error: { message: err instanceof Error ? err.message : 'MyJKKN unavailable' } })),
			supabase
				.from('semesters')
				.select('id, semester_name, display_order')
				.order('display_order'),
			supabase
				.from('courses')
				.select('course_code, course_name, course_category, course_type')
				.eq('status', true)
				.order('course_code')
		])

		// Check for errors with detailed messages
		if (institutionsResult.error) {
			console.error('Institutions query error:', institutionsResult.error)
			return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
		}
		if (programsResult.error) {
			console.error('Programs query error:', programsResult.error)
			return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 })
		}
		if (regulationsResult.error) {
			console.error('Regulations query error:', regulationsResult.error)
			return NextResponse.json({ error: 'Failed to fetch regulations' }, { status: 500 })
		}
		if (batchesResult.error) {
			console.error('Batches query error:', batchesResult.error)
			return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 })
		}
		if (semestersResult.error) {
			console.error('Semesters query error:', semestersResult.error)
			return NextResponse.json({ error: 'Failed to fetch semesters' }, { status: 500 })
		}
		if (coursesResult.error) {
			console.error('Courses query error:', coursesResult.error)
			return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
		}

		// Transform data for template
		const referenceData = {
			institutions: institutionsResult.data.map(i => ({
				code: i.institution_code,
				name: i.name
			})),
			programs: programsResult.data.map(p => ({
				code: p.program_code,
				name: p.program_name
			})),
			regulations: regulationsResult.data.map(r => ({
				code: r.regulation_code,
				name: `${r.regulation_code} (${r.regulation_year})`
			})),
			batches: batchesResult.data.map(b => ({
				code: b.batch_code,
				name: b.batch_name,
				year: b.batch_year
			})),
			semesters: semestersResult.data.map(s => ({
				code: s.semester_name,
				name: s.semester_name,
				number: s.display_order
			})),
			courses: coursesResult.data.map(c => ({
				code: c.course_code,
				name: c.course_name,
				category: c.course_category || '',
				type: c.course_type || ''
			}))
		}

		return NextResponse.json(referenceData)
	} catch (error) {
		console.error('Error fetching template reference data:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch reference data for template' },
			{ status: 500 }
		)
	}
}
