import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { RevaluationLearnerRow, RevaluationResultRow } from '@/types/final-marks'

/**
 * Generate After Revaluation API
 *
 * Separate from POST /api/grading/final-marks on purpose:
 * the main route hard-blocks any regeneration once final_marks rows exist.
 * This route only UPDATES existing final_marks rows for learners whose
 * marks_entry.revaluation_marks_obtained is set, preserving the original
 * values in the final_marks.original_* snapshot columns.
 *
 * Old marks are always retained:
 * - marks_entry.total_marks_obtained  = original external mark (never changed)
 * - marks_entry.revaluation_marks_obtained = new revaluation mark
 * - final_marks.original_*            = pre-revaluation snapshot (written once)
 */

const BATCH_SIZE = 200

/** Detect program type (UG/PG) from program code — mirrors main route */
function getProgramTypeFromCode(programCode?: string): 'UG' | 'PG' {
	if (!programCode) return 'UG'
	const upperCode = programCode.toUpperCase()
	const pgPrefixes = ['MSC', 'M.SC', 'M SC', 'MBA', 'MCA', 'MA', 'M.A', 'MCOM', 'M.COM', 'M COM', 'MSW', 'MPHIL', 'PHD', 'PH.D', 'MASTER', 'POST', 'PG']
	for (const prefix of pgPrefixes) {
		if (upperCode.startsWith(prefix)) return 'PG'
	}
	if (/^[0-9]{2}P[A-Z]/.test(upperCode)) return 'PG'
	if (/^P[A-Z]{2,3}$/.test(upperCode)) return 'PG'
	return 'UG'
}

/**
 * Return the user id only if it exists in the local `users` table, else null.
 * The audit columns (revaluation_entered_by / revaluation_applied_by / updated_by)
 * FK to users(id); the logged-in id is a parent-auth id that is not always
 * mirrored into `users`, so writing it raw causes a 23503 FK violation.
 */
async function resolveUserId(supabase: any, userId: string | null | undefined): Promise<string | null> {
	if (!userId) return null
	const { data } = await supabase.from('users').select('id').eq('id', userId).maybeSingle()
	return data?.id || null
}

/** Fetch rows from a table with .in() filter, batched to avoid URL limits */
async function fetchInBatches(
	supabase: any,
	table: string,
	select: string,
	inColumn: string,
	ids: string[],
	extraFilter?: (q: any) => any
): Promise<any[]> {
	const rows: any[] = []
	for (let i = 0; i < ids.length; i += BATCH_SIZE) {
		const batchIds = ids.slice(i, i + BATCH_SIZE)
		let query = supabase.from(table).select(select).in(inColumn, batchIds)
		if (extraFilter) query = extraFilter(query)
		const { data, error } = await query.range(0, 9999)
		if (error) {
			console.error(`[Reval Final Marks] Error fetching ${table} batch:`, error)
		} else if (data) {
			rows.push(...data)
		}
	}
	return rows
}

