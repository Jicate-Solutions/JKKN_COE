'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Users, UserCheck, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
	{
		name: 'Batch Allotment',
		href: '/pre-exam/practical-allotment/batch',
		icon: Users,
		activeClasses: 'bg-violet-500 text-white shadow-lg shadow-violet-500/25',
		inactiveClasses: 'bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40',
	},
	{
		name: 'Examiner Allotment',
		href: '/pre-exam/practical-allotment/examiner',
		icon: UserCheck,
		activeClasses: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25',
		inactiveClasses: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40',
	},
	{
		name: 'Practical Emails',
		href: '/pre-exam/practical-allotment/email',
		icon: Mail,
		activeClasses: 'bg-amber-500 text-white shadow-lg shadow-amber-500/25',
		inactiveClasses: 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40',
	},
]

export default function PracticalAllotmentLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const pathname = usePathname()
	const activeTab = tabs.find(t => pathname === t.href)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
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
									<BreadcrumbLink className="text-muted-foreground">Pre-Exam</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								{activeTab ? (
									<>
										<BreadcrumbItem>
											<BreadcrumbLink asChild>
												<Link href="/pre-exam/practical-allotment/batch">Practical Allotment</Link>
											</BreadcrumbLink>
										</BreadcrumbItem>
										<BreadcrumbSeparator />
										<BreadcrumbItem>
											<BreadcrumbPage>{activeTab.name}</BreadcrumbPage>
										</BreadcrumbItem>
									</>
								) : (
									<BreadcrumbItem>
										<BreadcrumbPage>Practical Allotment</BreadcrumbPage>
									</BreadcrumbItem>
								)}
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Tab navigation */}
					<div className="flex items-center gap-2 flex-wrap">
						{tabs.map((tab) => {
							const isActive = pathname === tab.href
							const Icon = tab.icon
							return (
								<Link
									key={tab.href}
									href={tab.href}
									className={cn(
										'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
										isActive ? tab.activeClasses : tab.inactiveClasses,
									)}
								>
									<Icon className="h-4 w-4" />
									{tab.name}
								</Link>
							)
						})}
					</div>

					{/* Tab content */}
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
