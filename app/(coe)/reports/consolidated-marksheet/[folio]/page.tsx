'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import { Loader2, FileText, GraduationCap, Download, Copy, ShieldCheck, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
	downloadConsolidatedMarksheetPDF,
	fetchImageAsBase64,
	type ConsolidatedStudentMarksheetData
} from '@/lib/utils/generate-consolidated-marksheet-pdf'
import QRCode from 'qrcode'
import { PDFProgressModal } from '@/components/ui/pdf-progress-modal'

interface MarksheetResp {
	eligible: boolean
	student: {
		id: string
		name: string
		registerNo: string
		dateOfBirth?: string
		photoUrl?: string
	}
	program: { code: string; name: string; isPG?: boolean }
	lastAppearance?: { sessionId?: string | null; sessionName?: string; monthYear?: string; month?: string; year?: string }
	courses: any[]
	partBreakdown: any[]
	summary: {
		totalCourses: number
		totalCredits: number
		creditsEarned: number
		totalCreditPoints: number
		cgpa: number
		overallResult: string
		classification: string
		formattedFolio?: string | null
	}
}

const PART_ORDER: Record<string, number> = {
	'Part I': 1, 'Part II': 2, 'Part III': 3, 'Part IV': 4, 'Part V': 5,
	'Part A': 6, 'Part B': 7
}

function partDisplayLabel(partName: string, isPG: boolean): string {
	if (isPG) {
		if (partName === 'Part A') return 'A'
		if (partName === 'Part B') return 'B'
		return '-'
	}
	return partName.replace('Part ', '')
}

