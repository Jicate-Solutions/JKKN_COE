"use client"

import { Bell, ChevronsUpDown, LogOut, Loader2, User, Settings, HelpCircle, Shield, Building2, Clock, Bug } from "lucide-react"
import { useState, useEffect } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useBugReporter } from "@/hooks"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

interface NavUserProps {
  variant?: "full" | "compact"
}

export function NavUser({ variant = "compact" }: NavUserProps) {
  const { isMobile } = useSidebar()
  const { user, logout, isLoading } = useAuth()
  const { reportBug, isAvailable } = useBugReporter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const displayName = user?.full_name || "User"
  const email = user?.email || ""
  const avatarUrl = user?.avatar_url || ""
  const roles = user?.roles || []
  const isActive = user?.is_active ?? true
  const isSuperAdmin = user?.is_super_admin ?? false
  const lastLogin = user?.last_login
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null)

  // Use institution_name directly from user object (populated by sync-session)
  const institutionName = user?.institution_name || null

  const initials = (displayName || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  // Generate fallback avatar URL using DiceBear (more reliable than ui-avatars)
  const getFallbackAvatarUrl = (name: string) => {
    // Use DiceBear's initials style for a nice generated avatar
    const seed = encodeURIComponent(name.toLowerCase().trim())
    return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=059669&textColor=ffffff&fontSize=40`
  }

  // Use the actual avatar URL, fallback to local DB avatar, then DiceBear generated
  const finalAvatarUrl = avatarUrl || localAvatarUrl || getFallbackAvatarUrl(displayName)

  // Fetch avatar from local database if not available from parent app
  useEffect(() => {
    if (!email || avatarUrl) return

    const abortController = new AbortController()

    const fetchLocalAvatar = async () => {
      try {
        const response = await fetch(
          `/api/users/avatar?email=${encodeURIComponent(email)}`,
          { signal: abortController.signal, credentials: 'include' }
        )
        if (response.ok) {
          const data = await response.json()
          if (data.avatar_url) {
            setLocalAvatarUrl(data.avatar_url)
          }
        }
      } catch (error) {
        // Ignore abort errors (component unmounted)
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('Error fetching local avatar:', error)
      }
    }

    fetchLocalAvatar()

    return () => abortController.abort()
  }, [avatarUrl, email])


  // Format last login as relative time
  const formatLastLogin = (lastLoginDate?: string) => {
    if (!lastLoginDate) return "Never"
    const now = new Date()
    const loginTime = new Date(lastLoginDate)
    const diffMs = now.getTime() - loginTime.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return loginTime.toLocaleDateString()
  }

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      await logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handleReportBug = () => {
    // Trigger the bug reporter by clicking the floating button
    const bugReporterButton = document.querySelector('[data-bug-reporter-button], .bug-reporter-floating-btn, .bug-reporter-button') as HTMLButtonElement
    if (bugReporterButton) {
      bugReporterButton.click()
    }
  }


  // Compact variant (for header) - no sidebar wrappers
  if (variant === "compact") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer focus:outline-none border-0 bg-transparent p-0">
            <Avatar className="h-10 w-10 rounded-full">
              <AvatarImage
                src={finalAvatarUrl}
                alt={displayName}
                className="object-cover"
              />
              <AvatarFallback className="rounded-full bg-gradient-to-br from-[#059669] to-emerald-600 text-white font-bold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[320px] rounded-2xl p-2"
            side={isMobile ? "bottom" : "bottom"}
            align="end"
            sideOffset={4}
          >
            {/* Enhanced Header with User Photo and Details */}
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex flex-col gap-3 px-3 py-3">
                <div className="flex items-start gap-3">
                  {/* Larger Avatar */}
                  <Avatar className="h-14 w-14 rounded-xl border-2 border-emerald-100 dark:border-emerald-900">
                    <AvatarImage
                      src={finalAvatarUrl}
                      alt={displayName}
                    />
                    <AvatarFallback className="rounded-xl bg-gradient-to-br from-[#059669] to-emerald-700 text-white font-bold text-lg">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  {/* User Info */}
                  <div className="flex-1 space-y-1">
                    <div className="font-[family-name:var(--font-space-grotesk)] font-bold text-base text-foreground leading-tight">
                      {displayName}
                    </div>
                    <div className="text-xs text-muted-foreground font-inter truncate">
                      {email}
                    </div>

                    {/* Role Badges */}
                    {roles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {isSuperAdmin && (
                          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 text-[10px] px-2 py-0.5 font-semibold">
                            <Shield className="h-3 w-3 mr-1" />
                            Super Admin
                          </Badge>
                        )}
                        {roles.slice(0, 2).map((role, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-[10px] px-2 py-0.5 font-semibold"
                          >
                            {role}
                          </Badge>
                        ))}
                        {roles.length > 2 && (
                          <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                            +{roles.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Institution and Status */}
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  {institutionName && (
                    <div className="flex items-center gap-2 text-xs">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground font-inter truncate">{institutionName}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-muted-foreground font-inter">
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {lastLogin && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span className="font-inter">{formatLastLogin(lastLogin)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator className="my-1" />

            {/* Profile Actions */}
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer rounded-lg">
                <User className="h-4 w-4" />
                <span className="font-inter">View Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer rounded-lg">
                <Settings className="h-4 w-4" />
                <span className="font-inter">Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer rounded-lg">
                <HelpCircle className="h-4 w-4" />
                <span className="font-inter">Help & Documentation</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="my-1" />

            {/* Notifications */}
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer rounded-lg">
                <Bell className="h-4 w-4" />
                <span className="font-inter">Notifications</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="my-1" />

            {/* Report Bug */}
            {isAvailable && (
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={handleReportBug}
                  className="cursor-pointer rounded-lg text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/50"
                >
                  <Bug className="h-4 w-4" />
                  <span className="font-inter">Report a Bug</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            )}

            <DropdownMenuSeparator className="my-1" />

            {/* Logout */}
            <DropdownMenuItem
              onSelect={handleLogout}
              disabled={isLoggingOut || isLoading}
              className="cursor-pointer rounded-lg text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/50"
            >
              {isLoggingOut ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="font-inter">Logging out...</span>
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  <span className="font-inter">Log out</span>
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Full variant (for sidebar) - with sidebar wrappers
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage
                  src={finalAvatarUrl}
                  alt={displayName}
                  className="object-cover"
                />
                <AvatarFallback className="rounded-lg bg-[#16a34a] text-white font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{displayName}</span>
                <span className="truncate text-xs">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[320px] rounded-2xl p-2"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            {/* Enhanced Header with User Photo and Details */}
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex flex-col gap-3 px-3 py-3">
                <div className="flex items-start gap-3">
                  {/* Larger Avatar */}
                  <Avatar className="h-14 w-14 rounded-xl border-2 border-emerald-100 dark:border-emerald-900">
                    <AvatarImage
                      src={finalAvatarUrl}
                      alt={displayName}
                    />
                    <AvatarFallback className="rounded-xl bg-gradient-to-br from-[#059669] to-emerald-700 text-white font-bold text-lg">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  {/* User Info */}
                  <div className="flex-1 space-y-1">
                    <div className="font-[family-name:var(--font-space-grotesk)] font-bold text-base text-foreground leading-tight">
                      {displayName}
                    </div>
                    <div className="text-xs text-muted-foreground font-inter truncate">
                      {email}
                    </div>

                    {/* Role Badges */}
                    {roles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {isSuperAdmin && (
                          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 text-[10px] px-2 py-0.5 font-semibold">
                            <Shield className="h-3 w-3 mr-1" />
                            Super Admin
                          </Badge>
                        )}
                        {roles.slice(0, 2).map((role, index) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-[10px] px-2 py-0.5 font-semibold"
                          >
                            {role}
                          </Badge>
                        ))}
                        {roles.length > 2 && (
                          <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                            +{roles.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Institution and Status */}
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  {institutionName && (
                    <div className="flex items-center gap-2 text-xs">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground font-inter truncate">{institutionName}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-muted-foreground font-inter">
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {lastLogin && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span className="font-inter">{formatLastLogin(lastLogin)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator className="my-1" />

            {/* Profile Actions */}
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer rounded-lg">
                <User className="h-4 w-4" />
                <span className="font-inter">View Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer rounded-lg">
                <Settings className="h-4 w-4" />
                <span className="font-inter">Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer rounded-lg">
                <HelpCircle className="h-4 w-4" />
                <span className="font-inter">Help & Documentation</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="my-1" />

            {/* Notifications */}
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer rounded-lg">
                <Bell className="h-4 w-4" />
                <span className="font-inter">Notifications</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="my-1" />

            {/* Report Bug */}
            {isAvailable && (
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={handleReportBug}
                  className="cursor-pointer rounded-lg text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/50"
                >
                  <Bug className="h-4 w-4" />
                  <span className="font-inter">Report a Bug</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            )}

            <DropdownMenuSeparator className="my-1" />

            {/* Logout */}
            <DropdownMenuItem
              onSelect={handleLogout}
              disabled={isLoggingOut || isLoading}
              className="cursor-pointer rounded-lg text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/50"
            >
              {isLoggingOut ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="font-inter">Logging out...</span>
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" />
                  <span className="font-inter">Log out</span>
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
