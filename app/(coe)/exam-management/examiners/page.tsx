'use client'

import { useState, useEffect, useRef } from 'react'
import XLSX from '@/lib/utils/excel-compat'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/common/use-toast'
import {
	PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown,
	Users, FileSpreadsheet, RefreshCw, XCircle, AlertTriangle, Download, Upload, FileJson, Eye,
	Mail, Phone, Building2, GraduationCap, CheckCircle2, Clock, Ban, Send, Loader2, MailCheck, MoreHorizontal,
	Link2, Copy, Check, ExternalLink,
} from 'lucide-react'
import type { Examiner, ExaminerStatus, ExaminerType, ExaminerFormData, ExaminerImportError, ExaminerFormConfig } from '@/types/examiner'
import { EXAMINER_STATUS_OPTIONS, EXAMINER_TYPE_OPTIONS, DEFAULT_EXAMINER_FORM } from '@/types/examiner'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'

interface Board {
	id: string
	board_code: string
	board_name: string
	board_type?: string
}




export default function ExaminersPage() {
	const { toast } = useToast()
	const { hasPermission } = useAuth()

	// Institution filter hook
	const {
		filter,
		isReady,
		appendToUrl,
		getInstitutionIdForCreate,
		getInstitutionCodeForCreate,
		institutionCode,
		institutionId,
		mustSelectInstitution,
		shouldFilter
	} = useInstitutionFilter()

	// Permissions
	const canEdit = true // hasPermission('examiners.edit')
	const canDelete = true // hasPermission('examiners.delete')
	const canCreate = true // hasPermission('examiners.create')

	// Data state
	const [items, setItems] = useState<Examiner[]>([])
	const [boards, setBoards] = useState<Board[]>([])
	const [loading, setLoading] = useState(true)
	const [totalCount, setTotalCount] = useState(0)
	const [examinerStats, setExaminerStats] = useState({ total: 0, active: 0, pending: 0, verified: 0 })

	// Filter state
	const [searchTerm, setSearchTerm] = useState('')
	const [debouncedSearch, setDebouncedSearch] = useState('')
	const [statusFilter, setStatusFilter] = useState('all')
	const [typeFilter, setTypeFilter] = useState('all')
	const [boardFilter, setBoardFilter] = useState('all')
	const [formTypeFilter, setFormTypeFilter] = useState('all')

	// Active tab
	const [activeTab, setActiveTab] = useState<'examiners' | 'form-settings'>('examiners')

	// Form config state (for Form Settings tab)
	const [formConfigs, setFormConfigs] = useState<ExaminerFormConfig[]>([])
	const [formConfigsLoading, setFormConfigsLoading] = useState(false)
	const [configSheetOpen, setConfigSheetOpen] = useState(false)
	const [editingConfig, setEditingConfig] = useState<ExaminerFormConfig | null>(null)
	const [configFormData, setConfigFormData] = useState({
		institution_code: '',
		form_type: 'engineering',
		url_slug: '',
		form_title: '',
		form_description: '',
		exam_session_label: '',
		departments: [] as string[],
		designations: [] as string[],
		willingness_roles: [] as string[],
		salutations: ['Dr', 'Mr', 'Mrs', 'Ms'] as string[],
		is_active: true,
	})
	const [newTagInputs, setNewTagInputs] = useState({
		departments: '',
		designations: '',
		willingness_roles: '',
		salutations: '',
	})
	const [configSaving, setConfigSaving] = useState(false)

	// Sort & Pagination (server-driven)
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(10)
	const [deleteTarget, setDeleteTarget] = useState<Examiner | null>(null)

	// Form state
	const [sheetOpen, setSheetOpen] = useState(false)
	const [editing, setEditing] = useState<Examiner | null>(null)
	const [formData, setFormData] = useState<ExaminerFormData>(DEFAULT_EXAMINER_FORM)
	const [errors, setErrors] = useState<Record<string, string>>({})
	const [saving, setSaving] = useState(false)

	// Import state
	const [errorPopupOpen, setErrorPopupOpen] = useState(false)
	const [importErrors, setImportErrors] = useState<ExaminerImportError[]>([])
	const [uploadSummary, setUploadSummary] = useState({ total: 0, success: 0, failed: 0 })

	// Registration link state
	const [regLinkOpen, setRegLinkOpen] = useState(false)
	const [copied, setCopied] = useState<string | null>(null)

	// Institutions for template export dropdowns
	const [institutions, setInstitutions] = useState<Array<{ id: string; institution_code: string; institution_name: string }>>([])

	// Import progress modal state
	const [importInProgress, setImportInProgress] = useState(false)
	const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })

	const registrationOrigin = typeof window !== 'undefined' ? window.location.origin : ''

	// Resolve registration form slug for an institution: form config slug → name heuristic → arts default
	const getRegistrationSlug = (instId?: string | null, instCode?: string | null): string => {
		const config = formConfigs.find(c =>
			c.is_active && ((instCode && c.institution_code === instCode) || (instId && c.institution_id === instId))
		)
		if (config) return config.url_slug
		const inst = institutions.find(i => i.id === instId || i.institution_code === instCode)
		if (inst?.institution_name?.toLowerCase().includes('engineering')) return 'engg-examiner-registration'
		return 'arts-examiner-registration'
	}

	// Selected institution → its link; All Institutions (global) → one link per institution, grouped by shared form
	const registrationLinks: Array<{ label: string; url: string }> = mustSelectInstitution
		? (() => {
			const bySlug = new Map<string, string[]>()
			institutions.forEach(inst => {
				const slug = getRegistrationSlug(inst.id, inst.institution_code)
				bySlug.set(slug, [...(bySlug.get(slug) || []), inst.institution_code])
			})
			if (bySlug.size === 0) bySlug.set('arts-examiner-registration', [])
			return Array.from(bySlug.entries()).map(([slug, codes]) => ({
				label: codes.join(', '),
				url: `${registrationOrigin}/${slug}`,
			}))
		})()
		: [{
			label: institutionCode || '',
			url: `${registrationOrigin}/${getRegistrationSlug(institutionId, institutionCode)}`,
		}]

	const handleCopyLink = async (url: string) => {
		try {
			await navigator.clipboard.writeText(url)
			setCopied(url)
			setTimeout(() => setCopied(null), 2000)
		} catch {
			toast({ title: '❌ Copy Failed', description: 'Could not copy to clipboard.', variant: 'destructive' })
		}
	}

	// Debounce search input (300ms)
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	useEffect(() => {
		if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
		searchTimerRef.current = setTimeout(() => {
			setDebouncedSearch(searchTerm)
			setCurrentPage(1)
		}, 300)
		return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
	}, [searchTerm])

	// Fetch data when institution filter is ready or server params change
	useEffect(() => {
		if (!isReady) return
		fetchExaminers()
	}, [isReady, filter, currentPage, itemsPerPage, debouncedSearch, statusFilter, typeFilter, boardFilter, formTypeFilter, sortColumn, sortDirection])

	// Fetch boards when institution filter changes (boards are institution-specific)
	useEffect(() => {
		if (!isReady) return
		fetchBoards()
		setBoardFilter('all')
	}, [isReady, filter])

	// Fetch institutions once on mount
	useEffect(() => {
		if (!isReady) return
		fetchInstitutions()
	}, [isReady])

	const fetchExaminers = async () => {
		try {
			setLoading(true)
			const url = new URL(appendToUrl('/api/examiners'), window.location.origin)
			url.searchParams.set('page', String(currentPage))
			url.searchParams.set('limit', itemsPerPage === 'all' ? '9999' : String(itemsPerPage))
			if (debouncedSearch) url.searchParams.set('search', debouncedSearch)
			if (statusFilter !== 'all') url.searchParams.set('status', statusFilter)
			if (typeFilter !== 'all') url.searchParams.set('examiner_type', typeFilter)
			if (boardFilter !== 'all') url.searchParams.set('board_id', boardFilter)
			if (formTypeFilter !== 'all') url.searchParams.set('form_type', formTypeFilter)
			if (sortColumn) {
				url.searchParams.set('sort_by', sortColumn)
				url.searchParams.set('sort_dir', sortDirection)
			}

			const res = await fetch(url.toString())
			if (res.ok) {
				const result = await res.json()
				setItems(result.data || [])
				setTotalCount(result.total || 0)
				if (result.stats) setExaminerStats(result.stats)
			}
		} catch (error) {
			console.error('Error fetching examiners:', error)
		} finally {
			setLoading(false)
		}
	}

	const fetchBoards = async () => {
		try {
			const res = await fetch(appendToUrl('/api/master/boards'))
			if (res.ok) {
				const data = await res.json()
				setBoards(data)
			}
		} catch (error) {
			console.error('Error fetching boards:', error)
		}
	}

	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/master/institutions')
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.map((i: any) => ({
					id: i.id,
					institution_code: i.institution_code,
					institution_name: i.institution_name || i.name || '',
				})))
			}
		} catch {
			// Non-critical: institutions needed for form dropdown and template export
		}
	}

	// Server-driven pagination values
	const effectiveLimit = itemsPerPage === 'all' ? 9999 : itemsPerPage
	const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(totalCount / itemsPerPage) || 1
	const startIndex = (currentPage - 1) * effectiveLimit
	const endIndex = startIndex + items.length
	const pageItems = items // Already paginated from server

	// Reset to page 1 when filters change (except search, which is handled by debounce)
	useEffect(() => setCurrentPage(1), [statusFilter, typeFilter, boardFilter, formTypeFilter, itemsPerPage])

	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
		} else {
			setSortColumn(column)
			setSortDirection('asc')
		}
		setCurrentPage(1)
	}

	const getSortIcon = (column: string) => {
		if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
		return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
	}

	// Determine form type based on institution
	const getFormTypeForInstitution = (instId: string, instCode?: string): string => {
		// Check form configs first
		const config = formConfigs.find(c =>
			c.form_type === 'engineering' && (c.institution_code === instCode || c.institution_id === instId)
		)
		if (config) return 'engineering'
		// Check institution name
		const inst = institutions.find(i => i.id === instId || i.institution_code === instCode)
		if (inst?.institution_name?.toLowerCase().includes('engineering')) return 'engineering'
		return 'arts'
	}

	// Form handling
	const resetForm = () => {
		const autoInstitutionId = getInstitutionIdForCreate() || ''
		const autoInstitutionCode = getInstitutionCodeForCreate() || ''
		const autoFormType = autoInstitutionId ? getFormTypeForInstitution(autoInstitutionId, autoInstitutionCode) : 'arts'

		setFormData({
			...DEFAULT_EXAMINER_FORM,
			institution_id: autoInstitutionId,
			institution_code: autoInstitutionCode,
			form_type: autoFormType,
		})
		setEditing(null)
		setErrors({})
	}

	const openAddForm = () => {
		resetForm()
		setSheetOpen(true)
	}

	const openEditForm = (examiner: Examiner) => {
		setEditing(examiner)
		const ad = (examiner.additional_data || {}) as Record<string, unknown>
		const specs = (ad.specializations || {}) as Record<string, string>
		const courses = (ad.courses || {}) as Record<string, { course: string; times: string }[]>
		setFormData({
			full_name: examiner.full_name,
			email: examiner.email,
			mobile: examiner.mobile || '',
			designation: examiner.designation || '',
			department: examiner.department || '',
			institution_name: examiner.institution_name || '',
			institution_address: examiner.institution_address || '',
			ug_experience_years: examiner.ug_experience_years,
			pg_experience_years: examiner.pg_experience_years,
			examiner_type: examiner.examiner_type,
			is_internal: examiner.is_internal,
			address: examiner.address || '',
			city: examiner.city || '',
			state: examiner.state || '',
			pincode: examiner.pincode || '',
			status: examiner.status,
			status_remarks: examiner.status_remarks || '',
			institution_id: examiner.institution_id || '',
			institution_code: examiner.institution_code || '',
			notes: examiner.notes || '',
			ug_board_id: examiner.ug_board_id || '',
			pg_board_id: examiner.pg_board_id || '',
			ug_board_codes: examiner.boards?.filter(b => b.board?.board_type === 'UG').map(b => b.board_code || '') || [],
			pg_board_codes: examiner.boards?.filter(b => b.board?.board_type === 'PG').map(b => b.board_code || '') || [],
			// Engineering-specific fields
			form_type: examiner.form_type || 'arts',
			salutation: examiner.salutation || '',
			gender: examiner.gender || '',
			highest_qualification: examiner.highest_qualification || '',
			aicte_faculty_code: examiner.aicte_faculty_code || '',
			personal_email: examiner.personal_email || '',
			official_email: examiner.official_email || '',
			institution_coe_contact: examiner.institution_coe_contact || '',
			institution_coe_email: examiner.institution_coe_email || '',
			teaching_exp_years: examiner.teaching_exp_years || 0,
			industry_exp_years: examiner.industry_exp_years || 0,
			total_exp_years: examiner.total_exp_years || 0,
			area_of_expertise: examiner.area_of_expertise || '',
			willingness_roles: examiner.willingness_roles || [],
			additional_data: {
				specializations: specs,
				courses: {
					theory: courses.theory || [],
					practical: courses.practical || [],
				},
			},
			willing_for_valuation: examiner.boards?.[0]?.willing_for_valuation ?? true,
			willing_for_practical: examiner.boards?.[0]?.willing_for_practical ?? false,
			willing_for_scrutiny: examiner.boards?.[0]?.willing_for_scrutiny ?? false,
		})
		setSheetOpen(true)
	}

	const validate = () => {
		const e: Record<string, string> = {}
		if (!formData.full_name.trim()) e.full_name = 'Full name is required'
		if (!formData.email.trim()) e.email = 'Email is required'
		if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
			e.email = 'Invalid email format'
		}
		setErrors(e)
		return Object.keys(e).length === 0
	}

	const handleSave = async () => {
		if (!validate()) {
			toast({ title: '⚠️ Validation Error', description: 'Please fix all errors.', variant: 'destructive' })
			return
		}

		// For new records, ensure institution is set
		// For normal users, auto-fill from context if not already set
		let saveData = { ...formData }
		if (!editing && !saveData.institution_id) {
			const autoId = getInstitutionIdForCreate()
			const autoCode = getInstitutionCodeForCreate()
			if (autoId) {
				saveData.institution_id = autoId
				saveData.institution_code = autoCode || ''
			} else {
				toast({ title: '⚠️ Validation Error', description: 'Please select an institution.', variant: 'destructive' })
				return
			}
		}

		try {
			setSaving(true)
			const url = '/api/examiners'
			const method = editing ? 'PUT' : 'POST'
			const body = editing ? { ...saveData, id: editing.id } : saveData

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})

			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Save failed')
			}

			const saved = await res.json()

			toast({
				title: editing ? '✅ Examiner Updated' : '✅ Examiner Created',
				description: `${saved.full_name} has been ${editing ? 'updated' : 'created'} successfully.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			setSheetOpen(false)
			resetForm()
			fetchExaminers()
		} catch (error) {
			toast({
				title: '❌ Save Failed',
				description: error instanceof Error ? error.message : 'Please try again.',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}

	const handleDelete = async (id: string) => {
		try {
			setLoading(true)
			const examiner = items.find((i) => i.id === id)

			const res = await fetch(`/api/examiners?id=${id}`, { method: 'DELETE' })
			if (!res.ok) throw new Error('Delete failed')

			toast({
				title: '✅ Examiner Deleted',
				description: `${examiner?.full_name} has been deleted.`,
				className: 'bg-orange-50 border-orange-200 text-orange-800',
			})
			fetchExaminers()
		} catch (error) {
			toast({ title: '❌ Delete Failed', description: 'Please try again.', variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}

	const handleStatusToggle = async (examiner: Examiner) => {
		const newStatus = examiner.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
		try {
			const res = await fetch(`/api/examiners/${examiner.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: newStatus }),
			})

			if (!res.ok) throw new Error('Status update failed')

			toast({
				title: '✅ Status Updated',
				description: `${examiner.full_name} is now ${newStatus.toLowerCase()}.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			fetchExaminers()
		} catch (error) {
			toast({ title: '❌ Update Failed', description: 'Please try again.', variant: 'destructive' })
		}
	}

	const getStatusBadge = (status: ExaminerStatus) => {
		const config = EXAMINER_STATUS_OPTIONS.find((s) => s.value === status)
		return (
			<Badge className={`${config?.color || 'bg-gray-100 text-gray-700'} border-0`}>
				{config?.label || status}
			</Badge>
		)
	}

	// Helper: fetch all filtered examiners for export (bypasses pagination)
	const fetchAllForExport = async (): Promise<Examiner[]> => {
		try {
			const url = new URL(appendToUrl('/api/examiners'), window.location.origin)
			url.searchParams.set('export', 'true')
			if (debouncedSearch) url.searchParams.set('search', debouncedSearch)
			if (statusFilter !== 'all') url.searchParams.set('status', statusFilter)
			if (typeFilter !== 'all') url.searchParams.set('examiner_type', typeFilter)
			if (boardFilter !== 'all') url.searchParams.set('board_id', boardFilter)
			if (sortColumn) {
				url.searchParams.set('sort_by', sortColumn)
				url.searchParams.set('sort_dir', sortDirection)
			}
			const res = await fetch(url.toString())
			if (res.ok) {
				const result = await res.json()
				return result.data || []
			}
		} catch (error) {
			console.error('Export fetch error:', error)
		}
		return []
	}

	// ── Export handlers ──────────────────────────────────────────────────────
	const handleExportJSON = async () => {
		const allData = await fetchAllForExport()
		const exportData = allData.map((e) => ({
			full_name: e.full_name,
			email: e.email,
			mobile: e.mobile || '',
			designation: e.designation || '',
			department: e.department || '',
			institution_name: e.institution_name || '',
			examiner_type: e.examiner_type,
			status: e.status,
			ug_experience_years: e.ug_experience_years,
			pg_experience_years: e.pg_experience_years,
			institution_code: e.institution_code || '',
			created_at: e.created_at,
		}))
		const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `examiners_${new Date().toISOString().split('T')[0]}.json`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	const handleExportExcel = async () => {
		const allData = await fetchAllForExport()
		const excelData = allData.map((e) => {
			const additionalData = (e.additional_data || {}) as Record<string, any>
			const ugSpec = additionalData.ug_specialization || additionalData.specializations?.ug || ''
			const pgSpec = additionalData.pg_specialization || additionalData.specializations?.pg || ''
			const phdSpec = additionalData.phd_specialization || additionalData.specializations?.phd || ''

			const theoryCourses = (additionalData.theory_courses || additionalData.courses?.theory || [])
				.filter((c: any) => c.course?.trim())
				.map((c: any) => `${c.course} - ${c.times || '0'} Times`)
				.join('; ')
			const practicalCourses = (additionalData.practical_courses || additionalData.courses?.practical || [])
				.filter((c: any) => c.course?.trim())
				.map((c: any) => `${c.course} - ${c.times || '0'} Times`)
				.join('; ')

			return {
				'Full Name': e.full_name,
				'Email': e.email,
				'Mobile': e.mobile || '',
				'Designation': e.designation || '',
				'Department': e.department || '',
				'Institution Name': e.institution_name || '',
				'Examiner Type': e.examiner_type,
				'Status': e.status,
				'UG Experience (Yrs)': e.ug_experience_years,
				'PG Experience (Yrs)': e.pg_experience_years,
				'UG Board': e.boards?.filter(b => b.board?.board_type === 'UG').map(b => b.board?.board_name).join(', ') || '',
				'PG Board': e.boards?.filter(b => b.board?.board_type === 'PG').map(b => b.board?.board_name).join(', ') || '',
				'Email Verified': e.email_verified ? 'Yes' : 'No',
				'COE Institution Code': e.institution_code || '',
				'Created': new Date(e.created_at).toISOString().split('T')[0],
				'Form Type': e.form_type || '',
				'Salutation': e.salutation || '',
				'Gender': e.gender || '',
				'Highest Qualification': e.highest_qualification || '',
				'AICTE Faculty Code': e.aicte_faculty_code || '',
				'Personal Email': e.personal_email || '',
				'Official Email': e.official_email || '',
				'Institution COE Contact': e.institution_coe_contact || '',
				'Institution COE Email': e.institution_coe_email || '',
				'Teaching Experience (Yrs)': e.teaching_exp_years ?? '',
				'Industry Experience (Yrs)': e.industry_exp_years ?? '',
				'Total Experience (Yrs)': e.total_exp_years ?? '',
				'Area of Expertise': e.area_of_expertise || '',
				'Willingness Roles': (e.willingness_roles || []).join(', '),
				'UG Specialization': ugSpec,
				'PG Specialization': pgSpec,
				'PhD Specialization': phdSpec,
				'Theory Courses': theoryCourses,
				'Practical Courses': practicalCourses,
				'Declaration Acknowledged': e.declaration_acknowledged ? 'Yes' : 'No',
			}
		})
		const ws = XLSX.utils.json_to_sheet(excelData)
		ws['!cols'] = [
			{ wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 25 }, { wch: 25 },
			{ wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 20 },
			{ wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 22 }, { wch: 12 },
			{ wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 25 }, { wch: 22 },
			{ wch: 28 }, { wch: 28 }, { wch: 22 }, { wch: 28 },
			{ wch: 22 }, { wch: 22 }, { wch: 22 },
			{ wch: 30 }, { wch: 25 },
			{ wch: 25 }, { wch: 25 }, { wch: 25 },
			{ wch: 40 }, { wch: 40 },
			{ wch: 25 },
		]
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Examiners')
		await XLSX.writeFile(wb, `examiners_export_${new Date().toISOString().split('T')[0]}.xlsx`)
	}

	const handleTemplateExport = async (templateFormType: 'arts' | 'engineering' = 'arts') => {
		const wb = XLSX.utils.book_new()
		const isEngg = templateFormType === 'engineering'

		// Sheet 1: Template — columns differ by form type
		const baseSample: Record<string, string | number> = {
			'COE Institution Code': institutionCode || '',
			'Form Type': templateFormType,
			'Full Name *': '',
			'Email *': '',
			'Mobile': '',
			'Designation': '',
			'Department': '',
			'Institution Name': '',
			'Status': 'PENDING',
		}

		let sample: Record<string, string | number>[]
		let colWidths: { wch: number }[]

		if (isEngg) {
			sample = [{
				...baseSample,
				'Salutation': '',
				'Gender': '',
				'Highest Qualification': '',
				'AICTE Faculty Code': '',
				'Personal Email': '',
				'Official Email': '',
				'Institution Address/Pincode': '',
				'Institution COE Contact': '',
				'Institution COE Email': '',
				'Teaching Exp (Yrs)': '',
				'Industry Exp (Yrs)': '',
				'Total Exp (Yrs)': '',
				'Area of Expertise': '',
				'Willingness Roles': '',
				'UG Specialization': '',
				'PG Specialization': '',
				'PhD Specialization': '',
				'Theory Courses': '',
				'Practical Courses': '',
			}]
			colWidths = [
				{ wch: 22 }, { wch: 14 }, { wch: 30 }, { wch: 30 }, { wch: 15 },
				{ wch: 25 }, { wch: 25 }, { wch: 35 }, { wch: 12 },
				{ wch: 10 }, { wch: 10 }, { wch: 25 }, { wch: 22 },
				{ wch: 28 }, { wch: 28 }, { wch: 35 },
				{ wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
				{ wch: 30 }, { wch: 35 },
				{ wch: 25 }, { wch: 25 }, { wch: 25 },
				{ wch: 40 }, { wch: 40 },
			]
		} else {
			sample = [{
				...baseSample,
				'Examiner Type *': 'UG',
				'UG Board Code': '',
				'PG Board Code': '',
				'UG Experience (Yrs)': '',
				'PG Experience (Yrs)': '',
			}]
			colWidths = [
				{ wch: 22 }, { wch: 14 }, { wch: 30 }, { wch: 30 }, { wch: 15 },
				{ wch: 25 }, { wch: 25 }, { wch: 35 }, { wch: 12 },
				{ wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 22 }, { wch: 22 },
			]
		}

		const ws = XLSX.utils.json_to_sheet(sample)
		ws['!cols'] = colWidths

		// Dropdowns
		const statusValues = ['PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED']
		const instCodes = institutions.map(i => i.institution_code).filter(Boolean)
		const validations: any[] = [
			{ type: 'list', sqref: 'A2:A1000', formula1: `"${instCodes.join(',')}"`, showDropDown: true, showErrorMessage: true, errorTitle: 'Invalid Institution', error: 'Select a valid institution code' },
			{ type: 'list', sqref: 'B2:B1000', formula1: '"arts,engineering"', showDropDown: true, showErrorMessage: true, errorTitle: 'Invalid Form Type', error: 'Select: arts or engineering' },
		]

		if (isEngg) {
			// Status at col I, Salutation at J, Gender at K
			validations.push({ type: 'list', sqref: 'I2:I1000', formula1: `"${statusValues.join(',')}"`, showDropDown: true, showErrorMessage: true, errorTitle: 'Invalid Status', error: 'Select: PENDING, ACTIVE, INACTIVE, REJECTED' })
			// Fetch form config for engineering departments/designations/willingness_roles
			const matchedConfig = formConfigs.find(c => c.form_type === 'engineering') || null
			if (matchedConfig) {
				const salutations = matchedConfig.salutations || ['Dr', 'Mr', 'Mrs', 'Ms']
				validations.push({ type: 'list', sqref: 'J2:J1000', formula1: `"${salutations.join(',')}"`, showDropDown: true })
				const genders = ['Male', 'Female', 'Other']
				validations.push({ type: 'list', sqref: 'K2:K1000', formula1: `"${genders.join(',')}"`, showDropDown: true })
				if (matchedConfig.departments?.length) {
					validations.push({ type: 'list', sqref: 'G2:G1000', formula1: `"${matchedConfig.departments.join(',')}"`, showDropDown: true })
				}
				if (matchedConfig.designations?.length) {
					validations.push({ type: 'list', sqref: 'F2:F1000', formula1: `"${matchedConfig.designations.join(',')}"`, showDropDown: true })
				}
				if (matchedConfig.willingness_roles?.length) {
					// Willingness roles column — users can enter comma-separated values
				}
			}
		} else {
			// Arts: Status at col I, Examiner Type at col J
			validations.push({ type: 'list', sqref: 'I2:I1000', formula1: `"${statusValues.join(',')}"`, showDropDown: true, showErrorMessage: true, errorTitle: 'Invalid Status', error: 'Select: PENDING, ACTIVE, INACTIVE, REJECTED' })
			const examinerTypes = ['UG', 'PG', 'UG_PG', 'PRACTICAL', 'SCRUTINY', 'ALL']
			validations.push({ type: 'list', sqref: 'J2:J1000', formula1: `"${examinerTypes.join(',')}"`, showDropDown: true, showErrorMessage: true, errorTitle: 'Invalid Type', error: 'Select a valid examiner type' })
			const ugBoardCodes = boards.filter(b => b.board_type === 'UG').map(b => b.board_code)
			const pgBoardCodes = boards.filter(b => b.board_type === 'PG').map(b => b.board_code)
			if (ugBoardCodes.length > 0) {
				validations.push({ type: 'list', sqref: 'K2:K1000', formula1: `"${ugBoardCodes.join(',')}"`, showDropDown: true })
			}
			if (pgBoardCodes.length > 0) {
				validations.push({ type: 'list', sqref: 'L2:L1000', formula1: `"${pgBoardCodes.join(',')}"`, showDropDown: true })
			}
		}

		ws['!dataValidation'] = validations
		XLSX.utils.book_append_sheet(wb, ws, 'Template')

		// Sheet 2: Reference Codes
		const refData: any[] = []
		if (!isEngg) {
			const examinerTypes = ['UG', 'PG', 'UG_PG', 'PRACTICAL', 'SCRUTINY', 'ALL']
			refData.push({ 'Type': '═══ EXAMINER TYPES ═══', 'Code': '', 'Description': '' })
			examinerTypes.forEach(t => refData.push({ 'Type': 'Examiner Type', 'Code': t, 'Description': t.replace('_', ' & ') }))
		}
		refData.push({ 'Type': '═══ STATUS VALUES ═══', 'Code': '', 'Description': '' })
		statusValues.forEach(s => refData.push({ 'Type': 'Status', 'Code': s, 'Description': s }))
		if (!isEngg && boards.length > 0) {
			refData.push({ 'Type': '═══ UG BOARDS ═══', 'Code': '', 'Description': '' })
			boards.filter(b => b.board_type === 'UG').forEach(b => refData.push({ 'Type': 'UG Board', 'Code': b.board_code, 'Description': b.board_name }))
			refData.push({ 'Type': '═══ PG BOARDS ═══', 'Code': '', 'Description': '' })
			boards.filter(b => b.board_type === 'PG').forEach(b => refData.push({ 'Type': 'PG Board', 'Code': b.board_code, 'Description': b.board_name }))
		}
		if (isEngg) {
			const matchedConfig = formConfigs.find(c => c.form_type === 'engineering') || null
			if (matchedConfig?.departments?.length) {
				refData.push({ 'Type': '═══ DEPARTMENTS ═══', 'Code': '', 'Description': '' })
				matchedConfig.departments.forEach(d => refData.push({ 'Type': 'Department', 'Code': d, 'Description': d }))
			}
			if (matchedConfig?.designations?.length) {
				refData.push({ 'Type': '═══ DESIGNATIONS ═══', 'Code': '', 'Description': '' })
				matchedConfig.designations.forEach(d => refData.push({ 'Type': 'Designation', 'Code': d, 'Description': d }))
			}
			if (matchedConfig?.willingness_roles?.length) {
				refData.push({ 'Type': '═══ WILLINGNESS ROLES ═══', 'Code': '', 'Description': 'Enter comma-separated' })
				matchedConfig.willingness_roles.forEach(r => refData.push({ 'Type': 'Willingness Role', 'Code': r, 'Description': r }))
			}
		}
		if (instCodes.length > 0) {
			refData.push({ 'Type': '═══ INSTITUTION CODES ═══', 'Code': '', 'Description': '' })
			institutions.forEach(i => refData.push({ 'Type': 'Institution', 'Code': i.institution_code, 'Description': i.institution_name }))
		}
		const wsRef = XLSX.utils.json_to_sheet(refData)
		wsRef['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 40 }]
		XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Codes')

		const suffix = isEngg ? 'engineering' : 'arts'
		await XLSX.writeFile(wb, `examiners_template_${suffix}_${new Date().toISOString().split('T')[0]}.xlsx`)
	}

	// ── Import handler ────────────────────────────────────────────────────────
	const handleImport = () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.json,.csv,.xlsx,.xls'
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (!file) return
			try {
				let rows: any[] = []
				if (file.name.endsWith('.json')) {
					const text = await file.text()
					rows = JSON.parse(text)
				} else if (file.name.endsWith('.csv')) {
					const text = await file.text()
					const lines = text.split('\n').filter(l => l.trim())
					if (lines.length < 2) { toast({ title: '❌ Invalid CSV', description: 'CSV must have a header row and data rows.', variant: 'destructive' }); return }
					const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
					rows = lines.slice(1).map(line => {
						const vals = line.split(',').map(v => v.trim().replace(/"/g, ''))
						const row: Record<string, string> = {}
						headers.forEach((h, i) => { row[h] = vals[i] || '' })
						return row
					})
				} else {
					const data = await file.arrayBuffer()
					const wb = await XLSX.read(data)
					const ws = wb.Sheets[wb.SheetNames[0]]
					rows = XLSX.utils.sheet_to_json(ws) as any[]
				}
				await processImportedRows(rows)
			} catch (err) {
				console.error('Import error:', err)
				setImportInProgress(false)
				toast({ title: '❌ Import Error', description: 'Failed to parse file. Check the format.', variant: 'destructive' })
			}
		}
		input.click()
	}

	const mapRowToExaminer = (row: Record<string, any>) => {
		const instCode = String(row['COE Institution Code'] || row['institution_code'] || institutionCode || '').trim()
		const inst = institutions.find(i => i.institution_code === instCode)
		const instId = inst?.id || getInstitutionIdForCreate() || ''

		// Detect form type from row data — presence of engineering-specific columns or explicit column
		const rowFormType = String(row['Form Type'] || row['form_type'] || '').trim().toLowerCase()
		const isEngg = rowFormType === 'engineering'
			|| !!row['AICTE Faculty Code'] || !!row['aicte_faculty_code']
			|| !!row['Willingness Roles'] || !!row['willingness_roles']
			|| !!row['Teaching Exp (Yrs)'] || !!row['teaching_exp_years']

		// Common fields
		const base = {
			full_name: String(row['Full Name *'] || row['Full Name'] || row['full_name'] || '').trim(),
			email: String(row['Email *'] || row['Email'] || row['email'] || '').trim().toLowerCase(),
			mobile: String(row['Mobile'] || row['mobile'] || '').trim(),
			designation: String(row['Designation'] || row['designation'] || '').trim(),
			department: String(row['Department'] || row['department'] || '').trim(),
			institution_name: String(row['Institution Name'] || row['institution_name'] || '').trim(),
			status: String(row['Status'] || row['status'] || 'PENDING').trim().toUpperCase(),
			institution_code: instCode,
			institution_id: instId,
			form_type: isEngg ? 'engineering' : (rowFormType || 'arts'),
		}

		if (isEngg) {
			// Engineering-specific fields
			const willingnessStr = String(row['Willingness Roles'] || row['willingness_roles'] || '').trim()
			const willingness_roles = willingnessStr ? willingnessStr.split(',').map((s: string) => s.trim()).filter(Boolean) : []

			// Parse theory/practical courses: "Course1 - 2 Times; Course2 - 1 Times"
			const parseCoursesStr = (str: string) => {
				if (!str) return []
				return str.split(';').map(s => s.trim()).filter(Boolean).map(entry => {
					const parts = entry.split(' - ')
					return { course: parts[0]?.trim() || '', times: parts[1]?.replace(/\s*Times?\s*/i, '').trim() || '' }
				})
			}

			return {
				...base,
				examiner_type: 'ALL' as const,
				salutation: String(row['Salutation'] || row['salutation'] || '').trim(),
				gender: String(row['Gender'] || row['gender'] || '').trim(),
				highest_qualification: String(row['Highest Qualification'] || row['highest_qualification'] || '').trim(),
				aicte_faculty_code: String(row['AICTE Faculty Code'] || row['aicte_faculty_code'] || '').trim(),
				personal_email: String(row['Personal Email'] || row['personal_email'] || '').trim(),
				official_email: String(row['Official Email'] || row['official_email'] || '').trim(),
				institution_address: String(row['Institution Address/Pincode'] || row['institution_address'] || '').trim(),
				institution_coe_contact: String(row['Institution COE Contact'] || row['institution_coe_contact'] || '').trim(),
				institution_coe_email: String(row['Institution COE Email'] || row['institution_coe_email'] || '').trim(),
				teaching_exp_years: parseInt(String(row['Teaching Exp (Yrs)'] || row['teaching_exp_years'] || '0')) || 0,
				industry_exp_years: parseInt(String(row['Industry Exp (Yrs)'] || row['industry_exp_years'] || '0')) || 0,
				total_exp_years: parseInt(String(row['Total Exp (Yrs)'] || row['total_exp_years'] || '0')) || 0,
				area_of_expertise: String(row['Area of Expertise'] || row['area_of_expertise'] || '').trim(),
				willingness_roles,
				additional_data: {
					ug_specialization: String(row['UG Specialization'] || '').trim(),
					pg_specialization: String(row['PG Specialization'] || '').trim(),
					phd_specialization: String(row['PhD Specialization'] || '').trim(),
					theory_courses: parseCoursesStr(String(row['Theory Courses'] || '')),
					practical_courses: parseCoursesStr(String(row['Practical Courses'] || '')),
				},
				// Not used for engineering but keep defaults
				ug_board_code: '',
				pg_board_code: '',
				ug_experience_years: 0,
				pg_experience_years: 0,
			}
		}

		// Arts fields
		return {
			...base,
			examiner_type: String(row['Examiner Type *'] || row['Examiner Type'] || row['examiner_type'] || 'UG').trim().toUpperCase(),
			ug_experience_years: parseInt(String(row['UG Experience (Yrs)'] || row['ug_experience_years'] || '0')) || 0,
			pg_experience_years: parseInt(String(row['PG Experience (Yrs)'] || row['pg_experience_years'] || '0')) || 0,
			ug_board_code: String(row['UG Board Code'] || row['ug_board_code'] || '').trim(),
			pg_board_code: String(row['PG Board Code'] || row['pg_board_code'] || '').trim(),
		}
	}

	const processImportedRows = async (rows: any[]) => {
		setImportInProgress(true)
		setImportProgress({ current: 0, total: rows.length })

		const validationErrors: ExaminerImportError[] = []
		const mapped = rows.map((r, i) => {
			const item = mapRowToExaminer(r)
			const errs: string[] = []
			if (!item.full_name) errs.push('Full name is required')
			if (!item.email) errs.push('Email is required')
			else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) errs.push('Invalid email format')
			// Only validate examiner_type for arts rows
			if (item.form_type !== 'engineering') {
				if (!['UG', 'PG', 'UG_PG', 'PRACTICAL', 'SCRUTINY', 'ALL'].includes(item.examiner_type)) errs.push(`Invalid examiner type: ${item.examiner_type}`)
			}
			if (errs.length > 0) validationErrors.push({ row: i + 2, email: item.email || 'N/A', full_name: item.full_name || 'N/A', errors: errs })
			return item
		}).filter(r => r.full_name && r.email)

		if (validationErrors.length > 0) {
			setImportInProgress(false)
			setImportErrors(validationErrors)
			setUploadSummary({ total: rows.length, success: 0, failed: validationErrors.length })
			setErrorPopupOpen(true)
			return
		}

		let successCount = 0
		let errorCount = 0
		const uploadErrors: ExaminerImportError[] = []

		for (let i = 0; i < mapped.length; i++) {
			setImportProgress({ current: i + 1, total: mapped.length })
			const item = mapped[i]

			let payload: Record<string, any> = { ...item }

			// For arts rows, resolve board associations
			if (item.form_type !== 'engineering' && ('ug_board_code' in item || 'pg_board_code' in item)) {
				const ugBoardCode = (item as any).ug_board_code || ''
				const pgBoardCode = (item as any).pg_board_code || ''
				const ugBoard = boards.find(b => b.board_code === ugBoardCode && b.board_type === 'UG')
				const pgBoard = boards.find(b => b.board_code === pgBoardCode && b.board_type === 'PG')
				payload.ug_board_id = ugBoard?.id || null
				payload.pg_board_id = pgBoard?.id || null
				payload.board_associations = [
					...(ugBoard ? [{ board_id: ugBoard.id, board_code: ugBoard.board_code, willing_for_valuation: true, willing_for_practical: false, willing_for_scrutiny: false }] : []),
					...(pgBoard ? [{ board_id: pgBoard.id, board_code: pgBoard.board_code, willing_for_valuation: true, willing_for_practical: false, willing_for_scrutiny: false }] : []),
				]
			}

			// Clean up temporary mapping keys not expected by API
			delete payload.ug_board_code
			delete payload.pg_board_code

			try {
				const res = await fetch('/api/examiners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
				if (res.ok) {
					await res.json()
					successCount++
				} else {
					const errData = await res.json()
					errorCount++
					uploadErrors.push({ row: i + 2, email: item.email, full_name: item.full_name, errors: [errData.error || 'Failed to save'] })
				}
			} catch {
				errorCount++
				uploadErrors.push({ row: i + 2, email: item.email, full_name: item.full_name, errors: ['Network error'] })
			}
		}

		setImportInProgress(false)
		setUploadSummary({ total: mapped.length, success: successCount, failed: errorCount })
		if (uploadErrors.length > 0) { setImportErrors(uploadErrors); setErrorPopupOpen(true) }

		// Refetch to show imported data
		if (successCount > 0) fetchExaminers()

		if (successCount > 0 && errorCount === 0) {
			toast({ title: '✅ Import Complete', description: `Successfully imported ${successCount} examiner${successCount > 1 ? 's' : ''}.`, className: 'bg-green-50 border-green-200 text-green-800' })
		} else if (successCount > 0 && errorCount > 0) {
			toast({ title: '⚠️ Partial Import', description: `${successCount} imported, ${errorCount} failed.`, className: 'bg-yellow-50 border-yellow-200 text-yellow-800' })
		} else {
			toast({ title: '❌ Import Failed', description: `${errorCount} row${errorCount > 1 ? 's' : ''} failed.`, variant: 'destructive' })
		}
	}

	// ── Form Config CRUD ─────────────────────────────────────────────────────
	const fetchFormConfigs = async () => {
		try {
			setFormConfigsLoading(true)
			const url = appendToUrl('/api/examiner-form-configs')
			const res = await fetch(url)
			if (res.ok) {
				setFormConfigs(await res.json())
			}
		} catch (error) {
			console.error('Error fetching form configs:', error)
		} finally {
			setFormConfigsLoading(false)
		}
	}

	useEffect(() => {
		if (isReady) {
			fetchFormConfigs()
		}
	}, [isReady, filter])

	const handleSaveConfig = async () => {
		try {
			setConfigSaving(true)
			const payload = { ...configFormData }
			const isEditing = !!editingConfig

			const res = await fetch('/api/examiner-form-configs', {
				method: isEditing ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(isEditing ? { id: editingConfig.id, ...payload } : payload),
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data.error || 'Failed to save')

			toast({
				title: isEditing ? '✅ Updated' : '✅ Created',
				description: `Form config ${isEditing ? 'updated' : 'created'} successfully.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			setConfigSheetOpen(false)
			resetConfigForm()
			fetchFormConfigs()
		} catch (error) {
			toast({
				title: '❌ Failed',
				description: error instanceof Error ? error.message : 'Please try again.',
				variant: 'destructive',
			})
		} finally {
			setConfigSaving(false)
		}
	}

	const handleDeleteConfig = async (id: string) => {
		if (!confirm('Delete this form config?')) return
		try {
			const res = await fetch(`/api/examiner-form-configs?id=${id}`, { method: 'DELETE' })
			if (res.ok) {
				toast({ title: '✅ Deleted', className: 'bg-green-50 border-green-200 text-green-800' })
				fetchFormConfigs()
			}
		} catch (error) {
			toast({ title: '❌ Failed', variant: 'destructive' })
		}
	}

	const resetConfigForm = () => {
		setEditingConfig(null)
		setConfigFormData({
			institution_code: '',
			form_type: 'engineering',
			url_slug: '',
			form_title: '',
			form_description: '',
			exam_session_label: '',
			departments: [],
			designations: [],
			willingness_roles: [],
			salutations: ['Dr', 'Mr', 'Mrs', 'Ms'],
			is_active: true,
		})
		setNewTagInputs({ departments: '', designations: '', willingness_roles: '', salutations: '' })
	}

	const editConfig = (config: ExaminerFormConfig) => {
		setEditingConfig(config)
		setConfigFormData({
			institution_code: config.institution_code || '',
			form_type: config.form_type,
			url_slug: config.url_slug,
			form_title: config.form_title || '',
			form_description: config.form_description || '',
			exam_session_label: config.exam_session_label || '',
			departments: config.departments || [],
			designations: config.designations || [],
			willingness_roles: config.willingness_roles || [],
			salutations: config.salutations || ['Dr', 'Mr', 'Mrs', 'Ms'],
			is_active: config.is_active,
		})
		setConfigSheetOpen(true)
	}

	const addTag = (field: 'departments' | 'designations' | 'willingness_roles' | 'salutations') => {
		const value = newTagInputs[field].trim()
		if (!value || configFormData[field].includes(value)) return
		setConfigFormData(prev => ({ ...prev, [field]: [...prev[field], value] }))
		setNewTagInputs(prev => ({ ...prev, [field]: '' }))
	}

	const removeTag = (field: 'departments' | 'designations' | 'willingness_roles' | 'salutations', index: number) => {
		setConfigFormData(prev => ({
			...prev,
			[field]: prev[field].filter((_: string, i: number) => i !== index),
		}))
	}

	// Stats are now provided by the API response (see fetchExaminers)

	return (
		<SidebarProvider>
			{/* Import Loading Modal */}
			{importInProgress && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
					<div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4">
						<div className="flex flex-col items-center gap-4">
							<Loader2 className="h-12 w-12 text-emerald-600 animate-spin" />
							<div className="text-center">
								<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Importing Examiners</h3>
								<p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Please wait while the data is being processed...</p>
							</div>
							{importProgress.total > 0 && (
								<div className="w-full space-y-2">
									<div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
										<span>Progress</span>
										<span>{importProgress.current} / {importProgress.total}</span>
									</div>
									<div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
										<div className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }} />
									</div>
									<p className="text-xs text-center text-slate-500">{Math.round((importProgress.current / importProgress.total) * 100)}% complete</p>
								</div>
							)}
						</div>
					</div>
				</div>
			)}
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
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
										<BreadcrumbPage>Examiners</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>

						{/* Tab Bar */}
						<div className="flex gap-1 border-b mb-4">
							<button
								className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'examiners' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
								onClick={() => setActiveTab('examiners')}
							>
								Examiners
							</button>
							<button
								className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'form-settings' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
								onClick={() => setActiveTab('form-settings')}
							>
								Form Settings
							</button>
						</div>

						{activeTab === 'examiners' && (<>
						{/* Stats Cards */}
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
							<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{examinerStats.total}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Examiners</p>
										</div>
										<Users className="h-5 w-5 text-blue-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{examinerStats.active}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Active</p>
										</div>
										<CheckCircle2 className="h-5 w-5 text-emerald-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{examinerStats.pending}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Pending</p>
										</div>
										<Clock className="h-5 w-5 text-amber-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-teal-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{examinerStats.verified}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Email Verified</p>
										</div>
										<MailCheck className="h-5 w-5 text-teal-500/40" />
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Main Table Card */}
						<Card className="flex-1 flex flex-col min-h-0">
							<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
								<div className="space-y-3">
									{/* Title & Actions */}
									<div className="flex items-center justify-between">
										<div>
											<h2 className="text-base font-semibold">Examiner Management</h2>
											<p className="text-xs text-muted-foreground">Manage examiner panel for valuations &amp; practicals</p>
										</div>

										<div className="flex items-center gap-1.5">
											<Button variant="outline" size="sm" onClick={fetchExaminers} disabled={loading} className="h-8 w-8 p-0" title="Refresh">
												<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
											</Button>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="outline" size="sm" className="h-8 text-sm px-3">
														<Download className="h-3.5 w-3.5 mr-1.5" />Export<ChevronDown className="h-3 w-3 ml-1" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end" className="w-52">
													<DropdownMenuItem onClick={() => handleTemplateExport('arts')}>
														<FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
														Arts Template
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => handleTemplateExport('engineering')}>
														<FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
														Engineering Template
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem onClick={handleExportExcel}>
														<FileSpreadsheet className="h-4 w-4 mr-2" />
														Export Excel
													</DropdownMenuItem>
													<DropdownMenuItem onClick={handleExportJSON}>
														<FileJson className="h-4 w-4 mr-2" />
														Export JSON
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
											<Button variant="outline" size="sm" onClick={handleImport} className="h-8 text-sm px-3">
												<Upload className="h-3.5 w-3.5 mr-1.5" />Import
											</Button>
											<Button variant="outline" size="sm" onClick={() => setRegLinkOpen(true)} className="h-8 text-sm px-3 border-emerald-200 text-emerald-700 hover:bg-emerald-50" title="Examiner Registration Link">
												<Link2 className="h-3.5 w-3.5 mr-1.5" />Reg. Link
											</Button>
											<Button size="sm" onClick={openAddForm} disabled={!canCreate} className="h-8 text-sm px-4">
												<PlusCircle className="h-3.5 w-3.5 mr-1.5" />Add Examiner
											</Button>
										</div>
									</div>

									{/* Filters */}
									<div className="flex flex-wrap items-center gap-2">
										<Select value={statusFilter} onValueChange={setStatusFilter}>
											<SelectTrigger className="h-8 text-sm w-[140px]">
												<SelectValue placeholder="Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Status</SelectItem>
												{EXAMINER_STATUS_OPTIONS.map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select value={typeFilter} onValueChange={setTypeFilter}>
											<SelectTrigger className="h-8 text-sm w-[140px]">
												<SelectValue placeholder="Type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Types</SelectItem>
												{EXAMINER_TYPE_OPTIONS.map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select value={boardFilter} onValueChange={setBoardFilter}>
											<SelectTrigger className="h-8 text-sm w-[200px]">
												<SelectValue placeholder="Board" />
											</SelectTrigger>
											<SelectContent className="max-w-[300px]">
												<SelectItem value="all">All Boards</SelectItem>
												{boards.filter(b => b.board_type === 'UG').sort((a, b) => (a.board_name || '').localeCompare(b.board_name || '')).map((board) => (
													<SelectItem key={board.id} value={board.id} className="whitespace-normal">{board.board_name} (UG)</SelectItem>
												))}
												{boards.filter(b => b.board_type === 'PG').sort((a, b) => (a.board_name || '').localeCompare(b.board_name || '')).map((board) => (
													<SelectItem key={board.id} value={board.id} className="whitespace-normal">{board.board_name} (PG)</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select value={formTypeFilter} onValueChange={(v) => { setFormTypeFilter(v); setCurrentPage(1) }}>
											<SelectTrigger className="w-[140px] h-8 text-sm">
												<SelectValue placeholder="Form Type" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Forms</SelectItem>
												<SelectItem value="engineering">Engineering</SelectItem>
												<SelectItem value="arts">Arts</SelectItem>
											</SelectContent>
										</Select>

										<div className="relative flex-1 max-w-sm">
											<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
											<Input
												value={searchTerm}
												onChange={(e) => setSearchTerm(e.target.value)}
												placeholder="Search examiners..."
												className="pl-8 h-8 text-sm"
											/>
										</div>
									</div>
								</div>
							</CardHeader>

							<CardContent className="flex-1 overflow-auto p-0">
								<Table>
										<TableHeader className="sticky top-0 z-10 bg-muted/50">
											<TableRow>
												{mustSelectInstitution && (
													<TableHead className="text-xs font-semibold">COE Institution</TableHead>
												)}
												<TableHead className="text-xs font-semibold">
													<Button variant="ghost" size="sm" onClick={() => handleSort('full_name')} className="px-2">
														Name {getSortIcon('full_name')}
													</Button>
												</TableHead>
												<TableHead className="text-xs font-semibold">Contact</TableHead>
												<TableHead className="text-xs font-semibold">
													<Button variant="ghost" size="sm" onClick={() => handleSort('institution_name')} className="px-2">
														Institution {getSortIcon('institution_name')}
													</Button>
												</TableHead>
												<TableHead className="text-xs font-semibold">
													<Button variant="ghost" size="sm" onClick={() => handleSort('examiner_type')} className="px-2">
														Type {getSortIcon('examiner_type')}
													</Button>
												</TableHead>
												<TableHead className="text-xs font-semibold">Status</TableHead>
												<TableHead className="text-xs font-semibold">Form</TableHead>
												<TableHead className="text-xs font-semibold">Verified</TableHead>
												<TableHead className="text-center text-xs font-semibold">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{loading || !isReady ? (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 9 : 8} className="h-24 text-center text-sm text-slate-500">
														Loading...
													</TableCell>
												</TableRow>
											) : pageItems.length ? (
												pageItems.map((row) => (
													<TableRow key={row.id} className="border-b border-slate-200 hover:bg-slate-50">
														{mustSelectInstitution && (
															<TableCell>
																<Badge variant="outline" className="text-xs">
																	{institutions.find(i => i.id === row.institution_id)?.institution_code || row.institution_code || '-'}
																</Badge>
															</TableCell>
														)}
														<TableCell>
															<div>
																<p className="font-medium text-slate-900">{row.full_name}</p>
																<p className="text-xs text-slate-500">{row.designation}</p>
															</div>
														</TableCell>
														<TableCell>
															<div className="space-y-1">
																<div className="flex items-center gap-1 text-sm text-slate-600">
																	<Mail className="h-3 w-3" />
																	{row.email}
																</div>
																{row.mobile && (
																	<div className="flex items-center gap-1 text-sm text-slate-500">
																		<Phone className="h-3 w-3" />
																		{row.mobile}
																	</div>
																)}
															</div>
														</TableCell>
														<TableCell>
															<div className="max-w-[200px]">
																<p className="text-sm text-slate-900 truncate">{row.institution_name || '-'}</p>
																<p className="text-xs text-slate-500">{row.department}</p>
															</div>
														</TableCell>
														<TableCell>
															<Badge variant="outline" className="text-xs">
																{row.examiner_type}
															</Badge>
														</TableCell>
														<TableCell>{getStatusBadge(row.status)}</TableCell>
														<TableCell>
															<Badge variant="outline" className={row.form_type === 'engineering' ? 'text-blue-600 border-blue-200 bg-blue-50' : 'text-emerald-600 border-emerald-200 bg-emerald-50'}>
																{row.form_type || 'arts'}
															</Badge>
														</TableCell>
														<TableCell>
															{row.email_verified ? (
																<CheckCircle2 className="h-4 w-4 text-green-500" />
															) : (
																<XCircle className="h-4 w-4 text-gray-300" />
															)}
														</TableCell>
														<TableCell className="text-center">
															<div className="flex items-center justify-center gap-1">
																<Switch
																	checked={row.status === 'ACTIVE'}
																	onCheckedChange={() => handleStatusToggle(row)}
																	disabled={!canEdit}
																/>
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
																			<MoreHorizontal className="h-4 w-4" />
																		</Button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent align="end">
																		<DropdownMenuItem onClick={() => openEditForm(row)} disabled={!canEdit}>
																			<Edit className="h-3 w-3 mr-2" /> Edit
																		</DropdownMenuItem>
																		<DropdownMenuSeparator />
																		<DropdownMenuItem className="text-red-600" onClick={() => setDeleteTarget(row)} disabled={!canDelete}>
																			<Trash2 className="h-3 w-3 mr-2" /> Delete
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</div>
														</TableCell>
													</TableRow>
												))
											) : (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 9 : 8} className="h-24 text-center text-sm text-slate-500">
														No examiners found
													</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>

								{/* Pagination */}
								<div className="px-4 py-3 border-t flex items-center justify-between">
									<div className="flex items-center gap-4">
										<div className="text-sm text-slate-600">
											Showing {totalCount === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + items.length, totalCount)} of {totalCount}
										</div>
										<Select value={String(itemsPerPage)} onValueChange={(v) => setItemsPerPage(v === 'all' ? 'all' : Number(v))}>
											<SelectTrigger className="h-9 w-[100px]">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="10">10</SelectItem>
												<SelectItem value="20">20</SelectItem>
												<SelectItem value="50">50</SelectItem>
												<SelectItem value="all">All</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
											disabled={currentPage === 1 || itemsPerPage === 'all'}
										>
											<ChevronLeft className="h-4 w-4 mr-1" /> Previous
										</Button>
										<div className="text-sm text-slate-600 px-2">
											Page {currentPage} of {totalPages}
										</div>
										<Button
											variant="outline"
											size="sm"
											onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
											disabled={currentPage >= totalPages || itemsPerPage === 'all'}
										>
											Next <ChevronRight className="h-4 w-4 ml-1" />
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
						</>)}

						{activeTab === 'form-settings' && (
							<div className="space-y-4">
								{/* Header with Add button */}
								<div className="flex items-center justify-between">
									<h3 className="text-lg font-semibold">Form Configurations</h3>
									<Button size="sm" onClick={() => { resetConfigForm(); setConfigSheetOpen(true) }}>
										<PlusCircle className="w-4 h-4 mr-2" /> Add Configuration
									</Button>
								</div>

								{/* Table of form configs */}
								{formConfigsLoading ? (
									<div className="flex justify-center py-8">
										<Loader2 className="w-6 h-6 animate-spin text-gray-400" />
									</div>
								) : formConfigs.length === 0 ? (
									<div className="text-center py-8 text-gray-400">
										<p>No form configurations found.</p>
									</div>
								) : (
									<Card>
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Institution</TableHead>
													<TableHead>Form Type</TableHead>
													<TableHead>URL Slug</TableHead>
													<TableHead>Session</TableHead>
													<TableHead>Status</TableHead>
													<TableHead>Public Link</TableHead>
													<TableHead className="w-[80px]">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{formConfigs.map((config) => (
													<TableRow key={config.id}>
														<TableCell className="font-medium">{config.institution_code || '—'}</TableCell>
														<TableCell>
															<Badge variant="outline" className={config.form_type === 'engineering' ? 'text-blue-600 border-blue-200 bg-blue-50' : 'text-emerald-600 border-emerald-200 bg-emerald-50'}>
																{config.form_type}
															</Badge>
														</TableCell>
														<TableCell className="text-sm text-gray-500 font-mono">{config.url_slug}</TableCell>
														<TableCell>{config.exam_session_label || '—'}</TableCell>
														<TableCell>
															<Badge variant={config.is_active ? 'default' : 'secondary'}>
																{config.is_active ? 'Active' : 'Inactive'}
															</Badge>
														</TableCell>
														<TableCell>
															<Button
																variant="ghost"
																size="sm"
																className="text-blue-600"
																onClick={() => {
																	const link = `${window.location.origin}/${config.url_slug}`
																	navigator.clipboard.writeText(link)
																	toast({ title: '✅ Link copied!', className: 'bg-green-50 border-green-200 text-green-800' })
																}}
															>
																<Copy className="w-3 h-3 mr-1" /> Copy
															</Button>
														</TableCell>
														<TableCell>
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button variant="ghost" size="sm"><MoreHorizontal className="w-4 h-4" /></Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end">
																	<DropdownMenuItem onClick={() => editConfig(config)}>
																		<Edit className="w-3.5 h-3.5 mr-2" /> Edit
																	</DropdownMenuItem>
																	<DropdownMenuItem onClick={() => window.open(`/${config.url_slug}`, '_blank')}>
																		<ExternalLink className="w-3.5 h-3.5 mr-2" /> Open Form
																	</DropdownMenuItem>
																	<DropdownMenuSeparator />
																	<DropdownMenuItem className="text-red-600" onClick={() => handleDeleteConfig(config.id)}>
																		<Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</Card>
								)}

								{/* Form Config Sheet */}
								<Sheet open={configSheetOpen} onOpenChange={(o) => { if (!o) resetConfigForm(); setConfigSheetOpen(o) }}>
									<SheetContent className="sm:max-w-[600px] overflow-y-auto">
										<SheetHeader>
											<SheetTitle>{editingConfig ? 'Edit' : 'Add'} Form Configuration</SheetTitle>
											<SheetDescription>Configure the public examiner registration form for an institution.</SheetDescription>
										</SheetHeader>

										<div className="space-y-6 mt-6">
											{/* Basic Info */}
											<div className="space-y-4">
												<div className="grid grid-cols-2 gap-4">
													<div>
														<Label>Institution Code</Label>
														<Input
															value={configFormData.institution_code}
															onChange={(e) => setConfigFormData(prev => ({ ...prev, institution_code: e.target.value.toUpperCase() }))}
															placeholder="e.g. KCE"
														/>
													</div>
													<div>
														<Label>Form Type</Label>
														<Select value={configFormData.form_type} onValueChange={(v) => setConfigFormData(prev => ({ ...prev, form_type: v }))}>
															<SelectTrigger><SelectValue /></SelectTrigger>
															<SelectContent>
																<SelectItem value="engineering">Engineering</SelectItem>
																<SelectItem value="arts">Arts</SelectItem>
																<SelectItem value="pharmacy">Pharmacy</SelectItem>
															</SelectContent>
														</Select>
													</div>
												</div>

												<div>
													<Label>URL Slug</Label>
													<Input
														value={configFormData.url_slug}
														onChange={(e) => setConfigFormData(prev => ({ ...prev, url_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
														placeholder="e.g. engg-examiner-registration"
													/>
													<p className="text-xs text-gray-400 mt-1">Public URL: coe.jkkn.ai/{configFormData.url_slug || '...'}</p>
												</div>

												<div>
													<Label>Form Title</Label>
													<Input
														value={configFormData.form_title}
														onChange={(e) => setConfigFormData(prev => ({ ...prev, form_title: e.target.value }))}
														placeholder="External Faculty Database Collection Form..."
													/>
												</div>

												<div>
													<Label>Form Description</Label>
													<Textarea
														value={configFormData.form_description}
														onChange={(e) => setConfigFormData(prev => ({ ...prev, form_description: e.target.value }))}
														placeholder="Greetings from Office of Controller..."
														rows={3}
													/>
												</div>

												<div className="grid grid-cols-2 gap-4">
													<div>
														<Label>Exam Session Label</Label>
														<Input
															value={configFormData.exam_session_label}
															onChange={(e) => setConfigFormData(prev => ({ ...prev, exam_session_label: e.target.value }))}
															placeholder="Apr/May-2026"
														/>
													</div>
													<div className="flex items-center gap-3 pt-6">
														<Switch
															checked={configFormData.is_active}
															onCheckedChange={(v) => setConfigFormData(prev => ({ ...prev, is_active: v }))}
														/>
														<Label>Form Active</Label>
													</div>
												</div>
											</div>

											{/* Tag Lists */}
											{(['departments', 'designations', 'willingness_roles', 'salutations'] as const).map((field) => (
												<div key={field}>
													<Label className="capitalize">{field.replace(/_/g, ' ')}</Label>
													<div className="flex gap-2 mt-1">
														<Input
															value={newTagInputs[field]}
															onChange={(e) => setNewTagInputs(prev => ({ ...prev, [field]: e.target.value }))}
															placeholder={`Add ${field.replace(/_/g, ' ').slice(0, -1)}...`}
															onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(field) } }}
															className="flex-1"
														/>
														<Button type="button" size="sm" variant="outline" onClick={() => addTag(field)}>Add</Button>
													</div>
													<div className="flex flex-wrap gap-1.5 mt-2">
														{configFormData[field].map((tag: string, i: number) => (
															<Badge key={i} variant="secondary" className="text-xs gap-1">
																{tag}
																<button onClick={() => removeTag(field, i)} className="ml-1 hover:text-red-500">×</button>
															</Badge>
														))}
														{configFormData[field].length === 0 && (
															<p className="text-xs text-gray-400">No items added</p>
														)}
													</div>
												</div>
											))}

											{/* Save Button */}
											<Button
												className="w-full"
												onClick={handleSaveConfig}
												disabled={configSaving || !configFormData.form_type || !configFormData.url_slug}
											>
												{configSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
												{editingConfig ? 'Update' : 'Create'} Configuration
											</Button>
										</div>
									</SheetContent>
								</Sheet>
							</div>
						)}
					</div>
				</PageTransition>
				<AppFooter />

				{/* Add/Edit Sheet */}
				<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
					<SheetContent className="sm:max-w-[800px] overflow-y-auto">
						<SheetHeader className="pb-4 border-b mb-6">
							<div className="flex items-center gap-3">
								<div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
									<Users className="h-5 w-5 text-white" />
								</div>
								<div>
									<SheetTitle>{editing ? 'Edit Examiner' : 'Add New Examiner'}</SheetTitle>
									<SheetDescription className="text-sm text-muted-foreground">
										{editing ? 'Update examiner details' : 'Register a new examiner'}
									</SheetDescription>
								</div>
							</div>
						</SheetHeader>

						<div className="space-y-6">
							{/* COE Institution - show before all sections */}
							{!editing && (mustSelectInstitution || !shouldFilter || !institutionId) ? (
								<div className="space-y-2">
									<Label>COE Institution <span className="text-red-500">*</span></Label>
									<Select
										value={formData.institution_id || 'none'}
										onValueChange={(v) => {
											const inst = institutions.find(i => i.id === v)
											const instCode = inst?.institution_code || ''
											const formType = v !== 'none' ? getFormTypeForInstitution(v, instCode) : 'arts'
											setFormData({
												...formData,
												institution_id: v === 'none' ? '' : v,
												institution_code: instCode,
												form_type: formType,
											})
										}}
									>
										<SelectTrigger className={errors.institution_id ? 'border-red-500' : ''}>
											<SelectValue placeholder="Select COE institution" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">Select institution</SelectItem>
											{institutions.map((inst) => (
												<SelectItem key={inst.id} value={inst.id}>
													{inst.institution_code} - {inst.institution_name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{errors.institution_id && <p className="text-xs text-red-500">{errors.institution_id}</p>}
								</div>
							) : editing ? (
								<div className="space-y-2">
									<Label>COE Institution</Label>
									<Input
										value={institutions.find(i => i.id === formData.institution_id)?.institution_code || formData.institution_code || '-'}
										disabled
										className="bg-muted"
									/>
									<p className="text-xs text-muted-foreground">Institution cannot be changed after creation</p>
								</div>
							) : null}

							{/* Form Type Badge */}
							<div className="flex items-center gap-2">
								<Badge variant="outline" className={formData.form_type === 'engineering' ? 'text-blue-600 border-blue-200 bg-blue-50' : 'text-emerald-600 border-emerald-200 bg-emerald-50'}>
									{formData.form_type === 'engineering' ? 'Engineering College' : 'Arts / Science College'}
								</Badge>
								<span className="text-xs text-muted-foreground">Auto-detected from institution</span>
							</div>

							{/* Personal Info */}
							<div className="space-y-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">
									Personal Information
								</h3>
								<div className="grid grid-cols-2 gap-4">
									{formData.form_type === 'engineering' && (
										<div className="space-y-2">
											<Label>Salutation</Label>
											<Select value={formData.salutation || 'none'} onValueChange={(v) => setFormData({ ...formData, salutation: v === 'none' ? '' : v })}>
												<SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
												<SelectContent>
													<SelectItem value="none">Select</SelectItem>
													{['Dr', 'Mr', 'Mrs', 'Ms'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
												</SelectContent>
											</Select>
										</div>
									)}
									<div className="space-y-2">
										<Label>Full Name <span className="text-red-500">*</span></Label>
										<Input
											value={formData.full_name}
											onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
											className={errors.full_name ? 'border-red-500' : ''}
										/>
										{errors.full_name && <p className="text-sm text-red-500">{errors.full_name}</p>}
									</div>
									{formData.form_type === 'engineering' && (
										<div className="space-y-2">
											<Label>Gender</Label>
											<Select value={formData.gender || 'none'} onValueChange={(v) => setFormData({ ...formData, gender: v === 'none' ? '' : v })}>
												<SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
												<SelectContent>
													<SelectItem value="none">Select</SelectItem>
													{['Male', 'Female', 'Other'].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
												</SelectContent>
											</Select>
										</div>
									)}
									<div className="space-y-2">
										<Label>Email <span className="text-red-500">*</span></Label>
										<Input
											type="email"
											value={formData.email}
											onChange={(e) => setFormData({ ...formData, email: e.target.value })}
											className={errors.email ? 'border-red-500' : ''}
										/>
										{errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
									</div>
									<div className="space-y-2">
										<Label>Mobile</Label>
										<Input
											value={formData.mobile}
											onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
										/>
									</div>
									<div className="space-y-2">
										<Label>Designation</Label>
										<Input
											value={formData.designation}
											onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
										/>
									</div>
									{formData.form_type === 'engineering' && (
										<div className="space-y-2">
											<Label>Highest Qualification</Label>
											<Input
												value={formData.highest_qualification}
												onChange={(e) => setFormData({ ...formData, highest_qualification: e.target.value })}
												placeholder="e.g., Ph.D, M.E., M.Tech"
											/>
										</div>
									)}
								</div>
							</div>

							{/* Contact Details - Engineering only */}
							{formData.form_type === 'engineering' && (
								<div className="space-y-4">
									<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">
										Contact Details
									</h3>
									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label>Personal Email</Label>
											<Input
												type="email"
												value={formData.personal_email}
												onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })}
											/>
										</div>
										<div className="space-y-2">
											<Label>Official Email</Label>
											<Input
												type="email"
												value={formData.official_email}
												onChange={(e) => setFormData({ ...formData, official_email: e.target.value })}
											/>
										</div>
									</div>
								</div>
							)}

							{/* Institution Info */}
							<div className="space-y-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">
									Institution Details
								</h3>

								<div className="grid grid-cols-2 gap-4">
									{formData.form_type === 'engineering' && (
										<div className="space-y-2">
											<Label>AICTE/AU Faculty Code</Label>
											<Input
												value={formData.aicte_faculty_code}
												onChange={(e) => setFormData({ ...formData, aicte_faculty_code: e.target.value })}
											/>
										</div>
									)}
									<div className="space-y-2">
										<Label>Institution Name</Label>
										<Input
											value={formData.institution_name}
											onChange={(e) => setFormData({ ...formData, institution_name: e.target.value })}
										/>
									</div>
									<div className="space-y-2">
										<Label>Department</Label>
										<Input
											value={formData.department}
											onChange={(e) => setFormData({ ...formData, department: e.target.value })}
										/>
									</div>
									<div className="col-span-2 space-y-2">
										<Label>Institution Address</Label>
										<Textarea
											value={formData.institution_address}
											onChange={(e) => setFormData({ ...formData, institution_address: e.target.value })}
											rows={2}
										/>
									</div>
									{formData.form_type === 'engineering' && (
										<>
											<div className="space-y-2">
												<Label>Institution COE Contact</Label>
												<Input
													value={formData.institution_coe_contact}
													onChange={(e) => setFormData({ ...formData, institution_coe_contact: e.target.value })}
												/>
											</div>
											<div className="space-y-2">
												<Label>Institution COE Email</Label>
												<Input
													type="email"
													value={formData.institution_coe_email}
													onChange={(e) => setFormData({ ...formData, institution_coe_email: e.target.value })}
												/>
											</div>
										</>
									)}
								</div>
							</div>

							{/* Engineering Experience */}
							{formData.form_type === 'engineering' && (
								<div className="space-y-4">
									<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">
										Experience
									</h3>
									<div className="grid grid-cols-3 gap-4">
										<div className="space-y-2">
											<Label>Teaching Exp. (Years)</Label>
											<Input
												type="number"
												min="0"
												value={formData.teaching_exp_years}
												onChange={(e) => setFormData({ ...formData, teaching_exp_years: parseInt(e.target.value) || 0 })}
											/>
										</div>
										<div className="space-y-2">
											<Label>Industry Exp. (Years)</Label>
											<Input
												type="number"
												min="0"
												value={formData.industry_exp_years}
												onChange={(e) => setFormData({ ...formData, industry_exp_years: parseInt(e.target.value) || 0 })}
											/>
										</div>
										<div className="space-y-2">
											<Label>Total Exp. (Years)</Label>
											<Input
												type="number"
												min="0"
												value={formData.total_exp_years}
												onChange={(e) => setFormData({ ...formData, total_exp_years: parseInt(e.target.value) || 0 })}
											/>
										</div>
									</div>
								</div>
							)}

							{/* Engineering Academic Profile */}
							{formData.form_type === 'engineering' && (
								<div className="space-y-4">
									<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">
										Academic Profile
									</h3>
									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label>UG Specialization</Label>
											<Input
												value={((formData.additional_data?.specializations as Record<string, string>)?.ug) || ''}
												onChange={(e) => {
													const specs = { ...(formData.additional_data?.specializations as Record<string, string> || {}), ug: e.target.value }
													setFormData({ ...formData, additional_data: { ...formData.additional_data, specializations: specs } })
												}}
												placeholder="e.g., Computer Science"
											/>
										</div>
										<div className="space-y-2">
											<Label>PG Specialization</Label>
											<Input
												value={((formData.additional_data?.specializations as Record<string, string>)?.pg) || ''}
												onChange={(e) => {
													const specs = { ...(formData.additional_data?.specializations as Record<string, string> || {}), pg: e.target.value }
													setFormData({ ...formData, additional_data: { ...formData.additional_data, specializations: specs } })
												}}
												placeholder="e.g., Software Engineering"
											/>
										</div>
										<div className="space-y-2">
											<Label>PhD Specialization</Label>
											<Input
												value={((formData.additional_data?.specializations as Record<string, string>)?.phd) || ''}
												onChange={(e) => {
													const specs = { ...(formData.additional_data?.specializations as Record<string, string> || {}), phd: e.target.value }
													setFormData({ ...formData, additional_data: { ...formData.additional_data, specializations: specs } })
												}}
												placeholder="e.g., Machine Learning"
											/>
										</div>
										<div className="space-y-2">
											<Label>Area of Expertise</Label>
											<Input
												value={formData.area_of_expertise}
												onChange={(e) => setFormData({ ...formData, area_of_expertise: e.target.value })}
												placeholder="e.g., Communication, VLSI"
											/>
										</div>
									</div>
								</div>
							)}

							{/* Engineering Willingness & Courses */}
							{formData.form_type === 'engineering' && (
								<div className="space-y-4">
									<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">
										Examiner Preferences & Courses
									</h3>
									<div className="space-y-2">
										<Label>Willingness Roles</Label>
										<div className="flex flex-wrap gap-2">
											{['Question Paper Setter', 'Question Paper Scrutiny', 'External Examiner for Practical Exams', 'Theory Valuation', 'Chief Examiner'].map(role => (
												<label key={role} className="flex items-center gap-1.5 text-sm border rounded-md px-2.5 py-1.5 cursor-pointer hover:bg-muted">
													<Checkbox
														checked={formData.willingness_roles.includes(role)}
														onCheckedChange={(checked) => {
															setFormData({
																...formData,
																willingness_roles: checked
																	? [...formData.willingness_roles, role]
																	: formData.willingness_roles.filter(r => r !== role),
															})
														}}
													/>
													{role}
												</label>
											))}
										</div>
									</div>

									{/* Theory Courses */}
									<div className="space-y-2">
										<Label>Theory Courses</Label>
										{((formData.additional_data?.courses as Record<string, { course: string; times: string }[]>)?.theory || []).map((tc, i) => (
											<div key={i} className="grid grid-cols-[1fr,80px] gap-2">
												<Input
													value={tc.course}
													onChange={(e) => {
														const courses = { ...(formData.additional_data?.courses as Record<string, { course: string; times: string }[]> || {}) }
														const theory = [...(courses.theory || [])]
														theory[i] = { ...theory[i], course: e.target.value }
														setFormData({ ...formData, additional_data: { ...formData.additional_data, courses: { ...courses, theory } } })
													}}
													placeholder={`Theory course ${i + 1}`}
												/>
												<Input
													value={tc.times}
													onChange={(e) => {
														const courses = { ...(formData.additional_data?.courses as Record<string, { course: string; times: string }[]> || {}) }
														const theory = [...(courses.theory || [])]
														theory[i] = { ...theory[i], times: e.target.value }
														setFormData({ ...formData, additional_data: { ...formData.additional_data, courses: { ...courses, theory } } })
													}}
													placeholder="Times"
												/>
											</div>
										))}
									</div>

									{/* Practical Courses */}
									<div className="space-y-2">
										<Label>Practical Courses</Label>
										{((formData.additional_data?.courses as Record<string, { course: string; times: string }[]>)?.practical || []).map((pc, i) => (
											<div key={i} className="grid grid-cols-[1fr,80px] gap-2">
												<Input
													value={pc.course}
													onChange={(e) => {
														const courses = { ...(formData.additional_data?.courses as Record<string, { course: string; times: string }[]> || {}) }
														const practical = [...(courses.practical || [])]
														practical[i] = { ...practical[i], course: e.target.value }
														setFormData({ ...formData, additional_data: { ...formData.additional_data, courses: { ...courses, practical } } })
													}}
													placeholder={`Practical course ${i + 1}`}
												/>
												<Input
													value={pc.times}
													onChange={(e) => {
														const courses = { ...(formData.additional_data?.courses as Record<string, { course: string; times: string }[]> || {}) }
														const practical = [...(courses.practical || [])]
														practical[i] = { ...practical[i], times: e.target.value }
														setFormData({ ...formData, additional_data: { ...formData.additional_data, courses: { ...courses, practical } } })
													}}
													placeholder="Times"
												/>
											</div>
										))}
									</div>
								</div>
							)}

							{/* Experience & Type (Arts / shared) */}
							<div className="space-y-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">
									{formData.form_type === 'engineering' ? 'Board & Classification' : 'Experience & Classification'}
								</h3>

								{/* UG / PG Board */}
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label>UG Board</Label>
										<Select value={formData.ug_board_id || 'none'} onValueChange={(v) => setFormData({ ...formData, ug_board_id: v === 'none' ? '' : v, ...(v === 'none' ? { ug_experience_years: 0 } : {}) })}>
											<SelectTrigger><SelectValue placeholder="Select UG Board" /></SelectTrigger>
											<SelectContent>
												<SelectItem value="none">None</SelectItem>
												{boards.filter(b => b.board_type === 'UG').sort((a, b) => (a.board_name || '').localeCompare(b.board_name || '')).map(b => (
													<SelectItem key={b.id} value={b.id}>{b.board_name}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label>PG Board</Label>
										<Select value={formData.pg_board_id || 'none'} onValueChange={(v) => setFormData({ ...formData, pg_board_id: v === 'none' ? '' : v, ...(v === 'none' ? { pg_experience_years: 0 } : {}) })}>
											<SelectTrigger><SelectValue placeholder="Select PG Board" /></SelectTrigger>
											<SelectContent>
												<SelectItem value="none">None</SelectItem>
												{boards.filter(b => b.board_type === 'PG').sort((a, b) => (a.board_name || '').localeCompare(b.board_name || '')).map(b => (
													<SelectItem key={b.id} value={b.id}>{b.board_name}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>

								<div className="grid grid-cols-3 gap-4">
									{formData.ug_board_id && (
										<div className="space-y-2">
											<Label>UG Experience (Years)</Label>
											<Input
												type="number"
												min="0"
												value={formData.ug_experience_years}
												onChange={(e) => setFormData({ ...formData, ug_experience_years: parseInt(e.target.value) || 0 })}
											/>
										</div>
									)}
									{formData.pg_board_id && (
										<div className="space-y-2">
											<Label>PG Experience (Years)</Label>
											<Input
												type="number"
												min="0"
												value={formData.pg_experience_years}
												onChange={(e) => setFormData({ ...formData, pg_experience_years: parseInt(e.target.value) || 0 })}
											/>
										</div>
									)}
									<div className="space-y-2">
										<Label>Examiner Type</Label>
										<Select value={formData.examiner_type} onValueChange={(v) => setFormData({ ...formData, examiner_type: v as ExaminerType })}>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{EXAMINER_TYPE_OPTIONS.map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>
							</div>

							{/* Status */}
							<div className="space-y-4">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">
									Status
								</h3>
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label>Status</Label>
										<Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as ExaminerStatus })}>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{EXAMINER_STATUS_OPTIONS.map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label>Status Remarks</Label>
										<Input
											value={formData.status_remarks}
											onChange={(e) => setFormData({ ...formData, status_remarks: e.target.value })}
											placeholder="Optional remarks"
										/>
									</div>
								</div>
								<div className="space-y-2">
									<Label>Notes</Label>
									<Textarea
										value={formData.notes}
										onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
										rows={2}
										placeholder="Internal notes about this examiner"
									/>
								</div>
							</div>

							{/* Actions */}
							<div className="flex justify-end gap-3 pt-4 border-t">
								<Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
								<Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
									{saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : editing ? 'Update' : 'Create'}
								</Button>
							</div>
						</div>
					</SheetContent>
				</Sheet>
			</SidebarInset>
		{/* Registration Link Dialog */}
	<Dialog open={regLinkOpen} onOpenChange={setRegLinkOpen}>
		<DialogContent className="sm:max-w-md">
			<DialogHeader>
				<DialogTitle className="flex items-center gap-2">
					<Link2 className="h-5 w-5 text-emerald-600" />
					Examiner Registration Link
				</DialogTitle>
				<DialogDescription>
					{mustSelectInstitution
						? 'Share each institution\'s link with its external examiners so they can self-register.'
						: 'Share this link with external examiners so they can self-register.'}
					{' '}All submissions will appear in this panel with <strong>Pending</strong> status for your review.
				</DialogDescription>
			</DialogHeader>
			<div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto">
				{registrationLinks.map((link) => (
					<div key={link.url} className="space-y-2">
						{mustSelectInstitution && link.label && (
							<p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{link.label}</p>
						)}
						<div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
							<code className="flex-1 text-sm text-slate-700 break-all select-all">
								{link.url}
							</code>
						</div>
						<div className="flex gap-2">
							<Button onClick={() => handleCopyLink(link.url)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
								{copied === link.url ? (
									<><Check className="h-4 w-4 mr-2" /> Copied!</>
								) : (
									<><Copy className="h-4 w-4 mr-2" /> Copy Link</>
								)}
							</Button>
							<Button variant="outline" asChild className="flex-1">
								<a href={link.url} target="_blank" rel="noopener noreferrer">
									<ExternalLink className="h-4 w-4 mr-2" />
									Open Form
								</a>
							</Button>
						</div>
					</div>
				))}
				<p className="text-xs text-slate-500 text-center">
					{registrationLinks.length > 1 ? 'These are public links' : 'This is a public link'} — no login required for examiners.
				</p>
			</div>
		</DialogContent>
	</Dialog>

	{/* Import Error Dialog */}
	<AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
		<AlertDialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
			<AlertDialogHeader>
				<div className="flex items-center gap-3">
					<div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
						<XCircle className="h-5 w-5 text-red-600" />
					</div>
					<div>
						<AlertDialogTitle className="text-xl font-bold text-red-600">Import Errors</AlertDialogTitle>
						<AlertDialogDescription className="text-sm text-muted-foreground mt-1">
							Please fix these errors in your file and try again.
						</AlertDialogDescription>
					</div>
				</div>
			</AlertDialogHeader>
			<div className="space-y-4">
				{uploadSummary.total > 0 && (
					<div className="grid grid-cols-3 gap-3">
						<div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
							<div className="text-xs text-blue-600 font-medium">Total</div>
							<div className="text-2xl font-bold text-blue-700">{uploadSummary.total}</div>
						</div>
						<div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
							<div className="text-xs text-green-600 font-medium">Successful</div>
							<div className="text-2xl font-bold text-green-700">{uploadSummary.success}</div>
						</div>
						<div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
							<div className="text-xs text-red-600 font-medium">Failed</div>
							<div className="text-2xl font-bold text-red-700">{uploadSummary.failed}</div>
						</div>
					</div>
				)}
				<div className="space-y-2">
					{importErrors.map((err, idx) => (
						<div key={idx} className="border border-red-200 rounded-lg p-3 bg-red-50/50">
							<div className="flex items-center gap-2 mb-1">
								<Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">Row {err.row}</Badge>
								<span className="text-sm font-medium">{err.full_name} — {err.email}</span>
							</div>
							{err.errors.map((e, i) => (
								<div key={i} className="flex items-start gap-1.5 text-sm text-red-700">
									<XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" /> {e}
								</div>
							))}
						</div>
					))}
				</div>
				<div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 space-y-1">
					<p className="font-semibold">Common fixes:</p>
					<p>• Full Name and Email are required fields</p>
					<p>• Examiner Type must be one of: UG, PG, UG_PG, PRACTICAL, SCRUTINY, ALL</p>
					<p>• Email must be in valid format and unique</p>
				</div>
			</div>
			<AlertDialogFooter>
				<AlertDialogCancel onClick={() => { setErrorPopupOpen(false); setImportErrors([]) }}>Close</AlertDialogCancel>
				<AlertDialogAction onClick={() => { setErrorPopupOpen(false); setImportErrors([]); handleImport() }}>Try Again</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	</AlertDialog>

	<AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Examiner</AlertDialogTitle>
					<AlertDialogDescription>Are you sure you want to delete {deleteTarget?.full_name}? This action cannot be undone.</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={() => { if (deleteTarget) { handleDelete(deleteTarget.id); setDeleteTarget(null) } }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	</SidebarProvider>
	)
}
