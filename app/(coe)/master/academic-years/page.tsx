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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Calendar, TrendingUp, FileSpreadsheet, RefreshCw, CheckCircle, XCircle, AlertTriangle, Building2, MoreHorizontal, ChevronDown, Download, Upload } from "lucide-react"

interface AcademicYear {
	id: string
	academic_year: string
	start_date: string
	end_date: string
	remarks: string | null
	institutions_id: string
	institution_code: string
	is_active: boolean
	created_at: string
	updated_at: string
}

interface Institution {
	id: string
	institution_code: string
	institution_name?: string
}

export default function AcademicYearsPage() {
	const { toast } = useToast()

	const [items, setItems] = useState<AcademicYear[]>([])
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)
	const [deleteTarget, setDeleteTarget] = useState<AcademicYear | null>(null)

	const [sheetOpen, setSheetOpen] = useState(false)
	const [editing, setEditing] = useState<AcademicYear | null>(null)
	const [statusFilter, setStatusFilter] = useState("all")

	// Upload Summary State
	const [errorPopupOpen, setErrorPopupOpen] = useState(false)
	const [importErrors, setImportErrors] = useState<Array<{
		row: number
		academic_year: string
		institution_code: string
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
		academic_year: "",
		start_date: "",
		end_date: "",
		is_active: false,
		remarks: "",
	})
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Fetch academic years
	const fetchAcademicYears = async () => {
		try {
			setLoading(true)
			const response = await fetch('/api/master/academic-years')
			if (!response.ok) {
				throw new Error('Failed to fetch academic years')
			}
			const data = await response.json()
			setItems(data)
		} catch (error) {
			console.error('Error fetching academic years:', error)
			setItems([])
		} finally {
			setLoading(false)
		}
	}

	// Fetch institutions
	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/master/institutions')
			if (res.ok) {
				const data = await res.json()
				const mapped = Array.isArray(data)
					? data.filter((i: any) => i?.institution_code).map((i: any) => ({
						id: i.id,
						institution_code: i.institution_code,
						institution_name: i.institution_name || i.name
					}))
					: []
				setInstitutions(mapped)
			}
		} catch (e) {
			console.error('Failed to load institutions:', e)
		}
	}

	// Load data on mount
	useEffect(() => {
		fetchAcademicYears()
		fetchInstitutions()
	}, [])

	const resetForm = () => {
		setFormData({
			institution_code: "",
			academic_year: "",
			start_date: "",
			end_date: "",
			is_active: false,
			remarks: "",
		})
		setErrors({})
		setEditing(null)
	}

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

	// Filter, sort, and paginate
	const filtered = useMemo(() => {
		const q = searchTerm.toLowerCase()
		const data = items
			.filter((i) => [i.institution_code, i.academic_year].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
			.filter((i) => statusFilter === "all" || (statusFilter === "active" ? i.is_active : statusFilter === "inactive" ? !i.is_active : i.is_active))

		if (!sortColumn) return data
		const sorted = [...data].sort((a, b) => {
			const av = (a as any)[sortColumn]
			const bv = (b as any)[sortColumn]
			if (av === bv) return 0
			if (sortDirection === "asc") return av > bv ? 1 : -1
			return av < bv ? 1 : -1
		})
		return sorted
	}, [items, searchTerm, sortColumn, sortDirection, statusFilter])

	const pageSizeOptions = useMemo(() => {
		const allSizes = [10, 20, 50, 100, 250, 500, 1000]
		const total = filtered.length
		const options = allSizes.filter(s => s < total)
		if (!options.includes(10)) options.unshift(10)
		if (total > 10) options.push(total)
		return options
	}, [filtered.length])

	const isShowAll = itemsPerPage >= filtered.length
	const effectivePerPage = isShowAll ? filtered.length || 1 : itemsPerPage

	const totalPages = Math.ceil(filtered.length / effectivePerPage) || 1
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage
	const pageItems = filtered.slice(startIndex, endIndex)

	useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection])

	const openAdd = () => {
		resetForm()
		setSheetOpen(true)
	}

	const openEdit = (row: AcademicYear) => {
		setEditing(row)
		setFormData({
			institution_code: row.institution_code,
			academic_year: row.academic_year,
			start_date: row.start_date,
			end_date: row.end_date,
			is_active: row.is_active,
			remarks: row.remarks || "",
		})
		setSheetOpen(true)
	}

	// Form validation
	const validate = () => {
		const e: Record<string, string> = {}
		if (!formData.institution_code.trim()) e.institution_code = "Required"
		if (!formData.academic_year.trim()) e.academic_year = "Required"
		if (!formData.start_date) e.start_date = "Required"
		if (!formData.end_date) e.end_date = "Required"

		if (formData.start_date && formData.end_date) {
			const startDate = new Date(formData.start_date)
			const endDate = new Date(formData.end_date)
			if (endDate <= startDate) {
				e.end_date = "End date must be after start date"
			}
		}

		setErrors(e)
		return Object.keys(e).length === 0
	}

	// CREATE & UPDATE
	const save = async () => {
		if (!validate()) return

		try {
			setLoading(true)

			// Foreign key resolution
			const selectedInstitution = institutions.find(item => item.institution_code === formData.institution_code)

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
				is_active: formData.is_active
			}

			if (editing) {
				const response = await fetch('/api/master/academic-years', {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ id: editing.id, ...payload }),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to update academic year')
				}

				const updated = await response.json()
				setItems((prev) => prev.map((p) => (p.id === editing.id ? updated : p)))

				toast({
					title: "Academic Year Updated",
					description: `${updated.academic_year} has been successfully updated.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			} else {
				const response = await fetch('/api/master/academic-years', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(payload),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to create academic year')
				}

				const created = await response.json()
				setItems((prev) => [created, ...prev])

				toast({
					title: "Academic Year Created",
					description: `${created.academic_year} has been successfully created.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			}

			setSheetOpen(false)
			resetForm()
		} catch (error) {
			console.error('Error saving academic year:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to save academic year. Please try again.'
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
			const itemName = items.find(i => i.id === id)?.academic_year || 'Academic Year'

			const response = await fetch(`/api/master/academic-years?id=${id}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to delete academic year')
			}

			setItems((prev) => prev.filter((p) => p.id !== id))

			toast({
				title: "Academic Year Deleted",
				description: `${itemName} has been successfully deleted.`,
				className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
			})
		} catch (error) {
			console.error('Error deleting academic year:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to delete academic year. Please try again.'
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
	const validateAcademicYearData = (data: any) => {
		const errors: string[] = []

		if (!data.institution_code || data.institution_code.trim() === '') {
			errors.push('Institution code is required')
		}
		if (!data.academic_year || data.academic_year.trim() === '') {
			errors.push('Academic year is required')
		}
		if (!data.start_date) {
			errors.push('Start date is required')
		}
		if (!data.end_date) {
			errors.push('End date is required')
		}

		if (data.start_date && data.end_date) {
			const startDate = new Date(data.start_date)
			const endDate = new Date(data.end_date)
			if (endDate <= startDate) {
				errors.push('End date must be after start date')
			}
		}

		return errors
	}

	// Export to Excel
	const handleExport = () => {
		const excelData = filtered.map((r) => ({
			'Institution Code': r.institution_code,
			'Academic Year': r.academic_year,
			'Start Date': new Date(r.start_date).toISOString().split('T')[0],
			'End Date': new Date(r.end_date).toISOString().split('T')[0],
			'Is Current Year': r.is_active ? 'Yes' : 'No',
			'Remarks': r.remarks || '',
			'Status': r.is_active ? 'Active' : 'Inactive',
			'Created': new Date(r.created_at).toISOString().split('T')[0],
		}))

		const ws = XLSX.utils.json_to_sheet(excelData)
		const colWidths = [
			{ wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 },
			{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 15 },
		]
		ws['!cols'] = colWidths

		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Academic Years')
		XLSX.writeFile(wb, `academic_years_export_${new Date().toISOString().split('T')[0]}.xlsx`)
	}

	// Template Export with Reference Sheets
	const handleTemplateExport = () => {
		const wb = XLSX.utils.book_new()

		const sample = [{
			'Institution Code *': 'JKKN',
			'Academic Year *': '2024-2025',
			'Start Date * (DD-MM-YYYY)': '01-06-2024',
			'End Date * (DD-MM-YYYY)': '31-05-2025',
			'Is Current (Yes/No)': 'Yes',
			'Remarks': 'Sample academic year',
		}]

		const ws = XLSX.utils.json_to_sheet(sample)
		const colWidths = [
			{ wch: 20 }, { wch: 25 }, { wch: 25 },
			{ wch: 25 }, { wch: 20 }, { wch: 40 },
		]
		ws['!cols'] = colWidths

		XLSX.utils.book_append_sheet(wb, ws, 'Template')

		const institutionRef = institutions.map(item => ({
			'Institution Code': item.institution_code,
			'Institution Name': item.institution_name || 'N/A',
		}))

		const wsRef = XLSX.utils.json_to_sheet(institutionRef)
		const refColWidths = [{ wch: 20 }, { wch: 40 }]
		wsRef['!cols'] = refColWidths

		XLSX.utils.book_append_sheet(wb, wsRef, 'Institution Codes')
		XLSX.writeFile(wb, `academic_years_template_${new Date().toISOString().split('T')[0]}.xlsx`)
	}

	// Helper function to convert DD-MM-YYYY or Excel serial date to YYYY-MM-DD
	const parseDateDDMMYYYY = (dateStr: string | number): string => {
		if (!dateStr || (typeof dateStr === 'string' && dateStr.trim() === '')) return ''

		// Handle Excel serial date numbers (days since 1900-01-01)
		if (typeof dateStr === 'number' || !isNaN(Number(dateStr))) {
			const excelEpoch = new Date(1899, 11, 30) // Excel's epoch is Dec 30, 1899
			const days = typeof dateStr === 'number' ? dateStr : Number(dateStr)
			const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000)

			const year = date.getFullYear()
			const month = String(date.getMonth() + 1).padStart(2, '0')
			const day = String(date.getDate()).padStart(2, '0')

			return `${year}-${month}-${day}`
		}

		const dateString = String(dateStr)

		// If already in YYYY-MM-DD format, return as is
		if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString

		// Parse DD-MM-YYYY format
		const parts = dateString.split('-')
		if (parts.length === 3) {
			const [day, month, year] = parts
			// Validate the parts are numeric
			if (!isNaN(Number(day)) && !isNaN(Number(month)) && !isNaN(Number(year))) {
				return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
			}
		}

		return dateString
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
				let rows: Partial<AcademicYear>[] = []

				if (file.name.endsWith('.json')) {
					const text = await file.text()
					rows = JSON.parse(text)
				} else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
					const data = new Uint8Array(await file.arrayBuffer())
					const wb = XLSX.read(data, { type: 'array' })
					const ws = wb.Sheets[wb.SheetNames[0]]
					const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
					rows = json.map(j => {
						const startDateRaw = String(j['Start Date * (DD-MM-YYYY)'] || j['Start Date * (YYYY-MM-DD)'] || j['Start Date'] || '')
						const endDateRaw = String(j['End Date * (DD-MM-YYYY)'] || j['End Date * (YYYY-MM-DD)'] || j['End Date'] || '')

						return {
							institution_code: String(j['Institution Code *'] || j['Institution Code'] || ''),
							academic_year: String(j['Academic Year *'] || j['Academic Year'] || ''),
							start_date: parseDateDDMMYYYY(startDateRaw),
							end_date: parseDateDDMMYYYY(endDateRaw),
							is_active: String(j['Is Current (Yes/No)'] || j['Is Current Year (Yes/No)'] || j['Is Current'] || '').toLowerCase() === 'yes',
							remarks: String(j['Remarks'] || ''),
						}
					})
				}

				const validationErrors: Array<{
					row: number
					academic_year: string
					institution_code: string
					errors: string[]
				}> = []

				const mapped = rows.map((r, index) => {
					const itemData = {
						institution_code: r.institution_code || '',
						academic_year: r.academic_year || '',
						start_date: r.start_date || '',
						end_date: r.end_date || '',
						is_active: r.is_active ?? false,
						remarks: r.remarks || '',
					}

					const errors = validateAcademicYearData(itemData)
					if (errors.length > 0) {
						validationErrors.push({
							row: index + 2,
							academic_year: itemData.academic_year || 'N/A',
							institution_code: itemData.institution_code || 'N/A',
							errors: errors
						})
					}

					return itemData
				}).filter(r => r.academic_year && r.institution_code)

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
					academic_year: string
					institution_code: string
					errors: string[]
				}> = []

				for (let i = 0; i < mapped.length; i++) {
					const item = mapped[i]
					const rowNumber = i + 2

					try {
						const response = await fetch('/api/master/academic-years', {
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
								academic_year: item.academic_year || 'N/A',
								institution_code: item.institution_code || 'N/A',
								errors: [errorData.error || 'Failed to save academic year']
							})
						}
					} catch (error) {
						errorCount++
						uploadErrors.push({
							row: rowNumber,
							academic_year: item.academic_year || 'N/A',
							institution_code: item.institution_code || 'N/A',
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
						description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} (${successCount} academic year${successCount > 1 ? 's' : ''}) to the database.`,
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
									<BreadcrumbPage>Academic Years</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Scorecard Section */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{items.length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Years</p>
									</div>
									<Calendar className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{items.filter(i => i.is_active).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Active Years</p>
									</div>
									<Calendar className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-blue-400 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{items.filter(i => i.is_active).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Current Year</p>
									</div>
									<TrendingUp className="h-5 w-5 text-blue-400/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{items.filter(i => { const d = new Date(i.created_at); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear() }).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">New This Month</p>
									</div>
									<TrendingUp className="h-5 w-5 text-purple-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					<TooltipProvider delayDuration={300}>
						<Card className="flex-1 flex flex-col min-h-0">
							<CardHeader className="flex-shrink-0 p-3">
								<div className="flex items-center justify-between mb-2">
									<div className="flex items-center gap-2">
										<div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
											<Calendar className="h-3 w-3 text-primary" />
										</div>
										<div>
											<h2 className="text-sm font-semibold">Academic Years</h2>
											<p className="text-xs text-muted-foreground">Manage academic year records</p>
										</div>
									</div>
									<div className="hidden" />
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
												<SelectItem value="current">Current Year</SelectItem>
											</SelectContent>
										</Select>

										<div className="relative w-full sm:w-[220px]">
											<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
											<Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search…" className="pl-8 h-8 text-xs" />
										</div>
									</div>

									<div className="flex gap-1 flex-wrap">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={fetchAcademicYears} disabled={loading}>
													<RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Refresh</TooltipContent>
										</Tooltip>

										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="outline" size="sm" className="text-xs px-2 h-8">
													<Download className="h-3 w-3 mr-1" />
													Export
													<ChevronDown className="h-3 w-3 ml-1" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem onClick={handleTemplateExport}>
													<FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
													Template
												</DropdownMenuItem>
												<DropdownMenuItem onClick={handleExport}>
													<Download className="h-3.5 w-3.5 mr-2" />
													Excel
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>

										<Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={handleImport}>
											<Upload className="h-3 w-3 mr-1" />
											Upload
										</Button>
										<Button size="sm" className="text-xs px-2 h-8" onClick={openAdd} disabled={loading}>
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
													<TableHead className="w-[140px] text-xs">
														<Button variant="ghost" size="sm" onClick={() => handleSort("institution_code")} className="h-auto p-0 font-medium hover:bg-transparent">
															Institution Code
															<span className="ml-1">{getSortIcon("institution_code")}</span>
														</Button>
													</TableHead>
													<TableHead className="text-xs">
														<Button variant="ghost" size="sm" onClick={() => handleSort("academic_year")} className="h-auto p-0 font-medium hover:bg-transparent">
															Academic Year
															<span className="ml-1">{getSortIcon("academic_year")}</span>
														</Button>
													</TableHead>
													<TableHead className="w-[120px] text-xs">
														<Button variant="ghost" size="sm" onClick={() => handleSort("start_date")} className="h-auto p-0 font-medium hover:bg-transparent">
															Start Date
															<span className="ml-1">{getSortIcon("start_date")}</span>
														</Button>
													</TableHead>
													<TableHead className="w-[120px] text-xs">
														<Button variant="ghost" size="sm" onClick={() => handleSort("end_date")} className="h-auto p-0 font-medium hover:bg-transparent">
															End Date
															<span className="ml-1">{getSortIcon("end_date")}</span>
														</Button>
													</TableHead>
													<TableHead className="w-[100px] text-xs">Current</TableHead>
													<TableHead className="w-[100px] text-xs">
														<Button variant="ghost" size="sm" onClick={() => handleSort("is_active")} className="h-auto p-0 font-medium hover:bg-transparent">
															Status
															<span className="ml-1">{getSortIcon("is_active")}</span>
														</Button>
													</TableHead>
													<TableHead className="w-[60px] text-xs text-center">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{loading ? (
													<TableRow>
														<TableCell colSpan={7} className="h-24 text-center">
															<div className="flex items-center justify-center gap-2 text-muted-foreground">
																<RefreshCw className="h-4 w-4 animate-spin" />
																<span className="text-sm">Loading...</span>
															</div>
														</TableCell>
													</TableRow>
												) : pageItems.length ? (
													<>
														{pageItems.map((row) => (
															<TableRow key={row.id}>
																<TableCell className="text-sm font-medium">{row.institution_code}</TableCell>
																<TableCell className="text-sm">{row.academic_year}</TableCell>
																<TableCell className="text-sm">{new Date(row.start_date).toLocaleDateString()}</TableCell>
																<TableCell className="text-sm">{new Date(row.end_date).toLocaleDateString()}</TableCell>
																<TableCell>
																	{row.is_active ? (
																		<Badge variant="default" className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200">
																			Current
																		</Badge>
																	) : (
																		<span className="text-xs text-muted-foreground">-</span>
																	)}
																</TableCell>
																<TableCell>
																	<Badge
																		variant={row.is_active ? "default" : "secondary"}
																		className={`text-xs ${row.is_active
																			? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200'
																			: 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200'
																			}`}
																	>
																		{row.is_active ? "Active" : "Inactive"}
																	</Badge>
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
													<TableRow>
														<TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">No academic years found</TableCell>
													</TableRow>
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
											<Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
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
				</div>
				<AppFooter />
			</SidebarInset>

			<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
				<SheetContent className="sm:max-w-[600px] overflow-y-auto">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle className="text-lg font-semibold">
							{editing ? "Edit Academic Year" : "Add Academic Year"}
						</SheetTitle>
						<p className="text-sm text-muted-foreground">
							{editing ? "Update academic year information" : "Add a new academic year"}
						</p>
					</SheetHeader>

					<div className="mt-6 space-y-6">
						{/* Basic Information */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="institution_code" className="text-sm font-semibold">
										Institution Code <span className="text-red-500">*</span>
									</Label>
									<Select
										value={formData.institution_code}
										onValueChange={(code) => {
											setFormData(prev => ({ ...prev, institution_code: code }))
										}}
									>
										<SelectTrigger className={`h-10 ${errors.institution_code ? 'border-destructive' : ''}`}>
											<SelectValue placeholder="Select Institution Code" />
										</SelectTrigger>
										<SelectContent>
											{institutions.map(inst => (
												<SelectItem key={inst.id} value={inst.institution_code}>
													{inst.institution_code}{inst.institution_name ? ` - ${inst.institution_name}` : ''}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{errors.institution_code && <p className="text-xs text-destructive">{errors.institution_code}</p>}
								</div>
								<div className="space-y-2">
									<Label htmlFor="academic_year" className="text-sm font-semibold">
										Academic Year <span className="text-red-500">*</span>
									</Label>
									<Input
										id="academic_year"
										value={formData.academic_year}
										onChange={(e) => setFormData({ ...formData, academic_year: e.target.value })}
										className={`h-10 ${errors.academic_year ? 'border-destructive' : ''}`}
										placeholder="e.g., 2024-2025"
									/>
									{errors.academic_year && <p className="text-xs text-destructive">{errors.academic_year}</p>}
								</div>
								<div className="space-y-2">
									<Label htmlFor="start_date" className="text-sm font-semibold">
										Start Date <span className="text-red-500">*</span>
									</Label>
									<Input
										id="start_date"
										type="date"
										value={formData.start_date}
										onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
										className={`h-10 ${errors.start_date ? 'border-destructive' : ''}`}
									/>
									{errors.start_date && <p className="text-xs text-destructive">{errors.start_date}</p>}
								</div>
								<div className="space-y-2">
									<Label htmlFor="end_date" className="text-sm font-semibold">
										End Date <span className="text-red-500">*</span>
									</Label>
									<Input
										id="end_date"
										type="date"
										value={formData.end_date}
										onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
										className={`h-10 ${errors.end_date ? 'border-destructive' : ''}`}
									/>
									{errors.end_date && <p className="text-xs text-destructive">{errors.end_date}</p>}
								</div>
								<div className="space-y-2 md:col-span-2">
									<Label htmlFor="remarks" className="text-sm font-medium">Remarks</Label>
									<Input
										id="remarks"
										value={formData.remarks}
										onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
										className="h-10"
										placeholder="Optional remarks"
									/>
								</div>
							</div>
						</div>

						{/* Status Section */}
						<div className="space-y-4 pt-2 border-t">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</h3>
							<div className="flex items-center gap-4">
								<Label className="text-sm font-semibold">Academic Year Status</Label>
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
									{formData.is_active ? 'Current' : 'Not Current'}
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
							>
								{editing ? "Update Academic Year" : "Create Academic Year"}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Academic Year</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete <strong>{deleteTarget?.academic_year}</strong>? This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => { if (deleteTarget) remove(deleteTarget.id); setDeleteTarget(null) }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Error Popup Dialog */}
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
												{error.academic_year} - {error.institution_code}
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
										<li>- Ensure Academic Year and Institution Code are provided and not empty</li>
										<li>- Institution Code must exist in the institutions table (foreign key validation)</li>
										<li>- Check date formats (DD-MM-YYYY) and ensure end date is after start date</li>
										<li>- Is Current: Yes/No</li>
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
