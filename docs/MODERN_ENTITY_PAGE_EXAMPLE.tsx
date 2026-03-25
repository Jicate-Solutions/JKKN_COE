"use client"

/**
 * MODERN ENTITY PAGE EXAMPLE
 *
 * This is a reference implementation for entity management pages
 * Shows modern table design, search, filters, and CRUD operations
 *
 * Use this as a template for:
 * - Institutions page
 * - Degrees page
 * - Departments page
 * - Programs page
 * - Courses page
 * - etc.
 *
 * File Location: app/coe/[entity]/page.tsx
 */

import { useState, useEffect } from "react"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { ModernSidebar } from "@/components/layout/modern-sidebar"
import { ModernNavbar } from "@/components/layout/modern-navbar"
import { ModernBreadcrumb } from "@/components/common/modern-breadcrumb"
import { PageTransition } from "@/components/common/page-transition"
import { DeleteConfirmDialog } from "@/components/common/confirm-dialog"
import { TableSkeleton } from "@/components/common/loading-skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
	Search,
	Plus,
	Download,
	Upload,
	RefreshCw,
	MoreHorizontal,
	Pencil,
	Trash2,
	ArrowUpDown,
} from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

// Sample navigation data
const navData = [
	{ title: "Dashboard", url: "/dashboard" },
	{
		title: "Master",
		url: "#",
		items: [
			{ title: "Institutions", url: "/institutions" },
			{ title: "Degrees", url: "/degrees" },
		],
	},
]

// Sample data interface
interface Institution {
	id: string
	institution_code: string
	institution_name: string
	short_name: string
	institution_type: string
	is_active: boolean
	created_at: string
}

