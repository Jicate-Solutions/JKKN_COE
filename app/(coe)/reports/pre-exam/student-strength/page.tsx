'use client'

import React, { useState, useEffect } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb, BreadcrumbItem, BreadcrumbLink,
	BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
	Command, CommandEmpty, CommandGroup,
	CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import { Loader2, FileText, Check, ChevronsUpDown, Download, Users, BarChart3, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import type { StudentStrengthReport, YearCount } from '@/types/student-strength-report'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

interface ExamSession {
	id: string
	session_code: string
	session_name: string
}

function fmtCount(n: number, dash = true): string {
	return dash && n === 0 ? '-' : String(n)
}

// ── On-screen table helpers ───────────────────────────────────────────────────
function YearCells({
	yc, bold, hasAided,
}: {
	yc: YearCount; bold?: boolean; hasAided: boolean
}) {
	const cls = bold ? 'font-bold' : ''
	return (
		<>
			{hasAided && (
				<TableCell className={`text-center ${cls}`}>{fmtCount(yc.aided)}</TableCell>
			)}
			<TableCell className={`text-center ${cls}`}>{fmtCount(yc.sf)}</TableCell>
			<TableCell className={`text-center ${cls}`}>{fmtCount(yc.total, false)}</TableCell>
		</>
	)
}

export default function StudentStrengthPage() {
	const { toast } = useToast()
	const { isReady, appendToUrl, institutionId } = useInstitutionFilter()

	const [sessions, setSessions] = useState<ExamSession[]>([])
	const [sessionOpen, setSessionOpen] = useState(false)
	const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null)

	const [loading, setLoading] = useState(false)
	const [report, setReport] = useState<StudentStrengthReport | null>(null)
	const [logoImage, setLogoImage] = useState<string | undefined>()
	const [rightLogoImage, setRightLogoImage] = useState<string | undefined>()

	// Pre-load logos for PDF
	useEffect(() => {
		async function loadLogos() {
			try {
				const toBase64 = (blob: Blob): Promise<string> =>
					new Promise((res, rej) => {
						const reader = new FileReader()
						reader.onload = () => res(reader.result as string)
						reader.onerror = rej
						reader.readAsDataURL(blob)
					})
				const [l, r] = await Promise.allSettled([
					fetch('/jkkn_logo.png').then(r => r.blob()).then(toBase64),
					fetch('/jkkncas_logo.png').then(r => r.blob()).then(toBase64),
				])
				if (l.status === 'fulfilled') setLogoImage(l.value)
				if (r.status === 'fulfilled') setRightLogoImage(r.value)
			} catch { /* logos are optional */ }
		}
		loadLogos()
	}, [])

	// ── Fetch exam sessions on mount ───────────────────────────────────────
	useEffect(() => {
		if (!isReady) return
		const url = appendToUrl('/api/exam-management/examination-sessions')
		fetch(url)
			.then(r => r.json())
			.then((data) => {
				const rows: ExamSession[] = (Array.isArray(data) ? data : data?.data || []).map(
					(s: Record<string, string>) => ({
						id: s.id,
						session_code: s.session_code,
						session_name: s.session_name || s.session_code,
					})
				)
				setSessions(rows)
			})
			.catch(() => toast({ title: '❌ Failed', description: 'Could not load sessions', variant: 'destructive' }))
	}, [isReady])

	// ── Generate report ────────────────────────────────────────────────────
	async function handleGenerate(refresh = false) {
		if (!institutionId || !selectedSession) {
			toast({ title: '❌ Missing filters', description: 'Select institution and exam session', variant: 'destructive' })
			return
		}
		setLoading(true)
		setReport(null)
		try {
			let url = `/api/reports/student-strength?institutions_id=${institutionId}&examination_session_id=${selectedSession.id}`
			if (refresh) url += '&refresh=true'
			const res = await fetch(url)
			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.error || 'Failed to generate report')
			}
			const data: StudentStrengthReport = await res.json()
			setReport(data)
			const desc = refresh
				? `Fresh data fetched — ${data.ug_rows.length + data.pg_rows.length} programmes`
				: `${data.ug_rows.length + data.pg_rows.length} programmes found`
			toast({ title: '✅ Report Generated', description: desc, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : 'Unknown error'
			toast({ title: '❌ Failed', description: msg, variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}

	// ── PDF download ───────────────────────────────────────────────────────
	async function handlePDF() {
		if (!report) return
		try {
			const { generateStudentStrengthPDF } = await import('@/lib/utils/generate-student-strength-pdf')
			const blob = generateStudentStrengthPDF(report, logoImage, rightLogoImage)
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `student-strength-${report.exam_session_name.replace(/\s+/g, '-')}.pdf`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)
		} catch (err) {
			console.error('PDF generation error:', err)
			toast({ title: '❌ PDF Error', description: 'Could not generate PDF', variant: 'destructive' })
		}
	}

	// ── Excel download ─────────────────────────────────────────────────────
	async function handleExcel() {
		if (!report) return
		try {
			const XLSX = await import('xlsx')

			const { has_aided, max_year, ug_rows, pg_rows, ug_subtotal, pg_subtotal, grand_total } = report

			const wsData: (string | number)[][] = []

			// Header rows
			const h1 = ['S.NO', 'PROGRAMME NAME']
			const h2 = ['', '']
			for (let y = 1; y <= max_year; y++) {
				h1.push(`${ROMAN[y]} YEAR`, '', has_aided ? '' : '')
				if (has_aided) {
					h2.push('AIDED', 'SF', 'TOTAL')
				} else {
					h2.push('SF', 'TOTAL')
				}
			}
			wsData.push(h1, h2)

			function pushRow(
				sno: string | number,
				name: string,
				year_counts: Record<number, YearCount>
			) {
				const row: (string | number)[] = [sno, name]
				for (let y = 1; y <= max_year; y++) {
					const yc = year_counts[y] || { aided: 0, sf: 0, total: 0 }
					if (has_aided) row.push(yc.aided, yc.sf, yc.total)
					else row.push(yc.sf, yc.total)
				}
				wsData.push(row)
			}

			wsData.push(['UNDERGRADUATE PROGRAMMES'])
			ug_rows.forEach(r => pushRow(r.s_no, r.program_name, r.year_counts))
			pushRow('', '', ug_subtotal.year_counts)

			wsData.push(['POSTGRADUATE PROGRAMMES'])
			pg_rows.forEach(r => pushRow(r.s_no, r.program_name, r.year_counts))
			pushRow('', '', pg_subtotal.year_counts)

			pushRow('', 'TOTAL UG STUDENTS', ug_subtotal.year_counts)
			pushRow('', 'TOTAL PG STUDENTS', pg_subtotal.year_counts)
			pushRow('', 'GRAND TOTAL', grand_total.year_counts)

			const ws = XLSX.utils.aoa_to_sheet(wsData)
			const wb = XLSX.utils.book_new()
			XLSX.utils.book_append_sheet(wb, ws, 'Student Strength')
			XLSX.writeFile(wb, `student-strength-${report.exam_session_name.replace(/\s+/g, '-')}.xlsx`)
		} catch {
			toast({ title: '❌ Excel Error', description: 'Could not generate Excel file', variant: 'destructive' })
		}
	}

	// ── Render table section (UG or PG) ───────────────────────────────────
	function renderSection(
		label: string,
		rows: typeof report extends null ? [] : StudentStrengthReport['ug_rows'],
		sub: StudentStrengthReport['ug_subtotal'] | null,
		maxYear: number,
		hasAided: boolean
	) {
		return (
			<>
				<TableRow className='bg-slate-100'>
					<TableCell
						colSpan={2 + maxYear * (hasAided ? 3 : 2)}
						className='font-bold text-sm py-1.5'
					>
						{label}
					</TableCell>
				</TableRow>
				{rows.map(row => (
					<TableRow key={row.program_code} className='hover:bg-slate-50'>
						<TableCell className='text-center text-xs w-10'>{row.s_no}</TableCell>
						<TableCell className='text-xs'>{row.program_name}</TableCell>
						{Array.from({ length: maxYear }, (_, i) => i + 1).map(y => (
							<YearCells key={y} yc={row.year_counts[y] || { aided: 0, sf: 0, total: 0 }} hasAided={hasAided} />
						))}
					</TableRow>
				))}
				{sub && (
					<TableRow className='bg-slate-50 border-t-2 border-slate-300'>
						<TableCell className='text-center text-xs w-10' />
						<TableCell className='text-xs' />
						{Array.from({ length: maxYear }, (_, i) => i + 1).map(y => (
							<YearCells key={y} yc={sub.year_counts[y] || { aided: 0, sf: 0, total: 0 }} bold hasAided={hasAided} />
						))}
					</TableRow>
				)}
			</>
		)
	}

	const maxYear = report?.max_year || 1
	const hasAided = report?.has_aided || false

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<main className='flex flex-col gap-4 p-4'>
					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink href='/dashboard'>Home</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink href='#'>Pre-Exam Reports</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Student Strength</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Filter card */}
					<Card>
						<CardHeader>
							<CardTitle className='flex items-center gap-2'>
								<Users className='h-5 w-5 text-primary' />
								Student Strength Report
							</CardTitle>
							<CardDescription>
								Pre-exam enrollment by programme, academic year, and funding type (AIDED / SF)
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className='flex flex-wrap items-end gap-4'>
								{/* Exam Session */}
								<div className='flex flex-col gap-1.5'>
									<Label>Exam Session</Label>
									<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
										<PopoverTrigger asChild>
											<Button
												variant='outline'
												role='combobox'
												aria-expanded={sessionOpen}
												className='w-72 justify-between'
											>
												{selectedSession
													? selectedSession.session_name
													: 'Select session...'}
												<ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
											</Button>
										</PopoverTrigger>
										<PopoverContent className='w-72 p-0' align='start'>
											<Command>
												<CommandInput placeholder='Search sessions...' />
												<CommandList>
													<CommandEmpty>No sessions found.</CommandEmpty>
													<CommandGroup>
														{sessions.map(s => (
															<CommandItem
																key={s.id}
																value={s.session_name}
																onSelect={() => {
																	setSelectedSession(s)
																	setSessionOpen(false)
																}}
															>
																<Check
																	className={cn(
																		'mr-2 h-4 w-4',
																		selectedSession?.id === s.id ? 'opacity-100' : 'opacity-0'
																	)}
																/>
																{s.session_name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Generate */}
								<Button onClick={() => handleGenerate(false)} disabled={loading || !selectedSession}>
									{loading ? (
										<><Loader2 className='mr-2 h-4 w-4 animate-spin' /> Generating...</>
									) : (
										<><BarChart3 className='mr-2 h-4 w-4' /> Generate</>
									)}
								</Button>

								{/* Refresh — busts server cache and re-fetches live from MyJKKN */}
								<Button
									variant='outline'
									onClick={() => handleGenerate(true)}
									disabled={loading || !selectedSession}
									title='Fetch fresh data from MyJKKN (bypasses 1-hour cache)'
								>
									<RefreshCw className='mr-2 h-4 w-4' /> Refresh Data
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* Report table */}
					{report && (
						<Card>
							<CardHeader className='flex flex-row items-center justify-between'>
								<div>
									<CardTitle>
										{report.institution_name} — {report.exam_session_name}
									</CardTitle>
									<CardDescription>
										{report.ug_rows.length} UG programmes · {report.pg_rows.length} PG programmes ·
										Generated {new Date(report.generated_at).toLocaleString('en-IN')}
									</CardDescription>
								</div>
								<div className='flex gap-2'>
									<Button variant='outline' size='sm' onClick={handlePDF}>
										<FileText className='mr-2 h-4 w-4' /> PDF
									</Button>
									<Button variant='outline' size='sm' onClick={handleExcel}>
										<Download className='mr-2 h-4 w-4' /> Excel
									</Button>
								</div>
							</CardHeader>
							<CardContent className='overflow-x-auto'>
								<Table className='text-xs border border-slate-200'>
									<TableHeader>
										{/* Row 1: S.NO | PROGRAMME NAME | I YEAR (span) | II YEAR (span) ... */}
										<TableRow className='bg-blue-700 text-white'>
											<TableHead
												rowSpan={2}
												className='text-center text-white border border-slate-300 w-10'
											>
												S.NO
											</TableHead>
											<TableHead
												rowSpan={2}
												className='text-white border border-slate-300 min-w-48'
											>
												PROGRAMME NAME
											</TableHead>
											{Array.from({ length: maxYear }, (_, i) => i + 1).map(y => (
												<TableHead
													key={y}
													colSpan={hasAided ? 3 : 2}
													className='text-center text-white border border-slate-300'
												>
													{ROMAN[y]} YEAR
												</TableHead>
											))}
										</TableRow>
										{/* Row 2: AIDED | SF | TOTAL per year */}
										<TableRow className='bg-blue-600 text-white'>
											{Array.from({ length: maxYear }, (_, i) => i + 1).map(y => (
												<React.Fragment key={y}>
													{hasAided && (
														<TableHead key={`${y}-aided`} className='text-center text-white border border-slate-300'>
															AIDED
														</TableHead>
													)}
													<TableHead key={`${y}-sf`} className='text-center text-white border border-slate-300'>
														SF
													</TableHead>
													<TableHead key={`${y}-total`} className='text-center text-white border border-slate-300'>
														TOTAL
													</TableHead>
												</React.Fragment>
											))}
										</TableRow>
									</TableHeader>
									<TableBody>
										{renderSection('UNDERGRADUATE PROGRAMMES', report.ug_rows, report.ug_subtotal, maxYear, hasAided)}
										{renderSection('POSTGRADUATE PROGRAMMES', report.pg_rows, report.pg_subtotal, maxYear, hasAided)}

										{/* Summary rows */}
										{[
											{ label: 'TOTAL UG STUDENTS', sub: report.ug_subtotal },
											{ label: 'TOTAL PG STUDENTS', sub: report.pg_subtotal },
											{ label: 'GRAND TOTAL', sub: report.grand_total },
										].map(({ label, sub }) => (
											<TableRow key={label} className='bg-slate-200 font-bold border-t-2 border-slate-400'>
												<TableCell className='text-center text-xs' />
												<TableCell className='text-xs font-bold'>{label}</TableCell>
												{Array.from({ length: maxYear }, (_, i) => i + 1).map(y => (
													<YearCells
														key={y}
														yc={sub.year_counts[y] || { aided: 0, sf: 0, total: 0 }}
														bold
														hasAided={hasAided}
													/>
												))}
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					)}
				</main>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
