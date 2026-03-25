"use client"


import { useState, useEffect, useCallback } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import {
	Loader2,
	ClipboardCheck,
	RefreshCw,
	Upload,
	Download,
	FileSpreadsheet,
	Trash2,
	XCircle,
	AlertTriangle,
	CheckCircle,
	Users,
	Building2,
	Calendar,
	Search,
} from "lucide-react"
import Link from "next/link"
import XLSX from "@/lib/utils/excel-compat"

// Institution filter hook
import { useInstitutionFilter } from "@/hooks/use-institution-filter"

// Types
interface Institution {
	id: string
	name: string
	institution_code: string
	myjkkn_institution_ids: string[] | null
}


interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
}

interface AttendanceRecord {
	id: string
	institutions_id: string
	examination_session_id: string
	exam_registration_id: string
	student_id: string
	program_code: string
	course_id: string
	attendance_status: string
	entry_time: string | null
	verified_by: string | null
	identity_verified: boolean
	remarks: string | null
	attempt_number: number
	is_regular: boolean
	created_at: string
	status: boolean
	// Joined fields
	student_name: string
	register_number: string
	course_code: string
	course_name: string
	session_name: string
	session_code: string
	institution_code: string
	institution_name: string
}

interface ImportError {
	row: number
	register_number: string
	course_code: string
	errors: string[]
	original_data?: Record<string, string> // Store original row data for download
}

interface UploadSummary {
	total: number
	success: number
	failed: number
	skipped?: number
}

