"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronRight, Loader2, type LucideIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useNavigationLog } from "@/hooks/use-transaction-log"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    roles?: string[]
    items?: {
      title: string
      url: string
      icon?: LucideIcon
      roles?: string[]
    }[]
  }[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"
  const { hasAnyRole } = useAuth()
  const { logNavigation } = useNavigationLog()

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    // Ensure SSR and first client render are identical: start all closed
    const initial: Record<string, boolean> = {}
    items.forEach((item) => {
      initial[item.title] = false
    })
    return initial
  })

  const [loadingRoutes, setLoadingRoutes] = useState<Set<string>>(new Set())
  const [clickedItems, setClickedItems] = useState<Set<string>>(new Set())
  const [loadingMenus, setLoadingMenus] = useState<Set<string>>(new Set())

  // Helper function to filter sub-items based on user roles
  const filterSubItems = (subItems: typeof items[0]['items']) => {
    if (!subItems) return []
    return subItems.filter(subItem => {
      // If no roles specified, item is available to all authenticated users
      if (!subItem.roles || subItem.roles.length === 0) return true
      // Check if user has any of the required roles
      return hasAnyRole(subItem.roles)
    })
  }

  // Prefetch routes on hover for faster navigation
  const handleMouseEnter = (url: string) => {
    router.prefetch(url)
  }

  // Handle navigation with loading state and logging
  const handleNavigation = (url: string, menuTitle?: string, menuSection?: string) => {
    setLoadingRoutes(prev => new Set(prev).add(url))

    // Log the navigation event
    logNavigation({
      to_path: url,
      menu_title: menuTitle,
      menu_section: menuSection,
    })

    // Clear loading state after a short delay
    setTimeout(() => {
      setLoadingRoutes(prev => {
        const newSet = new Set(prev)
        newSet.delete(url)
        return newSet
      })
    }, 1000)
  }

  // Handle menu click with immediate visual feedback and loading state
  const handleMenuClick = (itemTitle: string) => {
    // Add immediate visual feedback
    setClickedItems(prev => new Set(prev).add(itemTitle))
    
    // Show loading state
    setLoadingMenus(prev => new Set(prev).add(itemTitle))
    
    // Clear visual feedback after short duration
    setTimeout(() => {
      setClickedItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemTitle)
        return newSet
      })
    }, 300)
    
    // Clear loading state after longer duration (simulating menu open + page load)
    setTimeout(() => {
      setLoadingMenus(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemTitle)
        return newSet
      })
    }, 2000) // 2 seconds to simulate loading time
  }

  // Handle dropdown menu open/close
  const handleDropdownOpenChange = (itemTitle: string, open: boolean) => {
    if (open) {
      // When dropdown opens, show loading state
      setLoadingMenus(prev => new Set(prev).add(itemTitle))
      // Clear loading state after dropdown is fully open
      setTimeout(() => {
        setLoadingMenus(prev => {
          const newSet = new Set(prev)
          newSet.delete(itemTitle)
          return newSet
        })
      }, 500) // 500ms for dropdown animation
    }
  }

  useEffect(() => {
    // After mount, hydrate open state from localStorage or isActive fallback
    const next: Record<string, boolean> = {}
    items.forEach((item) => {
      const key = `sidebar_group_open_${item.title}`
      const stored = window.localStorage.getItem(key)
      if (stored !== null) {
        next[item.title] = stored === "true"
      } else {
        next[item.title] = !!item.isActive
      }
    })
    setOpenMap(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpenChange = (title: string, open: boolean) => {
    setOpenMap((prev) => ({ ...prev, [title]: open }))
    try {
      window.localStorage.setItem(`sidebar_group_open_${title}`, String(open))
    } catch {
      // ignore storage errors
    }
  }

  // Helper function to check if item is active
  const isItemActive = (item: any) => {
    if (item.url === pathname) return true
    if (item.items) {
      return item.items.some((subItem: any) => subItem.url === pathname)
    }
    return false
  }


  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => {
          const isActive = isItemActive(item)
          
          // If item has no sub-items, render as simple link
          if (!item.items || item.items.length === 0) {
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton 
                  asChild 
                  tooltip={item.title} 
                  className={`transition-all duration-300 ease-in-out ${
                    isActive
                      ? 'bg-gradient-to-r from-[#ffd033] to-[#ffc20d] text-gray-900 hover:from-[#ffd033]/90 hover:to-[#ffc20d]/90'
                      : clickedItems.has(item.title)
                      ? 'bg-gradient-to-r from-[#ffd033]/20 to-[#ffc20d]/20 ring-2 ring-[#ffd033]/30 animate-pulse'
                      : 'hover:bg-gradient-to-r hover:from-[#ffd033]/10 hover:to-[#ffc20d]/10'
                  }`}
                >
                  <Link 
                    href={item.url || '#'} 
                    className="flex items-center gap-3"
                    role="menuitem"
                    tabIndex={0}
                    aria-label={item.title}
                    onMouseEnter={() => item.url && handleMouseEnter(item.url)}
                    onClick={(e) => {
                      // Always provide immediate feedback
                      handleMenuClick(item.title)
                      if (item.url) {
                        handleNavigation(item.url, item.title)
                      } else {
                        // Prevent navigation if no URL
                        e.preventDefault()
                      }
                    }}
                  >
                    {loadingRoutes.has(item.url) ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#16a34a] dark:text-[#16a34a]" />
                    ) : (
                      item.icon && (
                        <item.icon
                          className={`h-4 w-4 transition-all duration-200 ${
                            isActive
                              ? 'text-gray-900'
                              : clickedItems.has(item.title)
                              ? 'text-[#16a34a] dark:text-[#16a34a] scale-110'
                              : 'text-[#16a34a] dark:text-[#16a34a]'
                          }`}
                        />
                      )
                    )}
                    <span className={`font-grotesk font-medium transition-opacity duration-300 leading-tight ${isActive ? 'text-gray-900' : 'text-slate-800 dark:text-slate-200'} ${isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                      {item.title}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }
          
          // If item has sub-items, render as collapsible menu
          return (
            <div key={item.title} className="relative">
              {isCollapsed ? (
                // Collapsed state - show dropdown menu
                <SidebarMenuItem aria-hidden={item.title === "Master"}>
                  <DropdownMenu onOpenChange={(open) => handleDropdownOpenChange(item.title, open)}>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton 
                        tooltip={loadingMenus.has(item.title) ? `Loading ${item.title}...` : item.title} 
                        className={`transition-all duration-300 ease-in-out ${
                          isActive
                            ? 'bg-gradient-to-r from-[#ffd033] to-[#ffc20d] text-gray-900 hover:from-[#ffd033]/90 hover:to-[#ffc20d]/90'
                            : loadingMenus.has(item.title)
                            ? 'bg-gradient-to-r from-[#ffd033]/15 to-[#ffc20d]/15 ring-2 ring-[#ffd033]/40'
                            : clickedItems.has(item.title)
                            ? 'bg-gradient-to-r from-[#ffd033]/20 to-[#ffc20d]/20 ring-2 ring-[#ffd033]/30 animate-pulse'
                            : 'hover:bg-gradient-to-r hover:from-[#ffd033]/10 hover:to-[#ffc20d]/10'
                        }`}
                        role="button"
                        tabIndex={0}
                        aria-expanded={false}
                        aria-haspopup="true"
                        onClick={() => handleMenuClick(item.title)}
                      >
                        {loadingMenus.has(item.title) ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[#ffd033] dark:text-[#ffd033]" />
                        ) : (
                          item.icon && (
                            <item.icon
                              className={`h-4 w-4 transition-all duration-200 ${
                                isActive
                                  ? 'text-gray-900'
                                  : clickedItems.has(item.title)
                                  ? 'text-[#16a34a] dark:text-[#16a34a] scale-110'
                                  : 'text-[#16a34a] dark:text-[#16a34a]'
                              }`}
                            />
                          )
                        )}
                        <span className={`font-grotesk font-medium transition-all duration-300 leading-tight ${isActive ? 'text-gray-900' : 'text-slate-800 dark:text-slate-200'} opacity-0 w-0 overflow-hidden`}>
                          {item.title}
                        </span>
                        <ChevronRight className={`ml-auto h-4 w-4 transition-all duration-300 ${isActive ? 'text-gray-900' : 'text-slate-500 dark:text-slate-400'} opacity-0`} />
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-56 ml-2"
                      side="right"
                      align="start"
                      sideOffset={8}
                    >
                      {filterSubItems(item.items)?.map((subItem) => {
                        const isSubItemActive = subItem.url === pathname
                        return (
                          <DropdownMenuItem key={subItem.title} asChild>
                                    <Link
                                      href={subItem.url}
                                      className="flex items-center gap-3 w-full"
                                      role="menuitem"
                                      tabIndex={0}
                                      aria-label={subItem.title}
                                      onMouseEnter={() => handleMouseEnter(subItem.url)}
                                      onClick={() => handleNavigation(subItem.url, subItem.title, item.title)}
                                    >
                              {loadingRoutes.has(subItem.url) ? (
                                <Loader2 className="h-4 w-4 animate-spin text-[#ffc20d]" />
                              ) : (
                                subItem.icon && <subItem.icon className={`h-4 w-4 ${isSubItemActive ? 'text-[#16a34a]' : 'text-[#16a34a] dark:text-[#16a34a]'}`} />
                              )}
                              <span className={`font-grotesk text-sm leading-tight ${isSubItemActive ? 'text-[#e6a600] font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                                {subItem.title}
                              </span>
                            </Link>
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ) : (
                // Expanded state - show normal collapsible
                <Collapsible
                  asChild
                  open={openMap[item.title] ?? !!item.isActive}
                  onOpenChange={(open: boolean) => handleOpenChange(item.title, open)}
                  className="group/collapsible"
                >
                  <SidebarMenuItem aria-hidden={item.title === "Master"}>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={item.title}
                        className={`transition-all duration-300 ease-in-out ${
                          isActive
                            ? 'bg-gradient-to-r from-[#ffd033] to-[#ffc20d] text-gray-900 hover:from-[#ffd033]/90 hover:to-[#ffc20d]/90'
                            : clickedItems.has(item.title)
                            ? 'bg-gradient-to-r from-[#ffd033]/20 to-[#ffc20d]/20 ring-2 ring-[#ffd033]/30 animate-pulse'
                            : 'hover:bg-gradient-to-r hover:from-[#ffd033]/10 hover:to-[#ffc20d]/10'
                        }`}
                        role="button"
                        tabIndex={0}
                        aria-expanded={openMap[item.title] ?? !!item.isActive}
                        aria-haspopup="true"
                        onClick={() => handleMenuClick(item.title)}
                      >
                        {item.icon && (
                          <item.icon
                            className={`h-4 w-4 transition-all duration-200 ${
                              isActive
                                ? 'text-gray-900'
                                : clickedItems.has(item.title)
                                ? 'text-[#16a34a] dark:text-[#ffc20d] scale-110'
                                : 'text-[#16a34a] dark:text-[#ffd033]'
                            }`}
                          />
                        )}
                        <span className={`font-grotesk font-medium transition-all duration-300 leading-tight ${isActive ? 'text-gray-900' : 'text-slate-800 dark:text-slate-200'}`}>
                          {item.title}
                        </span>
                        <ChevronRight className={`ml-auto h-4 w-4 transition-all duration-300 group-data-[state=open]/collapsible:rotate-90 ${isActive ? 'text-gray-900' : 'text-slate-500 dark:text-slate-400'}`} />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="animate-slide-down">
                      <SidebarMenuSub>
                        {filterSubItems(item.items)?.map((subItem) => {
                          const isSubItemActive = subItem.url === pathname
                          return (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton
                                asChild
                                className={`transition-all duration-300 ease-in-out ${
                                  isSubItemActive
                                    ? 'bg-gradient-to-r from-[#ffc20d] to-[#e6a600] text-gray-900 hover:from-[#ffc20d]/90 hover:to-[#e6a600]/90'
                                    : clickedItems.has(subItem.title)
                                    ? 'bg-gradient-to-r from-[#ffc20d]/20 to-[#e6a600]/20 ring-2 ring-[#ffc20d]/30 animate-pulse'
                                    : 'hover:bg-gradient-to-r hover:from-[#ffc20d]/8 hover:to-[#e6a600]/8'
                                }`}
                              >
                                        <Link
                                          href={subItem.url || '#'}
                                          className="flex items-center gap-3"
                                          role="menuitem"
                                          tabIndex={0}
                                          aria-label={subItem.title}
                                          onMouseEnter={() => subItem.url && handleMouseEnter(subItem.url)}
                                          onClick={(e) => {
                                            // Always provide immediate feedback
                                            handleMenuClick(subItem.title)
                                            if (subItem.url) {
                                              handleNavigation(subItem.url, subItem.title, item.title)
                                            } else {
                                              // Prevent navigation if no URL
                                              e.preventDefault()
                                            }
                                          }}
                                        >
                                  {loadingRoutes.has(subItem.url) ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-gray-900" />
                                  ) : (
                                    subItem.icon && (
                                      <subItem.icon
                                        className={`h-4 w-4 transition-all duration-200 ${
                                          isSubItemActive
                                            ? 'text-gray-900'
                                            : clickedItems.has(subItem.title)
                                            ? 'text-[#16a34a] dark:text-[#16a34a] scale-110'
                                            : 'text-[#16a34a] dark:text-[#16a34a]'
                                        }`}
                                      />
                                    )
                                  )}
                                  <span className={`font-grotesk text-sm leading-tight ${isSubItemActive ? 'text-gray-900 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>{subItem.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </div>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
