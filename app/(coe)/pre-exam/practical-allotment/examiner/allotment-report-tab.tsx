'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import { FileText, Sheet, Loader2, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InternalExaminer {
	staff_id: string
	staff_name: string
	staff_mobile: string
	staff_designation: string
}

interface ExternalExaminer {
	examiner_id: string
	full_name: string
	mobile: string
	designation: string
	department: string
	institution_name: string
	institution_address: string
	address: string
	city: string
	state: string
	pincode: string
}

interface TimetableRow {
	serial_number: number
	timetable_id: string
	exam_date: string
	session: string
	exam_time: string | null
	batch_no: number
	batch_capacity: number
	course_id: string
	course_code: string
	course_title: string
	course_category: string
	board_code: string
	exam_duration: number | null
	student_count: number
	register_range: { min: string; max: string } | null
	internal_examiner: InternalExaminer | null
	external_examiner: ExternalExaminer | null
	skilled_examiner: InternalExaminer | null
	programmer_examiner: InternalExaminer | null
}

interface Board {
	board_code: string
	board_name: string
	board_type: string
	board_order: number
}

interface RegisterRange {
	min: string
	max: string
}

interface AllotmentReportTabProps {
	institutionId: string
	institutionCode: string
	sessionId: string
	sessionName: string
	boards: Board[]
	boardCode: string
	isReady: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AllotmentReportTab({
	institutionId,
	institutionCode,
	sessionId,
	sessionName,
	boards,
	boardCode,
	isReady,
}: AllotmentReportTabProps) {
	const { toast } = useToast()

	const [rows, setRows] = useState<TimetableRow[]>([])
	const [loading, setLoading] = useState(false)
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const [downloadingPdf, setDownloadingPdf] = useState(false)
	const [downloadingExcel, setDownloadingExcel] = useState(false)

	// ---------------------------------------------------------------------------
	// Fetch data
	// ---------------------------------------------------------------------------

	const fetchData = useCallback(async () => {
		if (!institutionId || !sessionId) return

		setLoading(true)
		try {
			let url = `/api/pre-exam/examiner-allotment?action=timetable-rows&institutionId=${institutionId}&sessionId=${sessionId}`
			if (boardCode) url += `&boardCode=${boardCode}`

			const res = await fetch(url)
			if (!res.ok) throw new Error('Failed')
			const data: TimetableRow[] = await res.json()
			setRows(data)
			setSelectedIds(new Set())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load report data', variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}, [institutionId, sessionId, boardCode, toast])

	useEffect(() => {
		if (isReady && institutionId && sessionId) {
			fetchData()
		}
	}, [isReady, institutionId, sessionId, boardCode, fetchData])

	// ---------------------------------------------------------------------------
	// Derived data
	// ---------------------------------------------------------------------------

	const hasSkilled = useMemo(() => rows.some(r => r.skilled_examiner !== null), [rows])
	const hasProgrammer = useMemo(() => rows.some(r => r.programmer_examiner !== null), [rows])

	// Group by board_code
	const grouped = useMemo(() => {
		const boardMap = new Map<string, Board>()
		for (const b of boards) boardMap.set(b.board_code, b)

		const groupMap = new Map<string, TimetableRow[]>()
		const groupOrder: string[] = []

		for (const row of rows) {
			const code = row.board_code || 'UNKNOWN'
			if (!groupMap.has(code)) {
				groupMap.set(code, [])
				groupOrder.push(code)
			}
			groupMap.get(code)!.push(row)
		}

		// Sort groups by board_order
		groupOrder.sort((a, b) => {
			const boardA = boardMap.get(a)
			const boardB = boardMap.get(b)
			const orderA = boardA?.board_order ?? 999
			const orderB = boardB?.board_order ?? 999
			if (orderA !== orderB) return orderA - orderB
			return a.localeCompare(b)
		})

		return groupOrder.map(code => ({
			board_code: code,
			board_name: boardMap.get(code)?.board_name || code,
			rows: groupMap.get(code)!,
		}))
	}, [rows, boards])

	// ---------------------------------------------------------------------------
	// Selection
	// ---------------------------------------------------------------------------

	const allSelected = rows.length > 0 && selectedIds.size === rows.length
	const someSelected = selectedIds.size > 0 && selectedIds.size < rows.length

	const toggleAll = () => {
		if (allSelected) {
			setSelectedIds(new Set())
		} else {
			setSelectedIds(new Set(rows.map(r => r.timetable_id)))
		}
	}

	const toggleRow = (id: string) => {
		setSelectedIds(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	const formatDate = (dateStr: string): string => {
		if (!dateStr) return ''
		const d = new Date(dateStr)
		return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
	}

	const formatDuration = (hours: number | null): string => {
		if (!hours) return '—'
		const wholeHours = Math.floor(hours)
		const mins = Math.round((hours - wholeHours) * 60)
		if (mins === 0) return `${wholeHours} Hr${wholeHours !== 1 ? 's' : ''}`
		return `${wholeHours}h ${mins}m`
	}

	const getRegisterRange = (row: TimetableRow): string => {
		const range = row.register_range
		if (!range) return '-'
		if (range.min === range.max) return range.min
		return `${range.min} - ${range.max}`
	}

	const buildRefNumber = (): string => {
		const yearMatch = sessionName.match(/\d{4}/)
		const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear()
		const academicYear = `${String(year - 1).slice(-2)}-${String(year).slice(-2)}`
		const sessionMonths = sessionName
			.replace(/[-\s]*\d{4}/, '')
			.trim()
			.split(/[-\s]+/)
			.filter(Boolean)
			.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
			.join('-')
		return `JKKN${institutionCode}/ CoE/ ${academicYear}, ${sessionMonths}/Sem Practicals`
	}

	// ---------------------------------------------------------------------------
	// Get selected rows grouped
	// ---------------------------------------------------------------------------

	const getSelectedGroups = () => {
		const selected = rows.filter(r => selectedIds.has(r.timetable_id))
		// Determine hasSkilled/hasProgrammer from selected rows only
		const selHasSkilled = selected.some(r => r.skilled_examiner !== null)
		const selHasProgrammer = selected.some(r => r.programmer_examiner !== null)

		const boardMap = new Map<string, Board>()
		for (const b of boards) boardMap.set(b.board_code, b)

		const groupMap = new Map<string, TimetableRow[]>()
		const groupOrder: string[] = []

		for (const row of selected) {
			const code = row.board_code || 'UNKNOWN'
			if (!groupMap.has(code)) {
				groupMap.set(code, [])
				groupOrder.push(code)
			}
			groupMap.get(code)!.push(row)
		}

		groupOrder.sort((a, b) => {
			const orderA = boardMap.get(a)?.board_order ?? 999
			const orderB = boardMap.get(b)?.board_order ?? 999
			if (orderA !== orderB) return orderA - orderB
			return a.localeCompare(b)
		})

		// Format internal/skilled/programmer: name, designation, mobile
		const formatStaff = (e: InternalExaminer | null): string => {
			if (!e) return ''
			const parts = [e.staff_name]
			if (e.staff_designation) parts.push(e.staff_designation)
			if (e.staff_mobile) parts.push(e.staff_mobile)
			return parts.filter(Boolean).join('\n')
		}

		// Format external: name, designation, department, institution, mobile
		const formatExternal = (e: ExternalExaminer | null): string => {
			if (!e) return ''
			const parts = [e.full_name]
			if (e.designation) parts.push(e.designation)
			if (e.department) parts.push(e.department)
			if (e.institution_name) parts.push(e.institution_name)
			if (e.mobile) parts.push(e.mobile)
			return parts.filter(Boolean).join('\n')
		}

		const groups = groupOrder.map(code => ({
			board_code: code,
			board_name: boardMap.get(code)?.board_name || code,
			rows: groupMap.get(code)!.map(r => ({
				timetable_id: r.timetable_id,
				exam_date: r.exam_date,
				session: r.session,
				batch_no: r.batch_no,
				course_code: r.course_code,
				course_title: r.course_title,
				student_count: r.student_count,
				register_range: getRegisterRange(r),
				internal_examiner: formatStaff(r.internal_examiner),
				external_examiner: formatExternal(r.external_examiner),
				skilled_examiner: formatStaff(r.skilled_examiner),
				programmer_examiner: formatStaff(r.programmer_examiner),
				exam_duration: r.exam_duration,
				board_code: r.board_code,
			})),
		}))

		return { groups, selHasSkilled, selHasProgrammer }
	}

	// ---------------------------------------------------------------------------
	// Download PDF
	// ---------------------------------------------------------------------------

	// Helper to convert blob to base64
	const blobToBase64 = (blob: Blob): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result as string)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	}

	const handleDownloadPdf = async () => {
		if (selectedIds.size === 0) {
			toast({ title: '⚠️ No Selection', description: 'Please select rows to download', variant: 'destructive' })
			return
		}

		setDownloadingPdf(true)
		try {
			const { generateAllotmentReportPdf } = await import('@/lib/utils/generate-allotment-report-pdf')
			const { groups, selHasSkilled, selHasProgrammer } = getSelectedGroups()

			// Fetch PDF institution settings
			let pdfSettings: any = null
			try {
				const settingsRes = await fetch(`/api/pdf-settings?institution_code=${institutionCode}&template_type=default`)
				if (settingsRes.ok) {
					const settingsData = await settingsRes.json()
					if (!settingsData.defaults) pdfSettings = settingsData
				}
			} catch (e) {
				console.warn('Failed to fetch PDF settings, using defaults:', e)
			}

			// Fetch logo images as base64
			let logoImage: string | undefined
			let rightLogoImage: string | undefined

			const defaultLogoUrl = '/jkkn_logo.png'
			const defaultSecondaryLogoUrl = '/jkkncas_logo.png'

			const logoUrl = pdfSettings?.logo_url || defaultLogoUrl
			try {
				const logoRes = await fetch(logoUrl)
				if (logoRes.ok) {
					const logoBlob = await logoRes.blob()
					logoImage = await blobToBase64(logoBlob)
				}
			} catch (e) {
				console.warn('Failed to load logo:', e)
			}

			const secondaryLogoUrl = pdfSettings?.secondary_logo_url || defaultSecondaryLogoUrl
			try {
				const rightLogoRes = await fetch(secondaryLogoUrl)
				if (rightLogoRes.ok) {
					const rightLogoBlob = await rightLogoRes.blob()
					rightLogoImage = await blobToBase64(rightLogoBlob)
				}
			} catch (e) {
				console.warn('Failed to load secondary logo:', e)
			}

			// Always fetch institution details from institutions API (authoritative source for name)
			let institutionName = ''
			let institutionAddress = ''
			let accreditationText = ''

			try {
				const instRes = await fetch('/api/master/institutions?local_only=true')
				if (instRes.ok) {
					const instData = await instRes.json()
					const allInst = Array.isArray(instData) ? instData : []
					// Match by institutionId (always reliable) — institutionCode may be empty for non-super_admin
					const inst = allInst.find((i: any) => i.id === institutionId)
					if (inst) {
						institutionName = inst.name || inst.institution_name || ''
						institutionAddress = inst.address
							? [inst.address, inst.city, inst.district, inst.state].filter(Boolean).join(', ')
							: ''
						accreditationText = inst.accredited_by || ''
					}
				}
			} catch (e) {
				console.warn('Failed to fetch institution details:', e)
			}

			// Override with PDF settings if available (accreditation/address may be richer there)
			if (pdfSettings) {
				if (pdfSettings.accreditation_text) accreditationText = pdfSettings.accreditation_text
				if (pdfSettings.address) institutionAddress = pdfSettings.address
			}

			const doc = generateAllotmentReportPdf({
				institution_name: institutionName,
				institution_address: institutionAddress,
				institution_accreditation: accreditationText,
				session_name: sessionName,
				ref_number: buildRefNumber(),
				groups,
				hasSkilled: selHasSkilled,
				hasProgrammer: selHasProgrammer,
				primary_color: pdfSettings?.primary_color,
				logoImage,
				rightLogoImage,
			})

			doc.save(`${institutionCode}_${sessionName.replace(/\s+/g, '_')}_allotment_report.pdf`)

			toast({
				title: '✅ PDF Downloaded',
				description: `Exported ${selectedIds.size} rows to PDF`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (err) {
			console.error('PDF generation error:', err)
			toast({ title: '❌ Failed', description: 'Failed to generate PDF', variant: 'destructive' })
		} finally {
			setDownloadingPdf(false)
		}
	}

	// ---------------------------------------------------------------------------
	// Download Excel
	// ---------------------------------------------------------------------------

	const handleDownloadExcel = async () => {
		if (selectedIds.size === 0) {
			toast({ title: '⚠️ No Selection', description: 'Please select rows to download', variant: 'destructive' })
			return
		}

		setDownloadingExcel(true)
		try {
			const ExcelJS = await import('exceljs')
			const workbook = new ExcelJS.default.Workbook()
			const { groups, selHasSkilled, selHasProgrammer } = getSelectedGroups()

			// ---- Sheet 1: Report (grouped with headers) ----
			const reportSheet = workbook.addWorksheet('Report')

			// Title rows
			reportSheet.addRow(['PRACTICAL EXAMINATIONS - ALLOTMENT REPORT'])
			reportSheet.addRow([`Session: ${sessionName}`])
			reportSheet.addRow([`Ref. No.: ${buildRefNumber()}`])
			reportSheet.addRow([]) // blank row

			// Build headers
			const headers = ['#', 'Date & Session', 'Batch', 'Course Code', 'Course Name', 'Students', 'Register Number', 'Internal Examiner', 'External Examiner']
			if (selHasSkilled) headers.push('Skilled')
			if (selHasProgrammer) headers.push('Programmer')
			headers.push('Examination')

			for (const group of groups) {
				// Group header row
				const groupRow = reportSheet.addRow([`${group.board_code} - ${group.board_name}`])
				groupRow.font = { bold: true, size: 11 }
				groupRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }
				reportSheet.mergeCells(groupRow.number, 1, groupRow.number, headers.length)

				// Column headers
				const headerRow = reportSheet.addRow(headers)
				headerRow.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
				headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008080' } }
				headerRow.alignment = { horizontal: 'center', vertical: 'middle' }

				// Data rows
				group.rows.forEach((r, idx) => {
					const vals: (string | number)[] = [
						idx + 1,
						`${formatDate(r.exam_date)} ${r.session}`,
						r.batch_no,
						r.course_code,
						r.course_title,
						r.student_count,
						r.register_range,
						r.internal_examiner,
						r.external_examiner,
					]
					if (selHasSkilled) vals.push(r.skilled_examiner)
					if (selHasProgrammer) vals.push(r.programmer_examiner)
					vals.push(formatDuration(r.exam_duration))

					const dataRow = reportSheet.addRow(vals)
					dataRow.font = { size: 9 }
					dataRow.alignment = { vertical: 'middle', wrapText: true }
				})

				reportSheet.addRow([]) // space between groups
			}

			// Auto-size report columns
			reportSheet.columns.forEach(col => {
				col.width = 18
			})
			if (reportSheet.columns[0]) reportSheet.columns[0].width = 5
			if (reportSheet.columns[3]) reportSheet.columns[3].width = 14
			if (reportSheet.columns[4]) reportSheet.columns[4].width = 30

			// ---- Sheet 2: Data (flat table) ----
			const dataSheet = workbook.addWorksheet('Data')

			const flatHeaders = ['#', 'Programme', 'Date', 'Session', 'Batch No.', 'Course Code', 'Course Name', 'Students', 'Register Number (Min)', 'Register Number (Max)', 'Internal Examiner', 'External Examiner']
			if (selHasSkilled) flatHeaders.push('Skilled Examiner')
			if (selHasProgrammer) flatHeaders.push('Programmer')
			flatHeaders.push('Duration (Hrs)')

			const flatHeaderRow = dataSheet.addRow(flatHeaders)
			flatHeaderRow.font = { bold: true }
			flatHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }

			let serial = 0
			for (const group of groups) {
				for (const r of group.rows) {
					serial++
					const regParts = r.register_range.includes(' - ') ? r.register_range.split(' - ') : [r.register_range, r.register_range]
					const vals: (string | number)[] = [
						serial,
						`${group.board_code} - ${group.board_name}`,
						r.exam_date,
						r.session,
						r.batch_no,
						r.course_code,
						r.course_title,
						r.student_count,
						regParts[0] === '-' ? '' : regParts[0],
						regParts[1] === '-' ? '' : (regParts[1] || regParts[0]),
						r.internal_examiner,
						r.external_examiner,
					]
					if (selHasSkilled) vals.push(r.skilled_examiner)
					if (selHasProgrammer) vals.push(r.programmer_examiner)
					vals.push(r.exam_duration ? String(r.exam_duration) : '')

					dataSheet.addRow(vals)
				}
			}

			// Auto-size data columns
			dataSheet.columns.forEach((col, idx) => {
				const header = flatHeaders[idx] || ''
				col.width = Math.max(header.length + 2, 12)
			})

			// Generate and download
			const buffer = await workbook.xlsx.writeBuffer()
			const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `allotment_report_${institutionCode}_${sessionName.replace(/\s+/g, '_')}.xlsx`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)

			toast({
				title: '✅ Excel Downloaded',
				description: `Exported ${selectedIds.size} rows (Report + Data sheets)`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (err) {
			console.error('Excel generation error:', err)
			toast({ title: '❌ Failed', description: 'Failed to generate Excel', variant: 'destructive' })
		} finally {
			setDownloadingExcel(false)
		}
	}

	// ---------------------------------------------------------------------------
	// Column count for empty row colspan
	// ---------------------------------------------------------------------------

	const colCount = 9 + (hasSkilled ? 1 : 0) + (hasProgrammer ? 1 : 0)

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	if (!institutionId || !sessionId) {
		return (
			<Card className="shadow-sm">
				<CardContent className="p-8">
					<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
						<FileText className="h-8 w-8 opacity-40" />
						<p className="text-sm font-medium">Select institution and session to view the allotment report</p>
					</div>
				</CardContent>
			</Card>
		)
	}

	if (loading) {
		return (
			<Card className="shadow-sm">
				<CardContent className="p-4">
					<div className="flex items-center justify-center gap-2 text-muted-foreground">
						<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
						<span className="text-sm">Loading report data...</span>
					</div>
				</CardContent>
			</Card>
		)
	}

	if (rows.length === 0) {
		return (
			<Card className="shadow-sm">
				<CardContent className="p-8">
					<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
						<FileText className="h-8 w-8 opacity-40" />
						<p className="text-sm font-medium">No practical/project batches found</p>
						<p className="text-xs">Ensure published practical timetable entries exist for this session</p>
					</div>
				</CardContent>
			</Card>
		)
	}

	return (
		<Card className="shadow-md">
			<CardHeader className="pb-3">
				<div className="flex items-center flex-wrap gap-2">
					<CardTitle className="flex items-center gap-2 font-grotesk text-base">
						<div className="h-2 w-2 rounded-full bg-teal-500" />
						Allotment Report
					</CardTitle>
					<Badge
						variant="outline"
						className="text-xs px-2 py-0.5 bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800"
					>
						{selectedIds.size} / {rows.length} selected
					</Badge>
					<Button
						size="sm"
						variant="outline"
						className="h-7 text-xs gap-1"
						disabled={selectedIds.size === 0 || downloadingPdf}
						onClick={handleDownloadPdf}
					>
						{downloadingPdf ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
						PDF
					</Button>
					<Button
						size="sm"
						variant="outline"
						className="h-7 text-xs gap-1"
						disabled={selectedIds.size === 0 || downloadingExcel}
						onClick={handleDownloadExcel}
					>
						{downloadingExcel ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sheet className="h-3 w-3" />}
						Excel
					</Button>
				</div>
			</CardHeader>

			<CardContent className="pt-0">
				<div className="border rounded-lg overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-600 hover:to-emerald-600">
								<TableHead className="w-8 text-white">
									<Checkbox
										checked={allSelected}
										onCheckedChange={toggleAll}
										className="border-white data-[state=checked]:bg-white data-[state=checked]:text-teal-600"
										{...(someSelected ? { 'data-state': 'indeterminate' } : {})}
									/>
								</TableHead>
								<TableHead className="w-10 text-white font-semibold text-xs">#</TableHead>
								<TableHead className="text-white font-semibold text-xs">Date & Session</TableHead>
								<TableHead className="text-white font-semibold text-xs w-10 text-center">Batch</TableHead>
								<TableHead className="text-white font-semibold text-xs min-w-[180px]">Course Code & Name</TableHead>
								<TableHead className="text-white font-semibold text-xs w-16 text-center">Students</TableHead>
								<TableHead className="text-white font-semibold text-xs min-w-[140px]">Register Number</TableHead>
								<TableHead className="text-white font-semibold text-xs min-w-[150px]">Internal Examiner</TableHead>
								<TableHead className="text-white font-semibold text-xs min-w-[150px]">External Examiner</TableHead>
								{hasSkilled && (
									<TableHead className="text-white font-semibold text-xs min-w-[140px]">Skilled</TableHead>
								)}
								{hasProgrammer && (
									<TableHead className="text-white font-semibold text-xs min-w-[140px]">Programmer</TableHead>
								)}
								<TableHead className="text-white font-semibold text-xs w-20 text-center">Examination</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{grouped.map(group => {
								let serial = 0
								return (
									<Fragment key={`group-${group.board_code}`}>
										{/* Group header */}
										<TableRow className="bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-50 dark:hover:bg-emerald-900/10">
											<TableCell
												colSpan={colCount + 1}
												className="py-1.5 px-3 text-xs font-bold text-emerald-800 dark:text-emerald-300"
											>
												{group.board_code} - {group.board_name}
											</TableCell>
										</TableRow>

										{/* Data rows */}
										{group.rows.map(row => {
											serial++
											const isSelected = selectedIds.has(row.timetable_id)
											return (
												<TableRow
													key={row.timetable_id}
													className={cn(
														'hover:bg-teal-50/30 dark:hover:bg-teal-900/5',
														isSelected && 'bg-teal-50/50 dark:bg-teal-900/10'
													)}
												>
													<TableCell className="py-2">
														<Checkbox
															checked={isSelected}
															onCheckedChange={() => toggleRow(row.timetable_id)}
														/>
													</TableCell>
													<TableCell className="text-xs py-2 font-medium">{serial}</TableCell>
													<TableCell className="text-xs py-2 whitespace-nowrap">
														{formatDate(row.exam_date)} {row.session}
													</TableCell>
													<TableCell className="text-xs py-2 text-center font-semibold">{row.batch_no}</TableCell>
													<TableCell className="text-xs py-2">
														<div className="font-semibold">{row.course_code}</div>
														<div className="text-muted-foreground text-[11px] line-clamp-2">{row.course_title}</div>
													</TableCell>
													<TableCell className="text-xs py-2 text-center">
														<Badge variant="outline" className="text-xs">
															{row.student_count}
														</Badge>
													</TableCell>
													<TableCell className="text-xs py-2 font-mono">
														{getRegisterRange(row)}
													</TableCell>
													<TableCell className="text-xs py-2">
														{row.internal_examiner?.staff_name || <span className="text-muted-foreground">—</span>}
													</TableCell>
													<TableCell className="text-xs py-2">
														{row.external_examiner?.full_name || <span className="text-muted-foreground">—</span>}
													</TableCell>
													{hasSkilled && (
														<TableCell className="text-xs py-2">
															{row.skilled_examiner?.staff_name || <span className="text-muted-foreground">—</span>}
														</TableCell>
													)}
													{hasProgrammer && (
														<TableCell className="text-xs py-2">
															{row.programmer_examiner?.staff_name || <span className="text-muted-foreground">—</span>}
														</TableCell>
													)}
													<TableCell className="text-xs py-2 text-center">
														{formatDuration(row.exam_duration)}
													</TableCell>
												</TableRow>
											)
										})}
									</Fragment>
								)
							})}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	)
}
