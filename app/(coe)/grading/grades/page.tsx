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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/common/use-toast"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import Link from "next/link"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Award, CheckCircle2, XOctagon, CalendarPlus, TrendingUp, FileSpreadsheet, RefreshCw, Download, Upload, XCircle, AlertTriangle, ChevronDown, MoreHorizontal } from "lucide-react"

type Grade = {
	id: string
	institutions_id: string
	institutions_code: string
	grade: string
	grade_point: number
	description: string
	regulation_code: string
	qualify: boolean
	exclude_cgpa: boolean
	order_index: number | null
	is_absent: boolean
	result_status: string | null
	created_at: string
	updated_at: string
}

export default function GradesPage() {
	const { toast } = useToast()
	const { fetchRegulations: fetchMyJKKNRegulations } = useMyJKKNInstitutionFilter()

	// Institution filter hook for multi-tenant filtering
	const {
		filter,
		isReady,
		appendToUrl,
		getInstitutionCodeForCreate,
		mustSelectInstitution,
		shouldFilter,
		institutionCode
	} = useInstitutionFilter()

	const [items, setItems] = useState<Grade[]>([])
	const [loading, setLoading] = useState(false)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)
	const [deleteTarget, setDeleteTarget] = useState<Grade | null>(null)

	const [sheetOpen, setSheetOpen] = useState(false)
	const [editing, setEditing] = useState<Grade | null>(null)

	// Dropdown data
	const [institutions, setInstitutions] = useState<Array<{ id: string; institution_code: string; name: string; counselling_code: string | null; myjkkn_institution_ids: string[] }>>([])
	// Result status options
	const resultStatusOptions = ['PASS', 'FAIL', 'WITHHELD', 'ABSENT', 'DEBARRED', 'SHORTAGE OF ATTENDANCE', 'WITHDRAWAL OF COURSE', 'WITHDRAWAL', 'RE-APPEARANCE']
	const [regulations, setRegulations] = useState<Array<{ id: string; regulation_code: string; regulation_year: number }>>([])
	const [regulationsLoading, setRegulationsLoading] = useState(false)

	const [formData, setFormData] = useState({
		institutions_code: "",
		regulation_code: "",
		grade: "",
		grade_point: "",
		description: "",
		qualify: false,
		exclude_cgpa: false,
		order_index: "",
		is_absent: false,
		result_status: "",
	})
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Upload summary state
	const [uploadSummary, setUploadSummary] = useState<{
		total: number
		success: number
		failed: number
	}>({ total: 0, success: 0, failed: 0 })

	const [importErrors, setImportErrors] = useState<Array<{
		row: number
		grade: string
		grade_point: string
		errors: string[]
	}>>([])

	const [errorPopupOpen, setErrorPopupOpen] = useState(false)

	const resetForm = () => {
		// Auto-fill institution_code from context if available
		const autoInstitutionCode = getInstitutionCodeForCreate() || ""
		setFormData({
			institutions_code: autoInstitutionCode,
			regulation_code: "",
			grade: "",
			grade_point: "",
			description: "",
			qualify: false,
			exclude_cgpa: false,
			order_index: "",
			is_absent: false,
			result_status: "",
		})
		setErrors({})
		setEditing(null)
	}

	const handleSort = (c: string) => {
		if (sortColumn === c) setSortDirection(sortDirection === "asc" ? "desc" : "asc")
		else { setSortColumn(c); setSortDirection("asc") }
	}
	const getSortIcon = (c: string) => sortColumn !== c ? <ArrowUpDown className="h-3 w-3 text-muted-foreground" /> : (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)

	const filtered = useMemo(() => {
		const q = searchTerm.toLowerCase()
		const data = items
			.filter((i) => [i.institutions_code, i.regulation_code, i.grade, i.description, String(i.grade_point)].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))

		if (!sortColumn) return data
		return [...data].sort((a, b) => {
			const av = (a as any)[sortColumn]
			const bv = (b as any)[sortColumn]
			if (av === bv) return 0
			return sortDirection === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
		})
	}, [items, searchTerm, sortColumn, sortDirection])

	// Dynamic page size options based on total row count
	// 103 rows → 10 | 20 | 50 | 100 | All    (default 10)
	// 275 rows → 10 | 20 | 50 | 100 | 250 | All  (default 10)
	// 8 rows   → 10                            (default 10, shows all)
	const pageSizeOptions = useMemo(() => {
		const allSizes = [10, 20, 50, 100, 250, 500, 1000]
		const total = filtered.length
		// Only show sizes strictly less than total, then add "All"
		const options = allSizes.filter(s => s < total)
		// Always ensure 10 is present as first option
		if (!options.includes(10)) options.unshift(10)
		// Add "All" only when total > 10 (otherwise 10 already shows everything)
		if (total > 10) options.push(total)
		return options
	}, [filtered.length])

	const isShowAll = itemsPerPage >= filtered.length
	const effectivePerPage = isShowAll ? filtered.length || 1 : itemsPerPage
	const totalPages = Math.ceil(filtered.length / effectivePerPage) || 1
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage
	const pageItems = filtered.slice(startIndex, endIndex)
	useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, itemsPerPage])

	const openAdd = () => {
		// Add button always works - user selects institution in form if needed
		resetForm()
		setSheetOpen(true)
	}
	const openEdit = (row: Grade) => {
		setEditing(row)
		setFormData({
			institutions_code: row.institutions_code,
			regulation_code: row.regulation_code,
			grade: row.grade,
			grade_point: String(row.grade_point),
			description: row.description,
			qualify: row.qualify,
			exclude_cgpa: row.exclude_cgpa,
			order_index: row.order_index !== null ? String(row.order_index) : "",
			is_absent: row.is_absent,
			result_status: row.result_status || "",
		})
		setSheetOpen(true)
	}

	const validate = () => {
		const e: Record<string, string> = {}
		if (!formData.institutions_code.trim()) e.institutions_code = "Required"
		if (!formData.regulation_code) e.regulation_code = "Required"
		if (!formData.grade.trim()) e.grade = "Required"
		if (formData.grade_point === '' || formData.grade_point === null || formData.grade_point === undefined) e.grade_point = "Required"
		if (!formData.description.trim()) e.description = "Required"

		const gp = Number(formData.grade_point)
		if (!e.grade_point && (isNaN(gp) || gp < 0 || gp > 10)) e.grade_point = "Must be between 0 and 10"

		// Order index validation (optional but must be non-negative integer if provided)
		if (formData.order_index !== '' && formData.order_index !== null && formData.order_index !== undefined) {
			const orderIdx = Number(formData.order_index)
			if (isNaN(orderIdx) || orderIdx < 0 || !Number.isInteger(orderIdx)) {
				e.order_index = "Must be a non-negative integer"
			}
		}

		setErrors(e)
		return Object.keys(e).length === 0
	}

	const [saving, setSaving] = useState(false)
	const save = async () => {
		if (!validate()) return
		try {
			setSaving(true)
			const payload = {
				institutions_code: formData.institutions_code,
				regulation_code: formData.regulation_code,
				grade: formData.grade,
				grade_point: Number(formData.grade_point),
				description: formData.description,
				qualify: formData.qualify,
				exclude_cgpa: formData.exclude_cgpa,
				order_index: formData.order_index !== '' ? Number(formData.order_index) : null,
				is_absent: formData.is_absent,
				result_status: formData.result_status && formData.result_status !== 'none' ? formData.result_status : null,
			}
			if (editing) {
				const res = await fetch('/api/grading/grades', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...payload }) })
				if (!res.ok) {
					const errorData = await res.json()
					throw new Error(errorData.error || 'Update failed')
				}
				const updated = await res.json()
				setItems((p) => p.map((x) => x.id === editing.id ? updated : x))
			} else {
				const res = await fetch('/api/grading/grades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
				if (!res.ok) {
					const errorData = await res.json()
					throw new Error(errorData.error || 'Create failed')
				}
				const created = await res.json()
				setItems((p) => [created, ...p])
			}
			setSheetOpen(false)
			resetForm()
		} catch (e) {
			console.error(e)
			const errorMessage = e instanceof Error ? e.message : 'Failed to save grade'
			alert(errorMessage)
		} finally {
			setSaving(false)
		}
	}

	const remove = async (id: string) => {
		try {
			const res = await fetch(`/api/grading/grades?id=${id}`, { method: 'DELETE' })
			if (!res.ok) throw new Error('Delete failed')
			setItems((p) => p.filter((x) => x.id !== id))
		} catch (e) {
			console.error(e)
			alert('Failed to delete grade')
		}
	}

	const handleDownload = () => {
		const json = JSON.stringify(filtered, null, 2)
		const blob = new Blob([json], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `grades_${new Date().toISOString().split('T')[0]}.json`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)

		toast({
			title: '✅ Export Successful',
			description: `${filtered.length} grades exported to JSON.`,
			className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
		})
	}

	const handleExport = () => {
		const excelData = filtered.map(r => ({
			'Institution Code': r.institutions_code,
			'Regulation Code': r.regulation_code,
			'Grade': r.grade,
			'Grade Point': r.grade_point,
			'Description': r.description,
			'Qualify': r.qualify ? 'Pass' : 'Fail',
			'Exclude CGPA': r.exclude_cgpa ? 'Yes' : 'No',
			'Order Index': r.order_index ?? '',
			'Is Absent': r.is_absent ? 'Yes' : 'No',
			'Result Status': r.result_status || '',
			'Created': new Date(r.created_at).toISOString().split('T')[0]
		}))
		const ws = XLSX.utils.json_to_sheet(excelData)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Grades')
		XLSX.writeFile(wb, `grades_export_${new Date().toISOString().split('T')[0]}.xlsx`)

		toast({
			title: '✅ Export Successful',
			description: `${filtered.length} grades exported to Excel.`,
			className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
		})
	}

	const handleTemplateExport = async () => {
		// Ensure reference data is loaded
		let currentInstitutions = institutions
		let currentRegulations: Array<{ id: string; regulation_code: string; regulation_year: number }> = []

		toast({
			title: '⏳ Loading Reference Data',
			description: 'Fetching latest reference data from MyJKKN...',
			className: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200'
		})

		try {
			// Fetch institutions if not already loaded
			if (institutions.length === 0) {
				const resInst = await fetch('/api/master/institutions')
				if (resInst.ok) {
					const dataInst = await resInst.json()
					currentInstitutions = dataInst.filter((i: any) => i.is_active).map((i: any) => ({
						id: i.id,
						institution_code: i.institution_code,
						name: i.name,
						counselling_code: i.counselling_code || null,
						myjkkn_institution_ids: i.myjkkn_institution_ids || []
					}))
					setInstitutions(currentInstitutions)
				}
			}

			// Fetch ALL regulations from MyJKKN API (not filtered by institution for template)
			const resReg = await fetch('/api/myjkkn/regulations?limit=1000&is_active=true')
			if (resReg.ok) {
				const response = await resReg.json()
				const dataReg = response.data || response || []
				currentRegulations = dataReg.filter((r: any) => r.is_active !== false).map((r: any) => ({
					id: r.id,
					regulation_code: r.regulation_code,
					regulation_year: r.effective_year || r.regulation_year
				}))
			}
		} catch (error) {
			console.error('Error fetching reference data:', error)
		}

		const wb = XLSX.utils.book_new()

		// Sheet 1: Template with sample row (using codes, not IDs)
		const sample = [{
			'Institution Code *': 'JKKN',
			'Regulation Code *': 'REG-2024',
			'Grade *': 'O',
			'Grade Point *': 10,
			'Min Mark *': 90,
			'Max Mark *': 100,
			'Description *': 'Outstanding',
			'Qualify': 'Pass',
			'Exclude CGPA': 'No',
			'Order Index': 1,
			'Is Absent': 'No',
			'Result Status': 'Pass'
		}]

		const wsTemplate = XLSX.utils.json_to_sheet(sample)
		wsTemplate['!cols'] = [
			{ wch: 20 }, // Institution Code
			{ wch: 20 }, // Regulation Code
			{ wch: 10 }, // Grade
			{ wch: 15 }, // Grade Point
			{ wch: 12 }, // Min Mark
			{ wch: 12 }, // Max Mark
			{ wch: 35 }, // Description
			{ wch: 12 }, // Qualify
			{ wch: 15 }, // Exclude CGPA
			{ wch: 12 }, // Order Index
			{ wch: 12 }, // Is Absent
			{ wch: 15 }  // Result Status
		]
		XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template')

		// Sheet 2: Unified Reference Sheet with all lookup data
		const referenceData: any[] = []

		// Institutions Section
		referenceData.push({ 'Type': '=== INSTITUTIONS ===', 'Code': '', 'Name/Details': '', 'Additional Info': '' })
		currentInstitutions.forEach(inst => {
			referenceData.push({
				'Type': 'Institution',
				'Code': inst.institution_code,
				'Name/Details': inst.name,
				'Additional Info': ''
			})
		})
		if (currentInstitutions.length === 0) {
			referenceData.push({ 'Type': 'Institution', 'Code': 'No data available', 'Name/Details': '', 'Additional Info': '' })
		}
		referenceData.push({ 'Type': '', 'Code': '', 'Name/Details': '', 'Additional Info': '' }) // Blank separator

		// Regulations Section
		referenceData.push({ 'Type': '=== REGULATIONS ===', 'Code': '', 'Name/Details': '', 'Additional Info': '' })
		currentRegulations.forEach(reg => {
			referenceData.push({
				'Type': 'Regulation',
				'Code': reg.regulation_code,
				'Name/Details': `Year ${reg.regulation_year}`,
				'Additional Info': `ID: ${reg.id}`
			})
		})
		if (currentRegulations.length === 0) {
			referenceData.push({ 'Type': 'Regulation', 'Code': 'No data available', 'Name/Details': '', 'Additional Info': '' })
		}

		const wsReference = XLSX.utils.json_to_sheet(referenceData)
		wsReference['!cols'] = [
			{ wch: 20 }, // Type
			{ wch: 25 }, // Code
			{ wch: 40 }, // Name/Details
			{ wch: 20 }  // Additional Info
		]
		XLSX.utils.book_append_sheet(wb, wsReference, 'Reference Data')

		// Export file
		XLSX.writeFile(wb, `grades_template_${new Date().toISOString().split('T')[0]}.xlsx`)

		toast({
			title: '✅ Template Downloaded',
			description: 'Grades upload template with unified reference data has been downloaded successfully.',
			className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
		})
	}

	const handleImport = () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.json,.csv,.xlsx,.xls'
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (!file) return
			try {
				let rows: Partial<Grade>[] = []
				if (file.name.endsWith('.json')) {
					rows = JSON.parse(await file.text())
				} else {
					const data = new Uint8Array(await file.arrayBuffer())
					const wb = XLSX.read(data, { type: 'array' })
					const ws = wb.Sheets[wb.SheetNames[0]]
					const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
					rows = json.map(j => ({
						institutions_code: String(j['Institution Code *'] || j['Institution Code'] || ''),
						regulation_code: String(j['Regulation Code *'] || j['Regulation Code'] || ''),
						grade: String(j['Grade *'] || j['Grade'] || ''),
						grade_point: Number(j['Grade Point *'] || j['Grade Point'] || 0),
						description: String(j['Description *'] || j['Description'] || ''),
						qualify: String(j['Qualify'] || '').toLowerCase() === 'pass' || String(j['Qualify'] || '').toLowerCase() === 'true',
						exclude_cgpa: String(j['Exclude CGPA'] || '').toLowerCase() === 'yes' || String(j['Exclude CGPA'] || '').toLowerCase() === 'true',
						order_index: j['Order Index'] !== undefined && j['Order Index'] !== '' ? Number(j['Order Index']) : null,
						is_absent: String(j['Is Absent'] || '').toLowerCase() === 'yes' || String(j['Is Absent'] || '').toLowerCase() === 'true',
						result_status: String(j['Result Status'] || '') || null
					}))
				}

				// Filter out rows with missing required fields (using regulation_code now)
				const mapped = rows.filter(r => r.institutions_code && r.regulation_code && r.grade && r.grade_point !== undefined && r.description)

				if (mapped.length === 0) {
					alert('No valid rows found. Ensure all required fields are provided.')
					return
				}

				// Upload with row tracking
				setLoading(true)
				let successCount = 0
				let errorCount = 0
				const uploadErrors: Array<{
					row: number
					grade: string
					grade_point: string
					errors: string[]
				}> = []

				for (let i = 0; i < mapped.length; i++) {
					const gradeItem = mapped[i]
					const rowNumber = i + 2 // +2 for header row in Excel

					const payload = {
						institutions_code: gradeItem.institutions_code,
						regulation_code: gradeItem.regulation_code,
						grade: gradeItem.grade,
						grade_point: gradeItem.grade_point,
						description: gradeItem.description,
						qualify: gradeItem.qualify ?? false,
						exclude_cgpa: gradeItem.exclude_cgpa ?? false,
						order_index: (gradeItem as any).order_index ?? null,
						is_absent: (gradeItem as any).is_absent ?? false,
						result_status: (gradeItem as any).result_status ?? null
					}

					try {
						const response = await fetch('/api/grading/grades', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(payload)
						})

						if (response.ok) {
							const savedGrade = await response.json()
							setItems(prev => [savedGrade, ...prev])
							successCount++
						} else {
							const errorData = await response.json()
							errorCount++
							uploadErrors.push({
								row: rowNumber,
								grade: gradeItem.grade || 'N/A',
								grade_point: String(gradeItem.grade_point) || 'N/A',
								errors: [errorData.error || 'Failed to save grade']
							})
						}
					} catch (error) {
						errorCount++
						uploadErrors.push({
							row: rowNumber,
							grade: gradeItem.grade || 'N/A',
							grade_point: String(gradeItem.grade_point) || 'N/A',
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

				// Show error dialog with upload summary
				setImportErrors(uploadErrors)
				setErrorPopupOpen(true)

				// Show appropriate toast message
				if (successCount > 0 && errorCount === 0) {
					toast({
						title: '✅ Upload Complete',
						description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} (${successCount} grade${successCount > 1 ? 's' : ''}) to the database.`,
						className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
						duration: 5000,
					})
				} else if (successCount > 0 && errorCount > 0) {
					toast({
						title: '⚠️ Partial Upload Success',
						description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: ${successCount} successful, ${errorCount} failed. View error details in the dialog.`,
						className: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
						duration: 6000,
					})
				} else if (errorCount > 0) {
					toast({
						title: '❌ Upload Failed',
						description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: 0 successful, ${errorCount} failed. View error details in the dialog.`,
						variant: 'destructive',
						className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
						duration: 6000,
					})
				}
			} catch (err) {
				console.error(err)
				alert('Import failed. Please check your file format.')
			}
		}
		input.click()
	}

	const fetchGrades = async () => {
		try {
			setLoading(true)
			// Use institution filter for multi-tenant data access
			const url = appendToUrl('/api/grading/grades')
			const res = await fetch(url)
			if (!res.ok) throw new Error('Fetch failed')
			const data = await res.json()
			setItems(data)
		} catch (e) {
			console.error(e)
			alert('Failed to fetch grades')
		} finally {
			setLoading(false)
		}
	}

	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/master/institutions?local_only=true')
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.filter((i: any) => i.is_active).map((i: any) => ({
					id: i.id,
					institution_code: i.institution_code,
					name: i.name,
					counselling_code: i.counselling_code || null,
					myjkkn_institution_ids: i.myjkkn_institution_ids || []
				})))
			}
		} catch (e) {
			console.error('Failed to fetch institutions:', e)
		}
	}

	// Fetch regulations from MyJKKN API using hook (two-step lookup with client-side filtering)
	const fetchRegulations = useCallback(async (institutionCode?: string) => {
		try {
			setRegulationsLoading(true)
			setRegulations([]) // Clear previous regulations

			// Find institution and use myjkkn_institution_ids array directly (per CLAUDE.md)
			let myjkknIds: string[] = []
			if (institutionCode) {
				const institution = institutions.find(i => i.institution_code === institutionCode)
				myjkknIds = institution?.myjkkn_institution_ids || []

				// Race condition fallback: if institutions not loaded yet, fetch directly
				if (myjkknIds.length === 0) {
					const r = await fetch('/api/master/institutions?local_only=true')
					if (r.ok) {
						const data = await r.json()
						const inst = data.find((i: any) => i.institution_code === institutionCode && i.is_active)
						myjkknIds = inst?.myjkkn_institution_ids || []
					}
				}
			}

			// Use hook to fetch regulations filtered by institution MyJKKN UUIDs
			const regs = await fetchMyJKKNRegulations(myjkknIds.length > 0 ? myjkknIds : undefined)

			setRegulations(regs.map(r => ({
				id: String(r.id),
				regulation_code: r.regulation_code,
				regulation_year: r.regulation_year || r.effective_year || 0
			})))
		} catch (e) {
			console.error('[Grades] Failed to fetch regulations from MyJKKN:', e)
		} finally {
			setRegulationsLoading(false)
		}
	}, [institutions, fetchMyJKKNRegulations])

	// Load data when institution filter is ready
	useEffect(() => {
		if (isReady) {
			fetchGrades()
			fetchInstitutions()
		}
	}, [isReady, filter])

	// Fetch regulations when institution changes (filtered by counselling_code)
	useEffect(() => {
		if (formData.institutions_code) {
			fetchRegulations(formData.institutions_code)
		} else {
			// Clear regulations when no institution is selected
			setRegulations([])
		}
	}, [formData.institutions_code, fetchRegulations])

	return (

		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
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
									<BreadcrumbPage>Grades</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Scorecard Section */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold font-grotesk tracking-tight">{items.length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Grades</p>
									</div>
									<Award className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold font-grotesk tracking-tight text-green-600 dark:text-green-400">{items.filter(i=>i.qualify).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Qualifying</p>
									</div>
									<CheckCircle2 className="h-5 w-5 text-green-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold font-grotesk tracking-tight text-amber-600 dark:text-amber-400">{items.filter(i=>!i.qualify).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Non-Qualifying</p>
									</div>
									<XOctagon className="h-5 w-5 text-amber-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold font-grotesk tracking-tight text-blue-600 dark:text-blue-400">{items.filter(i=>{ const d=new Date(i.created_at); const n=new Date(); return d.getMonth()===n.getMonth() && d.getFullYear()===n.getFullYear() }).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Added This Month</p>
									</div>
									<CalendarPlus className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

				<TooltipProvider delayDuration={300}>
					<Card className="flex-1 flex flex-col min-h-0">
						<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
							<div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
								<div className="flex items-center gap-3">
									<div>
										<h2 className="text-base font-semibold font-grotesk">Grades</h2>
										<p className="text-xs text-muted-foreground">Manage grade definitions and point mappings</p>
									</div>
								</div>

								<div className="flex items-center gap-2 w-full lg:w-auto">
									<div className="relative flex-1 lg:w-[260px]">
										<Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
										<Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search grades, points, descriptions..." className="pl-8 h-8 text-sm" />
									</div>

									<Tooltip>
										<TooltipTrigger asChild>
											<Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={fetchGrades} disabled={loading}>
												<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Refresh data</TooltipContent>
									</Tooltip>

									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="outline" size="sm" className="h-8 text-sm px-3 shrink-0">
												<Download className="h-3.5 w-3.5 mr-1.5" />
												Export
												<ChevronDown className="h-3 w-3 ml-1 opacity-50" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onClick={handleTemplateExport}>
												<FileSpreadsheet className="h-4 w-4 mr-2" />
												Download Template
											</DropdownMenuItem>
											<DropdownMenuItem onClick={handleExport}>
												<Download className="h-4 w-4 mr-2" />
												Export to Excel
											</DropdownMenuItem>
											<DropdownMenuItem onClick={handleDownload}>
												<Download className="h-4 w-4 mr-2" />
												Export to JSON
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>

									<Button variant="outline" size="sm" className="h-8 text-sm px-3 shrink-0" onClick={handleImport}>
										<Upload className="h-3.5 w-3.5 mr-1.5" />
										Import
									</Button>

									<Button size="sm" className="h-8 text-sm px-4 shrink-0" onClick={openAdd}>
										<PlusCircle className="h-3.5 w-3.5 mr-1.5" />
										Add Grade
									</Button>
								</div>
							</div>
						</CardHeader>

						<CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col min-h-0">
							<div className="rounded-md border flex-1 overflow-hidden mt-3" style={{ minHeight: "380px", maxHeight: "520px" }}>
								<div className="h-full overflow-auto">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-muted/50">
											<TableRow className="hover:bg-transparent">
												{mustSelectInstitution && (
													<TableHead className="w-[120px] text-xs font-semibold"><Button variant="ghost" size="sm" onClick={() => handleSort("institutions_code")} className="h-auto p-0 font-semibold hover:bg-transparent text-xs">Institution <span className="ml-1">{getSortIcon("institutions_code")}</span></Button></TableHead>
												)}
												<TableHead className="w-[80px] text-xs font-semibold"><Button variant="ghost" size="sm" onClick={() => handleSort("grade")} className="h-auto p-0 font-semibold hover:bg-transparent text-xs">Grade <span className="ml-1">{getSortIcon("grade")}</span></Button></TableHead>
												<TableHead className="w-[100px] text-xs font-semibold"><Button variant="ghost" size="sm" onClick={() => handleSort("grade_point")} className="h-auto p-0 font-semibold hover:bg-transparent text-xs">Grade Point <span className="ml-1">{getSortIcon("grade_point")}</span></Button></TableHead>
												<TableHead className="text-xs font-semibold">Description</TableHead>
												<TableHead className="w-[120px] text-xs font-semibold"><Button variant="ghost" size="sm" onClick={() => handleSort("regulation_code")} className="h-auto p-0 font-semibold hover:bg-transparent text-xs">Regulation <span className="ml-1">{getSortIcon("regulation_code")}</span></Button></TableHead>
												<TableHead className="w-[90px] text-xs font-semibold"><Button variant="ghost" size="sm" onClick={() => handleSort("qualify")} className="h-auto p-0 font-semibold hover:bg-transparent text-xs">Status <span className="ml-1">{getSortIcon("qualify")}</span></Button></TableHead>
												<TableHead className="w-[90px] text-xs font-semibold text-center">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{loading ? (
												<TableRow><TableCell colSpan={mustSelectInstitution ? 8 : 7} className="h-32 text-center">
													<div className="flex flex-col items-center gap-2 text-muted-foreground">
														<RefreshCw className="h-5 w-5 animate-spin" />
														<span className="text-sm">Loading grades...</span>
													</div>
												</TableCell></TableRow>
											) : pageItems.length ? (
												<>
													{pageItems.map((row) => (
														<TableRow key={row.id} className="group">
															{mustSelectInstitution && (
																<TableCell className="text-sm font-medium">{row.institutions_code}</TableCell>
															)}
															<TableCell className="text-sm font-semibold font-grotesk">{row.grade}</TableCell>
															<TableCell className="text-sm font-grotesk tabular-nums">{row.grade_point}</TableCell>
															<TableCell className="text-sm">{row.description.length > 40 ? row.description.substring(0, 40) + '...' : row.description}</TableCell>
															<TableCell className="text-sm"><Badge variant="outline" className="text-xs font-normal">{row.regulation_code}</Badge></TableCell>
															<TableCell>
																{row.qualify ? (
																	<Badge className="text-xs bg-green-100 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">Pass</Badge>
																) : (
																	<Badge variant="destructive" className="text-xs">Fail</Badge>
																)}
															</TableCell>
															<TableCell>
																<div className="flex items-center justify-center">
																	<DropdownMenu>
																		<DropdownMenuTrigger asChild>
																			<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
																				<MoreHorizontal className="h-4 w-4" />
																			</Button>
																		</DropdownMenuTrigger>
																		<DropdownMenuContent align="end" className="w-36">
																			<DropdownMenuItem onClick={() => openEdit(row)}>
																				<Edit className="h-3.5 w-3.5 mr-2" />
																				Edit
																			</DropdownMenuItem>
																			<DropdownMenuSeparator />
																			<DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20" onClick={() => setDeleteTarget(row)}>
																				<Trash2 className="h-3.5 w-3.5 mr-2" />
																				Delete
																			</DropdownMenuItem>
																		</DropdownMenuContent>
																	</DropdownMenu>
																</div>
															</TableCell>
														</TableRow>
													))}
												</>
											) : (
												<TableRow><TableCell colSpan={mustSelectInstitution ? 8 : 7} className="h-32 text-center">
													<div className="flex flex-col items-center gap-2 text-muted-foreground">
														<Award className="h-8 w-8 opacity-20" />
														<span className="text-sm">No grades found</span>
														<span className="text-xs">Add a grade to get started</span>
													</div>
												</TableCell></TableRow>
											)}
										</TableBody>
									</Table>
								</div>
							</div>

							<div className="flex items-center justify-between pt-3">
								<div className="flex items-center gap-3">
									<p className="text-sm text-muted-foreground tabular-nums">
										{filtered.length === 0 ? 'No results' : `${startIndex + 1}\u2013${Math.min(endIndex, filtered.length)} of ${filtered.length}`}
									</p>
									<div className="flex items-center gap-1.5">
										<span className="text-xs text-muted-foreground">Rows</span>
										<Select value={String(itemsPerPage)} onValueChange={(v) => setItemsPerPage(Number(v))}>
											<SelectTrigger className="h-7 w-[70px] text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{pageSizeOptions.map((size) => (
													<SelectItem key={size} value={String(size)}>
														{size === filtered.length ? 'All' : size}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
								<div className="flex items-center gap-1">
									<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 w-7 p-0"><ChevronLeft className="h-3.5 w-3.5" /></Button>
									<span className="text-xs text-muted-foreground px-2 tabular-nums">{currentPage} / {totalPages}</span>
									<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-7 w-7 p-0"><ChevronRight className="h-3.5 w-3.5" /></Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</TooltipProvider>

				{/* Delete Confirmation Dialog */}
				<AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete Grade</AlertDialogTitle>
							<AlertDialogDescription>
								Are you sure you want to delete grade <strong>{deleteTarget?.grade}</strong> ({deleteTarget?.description})?
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={() => { if (deleteTarget) remove(deleteTarget.id); setDeleteTarget(null) }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
				</div>
				<AppFooter />
			</SidebarInset>

			<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
				<SheetContent className="sm:max-w-[720px] overflow-y-auto">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle className="text-lg font-semibold font-grotesk">
							{editing ? "Edit Grade" : "Add Grade"}
						</SheetTitle>
						<p className="text-sm text-muted-foreground">
							{editing ? "Update grade information and settings" : "Define a new grade with point value and classification"}
						</p>
					</SheetHeader>

					<div className="mt-6 space-y-8">
						{/* Basic Information */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Show institution field when "All Institutions" is selected or no specific institution is filtered */}
								{(mustSelectInstitution || !shouldFilter || !institutionCode) ? (
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Institution Code <span className="text-red-500">*</span></Label>
										<Select value={formData.institutions_code} onValueChange={(v) => setFormData({ ...formData, institutions_code: v, regulation_code: '' })}>
											<SelectTrigger className={`h-10 ${errors.institutions_code ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Select institution" />
											</SelectTrigger>
											<SelectContent>
												{institutions.map((inst) => (
													<SelectItem key={inst.id} value={inst.institution_code}>
														{inst.institution_code} - {inst.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{errors.institutions_code && <p className="text-xs text-destructive">{errors.institutions_code}</p>}
									</div>
								) : null}
								<div className="space-y-2">
									<Label className="text-sm font-semibold">Regulation *</Label>
									<Select
										value={formData.regulation_code}
										onValueChange={(v) => setFormData({ ...formData, regulation_code: v })}
										disabled={!formData.institutions_code || regulationsLoading}
									>
										<SelectTrigger className={`h-10 ${errors.regulation_code ? 'border-destructive' : ''} ${!formData.institutions_code ? 'bg-muted' : ''}`}>
											<SelectValue placeholder={
												!formData.institutions_code
													? "Select institution first"
													: regulationsLoading
														? "Loading regulations..."
														: "Select regulation"
											} />
										</SelectTrigger>
										<SelectContent>
											{regulations.map((reg) => (
												<SelectItem key={reg.regulation_code} value={reg.regulation_code}>
													{reg.regulation_code}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{errors.regulation_code && <p className="text-xs text-destructive">{errors.regulation_code}</p>}
									{!formData.institutions_code && (
										<p className="text-xs text-muted-foreground">Select an institution to see available regulations from MyJKKN</p>
									)}
								</div>
								<div className="space-y-2">
									<Label className="text-sm font-semibold">Grade *</Label>
									<Input value={formData.grade} onChange={(e) => setFormData({ ...formData, grade: e.target.value })} className={`h-10 ${errors.grade ? 'border-destructive' : ''}`} placeholder="e.g., O, A+, A, B+" />
									{errors.grade && <p className="text-xs text-destructive">{errors.grade}</p>}
								</div>
								<div className="space-y-2">
									<Label className="text-sm font-semibold">Grade Point *</Label>
									<Input type="number" min="0" max="10" step="0.01" value={formData.grade_point} onChange={(e) => setFormData({ ...formData, grade_point: e.target.value })} className={`h-10 ${errors.grade_point ? 'border-destructive' : ''}`} placeholder="e.g., 10, 9.5, 8" />
									{errors.grade_point && <p className="text-xs text-destructive">{errors.grade_point}</p>}
								</div>
								<div className="space-y-2 md:col-span-2">
									<Label className="text-sm font-semibold">Description *</Label>
									<Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className={`min-h-[80px] ${errors.description ? 'border-destructive' : ''}`} placeholder="Description of this grade" />
									{errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
								</div>
							</div>
						</div>

						{/* Settings */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2 border-t">Settings</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="flex items-center gap-3">
									<Label htmlFor="qualify" className="text-sm font-semibold">Qualify</Label>
									<Switch
										id="qualify"
										checked={formData.qualify}
										onCheckedChange={(v) => setFormData({ ...formData, qualify: v })}
									/>
									<span className={`text-sm font-medium ${formData.qualify ? 'text-green-600' : 'text-red-500'}`}>
										{formData.qualify ? 'Pass' : 'Fail'}
									</span>
								</div>
								<div className="flex items-center gap-3">
									<Label htmlFor="exclude_cgpa" className="text-sm font-semibold">Exclude CGPA</Label>
									<Switch
										id="exclude_cgpa"
										checked={formData.exclude_cgpa}
										onCheckedChange={(v) => setFormData({ ...formData, exclude_cgpa: v })}
									/>
									<span className={`text-sm font-medium ${formData.exclude_cgpa ? 'text-orange-600' : 'text-gray-500'}`}>
										{formData.exclude_cgpa ? 'Yes' : 'No'}
									</span>
								</div>
								<div className="flex items-center gap-3">
									<Label htmlFor="is_absent" className="text-sm font-semibold">Is Absent</Label>
									<Switch
										id="is_absent"
										checked={formData.is_absent}
										onCheckedChange={(v) => setFormData({ ...formData, is_absent: v })}
									/>
									<span className={`text-sm font-medium ${formData.is_absent ? 'text-orange-600' : 'text-gray-500'}`}>
										{formData.is_absent ? 'Yes' : 'No'}
									</span>
								</div>
								<div className="space-y-2">
									<Label className="text-sm font-semibold">Order Index</Label>
									<Input type="number" min="0" value={formData.order_index} onChange={(e) => setFormData({ ...formData, order_index: e.target.value })} className={`h-10 ${errors.order_index ? 'border-destructive' : ''}`} placeholder="e.g., 1, 2, 3" />
									{errors.order_index && <p className="text-xs text-destructive">{errors.order_index}</p>}
								</div>
								<div className="space-y-2 md:col-span-2">
									<Label className="text-sm font-semibold">Result Status</Label>
									<Select value={formData.result_status} onValueChange={(v) => setFormData({ ...formData, result_status: v })}>
										<SelectTrigger className="h-10">
											<SelectValue placeholder="Select result status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">None</SelectItem>
											{resultStatusOptions.map((status) => (
												<SelectItem key={status} value={status}>{status}</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						</div>

						{/* Actions */}
						<div className="flex justify-end gap-3 pt-6 border-t">
							<Button variant="outline" size="sm" className="h-10 px-6" onClick={() => { setSheetOpen(false); resetForm() }} disabled={saving}>Cancel</Button>
							<Button size="sm" className="h-10 px-6" onClick={save} disabled={saving}>
								{saving ? (editing ? 'Updating…' : 'Creating…') : (editing ? 'Update Grade' : 'Create Grade')}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Upload Results Dialog */}
			<AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
				<AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
					<AlertDialogHeader>
						<div className="flex items-center gap-3">
							<div className={`h-10 w-10 rounded-full flex items-center justify-center ${
								importErrors.length === 0
									? 'bg-green-100 dark:bg-green-900/20'
									: 'bg-red-100 dark:bg-red-900/20'
							}`}>
								{importErrors.length === 0 ? (
									<Award className="h-5 w-5 text-green-600 dark:text-green-400" />
								) : (
									<XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
								)}
							</div>
							<div>
								<AlertDialogTitle className={`text-xl font-bold ${
									importErrors.length === 0
										? 'text-green-600 dark:text-green-400'
										: 'text-red-600 dark:text-red-400'
								}`}>
									{importErrors.length === 0 ? 'Upload Successful' : 'Data Validation Errors'}
								</AlertDialogTitle>
								<AlertDialogDescription className="text-sm text-muted-foreground mt-1">
									{importErrors.length === 0
										? 'All grades have been successfully uploaded to the database'
										: 'Please fix the following errors before importing the data'}
								</AlertDialogDescription>
							</div>
						</div>
					</AlertDialogHeader>

					<div className="space-y-4">
						{/* Upload Summary Cards */}
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

						{/* Error Summary - Only show if there are errors */}
						{importErrors.length > 0 && (
							<>
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
														{error.grade} - {error.grade_point}
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

						{/* Success Message - Only show if no errors */}
						{importErrors.length === 0 && uploadSummary.total > 0 && (
							<div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-4">
								<div className="flex items-center gap-2">
									<Award className="h-5 w-5 text-green-600 dark:text-green-400" />
									<span className="font-semibold text-green-800 dark:text-green-200">
										All {uploadSummary.success} grade{uploadSummary.success > 1 ? 's' : ''} uploaded successfully
									</span>
								</div>
							</div>
						)}

						{/* Helpful Tips */}
						<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
							<div className="flex items-start gap-2">
								<div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mt-0.5">
									<span className="text-xs font-bold text-blue-600 dark:text-blue-400">i</span>
								</div>
								<div>
									<h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">Required Excel Format:</h4>
									<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
										<li>• <strong>Institution Code *</strong> (required): Must match existing institution code from Reference Data sheet</li>
										<li>• <strong>Regulation Code *</strong> (required): Must match existing regulation code from Reference Data sheet</li>
										<li>• <strong>Grade *</strong> (required): Grade value (e.g., O, A+, A, B+)</li>
										<li>• <strong>Grade Point *</strong> (required): Numeric value between 0 and 10</li>
										<li>• <strong>Min Mark *</strong> (required): Minimum mark value between 0 and 100</li>
										<li>• <strong>Max Mark *</strong> (required): Maximum mark value between 0 and 100</li>
										<li>• <strong>Description *</strong> (required): Description of the grade</li>
										<li>• <strong>Qualify</strong> (optional): Pass/Fail or true/false (default: Fail)</li>
										<li>• <strong>Exclude CGPA</strong> (optional): Yes/No or true/false (default: No)</li>
									</ul>
								</div>
							</div>
						</div>
					</div>

					<AlertDialogFooter>
						<AlertDialogAction onClick={() => setErrorPopupOpen(false)}>
							Close
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>

	)
}
