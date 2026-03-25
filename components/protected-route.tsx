'use client'

import { useAuth } from '@/lib/auth/auth-context-parent'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ReactNode } from 'react'

interface ProtectedRouteProps {
	children: ReactNode
	requiredRoles?: string[]
	requireAnyRole?: boolean
	redirectTo?: string
}

export function ProtectedRoute({
	children,
	requiredRoles,
	requireAnyRole = true,
	redirectTo = '/login',
}: ProtectedRouteProps) {
	const { user, loading, isAuthenticated } = useAuth()
	const router = useRouter()

	useEffect(() => {
		if (!loading && !isAuthenticated) {
			router.push(redirectTo)
		}
	}, [loading, isAuthenticated, router, redirectTo])

	useEffect(() => {
		if (!loading && isAuthenticated && requiredRoles && requiredRoles.length > 0) {
			const userRole = user?.role
			const hasRole = requireAnyRole
				? requiredRoles.some((role) => role === userRole)
				: requiredRoles.every((role) => role === userRole)

			if (!hasRole) {
				router.push('/unauthorized')
			}
		}
	}, [loading, isAuthenticated, user, requiredRoles, requireAnyRole, router])

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		)
	}

	if (!isAuthenticated) {
		return null
	}

	if (requiredRoles && requiredRoles.length > 0) {
		const userRole = user?.role
		const hasRole = requireAnyRole
			? requiredRoles.some((role) => role === userRole)
			: requiredRoles.every((role) => role === userRole)

		if (!hasRole) {
			return null
		}
	}

	return <>{children}</>
}
