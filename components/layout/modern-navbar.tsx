"use client"

import { Search, Bell, User } from "lucide-react"
import { ModeToggle } from "@/components/common/mode-toggle"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useState } from "react"
import { useRouter } from "next/navigation"

interface ModernNavbarProps {
	showSearch?: boolean
	className?: string
}

/**
 * Modern Top Navbar Component
 *
 * Clean, minimal navbar following Linear/Vercel design principles
 * Features:
 * - Global search
 * - Notifications
 * - User menu
 * - Theme toggle
 * - Sidebar trigger
 *
 * Usage:
 * ```tsx
 * <ModernNavbar showSearch={true} />
 * ```
 */
export function ModernNavbar({ showSearch = true, className = "" }: ModernNavbarProps) {
	const { user, logout } = useAuth()
	const router = useRouter()
	const [loggingOut, setLoggingOut] = useState(false)

	const getUserInitials = () => {
		if (!user?.email) return "U"
		const email = user.email
		return email.charAt(0).toUpperCase()
	}

	const handleLogout = async () => {
		try {
			setLoggingOut(true)
			await logout()
			router.push("/login")
		} catch (error) {
			console.error("Logout error:", error)
		} finally {
			setLoggingOut(false)
		}
	}

	return (
		<header
			className={`
				flex h-14 shrink-0 items-center justify-between px-4 md:px-6
				bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60
				border-b border-border sticky top-0 z-40
				${className}
			`}
		>
			{/* Left Section */}
			<div className="flex items-center gap-3">
				<SidebarTrigger className="h-7 w-7" />
				<Separator orientation="vertical" className="h-5" />

				{/* Search Bar */}
				{showSearch && (
					<div className="relative hidden md:flex items-center">
						<Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							type="search"
							placeholder="Search..."
							className="
								pl-9 pr-4 w-64 h-9
								bg-muted/40 border-border
								focus-visible:bg-background
								transition-all duration-200
								rounded-lg
							"
						/>
						<kbd className="absolute right-2.5 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
							<span className="text-xs">⌘</span>K
						</kbd>
					</div>
				)}
			</div>

			{/* Right Section */}
			<div className="flex items-center gap-2">
				{/* Notifications */}
				<Button
					variant="ghost"
					size="icon"
					className="relative h-9 w-9 rounded-lg"
				>
					<Bell className="h-4 w-4" />
					<span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-saas-accent-500" />
				</Button>

				{/* Theme Toggle */}
				<ModeToggle />

				<Separator orientation="vertical" className="h-5 mx-1" />

				{/* User Menu */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							className="relative h-9 w-9 rounded-lg p-0"
						>
							<Avatar className="h-8 w-8">
								<AvatarFallback className="bg-saas-primary-100 dark:bg-saas-primary-900 text-saas-primary-700 dark:text-saas-primary-200 text-xs font-semibold">
									{getUserInitials()}
								</AvatarFallback>
							</Avatar>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-56" align="end">
						<DropdownMenuLabel className="font-normal">
							<div className="flex flex-col space-y-1">
								<p className="text-sm font-medium leading-none">
									{user?.email?.split('@')[0] || "User"}
								</p>
								<p className="text-xs leading-none text-muted-foreground">
									{user?.email || "user@example.com"}
								</p>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem>
							<User className="mr-2 h-4 w-4" />
							Profile
						</DropdownMenuItem>
						<DropdownMenuItem>
							<Bell className="mr-2 h-4 w-4" />
							Notifications
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={handleLogout}
							disabled={loggingOut}
							className="text-destructive focus:text-destructive"
						>
							{loggingOut ? "Logging out..." : "Log out"}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	)
}
