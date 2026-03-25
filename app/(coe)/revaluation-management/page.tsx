'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/context/auth-context'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { FileText, UserCheck, PenTool, CheckCircle, DollarSign, Users, CreditCard } from 'lucide-react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import ApplicationsTab from '@/components/revaluation/applications-tab'
import BulkApplicationTab from '@/components/revaluation/bulk-application-tab'
import PaymentStatusTab from '@/components/revaluation/payment-status-tab'
import AssignmentsTab from '@/components/revaluation/assignments-tab'
import MarksEntryTab from '@/components/revaluation/marks-entry-tab'
import ResultsPublishingTab from '@/components/revaluation/results-publishing-tab'
import FeeConfigurationTab from '@/components/revaluation/fee-configuration-tab'

export default function RevaluationManagementPage() {
	const { hasPermission, hasRole } = useAuth()
	const { isReady } = useInstitutionFilter()
	const [activeTab, setActiveTab] = useState<string>('applications')

	// Define tab permissions
	const tabs = [
		{
			id: 'applications',
			label: 'Applications',
			icon: FileText,
			component: ApplicationsTab,
			permissions: ['revaluation:read', 'revaluation:create'],
			description: 'Manage revaluation applications',
		},
		{
			id: 'bulk-application',
			label: 'Bulk Application',
			icon: Users,
			component: BulkApplicationTab,
			permissions: ['revaluation:create'],
			description: 'Add multiple students for revaluation in bulk',
		},
		{
			id: 'payment-status',
			label: 'Payment Status',
			icon: CreditCard,
			component: PaymentStatusTab,
			permissions: ['revaluation:read', 'revaluation:verify_payment'],
			description: 'Verify and manage payment status',
		},
		{
			id: 'assignments',
			label: 'Assignments',
			icon: UserCheck,
			component: AssignmentsTab,
			permissions: ['revaluation:assign'],
			description: 'Assign examiners to revaluations',
		},
		{
			id: 'marks-entry',
			label: 'Marks Entry',
			icon: PenTool,
			component: MarksEntryTab,
			permissions: ['revaluation_marks:create', 'revaluation_marks:update'],
			description: 'Enter revaluation marks',
		},
		{
			id: 'results',
			label: 'Results & Publishing',
			icon: CheckCircle,
			component: ResultsPublishingTab,
			permissions: ['revaluation:publish'],
			description: 'Review and publish results',
		},
		{
			id: 'fee-config',
			label: 'Fee Configuration',
			icon: DollarSign,
			component: FeeConfigurationTab,
			permissions: ['revaluation:configure'],
			description: 'Configure revaluation fees',
		},
	]

	// Filter tabs based on permissions
	const visibleTabs = tabs.filter((tab) =>
		tab.permissions.some((permission) => hasPermission(permission))
	)

	// Set default active tab to first visible tab
	useEffect(() => {
		if (visibleTabs.length > 0 && !visibleTabs.find((t) => t.id === activeTab)) {
			setActiveTab(visibleTabs[0].id)
		}
	}, [visibleTabs, activeTab])

	if (!isReady) {
		return (
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="flex flex-col min-h-screen">
					<AppHeader />
					<PageTransition>
						<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
							<div className="flex items-center justify-center min-h-[400px]">
								<div className="text-center">
									<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
									<p className="text-sm text-gray-600">Loading...</p>
								</div>
							</div>
						</div>
					</PageTransition>
					<AppFooter />
				</SidebarInset>
			</SidebarProvider>
		)
	}

	if (visibleTabs.length === 0) {
		return (
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="flex flex-col min-h-screen">
					<AppHeader />
					<PageTransition>
						<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
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
											<BreadcrumbPage>Revaluation Management</BreadcrumbPage>
										</BreadcrumbItem>
									</BreadcrumbList>
								</Breadcrumb>
							</div>

							<Card className="border-amber-200 bg-amber-50">
								<CardHeader>
									<CardTitle className="text-amber-800">Access Restricted</CardTitle>
									<CardDescription className="text-amber-700">
										You do not have permission to access any revaluation management features.
										Please contact your administrator.
									</CardDescription>
								</CardHeader>
							</Card>
						</div>
					</PageTransition>
					<AppFooter />
				</SidebarInset>
			</SidebarProvider>
		)
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
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
										<BreadcrumbPage>Revaluation Management</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>

						{/* Header */}
						<div>
							<h1 className="text-3xl font-bold text-gray-900">Revaluation Management</h1>
							<p className="text-gray-600 mt-1">
								Manage revaluation applications, assignments, marks entry, and result publication
							</p>
						</div>

						{/* Tabs */}
						<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
							<TabsList className="grid w-full grid-cols-2 lg:grid-cols-7 gap-2">
								{visibleTabs.map((tab) => {
									const Icon = tab.icon
									return (
										<TabsTrigger
											key={tab.id}
											value={tab.id}
											className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
										>
											<Icon className="h-4 w-4" />
											<span className="hidden sm:inline">{tab.label}</span>
										</TabsTrigger>
									)
								})}
							</TabsList>

							{visibleTabs.map((tab) => {
								const Component = tab.component
								return (
									<TabsContent key={tab.id} value={tab.id} className="space-y-4">
										<Card>
											<CardHeader className="border-b bg-gradient-to-r from-blue-50 to-indigo-50">
												<CardTitle className="flex items-center gap-2 text-blue-900">
													<tab.icon className="h-5 w-5" />
													{tab.label}
												</CardTitle>
												<CardDescription className="text-blue-700">
													{tab.description}
												</CardDescription>
											</CardHeader>
											<CardContent className="pt-6">
												<Component />
											</CardContent>
										</Card>
									</TabsContent>
								)
							})}
						</Tabs>
					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
