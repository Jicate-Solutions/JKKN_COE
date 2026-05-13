'use client'

import { useState, useMemo } from 'react'
import {
	DndContext,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
	SortableContext,
	arrayMove,
	useSortable,
	verticalListSortingStrategy,
	rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/common/use-toast'
import { useFavorites } from '@/hooks/use-favorites'
import { navMain, getFlatNavItems, type FlatNavItem } from '@/lib/navigation-data'
import { useAuth } from '@/lib/auth/auth-context-parent'
import Link from 'next/link'
import {
	Star,
	GripVertical,
	Trash2,
	ExternalLink,
	Sparkles,
	LayoutList,
	LayoutGrid,
	Search,
	ChevronDown,
	ChevronRight,
	Layers,
	Clock,
	RefreshCw,
	type LucideIcon,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════
// LIST VIEW — Sortable row
// ═══════════════════════════════════════════════════════════════════
function SortableListItem({
	url,
	index,
	navItem,
	onRemove,
}: {
	url: string
	index: number
	navItem: FlatNavItem | undefined
	onRemove: (url: string) => void
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url })
	const style = { transform: CSS.Transform.toString(transform), transition }
	const Icon: LucideIcon | undefined = navItem?.icon

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`flex items-center gap-3 px-3 py-2.5 rounded-md border transition-all ${
				isDragging
					? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 shadow-lg z-10'
					: 'bg-background border-border hover:border-amber-200 dark:hover:border-amber-800'
			}`}
		>
			<button
				type="button"
				className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="h-4 w-4" />
			</button>

			<span className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold shrink-0">
				{index + 1}
			</span>

			{Icon && <Icon className="h-4 w-4 text-emerald-600 shrink-0" />}

			<div className="flex-1 min-w-0">
				<span className="text-sm font-medium truncate block">{navItem?.title || url}</span>
				<div className="flex items-center gap-2 mt-0.5">
					{navItem?.group && (
						<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{navItem.group}</Badge>
					)}
					<span className="text-xs text-muted-foreground truncate">{url}</span>
				</div>
			</div>

			<div className="flex items-center gap-0.5 shrink-0">
				<Tooltip>
					<TooltipTrigger asChild>
						<Link
							href={url}
							className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
						>
							<ExternalLink className="h-3.5 w-3.5" />
						</Link>
					</TooltipTrigger>
					<TooltipContent>Open page</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => onRemove(url)}
							className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
							aria-label="Remove from favorites"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent>Remove</TooltipContent>
				</Tooltip>
			</div>
		</div>
	)
}

