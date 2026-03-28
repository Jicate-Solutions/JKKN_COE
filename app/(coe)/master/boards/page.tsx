"use client"

import { useMemo, useState, useEffect } from "react"
import XLSX from "@/lib/utils/excel-compat"
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/common/use-toast"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useInstitutionField } from "@/hooks/use-institution-field"
import Link from "next/link"
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Clipboard, TrendingUp, FileSpreadsheet, RefreshCw, CheckCircle, XCircle, AlertTriangle, PlusCircle, MoreHorizontal, ChevronDown, Download, Upload } from "lucide-react"

interface Board {
	id: string
	institutions_id: string
	institution_code: string
	board_code: string
	board_name: string
	display_name: string | null
	board_type: string | null
	board_order: number | null
	is_active: boolean
	created_at: string
}

export default function BoardPage() {
	const { toast } = useToast()
	const {
		filter,
		shouldFilter,
		isReady,
		institutionCode,
		institutionId,
		appendToUrl,
		getInstitutionCodeForCreate,
		getInstitutionIdForCreate,
		mustSelectInstitution
	} = useInstitutionFilter()
	const { defaultInstitutionCode, availableInstitutions } = useInstitutionField()

	const [boards, setBoards] = useState<Board[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)

	const [sheetOpen, setSheetOpen] = useState(false)
	const [editing, setEditing] = useState<Board | null>(null)
	const [statusFilter, setStatusFilter] = useState("all")
	const [deleteTarget, setDeleteTarget] = useState<Board | null>(null)

	// Upload Summary State
	const [errorPopupOpen, setErrorPopupOpen] = useState(false)
	const [importErrors, setImportErrors] = useState<Array<{
		row: number
		board_code: string
		board_name: string
		errors: string[]
	}>>([])
	const [uploadSummary, setUploadSummary] = useState<{
		total: number
		success: number
		failed: number
	}>({ total: 0, success: 0, failed: 0 })

	// Form Data State
	const [formData, setFormData] = useState({
		institution_code: "",
		board_code: "",
		board_name: "",
		display_name: "",
		board_type: "",
		board_order: "",
		is_active: true,
	})
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Fetch boards with institution filter
	const fetchBoards = async () => {
		try {
			setLoading(true)
			const url = appendToUrl('/api/master/boards')
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error('Failed to fetch boards')
			}
			const data = await response.json()
			setBoards(data)
		} catch (error) {
			console.error('Error fetching boards:', error)
			setBoards([])
		} finally {
			setLoading(false)
		}
	}

	// Load data when institution filter is ready
	useEffect(() => {
		if (!isReady) return
		fetchBoards()
	}, [isReady, filter])

	// Validation
	const validate = () => {
		const e: Record<string, string> = {}

		if (!formData.institution_code.trim()) e.institution_code = "Institution is required"
		if (!formData.board_code.trim()) e.board_code = "Board code is required"
		if (!formData.board_name.trim()) e.board_name = "Board name is required"

		if (formData.board_code && !/^[A-Za-z0-9\-_]+$/.test(formData.board_code)) {
			e.board_code = "Board code can only contain letters, numbers, hyphens, and underscores"
		}

		if (formData.board_code && formData.board_code.length > 50) {
			e.board_code = "Board code must be 50 characters or less"
		}
		if (formData.board_name && formData.board_name.length > 255) {
			e.board_name = "Board name must be 255 characters or less"
		}
		if (formData.display_name && formData.display_name.length > 255) {
			e.display_name = "Display name must be 255 characters or less"
		}

		if (formData.board_order && (Number(formData.board_order) < 0 || Number(formData.board_order) > 999)) {
			e.board_order = "Board order must be between 0 and 999"
		}

		setErrors(e)
		return Object.keys(e).length === 0
	}

	// CREATE & UPDATE
	const save = async () => {
		if (!validate()) return

		try {
			setLoading(true)

			const selectedInstitution = availableInstitutions.find(item => item.institution_code === formData.institution_code)

			if (!selectedInstitution) {
				toast({
					title: "Error",
					description: "Selected institution not found. Please refresh and try again.",
					variant: "destructive",
				})
				setLoading(false)
				return
			}

			let payload = {
				...formData,
				institutions_id: selectedInstitution.id,
				board_order: formData.board_order ? Number(formData.board_order) : null
			}

			if (editing) {
				const response = await fetch('/api/master/boards', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: editing.id, ...payload }),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to update board')
				}

				const updated = await response.json()
				setBoards((prev) => prev.map((p) => (p.id === editing.id ? updated : p)))

				toast({
					title: "Board Updated",
					description: `${updated.board_name} has been successfully updated.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			} else {
				const response = await fetch('/api/master/boards', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to create board')
				}

				const created = await response.json()
				setBoards((prev) => [created, ...prev])

				toast({
					title: "Board Created",
					description: `${created.board_name} has been successfully created.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			}

			setSheetOpen(false)
			resetForm()
		} catch (error) {
			console.error('Error saving board:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to save board. Please try again.'
			toast({
				title: "Save Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoading(false)
		}
	}

	// DELETE
	const remove = async (id: string) => {
		try {
			setLoading(true)
			const boardName = boards.find(i => i.id === id)?.board_name || 'Board'

			const response = await fetch(`/api/master/boards?id=${id}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to delete board')
			}

			setBoards((prev) => prev.filter((p) => p.id !== id))

			toast({
				title: "Board Deleted",
				description: `${boardName} has been successfully deleted.`,
				className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
			})
		} catch (error) {
			console.error('Error deleting board:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to delete board. Please try again.'
			toast({
				title: "Delete Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoading(false)
		}
	}

	// Validation function for imported data
	const validateBoardData = (data: any, rowIndex: number) => {
		const errors: string[] = []

		if (!data.institution_code || data.institution_code.trim() === '') {
			errors.push('Institution code is required')
		}

		if (!data.board_code || data.board_code.trim() === '') {
			errors.push('Board code is required')
		} else if (data.board_code.length > 50) {
			errors.push('Board code must be 50 characters or less')
		}

		if (!data.board_name || data.board_name.trim() === '') {
			errors.push('Board name is required')
		} else if (data.board_name.length > 255) {
			errors.push('Board name must be 255 characters or less')
		}

		if (data.display_name && data.display_name.length > 255) {
			errors.push('Display name must be 255 characters or less')
		}

		if (data.is_active !== undefined && data.is_active !== null) {
			if (typeof data.is_active !== 'boolean') {
				const statusValue = String(data.is_active).toLowerCase()
				if (statusValue !== 'true' && statusValue !== 'false' && statusValue !== 'active' && statusValue !== 'inactive') {
					errors.push('Status must be true/false or Active/Inactive')
				}
			}
		}

		return errors
	}

	// Export to JSON
	const handleDownload = () => {
		const exportData = filtered.map(item => ({
			institution_code: item.institution_code,
			board_code: item.board_code,
			board_name: item.board_name,
			display_name: item.display_name,
			board_type: item.board_type,
			board_order: item.board_order,
			is_active: item.is_active,
			created_at: item.created_at
		}))

		const json = JSON.stringify(exportData, null, 2)
		const blob = new Blob([json], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `boards_${new Date().toISOString().split('T')[0]}.json`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	// Export to Excel
	const handleExport = () => {
		const excelData = filtered.map((r) => ({
			'Institution Code': r.institution_code,
			'Board Code': r.board_code,
			'Board Name': r.board_name,
			'Display Name': r.display_name || '',
			'Board Type': r.board_type || '',
			'Board Order': r.board_order || '',
			'Status': r.is_active ? 'Active' : 'Inactive',
			'Created': new Date(r.created_at).toISOString().split('T')[0],
		}))

		const ws = XLSX.utils.json_to_sheet(excelData)
		const colWidths = [
			{ wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 15 },
		]
		ws['!cols'] = colWidths

		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Boards')
		XLSX.writeFile(wb, `boards_export_${new Date().toISOString().split('T')[0]}.xlsx`)
	}

	// Template Export with Reference Sheets and Dropdown Validation
	const handleTemplateExport = async () => {
		const wb = XLSX.utils.book_new()

		const sample = [{
			'Institution Code *': '',
			'Board Code *': '',
			'Board Name *': '',
			'Display Name': '',
			'Board Type': '',
			'Board Order': '',
			'Status': 'Active'
		}]

		const ws = XLSX.utils.json_to_sheet(sample)
		const colWidths = [
			{ wch: 20 }, { wch: 20 }, { wch: 40 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 12 },
		]
		ws['!cols'] = colWidths

		const validations: any[] = []

		const instCodes = availableInstitutions.map(i => i.institution_code)
		if (instCodes.length > 0 && instCodes.join(',').length < 255) {
			validations.push({
				type: 'list',
				sqref: 'A2:A1000',
				formula1: `"${instCodes.join(',')}"`,
				showDropDown: true,
				showErrorMessage: true,
				errorTitle: 'Invalid Institution',
				error: 'Please select from the dropdown list',
			})
		}

		const boardTypes = ['National', 'State', 'International', 'Private', 'University']
		validations.push({
			type: 'list',
			sqref: 'E2:E1000',
			formula1: `"${boardTypes.join(',')}"`,
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Invalid Board Type',
			error: 'Select: National, State, International, Private, or University',
		})

		validations.push({
			type: 'list',
			sqref: 'G2:G1000',
			formula1: '"Active,Inactive"',
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Invalid Status',
			error: 'Select: Active or Inactive',
		})

		ws['!dataValidation'] = validations
		XLSX.utils.book_append_sheet(wb, ws, 'Template')

		const boardTypes2 = ['National', 'State', 'International', 'Private', 'University']
		const referenceData: any[] = []

		referenceData.push({ 'Type': '=== INSTITUTION CODES ===', 'Code': '', 'Name/Description': '' })
		availableInstitutions.forEach(inst => {
			referenceData.push({
				'Type': 'Institution',
				'Code': inst.institution_code,
				'Name/Description': inst.institution_name || 'N/A'
			})
		})

		referenceData.push({ 'Type': '=== BOARD TYPES ===', 'Code': '', 'Name/Description': '' })
		boardTypes2.forEach(type => {
			referenceData.push({ 'Type': 'Board Type', 'Code': type, 'Name/Description': type })
		})

		referenceData.push({ 'Type': '=== STATUS VALUES ===', 'Code': '', 'Name/Description': '' })
		;['Active', 'Inactive'].forEach(status => {
			referenceData.push({
				'Type': 'Status',
				'Code': status,
				'Name/Description': status === 'Active' ? 'Board is active' : 'Board is inactive'
			})
		})

		const wsRef = XLSX.utils.json_to_sheet(referenceData)
		wsRef['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 40 }]
		XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Codes')

		await XLSX.writeFile(wb, `boards_template_${new Date().toISOString().split('T')[0]}.xlsx`)
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
				let rows: Partial<Board>[] = []

				if (file.name.endsWith('.json')) {
					const text = await file.text()
					rows = JSON.parse(text)
				} else if (file.name.endsWith('.csv')) {
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
					const dataRows = lines.slice(1).map(line => {
						const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
						const row: Record<string, string> = {}
						headers.forEach((header, index) => {
							row[header] = values[index] || ''
						})
						return row
					})

					rows = dataRows.map(j => ({
						institution_code: String(j['Institution Code *'] || j['Institution Code'] || ''),
						board_code: String(j['Board Code *'] || j['Board Code'] || ''),
						board_name: String(j['Board Name *'] || j['Board Name'] || ''),
						display_name: String(j['Display Name'] || ''),
						board_type: String(j['Board Type'] || ''),
						board_order: j['Board Order'] ? Number(j['Board Order']) : null,
						is_active: String(j['Status'] || '').toLowerCase() === 'active'
					}))
				} else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
					const data = new Uint8Array(await file.arrayBuffer())
					const wb = XLSX.read(data, { type: 'array' })
					const ws = wb.Sheets[wb.SheetNames[0]]
					const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
					rows = json.map(j => ({
						institution_code: String(j['Institution Code *'] || j['Institution Code'] || ''),
						board_code: String(j['Board Code *'] || j['Board Code'] || ''),
						board_name: String(j['Board Name *'] || j['Board Name'] || ''),
						display_name: String(j['Display Name'] || ''),
						board_type: String(j['Board Type'] || ''),
						board_order: j['Board Order'] ? Number(j['Board Order']) : null,
						is_active: String(j['Status'] || '').toLowerCase() === 'active'
					}))
				}

				const now = new Date().toISOString()
				const validationErrors: Array<{
					row: number
					board_code: string
					board_name: string
					errors: string[]
				}> = []

				// Auto-fill institution from context for normal users
				const autoInstCode = getInstitutionCodeForCreate()

				const mapped = rows.map((r, index) => {
					const itemData = {
						id: String(Date.now() + Math.random()),
						institution_code: (r as any).institution_code || autoInstCode || '',
						board_code: r.board_code!,
						board_name: r.board_name!,
						display_name: r.display_name || null,
						board_type: r.board_type || null,
						board_order: r.board_order ?? null,
						is_active: r.is_active ?? true,
						created_at: now,
					}

					const errors = validateBoardData(itemData, index + 2)
					if (errors.length > 0) {
						validationErrors.push({
							row: index + 2,
							board_code: itemData.board_code || 'N/A',
							board_name: itemData.board_name || 'N/A',
							errors: errors
						})
					}

					return itemData
				}).filter(r => r.board_code && r.board_name) as Board[]

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
						title: "No Valid Data",
						description: "No valid data found in the file. Please check required fields.",
						variant: "destructive",
					})
					return
				}

				setLoading(true)
				let successCount = 0
				let errorCount = 0
				const uploadErrors: Array<{
					row: number
					board_code: string
					board_name: string
					errors: string[]
				}> = []

				for (let i = 0; i < mapped.length; i++) {
					const item = mapped[i]
					const rowNumber = i + 2

					try {
						const response = await fetch('/api/master/boards', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(item),
						})

						if (response.ok) {
							const savedItem = await response.json()
							setBoards(prev => [savedItem, ...prev])
							successCount++
						} else {
							const errorData = await response.json()
							errorCount++
							uploadErrors.push({
								row: rowNumber,
								board_code: item.board_code || 'N/A',
								board_name: item.board_name || 'N/A',
								errors: [errorData.error || 'Failed to save board']
							})
						}
					} catch (error) {
						errorCount++
						uploadErrors.push({
							row: rowNumber,
							board_code: item.board_code || 'N/A',
							board_name: item.board_name || 'N/A',
							errors: [error instanceof Error ? error.message : 'Network error']
						})
					}
				}

				setLoading(false)
				const totalRows = mapped.length

				setUploadSummary({
					total: totalRows,
					success: successCount,
					failed: errorCount
				})

				if (uploadErrors.length > 0) {
					setImportErrors(uploadErrors)
					setErrorPopupOpen(true)
				}

				if (successCount > 0 && errorCount === 0) {
					toast({
						title: "Upload Complete",
						description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} (${successCount} board${successCount > 1 ? 's' : ''}) to the database.`,
						className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
						duration: 5000,
					})
				} else if (successCount > 0 && errorCount > 0) {
					toast({
						title: "Partial Upload Success",
						description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: ${successCount} successful, ${errorCount} failed. View error details below.`,
						className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
						duration: 6000,
					})
				} else if (errorCount > 0) {
					toast({
						title: "Upload Failed",
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
					title: "Import Error",
					description: "Import failed. Please check your file format and try again.",
					variant: "destructive",
				})
			}
		}
		input.click()
	}

	const resetForm = () => {
		setFormData({
			institution_code: defaultInstitutionCode || "",
			board_code: "",
			board_name: "",
			display_name: "",
			board_type: "",
			board_order: "",
			is_active: true,
		})
		setErrors({})
		setEditing(null)
	}

	const openEdit = (board: Board) => {
		setEditing(board)
		setFormData({
			institution_code: board.institution_code,
			board_code: board.board_code,
			board_name: board.board_name,
			display_name: board.display_name || "",
			board_type: board.board_type || "",
			board_order: board.board_order?.toString() || "",
			is_active: board.is_active,
		})
		setSheetOpen(true)
	}

	// Filtering and sorting
	const filtered = useMemo(() => {
		let result = boards

		if (statusFilter !== "all") {
			result = result.filter(b => statusFilter === "active" ? b.is_active : !b.is_active)
		}

		if (searchTerm) {
			const term = searchTerm.toLowerCase()
			result = result.filter(b =>
				b.board_code.toLowerCase().includes(term) ||
				b.board_name.toLowerCase().includes(term) ||
				b.institution_code.toLowerCase().includes(term) ||
				(b.display_name && b.display_name.toLowerCase().includes(term)) ||
				(b.board_type && b.board_type.toLowerCase().includes(term))
			)
		}

		if (sortColumn) {
			result = [...result].sort((a, b) => {
				const aVal = (a as any)[sortColumn]
				const bVal = (b as any)[sortColumn]
				if (aVal == null) return 1
				if (bVal == null) return -1
				if (typeof aVal === 'string') {
					return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
				}
				return sortDirection === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1)
			})
		}

		return result
	}, [boards, searchTerm, statusFilter, sortColumn, sortDirection])

	const pageSizeOptions = useMemo(() => {
		const base = [10, 25, 50]
		if (filtered.length > 50) base.push(100)
		if (filtered.length > 100) base.push(filtered.length)
		return base
	}, [filtered.length])

	// Pagination
	const isShowAll = itemsPerPage >= filtered.length && filtered.length > 0
	const effectivePerPage = isShowAll ? filtered.length : itemsPerPage
	const totalPages = Math.ceil(filtered.length / effectivePerPage) || 1
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage
	const paginatedItems = filtered.slice(startIndex, endIndex)

	useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, statusFilter, itemsPerPage])

	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc")
		} else {
			setSortColumn(column)
			setSortDirection("asc")
		}
	}

	const getSortIcon = (column: string) => {
		if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
		return sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
	}

	// Show loading state while institution filter is initializing
	if (!isReady) {
		return (
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="flex flex-col min-h-screen">
					<AppHeader />
					<div className="flex flex-1 items-center justify-center">
						<div className="flex items-center gap-2 text-muted-foreground">
							<RefreshCw className="h-4 w-4 animate-spin" />
							<span>Loading...</span>
						</div>
					</div>
					<AppFooter />
				</SidebarInset>
			</SidebarProvider>
		)
	}

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
									<BreadcrumbPage>Board</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Scorecard Section */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-3">
								<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Boards</p>
								<p className="text-2xl font-bold mt-1">{boards.length}</p>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-3">
								<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</p>
								<p className="text-2xl font-bold mt-1 text-emerald-600">{boards.filter(i => i.is_active).length}</p>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-rose-500 hover:shadow-md transition-shadow">
							<CardContent className="p-3">
								<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inactive</p>
								<p className="text-2xl font-bold mt-1 text-rose-600">{boards.filter(i => !i.is_active).length}</p>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-3">
								<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New This Month</p>
								<p className="text-2xl font-bold mt-1 text-purple-600">{boards.filter(i => { const d = new Date(i.created_at); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear() }).length}</p>
							</CardContent>
						</Card>
					</div>

					{/* Main Content */}
					<TooltipProvider>
					<Card className="flex-1 flex flex-col min-h-0">
						<CardHeader className="flex-shrink-0 p-3">
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center gap-2">
									<div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
										<Clipboard className="h-3 w-3 text-primary" />
									</div>
									<div>
										<h2 className="text-sm font-semibold">Boards</h2>
										<p className="text-xs text-muted-foreground">Manage examination boards</p>
									</div>
								</div>
							</div>

							<div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
								<div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
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

								<div className="flex gap-1 flex-wrap items-center">
									<Tooltip>
										<TooltipTrigger asChild>
											<Button variant="outline" size="icon" className="h-8 w-8" onClick={fetchBoards} disabled={loading}>
												<RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Refresh</TooltipContent>
									</Tooltip>

									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="outline" size="sm" className="h-8 text-xs px-2">
												<Download className="h-3 w-3 mr-1" />
												Export
												<ChevronDown className="h-3 w-3 ml-1" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onClick={handleTemplateExport}>
												<FileSpreadsheet className="h-3 w-3 mr-2" />
												Template
											</DropdownMenuItem>
											<DropdownMenuItem onClick={handleDownload}>
												<Download className="h-3 w-3 mr-2" />
												JSON
											</DropdownMenuItem>
											<DropdownMenuItem onClick={handleExport}>
												<FileSpreadsheet className="h-3 w-3 mr-2" />
												Excel
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>

									<Tooltip>
										<TooltipTrigger asChild>
											<Button variant="outline" size="icon" className="h-8 w-8" onClick={handleImport}>
												<Upload className="h-3 w-3" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Upload</TooltipContent>
									</Tooltip>

									<Button size="sm" className="text-xs px-2 h-8" onClick={() => {
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
							{/* Table */}
							<div className="rounded-md border overflow-hidden" style={{ height: "440px" }}>
								<div className="h-full overflow-auto">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
											<TableRow>
												{mustSelectInstitution && (
													<TableHead className="w-[120px] text-xs">
														<Button variant="ghost" size="sm" onClick={() => handleSort('institution_code')} className="h-auto p-0 font-medium hover:bg-transparent">
															Institution
															<span className="ml-1">{getSortIcon('institution_code')}</span>
														</Button>
													</TableHead>
												)}
												<TableHead className="w-[120px] text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort('board_code')} className="h-auto p-0 font-medium hover:bg-transparent">
														Board Code
														<span className="ml-1">{getSortIcon('board_code')}</span>
													</Button>
												</TableHead>
												<TableHead className="text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort('board_name')} className="h-auto p-0 font-medium hover:bg-transparent">
														Board Name
														<span className="ml-1">{getSortIcon('board_name')}</span>
													</Button>
												</TableHead>
												<TableHead className="w-[120px] text-xs">Display Name</TableHead>
												<TableHead className="w-[100px] text-xs">Type</TableHead>
												<TableHead className="w-[80px] text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort('board_order')} className="h-auto p-0 font-medium hover:bg-transparent">
														Order
														<span className="ml-1">{getSortIcon('board_order')}</span>
													</Button>
												</TableHead>
												<TableHead className="w-[100px] text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort('is_active')} className="h-auto p-0 font-medium hover:bg-transparent">
														Status
														<span className="ml-1">{getSortIcon('is_active')}</span>
													</Button>
												</TableHead>
												<TableHead className="w-[60px] text-xs text-center">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{loading ? (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 8 : 7} className="h-32 text-center">
														<div className="flex flex-col items-center gap-2 text-muted-foreground">
															<RefreshCw className="h-5 w-5 animate-spin" />
															<span className="text-sm">Loading boards...</span>
														</div>
													</TableCell>
												</TableRow>
											) : paginatedItems.length ? (
												<>
													{paginatedItems.map((board) => (
														<TableRow key={board.id}>
															{mustSelectInstitution && (
																<TableCell className="text-sm font-medium">{board.institution_code}</TableCell>
															)}
															<TableCell className="text-sm">{board.board_code}</TableCell>
															<TableCell className="text-sm">{board.board_name}</TableCell>
															<TableCell className="text-sm text-muted-foreground">{board.display_name || '-'}</TableCell>
															<TableCell className="text-sm text-muted-foreground">{board.board_type || '-'}</TableCell>
															<TableCell className="text-sm text-muted-foreground">{board.board_order || '-'}</TableCell>
															<TableCell>
																<Badge
																	variant={board.is_active ? "default" : "secondary"}
																	className={`text-xs ${
																		board.is_active
																			? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200'
																			: 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200'
																	}`}
																>
																	{board.is_active ? "Active" : "Inactive"}
																</Badge>
															</TableCell>
															<TableCell className="text-center">
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<Button variant="ghost" size="icon" className="h-7 w-7">
																			<MoreHorizontal className="h-4 w-4" />
																		</Button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent align="end">
																		<DropdownMenuItem onClick={() => openEdit(board)}>
																			Edit
																		</DropdownMenuItem>
																		<DropdownMenuSeparator />
																		<DropdownMenuItem
																			className="text-red-600 focus:text-red-600"
																			onClick={() => setDeleteTarget(board)}
																		>
																			Delete
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</TableCell>
														</TableRow>
													))}
												</>
											) : (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 8 : 7} className="h-32 text-center">
														<div className="flex flex-col items-center gap-2 text-muted-foreground">
															<Clipboard className="h-8 w-8 opacity-30" />
															<span className="text-sm">No boards found</span>
														</div>
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
							</div>

							{/* Pagination */}
							<div className="flex items-center justify-between py-2 mt-2">
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground">Rows per page</span>
									<Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
										<SelectTrigger className="h-7 w-[70px] text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{pageSizeOptions.map(size => (
												<SelectItem key={size} value={String(size)} className="text-xs">
													{size >= filtered.length && filtered.length > 0 ? 'All' : size}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<span className="text-xs text-muted-foreground">
										{filtered.length === 0 ? '0' : `${startIndex + 1}-${Math.min(endIndex, filtered.length)}`} of {filtered.length}
									</span>
								</div>
								<div className="flex items-center gap-1">
									<Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
										<ChevronLeft className="h-3 w-3" />
									</Button>
									<span className="text-xs text-muted-foreground px-2">Page {currentPage} of {totalPages}</span>
									<Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
										<ChevronRight className="h-3 w-3" />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
					</TooltipProvider>
				</div>
				<AppFooter />
			</SidebarInset>

			{/* Form Sheet */}
			<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
				<SheetContent className="sm:max-w-[600px] overflow-y-auto">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle className="text-lg font-semibold flex items-center gap-2">
							<Clipboard className="h-5 w-5 text-primary" />
							{editing ? "Edit Board" : "Add Board"}
						</SheetTitle>
						<p className="text-sm text-muted-foreground">
							{editing ? "Update board information" : "Create a new board record"}
						</p>
					</SheetHeader>

					<div className="mt-6 space-y-6">
						{/* Basic Information Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Basic Information</h3>
							<div className="grid grid-cols-1 gap-4">
								{/* Institution field - show only when needed */}
								{(mustSelectInstitution || !shouldFilter || !institutionId) && (
									<div className="space-y-2">
										<Label htmlFor="institution_code" className="text-sm font-semibold">
											Institution <span className="text-red-500">*</span>
										</Label>
										<Select
											value={formData.institution_code}
											onValueChange={(value) => setFormData({ ...formData, institution_code: value })}
										>
											<SelectTrigger className={`h-10 ${errors.institution_code ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Select institution" />
											</SelectTrigger>
											<SelectContent>
												{availableInstitutions.map((inst) => (
													<SelectItem key={inst.id} value={inst.institution_code}>
														{inst.institution_code} - {inst.institution_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{errors.institution_code && <p className="text-xs text-destructive">{errors.institution_code}</p>}
									</div>
								)}

								<div className="space-y-2">
									<Label htmlFor="board_code" className="text-sm font-semibold">
										Board Code <span className="text-red-500">*</span>
									</Label>
									<Input
										id="board_code"
										value={formData.board_code}
										onChange={(e) => setFormData({ ...formData, board_code: e.target.value })}
										className={`h-10 ${errors.board_code ? 'border-destructive' : ''}`}
										placeholder="e.g., CBSE, ICSE, STATE"
									/>
									{errors.board_code && <p className="text-xs text-destructive">{errors.board_code}</p>}
								</div>

								<div className="space-y-2">
									<Label htmlFor="board_name" className="text-sm font-semibold">
										Board Name <span className="text-red-500">*</span>
									</Label>
									<Input
										id="board_name"
										value={formData.board_name}
										onChange={(e) => setFormData({ ...formData, board_name: e.target.value })}
										className={`h-10 ${errors.board_name ? 'border-destructive' : ''}`}
										placeholder="e.g., Central Board of Secondary Education"
									/>
									{errors.board_name && <p className="text-xs text-destructive">{errors.board_name}</p>}
								</div>

								<div className="space-y-2">
									<Label htmlFor="display_name" className="text-sm font-semibold">
										Display Name
									</Label>
									<Input
										id="display_name"
										value={formData.display_name}
										onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
										className={`h-10 ${errors.display_name ? 'border-destructive' : ''}`}
										placeholder="Short display name"
									/>
									{errors.display_name && <p className="text-xs text-destructive">{errors.display_name}</p>}
								</div>

								<div className="space-y-2">
									<Label htmlFor="board_type" className="text-sm font-semibold">
										Board Type
									</Label>
									<Input
										id="board_type"
										value={formData.board_type}
										onChange={(e) => setFormData({ ...formData, board_type: e.target.value })}
										className="h-10"
										placeholder="e.g., National, State, International"
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="board_order" className="text-sm font-semibold">
										Display Order
									</Label>
									<Input
										id="board_order"
										type="number"
										value={formData.board_order}
										onChange={(e) => setFormData({ ...formData, board_order: e.target.value })}
										className={`h-10 ${errors.board_order ? 'border-destructive' : ''}`}
										placeholder="Order in lists"
									/>
									{errors.board_order && <p className="text-xs text-destructive">{errors.board_order}</p>}
								</div>
							</div>
						</div>

						{/* Status Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h3>
							<div className="flex items-center gap-4">
								<Label className="text-sm font-semibold">Board Status</Label>
								<button
									type="button"
									onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
									className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
								>
									<span
										className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_active ? 'translate-x-6' : 'translate-x-1'}`}
									/>
								</button>
								<span className={`text-sm font-medium ${formData.is_active ? 'text-green-600' : 'text-red-500'}`}>
									{formData.is_active ? 'Active' : 'Inactive'}
								</span>
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
								{editing ? "Update Board" : "Create Board"}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Standalone Delete Dialog */}
			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Board</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete {deleteTarget?.board_name}? This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => { if (deleteTarget) { remove(deleteTarget.id); setDeleteTarget(null) } }}
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
									Data Validation Errors
								</AlertDialogTitle>
								<AlertDialogDescription className="text-sm text-muted-foreground mt-1">
									Please fix the following errors before importing the data
								</AlertDialogDescription>
							</div>
						</div>
					</AlertDialogHeader>

					<div className="space-y-4">
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

						<div className="space-y-3">
							{importErrors.map((error, index) => (
								<div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/5">
									<div className="flex items-start justify-between mb-2">
										<div className="flex items-center gap-2">
											<Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-200 dark:border-red-700">
												Row {error.row}
											</Badge>
											<span className="font-medium text-sm">
												{error.board_code} - {error.board_name}
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

						<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
							<div className="flex items-start gap-2">
								<div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mt-0.5">
									<span className="text-xs font-bold text-blue-600 dark:text-blue-400">i</span>
								</div>
								<div>
									<h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">Common Fixes:</h4>
									<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
										<li>• Ensure institution_code references an existing institution</li>
										<li>• Board code must be unique within the institution</li>
										<li>• Board code can only contain letters, numbers, hyphens, and underscores</li>
										<li>• Check field length constraints (board_code 50 chars, board_name 255 chars)</li>
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
		</SidebarProvider>
	)
}
