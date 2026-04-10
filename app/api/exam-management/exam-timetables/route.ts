import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { handleDeleteWithDependencyCheck } from '@/lib/delete-helpers'




// GET - Fetch exam timetables with optional filters
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServer()
    const { searchParams } = new URL(request.url)
    const examination_session_id = searchParams.get('examination_session_id')
    const program_id = searchParams.get('program_id')
    const semester_id = searchParams.get('semester_id')
    const is_published = searchParams.get('is_published')

    // Fetch exam timetables with direct joins
    // exam_timetables has course_id directly referencing courses table
    let query = supabase
      .from('exam_timetables')
      .select(`
        *,
        institutions(id, institution_code, name),
        examination_sessions(id, session_code, session_name),
        courses(id, course_code, course_name)
      `)
      .order('exam_date', { ascending: true })
      .order('created_at', { ascending: false })
      .range(0, 9999)

    // Apply filters
    if (examination_session_id) {
      query = query.eq('examination_session_id', examination_session_id)
    }

    if (program_id) {
      query = query.eq('program_id', program_id)
    }

    if (semester_id) {
      query = query.eq('semester', parseInt(semester_id))
    }

    if (is_published !== null && is_published !== undefined) {
      query = query.eq('is_published', is_published === 'true')
    }

    const { data: timetables, error } = await query

    if (error) {
      console.error('Exam timetables fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch exam timetables', details: error.message }, { status: 500 })
    }

    // Bulk fetch student counts and seat allocations (2 queries instead of 820+)
    const timetableIds = (timetables || []).map((t: any) => t.id)

    // Bulk query 1: Registration counts via DB-level aggregation (avoids row limit issues)
    // Uses RPC function that does COUNT + GROUP BY in Postgres, returning ~382 rows
    // instead of fetching 11,000+ individual registration rows
    const courseCodes = [...new Set((timetables || []).map((t: any) => t.courses?.course_code).filter(Boolean))]
    const institutionIds = [...new Set((timetables || []).map((t: any) => t.institutions_id).filter(Boolean))]
    let regCountMap = new Map<string, number>()
    if (courseCodes.length > 0 && examination_session_id) {
      const { data: regCounts, error: regError } = await supabase.rpc('get_registration_counts_by_course', {
        p_examination_session_id: examination_session_id,
        p_course_codes: courseCodes,
        p_institution_ids: institutionIds,
      })

      if (regError) {
        console.error('Error fetching registration counts:', regError)
      }

      if (regCounts) {
        for (const reg of regCounts) {
          const key = `${reg.course_code}|${examination_session_id}|${reg.institutions_id}`
          regCountMap.set(key, Number(reg.cnt))
        }
      }
    }

    // Bulk query 2: Seat allocations per timetable_id
    let seatAllocMap = new Map<string, number>()
    if (timetableIds.length > 0) {
      const { data: allocations } = await supabase
        .from('room_allocations')
        .select('exam_timetable_id, seats_allocated')
        .in('exam_timetable_id', timetableIds)

      if (allocations) {
        for (const alloc of allocations) {
          seatAllocMap.set(alloc.exam_timetable_id, (seatAllocMap.get(alloc.exam_timetable_id) || 0) + (alloc.seats_allocated || 0))
        }
      }
    }

    // Flatten data using lookup maps — no per-row queries
    const enrichedData = (timetables || []).map((timetable: any) => ({
      ...timetable,
      student_count: regCountMap.get(`${timetable.courses?.course_code}|${timetable.examination_session_id}|${timetable.institutions_id}`) || 0,
      seat_alloc_count: seatAllocMap.get(timetable.id) || 0,
      institution_code: timetable.institutions?.institution_code || 'N/A',
      institution_name: timetable.institutions?.name || 'N/A',
      session_code: timetable.examination_sessions?.session_code || 'N/A',
      session_name: timetable.examination_sessions?.session_name || 'N/A',
      course_code: timetable.courses?.course_code || 'N/A',
      course_name: timetable.courses?.course_name || 'N/A',
    }))

    return NextResponse.json(enrichedData)
  } catch (e) {
    console.error('Exam timetables API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new exam timetable entry
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()

    // Validate required fields
    if (!body.institutions_id) {
      return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
    }
    if (!body.examination_session_id) {
      return NextResponse.json({ error: 'Examination Session ID is required' }, { status: 400 })
    }
    // Accept course_id (UUID) or course_code (string) for lookup
    if (!body.course_id && !body.course_code) {
      return NextResponse.json({ error: 'Course ID or Course Code is required' }, { status: 400 })
    }
    if (!body.exam_date) {
      return NextResponse.json({ error: 'Exam Date is required' }, { status: 400 })
    }
    if (!body.session) {
      return NextResponse.json({ error: 'Session (FN/AN) is required' }, { status: 400 })
    }

    let courseId = body.course_id
    let courseCode = body.course_code
    let courseOfferingId = body.course_offering_id
    let durationMinutes = body.duration_minutes || null

    // Get institution_code and session_code for lookups
    const { data: inst } = await supabase
      .from('institutions')
      .select('institution_code')
      .eq('id', body.institutions_id)
      .single()

    const { data: sess } = await supabase
      .from('examination_sessions')
      .select('session_code')
      .eq('id', body.examination_session_id)
      .single()

    if (!inst?.institution_code) {
      return NextResponse.json({ error: 'Institution not found' }, { status: 400 })
    }
    if (!sess?.session_code) {
      return NextResponse.json({ error: 'Examination session not found' }, { status: 400 })
    }

    const institutionCode = inst.institution_code
    const sessionCode = sess.session_code

    // Step 1: Get course_id from courses table
    // SQL: SELECT id FROM courses WHERE institutions_id = ? AND course_code = ? LIMIT 1
    if (!courseId && courseCode) {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('id, course_code, exam_duration')
        .eq('institutions_id', body.institutions_id)
        .eq('course_code', courseCode)
        .limit(1)
        .maybeSingle()

      if (courseError || !course) {
        return NextResponse.json({ error: `Course with code "${courseCode}" not found for institution "${institutionCode}"` }, { status: 400 })
      }
      courseId = course.id
      courseCode = course.course_code

      // Auto-populate duration_minutes from course's exam_duration (hours) if not provided
      if (!durationMinutes && course.exam_duration) {
        durationMinutes = Math.round(course.exam_duration * 60)
      }
    } else if (courseId && !courseCode) {
      // Get course_code from course_id
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('course_code, exam_duration')
        .eq('id', courseId)
        .single()

      if (!courseError && course) {
        courseCode = course.course_code
        if (!durationMinutes && course.exam_duration) {
          durationMinutes = Math.round(course.exam_duration * 60)
        }
      }
    }

    // Step 2: Get course_offering_id from course_offerings table
    // SQL: SELECT id FROM course_offerings WHERE institutions_id = ? AND examination_session_id = ? AND course_code = ? LIMIT 1
    if (!courseOfferingId && courseCode) {
      const { data: courseOffering, error: coError } = await supabase
        .from('course_offerings')
        .select('id')
        .eq('institutions_id', body.institutions_id)
        .eq('examination_session_id', body.examination_session_id)
        .eq('course_code', courseCode)
        .limit(1)
        .maybeSingle()

      if (coError) {
        console.warn(`Error fetching course offering:`, coError)
      } else if (!courseOffering) {
        console.warn(`Course offering not found for institution: ${institutionCode}, session: ${sessionCode}, course: ${courseCode}`)
      } else {
        courseOfferingId = courseOffering.id
      }
    }

    // If course_offering_id is still null, return error
    if (!courseOfferingId) {
      return NextResponse.json({
        error: `Course offering not found for institution "${institutionCode}", session "${sessionCode}", course "${courseCode}". Please ensure the course offering exists.`
      }, { status: 400 })
    }

    const insertPayload: any = {
      institutions_id: body.institutions_id,
      examination_session_id: body.examination_session_id,
      course_id: courseId,
      course_offering_id: courseOfferingId,
      exam_date: body.exam_date,
      exam_time: body.exam_time || null,
      session: body.session,
      duration_minutes: durationMinutes,
      exam_mode: body.exam_mode || 'Offline',
      is_published: body.is_published ?? false,
      instructions: body.instructions || null,
      created_by: body.created_by || null,
      exam_type: body.exam_type || 'Theory',
      batch_capacity: body.exam_type === 'Practical' ? (body.batch_capacity || null) : null,
    }

    const { data, error } = await supabase
      .from('exam_timetables')
      .insert([insertPayload])
      .select('*')
      .single()

    if (error) {
      console.error('Error creating exam timetable:', error)

      // Handle duplicate key constraint violation
      if (error.code === '23505') {
        return NextResponse.json({
          error: 'Exam timetable entry already exists for this course, date, and session.'
        }, { status: 400 })
      }

      // Handle foreign key constraint violation
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'Invalid reference. Please ensure course, session, and institution exist.'
        }, { status: 400 })
      }

      // Handle not-null constraint violation for course_offering_id
      if (error.code === '23502' && error.message.includes('course_offering_id')) {
        return NextResponse.json({
          error: `Course offering not found for this institution, exam session, and course code combination. Please ensure the course offering exists.`
        }, { status: 400 })
      }

      return NextResponse.json({ error: 'Failed to create exam timetable' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    console.error('Exam timetable creation error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update existing exam timetable entry
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()

    if (!body.id) {
      return NextResponse.json({ error: 'Exam timetable ID is required' }, { status: 400 })
    }

    let courseId = body.course_id
    let courseCode = body.course_code
    let courseOfferingId = body.course_offering_id
    let durationMinutes = body.duration_minutes || null

    // Get existing timetable to get institutions_id and examination_session_id if not provided
    const { data: existingTimetable, error: fetchError } = await supabase
      .from('exam_timetables')
      .select('institutions_id, examination_session_id')
      .eq('id', body.id)
      .single()

    if (fetchError || !existingTimetable) {
      return NextResponse.json({ error: 'Exam timetable not found' }, { status: 404 })
    }

    const institutionsId = body.institutions_id || existingTimetable.institutions_id
    const examinationSessionId = body.examination_session_id || existingTimetable.examination_session_id

    // Get institution_code and session_code for lookups
    const { data: inst } = await supabase
      .from('institutions')
      .select('institution_code')
      .eq('id', institutionsId)
      .single()

    const { data: sess } = await supabase
      .from('examination_sessions')
      .select('session_code')
      .eq('id', examinationSessionId)
      .single()

    if (!inst?.institution_code) {
      return NextResponse.json({ error: 'Institution not found' }, { status: 400 })
    }
    if (!sess?.session_code) {
      return NextResponse.json({ error: 'Examination session not found' }, { status: 400 })
    }

    const institutionCode = inst.institution_code
    const sessionCode = sess.session_code

    // Step 1: Get course_id from courses table
    // SQL: SELECT id FROM courses WHERE institutions_id = ? AND course_code = ? LIMIT 1
    if (!courseId && courseCode) {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('id, course_code, exam_duration')
        .eq('institutions_id', institutionsId)
        .eq('course_code', courseCode)
        .limit(1)
        .maybeSingle()

      if (courseError || !course) {
        return NextResponse.json({ error: `Course with code "${courseCode}" not found for institution "${institutionCode}"` }, { status: 400 })
      }
      courseId = course.id
      courseCode = course.course_code

      // Auto-populate duration_minutes from course's exam_duration (hours) if not provided
      if (!durationMinutes && course.exam_duration) {
        durationMinutes = Math.round(course.exam_duration * 60)
      }
    } else if (courseId && !courseCode) {
      // Get course_code from course_id
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('course_code, exam_duration')
        .eq('id', courseId)
        .single()

      if (!courseError && course) {
        courseCode = course.course_code
        if (!durationMinutes && course.exam_duration) {
          durationMinutes = Math.round(course.exam_duration * 60)
        }
      }
    }

    // Step 2: Get course_offering_id from course_offerings table
    // SQL: SELECT id FROM course_offerings WHERE institutions_id = ? AND examination_session_id = ? AND course_code = ? LIMIT 1
    if (!courseOfferingId && courseCode) {
      const { data: courseOffering, error: coError } = await supabase
        .from('course_offerings')
        .select('id')
        .eq('institutions_id', institutionsId)
        .eq('examination_session_id', examinationSessionId)
        .eq('course_code', courseCode)
        .limit(1)
        .maybeSingle()

      if (coError) {
        console.warn(`Error fetching course offering:`, coError)
      } else if (!courseOffering) {
        console.warn(`Course offering not found for institution: ${institutionCode}, session: ${sessionCode}, course: ${courseCode}`)
      } else {
        courseOfferingId = courseOffering.id
      }
    }

    // If course_offering_id is still null, return error
    if (!courseOfferingId) {
      return NextResponse.json({
        error: `Course offering not found for institution "${institutionCode}", session "${sessionCode}", course "${courseCode}". Please ensure the course offering exists.`
      }, { status: 400 })
    }

    const updatePayload: any = {
      examination_session_id: examinationSessionId,
      course_id: courseId,
      course_offering_id: courseOfferingId,
      exam_date: body.exam_date,
      exam_time: body.exam_time || null,
      session: body.session,
      duration_minutes: durationMinutes,
      exam_mode: body.exam_mode || 'Offline',
      is_published: body.is_published ?? false,
      instructions: body.instructions || null,
      updated_at: new Date().toISOString(),
      exam_type: body.exam_type || 'Theory',
      batch_capacity: body.exam_type === 'Practical' ? (body.batch_capacity || null) : null,
    }

    const { data, error } = await supabase
      .from('exam_timetables')
      .update(updatePayload)
      .eq('id', body.id)
      .select('*')
      .single()

    if (error) {
      console.error('Error updating exam timetable:', error)

      // Handle duplicate key constraint violation
      if (error.code === '23505') {
        return NextResponse.json({
          error: 'Exam timetable entry already exists for this course, date, and session.'
        }, { status: 400 })
      }

      // Handle foreign key constraint violation
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'Invalid reference. Please ensure course and session exist.'
        }, { status: 400 })
      }

      // Handle not-null constraint violation for course_offering_id
      if (error.code === '23502' && error.message.includes('course_offering_id')) {
        return NextResponse.json({
          error: `Course offering not found for this institution, exam session, and course code combination. Please ensure the course offering exists.`
        }, { status: 400 })
      }

      return NextResponse.json({ error: 'Failed to update exam timetable' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('Exam timetable update error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete exam timetable entry
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Exam timetable ID is required' }, { status: 400 })
    }

    return handleDeleteWithDependencyCheck('exam_timetables', id, request)
  } catch (e) {
    console.error('Delete error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
