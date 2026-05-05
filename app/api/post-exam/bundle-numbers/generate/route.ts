import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * POST /api/post-exam/bundle-numbers/generate
 *
 * Mirrors the Board Wise > Regular/Arrear Count report (reports/exam-registration-reports):
 *   - Drives course list from exam_registrations enriched via course_offerings, fallback to courses table
 *   - Dedup key is (board_code, course_code) — same as the report's countMap
 *   - Sort: board_order ASC -> semester ASC -> course_order ASC -> course_code ASC
 *   - Theory courses only
 *
 * Append-only: courses already assigned a bundle for this (institution, session) are skipped.
 * New numbers continue from max(start_number, max_existing + 1).
 *
 * Body: { institution_code, exam_session, start_number }
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const { institution_code, exam_session } = body
		const startNumber = Math.max(1, Number(body.start_number) || 1)

		if (!institution_code?.trim()) {
			return NextResponse.json({ error: 'Institution code is required' }, { status: 400 })
		}
		if (!exam_session?.trim()) {
			return NextResponse.json({ error: 'Examination session is required' }, { status: 400 })
		}

		const { data: institutionData, error: institutionError } = await supabase
			.from('institutions')
			.select('id, institution_code')
			.eq('institution_code', String(institution_code))
			.single()

		if (institutionError || !institutionData) {
			return NextResponse.json({
				error: `Institution with code "${institution_code}" not found.`,
			}, { status: 400 })
		}

		const { data: sessionData, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id')
			.eq('session_code', String(exam_session))
			.eq('institutions_id', institutionData.id)
			.single()

		if (sessionError || !sessionData) {
			return NextResponse.json({
				error: `Examination session "${exam_session}" not found for institution "${institution_code}".`,
			}, { status: 400 })
		}

		// Pagination helper — no row cap, drains the table page by page
		const fetchAllPaginated = async (
			queryFn: (from: number, to: number) => any,
			pageSize = 1000,
		): Promise<any[]> => {
			const all: any[] = []
			let page = 0
			while (true) {
				const { data, error } = await queryFn(page * pageSize, (page + 1) * pageSize - 1)
				if (error) {
					console.error('Pagination error:', error)
					break
				}
				if (!data || data.length === 0) break
				all.push(...data)
				if (data.length < pageSize) break
				page++
				if (page > 200) break
			}
			return all
		}

		// Batched .in() helper
		const fetchBatchedIn = async <T,>(
			ids: string[],
			batchFn: (batch: string[]) => Promise<{ data: T[] | null; error: any }>,
			batchSize = 200,
		): Promise<T[]> => {
			if (ids.length === 0) return []
			const out: T[] = []
			for (let i = 0; i < ids.length; i += batchSize) {
				const batch = ids.slice(i, i + batchSize)
				const { data, error } = await batchFn(batch)
				if (error) console.error('Batch fetch error:', error)
				if (data) out.push(...data)
			}
			return out
		}

		// 1) Fetch all registrations (paginated, no cap)
		const allRegistrations = await fetchAllPaginated((from, to) =>
			supabase
				.from('exam_registrations')
				.select('id, course_offering_id, course_code, program_code')
				.eq('institutions_id', institutionData.id)
				.eq('examination_session_id', sessionData.id)
				.range(from, to)
		)

		if (allRegistrations.length === 0) {
			return NextResponse.json({
				success: true,
				message: 'No exam registrations found for this institution + session.',
				created: 0,
				skipped: 0,
				start_number: startNumber,
				next_number: startNumber,
				details: [],
			})
		}

		const courseOfferingIds = Array.from(new Set(
			allRegistrations.map(r => r.course_offering_id).filter(Boolean) as string[]
		))
		const codeFromRegs = Array.from(new Set(
			allRegistrations.map(r => r.course_code).filter(Boolean) as string[]
		))

		// 2) Fetch course_offerings with embedded course details (matches report's join)
		const allOfferings = await fetchBatchedIn<{
			id: string
			course_code: string | null
			program_code: string | null
			semester: number | null
			course_id: string | null
			courses: { course_name: string | null; board_id: string | null; board_code: string | null; course_category: string | null } | null
		}>(courseOfferingIds, (batch) =>
			supabase
				.from('course_offerings')
				.select('id, course_code, program_code, semester, course_id, courses:course_id(course_name, board_id, board_code, course_category)')
				.in('id', batch)
				.then(r => ({ data: r.data as any, error: r.error }))
		)

		// 3) Fetch boards (institution-scoped) for board_order resolution
		const { data: allBoards } = await supabase
			.from('board')
			.select('id, board_code, board_name, board_order')
			.eq('institutions_id', institutionData.id)

		const boardMap = new Map<string, { board_code: string; board_order: number; board_name: string | null }>()
		const boardCodeMap = new Map<string, { board_code: string; board_order: number; board_name: string | null }>()
		for (const b of (allBoards || []) as any[]) {
			const info = { board_code: b.board_code, board_order: b.board_order ?? 999, board_name: b.board_name || null }
			if (b.id) boardMap.set(b.id, info)
			if (b.board_code) boardCodeMap.set(b.board_code, info)
		}

		// 4) Fetch course_mapping for course_order
		const uniqueCourseIds = Array.from(new Set(
			allOfferings.map(o => o.course_id).filter(Boolean) as string[]
		))
		const courseMappings = await fetchBatchedIn<{ course_id: string; course_order: number | null }>(
			uniqueCourseIds,
			(batch) =>
				supabase.from('course_mapping').select('course_id, course_order').in('course_id', batch)
					.then(r => ({ data: r.data as any, error: r.error }))
		)
		const courseMappingOrderMap = new Map<string, number>()
		for (const m of courseMappings) {
			if (m.course_id && !courseMappingOrderMap.has(m.course_id)) {
				courseMappingOrderMap.set(m.course_id, m.course_order ?? 999)
			}
		}

		// 5) Build offering map with enriched data (board_code resolution mirrors report)
		type EnrichedOffering = {
			course_code: string
			course_id: string | null
			course_order: number
			course_name: string | null
			course_category: string | null
			semester: number
			board_code: string | null
			board_name: string | null
			board_order: number
		}

		const offeringMap = new Map<string, EnrichedOffering>()
		const courseCodeToOffering = new Map<string, EnrichedOffering>()
		for (const o of allOfferings) {
			const courseData = o.courses as any
			let boardInfo: { board_code: string; board_order: number; board_name: string | null } | undefined =
				courseData?.board_code
					? boardCodeMap.get(courseData.board_code)
					: courseData?.board_id
						? boardMap.get(courseData.board_id)
						: undefined

			// Same fallback chain as the report
			if (!boardInfo && o.course_code && o.course_code.length >= 5) {
				const prefix = o.course_code.substring(2, 5)
				boardInfo = boardCodeMap.get(prefix)
				if (!boardInfo && o.program_code) boardInfo = boardCodeMap.get(o.program_code)
			}

			const enriched: EnrichedOffering = {
				course_code: o.course_code || '',
				course_id: o.course_id || null,
				course_order: o.course_id ? (courseMappingOrderMap.get(o.course_id) ?? 999) : 999,
				course_name: courseData?.course_name || null,
				course_category: courseData?.course_category || null,
				semester: o.semester ?? 0,
				board_code: boardInfo?.board_code || courseData?.board_code || null,
				board_name: boardInfo?.board_name || null,
				board_order: boardInfo?.board_order ?? 999,
			}

			offeringMap.set(o.id, enriched)
			if (enriched.course_code && !courseCodeToOffering.has(enriched.course_code)) {
				courseCodeToOffering.set(enriched.course_code, enriched)
			}
		}

		// 6) Direct-courses fallback for course_codes that didn't resolve
		const unmatchedCodes = Array.from(new Set(
			allRegistrations
				.filter(r => r.course_code && !offeringMap.has(r.course_offering_id) && !courseCodeToOffering.has(r.course_code))
				.map(r => r.course_code)
		)) as string[]

		const directCourses = await fetchBatchedIn<{
			id: string; course_code: string; course_name: string | null; board_id: string | null; board_code: string | null; course_category: string | null
		}>(unmatchedCodes, (batch) =>
			supabase
				.from('courses')
				.select('id, course_code, course_name, board_id, board_code, course_category')
				.in('course_code', batch)
				.then(r => ({ data: r.data as any, error: r.error }))
		)
		const directCourseMap = new Map<string, typeof directCourses[number]>()
		for (const c of directCourses) {
			if (c.course_code && !directCourseMap.has(c.course_code)) directCourseMap.set(c.course_code, c)
		}

		// 7) Per-registration enrichment + dedupe by (board_code, course_code) — same key as report
		type Pair = {
			key: string
			board_code: string | null
			board_name: string | null
			board_order: number
			course_code: string
			course_name: string | null
			course_category: string | null
			course_order: number
			semester: number
			course_id: string | null
		}
		const pairMap = new Map<string, Pair>()

		for (const r of allRegistrations) {
			let enriched: EnrichedOffering | undefined = offeringMap.get(r.course_offering_id)
			if (!enriched && r.course_code) {
				enriched = courseCodeToOffering.get(r.course_code)
			}
			if (!enriched && r.course_code) {
				const direct = directCourseMap.get(r.course_code)
				if (direct) {
					const boardInfo = direct.board_code
						? boardCodeMap.get(direct.board_code)
						: direct.board_id
							? boardMap.get(direct.board_id)
							: undefined
					enriched = {
						course_code: direct.course_code,
						course_id: direct.id,
						course_order: courseMappingOrderMap.get(direct.id) ?? 999,
						course_name: direct.course_name,
						course_category: direct.course_category,
						semester: 0,
						board_code: boardInfo?.board_code || direct.board_code || null,
						board_name: boardInfo?.board_name || null,
						board_order: boardInfo?.board_order ?? 999,
					}
				}
			}
			if (!enriched || !enriched.course_code) continue

			const key = `${enriched.board_code || ''}|${enriched.course_code}`
			if (pairMap.has(key)) continue
			pairMap.set(key, {
				key,
				board_code: enriched.board_code,
				board_name: enriched.board_name,
				board_order: enriched.board_order,
				course_code: enriched.course_code,
				course_name: enriched.course_name,
				course_category: enriched.course_category,
				course_order: enriched.course_order,
				semester: enriched.semester,
				course_id: enriched.course_id,
			})
		}

		// 8) Theory filter + sort (same as Regular/Arrear Count report)
		const filtered = Array.from(pairMap.values()).filter(p => {
			const cat = (p.course_category || '').trim()
			return !cat || cat === 'Theory'
		})

		filtered.sort((a, b) =>
			(a.board_order - b.board_order)
			|| (a.semester - b.semester)
			|| (a.course_order - b.course_order)
			|| a.course_code.localeCompare(b.course_code)
		)

		// 9) Resolve missing course_id by looking up courses table (institution-scoped)
		const codesNeedingCourseId = filtered
			.filter(p => !p.course_id && p.course_code)
			.map(p => p.course_code)
		if (codesNeedingCourseId.length > 0) {
			const { data: lookups } = await supabase
				.from('courses')
				.select('id, course_code, board_code')
				.in('course_code', Array.from(new Set(codesNeedingCourseId)))
			const byCode = new Map<string, { id: string; board_code: string | null }[]>()
			for (const c of (lookups || []) as any[]) {
				if (!byCode.has(c.course_code)) byCode.set(c.course_code, [])
				byCode.get(c.course_code)!.push({ id: c.id, board_code: c.board_code || null })
			}
			for (const p of filtered) {
				if (p.course_id) continue
				const candidates = byCode.get(p.course_code) || []
				// Prefer the row whose board_code matches the enriched board_code
				const match = candidates.find(c => c.board_code === p.board_code) || candidates[0]
				if (match) p.course_id = match.id
			}
		}

		// 10) Existing bundle numbers
		const { data: existing } = await supabase
			.from('bundle_numbers')
			.select('course_id, bundle_number')
			.eq('institutions_id', institutionData.id)
			.eq('examination_session_id', sessionData.id)

		const existingByCourse = new Map<string, number>()
		let maxExisting = 0
		for (const e of (existing || []) as any[]) {
			if (e.course_id) existingByCourse.set(e.course_id, e.bundle_number)
			if (typeof e.bundle_number === 'number' && e.bundle_number > maxExisting) maxExisting = e.bundle_number
		}

		// 11) Append-only assignment
		let nextNum = Math.max(startNumber, maxExisting + 1)
		const inserts: Array<{
			institutions_id: string
			examination_session_id: string
			course_id: string
			bundle_number: number
		}> = []
		const usedCourseIds = new Set<string>()
		const details: Array<{
			course_code: string
			course_name: string | null
			board_code: string | null
			bundle_number: number | null
			status: 'created' | 'skipped' | 'error'
			error?: string
		}> = []

		for (const p of filtered) {
			if (!p.course_id) {
				details.push({
					course_code: p.course_code,
					course_name: p.course_name,
					board_code: p.board_code,
					bundle_number: null,
					status: 'error',
					error: 'Could not resolve course_id',
				})
				continue
			}

			if (existingByCourse.has(p.course_id)) {
				details.push({
					course_code: p.course_code,
					course_name: p.course_name,
					board_code: p.board_code,
					bundle_number: existingByCourse.get(p.course_id) || null,
					status: 'skipped',
				})
				continue
			}

			// Same course_id might appear under multiple (board, course_code) pairs.
			// Insert each course_id only once per generation.
			if (usedCourseIds.has(p.course_id)) {
				details.push({
					course_code: p.course_code,
					course_name: p.course_name,
					board_code: p.board_code,
					bundle_number: null,
					status: 'skipped',
				})
				continue
			}
			usedCourseIds.add(p.course_id)

			inserts.push({
				institutions_id: institutionData.id,
				examination_session_id: sessionData.id,
				course_id: p.course_id,
				bundle_number: nextNum,
			})
			details.push({
				course_code: p.course_code,
				course_name: p.course_name,
				board_code: p.board_code,
				bundle_number: nextNum,
				status: 'created',
			})
			nextNum++
		}

		let createdCount = 0
		if (inserts.length > 0) {
			// Insert in batches to avoid request size limits
			const insertBatch = 500
			for (let i = 0; i < inserts.length; i += insertBatch) {
				const batch = inserts.slice(i, i + insertBatch)
				const { data: inserted, error: insertErr } = await supabase
					.from('bundle_numbers')
					.insert(batch)
					.select('id')
				if (insertErr) {
					console.error('Error inserting bundle numbers:', insertErr)
					return NextResponse.json({ error: insertErr.message || 'Failed to insert bundle numbers' }, { status: 500 })
				}
				createdCount += inserted?.length || 0
			}
		}

		const skipped = details.filter(d => d.status === 'skipped').length
		const errored = details.filter(d => d.status === 'error').length

		return NextResponse.json({
			success: true,
			message: createdCount > 0
				? `Generated ${createdCount} bundle number(s). ${skipped} skipped, ${errored} could not be resolved.`
				: skipped > 0
					? `All ${skipped} eligible course(s) already have bundle numbers.`
					: 'No eligible Theory courses found for this session.',
			created: createdCount,
			skipped,
			start_number: startNumber,
			next_number: nextNum,
			details,
		})
	} catch (error) {
		console.error('Error in POST /api/post-exam/bundle-numbers/generate:', error)
		return NextResponse.json({
			error: error instanceof Error ? error.message : 'Internal server error',
		}, { status: 500 })
	}
}
