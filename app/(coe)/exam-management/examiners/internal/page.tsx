'use client'

import { useMemo, useState, useEffect } from 'react'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useToast } from '@/hooks/common/use-toast'
import {
	MoreHorizontal, Search, RefreshCw, ChevronLeft, ChevronRight,
	Users, UserCheck, UserX, Building2, GraduationCap,
	ChevronUp, ChevronDown, Mail, Phone, MapPin, Briefcase, Calendar,
	User, Heart, Droplets, ChevronsUpDown,
} from 'lucide-react'

interface StaffMember {
	id: string
	staff_id: string
	first_name: string
	last_name?: string
	email: string
	phone: string
	designation: string
	profile_picture: string
	institution_email: string
	is_active: boolean
	role_type: string
	gender: string | null
	date_of_birth: string | null
	marital_status: string | null
	blood_group: string | null
	address: string | null
	state: string | null
	district: string | null
	pincode: string | null
	date_of_joining: string | null
	facilitator_certification: string | null
	outcome_metrics: string | null
	category: { id: string; category_name: string } | null
	institution: { id: string; name: string } | null
	department: { id: string; department_name: string } | null
}

type SortCol = 'name' | 'staff_id' | 'designation' | 'department' | 'institution' | 'status'
type SortDir = 'asc' | 'desc'

