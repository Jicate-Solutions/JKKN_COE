import {
	fetchMyJKKNStaffById,
	fetchAllMyJKKNDepartments,
	fetchAllMyJKKNInstitutions,
} from '@/services/myjkkn-service'

export interface StaffProfileExtras {
	department?: string
	institution?: string
	designation?: string
}

const departmentCache = new Map<string, string>()
const institutionCache = new Map<string, string>()

export async function lookupStaffProfileExtras(
	staffId: string,
): Promise<StaffProfileExtras> {
	const result: StaffProfileExtras = {}
	if (!staffId) return result

	let staff: any
	try {
		staff = await fetchMyJKKNStaffById(staffId)
	} catch {
		return result
	}
	if (!staff) return result

	if (staff.designation) result.designation = staff.designation

	const deptKey = staff.department_id || staff.department_code
	if (deptKey) {
		if (departmentCache.has(deptKey)) {
			result.department = departmentCache.get(deptKey)
		} else {
			try {
				const depts = await fetchAllMyJKKNDepartments({
					institution_id: staff.institution_id,
					all: true,
				})
				for (const d of depts || []) {
					const key = d.id || d.department_code
					if (key && d.department_name) {
						departmentCache.set(key, d.department_name)
						if (d.id) departmentCache.set(d.id, d.department_name)
						if (d.department_code) departmentCache.set(d.department_code, d.department_name)
					}
				}
				result.department = departmentCache.get(deptKey)
			} catch {
				// ignore
			}
		}
	}

	const instKey = staff.institution_id || staff.institution_code
	if (instKey) {
		if (institutionCache.has(instKey)) {
			result.institution = institutionCache.get(instKey)
		} else {
			try {
				const insts = await fetchAllMyJKKNInstitutions({ all: true })
				for (const i of insts || []) {
					if (i.id && i.name) institutionCache.set(i.id, i.name)
					if (i.institution_code && i.name) institutionCache.set(i.institution_code, i.name)
				}
				result.institution = institutionCache.get(instKey)
			} catch {
				// ignore
			}
		}
	}

	return result
}
