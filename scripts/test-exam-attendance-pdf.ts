/**
 * Test Script for Exam Attendance PDF Generation
 *
 * This script demonstrates how to use the generateExamAttendancePDF function
 * with sample data. Run this in a browser environment (not Node.js).
 *
 * Usage:
 * 1. Copy this code into browser console on the exam attendance page
 * 2. Or import and call testPDFGeneration() from a React component
 */

import { generateExamAttendancePDF } from '@/lib/utils/generate-exam-attendance-pdf'

// Sample attendance data
const sampleAttendanceData = {
	institutionName: "J.K.K NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)",
	institutionCode: "JKKNCAS",
	institutionAddress: "Komarapalayam - 638 183, Namakkal District, Tamil Nadu",
	sessionCode: "JKKNCAS-NOV-DEC-2025",
	sessionName: "November-December 2025 Examinations",
	logoImage: undefined, // Will be loaded from public folder
	records: [
		// Day 1 - FN Session
		{
			exam_date: "15-11-2025",
			exam_session: "FN",
			course_code: "24UENG101",
			course_name: "English Grammar and Composition",
			course_category: "Theory",
			total_students: 45,
			present_count: 43,
			absent_count: 2,
			attendance_percentage: 95.56
		},
		{
			exam_date: "15-11-2025",
			exam_session: "FN",
			course_code: "24UMAT101",
			course_name: "Differential Calculus and Matrices",
			course_category: "Theory",
			total_students: 38,
			present_count: 38,
			absent_count: 0,
			attendance_percentage: 100.00
		},
		{
			exam_date: "15-11-2025",
			exam_session: "FN",
			course_code: "24UPHY101",
			course_name: "Mechanics and Properties of Matter",
			course_category: "Theory",
			total_students: 42,
			present_count: 40,
			absent_count: 2,
			attendance_percentage: 95.24
		},
		// Day 1 - AN Session
		{
			exam_date: "15-11-2025",
			exam_session: "AN",
			course_code: "24UCHE101",
			course_name: "General Chemistry",
			course_category: "Theory",
			total_students: 40,
			present_count: 39,
			absent_count: 1,
			attendance_percentage: 97.50
		},
		{
			exam_date: "15-11-2025",
			exam_session: "AN",
			course_code: "24UBOT101",
			course_name: "Diversity of Microbes and Cryptogams",
			course_category: "Theory",
			total_students: 35,
			present_count: 34,
			absent_count: 1,
			attendance_percentage: 97.14
		},
		// Day 2 - FN Session
		{
			exam_date: "16-11-2025",
			exam_session: "FN",
			course_code: "24UECO101",
			course_name: "Microeconomics",
			course_category: "Theory",
			total_students: 50,
			present_count: 48,
			absent_count: 2,
			attendance_percentage: 96.00
		},
		{
			exam_date: "16-11-2025",
			exam_session: "FN",
			course_code: "24UCOM101",
			course_name: "Business Communication",
			course_category: "Theory",
			total_students: 55,
			present_count: 53,
			absent_count: 2,
			attendance_percentage: 96.36
		},
		// Day 2 - AN Session
		{
			exam_date: "16-11-2025",
			exam_session: "AN",
			course_code: "24UPHY102",
			course_name: "Physics Practical I",
			course_category: "Practical",
			total_students: 42,
			present_count: 42,
			absent_count: 0,
			attendance_percentage: 100.00
		},
		{
			exam_date: "16-11-2025",
			exam_session: "AN",
			course_code: "24UCHE102",
			course_name: "Chemistry Practical I",
			course_category: "Practical",
			total_students: 40,
			present_count: 40,
			absent_count: 0,
			attendance_percentage: 100.00
		},
		// Day 3 - FN Session
		{
			exam_date: "17-11-2025",
			exam_session: "FN",
			course_code: "24UTAM101",
			course_name: "Tamil Literature",
			course_category: "Theory",
			total_students: 48,
			present_count: 45,
			absent_count: 3,
			attendance_percentage: 93.75
		},
		{
			exam_date: "17-11-2025",
			exam_session: "FN",
			course_code: "24UHIS101",
			course_name: "History of India",
			course_category: "Theory",
			total_students: 44,
			present_count: 42,
			absent_count: 2,
			attendance_percentage: 95.45
		},
		// Day 3 - AN Session
		{
			exam_date: "17-11-2025",
			exam_session: "AN",
			course_code: "24UCSC101",
			course_name: "Programming in C",
			course_category: "Theory",
			total_students: 60,
			present_count: 58,
			absent_count: 2,
			attendance_percentage: 96.67
		},
		{
			exam_date: "17-11-2025",
			exam_session: "AN",
			course_code: "24UBBA101",
			course_name: "Principles of Management",
			course_category: "Theory",
			total_students: 52,
			present_count: 51,
			absent_count: 1,
			attendance_percentage: 98.08
		}
	]
}

/**
 * Test PDF generation with sample data
 */
