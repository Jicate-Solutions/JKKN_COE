import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { generateCourseTemplate, workbookToBuffer, CourseReferenceData } from '@/lib/utils/excel-template-generator'
import { fetchAllMyJKKNRegulations } from '@/services/myjkkn-service'

/**
 * GET /api/master/courses/template?institution_code=CAS
 * Generates an Excel template filtered by the user's institution.
 *
 * Data sources:
 *  - Institutions → COE local `institutions` table
 *  - Regulations  → MyJKKN API (filtered via myjkkn_institution_ids)
 *  - Enum values  → DB CHECK constraints (hardcoded in template generator)
 */
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const institutionCode = searchParams.get('institution_code')

		// ── 1. Fetch institutions from local DB ──────────────────────────
		let instQuery = supabase
			.from('institutions')
			.select('id, institution_code, myjkkn_institution_ids')
			.eq('is_active', true)
			.order('institution_code')
		if (institutionCode) {
			instQuery = instQuery.eq('institution_code', institutionCode)
		}
		const { data: institutions } = await instQuery

		// ── 2. Fetch regulations from MyJKKN API ────────────────────────
		// Get myjkkn_institution_ids for the filtered institution(s)
		const myjkknIds: string[] = []
		for (const inst of (institutions || [])) {
			const ids = inst.myjkkn_institution_ids || []
			for (const id of ids) {
				if (!myjkknIds.includes(id)) myjkknIds.push(id)
			}
		}

		const seenRegCodes = new Set<string>()
		const regulations: Array<{ regulation_code: string }> = []

		for (const myjkknInstId of myjkknIds) {
			try {
				const regs = await fetchAllMyJKKNRegulations({
					institution_id: myjkknInstId,
					is_active: true,
					limit: 200,
				})
				for (const reg of regs) {
					const code = reg.regulation_code
					// Client-side filter: MyJKKN may ignore server-side institution_id
					if (code && reg.institution_id === myjkknInstId && reg.is_active !== false && !seenRegCodes.has(code)) {
						seenRegCodes.add(code)
						regulations.push({ regulation_code: code })
					}
				}
			} catch (e) {
				console.warn(`[template] Failed to fetch regulations for MyJKKN inst ${myjkknInstId}:`, e)
			}
		}

		// Fallback: if MyJKKN returned nothing, try local regulations table
		if (regulations.length === 0) {
			let regQuery = supabase
				.from('regulations')
				.select('regulation_code')
				.eq('status', true)
				.order('regulation_code')
			if (institutionCode) {
				regQuery = regQuery.eq('institution_code', institutionCode)
			}
			const { data: localRegs } = await regQuery
			for (const reg of (localRegs || [])) {
				if (reg.regulation_code && !seenRegCodes.has(reg.regulation_code)) {
					seenRegCodes.add(reg.regulation_code)
					regulations.push({ regulation_code: reg.regulation_code })
				}
			}
		}

		// ── 3. Build reference data & generate template ──────────────────
		const referenceData: CourseReferenceData = {
			institutions: (institutions || []).map(i => ({ institution_code: i.institution_code })),
			regulations,
		}

		const workbook = generateCourseTemplate(referenceData)
		const buffer = await workbookToBuffer(workbook)

		const headers = new Headers()
		headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
		headers.set('Content-Disposition', `attachment; filename="Course_Master_Template_${new Date().toISOString().split('T')[0]}.xlsx"`)

		return new NextResponse(buffer, { status: 200, headers })
	} catch (error) {
		console.error('Template generation error:', error)
		return NextResponse.json(
			{
				error: 'Failed to generate template',
				details: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		)
	}
}
