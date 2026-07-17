import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { scaffoldQuestions } from '@/lib/ia/paper-scaffold'
import { formatApplicability, pickTemplateForCourse } from '@/lib/ia/course-type-applicability'

// Resolve the COE user id from the MyJKKN access_token cookie (best-effort; nullable).
function resolveUserId(req: NextRequest): string | null {
	const token = req.cookies.get('access_token')?.value
	if (!token) return null
	try {
		const parts = token.split('.')
		if (parts.length === 3) {
			const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
			const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
			const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'))
			return payload.sub || payload.user_id || payload.id || null
		}
	} catch {
		/* ignore */
	}
	return null
}

// How many paper sets for a course (courses.multiple_qp_set may be bool or a count)
function setCount(multiple: any): number {
	if (typeof multiple === 'number') return multiple > 1 ? multiple : 1
	if (multiple === true) return 2
	return 1
}

// GET - list papers with filters
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const ciaRound = searchParams.get('cia_round')
		const programCode = searchParams.get('program_code')
		const semester = searchParams.get('semester')
		const status = searchParams.get('status')

		let query = supabase
			.from('ia_question_papers')
			.select('*')
			.eq('is_active', true)
			.order('course_code', { ascending: true })
			.order('set_number', { ascending: true })

		if (institutionsId) query = query.eq('institutions_id', institutionsId)
		if (sessionId) query = query.eq('examination_session_id', sessionId)
		if (ciaRound) query = query.eq('cia_round', Number(ciaRound))
		if (programCode) query = query.eq('program_code', programCode)
		if (semester) query = query.eq('semester', Number(semester))
		if (status) query = query.eq('status', status)

		const { data, error } = await query.range(0, 9999)
		if (error) {
			console.error('Error listing papers:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json(data)
	} catch (error) {
		console.error('Error in GET papers:', error)
		return NextResponse.json({ error: 'Failed to list question papers' }, { status: 500 })
	}
}

