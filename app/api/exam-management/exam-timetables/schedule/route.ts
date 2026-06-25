import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNPrograms } from '@/lib/myjkkn-api'

// DB constraint check_practical_batch_capacity: exam_type 'Theory' → batch_capacity must be NULL;
// any other exam_type (Practical, Project, Field Work, Theory + Practical, …) → batch_capacity > 0.
const requiresBatch = (examType?: string) => (examType || 'Theory') !== 'Theory'

// Helper: fetch all pages from a Supabase query (bypasses 1000-row limit)
async function fetchAllPaginated(
	queryFn: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>,
	pageSize = 1000
): Promise<any[]> {
	const all: any[] = []
	let page = 0
	let hasMore = true
	while (hasMore && all.length < 1000000) {
		const { data, error } = await queryFn(page * pageSize, (page + 1) * pageSize - 1)
		if (error) throw error
		if (data && data.length > 0) {
			all.push(...data)
			page++
			hasMore = data.length === pageSize
		} else {
			hasMore = false
		}
	}
	return all
}

// Helper: fetch rows for a large list of ids using batched .in() queries
async function fetchBatchedIn(
	ids: string[],
	queryFn: (batch: string[]) => Promise<{ data: any[] | null; error: any }>,
	batchSize = 300
): Promise<any[]> {
	const out: any[] = []
	for (let i = 0; i < ids.length; i += batchSize) {
		const batch = ids.slice(i, i + batchSize)
		const { data, error } = await queryFn(batch)
		if (error) throw error
		if (data) out.push(...data)
	}
	return out
}

// Derive UG/PG: program starting with "P" → PG, otherwise UG (last-resort heuristic)
function heuristicType(programCode: string): 'UG' | 'PG' {
	return programCode.toUpperCase().startsWith('P') ? 'PG' : 'UG'
}

