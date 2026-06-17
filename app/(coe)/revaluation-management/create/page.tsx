'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import { useSessionSync } from '@/hooks/use-session-sync'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { FilePlus, Loader2, CalendarClock, Plus, Trash2 } from 'lucide-react'

interface ExamSession {
	id: string
	session_code: string
	session_name: string
	status: string
}

// Revaluation type sourced from the revaluation_types master table
interface RevType {
	id: string
	type_code: string
	type_name: string
	is_active: boolean
}

// One date window in the form (maps to a revaluation_registration_periods row)
interface PeriodWindow {
	uid: number
	revaluation_type: string
	start_date: string
	end_date: string
	id: string | null // existing DB row id (edit mode)
}

export default function CreateRevaluationPage() {
	const { toast } = useToast()
	const router = useRouter()
	const searchParams = useSearchParams()
	const { institutionId, isReady, filter, mustSelectInstitution, shouldFilter } = useInstitutionFilter()
	const { availableInstitutions } = useInstitution()
	const { selectedSessionId: syncedSessionId, mustSelectSession } = useSessionSync()

	// Edit mode — keyed by the examination session
	const editSessionId = searchParams.get('session_id')
	const isEditMode = !!editSessionId
	const [loadingPeriod, setLoadingPeriod] = useState(false)

	// Institution
	const showInstitutionField = mustSelectInstitution || !shouldFilter || !institutionId
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const effectiveInstitutionId = showInstitutionField ? selectedInstitutionId : institutionId
	const effectiveInstitutionCode = showInstitutionField
		? availableInstitutions.find((i) => i.id === selectedInstitutionId)?.institution_code
		: filter?.institution_code

	// Session
	const [sessions, setSessions] = useState<ExamSession[]>([])
	const [session, setSession] = useState({
		examination_session_id: '',
		session_code: '',
		session_name: '',
	})

	// Revaluation types (master) + windows
	const [types, setTypes] = useState<RevType[]>([])
	const uidRef = useRef(1)
	const newUid = () => uidRef.current++
	const [windows, setWindows] = useState<PeriodWindow[]>([
		{ uid: 0, revaluation_type: '', start_date: '', end_date: '', id: null },
	])
	// Ids loaded in edit mode — used to compute deletions on save
	const [initialIds, setInitialIds] = useState<string[]>([])

	// Shared settings applied to every window
	const [shared, setShared] = useState({
		max_courses_per_application: 10,
		instructions: '',
	})

	const [errors, setErrors] = useState<Record<string, string>>({})
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [saving, setSaving] = useState(false)

	// Fetch active revaluation types for the dropdown
	useEffect(() => {
		const fetchTypes = async () => {
			try {
				const res = await fetch('/api/revaluation/types?is_active=true')
				if (res.ok) {
					const data = await res.json()
					setTypes(Array.isArray(data) ? data : [])
				}
			} catch (error) {
				console.error('Failed to fetch revaluation types:', error)
			}
		}
		fetchTypes()
	}, [])

	// Fetch exam sessions for the effective institution
	useEffect(() => {
		if (!isReady || !effectiveInstitutionId) {
			setSessions([])
			return
		}
		const fetchSessions = async () => {
			setLoadingSessions(true)
			try {
				const response = await fetch(
					`/api/examination-sessions?institutions_id=${effectiveInstitutionId}`
				)
				if (response.ok) {
					const data = await response.json()
					setSessions(data)
				}
			} catch (error) {
				console.error('Failed to fetch sessions:', error)
			} finally {
				setLoadingSessions(false)
			}
		}
		fetchSessions()
	}, [isReady, effectiveInstitutionId])

	// Load existing windows in edit mode
	useEffect(() => {
		if (!isReady || !editSessionId) return

		const loadPeriods = async () => {
			setLoadingPeriod(true)
			try {
				const response = await fetch(
					`/api/revaluation/registration-periods?examination_session_id=${editSessionId}`
				)
				if (response.ok) {
					const data = await response.json()
					const rows: any[] = Array.isArray(data) ? data : []
					if (rows.length === 0) {
						toast({
							title: '❌ Not Found',
							description: 'No revaluation periods found for this session.',
							variant: 'destructive',
						})
						router.push('/revaluation-management/periods')
						return
					}

					const first = rows[0]
					setSelectedInstitutionId(first.institutions_id)
					setSession({
						examination_session_id: first.examination_session_id,
						session_code: first.session_code || '',
						session_name: first.session_name || '',
					})
					setShared({
						max_courses_per_application: first.max_courses_per_application || 10,
						instructions: first.instructions || '',
					})
					setWindows(
						rows.map((row) => ({
							uid: newUid(),
							revaluation_type: row.revaluation_type || 'REVALUATION',
							start_date: row.start_date ? row.start_date.slice(0, 16) : '',
							end_date: row.end_date ? row.end_date.slice(0, 16) : '',
							id: row.id,
						}))
					)
					setInitialIds(rows.map((r) => r.id))
				}
			} catch (error) {
				console.error('Failed to load periods:', error)
			} finally {
				setLoadingPeriod(false)
			}
		}

		loadPeriods()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isReady, editSessionId])

	// Auto-fill session from the global session selector (create mode only)
	useEffect(() => {
		if (isEditMode) return
		if (syncedSessionId && sessions.length > 0) {
			const match = sessions.find((s) => s.id === syncedSessionId)
			if (match) {
				setSession({
					examination_session_id: syncedSessionId,
					session_code: match.session_code || '',
					session_name: match.session_name || '',
				})
			}
		}
	}, [syncedSessionId, sessions, isEditMode])

	const handleSessionChange = (sessionId: string) => {
		const match = sessions.find((s) => s.id === sessionId)
		setSession({
			examination_session_id: sessionId,
			session_code: match?.session_code || '',
			session_name: match?.session_name || '',
		})
		setErrors({})
	}

	const updateWindow = (uid: number, patch: Partial<PeriodWindow>) => {
		setWindows((prev) => prev.map((w) => (w.uid === uid ? { ...w, ...patch } : w)))
	}

	const addWindow = () => {
		setWindows((prev) => [
			...prev,
			{ uid: newUid(), revaluation_type: '', start_date: '', end_date: '', id: null },
		])
	}

	const removeWindow = (uid: number) => {
		setWindows((prev) => (prev.length > 1 ? prev.filter((w) => w.uid !== uid) : prev))
	}

	// Types already chosen in other windows (to avoid duplicates in the dropdown)
	const usedTypes = (currentUid: number) =>
		windows.filter((w) => w.uid !== currentUid && w.revaluation_type).map((w) => w.revaluation_type)

	const validate = () => {
		const e: Record<string, string> = {}

		if (showInstitutionField && !selectedInstitutionId) e.institution = 'Institution is required'
		if (!session.examination_session_id) e.session = 'Examination session is required'

		const filled = windows.filter((w) => w.revaluation_type)
		if (filled.length === 0) {
			e.windows = 'Add at least one revaluation type with its dates'
		}

		const seen = new Set<string>()
		for (const w of windows) {
			if (!w.revaluation_type) {
				e[`type_${w.uid}`] = 'Select a revaluation type'
				continue
			}
			if (seen.has(w.revaluation_type)) {
				e[`type_${w.uid}`] = 'Duplicate revaluation type'
			}
			seen.add(w.revaluation_type)
			if (!w.start_date) e[`start_${w.uid}`] = 'Start date is required'
			if (!w.end_date) e[`end_${w.uid}`] = 'End date is required'
			if (w.start_date && w.end_date && new Date(w.end_date) <= new Date(w.start_date)) {
				e[`end_${w.uid}`] = 'End date must be after start date'
			}
		}

		setErrors(e)
		return Object.keys(e).length === 0
	}

	const handleSave = async () => {
		if (!validate()) {
			toast({
				title: '❌ Validation Error',
				description: 'Please fix the errors before saving',
				variant: 'destructive',
			})
			return
		}

		setSaving(true)

		// Create/update each window; delete windows removed in edit mode
		const ops: { label: string; run: () => Promise<Response> }[] = []

		for (const w of windows) {
			if (!w.revaluation_type) continue
			const label = types.find((t) => t.type_code === w.revaluation_type)?.type_name || w.revaluation_type
			if (w.id) {
				ops.push({
					label,
					run: () =>
						fetch('/api/revaluation/registration-periods', {
							method: 'PUT',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								id: w.id,
								start_date: w.start_date,
								end_date: w.end_date,
								instructions: shared.instructions,
								is_active: true,
								max_courses_per_application: shared.max_courses_per_application,
							}),
						}),
				})
			} else {
				ops.push({
					label,
					run: () =>
						fetch('/api/revaluation/registration-periods', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								institutions_id: effectiveInstitutionId,
								institution_code: effectiveInstitutionCode,
								examination_session_id: session.examination_session_id,
								session_code: session.session_code,
								session_name: session.session_name,
								revaluation_type: w.revaluation_type,
								start_date: w.start_date,
								end_date: w.end_date,
								instructions: shared.instructions,
								is_active: true,
								max_courses_per_application: shared.max_courses_per_application,
							}),
						}),
				})
			}
		}

		// Deletions: ids loaded initially but no longer present
		const currentIds = windows.map((w) => w.id).filter(Boolean) as string[]
		for (const id of initialIds) {
			if (!currentIds.includes(id)) {
				ops.push({
					label: 'Removed window',
					run: () =>
						fetch(`/api/revaluation/registration-periods?id=${id}`, { method: 'DELETE' }),
				})
			}
		}

		try {
			const failures: string[] = []
			for (const op of ops) {
				try {
					const res = await op.run()
					if (!res.ok) {
						const err = await res.json().catch(() => ({}))
						failures.push(`${op.label}: ${err.error || 'failed'}`)
					}
				} catch {
					failures.push(`${op.label}: request failed`)
				}
			}

			if (failures.length > 0) {
				toast({
					title: '⚠️ Some windows could not be saved',
					description: failures.join('; '),
					variant: 'destructive',
				})
				if (failures.length === ops.length) {
					setSaving(false)
					return
				}
			} else {
				toast({
					title: isEditMode ? '✅ Updated Successfully' : '✅ Created Successfully',
					description: `Revaluation periods for ${session.session_code} have been ${
						isEditMode ? 'updated' : 'created'
					}`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
			}

			router.push('/revaluation-management/periods')
		} finally {
			setSaving(false)
		}
	}

	if (!isReady || loadingPeriod) {
		return (
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="flex flex-col min-h-screen">
					<AppHeader />
					<PageTransition>
						<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
							<div className="flex items-center justify-center min-h-[400px]">
								<div className="text-center">
									<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
									<p className="text-sm text-gray-600">Loading...</p>
								</div>
							</div>
						</div>
					</PageTransition>
					<AppFooter />
				</SidebarInset>
			</SidebarProvider>
		)
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
						{/* Breadcrumb */}
						<div className="flex items-center gap-2">
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
											<Link href="/revaluation-management/periods">Revaluation Periods</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>
											{isEditMode ? 'Edit Revaluation Period' : 'Create Revaluation Period'}
										</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>

						{/* Header */}
						<div>
							<h1 className="text-3xl font-bold text-gray-900">
								{isEditMode ? 'Edit Revaluation Period' : 'Create Revaluation Period'}
							</h1>
							<p className="text-gray-600 mt-1">
								Select a revaluation type and set its application from/to dates — add as
								many types as you need
							</p>
						</div>

						{/* Form Card */}
						<Card>
							<CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
								<CardTitle className="flex items-center gap-2 text-blue-900">
									<FilePlus className="h-5 w-5" />
									Revaluation Period Details
								</CardTitle>
								<CardDescription className="text-blue-700">
									Configure the revaluation application windows for an examination session
								</CardDescription>
							</CardHeader>
							<CardContent className="pt-6 space-y-6">
								{/* Session / Institution */}
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									{showInstitutionField && (
										<div className="space-y-2">
											<Label htmlFor="institution">
												Institution <span className="text-red-500">*</span>
											</Label>
											<Select
												value={selectedInstitutionId}
												disabled={isEditMode}
												onValueChange={(value) => {
													setSelectedInstitutionId(value)
													setSession({
														examination_session_id: '',
														session_code: '',
														session_name: '',
													})
													setErrors({})
												}}
											>
												<SelectTrigger
													id="institution"
													className={errors.institution ? 'border-red-500' : ''}
												>
													<SelectValue placeholder="Select institution" />
												</SelectTrigger>
												<SelectContent>
													{availableInstitutions.map((inst) => (
														<SelectItem key={inst.id} value={inst.id}>
															{inst.institution_name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{errors.institution && (
												<p className="text-sm text-red-500">{errors.institution}</p>
											)}
										</div>
									)}

									{(mustSelectSession || isEditMode) && (
										<div className="space-y-2">
											<Label htmlFor="session">
												Examination Session <span className="text-red-500">*</span>
											</Label>
											<Select
												value={session.examination_session_id}
												onValueChange={handleSessionChange}
												disabled={loadingSessions || isEditMode}
											>
												<SelectTrigger
													id="session"
													className={errors.session ? 'border-red-500' : ''}
												>
													<SelectValue
														placeholder={loadingSessions ? 'Loading...' : 'Select examination session'}
													/>
												</SelectTrigger>
												<SelectContent>
													{sessions.map((s) => (
														<SelectItem key={s.id} value={s.id}>
															{s.session_code}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{errors.session && <p className="text-sm text-red-500">{errors.session}</p>}
										</div>
									)}
								</div>

								{/* Revaluation type windows */}
								<div className="space-y-3">
									<div className="flex items-center justify-between">
										<Label className="text-base font-semibold text-gray-900">
											Revaluation Types & Date Windows <span className="text-red-500">*</span>
										</Label>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={addWindow}
											disabled={types.length > 0 && windows.length >= types.length}
										>
											<Plus className="mr-1 h-4 w-4" />
											Add Type
										</Button>
									</div>
									{errors.windows && <p className="text-sm text-red-500">{errors.windows}</p>}

									<div className="space-y-3">
										{windows.map((w) => {
											const used = usedTypes(w.uid)
											return (
												<div
													key={w.uid}
													className="rounded-lg border border-gray-200 bg-gray-50/50 p-4"
												>
													<div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
														{/* Type */}
														<div className="md:col-span-4 space-y-2">
															<Label className="text-sm">
																Revaluation Type <span className="text-red-500">*</span>
															</Label>
															<Select
																value={w.revaluation_type}
																disabled={!!w.id}
																onValueChange={(value) =>
																	updateWindow(w.uid, { revaluation_type: value })
																}
															>
																<SelectTrigger
																	className={errors[`type_${w.uid}`] ? 'border-red-500' : ''}
																>
																	<SelectValue placeholder="Select type" />
																</SelectTrigger>
																<SelectContent>
																	{types
																		.filter(
																			(t) =>
																				!used.includes(t.type_code) ||
																				t.type_code === w.revaluation_type
																		)
																		.map((t) => (
																			<SelectItem key={t.id} value={t.type_code}>
																				{t.type_name}
																			</SelectItem>
																		))}
																</SelectContent>
															</Select>
															{errors[`type_${w.uid}`] && (
																<p className="text-sm text-red-500">{errors[`type_${w.uid}`]}</p>
															)}
														</div>

														{/* From */}
														<div className="md:col-span-4 space-y-2">
															<Label className="text-sm">
																From Date <span className="text-red-500">*</span>
															</Label>
															<div className="relative">
																<CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
																<Input
																	type="datetime-local"
																	value={w.start_date}
																	onChange={(e) => updateWindow(w.uid, { start_date: e.target.value })}
																	className={`pl-10 ${errors[`start_${w.uid}`] ? 'border-red-500' : ''}`}
																/>
															</div>
															{errors[`start_${w.uid}`] && (
																<p className="text-sm text-red-500">{errors[`start_${w.uid}`]}</p>
															)}
														</div>

														{/* To */}
														<div className="md:col-span-3 space-y-2">
															<Label className="text-sm">
																To Date <span className="text-red-500">*</span>
															</Label>
															<div className="relative">
																<CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
																<Input
																	type="datetime-local"
																	value={w.end_date}
																	onChange={(e) => updateWindow(w.uid, { end_date: e.target.value })}
																	className={`pl-10 ${errors[`end_${w.uid}`] ? 'border-red-500' : ''}`}
																/>
															</div>
															{errors[`end_${w.uid}`] && (
																<p className="text-sm text-red-500">{errors[`end_${w.uid}`]}</p>
															)}
														</div>

														{/* Remove */}
														<div className="md:col-span-1 flex md:justify-end md:pt-7">
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="text-red-500 hover:text-red-600 hover:bg-red-50"
																onClick={() => removeWindow(w.uid)}
																disabled={windows.length === 1}
																title="Remove"
															>
																<Trash2 className="h-4 w-4" />
															</Button>
														</div>
													</div>
												</div>
											)
										})}
									</div>

									{types.length === 0 && (
										<p className="text-sm text-amber-600">
											No active revaluation types found. Add types in the Revaluation Types
											master before creating a period.
										</p>
									)}
								</div>

								{/* Shared settings */}
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
									<div className="space-y-2">
										<Label htmlFor="max-courses">Maximum Courses Per Application</Label>
										<Input
											id="max-courses"
											type="number"
											min="1"
											max="20"
											value={shared.max_courses_per_application}
											onChange={(e) =>
												setShared({ ...shared, max_courses_per_application: Number(e.target.value) })
											}
										/>
										<p className="text-xs text-gray-500">Applies to every revaluation type</p>
									</div>

									<div className="space-y-2 md:row-span-2">
										<Label htmlFor="instructions">Instructions for Learners (Optional)</Label>
										<Textarea
											id="instructions"
											rows={4}
											placeholder="Enter any special instructions or notes for learners applying for revaluation..."
											value={shared.instructions}
											onChange={(e) => setShared({ ...shared, instructions: e.target.value })}
										/>
										<p className="text-xs text-gray-500">
											Shown to learners when applying. Applies to every type.
										</p>
									</div>
								</div>

								{/* Actions */}
								<div className="flex justify-end gap-3 mt-2 pt-6 border-t">
									<Button
										variant="outline"
										onClick={() => router.push('/revaluation-management/periods')}
									>
										Cancel
									</Button>
									<Button
										onClick={handleSave}
										disabled={saving}
										className="bg-blue-600 hover:bg-blue-700"
									>
										{saving ? (
											<>
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
												{isEditMode ? 'Updating...' : 'Creating...'}
											</>
										) : (
											<>
												<FilePlus className="mr-2 h-4 w-4" />
												{isEditMode ? 'Update Revaluation Periods' : 'Create Revaluation Periods'}
											</>
										)}
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
