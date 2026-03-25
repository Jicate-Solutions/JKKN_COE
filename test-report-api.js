// Test script for Course Mapping Report API
// Run this in the browser console while logged in

async function testReportAPI() {
	const params = new URLSearchParams({
		institution_code: 'CET',
		program_code: 'BE-3',
		regulation_code: 'R-2025'
	})
	
	const url = `/api/course-management/course-mapping/report?${params.toString()}`
	
	console.log('Testing Report API with:', {
		institution_code: 'CET',
		program_code: 'BE-3',
		regulation_code: 'R-2025'
	})
	console.log('URL:', url)
	
	try {
		const response = await fetch(url)
		const data = await response.json()
		
		if (!response.ok) {
			console.error('❌ API Error:', {
				status: response.status,
				statusText: response.statusText,
				error: data.error,
				details: data.details
			})
			return
		}
		
		console.log('✅ API Success:', {
			status: response.status,
			institutionName: data.institutionName,
			programName: data.programName,
			regulationName: data.regulationName,
			mappingsCount: data.mappings?.length || 0,
			hasLogo: !!data.logoImage,
			hasRightLogo: !!data.rightLogoImage
		})
		
		// Show sample mapping
		if (data.mappings && data.mappings.length > 0) {
			console.log('Sample Mapping:', data.mappings[0])
		}
		
		// Check semester data
		const semesters = [...new Set(data.mappings?.map(m => m.semester_name) || [])]
		console.log('Semesters found:', semesters)
		
		return data
	} catch (error) {
		console.error('❌ Request Failed:', error)
	}
}

// Run the test
testReportAPI()