export default function ConsolidatedMarksheetSharePage() {
	const params = useParams<{ folio: string }>()
	const folio = decodeURIComponent(params.folio || '')
	const { toast } = useToast()

	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [marksheet, setMarksheet] = useState<MarksheetResp | null>(null)
	const [resolved, setResolved] = useState<{ studentId: string; institutionId: string; programCode: string } | null>(null)
	const [generating, setGenerating] = useState(false)
	const [shareUrl, setShareUrl] = useState('')
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

	const [pdfProgress, setPdfProgress] = useState({
		isOpen: false,
		currentStep: 0,
		totalSteps: 0,
		currentOperation: '',
		operationType: 'single' as 'single' | 'batch'
	})

	useEffect(() => {
		if (typeof window !== 'undefined') {
			setShareUrl(window.location.href)
		}
	}, [])

	useEffect(() => {
		if (!shareUrl) return
		QRCode.toDataURL(shareUrl, { width: 240, margin: 1 })
			.then(setQrDataUrl)
			.catch(err => console.error('[QR] generation failed:', err))
	}, [shareUrl])

	useEffect(() => {
		if (!folio) return
		loadMarksheet()
	}, [folio])

	async function loadMarksheet() {
		try {
			setLoading(true)
			setError(null)

			const resolveRes = await fetch(`/api/reports/consolidated-marksheet?action=by-folio&folio=${encodeURIComponent(folio)}`)
			if (!resolveRes.ok) {
				const e = await resolveRes.json()
				setError(e?.error || 'Folio not found')
				return
			}
			const resolveData = await resolveRes.json()
			setResolved({
				studentId: resolveData.studentId,
				institutionId: resolveData.institutionId,
				programCode: resolveData.programCode
			})

			const url = `/api/reports/consolidated-marksheet?action=student-marksheet&studentId=${resolveData.studentId}&institutionId=${resolveData.institutionId}&programCode=${encodeURIComponent(resolveData.programCode)}`
			const res = await fetch(url)
			const data = await res.json()
			if (!res.ok) {
				setError(data?.error || 'Failed to load marksheet')
				return
			}
			setMarksheet(data)
		} catch (err) {
			console.error('[Consolidated Share] Load error:', err)
			setError('Failed to load consolidated marksheet')
		} finally {
			setLoading(false)
		}
	}

	const sortedCourses = marksheet
		? [...marksheet.courses].sort((a: any, b: any) => {
			if (a.semester !== b.semester) return a.semester - b.semester
			const pa = PART_ORDER[a.part] ?? 99
			const pb = PART_ORDER[b.part] ?? 99
			if (pa !== pb) return pa - pb
			return (a.courseOrder || 0) - (b.courseOrder || 0)
		})
		: []

	const activeParts = marksheet
		? marksheet.partBreakdown.filter((p: any) => p.courses?.length > 0)
		: []

	async function handleCopyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl)
			toast({
				title: '✅ Link Copied',
				description: 'Share link copied to clipboard',
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch {
			toast({ title: '❌ Copy failed', variant: 'destructive' })
		}
	}

	async function handleDownloadPDF(withHeader: boolean) {
		if (!marksheet) return
		try {
			setGenerating(true)

			setPdfProgress({
				isOpen: true,
				currentStep: 0,
				totalSteps: 4,
				currentOperation: 'Loading learner photo...',
				operationType: 'single'
			})

			let photoBase64: string | null = null
			if (marksheet.student.photoUrl) {
				photoBase64 = await fetchImageAsBase64(marksheet.student.photoUrl)
			}

			setPdfProgress(prev => ({ ...prev, currentStep: 1, currentOperation: 'Loading institution logo...' }))

			let logoBase64: string | undefined = undefined
			if (withHeader) {
				try {
					const logoResponse = await fetch('/jkkn_logo.png')
					if (logoResponse.ok) {
						const blob = await logoResponse.blob()
						logoBase64 = await new Promise<string>((resolve) => {
							const reader = new FileReader()
							reader.onloadend = () => resolve(reader.result as string)
							reader.readAsDataURL(blob)
						})
					}
				} catch (e) {
					console.warn('Logo not loaded:', e)
				}
			}

			setPdfProgress(prev => ({ ...prev, currentStep: 2, currentOperation: 'Generating QR code...' }))

			let pdfQrDataUrl: string | undefined = undefined
			if (shareUrl) {
				try {
					pdfQrDataUrl = await QRCode.toDataURL(shareUrl, { width: 240, margin: 1 })
				} catch (e) {
					console.warn('QR code generation failed:', e)
				}
			}

			setPdfProgress(prev => ({ ...prev, currentStep: 3, currentOperation: 'Generating PDF document...' }))

			const pdfData: ConsolidatedStudentMarksheetData = {
				student: { ...marksheet.student, photoUrl: photoBase64 || undefined },
				program: marksheet.program,
				lastAppearance: marksheet.lastAppearance,
				courses: marksheet.courses,
				partBreakdown: marksheet.partBreakdown,
				summary: marksheet.summary,
				logoImage: logoBase64,
				qrCode: pdfQrDataUrl,
				shareUrl,
				generatedDate: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
			} as any

			const suffix = withHeader ? '_with_header' : ''
			downloadConsolidatedMarksheetPDF(
				pdfData,
				`Consolidated_${marksheet.student.registerNo}${suffix}.pdf`,
				{ showHeader: withHeader }
			)

			setPdfProgress(prev => ({ ...prev, currentStep: 4, currentOperation: 'PDF generated successfully!' }))
			setTimeout(() => setPdfProgress(prev => ({ ...prev, isOpen: false })), 1500)

			toast({
				title: '✅ PDF Downloaded',
				description: 'Consolidated marksheet PDF has been downloaded',
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (err) {
			console.error('[Consolidated Share] PDF error:', err)
			setPdfProgress(prev => ({ ...prev, isOpen: false }))
			toast({ title: '❌ Error', description: 'Failed to generate PDF', variant: 'destructive' })
		} finally {
			setGenerating(false)
		}
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/dashboard">Dashboard</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/reports/semester-marksheet">Marksheets</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage className="font-mono">{folio}</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{loading ? (
						<Card>
							<CardContent className="flex items-center justify-center py-20">
								<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
								<span className="ml-2 text-muted-foreground">Loading consolidated marksheet...</span>
							</CardContent>
						</Card>
					) : error ? (
						<Card className="border-amber-300 bg-amber-50/50">
							<CardHeader>
								<div className="flex items-start gap-3">
									<div className="rounded-full bg-amber-100 p-2">
										<AlertTriangle className="h-5 w-5 text-amber-700" />
									</div>
									<div>
										<CardTitle className="text-lg text-amber-900">Marksheet Not Available</CardTitle>
										<CardDescription className="text-amber-800 mt-1">
											{error} {folio && <span className="font-mono">({folio})</span>}
										</CardDescription>
									</div>
								</div>
							</CardHeader>
						</Card>
					) : marksheet ? (
						<>
							{/* Share / Action Bar */}
							<Card>
								<CardContent className="pt-6">
									<div className="flex flex-wrap items-center justify-between gap-4">
										<div className="flex items-center gap-3">
											<div className="rounded-full bg-emerald-100 p-2">
												<ShieldCheck className="h-5 w-5 text-emerald-700" />
											</div>
											<div>
												<p className="text-sm text-muted-foreground">Verified Consolidated Marksheet</p>
												<p className="font-mono text-base font-semibold">{marksheet.summary.formattedFolio || folio}</p>
											</div>
										</div>
										<div className="flex flex-wrap gap-2">
											<Button variant="outline" onClick={handleCopyLink}>
												<Copy className="h-4 w-4 mr-2" /> Copy Share Link
											</Button>
											<Button
												onClick={() => handleDownloadPDF(false)}
												disabled={generating}
												className="bg-emerald-600 hover:bg-emerald-700 text-white"
											>
												{generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
												Download PDF
											</Button>
											<Button
												onClick={() => handleDownloadPDF(true)}
												disabled={generating}
												className="bg-blue-600 hover:bg-blue-700 text-white"
											>
												{generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
												Download (With Header)
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Marksheet Card */}
							<Card>
								<CardHeader className="pb-4">
									<div className="flex items-start justify-between flex-wrap gap-3">
										<div>
											<CardTitle className="text-xl flex items-center gap-2">
												<GraduationCap className="h-5 w-5" />
												{marksheet.student.registerNo}
											</CardTitle>
											<CardDescription className="text-base mt-1">{marksheet.student.name}</CardDescription>
											<p className="text-xs text-muted-foreground mt-1">
												{marksheet.program.code} — {marksheet.program.name}
											</p>
										</div>
										<div className="flex items-center gap-2 flex-wrap">
											<Badge variant="outline">{marksheet.summary.totalCourses} Courses</Badge>
											<Badge variant="outline">{marksheet.summary.totalCredits} Credits</Badge>
											<Badge className="bg-yellow-500 text-black">CGPA: {marksheet.summary.cgpa.toFixed(2)}</Badge>
											<Badge variant="outline" className="font-mono text-xs">
												{marksheet.summary.formattedFolio || folio}
											</Badge>
										</div>
									</div>
								</CardHeader>

								<CardContent className="space-y-6">
									{/* Flat Course Table */}
									<div className="rounded-md border overflow-hidden">
										<Table>
											<TableHeader>
												<TableRow className="bg-muted/50">
													<TableHead className="text-center w-[50px]">Sem</TableHead>
													<TableHead className="w-[60px]">Part</TableHead>
													<TableHead className="w-[100px]">Code</TableHead>
													<TableHead>Course Name</TableHead>
													<TableHead className="text-center w-[45px]">Cr</TableHead>
													<TableHead className="text-center w-[70px]">Total</TableHead>
													<TableHead className="text-center w-[60px]">Grade</TableHead>
													<TableHead className="text-center w-[45px]">GP</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{sortedCourses.map((course: any, idx: number) => (
													<TableRow key={idx}>
														<TableCell className="text-center font-medium">{course.semester}</TableCell>
														<TableCell className="text-xs text-muted-foreground">{course.part}</TableCell>
														<TableCell className="text-xs font-mono">{course.courseCode}</TableCell>
														<TableCell className="text-sm">{course.courseName}</TableCell>
														<TableCell className="text-center">{course.credits}</TableCell>
														<TableCell className="text-center text-sm">{course.totalMarks}/{course.totalMax}</TableCell>
														<TableCell className="text-center">
															<Badge variant="outline" className="text-xs">{course.letterGrade}</Badge>
														</TableCell>
														<TableCell className="text-center text-sm">{course.gradePoint.toFixed(1)}</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>

									{/* Part Summary + QR */}
									<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
										<div className="md:col-span-2">
											<h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
												Cumulative Performance
											</h3>
											<div className="rounded-md border overflow-hidden">
												<Table>
													<TableHeader>
														<TableRow className="bg-muted/50">
															<TableHead className="text-center font-semibold">PART</TableHead>
															<TableHead className="text-center font-semibold">CREDITS EARNED</TableHead>
															<TableHead className="text-center font-semibold">CGPA</TableHead>
															<TableHead className="text-center font-semibold">CLASSIFICATION</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{activeParts.map((part: any) => (
															<TableRow key={part.partName}>
																<TableCell className="text-center font-medium">
																	{partDisplayLabel(part.partName, !!marksheet.program.isPG)}
																</TableCell>
																<TableCell className="text-center">{part.creditsEarned}</TableCell>
																<TableCell className="text-center">{part.partCGPA.toFixed(2)}</TableCell>
																<TableCell className="text-center">
																	<Badge variant="outline" className="text-xs">{part.classification}</Badge>
																</TableCell>
															</TableRow>
														))}
														<TableRow className="bg-muted/30 font-semibold">
															<TableCell className="text-center font-bold">TOTAL</TableCell>
															<TableCell className="text-center font-bold">{marksheet.summary.creditsEarned}</TableCell>
															<TableCell className="text-center font-bold">{marksheet.summary.cgpa.toFixed(2)}</TableCell>
															<TableCell className="text-center">
																<Badge className="text-xs bg-blue-600 text-white">{marksheet.summary.classification}</Badge>
															</TableCell>
														</TableRow>
													</TableBody>
												</Table>
											</div>
										</div>

										{/* QR Code Panel */}
										<div className="flex flex-col items-center justify-start gap-2 p-4 border rounded-md bg-muted/30">
											<p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Scan to Verify</p>
											{qrDataUrl ? (
												// eslint-disable-next-line @next/next/no-img-element
												<img src={qrDataUrl} alt="Share link QR code" className="w-40 h-40" />
											) : (
												<div className="w-40 h-40 flex items-center justify-center">
													<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
												</div>
											)}
											<p className="text-xs text-muted-foreground text-center break-all px-2">
												{shareUrl}
											</p>
										</div>
									</div>

									{/* Footer Note */}
									<div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
										Passing Minimum is 40% of Maximum (UG) / 50% (PG). This consolidated marksheet covers every semester of the program.
									</div>
								</CardContent>
							</Card>
						</>
					) : null}
				</div>

				<AppFooter />
			</SidebarInset>

			<PDFProgressModal
				isOpen={pdfProgress.isOpen}
				currentStep={pdfProgress.currentStep}
				totalSteps={pdfProgress.totalSteps}
				currentOperation={pdfProgress.currentOperation}
				operationType={pdfProgress.operationType}
			/>
		</SidebarProvider>
	)
}
