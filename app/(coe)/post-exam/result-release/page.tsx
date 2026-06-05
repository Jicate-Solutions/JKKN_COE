"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/common/use-toast"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { CalendarClock, Eye, EyeOff, Send, RefreshCw, CheckCircle, Clock, FileCheck } from "lucide-react"

interface PostExamSession {
	id: string
	session_code: string
	session_name: string
	session_status: string
	exam_start_date: string
	exam_end_date: string
	result_declaration_date: string | null
	month_year: string | null
	total_final_marks: number
	published_final_marks: number
	date_reached: boolean
	is_live_to_learners: boolean
}

interface GradeSystemRow {
	id: string
	grade_system_code: string
	grade: string
	grade_point: number
	min_mark: number
	max_mark: number
	description: string
	is_active?: boolean
}

// Order rows like the official grade chart: absent bands (negative marks)
// first, then by max_mark descending (O, D+, D, A+, A ...).
function sortGradeRows(rows: GradeSystemRow[]): GradeSystemRow[] {
	return [...rows].sort((a, b) => {
		const aAbsent = a.min_mark < 0 || a.max_mark < 0
		const bAbsent = b.min_mark < 0 || b.max_mark < 0
		if (aAbsent !== bAbsent) return aAbsent ? -1 : 1
		return b.max_mark - a.max_mark
	})
}

