'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSessionSync } from '@/hooks/use-session-sync'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { FlaskConical, Download, Loader2, Check, ChevronsUpDown, FileText, Award, Users, BookOpen, ScrollText } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Institution {
	id: string
	name: string
	institution_code: string
}

interface ExamSession {
	id: string
	session_code: string
	session_name: string
}

interface LunchDateRow {
	serial_number: number
	exam_date: string
	purpose: string
	internal_count: number
	external_count: number
	total_persons: number
}

interface LunchSummary {
	total_dates: number
	total_internal: number
	total_external: number
	total_persons: number
}

interface ExaminerCertData {
	examiner_name: string
	designation: string
	department: string
	institution_name: string
	type: 'External' | 'Internal'
	from_date: string
	to_date: string
	all_dates?: string[]
	total_days: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
	if (!dateStr) return ''
	const d = new Date(dateStr)
	return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PracticalExamReportsPage() {
	const { toast } = useToast()
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId,
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [examSessions, setExamSessions] = useState<ExamSession[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [institutionOpen, setInstitutionOpen] = useState(false)

	// Lunch data (Practical)
	const [lunchDates, setLunchDates] = useState<LunchDateRow[]>([])
	const [lunchSummary, setLunchSummary] = useState<LunchSummary | null>(null)
	const [lunchFromDate, setLunchFromDate] = useState('')
	const [lunchToDate, setLunchToDate] = useState('')

	// Attendance certificate data (Practical)
	const [examiners, setExaminers] = useState<ExaminerCertData[]>([])
	const [selectedExaminerIds, setSelectedExaminerIds] = useState<Set<number>>(new Set())
	const [selectAll, setSelectAll] = useState(false)

	// Lunch data (Central Valuation)
	const [cvLunchDates, setCvLunchDates] = useState<LunchDateRow[]>([])
	const [cvLunchSummary, setCvLunchSummary] = useState<LunchSummary | null>(null)
	const [cvLunchFromDate, setCvLunchFromDate] = useState('')
	const [cvLunchToDate, setCvLunchToDate] = useState('')

	// Attendance certificate data (Central Valuation)
	const [cvExaminers, setCvExaminers] = useState<ExaminerCertData[]>([])
	const [cvSelectedExaminerIds, setCvSelectedExaminerIds] = useState<Set<number>>(new Set())
	const [cvSelectAll, setCvSelectAll] = useState(false)

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingLunch, setLoadingLunch] = useState(false)
	const [loadingCert, setLoadingCert] = useState(false)
	const [loadingCvLunch, setLoadingCvLunch] = useState(false)
	const [loadingCvCert, setLoadingCvCert] = useState(false)
	const [downloadingPdf, setDownloadingPdf] = useState(false)

	// Certificate type filter & sorting (Practical)
	const [certTypeFilter, setCertTypeFilter] = useState<'all' | 'External' | 'Internal'>('all')
	const [certSortField, setCertSortField] = useState<'examiner_name' | 'type' | 'from_date' | 'to_date' | 'total_days'>('examiner_name')
	const [certSortDir, setCertSortDir] = useState<'asc' | 'desc'>('asc')

	// Certificate type filter & sorting (Central Valuation)
	const [cvCertTypeFilter, setCvCertTypeFilter] = useState<'all' | 'External' | 'Internal'>('all')
	const [cvCertSortField, setCvCertSortField] = useState<'examiner_name' | 'type' | 'from_date' | 'to_date' | 'total_days'>('examiner_name')
	const [cvCertSortDir, setCvCertSortDir] = useState<'asc' | 'desc'>('asc')

	// Active tab
	const [activeTab, setActiveTab] = useState('lunch')

	// Load institutions
	useEffect(() => {
		if (isReady) loadInstitutions()
	}, [isReady])

	// Auto-select institution for normal users
	useEffect(() => {
		if (isReady && !mustSelectInstitution && institutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(institutionId)
		}
	}, [isReady, mustSelectInstitution, institutionId, selectedInstitutionId])

	// Load sessions when institution selected
	useEffect(() => {
		if (selectedInstitutionId) {
			loadSessions(selectedInstitutionId)
			setSelectedSessionId('')
			setExamSessions([])
			resetData()
		}
	}, [selectedInstitutionId])

	// Load data when session selected
	useEffect(() => {
		if (selectedInstitutionId && selectedSessionId) {
			loadLunchData()
			loadAttendanceCertData()
			loadCvLunchData()
			loadCvAttendanceCertData()
		}
	}, [selectedSessionId])

	function resetData() {
		setLunchDates([])
		setLunchSummary(null)
		setExaminers([])
		setSelectedExaminerIds(new Set())
		setSelectAll(false)
		setCvLunchDates([])
		setCvLunchSummary(null)
		setCvExaminers([])
		setCvSelectedExaminerIds(new Set())
		setCvSelectAll(false)
	}

	const loadInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/reports/practical-exam/lunch-requirement?action=institutions')
			const res = await fetch(url)
			if (!res.ok) throw new Error('Failed to load institutions')
			const data = await res.json()
			setInstitutions(data)
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load institutions', variant: 'destructive' })
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, toast])

	const loadSessions = async (instId: string) => {
		try {
			setLoadingSessions(true)
			const res = await fetch(`/api/reports/practical-exam/lunch-requirement?action=sessions&institutionId=${instId}`)
			if (!res.ok) throw new Error('Failed to load sessions')
			setExamSessions(await res.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load sessions', variant: 'destructive' })
		} finally {
			setLoadingSessions(false)
		}
	}

	const loadLunchData = async () => {
		if (!selectedInstitutionId || !selectedSessionId) return
		try {
			setLoadingLunch(true)
			const res = await fetch(
				`/api/reports/practical-exam/lunch-requirement?action=lunch-data&institutionId=${selectedInstitutionId}&sessionId=${selectedSessionId}`
			)
			if (!res.ok) throw new Error('Failed to load data')
			const data = await res.json()
			setLunchDates(data.dates || [])
			setLunchSummary(data.summary || null)
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load lunch data', variant: 'destructive' })
		} finally {
			setLoadingLunch(false)
		}
	}

	const loadAttendanceCertData = async () => {
		if (!selectedInstitutionId || !selectedSessionId) return
		try {
			setLoadingCert(true)
			const res = await fetch(
				`/api/reports/practical-exam/lunch-requirement?action=attendance-certificate&institutionId=${selectedInstitutionId}&sessionId=${selectedSessionId}`
			)
			if (!res.ok) throw new Error('Failed to load data')
			const data = await res.json()
			setExaminers(data.examiners || [])
			setSelectedExaminerIds(new Set())
			setSelectAll(false)
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load examiner data', variant: 'destructive' })
		} finally {
			setLoadingCert(false)
		}
	}

	const loadCvLunchData = async () => {
		if (!selectedInstitutionId || !selectedSessionId) return
		try {
			setLoadingCvLunch(true)
			const res = await fetch(
				`/api/reports/central-valuation/lunch-requirement?action=lunch-data&institutionId=${selectedInstitutionId}&sessionId=${selectedSessionId}`
			)
			if (!res.ok) throw new Error('Failed to load data')
			const data = await res.json()
			setCvLunchDates(data.dates || [])
			setCvLunchSummary(data.summary || null)
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load CV lunch data', variant: 'destructive' })
		} finally {
			setLoadingCvLunch(false)
		}
	}

	const loadCvAttendanceCertData = async () => {
		if (!selectedInstitutionId || !selectedSessionId) return
		try {
			setLoadingCvCert(true)
			const res = await fetch(
				`/api/reports/central-valuation/lunch-requirement?action=attendance-certificate&institutionId=${selectedInstitutionId}&sessionId=${selectedSessionId}`
			)
			if (!res.ok) throw new Error('Failed to load data')
			const data = await res.json()
			setCvExaminers(data.examiners || [])
			setCvSelectedExaminerIds(new Set())
			setCvSelectAll(false)
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load CV examiner data', variant: 'destructive' })
		} finally {
			setLoadingCvCert(false)
		}
	}

	// ---------------------------------------------------------------------------
	// PDF settings helper (shared by both tabs)
	// ---------------------------------------------------------------------------

	const loadPdfContext = async () => {
		const inst = institutions.find(i => i.id === selectedInstitutionId)
		const institutionCode = inst?.institution_code || ''

		let pdfSettings: any = null
		if (institutionCode) {
			try {
				const settingsRes = await fetch(`/api/pdf-settings?institution_code=${institutionCode}&template_type=default`)
				if (settingsRes.ok) {
					const d = await settingsRes.json()
					if (!d.defaults) pdfSettings = d
				}
			} catch { /* use defaults */ }
		}

		// Logos
		let logoImage: string | undefined
		let rightLogoImage: string | undefined

		const logoUrl = pdfSettings?.logo_url || '/jkkn_logo.png'
		try {
			const r = await fetch(logoUrl)
			if (r.ok) logoImage = await blobToBase64(await r.blob())
		} catch { /* skip */ }

		const secLogoUrl = pdfSettings?.secondary_logo_url || '/jkkncas_logo.png'
		try {
			const r = await fetch(secLogoUrl)
			if (r.ok) rightLogoImage = await blobToBase64(await r.blob())
		} catch { /* skip */ }

		// Institution details — fetch all, then find by selectedInstitutionId
		let institutionName = ''
		let institutionAddress = ''
		let accreditationText = ''

		try {
			const instRes = await fetch('/api/master/institutions?local_only=true')
			if (instRes.ok) {
				const instData = await instRes.json()
				const allInsts = Array.isArray(instData) ? instData : []
				const d = allInsts.find((i: any) => i.id === selectedInstitutionId)
				if (d) {
					institutionName = d.name || d.institution_name || ''
					institutionAddress = d.address
						? [d.address, d.city, d.district, d.state].filter(Boolean).join(', ')
						: ''
					accreditationText = d.accredited_by || ''
				}
			}
		} catch { /* skip */ }

		if (pdfSettings?.accreditation_text) accreditationText = pdfSettings.accreditation_text
		if (pdfSettings?.address) institutionAddress = pdfSettings.address

		const sessionName = examSessions.find(s => s.id === selectedSessionId)?.session_name || ''

		return {
			institutionCode,
			institutionName: institutionName || 'J.K.K. Nataraja College of Arts & Science (Autonomous)',
			institutionAddress,
			accreditationText,
			sessionName,
			primaryColor: pdfSettings?.primary_color,
			logoImage,
			rightLogoImage,
		}
	}

	// ---------------------------------------------------------------------------
	// Download handlers
	// ---------------------------------------------------------------------------

	const handleDownloadLunchPdf = async () => {
		if (lunchDates.length === 0) return
		setDownloadingPdf(true)
		try {
			const ctx = await loadPdfContext()
			const { generateLunchRequirementPdf } = await import('@/lib/pdf/generate-lunch-requirement-pdf')

			// Filter dates by from/to if set
			let filteredDates = lunchDates
			if (lunchFromDate) {
				filteredDates = filteredDates.filter(d => d.exam_date >= lunchFromDate)
			}
			if (lunchToDate) {
				filteredDates = filteredDates.filter(d => d.exam_date <= lunchToDate)
			}

			// Re-number and re-calculate summary
			const numbered = filteredDates.map((d, i) => ({ ...d, serial_number: i + 1 }))
			const totalInternal = numbered.reduce((s, d) => s + d.internal_count, 0)
			const totalExternal = numbered.reduce((s, d) => s + d.external_count, 0)

			const doc = generateLunchRequirementPdf({
				institution_name: ctx.institutionName,
				institution_address: ctx.institutionAddress,
				institution_accreditation: ctx.accreditationText,
				session_name: ctx.sessionName,
				dates: numbered,
				summary: {
					total_dates: numbered.length,
					total_internal: totalInternal,
					total_external: totalExternal,
					total_persons: totalInternal + totalExternal,
				},
				primary_color: ctx.primaryColor,
				logoImage: ctx.logoImage,
				rightLogoImage: ctx.rightLogoImage,
			})

			doc.save(`${ctx.institutionCode}_${ctx.sessionName.replace(/\s+/g, '_')}_lunch_requirement.pdf`)
			toast({ title: '✅ PDF Downloaded', description: `Lunch requirement report saved (${numbered.length} dates)`, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (err) {
			console.error('PDF error:', err)
			toast({ title: '❌ Failed', description: 'Failed to generate PDF', variant: 'destructive' })
		} finally {
			setDownloadingPdf(false)
		}
	}

	const handleDownloadCertPdf = async () => {
		const selected = examiners.filter((_, idx) => selectedExaminerIds.has(idx))
		if (selected.length === 0) {
			toast({ title: '⚠️ No Selection', description: 'Please select examiners for certificate', variant: 'destructive' })
			return
		}

		setDownloadingPdf(true)
		try {
			const ctx = await loadPdfContext()
			const { generateAttendanceCertificatePdf } = await import('@/lib/pdf/generate-attendance-certificate-pdf')

			const doc = generateAttendanceCertificatePdf({
				institution_name: ctx.institutionName,
				institution_address: ctx.institutionAddress,
				institution_accreditation: ctx.accreditationText,
				session_name: ctx.sessionName,
				examiners: selected,
				primary_color: ctx.primaryColor,
				logoImage: ctx.logoImage,
				rightLogoImage: ctx.rightLogoImage,
			})

			doc.save(`${ctx.institutionCode}_${ctx.sessionName.replace(/\s+/g, '_')}_attendance_certificates.pdf`)
			toast({ title: '✅ PDF Downloaded', description: `${selected.length} certificate(s) generated`, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (err) {
			console.error('PDF error:', err)
			toast({ title: '❌ Failed', description: 'Failed to generate certificates', variant: 'destructive' })
		} finally {
			setDownloadingPdf(false)
		}
	}

	const handleDownloadCvLunchPdf = async () => {
		if (cvLunchDates.length === 0) return
		setDownloadingPdf(true)
		try {
			const ctx = await loadPdfContext()
			const { generateLunchRequirementPdf } = await import('@/lib/pdf/generate-lunch-requirement-pdf')

			let filteredDates = cvLunchDates
			if (cvLunchFromDate) filteredDates = filteredDates.filter(d => d.exam_date >= cvLunchFromDate)
			if (cvLunchToDate) filteredDates = filteredDates.filter(d => d.exam_date <= cvLunchToDate)

			const numbered = filteredDates.map((d, i) => ({ ...d, serial_number: i + 1 }))
			const totalInternal = numbered.reduce((s, d) => s + d.internal_count, 0)
			const totalExternal = numbered.reduce((s, d) => s + d.external_count, 0)

			const doc = generateLunchRequirementPdf({
				institution_name: ctx.institutionName,
				institution_address: ctx.institutionAddress,
				institution_accreditation: ctx.accreditationText,
				session_name: ctx.sessionName,
				dates: numbered,
				summary: {
					total_dates: numbered.length,
					total_internal: totalInternal,
					total_external: totalExternal,
					total_persons: totalInternal + totalExternal,
				},
				primary_color: ctx.primaryColor,
				logoImage: ctx.logoImage,
				rightLogoImage: ctx.rightLogoImage,
				report_title: 'Central Valuation Lunch Requirement',
				purpose_label: 'Purpose : Central Valuation',
			})

			doc.save(`${ctx.institutionCode}_${ctx.sessionName.replace(/\s+/g, '_')}_cv_lunch_requirement.pdf`)
			toast({ title: '✅ PDF Downloaded', description: `CV lunch requirement saved (${numbered.length} dates)`, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (err) {
			console.error('PDF error:', err)
			toast({ title: '❌ Failed', description: 'Failed to generate PDF', variant: 'destructive' })
		} finally {
			setDownloadingPdf(false)
		}
	}

	const handleDownloadCvCertPdf = async () => {
		const selected = cvExaminers.filter((_, idx) => cvSelectedExaminerIds.has(idx))
		if (selected.length === 0) {
			toast({ title: '⚠️ No Selection', description: 'Please select examiners for certificate', variant: 'destructive' })
			return
		}

		setDownloadingPdf(true)
		try {
			const ctx = await loadPdfContext()
			const { generateAttendanceCertificatePdf } = await import('@/lib/pdf/generate-attendance-certificate-pdf')

			const doc = generateAttendanceCertificatePdf({
				institution_name: ctx.institutionName,
				institution_address: ctx.institutionAddress,
				institution_accreditation: ctx.accreditationText,
				session_name: ctx.sessionName,
				examiners: selected,
				primary_color: ctx.primaryColor,
				logoImage: ctx.logoImage,
				rightLogoImage: ctx.rightLogoImage,
				certificate_context: 'Central Valuation',
			})

			doc.save(`${ctx.institutionCode}_${ctx.sessionName.replace(/\s+/g, '_')}_cv_attendance_certificates.pdf`)
			toast({ title: '✅ PDF Downloaded', description: `${selected.length} certificate(s) generated`, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (err) {
			console.error('PDF error:', err)
			toast({ title: '❌ Failed', description: 'Failed to generate certificates', variant: 'destructive' })
		} finally {
			setDownloadingPdf(false)
		}
	}

	// Filtered & sorted examiners (Practical)
	const filteredExaminers = (() => {
		let list = examiners.map((e, i) => ({ ...e, _origIdx: i }))
		if (certTypeFilter !== 'all') list = list.filter(e => e.type === certTypeFilter)
		list.sort((a, b) => {
			let cmp = 0
			if (certSortField === 'examiner_name') cmp = a.examiner_name.localeCompare(b.examiner_name)
			else if (certSortField === 'type') cmp = a.type.localeCompare(b.type)
			else if (certSortField === 'from_date') cmp = (a.from_date || '').localeCompare(b.from_date || '')
			else if (certSortField === 'to_date') cmp = (a.to_date || '').localeCompare(b.to_date || '')
			else if (certSortField === 'total_days') cmp = a.total_days - b.total_days
			return certSortDir === 'asc' ? cmp : -cmp
		})
		return list
	})()

	const filteredIndexMap = filteredExaminers.map(fe => fe._origIdx)

	const handleCertSort = (field: typeof certSortField) => {
		if (certSortField === field) {
			setCertSortDir(d => d === 'asc' ? 'desc' : 'asc')
		} else {
			setCertSortField(field)
			setCertSortDir('asc')
		}
	}

	const sortIcon = (field: typeof certSortField) =>
		certSortField === field ? (certSortDir === 'asc' ? ' ↑' : ' ↓') : ''

	const handleSelectAll = (checked: boolean) => {
		setSelectAll(checked)
		if (checked) setSelectedExaminerIds(new Set(filteredIndexMap))
		else setSelectedExaminerIds(new Set())
	}

	const toggleExaminer = (originalIdx: number) => {
		const next = new Set(selectedExaminerIds)
		if (next.has(originalIdx)) next.delete(originalIdx)
		else next.add(originalIdx)
		setSelectedExaminerIds(next)
		setSelectAll(filteredIndexMap.every(i => next.has(i)))
	}

	// Filtered & sorted examiners (Central Valuation)
	const filteredCvExaminers = (() => {
		let list = cvExaminers.map((e, i) => ({ ...e, _origIdx: i }))
		if (cvCertTypeFilter !== 'all') list = list.filter(e => e.type === cvCertTypeFilter)
		list.sort((a, b) => {
			let cmp = 0
			if (cvCertSortField === 'examiner_name') cmp = a.examiner_name.localeCompare(b.examiner_name)
			else if (cvCertSortField === 'type') cmp = a.type.localeCompare(b.type)
			else if (cvCertSortField === 'from_date') cmp = (a.from_date || '').localeCompare(b.from_date || '')
			else if (cvCertSortField === 'to_date') cmp = (a.to_date || '').localeCompare(b.to_date || '')
			else if (cvCertSortField === 'total_days') cmp = a.total_days - b.total_days
			return cvCertSortDir === 'asc' ? cmp : -cmp
		})
		return list
	})()

	const filteredCvIndexMap = filteredCvExaminers.map(fe => fe._origIdx)

	const handleCvCertSort = (field: typeof cvCertSortField) => {
		if (cvCertSortField === field) {
			setCvCertSortDir(d => d === 'asc' ? 'desc' : 'asc')
		} else {
			setCvCertSortField(field)
			setCvCertSortDir('asc')
		}
	}

	const cvSortIcon = (field: typeof cvCertSortField) =>
		cvCertSortField === field ? (cvCertSortDir === 'asc' ? ' ↑' : ' ↓') : ''

	const handleCvSelectAll = (checked: boolean) => {
		setCvSelectAll(checked)
		if (checked) setCvSelectedExaminerIds(new Set(filteredCvIndexMap))
		else setCvSelectedExaminerIds(new Set())
	}

	const toggleCvExaminer = (originalIdx: number) => {
		const next = new Set(cvSelectedExaminerIds)
		if (next.has(originalIdx)) next.delete(originalIdx)
		else next.add(originalIdx)
		setCvSelectedExaminerIds(next)
		setCvSelectAll(filteredCvIndexMap.every(i => next.has(i)))
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />

				<div className="flex-1 p-4 space-y-4 overflow-auto">
					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild><Link href="/dashboard">Dashboard</Link></BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink asChild><Link href="#">Practical Exam Reports</Link></BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Lunch Requirement & Certificates</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
							<FlaskConical className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-grotesk">
								Practical Exam Reports
							</h1>
							<p className="text-slate-500 dark:text-slate-400 text-sm">
								Lunch requirement and attendance certificates for practical examinations
							</p>
						</div>
					</div>

					{/* Filters */}
					<Card className="shadow-sm">
						<CardContent className="p-3">
							<div className={cn("grid grid-cols-1 md:grid-cols-2 gap-3", mustSelectInstitution ? 'lg:grid-cols-2' : 'lg:grid-cols-1')}>
								{/* Institution selector for super_admin */}
								{mustSelectInstitution && (
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Institution <span className="text-red-500">*</span></Label>
										<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
											<PopoverTrigger asChild>
												<Button variant="outline" role="combobox" className="w-full justify-between h-9 text-left text-xs truncate" disabled={loadingInstitutions}>
													<span className="flex-1 pr-2 truncate">
														{selectedInstitutionId
															? institutions.find(i => i.id === selectedInstitutionId)?.name
															: loadingInstitutions ? 'Loading...' : 'Select institution...'}
													</span>
													<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[400px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search institution..." className="h-8 text-xs" />
													<CommandList>
														<CommandEmpty className="text-xs py-4">No institution found.</CommandEmpty>
														<CommandGroup className="max-h-56 overflow-auto">
															{institutions.map(inst => (
																<CommandItem key={inst.id} value={`${inst.institution_code} ${inst.name}`} onSelect={() => { setSelectedInstitutionId(inst.id); setInstitutionOpen(false) }} className="py-2 text-xs">
																	<Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", selectedInstitutionId === inst.id ? "opacity-100" : "opacity-0")} />
																	<span className="flex-1 line-clamp-2">{inst.institution_code} - {inst.name}</span>
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								)}

								{/* Exam Session */}
								{mustSelectSession && (
								<div className="space-y-1.5">
									<Label className="text-xs font-medium">Exam Session <span className="text-red-500">*</span></Label>
									<Select value={selectedSessionId} onValueChange={setSelectedSessionId} disabled={loadingSessions || !selectedInstitutionId}>
										<SelectTrigger className="h-9 text-xs">
											<SelectValue placeholder={
												!selectedInstitutionId ? 'Select institution first...' :
												loadingSessions ? 'Loading...' :
												examSessions.length === 0 ? 'No sessions found' :
												'Select exam session...'
											} />
										</SelectTrigger>
										<SelectContent>
											{examSessions.map(s => (
												<SelectItem key={s.id} value={s.id} className="text-xs">{s.session_name}</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								)}
							</div>
						</CardContent>
					</Card>

					{/* Tabs */}
					{selectedSessionId && (
						<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
							<TabsList className="grid w-full max-w-3xl grid-cols-4 bg-slate-100 dark:bg-slate-800/60 p-1 h-10 rounded-lg">
								<TabsTrigger value="lunch" className="text-xs gap-1.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[state=active]:font-semibold dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-white">
									<Users className="h-3.5 w-3.5" />
									Practical Lunch
								</TabsTrigger>
								<TabsTrigger value="certificate" className="text-xs gap-1.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[state=active]:font-semibold dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-white">
									<Award className="h-3.5 w-3.5" />
									Practical Attendance
								</TabsTrigger>
								<TabsTrigger value="cv-lunch" className="text-xs gap-1.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[state=active]:font-semibold dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-white">
									<BookOpen className="h-3.5 w-3.5" />
									Central Valuation
								</TabsTrigger>
								<TabsTrigger value="cv-certificate" className="text-xs gap-1.5 rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[state=active]:font-semibold dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-white">
									<ScrollText className="h-3.5 w-3.5" />
									CV Attendance
								</TabsTrigger>
							</TabsList>

							{/* ────── LUNCH REQUIREMENT TAB ────── */}
							<TabsContent value="lunch" className="space-y-4">
								{loadingLunch ? (
									<Card className="shadow-sm">
										<CardContent className="p-8 text-center text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
											Loading lunch requirement data...
										</CardContent>
									</Card>
								) : lunchDates.length === 0 ? (
									<Card className="shadow-sm">
										<CardContent className="p-8 text-center text-muted-foreground">
											No practical examination timetable found for this session.
										</CardContent>
									</Card>
								) : (
									<>
										{/* Summary + Date Filter + Download */}
										<Card className="shadow-sm">
											<CardContent className="p-3 space-y-3">
												<div className="flex items-center gap-4 text-sm flex-wrap">
													<Badge variant="outline" className="text-xs">
														{lunchSummary?.total_dates} date(s)
													</Badge>
													<Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
														Internal: {lunchSummary?.total_internal}
													</Badge>
													<Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
														External: {lunchSummary?.total_external}
													</Badge>
													<Badge className="bg-emerald-100 text-emerald-800 text-xs">
														Total: {lunchSummary?.total_persons}
													</Badge>
												</div>
												<div className="flex items-end gap-3 flex-wrap">
													<div className="space-y-1">
														<Label className="text-xs font-medium">From Date</Label>
														<Input
															type="date"
															value={lunchFromDate}
															onChange={e => setLunchFromDate(e.target.value)}
															className="h-8 text-xs w-40"
														/>
													</div>
													<div className="space-y-1">
														<Label className="text-xs font-medium">To Date</Label>
														<Input
															type="date"
															value={lunchToDate}
															onChange={e => setLunchToDate(e.target.value)}
															className="h-8 text-xs w-40"
														/>
													</div>
													{(lunchFromDate || lunchToDate) && (
														<Button
															variant="ghost"
															size="sm"
															onClick={() => { setLunchFromDate(''); setLunchToDate('') }}
															className="h-8 text-xs text-muted-foreground"
														>
															Clear dates
														</Button>
													)}
													<div className="flex-1" />
													<Button onClick={handleDownloadLunchPdf} disabled={downloadingPdf} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">
														{downloadingPdf ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
														Download PDF
													</Button>
												</div>
											</CardContent>
										</Card>

										{/* Data Table */}
										<Card className="shadow-md">
											<CardHeader className="pb-3">
												<CardTitle className="flex items-center gap-2 font-grotesk text-base">
													<div className="h-2 w-2 rounded-full bg-emerald-500" />
													Lunch Requirement
												</CardTitle>
												<CardDescription className="text-xs">
													Date-wise examiner count for practical examinations
												</CardDescription>
											</CardHeader>
											<CardContent className="pt-0">
												<div className="border rounded-lg">
													<Table>
														<TableHeader>
															<TableRow className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-600 hover:to-teal-600">
																<TableHead className="w-12 text-white font-semibold text-sm">S.No</TableHead>
																<TableHead className="text-white font-semibold text-sm">Date</TableHead>
																<TableHead className="text-white font-semibold text-sm">Purpose</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center">Internal Examiners</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center">External Examiners</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center">Total Persons</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{lunchDates.map(row => (
																<TableRow key={row.serial_number} className="hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10">
																	<TableCell className="text-sm py-3 text-muted-foreground">{row.serial_number}</TableCell>
																	<TableCell className="text-sm py-3 font-medium">{formatDate(row.exam_date)}</TableCell>
																	<TableCell className="text-sm py-3">{row.purpose}</TableCell>
																	<TableCell className="text-sm py-3 text-center font-medium">{row.internal_count}</TableCell>
																	<TableCell className="text-sm py-3 text-center font-medium">{row.external_count}</TableCell>
																	<TableCell className="text-sm py-3 text-center font-bold">{row.total_persons}</TableCell>
																</TableRow>
															))}
															{/* Total Row */}
															<TableRow className="bg-slate-50 dark:bg-slate-800/50 font-bold">
																<TableCell colSpan={3} className="text-sm py-3 text-center font-bold">Total</TableCell>
																<TableCell className="text-sm py-3 text-center font-bold">{lunchSummary?.total_internal}</TableCell>
																<TableCell className="text-sm py-3 text-center font-bold">{lunchSummary?.total_external}</TableCell>
																<TableCell className="text-sm py-3 text-center font-bold text-emerald-700">{lunchSummary?.total_persons}</TableCell>
															</TableRow>
														</TableBody>
													</Table>
												</div>
											</CardContent>
										</Card>
									</>
								)}
							</TabsContent>

							{/* ────── ATTENDANCE CERTIFICATE TAB ────── */}
							<TabsContent value="certificate" className="space-y-4">
								{loadingCert ? (
									<Card className="shadow-sm">
										<CardContent className="p-8 text-center text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
											Loading examiner data...
										</CardContent>
									</Card>
								) : examiners.length === 0 ? (
									<Card className="shadow-sm">
										<CardContent className="p-8 text-center text-muted-foreground">
											No examiner allotments found for this session.
										</CardContent>
									</Card>
								) : (
									<>
										{/* Download bar */}
										<Card className="shadow-sm">
											<CardContent className="p-3 space-y-3">
												<div className="flex items-center gap-3 text-sm flex-wrap">
													<Badge variant="outline" className="text-xs">
														{examiners.length} examiner(s)
													</Badge>
													<Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
														{examiners.filter(e => e.type === 'External').length} External
													</Badge>
													<Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
														{examiners.filter(e => e.type === 'Internal').length} Internal
													</Badge>
													{selectedExaminerIds.size > 0 && (
														<Badge className="bg-emerald-100 text-emerald-800 text-xs">
															{selectedExaminerIds.size} selected
														</Badge>
													)}
												</div>
												<div className="flex items-end gap-3 flex-wrap">
													<div className="space-y-1">
														<Label className="text-xs font-medium">Examiner Type</Label>
														<Select value={certTypeFilter} onValueChange={(v) => { setCertTypeFilter(v as typeof certTypeFilter); setSelectedExaminerIds(new Set()); setSelectAll(false) }}>
															<SelectTrigger className="h-8 text-xs w-40">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="all" className="text-xs">All Types</SelectItem>
																<SelectItem value="External" className="text-xs">External</SelectItem>
																<SelectItem value="Internal" className="text-xs">Internal</SelectItem>
															</SelectContent>
														</Select>
													</div>
													<div className="flex-1" />
													<Button onClick={handleDownloadCertPdf} disabled={downloadingPdf || selectedExaminerIds.size === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">
														{downloadingPdf ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
														Download Certificates ({selectedExaminerIds.size})
													</Button>
												</div>
											</CardContent>
										</Card>

										{/* Examiner Table */}
										<Card className="shadow-md">
											<CardHeader className="pb-3">
												<CardTitle className="flex items-center gap-2 font-grotesk text-base">
													<div className="h-2 w-2 rounded-full bg-orange-500" />
													Attendance Certificates
												</CardTitle>
												<CardDescription className="text-xs">
													Select examiners to generate attendance certificates
												</CardDescription>
											</CardHeader>
											<CardContent className="pt-0">
												<div className="border rounded-lg">
													<Table>
														<TableHeader>
															<TableRow className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-600 hover:to-amber-600">
																<TableHead className="w-10 text-white">
																	<Checkbox
																		checked={selectAll}
																		onCheckedChange={handleSelectAll}
																		className="border-white data-[state=checked]:bg-white data-[state=checked]:text-orange-700"
																	/>
																</TableHead>
																<TableHead className="w-10 text-white font-semibold text-sm">#</TableHead>
																<TableHead className="text-white font-semibold text-sm cursor-pointer select-none" onClick={() => handleCertSort('examiner_name')}>
																	Examiner Name{sortIcon('examiner_name')}
																</TableHead>
																<TableHead className="text-white font-semibold text-sm cursor-pointer select-none" onClick={() => handleCertSort('type')}>
																	Type{sortIcon('type')}
																</TableHead>
																<TableHead className="text-white font-semibold text-sm">Institution / Department</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center cursor-pointer select-none" onClick={() => handleCertSort('from_date')}>
																	From{sortIcon('from_date')}
																</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center cursor-pointer select-none" onClick={() => handleCertSort('to_date')}>
																	To{sortIcon('to_date')}
																</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center cursor-pointer select-none" onClick={() => handleCertSort('total_days')}>
																	Days{sortIcon('total_days')}
																</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{filteredExaminers.map((ex, idx) => (
																<TableRow key={ex._origIdx} className={cn("hover:bg-orange-50/50 dark:hover:bg-orange-900/10", selectedExaminerIds.has(ex._origIdx) && "bg-orange-50/80 dark:bg-orange-900/20")}>
																	<TableCell className="py-3">
																		<Checkbox
																			checked={selectedExaminerIds.has(ex._origIdx)}
																			onCheckedChange={() => toggleExaminer(ex._origIdx)}
																		/>
																	</TableCell>
																	<TableCell className="text-sm py-3 text-muted-foreground">{idx + 1}</TableCell>
																	<TableCell className="text-sm py-3 font-semibold">{ex.examiner_name}</TableCell>
																	<TableCell className="py-3">
																		<Badge variant="outline" className={cn("text-xs", ex.type === 'External' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200')}>
																			{ex.type}
																		</Badge>
																	</TableCell>
																	<TableCell className="text-sm py-3 text-muted-foreground">
																		{ex.type === 'External'
																			? [ex.department, ex.institution_name].filter(Boolean).join(', ')
																			: '-'
																		}
																	</TableCell>
																	<TableCell className="text-sm py-3 text-center">{formatDate(ex.from_date)}</TableCell>
																	<TableCell className="text-sm py-3 text-center">
																		{ex.to_date ? formatDate(ex.to_date) : '-'}
																	</TableCell>
																	<TableCell className="text-sm py-3 text-center font-medium">{ex.total_days}</TableCell>
																</TableRow>
															))}
														</TableBody>
													</Table>
												</div>
											</CardContent>
										</Card>
									</>
								)}
							</TabsContent>

							{/* ────── CENTRAL VALUATION LUNCH TAB ────── */}
							<TabsContent value="cv-lunch" className="space-y-4">
								{loadingCvLunch ? (
									<Card className="shadow-sm">
										<CardContent className="p-8 text-center text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
											Loading central valuation lunch data...
										</CardContent>
									</Card>
								) : cvLunchDates.length === 0 ? (
									<Card className="shadow-sm">
										<CardContent className="p-8 text-center text-muted-foreground">
											No central valuation packets with valuation dates found for this session.
										</CardContent>
									</Card>
								) : (
									<>
										{/* Summary + Date Filter + Download */}
										<Card className="shadow-sm">
											<CardContent className="p-3 space-y-3">
												<div className="flex items-center gap-4 text-sm flex-wrap">
													<Badge variant="outline" className="text-xs">
														{cvLunchSummary?.total_dates} date(s)
													</Badge>
													<Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
														Internal: {cvLunchSummary?.total_internal}
													</Badge>
													<Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
														External: {cvLunchSummary?.total_external}
													</Badge>
													<Badge className="bg-indigo-100 text-indigo-800 text-xs">
														Total: {cvLunchSummary?.total_persons}
													</Badge>
												</div>
												<div className="flex items-end gap-3 flex-wrap">
													<div className="space-y-1">
														<Label className="text-xs font-medium">From Date</Label>
														<Input
															type="date"
															value={cvLunchFromDate}
															onChange={e => setCvLunchFromDate(e.target.value)}
															className="h-8 text-xs w-40"
														/>
													</div>
													<div className="space-y-1">
														<Label className="text-xs font-medium">To Date</Label>
														<Input
															type="date"
															value={cvLunchToDate}
															onChange={e => setCvLunchToDate(e.target.value)}
															className="h-8 text-xs w-40"
														/>
													</div>
													{(cvLunchFromDate || cvLunchToDate) && (
														<Button
															variant="ghost"
															size="sm"
															onClick={() => { setCvLunchFromDate(''); setCvLunchToDate('') }}
															className="h-8 text-xs text-muted-foreground"
														>
															Clear dates
														</Button>
													)}
													<div className="flex-1" />
													<Button onClick={handleDownloadCvLunchPdf} disabled={downloadingPdf} className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-xs">
														{downloadingPdf ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
														Download PDF
													</Button>
												</div>
											</CardContent>
										</Card>

										{/* Data Table */}
										<Card className="shadow-md">
											<CardHeader className="pb-3">
												<CardTitle className="flex items-center gap-2 font-grotesk text-base">
													<div className="h-2 w-2 rounded-full bg-indigo-500" />
													Central Valuation Lunch Requirement
												</CardTitle>
												<CardDescription className="text-xs">
													Date-wise examiner count from answer sheet packet allotments
												</CardDescription>
											</CardHeader>
											<CardContent className="pt-0">
												<div className="border rounded-lg">
													<Table>
														<TableHeader>
															<TableRow className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-600 hover:to-violet-600">
																<TableHead className="w-12 text-white font-semibold text-sm">S.No</TableHead>
																<TableHead className="text-white font-semibold text-sm">Date</TableHead>
																<TableHead className="text-white font-semibold text-sm">Purpose</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center">Internal Examiners</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center">External Examiners</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center">Total Persons</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{cvLunchDates.map(row => (
																<TableRow key={row.serial_number} className="hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10">
																	<TableCell className="text-sm py-3 text-muted-foreground">{row.serial_number}</TableCell>
																	<TableCell className="text-sm py-3 font-medium">{formatDate(row.exam_date)}</TableCell>
																	<TableCell className="text-sm py-3">{row.purpose}</TableCell>
																	<TableCell className="text-sm py-3 text-center font-medium">{row.internal_count}</TableCell>
																	<TableCell className="text-sm py-3 text-center font-medium">{row.external_count}</TableCell>
																	<TableCell className="text-sm py-3 text-center font-bold">{row.total_persons}</TableCell>
																</TableRow>
															))}
															<TableRow className="bg-slate-50 dark:bg-slate-800/50 font-bold">
																<TableCell colSpan={3} className="text-sm py-3 text-center font-bold">Total</TableCell>
																<TableCell className="text-sm py-3 text-center font-bold">{cvLunchSummary?.total_internal}</TableCell>
																<TableCell className="text-sm py-3 text-center font-bold">{cvLunchSummary?.total_external}</TableCell>
																<TableCell className="text-sm py-3 text-center font-bold text-indigo-700">{cvLunchSummary?.total_persons}</TableCell>
															</TableRow>
														</TableBody>
													</Table>
												</div>
											</CardContent>
										</Card>
									</>
								)}
							</TabsContent>

							{/* ────── CENTRAL VALUATION ATTENDANCE TAB ────── */}
							<TabsContent value="cv-certificate" className="space-y-4">
								{loadingCvCert ? (
									<Card className="shadow-sm">
										<CardContent className="p-8 text-center text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
											Loading central valuation examiner data...
										</CardContent>
									</Card>
								) : cvExaminers.length === 0 ? (
									<Card className="shadow-sm">
										<CardContent className="p-8 text-center text-muted-foreground">
											No examiner allotments with valuation dates found for this session.
										</CardContent>
									</Card>
								) : (
									<>
										<Card className="shadow-sm">
											<CardContent className="p-3 space-y-3">
												<div className="flex items-center gap-3 text-sm flex-wrap">
													<Badge variant="outline" className="text-xs">
														{cvExaminers.length} examiner(s)
													</Badge>
													<Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
														{cvExaminers.filter(e => e.type === 'External').length} External
													</Badge>
													<Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
														{cvExaminers.filter(e => e.type === 'Internal').length} Internal
													</Badge>
													{cvSelectedExaminerIds.size > 0 && (
														<Badge className="bg-indigo-100 text-indigo-800 text-xs">
															{cvSelectedExaminerIds.size} selected
														</Badge>
													)}
												</div>
												<div className="flex items-end gap-3 flex-wrap">
													<div className="space-y-1">
														<Label className="text-xs font-medium">Examiner Type</Label>
														<Select value={cvCertTypeFilter} onValueChange={(v) => { setCvCertTypeFilter(v as typeof cvCertTypeFilter); setCvSelectedExaminerIds(new Set()); setCvSelectAll(false) }}>
															<SelectTrigger className="h-8 text-xs w-40">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="all" className="text-xs">All Types</SelectItem>
																<SelectItem value="External" className="text-xs">External</SelectItem>
																<SelectItem value="Internal" className="text-xs">Internal</SelectItem>
															</SelectContent>
														</Select>
													</div>
													<div className="flex-1" />
													<Button onClick={handleDownloadCvCertPdf} disabled={downloadingPdf || cvSelectedExaminerIds.size === 0} className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-xs">
														{downloadingPdf ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
														Download Certificates ({cvSelectedExaminerIds.size})
													</Button>
												</div>
											</CardContent>
										</Card>

										<Card className="shadow-md">
											<CardHeader className="pb-3">
												<CardTitle className="flex items-center gap-2 font-grotesk text-base">
													<div className="h-2 w-2 rounded-full bg-violet-500" />
													Central Valuation Attendance Certificates
												</CardTitle>
												<CardDescription className="text-xs">
													Select examiners to generate central valuation attendance certificates
												</CardDescription>
											</CardHeader>
											<CardContent className="pt-0">
												<div className="border rounded-lg">
													<Table>
														<TableHeader>
															<TableRow className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-600 hover:to-violet-600">
																<TableHead className="w-10 text-white">
																	<Checkbox
																		checked={cvSelectAll}
																		onCheckedChange={handleCvSelectAll}
																		className="border-white data-[state=checked]:bg-white data-[state=checked]:text-violet-700"
																	/>
																</TableHead>
																<TableHead className="w-10 text-white font-semibold text-sm">#</TableHead>
																<TableHead className="text-white font-semibold text-sm cursor-pointer select-none" onClick={() => handleCvCertSort('examiner_name')}>
																	Examiner Name{cvSortIcon('examiner_name')}
																</TableHead>
																<TableHead className="text-white font-semibold text-sm cursor-pointer select-none" onClick={() => handleCvCertSort('type')}>
																	Type{cvSortIcon('type')}
																</TableHead>
																<TableHead className="text-white font-semibold text-sm">Institution / Department</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center cursor-pointer select-none" onClick={() => handleCvCertSort('from_date')}>
																	From{cvSortIcon('from_date')}
																</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center cursor-pointer select-none" onClick={() => handleCvCertSort('to_date')}>
																	To{cvSortIcon('to_date')}
																</TableHead>
																<TableHead className="text-white font-semibold text-sm text-center cursor-pointer select-none" onClick={() => handleCvCertSort('total_days')}>
																	Days{cvSortIcon('total_days')}
																</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{filteredCvExaminers.map((ex, idx) => (
																<TableRow key={ex._origIdx} className={cn("hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10", cvSelectedExaminerIds.has(ex._origIdx) && "bg-indigo-50/80 dark:bg-indigo-900/20")}>
																	<TableCell className="py-3">
																		<Checkbox
																			checked={cvSelectedExaminerIds.has(ex._origIdx)}
																			onCheckedChange={() => toggleCvExaminer(ex._origIdx)}
																		/>
																	</TableCell>
																	<TableCell className="text-sm py-3 text-muted-foreground">{idx + 1}</TableCell>
																	<TableCell className="text-sm py-3 font-semibold">{ex.examiner_name}</TableCell>
																	<TableCell className="py-3">
																		<Badge variant="outline" className={cn("text-xs", ex.type === 'External' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200')}>
																			{ex.type}
																		</Badge>
																	</TableCell>
																	<TableCell className="text-sm py-3 text-muted-foreground">
																		{ex.type === 'External'
																			? [ex.department, ex.institution_name].filter(Boolean).join(', ')
																			: '-'
																		}
																	</TableCell>
																	<TableCell className="text-sm py-3 text-center">{formatDate(ex.from_date)}</TableCell>
																	<TableCell className="text-sm py-3 text-center">
																		{ex.to_date ? formatDate(ex.to_date) : '-'}
																	</TableCell>
																	<TableCell className="text-sm py-3 text-center font-medium">{ex.total_days}</TableCell>
																</TableRow>
															))}
														</TableBody>
													</Table>
												</div>
											</CardContent>
										</Card>
									</>
								)}
							</TabsContent>
						</Tabs>
					)}
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