// POST - generate papers for registered courses of a session + CIA round
export async function POST(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()
		const {
			institutions_id,
			examination_session_id,
			program_code,
			semester,
			cia_setting_id,
			cia_round,
			cia_round_name,
			template_id, // optional override; else resolve default
		} = body

		if (!institutions_id || !examination_session_id || !program_code || !semester) {
			return NextResponse.json(
				{ error: 'institutions_id, examination_session_id, program_code and semester are required' },
				{ status: 400 }
			)
		}
		const round = cia_round ? Number(cia_round) : 1

		// Author = MyJKKN staff profile UUID. author_id/created_by are plain UUIDs
		// (no FK after 20260717 migration), so store the acting user id directly.
		const userId = body.author_id || resolveUserId(req)

		// 1. Course offerings for this session + program + semester
		const { data: offerings, error: coError } = await supabase
			.from('course_offerings')
			.select('id, course_id, program_id, semester, course_code, program_code')
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.eq('program_code', program_code)
			.eq('semester', Number(semester))
			.eq('is_active', true)

		if (coError) {
			console.error('Error fetching offerings:', coError)
			return NextResponse.json({ error: 'Failed to fetch course offerings' }, { status: 500 })
		}
		if (!offerings || offerings.length === 0) {
			return NextResponse.json({ error: 'No course offerings found for this selection' }, { status: 404 })
		}

		// 2. Enrich with course master
		const codes = [...new Set(offerings.map(o => o.course_code).filter(Boolean))]
		const { data: courses } = await supabase
			.from('courses')
			.select('id, course_code, course_name, course_type, course_category, evaluation_type, multiple_qp_set, exam_duration, internal_max_mark')
			.eq('institutions_id', institutions_id)
			.in('course_code', codes)
		const courseByCode = new Map((courses || []).map(c => [c.course_code, c]))

		// 3. Candidate templates: explicit override, else institution CIA defaults
		let templates: any[] = []
		if (template_id) {
			const { data } = await supabase
				.from('ia_paper_templates')
				.select('*, ia_template_parts(*)')
				.eq('id', template_id)
				.limit(1)
			templates = data || []
		} else {
			// Prefer active default CIA templates; fall back to any active CIA template.
			const { data: activeTemplates } = await supabase
				.from('ia_paper_templates')
				.select('*, ia_template_parts(*)')
				.eq('institutions_id', institutions_id)
				.eq('is_active', true)
				.eq('status', 'active')
				.in('exam_scope', ['cia', 'all'])
				.order('is_default', { ascending: false })
				.order('wef_date', { ascending: false })
			templates = activeTemplates || []
		}
		if (templates.length === 0) {
			// Distinguish "none activated" from "none exist" for a clearer message.
			const { count } = await supabase
				.from('ia_paper_templates')
				.select('id', { count: 'exact', head: true })
				.eq('institutions_id', institutions_id)
				.in('exam_scope', ['cia', 'all'])
			const hint =
				count && count > 0
					? 'A CIA template exists but is not Active — open it and set status to Active (and ideally mark it Default).'
					: 'No CIA template exists yet — create one in Question Paper Templates, then Activate it.'
			return NextResponse.json({ error: hint }, { status: 400 })
		}

		// Per-course template pick: the template whose Course Type covers this
		// course's category (courses.course_category), else an 'all' template.
		// null => no template applies, so the course gets no paper.
		//
		// This holds for an explicit template_id too — `templates` is then just that
		// one template, so a Theory-only template still skips Practical courses
		// rather than being force-applied to everything.
		const pickTemplate = (courseCategory?: string | null) =>
			pickTemplateForCourse(templates, courseCategory)

		// 4. Existing papers (avoid duplicates — cia_setting_id may be null so match on session)
		const offeringIds = offerings.map(o => o.id)
		const { data: existing } = await supabase
			.from('ia_question_papers')
			.select('course_offering_id, set_number')
			.eq('examination_session_id', examination_session_id)
			.eq('cia_round', round)
			.in('course_offering_id', offeringIds)
		const existingKey = new Set((existing || []).map(e => `${e.course_offering_id}:${e.set_number}`))

		// 5. Generate
		const created: any[] = []
		let skipped = 0
		const seenOffering = new Set<string>()
		// Courses no active template covers (e.g. Practical courses when only a
		// Theory template is active) — reported back so the UI can explain the gap.
		const notApplicable: string[] = []

		for (const off of offerings) {
			if (seenOffering.has(off.id)) continue
			seenOffering.add(off.id)

			const course = courseByCode.get(off.course_code)
			// Only CIA / CIA+ESE courses get internal papers
			const evalType = course?.evaluation_type || ''
			if (evalType && evalType !== 'CIA' && evalType !== 'CIA + ESE') continue

			const tmpl = pickTemplate(course?.course_category)
			if (!tmpl) {
				notApplicable.push(`${off.course_code} (${course?.course_category || 'no category'})`)
				continue
			}
			const parts = tmpl.ia_template_parts || []
			const sets = setCount(course?.multiple_qp_set)

			for (let s = 1; s <= sets; s++) {
				if (existingKey.has(`${off.id}:${s}`)) {
					skipped++
					continue
				}
				const { data: paper, error: paperError } = await supabase
					.from('ia_question_papers')
					.insert({
						institutions_id,
						examination_session_id,
						cia_setting_id: cia_setting_id || null,
						cia_round: round,
						cia_round_name: cia_round_name || null,
						course_offering_id: off.id,
						course_id: course?.id || off.course_id,
						course_code: off.course_code,
						program_code: off.program_code,
						semester: off.semester,
						template_id: tmpl.id,
						template_version: tmpl.version_number,
						set_number: s,
						set_label: sets > 1 ? String.fromCharCode(64 + s) : null,
						subject_title: course?.course_name || off.course_code,
						duration_minutes: tmpl.duration_minutes || null,
						max_marks: tmpl.total_marks,
						status: 'draft',
						created_by: userId,
						author_id: userId,
					})
					.select()
					.single()

				if (paperError) {
					console.error('Error creating paper:', paperError)
					continue
				}

				const questionRows = scaffoldQuestions(paper.id, parts)
				if (questionRows.length > 0) {
					const { error: qError } = await supabase.from('ia_paper_questions').insert(questionRows)
					if (qError) console.error('Error scaffolding questions:', qError)
				}
				created.push(paper)
			}
		}

		// What course types the active templates actually cover — used in the
		// "no template applies" message so the fix is obvious.
		const covered = [...new Set(templates.map(t => formatApplicability(t.course_type_applicability)))].join(', ')

		return NextResponse.json(
			{
				success: true,
				created: created.length,
				skipped,
				not_applicable: notApplicable.length,
				not_applicable_courses: notApplicable,
				...(notApplicable.length ? { templates_cover: covered } : {}),
				message:
					`Generated ${created.length} paper(s)` +
					(skipped ? `, ${skipped} already existed` : '') +
					(notApplicable.length
						? `, ${notApplicable.length} course(s) skipped — no active template covers their course type (templates cover: ${covered})`
						: ''),
			},
			{ status: 201 }
		)
	} catch (error) {
		console.error('Error in POST generate papers:', error)
		return NextResponse.json({ error: 'Failed to generate question papers' }, { status: 500 })
	}
}