// ═══════════════════════════════════════════════════════════════════
// GRID VIEW — Card
// ═══════════════════════════════════════════════════════════════════
const GRID_COLORS = [
	{ bg: 'from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20', icon: 'bg-amber-100 dark:bg-amber-900/40', iconColor: 'text-amber-600 dark:text-amber-400', border: 'hover:border-amber-300 dark:hover:border-amber-700' },
	{ bg: 'from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20', icon: 'bg-emerald-100 dark:bg-emerald-900/40', iconColor: 'text-emerald-600 dark:text-emerald-400', border: 'hover:border-emerald-300 dark:hover:border-emerald-700' },
	{ bg: 'from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20', icon: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-blue-600 dark:text-blue-400', border: 'hover:border-blue-300 dark:hover:border-blue-700' },
	{ bg: 'from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20', icon: 'bg-purple-100 dark:bg-purple-900/40', iconColor: 'text-purple-600 dark:text-purple-400', border: 'hover:border-purple-300 dark:hover:border-purple-700' },
	{ bg: 'from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20', icon: 'bg-rose-100 dark:bg-rose-900/40', iconColor: 'text-rose-600 dark:text-rose-400', border: 'hover:border-rose-300 dark:hover:border-rose-700' },
	{ bg: 'from-cyan-50 to-sky-50 dark:from-cyan-950/20 dark:to-sky-950/20', icon: 'bg-cyan-100 dark:bg-cyan-900/40', iconColor: 'text-cyan-600 dark:text-cyan-400', border: 'hover:border-cyan-300 dark:hover:border-cyan-700' },
]

function SortableGridCard({
	url,
	index,
	navItem,
	onRemove,
}: {
	url: string
	index: number
	navItem: FlatNavItem | undefined
	onRemove: (url: string) => void
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url })
	const style = { transform: CSS.Transform.toString(transform), transition }
	const Icon: LucideIcon | undefined = navItem?.icon
	const color = GRID_COLORS[index % GRID_COLORS.length]

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`group relative flex flex-col items-center gap-2.5 p-4 rounded-md border border-border bg-gradient-to-br ${color.bg} ${color.border} transition-all ${
				isDragging ? 'shadow-xl z-10 scale-105 opacity-90' : 'hover:shadow-md'
			}`}
		>
			{/* Drag handle */}
			<button
				type="button"
				className="absolute top-2 left-2 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
				aria-label="Drag to reorder"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="h-3.5 w-3.5" />
			</button>

			{/* Order number */}
			<span className="absolute top-2 left-7 flex items-center justify-center h-5 w-5 rounded-full bg-white/70 dark:bg-black/20 text-foreground text-[9px] font-bold">
				{index + 1}
			</span>

			{/* Remove button */}
			<button
				type="button"
				onClick={() => onRemove(url)}
				className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
				aria-label="Remove from favorites"
			>
				<Trash2 className="h-3 w-3" />
			</button>

			{/* Icon — clicking navigates */}
			<Link href={url} className="flex flex-col items-center gap-2.5 w-full mt-1">
				<div className={`flex items-center justify-center h-10 w-10 rounded-lg ${color.icon}`}>
					{Icon ? <Icon className={`h-5 w-5 ${color.iconColor}`} /> : <Star className="h-5 w-5 text-amber-400" />}
				</div>
				<div className="text-center w-full">
					<p className="text-sm font-medium truncate">{navItem?.title || url}</p>
					{navItem?.group && (
						<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 mt-1 bg-white/50 dark:bg-black/20">{navItem.group}</Badge>
					)}
				</div>
			</Link>
		</div>
	)
}

