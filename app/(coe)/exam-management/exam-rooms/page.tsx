'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
	Building2,
	Plus,
	Search,
	FileDown,
	Upload,
	Pencil,
	Trash2,
	ChevronLeft,
	ChevronRight,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	RefreshCw,
	FileText,
	CheckCircle2,
	XCircle,
	AlertTriangle,
	Grid3x3,
	Users,
	TrendingUp,
	MoreHorizontal,
} from 'lucide-react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/common/use-toast'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import XLSX from '@/lib/utils/excel-compat'
import type { ExamRoom, Institution, ExamRoomFormData, ExamRoomImportError, UploadSummary } from '@/types/exam-rooms'
import {
	fetchInstitutions as fetchInstitutionsService,
	createExamRoom,
	updateExamRoom,
	deleteExamRoom as deleteExamRoomService,
} from '@/services/exam-management/exam-rooms-service'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'

export default function ExamRoomsPage() {
	const { toast } = useToast()

	// Institution filter hook
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
	const [items, setItems] = useState<ExamRoom[]>([])
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [sheetOpen, setSheetOpen] = useState(false)
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [errorPopupOpen, setErrorPopupOpen] = useState(false)
	const [itemToDelete, setItemToDelete] = useState<ExamRoom | null>(null)
	const [editing, setEditing] = useState<ExamRoom | null>(null)

	// Search, Filter, Sort, Pagination
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState<string>('all')
	const [sortColumn, setSortColumn] = useState<string>('created_at')
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)

	// Form State
	const [formData, setFormData] = useState({
		id: '',
		institution_code: '',
		room_code: '',
		room_name: '',
		building: '',
		floor: '',
		room_order: '',
		seating_capacity: '',
		exam_capacity: '',
		preferred_exam_capacity: '',
		max_exam_capacity: '',
		room_type: '',
		facilities: '',
		is_accessible: true,
		is_active: true,
		rows: '',
		columns: '',
	})

	const [errors, setErrors] = useState<Record<string, string>>({})

	// Upload Error Tracking
	const [uploadSummary, setUploadSummary] = useState<{
		total: number
		success: number
		failed: number
	}>({ total: 0, success: 0, failed: 0 })

	const [importErrors, setImportErrors] = useState<
		Array<{
			row: number
			room_code: string
			room_name: string
			errors: string[]
		}>
	>([])

	// Fetch Data when institution filter is ready
	useEffect(() => {
		if (!isReady) return
		fetchData()
		fetchInstitutions()
	}, [isReady, filter])

	const fetchData = async () => {
		try {
			setLoading(true)
			const url = appendToUrl('/api/exam-management/exam-rooms')
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error('Failed to fetch exam rooms')
			}
			let data = await response.json()

			// Client-side filter for safety
			if (shouldFilter && institutionId) {
				data = data.filter((room: ExamRoom) => room.institutions_id === institutionId)
			}

			setItems(data)
		} catch (error) {
			console.error('Error fetching exam rooms:', error)
			toast({
				title: '❌ Fetch Failed',
				description: 'Failed to load exam rooms. Please try again.',
				variant: 'destructive',
				className:
					'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		} finally {
			setLoading(false)
		}
	}

	const fetchInstitutions = async () => {
		try {
			const url = appendToUrl('/api/master/institutions')
			const res = await fetch(url)
			if (res.ok) {
				let data = await res.json()
				// Filter by institution if shouldFilter
				if (shouldFilter && institutionId) {
					data = data.filter((inst: Institution) => inst.id === institutionId)
				}
				setInstitutions(data.filter((inst: Institution) => inst.is_active))
			}
		} catch (error) {
			console.error('Error fetching institutions:', error)
		}
	}

	// Validation
	const validate = () => {
		const e: Record<string, string> = {}

		if (!formData.institution_code.trim())
			e.institution_code = 'Institution is required'
		if (!formData.room_code.trim()) e.room_code = 'Room code is required'
		if (!formData.room_name.trim()) e.room_name = 'Room name is required'

		// Room code format validation
		if (formData.room_code && !/^[A-Za-z0-9\-_]+$/.test(formData.room_code)) {
			e.room_code =
				'Room code can only contain letters, numbers, hyphens, and underscores'
		}

		// Required numeric fields
		if (!formData.room_order || Number(formData.room_order) < 1) {
			e.room_order = 'Room order is required and must be at least 1'
		}

		if (!formData.seating_capacity || Number(formData.seating_capacity) < 1) {
			e.seating_capacity = 'Seating capacity is required and must be at least 1'
		}

		if (!formData.exam_capacity || Number(formData.exam_capacity) < 1) {
			e.exam_capacity = 'Exam capacity is required and must be at least 1'
		}

		if (!formData.rows || Number(formData.rows) < 1) {
			e.rows = 'Rows is required and must be at least 1'
		}

		if (!formData.columns || Number(formData.columns) < 1) {
			e.columns = 'Columns is required and must be at least 1'
		}

		// Capacity constraint
		if (
			formData.exam_capacity &&
			formData.seating_capacity &&
			Number(formData.exam_capacity) > Number(formData.seating_capacity)
		) {
			e.exam_capacity = 'Exam capacity cannot exceed seating capacity'
		}

		// Preferred/Max capacity constraints (optional fields)
		if (formData.preferred_exam_capacity && formData.exam_capacity &&
			Number(formData.preferred_exam_capacity) > Number(formData.exam_capacity)) {
			e.preferred_exam_capacity = 'Cannot exceed exam capacity'
		}
		if (formData.max_exam_capacity && formData.exam_capacity &&
			Number(formData.max_exam_capacity) > Number(formData.exam_capacity)) {
			e.max_exam_capacity = 'Cannot exceed exam capacity'
		}
		if (formData.preferred_exam_capacity && formData.max_exam_capacity &&
			Number(formData.preferred_exam_capacity) > Number(formData.max_exam_capacity)) {
			e.preferred_exam_capacity = 'Cannot exceed max exam capacity'
		}

		setErrors(e)
		return Object.keys(e).length === 0
	}

	// Validation function for imported data
	const validateExamRoomData = (data: any, rowIndex: number) => {
		const errors: string[] = []

		// Required field validations
		if (!data.institution_code || data.institution_code.trim() === '') {
			errors.push('Institution code is required')
		}

		if (!data.room_code || data.room_code.trim() === '') {
			errors.push('Room code is required')
		} else if (data.room_code.length > 30) {
			errors.push('Room code must be 30 characters or less')
		} else if (!/^[A-Za-z0-9\-_]+$/.test(data.room_code)) {
			errors.push('Room code can only contain letters, numbers, hyphens, and underscores')
		}

		if (!data.room_name || data.room_name.trim() === '') {
			errors.push('Room name is required')
		} else if (data.room_name.length > 150) {
			errors.push('Room name must be 150 characters or less')
		}

		// Numeric validations
		if (!data.room_order || Number(data.room_order) < 1) {
			errors.push('Room order is required and must be at least 1')
		}

		if (!data.seating_capacity || Number(data.seating_capacity) < 1) {
			errors.push('Seating capacity is required and must be at least 1')
		}

		if (!data.exam_capacity || Number(data.exam_capacity) < 1) {
			errors.push('Exam capacity is required and must be at least 1')
		}

		if (!data.rows || Number(data.rows) < 1) {
			errors.push('Rows is required and must be at least 1')
		}

		if (!data.columns || Number(data.columns) < 1) {
			errors.push('Columns is required and must be at least 1')
		}

		// Capacity constraint
		if (data.exam_capacity && data.seating_capacity && Number(data.exam_capacity) > Number(data.seating_capacity)) {
			errors.push('Exam capacity cannot exceed seating capacity')
		}

		// Optional field validations
		if (data.building && data.building.length > 150) {
			errors.push('Building name must be 150 characters or less')
		}

		if (data.floor && data.floor.length > 20) {
			errors.push('Floor must be 20 characters or less')
		}

		if (data.room_type && data.room_type.length > 50) {
			errors.push('Room type must be 50 characters or less')
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

		// Accessible validation
		if (data.is_accessible !== undefined && data.is_accessible !== null) {
			if (typeof data.is_accessible !== 'boolean') {
				const accessibleValue = String(data.is_accessible).toLowerCase()
				if (accessibleValue !== 'true' && accessibleValue !== 'false' && accessibleValue !== 'yes' && accessibleValue !== 'no') {
					errors.push('Accessible must be true/false or Yes/No')
				}
			}
		}

		return errors
	}

	// CRUD Operations
	const handleSave = async () => {
		if (!validate()) {
			toast({
				title: '⚠️ Validation Error',
				description: 'Please fix all validation errors before submitting.',
				variant: 'destructive',
				className:
					'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
			return
		}

		try {
			setSaving(true)

			const savedRoom = editing
				? await updateExamRoom(formData)
				: await createExamRoom(formData)

			if (editing) {
				setItems((prev) =>
					prev.map((item) => (item.id === savedRoom.id ? savedRoom : item))
				)
				toast({
					title: '✅ Exam Room Updated',
					description: `${savedRoom.room_name} has been successfully updated.`,
					className:
						'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
				})
			} else {
				setItems((prev) => [savedRoom, ...prev])
				toast({
					title: '✅ Exam Room Created',
					description: `${savedRoom.room_name} has been successfully created.`,
					className:
						'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
				})
			}

			setSheetOpen(false)
			resetForm()
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: 'Failed to save exam room. Please try again.'
			toast({
				title: '❌ Save Failed',
				description: errorMessage,
				variant: 'destructive',
				className:
					'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		} finally {
			setSaving(false)
		}
	}

	const handleEdit = (item: ExamRoom) => {
		// Find institution code
		const institution = institutions.find((i) => i.id === item.institutions_id)

		setFormData({
			id: item.id,
			institution_code: institution?.institution_code || '',
			room_code: item.room_code,
			room_name: item.room_name,
			building: item.building || '',
			floor: item.floor || '',
			room_order: item.room_order.toString(),
			seating_capacity: item.seating_capacity.toString(),
			exam_capacity: item.exam_capacity.toString(),
			preferred_exam_capacity: item.preferred_exam_capacity?.toString() || '',
			max_exam_capacity: item.max_exam_capacity?.toString() || '',
			room_type: item.room_type || '',
			facilities: item.facilities ? JSON.stringify(item.facilities, null, 2) : '',
			is_accessible: item.is_accessible,
			is_active: item.is_active,
			rows: item.rows.toString(),
			columns: item.columns.toString(),
		})
		setEditing(item)
		setSheetOpen(true)
	}

	const handleDelete = async () => {
		if (!itemToDelete) return

		try {
			await deleteExamRoomService(itemToDelete.id)

			setItems((prev) => prev.filter((item) => item.id !== itemToDelete.id))

			toast({
				title: '✅ Exam Room Deleted',
				description: `${itemToDelete.room_name} has been successfully deleted.`,
				className:
					'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200',
			})

			setDeleteDialogOpen(false)
			setItemToDelete(null)
		} catch (error) {
			toast({
				title: '❌ Delete Failed',
				description: 'Failed to delete exam room. Please try again.',
				variant: 'destructive',
				className:
					'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		}
	}

	const resetForm = () => {
		// Auto-fill institution code from context
		const autoInstitutionId = getInstitutionIdForCreate()
		const autoInstitution = autoInstitutionId ? institutions.find(i => i.id === autoInstitutionId) : null
		const autoInstitutionCode = autoInstitution?.institution_code || ''

		setFormData({
			id: '',
			institution_code: autoInstitutionCode,
			room_code: '',
			room_name: '',
			building: '',
			floor: '',
			room_order: '',
			seating_capacity: '',
			exam_capacity: '',
			preferred_exam_capacity: '',
			max_exam_capacity: '',
			room_type: '',
			facilities: '',
			is_accessible: true,
			is_active: true,
			rows: '',
			columns: '',
		})
		setErrors({})
		setEditing(null)
	}

	// Import/Export Functions
	const handleExportJSON = () => {
		const dataStr = JSON.stringify(items, null, 2)
		const dataBlob = new Blob([dataStr], { type: 'application/json' })
		const url = URL.createObjectURL(dataBlob)
		const link = document.createElement('a')
		link.href = url
		link.download = `exam_rooms_${new Date().toISOString().split('T')[0]}.json`
		link.click()
		URL.revokeObjectURL(url)

		toast({
			title: '✅ Export Successful',
			description: 'Exam rooms exported as JSON successfully.',
			className:
				'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
		})
	}

	const handleExportExcel = () => {
		const exportData = items.map((room) => {
			const institution = institutions.find(
				(i) => i.id === room.institutions_id
			)
			return {
				'Institution Code': institution?.institution_code || 'N/A',
				'Room Code': room.room_code,
				'Room Name': room.room_name,
				Building: room.building || '',
				Floor: room.floor || '',
				'Room Order': room.room_order,
				'Seating Capacity': room.seating_capacity,
				'Exam Capacity': room.exam_capacity,
				'Preferred Exam Capacity': room.preferred_exam_capacity || '',
				'Max Exam Capacity': room.max_exam_capacity || '',
				Rows: room.rows,
				Columns: room.columns,
				'Room Type': room.room_type || '',
				Facilities: room.facilities ? JSON.stringify(room.facilities) : '',
				Accessible: room.is_accessible ? 'Yes' : 'No',
				Status: room.is_active ? 'Active' : 'Inactive',
				'Created At': new Date(room.created_at).toLocaleDateString(),
			}
		})

		const ws = XLSX.utils.json_to_sheet(exportData)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Exam Rooms')

		// Auto-size columns
		const maxWidth = 30
		const colWidths = Object.keys(exportData[0] || {}).map((key) => ({
			wch: Math.min(
				Math.max(
					key.length,
					...exportData.map((row) => String(row[key as keyof typeof row]).length)
				),
				maxWidth
			),
		}))
		ws['!cols'] = colWidths

		XLSX.writeFile(wb, `exam_rooms_${new Date().toISOString().split('T')[0]}.xlsx`)

		toast({
			title: '✅ Export Successful',
			description: 'Exam rooms exported as Excel successfully.',
			className:
				'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
		})
	}

	const handleDownloadTemplate = () => {
		const wb = XLSX.utils.book_new()

		// Sheet 1: Template with sample row
		const sampleData = [
			{
				'Institution Code': 'JKKN',
				'Room Code': 'ROOM101',
				'Room Name': 'Main Hall A',
				Building: 'Main Block',
				Floor: 'Ground Floor',
				'Room Order': '1',
				'Seating Capacity': '100',
				'Exam Capacity': '80',
				Rows: '10',
				Columns: '10',
				'Room Type': 'Examination Hall',
				Facilities: '{"projector": true, "ac": true, "cctv": true}',
				Accessible: 'Yes',
				Status: 'Active',
			},
		]

		const ws = XLSX.utils.json_to_sheet(sampleData)

		// Set column widths
		const colWidths = [
			{ wch: 20 }, // Institution Code
			{ wch: 15 }, // Room Code
			{ wch: 25 }, // Room Name
			{ wch: 20 }, // Building
			{ wch: 15 }, // Floor
			{ wch: 12 }, // Room Order
			{ wch: 18 }, // Seating Capacity
			{ wch: 15 }, // Exam Capacity
			{ wch: 8 },  // Rows
			{ wch: 10 }, // Columns
			{ wch: 20 }, // Room Type
			{ wch: 40 }, // Facilities
			{ wch: 12 }, // Accessible
			{ wch: 10 }, // Status
		]
		ws['!cols'] = colWidths

		// Style mandatory field headers red with asterisk
		const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
		const mandatoryFields = [
			'Institution Code',
			'Room Code',
			'Room Name',
			'Room Order',
			'Seating Capacity',
			'Exam Capacity',
			'Rows',
			'Columns',
		]

		for (let col = range.s.c; col <= range.e.c; col++) {
			const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
			if (!ws[cellAddress]) continue

			const cell = ws[cellAddress]
			const isMandatory = mandatoryFields.includes(cell.v as string)

			if (isMandatory) {
				cell.v = cell.v + ' *'
				cell.s = {
					font: { color: { rgb: 'FF0000' }, bold: true },
					fill: { fgColor: { rgb: 'FFE6E6' } },
				}
			} else {
				cell.s = {
					font: { bold: true },
					fill: { fgColor: { rgb: 'F0F0F0' } },
				}
			}
		}

		XLSX.utils.book_append_sheet(wb, ws, 'Template')

		// Sheet 2: Institution Reference
		const institutionReference = institutions.map((inst) => ({
			'Institution Code': inst.institution_code,
			'Institution Name': inst.name || 'N/A',
			Status: inst.is_active ? 'Active' : 'Inactive',
		}))

		const wsInst = XLSX.utils.json_to_sheet(institutionReference)
		const refColWidths = [
			{ wch: 20 },
			{ wch: 40 },
			{ wch: 10 },
		]
		wsInst['!cols'] = refColWidths

		XLSX.utils.book_append_sheet(wb, wsInst, 'Institution Reference')

		XLSX.writeFile(wb, `exam_rooms_template_${new Date().toISOString().split('T')[0]}.xlsx`)

		toast({
			title: '✅ Template Downloaded',
			description: 'Exam room template with reference sheets downloaded successfully.',
			className:
				'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
		})
	}

	const handleImport = async (file: File) => {
		try {
			const data = await file.arrayBuffer()
			const workbook = XLSX.read(data)
			const worksheet = workbook.Sheets[workbook.SheetNames[0]]
			const jsonData = XLSX.utils.sheet_to_json(worksheet)

			if (jsonData.length === 0) {
				toast({
					title: '⚠️ Empty File',
					description: 'The uploaded file contains no data.',
					variant: 'destructive',
					className:
						'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
				})
				return
			}

			// Map Excel data to payload format
			const mapped = jsonData.map((row: any) => ({
				institution_code: String(row['Institution Code *'] || row['Institution Code'] || ''),
				room_code: String(row['Room Code *'] || row['Room Code'] || ''),
				room_name: String(row['Room Name *'] || row['Room Name'] || ''),
				building: String(row['Building'] || ''),
				floor: String(row['Floor'] || ''),
				room_order: String(row['Room Order *'] || row['Room Order'] || ''),
				seating_capacity: String(row['Seating Capacity *'] || row['Seating Capacity'] || ''),
				exam_capacity: String(row['Exam Capacity *'] || row['Exam Capacity'] || ''),
				preferred_exam_capacity: String(row['Preferred Exam Capacity'] || ''),
				max_exam_capacity: String(row['Max Exam Capacity'] || ''),
				rows: String(row['Rows *'] || row['Rows'] || ''),
				columns: String(row['Columns *'] || row['Columns'] || ''),
				room_type: String(row['Room Type'] || ''),
				facilities: String(row['Facilities'] || ''),
				is_accessible: row['Accessible'] === 'Yes' || row['Accessible'] === 'true' || row['Accessible'] === true,
				is_active: row['Status'] === 'Active' || row['Status'] === 'true' || row['Status'] === true,
			}))

			// Validate all rows first
			const validationErrors: Array<{
				row: number
				room_code: string
				room_name: string
				errors: string[]
			}> = []

			mapped.forEach((item, index) => {
				const errors = validateExamRoomData(item, index + 2)
				if (errors.length > 0) {
					validationErrors.push({
						row: index + 2,
						room_code: item.room_code || 'N/A',
						room_name: item.room_name || 'N/A',
						errors: errors,
					})
				}
			})

			// If there are validation errors, show them in popup
			if (validationErrors.length > 0) {
				setImportErrors(validationErrors)
				setUploadSummary({
					total: jsonData.length,
					success: 0,
					failed: validationErrors.length,
				})
				setErrorPopupOpen(true)
				return
			}

			// If validation passes, upload to database
			setLoading(true)
			let successCount = 0
			let errorCount = 0
			const uploadErrors: Array<{
				row: number
				room_code: string
				room_name: string
				errors: string[]
			}> = []

			for (let i = 0; i < mapped.length; i++) {
				const item = mapped[i]
				const rowNumber = i + 2 // +2 for header row

				try {
					const response = await fetch('/api/exam-management/exam-rooms', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(item),
					})

					if (response.ok) {
						const savedRoom = await response.json()
						setItems((prev) => [savedRoom, ...prev])
						successCount++
					} else {
						const errorData = await response.json()
						errorCount++
						uploadErrors.push({
							row: rowNumber,
							room_code: item.room_code || 'N/A',
							room_name: item.room_name || 'N/A',
							errors: [errorData.error || 'Failed to save exam room'],
						})
					}
				} catch (error) {
					errorCount++
					uploadErrors.push({
						row: rowNumber,
						room_code: item.room_code || 'N/A',
						room_name: item.room_name || 'N/A',
						errors: [
							error instanceof Error ? error.message : 'Network error',
						],
					})
				}
			}

			setLoading(false)
			const totalRows = mapped.length

			// Update upload summary
			setUploadSummary({
				total: totalRows,
				success: successCount,
				failed: errorCount,
			})

			// Show error dialog if needed
			if (uploadErrors.length > 0) {
				setImportErrors(uploadErrors)
				setErrorPopupOpen(true)
			}

			// Show appropriate toast message
			if (successCount > 0 && errorCount === 0) {
				toast({
					title: '✅ Upload Complete',
					description: `Successfully uploaded all ${successCount} row${
						successCount > 1 ? 's' : ''
					} (${successCount} exam room${successCount > 1 ? 's' : ''}) to the database.`,
					className:
						'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
					duration: 5000,
				})
			} else if (successCount > 0 && errorCount > 0) {
				toast({
					title: '⚠️ Partial Upload Success',
					description: `Processed ${totalRows} row${
						totalRows > 1 ? 's' : ''
					}: ${successCount} successful, ${errorCount} failed. View error details below.`,
					className:
						'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
					duration: 6000,
				})
			} else if (errorCount > 0) {
				toast({
					title: '❌ Upload Failed',
					description: `Processed ${totalRows} row${
						totalRows > 1 ? 's' : ''
					}: 0 successful, ${errorCount} failed. View error details below.`,
					variant: 'destructive',
					className:
						'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
					duration: 6000,
				})
			}
		} catch (error) {
			console.error('Import error:', error)
			toast({
				title: '❌ Import Failed',
				description: 'Failed to process the file. Please check the format and try again.',
				variant: 'destructive',
				className:
					'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		}
	}

	// Filtering, Sorting, Pagination
	const filteredItems = useMemo(() => {
		return items.filter((item) => {
			const matchesSearch =
				item.room_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
				item.room_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				(item.building &&
					item.building.toLowerCase().includes(searchTerm.toLowerCase())) ||
				(item.floor &&
					item.floor.toLowerCase().includes(searchTerm.toLowerCase()))

			const matchesStatus =
				statusFilter === 'all' ||
				(statusFilter === 'active' && item.is_active) ||
				(statusFilter === 'inactive' && !item.is_active)

			return matchesSearch && matchesStatus
		})
	}, [items, searchTerm, statusFilter])

	const sortedItems = useMemo(() => {
		return [...filteredItems].sort((a, b) => {
			const aVal = a[sortColumn as keyof ExamRoom]
			const bVal = b[sortColumn as keyof ExamRoom]

			if (aVal === null || aVal === undefined) return 1
			if (bVal === null || bVal === undefined) return -1

			if (typeof aVal === 'string' && typeof bVal === 'string') {
				return sortDirection === 'asc'
					? aVal.localeCompare(bVal)
					: bVal.localeCompare(aVal)
			}

			if (typeof aVal === 'number' && typeof bVal === 'number') {
				return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
			}

			return 0
		})
	}, [filteredItems, sortColumn, sortDirection])

	const pageSizeOptions = useMemo(() => [10, 20, 50, 100], [])
	const isShowAll = itemsPerPage === -1
	const effectivePerPage = isShowAll ? sortedItems.length : itemsPerPage
	const totalPages = isShowAll ? 1 : Math.ceil(sortedItems.length / effectivePerPage)
	const paginatedItems = useMemo(() => {
		if (isShowAll) return sortedItems
		const startIndex = (currentPage - 1) * effectivePerPage
		return sortedItems.slice(startIndex, startIndex + effectivePerPage)
	}, [sortedItems, currentPage, isShowAll, effectivePerPage])

	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
		} else {
			setSortColumn(column)
			setSortDirection('asc')
		}
	}

	const SortIcon = ({ column }: { column: string }) => {
		if (sortColumn !== column)
			return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />
		return sortDirection === 'asc' ? (
			<ArrowUp className="ml-1 h-3 w-3" />
		) : (
			<ArrowDown className="ml-1 h-3 w-3" />
		)
	}

	// Scorecards
	const totalRooms = items.length
	const activeRooms = items.filter((r) => r.is_active).length
	const inactiveRooms = items.filter((r) => !r.is_active).length
	const newThisMonth = items.filter((r) => {
		const createdDate = new Date(r.created_at)
		const now = new Date()
		return (
			createdDate.getMonth() === now.getMonth() &&
			createdDate.getFullYear() === now.getFullYear()
		)
	}).length

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
									<BreadcrumbPage>Exam Rooms</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Scorecards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Total Rooms</p>
										<p className="text-xl font-bold">{totalRooms}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<Building2 className="h-3 w-3 text-blue-600 dark:text-blue-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Active Rooms</p>
										<p className="text-xl font-bold text-green-600">{activeRooms}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
										<CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Inactive Rooms</p>
										<p className="text-xl font-bold text-red-600">{inactiveRooms}</p>
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
										<p className="text-xl font-bold text-blue-600">{newThisMonth}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
										<TrendingUp className="h-3 w-3 text-purple-600 dark:text-purple-400" />
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

				<Card className="flex-1 flex flex-col min-h-0">
					<CardHeader className="flex-shrink-0 p-3">
						<div className="flex items-center justify-between mb-2">
							<div className="flex items-center gap-2">
								<div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
									<Building2 className="h-3 w-3 text-primary" />
								</div>
								<div>
									<h2 className="text-sm font-semibold">Exam Rooms</h2>
									<p className="text-xs text-muted-foreground">Manage examination halls</p>
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
									<Input
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
										placeholder="Search..."
										className="pl-8 h-8 text-xs"
									/>
								</div>
							</div>

							<div className="flex gap-1 flex-wrap">
								<Button
									variant="outline"
									size="sm"
									className="text-xs px-2 h-8"
									onClick={fetchData}
									disabled={loading}
								>
									<RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
									Refresh
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="text-xs px-2 h-8"
									onClick={handleDownloadTemplate}
								>
									<FileText className="h-3 w-3 mr-1" />
									Template
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="text-xs px-2 h-8"
									onClick={handleExportExcel}
								>
									<FileDown className="h-3 w-3 mr-1" />
									Download
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="text-xs px-2 h-8"
									onClick={handleExportJSON}
								>
									<FileDown className="h-3 w-3 mr-1" />
									JSON
								</Button>
								<label>
									<input
										type="file"
										accept=".json,.csv,.xlsx,.xls"
										onChange={(e) => {
											const file = e.target.files?.[0]
											if (file) handleImport(file)
											e.target.value = ''
										}}
										className="hidden"
									/>
									<Button
										variant="outline"
										size="sm"
										className="text-xs px-2 h-8"
										asChild
									>
										<span>
											<Upload className="h-3 w-3 mr-1" />
											Upload
										</span>
									</Button>
								</label>
								<Button
									size="sm"
									className="text-xs px-2 h-8"
									onClick={() => {
										resetForm()
										setSheetOpen(true)
									}}
								>
									<Plus className="h-3 w-3 mr-1" />
									Add
								</Button>
							</div>
						</div>
					</CardHeader>

					<CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
						<div className="rounded-md border overflow-hidden" style={{ height: "440px" }}>
							<div className="h-full overflow-auto">
						<Table>
							<TableHeader>
								<TableRow>
									{/* Show Institution column only when "All Institutions" is selected */}
									{mustSelectInstitution && (
										<TableHead className="text-xs">Institution</TableHead>
									)}
									<TableHead
										className="text-xs cursor-pointer"
										onClick={() => handleSort('room_code')}
									>
										<div className="flex items-center">
											Room Code
											<SortIcon column="room_code" />
										</div>
									</TableHead>
									<TableHead
										className="text-xs cursor-pointer"
										onClick={() => handleSort('room_name')}
									>
										<div className="flex items-center">
											Room Name
											<SortIcon column="room_name" />
										</div>
									</TableHead>
									<TableHead className="text-xs">Building</TableHead>
									<TableHead className="text-xs">Floor</TableHead>
									<TableHead
										className="text-xs cursor-pointer"
										onClick={() => handleSort('room_order')}
									>
										<div className="flex items-center">
											Order
											<SortIcon column="room_order" />
										</div>
									</TableHead>
									<TableHead
										className="text-xs cursor-pointer"
										onClick={() => handleSort('seating_capacity')}
									>
										<div className="flex items-center">
											Capacity
											<SortIcon column="seating_capacity" />
										</div>
									</TableHead>
									<TableHead
										className="text-xs cursor-pointer"
										onClick={() => handleSort('exam_capacity')}
									>
										<div className="flex items-center">
											Exam Cap.
											<SortIcon column="exam_capacity" />
										</div>
									</TableHead>
									<TableHead className="text-xs">Layout</TableHead>
									<TableHead className="text-xs">Type</TableHead>
									<TableHead className="text-xs">Accessible</TableHead>
									<TableHead className="text-xs">Status</TableHead>
									<TableHead className="text-xs text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{loading || !isReady ? (
									<TableRow>
										<TableCell colSpan={mustSelectInstitution ? 13 : 12} className="text-center text-xs py-8">
											<RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
											Loading exam rooms...
										</TableCell>
									</TableRow>
								) : paginatedItems.length === 0 ? (
									<TableRow>
										<TableCell colSpan={mustSelectInstitution ? 13 : 12} className="text-center text-xs py-8">
											<Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
											<p className="text-muted-foreground">No exam rooms found</p>
											<p className="text-xs text-muted-foreground mt-1">
												{searchTerm || statusFilter !== 'all'
													? 'Try adjusting your search or filters'
													: 'Click "Add Room" to create your first exam room'}
											</p>
										</TableCell>
									</TableRow>
								) : (
									paginatedItems.map((room) => (
										<TableRow key={room.id}>
											{/* Show Institution cell only when "All Institutions" is selected */}
											{mustSelectInstitution && (
												<TableCell className="text-xs">
													{institutions.find(i => i.id === room.institutions_id)?.institution_code || '-'}
												</TableCell>
											)}
											<TableCell className="text-xs font-medium">
												{room.room_code}
											</TableCell>
											<TableCell className="text-xs">{room.room_name}</TableCell>
											<TableCell className="text-xs">
												{room.building || '-'}
											</TableCell>
											<TableCell className="text-xs">
												{room.floor || '-'}
											</TableCell>
											<TableCell className="text-xs">{room.room_order}</TableCell>
											<TableCell className="text-xs">
												{room.seating_capacity}
											</TableCell>
											<TableCell className="text-xs">
												{room.exam_capacity}
											</TableCell>
											<TableCell className="text-xs">
												{room.rows} × {room.columns}
											</TableCell>
											<TableCell className="text-xs">
												{room.room_type || '-'}
											</TableCell>
											<TableCell className="text-xs">
												{room.is_accessible ? (
													<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 text-xs">
														Yes
													</Badge>
												) : (
													<Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400 text-xs">
														No
													</Badge>
												)}
											</TableCell>
											<TableCell className="text-xs">
												{room.is_active ? (
													<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 text-xs">
														Active
													</Badge>
												) : (
													<Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400 text-xs">
														Inactive
													</Badge>
												)}
											</TableCell>
											<TableCell className="text-right">
												<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => handleEdit(room)}><Pencil className="h-3 w-3 mr-2" /> Edit</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-red-600" onClick={() => { setItemToDelete(room); setDeleteDialogOpen(true) }}><Trash2 className="h-3 w-3 mr-2" /> Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu><div style={{ display: 'none' }}>
													<Button
														variant="ghost"
														size="sm"
														style={{ display: 'none' }}
														className="h-7 w-7 p-0"
													>
														{/* DROPDOWN_PLACEHOLDER */}
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => {
															setItemToDelete(room)
															setDeleteDialogOpen(true)
														}}
														style={{ display: 'none' }}
													>
														<Trash2 className="h-3 w-3" />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
							</div>
						</div>

						{/* Pagination */}
					{true && (
						<div className="flex items-center justify-between py-2 mt-2">
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<span>Showing {sortedItems.length === 0 ? 0 : (currentPage - 1) * effectivePerPage + 1}-{Math.min(currentPage * effectivePerPage, sortedItems.length)} of {sortedItems.length}</span>
								<Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(v === '-1' ? -1 : Number(v)); setCurrentPage(1) }}><SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger><SelectContent>{pageSizeOptions.map(size => (<SelectItem key={size} value={String(size)}>{size} / page</SelectItem>))}<SelectItem value="-1">All</SelectItem></SelectContent></Select>
							</div>
							<div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1 || isShowAll} className="h-7 px-2 text-xs"><ChevronLeft className="h-3 w-3 mr-1" /> Previous</Button><div className="text-xs text-muted-foreground px-2">Page {currentPage} of {totalPages}</div><Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages || isShowAll} className="h-7 px-2 text-xs">Next <ChevronRight className="h-3 w-3 ml-1" /></Button><div style={{display:'none'}}>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
									disabled={currentPage === 1}
									className="h-8"
								>
									<ChevronLeft className="h-4 w-4" />
								</Button>
								<div className="flex items-center gap-1">
									{Array.from({ length: totalPages }, (_, i) => i + 1)
										.filter(
											(page) =>
												page === 1 ||
												page === totalPages ||
												Math.abs(page - currentPage) <= 1
										)
										.map((page, index, array) => (
											<>
												{index > 0 && array[index - 1] !== page - 1 && (
													<span className="px-2 text-xs text-muted-foreground">
														...
													</span>
												)}
												<Button
													key={page}
													variant={currentPage === page ? 'default' : 'outline'}
													size="sm"
													onClick={() => setCurrentPage(page)}
													className="h-8 w-8 p-0 text-xs"
												>
													{page}
												</Button>
											</>
										))}
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										setCurrentPage((p) => Math.min(totalPages, p + 1))
									}
									disabled={currentPage === totalPages}
									className="h-8"
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
						</div>
						</div>
					)}
					</CardContent>
				</Card>
			</div>
			<AppFooter />
		</SidebarInset>

			{/* Add/Edit Sheet */}
			<Sheet
				open={sheetOpen}
				onOpenChange={(o) => {
					if (!o) resetForm()
					setSheetOpen(o)
				}}
			>
				<SheetContent className="sm:max-w-[900px] overflow-y-auto">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle>{editing ? 'Edit Exam Room' : 'Add Exam Room'}</SheetTitle>
						<SheetDescription className="text-sm text-muted-foreground">{editing ? 'Update exam room information' : 'Create a new exam room record'}</SheetDescription>
					</SheetHeader>

					<div className="mt-6 space-y-6">
						{/* Basic Information Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">Basic Information</h3><div style={{display:'none'}} className="flex items-center gap-3 pb-3 border-b border-blue-200 dark:border-blue-800">
								<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
									<Building2 className="h-4 w-4 text-white" />
								</div>
								<h3 className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
									Basic Information
								</h3>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Institution dropdown - show only when needed */}
								{(mustSelectInstitution || !shouldFilter || !institutionId) && (
									<div className="space-y-2">
										<Label htmlFor="institution_code" className="text-sm font-semibold">
											Institution <span className="text-red-500">*</span>
										</Label>
										<Select
											value={formData.institution_code}
											onValueChange={(value) =>
												setFormData({ ...formData, institution_code: value })
											}
										>
											<SelectTrigger
												id="institution_code"
												className={`h-10 ${errors.institution_code ? 'border-destructive' : ''}`}
											>
												<SelectValue placeholder="Select Institution" />
											</SelectTrigger>
											<SelectContent>
												{institutions.map((inst) => (
													<SelectItem
														key={inst.id}
														value={inst.institution_code}
													>
														{inst.institution_code} - {inst.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{errors.institution_code && (
											<p className="text-xs text-destructive">
												{errors.institution_code}
											</p>
										)}
									</div>
								)}

								<div className="space-y-2">
									<Label htmlFor="room_code" className="text-sm font-semibold">
										Room Code <span className="text-red-500">*</span>
									</Label>
									<Input
										id="room_code"
										value={formData.room_code}
										onChange={(e) =>
											setFormData({ ...formData, room_code: e.target.value })
										}
										placeholder="e.g., ROOM101"
										className={`h-10 ${errors.room_code ? 'border-destructive' : ''}`}
									/>
									{errors.room_code && (
										<p className="text-xs text-destructive">{errors.room_code}</p>
									)}
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="room_name" className="text-sm font-semibold">
									Room Name <span className="text-red-500">*</span>
								</Label>
								<Input
									id="room_name"
									value={formData.room_name}
									onChange={(e) =>
										setFormData({ ...formData, room_name: e.target.value })
									}
									placeholder="e.g., Main Examination Hall A"
									className={`h-10 ${errors.room_name ? 'border-destructive' : ''}`}
								/>
								{errors.room_name && (
									<p className="text-xs text-destructive">{errors.room_name}</p>
								)}
							</div>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div className="space-y-2">
									<Label htmlFor="building" className="text-sm font-medium">
										Building
									</Label>
									<Input
										id="building"
										value={formData.building}
										onChange={(e) =>
											setFormData({ ...formData, building: e.target.value })
										}
										placeholder="e.g., Main Block"
										className="h-10"
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="floor" className="text-sm font-medium">
										Floor
									</Label>
									<Input
										id="floor"
										value={formData.floor}
										onChange={(e) =>
											setFormData({ ...formData, floor: e.target.value })
										}
										placeholder="e.g., Ground Floor"
										className="h-10"
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="room_order" className="text-sm font-semibold">
										Room Order <span className="text-red-500">*</span>
									</Label>
									<Input
										id="room_order"
										type="number"
										value={formData.room_order}
										onChange={(e) =>
											setFormData({ ...formData, room_order: e.target.value })
										}
										placeholder="1"
										className={`h-10 ${errors.room_order ? 'border-destructive' : ''}`}
									/>
									{errors.room_order && (
										<p className="text-xs text-destructive">{errors.room_order}</p>
									)}
								</div>
							</div>
						</div>

						{/* Capacity & Layout Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">Capacity & Layout</h3><div style={{display:'none'}} className="flex items-center gap-3 pb-3 border-b border-purple-200 dark:border-purple-800">
								<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center">
									<Users className="h-4 w-4 text-white" />
								</div>
								<h3 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
									Capacity & Layout
								</h3>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="seating_capacity" className="text-sm font-semibold">
										Seating Capacity <span className="text-red-500">*</span>
									</Label>
									<Input
										id="seating_capacity"
										type="number"
										value={formData.seating_capacity}
										onChange={(e) =>
											setFormData({
												...formData,
												seating_capacity: e.target.value,
											})
										}
										placeholder="100"
										className={`h-10 ${errors.seating_capacity ? 'border-destructive' : ''}`}
									/>
									{errors.seating_capacity && (
										<p className="text-xs text-destructive">
											{errors.seating_capacity}
										</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="exam_capacity" className="text-sm font-semibold">
										Exam Capacity <span className="text-red-500">*</span>
									</Label>
									<Input
										id="exam_capacity"
										type="number"
										value={formData.exam_capacity}
										onChange={(e) =>
											setFormData({ ...formData, exam_capacity: e.target.value })
										}
										placeholder="80"
										className={`h-10 ${errors.exam_capacity ? 'border-destructive' : ''}`}
									/>
									{errors.exam_capacity && (
										<p className="text-xs text-destructive">{errors.exam_capacity}</p>
									)}
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="preferred_exam_capacity" className="text-sm font-semibold">
										Preferred Exam Capacity
									</Label>
									<Input
										id="preferred_exam_capacity"
										type="number"
										value={formData.preferred_exam_capacity}
										onChange={(e) =>
											setFormData({ ...formData, preferred_exam_capacity: e.target.value })
										}
										placeholder="e.g. 30"
										className={`h-10 ${errors.preferred_exam_capacity ? 'border-destructive' : ''}`}
									/>
									{errors.preferred_exam_capacity && (
										<p className="text-xs text-destructive">{errors.preferred_exam_capacity}</p>
									)}
									<p className="text-xs text-muted-foreground">Normal seating target for auto-allocation</p>
								</div>

								<div className="space-y-2">
									<Label htmlFor="max_exam_capacity" className="text-sm font-semibold">
										Max Exam Capacity
									</Label>
									<Input
										id="max_exam_capacity"
										type="number"
										value={formData.max_exam_capacity}
										onChange={(e) =>
											setFormData({ ...formData, max_exam_capacity: e.target.value })
										}
										placeholder="e.g. 35"
										className={`h-10 ${errors.max_exam_capacity ? 'border-destructive' : ''}`}
									/>
									{errors.max_exam_capacity && (
										<p className="text-xs text-destructive">{errors.max_exam_capacity}</p>
									)}
									<p className="text-xs text-muted-foreground">Overflow limit for last room when learners exceed</p>
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="rows" className="text-sm font-semibold">
										Rows <span className="text-red-500">*</span>
									</Label>
									<Input
										id="rows"
										type="number"
										value={formData.rows}
										onChange={(e) =>
											setFormData({ ...formData, rows: e.target.value })
										}
										placeholder="10"
										className={`h-10 ${errors.rows ? 'border-destructive' : ''}`}
									/>
									{errors.rows && (
										<p className="text-xs text-destructive">{errors.rows}</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="columns" className="text-sm font-semibold">
										Columns <span className="text-red-500">*</span>
									</Label>
									<Input
										id="columns"
										type="number"
										value={formData.columns}
										onChange={(e) =>
											setFormData({ ...formData, columns: e.target.value })
										}
										placeholder="10"
										className={`h-10 ${errors.columns ? 'border-destructive' : ''}`}
									/>
									{errors.columns && (
										<p className="text-xs text-destructive">{errors.columns}</p>
									)}
								</div>
							</div>
						</div>

						{/* Additional Details Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">Additional Details</h3><div style={{display:'none'}} className="flex items-center gap-3 pb-3 border-b border-teal-200 dark:border-teal-800">
								<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-600 flex items-center justify-center">
									<Grid3x3 className="h-4 w-4 text-white" />
								</div>
								<h3 className="text-lg font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
									Additional Details
								</h3>
							</div>

							<div className="space-y-2">
								<Label htmlFor="room_type" className="text-sm font-medium">
									Room Type
								</Label>
								<Input
									id="room_type"
									value={formData.room_type}
									onChange={(e) =>
										setFormData({ ...formData, room_type: e.target.value })
									}
									placeholder="e.g., Examination Hall, Lab, Auditorium"
									className="h-10"
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="facilities" className="text-sm font-medium">
									Facilities (JSON)
								</Label>
								<Textarea
									id="facilities"
									value={formData.facilities}
									onChange={(e) =>
										setFormData({ ...formData, facilities: e.target.value })
									}
									placeholder='{"projector": true, "ac": true, "cctv": true}'
									className="min-h-[80px] font-mono text-xs"
								/>
								<p className="text-xs text-muted-foreground">
									Enter valid JSON format for facilities
								</p>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="flex items-center gap-4">
									<Label className="text-sm font-semibold">Accessible</Label>
									<button
										type="button"
										onClick={() =>
											setFormData({
												...formData,
												is_accessible: !formData.is_accessible,
											})
										}
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
											formData.is_accessible ? 'bg-green-500' : 'bg-gray-300'
										}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
												formData.is_accessible ? 'translate-x-6' : 'translate-x-1'
											}`}
										/>
									</button>
									<span
										className={`text-sm font-medium ${
											formData.is_accessible ? 'text-green-600' : 'text-gray-500'
										}`}
									>
										{formData.is_accessible ? 'Yes' : 'No'}
									</span>
								</div>

								<div className="flex items-center gap-4">
									<Label className="text-sm font-semibold">Active</Label>
									<button
										type="button"
										onClick={() =>
											setFormData({
												...formData,
												is_active: !formData.is_active,
											})
										}
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
											formData.is_active ? 'bg-green-500' : 'bg-gray-300'
										}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
												formData.is_active ? 'translate-x-6' : 'translate-x-1'
											}`}
										/>
									</button>
									<span
										className={`text-sm font-medium ${
											formData.is_active ? 'text-green-600' : 'text-red-500'
										}`}
									>
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
								onClick={() => {
									setSheetOpen(false)
									resetForm()
								}}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								className="h-10 px-6"
								onClick={handleSave}
								disabled={saving}
							>
								{saving ? (
									<>
										<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
										Saving...
									</>
								) : editing ? (
									'Update Exam Room'
								) : (
									'Create Exam Room'
								)}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete the exam room{' '}
							<span className="font-semibold">{itemToDelete?.room_name}</span>. This
							action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setItemToDelete(null)}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction onClick={handleDelete} className="bg-destructive">
							Delete
						</AlertDialogAction>
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
						{/* Upload Summary Cards */}
						{uploadSummary.total > 0 && (
							<div className="grid grid-cols-3 gap-3">
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
							</div>
						)}

						{/* Error Summary */}
						<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
							<div className="flex items-center gap-2 mb-2">
								<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
								<span className="font-semibold text-red-800 dark:text-red-200">
									{importErrors.length} row{importErrors.length > 1 ? 's' : ''}{' '}
									failed validation
								</span>
							</div>
							<p className="text-sm text-red-700 dark:text-red-300">
								Please correct these errors in your Excel file and try uploading
								again. Row numbers correspond to your Excel file (including header
								row).
							</p>
						</div>

						{/* Detailed Error List */}
						<div className="space-y-3">
							{importErrors.map((error, index) => (
								<div
									key={index}
									className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/5"
								>
									<div className="flex items-start justify-between mb-2">
										<div className="flex items-center gap-2">
											<Badge
												variant="outline"
												className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-200 dark:border-red-700"
											>
												Row {error.row}
											</Badge>
											<span className="font-medium text-sm">
												{error.room_code} - {error.room_name}
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
									<span className="text-xs font-bold text-blue-600 dark:text-blue-400">
										i
									</span>
								</div>
								<div>
									<h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">
										Common Fixes:
									</h4>
									<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
										<li>• Ensure all required fields are provided and not empty</li>
										<li>
											• Institution code must reference an existing institution
										</li>
										<li>
											• Exam capacity must not exceed seating capacity
										</li>
										<li>
											• Room code can only contain letters, numbers, hyphens, and
											underscores
										</li>
										<li>• All numeric fields must be positive integers</li>
										<li>• Facilities must be valid JSON format (if provided)</li>
										<li>
											• Status values: Active/Inactive or true/false
										</li>
										<li>• Accessible values: Yes/No or true/false</li>
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
