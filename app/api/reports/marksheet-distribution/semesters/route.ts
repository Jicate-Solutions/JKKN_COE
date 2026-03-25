import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institution_id')
		const programCode = searchParams.get('program_code')

		if (!institutionId) {
			return NextResponse.json({ error: 'institution_id is required' }, { status: 400 })
		}
		if (!programCode) {
			return NextResponse.json({ error: 'program_code is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Get the institution to get its myjkkn_institution_ids
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id, institution_code, myjkkn_institution_ids')
			.eq('id', institutionId)
			.single()

		if (instError || !institution) {
			console.error('[Marksheet Distribution Semesters API] Institution not found:', instError)
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		const myjkknInstitutionIds: string[] = institution.myjkkn_institution_ids || []

		if (myjkknInstitutionIds.length === 0) {
			console.log('[Marksheet Distribution Semesters API] No myjkkn_institution_ids found')
			return NextResponse.json({ semesters: [] })
		}

		console.log('[Marksheet Distribution Semesters API] Using MyJKKN institution IDs:', myjkknInstitutionIds)

		// Fetch the program from MyJKKN API to get total_semesters
		// We need to find the program with the given program_code
		let totalSemesters = 6 // Default fallback

		for (const myjkknInstId of myjkknInstitutionIds) {
			try {
				// Use the internal proxy endpoint (same pattern as programs API)
				const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
				const params = new URLSearchParams({
					limit: '100',
					is_active: 'true',
					institution_id: myjkknInstId
				})

				const res = await fetch(`${baseUrl}/api/myjkkn/programs?${params.toString()}`)

				if (!res.ok) {
					console.error(`[Marksheet Distribution Semesters API] HTTP error ${res.status} for inst ${myjkknInstId}`)
					continue
				}

				const response = await res.json()
				const programs = response.data || response || []
				// Filter by program_code client-side
				// MyJKKN returns program_id as the CODE (e.g., "UEN"), not as a UUID
				const matchingProgram = programs.find((p: any) => {
					const code = p.program_id || p.program_code
					return code === programCode
				})
				if (matchingProgram) {
					totalSemesters = matchingProgram.total_semesters || 6
					console.log(`[Marksheet Distribution Semesters API] Found program ${programCode} with ${totalSemesters} semesters`)
					break
				}
			} catch (error) {
				console.error(`[Marksheet Distribution Semesters API] Error fetching program for inst ${myjkknInstId}:`, error)
			}
		}

		// Generate semesters based on total_semesters
		const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
		const semesters = []

		for (let semNum = 1; semNum <= totalSemesters; semNum++) {
			const semCode = `${programCode}-${semNum}`
			const semName = `Semester ${romanNumerals[semNum - 1] || semNum}`

			semesters.push({
				id: `${programCode}-${semNum}`,
				semester_code: semCode,
				semester_name: semName,
				semester_order: semNum
			})
		}

		console.log('[Marksheet Distribution Semesters API] Returning', semesters.length, 'semesters')

		return NextResponse.json({ semesters })

	} catch (error) {
		console.error('[Marksheet Distribution Semesters API] Error:', error)
		return NextResponse.json({ error: 'Failed to fetch semesters' }, { status: 500 })
	}
}