export async function testPDFGeneration() {
	console.log('=== Testing Exam Attendance PDF Generation ===')
	console.log('Sample data:', sampleAttendanceData)

	try {
		// Try to load logo
		let logoBase64 = undefined
		try {
			const logoResponse = await fetch('/jkkn_logo.png')
			if (logoResponse.ok) {
				const blob = await logoResponse.blob()
				logoBase64 = await new Promise<string>((resolve) => {
					const reader = new FileReader()
					reader.onloadend = () => resolve(reader.result as string)
					reader.readAsDataURL(blob)
				})
				console.log('✅ Logo loaded successfully')
			} else {
				console.warn('⚠️ Logo not found, proceeding without logo')
			}
		} catch (e) {
			console.warn('⚠️ Failed to load logo:', e)
		}

		// Generate PDF
		console.log('Generating PDF...')
		const fileName = generateExamAttendancePDF({
			...sampleAttendanceData,
			logoImage: logoBase64
		})

		console.log('✅ PDF generated successfully:', fileName)
		console.log('=== Test Complete ===')

		return {
			success: true,
			fileName,
			recordCount: sampleAttendanceData.records.length
		}

	} catch (error) {
		console.error('❌ PDF generation failed:', error)
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		}
	}
}

/**
 * Test with minimal data (edge case)
 */
export async function testMinimalData() {
	console.log('=== Testing with Minimal Data ===')

	const minimalData = {
		institutionName: "Test Institution",
		institutionCode: "TEST",
		sessionCode: "TEST-2025",
		records: [
			{
				exam_date: "01-01-2025",
				exam_session: "FN",
				course_code: "TEST101",
				course_name: "Test Course",
				course_category: "Theory",
				total_students: 10,
				present_count: 9,
				absent_count: 1,
				attendance_percentage: 90.00
			}
		]
	}

	try {
		const fileName = generateExamAttendancePDF(minimalData)
		console.log('✅ Minimal data test passed:', fileName)
		return { success: true, fileName }
	} catch (error) {
		console.error('❌ Minimal data test failed:', error)
		return { success: false, error }
	}
}

/**
 * Test with large dataset (performance test)
 */
export async function testLargeDataset() {
	console.log('=== Testing with Large Dataset ===')

	// Generate 100 records
	const largeRecords = Array.from({ length: 100 }, (_, i) => ({
		exam_date: `${15 + (i % 10)}-11-2025`,
		exam_session: i % 2 === 0 ? 'FN' : 'AN',
		course_code: `TEST${String(i + 1).padStart(3, '0')}`,
		course_name: `Test Course ${i + 1} - ${i % 3 === 0 ? 'Theory' : i % 3 === 1 ? 'Practical' : 'Theory with Lab'}`,
		course_category: i % 3 === 0 ? 'Theory' : 'Practical',
		total_students: 40 + (i % 20),
		present_count: 38 + (i % 18),
		absent_count: 2 + (i % 2),
		attendance_percentage: 90 + (i % 10)
	}))

	const largeData = {
		institutionName: "Test Institution - Large Dataset",
		institutionCode: "TEST-LARGE",
		sessionCode: "TEST-LARGE-2025",
		records: largeRecords
	}

	try {
		const startTime = performance.now()
		const fileName = generateExamAttendancePDF(largeData)
		const endTime = performance.now()
		const duration = (endTime - startTime).toFixed(2)

		console.log(`✅ Large dataset test passed: ${fileName}`)
		console.log(`⏱️ Generation time: ${duration}ms`)
		console.log(`📊 Records processed: ${largeRecords.length}`)

		return {
			success: true,
			fileName,
			recordCount: largeRecords.length,
			duration
		}
	} catch (error) {
		console.error('❌ Large dataset test failed:', error)
		return { success: false, error }
	}
}

/**
 * Run all tests
 */
export async function runAllTests() {
	console.log('\n' + '='.repeat(50))
	console.log('EXAM ATTENDANCE PDF - TEST SUITE')
	console.log('='.repeat(50) + '\n')

	const results = {
		standard: await testPDFGeneration(),
		minimal: await testMinimalData(),
		large: await testLargeDataset()
	}

	console.log('\n' + '='.repeat(50))
	console.log('TEST RESULTS SUMMARY')
	console.log('='.repeat(50))
	console.log('Standard Data:', results.standard.success ? '✅ PASS' : '❌ FAIL')
	console.log('Minimal Data:', results.minimal.success ? '✅ PASS' : '❌ FAIL')
	console.log('Large Dataset:', results.large.success ? '✅ PASS' : '❌ FAIL')
	console.log('='.repeat(50) + '\n')

	return results
}

// Export for use in browser console
if (typeof window !== 'undefined') {
	(window as any).testExamAttendancePDF = {
		testPDFGeneration,
		testMinimalData,
		testLargeDataset,
		runAllTests
	}
	console.log('💡 Test functions available in window.testExamAttendancePDF')
	console.log('   - testPDFGeneration()')
	console.log('   - testMinimalData()')
	console.log('   - testLargeDataset()')
	console.log('   - runAllTests()')
}