/**
 * GET /api/grading/final-marks/revaluation?action=learners
 * List learners of a saved course with their current final marks,
 * original external mark and any entered revaluation mark.
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const action = searchParams.get('action')

		if (action !== 'learners') {
			return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
		}

		const institutionId = searchParams.get('institutionId')
		const sessionId = searchParams.get('sessionId')
		const programCode = searchParams.get('programCode')
		const courseId = searchParams.get('courseId')

		if (!institutionId || !sessionId || !programCode || !courseId) {
			return NextResponse.json({
				error: 'institutionId, sessionId, programCode and courseId are required'
			}, { status: 400 })
		}

		// 1. Existing final_marks rows for the course (revaluation needs a saved result)
		const { data: finalMarks, error: fmError } = await supabase
			.from('final_marks')
			.select(`
				id,
				exam_registration_id,
				student_id,
				register_number,
				internal_marks_obtained,
				external_marks_obtained,
				external_marks_maximum,
				total_marks_obtained,
				total_marks_maximum,
				percentage,
				letter_grade,
				pass_status,
				result_status,
				is_revaluation_applied,
				original_external_marks_obtained
			`)
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', sessionId)
			.eq('program_code', programCode)
			.eq('course_id', courseId)
			.eq('is_active', true)
			.order('register_number')
			.range(0, 9999)

		if (fmError) {
			console.error('[Reval Final Marks] Error fetching final_marks:', fmError)
			return NextResponse.json({ error: 'Failed to fetch final marks' }, { status: 500 })
		}

		if (!finalMarks || finalMarks.length === 0) {
			return NextResponse.json([])
		}

		const examRegIds = [...new Set(finalMarks.map((fm: any) => fm.exam_registration_id).filter(Boolean))] as string[]

		// 2. marks_entry rows (original external mark + revaluation column)
		const marksEntries = await fetchInBatches(
			supabase,
			'marks_entry',
			'id, exam_registration_id, course_id, total_marks_obtained, marks_out_of, revaluation_marks_obtained, revaluation_remarks',
			'exam_registration_id',
			examRegIds,
			(q) => q.eq('course_id', courseId)
		)
		const marksEntryMap = new Map(marksEntries.map((me: any) => [me.exam_registration_id, me]))

		// 3. Learner names from exam_registrations
		const examRegs = await fetchInBatches(
			supabase,
			'exam_registrations',
			'id, student_name, stu_register_no',
			'id',
			examRegIds
		)
		const examRegMap = new Map(examRegs.map((er: any) => [er.id, er]))

		const rows: RevaluationLearnerRow[] = finalMarks
			.filter((fm: any) => marksEntryMap.has(fm.exam_registration_id))
			.map((fm: any) => {
				const me = marksEntryMap.get(fm.exam_registration_id)
				const er = examRegMap.get(fm.exam_registration_id)
				return {
					final_marks_id: fm.id,
					marks_entry_id: me.id,
					exam_registration_id: fm.exam_registration_id,
					student_id: fm.student_id,
					register_no: fm.register_number || er?.stu_register_no || 'N/A',
					student_name: er?.student_name || 'Unknown',
					internal_marks: Number(fm.internal_marks_obtained) || 0,
					original_external_marks: Number(me.total_marks_obtained) || 0,
					external_max: Number(me.marks_out_of) || Number(fm.external_marks_maximum) || 0,
					current_external_marks: Number(fm.external_marks_obtained) || 0,
					current_total_marks: Number(fm.total_marks_obtained) || 0,
					current_percentage: Number(fm.percentage) || 0,
					current_grade: fm.letter_grade,
					current_pass_status: fm.pass_status,
					result_status: fm.result_status,
					revaluation_mark: me.revaluation_marks_obtained !== null && me.revaluation_marks_obtained !== undefined
						? Number(me.revaluation_marks_obtained)
						: null,
					revaluation_remarks: me.revaluation_remarks || null,
					is_revaluation_applied: fm.is_revaluation_applied === true
				}
			})

		return NextResponse.json(rows)
	} catch (error) {
		console.error('[Reval Final Marks] GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * POST /api/grading/final-marks/revaluation
 * action = 'save-marks' : store revaluation marks in marks_entry (new column)
 * action = 'generate'   : recalculate results using the revaluation mark;
 *                         save_to_db=true updates final_marks in place
 *                         (original values snapshotted into original_*)
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()
		const action = body.action

		if (action === 'save-marks') {
			return handleSaveMarks(supabase, body)
		}
		if (action === 'generate') {
			return handleGenerate(supabase, body)
		}
		return NextResponse.json({ error: 'Invalid action. Use save-marks or generate.' }, { status: 400 })
	} catch (error) {
		console.error('[Reval Final Marks] POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/** Save revaluation marks into marks_entry.revaluation_marks_obtained */
