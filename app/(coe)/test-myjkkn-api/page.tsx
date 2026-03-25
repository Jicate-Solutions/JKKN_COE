"use client"

import { useState, useCallback, useEffect } from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeaderWhite } from "@/components/layout/app-header-white"
import { AppFooter } from "@/components/layout/app-footer"
import { PageTransition, CardAnimation } from "@/components/common/page-transition"
import { ModernBreadcrumb } from "@/components/common/modern-breadcrumb"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useToast } from "@/hooks/common/use-toast"
import { useInstitution, useInstitutionFilter } from "@/context/institution-context"
import {
	Building2,
	GraduationCap,
	BookOpen,
	Users,
	UserCog,
	Layers,
	Calendar,
	Award,
	Search,
	RefreshCw,
	ChevronDown,
	ChevronRight,
	Code,
	Copy,
	CheckCircle2,
	XCircle,
	Loader2,
	Globe,
	Key,
	FileJson,
	ExternalLink,
	UserCircle,
	FileText,
	FolderOpen,
	AlertTriangle
} from "lucide-react"

// Entity configuration
const ENTITIES = [
	{ key: 'institutions', label: 'Institutions', icon: Building2, color: 'emerald', endpoint: '/api/myjkkn/institutions' },
	{ key: 'departments', label: 'Departments', icon: Layers, color: 'blue', endpoint: '/api/myjkkn/departments' },
	{ key: 'programs', label: 'Programs', icon: GraduationCap, color: 'purple', endpoint: '/api/myjkkn/programs' },
	{ key: 'degrees', label: 'Degrees', icon: Award, color: 'amber', endpoint: '/api/myjkkn/degrees' },
	{ key: 'courses', label: 'Courses', icon: BookOpen, color: 'pink', endpoint: '/api/myjkkn/courses' },
	{ key: 'semesters', label: 'Semesters', icon: Calendar, color: 'cyan', endpoint: '/api/myjkkn/semesters' },
	{ key: 'regulations', label: 'Regulations', icon: FileText, color: 'orange', endpoint: '/api/myjkkn/regulations' },
	{ key: 'batches', label: 'Batches', icon: FolderOpen, color: 'teal', endpoint: '/api/myjkkn/batches' },
	{ key: 'students', label: 'Students', icon: Users, color: 'indigo', endpoint: '/api/myjkkn/students' },
	{ key: 'learner-profiles', label: 'Learner Profiles', icon: UserCircle, color: 'violet', endpoint: '/api/myjkkn/learner-profiles' },
	{ key: 'staff', label: 'Staff', icon: UserCog, color: 'rose', endpoint: '/api/myjkkn/staff' },
] as const

type EntityKey = typeof ENTITIES[number]['key']

interface ApiResponse {
	data?: unknown[]
	metadata?: {
		page: number
		totalPages: number
		total: number
		limit?: number
		returned?: number
	}
	error?: string
	status?: number
}

