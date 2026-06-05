"use client"

import Link from "next/link"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { Mail, Building2, Shield, BadgeCheck, Clock, IdCard, KeyRound } from "lucide-react"

function initialsOf(name?: string, email?: string): string {
	const src = (name || email || "?").trim()
	const parts = src.split(/\s+/).filter(Boolean)
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
	return src.slice(0, 2).toUpperCase()
}

function formatDateTime(value?: string | null): string {
	if (!value) return "—"
	const d = new Date(value)
	if (isNaN(d.getTime())) return "—"
	return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-start gap-3 py-2.5">
			<div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
				{icon}
			</div>
			<div className="min-w-0">
				<p className="text-xs font-medium text-muted-foreground">{label}</p>
				<div className="text-sm break-words">{children}</div>
			</div>
		</div>
	)
}

export default function ProfilePage() {
	const { user, loading } = useAuth()

	const roles = user?.coe_roles?.length ? user.coe_roles : (user?.roles || (user?.role ? [user.role] : []))

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
								<BreadcrumbPage>My Profile</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{loading ? (
						<Card><CardContent className="p-10 text-center text-muted-foreground">Loading profile…</CardContent></Card>
					) : !user ? (
						<Card><CardContent className="p-10 text-center text-muted-foreground">You are not signed in.</CardContent></Card>
					) : (
						<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
							{/* Identity card */}
							<Card className="lg:col-span-1">
								<CardContent className="p-6 flex flex-col items-center text-center">
									<Avatar className="h-20 w-20">
										{user.avatar_url ? <AvatarImage src={user.avatar_url} alt={user.full_name} /> : null}
										<AvatarFallback className="text-lg">{initialsOf(user.full_name, user.email)}</AvatarFallback>
									</Avatar>
									<h2 className="mt-3 text-lg font-semibold">{user.full_name || "—"}</h2>
									<p className="text-sm text-muted-foreground break-all">{user.email}</p>
									<div className="mt-3 flex flex-wrap justify-center gap-1.5">
										{user.is_super_admin && (
											<Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400">Super Admin</Badge>
										)}
										{user.has_coe_access ? (
											<Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400">COE Access</Badge>
										) : (
											<Badge variant="outline" className="text-muted-foreground">No COE Access</Badge>
										)}
									</div>
								</CardContent>
							</Card>

							{/* Details card */}
							<Card className="lg:col-span-2">
								<CardHeader className="pb-2">
									<h3 className="text-sm font-semibold">Account Details</h3>
									<p className="text-xs text-muted-foreground">
										Profile information is managed in your MyJKKN account. To change your name, photo, or email, update it in MyJKKN.
									</p>
								</CardHeader>
								<CardContent className="pt-0 divide-y">
									<Row icon={<Mail className="h-4 w-4" />} label="Email">{user.email || "—"}</Row>
									<Row icon={<Building2 className="h-4 w-4" />} label="Institution">
										{user.institution_name || user.institution_code || "—"}
										{user.institution_code && user.institution_name ? (
											<span className="text-muted-foreground"> ({user.institution_code})</span>
										) : null}
									</Row>
									<Row icon={<Shield className="h-4 w-4" />} label="Roles">
										{roles.length ? (
											<div className="flex flex-wrap gap-1.5 mt-0.5">
												{roles.map((r) => (
													<Badge key={r} variant="secondary" className="font-normal">{r}</Badge>
												))}
											</div>
										) : "—"}
									</Row>
									{user.department_code ? (
										<Row icon={<IdCard className="h-4 w-4" />} label="Department">{user.department_code}</Row>
									) : null}
									<Row icon={<BadgeCheck className="h-4 w-4" />} label="Status">
										{user.is_active === false ? (
											<Badge variant="outline" className="text-rose-700 border-rose-300 dark:text-rose-400">Inactive</Badge>
										) : (
											<Badge variant="outline" className="text-green-700 border-green-300 dark:text-green-400">Active</Badge>
										)}
									</Row>
									<Row icon={<KeyRound className="h-4 w-4" />} label="Permissions">
										{user.permissions?.length ? `${user.permissions.length} granted` : "—"}
									</Row>
									<Row icon={<Clock className="h-4 w-4" />} label="Last Login">{formatDateTime(user.last_login)}</Row>
								</CardContent>
							</Card>
						</div>
					)}
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
