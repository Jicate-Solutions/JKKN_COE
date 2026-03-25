"use client"

import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"
import { Fragment } from "react"

export interface BreadcrumbItem {
	label: string
	href?: string
	current?: boolean
}

interface ModernBreadcrumbProps {
	items: BreadcrumbItem[]
	showHome?: boolean
	className?: string
}

/**
 * Modern Breadcrumb Component
 *
 * Linear/Vercel-style breadcrumb navigation
 *
 * Usage:
 * ```tsx
 * <ModernBreadcrumb
 *   items={[
 *     { label: 'Master', href: '#' },
 *     { label: 'Institutions', href: '/institutions' },
 *     { label: 'View', current: true }
 *   ]}
 * />
 * ```
 */
export function ModernBreadcrumb({ items, showHome = true, className = "" }: ModernBreadcrumbProps) {
	return (
		<nav aria-label="Breadcrumb" className={`flex items-center space-x-1 text-sm ${className}`}>
			{showHome && (
				<>
					<Link
						href="/dashboard"
						className="flex items-center text-muted-foreground hover:text-foreground transition-colors duration-200"
					>
						<Home className="h-4 w-4" />
					</Link>
					{items.length > 0 && (
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					)}
				</>
			)}

			{items.map((item, index) => (
				<Fragment key={index}>
					{item.current ? (
						<span className="font-medium text-foreground">
							{item.label}
						</span>
					) : item.href ? (
						<Link
							href={item.href}
							className="text-muted-foreground hover:text-foreground transition-colors duration-200"
						>
							{item.label}
						</Link>
					) : (
						<span className="text-muted-foreground">
							{item.label}
						</span>
					)}

					{index < items.length - 1 && (
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					)}
				</Fragment>
			))}
		</nav>
	)
}
