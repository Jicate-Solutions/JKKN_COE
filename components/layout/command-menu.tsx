'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Star, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
	Command,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandSeparator,
} from '@/components/ui/command'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { useFavorites } from '@/hooks/use-favorites'
import { navMain, getFlatNavItems, type FlatNavItem } from '@/lib/navigation-data'

// ── Context so any component can open the command menu ──────────────
interface CommandMenuContextType {
	open: boolean
	setOpen: (open: boolean) => void
}

const CommandMenuContext = React.createContext<CommandMenuContextType>({
	open: false,
	setOpen: () => {},
})

export function useCommandMenu() {
	return React.useContext(CommandMenuContext)
}

export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
	const [open, setOpen] = React.useState(false)

	// Global Ctrl+K / Cmd+K listener
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault()
				setOpen(prev => !prev)
			}
		}
		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [])

	return (
		<CommandMenuContext.Provider value={{ open, setOpen }}>
			{children}
			<CommandMenuDialog open={open} setOpen={setOpen} />
		</CommandMenuContext.Provider>
	)
}

// ── Custom filter: simple case-insensitive substring matching ───────
// cmdk's default commandScore can miss items. This is more predictable.
function customFilter(value: string, search: string): number {
	const v = value.toLowerCase()
	const s = search.toLowerCase().trim()
	if (!s) return 1
	// Exact prefix gets highest score
	if (v.startsWith(s)) return 1
	// Contains substring gets medium score
	if (v.includes(s)) return 0.8
	// Check if all search words appear somewhere in the value
	const words = s.split(/\s+/)
	if (words.every(w => v.includes(w))) return 0.6
	return 0
}

// ── The actual dialog ───────────────────────────────────────────────
function CommandMenuDialog({
	open,
	setOpen,
}: {
	open: boolean
	setOpen: (open: boolean) => void
}) {
	const router = useRouter()
	const { user, hasAnyRole } = useAuth()
	const { favorites, isFavorite, toggleFavorite } = useFavorites()

	// Build flat, role-filtered list of all navigable pages
	// Depend on user object to recompute whenever auth state settles
	const allItems = React.useMemo(
		() => getFlatNavItems(navMain, hasAnyRole),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[hasAnyRole, user]
	)

	// Group items by their section
	const grouped = React.useMemo(() => {
		const map = new Map<string, FlatNavItem[]>()
		for (const item of allItems) {
			const list = map.get(item.group) || []
			list.push(item)
			map.set(item.group, list)
		}
		return map
	}, [allItems])

	// Favorite items resolved from URLs
	const favoriteItems = React.useMemo(
		() => favorites.map(url => allItems.find(i => i.url === url)).filter(Boolean) as FlatNavItem[],
		[favorites, allItems]
	)

	const handleSelect = (url: string) => {
		setOpen(false)
		router.push(url)
	}

	const handleStarClick = (e: React.MouseEvent, item: FlatNavItem) => {
		e.stopPropagation()
		toggleFavorite(item.url, item.title, item.group)
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="overflow-hidden p-0 max-w-lg">
				<DialogTitle className="sr-only">Search pages</DialogTitle>
				<DialogDescription className="sr-only">
					Search and navigate to any page in the application
				</DialogDescription>
				<Command
					filter={customFilter}
					className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
				>
					<CommandInput placeholder="Search pages... (e.g. courses, marks, timetable)" />
					<CommandList className="max-h-[400px]">
						<CommandEmpty>No pages found.</CommandEmpty>

						{/* Favorites section at top */}
						{favoriteItems.length > 0 && (
							<>
								<CommandGroup heading="Favorites">
									{favoriteItems.map(item => (
										<CommandItem
											key={`fav-${item.url}`}
											value={`fav ${item.title} ${item.group} ${item.url}`}
											onSelect={() => handleSelect(item.url)}
											className="flex items-center gap-3 cursor-pointer"
										>
											{item.icon && <item.icon className="h-4 w-4 text-[#16a34a] shrink-0" />}
											<div className="flex flex-col flex-1 min-w-0">
												<span className="text-sm font-medium truncate">{item.title}</span>
												<span className="text-xs text-muted-foreground truncate">{item.group} &middot; {item.url}</span>
											</div>
											<button
												type="button"
												onClick={(e) => handleStarClick(e, item)}
												className="shrink-0 p-0.5 hover:scale-110 transition-transform"
												aria-label="Remove from favorites"
											>
												<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
											</button>
										</CommandItem>
									))}
								</CommandGroup>
								<CommandSeparator />
							</>
						)}

						{/* All pages grouped by section */}
						{Array.from(grouped.entries()).map(([group, items]) => (
							<CommandGroup key={group} heading={group}>
								{items.map(item => (
									<CommandItem
										key={item.url}
										value={`${item.title} ${item.group} ${item.url}`}
										onSelect={() => handleSelect(item.url)}
										className="flex items-center gap-3 cursor-pointer"
									>
										{item.icon && <item.icon className="h-4 w-4 text-[#16a34a] shrink-0" />}
										<div className="flex flex-col flex-1 min-w-0">
											<span className="text-sm font-medium truncate">{item.title}</span>
											<span className="text-xs text-muted-foreground truncate">{item.url}</span>
										</div>
										<button
											type="button"
											onClick={(e) => handleStarClick(e, item)}
											className={`shrink-0 p-0.5 hover:scale-110 transition-all ${
												isFavorite(item.url) ? 'opacity-100' : 'opacity-30 hover:opacity-100'
											}`}
											aria-label={isFavorite(item.url) ? 'Remove from favorites' : 'Add to favorites'}
										>
											<Star
												className={`h-4 w-4 ${
													isFavorite(item.url)
														? 'fill-yellow-400 text-yellow-400'
														: 'text-slate-400 hover:text-yellow-400'
												}`}
											/>
										</button>
									</CommandItem>
								))}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</DialogContent>
		</Dialog>
	)
}