// ═══════════════════════════════════════════════════════════════════
// ADD FAVORITES — Browse all pages grouped by section
// ═══════════════════════════════════════════════════════════════════
function AddFavoritesSection({
	allItems,
	isFavorite,
	onToggle,
}: {
	allItems: FlatNavItem[]
	isFavorite: (url: string) => boolean
	onToggle: (url: string, title?: string, group?: string) => void
}) {
	const [search, setSearch] = useState('')
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

	const filtered = useMemo(() => {
		if (!search.trim()) return allItems
		const s = search.toLowerCase()
		return allItems.filter(
			item => item.title.toLowerCase().includes(s) || item.group.toLowerCase().includes(s) || item.url.toLowerCase().includes(s)
		)
	}, [allItems, search])

	const grouped = useMemo(() => {
		const map = new Map<string, FlatNavItem[]>()
		for (const item of filtered) {
			const list = map.get(item.group) || []
			list.push(item)
			map.set(item.group, list)
		}
		return map
	}, [filtered])

	const effectiveExpanded = search.trim() ? new Set(Array.from(grouped.keys())) : expandedGroups

	const toggleGroup = (group: string) => {
		setExpandedGroups(prev => {
			const next = new Set(prev)
			if (next.has(group)) next.delete(group)
			else next.add(group)
			return next
		})
	}

	return (
		<Card className="flex-1 flex flex-col min-h-0">
			<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-base font-semibold">Add New Favorites</p>
						<p className="text-xs text-muted-foreground">Browse all pages and click the star to add or remove</p>
					</div>
				</div>
				<div className="flex items-center gap-2 mt-3">
					<div className="relative flex-1 max-w-sm">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search pages..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="pl-8 h-8 text-sm"
						/>
					</div>
					<Badge variant="outline" className="text-xs h-8 px-3">{allItems.length} pages</Badge>
				</div>
			</CardHeader>
			<CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col min-h-0">
				<div className="rounded-md border flex-1 overflow-hidden mt-3 min-h-[200px] max-h-[420px]">
					<div className="h-full overflow-auto">
						{grouped.size === 0 ? (
							<div className="flex items-center justify-center h-32">
								<p className="text-sm text-muted-foreground">No pages match your search.</p>
							</div>
						) : (
							<div className="p-2">
								{Array.from(grouped.entries()).map(([group, items]) => {
									const isExpanded = effectiveExpanded.has(group)
									const favCount = items.filter(i => isFavorite(i.url)).length
									return (
										<div key={group}>
											<button
												type="button"
												onClick={() => toggleGroup(group)}
												className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-muted/50 transition-colors"
											>
												{isExpanded
													? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
													: <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
												}
												<span className="font-medium text-sm">{group}</span>
												<Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-auto">{items.length}</Badge>
												{favCount > 0 && (
													<Badge className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0">
														{favCount} starred
													</Badge>
												)}
											</button>
											{isExpanded && (
												<div className="ml-5 mb-1">
													{items.map(item => {
														const starred = isFavorite(item.url)
														const Icon = item.icon
														return (
															<div
																key={item.url}
																className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors ${
																	starred ? 'bg-amber-50 dark:bg-amber-900/10' : 'hover:bg-muted/50'
																}`}
															>
																<button
																	type="button"
																	onClick={() => onToggle(item.url, item.title, item.group)}
																	className="shrink-0 p-0.5 hover:scale-110 transition-transform"
																	aria-label={starred ? 'Remove from favorites' : 'Add to favorites'}
																>
																	<Star className={`h-4 w-4 ${starred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40 hover:text-yellow-400'}`} />
																</button>
																{Icon && <Icon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
																<Link href={item.url} className="flex-1 min-w-0 text-sm hover:text-emerald-600 truncate">
																	{item.title}
																</Link>
																<span className="text-xs text-muted-foreground truncate max-w-[180px] hidden sm:block">{item.url}</span>
															</div>
														)
													})}
												</div>
											)}
										</div>
									)
								})}
							</div>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function FavoritesPage() {
	const { toast } = useToast()
	const { user, hasAnyRole, hasPermission } = useAuth()
	const { favorites, loading, isFavorite, toggleFavorite, removeFavorite, reorderFavorites } = useFavorites()
	const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

	const flatItems = useMemo(
		() => getFlatNavItems(navMain, hasAnyRole, hasPermission),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[hasAnyRole, hasPermission, user]
	)
	const navItemMap = useMemo(() => {
		const map = new Map<string, FlatNavItem>()
		for (const item of flatItems) map.set(item.url, item)
		return map
	}, [flatItems])

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
		useSensor(KeyboardSensor)
	)

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over || active.id === over.id) return
		const oldIndex = favorites.indexOf(active.id as string)
		const newIndex = favorites.indexOf(over.id as string)
		if (oldIndex === -1 || newIndex === -1) return
		reorderFavorites(arrayMove(favorites, oldIndex, newIndex))
		toast({ title: 'Order updated', description: 'Favorites order has been saved.', className: 'bg-green-50 border-green-200 text-green-800' })
	}

	const handleRemove = (url: string) => {
		const item = navItemMap.get(url)
		removeFavorite(url)
		toast({ title: 'Removed', description: `"${item?.title || url}" removed from favorites.`, className: 'bg-amber-50 border-amber-200 text-amber-800' })
	}

	const handleToggle = (url: string, title?: string, group?: string) => {
		const wasAdded = !isFavorite(url)
		toggleFavorite(url, title, group)
		toast({
			title: wasAdded ? 'Added' : 'Removed',
			description: `"${title || url}" ${wasAdded ? 'added to' : 'removed from'} favorites.`,
			className: wasAdded ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800',
		})
	}

	// Scorecard data
	const groupCount = useMemo(() => {
		const groups = new Set<string>()
		for (const url of favorites) {
			const item = navItemMap.get(url)
			if (item?.group) groups.add(item.group)
		}
		return groups.size
	}, [favorites, navItemMap])

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
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
									<BreadcrumbPage>Favorites</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>
					{/* ── Scorecards ─────────────────────────────── */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight text-amber-900 dark:text-amber-100">{favorites.length}</p>
										<p className="text-xs font-medium text-amber-700/70 dark:text-amber-300/70 mt-0.5">Total Favorites</p>
									</div>
									<div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
										<Star className="h-5 w-5 text-amber-600 dark:text-amber-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100">{groupCount}</p>
										<p className="text-xs font-medium text-emerald-700/70 dark:text-emerald-300/70 mt-0.5">Sections</p>
									</div>
									<div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
										<Layers className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight text-blue-900 dark:text-blue-100">{flatItems.length}</p>
										<p className="text-xs font-medium text-blue-700/70 dark:text-blue-300/70 mt-0.5">Available Pages</p>
									</div>
									<div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
										<Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* ── Favorites Card ─────────────────────────── */}
					<TooltipProvider delayDuration={300}>
						<Card className="flex-1 flex flex-col min-h-0">
							<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-base font-semibold">My Favorites</p>
										<p className="text-xs text-muted-foreground">
											{viewMode === 'list' ? 'Drag to reorder. Changes save automatically.' : 'Click a card to navigate. Switch to list view to reorder.'}
										</p>
									</div>
									<div className="flex items-center gap-1.5">
										<div className="flex items-center rounded-md border p-0.5">
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														type="button"
														onClick={() => setViewMode('list')}
														className={`p-1 rounded-sm transition-colors ${viewMode === 'list' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
														aria-label="List view"
													>
														<LayoutList className="h-3.5 w-3.5" />
													</button>
												</TooltipTrigger>
												<TooltipContent>List view</TooltipContent>
											</Tooltip>
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														type="button"
														onClick={() => setViewMode('grid')}
														className={`p-1 rounded-sm transition-colors ${viewMode === 'grid' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
														aria-label="Grid view"
													>
														<LayoutGrid className="h-3.5 w-3.5" />
													</button>
												</TooltipTrigger>
												<TooltipContent>Grid view</TooltipContent>
											</Tooltip>
										</div>
									</div>
								</div>
							</CardHeader>
							<CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col min-h-0">
								{loading ? (
									<div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
										<RefreshCw className="animate-spin h-5 w-5" />
										<p className="text-sm mt-2">Loading favorites...</p>
									</div>
								) : favorites.length === 0 ? (
									<div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
										<Sparkles className="h-8 w-8 opacity-20" />
										<p className="text-sm mt-2">No favorites yet</p>
										<p className="text-xs">Browse pages below and click the star to add</p>
									</div>
								) : viewMode === 'list' ? (
									<div className="rounded-md border flex-1 overflow-hidden mt-3 min-h-[180px] max-h-[420px]">
										<div className="h-full overflow-auto p-2">
											<DndContext
												sensors={sensors}
												collisionDetection={closestCenter}
												modifiers={[restrictToVerticalAxis]}
												onDragEnd={handleDragEnd}
											>
												<SortableContext items={favorites} strategy={verticalListSortingStrategy}>
													<div className="flex flex-col gap-1.5">
														{favorites.map((url, i) => (
															<SortableListItem key={url} url={url} index={i} navItem={navItemMap.get(url)} onRemove={handleRemove} />
														))}
													</div>
												</SortableContext>
											</DndContext>
										</div>
									</div>
								) : (
									<div className="rounded-md border flex-1 overflow-hidden mt-3 min-h-[180px] max-h-[420px]">
										<div className="h-full overflow-auto p-3">
											<DndContext
												sensors={sensors}
												collisionDetection={closestCenter}
												onDragEnd={handleDragEnd}
											>
												<SortableContext items={favorites} strategy={rectSortingStrategy}>
													<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
														{favorites.map((url, i) => (
															<SortableGridCard key={url} url={url} index={i} navItem={navItemMap.get(url)} onRemove={handleRemove} />
														))}
													</div>
												</SortableContext>
											</DndContext>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					</TooltipProvider>

					{/* ── Add New Favorites ──────────────────────── */}
					<AddFavoritesSection allItems={flatItems} isFavorite={isFavorite} onToggle={handleToggle} />
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