export default function ModernEntityPage() {
	const { toast } = useToast()
	const [items, setItems] = useState<Institution[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [statusFilter, setStatusFilter] = useState("all")
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [itemToDelete, setItemToDelete] = useState<Institution | null>(null)
	const [deleting, setDeleting] = useState(false)

	// Fetch data
	useEffect(() => {
		const fetchData = async () => {
			try {
				setLoading(true)
				const response = await fetch('/api/institutions')
				if (!response.ok) throw new Error('Failed to fetch')
				const data = await response.json()
				setItems(data)
			} catch (error) {
				console.error('Error:', error)
				toast({
					title: "Error",
					description: "Failed to load data",
					variant: "destructive"
				})
			} finally {
				setLoading(false)
			}
		}

		fetchData()
	}, [toast])

	// Filter and search
	const filteredItems = items.filter(item => {
		const matchesSearch =
			item.institution_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			item.institution_code.toLowerCase().includes(searchTerm.toLowerCase())

		const matchesStatus =
			statusFilter === "all" ||
			(statusFilter === "active" && item.is_active) ||
			(statusFilter === "inactive" && !item.is_active)

		return matchesSearch && matchesStatus
	})

	// Delete handler
	const handleDelete = async () => {
		if (!itemToDelete) return

		try {
			setDeleting(true)
			const response = await fetch(`/api/institutions/${itemToDelete.id}`, {
				method: 'DELETE',
			})

			if (!response.ok) throw new Error('Failed to delete')

			setItems(items.filter(i => i.id !== itemToDelete.id))

			toast({
				title: "Success",
				description: "Institution deleted successfully",
			})
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to delete institution",
				variant: "destructive"
			})
		} finally {
			setDeleting(false)
			setDeleteDialogOpen(false)
			setItemToDelete(null)
		}
	}

	return (
		<SidebarProvider>
			<ModernSidebar navItems={navData} />
			<SidebarInset>
				<ModernNavbar showSearch={true} />

				<PageTransition>
					<div className="flex flex-1 flex-col gap-6 p-6 md:p-10">
						{/* Breadcrumb */}
						<ModernBreadcrumb
							items={[
								{ label: "Master", href: "#" },
								{ label: "Institutions", current: true }
							]}
						/>

						{/* Page Header */}
						<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
							<div>
								<h1 className="text-page-title">Institutions</h1>
								<p className="text-caption mt-1">
									Manage educational institutions and their settings
								</p>
							</div>

							<div className="flex items-center gap-2">
								<Button variant="outline" size="sm" className="rounded-lg">
									<Upload className="h-4 w-4 mr-2" />
									Import
								</Button>
								<Button variant="outline" size="sm" className="rounded-lg">
									<Download className="h-4 w-4 mr-2" />
									Export
								</Button>
								<Button size="sm" className="rounded-lg bg-saas-primary-600 hover:bg-saas-primary-700">
									<Plus className="h-4 w-4 mr-2" />
									Add New
								</Button>
							</div>
						</div>

						{/* Stats Cards */}
						<div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-3">
							<Card className="card-modern">
								<CardContent className="pt-6">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-sm text-muted-foreground">Total</p>
											<p className="text-2xl font-bold">{items.length}</p>
										</div>
										<div className="h-10 w-10 rounded-xl bg-saas-primary-100 dark:bg-saas-primary-900/20 flex items-center justify-center">
											<span className="text-saas-primary-600 dark:text-saas-primary-400 text-sm font-bold">
												{items.length}
											</span>
										</div>
									</div>
								</CardContent>
							</Card>

							<Card className="card-modern">
								<CardContent className="pt-6">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-sm text-muted-foreground">Active</p>
											<p className="text-2xl font-bold">
												{items.filter(i => i.is_active).length}
											</p>
										</div>
										<div className="h-10 w-10 rounded-xl bg-saas-accent-100 dark:bg-saas-accent-900/20 flex items-center justify-center">
											<span className="text-saas-accent-600 dark:text-saas-accent-400 text-sm font-bold">
												{items.filter(i => i.is_active).length}
											</span>
										</div>
									</div>
								</CardContent>
							</Card>

							<Card className="card-modern">
								<CardContent className="pt-6">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-sm text-muted-foreground">Inactive</p>
											<p className="text-2xl font-bold">
												{items.filter(i => !i.is_active).length}
											</p>
										</div>
										<div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
											<span className="text-muted-foreground text-sm font-bold">
												{items.filter(i => !i.is_active).length}
											</span>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Filters and Search */}
						<Card className="card-modern">
							<CardContent className="pt-6">
								<div className="flex flex-col md:flex-row gap-4">
									{/* Search */}
									<div className="relative flex-1">
										<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
										<Input
											placeholder="Search institutions..."
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											className="pl-9 rounded-lg"
										/>
									</div>

									{/* Status Filter */}
									<Select value={statusFilter} onValueChange={setStatusFilter}>
										<SelectTrigger className="w-full md:w-[180px] rounded-lg">
											<SelectValue placeholder="Filter by status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Status</SelectItem>
											<SelectItem value="active">Active</SelectItem>
											<SelectItem value="inactive">Inactive</SelectItem>
										</SelectContent>
									</Select>

									{/* Refresh */}
									<Button
										variant="outline"
										size="icon"
										className="rounded-lg"
										onClick={() => window.location.reload()}
									>
										<RefreshCw className="h-4 w-4" />
									</Button>
								</div>
							</CardContent>
						</Card>

						{/* Data Table */}
						{loading ? (
							<TableSkeleton rows={8} columns={6} />
						) : (
							<Card className="card-modern overflow-hidden">
								<div className="overflow-x-auto">
									<table className="table-modern">
										<thead>
											<tr>
												<th className="w-[120px]">
													<Button variant="ghost" size="sm" className="h-8 font-semibold">
														Code
														<ArrowUpDown className="ml-2 h-3 w-3" />
													</Button>
												</th>
												<th>
													<Button variant="ghost" size="sm" className="h-8 font-semibold">
														Institution Name
														<ArrowUpDown className="ml-2 h-3 w-3" />
													</Button>
												</th>
												<th className="w-[150px]">Short Name</th>
												<th className="w-[120px]">Type</th>
												<th className="w-[100px]">Status</th>
												<th className="w-[80px] text-right">Actions</th>
											</tr>
										</thead>
										<tbody>
											{filteredItems.length === 0 ? (
												<tr>
													<td colSpan={6} className="text-center py-12">
														<div className="flex flex-col items-center gap-2">
															<p className="text-muted-foreground">No institutions found</p>
															<Button
																variant="outline"
																size="sm"
																className="rounded-lg"
																onClick={() => setSearchTerm("")}
															>
																Clear filters
															</Button>
														</div>
													</td>
												</tr>
											) : (
												filteredItems.map((item) => (
													<tr key={item.id}>
														<td>
															<code className="text-xs font-mono bg-muted px-2 py-1 rounded">
																{item.institution_code}
															</code>
														</td>
														<td className="font-medium">{item.institution_name}</td>
														<td className="text-muted-foreground">{item.short_name}</td>
														<td>
															<Badge variant="outline" className="font-normal">
																{item.institution_type}
															</Badge>
														</td>
														<td>
															{item.is_active ? (
																<span className="pill-success">Active</span>
															) : (
																<span className="pill-error">Inactive</span>
															)}
														</td>
														<td className="text-right">
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button variant="ghost" size="icon" className="h-8 w-8">
																		<MoreHorizontal className="h-4 w-4" />
																	</Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end">
																	<DropdownMenuItem>
																		<Pencil className="mr-2 h-4 w-4" />
																		Edit
																	</DropdownMenuItem>
																	<DropdownMenuItem
																		className="text-destructive focus:text-destructive"
																		onClick={() => {
																			setItemToDelete(item)
																			setDeleteDialogOpen(true)
																		}}
																	>
																		<Trash2 className="mr-2 h-4 w-4" />
																		Delete
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</td>
													</tr>
												))
											)}
										</tbody>
									</table>
								</div>

								{/* Pagination */}
								{filteredItems.length > 0 && (
									<div className="border-t border-border px-6 py-4 flex items-center justify-between">
										<p className="text-sm text-muted-foreground">
											Showing <span className="font-medium">{filteredItems.length}</span> of{" "}
											<span className="font-medium">{items.length}</span> institutions
										</p>
										<div className="flex gap-2">
											<Button variant="outline" size="sm" className="rounded-lg" disabled>
												Previous
											</Button>
											<Button variant="outline" size="sm" className="rounded-lg" disabled>
												Next
											</Button>
										</div>
									</div>
								)}
							</Card>
						)}
					</div>
				</PageTransition>

				{/* Delete Confirmation Dialog */}
				<DeleteConfirmDialog
					open={deleteDialogOpen}
					onOpenChange={setDeleteDialogOpen}
					onConfirm={handleDelete}
					itemName={itemToDelete?.institution_name || "this institution"}
					loading={deleting}
				/>
			</SidebarInset>
		</SidebarProvider>
	)
}
