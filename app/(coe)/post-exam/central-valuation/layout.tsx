'use client'

import { cloneElement } from 'react'
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
import { CalendarRange, UserCheck, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
	{
		name: 'Valuation Dates',
		href: '/post-exam/central-valuation/dates',
		icon: CalendarRange,
		activeClasses: 'bg-violet-500 text-white shadow-lg shadow-violet-500/25',
		inactiveClasses: 'bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40',
	},
	{
		name: 'Examiner Allotment',
		href: '/post-exam/central-valuation/examiner',
		icon: UserCheck,
		activeClasses: 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25',
		inactiveClasses: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40',
	},
	{
		name: 'Send Appointments',
		href: '/post-exam/central-valuation/email',
		icon: Mail,
		activeClasses: 'bg-amber-500 text-white shadow-lg shadow-amber-500/25',
		inactiveClasses: 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40',
	},
]

export default function CentralValuationLayout({
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
					<div className="flex items-center gap-2">
						<Breadcrumb>
							<BreadcrumbList>
								{(() => {
									const crumbs: Array<{ key: string; el: React.ReactElement }> = [
										{ key: 'dashboard', el: <BreadcrumbItem><BreadcrumbLink asChild><Link href="/dashboard">Dashboard</Link></BreadcrumbLink></BreadcrumbItem> },
										{ key: 'sep-1', el: <BreadcrumbSeparator /> },
										{ key: 'post-exam', el: <BreadcrumbItem><BreadcrumbLink className="text-muted-foreground">Post-Exam</BreadcrumbLink></BreadcrumbItem> },
										{ key: 'sep-2', el: <BreadcrumbSeparator /> },
									]
									if (activeTab) {
										crumbs.push(
											{ key: 'cv-link', el: <BreadcrumbItem><BreadcrumbLink asChild><Link href="/post-exam/central-valuation/dates">Central Valuation</Link></BreadcrumbLink></BreadcrumbItem> },
											{ key: 'sep-3', el: <BreadcrumbSeparator /> },
											{ key: 'cv-active', el: <BreadcrumbItem><BreadcrumbPage>{activeTab.name}</BreadcrumbPage></BreadcrumbItem> },
										)
									} else {
										crumbs.push(
											{ key: 'cv-only', el: <BreadcrumbItem><BreadcrumbPage>Central Valuation</BreadcrumbPage></BreadcrumbItem> },
										)
									}
									return crumbs.map(c => cloneElement(c.el, { key: c.key }))
								})()}
							</BreadcrumbList>
						</Breadcrumb>
					</div>

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

					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