/**
 * GET — list subjects schedulable for a session.
 * Returns course offerings that have at least one Approved exam registration and are NOT yet
 * present in exam_timetables for the session, annotated with program (UG/PG), semester, exam type
 * and approved learner count.
 */
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')

		if (!institutions_id || !examination_session_id) {
			return NextResponse.json(
				{ error: 'institutions_id and examination_session_id are required' },
				{ status: 400 }
			)
		}

		// 1. All Approved registrations for the session (paginated)
		const registrations = await fetchAllPaginated((from, to) =>
			supabase
				.from('exam_registrations')
				.select('course_offering_id, student_id, program_code')
				.eq('institutions_id', institutions_id)
				.eq('examination_session_id', examination_session_id)
				.eq('registration_status', 'Approved')
				.range(from, to)
		)

		if (registrations.length === 0) {
			return NextResponse.json({ programs: [], subjects: [] })
		}

		// 2. Distinct learner count per course offering
		const learnersByOffering = new Map<string, Set<string>>()
		for (const r of registrations) {
			if (!r.course_offering_id) continue
			let set = learnersByOffering.get(r.course_offering_id)
			if (!set) {
				set = new Set<string>()
				learnersByOffering.set(r.course_offering_id, set)
			}
			if (r.student_id) set.add(r.student_id)
		}
		const offeringIds = [...learnersByOffering.keys()]

		// 3. Course offerings + course details (batched)
		const offerings = await fetchBatchedIn(offeringIds, (batch) =>
			supabase
				.from('course_offerings')
				.select('id, course_code, course_id, program_code, semester, courses:course_id(course_name, course_category)')
				.in('id', batch)
		)

		// 4. Already-scheduled offerings for this session (keep date + session to display)
		const existingTimetables = await fetchAllPaginated((from, to) =>
			supabase
				.from('exam_timetables')
				.select('id, course_offering_id, course_id, exam_date, session, is_published')
				.eq('institutions_id', institutions_id)
				.eq('examination_session_id', examination_session_id)
				.range(from, to)
		)
		type SchedInfo = { exam_timetable_id: string; exam_date: string; session: string; is_published: boolean }
		const scheduledByOffering = new Map<string, SchedInfo>()
		const scheduledByCourse = new Map<string, SchedInfo>()
		for (const t of existingTimetables as any[]) {
			const info: SchedInfo = { exam_timetable_id: t.id, exam_date: t.exam_date, session: t.session, is_published: !!t.is_published }
			if (t.course_offering_id && !scheduledByOffering.has(t.course_offering_id)) scheduledByOffering.set(t.course_offering_id, info)
			if (t.course_id && !scheduledByCourse.has(t.course_id)) scheduledByCourse.set(t.course_id, info)
		}

		// 5. Program maps — MyJKKN primary (program_type), local programs fallback (name/order)
		const programTypeMap = new Map<string, 'UG' | 'PG'>()
		const programNameMap = new Map<string, string>()
		const programOrderMap = new Map<string, number>()

		try {
			const myjkknPrograms = await fetchAllMyJKKNPrograms({ all: true } as any)
			for (const p of myjkknPrograms as any[]) {
				const code = p.program_id || p.program_code
				if (!code) continue
				if (!programTypeMap.has(code) && p.program_type) {
					const pt = String(p.program_type).toUpperCase()
					if (pt === 'UG' || pt === 'PG') programTypeMap.set(code, pt)
				}
				if (!programNameMap.has(code) && (p.program_name || p.name)) {
					programNameMap.set(code, p.program_name || p.name)
				}
				const order = p.program_order ?? p.sort_order
				if (!programOrderMap.has(code) && order != null) programOrderMap.set(code, order)
			}
		} catch (e) {
			console.warn('[schedule lookup] MyJKKN programs fetch failed, using local fallback:', e)
		}

		const { data: localPrograms } = await supabase
			.from('programs')
			.select('program_code, program_name, program_type, program_order')
			.eq('institutions_id', institutions_id)
			.eq('is_active', true)
			.range(0, 9999)
		for (const lp of localPrograms || []) {
			if (lp.program_code && !programNameMap.has(lp.program_code) && lp.program_name) {
				programNameMap.set(lp.program_code, lp.program_name)
			}
			if (lp.program_code && !programOrderMap.has(lp.program_code) && lp.program_order != null) {
				programOrderMap.set(lp.program_code, lp.program_order)
			}
			if (lp.program_code && !programTypeMap.has(lp.program_code) && lp.program_type) {
				const pt = String(lp.program_type).toUpperCase()
				if (pt === 'UG' || pt === 'PG') programTypeMap.set(lp.program_code, pt)
			}
		}

		// 6. Build subject list (scheduled ones are flagged with their date + session, not removed)
		const subjects = (offerings || [])
			.map((o: any) => {
				const programCode = o.program_code || ''
				const course = (Array.isArray(o.courses) ? o.courses[0] : o.courses) || {}
				const scheduled = scheduledByOffering.get(o.id) || scheduledByCourse.get(o.course_id) || null
				return {
					course_offering_id: o.id,
					course_id: o.course_id,
					course_code: o.course_code,
					course_name: course.course_name || o.course_code,
					program_code: programCode,
					program_name: programNameMap.get(programCode) || programCode,
					program_type: programTypeMap.get(programCode) || heuristicType(programCode),
					semester: o.semester ?? null,
					exam_type: course.course_category || 'Theory',
					approved_count: learnersByOffering.get(o.id)?.size || 0,
					is_scheduled: !!scheduled,
					scheduled_exam_date: scheduled?.exam_date || null,
					scheduled_session: scheduled?.session || null,
					scheduled_published: scheduled?.is_published || false,
					exam_timetable_id: scheduled?.exam_timetable_id || null,
				}
			})
			.sort((a: any, b: any) => {
				const po = (programOrderMap.get(a.program_code) ?? 999) - (programOrderMap.get(b.program_code) ?? 999)
				if (po !== 0) return po
				if ((a.semester ?? 99) !== (b.semester ?? 99)) return (a.semester ?? 99) - (b.semester ?? 99)
				return a.course_code.localeCompare(b.course_code)
			})

		// Distinct programs present in this subject list (for the filter dropdown)
		const programsMap = new Map<string, any>()
		for (const s of subjects) {
			if (s.program_code && !programsMap.has(s.program_code)) {
				programsMap.set(s.program_code, {
					program_code: s.program_code,
					program_name: s.program_name,
					program_type: s.program_type,
					program_order: programOrderMap.get(s.program_code) ?? 999,
				})
			}
		}
		const programs = [...programsMap.values()].sort((a, b) => a.program_order - b.program_order)

		return NextResponse.json({ programs, subjects })
	} catch (e) {
		console.error('[schedule lookup] error:', e)
		return NextResponse.json({ error: 'Failed to load schedulable subjects' }, { status: 500 })
	}
}

