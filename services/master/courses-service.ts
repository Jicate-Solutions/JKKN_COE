import type { Course, CourseFormData } from '@/types/courses'

/**
 * Fetch courses with optional institution filtering
 * @param institutionFilter - Optional filter params from useInstitutionFilter hook
 * @param requireFilter - If true and filter is empty, return empty array (for non-super admin with no institution)
 * @returns Promise<Course[]>
 */
export async function fetchCourses(
	institutionFilter?: { institution_code?: string; institutions_id?: string },
	requireFilter: boolean = false
): Promise<Course[]> {
	// If filter is required but no valid institution_code provided, return empty array
	// This handles non-super admin users with no assigned institution
	if (requireFilter && !institutionFilter?.institution_code) {
		return []
	}

	const params = new URLSearchParams()
	if (institutionFilter?.institution_code) {
		params.set('institution_code', institutionFilter.institution_code)
	}
	if (institutionFilter?.institutions_id) {
		params.set('institutions_id', institutionFilter.institutions_id)
	}
	const queryString = params.toString()
	const url = queryString ? `/api/master/courses?${queryString}` : '/api/master/courses'
	const response = await fetch(url)
	if (!response.ok) {
		let errorData: any = {}
		try {
			errorData = await response.json()
		} catch {
			const text = await response.text().catch(() => '')
			errorData = text ? { error: text } : { error: 'Unknown error' }
		}

		// Check if courses table doesn't exist
		if (errorData.error === 'Courses table not found') {
			console.error('Database Setup Required:', errorData.message)
			console.log('Setup Instructions:', errorData.instructions)
			throw new Error(errorData.message || 'Courses table not found')
		}

		throw new Error('Failed to fetch courses')
	}
	return response.json()
}

export async function createCourse(data: Partial<CourseFormData>): Promise<Course> {
	const payload = {
		institution_code: data.institution_code,
		regulation_code: data.regulation_code,
		offering_department_code: data.offering_department_code || null,
		board_code: data.board_code || null,
		course_code: data.course_code,
		course_title: data.course_title,
		display_code: data.display_code || null,
		course_category: data.course_category || null,
		course_type: data.course_type || null,
		course_part_master: data.course_part_master || null,
		credits: data.credits ? Math.trunc(Number(data.credits)) : 0,
		split_credit: Boolean(data.split_credit),
		theory_credit: data.theory_credit ? Math.trunc(Number(data.theory_credit)) : 0,
		practical_credit: data.practical_credit ? Math.trunc(Number(data.practical_credit)) : 0,
		qp_code: data.qp_code || null,
		e_code_name: data.e_code_name || null,
		exam_duration: data.exam_duration ? Math.trunc(Number(data.exam_duration)) : 0,
		evaluation_type: data.evaluation_type,
		result_type: data.result_type,
		self_study_course: Boolean(data.self_study_course),
		outside_class_course: Boolean(data.outside_class_course),
		open_book: Boolean(data.open_book),
		online_course: Boolean(data.online_course),
		dummy_number_required: Boolean(data.dummy_number_required),
		annual_course: Boolean(data.annual_course),
		multiple_qp_set: Boolean(data.multiple_qp_set),
		no_of_qp_setter: data.no_of_qp_setter ? Number(data.no_of_qp_setter) : null,
		no_of_scrutinizer: data.no_of_scrutinizer ? Number(data.no_of_scrutinizer) : null,
		fee_exception: Boolean(data.fee_exception),
		syllabus_pdf_url: data.syllabus_pdf_url || null,
		description: data.description || null,
		is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
		course_level: data.course_level,
		// Required fields - always send as numbers (0 if empty)
		class_hours: Number(data.class_hours) || 0,
		theory_hours: Number(data.theory_hours) || 0,
		practical_hours: Number(data.practical_hours) || 0,
		internal_max_mark: Number(data.internal_max_mark) || 0,
		internal_pass_mark: Number(data.internal_pass_mark) || 0,
		internal_converted_mark: Number(data.internal_converted_mark) || 0,
		external_max_mark: Number(data.external_max_mark) || 0,
		external_pass_mark: Number(data.external_pass_mark) || 0,
		external_converted_mark: Number(data.external_converted_mark) || 0,
		total_pass_mark: Number(data.total_pass_mark) || 0,
		total_max_mark: Number(data.total_max_mark) || 0,
		annual_semester: Boolean(data.annual_semester),
		registration_based: Boolean(data.registration_based),
		credit_included: data.credit_included !== undefined ? Boolean(data.credit_included) : true,
	}

	const response = await fetch('/api/master/courses', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || errorData.details || 'Failed to create course')
	}

	return response.json()
}

