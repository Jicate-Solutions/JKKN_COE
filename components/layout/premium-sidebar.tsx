"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "@/components/ui/sidebar"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context-parent"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"

export interface NavItem {
	title: string
	url: string
	icon?: LucideIcon
	isActive?: boolean
	roles?: string[]
	items?: NavItem[]
}

interface PremiumSidebarProps extends React.ComponentProps<typeof Sidebar> {
	navItems: NavItem[]
}

/**
 * Premium Sidebar Component
 *
 * Clean minimal design with:
 * - Emerald accent color
 * - Subtle hover states
 * - Active glow indicator
 * - Icon + text layout
 * - Role-based filtering
 */
export function PremiumSidebar({ navItems, ...props }: PremiumSidebarProps) {
	const { hasAnyRole } = useAuth()
	const pathname = usePathname()

	// Filter navigation items based on user roles
	const filteredNavItems = navItems.filter(item => {
		if (!item.roles || item.roles.length === 0) return true
		return hasAnyRole(item.roles)
	})

	return (
		<Sidebar collapsible="icon" {...props}>
			{/* Header */}
			<SidebarHeader className="h-16 border-b border-gray-100 dark:border-slate-800 flex items-center justify-center px-4">
				<Link
					href="/dashboard"
					className="group flex items-center gap-3"
				>
					{/* Logo - Collapsed */}
					<div className="group-data-[collapsible=icon]:flex hidden">
						<div className="w-10 h-10 rounded-md bg-emerald-600/10 flex items-center justify-center">
							<span className="text-emerald-600 text-lg font-bold font-grotesk">J</span>
						</div>
					</div>

					{/* Logo - Expanded */}
					<div className="group-data-[collapsible=icon]:hidden flex items-center gap-3">
						<div className="w-10 h-10 rounded-md bg-emerald-600/10 flex items-center justify-center">
							<span className="text-emerald-600 text-lg font-bold font-grotesk">J</span>
						</div>
						<div>
							<div className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-grotesk">JKKN COE</div>
							<div className="text-xs text-slate-500 dark:text-slate-400 font-inter">Controller of Examination</div>
						</div>
					</div>
				</Link>
			</SidebarHeader>

			{/* Content */}
			<SidebarContent className="px-3 py-4">
				<nav className="grid gap-1">
					{filteredNavItems.map((item, index) => (
						<NavItemComponent
							key={index}
							item={item}
							pathname={pathname}
						/>
					))}
				</nav>
			</SidebarContent>

			{/* Footer */}


			<SidebarRail />
		</Sidebar>
	)
}

/**
 * Individual Nav Item Component
 */
function NavItemComponent({ item, pathname }: { item: NavItem; pathname: string }) {
	const [isOpen, setIsOpen] = React.useState(
		item.items?.some(subItem => pathname === subItem.url) || false
	)

	const hasChildren = item.items && item.items.length > 0
	const isActive = pathname === item.url
	const Icon = item.icon

	// Parent item with children
	if (hasChildren) {
		return (
			<Collapsible open={isOpen} onOpenChange={setIsOpen}>
				<CollapsibleTrigger
					className={cn(
						"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm",
						"transition-all duration-200",
						"hover:bg-gray-100 dark:hover:bg-slate-800",
						"group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
						"text-slate-700 dark:text-slate-200",
						isOpen && "bg-gray-50 dark:bg-slate-800/50"
					)}
				>
					{Icon && (
						<span className="p-2 bg-gray-50 dark:bg-slate-800 rounded-md">
							<Icon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
						</span>
					)}
					<span className="group-data-[collapsible=icon]:hidden flex-1 text-left font-medium font-grotesk">
						{item.title}
					</span>
					<ChevronRight
						className={cn(
							"h-4 w-4 shrink-0 transition-transform duration-200",
							"group-data-[collapsible=icon]:hidden",
							"text-slate-400",
							isOpen && "rotate-90"
						)}
					/>
				</CollapsibleTrigger>

				<CollapsibleContent className="group-data-[collapsible=icon]:hidden">
					<div className="ml-6 mt-1 space-y-1 border-l border-gray-200 dark:border-slate-700 pl-3">
						{item.items?.map((subItem, subIndex) => {
							const isSubActive = pathname === subItem.url
							const SubIcon = subItem.icon

							return (
								<Link
									key={subIndex}
									href={subItem.url}
									className={cn(
										"flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
										"transition-all duration-200",
										"hover:bg-gray-100 dark:hover:bg-slate-800",
										isSubActive
											? "bg-emerald-600 text-white hover:bg-emerald-700 font-medium shadow-sm"
											: "text-slate-600 dark:text-slate-300"
									)}
								>
									{SubIcon && <SubIcon className="h-4 w-4 shrink-0" />}
									<span className="font-grotesk">{subItem.title}</span>
								</Link>
							)
						})}
					</div>
				</CollapsibleContent>
			</Collapsible>
		)
	}

	// Single item without children
	return (
		<Link
			href={item.url}
			className={cn(
				"flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
				"transition-all duration-200",
				"group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
				isActive
					? "bg-emerald-600 text-white hover:bg-emerald-700 font-medium shadow-sm"
					: "text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800"
			)}
		>
			{Icon && (
				<span className={cn(
					"p-2 rounded-md",
					isActive
						? "bg-emerald-700"
						: "bg-gray-50 dark:bg-slate-800"
				)}>
					<Icon className={cn(
						"h-4 w-4 shrink-0",
						isActive
							? "text-white"
							: "text-slate-600 dark:text-slate-300"
					)} />
				</span>
			)}
			<span className="group-data-[collapsible=icon]:hidden font-grotesk">
				{item.title}
			</span>
		</Link>
	)
}
