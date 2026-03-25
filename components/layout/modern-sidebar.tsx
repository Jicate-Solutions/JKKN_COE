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

interface ModernSidebarProps extends React.ComponentProps<typeof Sidebar> {
	navItems: NavItem[]
}

/**
 * Modern Sidebar Component
 *
 * Clean, minimal sidebar following Linear/Vercel design principles
 * Features:
 * - Subtle active states
 * - Smooth transitions
 * - Role-based filtering
 * - Collapsible sections
 * - Minimal visual noise
 *
 * Usage:
 * ```tsx
 * <ModernSidebar navItems={navMain} />
 * ```
 */
export function ModernSidebar({ navItems, ...props }: ModernSidebarProps) {
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
			<SidebarHeader className="h-14 border-b border-sidebar-border flex items-center justify-center">
				<Link
					href="/dashboard"
					className="group flex items-center gap-2 font-semibold"
				>
					{/* Logo - Collapsed */}
					<div className="group-data-[collapsible=icon]:flex hidden">
						<div className="h-7 w-7 rounded-lg bg-saas-primary-600 dark:bg-saas-primary-500 flex items-center justify-center">
							<span className="text-white text-sm font-bold">J</span>
						</div>
					</div>

					{/* Logo - Expanded */}
					<div className="group-data-[collapsible=icon]:hidden flex items-center gap-2">
						<div className="h-8 w-8 rounded-lg bg-saas-primary-600 dark:bg-saas-primary-500 flex items-center justify-center">
							<span className="text-white text-base font-bold">J</span>
						</div>
						<span className="text-lg font-bold">JKKN COE</span>
					</div>
				</Link>
			</SidebarHeader>

			{/* Content */}
			<SidebarContent className="px-2 py-4">
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
						"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
						"transition-all duration-200",
						"hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
						"group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
						isOpen && "bg-sidebar-accent/50"
					)}
				>
					{Icon && (
						<Icon className="h-4 w-4 shrink-0 transition-transform duration-200" />
					)}
					<span className="group-data-[collapsible=icon]:hidden flex-1 text-left">
						{item.title}
					</span>
					<ChevronRight
						className={cn(
							"h-4 w-4 shrink-0 transition-transform duration-200",
							"group-data-[collapsible=icon]:hidden",
							isOpen && "rotate-90"
						)}
					/>
				</CollapsibleTrigger>

				<CollapsibleContent className="group-data-[collapsible=icon]:hidden">
					<div className="ml-6 mt-1 space-y-1 border-l border-sidebar-border pl-3">
						{item.items?.map((subItem, subIndex) => {
							const isSubActive = pathname === subItem.url
							const SubIcon = subItem.icon

							return (
								<Link
									key={subIndex}
									href={subItem.url}
									className={cn(
										"flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm",
										"transition-all duration-200",
										"hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
										isSubActive
											? "bg-sidebar-accent text-sidebar-accent-foreground font-medium border-l-2 border-saas-primary-600 -ml-[1px]"
											: "text-sidebar-foreground/80"
									)}
								>
									{SubIcon && <SubIcon className="h-3.5 w-3.5 shrink-0" />}
									<span>{subItem.title}</span>
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
				"flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
				"transition-all duration-200",
				"hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
				"group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
				isActive
					? "bg-saas-primary-600 text-white hover:bg-saas-primary-700 shadow-sm"
					: "text-sidebar-foreground"
			)}
		>
			{Icon && (
				<Icon className="h-4 w-4 shrink-0" />
			)}
			<span className="group-data-[collapsible=icon]:hidden">
				{item.title}
			</span>
		</Link>
	)
}
