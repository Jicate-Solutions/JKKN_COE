import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { FilterOptions, FilterOption } from '@/types/result-analytics'

// GET /api/result-analytics/filter-options
// Fetches all dropdown options for result analytics filters
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)

		const institutionId = searchParams.get('institution_id') || undefined

		// Fetch all filter options in parallel
		const [
			institutionsResult,
			academicYearsResult,
			programsResult,
			examinationSessionsResult,
			regulationsResult,
			batchesResult,
			boardsResult
		] = await Promise.all([
			// Institutions
			supabase
				.from('institutions')
				.select('id, institution_code, name')
				.eq('is_active', true)
				.order('name'),

			// Academic Years
			supabase
				.from('academic_years')
				.select('id, academic_year')
				.eq('is_active', true)
				.order('academic_year', { ascending: false }),

			// Programs - derive from final_marks since programs table doesn't exist
			institutionId
				? supabase
						.from('final_marks')
						.select('program_id, program_code')
						.eq('institutions_id', institutionId)
						.eq('is_active', true)
						.not('program_code', 'is', null)
				: supabase
						.from('final_marks')
						.select('program_id, program_code')
						.eq('is_active', true)
						.not('program_code', 'is', null),

			// Examination Sessions
			institutionId
				? supabase
						.from('examination_sessions')
						.select('id, session_code, session_name, academic_year_id')
						.eq('institutions_id', institutionId)
						.order('exam_start_date', { ascending: false })
				: supabase
						.from('examination_sessions')
						.select('id, session_code, session_name, academic_year_id')
						.order('exam_start_date', { ascending: false }),

			// Regulations (no regulation_name column - use regulation_code)
			supabase
				.from('regulations')
				.select('id, regulation_code, regulation_year')
				.order('regulation_year', { ascending: false }),

			// Batches
			institutionId
				? supabase
						.from('batches')
						.select('id, batch_code, batch_name')
						.eq('institutions_id', institutionId)
						.eq('is_active', true)
						.order('batch_name', { ascending: false })
				: supabase
						.from('batches')
						.select('id, batch_code, batch_name')
						.eq('is_active', true)
						.order('batch_name', { ascending: false }),

			// Boards (for board-wise analysis)
			supabase
				.from('boards')
				.select('id, board_code, board_name')
				.eq('is_active', true)
				.order('board_name')
		])

		// Process results
		const institutions: FilterOption[] = (institutionsResult.data || []).map((i: any) => ({
			value: i.id,
			label: `${i.institution_code} - ${i.name}`
		}))

		const academicYears: FilterOption[] = (academicYearsResult.data || []).map((y: any) => ({
			value: y.id,
			label: y.academic_year
		}))

		// Deduplicate programs by program_code
		const seenProgramCodes = new Set<string>()
		const programs: FilterOption[] = (programsResult.data || [])
			.filter((p: any) => {
				if (!p.program_code || seenProgramCodes.has(p.program_code)) return false
				seenProgramCodes.add(p.program_code)
				return true
			})
			.map((p: any) => ({
				value: p.program_id || p.program_code,
				label: p.program_code
			}))
			.sort((a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label))

		const examinationSessions: FilterOption[] = (examinationSessionsResult.data || []).map((s: any) => ({
			value: s.id,
			label: s.session_name || s.session_code
		}))

		const regulations: FilterOption[] = (regulationsResult.data || []).map((r: any) => ({
			value: r.id,
			label: r.regulation_code || `Regulation ${r.regulation_year}`
		}))

		const batches: FilterOption[] = (batchesResult.data || []).map((b: any) => ({
			value: b.id,
			label: b.batch_name || b.batch_code
		}))

		const boards: FilterOption[] = (boardsResult.data || []).map((b: any) => ({
			value: b.id,
			label: b.board_name || b.board_code
		}))

		// Static options
		const semesters: FilterOption[] = [
			{ value: '1', label: 'Semester 1' },
			{ value: '2', label: 'Semester 2' },
			{ value: '3', label: 'Semester 3' },
			{ value: '4', label: 'Semester 4' },
			{ value: '5', label: 'Semester 5' },
			{ value: '6', label: 'Semester 6' },
			{ value: '7', label: 'Semester 7' },
			{ value: '8', label: 'Semester 8' },
			{ value: '9', label: 'Semester 9' },
			{ value: '10', label: 'Semester 10' }
		]

		const degreeLevels: FilterOption[] = [
			{ value: 'All', label: 'All Levels' },
			{ value: 'UG', label: 'Undergraduate (UG)' },
			{ value: 'PG', label: 'Postgraduate (PG)' },
			{ value: 'Diploma', label: 'Diploma' },
			{ value: 'Certificate', label: 'Certificate' }
		]

		const sections: FilterOption[] = [] // Would need to be fetched based on program/batch

		const filterOptions: FilterOptions = {
			institutions,
			academic_years: academicYears,
			programs,
			semesters,
			batches,
			sections,
			regulations,
			examination_sessions: examinationSessions,
			boards,
			degree_levels: degreeLevels
		}

		return NextResponse.json({
			success: true,
			data: filterOptions,
			generated_at: new Date().toISOString()
		})

	} catch (error) {
		console.error('Error fetching filter options:', error)
		return NextResponse.json({
			error: 'Internal server error',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 })
	}
}
