"use client"

import { useState, useEffect, useCallback } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { Loader2, FileText, Check, ChevronsUpDown, X, GraduationCap, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { generateMarksheetDistributionPDF } from "@/lib/utils/generate-marksheet-distribution-pdf"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"

interface Institution {
	id: string
	institution_code: string
	institution_name: string
	name?: string
	counselling_code?: string
	myjkkn_institution_ids?: string[] | null
}

interface Program {
	id: string
	program_code: string
	program_name: string
	program_order?: number
}

interface Batch {
	id: string
	batch_code?: string
	batch_name: string
	start_year?: number
	end_year?: number
	program_id?: string
}

export default function MarksheetDistributionPage() {
	const { toast } = useToast()

	// Institution filter hook
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId
	} = useInstitutionFilter()

	// MyJKKN data fetching hook
	const { fetchPrograms: fetchMyJKKNPrograms, fetchBatches: fetchMyJKKNBatches } = useMyJKKNInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [batches, setBatches] = useState<Batch[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const [selectedProgramCode, setSelectedProgramCode] = useState<string>("")
	const [selectedBatchId, setSelectedBatchId] = useState<string>("")

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingBatches, setLoadingBatches] = useState(false)
	const [generatingPDF, setGeneratingPDF] = useState(false)

	// Popover open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [batchOpen, setBatchOpen] = useState(false)

	// Load institutions when context is ready or global filter changes
	// Re-fetch needed because appendToUrl includes institution filter param
	useEffect(() => {
		if (isReady) {
			setSelectedProgramCode("")
			setSelectedBatchId("")
			setPrograms([])
			setBatches([])
			fetchInstitutions()
		}
	}, [isReady, contextInstitutionId])

	const fetchInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/master/institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				const mappedData = data.map((inst: any) => ({
					...inst,
					institution_name: inst.name || inst.institution_name
				}))
				setInstitutions(mappedData)

				// Auto-select logic
				if (mappedData.length === 1) {
					setSelectedInstitutionId(mappedData[0].id)
				} else if (shouldFilter && contextInstitutionId) {
					setSelectedInstitutionId(contextInstitutionId)
				} else if (!mustSelectInstitution && contextInstitutionId) {
					setSelectedInstitutionId(contextInstitutionId)
				}
			}
		} catch (error) {
			console.error('Error fetching institutions:', error)
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, shouldFilter, mustSelectInstitution, contextInstitutionId])

	// Institution -> Programs (fetch from MyJKKN)
	// Include institutions.length so it re-fires when institutions load after auto-select
	useEffect(() => {
		if (selectedInstitutionId && institutions.length > 0) {
			setSelectedProgramCode("")
			setSelectedBatchId("")
			setPrograms([])
			setBatches([])
			fetchPrograms(selectedInstitutionId)
		} else {
			setPrograms([])
			setBatches([])
		}
	}, [selectedInstitutionId, institutions.length])

	const fetchPrograms = async (institutionId: string) => {
		try {
			setLoadingPrograms(true)
			setPrograms([])

			const institution = institutions.find(inst => inst.id === institutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			if (myjkknIds.length === 0) {
				setPrograms([])
				return
			}

			const progs = await fetchMyJKKNPrograms(myjkknIds)

			const mappedPrograms: Program[] = progs.map((p: any) => ({
				id: p.id,
				program_code: p.program_code || p.program_id,
				program_name: p.program_name || p.name,
				program_order: p.program_order ?? 999
			}))

			const sortedPrograms = mappedPrograms.sort((a, b) => {
				const orderA = a.program_order ?? 999
				const orderB = b.program_order ?? 999
				if (orderA !== orderB) return orderA - orderB
				return (a.program_code || '').localeCompare(b.program_code || '')
			})

			setPrograms(sortedPrograms)
		} catch (error) {
			console.error('[MarksheetDistribution] Error fetching programs:', error)
			setPrograms([])
		} finally {
			setLoadingPrograms(false)
		}
	}

	// Program -> Batches (fetch from MyJKKN)
	useEffect(() => {
		if (selectedProgramCode && selectedInstitutionId) {
			setSelectedBatchId("")
			setBatches([])
			fetchBatches(selectedInstitutionId, selectedProgramCode)
		} else {
			setBatches([])
		}
	}, [selectedProgramCode, selectedInstitutionId])

	const fetchBatches = async (institutionId: string, _programCode: string) => {
		try {
			setLoadingBatches(true)

			const institution = institutions.find(inst => inst.id === institutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			if (myjkknIds.length === 0) {
				setBatches([])
				return
			}

			// Fetch ALL batches for this institution (no program filter)
			const batchResults = await fetchMyJKKNBatches(myjkknIds)

			// Deduplicate by batch_code (aided + self-financing share same batch_code)
			const seenCodes = new Set<string>()
			const uniqueBatches: Batch[] = []

			for (const b of batchResults) {
				const code = b.batch_code || ''
				const batchName = b.batch_name || b.batch_code || `${b.start_year}-${b.end_year}`
				if (code && !seenCodes.has(code)) {
					seenCodes.add(code)
					uniqueBatches.push({
						id: b.id,
						batch_code: code,
						batch_name: batchName,
						start_year: b.start_year,
						end_year: b.end_year,
						program_id: b.program_id
					})
				} else if (!code) {
					if (!seenCodes.has(batchName)) {
						seenCodes.add(batchName)
						uniqueBatches.push({
							id: b.id,
							batch_code: code,
							batch_name: batchName,
							start_year: b.start_year,
							end_year: b.end_year,
							program_id: b.program_id
						})
					}
				}
			}

			// Sort by batch_code ascending (PGB24 < PGB25 < UGB24 < UGB25)
			uniqueBatches.sort((a, b) => {
				return (a.batch_code || '').localeCompare(b.batch_code || '')
			})

			setBatches(uniqueBatches)
		} catch (error) {
			console.error('Error fetching batches:', error)
			toast({
				title: "Error",
				description: "Failed to fetch batches",
				variant: "destructive"
			})
		} finally {
			setLoadingBatches(false)
		}
	}

	// Generate PDF Report
	const handleGeneratePDF = async () => {
		if (!selectedInstitutionId || !selectedProgramCode || !selectedBatchId) {
			toast({
				title: "Missing Information",
				description: "Please select Institution, Program, and Batch.",
				variant: "destructive",
			})
			return
		}

		try {
			setGeneratingPDF(true)

			const institution = institutions.find(i => i.id === selectedInstitutionId)
			const program = programs.find(p => p.program_code === selectedProgramCode)
			const batch = batches.find(b => b.id === selectedBatchId)

			if (!institution || !program || !batch) {
				throw new Error('Unable to find selected filter details')
			}

			// Build query parameters — use batch_code for filtering
			const params = new URLSearchParams({
				institution_id: selectedInstitutionId,
				program_code: selectedProgramCode,
				batch_code: batch.batch_code || ''
			})

			// Fetch learner data from MyJKKN
			const response = await fetch(`/api/reports/marksheet-distribution?${params.toString()}`)

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to fetch learner data')
			}

			const reportData = await response.json()

			if (!reportData.learners || reportData.learners.length === 0) {
				toast({
					title: "No Data",
					description: "No learners found for the selected criteria.",
					className: "bg-blue-50 border-blue-200 text-blue-800",
				})
				return
			}

			// Load logos
			let logoBase64: string | undefined
			let rightLogoBase64: string | undefined

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

				const rightLogoResponse = await fetch('/jkkncas_logo.png')
				if (rightLogoResponse.ok) {
					const blob = await rightLogoResponse.blob()
					rightLogoBase64 = await new Promise<string>((resolve) => {
						const reader = new FileReader()
						reader.onloadend = () => resolve(reader.result as string)
						reader.readAsDataURL(blob)
					})
				}
			} catch (e) {
				console.warn('Logo not loaded:', e)
			}

			const batchYear = batch.batch_name

			// Generate PDF
			const fileName = generateMarksheetDistributionPDF({
				institutionName: institution.institution_name,
				institutionCode: institution.institution_code,
				programName: program.program_name,
				programCode: program.program_code,
				batchYear: batchYear,
				learners: reportData.learners,
				logoImage: logoBase64,
				rightLogoImage: rightLogoBase64
			})

			toast({
				title: "PDF Generated",
				description: `${fileName} has been downloaded successfully (${reportData.learners.length} learners).`,
				className: "bg-green-50 border-green-200 text-green-800",
				duration: 5000,
			})

		} catch (error) {
			console.error('Error generating PDF:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to generate PDF'
			toast({
				title: "Generation Failed",
				description: errorMessage,
				variant: "destructive",
			})
		} finally {
			setGeneratingPDF(false)
		}
	}

	// Get display values
	const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
	const selectedProgram = programs.find(p => p.program_code === selectedProgramCode)
	const selectedBatch = batches.find(b => b.id === selectedBatchId)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
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
								<BreadcrumbLink asChild>
									<Link href="#">Reports</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Marksheet Distribution List</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex flex-col">
						<h1 className="text-2xl font-bold">Marksheet Distribution List</h1>
						<p className="text-sm text-muted-foreground">
							Generate PDF list of learners for marksheet distribution
						</p>
					</div>

					{/* Filter Section */}
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-sm font-semibold">Select Filters</CardTitle>
							<CardDescription className="text-xs">
								Choose institution, program, and batch to generate the distribution list
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className={cn("grid gap-4", mustSelectInstitution ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2")}>
								{/* Institution */}
								{mustSelectInstitution && (
									<div className="space-y-2">
										<Label htmlFor="institution" className="text-xs font-medium">
											Institution <span className="text-red-500">*</span>
										</Label>
										<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={institutionOpen}
													className="h-9 w-full justify-between text-xs"
													disabled={loadingInstitutions}
												>
													<span className="truncate">
														{selectedInstitutionId
															? institutions.find(i => i.id === selectedInstitutionId)?.institution_code + " - " + institutions.find(i => i.id === selectedInstitutionId)?.institution_name
															: "Select institution"}
													</span>
													<div className="flex items-center gap-1 flex-shrink-0">
														{selectedInstitutionId && (
															<X
																className="h-3 w-3 opacity-50 hover:opacity-100"
																onClick={(e) => {
																	e.stopPropagation()
																	setSelectedInstitutionId("")
																	setInstitutionOpen(false)
																}}
															/>
														)}
														<ChevronsUpDown className="h-3 w-3 opacity-50" />
													</div>
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[400px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search institution..." className="h-8 text-xs" />
													<CommandList>
														<CommandEmpty className="text-xs py-2">No institution found.</CommandEmpty>
														<CommandGroup>
															{institutions.map((inst) => (
																<CommandItem
																	key={inst.id}
																	value={`${inst.institution_code} ${inst.institution_name}`}
																	onSelect={() => {
																		setSelectedInstitutionId(inst.id)
																		setInstitutionOpen(false)
																	}}
																	className="text-xs"
																>
																	<Check
																		className={cn(
																			"mr-2 h-3 w-3",
																			selectedInstitutionId === inst.id ? "opacity-100" : "opacity-0"
																		)}
																	/>
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
									<Label htmlFor="program" className="text-xs font-medium">
										Program <span className="text-red-500">*</span>
									</Label>
									<Popover open={programOpen} onOpenChange={setProgramOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={programOpen}
												className="h-9 w-full justify-between text-xs"
												disabled={!selectedInstitutionId || loadingPrograms}
											>
												<span className="truncate flex items-center gap-1">
													<GraduationCap className="h-3 w-3 flex-shrink-0" />
													{selectedProgramCode
														? programs.find(p => p.program_code === selectedProgramCode)?.program_code + " - " + programs.find(p => p.program_code === selectedProgramCode)?.program_name
														: "Select program"}
												</span>
												<div className="flex items-center gap-1 flex-shrink-0">
													{selectedProgramCode && (
														<X
															className="h-3 w-3 opacity-50 hover:opacity-100"
															onClick={(e) => {
																e.stopPropagation()
																setSelectedProgramCode("")
																setProgramOpen(false)
															}}
														/>
													)}
													<ChevronsUpDown className="h-3 w-3 opacity-50" />
												</div>
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[400px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search program..." className="h-8 text-xs" />
												<CommandList>
													<CommandEmpty className="text-xs py-2">No program found.</CommandEmpty>
													<CommandGroup>
														{programs.map((prog) => (
															<CommandItem
																key={prog.id}
																value={`${prog.program_code} ${prog.program_name}`}
																onSelect={() => {
																	setSelectedProgramCode(prog.program_code)
																	setProgramOpen(false)
																}}
																className="text-xs"
															>
																<Check
																	className={cn(
																		"mr-2 h-3 w-3",
																		selectedProgramCode === prog.program_code ? "opacity-100" : "opacity-0"
																	)}
																/>
																{prog.program_code} - {prog.program_name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Batch */}
								<div className="space-y-2">
									<Label htmlFor="batch" className="text-xs font-medium">
										Batch <span className="text-red-500">*</span>
									</Label>
									<Popover open={batchOpen} onOpenChange={setBatchOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={batchOpen}
												className="h-9 w-full justify-between text-xs"
												disabled={!selectedProgramCode || loadingBatches}
											>
												<span className="truncate flex items-center gap-1">
													<Users className="h-3 w-3 flex-shrink-0" />
													{selectedBatchId
														? batches.find(b => b.id === selectedBatchId)?.batch_code
														: "Select batch"}
												</span>
												<div className="flex items-center gap-1 flex-shrink-0">
													{selectedBatchId && (
														<X
															className="h-3 w-3 opacity-50 hover:opacity-100"
															onClick={(e) => {
																e.stopPropagation()
																setSelectedBatchId("")
																setBatchOpen(false)
															}}
														/>
													)}
													<ChevronsUpDown className="h-3 w-3 opacity-50" />
												</div>
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[300px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search batch..." className="h-8 text-xs" />
												<CommandList>
													<CommandEmpty className="text-xs py-2">No batch found.</CommandEmpty>
													<CommandGroup>
														{batches.map((batch) => (
															<CommandItem
																key={batch.id}
																value={batch.batch_code || ''}
																onSelect={() => {
																	setSelectedBatchId(batch.id)
																	setBatchOpen(false)
																}}
																className="text-xs"
															>
																<Check
																	className={cn(
																		"mr-2 h-3 w-3",
																		selectedBatchId === batch.id ? "opacity-100" : "opacity-0"
																	)}
																/>
																{batch.batch_code}
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

					{/* Generate Button */}
					<Button
						onClick={handleGeneratePDF}
						disabled={generatingPDF || !selectedInstitutionId || !selectedProgramCode || !selectedBatchId}
						className="w-fit bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
					>
						{generatingPDF ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Generating PDF...
							</>
						) : (
							<>
								<FileText className="mr-2 h-4 w-4" />
								Generate PDF Report
							</>
						)}
					</Button>
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
