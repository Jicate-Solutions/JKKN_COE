import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase-route-handler'
import { fetchAllMyJKKNPrograms, fetchAllMyJKKNRegulations, fetchAllMyJKKNSemesters, fetchAllMyJKKNInstitutions } from '@/lib/myjkkn-api'
import path from 'path'
import fs from 'fs'

export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionCode = searchParams.get('institution_code')
		const programCode = searchParams.get('program_code')
		const regulationCode = searchParams.get('regulation_code')

		// Validate required parameters (NO BATCH)
		if (!institutionCode || !programCode || !regulationCode) {
			return NextResponse.json(
				{ error: 'Missing required parameters: institution_code, program_code, regulation_code' },
				{ status: 400 }
			)
		}

		// Handle null string as actual null (after validation)
		const actualRegulationCode = regulationCode === 'null' || regulationCode === 'undefined' ? null : regulationCode

		// Apply institution filter: Validate user has access to requested institution
		try {
			const routeHandlerSupabase = await createRouteHandlerSupabaseClient()
			const { data: authUser } = await routeHandlerSupabase.auth.getUser()

			if (authUser?.user) {
				// Get user's institution from users table
				const { data: userData } = await supabase
					.from('users')
					.select('institution_id, role, is_super_admin')
					.eq('email', authUser.user.email)
					.single()

				// If user is not super_admin, validate institution access
				if (userData && !userData.is_super_admin && userData.role !== 'super_admin') {
					// Get user's institution code
					const { data: userInstitution } = await supabase
						.from('institutions')
						.select('institution_code')
						.eq('id', userData.institution_id)
						.single()

					// Validate requested institution matches user's institution
					if (userInstitution && userInstitution.institution_code !== institutionCode) {
						return NextResponse.json(
							{ error: 'Access denied: You can only access data for your institution' },
							{ status: 403 }
						)
					}
				}
			}
		} catch (authError) {
			// If auth check fails, log but continue (for development/testing)
			console.warn('Institution filter validation warning:', authError)
		}

		// Fetch institution details (including myjkkn_institution_ids for MyJKKN API calls)
		// Note: Address fields don't exist in local institutions table - use MyJKKN API for address
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id, institution_code, name, myjkkn_institution_ids')
			.eq('institution_code', institutionCode)
			.single()

		if (instError || !institution) {
			console.error('Institution fetch error:', instError, 'Code:', institutionCode)
			return NextResponse.json({
				error: 'Institution not found',
				details: instError?.message,
				institutionCode
			}, { status: 404 })
		}

		// Get MyJKKN institution IDs for fetching semesters
		const myjkknInstitutionIds = institution.myjkkn_institution_ids || []

		// Fetch program and regulation details from MyJKKN API
		// Note: Programs and regulations come from MyJKKN API, not local database
		let programName = programCode
		let regulationName = actualRegulationCode || ''
		let degreeName = 'Degree'
		let programId: string | null = null // MyJKKN program UUID for fetching semesters

		try {
			// Fetch all programs from MyJKKN API
			const myjkknPrograms = await fetchAllMyJKKNPrograms({ limit: 10000, is_active: true })
			const programArray = Array.isArray(myjkknPrograms) ? myjkknPrograms : []
			
			// Find program by program_code (MyJKKN uses program_id as CODE field, fallback to program_code)
			const program = programArray.find((p: any) => 
				(p.program_id === programCode || p.program_code === programCode) &&
				(p.institution_code === institutionCode || !p.institution_code)
			)
			
			if (program) {
				programName = program.program_name || program.name || programCode
				programId = program.id // Store MyJKKN program UUID for fetching semesters
				// Try to get degree information if available
				if (program.degree_name) {
					degreeName = program.degree_name
				} else if (program.degree_code) {
					degreeName = program.degree_code
				}
			} else {
				console.warn(`[Report Route] Program "${programCode}" not found in MyJKKN API`)
			}

			// Fetch all regulations from MyJKKN API
			if (actualRegulationCode) {
				const myjkknRegulations = await fetchAllMyJKKNRegulations({ limit: 10000, is_active: true })
				const regulationArray = Array.isArray(myjkknRegulations) ? myjkknRegulations : []
				
				// Find regulation by regulation_code
				const regulation = regulationArray.find((r: any) => r.regulation_code === actualRegulationCode)
				
				if (regulation) {
					regulationName = regulation.regulation_name || regulation.name || actualRegulationCode
				} else {
					console.warn(`[Report Route] Regulation "${actualRegulationCode}" not found in MyJKKN API`)
				}
			}
		} catch (error) {
			console.error('[Report Route] Error fetching from MyJKKN API:', error)
			// Continue with fallback values (programCode and regulationCode)
		}

		// Fetch course mappings with proper joins using Supabase syntax
		let query = supabase
			.from('course_mapping')
			.select(`
				*,
				courses:course_id (
					id,
					course_code,
					course_name,
					course_category,
					course_type,
					course_part_master,
					credit,
					exam_duration,
					evaluation_type,
					regulation_code,
					internal_max_mark,
					internal_pass_mark,
					internal_converted_mark,
					external_max_mark,
					external_pass_mark,
					external_converted_mark,
					total_max_mark,
					total_pass_mark
				)
			`)
			.eq('institution_code', institutionCode)
			.eq('program_code', programCode)
			.eq('regulation_code', actualRegulationCode)
			.eq('is_active', true)

		const { data: mappings, error: mappingsError } = await query
			.order('semester_code', { ascending: true })
			.order('course_order', { ascending: true })

		if (mappingsError) {
			console.error('Error fetching course mappings:', mappingsError)
			return NextResponse.json({ error: 'Failed to fetch course mappings', details: mappingsError.message }, { status: 500 })
		}

		if (!mappings || mappings.length === 0) {
			return NextResponse.json({ error: 'No course mappings found for this criteria' }, { status: 404 })
		}

		// Fetch semesters from MyJKKN API (not local database)
		// Get unique semester_ids from course_mapping (MyJKKN UUIDs)
		const semesterIds = [...new Set(mappings.map((m: any) => m.semester_id).filter(Boolean))]
		const semesterCodes = [...new Set(mappings.map((m: any) => m.semester_code).filter(Boolean))]
		
		// Fetch semesters from MyJKKN API
		const semestersMap = new Map<string, any>()
		
		if (myjkknInstitutionIds.length > 0 && programId) {
			console.log(`[Report Route] Fetching semesters from MyJKKN API for ${myjkknInstitutionIds.length} institution(s), program_id: ${programId}`)
			try {
				// Fetch semesters from MyJKKN API for each institution
				for (const myjkknInstId of myjkknInstitutionIds) {
					try {
						const semesterData = await fetchAllMyJKKNSemesters({
							institution_id: myjkknInstId,
							program_id: programId,
							is_active: true,
							limit: 1000
						})
						
						const semesterArray = Array.isArray(semesterData) ? semesterData : []
						console.log(`[Report Route] Fetched ${semesterArray.length} semesters from MyJKKN API for institution ${myjkknInstId}`)
						
						// Build lookup map by semester_id (MyJKKN UUID) and semester_code
						for (const sem of semesterArray) {
							if (sem?.id) {
								// Map by semester_id (MyJKKN UUID)
								if (!semestersMap.has(`id:${sem.id}`)) {
									semestersMap.set(`id:${sem.id}`, sem)
								}
								
								// Also map by semester_code if available (for fallback matching)
								if (sem.semester_code) {
									if (!semestersMap.has(`code:${sem.semester_code}`)) {
										semestersMap.set(`code:${sem.semester_code}`, sem)
									}
								}
							}
						}
					} catch (err) {
						console.error(`[Report Route] Error fetching semesters for institution ${myjkknInstId}:`, err)
					}
				}
				console.log(`[Report Route] Total unique semesters in map: ${semestersMap.size}`)
			} catch (error) {
				console.error('[Report Route] Error fetching semesters from MyJKKN API:', error)
			}
		} else {
			console.warn(`[Report Route] Cannot fetch semesters: myjkknInstitutionIds=${myjkknInstitutionIds.length}, programId=${programId}`)
		}

		// Transform the data for the PDF generator
		const transformedMappings = (mappings || []).map((mapping: any) => {
			// course data comes from the joined courses table (via course_id FK)
			const course = mapping.courses
			// semester data from MyJKKN API lookup (by semester_id first, fallback to semester_code)
			let semester = null
			if (mapping.semester_id) {
				semester = semestersMap.get(`id:${mapping.semester_id}`)
				if (!semester && mapping.semester_code) {
					semester = semestersMap.get(`code:${mapping.semester_code}`)
				}
			} else if (mapping.semester_code) {
				semester = semestersMap.get(`code:${mapping.semester_code}`)
			}
			
			// Log if semester not found (for debugging)
			if (!semester && (mapping.semester_id || mapping.semester_code)) {
				console.warn(`[Report Route] Semester not found in MyJKKN API: semester_id=${mapping.semester_id}, semester_code=${mapping.semester_code}`)
			}

			return {
				id: mapping.id,
				// Semester information (from MyJKKN API)
				semester_code: semester?.semester_code || mapping.semester_code,
				semester_name: semester?.semester_name || mapping.semester_code,
				semester_number: semester?.semester_number || 0,
				display_order: (semester as any)?.semester_order || semester?.semester_number || 0, // Use semester_order if available, fallback to semester_number

				// Part information (from courses table via FK join)
				part_name: course?.course_part_master || '-',

				// Course information (from courses table via FK join)
				course_code: course?.course_code || '-',
				course_title: course?.course_name || '-',
				course_category: mapping.course_category || course?.course_category || '-',
				course_type: course?.course_type || '-',
				course_group: mapping.course_group || '-',

				// Evaluation and credits (from courses table via FK join)
				evaluation_pattern: course?.evaluation_type || '-',
				credits: course?.credit || 0,
				exam_hours: course?.exam_duration || 0,

				// Sort order
				course_order: mapping.course_order || 0,
				sort_order: mapping.course_order || 0,

				// Internal marks (from courses table via FK join)
				internal_max_mark: course?.internal_max_mark || 0,
				internal_pass_mark: course?.internal_pass_mark || 0,
				internal_converted_mark: course?.internal_converted_mark || 0,

				// External/ESE marks (from courses table via FK join)
				external_max_mark: course?.external_max_mark || 0,
				external_pass_mark: course?.external_pass_mark || 0,
				external_converted_mark: course?.external_converted_mark || 0,

				// Total marks (from courses table via FK join)
				total_max_mark: course?.total_max_mark || 0,
				total_pass_mark: course?.total_pass_mark || 0
			}
		})

		// Build institution address from MyJKKN API (local institutions table doesn't have address columns)
		let institutionAddress: string | undefined
		
		try {
			const myjkknInstitutions = await fetchAllMyJKKNInstitutions({ limit: 10000, is_active: true })
			const institutionArray = Array.isArray(myjkknInstitutions) ? myjkknInstitutions : []
			
			// Find institution by counselling_code or institution_code
			const myjkknInst = institutionArray.find((inst: any) => 
				inst.counselling_code === institutionCode || 
				inst.institution_code === institutionCode
			)
			
			if (myjkknInst) {
				const myjkknAddressParts = [
					myjkknInst.address,
					myjkknInst.city,
					myjkknInst.state,
					myjkknInst.pincode
				].filter(Boolean)
				
				if (myjkknAddressParts.length > 0) {
					institutionAddress = myjkknAddressParts.join(', ')
				}
			}
		} catch (error) {
			console.warn('[Report Route] Error fetching MyJKKN institution address:', error)
		}

		// Load JKKN logo (left side)
		let logoImage: string | undefined
		try {
			const logoPath = path.join(process.cwd(), 'public', 'jkkn_logo.png')
			const logoBase64 = fs.readFileSync(logoPath).toString('base64')
			logoImage = `data:image/png;base64,${logoBase64}`
		} catch (error) {
			console.warn('Failed to load logo:', error)
			logoImage = undefined
		}

		// Load right logo (JKKN text logo)
		let rightLogoImage: string | undefined
		try {
			const rightLogoPath = path.join(process.cwd(), 'public', 'jkkn_text_logo.png')
			const rightLogoBase64 = fs.readFileSync(rightLogoPath).toString('base64')
			rightLogoImage = `data:image/png;base64,${rightLogoBase64}`
		} catch (error) {
			console.warn('Failed to load right logo:', error)
			rightLogoImage = undefined
		}

		// Get regulation code from multiple sources (fallback chain)
		const finalRegulationCode = actualRegulationCode ||
			mappings[0]?.regulation_code ||
			mappings[0]?.courses?.regulation_code ||
			regulationName

		// Prepare response data
		const reportData = {
			institutionName: institution.name,
			institutionAddress: institutionAddress || undefined,
			programName: programName,
			programCode: programCode,
			degreeName: degreeName,
			regulationName: regulationName,
			regulationCode: finalRegulationCode,
			logoImage,
			rightLogoImage,
			mappings: transformedMappings
		}

		return NextResponse.json(reportData)
	} catch (error) {
		console.error('Error generating report data:', error)
		return NextResponse.json(
			{ error: 'Failed to generate report data' },
			{ status: 500 }
		)
	}
}
