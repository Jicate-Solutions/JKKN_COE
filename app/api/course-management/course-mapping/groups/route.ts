import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNPrograms, fetchAllMyJKKNRegulations } from '@/lib/myjkkn-api'

export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionCode = searchParams.get('institution_code')

		// Try using RPC function first (most efficient - single SQL query with GROUP BY and JOINs)
		// Note: The RPC function doesn't support filtering, so we filter in JS if institutionCode is provided
		// Also note: RPC function returns NULL for program_name/regulation_name since they come from MyJKKN API
		const { data: rpcData, error: rpcError } = await supabase.rpc('get_course_mapping_groups')

		if (!rpcError && rpcData) {
			// RPC function succeeded - enrich with MyJKKN data for programs and regulations
			const uniqueProgramCodes = [...new Set(rpcData.map((r: any) => r.program_code).filter(Boolean))]
			const uniqueRegulationCodes = [...new Set(rpcData.map((r: any) => r.regulation_code).filter(Boolean))]

			// Fetch programs and regulations from MyJKKN API
			let myjkknPrograms: any[] = []
			let myjkknRegulations: any[] = []

			try {
				const [programsResponse, regulationsResponse] = await Promise.all([
					uniqueProgramCodes.length > 0
						? fetchAllMyJKKNPrograms({ limit: 10000, is_active: true })
						: Promise.resolve([]),
					uniqueRegulationCodes.length > 0
						? fetchAllMyJKKNRegulations({ limit: 10000, is_active: true })
						: Promise.resolve([])
				])

				myjkknPrograms = Array.isArray(programsResponse) ? programsResponse : []
				myjkknRegulations = Array.isArray(regulationsResponse) ? regulationsResponse : []
			} catch (error) {
				console.error('Error fetching from MyJKKN API:', error)
			}

			// Create lookup maps
			const programMap = new Map<string, string>()
			const programCodeMap = new Map<string, string>() // fallback: program_code only
			myjkknPrograms.forEach(p => {
				const pCode = p.program_id || p.program_code
				const pName = p.program_name || p.name
				if (pCode && pName) {
					if (p.institution_code) {
						const key = `${p.institution_code}|${pCode}`
						programMap.set(key, pName)
					}
					if (!programCodeMap.has(pCode)) {
						programCodeMap.set(pCode, pName)
					}
				}
			})

			const regulationMap = new Map<string, string>()
			myjkknRegulations.forEach(r => {
				if (r.regulation_code) {
					const regulationName = r.regulation_name || r.name || r.regulation_code
					regulationMap.set(r.regulation_code, regulationName)
				}
			})

			// Enrich RPC data with MyJKKN program and regulation names
			let formattedData = rpcData.map((row: any) => {
				const programKey = `${row.institution_code}|${row.program_code}`
				return {
					institution_code: row.institution_code,
					program_code: row.program_code,
					regulation_code: row.regulation_code,
					total_courses: Number(row.total_courses),
					created_at: row.latest_created_at,
					institution_name: row.institution_name,
					program_name: programMap.get(programKey) || programCodeMap.get(row.program_code) || null,
					regulation_name: regulationMap.get(row.regulation_code) || null
				}
			})

			// Filter by institution_code / institutions_id if provided
			if (institutionCode) {
				formattedData = formattedData.filter((row: any) => row.institution_code === institutionCode)
			}

			return NextResponse.json(formattedData)
		}

		// Fallback: RPC function doesn't exist or failed - use optimized JS approach
		console.log('RPC function not available, using fallback:', rpcError?.message)

		// Optimized fallback: fetch only distinct combinations using a subquery approach
		// We limit to 1000 to prevent excessive data transfer and group in JS
		let query = supabase
			.from('course_mapping')
			.select('institution_code, institutions_id, program_code, regulation_code, created_at')
			.eq('is_active', true)
			.limit(10000) // Safety limit

		// Apply institution_code filter if provided
		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		}

		const { data: mappings, error } = await query

		if (error) {
			console.error('Error fetching course mappings:', error)
			return NextResponse.json({ error: 'Failed to fetch course mappings' }, { status: 500 })
		}

		if (!mappings || mappings.length === 0) {
			return NextResponse.json([])
		}

		// Group in JavaScript
		const groupsMap = new Map<string, {
			institution_code: string
			institutions_id: string | null
			program_code: string
			regulation_code: string
			total_courses: number
			created_at: string
		}>()

		for (const mapping of mappings) {
			const key = `${mapping.institution_code}|${mapping.institutions_id || ''}|${mapping.program_code}|${mapping.regulation_code}`
			const existing = groupsMap.get(key)
			if (existing) {
				existing.total_courses += 1
				// Keep the latest created_at
				if (new Date(mapping.created_at) > new Date(existing.created_at)) {
					existing.created_at = mapping.created_at
				}
			} else {
				groupsMap.set(key, {
					institution_code: mapping.institution_code,
					institutions_id: mapping.institutions_id || null,
					program_code: mapping.program_code,
					regulation_code: mapping.regulation_code,
					total_courses: 1,
					created_at: mapping.created_at
				})
			}
		}

		const groups = Array.from(groupsMap.values())

		if (groups.length === 0) {
			return NextResponse.json([])
		}

		// Batch fetch all related data
		const uniqueInstitutionCodes = [...new Set(groups.map(g => g.institution_code).filter(Boolean))]
		const uniqueProgramCodes = [...new Set(groups.map(g => g.program_code).filter(Boolean))]
		const uniqueRegulationCodes = [...new Set(groups.map(g => g.regulation_code).filter(Boolean))]
		
		// Fetch institutions from local database
		const institutionsResult = uniqueInstitutionCodes.length > 0
			? await supabase.from('institutions').select('institution_code, name').in('institution_code', uniqueInstitutionCodes)
			: { data: [], error: null }

		// Fetch programs and regulations from MyJKKN API
		let myjkknPrograms: any[] = []
		let myjkknRegulations: any[] = []

		try {
			// Fetch all programs from MyJKKN API
			const programsResponse = await fetchAllMyJKKNPrograms({
				limit: 10000,
				is_active: true
			})
			myjkknPrograms = Array.isArray(programsResponse) ? programsResponse : []

			// Fetch all regulations from MyJKKN API
			const regulationsResponse = await fetchAllMyJKKNRegulations({
				limit: 10000,
				is_active: true
			})
			myjkknRegulations = Array.isArray(regulationsResponse) ? regulationsResponse : []
		} catch (error) {
			console.error('Error fetching from MyJKKN API:', error)
			// Continue with empty arrays - program/regulation names will be null
		}

		// Create lookup maps for O(1) access
		const institutionMap = new Map<string, string>()
		institutionsResult.data?.forEach(i => institutionMap.set(i.institution_code, i.name))

		// Create program map with composite key: institution_code|program_code -> program_name
		const programMap = new Map<string, string>()
		const programCodeMap = new Map<string, string>() // fallback: program_code only
		myjkknPrograms.forEach(p => {
			const pCode = p.program_id || p.program_code
			const pName = p.program_name || p.name
			if (pCode && pName) {
				if (p.institution_code) {
					const key = `${p.institution_code}|${pCode}`
					programMap.set(key, pName)
				}
				if (!programCodeMap.has(pCode)) {
					programCodeMap.set(pCode, pName)
				}
			}
		})

		// Create regulation map: regulation_code -> regulation_name
		const regulationMap = new Map<string, string>()
		myjkknRegulations.forEach(r => {
			if (r.regulation_code) {
				const regulationName = r.regulation_name || r.name || r.regulation_code
				regulationMap.set(r.regulation_code, regulationName)
			}
		})

		// Enrich groups using lookup maps (O(1) per group)
		const enrichedGroups = groups.map(group => {
			const programKey = `${group.institution_code}|${group.program_code}`
			return {
				...group,
				institution_name: institutionMap.get(group.institution_code) || null,
				program_name: programMap.get(programKey) || programCodeMap.get(group.program_code) || null,
				regulation_name: regulationMap.get(group.regulation_code) || null
			}
		})

		// Sort by created_at descending
		enrichedGroups.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

		return NextResponse.json(enrichedGroups)
	} catch (error) {
		console.error('Error in course mapping groups API:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
