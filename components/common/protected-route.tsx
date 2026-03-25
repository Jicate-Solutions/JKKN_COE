'use client'

import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context-parent'

interface ProtectedRouteProps {
	children: ReactNode
	fallback?: ReactNode
	redirectTo?: string
	requiredPermissions?: string[]
	requiredRoles?: string[]
	requireAnyRole?: boolean
	onUnauthorized?: () => void
	loadingComponent?: ReactNode
}

const DefaultLoading = () => (
	<div className="flex items-center justify-center min-h-screen">
		<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
	</div>
)

export function ProtectedRoute({
	children,
	fallback,
	redirectTo,
	requiredPermissions = [],
	requiredRoles = [],
	requireAnyRole = true,
	onUnauthorized,
	loadingComponent,
}: ProtectedRouteProps) {
	const { user, loading: isLoading, isAuthenticated } = useAuth()
	const router = useRouter()

	// Helper functions for permission/role checking
	const hasPermission = (permission: string): boolean => {
		return user?.permissions?.includes(permission) || false
	}

	const hasRole = (role: string): boolean => {
		return user?.role === role
	}

	const hasAnyRole = (roles: string[]): boolean => {
		return roles.includes(user?.role || '')
	}

	const checkAuthorization = (): boolean => {
		if (!user) return false

		// Check permissions
		if (requiredPermissions.length > 0) {
			const hasAllPermissions = requiredPermissions.every((permission) => hasPermission(permission))
			if (!hasAllPermissions) return false
		}

		// Check roles
		if (requiredRoles.length > 0) {
			if (requireAnyRole) {
				const hasAnyRequiredRole = hasAnyRole(requiredRoles)
				if (!hasAnyRequiredRole) return false
			} else {
				const hasAllRoles = requiredRoles.every((role) => hasRole(role))
				if (!hasAllRoles) return false
			}
		}

		return true
	}

	useEffect(() => {
		// Don't redirect while loading
		if (isLoading) return

		// Add a small delay to prevent immediate redirects during page refresh
		const redirectTimer = setTimeout(() => {
			if (!isAuthenticated) {
				if (redirectTo) {
					router.push(redirectTo)
				} else if (onUnauthorized) {
					onUnauthorized()
				}
				return
			}

			// Check authorization
			const isAuthorized = checkAuthorization()
			if (!isAuthorized) {
				if (onUnauthorized) {
					onUnauthorized()
				} else if (!fallback) {
					router.push('/unauthorized')
				}
			}
		}, 50)

		return () => clearTimeout(redirectTimer)
	}, [isLoading, isAuthenticated, user, router, redirectTo, onUnauthorized, fallback])

	if (isLoading) {
		return loadingComponent ? <>{loadingComponent}</> : <DefaultLoading />
	}

	if (!isAuthenticated) {
		// If redirectTo is set, show loading while useEffect handles the redirect
		// Don't show the fallback — it's meant for authorized-but-lacking-permissions users
		if (redirectTo) {
			return loadingComponent ? <>{loadingComponent}</> : null
		}
		return fallback ? <>{fallback}</> : null
	}

	if (!checkAuthorization()) {
		return fallback ? <>{fallback}</> : null
	}

	return <>{children}</>
}

// Higher-order component wrapper
export function withAuth<P extends object>(
	Component: React.ComponentType<P>,
	options?: Omit<ProtectedRouteProps, 'children'>
) {
	return function AuthenticatedComponent(props: P) {
		return (
			<ProtectedRoute {...options}>
				<Component {...props} />
			</ProtectedRoute>
		)
	}
}

// Convenience components
export function RequireAuth({ children, redirectTo }: { children: ReactNode; redirectTo?: string }) {
	return <ProtectedRoute redirectTo={redirectTo || '/login'}>{children}</ProtectedRoute>
}

export function RequirePermission({
	children,
	permission,
	fallback,
}: {
	children: ReactNode
	permission: string | string[]
	fallback?: ReactNode
}) {
	const permissions = Array.isArray(permission) ? permission : [permission]

	return (
		<ProtectedRoute requiredPermissions={permissions} fallback={fallback}>
			{children}
		</ProtectedRoute>
	)
}

export function RequireRole({
	children,
	role,
	requireAll = false,
	fallback,
}: {
	children: ReactNode
	role: string | string[]
	requireAll?: boolean
	fallback?: ReactNode
}) {
	const roles = Array.isArray(role) ? role : [role]

	return (
		<ProtectedRoute requiredRoles={roles} requireAnyRole={!requireAll} fallback={fallback}>
			{children}
		</ProtectedRoute>
	)
}

export function GuestOnly({ children, redirectTo = '/' }: { children: ReactNode; redirectTo?: string }) {
	const { isAuthenticated, loading: isLoading } = useAuth()
	const router = useRouter()

	useEffect(() => {
		if (!isLoading && isAuthenticated) {
			router.push(redirectTo)
		}
	}, [isAuthenticated, isLoading, router, redirectTo])

	if (isLoading) {
		return <DefaultLoading />
	}

	if (isAuthenticated) {
		return null
	}

	return <>{children}</>
}

export function ConditionalAuth({
	authenticated,
	unauthenticated,
	loading,
}: {
	authenticated: ReactNode
	unauthenticated: ReactNode
	loading?: ReactNode
}) {
	const { isAuthenticated, loading: isLoading } = useAuth()

	if (isLoading) {
		return loading ? <>{loading}</> : <DefaultLoading />
	}

	return isAuthenticated ? <>{authenticated}</> : <>{unauthenticated}</>
}