// Build a "YYYY-MM-DDTHH:mm" value for <input type="datetime-local"> in local time.
function toDatetimeLocal(value?: string | null): string {
	if (!value) return ""
	const d = new Date(value)
	if (isNaN(d.getTime())) return ""
	const pad = (n: number) => String(n).padStart(2, "0")
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDateTime(value?: string | null): string {
	if (!value) return "—"
	const d = new Date(value)
	if (isNaN(d.getTime())) return "—"
	return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function formatDate(value?: string | null): string {
	if (!value) return "—"
	const d = new Date(value)
	if (isNaN(d.getTime())) return "—"
	return d.toLocaleDateString(undefined, { dateStyle: "medium" })
}

export default function PostExamPage() {
	const { toast } = useToast()
	const { user } = useAuth()
	const { institutionId, isReady, mustSelectInstitution } = useInstitutionFilter()

	const [sessions, setSessions] = useState<PostExamSession[]>([])
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)

	// Schedule sheet state
	const [scheduleOpen, setScheduleOpen] = useState(false)
	const [activeSession, setActiveSession] = useState<PostExamSession | null>(null)
	const [scheduleValue, setScheduleValue] = useState("")

	// Confirm dialogs
	const [confirmRelease, setConfirmRelease] = useState<PostExamSession | null>(null)
	const [confirmHide, setConfirmHide] = useState<PostExamSession | null>(null)

	// Grade system viewer
	const [gradeRows, setGradeRows] = useState<GradeSystemRow[]>([])
	const [gradeLoading, setGradeLoading] = useState(false)
	const [gsCode, setGsCode] = useState<"UG" | "PG">("UG")

	const fetchSessions = useCallback(async () => {
		if (!isReady) return
		setLoading(true)
		try {
			const url = institutionId
				? `/api/post-exam?institutions_id=${institutionId}`
				: `/api/post-exam`
			const res = await fetch(url)
			const data = await res.json()
			if (!res.ok) throw new Error(data?.error || "Failed to load")
			setSessions(Array.isArray(data) ? data : [])
		} catch (e) {
			toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to load sessions", variant: "destructive" })
		} finally {
			setLoading(false)
		}
	}, [isReady, institutionId, toast])

	useEffect(() => {
		fetchSessions()
	}, [fetchSessions])

	const fetchGradeSystem = useCallback(async () => {
		if (!isReady || !institutionId) {
			setGradeRows([])
			return
		}
		setGradeLoading(true)
		try {
			const res = await fetch(`/api/grading/grade-system?institutions_id=${institutionId}&is_active=true`)
			const data = await res.json()
			if (!res.ok) throw new Error(data?.error || "Failed to load grade system")
			setGradeRows(Array.isArray(data) ? data : [])
		} catch (e) {
			toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to load grade system", variant: "destructive" })
			setGradeRows([])
		} finally {
			setGradeLoading(false)
		}
	}, [isReady, institutionId, toast])

	useEffect(() => {
		fetchGradeSystem()
	}, [fetchGradeSystem])

	// Rows for the selected System Code (UG/PG), ordered like the official chart.
	const visibleGradeRows = useMemo(
		() => sortGradeRows(gradeRows.filter(r => (r.grade_system_code || "").toUpperCase() === gsCode)),
		[gradeRows, gsCode]
	)

	// Which system codes actually exist for this institution (to show/hide tabs).
	const availableGsCodes = useMemo(() => {
		const set = new Set(gradeRows.map(r => (r.grade_system_code || "").toUpperCase()).filter(Boolean))
		return set
	}, [gradeRows])

	const patchDeclaration = useCallback(async (id: string, value: string | null) => {
		setSaving(true)
		try {
			const res = await fetch("/api/post-exam", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id, result_declaration_date: value, updated_by: user?.id || null }),
			})
			const data = await res.json()
			if (!res.ok) throw new Error(data?.error || "Update failed")
			await fetchSessions()
			return true
		} catch (e) {
			toast({ title: "Error", description: e instanceof Error ? e.message : "Update failed", variant: "destructive" })
			return false
		} finally {
			setSaving(false)
		}
	}, [user?.id, fetchSessions, toast])

	const openSchedule = (s: PostExamSession) => {
		setActiveSession(s)
		setScheduleValue(toDatetimeLocal(s.result_declaration_date))
		setScheduleOpen(true)
	}

	const handleSaveSchedule = async () => {
		if (!activeSession) return
		const ok = await patchDeclaration(activeSession.id, scheduleValue || null)
		if (ok) {
			toast({ title: "Saved", description: "Result declaration date & time updated." })
			setScheduleOpen(false)
			setActiveSession(null)
		}
	}

	const handleReleaseNow = async () => {
		if (!confirmRelease) return
		const ok = await patchDeclaration(confirmRelease.id, new Date().toISOString())
		if (ok) toast({ title: "Released", description: "Published results are now visible to learners." })
		setConfirmRelease(null)
	}

	const handleHide = async () => {
		if (!confirmHide) return
		const ok = await patchDeclaration(confirmHide.id, null)
		if (ok) toast({ title: "Hidden", description: "Results are hidden from learners again." })
		setConfirmHide(null)
	}

	const stats = useMemo(() => {
		const total = sessions.length
		const live = sessions.filter(s => s.is_live_to_learners).length
		const scheduled = sessions.filter(s => s.result_declaration_date && !s.date_reached).length
		const awaitingPublish = sessions.filter(s => s.date_reached && s.published_final_marks === 0).length
		return { total, live, scheduled, awaitingPublish }
	}, [sessions])

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader hideSessionSelector />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-auto">
					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/dashboard">Dashboard</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Post-Exam Result Release</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					<div className="flex items-center justify-between flex-wrap gap-2">
						<div>
							<h1 className="text-lg font-semibold">Post-Exam Result Release</h1>
							<p className="text-sm text-muted-foreground">
								Control when published results become visible to learners in MyJKKN. Results go live only when the
								declaration date &amp; time has arrived <span className="font-medium">and</span> final marks are published.
							</p>
						</div>
						<Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
							<RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
							Refresh
						</Button>
					</div>

					{/* Scorecards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Total Sessions</p>
										<p className="text-xl font-bold">{stats.total}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<CalendarClock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Live to Learners</p>
										<p className="text-xl font-bold">{stats.live}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
										<CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Scheduled</p>
										<p className="text-xl font-bold">{stats.scheduled}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
										<Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Awaiting Publish</p>
										<p className="text-xl font-bold">{stats.awaitingPublish}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-rose-100 dark:bg-rose-900/20 flex items-center justify-center">
										<FileCheck className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{mustSelectInstitution && (
						<div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30 p-3 text-sm text-amber-800 dark:text-amber-300">
							Showing all institutions. Select a specific institution from the top bar to narrow the list.
						</div>
					)}

					{/* Table */}
					<Card>
						<CardContent className="p-0">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Session</TableHead>
										<TableHead>Exam Period</TableHead>
										<TableHead className="text-center">Published / Total</TableHead>
										<TableHead>Declaration Date &amp; Time</TableHead>
										<TableHead className="text-center">Visibility</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{loading ? (
										<TableRow>
											<TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Loading…</TableCell>
										</TableRow>
									) : sessions.length === 0 ? (
										<TableRow>
											<TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No examination sessions found.</TableCell>
										</TableRow>
									) : (
										sessions.map((s) => {
											const hasPublished = s.published_final_marks > 0
											return (
												<TableRow key={s.id}>
													<TableCell>
														<div className="font-medium">{s.session_name}</div>
														<div className="text-xs text-muted-foreground">{s.session_code}{s.month_year ? ` · ${s.month_year}` : ""}</div>
													</TableCell>
													<TableCell className="text-sm whitespace-nowrap">
														{formatDate(s.exam_start_date)} – {formatDate(s.exam_end_date)}
													</TableCell>
													<TableCell className="text-center text-sm">
														<span className={hasPublished ? "font-medium" : "text-muted-foreground"}>
															{s.published_final_marks}
														</span>
														<span className="text-muted-foreground"> / {s.total_final_marks}</span>
													</TableCell>
													<TableCell className="text-sm whitespace-nowrap">{formatDateTime(s.result_declaration_date)}</TableCell>
													<TableCell className="text-center">
														{s.is_live_to_learners ? (
															<Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400">Live</Badge>
														) : s.result_declaration_date && !s.date_reached ? (
															<Badge variant="outline" className="text-amber-700 border-amber-300 dark:text-amber-400">Scheduled</Badge>
														) : s.date_reached && !hasPublished ? (
															<Badge variant="outline" className="text-rose-700 border-rose-300 dark:text-rose-400">Not published</Badge>
														) : (
															<Badge variant="outline" className="text-muted-foreground">Hidden</Badge>
														)}
													</TableCell>
													<TableCell className="text-right">
														<div className="flex items-center justify-end gap-1.5">
															<Button
																variant="outline"
																size="sm"
																onClick={() => setConfirmRelease(s)}
																disabled={saving || !hasPublished}
																title={!hasPublished ? "No published marks yet" : "Make published results visible to learners now"}
															>
																<Send className="h-3.5 w-3.5 mr-1" />
																Release now
															</Button>
															<Button variant="outline" size="sm" onClick={() => openSchedule(s)} disabled={saving}>
																<CalendarClock className="h-3.5 w-3.5 mr-1" />
																Schedule
															</Button>
															{s.result_declaration_date && (
																<Button variant="ghost" size="sm" onClick={() => setConfirmHide(s)} disabled={saving} title="Hide results from learners">
																	<EyeOff className="h-3.5 w-3.5" />
																</Button>
															)}
														</div>
													</TableCell>
												</TableRow>
											)
										})
									)}
								</TableBody>
							</Table>
						</CardContent>
					</Card>

					{/* Grade System (UG / PG) */}
					<Card>
						<CardContent className="p-0">
							<div className="flex items-center justify-between gap-2 flex-wrap p-4 pb-3 border-b">
								<div>
									<h2 className="text-sm font-semibold">Grade System</h2>
									<p className="text-xs text-muted-foreground">Grade bands applied to results for this institution.</p>
								</div>
								<div className="inline-flex rounded-md border p-0.5 bg-muted/40">
									{(["UG", "PG"] as const).map((code) => {
										const disabled = availableGsCodes.size > 0 && !availableGsCodes.has(code)
										return (
											<button
												key={code}
												type="button"
												disabled={disabled}
												onClick={() => setGsCode(code)}
												className={
													`px-3 py-1 text-xs font-medium rounded-[5px] transition-colors ` +
													(gsCode === code
														? "bg-background shadow-sm text-foreground"
														: disabled
															? "text-muted-foreground/40 cursor-not-allowed"
															: "text-muted-foreground hover:text-foreground")
												}
											>
												{code}
											</button>
										)
									})}
								</div>
							</div>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Grade</TableHead>
										<TableHead className="text-center">Grade Point</TableHead>
										<TableHead className="text-center">Min Mark</TableHead>
										<TableHead className="text-center">Max Mark</TableHead>
										<TableHead>Description</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{!institutionId ? (
										<TableRow>
											<TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Select an institution to view its grade system.</TableCell>
										</TableRow>
									) : gradeLoading ? (
										<TableRow>
											<TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
										</TableRow>
									) : visibleGradeRows.length === 0 ? (
										<TableRow>
											<TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No {gsCode} grade system configured.</TableCell>
										</TableRow>
									) : (
										visibleGradeRows.map((g) => (
											<TableRow key={g.id}>
												<TableCell className="font-semibold">{g.grade}</TableCell>
												<TableCell className="text-center">{g.grade_point}</TableCell>
												<TableCell className="text-center">{g.min_mark}</TableCell>
												<TableCell className="text-center">{g.max_mark}</TableCell>
												<TableCell className="text-muted-foreground">{g.description}</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</div>
				<AppFooter />
			</SidebarInset>

			{/* Schedule sheet */}
			<Sheet open={scheduleOpen} onOpenChange={setScheduleOpen}>
				<SheetContent>
					<SheetHeader>
						<SheetTitle>Schedule Result Declaration</SheetTitle>
					</SheetHeader>
					<div className="space-y-4 py-4">
						<div className="text-sm text-muted-foreground">
							{activeSession?.session_name}
						</div>
						<div className="space-y-2">
							<Label htmlFor="schedule_value" className="text-sm font-semibold">Declaration Date &amp; Time</Label>
							<Input
								id="schedule_value"
								type="datetime-local"
								value={scheduleValue}
								onChange={(e) => setScheduleValue(e.target.value)}
								className="h-10"
							/>
							<p className="text-xs text-muted-foreground flex items-center gap-1">
								<Eye className="h-3 w-3" />
								Published results become visible to learners at or after this time. Clear it to hide results.
							</p>
						</div>
					</div>
					<SheetFooter>
						<Button variant="outline" onClick={() => { setScheduleValue("") }} disabled={saving}>Clear</Button>
						<Button onClick={handleSaveSchedule} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>

			{/* Release now confirm */}
			<AlertDialog open={!!confirmRelease} onOpenChange={(o) => !o && setConfirmRelease(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Release results now?</AlertDialogTitle>
						<AlertDialogDescription>
							This sets the result declaration date &amp; time to right now for
							<span className="font-medium"> {confirmRelease?.session_name}</span>. Its {confirmRelease?.published_final_marks} published
							mark record(s) will immediately become visible to learners in MyJKKN.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleReleaseNow}>Release now</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Hide confirm */}
			<AlertDialog open={!!confirmHide} onOpenChange={(o) => !o && setConfirmHide(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Hide results from learners?</AlertDialogTitle>
						<AlertDialogDescription>
							This clears the result declaration date &amp; time for
							<span className="font-medium"> {confirmHide?.session_name}</span>. Results will no longer be returned by the
							learner-facing API until you schedule or release them again.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleHide}>Hide</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