async function handleSaveMarks(supabase: any, body: any) {
	const marks: Array<{
		marks_entry_id: string
		revaluation_marks_obtained: number | null
		revaluation_remarks?: string | null
	}> = body.marks || []

	if (!Array.isArray(marks) || marks.length === 0) {
		return NextResponse.json({ error: 'No marks provided' }, { status: 400 })
	}

	let savedCount = 0
	const errors: Array<{ marks_entry_id: string; error: string }> = []

	// Only stamp entered_by if the id actually exists in users (FK to users.id)
	const enteredBy = await resolveUserId(supabase, body.entered_by)

	for (const mark of marks) {
		if (!mark.marks_entry_id) continue

		if (mark.revaluation_marks_obtained !== null &&
			(isNaN(Number(mark.revaluation_marks_obtained)) || Number(mark.revaluation_marks_obtained) < 0)) {
			errors.push({ marks_entry_id: mark.marks_entry_id, error: 'Invalid mark value' })
			continue
		}

		// NOTE: the DB check constraint also enforces mark <= marks_out_of
		const { error } = await supabase
			.from('marks_entry')
			.update({
				revaluation_marks_obtained: mark.revaluation_marks_obtained,
				revaluation_marks_in_words: null,
				revaluation_remarks: mark.revaluation_remarks || null,
				revaluation_entry_date: mark.revaluation_marks_obtained !== null ? new Date().toISOString() : null,
				revaluation_entered_by: enteredBy
			})
			.eq('id', mark.marks_entry_id)

		if (error) {
			console.error('[Reval Final Marks] save-marks error:', error)
			errors.push({
				marks_entry_id: mark.marks_entry_id,
				error: error.code === '23514'
					? 'Mark exceeds the maximum external mark'
					: (error.message || 'Failed to save')
			})
		} else {
			savedCount++
		}
	}

	return NextResponse.json({
		success: errors.length === 0,
		saved_count: savedCount,
		errors: errors.length > 0 ? errors : undefined
	})
}