export async function updateCourse(id: string, data: Partial<CourseFormData>): Promise<Course> {
	const payload = {
		institution_code: data.institution_code,
		regulation_code: data.regulation_code,
		offering_department_code: data.offering_department_code || null,
		board_code: data.board_code || null,
		course_code: data.course_code,
		course_title: data.course_title,
		display_code: data.display_code || null,
		course_category: data.course_category || null,
		course_type: data.course_type || null,
		course_part_master: data.course_part_master || null,
		credits: data.credits ? Math.trunc(Number(data.credits)) : 0,
		split_credit: Boolean(data.split_credit),
		theory_credit: data.theory_credit ? Math.trunc(Number(data.theory_credit)) : 0,
		practical_credit: data.practical_credit ? Math.trunc(Number(data.practical_credit)) : 0,
		qp_code: data.qp_code || null,
		e_code_name: data.e_code_name || null,
		exam_duration: data.exam_duration ? Math.trunc(Number(data.exam_duration)) : 0,
		evaluation_type: data.evaluation_type,
		result_type: data.result_type,
		self_study_course: Boolean(data.self_study_course),
		outside_class_course: Boolean(data.outside_class_course),
		open_book: Boolean(data.open_book),
		online_course: Boolean(data.online_course),
		dummy_number_required: Boolean(data.dummy_number_required),
		annual_course: Boolean(data.annual_course),
		multiple_qp_set: Boolean(data.multiple_qp_set),
		no_of_qp_setter: data.no_of_qp_setter ? Number(data.no_of_qp_setter) : null,
		no_of_scrutinizer: data.no_of_scrutinizer ? Number(data.no_of_scrutinizer) : null,
		fee_exception: Boolean(data.fee_exception),
		syllabus_pdf_url: data.syllabus_pdf_url || null,
		description: data.description || null,
		is_active: data.is_active !== undefined ? Boolean(data.is_active) : true,
		course_level: data.course_level,
		// Required fields
		class_hours: Number(data.class_hours) || 0,
		theory_hours: Number(data.theory_hours) || 0,
		practical_hours: Number(data.practical_hours) || 0,
		internal_max_mark: Number(data.internal_max_mark) || 0,
		internal_pass_mark: Number(data.internal_pass_mark) || 0,
		internal_converted_mark: Number(data.internal_converted_mark) || 0,
		external_max_mark: Number(data.external_max_mark) || 0,
		external_pass_mark: Number(data.external_pass_mark) || 0,
		external_converted_mark: Number(data.external_converted_mark) || 0,
		total_pass_mark: Number(data.total_pass_mark) || 0,
		total_max_mark: Number(data.total_max_mark) || 0,
		annual_semester: Boolean(data.annual_semester),
		registration_based: Boolean(data.registration_based),
		credit_included: data.credit_included !== undefined ? Boolean(data.credit_included) : true,
	}

	const response = await fetch(`/api/master/courses/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || errorData.details || 'Failed to update course')
	}

	return response.json()
}

export async function deleteCourse(id: string): Promise<void> {
	const response = await fetch(`/api/master/courses/${id}`, {
		method: 'DELETE',
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to delete course')
	}
}

// Dropdown data services
export async function fetchDropdownData() {
	try {
		const [instRes, deptRes, boardRes] = await Promise.all([
			fetch('/api/master/institutions').catch(() => null),
			fetch('/api/master/departments').catch(() => null),
			fetch('/api/master/boards').catch(() => null),
		])

		const institutions = instRes && instRes.ok
			? (await instRes.json()).filter((i: any) => i?.institution_code).map((i: any) => ({
				id: i.id,
				institution_code: i.institution_code,
				name: i.name || i.myjkkn_name || i.institution_name,
				counselling_code: i.counselling_code || null
			}))
			: []

		const departments = deptRes && deptRes.ok
			? (await deptRes.json()).filter((d: any) => d?.department_code).map((d: any) => ({ id: d.id, department_code: d.department_code, department_name: d.department_name }))
			: []

		const boards = boardRes && boardRes.ok
			? (await boardRes.json()).filter((b: any) => b?.board_code).map((b: any) => ({ id: b.id, board_code: b.board_code, board_name: b.board_name }))
			: []

		// Regulations are now fetched separately based on selected institution
		return { institutions, departments, regulations: [], boards }
	} catch (error) {
		console.error('Error loading dropdown codes:', error)
		return { institutions: [], departments: [], regulations: [], boards: [] }
	}
}

/**
 * Fetch MyJKKN institution IDs by counselling_code
 * MyJKKN may have multiple institutions (self/SF and aided) for the same counselling_code
 * @param counsellingCode - The institution's counselling_code from COE
 * @returns Promise<string[]> - Array of MyJKKN institution UUIDs
 */
export async function fetchMyJKKNInstitutionIds(counsellingCode: string): Promise<string[]> {
	try {
		// Fetch all active institutions (search param may not be supported by MyJKKN API)
		const params = new URLSearchParams()
		params.set('limit', '500')
		params.set('is_active', 'true')

		const res = await fetch(`/api/myjkkn/institutions?${params.toString()}`)
		if (res.ok) {
			const response = await res.json()
			const data = response.data || response || []
			// Filter institutions that match the counselling_code exactly (client-side filter)
			// MyJKKN uses counselling_code field to store the institution code
			const matchingInstitutions = Array.isArray(data)
				? data.filter((inst: any) => inst?.counselling_code === counsellingCode && inst.is_active !== false)
				: []

			console.log('[fetchMyJKKNInstitutionIds] counsellingCode:', counsellingCode, 'found:', matchingInstitutions.length, 'institutions')

			return matchingInstitutions.map((inst: any) => inst.id)
		}
		return []
	} catch (error) {
		console.error('[fetchMyJKKNInstitutionIds] Error:', error)
		return []
	}
}

/**
 * Fetch regulations from MyJKKN API filtered by institution's counselling_code
 * Uses two-step lookup:
 * 1. Get MyJKKN institution ID(s) by counselling_code
 * 2. Fetch regulations filtered by institution_id
 *
 * @param counsellingCode - Optional institution counselling_code to filter regulations
 * @returns Promise<Array<{ id: string, regulation_code: string, regulation_name?: string, effective_year?: number }>>
 */
export async function fetchRegulationsForCourse(counsellingCode?: string): Promise<Array<{
	id: string
	regulation_code: string
	regulation_name?: string
	effective_year?: number
}>> {
	try {
		// If no counselling code provided, fetch all active regulations
		if (!counsellingCode) {
			const params = new URLSearchParams()
			params.set('limit', '1000')
			params.set('is_active', 'true')

			const res = await fetch(`/api/myjkkn/regulations?${params.toString()}`)
			if (res.ok) {
				const response = await res.json()
				const data = response.data || response || []
				return Array.isArray(data)
					? data.filter((r: any) => r?.regulation_code && r.is_active !== false).map((r: any) => ({
						id: r.id,
						regulation_code: r.regulation_code,
						regulation_name: r.regulation_name || r.name,
						effective_year: r.effective_year
					}))
					: []
			}
			return []
		}

		// Step 1: Get MyJKKN institution IDs by counselling_code
		const institutionIds = await fetchMyJKKNInstitutionIds(counsellingCode)

		console.log('[fetchRegulationsForCourse] counsellingCode:', counsellingCode, 'institutionIds:', institutionIds)

		if (institutionIds.length === 0) {
			console.warn('[fetchRegulationsForCourse] No MyJKKN institutions found for counsellingCode:', counsellingCode)
			return []
		}

		// Step 2: Fetch regulations for each institution ID and combine results
		const allRegulations: Array<{
			id: string
			regulation_code: string
			regulation_name?: string
			effective_year?: number
		}> = []

		const seenCodes = new Set<string>() // Deduplicate by regulation_code, not id

		for (const institutionId of institutionIds) {
			const params = new URLSearchParams()
			params.set('limit', '1000')
			params.set('is_active', 'true')
			params.set('institution_id', institutionId)

			console.log('[fetchRegulationsForCourse] Fetching regulations for institution_id:', institutionId)

			const res = await fetch(`/api/myjkkn/regulations?${params.toString()}`)
			if (res.ok) {
				const response = await res.json()
				const data = response.data || response || []
				// Client-side filter by institution_id since MyJKKN API may not filter server-side
				const regulations = Array.isArray(data)
					? data
						.filter((r: any) => r?.regulation_code && r.is_active !== false && r.institution_id === institutionId)
						.map((r: any) => ({
							id: r.id,
							regulation_code: r.regulation_code,
							regulation_name: r.regulation_name || r.name,
							effective_year: r.effective_year
						}))
					: []

				console.log('[fetchRegulationsForCourse] Regulations for institution', institutionId, ':', regulations.length, 'of', data.length, 'total')

				// Add unique regulations by regulation_code (avoid duplicates across aided/self-financing)
				for (const reg of regulations) {
					if (!seenCodes.has(reg.regulation_code)) {
						seenCodes.add(reg.regulation_code)
						allRegulations.push(reg)
					}
				}
			}
		}

		console.log('[fetchRegulationsForCourse] Total filtered regulations:', allRegulations.length)

		return allRegulations
	} catch (error) {
		console.error('[fetchRegulationsForCourse] Error:', error)
		return []
	}
}

/**
 * Fetch departments filtered by institution_code
 * @param institutionCode - Optional institution_code to filter departments
 * @returns Promise<Array<{ id: string, department_code: string, department_name?: string, institution_code?: string }>>
 */
export async function fetchDepartmentsForCourse(institutionCode?: string): Promise<Array<{
	id: string
	department_code: string
	department_name?: string
	institution_code?: string
}>> {
	try {
		const params = new URLSearchParams()
		if (institutionCode) {
			params.set('institution_code', institutionCode)
		}
		const queryString = params.toString()
		const url = queryString ? `/api/master/departments?${queryString}` : '/api/master/departments'

		const res = await fetch(url)
		if (res.ok) {
			const data = await res.json()
			return Array.isArray(data)
				? data.filter((d: any) => d?.department_code).map((d: any) => ({
					id: d.id,
					department_code: d.department_code,
					department_name: d.department_name,
					institution_code: d.institution_code
				}))
				: []
		}
		return []
	} catch (error) {
		console.error('[fetchDepartmentsForCourse] Error:', error)
		return []
	}
}

/**
 * Fetch boards filtered by institution_code
 * @param institutionCode - Optional institution_code to filter boards
 * @returns Promise<Array<{ id: string, board_code: string, board_name?: string, institution_code?: string }>>
 */
export async function fetchBoardsForCourse(institutionCode?: string): Promise<Array<{
	id: string
	board_code: string
	board_name?: string
	institution_code?: string
}>> {
	try {
		const params = new URLSearchParams()
		if (institutionCode) {
			params.set('institution_code', institutionCode)
		}
		const queryString = params.toString()
		const url = queryString ? `/api/master/boards?${queryString}` : '/api/master/boards'

		const res = await fetch(url)
		if (res.ok) {
			const data = await res.json()
			return Array.isArray(data)
				? data.filter((b: any) => b?.board_code).map((b: any) => ({
					id: b.id,
					board_code: b.board_code,
					board_name: b.board_name,
					institution_code: b.institution_code
				}))
				: []
		}
		return []
	} catch (error) {
		console.error('[fetchBoardsForCourse] Error:', error)
		return []
	}
}

// Template download — filters reference data by institution when provided
export async function downloadTemplate(institutionCode?: string) {
	const params = new URLSearchParams()
	if (institutionCode) {
		params.set('institution_code', institutionCode)
	}
	const queryString = params.toString()
	const url = queryString
		? `/api/master/courses/template?${queryString}`
		: '/api/master/courses/template'

	const response = await fetch(url)

	if (!response.ok) {
		throw new Error('Failed to download template')
	}

	const blob = await response.blob()
	const blobUrl = window.URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = blobUrl
	a.download = `Course_Master_Template_${new Date().toISOString().split('T')[0]}.xlsx`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	window.URL.revokeObjectURL(blobUrl)
}