function formatDate(val: string | null) {
	if (!val) return '—'
	const d = new Date(val)
	return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function InternalExaminersPage() {
	const { toast } = useToast()

	const { shouldFilter, myjkknInstitutionIds, isReady } = useInstitutionFilter()

	const [allStaff, setAllStaff] = useState<StaffMember[]>([])
	const [loading, setLoading] = useState(true)
	const [fetchTick, setFetchTick] = useState(0)

	const [searchTerm, setSearchTerm] = useState('')
	const [activeFilter, setActiveFilter] = useState('all')
	const [deptFilter, setDeptFilter] = useState('all')

	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)

	const [sortCol, setSortCol] = useState<SortCol>('name')
	const [sortDir, setSortDir] = useState<SortDir>('asc')

	const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)

	useEffect(() => {
		if (!isReady) return
		let cancelled = false
		async function load() {
			setLoading(true)
			try {
				const res = await fetch('/api/api-management/staff?limit=500')
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				const json = await res.json()
				if (!cancelled) setAllStaff(json.data || [])
			} catch (err: any) {
				if (!cancelled) toast({ title: '❌ Failed to load staff', description: err.message, variant: 'destructive' })
			} finally {
				if (!cancelled) setLoading(false)
			}
		}
		load()
		return () => { cancelled = true }
	}, [fetchTick, isReady])

	const institutionFiltered = useMemo(() => {
		if (shouldFilter && myjkknInstitutionIds && myjkknInstitutionIds.length > 0) {
			return allStaff.filter(s => s.institution?.id && myjkknInstitutionIds.includes(s.institution.id))
		}
		return allStaff
	}, [allStaff, shouldFilter, myjkknInstitutionIds])

	// Departments available for filter — derived from institution-filtered staff
	const departments = useMemo(() => {
		const seen = new Map<string, string>()
		for (const s of institutionFiltered) {
			if (s.department?.id && !seen.has(s.department.id)) {
				seen.set(s.department.id, s.department.department_name)
			}
		}
		return Array.from(seen.entries())
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name))
	}, [institutionFiltered])

	const filtered = useMemo(() => {
		let result = institutionFiltered

		if (deptFilter !== 'all') {
			result = result.filter(s => s.department?.id === deptFilter)
		}

		if (activeFilter !== 'all') {
			const want = activeFilter === 'active'
			result = result.filter(s => s.is_active === want)
		}

		if (searchTerm.trim()) {
			const q = searchTerm.toLowerCase()
			result = result.filter(s =>
				s.first_name?.toLowerCase().includes(q) ||
				s.staff_id?.toLowerCase().includes(q) ||
				s.designation?.toLowerCase().includes(q) ||
				s.email?.toLowerCase().includes(q) ||
				s.institution_email?.toLowerCase().includes(q) ||
				s.department?.department_name?.toLowerCase().includes(q)
			)
		}

		// Sort
		result = [...result].sort((a, b) => {
			let av = '', bv = ''
			if (sortCol === 'name') { av = a.first_name || ''; bv = b.first_name || '' }
			else if (sortCol === 'staff_id') { av = a.staff_id || ''; bv = b.staff_id || '' }
			else if (sortCol === 'designation') { av = a.designation || ''; bv = b.designation || '' }
			else if (sortCol === 'department') { av = a.department?.department_name || ''; bv = b.department?.department_name || '' }
			else if (sortCol === 'institution') { av = a.institution?.name || ''; bv = b.institution?.name || '' }
			else if (sortCol === 'status') { av = String(a.is_active); bv = String(b.is_active) }
			const cmp = av.localeCompare(bv)
			return sortDir === 'asc' ? cmp : -cmp
		})

		return result
	}, [institutionFiltered, activeFilter, searchTerm, sortCol, sortDir])

	const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
	const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

	useEffect(() => { setCurrentPage(1) }, [activeFilter, deptFilter, searchTerm, shouldFilter, myjkknInstitutionIds])

	// Reset dept filter when institution changes (departments may differ)
	useEffect(() => { setDeptFilter('all') }, [shouldFilter, myjkknInstitutionIds])

	const totalStaff    = institutionFiltered.length
	const activeCount   = institutionFiltered.filter(s => s.is_active).length
	const inactiveCount = institutionFiltered.filter(s => !s.is_active).length
	const deptCount     = new Set(institutionFiltered.map(s => s.department?.id).filter(Boolean)).size

	const pageSizeOptions = useMemo(() => {
		const opts = [10, 25, 50]
		if (filtered.length > 50) opts.push(filtered.length)
		return opts
	}, [filtered.length])

	const fullName = (s: StaffMember) => s.first_name || ''
	const initials  = (s: StaffMember) =>
		(s.first_name?.[0] ?? '').toUpperCase()

	function toggleSort(col: SortCol) {
		if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
		else { setSortCol(col); setSortDir('asc') }
	}

	function SortIcon({ col }: { col: SortCol }) {
		if (sortCol !== col) return <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground/40 inline" />
		return sortDir === 'asc'
			? <ChevronUp className="ml-1 h-3 w-3 inline" />
			: <ChevronDown className="ml-1 h-3 w-3 inline" />
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">

					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbLink href="/exam-management/examiners">Examiners</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>Internal Examiners</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Scorecards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{totalStaff}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Staff</p>
									</div>
									<Users className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{activeCount}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Active</p>
									</div>
									<UserCheck className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{inactiveCount}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Inactive</p>
									</div>
									<UserX className="h-5 w-5 text-amber-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{deptCount}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Departments</p>
									</div>
									<Building2 className="h-5 w-5 text-purple-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Table Card */}
					<TooltipProvider delayDuration={300}>
						<Card className="flex-1 flex flex-col min-h-0">

							{/* Toolbar */}
							<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-base font-semibold">Internal Examiners</p>
										<p className="text-xs text-muted-foreground">
											Staff from MyJKKN eligible for internal examination duties
										</p>
									</div>
									<div className="flex items-center gap-1.5">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="ghost" size="icon" className="h-8 w-8 p-0"
													onClick={() => setFetchTick(t => t + 1)}
													disabled={loading}
												>
													<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Refresh</TooltipContent>
										</Tooltip>
									</div>
								</div>
								<div className="flex items-center gap-2 flex-wrap mt-3">
									<Select value={activeFilter} onValueChange={setActiveFilter}>
										<SelectTrigger className="h-8 text-sm w-[130px]">
											<SelectValue placeholder="Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Status</SelectItem>
											<SelectItem value="active">Active</SelectItem>
											<SelectItem value="inactive">Inactive</SelectItem>
										</SelectContent>
									</Select>
									<Select value={deptFilter} onValueChange={setDeptFilter} disabled={departments.length === 0}>
										<SelectTrigger className="h-8 text-sm w-[180px]">
											<SelectValue placeholder="All Departments" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Departments</SelectItem>
											{departments.map(d => (
												<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
											))}
										</SelectContent>
									</Select>
									<div className="relative flex-1 max-w-sm">
										<Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
										<Input
											placeholder="Search name, staff ID, department…"
											value={searchTerm}
											onChange={e => setSearchTerm(e.target.value)}
											className="pl-8 h-8 text-sm"
										/>
									</div>
								</div>
							</CardHeader>

							{/* Table */}
							<CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col min-h-0">
								<div className="rounded-md border flex-1 overflow-hidden mt-3 min-h-[380px] max-h-[520px]">
									<div className="h-full overflow-auto">
										<Table>
											<TableHeader className="sticky top-0 z-10 bg-muted/50">
												<TableRow>
													<TableHead className="text-xs font-semibold">#</TableHead>
													<TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => toggleSort('name')}>
														Staff <SortIcon col="name" />
													</TableHead>
													<TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => toggleSort('staff_id')}>
														Staff ID <SortIcon col="staff_id" />
													</TableHead>
													<TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => toggleSort('designation')}>
														Designation <SortIcon col="designation" />
													</TableHead>
													<TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => toggleSort('department')}>
														Department <SortIcon col="department" />
													</TableHead>
													<TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => toggleSort('institution')}>
														Institution <SortIcon col="institution" />
													</TableHead>
													<TableHead className="text-xs font-semibold">Phone</TableHead>
													<TableHead className="text-xs font-semibold cursor-pointer select-none" onClick={() => toggleSort('status')}>
														Status <SortIcon col="status" />
													</TableHead>
													<TableHead className="text-xs font-semibold w-10"></TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{loading ? (
													<TableRow>
														<TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
															<div className="flex flex-col items-center gap-2">
																<RefreshCw className="animate-spin h-5 w-5" />
																<p className="text-sm">Loading staff from MyJKKN…</p>
															</div>
														</TableCell>
													</TableRow>
												) : paginated.length === 0 ? (
													<TableRow>
														<TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
															<div className="flex flex-col items-center gap-2">
																<GraduationCap className="h-8 w-8 opacity-20" />
																<p className="text-sm">No staff found</p>
																<p className="text-xs">Try adjusting your search or filters</p>
															</div>
														</TableCell>
													</TableRow>
												) : (
													paginated.map((s, idx) => (
														<TableRow key={s.id} className="hover:bg-muted/50">
															<TableCell className="text-sm">
																{(currentPage - 1) * itemsPerPage + idx + 1}
															</TableCell>
															<TableCell>
																<div className="flex items-center gap-2">
																	<Avatar className="h-7 w-7">
																		<AvatarImage src={s.profile_picture || undefined} />
																		<AvatarFallback className="text-xs">{initials(s)}</AvatarFallback>
																	</Avatar>
																	<div>
																		<p className="text-sm font-medium">{fullName(s)}</p>
																		<p className="text-xs text-muted-foreground">
																			{s.institution_email || s.email}
																		</p>
																	</div>
																</div>
															</TableCell>
															<TableCell className="text-sm font-mono">{s.staff_id}</TableCell>
															<TableCell className="text-sm">{s.designation || '—'}</TableCell>
															<TableCell className="text-sm">{s.department?.department_name || '—'}</TableCell>
															<TableCell className="text-sm">{s.institution?.name || '—'}</TableCell>
															<TableCell className="text-sm">{s.phone || '—'}</TableCell>
															<TableCell>
																<Badge
																	variant="outline"
																	className={`text-xs ${s.is_active
																		? 'bg-green-50 text-green-700 border-green-200'
																		: 'bg-gray-50 text-gray-600 border-gray-200'}`}
																>
																	{s.is_active ? 'Active' : 'Inactive'}
																</Badge>
															</TableCell>
															<TableCell>
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<Button variant="ghost" className="h-7 w-7 p-0">
																			<MoreHorizontal className="h-4 w-4" />
																		</Button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent align="end">
																		<DropdownMenuItem onClick={() => setSelectedStaff(s)}>
																			View Details
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</TableCell>
														</TableRow>
													))
												)}
											</TableBody>
										</Table>
									</div>
								</div>

								{/* Pagination */}
								{!loading && filtered.length > 0 && (
									<div className="flex items-center justify-between pt-3">
										<p className="text-sm text-muted-foreground tabular-nums">
											{filtered.length} staff member{filtered.length !== 1 ? 's' : ''}
										</p>
										<div className="flex items-center gap-1.5">
											<span className="text-xs text-muted-foreground">Rows</span>
											<Select
												value={String(itemsPerPage)}
												onValueChange={v => { setItemsPerPage(Number(v)); setCurrentPage(1) }}
											>
												<SelectTrigger className="h-7 w-[70px] text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{pageSizeOptions.map(n => (
														<SelectItem key={n} value={String(n)}>
															{n === filtered.length ? 'All' : n}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<Button
												variant="outline" size="sm" className="h-7 w-7 p-0"
												onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
												disabled={currentPage === 1}
											>
												<ChevronLeft className="h-3.5 w-3.5" />
											</Button>
											<span className="text-xs text-muted-foreground px-2 tabular-nums">
												{currentPage} / {totalPages}
											</span>
											<Button
												variant="outline" size="sm" className="h-7 w-7 p-0"
												onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
												disabled={currentPage >= totalPages}
											>
												<ChevronRight className="h-3.5 w-3.5" />
											</Button>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					</TooltipProvider>

				</div>
			</SidebarInset>

			{/* Staff Detail Sheet */}
			<Sheet open={!!selectedStaff} onOpenChange={open => { if (!open) setSelectedStaff(null) }}>
				<SheetContent className="sm:max-w-[720px] overflow-y-auto">
					{selectedStaff && (
						<>
							<SheetHeader className="pb-4 border-b">
								<div className="flex items-center gap-4">
									<Avatar className="h-16 w-16">
										<AvatarImage src={selectedStaff.profile_picture || undefined} />
										<AvatarFallback className="text-lg">{initials(selectedStaff)}</AvatarFallback>
									</Avatar>
									<div>
										<SheetTitle className="text-lg font-semibold">{fullName(selectedStaff)}</SheetTitle>
										<p className="text-sm text-muted-foreground">{selectedStaff.designation || '—'}</p>
										<div className="mt-1">
											<Badge
												variant="outline"
												className={`text-xs ${selectedStaff.is_active
													? 'bg-green-50 text-green-700 border-green-200'
													: 'bg-gray-50 text-gray-600 border-gray-200'}`}
											>
												{selectedStaff.is_active ? 'Active' : 'Inactive'}
											</Badge>
										</div>
									</div>
								</div>
							</SheetHeader>

							<div className="mt-6 space-y-8">

								{/* Professional Info */}
								<div>
									<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
										Professional Information
									</p>
									<div className="grid grid-cols-2 gap-x-6 gap-y-4">
										<DetailField icon={<Briefcase className="h-3.5 w-3.5" />} label="Staff ID" value={selectedStaff.staff_id} />
										<DetailField icon={<Briefcase className="h-3.5 w-3.5" />} label="Designation" value={selectedStaff.designation} />
										<DetailField icon={<Building2 className="h-3.5 w-3.5" />} label="Institution" value={selectedStaff.institution?.name} />
										<DetailField icon={<Building2 className="h-3.5 w-3.5" />} label="Department" value={selectedStaff.department?.department_name} />
										<DetailField icon={<Briefcase className="h-3.5 w-3.5" />} label="Category" value={selectedStaff.category?.category_name} />
										<DetailField icon={<Briefcase className="h-3.5 w-3.5" />} label="Role Type" value={selectedStaff.role_type} />
										<DetailField icon={<Calendar className="h-3.5 w-3.5" />} label="Date of Joining" value={formatDate(selectedStaff.date_of_joining)} />
										<DetailField icon={<Mail className="h-3.5 w-3.5" />} label="Institution Email" value={selectedStaff.institution_email} />
									</div>
								</div>

								{/* Personal Info */}
								<div className="pt-2 border-t">
									<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
										Personal Information
									</p>
									<div className="grid grid-cols-2 gap-x-6 gap-y-4">
										<DetailField icon={<User className="h-3.5 w-3.5" />} label="Gender" value={selectedStaff.gender} />
										<DetailField icon={<Calendar className="h-3.5 w-3.5" />} label="Date of Birth" value={formatDate(selectedStaff.date_of_birth)} />
										<DetailField icon={<Heart className="h-3.5 w-3.5" />} label="Marital Status" value={selectedStaff.marital_status} />
										<DetailField icon={<Droplets className="h-3.5 w-3.5" />} label="Blood Group" value={selectedStaff.blood_group} />
									</div>
								</div>

								{/* Contact Info */}
								<div className="pt-2 border-t">
									<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
										Contact Information
									</p>
									<div className="grid grid-cols-2 gap-x-6 gap-y-4">
										<DetailField icon={<Mail className="h-3.5 w-3.5" />} label="Personal Email" value={selectedStaff.email} />
										<DetailField icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={selectedStaff.phone} />
										<div className="col-span-2">
											<DetailField icon={<MapPin className="h-3.5 w-3.5" />} label="Address" value={selectedStaff.address} />
										</div>
										<DetailField icon={<MapPin className="h-3.5 w-3.5" />} label="District" value={selectedStaff.district} />
										<DetailField icon={<MapPin className="h-3.5 w-3.5" />} label="State" value={selectedStaff.state} />
										<DetailField icon={<MapPin className="h-3.5 w-3.5" />} label="Pincode" value={selectedStaff.pincode} />
									</div>
								</div>

							</div>
						</>
					)}
				</SheetContent>
			</Sheet>

		</SidebarProvider>
	)
}

function DetailField({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
	return (
		<div>
			<p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
				{icon} {label}
			</p>
			<p className="text-sm">{value || '—'}</p>
		</div>
	)
}
