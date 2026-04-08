'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Star, type LucideIcon } from 'lucide-react'
import { useFavorites } from '@/hooks/use-favorites'
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuItem,
	SidebarMenuButton,
	useSidebar,
} from '@/components/ui/sidebar'

interface FavoriteNavItem {
	title: string
	url: string
	group: string
	icon?: LucideIcon
}

export function NavFavorites({ items }: { items: FavoriteNavItem[] }) {
	const pathname = usePathname()
	const { removeFavorite } = useFavorites()
	const { state } = useSidebar()
	const isCollapsed = state === 'collapsed'

	if (items.length === 0) return null

	return (
		<SidebarGroup>
			<SidebarGroupLabel className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
				<Star className="h-3 w-3 fill-amber-400 text-amber-400" />
				<span className={isCollapsed ? 'hidden' : ''}>Favorites</span>
			</SidebarGroupLabel>
			<SidebarMenu>
				{items.map(item => {
					const isActive = item.url === pathname
					return (
						<SidebarMenuItem key={item.url}>
							<SidebarMenuButton
								asChild
								tooltip={`${item.title} (${item.group})`}
								className={`transition-all duration-200 group/fav ${
									isActive
										? 'bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/20 text-amber-900 dark:text-amber-100'
										: 'hover:bg-amber-50 dark:hover:bg-amber-900/20'
								}`}
							>
								<Link href={item.url} className="flex items-center gap-3">
									{item.icon && (
										<item.icon
											className={`h-4 w-4 shrink-0 ${
												isActive
													? 'text-amber-700 dark:text-amber-300'
													: 'text-[#16a34a] dark:text-[#16a34a]'
											}`}
										/>
									)}
									<span
										className={`font-grotesk text-sm font-medium truncate leading-tight ${
											isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
										} ${isActive ? 'text-amber-900 dark:text-amber-100' : 'text-slate-700 dark:text-slate-300'}`}
									>
										{item.title}
									</span>
									<button
										type="button"
										onClick={(e) => {
											e.preventDefault()
											e.stopPropagation()
											removeFavorite(item.url)
										}}
										className={`ml-auto shrink-0 p-0.5 opacity-0 group-hover/fav:opacity-100 hover:scale-110 transition-all ${
											isCollapsed ? 'hidden' : ''
										}`}
										title="Remove from favorites"
									>
										<Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
									</button>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)
				})}
			</SidebarMenu>
		</SidebarGroup>
	)
}
