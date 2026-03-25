"use client"

import { Search, Bell, Sun, Moon } from "lucide-react"
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
import { useTheme } from "next-themes"

interface PremiumNavbarProps {
	title?: string
	description?: string
	showSearch?: boolean
	className?: string
}

/**
 * Premium Top Navbar Component
 *
 * Specs:
 * - Transparent background with border
 * - Search bar with rounded-full
 * - Bell notifications
 * - Theme toggle
 * - User avatar menu
 * - Height: 64px (px-6 py-4)
 */
export function PremiumNavbar({
	title,
	description,
	showSearch = true,
	className = ""
}: PremiumNavbarProps) {
	const { user, logout } = useAuth()
	const router = useRouter()
	const { theme, setTheme } = useTheme()
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
				w-full bg-transparent border-b border-gray-100 dark:border-slate-800
				px-6 py-4 flex items-center justify-between
				sticky top-0 z-40 backdrop-blur-sm bg-white/80 dark:bg-slate-950/80
				${className}
			`}
		>
			{/* Left Section */}
			<div className="flex items-center gap-4">
				<SidebarTrigger className="h-9 w-9" />

				{title && (
					<>
						<Separator orientation="vertical" className="h-5" />
						<div>
							<div className="text-lg font-semibold text-slate-900 dark:text-slate-100 font-heading">
								{title}
							</div>
							{description && (
								<div className="text-sm text-slate-500 dark:text-slate-400 font-inter">
									{description}
								</div>
							)}
						</div>
					</>
				)}
			</div>

			{/* Right Section */}
			<div className="flex items-center gap-3">
				{/* Search Bar */}
				{showSearch && (
					<div className="relative hidden md:flex items-center">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
						<input
							type="search"
							placeholder="Search..."
							className="
								w-64 pl-9 pr-4 py-2
								bg-white dark:bg-slate-900
								border border-gray-200 dark:border-slate-700
								rounded-full
								text-sm text-slate-900 dark:text-slate-100
								placeholder:text-slate-500
								focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500
								transition-all duration-200
								font-inter
							"
						/>
					</div>
				)}

				{/* Notifications */}
				<button
					className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors relative"
					title="Notifications"
				>
					<Bell className="h-5 w-5 text-slate-600 dark:text-slate-300" />
					<span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-500" />
				</button>

				{/* Theme Toggle */}
				<button
					className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
					onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
					title="Toggle theme"
				>
					<Sun className="h-5 w-5 text-slate-600 dark:text-slate-300 hidden dark:block" />
					<Moon className="h-5 w-5 text-slate-600 dark:text-slate-300 dark:hidden" />
				</button>

				<Separator orientation="vertical" className="h-5 mx-1" />

				{/* User Menu */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button className="w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors font-heading">
							{getUserInitials()}
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-56" align="end">
						<DropdownMenuLabel className="font-normal">
							<div className="flex flex-col space-y-1">
								<p className="text-sm font-medium leading-none text-slate-900 dark:text-slate-100 font-heading">
									{user?.email?.split('@')[0] || "User"}
								</p>
								<p className="text-xs leading-none text-slate-500 dark:text-slate-400 font-inter">
									{user?.email || "user@example.com"}
								</p>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem className="font-inter">
							Profile
						</DropdownMenuItem>
						<DropdownMenuItem className="font-inter">
							Settings
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={handleLogout}
							disabled={loggingOut}
							className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400 font-inter"
						>
							{loggingOut ? "Logging out..." : "Log out"}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	)
}
