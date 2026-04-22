import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

interface BulkLearner {
	student_id: string
	stu_register_no: string
	student_name: string
}

interface BulkCourse {
	course_offering_id: string
	course_code: string
}

interface BulkPayload {
	institutions_id: string
	institution_code: string
	examination_session_id: string
	session_code: string
	program_code: string
	regulation_code?: string
	semester_code?: string
	courses: BulkCourse[]
	// pairs[i] = course_offering_id, pairs[i+1] = student_id (compact form)
	// OR pairs is an array of { course_offering_id, student_id }
	pairs: Array<{ course_offering_id: string; student_id: string }>
	learners: BulkLearner[]
	registration_date?: string
	registration_status?: string
	is_regular?: boolean
	attempt_number?: number
}

/**
 * Bulk-create exam registrations.
 *
 * Body provides:
 *  - The shared scope (institution, session, program, regulation, semester)
 *  - The full set of selected courses (with course_code) and learners (with names)
 *  - The (course_offering_id, student_id) pairs the user actually checked
 *
 * Pre-existing rows in exam_registrations for the same scope are skipped silently
 * so re-running the page is idempotent.
 */
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body: BulkPayload = await request.json()

		// ── Validation ──
		if (!body.institutions_id || !body.institution_code) {
			return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		}
		if (!body.examination_session_id || !body.session_code) {
			return NextResponse.json({ error: 'Examination session is required' }, { status: 400 })
		}
		if (!body.program_code) {
			return NextResponse.json({ error: 'Program is required' }, { status: 400 })
		}
		if (!Array.isArray(body.courses) || body.courses.length === 0) {
			return NextResponse.json({ error: 'At least one course is required' }, { status: 400 })
		}
		if (!Array.isArray(body.pairs) || body.pairs.length === 0) {
			return NextResponse.json({ error: 'No learner-course selections provided' }, { status: 400 })
		}
		if (!Array.isArray(body.learners) || body.learners.length === 0) {
			return NextResponse.json({ error: 'No learners provided' }, { status: 400 })
		}

		// ── Lookup helpers ──
		const courseByOfferingId = new Map<string, BulkCourse>()
		body.courses.forEach(c => courseByOfferingId.set(c.course_offering_id, c))

		const learnerById = new Map<string, BulkLearner>()
		body.learners.forEach(l => learnerById.set(l.student_id, l))

		const courseOfferingIds = [...new Set(body.pairs.map(p => p.course_offering_id))]

		// ── Fetch existing registrations to skip duplicates ──
		const existingKeys = new Set<string>()
		{
			const pageSize = 1000
			let page = 0
			let hasMore = true
			while (hasMore) {
				const { data, error } = await supabase
					.from('exam_registrations')
					.select('student_id, stu_register_no, course_offering_id')
					.eq('institutions_id', body.institutions_id)
					.eq('examination_session_id', body.examination_session_id)
					.in('course_offering_id', courseOfferingIds)
					.range(page * pageSize, (page + 1) * pageSize - 1)

				if (error) {
					console.error('[bulk-create] existing fetch error:', error)
					return NextResponse.json({ error: 'Failed to check existing registrations' }, { status: 500 })
				}

				if (data && data.length > 0) {
					data.forEach(r => {
						if (r.student_id) existingKeys.add(`sid:${r.student_id}|${r.course_offering_id}`)
						if (r.stu_register_no) existingKeys.add(`reg:${r.stu_register_no}|${r.course_offering_id}`)
					})
					page++
					hasMore = data.length === pageSize
				} else {
					hasMore = false
				}
			}
		}

		// ── Build insert payloads, skipping existing ──
		const now = new Date().toISOString()
		const regDate = body.registration_date || now.split('T')[0]
		const status = body.registration_status || 'Pending'
		const isRegular = body.is_regular ?? true
		const attempt = body.attempt_number ?? 1

		const payloads: any[] = []
		let skipped = 0
		const skippedSamples: Array<{ register_no: string; course_code: string }> = []

		for (const pair of body.pairs) {
			const learner = learnerById.get(pair.student_id)
			const course = courseByOfferingId.get(pair.course_offering_id)
			if (!learner || !course) {
				skipped++
				continue
			}

			const sidKey = `sid:${pair.student_id}|${pair.course_offering_id}`
			const regKey = `reg:${learner.stu_register_no}|${pair.course_offering_id}`
			if (existingKeys.has(sidKey) || existingKeys.has(regKey)) {
				skipped++
				if (skippedSamples.length < 5) {
					skippedSamples.push({ register_no: learner.stu_register_no, course_code: course.course_code })
				}
				continue
			}

			payloads.push({
				institutions_id: body.institutions_id,
				institution_code: body.institution_code,
				student_id: pair.student_id,
				stu_register_no: learner.stu_register_no,
				student_name: learner.student_name || null,
				examination_session_id: body.examination_session_id,
				session_code: body.session_code,
				course_offering_id: pair.course_offering_id,
				course_code: course.course_code,
				program_code: body.program_code,
				registration_date: regDate,
				registration_status: status,
				is_regular: isRegular,
				attempt_number: attempt,
				fee_paid: false,
			})
		}

		// ── Batched insert ──
		let created = 0
		const failures: Array<{ register_no: string; course_code: string; error: string }> = []

		if (payloads.length > 0) {
			const BATCH = 500
			for (let i = 0; i < payloads.length; i += BATCH) {
				const batch = payloads.slice(i, i + BATCH)
				const { data, error } = await supabase
					.from('exam_registrations')
					.insert(batch)
					.select('id')

				if (error) {
					console.error('[bulk-create] batch insert error:', error)
					// Fall back to per-row insert so partial success is possible
					for (const row of batch) {
						const { error: rowErr } = await supabase
							.from('exam_registrations')
							.insert([row])
						if (rowErr) {
							if (rowErr.code === '23505') {
								skipped++
							} else {
								failures.push({
									register_no: row.stu_register_no || '',
									course_code: row.course_code || '',
									error: rowErr.message || 'Insert failed',
								})
							}
						} else {
							created++
						}
					}
				} else {
					created += data?.length || 0
				}
			}
		}

		const parts: string[] = []
		if (created > 0) parts.push(`${created} registered`)
		if (skipped > 0) parts.push(`${skipped} already registered (skipped)`)
		if (failures.length > 0) parts.push(`${failures.length} failed`)
		const message = parts.join(', ') || 'No changes'

		return NextResponse.json({
			created,
			skipped,
			failed: failures.length,
			failures: failures.slice(0, 50),
			skippedSamples,
			message,
		}, { status: created > 0 ? 201 : 200 })
	} catch (e) {
		console.error('[bulk-create] unexpected error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
