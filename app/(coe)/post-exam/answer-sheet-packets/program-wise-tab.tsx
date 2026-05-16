'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useExaminationSession } from '@/context/examination-session-context'
import { GraduationCap, ChevronsUpDown, RefreshCw, Sparkles, CheckCircle, XCircle } from 'lucide-react'
import type { Institution, ExaminationSession, Course } from '@/types/answer-sheet-packets'

interface Board {
	id: string
	board_code: string
	board_name: string
	board_type?: string
	board_order?: number
}

interface PacketRow {
	institution_code?: string
	session_code?: string
	course_code?: string
}

interface ProgramBreakdown {
	program_code: string
	students: number
	packets: number
}

export default function ProgramWiseTab() {
	const { toast } = useToast()
	const {
		isReady,
		appendToUrl,
		institutionCode,
		mustSelectInstitution,
	} = useInstitutionFilter()

	let globalSession: { id: string; session_code: string } | null = null
	try {
		const ctx = useExaminationSession()
		globalSession = ctx.currentSession as any
	} catch {}
	const mustSelectSession = !globalSession

	// Selection state
	const [genInstitution, setGenInstitution] = useState('')
	const [genSession, setGenSession] = useState('')
	const [genBoard, setGenBoard] = useState('')
	const [genCourses, setGenCourses] = useState<string[]>([])
	const [coursePopoverOpen, setCoursePopoverOpen] = useState(false)

	// Data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [boards, setBoards] = useState<Board[]>([])
	const [courses, setCourses] = useState<Course[]>([])
	const [allPackets, setAllPackets] = useState<PacketRow[]>([])

	// Loading
	const [generating, setGenerating] = useState(false)

	// Search
	const [institutionSearch, setInstitutionSearch] = useState('')
	const [sessionSearch, setSessionSearch] = useState('')
	const [boardSearch, setBoardSearch] = useState('')
	const [courseSearch, setCourseSearch] = useState('')

	// Generation result
	const [generationResult, setGenerationResult] = useState<{
		success: boolean
		message: string
		total_packets: number
		total_students: number
		courses_processed: number
		details: Array<{
			course_code: string
			packets: number
			students: number
			error?: string
			program_breakdown?: ProgramBreakdown[]
		}>
	} | null>(null)

	const effectiveInstitutionCode = mustSelectInstitution ? genInstitution : institutionCode

	// Auto-sync global session
	useEffect(() => {
		if (globalSession?.session_code) {
			setGenSession(globalSession.session_code)
		}
	}, [globalSession?.session_code])

	// Initial data load
	useEffect(() => {
		if (!isReady) return
		if (mustSelectInstitution) fetchInstitutions()
		fetchSessions()
		fetchBoards()
		fetchCourses()
		fetchAllPackets()
		setGenInstitution('')
		setGenSession('')
		setGenBoard('')
		setGenCourses([])
	}, [isReady])

	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/master/institutions')
			if (res.ok) setInstitutions(await res.json())
		} catch (e) {
			console.error('Error fetching institutions:', e)
		}
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch(appendToUrl('/api/exam-management/examination-sessions'))
			if (res.ok) setSessions(await res.json())
		} catch (e) {
			console.error('Error fetching sessions:', e)
		}
	}

	const fetchBoards = async () => {
		try {
			const res = await fetch(appendToUrl('/api/master/boards'))
			if (res.ok) setBoards(await res.json())
		} catch (e) {
			console.error('Error fetching boards:', e)
		}
	}

	const fetchCourses = async () => {
		try {
			const res = await fetch(appendToUrl('/api/master/courses'))
			if (res.ok) setCourses(await res.json())
		} catch (e) {
			console.error('Error fetching courses:', e)
		}
	}

	const fetchAllPackets = async () => {
		try {
			const res = await fetch(appendToUrl('/api/post-exam/answer-sheet-packets'))
			if (res.ok) setAllPackets(await res.json())
		} catch (e) {
			console.error('Error fetching packets:', e)
		}
	}

	// Filtered dropdowns
	const filteredInstitutions = useMemo(() => {
		if (!institutionSearch) return institutions
		const q = institutionSearch.toLowerCase()
		return institutions.filter(i =>
			i.institution_code.toLowerCase().includes(q) ||
			i.name?.toLowerCase().includes(q),
		)
	}, [institutions, institutionSearch])

	const filteredSessions = useMemo(() => {
		let list = sessions
		if (mustSelectInstitution && genInstitution) {
			const inst = institutions.find(i => i.institution_code === genInstitution)
			if (inst) list = list.filter(s => (s as any).institutions_id === inst.id)
		}
		if (!sessionSearch) return list
		const q = sessionSearch.toLowerCase()
		return list.filter(s =>
			s.session_code.toLowerCase().includes(q) ||
			s.session_name?.toLowerCase().includes(q),
		)
	}, [sessions, sessionSearch, mustSelectInstitution, genInstitution, institutions])

	const filteredBoards = useMemo(() => {
		const sorted = [...boards].sort((a, b) => (a.board_order ?? 999) - (b.board_order ?? 999))
		if (!boardSearch) return sorted
		const q = boardSearch.toLowerCase()
		return sorted.filter(b =>
			b.board_code.toLowerCase().includes(q) ||
			b.board_name?.toLowerCase().includes(q),
		)
	}, [boards, boardSearch])

	// Courses: theory only, filtered by board, exclude already-packeted (same as the main tab)
	const filteredCourses = useMemo(() => {
		let list = courses.filter(c => {
			if (c.course_category !== 'Theory') return false
			if (genBoard && genBoard !== 'all' && (c as any).board_code !== genBoard) return false
			return true
		})

		if (effectiveInstitutionCode && genSession) {
			const generated = new Set(
				allPackets
					.filter(p => p.institution_code === effectiveInstitutionCode && p.session_code === genSession)
					.map(p => p.course_code)
					.filter(Boolean) as string[],
			)
			list = list.filter(c => !generated.has(c.course_code))
		}

		list.sort((a, b) => a.course_code.localeCompare(b.course_code))

		if (!courseSearch) return list
		const q = courseSearch.toLowerCase()
		return list.filter(c =>
			c.course_code.toLowerCase().includes(q) ||
			c.course_title?.toLowerCase().includes(q),
		)
	}, [courses, courseSearch, effectiveInstitutionCode, genSession, genBoard, allPackets])

	const handleGenerate = async () => {
		if (!effectiveInstitutionCode || !genSession) {
			toast({
				title: '⚠️ Validation Error',
				description: !effectiveInstitutionCode ? 'Please select an institution.' : 'Please select an examination session.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
			return
		}
		if (genCourses.length === 0) {
			toast({
				title: '⚠️ Validation Error',
				description: 'Please select at least one course.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
			return
		}

		try {
			setGenerating(true)

			const responses = await Promise.all(
				genCourses.map(async (courseCode) => {
					const res = await fetch('/api/post-exam/answer-sheet-packets/generate-packets-program-wise', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							institution_code: effectiveInstitutionCode,
							exam_session: genSession,
							course_code: courseCode,
						}),
					})
					if (res.ok) return { ok: true, courseCode, data: await res.json() }
					let errMsg = `Request failed with status ${res.status}`
					try {
						const errData = await res.json()
						if (errData?.error) errMsg = errData.error
					} catch {}
					return { ok: false, courseCode, error: errMsg }
				}),
			)

			const results: any[] = []
			const failures: Array<{ course_code: string; error: string }> = []
			for (const r of responses) {
				if (r.ok) results.push(r.data)
				else failures.push({ course_code: r.courseCode, error: r.error! })
			}

			const totalPackets = results.reduce((s, r) => s + (r.total_packets_created || 0), 0)
			const totalStudents = results.reduce((s, r) => s + (r.total_students_assigned || 0), 0)
			const allFailed = results.length === 0 && failures.length > 0

			setGenerationResult({
				success: !allFailed,
				message: allFailed
					? `Failed to generate packets — ${failures[0].error}`
					: failures.length > 0
						? `Generated ${totalPackets} packet(s) for ${results.length} course(s) — ${failures.length} failed`
						: `Successfully generated ${totalPackets} packet(s) for ${results.length} course(s)`,
				total_packets: totalPackets,
				total_students: totalStudents,
				courses_processed: results.length,
				details: [
					...results.flatMap(r => (r.course_results || []).map((cr: any) => ({
						course_code: cr.course_code,
						packets: cr.packets_created || 0,
						students: cr.students_assigned || 0,
						program_breakdown: cr.program_breakdown,
					}))),
					...failures.map(f => ({ course_code: f.course_code, packets: 0, students: 0, error: f.error })),
				],
			})

			await fetchAllPackets()
			setGenCourses([])
			setCoursePopoverOpen(false)
		} catch (e) {
			toast({
				title: '❌ Packet Generation Failed',
				description: e instanceof Error ? e.message : 'Unexpected error. Please try again.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		} finally {
			setGenerating(false)
		}
	}

	return (
		<div className="space-y-6">
			<Card className="border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/10">
				<CardHeader>
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
							<GraduationCap className="h-5 w-5 text-white" />
						</div>
						<div>
							<h2 className="text-lg font-heading font-semibold text-gray-900 dark:text-white">
								Generate Packets (Program-grouped)
							</h2>
							<p className="text-sm text-muted-foreground">
								Same flow as Packets tab — but each packet contains students from a single program only (UG: 25 sheets, PG: 20 sheets)
							</p>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div className={`grid grid-cols-1 gap-4 ${mustSelectInstitution ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
						{mustSelectInstitution && (
							<div>
								<Label htmlFor="pw-institution">Institution <span className="text-red-500">*</span></Label>
								<Select
									value={genInstitution}
									onValueChange={(v) => {
										setGenInstitution(v)
										setGenSession('')
										setGenBoard('')
										setGenCourses([])
									}}
									onOpenChange={(open) => !open && setInstitutionSearch('')}
								>
									<SelectTrigger id="pw-institution">
										<SelectValue placeholder="Select institution" />
									</SelectTrigger>
									<SelectContent>
										<div className="p-2 border-b sticky top-0 bg-popover z-10">
											<Input
												placeholder="Search institutions..."
												value={institutionSearch}
												onChange={(e) => setInstitutionSearch(e.target.value)}
												className="h-8"
												onClick={(e) => e.stopPropagation()}
											/>
										</div>
										{filteredInstitutions.length === 0 ? (
											<div className="p-2 text-sm text-muted-foreground text-center">No institutions found</div>
										) : (
											filteredInstitutions.map((inst) => (
												<SelectItem key={inst.id} value={inst.institution_code}>
													{inst.institution_code} - {inst.name}
												</SelectItem>
											))
										)}
									</SelectContent>
								</Select>
							</div>
						)}

						{mustSelectSession && (
							<div>
								<Label htmlFor="pw-session">Exam Session <span className="text-red-500">*</span></Label>
								<Select
									value={genSession}
									onValueChange={(v) => {
										setGenSession(v)
										setGenBoard('')
										setGenCourses([])
									}}
									onOpenChange={(open) => !open && setSessionSearch('')}
									disabled={mustSelectInstitution && !genInstitution}
								>
									<SelectTrigger id="pw-session">
										<SelectValue placeholder={mustSelectInstitution && !genInstitution ? 'Select institution first' : 'Select session'} />
									</SelectTrigger>
									<SelectContent>
										<div className="p-2 border-b sticky top-0 bg-popover z-10">
											<Input
												placeholder="Search sessions..."
												value={sessionSearch}
												onChange={(e) => setSessionSearch(e.target.value)}
												className="h-8"
												onClick={(e) => e.stopPropagation()}
											/>
										</div>
										{filteredSessions.length === 0 ? (
											<div className="p-2 text-sm text-muted-foreground text-center">No sessions found</div>
										) : (
											filteredSessions.map((sess) => (
												<SelectItem key={sess.id} value={sess.session_code}>
													{sess.session_name && sess.session_name !== sess.session_code ? `${sess.session_code} - ${sess.session_name}` : sess.session_code}
												</SelectItem>
											))
										)}
									</SelectContent>
								</Select>
							</div>
						)}

						<div>
							<Label htmlFor="pw-board">Board</Label>
							<Select
								value={genBoard}
								onValueChange={(v) => {
									setGenBoard(v)
									setGenCourses([])
								}}
								onOpenChange={(open) => !open && setBoardSearch('')}
								disabled={!genSession}
							>
								<SelectTrigger id="pw-board">
									<SelectValue placeholder={genSession ? 'Select board' : 'Select session first'} />
								</SelectTrigger>
								<SelectContent>
									<div className="p-2 border-b sticky top-0 bg-popover z-10">
										<Input
											placeholder="Search boards..."
											value={boardSearch}
											onChange={(e) => setBoardSearch(e.target.value)}
											className="h-8"
											onClick={(e) => e.stopPropagation()}
										/>
									</div>
									<SelectItem value="all">All Boards</SelectItem>
									{filteredBoards.some(b => b.board_type === 'UG') && (
										<SelectGroup>
											<SelectLabel>UG Boards</SelectLabel>
											{filteredBoards.filter(b => b.board_type === 'UG').map((b) => (
												<SelectItem key={b.id} value={b.board_code}>
													{b.board_code} - {b.board_name}
												</SelectItem>
											))}
										</SelectGroup>
									)}
									{filteredBoards.some(b => b.board_type === 'PG') && (
										<SelectGroup>
											<SelectLabel>PG Boards</SelectLabel>
											{filteredBoards.filter(b => b.board_type === 'PG').map((b) => (
												<SelectItem key={b.id} value={b.board_code}>
													{b.board_code} - {b.board_name}
												</SelectItem>
											))}
										</SelectGroup>
									)}
								</SelectContent>
							</Select>
						</div>

						<div>
							<Label htmlFor="pw-course">Courses (Theory Only)</Label>
							{genCourses.length > 0 && (
								<div className="flex flex-wrap gap-1 p-2 border rounded-md bg-muted/30 mb-2">
									{genCourses.map((courseCode) => {
										const course = courses.find(c => c.course_code === courseCode)
										return (
											<Badge key={courseCode} variant="secondary" className="text-xs">
												{course?.course_code}
												<button
													onClick={() => setGenCourses(prev => prev.filter(c => c !== courseCode))}
													className="ml-1 hover:text-destructive"
												>
													×
												</button>
											</Badge>
										)
									})}
								</div>
							)}
							<Popover open={coursePopoverOpen} onOpenChange={setCoursePopoverOpen}>
								<PopoverTrigger asChild>
									<Button
										id="pw-course"
										variant="outline"
										role="combobox"
										aria-expanded={coursePopoverOpen}
										className="w-full justify-between"
									>
										{genCourses.length > 0 ? `${genCourses.length} course(s) selected` : 'Select courses...'}
										<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[600px] p-0" align="start">
									<div className="p-2 border-b sticky top-0 bg-popover z-10">
										<Input
											placeholder="Search courses..."
											value={courseSearch}
											onChange={(e) => setCourseSearch(e.target.value)}
											className="h-8"
										/>
									</div>
									<div className="max-h-[400px] overflow-y-auto">
										{filteredCourses.length === 0 ? (
											<div className="p-4 text-sm text-muted-foreground text-center">
												{effectiveInstitutionCode && genSession ? 'All courses have packets generated or no theory courses for selected board' : 'Select session first'}
											</div>
										) : (
											<div className="p-2 space-y-1">
												{filteredCourses.map((course) => (
													<div
														key={course.id}
														className="flex items-start space-x-3 p-2 hover:bg-muted rounded-md cursor-pointer"
														onClick={() => {
															setGenCourses(prev =>
																prev.includes(course.course_code)
																	? prev.filter(c => c !== course.course_code)
																	: [...prev, course.course_code],
															)
														}}
													>
														<Checkbox
															checked={genCourses.includes(course.course_code)}
															onCheckedChange={(checked) => {
																setGenCourses(prev =>
																	checked
																		? [...prev, course.course_code]
																		: prev.filter(c => c !== course.course_code),
																)
															}}
															onClick={(e) => e.stopPropagation()}
														/>
														<div className="flex-1 space-y-1">
															<p className="text-sm font-medium leading-none">{course.course_code}</p>
															<p className="text-xs text-muted-foreground whitespace-normal break-words">
																{course.course_title}
															</p>
														</div>
													</div>
												))}
											</div>
										)}
									</div>
									<div className="p-2 border-t bg-muted/30 flex justify-between items-center">
										<span className="text-xs text-muted-foreground">
											{genCourses.length} of {filteredCourses.length} selected
										</span>
										{genCourses.length > 0 && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setGenCourses([])}
												className="h-7 text-xs"
											>
												Clear All
											</Button>
										)}
									</div>
								</PopoverContent>
							</Popover>
						</div>

						<div className="flex items-end">
							<Button
								onClick={handleGenerate}
								disabled={generating || !effectiveInstitutionCode || !genSession || genCourses.length === 0}
								className="w-full bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700"
							>
								{generating ? (
									<>
										<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
										Generating...
									</>
								) : (
									<>
										<Sparkles className="h-4 w-4 mr-2" />
										Generate Packets
									</>
								)}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{generationResult && (
				<Card className={generationResult.success ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-red-500 bg-red-50 dark:bg-red-900/10'}>
					<CardContent className="pt-6">
						<div className="flex items-start justify-between">
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-3">
									{generationResult.success ? (
										<CheckCircle className="h-5 w-5 text-green-600" />
									) : (
										<XCircle className="h-5 w-5 text-red-600" />
									)}
									<h3 className={`font-semibold ${generationResult.success ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'}`}>
										{generationResult.message}
									</h3>
								</div>

								<div className="grid grid-cols-3 gap-4 mb-4">
									<div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-green-200 dark:border-green-800">
										<div className="text-xs text-muted-foreground mb-1">Total Packets</div>
										<div className="text-xl font-bold text-green-600 dark:text-green-400">{generationResult.total_packets}</div>
									</div>
									<div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
										<div className="text-xs text-muted-foreground mb-1">Students Assigned</div>
										<div className="text-xl font-bold text-blue-600 dark:text-blue-400">{generationResult.total_students}</div>
									</div>
									<div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
										<div className="text-xs text-muted-foreground mb-1">Courses Processed</div>
										<div className="text-xl font-bold text-purple-600 dark:text-purple-400">{generationResult.courses_processed}</div>
									</div>
								</div>

								{generationResult.details.length > 0 && (
									<div className="space-y-2">
										<h4 className="text-sm font-semibold text-muted-foreground">Course Details:</h4>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
											{generationResult.details.map((detail, index) => (
												<div key={index} className="bg-white dark:bg-gray-800 rounded-md p-2 border text-sm">
													{detail.error ? (
														<div className="flex items-center gap-2 text-red-600">
															<XCircle className="h-4 w-4" />
															<span className="font-medium">{detail.course_code}</span>
															<span className="text-xs">- {detail.error}</span>
														</div>
													) : (
														<>
															<div className="flex items-center justify-between">
																<div className="flex items-center gap-2">
																	<CheckCircle className="h-4 w-4 text-green-600" />
																	<span className="font-medium">{detail.course_code}</span>
																</div>
																<div className="text-xs text-muted-foreground">
																	{detail.packets} packets, {detail.students} students
																</div>
															</div>
															{detail.program_breakdown && detail.program_breakdown.length > 0 && (
																<div className="mt-2 flex flex-wrap gap-1">
																	{detail.program_breakdown.map((pb) => (
																		<Badge key={pb.program_code} variant="outline" className="text-[10px]">
																			{pb.program_code}: {pb.packets}p / {pb.students}s
																		</Badge>
																	))}
																</div>
															)}
														</>
													)}
												</div>
											))}
										</div>
									</div>
								)}
							</div>

							<Button variant="ghost" size="icon" onClick={() => setGenerationResult(null)} className="ml-2">
								<XCircle className="h-4 w-4" />
							</Button>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
