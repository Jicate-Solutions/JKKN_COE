import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNPrograms } from '@/services/myjkkn-service'

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institution_id')

		if (!institutionId) {
			return NextResponse.json({ error: 'institution_id is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Get the institution to get its myjkkn_institution_ids
		// Local COE uses myjkkn_institution_ids array that maps to MyJKKN institution IDs
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id, institution_code, myjkkn_institution_ids')
			.eq('id', institutionId)
			.single()

		if (instError || !institution) {
			console.error('[Marksheet Distribution Programs API] Institution not found:', instError)
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		// Use myjkkn_institution_ids to fetch programs from MyJKKN API
		// For CAS, this includes both Aided and Self-financed institution IDs
		const myjkknInstitutionIds: string[] = institution.myjkkn_institution_ids || []

		if (myjkknInstitutionIds.length === 0) {
			console.log('[Marksheet Distribution Programs API] No myjkkn_institution_ids found - returning empty')
			return NextResponse.json({ programs: [] })
		}

		console.log('[Marksheet Distribution Programs API] Using MyJKKN institution IDs:', myjkknInstitutionIds)

		// Call the MyJKKN service directly — going back out over HTTP to our own
		// /api/myjkkn/programs made this dropdown depend on NEXT_PUBLIC_APP_URL being
		// correct AND on the self-request surviving the middleware rate limiter (all
		// server-side self-calls share one IP bucket). Either failing silently emptied
		// the list and the page fell back to the sparse local `programs` table.
		const results = await Promise.all(
			myjkknInstitutionIds.map(async (myjkknInstId) => {
				try {
					// all: true paginates — a single page would truncate larger institutions
					const programs = await fetchAllMyJKKNPrograms({
						all: true,
						limit: 200,
						is_active: true,
						institution_id: myjkknInstId,
					})

					// Client-side filter by institution_id (MyJKKN API may not filter server-side)
					const filtered = programs.filter(
						(p: any) => p.institution_id === myjkknInstId && p.is_active !== false
					)

					console.log(`[Marksheet Distribution Programs API] Programs found for ${myjkknInstId}: ${filtered.length}`)
					return filtered
				} catch (error) {
					console.error(`[Marksheet Distribution Programs API] Error fetching programs for inst ${myjkknInstId}:`, error)
					return []
				}
			})
		)

		const allPrograms = results.flat()

		// Deduplicate by program_code (MyJKKN uses program_id as the CODE field, not UUID!)
		// Programs with same code exist in both Aided and Self institutions
		const programMap = new Map<string, any>()
		for (const prog of allPrograms) {
			// MyJKKN returns program_id as the CODE (e.g., "UEN"), not as a UUID
			const code = (prog as any).program_id || (prog as any).program_code
			if (code && !programMap.has(code)) {
				programMap.set(code, {
					id: prog.id,
					program_code: code,
					program_name: prog.program_name || (prog as any).name || code,
					program_order: (prog as any).program_order ?? 999,
					total_semesters: (prog as any).total_semesters || 6,
				})
			}
		}

		// Sort by program_order then by program_code
		const uniquePrograms = Array.from(programMap.values()).sort((a, b) => {
			if (a.program_order !== b.program_order) return a.program_order - b.program_order
			return (a.program_code || '').localeCompare(b.program_code || '')
		})

		console.log('[Marksheet Distribution Programs API] Returning', uniquePrograms.length, 'programs:', uniquePrograms.map(p => p.program_code))

		return NextResponse.json({ programs: uniquePrograms })

	} catch (error) {
		console.error('[Marksheet Distribution Programs API] Error:', error)
		return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 })
	}
}
