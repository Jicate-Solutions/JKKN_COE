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
import { FileText, Percent, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
	{
		name: 'Galley Report',
		href: '/grading/galley-report/report',
		icon: FileText,
		activeClasses: 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25',
		inactiveClasses: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-900/40',
	},
	{
		name: 'Pass Percentage Report',
		href: '/grading/galley-report/pass-percentage',
		icon: Percent,
		activeClasses: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25',
		inactiveClasses: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40',
	},
	{
		name: 'All Clear Report',
		href: '/grading/galley-report/all-clear',
		icon: CheckCircle2,
		activeClasses: 'bg-sky-500 text-white shadow-lg shadow-sky-500/25',
		inactiveClasses: 'bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-300 dark:hover:bg-sky-900/40',
	},
]

export default function GalleyReportLayout({
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
									<BreadcrumbLink className="text-muted-foreground">Grading</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								{activeTab ? (
									<>
										<BreadcrumbItem>
											<BreadcrumbLink asChild>
												<Link href="/grading/galley-report/report">Reports</Link>
											</BreadcrumbLink>
										</BreadcrumbItem>
										<BreadcrumbSeparator />
										<BreadcrumbItem>
											<BreadcrumbPage>{activeTab.name}</BreadcrumbPage>
										</BreadcrumbItem>
									</>
								) : (
									<BreadcrumbItem>
										<BreadcrumbPage>Reports</BreadcrumbPage>
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
