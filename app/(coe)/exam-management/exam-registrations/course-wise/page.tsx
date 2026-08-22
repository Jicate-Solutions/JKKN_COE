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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/common/use-toast'
import Link from 'next/link'
import { ArrowLeft, Users, Loader2, Save, RefreshCw, ChevronsUpDown, Check, Search, ClipboardCheck, BookOpen } from 'lucide-react'
import { useInstitution, type Institution } from '@/context/institution-context'
import { cn } from '@/lib/utils'

interface CourseOffering {
	id: string
	course_code: string
	course_title?: string
	program_code: string
	semester: number
	semester_code?: string
}

interface Learner {
	id: string
	stu_register_no: string
	student_name: string
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

interface SearchableSelectProps {
	value: string
	onValueChange: (val: string) => void
	placeholder: string
	searchPlaceholder: string
	options: { value: string; label: string }[]
	disabled?: boolean
	loading?: boolean
}

function SearchableSelect({ value, onValueChange, placeholder, searchPlaceholder, options, disabled, loading }: SearchableSelectProps) {
	const [open, setOpen] = useState(false)
	const [search, setSearch] = useState('')

	const filtered = useMemo(() => {
		if (!search.trim()) return options
		const lower = search.toLowerCase()
		return options.filter(o => o.label.toLowerCase().includes(lower))
	}, [options, search])

	const selectedLabel = options.find(o => o.value === value)?.label

	return (
		<Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch('') }}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled || loading}
					className="h-9 w-full justify-between rounded-lg border-slate-300 font-normal text-sm hover:border-blue-400 px-3"
				>
					{loading ? (
						<span className="flex items-center gap-2 text-slate-400"><Loader2 className="h-3 w-3 animate-spin" />Loading...</span>
					) : (
						<span className={cn('truncate', !selectedLabel && 'text-slate-400')}>{selectedLabel || placeholder}</span>
					)}
					<ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400 ml-1" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[260px]" align="start">
				<Command shouldFilter={false}>
					<CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} className="h-9 text-sm" />
					<CommandList className="max-h-60 overflow-y-auto">
						{filtered.length === 0
							? <CommandEmpty className="py-4 text-sm text-center text-slate-400">No results found</CommandEmpty>
							: filtered.map(opt => (
								<CommandItem key={opt.value} value={opt.value}
									onSelect={() => { onValueChange(opt.value === value ? '' : opt.value); setOpen(false); setSearch('') }}
									className="text-sm cursor-pointer"
								>
									<Check className={cn('mr-2 h-4 w-4 shrink-0', value === opt.value ? 'opacity-100' : 'opacity-0')} />
									{opt.label}
								</CommandItem>
							))
						}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}

