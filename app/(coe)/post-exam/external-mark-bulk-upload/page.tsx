"use client"

/**
 * External Marks Bulk Upload Page
 *
 * Refactored to follow 5-layer architecture:
 * - Types: types/external-marks.ts
 * - Services: services/post-exam/external-marks-bulk-service.ts
 * - Hooks: hooks/post-exam/use-external-marks-bulk.ts
 * - Components: components/post-exam/
 * - Page: This file (composition only)
 */

import XLSX from "@/lib/utils/excel-compat"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import Link from "next/link"
import { Upload, CheckCircle, AlertTriangle, XCircle, Loader2 } from "lucide-react"
import { useState } from "react"
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

// Custom Hook
import { useExternalMarksBulk } from "@/hooks/post-exam/use-external-marks-bulk"

// Types
import type { ImportPreviewRow, LookupMode } from "@/types/external-marks"

// Components
import {
	ExternalMarksFilters,
	ExternalMarksTable,
	ExternalMarksScorecards,
	ImportPreviewDialog,
	UploadErrorDialog,
	DeleteConfirmationDialog
} from "@/components/post-exam"

export default function ExternalMarkBulkUploadPage() {
	const { toast } = useToast()
	const { user } = useAuth()

	// Dialog States
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
	const [errorDialogOpen, setErrorDialogOpen] = useState(false)
	const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false)

	// Upload Mode: 'dummy_number' or 'register_number'
	const [lookupMode, setLookupMode] = useState<LookupMode>('dummy_number')

	// Import Progress State (for centered modal overlay - matches exam-registrations pattern)
	const [importInProgress, setImportInProgress] = useState(false)
	const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })

	// Use custom hook for all state management
	const {
		// Data
		items,
		institutions,
		sessions,
		programs,
		courses,

		// Loading & Error States
		loading,
		fetchError,

		// Institution filter info
		institutionId,
		mustSelectInstitution,
		isReady,

		// Filters
		selectedInstitution,
		selectedSession,
		selectedProgram,
		selectedCourse,
		statusFilter,
		searchTerm,

		// Filter Setters
		setSelectedInstitution,
		setSelectedSession,
		setSelectedProgram,
		setSelectedCourse,
		setStatusFilter,
		setSearchTerm,

		// Sorting
		sortColumn,
		sortDirection,
		handleSort,

		// Pagination
		currentPage,
		itemsPerPage,
		totalPages,
		setCurrentPage,
		setItemsPerPage,

		// Computed Data
		filtered,
		pageItems,
		startIndex,
		endIndex,

		// Selection
		selectedIds,
		selectAll,
		handleSelectAll,
		handleSelectItem,

		// Import/Upload State
		importPreviewData,
		setImportPreviewData,
		uploadErrors,
		uploadSummary,

		// Actions
		refreshData,
		uploadMarks,
		deleteSelected
	} = useExternalMarksBulk()

	// Download Template
	const handleDownloadTemplate = () => {
		const wb = XLSX.utils.book_new()

		// Template sheet - based on lookup mode
		let templateData: any[]
		let columnsReference: any[]
		let sheetName: string

		if (lookupMode === 'register_number') {
			// Register Number mode template - includes Institution Code for multi-institution support
			templateData = [
				{
					'Institution Code *': 'CAS',
					'Register Number *': 'REG001',
					'Subject Code *': 'CS101',
					'Session Code *': 'APR2024',
					'Total Marks Obtained *': 75,
					'Marks Out Of *': 100,
					'Remarks': 'Good performance'
				},
				{
					'Institution Code *': 'CAS',
					'Register Number *': 'REG002',
					'Subject Code *': 'CS101',
					'Session Code *': 'APR2024',
					'Total Marks Obtained *': 82,
					'Marks Out Of *': 100,
					'Remarks': 'Excellent'
				}
			]

			columnsReference = [
				{ 'Column Name': 'Institution Code *', 'Required': 'Yes', 'Description': 'Institution code (e.g., CAS, CAHS, etc.)', 'Example': 'CAS' },
				{ 'Column Name': 'Register Number *', 'Required': 'Yes', 'Description': 'Student register number (stu_register_no from exam registration)', 'Example': 'REG001' },
				{ 'Column Name': 'Subject Code *', 'Required': 'Yes', 'Description': 'Subject/Course code from courses table', 'Example': 'CS101' },
				{ 'Column Name': 'Session Code *', 'Required': 'Yes', 'Description': 'Examination session code', 'Example': 'APR2024' },
				{ 'Column Name': 'Total Marks Obtained *', 'Required': 'Yes', 'Description': 'External marks obtained', 'Example': '75' },
				{ 'Column Name': 'Marks Out Of *', 'Required': 'Yes', 'Description': 'Maximum marks for the course', 'Example': '100' },
				{ 'Column Name': 'Remarks', 'Required': 'No', 'Description': 'Any additional remarks', 'Example': 'Good performance' }
			]
			sheetName = 'Register Number Template'
		} else {
			// Dummy Number mode template (default) - includes Institution Code for multi-institution support
			// Note: Program Code is auto-populated from exam_registration, not required in template
			templateData = [
				{
					'Institution Code *': 'CAS',
					'Dummy Number *': 'D001',
					'Course Code *': 'CS101',
					'Session Code': 'APR2024',
					'Total Marks Obtained *': 75,
					'Marks Out Of *': 100,
					'Remarks': 'Good performance'
				},
				{
					'Institution Code *': 'CAS',
					'Dummy Number *': 'D002',
					'Course Code *': 'CS101',
					'Session Code': 'APR2024',
					'Total Marks Obtained *': 82,
					'Marks Out Of *': 100,
					'Remarks': 'Excellent'
				}
			]

			columnsReference = [
				{ 'Column Name': 'Institution Code *', 'Required': 'Yes', 'Description': 'Institution code (e.g., CAS, CAHS, etc.)', 'Example': 'CAS' },
				{ 'Column Name': 'Dummy Number *', 'Required': 'Yes', 'Description': 'Student dummy number from exam registration', 'Example': 'D001' },
				{ 'Column Name': 'Course Code *', 'Required': 'Yes', 'Description': 'Course code from courses table', 'Example': 'CS101' },
				{ 'Column Name': 'Session Code', 'Required': 'No', 'Description': 'Examination session code', 'Example': 'APR2024' },
				{ 'Column Name': 'Total Marks Obtained *', 'Required': 'Yes', 'Description': 'External marks obtained', 'Example': '75' },
				{ 'Column Name': 'Marks Out Of *', 'Required': 'Yes', 'Description': 'Maximum marks for the course', 'Example': '100' },
				{ 'Column Name': 'Remarks', 'Required': 'No', 'Description': 'Any additional remarks', 'Example': 'Good performance' }
			]
			sheetName = 'Dummy Number Template'
		}

		const ws = XLSX.utils.json_to_sheet(templateData)

		// Set column widths based on mode
		if (lookupMode === 'register_number') {
			ws['!cols'] = [
				{ wch: 18 }, // Institution Code
				{ wch: 20 }, // Register Number
				{ wch: 15 }, // Subject Code
				{ wch: 15 }, // Session Code
				{ wch: 25 }, // Total Marks Obtained
				{ wch: 18 }, // Marks Out Of
				{ wch: 30 }  // Remarks
			]
		} else {
			ws['!cols'] = [
				{ wch: 18 }, // Institution Code
				{ wch: 20 }, // Dummy Number
				{ wch: 15 }, // Course Code
				{ wch: 15 }, // Session Code
				{ wch: 25 }, // Total Marks Obtained
				{ wch: 18 }, // Marks Out Of
				{ wch: 30 }  // Remarks
			]
		}

		XLSX.utils.book_append_sheet(wb, ws, sheetName)

		// Column Reference sheet
		const wsColumns = XLSX.utils.json_to_sheet(columnsReference)
		wsColumns['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 50 }, { wch: 20 }]
		XLSX.utils.book_append_sheet(wb, wsColumns, 'Column Reference')

		// Add reference sheets
		if (sessions.length > 0) {
			const sessionsRef = sessions.map(s => ({
				'Session Code': s.session_code,
				'Session Name': s.session_name
			}))
			const wsSessions = XLSX.utils.json_to_sheet(sessionsRef)
			wsSessions['!cols'] = [{ wch: 15 }, { wch: 40 }]
			XLSX.utils.book_append_sheet(wb, wsSessions, 'Sessions Reference')
		}

		if (programs.length > 0) {
			const programsRef = programs.map(p => ({
				'Program Code': p.program_code,
				'Program Name': p.program_name
			}))
			const wsPrograms = XLSX.utils.json_to_sheet(programsRef)
			wsPrograms['!cols'] = [{ wch: 15 }, { wch: 40 }]
			XLSX.utils.book_append_sheet(wb, wsPrograms, 'Programs Reference')
		}

		if (courses.length > 0) {
			const coursesRef = courses.map(c => ({
				'Course Code': c.course_code,
				'Course Name': c.course_name,
				'Max External Marks': c.external_max_mark || 100
			}))
			const wsCourses = XLSX.utils.json_to_sheet(coursesRef)
			wsCourses['!cols'] = [{ wch: 15 }, { wch: 40 }, { wch: 20 }]
			XLSX.utils.book_append_sheet(wb, wsCourses, 'Courses Reference')
		}

		if (institutions.length > 0) {
			const institutionsRef = institutions.map(i => ({
				'Institution Code': i.institution_code,
				'Institution Name': i.name
			}))
			const wsInst = XLSX.utils.json_to_sheet(institutionsRef)
			wsInst['!cols'] = [{ wch: 20 }, { wch: 40 }]
			XLSX.utils.book_append_sheet(wb, wsInst, 'Institutions Reference')
		}

		const modeLabel = lookupMode === 'register_number' ? 'register_number' : 'dummy_number'
		XLSX.writeFile(wb, `external_marks_template_${modeLabel}_${new Date().toISOString().split('T')[0]}.xlsx`)

		toast({
			title: "Template Downloaded",
			description: `External marks template (${lookupMode === 'register_number' ? 'Register Number' : 'Dummy Number'} mode) with reference sheets has been downloaded successfully.`,
			className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
		})
	}

	// Export Current Data
	const handleExportData = () => {
		if (!items || items.length === 0) {
			toast({
				title: "No Data to Export",
				description: "Please load some data before exporting.",
				variant: "destructive",
				className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
			})
			return
		}

		const exportData = items.map(item => ({
			'Dummy Number': item.dummy_number || 'N/A',
			'Student Name': item.student_name || '',
			'Course Code': item.course_code || '',
			'Course Name': item.course_name || '',
			'Program': item.program_name || '',
			'Session': item.session_name || '',
			'Total Marks Obtained': item.total_marks_obtained ?? '',
			'Marks Out Of': item.marks_out_of ?? 0,
			'Percentage': item.percentage ?? 0,
			'Attendance Status': item.attendance_status || 'Present',
			'Is Absent': item.is_absent ? 'Yes' : 'No',
			'Status': item.entry_status || 'Draft',
			'Remarks': item.remarks || ''
		}))

		const wb = XLSX.utils.book_new()
		const ws = XLSX.utils.json_to_sheet(exportData)

		// Set column widths
		ws['!cols'] = [
			{ wch: 18 }, { wch: 25 }, { wch: 15 }, { wch: 35 }, { wch: 25 },
			{ wch: 20 }, { wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 18 },
			{ wch: 12 }, { wch: 12 }, { wch: 30 }
		]

		XLSX.utils.book_append_sheet(wb, ws, 'External Marks Data')

		const fileName = `external_marks_export_${institutionId ? institutions.find(i => i.id === institutionId)?.institution_code || 'all' : 'all'}_${new Date().toISOString().split('T')[0]}.xlsx`
		XLSX.writeFile(wb, fileName)

		toast({
			title: "Data Exported",
			description: `Successfully exported ${items.length} record${items.length > 1 ? 's' : ''} to Excel.`,
			className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
		})
	}

	// Import File
	const handleImportFile = () => {
		console.log('=== handleImportFile called ===')
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.xlsx,.xls,.csv'
		input.onchange = async (e) => {
			console.log('=== File selected ===')
			const file = (e.target as HTMLInputElement).files?.[0]
			if (!file) {
				console.log('No file selected')
				return
			}
			console.log('File:', file.name, file.size, 'bytes')

			try {
				let rows: any[] = []
				console.log('Starting file parsing...')

				if (file.name.endsWith('.csv')) {
					console.log('Parsing CSV file...')
					const text = await file.text()
					const lines = text.split('\n').filter(line => line.trim())
					if (lines.length < 2) {
						toast({
							title: "Invalid CSV File",
							description: "CSV file must have at least a header row and one data row",
							variant: "destructive",
						})
						return
					}

					const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
					rows = lines.slice(1).map(line => {
						const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
						const row: Record<string, string> = {}
						headers.forEach((header, index) => {
							row[header] = values[index] || ''
						})
						return row
					})
					console.log('CSV parsed, rows:', rows.length)
				} else {
					console.log('Parsing Excel file...')
					const arrayBuffer = await file.arrayBuffer()
					console.log('ArrayBuffer size:', arrayBuffer.byteLength)

					console.log('Calling XLSX.read (async)...')
					// XLSX.read is async in excel-compat - must await it
					const wb = await XLSX.read(arrayBuffer)
					console.log('XLSX.read completed, SheetNames:', wb.SheetNames)

					if (!wb.SheetNames || wb.SheetNames.length === 0) {
						toast({
							title: "Invalid Excel File",
							description: "The Excel file has no sheets. Please check the file.",
							variant: "destructive",
						})
						return
					}
					const ws = wb.Sheets[wb.SheetNames[0]]
					console.log('First sheet retrieved:', wb.SheetNames[0])

					if (!ws) {
						toast({
							title: "Invalid Excel File",
							description: "Could not read the first sheet. Please check the file.",
							variant: "destructive",
						})
						return
					}
					console.log('Converting sheet to JSON...')
					rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
					console.log('Excel parsed, rows:', rows.length)
					if (rows.length > 0) {
						console.log('First row keys:', Object.keys(rows[0]))
						console.log('First row:', rows[0])
					}
				}

				// Parse and validate based on lookup mode
				const previewData: ImportPreviewRow[] = rows.map((row, index) => {
					const errors: string[] = []

					// Parse institution code (required for both modes)
					const institutionCode = String(row['Institution Code *'] || row['Institution Code'] || row['institution_code'] || '').trim()

					// Parse fields based on lookup mode
					let dummyNumber = ''
					let registerNumber = ''
					let subjectCode = ''
					let courseCode = ''
					let sessionCode = ''
					let programCode = ''

					// Validate institution code is required
					if (!institutionCode) errors.push('Institution Code is required')

					if (lookupMode === 'register_number') {
						// Register Number mode - register_number + subject_code + session_code
						registerNumber = String(row['Register Number *'] || row['Register Number'] || row['register_number'] || '').trim()
						subjectCode = String(row['Subject Code *'] || row['Subject Code'] || row['subject_code'] || '').trim()
						sessionCode = String(row['Session Code *'] || row['Session Code'] || row['session_code'] || '').trim()
						courseCode = subjectCode // Subject code maps to course_code internally

						// Validate required fields for register_number mode
						if (!registerNumber) errors.push('Register Number is required')
						if (!subjectCode) errors.push('Subject Code is required')
						if (!sessionCode) errors.push('Session Code is required')
					} else {
						// Dummy Number mode (default)
						dummyNumber = String(row['Dummy Number *'] || row['Dummy Number'] || row['dummy_number'] || '').trim()
						courseCode = String(row['Course Code *'] || row['Course Code'] || row['course_code'] || '').trim()
						sessionCode = String(row['Session Code'] || row['session_code'] || '').trim()
						programCode = String(row['Program Code'] || row['program_code'] || '').trim()
						subjectCode = courseCode

						// Validate required fields for dummy_number mode
						if (!dummyNumber) errors.push('Dummy Number is required')
						if (!courseCode) errors.push('Course Code is required')
					}

					const totalMarksStr = String(row['Total Marks Obtained *'] || row['Total Marks Obtained'] || row['total_marks_obtained'] || '').trim()
					const totalMarks = parseFloat(totalMarksStr)

					const marksOutOfStr = String(row['Marks Out Of *'] || row['Marks Out Of'] || row['marks_out_of'] || '100').trim()
					const marksOutOf = parseFloat(marksOutOfStr)

					const remarks = String(row['Remarks'] || row['remarks'] || '').trim()

					// Validate marks - strict validation
					if (isNaN(totalMarks)) {
						errors.push('Total Marks Obtained must be a valid number')
					} else if (totalMarks < 0) {
						errors.push('Total Marks Obtained cannot be negative')
					} else if (totalMarks === 0) {
						errors.push('Total Marks Obtained cannot be 0 (zero marks not accepted)')
					}
					if (isNaN(marksOutOf) || marksOutOf <= 0) errors.push('Marks Out Of must be a positive number greater than 0')

					// Validate marks range
					if (!isNaN(totalMarks) && !isNaN(marksOutOf) && totalMarks > marksOutOf) {
						errors.push(`Total Marks (${totalMarks}) cannot exceed Marks Out Of (${marksOutOf})`)
					}

					return {
						row: index + 2,
						institution_code: institutionCode,
						dummy_number: dummyNumber,
						register_number: registerNumber,
						subject_code: subjectCode,
						course_code: courseCode,
						session_code: sessionCode,
						program_code: programCode,
						total_marks_obtained: isNaN(totalMarks) ? 0 : totalMarks,
						marks_out_of: isNaN(marksOutOf) ? 100 : marksOutOf,
						remarks,
						errors,
						isValid: errors.length === 0,
						lookup_mode: lookupMode
					}
				})

				console.log('Parsed previewData:', previewData.length, 'rows')
				console.log('Valid rows:', previewData.filter(r => r.isValid).length)
				console.log('First row:', previewData[0])

				setImportPreviewData(previewData)
				setPreviewDialogOpen(true)
				console.log('Preview dialog should be open now')

			} catch (error) {
				console.error('Import error:', error)
				toast({
					title: "Import Error",
					description: "Failed to parse the file. Please check the format.",
					variant: "destructive",
				})
			}
		}
		input.click()
	}

	// Upload Marks Handler - now uses institution_code from each Excel row
	const handleUploadMarks = async () => {
		console.log('=== handleUploadMarks called ===')
		console.log('importPreviewData:', importPreviewData.length, 'rows')
		console.log('lookupMode:', lookupMode)
		console.log('user?.id:', user?.id)

		const validRows = importPreviewData.filter(row => row.isValid)
		console.log('validRows:', validRows.length, 'rows')
		if (validRows.length > 0) {
			console.log('First valid row:', validRows[0])
		}

		if (validRows.length === 0) {
			toast({
				title: "No Valid Data",
				description: "No valid rows to upload. Please fix the errors and try again.",
				variant: "destructive",
			})
			return
		}

		setPreviewDialogOpen(false)

		// Show import progress modal (matches exam-registrations pattern)
		setImportInProgress(true)
		setImportProgress({ current: 0, total: validRows.length })

		console.log('Calling uploadMarks...')

		try {
			// Pass progress callback to update UI in real-time
			const result = await uploadMarks(validRows, user?.id, lookupMode, (current, total) => {
				setImportProgress({ current, total })
			})
			console.log('uploadMarks result:', result)

			// Update progress to 100% when complete
			setImportProgress({ current: validRows.length, total: validRows.length })

			// Hide import modal and show confirmation dialog
			setImportInProgress(false)
			setConfirmationDialogOpen(true)

			if (!result.success) {
				console.log('Upload failed with error:', result.error)
			}
		} catch (error) {
			console.error('handleUploadMarks error:', error)
			setImportInProgress(false)
			toast({
				title: "Upload Error",
				description: error instanceof Error ? error.message : 'Failed to upload marks',
				variant: "destructive",
			})
		}
	}

	// Bulk Delete Handler
	const handleBulkDelete = async () => {
		const totalSelected = selectedIds.size

		const result = await deleteSelected()
		setDeleteDialogOpen(false)

		if (result.success && result.result) {
			const { deleted, skipped } = result.result

			// Show error dialog if any were skipped
			if (skipped > 0) {
				setErrorDialogOpen(true)

				toast({
					title: skipped === totalSelected ? "Cannot Delete Records" : "Partial Delete",
					description: `Total: ${totalSelected} | Deleted: ${deleted} | Skipped: ${skipped}`,
					className: skipped === totalSelected
						? "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
						: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
					variant: skipped === totalSelected ? "destructive" : undefined,
					duration: 6000,
				})
			} else {
				toast({
					title: "Deleted Successfully",
					description: `Total: ${totalSelected} | Deleted: ${deleted} | Skipped: 0`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			}
		} else {
			toast({
				title: "Delete Failed",
				description: result.error || 'Failed to delete records',
				variant: "destructive",
				duration: 6000,
			})
		}
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb */}
					<div className="flex items-center gap-2">
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="/dashboard">Dashboard</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="#">Post Exam</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>External Marks Bulk Upload</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Scorecard Section */}
					<ExternalMarksScorecards
						items={items}
						selectedCount={selectedIds.size}
					/>

					{/* Main Card */}
					<Card className="flex-1 flex flex-col min-h-0">
						<CardHeader className="flex-shrink-0 p-3">
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center gap-2">
									<div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
										<Upload className="h-3 w-3 text-primary" />
									</div>
									<div>
										<h2 className="text-sm font-semibold">External Marks Bulk Upload</h2>
										<p className="text-xs text-muted-foreground">Import and manage external marks in bulk using dummy numbers or register numbers</p>
									</div>
								</div>
							</div>

							{/* Filters */}
							<ExternalMarksFilters
								institutions={institutions}
								sessions={sessions}
								programs={programs}
								courses={courses}
								selectedInstitution={selectedInstitution}
								selectedSession={selectedSession}
								selectedProgram={selectedProgram}
								selectedCourse={selectedCourse}
								statusFilter={statusFilter}
								searchTerm={searchTerm}
								lookupMode={lookupMode}
								mustSelectInstitution={mustSelectInstitution}
								onInstitutionChange={setSelectedInstitution}
								onSessionChange={setSelectedSession}
								onProgramChange={setSelectedProgram}
								onCourseChange={setSelectedCourse}
								onStatusChange={setStatusFilter}
								onSearchChange={setSearchTerm}
								onLookupModeChange={setLookupMode}
								onRefresh={refreshData}
								onDownloadTemplate={handleDownloadTemplate}
								onExportData={handleExportData}
								onImportFile={handleImportFile}
								onDeleteSelected={() => setDeleteDialogOpen(true)}
								loading={loading}
								itemsCount={items.length}
								selectedCount={selectedIds.size}
							/>
						</CardHeader>

						<CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
							{/* Table */}
							<ExternalMarksTable
								pageItems={pageItems}
								filtered={filtered}
								loading={loading}
								fetchError={fetchError}
								mustSelectInstitution={mustSelectInstitution}
								selectedIds={selectedIds}
								selectAll={selectAll}
								onSelectAll={handleSelectAll}
								onSelectItem={handleSelectItem}
								sortColumn={sortColumn}
								sortDirection={sortDirection}
								onSort={handleSort}
								currentPage={currentPage}
								totalPages={totalPages}
								itemsPerPage={itemsPerPage}
								startIndex={startIndex}
								endIndex={endIndex}
								onPageChange={setCurrentPage}
								onItemsPerPageChange={setItemsPerPage}
								onRetry={refreshData}
							/>
						</CardContent>
					</Card>
				</div>

				<AppFooter />
			</SidebarInset>

			{/* Dialogs */}
			<DeleteConfirmationDialog
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
				selectedCount={selectedIds.size}
				onConfirm={handleBulkDelete}
			/>

			<ImportPreviewDialog
				open={previewDialogOpen}
				onOpenChange={setPreviewDialogOpen}
				previewData={importPreviewData}
				loading={loading}
				onUpload={handleUploadMarks}
				lookupMode={lookupMode}
			/>

			<UploadErrorDialog
				open={errorDialogOpen}
				onOpenChange={setErrorDialogOpen}
				uploadSummary={uploadSummary}
				uploadErrors={uploadErrors}
			/>

			{/* Upload Confirmation Dialog */}
			<AlertDialog open={confirmationDialogOpen} onOpenChange={setConfirmationDialogOpen}>
				<AlertDialogContent className="max-w-md">
					<AlertDialogHeader>
						<div className="flex items-center gap-3">
							<div className={`h-12 w-12 rounded-full flex items-center justify-center ${
								uploadSummary.failed === 0
									? 'bg-green-100 dark:bg-green-900/20'
									: uploadSummary.success > 0
										? 'bg-yellow-100 dark:bg-yellow-900/20'
										: 'bg-red-100 dark:bg-red-900/20'
							}`}>
								{uploadSummary.failed === 0 ? (
									<CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
								) : uploadSummary.success > 0 ? (
									<AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
								) : (
									<XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
								)}
							</div>
							<div>
								<AlertDialogTitle className={`text-xl font-bold ${
									uploadSummary.failed === 0
										? 'text-green-600 dark:text-green-400'
										: uploadSummary.success > 0
											? 'text-yellow-600 dark:text-yellow-400'
											: 'text-red-600 dark:text-red-400'
								}`}>
									{uploadSummary.failed === 0
										? 'Upload Successful'
										: uploadSummary.success > 0
											? 'Partial Upload'
											: 'Upload Failed'}
								</AlertDialogTitle>
								<AlertDialogDescription className="text-sm text-muted-foreground mt-1">
									{uploadSummary.failed === 0
										? 'All records have been uploaded successfully'
										: uploadSummary.success > 0
											? 'Some records failed during upload'
											: 'All records failed during upload'}
								</AlertDialogDescription>
							</div>
						</div>
					</AlertDialogHeader>

					{/* Summary Cards */}
					<div className="grid grid-cols-2 gap-3 py-4">
						<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
							<div className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">Total Records</div>
							<div className="text-3xl font-bold text-blue-700 dark:text-blue-300">{uploadSummary.total}</div>
						</div>
						<div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
							<div className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">Successful</div>
							<div className="text-3xl font-bold text-green-700 dark:text-green-300">{uploadSummary.success}</div>
						</div>
						<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
							<div className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Failed</div>
							<div className="text-3xl font-bold text-red-700 dark:text-red-300">{uploadSummary.failed}</div>
						</div>
						<div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
							<div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium mb-1">Skipped</div>
							<div className="text-3xl font-bold text-yellow-700 dark:text-yellow-300">{uploadSummary.skipped}</div>
						</div>
					</div>

					<AlertDialogFooter className="flex-row gap-2">
						{uploadSummary.failed > 0 && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setConfirmationDialogOpen(false)
									setErrorDialogOpen(true)
								}}
								className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-300 dark:border-red-800"
							>
								<XCircle className="h-4 w-4 mr-2" />
								View Errors
							</Button>
						)}
						<div className="flex-1" />
						<AlertDialogAction
							onClick={() => setConfirmationDialogOpen(false)}
							className="bg-slate-900 hover:bg-slate-800 text-white px-6"
						>
							Close
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Import Loading Overlay - matches exam-registrations pattern */}
			{importInProgress && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
					<div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4">
						<div className="flex flex-col items-center gap-4">
							<div className="relative">
								<Loader2 className="h-12 w-12 animate-spin text-blue-600" />
							</div>
							<div className="text-center">
								<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
									Importing External Marks
								</h3>
								<p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
									Please wait while the data is being processed...
								</p>
							</div>
							{importProgress.total > 0 && (
								<div className="w-full space-y-2">
									<div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
										<span>Progress</span>
										<span>{importProgress.current} / {importProgress.total}</span>
									</div>
									<div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
										<div
											className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
											style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
										/>
									</div>
									<p className="text-xs text-center text-slate-500 dark:text-slate-400">
										{Math.round((importProgress.current / importProgress.total) * 100)}% complete
									</p>
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</SidebarProvider>
	)
}
