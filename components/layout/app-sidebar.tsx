"use client"

import * as React from "react"
import {
	Crown,
	PanelLeftClose,
	PanelLeft,
	Search,
	Star,
	Settings2,
} from "lucide-react"

import { NavMain } from "@/components/layout/nav-main"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useFavorites } from "@/hooks/use-favorites"
import { navMain, getFlatNavItems } from "@/lib/navigation-data"
import { useCommandMenu } from "@/components/layout/command-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const { user, hasAnyRole, hasPermission } = useAuth()
	const { toggleSidebar, state } = useSidebar()
	const isCollapsed = state === "collapsed"
	const { setOpen } = useCommandMenu()
	const { favorites } = useFavorites()

	// Build flat items for resolving favorite URLs to full nav items
	// Depend on user to recompute whenever auth state settles
	const flatItems = React.useMemo(
		() => getFlatNavItems(navMain, hasAnyRole, hasPermission),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[hasAnyRole, hasPermission, user]
	)

	// Filter navigation items: prefer DB-driven `permission`, fall back to `coe_roles`.
	// Groups (items with children) are visible iff at least one real-URL child is visible —
	// so role/permission management is 100% DB-driven via /users/role-permissions.
	const filteredNavItems = React.useMemo(() => {
		// Super admin sees everything (their permissions cache may be stale, but
		// they're authorized at the server via is_super_admin short-circuit).
		const isSuperAdmin = user?.is_super_admin === true || hasAnyRole(['super_admin'])

		const isVisible = (node: { permission?: string; coe_roles?: string[] }): boolean => {
			if (isSuperAdmin) return true
			// Preferred: DB-driven permission check
			if (node.permission && hasPermission(node.permission)) return true
			// Legacy fallback: role check (covers users whose permissions JSONB cache
			// hasn't been refreshed since the page-permission migration)
			if (node.coe_roles) {
				if (node.coe_roles.length === 0) return true
				if (hasAnyRole(node.coe_roles)) return true
			}
			// No permission AND no coe_roles → treat as public
			if (!node.permission && !node.coe_roles) return true
			return false
		}

		const roleFiltered = navMain
			.map(item => {
				// Top-level item (no children): direct visibility check
				if (!item.items || item.items.length === 0) {
					return isVisible(item) ? item : null
				}
				// Group: filter children; keep '#' placeholders alongside any visible siblings
				const filteredItems = item.items.filter((sub: any) => {
					if (sub.url === '#') return true
					return isVisible(sub)
				})
				const hasRealVisible = filteredItems.some((s: any) => s.url !== '#')
				if (!hasRealVisible) return null
				return { ...item, items: filteredItems }
			})
			.filter((g): g is NonNullable<typeof g> => g !== null)

		// Build Favorites group from starred URLs and insert before Dashboard
		if (favorites.length > 0) {
			const favSubItems = favorites.map(url => {
				const matched = flatItems.find(item => item.url === url)
				if (matched) return { title: matched.title, url: matched.url, icon: matched.icon }
				// Fallback: show URL even if flatItems hasn't resolved yet (roles loading)
				const segments = url.split('/').filter(Boolean)
				const fallbackTitle = segments[segments.length - 1]
					?.replace(/-/g, ' ')
					.replace(/\b\w/g, c => c.toUpperCase()) || url
				return { title: fallbackTitle, url }
			})

			const favGroup = {
				title: 'Favorites',
				url: '#',
				icon: Star,
				isActive: false,
				coe_roles: [] as string[],
				items: [
					{ title: 'Manage Favorites', url: '/favorites', icon: Settings2 },
					...favSubItems,
				],
			}
			return [favGroup, ...roleFiltered]
		}

		return roleFiltered
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hasAnyRole, hasPermission, user, favorites, flatItems])

	return (
		<Sidebar collapsible="icon" {...props}>
			{/* ===== Sidebar Header ===== */}
			<SidebarHeader className="h-16 flex items-center overflow-hidden">
				 <div className="flex items-center gap-3 px-3">
          {/* Logo - Collapsed version (Icon only) */}
          <div className="group-data-[collapsible=icon]:block hidden">
            <div className="flex flex-col items-center space-y-1">
              {/* Crown Icon with frame */}
              <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-[#16a34a]/10 to-[#059669]/10 border border-[#16a34a]/20 shadow-sm">
                <Crown className='h-5 w-5 text-[#16a34a] dark:text-[#16a34a] drop-shadow-sm' />
              </div>
              {/* JKKN Text */}
              <div className='font-grotesk text-xs font-extrabold tracking-widest text-[#16a34a] dark:text-[#16a34a] drop-shadow-lg'>
                JKKN
              </div>
            </div>
          </div>

		  <div className="group-data-[collapsible=icon]:hidden flex items-center">
            {/* Logo container with frame and transparency */}
            <div className="relative p-1.5 rounded-lg bg-gradient-to-br from-[#16a34a]/5 to-[#059669]/5 border border-[#16a34a]/20 shadow-sm backdrop-blur-sm">
              {/* JKKN Logo Image */}
              <img
                src="/jkkn_logo.png"
                alt="JKKN | COE"
                className="h-10 w-20 object-contain relative z-10 filter drop-shadow-sm"
              />
            </div>
          </div>
				</div>
			</SidebarHeader>

			{/* ===== Sidebar Content ===== */}
			<SidebarContent className="px1 py-4">
				{/* Search trigger */}
				<div className="px-3 mb-2">
					<button
						type="button"
						onClick={() => setOpen(true)}
						className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-500 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
					>
						<Search className="h-4 w-4 shrink-0" />
						<span className="group-data-[collapsible=icon]:hidden flex-1 text-left">Search...</span>
						<kbd className="group-data-[collapsible=icon]:hidden pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-1.5 font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400">
							Ctrl K
						</kbd>
					</button>
				</div>

				{/* Navigation with Favorites group at top */}
				<NavMain items={filteredNavItems} />
			</SidebarContent>

			{/* ===== Sidebar Footer with Toggle ===== */}
			<SidebarFooter className="border-t border-sidebar-border">
				<button
					type="button"
					onClick={toggleSidebar}
					className="flex items-center justify-center gap-2 w-full p-2 rounded-md hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
					title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
				>
					{isCollapsed ? (
						<PanelLeft className="h-5 w-5 text-[#16a34a]" />
					) : (
						<>
							<PanelLeftClose className="h-5 w-5 text-[#16a34a]" />
							<span className="text-sm font-medium text-slate-600 dark:text-slate-300">Collapse</span>
						</>
					)}
				</button>
			</SidebarFooter>

			{/* ===== Sidebar Rail ===== */}
			<SidebarRail />
		</Sidebar>
	)
}