export default function CourseWiseExamRegistrationPage() {
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
	const [courseOfferingId, setCourseOfferingId] = useState('')
	const [courseCode, setCourseCode] = useState('')
	const [programCode, setProgramCode] = useState('')
	const [semester, setSemester] = useState(0)

	// Data
	const [courseOfferings, setCourseOfferings] = useState<CourseOffering[]>([])
	const [learners, setLearners] = useState<Learner[]>([])
	const [alreadyRegistered, setAlreadyRegistered] = useState<Set<string>>(new Set())
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [searchText, setSearchText] = useState('')

	// Loading
	const [loadingOfferings, setLoadingOfferings] = useState(false)
	const [loadingLearners, setLoadingLearners] = useState(false)
	const [saving, setSaving] = useState(false)

	const { sessions, loading: loadingSessions } = useExamSessions({ institutionsId: institutionsId || null })

	// Reset on institution change
	useEffect(() => {
		setSessionId(''); setSessionCode(''); setCourseOfferingId(''); setCourseCode('')
		setProgramCode(''); setSemester(0); setLearners([]); setSelected(new Set())
	}, [institutionsId])

	// Load all course offerings for the session
	useEffect(() => {
		if (!institutionCode || !sessionId) {
			setCourseOfferings([])
			setCourseOfferingId(''); setCourseCode(''); setProgramCode(''); setSemester(0)
			setLearners([]); setSelected(new Set())
			return
		}
		setLoadingOfferings(true)
		setCourseOfferingId(''); setCourseCode(''); setProgramCode(''); setSemester(0)
		setLearners([]); setSelected(new Set())

		const params = new URLSearchParams({
			institution_code: institutionCode,
			examination_session_id: sessionId,
		})
		fetch(`/api/course-management/course-offering?${params}`)
			.then(r => r.json())
			.then(data => {
				const arr: any[] = Array.isArray(data) ? data : (data?.data || [])
				setCourseOfferings(arr.map(o => ({
					id: o.id,
					course_code: o.course_code || '',
					course_title: o.course_title || o.course_name || '',
					program_code: o.program_code || '',
					semester: o.semester || 0,
					semester_code: o.semester_code,
				})))
			})
			.catch(() => setCourseOfferings([]))
			.finally(() => setLoadingOfferings(false))
	}, [institutionCode, sessionId])

	// Load learners when a course offering is selected
	const loadLearners = useCallback(async () => {
		if (!institutionsId || !courseOfferingId || !programCode || !semester) return
		setLoadingLearners(true)
		setLearners([]); setSelected(new Set())

		try {
			const myjkknIds = myjkknInstitutionIds
			if (myjkknIds.length === 0) {
				toast({ title: '⚠️ No MyJKKN Link', description: 'Institution not linked to MyJKKN', variant: 'destructive' })
				return
			}

			const allLearners: Learner[] = []
			const seenIds = new Set<string>()
			const allowedInstitutions = new Set(myjkknIds)

			for (const myjkknInstId of myjkknIds) {
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
					if (s.program_code !== programCode) return
					if (s.current_semester !== semester) return
					seenIds.add(id)
					allLearners.push({
						id,
						stu_register_no: s.register_number || s.roll_number || '',
						student_name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.name || '',
					})
				})
			}

			allLearners.sort((a, b) => a.stu_register_no.localeCompare(b.stu_register_no))
			setLearners(allLearners)

			const regRes = await fetch(`/api/exam-management/exam-registrations?course_offering_id=${courseOfferingId}`)
			const regRaw = await regRes.json()
			const regs: any[] = Array.isArray(regRaw) ? regRaw : (regRaw?.data || [])
			const regKeys = new Set<string>(regs.map((r: any) => r.student_id || r.stu_register_no).filter(Boolean))
			setAlreadyRegistered(regKeys)
		} catch (err) {
			console.error('[CourseWise Reg] Error loading learners:', err)
			toast({ title: '❌ Load Failed', description: 'Failed to load learners', variant: 'destructive' })
		} finally {
			setLoadingLearners(false)
		}
	}, [institutionsId, myjkknInstitutionIds, courseOfferingId, programCode, semester, toast])

	useEffect(() => {
		if (!courseOfferingId) {
			setLearners([]); setSelected(new Set()); return
		}
		loadLearners()
	}, [courseOfferingId]) // eslint-disable-line react-hooks/exhaustive-deps

	const filteredLearners = useMemo(() => {
		if (!searchText.trim()) return learners
		const lower = searchText.toLowerCase()
		return learners.filter(l =>
			l.stu_register_no.toLowerCase().includes(lower) ||
			l.student_name.toLowerCase().includes(lower)
		)
	}, [learners, searchText])

	const isAlreadyRegistered = (l: Learner) =>
		alreadyRegistered.has(l.id) || alreadyRegistered.has(l.stu_register_no)

	const toggleLearner = (id: string) => {
		setSelected(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	const eligibleFiltered = filteredLearners.filter(l => !isAlreadyRegistered(l))
	const allChecked = eligibleFiltered.length > 0 && eligibleFiltered.every(l => selected.has(l.id))
	const indeterminate = !allChecked && eligibleFiltered.some(l => selected.has(l.id))

	const toggleAll = () => {
		setSelected(prev => {
			const next = new Set(prev)
			if (allChecked) eligibleFiltered.forEach(l => next.delete(l.id))
			else eligibleFiltered.forEach(l => next.add(l.id))
			return next
		})
	}

	const handleSave = async () => {
		if (selected.size === 0) {
			toast({ title: '⚠️ Nothing selected', description: 'Select at least one learner', variant: 'destructive' })
			return
		}

		setSaving(true)
		let successCount = 0; let skipCount = 0; let failCount = 0

		const selectedLearners = learners.filter(l => selected.has(l.id))

		for (const learner of selectedLearners) {
			try {
				const payload = {
					institutions_id: institutionsId,
					institution_code: institutionCode,
					student_id: learner.id,
					stu_register_no: learner.stu_register_no,
					student_name: learner.student_name,
					examination_session_id: sessionId,
					session_code: sessionCode,
					course_offering_id: courseOfferingId,
					course_code: courseCode,
					program_code: programCode,
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
		if (successCount) parts.push(`${successCount} registered`)
		if (skipCount) parts.push(`${skipCount} already registered (skipped)`)
		if (failCount) parts.push(`${failCount} failed`)

		if (failCount === 0) {
			toast({ title: '✅ Registrations Saved', description: parts.join(', '), className: 'bg-green-50 border-green-200 text-green-800' })
		} else {
			toast({ title: '⚠️ Partially Saved', description: parts.join(', '), variant: 'destructive' })
		}

		await loadLearners()
		setSelected(new Set())
	}

	const totalLearners = learners.length
	const alreadyCount = learners.filter(l => isAlreadyRegistered(l)).length
	const availableCount = totalLearners - alreadyCount

	const selectedOffering = courseOfferings.find(o => o.id === courseOfferingId)

	const courseOptions = useMemo(() =>
		courseOfferings.map(o => ({
			value: o.id,
			label: o.course_code
				? (o.course_title ? `${o.course_code} - ${o.course_title}` : o.course_code)
				: o.id,
		})),
		[courseOfferings]
	)

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
								<BreadcrumbItem><BreadcrumbPage>Course Wise</BreadcrumbPage></BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						{/* Stats */}
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
							<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{totalLearners}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Learners</p>
										</div>
										<Users className="h-5 w-5 text-emerald-500/40" />
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
										<Users className="h-5 w-5 text-green-500/40" />
									</div>
								</CardContent>
							</Card>
							<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight text-blue-600">{selected.size}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">Selected</p>
										</div>
										<Check className="h-5 w-5 text-blue-500/40" />
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Filters */}
						<Card>
							<CardHeader className="px-4 py-3 border-b">
								<div className="flex items-center justify-between">
									<div>
										<h2 className="text-base font-semibold">Course Wise Registration</h2>
										<p className="text-xs text-muted-foreground">Select a course to load learners enrolled in that course's program and semester</p>
									</div>
									<Link href="/exam-management/exam-registrations">
										<Button variant="outline" size="sm" className="h-8 text-sm px-3 gap-1.5">
											<ArrowLeft className="h-3.5 w-3.5" />Back
										</Button>
									</Link>
								</div>
							</CardHeader>
							<CardContent className="p-4">
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

									{/* Exam Session */}
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

									{/* Course */}
									<div className="space-y-1.5">
										<Label className="text-xs font-medium">Course</Label>
										<SearchableSelect
											value={courseOfferingId}
											onValueChange={val => {
												setCourseOfferingId(val)
												const offering = courseOfferings.find(o => o.id === val)
												setCourseCode(offering?.course_code || '')
												setProgramCode(offering?.program_code || '')
												setSemester(offering?.semester || 0)
											}}
											placeholder="Select course"
											searchPlaceholder="Search by code or name..."
											options={courseOptions}
											disabled={!sessionId}
											loading={loadingOfferings}
										/>
									</div>
								</div>

								{/* Course info pill */}
								{selectedOffering && (
									<div className="mt-3 flex items-center gap-2 flex-wrap">
										<Badge variant="outline" className="text-xs gap-1.5 py-1 px-2">
											<BookOpen className="h-3 w-3" />
											Program: <span className="font-semibold">{selectedOffering.program_code}</span>
										</Badge>
										<Badge variant="outline" className="text-xs gap-1.5 py-1 px-2">
											Semester: <span className="font-semibold">{ROMAN[selectedOffering.semester] ? `Semester ${ROMAN[selectedOffering.semester]}` : `Sem ${selectedOffering.semester}`}</span>
										</Badge>
									</div>
								)}
							</CardContent>
						</Card>

						{/* Learner Table */}
						<TooltipProvider delayDuration={300}>
							<Card className="flex-1 flex flex-col min-h-0">
								<CardHeader className="px-4 py-3 border-b">
									<div className="flex items-center justify-between gap-3 flex-wrap">
										<div>
											<h2 className="text-base font-semibold">Learners</h2>
											<p className="text-xs text-muted-foreground">
												{loadingLearners ? 'Loading learners...' : learners.length === 0 ? 'Select session and course above' : `${totalLearners} learners loaded`}
											</p>
										</div>
										<div className="flex items-center gap-2 flex-wrap">
											{learners.length > 0 && (
												<div className="relative">
													<Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
													<Input
														value={searchText}
														onChange={e => setSearchText(e.target.value)}
														placeholder="Search learner..."
														className="pl-8 h-8 text-sm w-44"
													/>
												</div>
											)}
											{learners.length > 0 && (
												<Tooltip>
													<TooltipTrigger asChild>
														<Button variant="outline" size="sm" onClick={loadLearners} disabled={loadingLearners} className="h-8 w-8 p-0">
															<RefreshCw className={`h-3.5 w-3.5 ${loadingLearners ? 'animate-spin' : ''}`} />
														</Button>
													</TooltipTrigger>
													<TooltipContent>Refresh learners</TooltipContent>
												</Tooltip>
											)}
											<Button
												size="sm"
												onClick={handleSave}
												disabled={saving || selected.size === 0 || !courseOfferingId}
												className="h-8 text-sm px-4 gap-1.5 disabled:opacity-50"
											>
												{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
												Register {selected.size > 0 ? `(${selected.size})` : ''}
											</Button>
										</div>
									</div>
								</CardHeader>

								{loadingLearners ? (
									<div className="flex flex-col items-center gap-2 text-muted-foreground py-20">
										<RefreshCw className="h-5 w-5 animate-spin" />
										<span className="text-sm">Loading learners from MyJKKN...</span>
									</div>
								) : learners.length === 0 ? (
									<div className="flex flex-col items-center gap-2 text-muted-foreground py-20">
										<Users className="h-8 w-8 opacity-20" />
										<span className="text-sm">Select session and course above to load learners</span>
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
													<th className="px-3 py-3 text-left text-xs font-semibold w-40">Register No</th>
													<th className="px-3 py-3 text-left text-xs font-semibold">Name</th>
													<th className="px-4 py-3 text-center text-xs font-semibold w-36">Status</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-slate-50">
												{filteredLearners.map((learner, idx) => {
													const registered = isAlreadyRegistered(learner)
													const isChecked = selected.has(learner.id)
													return (
														<tr
															key={learner.id}
															onClick={() => !registered && toggleLearner(learner.id)}
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
																	onCheckedChange={() => !registered && toggleLearner(learner.id)}
																	disabled={registered}
																	className="border-slate-300"
																/>
															</td>
															<td className="px-3 py-2.5 text-center text-xs tabular-nums">{idx + 1}</td>
															<td className="px-3 py-2.5">
																<span className="text-sm font-medium font-mono">{learner.stu_register_no || '—'}</span>
															</td>
															<td className="px-3 py-2.5 text-sm">{learner.student_name || '—'}</td>
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
						</TooltipProvider>

					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
