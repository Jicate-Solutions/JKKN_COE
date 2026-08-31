'use client'

// Question Paper Examiner Assignment — End Semester Examinations.
//
// The spec's flow (§4/§11), on one screen:
//   Exam Session → Question Paper → Examiner Type → Examiner → Date/Time →
//   Assign → Examiner Order → (portal) → Question Paper Development → Submit →
//   Track Status
//
// Assign covers steps 1–8; Assignments covers the order, the review and the
// audit trail; Order Design is the per-institution configuration of §9.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import {
	FileText, UserCheck, Clock, CheckCircle2, AlertTriangle, Building2, Loader2,
} from 'lucide-react'
import { GenerateTab } from './generate-tab'
import { AssignTab } from './assign-tab'
import { AssignmentsTab } from './assignments-tab'
import { ContentTab } from './content-tab'
import { apiFetch, SearchableSelect, type InstitutionOpt, type SessionOpt, type AssignmentRow } from './shared'

export default function QpExaminerAssignmentPage() {
	const { toast } = useToast()
	const { appendToUrl, isReady, institutionId, institutionCode, mustSelectInstitution } = useInstitutionFilter()

	const [institutions, setInstitutions] = useState<InstitutionOpt[]>([])
	const [pickedInstitution, setPickedInstitution] = useState('')
	const [sessions, setSessions] = useState<SessionOpt[]>([])
	const [sessionId, setSessionId] = useState('')
	const [loadingSessions, setLoadingSessions] = useState(false)

	const [stats, setStats] = useState<AssignmentRow[]>([])
	const [refreshKey, setRefreshKey] = useState(0)

	// A super_admin viewing "All Institutions" picks one here; everyone else is
	// already scoped by the global institution filter.
	const effectiveInstitutionId = mustSelectInstitution ? pickedInstitution : institutionId || pickedInstitution
	const effectiveInstitutionCode = useMemo(
		() => institutions.find(i => i.id === effectiveInstitutionId)?.institution_code || institutionCode || '',
		[institutions, effectiveInstitutionId, institutionCode]
	)

	// ── Institutions ──────────────────────────────────────────────────────
	useEffect(() => {
		if (!isReady) return
		const load = async () => {
			try {
				const data = await apiFetch(appendToUrl('/api/pre-exam/internal-marks?action=institutions'))
				const list: InstitutionOpt[] = (data || []).map((i: any) => ({
					id: i.id,
					name: i.name || i.institution_name,
					institution_code: i.institution_code,
				}))
				setInstitutions(list)
				// Only one choice — pick it so the common case needs no extra click.
				if (list.length === 1) setPickedInstitution(list[0].id)
			} catch (e: any) {
				toast({ title: 'Could not load institutions', description: e.message, variant: 'destructive' })
			}
		}
		load()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isReady])

	// ── Sessions for the institution ──────────────────────────────────────
	const loadSessions = useCallback(async () => {
		if (!effectiveInstitutionId) {
			setSessions([])
			setSessionId('')
			return
		}
		setLoadingSessions(true)
		try {
			const json = await apiFetch(
				`/api/pre-exam/qp-examiner-assignments/sessions?institutions_id=${effectiveInstitutionId}`
			)
			const list: SessionOpt[] = json.data || []
			setSessions(list)
			// Default to the most recent End Semester session — that is the only kind
			// this screen can act on, so landing on one saves a click.
			const firstEse = list.find(s => s.is_end_semester)
			setSessionId(prev => (prev && list.some(s => s.id === prev) ? prev : firstEse?.id || ''))
		} catch (e: any) {
			setSessions([])
			toast({ title: 'Could not load examination sessions', description: e.message, variant: 'destructive' })
		} finally {
			setLoadingSessions(false)
		}
	}, [effectiveInstitutionId, toast])

	useEffect(() => {
		loadSessions()
	}, [loadSessions])

	// ── Scorecard figures ─────────────────────────────────────────────────
	const loadStats = useCallback(async () => {
		if (!effectiveInstitutionId) {
			setStats([])
			return
		}
		try {
			const qs = new URLSearchParams({ institutions_id: effectiveInstitutionId })
			if (sessionId) qs.set('examination_session_id', sessionId)
			const json = await apiFetch(`/api/pre-exam/qp-examiner-assignments?${qs}`)
			setStats(json.data || [])
		} catch {
			setStats([])
		}
	}, [effectiveInstitutionId, sessionId])

	useEffect(() => {
		loadStats()
	}, [loadStats, refreshKey])

	const session = useMemo(() => sessions.find(s => s.id === sessionId) || null, [sessions, sessionId])

	const counts = useMemo(
		() => ({
			total: stats.length,
			open: stats.filter(s => s.window_state === 'open' && !['submitted', 'accepted', 'cancelled'].includes(s.status)).length,
			submitted: stats.filter(s => s.status === 'submitted').length,
			accepted: stats.filter(s => s.status === 'accepted').length,
			overdue: stats.filter(
				s => s.window_state === 'closed' && !['submitted', 'accepted', 'cancelled'].includes(s.status)
			).length,
		}),
		[stats]
	)

	const bumpRefresh = () => setRefreshKey(k => k + 1)

	const showInstitutionPicker = mustSelectInstitution || (!institutionId && institutions.length > 1)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbLink href="/pre-exam/question-papers">Pre-Exam</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>QP Examiner Assignment</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Scope */}
					<Card>
						<CardContent className="p-4">
							<div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
								{showInstitutionPicker && (
									<div>
										<label className="text-xs font-medium text-muted-foreground">Institution</label>
										<div className="mt-1">
											<SearchableSelect
												value={pickedInstitution}
												onValueChange={v => {
													setPickedInstitution(v)
													setSessionId('')
												}}
												placeholder="Select institution"
												options={institutions.map(i => ({
													value: i.id,
													label: i.name,
													hint: i.institution_code,
												}))}
											/>
										</div>
									</div>
								)}
								<div className={showInstitutionPicker ? '' : 'md:col-span-2'}>
									<label className="text-xs font-medium text-muted-foreground">
										Examination session
										{loadingSessions && <Loader2 className="inline h-3 w-3 ml-1.5 animate-spin" />}
									</label>
									<div className="mt-1">
										<SearchableSelect
											value={sessionId}
											onValueChange={setSessionId}
											placeholder={effectiveInstitutionId ? 'Select session' : 'Select an institution first'}
											disabled={!effectiveInstitutionId}
											options={sessions.map(s => ({
												value: s.id,
												label: s.session_name,
												hint: s.is_end_semester
													? s.exam_type_name || 'End Semester'
													: `${s.exam_type_name || 'No exam type'} — not end semester`,
											}))}
											searchPlaceholder="Search sessions…"
										/>
									</div>
								</div>
								<div className="flex items-end gap-2">
									{session && (
										<Badge
											variant="outline"
											className={
												session.is_end_semester
													? 'bg-emerald-50 text-emerald-700 border-emerald-200'
													: 'bg-amber-50 text-amber-700 border-amber-200'
											}
										>
											{session.is_end_semester ? (
												<CheckCircle2 className="h-3.5 w-3.5 mr-1" />
											) : (
												<AlertTriangle className="h-3.5 w-3.5 mr-1" />
											)}
											{session.exam_type_name || 'No exam type'}
										</Badge>
									)}
									{effectiveInstitutionCode && (
										<Badge variant="outline">
											<Building2 className="h-3.5 w-3.5 mr-1" />
											{effectiveInstitutionCode}
										</Badge>
									)}
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Scorecards */}
					<div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
						{[
							{ label: 'Assignments', value: counts.total, Icon: FileText, tone: 'border-l-blue-500', icon: 'text-blue-500/40' },
							{ label: 'Open now', value: counts.open, Icon: Clock, tone: 'border-l-emerald-500', icon: 'text-emerald-500/40' },
							{ label: 'Awaiting review', value: counts.submitted, Icon: UserCheck, tone: 'border-l-amber-500', icon: 'text-amber-500/40' },
							{ label: 'Accepted', value: counts.accepted, Icon: CheckCircle2, tone: 'border-l-violet-500', icon: 'text-violet-500/40' },
							{ label: 'Closed, not submitted', value: counts.overdue, Icon: AlertTriangle, tone: 'border-l-rose-500', icon: 'text-rose-500/40' },
						].map(({ label, value, Icon, tone, icon }) => (
							<Card key={label} className={`border-l-4 ${tone} hover:shadow-md transition-shadow`}>
								<CardContent className="p-4">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-2xl font-bold tracking-tight">{value}</p>
											<p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
										</div>
										<Icon className={`h-5 w-5 ${icon}`} />
									</div>
								</CardContent>
							</Card>
						))}
					</div>

					{!effectiveInstitutionId ? (
						<Card>
							<CardContent className="p-10 text-center text-sm text-muted-foreground">
								Select an institution to begin.
							</CardContent>
						</Card>
					) : (
						<Tabs defaultValue="generate" className="flex-1">
							<TabsList>
								<TabsTrigger value="generate">Generate Papers</TabsTrigger>
								<TabsTrigger value="assign">Assign Examiner</TabsTrigger>
								<TabsTrigger value="assignments">
									Assignments
									{counts.submitted > 0 && (
										<Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-200">
											{counts.submitted}
										</Badge>
									)}
								</TabsTrigger>
								<TabsTrigger value="content">Order Design</TabsTrigger>
							</TabsList>

							<TabsContent value="generate" className="pt-4">
								<GenerateTab
									institutionsId={effectiveInstitutionId}
									institutionCode={effectiveInstitutionCode}
									session={session}
									onGenerated={bumpRefresh}
								/>
							</TabsContent>

							<TabsContent value="assign" className="pt-4">
								<AssignTab
									institutionsId={effectiveInstitutionId}
									institutionCode={effectiveInstitutionCode}
									session={session}
									onAssigned={bumpRefresh}
								/>
							</TabsContent>

							<TabsContent value="assignments" className="pt-4">
								<AssignmentsTab
									institutionsId={effectiveInstitutionId}
									session={session}
									refreshKey={refreshKey}
									onChanged={bumpRefresh}
								/>
							</TabsContent>

							<TabsContent value="content" className="pt-4">
								<ContentTab institutionsId={effectiveInstitutionId} session={session} />
							</TabsContent>
						</Tabs>
					)}
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
