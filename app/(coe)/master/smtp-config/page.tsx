"use client"

import { useMemo, useState, useEffect } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, CheckCircle, XCircle, Mail, Server, Shield, Send, Eye, EyeOff, TestTube, MoreHorizontal, ChevronDown, Download } from "lucide-react"

interface SmtpConfig {
	id: string
	institution_code: string | null
	smtp_host: string
	smtp_port: number
	smtp_secure: boolean
	smtp_user: string
	smtp_password_encrypted: string
	sender_email: string
	sender_name: string | null
	default_cc_emails: string[] | null
	is_active: boolean
	created_at: string
	updated_at: string
}

export default function SmtpConfigPage() {
	const { toast } = useToast()
	const [configs, setConfigs] = useState<SmtpConfig[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)
	const [deleteTarget, setDeleteTarget] = useState<SmtpConfig | null>(null)

	const [sheetOpen, setSheetOpen] = useState(false)
	const [editing, setEditing] = useState<SmtpConfig | null>(null)
	const [statusFilter, setStatusFilter] = useState("all")
	const [showPassword, setShowPassword] = useState(false)

	// Test Email Dialog
	const [testDialogOpen, setTestDialogOpen] = useState(false)
	const [testConfigId, setTestConfigId] = useState<string | null>(null)
	const [testEmail, setTestEmail] = useState("")
	const [testLoading, setTestLoading] = useState(false)

	// Form Data State
	const [formData, setFormData] = useState({
		institution_code: "__none__",
		smtp_host: "",
		smtp_port: "587",
		smtp_secure: true,
		smtp_user: "",
		smtp_password: "",
		sender_email: "",
		sender_name: "",
		default_cc_emails: "",
		is_active: true,
	})
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Institution Dropdown Data
	const [institutions, setInstitutions] = useState<Array<{ id: string; institution_code: string; institution_name?: string }>>([])

	// Fetch configs
	const fetchConfigs = async () => {
		try {
			setLoading(true)
			const response = await fetch('/api/smtp-config')
			if (!response.ok) {
				throw new Error('Failed to fetch SMTP configurations')
			}
			const data = await response.json()
			setConfigs(data)
		} catch (error) {
			console.error('Error fetching SMTP configs:', error)
			setConfigs([])
		} finally {
			setLoading(false)
		}
	}

	// Fetch institutions dropdown data
	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/master/institutions')
			if (res.ok) {
				const data = await res.json()
				const mapped = Array.isArray(data)
					? data.filter((i: any) => i?.institution_code).map((i: any) => ({
						id: i.id,
						institution_code: i.institution_code,
						institution_name: i.institution_name || i.name
					}))
					: []
				setInstitutions(mapped)
			}
		} catch (e) {
			console.error('Failed to load institutions:', e)
		}
	}

	// Load data on mount
	useEffect(() => {
		fetchConfigs()
		fetchInstitutions()
	}, [])

	// Validation
	const validate = () => {
		const e: Record<string, string> = {}

		// Required field validation
		if (!formData.smtp_host.trim()) e.smtp_host = "SMTP host is required"
		if (!formData.smtp_user.trim()) e.smtp_user = "SMTP username is required"
		if (!editing && !formData.smtp_password.trim()) e.smtp_password = "SMTP password is required"
		if (!formData.sender_email.trim()) e.sender_email = "Sender email is required"

		// Email format validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (formData.sender_email && !emailRegex.test(formData.sender_email)) {
			e.sender_email = "Please enter a valid email address"
		}
		if (formData.smtp_user && formData.smtp_user.includes('@') && !emailRegex.test(formData.smtp_user)) {
			e.smtp_user = "Please enter a valid email address"
		}

		// Port validation
		const port = parseInt(formData.smtp_port)
		if (isNaN(port) || port < 1 || port > 65535) {
			e.smtp_port = "Port must be between 1 and 65535"
		}

		// CC emails validation
		if (formData.default_cc_emails) {
			const emails = formData.default_cc_emails.split(',').map(e => e.trim()).filter(e => e)
			for (const email of emails) {
				if (!emailRegex.test(email)) {
					e.default_cc_emails = `Invalid email format: ${email}`
					break
				}
			}
		}

		setErrors(e)
		return Object.keys(e).length === 0
	}

	// CREATE & UPDATE
	const save = async () => {
		if (!validate()) return

		try {
			setLoading(true)

			const ccEmails = formData.default_cc_emails
				? formData.default_cc_emails.split(',').map(e => e.trim()).filter(e => e)
				: []

			const institutionCode = formData.institution_code === "__none__" ? null : (formData.institution_code || null)

			if (editing) {
				// UPDATE — send all fields explicitly
				const updatePayload: Record<string, any> = {
					id: editing.id,
					institution_code: institutionCode,
					smtp_host: formData.smtp_host.trim(),
					smtp_port: parseInt(formData.smtp_port),
					smtp_secure: formData.smtp_secure,
					smtp_user: formData.smtp_user.trim(),
					sender_email: formData.sender_email.trim(),
					sender_name: formData.sender_name.trim() || null,
					default_cc_emails: ccEmails.length > 0 ? ccEmails : null,
					is_active: formData.is_active,
				}

				// Only include password if user entered a new one
				if (formData.smtp_password.trim()) {
					updatePayload.smtp_password = formData.smtp_password.trim()
				}

				const response = await fetch('/api/smtp-config', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(updatePayload),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to update SMTP configuration')
				}

				const updated = await response.json()
				setConfigs((prev) => prev.map((p) => (p.id === editing.id ? updated : p)))

				toast({
					title: "SMTP Configuration Updated",
					description: `Configuration for ${updated.smtp_host} has been successfully updated.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			} else {
				// CREATE
				const createPayload = {
					institution_code: institutionCode,
					smtp_host: formData.smtp_host.trim(),
					smtp_port: parseInt(formData.smtp_port),
					smtp_secure: formData.smtp_secure,
					smtp_user: formData.smtp_user.trim(),
					smtp_password: formData.smtp_password.trim(),
					sender_email: formData.sender_email.trim(),
					sender_name: formData.sender_name.trim() || null,
					default_cc_emails: ccEmails.length > 0 ? ccEmails : null,
					is_active: formData.is_active,
				}

				const response = await fetch('/api/smtp-config', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(createPayload),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to create SMTP configuration')
				}

				const created = await response.json()
				setConfigs((prev) => [created, ...prev])

				toast({
					title: "SMTP Configuration Created",
					description: `Configuration for ${created.smtp_host} has been successfully created.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			}

			setSheetOpen(false)
			resetForm()
		} catch (error) {
			console.error('Error saving SMTP config:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to save SMTP configuration. Please try again.'
			toast({
				title: "Save Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoading(false)
		}
	}

	// DELETE
	const remove = async (id: string) => {
		try {
			setLoading(true)
			const configHost = configs.find(i => i.id === id)?.smtp_host || 'Configuration'

			const response = await fetch(`/api/smtp-config?id=${id}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to delete SMTP configuration')
			}

			setConfigs((prev) => prev.filter((p) => p.id !== id))

			toast({
				title: "SMTP Configuration Deleted",
				description: `${configHost} has been successfully deleted.`,
				className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
			})
		} catch (error) {
			console.error('Error deleting SMTP config:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to delete SMTP configuration. Please try again.'
			toast({
				title: "Delete Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoading(false)
		}
	}

	// Test SMTP Connection
	const handleTestEmail = async () => {
		if (!testConfigId || !testEmail) {
			toast({
				title: "Missing Information",
				description: "Please enter a test email address.",
				variant: "destructive",
			})
			return
		}

		try {
			setTestLoading(true)
			const response = await fetch('/api/smtp-config/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					config_id: testConfigId,
					test_email: testEmail,
				}),
			})

			const result = await response.json()

			if (result.success) {
				toast({
					title: "Test Email Sent",
					description: `Test email sent successfully to ${testEmail}`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
				setTestDialogOpen(false)
				setTestEmail("")
			} else {
				toast({
					title: "Test Failed",
					description: result.error || result.details || "Failed to send test email",
					variant: "destructive",
				})
			}
		} catch (error) {
			console.error('Test email error:', error)
			toast({
				title: "Test Failed",
				description: "Failed to send test email. Please try again.",
				variant: "destructive",
			})
		} finally {
			setTestLoading(false)
		}
	}

	const resetForm = () => {
		setFormData({
			institution_code: "__none__",
			smtp_host: "",
			smtp_port: "587",
			smtp_secure: true,
			smtp_user: "",
			smtp_password: "",
			sender_email: "",
			sender_name: "",
			default_cc_emails: "",
			is_active: true,
		})
		setErrors({})
		setEditing(null)
		setShowPassword(false)
	}

	const openEdit = (config: SmtpConfig) => {
		setEditing(config)
		setFormData({
			institution_code: config.institution_code || "__none__",
			smtp_host: config.smtp_host,
			smtp_port: config.smtp_port.toString(),
			smtp_secure: config.smtp_secure,
			smtp_user: config.smtp_user,
			smtp_password: "", // Don't pre-fill password
			sender_email: config.sender_email,
			sender_name: config.sender_name || "",
			default_cc_emails: config.default_cc_emails?.join(', ') || "",
			is_active: config.is_active,
		})
		setSheetOpen(true)
	}

	const openTestDialog = (configId: string) => {
		setTestConfigId(configId)
		setTestEmail("")
		setTestDialogOpen(true)
	}

	// Filtering and sorting
	const filtered = useMemo(() => {
		let result = configs

		// Status filter
		if (statusFilter !== "all") {
			result = result.filter(c => statusFilter === "active" ? c.is_active : !c.is_active)
		}

		// Search filter
		if (searchTerm) {
			const term = searchTerm.toLowerCase()
			result = result.filter(c =>
				c.smtp_host.toLowerCase().includes(term) ||
				c.smtp_user.toLowerCase().includes(term) ||
				c.sender_email.toLowerCase().includes(term) ||
				(c.institution_code && c.institution_code.toLowerCase().includes(term)) ||
				(c.sender_name && c.sender_name.toLowerCase().includes(term))
			)
		}

		// Sorting
		if (sortColumn) {
			result = [...result].sort((a, b) => {
				const aVal = (a as any)[sortColumn]
				const bVal = (b as any)[sortColumn]
				if (aVal == null) return 1
				if (bVal == null) return -1
				if (typeof aVal === 'string') {
					return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
				}
				return sortDirection === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1)
			})
		}

		return result
	}, [configs, searchTerm, statusFilter, sortColumn, sortDirection])

	const pageSizeOptions = useMemo(() => {
		const allSizes = [10, 20, 50, 100, 250, 500, 1000]
		const total = filtered.length
		const options = allSizes.filter(s => s < total)
		if (!options.includes(10)) options.unshift(10)
		if (total > 10) options.push(total)
		return options
	}, [filtered.length])

	const isShowAll = itemsPerPage >= filtered.length
	const effectivePerPage = isShowAll ? filtered.length || 1 : itemsPerPage

	// Pagination
	const totalPages = Math.ceil(filtered.length / effectivePerPage) || 1
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage
	const paginatedItems = filtered.slice(startIndex, endIndex)

	useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, statusFilter])

	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc")
		} else {
			setSortColumn(column)
			setSortDirection("asc")
		}
	}

	const getSortIcon = (column: string) => {
		if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
		return sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
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
										<Link href="/master">Master</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>SMTP Configuration</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Scorecard Section */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{configs.length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Configurations</p>
									</div>
									<Server className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{configs.filter(i => i.is_active).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Active</p>
									</div>
									<CheckCircle className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-red-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{configs.filter(i => !i.is_active).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Inactive</p>
									</div>
									<XCircle className="h-5 w-5 text-red-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{configs.filter(i => i.smtp_secure).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Secure (TLS)</p>
									</div>
									<Shield className="h-5 w-5 text-purple-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Main Content */}
					<TooltipProvider delayDuration={300}>
						<Card className="flex-1 flex flex-col min-h-0">
							<CardHeader className="flex-shrink-0 p-3">
								<div className="flex items-center justify-between mb-2">
									<div className="flex items-center gap-2">
										<div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
											<Mail className="h-3 w-3 text-primary" />
										</div>
										<div>
											<h2 className="text-sm font-semibold">SMTP Configuration</h2>
											<p className="text-xs text-muted-foreground">Manage email server configurations</p>
										</div>
									</div>
								</div>

								<div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
									<div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
										<Select value={statusFilter} onValueChange={setStatusFilter}>
											<SelectTrigger className="w-[140px] h-8">
												<SelectValue placeholder="All Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Status</SelectItem>
												<SelectItem value="active">Active</SelectItem>
												<SelectItem value="inactive">Inactive</SelectItem>
											</SelectContent>
										</Select>

										<div className="relative w-full sm:w-[220px]">
											<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
											<Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search…" className="pl-8 h-8 text-xs" />
										</div>
									</div>

									<div className="flex gap-1 flex-wrap">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={fetchConfigs} disabled={loading}>
													<RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Refresh</TooltipContent>
										</Tooltip>
										<Button size="sm" className="text-xs px-2 h-8" onClick={() => { resetForm(); setSheetOpen(true) }} disabled={loading}>
											<PlusCircle className="h-3 w-3 mr-1" />
											Add
										</Button>
									</div>
								</div>
							</CardHeader>
							<CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
								{/* Table */}
								<div className="rounded-md border overflow-hidden" style={{ height: "440px" }}>
									<div className="h-full overflow-auto">
										<Table>
											<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
												<TableRow>
													<TableHead className="w-[120px] text-xs">
														<Button variant="ghost" size="sm" onClick={() => handleSort('institution_code')} className="h-auto p-0 font-medium hover:bg-transparent">
															Institution
															<span className="ml-1">{getSortIcon('institution_code')}</span>
														</Button>
													</TableHead>
													<TableHead className="w-[150px] text-xs">
														<Button variant="ghost" size="sm" onClick={() => handleSort('smtp_host')} className="h-auto p-0 font-medium hover:bg-transparent">
															SMTP Host
															<span className="ml-1">{getSortIcon('smtp_host')}</span>
														</Button>
													</TableHead>
													<TableHead className="w-[80px] text-xs">Port</TableHead>
													<TableHead className="w-[80px] text-xs">Secure</TableHead>
													<TableHead className="text-xs">
														<Button variant="ghost" size="sm" onClick={() => handleSort('sender_email')} className="h-auto p-0 font-medium hover:bg-transparent">
															Sender Email
															<span className="ml-1">{getSortIcon('sender_email')}</span>
														</Button>
													</TableHead>
													<TableHead className="w-[150px] text-xs">Sender Name</TableHead>
													<TableHead className="w-[100px] text-xs">
														<Button variant="ghost" size="sm" onClick={() => handleSort('is_active')} className="h-auto p-0 font-medium hover:bg-transparent">
															Status
															<span className="ml-1">{getSortIcon('is_active')}</span>
														</Button>
													</TableHead>
													<TableHead className="w-[80px] text-xs text-center">Actions</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{loading ? (
													<TableRow>
														<TableCell colSpan={8} className="h-24 text-center">
															<div className="flex items-center justify-center gap-2 text-muted-foreground">
																<RefreshCw className="h-4 w-4 animate-spin" />
																<span className="text-sm">Loading...</span>
															</div>
														</TableCell>
													</TableRow>
												) : paginatedItems.length ? (
													<>
														{paginatedItems.map((config) => (
															<TableRow key={config.id}>
																<TableCell className="text-sm font-medium">{config.institution_code || '-'}</TableCell>
																<TableCell className="text-sm">{config.smtp_host}</TableCell>
																<TableCell className="text-sm text-muted-foreground">{config.smtp_port}</TableCell>
																<TableCell>
																	<Badge
																		variant="outline"
																		className={`text-xs ${config.smtp_secure
																			? 'bg-green-50 text-green-700 border-green-200'
																			: 'bg-yellow-50 text-yellow-700 border-yellow-200'
																			}`}
																	>
																		{config.smtp_secure ? 'TLS' : 'Plain'}
																	</Badge>
																</TableCell>
																<TableCell className="text-sm">{config.sender_email}</TableCell>
																<TableCell className="text-sm text-muted-foreground">{config.sender_name || '-'}</TableCell>
																<TableCell>
																	<Badge
																		variant={config.is_active ? "default" : "secondary"}
																		className={`text-xs ${config.is_active
																			? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200'
																			: 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200'
																			}`}
																	>
																		{config.is_active ? "Active" : "Inactive"}
																	</Badge>
																</TableCell>
																<TableCell>
																	<div className="flex items-center justify-center">
																		<DropdownMenu>
																			<DropdownMenuTrigger asChild>
																				<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
																					<MoreHorizontal className="h-4 w-4" />
																				</Button>
																			</DropdownMenuTrigger>
																			<DropdownMenuContent align="end" className="w-40">
																				<DropdownMenuItem onClick={() => openTestDialog(config.id)}>
																					<TestTube className="h-3.5 w-3.5 mr-2" />
																					Test Email
																				</DropdownMenuItem>
																				<DropdownMenuItem onClick={() => openEdit(config)}>
																					<Edit className="h-3.5 w-3.5 mr-2" />
																					Edit
																				</DropdownMenuItem>
																				<DropdownMenuSeparator />
																				<DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20" onClick={() => setDeleteTarget(config)}>
																					<Trash2 className="h-3.5 w-3.5 mr-2" />
																					Delete
																				</DropdownMenuItem>
																			</DropdownMenuContent>
																		</DropdownMenu>
																	</div>
																</TableCell>
															</TableRow>
														))}
													</>
												) : (
													<TableRow>
														<TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">No configurations found</TableCell>
													</TableRow>
												)}
											</TableBody>
										</Table>
									</div>
								</div>

								{/* Pagination */}
								<div className="flex items-center justify-between pt-3">
									<div className="flex items-center gap-3">
										<p className="text-sm text-muted-foreground tabular-nums">
											{filtered.length === 0 ? 'No results' : `${startIndex + 1}\u2013${Math.min(endIndex, filtered.length)} of ${filtered.length}`}
										</p>
										<div className="flex items-center gap-1.5">
											<span className="text-xs text-muted-foreground">Rows</span>
											<Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
												<SelectTrigger className="h-7 w-[70px] text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{pageSizeOptions.map((size) => (
														<SelectItem key={size} value={String(size)}>
															{size === filtered.length ? 'All' : size}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="flex items-center gap-1">
										<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 w-7 p-0"><ChevronLeft className="h-3.5 w-3.5" /></Button>
										<span className="text-xs text-muted-foreground px-2 tabular-nums">{currentPage} / {totalPages}</span>
										<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-7 w-7 p-0"><ChevronRight className="h-3.5 w-3.5" /></Button>
									</div>
								</div>
							</CardContent>
						</Card>
					</TooltipProvider>
				</div>
				<AppFooter />
			</SidebarInset>

			{/* Form Sheet */}
			<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
				<SheetContent className="sm:max-w-[700px] overflow-y-auto">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle className="text-lg font-semibold">
							{editing ? "Edit SMTP Configuration" : "Add SMTP Configuration"}
						</SheetTitle>
						<p className="text-sm text-muted-foreground">
							{editing ? "Update email server settings" : "Configure a new SMTP server"}
						</p>
					</SheetHeader>

					<div className="mt-6 space-y-6">
						{/* Institution Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Institution</h3>
							<div className="space-y-2">
								<Label htmlFor="institution_code" className="text-sm font-semibold">
									Institution (Optional)
								</Label>
								<Select
									value={formData.institution_code}
									onValueChange={(value) => setFormData({ ...formData, institution_code: value })}
								>
									<SelectTrigger className="h-10">
										<SelectValue placeholder="Select institution (optional)" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__none__">No specific institution (Global)</SelectItem>
										{institutions.map((inst) => (
											<SelectItem key={inst.id} value={inst.institution_code}>
												{inst.institution_code} - {inst.institution_name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">Leave empty for a global SMTP configuration</p>
							</div>
						</div>

						{/* SMTP Server Section */}
						<div className="space-y-4 pt-2 border-t">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SMTP Server</h3>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="smtp_host" className="text-sm font-semibold">
										SMTP Host <span className="text-red-500">*</span>
									</Label>
									<Input
										id="smtp_host"
										value={formData.smtp_host}
										onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
										className={`h-10 ${errors.smtp_host ? 'border-destructive' : ''}`}
										placeholder="e.g., smtp.gmail.com"
									/>
									{errors.smtp_host && <p className="text-xs text-destructive">{errors.smtp_host}</p>}
								</div>

								<div className="space-y-2">
									<Label htmlFor="smtp_port" className="text-sm font-semibold">
										Port <span className="text-red-500">*</span>
									</Label>
									<Select
										value={formData.smtp_port}
										onValueChange={(value) => setFormData({ ...formData, smtp_port: value })}
									>
										<SelectTrigger className={`h-10 ${errors.smtp_port ? 'border-destructive' : ''}`}>
											<SelectValue placeholder="Select port" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="25">25 (SMTP)</SelectItem>
											<SelectItem value="465">465 (SMTPS)</SelectItem>
											<SelectItem value="587">587 (Submission)</SelectItem>
											<SelectItem value="2525">2525 (Alternative)</SelectItem>
										</SelectContent>
									</Select>
									{errors.smtp_port && <p className="text-xs text-destructive">{errors.smtp_port}</p>}
								</div>
							</div>

							<div className="flex items-center gap-4">
								<Label className="text-sm font-semibold">TLS/SSL Secure</Label>
								<button
									type="button"
									onClick={() => setFormData({ ...formData, smtp_secure: !formData.smtp_secure })}
									className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.smtp_secure ? 'bg-green-500' : 'bg-gray-300'}`}
								>
									<span
										className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.smtp_secure ? 'translate-x-6' : 'translate-x-1'}`}
									/>
								</button>
								<span className={`text-sm font-medium ${formData.smtp_secure ? 'text-green-600' : 'text-gray-500'}`}>
									{formData.smtp_secure ? 'Enabled (Recommended)' : 'Disabled'}
								</span>
							</div>
						</div>

						{/* Authentication Section */}
						<div className="space-y-4 pt-2 border-t">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Authentication</h3>

							<div className="space-y-2">
								<Label htmlFor="smtp_user" className="text-sm font-semibold">
									SMTP Username <span className="text-red-500">*</span>
								</Label>
								<Input
									id="smtp_user"
									value={formData.smtp_user}
									onChange={(e) => setFormData({ ...formData, smtp_user: e.target.value })}
									className={`h-10 ${errors.smtp_user ? 'border-destructive' : ''}`}
									placeholder="e.g., coe@jkkn.edu.in"
								/>
								{errors.smtp_user && <p className="text-xs text-destructive">{errors.smtp_user}</p>}
							</div>

							<div className="space-y-2">
								<Label htmlFor="smtp_password" className="text-sm font-semibold">
									SMTP Password {!editing && <span className="text-red-500">*</span>}
								</Label>
								<div className="relative">
									<Input
										id="smtp_password"
										type={showPassword ? "text" : "password"}
										value={formData.smtp_password}
										onChange={(e) => setFormData({ ...formData, smtp_password: e.target.value })}
										className={`h-10 pr-10 ${errors.smtp_password ? 'border-destructive' : ''}`}
										placeholder={editing ? "Leave empty to keep current password" : "Enter SMTP password"}
									/>
									<button
										type="button"
										onClick={() => setShowPassword(!showPassword)}
										className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
									>
										{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
									</button>
								</div>
								{errors.smtp_password && <p className="text-xs text-destructive">{errors.smtp_password}</p>}
								<p className="text-xs text-muted-foreground">For Gmail, use an App Password (not your regular password)</p>
							</div>
						</div>

						{/* Sender Information Section */}
						<div className="space-y-4 pt-2 border-t">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sender Information</h3>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="sender_email" className="text-sm font-semibold">
										Sender Email <span className="text-red-500">*</span>
									</Label>
									<Input
										id="sender_email"
										type="email"
										value={formData.sender_email}
										onChange={(e) => setFormData({ ...formData, sender_email: e.target.value })}
										className={`h-10 ${errors.sender_email ? 'border-destructive' : ''}`}
										placeholder="e.g., coe@jkkn.edu.in"
									/>
									{errors.sender_email && <p className="text-xs text-destructive">{errors.sender_email}</p>}
								</div>

								<div className="space-y-2">
									<Label htmlFor="sender_name" className="text-sm font-semibold">
										Sender Name
									</Label>
									<Input
										id="sender_name"
										value={formData.sender_name}
										onChange={(e) => setFormData({ ...formData, sender_name: e.target.value })}
										className="h-10"
										placeholder="e.g., Controller of Examinations"
									/>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="default_cc_emails" className="text-sm font-semibold">
									Default CC Emails
								</Label>
								<Input
									id="default_cc_emails"
									value={formData.default_cc_emails}
									onChange={(e) => setFormData({ ...formData, default_cc_emails: e.target.value })}
									className={`h-10 ${errors.default_cc_emails ? 'border-destructive' : ''}`}
									placeholder="email1@example.com, email2@example.com"
								/>
								{errors.default_cc_emails && <p className="text-xs text-destructive">{errors.default_cc_emails}</p>}
								<p className="text-xs text-muted-foreground">Comma-separated list of emails to CC on all outgoing emails</p>
							</div>
						</div>

						{/* Status Section */}
						<div className="space-y-4 pt-2 border-t">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</h3>
							<div className="flex items-center gap-4">
								<Label className="text-sm font-semibold">Configuration Status</Label>
								<button
									type="button"
									onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
									className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
								>
									<span
										className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_active ? 'translate-x-6' : 'translate-x-1'}`}
									/>
								</button>
								<span className={`text-sm font-medium ${formData.is_active ? 'text-green-600' : 'text-red-500'}`}>
									{formData.is_active ? 'Active' : 'Inactive'}
								</span>
							</div>
						</div>

						{/* Action Buttons */}
						<div className="flex justify-end gap-3 pt-6 border-t">
							<Button
								variant="outline"
								size="sm"
								className="h-10 px-6"
								onClick={() => { setSheetOpen(false); resetForm() }}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								className="h-10 px-6"
								onClick={save}
								disabled={loading}
							>
								{editing ? "Update Configuration" : "Create Configuration"}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete SMTP Configuration</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete the configuration for <strong>{deleteTarget?.smtp_host}</strong>? This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => { if (deleteTarget) remove(deleteTarget.id); setDeleteTarget(null) }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Test Email Dialog */}
			<AlertDialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
								<TestTube className="h-5 w-5 text-blue-600 dark:text-blue-400" />
							</div>
							<div>
								<AlertDialogTitle>Send Test Email</AlertDialogTitle>
								<AlertDialogDescription>
									Enter an email address to send a test email and verify the SMTP configuration.
								</AlertDialogDescription>
							</div>
						</div>
					</AlertDialogHeader>

					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="test_email" className="text-sm font-semibold">
								Test Email Address <span className="text-red-500">*</span>
							</Label>
							<Input
								id="test_email"
								type="email"
								value={testEmail}
								onChange={(e) => setTestEmail(e.target.value)}
								placeholder="Enter email to receive test"
								className="h-10"
							/>
						</div>
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => { setTestDialogOpen(false); setTestEmail("") }}>
							Cancel
						</AlertDialogCancel>
						<Button onClick={handleTestEmail} disabled={testLoading || !testEmail}>
							{testLoading ? (
								<>
									<RefreshCw className="h-4 w-4 mr-2 animate-spin" />
									Sending...
								</>
							) : (
								<>
									<Send className="h-4 w-4 mr-2" />
									Send Test Email
								</>
							)}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