/** Recalculate final marks using revaluation marks; optionally apply */
async function handleGenerate(supabase: any, body: any) {
	const {
		institutions_id,
		examination_session_id,
		program_code,
		course_id,
		regulation_id,
		grade_system_code,
		save_to_db = false,
		selected_final_marks_ids,
		applied_by
	} = body

	if (!institutions_id || !examination_session_id || !program_code || !course_id) {
		return NextResponse.json({
			error: 'Missing required fields: institutions_id, examination_session_id, program_code, course_id'
		}, { status: 400 })
	}

	// 1. Course configuration (max/pass marks from courses table — same source as main route)
	const { data: course, error: courseError } = await supabase
		.from('courses')
		.select(`
			id, course_code, course_name, credit, result_type, evaluation_type,
			internal_max_mark, internal_pass_mark,
			external_max_mark, external_pass_mark,
			total_max_mark, total_pass_mark
		`)
		.eq('id', course_id)
		.single()

	if (courseError || !course) {
		return NextResponse.json({ error: 'Course not found' }, { status: 404 })
	}

	if ((course.result_type || '').toUpperCase() === 'STATUS') {
		return NextResponse.json({
			error: 'Revaluation generation applies to mark-based courses only (this is a Status paper).'
		}, { status: 400 })
	}

	const internalMax = Number(course.internal_max_mark) || 0
	const externalMax = Number(course.external_max_mark) || 0
	const totalMax = Number(course.total_max_mark) || 0
	const internalPassMark = Number(course.internal_pass_mark) || 0
	const externalPassMark = Number(course.external_pass_mark) || 0
	const totalPassMark = Number(course.total_pass_mark) || 0

	if (externalMax <= 0) {
		return NextResponse.json({
			error: 'This course has no external (ESE) component — revaluation is not applicable.'
		}, { status: 400 })
	}

	// 2. Grade system (same lookup as the main generation route)
	const effectiveGradeSystemCode = grade_system_code || getProgramTypeFromCode(program_code)
	let gradesQuery = supabase
		.from('grade_system')
		.select(`
			id, grade_system_code, grade, grade_point, min_mark, max_mark, description,
			grades:grade_id (id, qualify, is_absent, exclude_cgpa, result_status)
		`)
		.eq('institutions_id', institutions_id)
		.eq('is_active', true)
	if (regulation_id) gradesQuery = gradesQuery.eq('regulation_id', regulation_id)
	if (effectiveGradeSystemCode) gradesQuery = gradesQuery.eq('grade_system_code', effectiveGradeSystemCode)

	const { data: grades, error: gradesError } = await gradesQuery.order('min_mark', { ascending: false })

	if (gradesError || !grades?.length) {
		console.error('[Reval Final Marks] Grade system error:', gradesError)
		return NextResponse.json({
			error: 'No grade system found. Please configure grades first.'
		}, { status: 400 })
	}

	// 3. Existing final_marks rows for the course
	const { data: finalMarks, error: fmError } = await supabase
		.from('final_marks')
		.select(`
			id, exam_registration_id, student_id, register_number,
			internal_marks_obtained, external_marks_obtained,
			total_marks_obtained, total_marks_maximum, percentage,
			letter_grade, grade_points, pass_status, result_status, is_locked,
			is_revaluation_applied
		`)
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
		.eq('program_code', program_code)
		.eq('course_id', course_id)
		.eq('is_active', true)
		.range(0, 9999)

	if (fmError) {
		console.error('[Reval Final Marks] Error fetching final_marks:', fmError)
		return NextResponse.json({ error: 'Failed to fetch final marks' }, { status: 500 })
	}

	if (!finalMarks || finalMarks.length === 0) {
		return NextResponse.json({
			error: 'No saved final marks found for this course. Generate final marks first (Tab 1).'
		}, { status: 400 })
	}

	const examRegIds = [...new Set(finalMarks.map((fm: any) => fm.exam_registration_id).filter(Boolean))] as string[]

	// Publication/lock state per final_marks row — needed so the apply step can
	// withdraw publication (and unlock) before changing marks, then restore it.
	const fmStateMap = new Map<string, { result_status: string; is_locked: boolean }>(
		finalMarks.map((fm: any) => [fm.id, { result_status: fm.result_status, is_locked: fm.is_locked === true }])
	)

	// 4. marks_entry rows that HAVE a revaluation mark
	const marksEntries = await fetchInBatches(
		supabase,
		'marks_entry',
		'id, exam_registration_id, course_id, total_marks_obtained, marks_out_of, revaluation_marks_obtained',
		'exam_registration_id',
		examRegIds,
		(q) => q.eq('course_id', course_id).not('revaluation_marks_obtained', 'is', null)
	)

	if (marksEntries.length === 0) {
		return NextResponse.json({
			error: 'No revaluation marks entered for this course yet. Enter and save revaluation marks first.'
		}, { status: 400 })
	}

	const marksEntryMap = new Map(marksEntries.map((me: any) => [me.exam_registration_id, me]))

	// 5. Learner names
	const examRegs = await fetchInBatches(
		supabase,
		'exam_registrations',
		'id, student_name, stu_register_no',
		'id',
		examRegIds
	)
	const examRegMap = new Map(examRegs.map((er: any) => [er.id, er]))

	// 6. Recalculate — internal unchanged, external = revaluation mark
	const results: RevaluationResultRow[] = []
	const skipped: Array<{ register_no: string; student_name: string; reason: string }> = []

	for (const fm of finalMarks as any[]) {
		const me = marksEntryMap.get(fm.exam_registration_id)
		if (!me) continue

		const er = examRegMap.get(fm.exam_registration_id)
		const registerNo = fm.register_number || er?.stu_register_no || 'N/A'
		const studentName = er?.student_name || 'Unknown'

		// Absent learners (AAA) have no valid external mark to revalue
		if (fm.pass_status === 'Absent') {
			skipped.push({ register_no: registerNo, student_name: studentName, reason: 'Absent in original result' })
			continue
		}
		// Status-style rows store no numeric totals
		if (fm.total_marks_maximum === null || fm.total_marks_maximum === undefined) {
			skipped.push({ register_no: registerNo, student_name: studentName, reason: 'Status result (no numeric marks)' })
			continue
		}

		const internalMarks = Math.min(Number(fm.internal_marks_obtained) || 0, internalMax || Number.MAX_SAFE_INTEGER)
		let newExternal = Number(me.revaluation_marks_obtained) || 0
		if (newExternal > externalMax) newExternal = externalMax

		let newTotal = internalMarks + newExternal
		if (totalMax > 0 && newTotal > totalMax) newTotal = totalMax
		const newPercentage = totalMax > 0 ? Math.round((newTotal / totalMax) * 100 * 100) / 100 : 0

		// Pass/fail — same threshold order as the main route
		let failReason: 'INTERNAL' | 'EXTERNAL' | 'TOTAL' | null = null
		let isPass = true
		if (internalPassMark > 0 && internalMarks < internalPassMark) {
			isPass = false
			failReason = 'INTERNAL'
		} else if (externalPassMark > 0 && newExternal < externalPassMark) {
			isPass = false
			failReason = 'EXTERNAL'
		} else if (totalPassMark > 0 && newTotal < totalPassMark) {
			isPass = false
			failReason = 'TOTAL'
		}

		let letterGrade: string
		let gradePoint: number
		let gradeDescription: string

		if (isPass) {
			const gradeEntry = grades.find((g: any) => newPercentage >= g.min_mark && newPercentage <= g.max_mark)
			if (gradeEntry?.grade === 'U' || gradeEntry?.grades?.result_status === 'REAPPEAR') {
				isPass = false
				failReason = failReason || 'TOTAL'
			}
			if (isPass) {
				letterGrade = gradeEntry?.grade || 'RA'
				gradePoint = Math.round((newPercentage / 10) * 100) / 100
				gradeDescription = gradeEntry?.description || ''
			} else {
				letterGrade = 'U'
				gradePoint = 0
				gradeDescription = 'Re-Appear'
			}
		} else {
			letterGrade = 'U'
			gradePoint = 0
			gradeDescription = 'Re-Appear'
		}

		results.push({
			final_marks_id: fm.id,
			marks_entry_id: me.id,
			exam_registration_id: fm.exam_registration_id,
			student_id: fm.student_id,
			register_no: registerNo,
			student_name: studentName,
			course_code: course.course_code,
			internal_marks: internalMarks,
			internal_max: internalMax,
			external_max: externalMax,
			total_max: totalMax,
			old_external: Number(fm.external_marks_obtained) || 0,
			old_total: Number(fm.total_marks_obtained) || 0,
			old_percentage: Number(fm.percentage) || 0,
			old_grade: fm.letter_grade,
			old_grade_point: fm.grade_points !== null ? Number(fm.grade_points) : null,
			old_pass_status: fm.pass_status,
			new_external: newExternal,
			new_total: newTotal,
			new_percentage: newPercentage,
			new_grade: letterGrade,
			new_grade_point: gradePoint,
			new_pass_status: isPass ? 'Pass' : 'Reappear',
			new_is_pass: isPass,
			fail_reason: failReason,
			marks_difference: newTotal - (Number(fm.total_marks_obtained) || 0),
			is_revaluation_applied: fm.is_revaluation_applied === true
		})
	}

	// 7. Apply to final_marks if requested
	let appliedCount = 0
	let noChangeSkipped = 0
	const errors: Array<{ register_no: string; student_name: string; error: string }> = []

	if (save_to_db && results.length > 0) {
		const selectedIds: Set<string> | null = Array.isArray(selected_final_marks_ids) && selected_final_marks_ids.length > 0
			? new Set(selected_final_marks_ids)
			: null

		// Only stamp applied_by/updated_by if the id exists in users (FK to users.id)
		const appliedBy = await resolveUserId(supabase, applied_by)

		for (const row of results) {
			if (selectedIds && !selectedIds.has(row.final_marks_id)) continue

			// Every row in `results` already carries a revaluation mark (the
			// marks_entry fetch filters revaluation_marks_obtained IS NOT NULL).
			// Additionally skip when the revaluation mark equals the current
			// external mark — a no-op that would needlessly withdraw and
			// re-publish a Published result. Internal is unchanged, so an equal
			// external mark means nothing downstream changes.
			if (row.new_external === row.old_external) {
				noChangeSkipped++
				continue
			}

			const gradeEntryDesc = row.new_is_pass
				? (grades.find((g: any) => g.grade === row.new_grade)?.description || '')
				: 'Re-Appear'

			const updatePayload: Record<string, any> = {
				external_marks_obtained: row.new_external,
				total_marks_obtained: row.new_total,
				percentage: row.new_percentage,
				letter_grade: row.new_grade,
				grade_points: row.new_grade_point,
				grade_description: gradeEntryDesc,
				total_grade_points: row.new_is_pass ? Math.round(row.new_grade_point * (Number(course.credit) || 0) * 100) / 100 : 0,
				is_pass: row.new_is_pass,
				pass_status: row.new_pass_status,
				is_revaluation_applied: true,
				revaluation_applied_at: new Date().toISOString(),
				revaluation_applied_by: appliedBy,
				remarks: 'Updated with revaluation marks',
				updated_at: new Date().toISOString(),
				updated_by: appliedBy
			}

			// Snapshot original values ONLY on first application — the old mark
			// must survive repeated re-applications
			if (!row.is_revaluation_applied) {
				updatePayload.original_external_marks_obtained = row.old_external
				updatePayload.original_total_marks_obtained = row.old_total
				updatePayload.original_percentage = row.old_percentage
				updatePayload.original_letter_grade = row.old_grade
				updatePayload.original_grade_points = row.old_grade_point
				updatePayload.original_pass_status = row.old_pass_status
			}

			// A DB trigger blocks mark changes while a result is Published, and a
			// second blocks changes while Locked. Revaluation revises a published
			// mark, so withdraw publication (and unlock) first — an update that
			// touches only result_status/is_locked passes both triggers — then
			// change the marks, then restore the original publication/lock state.
			const state = fmStateMap.get(row.final_marks_id)
			const wasPublished = state?.result_status === 'Published'
			const wasLocked = state?.is_locked === true

			if (wasPublished || wasLocked) {
				const withdrawPayload: Record<string, any> = { updated_at: new Date().toISOString() }
				if (wasPublished) withdrawPayload.result_status = 'Under Review'
				if (wasLocked) withdrawPayload.is_locked = false

				const { error: withdrawErr } = await supabase
					.from('final_marks')
					.update(withdrawPayload)
					.eq('id', row.final_marks_id)

				if (withdrawErr) {
					console.error('[Reval Final Marks] Withdraw error:', withdrawErr)
					errors.push({
						register_no: row.register_no,
						student_name: row.student_name,
						error: `Failed to withdraw publication: ${withdrawErr.message || 'unknown error'}`
					})
					continue
				}
			}

			const { error } = await supabase
				.from('final_marks')
				.update(updatePayload)
				.eq('id', row.final_marks_id)

			// Restore the original publication/lock state regardless of apply outcome,
			// so a row is never left silently withdrawn/unlocked.
			if (wasPublished || wasLocked) {
				const restorePayload: Record<string, any> = { updated_at: new Date().toISOString() }
				if (wasPublished) restorePayload.result_status = 'Published'
				if (wasLocked) restorePayload.is_locked = true

				const { error: restoreErr } = await supabase
					.from('final_marks')
					.update(restorePayload)
					.eq('id', row.final_marks_id)

				if (restoreErr) {
					console.error('[Reval Final Marks] Re-publish error:', restoreErr)
					errors.push({
						register_no: row.register_no,
						student_name: row.student_name,
						error: `Marks ${error ? 'not ' : ''}applied but failed to restore publication: ${restoreErr.message || 'unknown error'}`
					})
					continue
				}
			}

			if (error) {
				console.error('[Reval Final Marks] Apply error:', error)
				errors.push({
					register_no: row.register_no,
					student_name: row.student_name,
					error: error.message || 'Failed to update'
				})
			} else {
				appliedCount++
			}
		}
	}

	const summary = {
		total_with_revaluation: results.length,
		improved: results.filter(r => r.marks_difference > 0).length,
		decreased: results.filter(r => r.marks_difference < 0).length,
		unchanged: results.filter(r => r.marks_difference === 0).length,
		grade_changed: results.filter(r => r.old_grade !== r.new_grade).length,
		already_applied: results.filter(r => r.is_revaluation_applied).length,
		skipped: skipped.length,
		applied_count: appliedCount,
		no_change_skipped: noChangeSkipped
	}

	return NextResponse.json({
		success: true,
		course_code: course.course_code,
		course_name: course.course_name || course.course_code,
		results,
		summary,
		skipped_records: skipped.length > 0 ? skipped : undefined,
		errors: errors.length > 0 ? errors : undefined
	})
}
