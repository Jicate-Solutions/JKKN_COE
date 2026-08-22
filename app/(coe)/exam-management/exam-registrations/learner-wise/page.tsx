'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSessionSync } from '@/hooks/use-session-sync'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useExamSessions } from '@/hooks/use-exam-sessions'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/common/use-toast'
import Link from 'next/link'
import { ArrowLeft, Users, Loader2, Save, Search, ClipboardCheck, BookOpen, User } from 'lucide-react'
import { useInstitution, type Institution } from '@/context/institution-context'
import { cn } from '@/lib/utils'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

interface LearnerSearchResult {
	id: string
	register_number: string
	first_name: string
	last_name?: string
	program_code: string
	program_name?: string
	current_semester: number
	institution_id: string
}

interface CourseOffering {
	id: string
	course_code: string
	course_title?: string
	program_code: string
	semester: number
}

export default function LearnerWiseExamRegistrationPage() {
	const { toast } = useToast()

	const {
		institutionCode: contextInstitutionCode,
		institutionId: contextInstitutionId,
		isReady: institutionContextReady,
		mustSelectInstitution,
	} = useInstitutionFilter()

	const { availableInstitutions, selectedInstitution, selectInstitution, currentMyJKKNInstitutionIds } = useInstitution()

	const institutionsId = institutionContextReady && !mustSelectInstitution ? (contextInstitutionId ?? '') : (selectedInstitution?.id ?? '')
	const institutionCode = institutionContextReady && !mustSelectInstitution ? (contextInstitutionCode ?? '') : (selectedInstitution?.institution_code ?? '')

	const myjkknInstitutionIds: string[] = useMemo(() => {
		if (mustSelectInstitution) return selectedInstitution?.myjkkn_institution_ids || []
		return currentMyJKKNInstitutionIds || []
	}, [mustSelectInstitution, selectedInstitution, currentMyJKKNInstitutionIds])

	// Filters
	const { selectedSessionId: sessionId, setSelectedSessionId: setSessionId, mustSelectSession } = useSessionSync()
	const [sessionCode, setSessionCode] = useState('')

	// Learner search
	const [searchQuery, setSearchQuery] = useState('')
	const [searchResults, setSearchResults] = useState<LearnerSearchResult[]>([])
	const [searching, setSearching] = useState(false)
	const [selectedLearner, setSelectedLearner] = useState<LearnerSearchResult | null>(null)

	// Course offerings for the learner
	const [courseOfferings, setCourseOfferings] = useState<CourseOffering[]>([])
	const [alreadyRegistered, setAlreadyRegistered] = useState<Set<string>>(new Set())
	const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set())
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [saving, setSaving] = useState(false)

	const { sessions, loading: loadingSessions } = useExamSessions({ institutionsId: institutionsId || null })

	// Reset on institution change
	useEffect(() => {
		setSessionId(''); setSessionCode(''); setSearchQuery(''); setSearchResults([])
		setSelectedLearner(null); setCourseOfferings([]); setAlreadyRegistered(new Set())
		setSelectedCourses(new Set())
	}, [institutionsId])

	// Reset learner/courses when session changes
	useEffect(() => {
		setSearchQuery(''); setSearchResults([])
		setSelectedLearner(null); setCourseOfferings([]); setAlreadyRegistered(new Set())
		setSelectedCourses(new Set())
	}, [sessionId])

	// Search learners from MyJKKN by register number or name
	const searchLearners = useCallback(async () => {
		const q = searchQuery.trim()
		if (!q || q.length < 2 || !sessionId) return
		setSearching(true)
		setSearchResults([])
		setSelectedLearner(null)
		setCourseOfferings([])
		setSelectedCourses(new Set())

		try {
			const myjkknIds = myjkknInstitutionIds
			if (myjkknIds.length === 0) {
				toast({ title: '⚠️ No MyJKKN Link', description: 'Institution not linked to MyJKKN', variant: 'destructive' })
				return
			}

			const allResults: LearnerSearchResult[] = []
			const seenIds = new Set<string>()
			const lower = q.toLowerCase()
			const allowedInstitutions = new Set(myjkknIds)

			for (const myjkknInstId of myjkknIds) {
				// Use search param + fetchAll so we can filter client-side
				const params = new URLSearchParams({
					institution_id: myjkknInstId,
					fetchAll: 'true',
				})
				const res = await fetch(`/api/myjkkn/learner-profiles?${params}`)
				if (!res.ok) continue
				const raw = await res.json()
				const list: any[] = raw?.data || raw || []
				// // MyJKKN ignores the institution_id query filter and returns every learner on
				// the platform, so the response must be scoped here. Only trust the field
				// when the response actually carries it - some MyJKKN record shapes strip
				// institution_id, and filtering on a missing field would empty the list.
				const responseCarriesInstitution = list.some((s: any) => s?.institution_id)

				list.forEach((s: any) => {
					const id = s.id
					if (!id || seenIds.has(id)) return
					if (responseCarriesInstitution && allowedInstitutions.size > 0 && !allowedInstitutions.has(s.institution_id)) return
					const regNo = (s.register_number || '').toLowerCase()
					const fullName = `${s.first_name || ''} ${s.last_name || ''}`.trim().toLowerCase()
					if (!regNo.includes(lower) && !fullName.includes(lower)) return
					seenIds.add(id)
					allResults.push({
						id,
						register_number: s.register_number || s.roll_number || '',
						first_name: s.first_name || '',
						last_name: s.last_name || '',
						program_code: s.program_code || '',
						program_name: s.program_name || '',
						current_semester: s.current_semester || 0,
						institution_id: s.institution_id || '',
					})
				})
			}

			allResults.sort((a, b) => a.register_number.localeCompare(b.register_number))
			setSearchResults(allResults.slice(0, 20)) // Show max 20 results
		} catch (err) {
			console.error('[LearnerWise] Search error:', err)
			toast({ title: '❌ Search Failed', description: 'Failed to search learners', variant: 'destructive' })
		} finally {
			setSearching(false)
		}
	}, [searchQuery, sessionId, myjkknInstitutionIds, toast])

	// Load course offerings when a learner is selected
	const loadCoursesForLearner = useCallback(async (learner: LearnerSearchResult) => {
		if (!institutionCode || !sessionId || !learner.program_code || !learner.current_semester) return
		setLoadingCourses(true)
		setCourseOfferings([]); setAlreadyRegistered(new Set()); setSelectedCourses(new Set())

		try {
			const params = new URLSearchParams({
				institution_code: institutionCode,
				examination_session_id: sessionId,
				program_code: learner.program_code,
				semester: String(learner.current_semester),
			})
			const res = await fetch(`/api/course-management/course-offering?${params}`)
			const data = await res.json()
			const arr: any[] = Array.isArray(data) ? data : (data?.data || [])

			const offerings: CourseOffering[] = arr.map(o => ({
				id: o.id,
				course_code: o.course_code || '',
				course_title: o.course_title || o.course_name || '',
				program_code: o.program_code || '',
				semester: o.semester || learner.current_semester,
			}))
			setCourseOfferings(offerings)

			// Check which are already registered for this learner
			const offeringIds = offerings.map(o => o.id)
			if (offeringIds.length > 0) {
				const regRes = await fetch(
					`/api/exam-management/exam-registrations?student_id=${learner.id}&examination_session_id=${sessionId}`
				)
				const regRaw = await regRes.json()
				const regs: any[] = Array.isArray(regRaw) ? regRaw : (regRaw?.data || [])
				const registeredOfferingIds = new Set<string>(
					regs.map((r: any) => r.course_offering_id).filter(Boolean)
				)
				setAlreadyRegistered(registeredOfferingIds)
			}
		} catch (err) {
			console.error('[LearnerWise] Load courses error:', err)
			toast({ title: '❌ Failed', description: 'Failed to load courses for this learner', variant: 'destructive' })
		} finally {
			setLoadingCourses(false)
		}
	}, [institutionCode, sessionId, toast])

	const selectLearner = (learner: LearnerSearchResult) => {
		setSelectedLearner(learner)
		setSearchResults([])
		loadCoursesForLearner(learner)
	}

	const toggleCourse = (id: string) => {
		setSelectedCourses(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	const eligibleCourses = courseOfferings.filter(o => !alreadyRegistered.has(o.id))
	const allChecked = eligibleCourses.length > 0 && eligibleCourses.every(o => selectedCourses.has(o.id))
	const indeterminate = !allChecked && eligibleCourses.some(o => selectedCourses.has(o.id))

	const toggleAll = () => {
		setSelectedCourses(prev => {
			const next = new Set(prev)
			if (allChecked) eligibleCourses.forEach(o => next.delete(o.id))
			else eligibleCourses.forEach(o => next.add(o.id))
			return next
		})
	}

	const handleSave = async () => {
		if (!selectedLearner || selectedCourses.size === 0) {
			toast({ title: '⚠️ Nothing selected', description: 'Select at least one course', variant: 'destructive' })
			return
		}

		setSaving(true)
		let successCount = 0; let skipCount = 0; let failCount = 0

		const selectedOfferingsList = courseOfferings.filter(o => selectedCourses.has(o.id))

		for (const offering of selectedOfferingsList) {
			try {
				const payload = {
					institutions_id: institutionsId,
					institution_code: institutionCode,
					student_id: selectedLearner.id,
					stu_register_no: selectedLearner.register_number,
					student_name: `${selectedLearner.first_name} ${selectedLearner.last_name || ''}`.trim(),
					examination_session_id: sessionId,
					session_code: sessionCode,
					course_offering_id: offering.id,
					course_code: offering.course_code,
					program_code: offering.program_code,
					registration_status: 'Pending',
					is_regular: true,
					attempt_number: 1,
					fee_paid: false,
				}
				const res = await fetch('/api/exam-management/exam-registrations', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})
				if (res.status === 400 || res.status === 409) {
					const err = await res.json()
					if (err?.error?.toLowerCase().includes('duplicate')) skipCount++
					else failCount++
				} else if (!res.ok) {
					failCount++
				} else {
					successCount++
				}
			} catch {
				failCount++
			}
		}

		setSaving(false)
		const parts: string[] = []
		if (successCount) parts.push(`${successCount} courses registered`)
		if (skipCount) parts.push(`${skipCount} already registered (skipped)`)
		if (failCount) parts.push(`${failCount} failed`)

		if (failCount === 0) {
			toast({ title: '✅ Registrations Saved', description: parts.join(', '), className: 'bg-green-50 border-green-200 text-green-800' })
		} else {
			toast({ title: '⚠️ Partially Saved', description: parts.join(', '), variant: 'destructive' })
		}

		// Refresh already-registered set
		if (selectedLearner) await loadCoursesForLearner(selectedLearner)
		setSelectedCourses(new Set())
	}

	const totalCourses = courseOfferings.length
	const alreadyCount = courseOfferings.filter(o => alreadyRegistered.has(o.id)).length
	const availableCount = totalCourses - alreadyCount

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0">

						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/dashboard">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbLink asChild><Link href="/exam-management/exam-registrations">Exam Registrations</Link></BreadcrumbLink></BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem><BreadcrumbPage>Learner Wise</BreadcrumbPage></BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						{/* Stats */}
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
							<Card className="border-l-4 border-l-violet-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{totalCourses}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Courses</p>
										</div>
										<BookOpen className="h-5 w-5 text-violet-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-amber-600">{alreadyCount}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Already Registered</p>
										</div>
										<ClipboardCheck className="h-5 w-5 text-amber-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-green-600">{availableCount}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Available</p>
										</div>
										<BookOpen className="h-5 w-5 text-green-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-blue-600">{selectedCourses.size}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Selected</p>
										</div>
										<BookOpen className="h-5 w-5 text-blue-500/40" />
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Filters + Search */}
						<Card>
							<CardHeader className="px-4 py-3 border-b">
								<div className="flex items-center justify-between">
									<div>
										<h2 className="text-base font-semibold">Learner Wise Registration</h2>
										<p className="text-xs text-muted-foreground">Select a session, search for a learner, then register them for courses</p>
									</div>
									<Link href="/exam-management/exam-registrations">
										<Button variant="outline" size="sm" className="h-8 text-sm px-3 gap-1.5">
											<ArrowLeft className="h-3.5 w-3.5" />Back
										</Button>
									</Link>
								</div>
							</CardHeader>
							<CardContent className="p-4 space-y-4">
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

									{mustSelectInstitution && (
										<div className="space-y-1.5">
											<Label className="text-xs font-medium">Institution</Label>
											<Select
												value={selectedInstitution?.id || ''}
												onValueChange={val => {
													const inst = availableInstitutions.find((i: Institution) => i.id === val)
													selectInstitution(inst || null)
												}}
											>
												<SelectTrigger className="h-8 text-sm">
													<SelectValue placeholder="Select institution" />
												</SelectTrigger>
												<SelectContent>
													{availableInstitutions.filter((i: Institution) => i.id !== 'all').map((inst: Institution) => (
														<SelectItem key={inst.id} value={inst.id}>{inst.institution_name}</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}

									{/* Session */}
									{mustSelectSession && (
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Exam Session</Label>
										<Select
											value={sessionId}
											onValueChange={val => {
												const s = sessions.find(s => s.id === val)
												setSessionId(val); setSessionCode(s?.session_code || '')
											}}
											disabled={!institutionsId || loadingSessions}
										>
											<SelectTrigger className="h-8 text-sm">
												{loadingSessions
													? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading...</span>
													: <SelectValue placeholder="Select session" />
												}
											</SelectTrigger>
											<SelectContent>
												{sessions.map(s => <SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>)}
											</SelectContent>
										</Select>
									</div>
									)}

									{/* Learner Search */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Search Learner</Label>
										<div className="flex gap-2">
											<div className="relative flex-1">
												<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
												<Input
													value={searchQuery}
													onChange={e => setSearchQuery(e.target.value)}
													onKeyDown={e => e.key === 'Enter' && searchLearners()}
													placeholder="Register no or name..."
													className="pl-8 h-9 text-sm"
													disabled={!sessionId}
												/>
											</div>
											<Button
												size="sm"
												variant="outline"
												onClick={searchLearners}
												disabled={!sessionId || !searchQuery.trim() || searching}
												className="h-9 px-3"
											>
												{searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
											</Button>
										</div>
									</div>
								</div>

								{/* Search Results */}
								{searchResults.length > 0 && !selectedLearner && (
									<div className="border rounded-lg overflow-hidden">
										<div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
											{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found — click to select
										</div>
										<div className="divide-y max-h-52 overflow-y-auto">
											{searchResults.map(learner => (
												<button
													key={learner.id}
													onClick={() => selectLearner(learner)}
													className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors flex items-center gap-3"
												>
													<User className="h-4 w-4 text-slate-400 shrink-0" />
													<div className="min-w-0">
														<p className="text-sm font-medium font-mono">{learner.register_number}</p>
														<p className="text-xs text-muted-foreground truncate">
															{`${learner.first_name} ${learner.last_name || ''}`.trim()}
															{learner.program_code && <span className="ml-2 text-slate-400">· {learner.program_code} · Sem {learner.current_semester}</span>}
														</p>
													</div>
												</button>
											))}
										</div>
									</div>
								)}

								{/* Selected Learner Info */}
								{selectedLearner && (
									<div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
										<User className="h-5 w-5 text-blue-500 shrink-0" />
										<div className="flex-1 min-w-0">
											<p className="text-sm font-semibold">{`${selectedLearner.first_name} ${selectedLearner.last_name || ''}`.trim()}</p>
											<p className="text-xs text-muted-foreground font-mono">{selectedLearner.register_number}</p>
										</div>
										<div className="flex gap-2 flex-wrap">
											<Badge variant="outline" className="text-xs">{selectedLearner.program_code}</Badge>
											{selectedLearner.current_semester > 0 && (
												<Badge variant="outline" className="text-xs">
													Sem {ROMAN[selectedLearner.current_semester] || selectedLearner.current_semester}
												</Badge>
											)}
										</div>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 text-xs text-slate-500"
											onClick={() => {
												setSelectedLearner(null)
												setCourseOfferings([])
												setSelectedCourses(new Set())
												setSearchQuery('')
											}}
										>
											Change
										</Button>
									</div>
								)}
							</CardContent>
						</Card>

						{/* Course Table */}
						{selectedLearner && (
							<Card className="flex-1 flex flex-col min-h-0">
								<CardHeader className="px-4 py-3 border-b">
									<div className="flex items-center justify-between gap-3 flex-wrap">
										<div>
											<h2 className="text-base font-semibold">Courses</h2>
											<p className="text-xs text-muted-foreground">
												{loadingCourses ? 'Loading courses...' : courseOfferings.length === 0 ? 'No courses found for this learner' : `${totalCourses} courses for ${selectedLearner.program_code} Semester ${ROMAN[selectedLearner.current_semester] || selectedLearner.current_semester}`}
											</p>
										</div>
										<Button
											size="sm"
											onClick={handleSave}
											disabled={saving || selectedCourses.size === 0}
											className="h-8 text-sm px-4 gap-1.5 disabled:opacity-50"
										>
											{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
											Register {selectedCourses.size > 0 ? `(${selectedCourses.size})` : ''}
										</Button>
									</div>
								</CardHeader>

								{loadingCourses ? (
									<div className="flex flex-col items-center gap-2 text-muted-foreground py-20">
										<Loader2 className="h-5 w-5 animate-spin" />
										<span className="text-sm">Loading courses...</span>
									</div>
								) : courseOfferings.length === 0 ? (
									<div className="flex flex-col items-center gap-2 text-muted-foreground py-20">
										<BookOpen className="h-8 w-8 opacity-20" />
										<span className="text-sm">No course offerings found for this learner's program and semester</span>
									</div>
								) : (
									<div className="overflow-x-auto">
										<table className="w-full text-sm">
											<thead>
												<tr className="bg-muted/50">
													<th className="px-5 py-3 text-left w-10">
														<Checkbox
															checked={allChecked}
															// @ts-ignore
															data-state={indeterminate ? 'indeterminate' : allChecked ? 'checked' : 'unchecked'}
															onCheckedChange={toggleAll}
															className="border-slate-400"
														/>
													</th>
													<th className="px-3 py-3 text-center text-xs font-semibold w-12">#</th>
													<th className="px-3 py-3 text-left text-xs font-semibold w-36">Course Code</th>
													<th className="px-3 py-3 text-left text-xs font-semibold">Course Title</th>
													<th className="px-4 py-3 text-center text-xs font-semibold w-36">Status</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-50">
												{courseOfferings.map((offering, idx) => {
													const registered = alreadyRegistered.has(offering.id)
													const isChecked = selectedCourses.has(offering.id)
													return (
														<tr
															key={offering.id}
															onClick={() => !registered && toggleCourse(offering.id)}
															className={cn(
																'transition-colors cursor-pointer',
																registered ? 'opacity-55 bg-slate-50/40 cursor-not-allowed'
																	: isChecked ? 'bg-blue-50 hover:bg-blue-50/80'
																		: 'hover:bg-slate-50/60'
															)}
														>
															<td className="px-5 py-2.5" onClick={e => e.stopPropagation()}>
																<Checkbox
																	checked={isChecked && !registered}
																	onCheckedChange={() => !registered && toggleCourse(offering.id)}
																	disabled={registered}
																	className="border-slate-300"
																/>
															</td>
															<td className="px-3 py-2.5 text-center text-xs tabular-nums">{idx + 1}</td>
															<td className="px-3 py-2.5">
																<span className="text-sm font-medium font-mono">{offering.course_code || '—'}</span>
															</td>
															<td className="px-3 py-2.5 text-sm">{offering.course_title || '—'}</td>
															<td className="px-4 py-2.5 text-center">
																{registered ? (
																	<Badge className="text-xs bg-amber-100 text-amber-700 border border-amber-200 font-normal">Already Registered</Badge>
																) : isChecked ? (
																	<Badge className="text-xs bg-blue-100 text-blue-700 border border-blue-200 font-normal">Selected</Badge>
																) : (
																	<span className="text-xs text-slate-300">—</span>
																)}
															</td>
														</tr>
													)
												})}
											</tbody>
										</table>
									</div>
								)}
							</Card>
						)}

						{/* Empty state when no learner selected */}
						{!selectedLearner && (
							<Card>
								<div className="flex flex-col items-center gap-2 text-muted-foreground py-20">
									<Users className="h-8 w-8 opacity-20" />
									<span className="text-sm">Search and select a learner to see their courses</span>
								</div>
							</Card>
						)}

					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
