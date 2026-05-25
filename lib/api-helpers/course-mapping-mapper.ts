export function mapCourseMappingToResponse(dbMapping: any, format: 'mapped' | 'raw' = 'mapped') {
  if (!dbMapping) return null

  const base = {
    id: dbMapping.id,
    course_id: dbMapping.course_id,
    course_code: dbMapping.course_code,
    institution_code: dbMapping.institution_code,
    institutions_id: dbMapping.institutions_id,
    program_code: dbMapping.program_code,
    program_id: dbMapping.program_id,
    regulation_code: dbMapping.regulation_code,
    regulation_id: dbMapping.regulation_id,
    semester_code: dbMapping.semester_code,
    semester_id: dbMapping.semester_id,
    course_order: dbMapping.course_order,
    course_group: dbMapping.course_group,
    internal_max_mark: dbMapping.internal_max_mark ?? null,
    internal_pass_mark: dbMapping.internal_pass_mark ?? null,
    external_max_mark: dbMapping.external_max_mark ?? null,
    external_pass_mark: dbMapping.external_pass_mark ?? null,
    total_max_mark: dbMapping.total_max_mark ?? null,
    total_pass_mark: dbMapping.total_pass_mark ?? null,
    created_at: dbMapping.created_at,
    updated_at: dbMapping.updated_at,
  }

  if (format === 'raw') {
    return {
      ...base,
      is_active: dbMapping.is_active,
    }
  }

  return {
    ...base,
    is_active: dbMapping.is_active,
    courses: dbMapping.courses || null,
  }
}