/**
 * POST — bulk-create exam timetable rows for the selected subjects on a single date + session.
 */
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			institutions_id,
			examination_session_id,
			exam_date,
			session,
			exam_mode = 'Offline',
			is_published = false,
			items,
		} = body || {}

		if (!institutions_id || !examination_session_id) {
			return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
		}
		if (!exam_date) {
			return NextResponse.json({ error: 'Exam Date is required' }, { status: 400 })
		}
		if (!session || !['FN', 'AN'].includes(String(session).toUpperCase())) {
			return NextResponse.json({ error: 'Session must be FN or AN' }, { status: 400 })
		}
		if (!Array.isArray(items) || items.length === 0) {
			return NextResponse.json({ error: 'At least one subject must be selected' }, { status: 400 })
		}

		// Validate batch capacity for practical-type subjects
		for (const it of items) {
			if (requiresBatch(it.exam_type) && (!it.batch_capacity || Number(it.batch_capacity) < 1)) {
				return NextResponse.json(
					{ error: `Batch Capacity is required for ${it.exam_type} subject "${it.course_code}"` },
					{ status: 400 }
				)
			}
		}

		// Derive duration_minutes from courses.exam_duration (hours → minutes)
		const courseIds = [...new Set(items.map((it: any) => it.course_id).filter(Boolean))]
		const durationByCourse = new Map<string, number>()
		if (courseIds.length > 0) {
			const courses = await fetchBatchedIn(courseIds as string[], (batch) =>
				supabase.from('courses').select('id, exam_duration').in('id', batch)
			)
			for (const c of courses) {
				if (c.exam_duration) durationByCourse.set(c.id, Math.round(c.exam_duration * 60))
			}
		}

		const sess = String(session).toUpperCase()
		const nowIso = new Date().toISOString()

		// Split into updates (re-scheduling an existing unpublished row) and new inserts
		const newRows: any[] = []
		const updates: Array<{ id: string; course_code: string; payload: any }> = []
		for (const it of items) {
			const isPractical = requiresBatch(it.exam_type)
			const batch_capacity = isPractical ? Number(it.batch_capacity) || null : null
			if (it.exam_timetable_id) {
				// Reschedule existing row — change date/session/mode/batch.
				// Publishing is additive from this page: the batch toggle can publish a row,
				// but leaving it off must NOT unpublish an already-published row
				// (unpublishing is done from the Exam Timetables list page).
				const rowPublished = is_published || !!it.was_published
				updates.push({
					id: it.exam_timetable_id,
					course_code: it.course_code,
					payload: { exam_date, session: sess, exam_mode, is_published: rowPublished, batch_capacity, updated_at: nowIso },
				})
			} else {
				newRows.push({
					institutions_id,
					examination_session_id,
					course_id: it.course_id,
					course_offering_id: it.course_offering_id,
					exam_date,
					session: sess,
					// duration_minutes is NOT NULL; default to 180 (3h) when the course has no exam_duration
					duration_minutes: durationByCourse.get(it.course_id) || 180,
					exam_mode,
					is_published,
					exam_type: it.exam_type || 'Theory',
					batch_capacity,
				})
			}
		}

		let created = 0
		let updated = 0
		let skipped = 0
		const errors: string[] = []

		// Apply updates (reschedules)
		for (const u of updates) {
			const { error: upErr } = await supabase.from('exam_timetables').update(u.payload).eq('id', u.id)
			if (!upErr) updated++
			else errors.push(`${u.course_code}: ${upErr.message}`)
		}

		// Insert new rows — try batch, fall back to per-row on duplicate
		if (newRows.length > 0) {
			const { data, error } = await supabase.from('exam_timetables').insert(newRows).select('id')
			if (!error) {
				created += data?.length || newRows.length
			} else if (error.code === '23505') {
				for (let i = 0; i < newRows.length; i++) {
					const { error: rowErr } = await supabase.from('exam_timetables').insert([newRows[i]]).select('id').single()
					if (!rowErr) created++
					else if (rowErr.code === '23505') skipped++
					else errors.push(`${newRows[i].course_offering_id}: ${rowErr.message}`)
				}
			} else {
				console.error('[schedule create] batch insert error:', error)
				return NextResponse.json({ error: 'Failed to create exam timetables', details: error.message }, { status: 500 })
			}
		}

		return NextResponse.json({ created, updated, skipped, errors }, { status: created + updated > 0 ? 201 : 400 })
	} catch (e) {
		console.error('[schedule create] error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
