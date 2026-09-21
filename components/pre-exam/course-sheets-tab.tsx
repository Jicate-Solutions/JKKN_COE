'use client'

import { useMemo, useState } from 'react'
import JSZip from 'jszip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/common/use-toast'
import { Loader2, Search, Download, Plus, Trash2, FileArchive, FileText, BookOpen, GraduationCap, Users, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
	generateCourseAssessmentSheetPDFBlob,
	getCourseAssessmentSheetFileName,
} from '@/lib/utils/generate-course-assessment-sheet-pdf'
import { DEFAULT_COURSE_SHEET_OPTIONS } from '@/types/course-assessment-sheet'
import type {
	CourseSheetApiResponse,
	CourseSheetComponent,
	CourseSheetData,
} from '@/types/course-assessment-sheet'

interface CourseSheetsTabProps {
	institutionId: string
	examinationSessionId: string
}

export function CourseSheetsTab({ institutionId, examinationSessionId }: CourseSheetsTabProps) {
	const { toast } = useToast()

	const [courseCode, setCourseCode] = useState('')
	const [sheetData, setSheetData] = useState<CourseSheetData | null>(null)
	const [loading, setLoading] = useState(false)

	// Programme selection - nothing ticked means every programme
	const [selectedPrograms, setSelectedPrograms] = useState<Set<string>>(new Set())
	const [programSearch, setProgramSearch] = useState('')

	// Sheet layout
	const [attendanceColumns, setAttendanceColumns] = useState(String(DEFAULT_COURSE_SHEET_OPTIONS.attendance_columns))
	const [components, setComponents] = useState<CourseSheetComponent[]>(DEFAULT_COURSE_SHEET_OPTIONS.components)
	const [signatories, setSignatories] = useState(DEFAULT_COURSE_SHEET_OPTIONS.signatories.join(', '))

	const [generating, setGenerating] = useState(false)
	const [progressText, setProgressText] = useState('')
	const [progressPercent, setProgressPercent] = useState(0)

	const canSearch = !!(institutionId && examinationSessionId && courseCode.trim())

	const handleFindPrograms = async () => {
		if (!canSearch) {
			toast({ title: '❌ Missing Selection', description: 'Select the exam session and enter a course code.', variant: 'destructive' })
			return
		}

		try {
			setLoading(true)
			setSheetData(null)
			setSelectedPrograms(new Set())
			setProgramSearch('')

			const params = new URLSearchParams({
				institution_id: institutionId,
				examination_session_id: examinationSessionId,
				course_code: courseCode.trim(),
			})
			const res = await fetch(`/api/pre-exam/exam-attendance-sheet/course-sheets?${params.toString()}`)
			const json: CourseSheetApiResponse = await res.json()

			if (!res.ok || !json.success || !json.data) {
				toast({ title: '❌ No Data', description: json.error || 'No registrations found for this course.', variant: 'destructive' })
				return
			}

			setSheetData(json.data)
		} catch (error: any) {
			console.error('Error fetching course sheets:', error)
			toast({ title: '❌ Fetch Failed', description: error.message || 'Failed to fetch programmes for this course.', variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}

	const filteredPrograms = useMemo(() => {
		const programs = sheetData?.programs || []
		const search = programSearch.trim().toLowerCase()
		if (!search) return programs
		return programs.filter(p =>
			p.program_code.toLowerCase().includes(search) ||
			p.class_label.toLowerCase().includes(search)
		)
	}, [sheetData, programSearch])

	const programsToDownload = useMemo(() => {
		const programs = sheetData?.programs || []
		return selectedPrograms.size === 0 ? programs : programs.filter(p => selectedPrograms.has(p.program_code))
	}, [sheetData, selectedPrograms])

	const totalMarks = components.reduce((sum, c) => sum + (Number(c.max_marks) || 0), 0)

	const updateComponent = (index: number, patch: Partial<CourseSheetComponent>) => {
		setComponents(prev => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
	}

	const handleDownload = async () => {
		if (!sheetData || programsToDownload.length === 0) return

		try {
			setGenerating(true)
			setProgressPercent(0)
			setProgressText('Loading logos...')
			await new Promise(r => setTimeout(r, 0))

			const pdfData: CourseSheetData = {
				...sheetData,
				logo_image: await fetchAsBase64(sheetData.logo_image || '/jkkn_logo.png'),
				right_logo_image: await fetchAsBase64(sheetData.right_logo_image || '/jkkncas_logo.png'),
			}

			const options = {
				attendance_columns: Number(attendanceColumns) || DEFAULT_COURSE_SHEET_OPTIONS.attendance_columns,
				components,
				signatories: signatories.split(',').map(s => s.trim()).filter(Boolean),
			}

			// One programme downloads as a plain PDF, several are bundled into one ZIP
			if (programsToDownload.length === 1) {
				const program = programsToDownload[0]
				setProgressPercent(50)
				setProgressText(`Generating ${program.program_code}...`)
				await new Promise(r => setTimeout(r, 0))

				const blob = generateCourseAssessmentSheetPDFBlob(pdfData, program, options)
				triggerDownload(blob, getCourseAssessmentSheetFileName(pdfData, program))
			} else {
				const zip = new JSZip()
				for (let i = 0; i < programsToDownload.length; i++) {
					const program = programsToDownload[i]
					setProgressPercent(Math.round((i / programsToDownload.length) * 90))
					setProgressText(`Generating ${program.program_code} (${i + 1}/${programsToDownload.length})...`)
					// Yield so the progress bar repaints between programmes
					await new Promise(r => setTimeout(r, 0))

					zip.file(
						getCourseAssessmentSheetFileName(pdfData, program),
						generateCourseAssessmentSheetPDFBlob(pdfData, program, options)
					)
				}

				setProgressPercent(95)
				setProgressText('Building ZIP...')
				const zipBlob = await zip.generateAsync({ type: 'blob' })
				triggerDownload(zipBlob, `${pdfData.course_code}_${pdfData.session_code}_Sheets.zip`)
			}

			setProgressPercent(100)
			toast({
				title: '✅ Download Ready',
				description: `${programsToDownload.length} programme sheet(s) for ${pdfData.course_code}.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error: any) {
			console.error('Error generating course sheets:', error)
			toast({ title: '❌ Generation Failed', description: error.message || 'Failed to generate the sheets.', variant: 'destructive' })
		} finally {
			setGenerating(false)
			setProgressPercent(0)
			setProgressText('')
		}
	}

	const allFilteredSelected = filteredPrograms.length > 0 && filteredPrograms.every(p => selectedPrograms.has(p.program_code))
	const totalLearners = (sheetData?.programs || []).reduce((sum, p) => sum + p.learners.length, 0)
	const downloadLearners = programsToDownload.reduce((sum, p) => sum + p.learners.length, 0)
	const isZip = programsToDownload.length > 1

	const toggleProgram = (programCode: string) => {
		const next = new Set(selectedPrograms)
		if (next.has(programCode)) next.delete(programCode)
		else next.add(programCode)
		setSelectedPrograms(next)
	}

	const resetLayout = () => {
		setAttendanceColumns(String(DEFAULT_COURSE_SHEET_OPTIONS.attendance_columns))
		setComponents(DEFAULT_COURSE_SHEET_OPTIONS.components)
		setSignatories(DEFAULT_COURSE_SHEET_OPTIONS.signatories.join(', '))
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Course code */}
			<Card className="overflow-hidden border-amber-200/70">
				<div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
				<CardContent className="pt-5">
					<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
						<div className="min-w-0">
							<h2 className="text-base font-semibold">Course-wise Attendance & Mark Entry Sheets</h2>
							<p className="text-xs sm:text-sm text-muted-foreground">
								Enter a course code to get one PDF per programme — attendance sheet first, mark entry sheet next.
							</p>
						</div>
						<div className="flex flex-col sm:flex-row gap-2 sm:items-end md:shrink-0">
							<div className="space-y-1.5 sm:w-64">
								<Label htmlFor="course-sheet-code" className="text-xs">Course Code</Label>
								<div className="relative">
									<BookOpen className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										id="course-sheet-code"
										placeholder="e.g. 24UHAWP01"
										value={courseCode}
										onChange={e => setCourseCode(e.target.value.toUpperCase())}
										onKeyDown={e => { if (e.key === 'Enter') handleFindPrograms() }}
										disabled={loading || generating}
										className="pl-8 font-mono tracking-wide"
									/>
								</div>
							</div>
							<Button
								onClick={handleFindPrograms}
								disabled={!canSearch || loading || generating}
								className="gap-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700"
							>
								{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
								Find Programmes
							</Button>
						</div>
					</div>
					{!examinationSessionId && (
						<p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
							Select an exam session first.
						</p>
					)}
				</CardContent>
			</Card>

			{/* Loading skeleton */}
			{loading && (
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
					{[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
				</div>
			)}

			{/* Empty state */}
			{!sheetData && !loading && (
				<div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
						<FileText className="h-6 w-6 text-amber-700" />
					</div>
					<p className="text-sm font-medium">No course loaded</p>
					<p className="max-w-sm text-xs text-muted-foreground">
						Programmes with learners registered for the course in this session will be listed here.
					</p>
				</div>
			)}

			{sheetData && (
				<>
					{/* Summary tiles */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
						<div className="flex items-center gap-3 rounded-xl border bg-card p-4 sm:col-span-1">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
								<BookOpen className="h-5 w-5 text-amber-700" />
							</div>
							<div className="min-w-0">
								<p className="truncate text-sm font-semibold" title={sheetData.course_title}>{sheetData.course_title}</p>
								<p className="font-mono text-xs text-muted-foreground">{sheetData.course_code}</p>
							</div>
						</div>
						<div className="flex items-center gap-3 rounded-xl border bg-card p-4">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
								<GraduationCap className="h-5 w-5 text-indigo-700" />
							</div>
							<div>
								<p className="text-xl font-bold leading-none">{sheetData.programs.length}</p>
								<p className="mt-1 text-xs text-muted-foreground">Programmes</p>
							</div>
						</div>
						<div className="flex items-center gap-3 rounded-xl border bg-card p-4">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
								<Users className="h-5 w-5 text-emerald-700" />
							</div>
							<div>
								<p className="text-xl font-bold leading-none">{totalLearners}</p>
								<p className="mt-1 text-xs text-muted-foreground">Learners</p>
							</div>
						</div>
					</div>

					{/* Programme selection */}
					<Card>
						<CardHeader className="pb-3">
							<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
								<div>
									<CardTitle className="text-base">Programmes</CardTitle>
									<p className="mt-0.5 text-xs text-muted-foreground">
										Optional — leave everything unticked to download every programme.
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<div className="relative">
										<Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
										<Input
											placeholder="Search programmes..."
											value={programSearch}
											onChange={e => setProgramSearch(e.target.value)}
											className="h-8 w-52 pl-8 text-xs"
										/>
									</div>
									<Button
										variant="outline"
										size="sm"
										className="h-8 text-xs"
										disabled={filteredPrograms.length === 0}
										onClick={() => {
											const next = new Set(selectedPrograms)
											for (const p of filteredPrograms) {
												if (allFilteredSelected) next.delete(p.program_code)
												else next.add(p.program_code)
											}
											setSelectedPrograms(next)
										}}
									>
										{allFilteredSelected ? 'Unselect All' : 'Select All'}
									</Button>
									{selectedPrograms.size > 0 && (
										<Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setSelectedPrograms(new Set())}>
											Clear ({selectedPrograms.size})
										</Button>
									)}
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[22rem] overflow-y-auto pr-1">
								{filteredPrograms.map(p => {
									const checked = selectedPrograms.has(p.program_code)
									return (
										<div
											key={p.program_code}
											role="checkbox"
											aria-checked={checked}
											tabIndex={0}
											onClick={() => toggleProgram(p.program_code)}
											onKeyDown={e => {
												if (e.key === ' ' || e.key === 'Enter') {
													e.preventDefault()
													toggleProgram(p.program_code)
												}
											}}
											className={cn(
												'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
												checked ? 'border-amber-400 bg-amber-50' : 'hover:bg-muted/50'
											)}
										>
											<Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" />
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-medium" title={p.class_label}>{p.class_label}</p>
												<p className="font-mono text-[11px] text-muted-foreground">{p.program_code}</p>
											</div>
											<Badge variant="secondary" className="shrink-0 gap-1 font-normal">
												<Users className="h-3 w-3" /> {p.learners.length}
											</Badge>
										</div>
									)
								})}
							</div>
							{filteredPrograms.length === 0 && (
								<p className="py-6 text-center text-xs text-muted-foreground">No programmes match search</p>
							)}
						</CardContent>
					</Card>

					{/* Sheet layout */}
					<Card>
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between gap-2">
								<div>
									<CardTitle className="text-base">Sheet Layout</CardTitle>
									<p className="mt-0.5 text-xs text-muted-foreground">Applies to every programme PDF in this download.</p>
								</div>
								<Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={resetLayout}>
									<RotateCcw className="h-3.5 w-3.5" /> Reset
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
								{/* Page 1 */}
								<div className="space-y-4 rounded-lg border bg-muted/30 p-4">
									<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance Sheet</p>
									<div className="space-y-1.5">
										<Label htmlFor="course-sheet-columns" className="text-xs">Attendance Columns</Label>
										<Input
											id="course-sheet-columns"
											type="number"
											min={1}
											max={20}
											value={attendanceColumns}
											onChange={e => setAttendanceColumns(e.target.value)}
											className="w-28 bg-background"
										/>
										<p className="text-[11px] text-muted-foreground">Blank date columns, 1 to 20.</p>
									</div>
									<div className="space-y-1.5">
										<Label htmlFor="course-sheet-signatories" className="text-xs">Signatories on the mark entry sheet</Label>
										<Input
											id="course-sheet-signatories"
											value={signatories}
											onChange={e => setSignatories(e.target.value)}
											className="bg-background"
										/>
										<p className="text-[11px] text-muted-foreground">Comma separated, printed left to right.</p>
									</div>
								</div>

								{/* Page 2 */}
								<div className="space-y-3 rounded-lg border bg-muted/30 p-4">
									<div className="flex items-center justify-between">
										<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mark Entry Sheet</p>
										<Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Total: {totalMarks} marks</Badge>
									</div>
									<div className="space-y-2">
										{components.map((c, i) => (
											<div key={i} className="flex items-center gap-2">
												<Input
													placeholder="Component"
													value={c.label}
													onChange={e => updateComponent(i, { label: e.target.value })}
													className="flex-1 bg-background"
												/>
												<Input
													type="number"
													min={0}
													placeholder="Marks"
													value={c.max_marks}
													onChange={e => updateComponent(i, { max_marks: Number(e.target.value) })}
													className="w-20 bg-background"
												/>
												<Button
													variant="ghost"
													size="icon"
													className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
													onClick={() => setComponents(prev => prev.filter((_, idx) => idx !== i))}
													disabled={components.length <= 1}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										))}
									</div>
									<Button
										variant="outline"
										size="sm"
										className="gap-1.5 bg-background"
										onClick={() => setComponents(prev => [...prev, { label: '', max_marks: 0 }])}
										disabled={components.length >= 6}
									>
										<Plus className="h-3.5 w-3.5" /> Add Component
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Download bar */}
					<div className="sticky bottom-2 z-10 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex items-center gap-3">
								<div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', isZip ? 'bg-orange-100' : 'bg-indigo-100')}>
									{isZip ? <FileArchive className="h-4 w-4 text-orange-700" /> : <FileText className="h-4 w-4 text-indigo-700" />}
								</div>
								<div className="text-sm">
									<p className="font-medium">
										{selectedPrograms.size === 0 ? 'All' : programsToDownload.length} of {sheetData.programs.length} programmes · {downloadLearners} learners
									</p>
									<p className="text-xs text-muted-foreground">
										{isZip ? `ZIP with ${programsToDownload.length} PDFs, one per programme` : 'Single PDF — attendance sheet + mark entry sheet'}
									</p>
								</div>
							</div>
							<Button
								onClick={handleDownload}
								disabled={generating || programsToDownload.length === 0}
								className="gap-2 w-full sm:w-auto bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700"
								size="lg"
							>
								{generating ? (
									<><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
								) : (
									<><Download className="h-4 w-4" /> {isZip ? 'Download ZIP' : 'Download PDF'}</>
								)}
							</Button>
						</div>

						{generating && (
							<div className="mt-3 space-y-1.5">
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>{progressText}</span>
									<span>{progressPercent}%</span>
								</div>
								<div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
									<div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
								</div>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	)
}

async function fetchAsBase64(url: string): Promise<string | null> {
	try {
		const res = await fetch(url)
		if (!res.ok) return null
		const blob = await res.blob()
		return await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result as string)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	} catch {
		return null
	}
}

function triggerDownload(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = fileName
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}