export default function MyJKKNApiExplorerPage() {
	const { toast } = useToast()

	// Institution filtering - for non-super admin users
	const { canSwitchInstitution, currentInstitutionId, currentInstitutionCode } = useInstitution()
	const { shouldFilter, isLoading: institutionLoading } = useInstitutionFilter()

	// State
	const [selectedEntity, setSelectedEntity] = useState<EntityKey>('institutions')
	const [loading, setLoading] = useState(false)
	const [response, setResponse] = useState<ApiResponse | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [showRawJson, setShowRawJson] = useState(false)

	// Filter state
	const [page, setPage] = useState(1)
	const [limit, setLimit] = useState(10)
	const [search, setSearch] = useState('')
	const [institutionId, setInstitutionId] = useState('')
	const [programId, setProgramId] = useState('')

	// For non-super admin users, auto-set institution filter
	useEffect(() => {
		if (!canSwitchInstitution && currentInstitutionId && !institutionId) {
			setInstitutionId(currentInstitutionId)
		}
	}, [canSwitchInstitution, currentInstitutionId, institutionId])

	// Get current entity config
	const currentEntity = ENTITIES.find(e => e.key === selectedEntity)!

	// Check if non-super admin has no institution (should show no data)
	const noInstitutionAccess = shouldFilter && !currentInstitutionId

	// Build query params
	const buildQueryParams = useCallback(() => {
		const params = new URLSearchParams()
		params.set('page', String(page))
		params.set('limit', String(limit))
		if (search) params.set('search', search)
		// For non-super admin, always use their institution_id
		const effectiveInstitutionId = !canSwitchInstitution && currentInstitutionId
			? currentInstitutionId
			: institutionId
		if (effectiveInstitutionId) params.set('institution_id', effectiveInstitutionId)
		if (programId) params.set('program_id', programId)
		return params.toString()
	}, [page, limit, search, institutionId, programId, canSwitchInstitution, currentInstitutionId])

	// Fetch data
	const fetchData = useCallback(async () => {
		// If non-super admin has no institution, show empty results
		if (noInstitutionAccess) {
			setResponse({ data: [], metadata: { page: 1, totalPages: 0, total: 0 } })
			setError(null)
			setLoading(false)
			return
		}

		setLoading(true)
		setError(null)

		try {
			const queryParams = buildQueryParams()
			const url = `${currentEntity.endpoint}?${queryParams}`

			console.log(`[API Explorer] Fetching: ${url}`)

			const res = await fetch(url)
			const data = await res.json()

			if (!res.ok) {
				throw new Error(data.error || `API Error: ${res.status}`)
			}

			setResponse(data)
			toast({
				title: "Success",
				description: `Fetched ${data.data?.length || 0} ${selectedEntity}`,
				className: "bg-green-50 border-green-200 text-green-800"
			})
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Failed to fetch data'
			setError(errorMsg)
			setResponse(null)
			toast({
				title: "Error",
				description: errorMsg,
				variant: "destructive"
			})
		} finally {
			setLoading(false)
		}
	}, [currentEntity.endpoint, buildQueryParams, selectedEntity, toast, noInstitutionAccess])

	// Copy JSON to clipboard
	const copyJson = useCallback(() => {
		if (response) {
			navigator.clipboard.writeText(JSON.stringify(response, null, 2))
			toast({
				title: "Copied",
				description: "JSON copied to clipboard",
				className: "bg-blue-50 border-blue-200 text-blue-800"
			})
		}
	}, [response, toast])

	// Reset filters
	const resetFilters = useCallback(() => {
		setPage(1)
		setLimit(10)
		setSearch('')
		setInstitutionId('')
		setProgramId('')
	}, [])

	// Helper to get nested property value (e.g., "institution.counselling_code")
	const getNestedValue = (obj: any, path: string): any => {
		return path.split('.').reduce((current, key) => current?.[key], obj)
	}

	// Get table columns based on entity
	const getTableColumns = (entity: EntityKey): string[] => {
		switch (entity) {
			case 'institutions':
				return ['counselling_code', 'name', 'city', 'is_active']
			case 'departments':
				return ['department_code', 'department_name', 'institution.counselling_code', 'is_active']
			case 'programs':
				return ['program_id', 'program_name', 'institution.counselling_code', 'department.department_code', 'department.department_name', 'is_active']
			case 'degrees':
				return ['degree_code', 'degree_name', 'degree_level', 'is_active']
			case 'courses':
				return ['course_code', 'course_name', 'is_active']
			case 'semesters':
				return ['semester_code', 'semester_name', 'program_code', 'is_active']
			case 'regulations':
				return [ 'regulation_code', 'regulation_year',  'is_active']
			case 'batches':
				return ['batch_code', 'batch_name', 'batch_year','start_date', 'end_date',  'is_active']
			case 'students':
				return ['register_number', 'first_name', 'last_name', 'college_email', 'student_mobile', 'is_active']
			case 'learner-profiles':
				return ['register_number', 'first_name', 'last_name', 'college_email', 'student_mobile', 'is_profile_complete']
			case 'staff':
				return ['staff_id', 'institution.name', 'first_name', 'designation', 'department.department_name', 'is_active']
			default:
				return ['id', 'name', 'is_active']
		}
	}

	const tableColumns = getTableColumns(selectedEntity)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeaderWhite />

				<PageTransition>
					<div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
						{/* Breadcrumb */}
						<ModernBreadcrumb
							items={[
								{ label: "Home", href: "/dashboard" },
								{ label: "Developer Tools" },
								{ label: "MyJKKN API Explorer" }
							]}
						/>

						{/* Header */}
						<div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-6 shadow-lg">
							<div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,white)]" />
							<div className="relative flex items-center gap-4">
								<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
									<Globe className="h-7 w-7 text-white" />
								</div>
								<div>
									<h1 className="text-2xl font-bold text-white font-heading flex items-center gap-2">
										MyJKKN API Explorer
										<Badge className="bg-white/20 text-white border-white/30 text-xs">
											<Key className="h-3 w-3 mr-1" />
											Developer
										</Badge>
									</h1>
									<p className="text-sm text-white/80 mt-1">
										Test and explore MyJKKN external API endpoints
										{!canSwitchInstitution && currentInstitutionCode && (
											<span className="ml-2 text-amber-200">
												• Filtered by your institution: {currentInstitutionCode}
											</span>
										)}
									</p>
								</div>
							</div>
						</div>

						{/* No Institution Warning */}
						{noInstitutionAccess && (
							<div className="flex items-center gap-3 rounded-lg bg-amber-50 border border-amber-200 p-4 text-amber-800">
								<AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
								<div>
									<p className="font-medium">No Institution Assigned</p>
									<p className="text-sm text-amber-600">
										You don't have an institution assigned to your account. Please contact an administrator to get access.
									</p>
								</div>
							</div>
						)}

						{/* Entity Selection - Horizontal Pills */}
						<Card>
							<CardContent className="p-3">
								<div className="flex flex-wrap gap-2">
									{ENTITIES.map((entity) => {
										const Icon = entity.icon
										const isSelected = selectedEntity === entity.key
										return (
											<Button
												key={entity.key}
												variant={isSelected ? "default" : "outline"}
												size="sm"
												className={`h-9 ${isSelected ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
												onClick={() => {
													setSelectedEntity(entity.key)
													setResponse(null)
													setError(null)
												}}
											>
												<Icon className="h-4 w-4 mr-2" />
												{entity.label}
											</Button>
										)
									})}
								</div>
							</CardContent>
						</Card>

						{/* Filters */}
						<Card>
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between">
									<div>
										<CardTitle className="text-sm font-semibold flex items-center gap-2">
											<currentEntity.icon className="h-4 w-4" />
											{currentEntity.label}
										</CardTitle>
										<CardDescription className="text-xs mt-1">
											{currentEntity.endpoint}
										</CardDescription>
									</div>
									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={resetFilters}
										>
											Reset
										</Button>
										<Button
											size="sm"
											onClick={fetchData}
											disabled={loading}
											className="bg-violet-600 hover:bg-violet-700"
										>
											{loading ? (
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											) : (
												<Search className="h-4 w-4 mr-2" />
											)}
											Fetch
										</Button>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
									<div className="space-y-1">
										<Label className="text-xs">Page</Label>
										<Input
											type="number"
											min={1}
											value={page}
											onChange={(e) => setPage(parseInt(e.target.value) || 1)}
											className="h-8 text-sm"
										/>
									</div>
									<div className="space-y-1">
										<Label className="text-xs">Limit</Label>
										<Input
											type="number"
											min={1}
											max={100}
											value={limit}
											onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
											className="h-8 text-sm"
										/>
									</div>
									<div className="space-y-1">
										<Label className="text-xs">Search</Label>
										<Input
											placeholder="Search..."
											value={search}
											onChange={(e) => setSearch(e.target.value)}
											className="h-8 text-sm"
										/>
									</div>
									<div className="space-y-1">
										<Label className="text-xs">
											Institution ID
											{!canSwitchInstitution && currentInstitutionId && (
												<span className="ml-2 text-[10px] text-amber-600">(locked to your institution)</span>
											)}
										</Label>
										<Input
											placeholder="UUID..."
											value={!canSwitchInstitution && currentInstitutionId ? currentInstitutionId : institutionId}
											onChange={(e) => canSwitchInstitution && setInstitutionId(e.target.value)}
											className="h-8 text-sm font-mono"
											disabled={!canSwitchInstitution && !!currentInstitutionId}
										/>
									</div>
									<div className="space-y-1">
										<Label className="text-xs">Program ID</Label>
										<Input
											placeholder="UUID..."
											value={programId}
											onChange={(e) => setProgramId(e.target.value)}
											className="h-8 text-sm font-mono"
										/>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Results */}
						<Card>
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between">
									<CardTitle className="text-sm font-semibold flex items-center gap-2">
										<FileJson className="h-4 w-4" />
										Response
										{response && (
											<Badge variant="outline" className="ml-2">
												{response.metadata?.total || response.data?.length || 0} records
											</Badge>
										)}
									</CardTitle>
									{response && (
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={copyJson}
											>
												<Copy className="h-3 w-3 mr-1" />
												Copy
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => setShowRawJson(!showRawJson)}
											>
												<Code className="h-3 w-3 mr-1" />
												{showRawJson ? 'Table' : 'JSON'}
											</Button>
										</div>
									)}
								</div>
							</CardHeader>
							<CardContent>
								{loading ? (
									<div className="flex items-center justify-center h-48">
										<Loader2 className="h-8 w-8 animate-spin text-violet-600" />
									</div>
								) : error ? (
									<div className="flex flex-col items-center justify-center h-48 text-red-500">
										<XCircle className="h-12 w-12 mb-2 opacity-50" />
										<p className="font-medium">Error</p>
										<p className="text-sm text-center mt-1">{error}</p>
									</div>
								) : response ? (
									<>
										{/* Metadata */}
										{response.metadata && (
											<div className="flex flex-wrap gap-2 mb-4">
												<Badge variant="secondary">Page {response.metadata.page}/{response.metadata.totalPages}</Badge>
												<Badge variant="secondary">Total: {response.metadata.total}</Badge>
												{response.metadata.limit && <Badge variant="secondary">Limit: {response.metadata.limit}</Badge>}
												{response.metadata.returned && <Badge variant="secondary">Returned: {response.metadata.returned}</Badge>}
											</div>
										)}

										{showRawJson ? (
											<ScrollArea className="h-[400px] rounded-lg border bg-slate-950 p-4">
												<pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
													{JSON.stringify(response, null, 2)}
												</pre>
											</ScrollArea>
										) : (
											<ScrollArea className="h-[400px]">
												<Table>
													<TableHeader>
														<TableRow>
															{tableColumns.map(col => (
																<TableHead key={col} className="text-xs font-semibold">
																	{col}
																</TableHead>
															))}
														</TableRow>
													</TableHeader>
													<TableBody>
														{response.data?.map((row: any, idx: number) => (
															<TableRow key={row.id || idx}>
																{tableColumns.map(col => {
																	const value = getNestedValue(row, col)
																	return (
																		<TableCell key={col} className="text-xs">
																			{col === 'is_active' ? (
																				value ? (
																					<CheckCircle2 className="h-4 w-4 text-green-500" />
																				) : (
																					<XCircle className="h-4 w-4 text-red-500" />
																				)
																			) : (
																				String(value ?? '-')
																			)}
																		</TableCell>
																	)
																})}
															</TableRow>
														))}
													</TableBody>
												</Table>
											</ScrollArea>
										)}

										{/* Pagination */}
										{response.metadata && response.metadata.totalPages > 1 && (
											<div className="flex items-center justify-between mt-4 pt-4 border-t">
												<Button
													variant="outline"
													size="sm"
													disabled={page <= 1}
													onClick={() => {
														setPage(p => Math.max(1, p - 1))
														fetchData()
													}}
												>
													Previous
												</Button>
												<span className="text-sm text-muted-foreground">
													Page {page} of {response.metadata.totalPages}
												</span>
												<Button
													variant="outline"
													size="sm"
													disabled={page >= response.metadata.totalPages}
													onClick={() => {
														setPage(p => p + 1)
														fetchData()
													}}
												>
													Next
												</Button>
											</div>
										)}
									</>
								) : (
									<div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
										<Search className="h-12 w-12 mb-2 opacity-30" />
										<p className="text-sm">Click "Fetch" to load data</p>
									</div>
								)}
							</CardContent>
						</Card>

						{/* Raw API Response */}
						{response && (
							<Card>
								<Collapsible defaultOpen>
									<CollapsibleTrigger asChild>
										<CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
											<div className="flex items-center justify-between w-full">
												<CardTitle className="text-sm font-semibold flex items-center gap-2">
													<Code className="h-4 w-4" />
													Raw API Response
													<ChevronDown className="h-4 w-4" />
												</CardTitle>
												<Button
													variant="outline"
													size="sm"
													onClick={(e) => {
														e.stopPropagation()
														copyJson()
													}}
													className="h-7"
												>
													<Copy className="h-3 w-3 mr-1" />
													Copy
												</Button>
											</div>
										</CardHeader>
									</CollapsibleTrigger>
									<CollapsibleContent>
										<CardContent className="pt-0">
											<ScrollArea className="h-[400px] rounded-lg border bg-slate-950 p-4">
												<pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
													{JSON.stringify(response, null, 2)}
												</pre>
											</ScrollArea>
										</CardContent>
									</CollapsibleContent>
								</Collapsible>
							</Card>
						)}

						{/* API Documentation */}
						<Card>
							<Collapsible>
								<CollapsibleTrigger asChild>
									<CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
										<CardTitle className="text-sm font-semibold flex items-center gap-2">
											<ExternalLink className="h-4 w-4" />
											API Documentation
											<ChevronDown className="h-4 w-4 ml-auto" />
										</CardTitle>
									</CardHeader>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<CardContent>
										<div className="space-y-4 text-sm">
											<div>
												<h4 className="font-semibold mb-2">Base URL</h4>
												<code className="bg-muted px-2 py-1 rounded text-xs">
													https://www.jkkn.ai/api
												</code>
											</div>
											<div>
												<h4 className="font-semibold mb-2">Authentication</h4>
												<code className="bg-muted px-2 py-1 rounded text-xs">
													Authorization: Bearer jk_xxx_xxx
												</code>
											</div>
											<div>
												<h4 className="font-semibold mb-2">Common Parameters</h4>
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead className="text-xs">Parameter</TableHead>
															<TableHead className="text-xs">Type</TableHead>
															<TableHead className="text-xs">Description</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														<TableRow>
															<TableCell className="font-mono text-xs">page</TableCell>
															<TableCell className="text-xs">number</TableCell>
															<TableCell className="text-xs">Page number (default: 1)</TableCell>
														</TableRow>
														<TableRow>
															<TableCell className="font-mono text-xs">limit</TableCell>
															<TableCell className="text-xs">number</TableCell>
															<TableCell className="text-xs">Items per page (default: 10, max: 100)</TableCell>
														</TableRow>
														<TableRow>
															<TableCell className="font-mono text-xs">search</TableCell>
															<TableCell className="text-xs">string</TableCell>
															<TableCell className="text-xs">Search by name/code</TableCell>
														</TableRow>
														<TableRow>
															<TableCell className="font-mono text-xs">is_active</TableCell>
															<TableCell className="text-xs">boolean</TableCell>
															<TableCell className="text-xs">Filter by active status</TableCell>
														</TableRow>
														<TableRow>
															<TableCell className="font-mono text-xs">institution_id</TableCell>
															<TableCell className="text-xs">UUID</TableCell>
															<TableCell className="text-xs">Filter by institution</TableCell>
														</TableRow>
													</TableBody>
												</Table>
											</div>
										</div>
									</CardContent>
								</CollapsibleContent>
							</Collapsible>
						</Card>
					</div>
				</PageTransition>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
