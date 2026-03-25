import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

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

		console.log('[Marksheet Distribution Programs API] Institution found:', {
			id: institution.id,
			code: institution.institution_code,
			myjkkn_ids: institution.myjkkn_institution_ids,
			myjkkn_ids_type: typeof institution.myjkkn_institution_ids
		})

		// Use myjkkn_institution_ids to fetch programs from MyJKKN API
		// For CAS, this includes both Aided and Self-financed institution IDs
		const myjkknInstitutionIds: string[] = institution.myjkkn_institution_ids || []

		if (myjkknInstitutionIds.length === 0) {
			console.log('[Marksheet Distribution Programs API] No myjkkn_institution_ids found - returning empty')
			return NextResponse.json({ programs: [] })
		}

		console.log('[Marksheet Distribution Programs API] Using MyJKKN institution IDs:', myjkknInstitutionIds, 'count:', myjkknInstitutionIds.length)

		// Fetch programs from MyJKKN API for each institution ID
		const allPrograms: any[] = []

		for (const myjkknInstId of myjkknInstitutionIds) {
			try {
				console.log(`[Marksheet Distribution Programs API] Fetching programs for MyJKKN inst: ${myjkknInstId}`)

				// Use the internal proxy endpoint (same pattern as exam-attendance dropdowns)
				const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
				const params = new URLSearchParams({
					limit: '100',
					is_active: 'true',
					institution_id: myjkknInstId
				})

				const res = await fetch(`${baseUrl}/api/myjkkn/programs?${params.toString()}`)

				if (!res.ok) {
					console.error(`[Marksheet Distribution Programs API] HTTP error ${res.status} for inst ${myjkknInstId}`)
					continue
				}

				const response = await res.json()
				console.log(`[Marksheet Distribution Programs API] Response for ${myjkknInstId}:`, {
					hasData: !!response?.data,
					dataLength: response?.data?.length,
					responseType: typeof response
				})

				const programs = response.data || response || []

				// Client-side filter by institution_id (MyJKKN API may not filter server-side)
				const filteredPrograms = Array.isArray(programs)
					? programs.filter((p: any) => p.institution_id === myjkknInstId && p.is_active !== false)
					: []

				console.log(`[Marksheet Distribution Programs API] Programs found for ${myjkknInstId}:`, filteredPrograms.length)
				allPrograms.push(...filteredPrograms)
			} catch (error) {
				console.error(`[Marksheet Distribution Programs API] Error fetching programs for inst ${myjkknInstId}:`, error)
			}
		}

		// Deduplicate by program_code (MyJKKN uses program_id as the CODE field, not UUID!)
		// Programs with same code exist in both Aided and Self institutions
		const programMap = new Map<string, any>()
		for (const prog of allPrograms) {
			// MyJKKN returns program_id as the CODE (e.g., "UEN"), not as a UUID
			const code = prog.program_id || prog.program_code
			if (code && !programMap.has(code)) {
				programMap.set(code, {
					id: prog.id,
					program_code: code,
					program_name: prog.program_name || prog.name || code,
					program_order: prog.program_order ?? 999,
					total_semesters: prog.total_semesters || 6
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
