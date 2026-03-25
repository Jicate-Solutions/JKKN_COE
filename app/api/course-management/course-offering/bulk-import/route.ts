import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNPrograms } from '@/services/myjkkn-service'

interface BulkImportItem {
	rowNumber: number
	institution_code: string
	course_code: string
	session_code: string
	program_code: string
	semester_code: string
	semester_order?: number
	is_active?: boolean
}

interface BulkImportResult {
	total: number
	success: number
	failed: number
	errors: Array<{ row: number; errors: string[] }>
	inserted: any[]
}

// POST - Bulk import course offerings
// Resolves all codes to UUIDs in batched lookups, then batch-inserts
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const rawItems: BulkImportItem[] = body.items

		if (!Array.isArray(rawItems) || rawItems.length === 0) {
			return NextResponse.json({ error: 'Items array is required' }, { status: 400 })
		}

		// Sanitize all code fields: strip trailing commas, semicolons, whitespace
		const cleanCode = (v: string) => (v || '').trim().replace(/[,;]+$/, '').trim()
		const items = rawItems.map(item => ({
			...item,
			institution_code: cleanCode(item.institution_code),
			course_code: cleanCode(item.course_code),
			session_code: cleanCode(item.session_code),
			program_code: cleanCode(item.program_code),
			semester_code: cleanCode(item.semester_code),
		}))

		const supabase = getSupabaseServer()
		const result: BulkImportResult = {
			total: items.length,
			success: 0,
			failed: 0,
			errors: [],
			inserted: [],
		}

		// === STEP 1: Batch lookup all unique codes ===

		const uniqueInstitutionCodes = [...new Set(items.map(i => i.institution_code).filter(Boolean))]
		const uniqueSessionCodes = [...new Set(items.map(i => i.session_code).filter(Boolean))]
		const uniqueProgramCodes = [...new Set(items.map(i => i.program_code).filter(Boolean))]

		// Parallel batch lookups
		const [institutionsResult, sessionsResult, myjkknPrograms] = await Promise.all([
			// 1a. Batch lookup institutions
			supabase
				.from('institutions')
				.select('id, institution_code, myjkkn_institution_ids')
				.in('institution_code', uniqueInstitutionCodes),

			// 1b. Batch lookup examination sessions
			supabase
				.from('examination_sessions')
				.select('id, session_code, institutions_id')
				.in('session_code', uniqueSessionCodes),

			// 1c. Fetch MyJKKN programs (cached)
			fetchAllMyJKKNPrograms({ limit: 10000, is_active: true }),
		])

		// Build lookup maps
		const institutionMap = new Map<string, { id: string; institution_code: string }>(
			(institutionsResult.data || []).map(i => [i.institution_code, i])
		)

		// Session map: key = `${session_code}|${institutions_id}`
		const sessionMap = new Map<string, { id: string; session_code: string }>(
			(sessionsResult.data || []).map(s => [`${s.session_code}|${s.institutions_id}`, s])
		)

		// Program map: program_code -> program
		const programArray = Array.isArray(myjkknPrograms) ? myjkknPrograms : []
		const programMap = new Map<string, any>()
		for (const p of programArray) {
			const code = (p as any).program_id || p.program_code
			if (code && !programMap.has(code)) {
				programMap.set(code, p)
			}
		}

		// === STEP 2: Batch lookup course mappings ===
		// Build unique (institution_code, program_code, semester_code, course_code) combos
		const courseMappingFilters = items.map(i => ({
			institution_code: i.institution_code,
			program_code: i.program_code,
			semester_code: i.semester_code,
			course_code: i.course_code,
		}))

		// Get unique course codes for a broad fetch, then filter in memory
		const uniqueCourseCodes = [...new Set(items.map(i => i.course_code).filter(Boolean))]
		const uniqueSemesterCodes = [...new Set(items.map(i => i.semester_code).filter(Boolean))]

		const { data: allCourseMappings } = await supabase
			.from('course_mapping')
			.select('id, course_id, course_code, institution_code, program_code, semester_code')
			.in('institution_code', uniqueInstitutionCodes)
			.in('course_code', uniqueCourseCodes)
			.in('program_code', uniqueProgramCodes)
			.range(0, 9999)

		// Build composite key map for course mappings
		const courseMappingMap = new Map<string, { id: string; course_id: string; course_code: string }>()
		for (const cm of (allCourseMappings || [])) {
			const key = `${cm.institution_code}|${cm.program_code}|${cm.semester_code}|${cm.course_code}`
			courseMappingMap.set(key, cm)
		}

		// === STEP 3: Check existing offerings in batch ===
		// Fetch all existing offerings for these combinations to skip duplicates
		const { data: existingOfferings } = await supabase
			.from('course_offerings')
			.select('institutions_id, course_mapping_id, examination_session_id, program_code, semester_code')
			.in('institution_code', uniqueInstitutionCodes)
			.in('program_code', uniqueProgramCodes)
			.in('semester_code', uniqueSemesterCodes)
			.range(0, 9999)

		const existingSet = new Set(
			(existingOfferings || []).map(o =>
				`${o.institutions_id}|${o.course_mapping_id}|${o.examination_session_id}|${o.program_code}|${o.semester_code}`
			)
		)

		// === STEP 4: Validate and build insert payloads ===
		const validPayloads: any[] = []
		const rowToPayloadIndex: number[] = [] // maps payload index -> original row number

		for (const item of items) {
			const rowErrors: string[] = []

			// Resolve institution
			const inst = institutionMap.get(item.institution_code)
			if (!inst) {
				rowErrors.push(`Institution "${item.institution_code}" not found`)
			}

			// Resolve program
			const program = programMap.get(item.program_code)
			if (!program) {
				rowErrors.push(`Program "${item.program_code}" not found in MyJKKN`)
			}

			// Resolve session (needs institution_id)
			let session: { id: string; session_code: string } | undefined
			if (inst) {
				session = sessionMap.get(`${item.session_code}|${inst.id}`)
				if (!session) {
					rowErrors.push(`Session "${item.session_code}" not found for institution "${item.institution_code}"`)
				}
			}

			// Resolve course mapping
			const cmKey = `${item.institution_code}|${item.program_code}|${item.semester_code}|${item.course_code}`
			const courseMapping = courseMappingMap.get(cmKey)
			if (!courseMapping) {
				rowErrors.push(`Course "${item.course_code}" not found in course mapping for program "${item.program_code}", semester "${item.semester_code}"`)
			}

			// Check duplicate
			if (inst && courseMapping && session) {
				const existKey = `${inst.id}|${courseMapping.id}|${session.id}|${item.program_code}|${item.semester_code}`
				if (existingSet.has(existKey)) {
					rowErrors.push('Duplicate: this course offering already exists')
				}
			}

			if (rowErrors.length > 0) {
				result.failed++
				result.errors.push({ row: item.rowNumber, errors: rowErrors })
				continue
			}

			// Extract semester number
			let semester = item.semester_order || 1
			if (!item.semester_order) {
				const semMatch = item.semester_code.match(/Sem(\d+)/i)
				semester = semMatch ? parseInt(semMatch[1]) : 1
			}

			const payload = {
				institutions_id: inst!.id,
				institution_code: inst!.institution_code,
				course_mapping_id: courseMapping!.id,
				course_id: courseMapping!.course_id,
				course_code: courseMapping!.course_code,
				examination_session_id: session!.id,
				session_code: session!.session_code,
				program_id: program!.id,
				program_code: (program as any).program_id || program!.program_code,
				semester,
				semester_code: item.semester_code,
				is_active: item.is_active ?? true,
			}

			// Also add to existing set to catch duplicates within the same import batch
			const existKey = `${inst!.id}|${courseMapping!.id}|${session!.id}|${item.program_code}|${item.semester_code}`
			if (existingSet.has(existKey)) {
				result.failed++
				result.errors.push({ row: item.rowNumber, errors: ['Duplicate within import batch'] })
				continue
			}
			existingSet.add(existKey)

			validPayloads.push(payload)
			rowToPayloadIndex.push(item.rowNumber)
		}

		// === STEP 5: Batch insert in chunks of 100 ===
		const BATCH_SIZE = 100
		for (let i = 0; i < validPayloads.length; i += BATCH_SIZE) {
			const batch = validPayloads.slice(i, i + BATCH_SIZE)
			const batchRowNumbers = rowToPayloadIndex.slice(i, i + BATCH_SIZE)

			const { data: insertedData, error: insertError } = await supabase
				.from('course_offerings')
				.insert(batch)
				.select()

			if (insertError) {
				// If batch insert fails, try individual inserts for this batch
				// to identify which specific rows failed
				for (let j = 0; j < batch.length; j++) {
					const { data: singleData, error: singleError } = await supabase
						.from('course_offerings')
						.insert([batch[j]])
						.select()
						.single()

					if (singleError) {
						result.failed++
						let errorMsg = 'Failed to save'
						if (singleError.code === '23505') errorMsg = 'Duplicate entry detected'
						else if (singleError.code === '23503') errorMsg = 'Invalid reference'
						else if (singleError.code === '23514') errorMsg = 'Invalid value'
						result.errors.push({ row: batchRowNumbers[j], errors: [errorMsg] })
					} else {
						result.success++
						result.inserted.push(singleData)
					}
				}
			} else {
				result.success += (insertedData || []).length
				result.inserted.push(...(insertedData || []))
			}
		}

		const status = result.success > 0 ? 200 : (result.failed > 0 ? 207 : 400)
		return NextResponse.json(result, { status })
	} catch (e) {
		console.error('Bulk import error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
