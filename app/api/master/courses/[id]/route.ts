import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServer()
    const { id } = await params
    const { data, error } = await supabase
      .from('courses')
      .select(`
        id,
        institutions_id,
        regulation_id,
        offering_department_id,
        institution_code,
        regulation_code,
        offering_department_code,
        board_code,
        course_code,
        course_name,
        display_code,
        course_category,
        course_type,
        course_part_master,
        credit,
        split_credit,
        theory_credit,
        practical_credit,
        qp_code,
        e_code_name,
        exam_duration,
        evaluation_type,
        result_type,
        self_study_course,
        outside_class_course,
        open_book,
        online_course,
        dummy_number_not_required,
        annual_course,
        multiple_qp_set,
        no_of_qp_setter,
        no_of_scrutinizer,
        fee_exception,
        syllabus_pdf_url,
        description,
        status,
        created_at,
        updated_at,
        class_hours,
        theory_hours,
        practical_hours,
        internal_max_mark,
        internal_pass_mark,
        internal_converted_mark,
        external_max_mark,
        external_pass_mark,
        external_converted_mark,
        total_pass_mark,
        total_max_mark,
        annual_semester,
        registration_based,
        credit_included,
        has_hall_ticket
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    const mapped = data ? {
      id: data.id,
      institutions_id: data.institutions_id,
      regulation_id: data.regulation_id,
      offering_department_id: data.offering_department_id,
      institution_code: data.institution_code,
      regulation_code: data.regulation_code,
      offering_department_code: data.offering_department_code,
      board_code: data.board_code,
      course_code: data.course_code,
      course_title: data.course_name,
      display_code: data.display_code,
      course_category: data.course_category,
      course_type: data.course_type,
      course_part_master: data.course_part_master,
      credits: data.credit,
      split_credit: data.split_credit,
      theory_credit: data.theory_credit,
      practical_credit: data.practical_credit,
      qp_code: data.qp_code,
      e_code_name: data.e_code_name,
      exam_duration: data.exam_duration,
      evaluation_type: data.evaluation_type,
      result_type: data.result_type,
      self_study_course: data.self_study_course,
      outside_class_course: data.outside_class_course,
      open_book: data.open_book,
      online_course: data.online_course,
      dummy_number_required: !data.dummy_number_not_required,
      annual_course: data.annual_course,
      multiple_qp_set: data.multiple_qp_set,
      no_of_qp_setter: data.no_of_qp_setter,
      no_of_scrutinizer: data.no_of_scrutinizer,
      fee_exception: data.fee_exception,
      syllabus_pdf_url: data.syllabus_pdf_url,
      description: data.description,
      is_active: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at,
      // Required fields for marks and hours
      class_hours: data.class_hours ?? 0,
      theory_hours: data.theory_hours ?? 0,
      practical_hours: data.practical_hours ?? 0,
      internal_max_mark: data.internal_max_mark ?? 0,
      internal_pass_mark: data.internal_pass_mark ?? 0,
      internal_converted_mark: data.internal_converted_mark ?? 0,
      external_max_mark: data.external_max_mark ?? 0,
      external_pass_mark: data.external_pass_mark ?? 0,
      external_converted_mark: data.external_converted_mark ?? 0,
      total_pass_mark: data.total_pass_mark ?? 0,
      total_max_mark: data.total_max_mark ?? 0,
      annual_semester: data.annual_semester ?? false,
      registration_based: data.registration_based ?? false,
      credit_included: data.credit_included ?? true,
      has_hall_ticket: data.has_hall_ticket ?? true,
    } : null
    return NextResponse.json(mapped)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch course' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServer()
    const { id } = await params
    const body = await req.json()
    const input = body as Record<string, unknown>

    const data: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    // Resolve foreign keys if codes are provided
    if (input.institution_code !== undefined) {
      const { data: institutionData, error: institutionError } = await supabase
        .from('institutions')
        .select('id')
        .eq('institution_code', String(input.institution_code))
        .single()

      if (institutionError || !institutionData) {
        return NextResponse.json({
          error: `Institution with code "${input.institution_code}" not found.`
        }, { status: 400 })
      }

      data.institutions_id = institutionData.id
      data.institution_code = String(input.institution_code)
    }

    if (input.regulation_code !== undefined) {
      // Try to fetch regulation_id from regulation_code (optional - regulations may come from MyJKKN)
      const { data: regulationData } = await supabase
        .from('regulations')
        .select('id')
        .eq('regulation_code', String(input.regulation_code))
        .single()

      // regulation_id is optional since regulations may be sourced from MyJKKN API
      data.regulation_id = regulationData?.id || null
      data.regulation_code = String(input.regulation_code)
    }

    if (input.offering_department_code !== undefined && input.offering_department_code) {
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('id')
        .eq('department_code', String(input.offering_department_code))
        .single()

      if (deptError || !deptData) {
        return NextResponse.json({
          error: `Department with code "${input.offering_department_code}" not found.`
        }, { status: 400 })
      }

      data.offering_department_id = deptData.id
      data.offering_department_code = String(input.offering_department_code)
    }

    // Resolve board_id from board_code
    if (input.board_code !== undefined) {
      if (input.board_code) {
        const { data: boardData } = await supabase
          .from('board')
          .select('id')
          .eq('board_code', String(input.board_code))
          .single()

        if (boardData) {
          data.board_id = boardData.id
        }
        data.board_code = String(input.board_code)
      } else {
        data.board_id = null
        data.board_code = null
      }
    }

    // Add all other fields
    if (input.course_code !== undefined) data.course_code = String(input.course_code)
    if (input.course_title !== undefined) data.course_name = String(input.course_title)
    if (input.display_code !== undefined) data.display_code = input.display_code ? String(input.display_code) : null
    if (input.course_category !== undefined && input.course_category) data.course_category = String(input.course_category)
    if (input.course_type !== undefined) data.course_type = input.course_type ? String(input.course_type) : null
    if (input.course_part_master !== undefined && input.course_part_master) data.course_part_master = String(input.course_part_master)
    if (input.credits !== undefined) data.credit = Number(input.credits)
    if (input.split_credit !== undefined) data.split_credit = Boolean(input.split_credit)
    if (input.theory_credit !== undefined) data.theory_credit = Number(input.theory_credit)
    if (input.practical_credit !== undefined) data.practical_credit = Number(input.practical_credit)
    if (input.qp_code !== undefined) data.qp_code = String(input.qp_code)
    if (input.e_code_name !== undefined && input.e_code_name) data.e_code_name = String(input.e_code_name)
    if (input.exam_duration !== undefined) data.exam_duration = Number(input.exam_duration)
    if (input.evaluation_type !== undefined) data.evaluation_type = String(input.evaluation_type)
    if (input.result_type !== undefined) data.result_type = String(input.result_type)
    if (input.self_study_course !== undefined) data.self_study_course = Boolean(input.self_study_course)
    if (input.outside_class_course !== undefined) data.outside_class_course = Boolean(input.outside_class_course)
    if (input.open_book !== undefined) data.open_book = Boolean(input.open_book)
    if (input.online_course !== undefined) data.online_course = Boolean(input.online_course)
    if (input.dummy_number_required !== undefined) data.dummy_number_not_required = !Boolean(input.dummy_number_required)
    if (input.annual_course !== undefined) data.annual_course = Boolean(input.annual_course)
    if (input.multiple_qp_set !== undefined) data.multiple_qp_set = Boolean(input.multiple_qp_set)
    if (input.no_of_qp_setter !== undefined) data.no_of_qp_setter = Number(input.no_of_qp_setter)
    if (input.no_of_scrutinizer !== undefined) data.no_of_scrutinizer = Number(input.no_of_scrutinizer)
    if (input.fee_exception !== undefined) data.fee_exception = Boolean(input.fee_exception)
    if (input.syllabus_pdf_url !== undefined) data.syllabus_pdf_url = String(input.syllabus_pdf_url)
    if (input.description !== undefined) data.description = String(input.description)
    if (input.is_active !== undefined) data.status = Boolean(input.is_active)
    // Required fields for marks and hours
    if (input.class_hours !== undefined) data.class_hours = Number(input.class_hours)
    if (input.theory_hours !== undefined) data.theory_hours = Number(input.theory_hours)
    if (input.practical_hours !== undefined) data.practical_hours = Number(input.practical_hours)
    if (input.internal_max_mark !== undefined) data.internal_max_mark = Number(input.internal_max_mark)
    if (input.internal_pass_mark !== undefined) data.internal_pass_mark = Number(input.internal_pass_mark)
    if (input.internal_converted_mark !== undefined) data.internal_converted_mark = Number(input.internal_converted_mark)
    if (input.external_max_mark !== undefined) data.external_max_mark = Number(input.external_max_mark)
    if (input.external_pass_mark !== undefined) data.external_pass_mark = Number(input.external_pass_mark)
    if (input.external_converted_mark !== undefined) data.external_converted_mark = Number(input.external_converted_mark)
    if (input.total_pass_mark !== undefined) data.total_pass_mark = Number(input.total_pass_mark)
    if (input.total_max_mark !== undefined) data.total_max_mark = Number(input.total_max_mark)
    if (input.annual_semester !== undefined) data.annual_semester = Boolean(input.annual_semester)
    if (input.registration_based !== undefined) data.registration_based = Boolean(input.registration_based)
    if (input.credit_included !== undefined) data.credit_included = Boolean(input.credit_included)
    if (input.has_hall_ticket !== undefined) data.has_hall_ticket = Boolean(input.has_hall_ticket)

    const { data: updated, error } = await supabase
      .from('courses')
      .update(data)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('Supabase update error:', error)

      // Handle foreign key constraint violation
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'Foreign key constraint failed. Ensure institution, regulation, and department exist.'
        }, { status: 400 })
      }

      // Handle check constraint violation
      if (error.code === '23514') {
        return NextResponse.json({
          error: 'Invalid value. Please check your input values and ensure they match the allowed options.'
        }, { status: 400 })
      }

      throw error
    }

    // Map database fields to frontend expected fields
    const mapped = {
      id: updated.id,
      institutions_id: updated.institutions_id,
      regulation_id: updated.regulation_id,
      offering_department_id: updated.offering_department_id,
      institution_code: updated.institution_code,
      regulation_code: updated.regulation_code,
      offering_department_code: updated.offering_department_code,
      board_code: updated.board_code,
      course_code: updated.course_code,
      course_title: updated.course_name,
      display_code: updated.display_code,
      course_category: updated.course_category,
      course_type: updated.course_type,
      course_part_master: updated.course_part_master,
      credits: updated.credit ?? 0,
      split_credit: updated.split_credit,
      theory_credit: updated.theory_credit,
      practical_credit: updated.practical_credit,
      qp_code: updated.qp_code,
      e_code_name: updated.e_code_name,
      exam_duration: updated.exam_duration,
      evaluation_type: updated.evaluation_type,
      result_type: updated.result_type,
      self_study_course: updated.self_study_course,
      outside_class_course: updated.outside_class_course,
      open_book: updated.open_book,
      online_course: updated.online_course,
      dummy_number_required: !updated.dummy_number_not_required,
      annual_course: updated.annual_course,
      multiple_qp_set: updated.multiple_qp_set,
      no_of_qp_setter: updated.no_of_qp_setter,
      no_of_scrutinizer: updated.no_of_scrutinizer,
      fee_exception: updated.fee_exception,
      syllabus_pdf_url: updated.syllabus_pdf_url,
      description: updated.description,
      is_active: updated.status ?? true,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
      class_hours: updated.class_hours ?? 0,
      theory_hours: updated.theory_hours ?? 0,
      practical_hours: updated.practical_hours ?? 0,
      internal_max_mark: updated.internal_max_mark ?? 0,
      internal_pass_mark: updated.internal_pass_mark ?? 0,
      internal_converted_mark: updated.internal_converted_mark ?? 0,
      external_max_mark: updated.external_max_mark ?? 0,
      external_pass_mark: updated.external_pass_mark ?? 0,
      external_converted_mark: updated.external_converted_mark ?? 0,
      total_pass_mark: updated.total_pass_mark ?? 0,
      total_max_mark: updated.total_max_mark ?? 0,
      annual_semester: updated.annual_semester ?? false,
      registration_based: updated.registration_based ?? false,
      credit_included: updated.credit_included ?? true,
      has_hall_ticket: updated.has_hall_ticket ?? true,
    }

    return NextResponse.json(mapped)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to update course', details: message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServer()
    const { id } = await params
    const { error } = await supabase.from('courses').delete().eq('id', id)
    if (error) {
      if (error.code === '23503') {
        return NextResponse.json({ error: 'Cannot delete - this course has related records (e.g. course offerings, registrations)' }, { status: 400 })
      }
      console.error('Delete course error:', error)
      return NextResponse.json({ error: error.message || 'Failed to delete course' }, { status: 500 })
    }
    return NextResponse.json({ message: 'Course deleted successfully' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to delete course', details: message }, { status: 500 })
  }
}
