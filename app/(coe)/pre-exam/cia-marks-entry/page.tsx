'use client'

import { useState, useEffect } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import Link from 'next/link'
import { Loader2, Save, Lock, Unlock } from 'lucide-react'

interface CIASetting {
	id: string
	setting_name: string
	institution_code: string
	cia_rounds: Array<{
		round: number
		round_name: string
		components: Array<{ code: string; name: string; max_marks: number }>
	}>
}

interface ExamRegistration {
	id: string
	student_id: string
	stu_register_no: string
	learner_name: string
}

interface CIAMark {
	id: string
	exam_registration_id: string
	cia_round: number
	component_marks: Record<string, number> | null
	extra_marks: Record<string, number> | null
	round_total_marks: number
	is_locked: boolean
}

// Standard 13 component codes — these map to dedicated columns on cia_marks.
// Anything outside this set goes into the extra_marks JSONB column.
const STANDARD_COMPONENT_CODES = new Set([
	'assignment',
	'quiz',
	'mid_term',
	'presentation',
	'attendance',
	'lab',
	'project',
	'seminar',
	'viva',
	'other',
	'test_1',
	'test_2',
	'test_3',
])

export default function CIAMarksEntryPage() {
	const { toast } = useToast()
	const { institutionId: userInstitutionId } = useInstitutionFilter()

	const [settings, setSettings] = useState<CIASetting[]>([])
	const [registrations, setRegistrations] = useState<ExamRegistration[]>([])
	const [marks, setMarks] = useState<CIAMark[]>([])

	const [selectedSettingId, setSelectedSettingId] = useState('')
	const [selectedRound, setSelectedRound] = useState<number | null>(null)

	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)

	// Local form state for marks entry
	const [formMarks, setFormMarks] = useState<Record<string, Record<string, number>>>({})

	useEffect(() => {
		if (userInstitutionId) fetchSettings()
	}, [userInstitutionId])

	const fetchSettings = async () => {
		try {
			const res = await fetch(`/api/pre-exam/cia-entry-settings?institutions_id=${userInstitutionId}`)
			const data = await res.json()
			setSettings(Array.isArray(data) ? data : [])
		} catch (e) {
			toast({ title: '❌ Failed to load settings', variant: 'destructive' })
		}
	}

	const handleSettingChange = async (settingId: string) => {
		setSelectedSettingId(settingId)
		setSelectedRound(null)
		setRegistrations([])
		setMarks([])
		setFormMarks({})

		if (!settingId) return

		try {
			setLoading(true)
			const setting = settings.find(s => s.id === settingId)
			if (!setting) return

			// Fetch registrations
			const regRes = await fetch(
				`/api/exam-registrations?institutions_id=${userInstitutionId}&examination_session_id=${setting.id}`
			)
			const regData = await regRes.json()
			setRegistrations(Array.isArray(regData) ? regData : [])
		} catch (e) {
			toast({ title: '❌ Failed to load registrations', variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}

	const handleRoundChange = async (round: number) => {
		setSelectedRound(round)
		setFormMarks({})

		if (!selectedSettingId) return

		try {
			setLoading(true)
			const res = await fetch(
				`/api/pre-exam/cia-marks?cia_setting_id=${selectedSettingId}&cia_round=${round}`
			)
			const data = await res.json()
			setMarks(Array.isArray(data) ? data : [])

			// Initialize form marks from existing marks (read both component_marks
			// and extra_marks; UI uses component code as the form key)
			const initial: Record<string, Record<string, number>> = {}
			for (const mark of data) {
				initial[mark.exam_registration_id] = {
					...(mark.component_marks || {}),
					...(mark.extra_marks || {}),
				}
			}
			setFormMarks(initial)
		} catch (e) {
			toast({ title: '❌ Failed to load marks', variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}

	const handleComponentMarkChange = (regId: string, componentCode: string, value: number) => {
		setFormMarks(prev => ({
			...prev,
			[regId]: { ...prev[regId], [componentCode]: value },
		}))
	}

	const handleSaveMarks = async () => {
		if (!selectedSettingId || selectedRound === null) return

		try {
			setSaving(true)
			const setting = settings.find(s => s.id === selectedSettingId)
			const round = setting?.cia_rounds.find(r => r.round === selectedRound)
			if (!setting || !round) return

			for (const reg of registrations) {
				const formData = formMarks[reg.id] || {}

				// Split components into standard (→ fixed columns) vs custom (→ extra_marks)
				const componentMarks: Record<string, number> = {}
				const extraMarks: Record<string, number> = {}
				const extraMarksMax: Record<string, number> = {}
				let roundTotal = 0

				for (const comp of round.components) {
					const score = Number(formData[comp.code]) || 0
					if (STANDARD_COMPONENT_CODES.has(comp.code)) {
						componentMarks[comp.code] = score
					} else {
						extraMarks[comp.code] = score
						extraMarksMax[comp.code] = comp.max_marks
					}
					roundTotal += score
				}

				// Look up the existing mark from outer state — DO NOT shadow `marks`
				const existing = marks.find(m => m.exam_registration_id === reg.id)

				const payload = {
					...(existing ? { id: existing.id } : {}),
					institutions_id: userInstitutionId,
					examination_session_id: setting.id,
					exam_registration_id: reg.id,
					student_id: reg.student_id,
					cia_setting_id: selectedSettingId,
					cia_round: selectedRound,
					cia_round_name: round.round_name,
					component_marks: componentMarks,
					extra_marks: extraMarks,
					extra_marks_max: extraMarksMax,
					round_total_marks: roundTotal,
					submission_date: new Date().toISOString().slice(0, 10),
				}

				const method = existing ? 'PUT' : 'POST'
				const res = await fetch('/api/pre-exam/cia-marks', {
					method,
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				})

				if (!res.ok) {
					const result = await res.json()
					toast({ title: `❌ Failed to save marks for ${reg.learner_name}`, description: result.error, variant: 'destructive' })
					return
				}
			}

			toast({ title: '✅ Marks saved', description: 'All learner marks have been saved.', className: 'bg-green-50 border-green-200 text-green-800' })
			await handleRoundChange(selectedRound)
		} catch (e) {
			toast({ title: '❌ Save failed', variant: 'destructive' })
		} finally {
			setSaving(false)
		}
	}

	const handleLockMarks = async (markId: string, isLocking: boolean) => {
		try {
			const res = await fetch(`/api/pre-exam/cia-marks/${markId}/lock`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: isLocking ? 'lock' : 'unlock' }),
			})

			if (res.ok) {
				toast({ title: `✅ Marks ${isLocking ? 'locked' : 'unlocked'}`, className: 'bg-green-50 border-green-200 text-green-800' })
				if (selectedRound !== null) await handleRoundChange(selectedRound)
			} else {
				const result = await res.json()
				toast({ title: '❌ Failed', description: result.error, variant: 'destructive' })
			}
		} catch (e) {
			toast({ title: '❌ Error', variant: 'destructive' })
		}
	}

	const selectedSetting = settings.find(s => s.id === selectedSettingId)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader>
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbLink>Pre-Exam</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>CIA Marks Entry</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto">
					{/* Selection Cards */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Card>
							<CardHeader className="pb-2">
								<h3 className="text-sm font-semibold">CIA Setting</h3>
							</CardHeader>
							<CardContent className="space-y-2">
								<Select value={selectedSettingId} onValueChange={handleSettingChange}>
									<SelectTrigger><SelectValue placeholder="Select CIA setting..." /></SelectTrigger>
									<SelectContent>
										{settings.map(s => (
											<SelectItem key={s.id} value={s.id}>{s.setting_name}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-2">
								<h3 className="text-sm font-semibold">CIA Round</h3>
							</CardHeader>
							<CardContent className="space-y-2">
								<Select
									value={selectedRound?.toString() || ''}
									onValueChange={v => handleRoundChange(parseInt(v))}
									disabled={!selectedSettingId}
								>
									<SelectTrigger><SelectValue placeholder="Select round..." /></SelectTrigger>
									<SelectContent>
										{selectedSetting?.cia_rounds.map(r => (
											<SelectItem key={r.round} value={r.round.toString()}>{r.round_name}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</CardContent>
						</Card>
					</div>

					{/* Marks Entry Table */}
					{selectedRound !== null && selectedSetting && (
						<Card>
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between">
									<div>
										<h2 className="text-base font-semibold">Mark Entry</h2>
										<p className="text-xs text-muted-foreground">{selectedSetting.setting_name}</p>
									</div>
									<Button
										onClick={handleSaveMarks}
										disabled={saving || loading}
										className="gap-1"
									>
										{saving && <Loader2 className="h-4 w-4 animate-spin" />}
										<Save className="h-4 w-4" />
										Save All
									</Button>
								</div>
							</CardHeader>
							<CardContent>
								{loading ? (
									<div className="flex items-center justify-center py-8">
										<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
									</div>
								) : (
									<div className="overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-32">Reg. No.</TableHead>
													<TableHead>Learner Name</TableHead>
													{selectedSetting.cia_rounds.find(r => r.round === selectedRound)?.components.map(comp => (
														<TableHead key={comp.code} className="text-center w-20">
															<div className="text-xs">{comp.name}</div>
															<div className="text-xs text-muted-foreground">/{comp.max_marks}</div>
														</TableHead>
													))}
													<TableHead className="text-center w-20">Total</TableHead>
													<TableHead className="w-16">Action</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{registrations.map(reg => {
													const markEntry = marks.find(m => m.exam_registration_id === reg.id)
													const formData = formMarks[reg.id] || {}
													const roundDef = selectedSetting.cia_rounds.find(r => r.round === selectedRound)

													let total = 0
													roundDef?.components.forEach(comp => {
														total += Number(formData[comp.code]) || 0
													})

													return (
														<TableRow key={reg.id} className={markEntry?.is_locked ? 'bg-amber-50' : ''}>
															<TableCell className="text-sm font-medium">{reg.stu_register_no}</TableCell>
															<TableCell className="text-sm">{reg.learner_name}</TableCell>
															{roundDef?.components.map(comp => (
																<TableCell key={comp.code} className="p-1">
																	<Input
																		type="number"
																		min={0}
																		max={comp.max_marks}
																		value={formData[comp.code] ?? ''}
																		onChange={e => handleComponentMarkChange(reg.id, comp.code, parseInt(e.target.value) || 0)}
																		disabled={markEntry?.is_locked}
																		className="h-7 text-xs text-center"
																	/>
																</TableCell>
															))}
															<TableCell className="text-sm font-semibold text-center">{total}</TableCell>
															<TableCell>
																{markEntry && (
																	<Button
																		variant="ghost"
																		size="sm"
																		onClick={() => handleLockMarks(markEntry.id, !markEntry.is_locked)}
																		className="h-6 w-6 p-0"
																		title={markEntry.is_locked ? 'Unlock' : 'Lock'}
																	>
																		{markEntry.is_locked ? (
																			<Lock className="h-3.5 w-3.5 text-amber-600" />
																		) : (
																			<Unlock className="h-3.5 w-3.5 text-muted-foreground" />
																		)}
																	</Button>
																)}
															</TableCell>
														</TableRow>
													)
												})}
											</TableBody>
										</Table>
									</div>
								)}
							</CardContent>
						</Card>
					)}
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
