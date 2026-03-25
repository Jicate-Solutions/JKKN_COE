"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import XLSX from "@/lib/utils/excel-compat"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/common/use-toast"
import { Textarea } from "@/components/ui/textarea"
import Link from "next/link"
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, FileText, TrendingUp, FileSpreadsheet, RefreshCw, CheckCircle, XCircle, AlertTriangle, MoreHorizontal } from "lucide-react"

interface ExamType {
	id: string
	institutions_id: string
	examination_code: string
	examination_name: string
	grade_system_code: string | null
	regulation_id: string | null
	description: string | null
	exam_type: 'quizzes' | 'online' | 'offline'
	is_coe: boolean
	is_active: boolean
	created_at: string
	updated_at: string
}

interface Regulation {
	id: string
	regulation_code: string
	regulation_name: string
}

export default function ExamTypesPage() {
	const { toast } = useToast()
	const { fetchRegulations: fetchMyJKKNRegulations } = useMyJKKNInstitutionFilter()

	// Institution filter hook for multi-tenant filtering
	const {
		filter,
		isReady,
		appendToUrl,
		getInstitutionIdForCreate,
		mustSelectInstitution,
		shouldFilter,
		institutionId
	} = useInstitutionFilter()

	// State Management
	const [items, setItems] = useState<ExamType[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)
	const [deleteTarget, setDeleteTarget] = useState<ExamType | null>(null)

	const [sheetOpen, setSheetOpen] = useState(false)
	const [editing, setEditing] = useState<ExamType | null>(null)
	const [statusFilter, setStatusFilter] = useState("all")
	const [examTypeFilter, setExamTypeFilter] = useState("all")

	// Upload Summary State
	const [errorPopupOpen, setErrorPopupOpen] = useState(false)
	const [importErrors, setImportErrors] = useState<Array<{
		row: number
		examination_code: string
		examination_name: string
		errors: string[]
	}>>([])
	const [uploadSummary, setUploadSummary] = useState<{
		total: number
		success: number
		failed: number
	}>({ total: 0, success: 0, failed: 0 })

	// Form Data State
	const [formData, setFormData] = useState({
		institutions_id: "",
		examination_code: "",
		examination_name: "",
		grade_system_codes: [] as string[], // Changed to array for multi-select
		regulation_id: "",
		description: "",
		exam_type: "offline" as 'quizzes' | 'online' | 'offline',
		is_coe: true,
		is_active: true,
	})
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Foreign Key Dropdown Data
	const [institutions, setInstitutions] = useState<Array<{ id: string; institution_code: string; institution_name: string; counselling_code: string | null }>>([])
	const [regulations, setRegulations] = useState<Regulation[]>([])
	const [regulationsLoading, setRegulationsLoading] = useState(false)

	// Fetch Data with institution filter
	const fetchExamTypes = async () => {
		try {
			setLoading(true)
			// Use institution filter for multi-tenant data access
			const url = appendToUrl('/api/exam-management/exam-types')
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error('Failed to fetch exam types')
			}
			const data = await response.json()
			setItems(data)
		} catch (error) {
			console.error('Error fetching exam types:', error)
			setItems([])
		} finally {
			setLoading(false)
		}
	}

	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/master/institutions')
			if (res.ok) {
				const data = await res.json()
				const mapped = Array.isArray(data)
					? data.filter((i: any) => i?.institution_code).map((i: any) => ({
						id: i.id,
						institution_code: i.institution_code,
						institution_name: i.institution_name || i.name,
						counselling_code: i.counselling_code || null
					}))
					: []
				setInstitutions(mapped)
			}
		} catch (e) {
			console.error('Failed to load institutions:', e)
		}
	}

	// Fetch regulations from MyJKKN API using hook (two-step lookup with client-side filtering)
	const fetchRegulations = useCallback(async (institutionId?: string) => {
		try {
			setRegulationsLoading(true)
			setRegulations([])

			// If no institution selected, clear regulations
			if (!institutionId) {
				return
			}

			// Find the institution to get its counselling_code for MyJKKN API filtering
			const institution = institutions.find(i => i.id === institutionId)
			const counsellingCode = institution?.counselling_code || undefined

			// Use hook to fetch regulations (handles two-step lookup and deduplication)
			const regs = await fetchMyJKKNRegulations(counsellingCode)

			// Extra deduplication by regulation_code to ensure no duplicates
			const seenCodes = new Set<string>()
			const uniqueRegs = regs.filter(r => {
				if (seenCodes.has(r.regulation_code)) return false
				seenCodes.add(r.regulation_code)
				return true
			})

			setRegulations(uniqueRegs.map(r => ({
				id: r.id,
				regulation_code: r.regulation_code,
				regulation_name: r.regulation_name || r.regulation_code
			})))
		} catch (e) {
			console.error('[ExamTypes] Failed to load regulations from MyJKKN:', e)
		} finally {
			setRegulationsLoading(false)
		}
	}, [institutions, fetchMyJKKNRegulations])

	// Load data when institution filter is ready
	useEffect(() => {
		if (isReady) {
			fetchExamTypes()
			fetchInstitutions()
		}
	}, [isReady, filter])

	// Fetch regulations when institution changes (filtered by counselling_code)
	useEffect(() => {
		if (formData.institutions_id) {
			fetchRegulations(formData.institutions_id)
		} else {
			// Clear regulations when no institution is selected
			setRegulations([])
		}
	}, [formData.institutions_id, fetchRegulations])

	// Form Validation
	const validate = () => {
		const e: Record<string, string> = {}

		// Required field validation
		if (!formData.institutions_id) e.institutions_id = "Institution is required"
		if (!formData.examination_code.trim()) e.examination_code = "Examination code is required"
		if (!formData.examination_name.trim()) e.examination_name = "Examination name is required"

		// Grade system codes validation (optional but must be UG or PG if provided)
		const invalidCodes = formData.grade_system_codes.filter(c => !['UG', 'PG'].includes(c))
		if (invalidCodes.length > 0) {
			e.grade_system_codes = "Grade system must be UG or PG"
		}

		// Format validation
		if (formData.examination_code && !/^[A-Za-z0-9\-_]+$/.test(formData.examination_code)) {
			e.examination_code = "Can only contain letters, numbers, hyphens, and underscores"
		}

		// Length validation
		if (formData.examination_code && formData.examination_code.length > 20) {
			e.examination_code = "Must be 20 characters or less"
		}

		if (formData.examination_name && formData.examination_name.length > 100) {
			e.examination_name = "Must be 100 characters or less"
		}

		setErrors(e)
		return Object.keys(e).length === 0
	}

	// CRUD Operations
	const save = async () => {
		if (!validate()) return

		try {
			setLoading(true)

			// Convert grade_system_codes array to comma-separated string for API
			const gradeSystemCode = formData.grade_system_codes.length > 0
				? formData.grade_system_codes.join(',')
				: null

			let payload = {
				institutions_id: formData.institutions_id,
				examination_code: formData.examination_code,
				examination_name: formData.examination_name,
				grade_system_code: gradeSystemCode,
				regulation_id: formData.regulation_id || null,
				description: formData.description,
				exam_type: formData.exam_type,
				is_coe: formData.is_coe,
				is_active: formData.is_active,
			}

			if (editing) {
				// UPDATE
				const response = await fetch('/api/exam-management/exam-types', {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ id: editing.id, ...payload }),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to update exam type')
				}

				const updated = await response.json()
				setItems((prev) => prev.map((p) => (p.id === editing.id ? updated : p)))

				toast({
					title: "✅ Exam Type Updated",
					description: `${updated.examination_name} has been successfully updated.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			} else {
				// CREATE
				const response = await fetch('/api/exam-management/exam-types', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(payload),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to create exam type')
				}

				const created = await response.json()
				setItems((prev) => [created, ...prev])

				toast({
					title: "✅ Exam Type Created",
					description: `${created.examination_name} has been successfully created.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			}

			setSheetOpen(false)
			resetForm()
		} catch (error) {
			console.error('Error saving exam type:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to save exam type. Please try again.'
			toast({
				title: "❌ Save Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoading(false)
		}
	}

	const remove = async (id: string) => {
		try {
			setLoading(true)
			const itemName = items.find(i => i.id === id)?.examination_name || 'Exam Type'

			const response = await fetch(`/api/exam-management/exam-types?id=${id}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to delete exam type')
			}

			setItems((prev) => prev.filter((p) => p.id !== id))

			toast({
				title: "✅ Exam Type Deleted",
				description: `${itemName} has been successfully deleted.`,
				className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
			})
		} catch (error) {
			console.error('Error deleting exam type:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to delete exam type. Please try again.'
			toast({
				title: "❌ Delete Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoading(false)
		}
	}

	// Reset Form
	const resetForm = () => {
		// Auto-fill institution_id from context if available
		const autoInstitutionId = getInstitutionIdForCreate() || ""
		setFormData({
			institutions_id: autoInstitutionId,
			examination_code: "",
			examination_name: "",
			grade_system_codes: [], // Reset to empty array
			regulation_id: "",
			description: "",
			exam_type: "offline",
			is_coe: true,
			is_active: true,
		})
		setErrors({})
		setEditing(null)
	}

	// Validation function for imported data
	const validateExamTypeData = (data: any, rowIndex: number) => {
		const errors: string[] = []

		// Required field validations
		if (!data.examination_code || data.examination_code.trim() === '') {
			errors.push('Examination code is required')
		} else if (data.examination_code.length > 20) {
			errors.push('Examination code must be 20 characters or less')
		}

		if (!data.examination_name || data.examination_name.trim() === '') {
			errors.push('Examination name is required')
		} else if (data.examination_name.length > 100) {
			errors.push('Examination name must be 100 characters or less')
		}

		// Grade system code validation (optional, supports multiple values like "UG,PG")
		if (data.grade_system_code && data.grade_system_code.trim() !== '') {
			const codes = data.grade_system_code.split(',').map((c: string) => c.trim().toUpperCase())
			const invalidCodes = codes.filter((c: string) => c && !['UG', 'PG'].includes(c))
			if (invalidCodes.length > 0) {
				errors.push(`Invalid grade system code(s): ${invalidCodes.join(', ')}. Must be UG or PG`)
			}
		}

		// Status validation
		if (data.is_active !== undefined && data.is_active !== null) {
			if (typeof data.is_active !== 'boolean') {
				const statusValue = String(data.is_active).toLowerCase()
				if (statusValue !== 'true' && statusValue !== 'false' && statusValue !== 'active' && statusValue !== 'inactive') {
					errors.push('Status must be true/false or Active/Inactive')
				}
			}
		}

		// Exam type validation
		if (data.exam_type && !['quizzes', 'online', 'offline'].includes(data.exam_type)) {
			errors.push('Exam type must be quizzes, online, or offline')
		}

		return errors
	}

	// Export to JSON - exports only filtered data (user's institution)
	const handleDownload = () => {
		const exportData = filtered.map(item => {
			// Find regulation name from regulation_id
			const regulation = regulations.find(r => r.id === item.regulation_id)

			return {
				examination_code: item.examination_code,
				examination_name: item.examination_name,
				grade_system_code: item.grade_system_code,
				regulation_code: regulation?.regulation_code || '',
				description: item.description,
				exam_type: item.exam_type,
				is_coe: item.is_coe,
				is_active: item.is_active,
				created_at: item.created_at
			}
		})

		const json = JSON.stringify(exportData, null, 2)
		const blob = new Blob([json], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `exam_types_${new Date().toISOString().split('T')[0]}.json`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	// Export to Excel - exports only filtered data (user's institution)
	const handleExport = () => {
		const excelData = filtered.map((r) => {
			const regulation = regulations.find(reg => reg.id === r.regulation_id)

			return {
				'Examination Code': r.examination_code,
				'Examination Name': r.examination_name,
				'Grade System Code': r.grade_system_code || '',
				'Regulation Code': regulation?.regulation_code || '',
				'Description': r.description || '',
				'Exam Type': r.exam_type,
				'Is CoE': r.is_coe ? 'Yes' : 'No',
				'Status': r.is_active ? 'Active' : 'Inactive',
				'Created': new Date(r.created_at).toISOString().split('T')[0],
			}
		})

		const ws = XLSX.utils.json_to_sheet(excelData)

		// Set column widths
		const colWidths = [
			{ wch: 20 }, // Examination Code
			{ wch: 30 }, // Examination Name
			{ wch: 20 }, // Grade System Code
			{ wch: 20 }, // Regulation Code
			{ wch: 40 }, // Description
			{ wch: 15 }, // Exam Type
			{ wch: 10 }, // Is CoE
			{ wch: 10 }, // Status
			{ wch: 12 }, // Created
		]
		ws['!cols'] = colWidths

		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Exam Types')
		XLSX.writeFile(wb, `exam_types_export_${new Date().toISOString().split('T')[0]}.xlsx`)
	}

	// Template Export with Reference Sheets
	// Note: Institution is NOT included in template - users can only import to their own institution
	const handleTemplateExport = () => {
		const wb = XLSX.utils.book_new()

		// Sheet 1: Template with sample rows showing single and multi-select grade systems
		const sample = [
			{
				'Examination Code *': 'MTE',
				'Examination Name *': 'Mid Term Examination',
				'Grade System Code': 'UG',
				'Regulation Code': 'REG2024',
				'Description': 'Mid term examination for undergraduate',
				'Exam Type': 'offline',
				'Is CoE': 'Yes',
				'Status': 'Active'
			},
			{
				'Examination Code *': 'ETE',
				'Examination Name *': 'End Term Examination',
				'Grade System Code': 'UG,PG',
				'Regulation Code': 'REG2024',
				'Description': 'End term examination for both UG and PG',
				'Exam Type': 'offline',
				'Is CoE': 'Yes',
				'Status': 'Active'
			}
		]

		const ws = XLSX.utils.json_to_sheet(sample)

		// Set column widths
		const colWidths = [
			{ wch: 20 }, // Examination Code
			{ wch: 30 }, // Examination Name
			{ wch: 20 }, // Grade System Code
			{ wch: 20 }, // Regulation Code
			{ wch: 40 }, // Description
			{ wch: 15 }, // Exam Type
			{ wch: 10 }, // Is CoE
			{ wch: 10 }, // Status
		]
		ws['!cols'] = colWidths

		// Style mandatory field headers red with asterisk
		const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
		const mandatoryFields = ['Examination Code *', 'Examination Name *']

		for (let col = range.s.c; col <= range.e.c; col++) {
			const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
			if (!ws[cellAddress]) continue

			const cell = ws[cellAddress]
			const isMandatory = mandatoryFields.includes(cell.v as string)

			if (isMandatory) {
				cell.s = {
					font: { color: { rgb: 'FF0000' }, bold: true },
					fill: { fgColor: { rgb: 'FFE6E6' } }
				}
			} else {
				cell.s = {
					font: { bold: true },
					fill: { fgColor: { rgb: 'F0F0F0' } }
				}
			}
		}

		XLSX.utils.book_append_sheet(wb, ws, 'Template')

		// Sheet 2: Regulations Reference (filtered by user's institution)
		const regulationsRef = regulations.map(item => ({
			'Regulation Code': item.regulation_code,
			'Regulation Name': item.regulation_name || 'N/A',
		}))

		const wsRef = XLSX.utils.json_to_sheet(regulationsRef)
		const refColWidths = [
			{ wch: 20 },
			{ wch: 40 },
		]
		wsRef['!cols'] = refColWidths

		XLSX.utils.book_append_sheet(wb, wsRef, 'Regulations')

		// Sheet 3: Grade System Codes Reference (UG/PG)
		const gradeSystemRef = [
			{ 'Grade System Code': 'UG', 'Description': 'Undergraduate' },
			{ 'Grade System Code': 'PG', 'Description': 'Postgraduate' },
		]

		const wsGradeRef = XLSX.utils.json_to_sheet(gradeSystemRef)
		const gradeRefColWidths = [
			{ wch: 20 },
			{ wch: 30 },
		]
		wsGradeRef['!cols'] = gradeRefColWidths

		XLSX.utils.book_append_sheet(wb, wsGradeRef, 'Grade Systems')

		XLSX.writeFile(wb, `exam_types_template_${new Date().toISOString().split('T')[0]}.xlsx`)
	}

	// Import with Detailed Error Tracking
	const handleImport = () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.json,.csv,.xlsx,.xls'
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (!file) return

			try {
				let rows: Partial<ExamType>[] = []

				// Parse file based on type (JSON/CSV/Excel)
				if (file.name.endsWith('.json')) {
					const text = await file.text()
					rows = JSON.parse(text)
				} else if (file.name.endsWith('.csv')) {
					// CSV parsing logic
					const text = await file.text()
					const lines = text.split('\n').filter(line => line.trim())
					if (lines.length < 2) {
						toast({
							title: "❌ Invalid CSV File",
							description: "CSV file must have at least a header row and one data row",
							variant: "destructive",
						})
						return
					}

					const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
					const dataRows = lines.slice(1).map(line => {
						const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
						const row: Record<string, string> = {}
						headers.forEach((header, index) => {
							row[header] = values[index] || ''
						})
						return row
					})

					rows = dataRows.map(j => {
						// Map regulation_code to regulation_id
						const regulationCode = String(j['Regulation Code'] || '')
						const regulation = regulations.find(r => r.regulation_code === regulationCode)
						// Support multiple grade system codes (e.g., "UG,PG" or "UG")
						const gradeSystemRaw = String(j['Grade System Code'] || '').toUpperCase()
						const validCodes = gradeSystemRaw.split(',').map(c => c.trim()).filter(c => ['UG', 'PG'].includes(c))
						const gradeSystemCode = validCodes.length > 0 ? validCodes.join(',') : null

						return {
							examination_code: String(j['Examination Code *'] || j['Examination Code'] || ''),
							examination_name: String(j['Examination Name *'] || j['Examination Name'] || ''),
							grade_system_code: gradeSystemCode,
							regulation_id: regulation?.id || null,
							description: String(j['Description'] || ''),
							exam_type: String(j['Exam Type'] || 'offline') as 'quizzes' | 'online' | 'offline',
							is_coe: String(j['Is CoE'] || '').toLowerCase() === 'yes',
							is_active: String(j['Status'] || '').toLowerCase() === 'active'
						}
					})
				} else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
					const data = new Uint8Array(await file.arrayBuffer())
					const wb = XLSX.read(data, { type: 'array' })
					const ws = wb.Sheets[wb.SheetNames[0]]
					const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
					rows = json.map(j => {
						// Map regulation_code to regulation_id
						const regulationCode = String(j['Regulation Code'] || '')
						const regulation = regulations.find(r => r.regulation_code === regulationCode)
						// Support multiple grade system codes (e.g., "UG,PG" or "UG")
						const gradeSystemRaw = String(j['Grade System Code'] || '').toUpperCase()
						const validCodes = gradeSystemRaw.split(',').map(c => c.trim()).filter(c => ['UG', 'PG'].includes(c))
						const gradeSystemCode = validCodes.length > 0 ? validCodes.join(',') : null

						return {
							examination_code: String(j['Examination Code *'] || j['Examination Code'] || ''),
							examination_name: String(j['Examination Name *'] || j['Examination Name'] || ''),
							grade_system_code: gradeSystemCode,
							regulation_id: regulation?.id || null,
							description: String(j['Description'] || ''),
							exam_type: String(j['Exam Type'] || 'offline') as 'quizzes' | 'online' | 'offline',
							is_coe: String(j['Is CoE'] || '').toLowerCase() === 'yes',
							is_active: String(j['Status'] || '').toLowerCase() === 'active'
						}
					})
				}

				const now = new Date().toISOString()
				const validationErrors: Array<{
					row: number
					examination_code: string
					examination_name: string
					errors: string[]
				}> = []

				// Get institution ID from filter context - users can only import to their own institution
				const autoInstitutionId = getInstitutionIdForCreate() || ''

				// If "All Institutions" is selected, user must select a specific institution first
				if (mustSelectInstitution) {
					toast({
						title: "❌ Institution Required",
						description: "Please select a specific institution from the header dropdown before importing data.",
						variant: "destructive",
					})
					return
				}

				// Validate that user has an institution assigned
				if (!autoInstitutionId) {
					toast({
						title: "❌ No Institution",
						description: "Unable to determine your institution. Please contact administrator.",
						variant: "destructive",
					})
					return
				}

				const mapped = rows.map((r, index) => {
					const itemData = {
						id: String(Date.now() + Math.random()),
						institutions_id: autoInstitutionId, // Always use user's institution
						examination_code: r.examination_code!,
						examination_name: r.examination_name!,
						grade_system_code: r.grade_system_code || null,
						regulation_id: r.regulation_id || null,
						description: r.description || null,
						exam_type: r.exam_type || 'offline',
						is_coe: r.is_coe ?? true,
						is_active: r.is_active ?? true,
						created_at: now,
						updated_at: now,
					}

					// Validate the data
					const errors = validateExamTypeData(itemData, index + 2)
					if (errors.length > 0) {
						validationErrors.push({
							row: index + 2,
							examination_code: itemData.examination_code || 'N/A',
							examination_name: itemData.examination_name || 'N/A',
							errors: errors
						})
					}

					return itemData
				}).filter(r => r.examination_code && r.examination_name) as ExamType[]

				// If there are validation errors, show them in popup
				if (validationErrors.length > 0) {
					setImportErrors(validationErrors)
					setUploadSummary({
						total: rows.length,
						success: 0,
						failed: validationErrors.length
					})
					setErrorPopupOpen(true)
					return
				}

				if (mapped.length === 0) {
					toast({
						title: "❌ No Valid Data",
						description: "No valid data found in the file. Please check required fields.",
						variant: "destructive",
					})
					return
				}

				// Save each item to the database
				setLoading(true)
				let successCount = 0
				let errorCount = 0
				const uploadErrors: Array<{
					row: number
					examination_code: string
					examination_name: string
					errors: string[]
				}> = []

				for (let i = 0; i < mapped.length; i++) {
					const item = mapped[i]
					const rowNumber = i + 2 // +2 for header row in Excel

					try {
						const response = await fetch('/api/exam-management/exam-types', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
							},
							body: JSON.stringify(item),
						})

						if (response.ok) {
							const savedItem = await response.json()
							setItems(prev => [savedItem, ...prev])
							successCount++
						} else {
							const errorData = await response.json()
							errorCount++
							uploadErrors.push({
								row: rowNumber,
								examination_code: item.examination_code || 'N/A',
								examination_name: item.examination_name || 'N/A',
								errors: [errorData.error || 'Failed to save exam type']
							})
						}
					} catch (error) {
						errorCount++
						uploadErrors.push({
							row: rowNumber,
							examination_code: item.examination_code || 'N/A',
							examination_name: item.examination_name || 'N/A',
							errors: [error instanceof Error ? error.message : 'Network error']
						})
					}
				}

				setLoading(false)
				const totalRows = mapped.length

				// Update upload summary
				setUploadSummary({
					total: totalRows,
					success: successCount,
					failed: errorCount
				})

				// Show detailed results with error dialog if needed
				if (uploadErrors.length > 0) {
					setImportErrors(uploadErrors)
					setErrorPopupOpen(true)
				}

				// Show appropriate toast messages
				if (successCount > 0 && errorCount === 0) {
					toast({
						title: "✅ Upload Complete",
						description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} (${successCount} exam type${successCount > 1 ? 's' : ''}) to the database.`,
						className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
						duration: 5000,
					})
				} else if (successCount > 0 && errorCount > 0) {
					toast({
						title: "⚠️ Partial Upload Success",
						description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: ${successCount} successful, ${errorCount} failed. View error details below.`,
						className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
						duration: 6000,
					})
				} else if (errorCount > 0) {
					toast({
						title: "❌ Upload Failed",
						description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: 0 successful, ${errorCount} failed. View error details below.`,
						variant: "destructive",
						className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
						duration: 6000,
					})
				}
			} catch (err) {
				console.error('Import error:', err)
				setLoading(false)
				toast({
					title: "❌ Import Error",
					description: "Import failed. Please check your file format and try again.",
					variant: "destructive",
				})
			}
		}
		input.click()
	}

	// Filtering, Sorting, Pagination
	const filtered = useMemo(() => {
		let result = items

		// Search filter
		if (searchTerm) {
			const lower = searchTerm.toLowerCase()
			result = result.filter(
				(item) =>
					item.examination_code.toLowerCase().includes(lower) ||
					item.examination_name.toLowerCase().includes(lower) ||
					(item.grade_system_code && item.grade_system_code.toLowerCase().includes(lower))
			)
		}

		// Status filter
		if (statusFilter !== "all") {
			result = result.filter((item) => item.is_active === (statusFilter === "active"))
		}

		// Exam type filter
		if (examTypeFilter !== "all") {
			result = result.filter((item) => item.exam_type === examTypeFilter)
		}

		// Sorting
		if (sortColumn) {
			result = [...result].sort((a, b) => {
				const aVal = a[sortColumn as keyof ExamType]
				const bVal = b[sortColumn as keyof ExamType]
				if (aVal == null) return 1
				if (bVal == null) return -1
				const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
				return sortDirection === "asc" ? comparison : -comparison
			})
		}

		return result
	}, [items, searchTerm, statusFilter, examTypeFilter, sortColumn, sortDirection])

	const pageSizeOptions = useMemo(() => [10, 20, 50, 100], [])
	const isShowAll = itemsPerPage === -1
	const effectivePerPage = isShowAll ? filtered.length : itemsPerPage
	const totalPages = isShowAll ? 1 : Math.ceil(filtered.length / effectivePerPage)
	const paginatedItems = useMemo(() => {
		if (isShowAll) return filtered
		return filtered.slice((currentPage - 1) * effectivePerPage, currentPage * effectivePerPage)
	}, [filtered, currentPage, isShowAll, effectivePerPage])

	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
		} else {
			setSortColumn(column)
			setSortDirection("asc")
		}
	}

	const SortIcon = ({ column }: { column: string }) => {
		if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-4 w-4" />
		return sortDirection === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
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
									<BreadcrumbPage>Exam Types</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Scorecard Section */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Total Exam Types</p>
										<p className="text-xl font-bold">{items.length}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<FileText className="h-3 w-3 text-blue-600 dark:text-blue-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Active Exam Types</p>
										<p className="text-xl font-bold text-green-600">{items.filter(i => i.is_active).length}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
										<CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Inactive Exam Types</p>
										<p className="text-xl font-bold text-red-600">{items.filter(i => !i.is_active).length}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
										<XCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">New This Month</p>
										<p className="text-xl font-bold text-blue-600">{items.filter(i => { const d = new Date(i.created_at); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear() }).length}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
										<TrendingUp className="h-3 w-3 text-purple-600 dark:text-purple-400" />
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Main Card */}
					<Card className="flex-1 flex flex-col min-h-0">
						<CardHeader className="flex-shrink-0 p-3">
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center gap-2">
									<div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
										<FileText className="h-3 w-3 text-primary" />
									</div>
									<div>
										<h2 className="text-sm font-semibold">Exam Types</h2>
										<p className="text-xs text-muted-foreground">Manage examination types</p>
									</div>
								</div>
								<div className="hidden" />
							</div>

							<div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
								<div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
									<Select value={examTypeFilter} onValueChange={setExamTypeFilter}>
										<SelectTrigger className="w-[140px] h-8">
											<SelectValue placeholder="Exam Type" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Types</SelectItem>
											<SelectItem value="offline">Offline</SelectItem>
											<SelectItem value="online">Online</SelectItem>
											<SelectItem value="quizzes">Quizzes</SelectItem>
										</SelectContent>
									</Select>

									<Select value={statusFilter} onValueChange={setStatusFilter}>
										<SelectTrigger className="w-[140px] h-8">
											<SelectValue placeholder="All Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Status</SelectItem>
											<SelectItem value="active">Active</SelectItem>
											<SelectItem value="inactive">Inactive</SelectItem>
										</SelectContent>
									</Select>

									<div className="relative w-full sm:w-[220px]">
										<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
										<Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search…" className="pl-8 h-8 text-xs" />
									</div>
								</div>

								<div className="flex gap-1 flex-wrap">
									<Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={fetchExamTypes} disabled={loading}>
										<RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
										Refresh
									</Button>
									<Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={handleTemplateExport}>
										<FileSpreadsheet className="h-3 w-3 mr-1" />
										Template
									</Button>
									<Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={handleDownload}>Json</Button>
									<Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={handleExport}>Download</Button>
									<Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={handleImport}>Upload</Button>
									<Button size="sm" className="text-xs px-2 h-8" onClick={() => {
									// Open form - institution can be selected in the form if "All Institutions" is selected
									resetForm()
									setSheetOpen(true)
								}} disabled={loading}>
									<PlusCircle className="h-3 w-3 mr-1" />
									Add
								</Button>
								</div>
							</div>
						</CardHeader>

						<CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
							<div className="rounded-md border overflow-hidden" style={{ height: "440px" }}>
								<div className="h-full overflow-auto">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
											<TableRow>
												{/* Show Institution column only when "All Institutions" is selected */}
												{mustSelectInstitution && (
													<TableHead className="w-[100px] text-xs">
														<Button variant="ghost" size="sm" onClick={() => handleSort("institutions_id")} className="h-auto p-0 font-medium hover:bg-transparent">
															Institution
															<span className="ml-1">{sortColumn === "institutions_id" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}</span>
														</Button>
													</TableHead>
												)}
												<TableHead className="w-[120px] text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort("examination_code")} className="h-auto p-0 font-medium hover:bg-transparent">
														Exam Code
														<span className="ml-1">{sortColumn === "examination_code" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}</span>
													</Button>
												</TableHead>
												<TableHead className="text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort("examination_name")} className="h-auto p-0 font-medium hover:bg-transparent">
														Exam Name
														<span className="ml-1">{sortColumn === "examination_name" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}</span>
													</Button>
												</TableHead>
												<TableHead className="w-[120px] text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort("grade_system_code")} className="h-auto p-0 font-medium hover:bg-transparent">
														Grade System
														<span className="ml-1">{sortColumn === "grade_system_code" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}</span>
													</Button>
												</TableHead>
												<TableHead className="w-[100px] text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort("exam_type")} className="h-auto p-0 font-medium hover:bg-transparent">
														Exam Type
														<span className="ml-1">{sortColumn === "exam_type" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}</span>
													</Button>
												</TableHead>
												<TableHead className="w-[80px] text-xs">CoE</TableHead>
												<TableHead className="w-[100px] text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort("is_active")} className="h-auto p-0 font-medium hover:bg-transparent">
														Status
														<span className="ml-1">{sortColumn === "is_active" ? (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground" />}</span>
													</Button>
												</TableHead>
												<TableHead className="w-[100px] text-xs text-center">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{loading ? (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 8 : 7} className="h-24 text-center text-xs">Loading…</TableCell>
												</TableRow>
											) : paginatedItems.length ? (
												<>
													{paginatedItems.map((item) => (
														<TableRow key={item.id}>
															{/* Show Institution cell only when "All Institutions" is selected */}
															{mustSelectInstitution && (
																<TableCell className="text-xs font-medium text-muted-foreground">
																	{institutions.find(i => i.id === item.institutions_id)?.institution_code || '-'}
																</TableCell>
															)}
															<TableCell className="text-xs font-medium">{item.examination_code}</TableCell>
															<TableCell className="text-xs">{item.examination_name}</TableCell>
															<TableCell className="text-xs text-muted-foreground">{item.grade_system_code || '-'}</TableCell>
															<TableCell>
																<Badge
																	variant="outline"
																	className={`text-xs ${
																		item.exam_type === 'offline' ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200' :
																		item.exam_type === 'online' ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200' :
																		'bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-200'
																	}`}
																>
																	{item.exam_type}
																</Badge>
															</TableCell>
															<TableCell>
																<Badge
																	variant="outline"
																	className={`text-xs ${
																		item.is_coe
																			? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200'
																			: 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-200'
																	}`}
																>
																	{item.is_coe ? 'Yes' : 'No'}
																</Badge>
															</TableCell>
															<TableCell>
																<Badge
																	variant={item.is_active ? "default" : "secondary"}
																	className={`text-xs ${
																		item.is_active
																			? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200'
																			: 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200'
																	}`}
																>
																	{item.is_active ? "Active" : "Inactive"}
																</Badge>
															</TableCell>
															<TableCell>
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
																			<MoreHorizontal className="h-4 w-4" />
																		</Button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent align="end">
																		<DropdownMenuItem onClick={() => {
																			setEditing(item)
																			const gradeCodes = item.grade_system_code ? item.grade_system_code.split(',').map(c => c.trim()).filter(Boolean) : []
																			setFormData({ institutions_id: item.institutions_id, examination_code: item.examination_code, examination_name: item.examination_name, grade_system_codes: gradeCodes, regulation_id: item.regulation_id || "", description: item.description || "", exam_type: item.exam_type, is_coe: item.is_coe, is_active: item.is_active })
																			setSheetOpen(true)
																		}}>
																			<Edit className="h-3 w-3 mr-2" /> Edit
																		</DropdownMenuItem>
																		<DropdownMenuSeparator />
																		<DropdownMenuItem className="text-red-600" onClick={() => setDeleteTarget(item)}>
																			<Trash2 className="h-3 w-3 mr-2" /> Delete
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</TableCell>
														</TableRow>
													))}
												</>
											) : (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 8 : 7} className="h-24 text-center text-xs">No data</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
							</div>

							<div className="flex items-center justify-between space-x-2 py-2 mt-2">
								<div className="text-xs text-muted-foreground">
									<span>Showing {filtered.length === 0 ? 0 : (currentPage - 1) * effectivePerPage + 1}-{Math.min(currentPage * effectivePerPage, filtered.length)} of {filtered.length}</span>
								<Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(v === '-1' ? -1 : Number(v)); setCurrentPage(1) }}><SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger><SelectContent>{pageSizeOptions.map(size => (<SelectItem key={size} value={String(size)}>{size} / page</SelectItem>))}<SelectItem value="-1">All</SelectItem></SelectContent></Select>
								</div>
								<div className="flex items-center gap-2">
									<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1 || isShowAll} className="h-7 px-2 text-xs">
										<ChevronLeft className="h-3 w-3 mr-1" /> Previous
									</Button>
									<div className="text-xs text-muted-foreground px-2">Page {currentPage} of {totalPages}</div>
									<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages || isShowAll} className="h-7 px-2 text-xs">
										Next <ChevronRight className="h-3 w-3 ml-1" />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
				<AppFooter />
			</SidebarInset>

			{/* Form Sheet */}
			<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
				<SheetContent className="sm:max-w-[600px] overflow-y-auto">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle>{editing ? "Edit Exam Type" : "Add Exam Type"}</SheetTitle>
						<p className="text-sm text-muted-foreground">{editing ? "Update exam type information" : "Create a new exam type record"}</p>
					</SheetHeader>

					<div className="mt-6 space-y-6">
						{/* Basic Information Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">Basic Information</h3>

							<div className="grid grid-cols-1 gap-4">
								{/* Show institution field when:
								    1. "All Institutions" is selected globally (mustSelectInstitution = true)
								    2. User can switch institutions (!shouldFilter || !institutionId)
								    Hide when a specific institution is selected */}
								{mustSelectInstitution || !shouldFilter || !institutionId ? (
									<div className="space-y-2">
										<Label htmlFor="institutions_id" className="text-sm font-semibold">
											Institution <span className="text-red-500">*</span>
										</Label>
										<Select
											value={formData.institutions_id}
											onValueChange={(v) => setFormData({ ...formData, institutions_id: v, regulation_id: '' })}
										>
											<SelectTrigger className={`h-10 ${errors.institutions_id ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Select institution" />
											</SelectTrigger>
											<SelectContent>
												{institutions.map((inst) => (
													<SelectItem key={inst.id} value={inst.id}>
														{inst.institution_code} - {inst.institution_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{errors.institutions_id && <p className="text-xs text-destructive">{errors.institutions_id}</p>}
									</div>
								) : null}

								<div className="space-y-2">
									<Label htmlFor="examination_code" className="text-sm font-semibold">
										Examination Code <span className="text-red-500">*</span>
									</Label>
									<Input
										id="examination_code"
										value={formData.examination_code}
										onChange={(e) => setFormData({ ...formData, examination_code: e.target.value })}
										className={`h-10 ${errors.examination_code ? 'border-destructive' : ''}`}
										placeholder="e.g., MTE"
										maxLength={20}
									/>
									{errors.examination_code && <p className="text-xs text-destructive">{errors.examination_code}</p>}
								</div>

								<div className="space-y-2">
									<Label htmlFor="examination_name" className="text-sm font-semibold">
										Examination Name <span className="text-red-500">*</span>
									</Label>
									<Input
										id="examination_name"
										value={formData.examination_name}
										onChange={(e) => setFormData({ ...formData, examination_name: e.target.value })}
										className={`h-10 ${errors.examination_name ? 'border-destructive' : ''}`}
										placeholder="e.g., Mid Term Examination"
										maxLength={100}
									/>
									{errors.examination_name && <p className="text-xs text-destructive">{errors.examination_name}</p>}
								</div>

								<div className="space-y-2">
									<Label className="text-sm font-semibold">
										Grade System <span className="text-muted-foreground font-normal">(multi-select)</span>
									</Label>
									<div className={`flex gap-4 p-3 border rounded-md ${errors.grade_system_codes ? 'border-destructive' : 'border-input'}`}>
										<label className="flex items-center gap-2 cursor-pointer">
											<input
												type="checkbox"
												checked={formData.grade_system_codes.includes('UG')}
												onChange={(e) => {
													if (e.target.checked) {
														setFormData({ ...formData, grade_system_codes: [...formData.grade_system_codes, 'UG'] })
													} else {
														setFormData({ ...formData, grade_system_codes: formData.grade_system_codes.filter(c => c !== 'UG') })
													}
												}}
												className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
											/>
											<span className="text-sm">UG - Undergraduate</span>
										</label>
										<label className="flex items-center gap-2 cursor-pointer">
											<input
												type="checkbox"
												checked={formData.grade_system_codes.includes('PG')}
												onChange={(e) => {
													if (e.target.checked) {
														setFormData({ ...formData, grade_system_codes: [...formData.grade_system_codes, 'PG'] })
													} else {
														setFormData({ ...formData, grade_system_codes: formData.grade_system_codes.filter(c => c !== 'PG') })
													}
												}}
												className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
											/>
											<span className="text-sm">PG - Postgraduate</span>
										</label>
									</div>
									{formData.grade_system_codes.length > 0 && (
										<p className="text-xs text-muted-foreground">Selected: {formData.grade_system_codes.join(', ')}</p>
									)}
									{errors.grade_system_codes && <p className="text-xs text-destructive">{errors.grade_system_codes}</p>}
								</div>

								<div className="space-y-2">
									<Label htmlFor="regulation_id" className="text-sm font-semibold">
										Regulation
									</Label>
									<Select
										value={formData.regulation_id}
										onValueChange={(v) => setFormData({ ...formData, regulation_id: v })}
										disabled={!formData.institutions_id || regulationsLoading}
									>
										<SelectTrigger className={`h-10 ${!formData.institutions_id ? 'bg-muted' : ''}`}>
											<SelectValue placeholder={
												!formData.institutions_id
													? "Select institution first"
													: regulationsLoading
														? "Loading regulations..."
														: "Select regulation (optional)"
											} />
										</SelectTrigger>
										<SelectContent>
											{regulations.map((reg) => (
												<SelectItem key={reg.id} value={reg.id}>
													{reg.regulation_code}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{!formData.institutions_id && (
										<p className="text-xs text-muted-foreground">Select an institution to see available regulations from MyJKKN</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="exam_type" className="text-sm font-semibold">
										Exam Type
									</Label>
									<Select
										value={formData.exam_type}
										onValueChange={(v) => setFormData({ ...formData, exam_type: v as 'quizzes' | 'online' | 'offline' })}
									>
										<SelectTrigger className="h-10">
											<SelectValue placeholder="Select exam type" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="offline">Offline</SelectItem>
											<SelectItem value="online">Online</SelectItem>
											<SelectItem value="quizzes">Quizzes</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label htmlFor="description" className="text-sm font-semibold">
										Description
									</Label>
									<Textarea
										id="description"
										value={formData.description}
										onChange={(e) => setFormData({ ...formData, description: e.target.value })}
										className="min-h-[100px]"
										placeholder="Enter exam type description"
									/>
								</div>
							</div>
						</div>

						{/* Status Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">Status</h3>

							<div className="space-y-4">
								<div className="flex items-center gap-4">
									<Label className="text-sm font-semibold">CoE Examination</Label>
									<button
										type="button"
										onClick={() => setFormData({ ...formData, is_coe: !formData.is_coe })}
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.is_coe ? 'bg-green-500' : 'bg-gray-300'
											}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_coe ? 'translate-x-6' : 'translate-x-1'
												}`}
										/>
									</button>
									<span className={`text-sm font-medium ${formData.is_coe ? 'text-green-600' : 'text-red-500'}`}>
										{formData.is_coe ? 'Yes' : 'No'}
									</span>
								</div>

								<div className="flex items-center gap-4">
									<Label className="text-sm font-semibold">Exam Type Status</Label>
									<button
										type="button"
										onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.is_active ? 'bg-green-500' : 'bg-gray-300'
											}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_active ? 'translate-x-6' : 'translate-x-1'
												}`}
										/>
									</button>
									<span className={`text-sm font-medium ${formData.is_active ? 'text-green-600' : 'text-red-500'}`}>
										{formData.is_active ? 'Active' : 'Inactive'}
									</span>
								</div>
							</div>
						</div>

						{/* Action Buttons */}
						<div className="flex justify-end gap-3 pt-6 border-t">
							<Button
								variant="outline"
								size="sm"
								className="h-10 px-6"
								onClick={() => { setSheetOpen(false); resetForm() }}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								className="h-10 px-6"
								onClick={save}
								disabled={loading}
							>
								{editing ? "Update Exam Type" : "Create Exam Type"}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

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
									Data Validation Errors
								</AlertDialogTitle>
								<AlertDialogDescription className="text-sm text-muted-foreground mt-1">
									Please fix the following errors before importing the data
								</AlertDialogDescription>
							</div>
						</div>
					</AlertDialogHeader>

					<div className="space-y-4">
						{/* Upload Summary */}
						{uploadSummary.total > 0 && (
							<div className="grid grid-cols-3 gap-3">
								<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
									<div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Total Rows</div>
									<div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{uploadSummary.total}</div>
								</div>
								<div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
									<div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Successful</div>
									<div className="text-2xl font-bold text-green-700 dark:text-green-300">{uploadSummary.success}</div>
								</div>
								<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
									<div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Failed</div>
									<div className="text-2xl font-bold text-red-700 dark:text-red-300">{uploadSummary.failed}</div>
								</div>
							</div>
						)}

						{/* Error Summary */}
						<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
							<div className="flex items-center gap-2 mb-2">
								<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
								<span className="font-semibold text-red-800 dark:text-red-200">
									{importErrors.length} row{importErrors.length > 1 ? 's' : ''} failed validation
								</span>
							</div>
							<p className="text-sm text-red-700 dark:text-red-300">
								Please correct these errors in your Excel file and try uploading again. Row numbers correspond to your Excel file (including header row).
							</p>
						</div>

						{/* Detailed Error List */}
						<div className="space-y-3">
							{importErrors.map((error, index) => (
								<div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/5">
									<div className="flex items-start justify-between mb-2">
										<div className="flex items-center gap-2">
											<Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-200 dark:border-red-700">
												Row {error.row}
											</Badge>
											<span className="font-medium text-sm">
												{error.examination_code} - {error.examination_name}
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

						{/* Helpful Tips */}
						<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
							<div className="flex items-start gap-2">
								<div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mt-0.5">
									<span className="text-xs font-bold text-blue-600 dark:text-blue-400">i</span>
								</div>
								<div>
									<h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">Common Fixes:</h4>
									<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
										<li>• Ensure examination code is 20 characters or less</li>
										<li>• Ensure examination name is 100 characters or less</li>
										<li>• Grade system code must be UG or PG (optional)</li>
										<li>• Regulation code must reference an existing regulation (optional)</li>
										<li>• Exam type must be one of: offline, online, quizzes</li>
										<li>• Status: true/false or Active/Inactive</li>
									</ul>
								</div>
							</div>
						</div>
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
							Close
						</AlertDialogCancel>
						<Button
							onClick={() => {
								setErrorPopupOpen(false)
								setImportErrors([])
							}}
							className="bg-blue-600 hover:bg-blue-700 text-white"
						>
							Try Again
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		<AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Exam Type</AlertDialogTitle>
					<AlertDialogDescription>Are you sure you want to delete {deleteTarget?.examination_name}? This action cannot be undone.</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={() => { if (deleteTarget) { remove(deleteTarget.id); setDeleteTarget(null) } }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	</SidebarProvider>
	)
}
