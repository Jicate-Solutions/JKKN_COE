'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/hooks/common/use-toast'
import { Loader2, Award, Check, ChevronsUpDown, Users, FileCheck, AlertTriangle, ExternalLink, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useMyJKKNInstitutionFilter } from '@/hooks/use-myjkkn-institution-filter'

interface Institution {
	id: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids?: string[] | null
}

interface Program { program_code: string; program_name: string }
interface Eligible { id: string; registerNo: string; name: string }
interface GenerateResult {
	generated: number
	folioAssignedCount: number
	folioResults: Array<{
		consolidated_result_id: string
		assigned_folio_prefix: string
		assigned_folio_number: number
		assigned_formatted_folio: string
		success: boolean
		error_message?: string | null
	}>
	learners: Array<Eligible & { folio?: string | null }>
	skipped: Array<{ studentId: string; registerNo: string; reason: string }>
}

export default function GenerateConsolidatedMarksheetPage() {
	const { toast } = useToast()
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId
	} = useInstitutionFilter()
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [eligible, setEligible] = useState<Eligible[]>([])

	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const [selectedProgramCode, setSelectedProgramCode] = useState('')
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingEligible, setLoadingEligible] = useState(false)
	const [generating, setGenerating] = useState(false)

	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)

	const [result, setResult] = useState<GenerateResult | null>(null)
	const [existingFolios, setExistingFolios] = useState<Record<string, string>>({})

	useEffect(() => { if (isReady) fetchInstitutions() }, [isReady])
	useEffect(() => {
		if (isReady && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, contextInstitutionId, selectedInstitutionId])

	const fetchInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/exam-management/exam-attendance/dropdowns?type=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
				if (data.length === 1) setSelectedInstitutionId(data[0].id)
				else if (shouldFilter && contextInstitutionId) setSelectedInstitutionId(contextInstitutionId)
				else if (!mustSelectInstitution && contextInstitutionId) setSelectedInstitutionId(contextInstitutionId)
			}
		} catch (e) {
			console.error('[Generate Consolidated] institutions:', e)
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, shouldFilter, mustSelectInstitution, contextInstitutionId])

	const fetchPrograms = useCallback(async (institutionId: string) => {
		try {
			setLoadingPrograms(true)
			setPrograms([])
			const inst = institutions.find(i => i.id === institutionId)
			const myjkknIds = inst?.myjkkn_institution_ids || []
			if (myjkknIds.length === 0) { setPrograms([]); return }
			const progs = await fetchMyJKKNPrograms(myjkknIds)
			setPrograms(progs.map((p: any) => ({ program_code: p.program_code, program_name: p.program_name })))
		} catch (e) {
			console.error('[Generate Consolidated] programs:', e)
			setPrograms([])
		} finally {
			setLoadingPrograms(false)
		}
	}, [institutions, fetchMyJKKNPrograms])

	useEffect(() => {
		if (selectedInstitutionId && institutions.length > 0) {
			setSelectedProgramCode('')
			setEligible([])
			setSelectedIds(new Set())
			setResult(null)
			setExistingFolios({})
			fetchPrograms(selectedInstitutionId)
		}
	}, [selectedInstitutionId, institutions.length, fetchPrograms])

	const fetchEligible = useCallback(async (institutionId: string, programCode: string) => {
		try {
			setLoadingEligible(true)
			setEligible([])
			setSelectedIds(new Set())
			const res = await fetch(`/api/reports/consolidated-marksheet?action=students&institutionId=${institutionId}&programCode=${encodeURIComponent(programCode)}`)
			const data = await res.json()
			if (!res.ok) {
				toast({ title: '❌ Error', description: data?.error || 'Failed to load eligible learners', variant: 'destructive' })
				return
			}
			const list: Eligible[] = data.students || []
			setEligible(list)
			// Select all by default
			setSelectedIds(new Set(list.map(l => l.id)))

			// Fetch existing folios so we can show "already generated" status
			if (list.length > 0) {
				const folioRes = await fetch(`/api/reports/consolidated-marksheet?action=batch-marksheet&institutionId=${institutionId}&programCode=${encodeURIComponent(programCode)}`)
				if (folioRes.ok) {
					const folioData = await folioRes.json()
					const map: Record<string, string> = {}
					for (const m of (folioData.marksheets || [])) {
						if (m.summary?.formattedFolio) map[m.student.id] = m.summary.formattedFolio
					}
					setExistingFolios(map)
				}
			}
		} catch (e) {
			console.error('[Generate Consolidated] eligible:', e)
		} finally {
			setLoadingEligible(false)
		}
	}, [toast])

	useEffect(() => {
		if (selectedInstitutionId && selectedProgramCode) {
			setResult(null)
			fetchEligible(selectedInstitutionId, selectedProgramCode)
		}
	}, [selectedProgramCode, selectedInstitutionId, fetchEligible])

	const toggleOne = (id: string, checked: boolean) => {
		setSelectedIds(prev => {
			const next = new Set(prev)
			if (checked) next.add(id)
			else next.delete(id)
			return next
		})
	}

	const toggleAll = (checked: boolean) => {
		if (checked) setSelectedIds(new Set(eligible.map(l => l.id)))
		else setSelectedIds(new Set())
	}

	const handleGenerate = async () => {
		if (!selectedInstitutionId || !selectedProgramCode) {
			toast({ title: '❌ Missing Filters', description: 'Select institution and program', variant: 'destructive' })
			return
		}
		if (selectedIds.size === 0) {
			toast({ title: '❌ No Learners Selected', description: 'Select at least one learner', variant: 'destructive' })
			return
		}
		try {
			setGenerating(true)
			setResult(null)
			const res = await fetch('/api/reports/consolidated-marksheet', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'generate',
					institutionId: selectedInstitutionId,
					programCode: selectedProgramCode,
					studentIds: Array.from(selectedIds)
				})
			})
			const data = await res.json()
			if (!res.ok) {
				toast({ title: '❌ Error', description: data?.error || 'Failed to generate', variant: 'destructive' })
				return
			}

			// Merge folio assignments into learner list
			const folioByRowId = new Map<string, string>()
			for (const fr of (data.folioResults || [])) {
				if (fr.success && fr.consolidated_result_id) {
					folioByRowId.set(fr.consolidated_result_id, fr.assigned_formatted_folio)
				}
			}
			const learnersWithFolios = (data.learners || []).map((l: any) => ({
				...l,
				folio: folioByRowId.get(l.id) || existingFolios[l.studentId] || null
			}))
			setResult({ ...data, learners: learnersWithFolios })

			// Refresh existing folio map
			const newMap = { ...existingFolios }
			for (const l of learnersWithFolios) {
				if (l.folio) newMap[l.studentId] = l.folio
			}
			setExistingFolios(newMap)

			toast({
				title: '✅ Generated',
				description: `${data.generated} marksheet(s) generated, ${data.folioAssignedCount} folio(s) assigned${data.skipped?.length > 0 ? `, ${data.skipped.length} skipped` : ''}`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (e) {
			console.error('[Generate Consolidated]', e)
			toast({ title: '❌ Error', description: 'Generation failed', variant: 'destructive' })
		} finally {
			setGenerating(false)
		}
	}

	const handleCopyShare = async (folio: string) => {
		const url = `${window.location.origin}/reports/consolidated-marksheet/${encodeURIComponent(folio)}`
		try {
			await navigator.clipboard.writeText(url)
			toast({
				title: '✅ Link Copied',
				description: url,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch {
			toast({ title: '❌ Copy failed', variant: 'destructive' })
		}
	}

	const totalChecked = selectedIds.size
	const allChecked = eligible.length > 0 && totalChecked === eligible.length

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
									<Link href="#">Grading</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Consolidated Marksheet</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Filter Card */}
					<Card>
						<CardHeader className="pb-4">
							<CardTitle className="flex items-center gap-2">
								<Award className="h-5 w-5" />
								Generate Consolidated Marksheets
							</CardTitle>
							<CardDescription>
								Computes overall CGPA + part-wise CGPA across all semesters and assigns a consolidated folio number (CJU24UC0001 format).
								Only learners who have cleared every course across every semester of the program are eligible.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Institution */}
								{(mustSelectInstitution || !shouldFilter) && (
									<div className="space-y-2">
										<Label>Institution</Label>
										<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
											<PopoverTrigger asChild>
												<Button variant="outline" role="combobox" className="w-full justify-between" disabled={loadingInstitutions}>
													{loadingInstitutions ? (
														<span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading...</span>
													) : selectedInstitutionId ? (
														institutions.find(i => i.id === selectedInstitutionId)?.institution_code
													) : 'Select institution'}
													{!loadingInstitutions && <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />}
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[300px] p-0">
												<Command>
													<CommandInput placeholder="Search institution..." />
													<CommandList>
														<CommandEmpty>No institution found.</CommandEmpty>
														<CommandGroup>
															{institutions.map(inst => (
																<CommandItem
																	key={inst.id}
																	value={`${inst.institution_code} ${inst.institution_name}`}
																	keywords={[inst.institution_code, inst.institution_name]}
																	onSelect={() => { setSelectedInstitutionId(inst.id); setInstitutionOpen(false) }}
																>
																	<Check className={cn('mr-2 h-4 w-4', selectedInstitutionId === inst.id ? 'opacity-100' : 'opacity-0')} />
																	{inst.institution_code} - {inst.institution_name}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								)}

								{/* Program */}
								<div className="space-y-2">
									<Label>Program</Label>
									<Popover open={programOpen} onOpenChange={setProgramOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between text-left" disabled={!selectedInstitutionId || loadingPrograms}>
												{loadingPrograms ? (
													<span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading...</span>
												) : (
													<span className="truncate">
														{selectedProgramCode
															? `${selectedProgramCode} - ${programs.find(p => p.program_code === selectedProgramCode)?.program_name || ''}`
															: 'Select program'}
													</span>
												)}
												{!loadingPrograms && <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />}
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[400px] p-0">
											<Command>
												<CommandInput placeholder="Search program..." />
												<CommandList>
													<CommandEmpty>No program found.</CommandEmpty>
													<CommandGroup>
														{programs.map(prog => (
															<CommandItem
																key={prog.program_code}
																value={`${prog.program_code} ${prog.program_name}`}
																onSelect={() => { setSelectedProgramCode(prog.program_code); setProgramOpen(false) }}
															>
																<Check className={cn('mr-2 h-4 w-4 shrink-0', selectedProgramCode === prog.program_code ? 'opacity-100' : 'opacity-0')} />
																<span>{prog.program_code} - {prog.program_name}</span>
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Eligible Learners */}
					{loadingEligible ? (
						<Card>
							<CardContent className="flex items-center justify-center py-20">
								<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
								<span className="ml-2 text-muted-foreground">Loading eligible learners...</span>
							</CardContent>
						</Card>
					) : eligible.length > 0 ? (
						<Card>
							<CardHeader className="pb-4">
								<div className="flex items-start justify-between flex-wrap gap-3">
									<div>
										<CardTitle className="flex items-center gap-2">
											<Users className="h-5 w-5" />
											Eligible Learners ({eligible.length})
										</CardTitle>
										<CardDescription>
											{totalChecked} selected. Folio numbers will be assigned in register-number order.
										</CardDescription>
									</div>
									<Button
										onClick={handleGenerate}
										disabled={generating || totalChecked === 0}
										className="bg-emerald-600 hover:bg-emerald-700 text-white"
									>
										{generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck className="h-4 w-4 mr-2" />}
										Generate ({totalChecked})
									</Button>
								</div>
							</CardHeader>

							<CardContent>
								<div className="rounded-md border overflow-hidden">
									<Table>
										<TableHeader>
											<TableRow className="bg-muted/50">
												<TableHead className="w-[50px]">
													<Checkbox
														checked={allChecked}
														onCheckedChange={(c) => toggleAll(!!c)}
														aria-label="Select all"
													/>
												</TableHead>
												<TableHead className="w-[160px]">Register No.</TableHead>
												<TableHead>Name</TableHead>
												<TableHead className="w-[180px]">Folio Status</TableHead>
												<TableHead className="text-right w-[180px]">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{eligible.map(l => {
												const folio = existingFolios[l.id]
												return (
													<TableRow key={l.id}>
														<TableCell>
															<Checkbox
																checked={selectedIds.has(l.id)}
																onCheckedChange={(c) => toggleOne(l.id, !!c)}
															/>
														</TableCell>
														<TableCell className="font-mono text-sm">{l.registerNo}</TableCell>
														<TableCell>{l.name}</TableCell>
														<TableCell>
															{folio ? (
																<Badge variant="outline" className="font-mono text-xs">{folio}</Badge>
															) : (
																<Badge variant="secondary" className="text-xs">Not assigned</Badge>
															)}
														</TableCell>
														<TableCell className="text-right">
															{folio ? (
																<div className="flex justify-end gap-1">
																	<Button size="sm" variant="ghost" onClick={() => handleCopyShare(folio)}>
																		<Copy className="h-3.5 w-3.5" />
																	</Button>
																	<Button size="sm" variant="ghost" asChild>
																		<Link href={`/reports/consolidated-marksheet/${encodeURIComponent(folio)}`} target="_blank">
																			<ExternalLink className="h-3.5 w-3.5" />
																		</Link>
																	</Button>
																</div>
															) : null}
														</TableCell>
													</TableRow>
												)
											})}
										</TableBody>
									</Table>
								</div>
							</CardContent>
						</Card>
					) : selectedProgramCode ? (
						<Card className="border-amber-300 bg-amber-50/50">
							<CardContent className="flex flex-col items-center justify-center py-16 gap-2">
								<AlertTriangle className="h-10 w-10 text-amber-700" />
								<p className="font-medium text-amber-900">No eligible learners</p>
								<p className="text-sm text-amber-800 text-center max-w-md">
									For this program, no learners have cleared every course across every semester yet.
									Learners must complete all semesters with all subjects passed to be eligible for a consolidated marksheet.
								</p>
							</CardContent>
						</Card>
					) : (
						<Card>
							<CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
								<Award className="h-16 w-16 mb-4 opacity-20" />
								<p className="text-lg font-medium">Select institution and program</p>
								<p className="text-sm">Eligible learners (no backlog, all semesters complete) will appear here</p>
							</CardContent>
						</Card>
					)}

					{/* Generation Result */}
					{result && (
						<Card className="border-emerald-300 bg-emerald-50/30">
							<CardHeader>
								<CardTitle className="text-emerald-900 flex items-center gap-2">
									<FileCheck className="h-5 w-5" />
									Generation Result
								</CardTitle>
								<CardDescription className="text-emerald-800">
									{result.generated} marksheet(s) generated &middot; {result.folioAssignedCount} folio(s) newly assigned &middot; {result.skipped.length} skipped
								</CardDescription>
							</CardHeader>
							{result.skipped.length > 0 && (
								<CardContent>
									<p className="text-sm font-medium mb-2">Skipped learners:</p>
									<div className="space-y-1 text-xs text-muted-foreground">
										{result.skipped.map((s, i) => (
											<div key={i} className="flex gap-2">
												<span className="font-mono">{s.registerNo}</span>
												<span>— {s.reason}</span>
											</div>
										))}
									</div>
								</CardContent>
							)}
						</Card>
					)}
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