export default function ExamAttendanceBulkPage() {
	const { toast } = useToast()
	const { user } = useAuth()

	// Institution filter hook
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	// State 
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
	const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([])

	// Filters
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const [filterInstitutionId, setFilterInstitutionId] = useState<string>("all") // For super_admin client-side filtering
	const [selectedSessionId, setSelectedSessionId] = useState<string>("")
	const [searchQuery, setSearchQuery] = useState("")
	const [statusFilter, setStatusFilter] = useState("all")

	// UI state
	const [loading, setLoading] = useState(false)
	const [selectedIds, setSelectedIds] = useState<string[]>([])

	// Import state
	const [importInProgress, setImportInProgress] = useState(false)
	const [importProgress, setImportProgress] = useState({ current: 0, total: 0, success: 0, failed: 0, skipped: 0 })
	const [importPhase, setImportPhase] = useState<'preparing' | 'uploading' | 'complete'>('preparing')
	const [errorPopupOpen, setErrorPopupOpen] = useState(false)
	const [importErrors, setImportErrors] = useState<ImportError[]>([])
	const [uploadSummary, setUploadSummary] = useState<UploadSummary>({ total: 0, success: 0, failed: 0 })

	// Delete confirmation
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

	// Fetch institutions
	const fetchInstitutions = useCallback(async () => {
		try {
			const url = appendToUrl("/api/post-exam/exam-attendance-bulk?action=institutions")
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
			}
		} catch (error) {
			console.error("Error fetching institutions:", error)
		}
	}, [appendToUrl])

	// Fetch sessions for selected institution
	const fetchSessions = useCallback(async (institutionId: string) => {
		try {
			const res = await fetch(
				`/api/post-exam/exam-attendance-bulk?action=sessions&institutionId=${institutionId}`
			)
			if (res.ok) {
				const data = await res.json()
				setSessions(data)
			}
		} catch (error) {
			console.error("Error fetching sessions:", error)
		}
	}, [])

	// Fetch attendance records
	const fetchAttendanceRecords = useCallback(async (instId?: string) => {
		try {
			setLoading(true)
			let url = "/api/post-exam/exam-attendance-bulk?action=attendance"

			// For normal users, use their institution; for super_admin, use selected or none (all)
			const institutionIdToUse = instId || selectedInstitutionId
			if (institutionIdToUse) {
				url += `&institutionId=${institutionIdToUse}`
			}
			if (selectedSessionId && selectedSessionId !== "all") {
				url += `&sessionId=${selectedSessionId}`
			}

			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setAttendanceRecords(data)
				setFilteredRecords(data)
			}
		} catch (error) {
			console.error("Error fetching attendance records:", error)
		} finally {
			setLoading(false)
		}
	}, [selectedInstitutionId, selectedSessionId])

	// Load institutions when context is ready
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
		}
	}, [isReady, fetchInstitutions])

	// Auto-select institution for normal users and fetch attendance
	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && institutions.length > 0) {
			// Normal user: auto-select their institution and fetch their data
			const exists = institutions.some((inst) => inst.id === contextInstitutionId)
			if (exists && !selectedInstitutionId) {
				setSelectedInstitutionId(contextInstitutionId)
				fetchAttendanceRecords(contextInstitutionId)
			}
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId, institutions, fetchAttendanceRecords])

	// For super_admin: fetch all attendance records on initial load
	useEffect(() => {
		if (isReady && mustSelectInstitution && institutions.length > 0 && attendanceRecords.length === 0) {
			// Super admin: fetch all institutions' attendance records initially
			fetchAttendanceRecords()
		}
	}, [isReady, mustSelectInstitution, institutions, attendanceRecords.length, fetchAttendanceRecords])

	// Fetch sessions when institution changes (for session filter)
	useEffect(() => {
		if (selectedInstitutionId) {
			// Normal user: fetch sessions for their institution
			fetchSessions(selectedInstitutionId)
		} else if (mustSelectInstitution && filterInstitutionId && filterInstitutionId !== "all") {
			// Super admin: fetch sessions for filtered institution
			fetchSessions(filterInstitutionId)
		} else {
			// Clear sessions when no institution selected
			setSessions([])
		}
	}, [selectedInstitutionId, mustSelectInstitution, filterInstitutionId, fetchSessions])

	// Fetch attendance records when session filter changes
	useEffect(() => {
		if (isReady && (selectedInstitutionId || mustSelectInstitution)) {
			fetchAttendanceRecords()
		}
	}, [selectedSessionId])

	// Apply search, status, and institution filter
	useEffect(() => {
		let filtered = [...attendanceRecords]

		// Apply institution filter (for super_admin client-side filtering)
		if (mustSelectInstitution && filterInstitutionId && filterInstitutionId !== "all") {
			filtered = filtered.filter((record) => record.institutions_id === filterInstitutionId)
		}

		// Apply search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase()
			filtered = filtered.filter(
				(record) =>
					record.register_number?.toLowerCase().includes(query) ||
					record.student_name?.toLowerCase().includes(query) ||
					record.course_code?.toLowerCase().includes(query) ||
					record.institution_code?.toLowerCase().includes(query)
			)
		}

		// Apply status filter
		if (statusFilter !== "all") {
			filtered = filtered.filter((record) => record.attendance_status === statusFilter)
		}

		setFilteredRecords(filtered)
	}, [attendanceRecords, searchQuery, statusFilter, filterInstitutionId, mustSelectInstitution])

	// Handle select all
	const handleSelectAll = (checked: boolean) => {
		if (checked) {
			setSelectedIds(filteredRecords.map((r) => r.id))
		} else {
			setSelectedIds([])
		}
	}

	// Handle individual select
	const handleSelect = (id: string, checked: boolean) => {
		if (checked) {
			setSelectedIds((prev) => [...prev, id])
		} else {
			setSelectedIds((prev) => prev.filter((i) => i !== id))
		}
	}

	// Handle template export
	const handleTemplateExport = async () => {
		const wb = XLSX.utils.book_new()

		// Template sheet with sample row (Institution Code removed - uses global filter)
		const sample = [
			{
				"Session Code *": "",
				"Register Number *": "",
				"Course Code *": "",
				"Attendance Status *": "Present",
				"Entry Time": "",
				"Identity Verified": "No",
				"Remarks": "",
			},
		]

		const ws = XLSX.utils.json_to_sheet(sample)

		// Set column widths (Institution Code removed)
		const colWidths = [
			{ wch: 20 }, // Session Code
			{ wch: 25 }, // Register Number
			{ wch: 20 }, // Course Code
			{ wch: 20 }, // Attendance Status
			{ wch: 15 }, // Entry Time
			{ wch: 18 }, // Identity Verified
			{ wch: 30 }, // Remarks
		]
		ws["!cols"] = colWidths

		// Add data validations
		const validations: any[] = []

		// Session Code dropdown (Column A now)
		const sessionCodes = sessions.map((s) => s.session_code).filter(Boolean)
		if (sessionCodes.length > 0) {
			validations.push({
				type: "list",
				sqref: "A2:A1000",
				formula1: `"${sessionCodes.join(",")}"`,
				showDropDown: true,
				showErrorMessage: true,
				errorTitle: "Invalid Session",
				error: "Please select from the dropdown list",
			})
		}

		// Attendance Status dropdown (Column D now)
		validations.push({
			type: "list",
			sqref: "D2:D1000",
			formula1: '"Present,Absent"',
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: "Invalid Status",
			error: "Select: Present or Absent",
		})

		// Identity Verified dropdown (Column F now)
		validations.push({
			type: "list",
			sqref: "F2:F1000",
			formula1: '"Yes,No"',
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: "Invalid Value",
			error: "Select: Yes or No",
		})

		ws["!dataValidation"] = validations
		XLSX.utils.book_append_sheet(wb, ws, "Template")

		// Reference Codes sheet (Institution Code removed - uses global filter)
		const referenceData: any[] = []

		// Session codes section
		referenceData.push({ Type: "=== SESSION CODES ===", Code: "", Description: "" })
		sessions.forEach((session) => {
			referenceData.push({
				Type: "Session",
				Code: session.session_code,
				Description: session.session_name,
			})
		})

		// Status values section
		referenceData.push({ Type: "=== ATTENDANCE STATUS ===", Code: "", Description: "" })
		;["Present", "Absent"].forEach((status) => {
			referenceData.push({
				Type: "Status",
				Code: status,
				Description: status === "Present" ? "Learner attended exam" : "Learner did not attend",
			})
		})

		const wsRef = XLSX.utils.json_to_sheet(referenceData)
		wsRef["!cols"] = [{ wch: 25 }, { wch: 20 }, { wch: 40 }]
		XLSX.utils.book_append_sheet(wb, wsRef, "Reference Codes")

		await XLSX.writeFile(wb, `exam_attendance_template_${new Date().toISOString().split("T")[0]}.xlsx`)

		toast({
			title: "✅ Template Downloaded",
			description: "Excel template has been downloaded with dropdowns and reference codes.",
			className: "bg-green-50 border-green-200 text-green-800",
		})
	}

	// Handle export
	const handleExport = async () => {
		if (filteredRecords.length === 0) {
			toast({
				title: "No Data",
				description: "No records to export.",
				variant: "destructive",
			})
			return
		}

		const excelData = filteredRecords.map((r) => ({
			"Institution Code": r.institution_code,
			"Session Code": r.session_code,
			"Register Number": r.register_number,
			"Student Name": r.student_name,
			"Course Code": r.course_code,
			"Course Name": r.course_name,
			Program: r.program_code,
			"Attendance Status": r.attendance_status,
			"Entry Time": r.entry_time || "",
			"Identity Verified": r.identity_verified ? "Yes" : "No",
			"Is Regular": r.is_regular ? "Yes" : "No",
			Attempt: r.attempt_number,
			Remarks: r.remarks || "",
			"Created At": new Date(r.created_at).toISOString().split("T")[0],
		}))

		const ws = XLSX.utils.json_to_sheet(excelData)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, "Attendance")
		await XLSX.writeFile(wb, `exam_attendance_export_${new Date().toISOString().split("T")[0]}.xlsx`)

		toast({
			title: "✅ Export Complete",
			description: `Exported ${filteredRecords.length} attendance records.`,
			className: "bg-green-50 border-green-200 text-green-800",
		})
	}

	// Handle import with batch processing for large files
	const handleImport = () => {
		const input = document.createElement("input")
		input.type = "file"
		input.accept = ".xlsx,.xls,.csv"
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (!file) return

			try {
				setImportInProgress(true)
				setImportPhase('preparing')
				setImportProgress({ current: 0, total: 0, success: 0, failed: 0, skipped: 0 })

				let rows: Record<string, unknown>[] = []

				if (file.name.endsWith(".csv")) {
					const text = await file.text()
					const lines = text.split("\n").filter((line) => line.trim())
					if (lines.length < 2) {
						toast({
							title: "Invalid CSV File",
							description: "CSV must have header row and at least one data row",
							variant: "destructive",
						})
						setImportInProgress(false)
						return
					}

					const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""))
					rows = lines.slice(1).map((line) => {
						const values = line.split(",").map((v) => v.trim().replace(/"/g, ""))
						const row: Record<string, string> = {}
						headers.forEach((header, index) => {
							row[header] = values[index] || ""
						})
						return row
					})
				} else {
					const data = new Uint8Array(await file.arrayBuffer())
					const wb = await XLSX.read(data, { type: "array" })
					const ws = wb.Sheets[wb.SheetNames[0]]
					rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
				}

				if (rows.length === 0) {
					toast({
						title: "No Data",
						description: "No data found in the file.",
						variant: "destructive",
					})
					setImportInProgress(false)
					return
				}

				// Map rows to API format (institution_code removed - uses global filter)
				const mapped = rows.map((r) => ({
					session_code: String(r["Session Code *"] || r["Session Code"] || r["session_code"] || ""),
					register_number: String(r["Register Number *"] || r["Register Number"] || r["register_number"] || ""),
					course_code: String(r["Course Code *"] || r["Course Code"] || r["course_code"] || ""),
					attendance_status: String(r["Attendance Status *"] || r["Attendance Status"] || r["attendance_status"] || "Present"),
					entry_time: String(r["Entry Time"] || r["entry_time"] || ""),
					identity_verified: String(r["Identity Verified"] || r["identity_verified"] || "No"),
					remarks: String(r["Remarks"] || r["remarks"] || ""),
				}))

				setImportProgress({ current: 0, total: mapped.length, success: 0, failed: 0, skipped: 0 })

				// Use global institution filter - determine institution ID for upload
				const uploadInstitutionId = selectedInstitutionId || contextInstitutionId

				if (!uploadInstitutionId) {
					toast({
						title: "Institution Required",
						description: "Please select an institution before uploading attendance data.",
						variant: "destructive",
					})
					setImportInProgress(false)
					return
				}

				// Step 1: Prepare batch upload - fetch lookup data for the selected institution
				const prepareResponse = await fetch("/api/post-exam/exam-attendance-bulk", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "prepare-batch-upload",
						institutions_id: uploadInstitutionId, // Use global filter instead of Excel institution codes
					}),
				})

				const prepareResult = await prepareResponse.json()

				if (!prepareResponse.ok) {
					toast({
						title: "Preparation Failed",
						description: prepareResult.error || "Failed to prepare import.",
						variant: "destructive",
					})
					setImportInProgress(false)
					return
				}

				// Extract cache_id (lookup data is now cached server-side to avoid 10MB request limit)
				const { cache_id, stats } = prepareResult

				console.log('=== DEBUG: Batch Upload Prepared ===')
				console.log('Cache ID:', cache_id)
				console.log('Stats:', stats)

				// Step 2: Process in batches
				setImportPhase('uploading')
				const BATCH_SIZE = 50 // Process 50 records at a time
				const totalBatches = Math.ceil(mapped.length / BATCH_SIZE)

				let totalSuccess = 0
				let totalFailed = 0
				let totalSkipped = 0
				const allErrors: ImportError[] = []

				for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
					const startIdx = batchIndex * BATCH_SIZE
					const endIdx = Math.min(startIdx + BATCH_SIZE, mapped.length)
					const batchData = mapped.slice(startIdx, endIdx)

					const batchResponse = await fetch("/api/post-exam/exam-attendance-bulk", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							action: "process-batch",
							batch_data: batchData,
							uploaded_by: user?.email || "unknown",
							cache_id: cache_id, // Use server-side cache instead of sending large lookup data
							batch_start_index: startIdx,
						}),
					})

					const batchResult = await batchResponse.json()

					if (batchResponse.ok) {
						totalSuccess += batchResult.successful || 0
						totalFailed += batchResult.failed || 0
						totalSkipped += batchResult.skipped || 0

						// Collect errors with original data
						const batchErrors = [...(batchResult.validation_errors || []), ...(batchResult.errors || [])]
						allErrors.push(...batchErrors)
						// Note: Server-side cache is automatically updated to prevent duplicates
					} else {
						// If batch fails entirely, mark all as failed
						totalFailed += batchData.length
						batchData.forEach((row, idx) => {
							allErrors.push({
								row: startIdx + idx + 2,
								register_number: row.register_number || 'N/A',
								course_code: row.course_code || 'N/A',
								errors: [batchResult.error || 'Batch processing failed'],
								original_data: row
							})
						})
					}

					// Update progress
					setImportProgress({
						current: endIdx,
						total: mapped.length,
						success: totalSuccess,
						failed: totalFailed,
						skipped: totalSkipped,
					})
				}

				// Step 3: Complete
				setImportPhase('complete')
				setImportInProgress(false)

				// Update summary
				setUploadSummary({
					total: mapped.length,
					success: totalSuccess,
					failed: totalFailed,
					skipped: totalSkipped,
				})

				// Show errors if any
				if (allErrors.length > 0) {
					setImportErrors(allErrors)
					setErrorPopupOpen(true)
				}

				// Show toast
				if (totalSuccess > 0 && totalFailed === 0 && totalSkipped === 0) {
					toast({
						title: "✅ Upload Complete",
						description: `Successfully uploaded ${totalSuccess} attendance record${totalSuccess > 1 ? "s" : ""}.`,
						className: "bg-green-50 border-green-200 text-green-800",
					})
				} else if (totalSuccess > 0) {
					toast({
						title: "⚠️ Partial Upload",
						description: `${totalSuccess} successful, ${totalFailed} failed, ${totalSkipped} skipped.`,
						className: "bg-yellow-50 border-yellow-200 text-yellow-800",
					})
				} else {
					toast({
						title: "❌ Upload Failed",
						description: "No records were uploaded. View details.",
						variant: "destructive",
					})
				}

				// Refresh data
				fetchAttendanceRecords()
			} catch (err) {
				console.error("Import error:", err)
				setImportInProgress(false)
				toast({
					title: "❌ Import Error",
					description: "Import failed. Please check your file format.",
					variant: "destructive",
				})
			}
		}
		input.click()
	}

	// Handle download failed rows - same format as upload template with error column added
	const handleDownloadFailedRows = async () => {
		if (importErrors.length === 0) return

		// Determine status based on error message
		const getErrorStatus = (errors: string[]) => {
			const errorStr = errors.join(' ').toLowerCase()
			if (errorStr.includes('skipped') || errorStr.includes('already exists') || errorStr.includes('duplicate')) {
				return 'Skipped'
			}
			return 'Failed'
		}

		const failedData = importErrors.map((err) => ({
			// Same format as upload template (Institution Code removed - uses global filter)
			"Session Code *": err.original_data?.session_code || "",
			"Register Number *": err.original_data?.register_number || err.register_number || "",
			"Course Code *": err.original_data?.course_code || err.course_code || "",
			"Attendance Status *": err.original_data?.attendance_status || "Present",
			"Entry Time": err.original_data?.entry_time || "",
			"Identity Verified": err.original_data?.identity_verified || "No",
			"Remarks": err.original_data?.remarks || "",
			// Error columns added at end
			"Status": getErrorStatus(err.errors),
			"Error Message": err.errors.join("; "),
			"Original Row #": err.row,
		}))

		const ws = XLSX.utils.json_to_sheet(failedData)

		// Set column widths (Institution Code removed)
		ws["!cols"] = [
			{ wch: 20 }, // Session Code
			{ wch: 25 }, // Register Number
			{ wch: 20 }, // Course Code
			{ wch: 20 }, // Attendance Status
			{ wch: 15 }, // Entry Time
			{ wch: 18 }, // Identity Verified
			{ wch: 30 }, // Remarks
			{ wch: 12 }, // Status
			{ wch: 70 }, // Error Message
			{ wch: 14 }, // Original Row #
		]

		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, "Failed Rows")

		// Count failed vs skipped
		const failedCount = failedData.filter(d => d.Status === 'Failed').length
		const skippedCount = failedData.filter(d => d.Status === 'Skipped').length

		await XLSX.writeFile(wb, `exam_attendance_errors_${new Date().toISOString().split("T")[0]}.xlsx`)

		toast({
			title: "✅ Downloaded",
			description: `Downloaded ${failedCount} failed and ${skippedCount} skipped row(s) with error details.`,
			className: "bg-green-50 border-green-200 text-green-800",
		})
	}

	// Handle bulk delete
	const handleBulkDelete = async () => {
		if (selectedIds.length === 0) return

		try {
			setLoading(true)
			const response = await fetch("/api/post-exam/exam-attendance-bulk", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "bulk-delete",
					ids: selectedIds,
				}),
			})

			const result = await response.json()

			if (!response.ok) {
				toast({
					title: "Delete Failed",
					description: result.error || "Failed to delete records.",
					variant: "destructive",
				})
				return
			}

			toast({
				title: "✅ Deleted",
				description: result.message,
				className: "bg-green-50 border-green-200 text-green-800",
			})

			setSelectedIds([])
			fetchAttendanceRecords()
		} catch (error) {
			console.error("Delete error:", error)
			toast({
				title: "Delete Error",
				description: "Failed to delete records.",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
			setDeleteDialogOpen(false)
		}
	}

	// Stats
	const presentCount = filteredRecords.filter((r) => r.attendance_status === "Present").length
	const absentCount = filteredRecords.filter((r) => r.attendance_status === "Absent").length

	return (
		<SidebarProvider>
			{/* Import Loading Modal - Full Screen Overlay with Centered Card */}
			{importInProgress && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
					<div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl max-w-lg w-full mx-4">
						<div className="flex flex-col items-center gap-5">
							{/* Large Spinning Loader */}
							<div className="relative">
								<Loader2 className="h-14 w-14 text-blue-600 animate-spin" />
							</div>

							{/* Title and Description */}
							<div className="text-center">
								<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
									Importing Exam Attendance
								</h3>
								<p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
									{importPhase === 'preparing'
										? 'Preparing data and validating records...'
										: 'Processing records in batches...'}
								</p>
							</div>

							{/* Progress Bar with Counter */}
							{importProgress.total > 0 && (
								<div className="w-full space-y-3">
									{/* Progress Numbers */}
									<div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
										<span>Progress</span>
										<span className="font-medium">
											{importProgress.current} / {importProgress.total}
										</span>
									</div>

									{/* Progress Bar */}
									<div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
										<div
											className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
											style={{
												width: `${(importProgress.current / importProgress.total) * 100}%`,
											}}
										/>
									</div>

									{/* Percentage */}
									<p className="text-lg font-bold text-center text-blue-600 dark:text-blue-400">
										{Math.round((importProgress.current / importProgress.total) * 100)}% complete
									</p>

									{/* Live Stats */}
									{importPhase === 'uploading' && (
										<div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
											<div className="text-center">
												<div className="flex items-center justify-center gap-1.5">
													<CheckCircle className="h-4 w-4 text-green-500" />
													<span className="text-lg font-bold text-green-600 dark:text-green-400">
														{importProgress.success}
													</span>
												</div>
												<p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Success</p>
											</div>
											<div className="text-center">
												<div className="flex items-center justify-center gap-1.5">
													<XCircle className="h-4 w-4 text-red-500" />
													<span className="text-lg font-bold text-red-600 dark:text-red-400">
														{importProgress.failed}
													</span>
												</div>
												<p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Failed</p>
											</div>
											<div className="text-center">
												<div className="flex items-center justify-center gap-1.5">
													<AlertTriangle className="h-4 w-4 text-yellow-500" />
													<span className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
														{importProgress.skipped}
													</span>
												</div>
												<p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Skipped</p>
											</div>
										</div>
									)}
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/dashboard">Dashboard</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Exam Attendance Bulk Upload</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Stats Cards */}
					<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
									</div>
									<div>
										<p className="text-sm text-muted-foreground">Total Records</p>
										<p className="text-2xl font-bold">{filteredRecords.length}</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
										<CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
									</div>
									<div>
										<p className="text-sm text-muted-foreground">Present</p>
										<p className="text-2xl font-bold text-green-600">{presentCount}</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
										<XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
									</div>
									<div>
										<p className="text-sm text-muted-foreground">Absent</p>
										<p className="text-2xl font-bold text-red-600">{absentCount}</p>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
										<ClipboardCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
									</div>
									<div>
										<p className="text-sm text-muted-foreground">Selected</p>
										<p className="text-2xl font-bold">{selectedIds.length}</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Filters and Actions */}
					<Card>
						<CardContent className="p-4">
							<div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
								{/* Filters */}
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
									{/* Session Filter */}
									<div className="space-y-1">
										<Label className="text-xs">Examination Session</Label>
										<Select
											value={selectedSessionId}
											onValueChange={setSelectedSessionId}
										>
											<SelectTrigger className="h-9">
												<SelectValue placeholder="All sessions" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Sessions</SelectItem>
												{sessions.map((session) => (
													<SelectItem key={session.id} value={session.id}>
														{session.session_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Status Filter */}
									<div className="space-y-1">
										<Label className="text-xs">Status</Label>
										<Select value={statusFilter} onValueChange={setStatusFilter}>
											<SelectTrigger className="h-9">
												<SelectValue placeholder="All statuses" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Statuses</SelectItem>
												<SelectItem value="Present">Present</SelectItem>
												<SelectItem value="Absent">Absent</SelectItem>
											</SelectContent>
										</Select>
									</div>

									{/* Search */}
									<div className="space-y-1">
										<Label className="text-xs">Search</Label>
										<div className="relative">
											<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
											<Input
												placeholder="Register No, Name, Course..."
												value={searchQuery}
												onChange={(e) => setSearchQuery(e.target.value)}
												className="h-9 pl-8"
											/>
										</div>
									</div>
								</div>

								{/* Actions */}
								<div className="flex gap-2 flex-wrap">
									<Button
										variant="outline"
										size="sm"
										onClick={fetchAttendanceRecords}
										disabled={loading}
									>
										<RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
										Refresh
									</Button>
									<Button variant="outline" size="sm" onClick={handleTemplateExport}>
										<FileSpreadsheet className="h-4 w-4 mr-1" />
										Template
									</Button>
									<Button variant="outline" size="sm" onClick={handleExport}>
										<Download className="h-4 w-4 mr-1" />
										Export
									</Button>
									<Button variant="outline" size="sm" onClick={handleImport}>
										<Upload className="h-4 w-4 mr-1" />
										Upload
									</Button>
									{selectedIds.length > 0 && (
										<Button
											variant="destructive"
											size="sm"
											onClick={() => setDeleteDialogOpen(true)}
										>
											<Trash2 className="h-4 w-4 mr-1" />
											Delete ({selectedIds.length})
										</Button>
									)}
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Data Table */}
					<Card>
						<CardHeader className="py-3">
							<CardTitle className="text-sm font-medium">
								Attendance Records
								{filteredRecords.length !== attendanceRecords.length && (
									<span className="ml-2 text-muted-foreground">
										(Showing {filteredRecords.length} of {attendanceRecords.length})
									</span>
								)}
							</CardTitle>
						</CardHeader>
						<CardContent className="p-0">
							<div className="border rounded-lg overflow-hidden">
								<div className="max-h-[500px] overflow-auto">
									<Table>
										<TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-900/50 z-10">
											<TableRow>
												<TableHead className="w-12">
													<Checkbox
														checked={
															filteredRecords.length > 0 &&
															selectedIds.length === filteredRecords.length
														}
														onCheckedChange={handleSelectAll}
													/>
												</TableHead>
												<TableHead className="text-xs">S.No</TableHead>
												{mustSelectInstitution && (
													<TableHead className="text-xs">Institution</TableHead>
												)}
												<TableHead className="text-xs">Session</TableHead>
												<TableHead className="text-xs">Register No</TableHead>
												<TableHead className="text-xs">Student Name</TableHead>
												<TableHead className="text-xs">Course</TableHead>
												<TableHead className="text-xs">Program</TableHead>
												<TableHead className="text-xs text-center">Status</TableHead>
												<TableHead className="text-xs">Entry Time</TableHead>
												<TableHead className="text-xs">Remarks</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{filteredRecords.length === 0 ? (
												<TableRow>
													<TableCell
														colSpan={mustSelectInstitution ? 11 : 10}
														className="text-center py-8 text-muted-foreground"
													>
														{loading
															? "Loading..."
															: "No attendance records found. Use Upload to import data."}
													</TableCell>
												</TableRow>
											) : (
												filteredRecords.map((record, index) => (
													<TableRow key={`${record.id}-${index}`}>
														<TableCell>
															<Checkbox
																checked={selectedIds.includes(record.id)}
																onCheckedChange={(checked) =>
																	handleSelect(record.id, checked as boolean)
																}
															/>
														</TableCell>
														<TableCell className="text-xs">{index + 1}</TableCell>
														{mustSelectInstitution && (
															<TableCell className="text-xs font-medium">
																{record.institution_code}
															</TableCell>
														)}
														<TableCell className="text-xs">
															{record.session_code}
														</TableCell>
														<TableCell className="text-xs font-mono">
															{record.register_number}
														</TableCell>
														<TableCell className="text-xs">
															{record.student_name}
														</TableCell>
														<TableCell className="text-xs">
															{record.course_code}
														</TableCell>
														<TableCell className="text-xs">
															{record.program_code}
														</TableCell>
														<TableCell className="text-center">
															<Badge
																className={`text-xs ${
																	record.attendance_status === "Present"
																		? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
																		: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
																}`}
															>
																{record.attendance_status}
															</Badge>
														</TableCell>
														<TableCell className="text-xs">
															{record.entry_time || "-"}
														</TableCell>
														<TableCell className="text-xs max-w-[150px] truncate">
															{record.remarks || "-"}
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				<AppFooter />
			</SidebarInset>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-red-600" />
							Confirm Deletion
						</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete {selectedIds.length} attendance record
							{selectedIds.length > 1 ? "s" : ""}? This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleBulkDelete}
							className="bg-red-600 hover:bg-red-700"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Error Dialog */}
			<AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
				<AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
					<AlertDialogHeader>
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
								<XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
							</div>
							<div>
								<AlertDialogTitle className="text-xl font-bold text-red-600 dark:text-red-400">
									Import Results
								</AlertDialogTitle>
								<AlertDialogDescription className="text-sm text-muted-foreground mt-1">
									Review the import results below
								</AlertDialogDescription>
							</div>
						</div>
					</AlertDialogHeader>

					<div className="space-y-4">
						{/* Upload Summary Cards */}
						{uploadSummary.total > 0 && (
							<div className="grid grid-cols-4 gap-3">
								<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
									<div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
										Total Rows
									</div>
									<div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
										{uploadSummary.total}
									</div>
								</div>
								<div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
									<div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">
										Successful
									</div>
									<div className="text-2xl font-bold text-green-700 dark:text-green-300">
										{uploadSummary.success}
									</div>
								</div>
								<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
									<div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">
										Failed
									</div>
									<div className="text-2xl font-bold text-red-700 dark:text-red-300">
										{uploadSummary.failed}
									</div>
								</div>
								<div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
									<div className="text-xs text-yellow-600 dark:text-yellow-400 font-medium mb-1">
										Skipped
									</div>
									<div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
										{uploadSummary.skipped || 0}
									</div>
								</div>
							</div>
						)}

						{/* Error List */}
						{importErrors.length > 0 && (
							<>
								<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
									<div className="flex items-center justify-between mb-2">
										<div className="flex items-center gap-2">
											<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
											<span className="font-semibold text-red-800 dark:text-red-200">
												{importErrors.length} row{importErrors.length > 1 ? "s" : ""} had issues
											</span>
										</div>
										<Button
											variant="outline"
											size="sm"
											onClick={handleDownloadFailedRows}
											className="text-red-700 border-red-300 hover:bg-red-100"
										>
											<Download className="h-4 w-4 mr-1" />
											Download Failed Rows
										</Button>
									</div>
									<p className="text-sm text-red-700 dark:text-red-300">
										Download failed rows with error reference column, fix and re-upload.
									</p>
								</div>

								<div className="space-y-3 max-h-[300px] overflow-y-auto">
									{importErrors.map((error, index) => (
										<div
											key={index}
											className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/5"
										>
											<div className="flex items-start justify-between mb-2">
												<div className="flex items-center gap-2">
													<Badge
														variant="outline"
														className="text-xs bg-red-100 text-red-800 border-red-300"
													>
														Row {error.row}
													</Badge>
													<span className="font-medium text-sm">
														{error.register_number} - {error.course_code}
													</span>
												</div>
											</div>

											<div className="space-y-1">
												{error.errors.map((err, errIndex) => (
													<div key={errIndex} className="flex items-start gap-2 text-sm">
														<XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
														<span className="text-red-700 dark:text-red-300">{err}</span>
													</div>
												))}
											</div>
										</div>
									))}
								</div>
							</>
						)}

						{/* Common Fixes */}
						<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
							<h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">
								Common Fixes:
							</h4>
							<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
								<li>
									Ensure institution_code, session_code, register_number, and course_code are
									correct
								</li>
								<li>Check that the student is registered for the exam in the given session</li>
								<li>Attendance Status: Present or Absent</li>
								<li>Entry Time: HH:MM format (optional)</li>
							</ul>
						</div>
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel>Close</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
