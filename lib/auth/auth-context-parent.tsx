'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, ReactNode, Suspense } from 'react'
import { useSearchParams, usePathname } from 'next/navigation'
import { parentAuthService } from './parent-auth-service'
import { ParentAppUser } from './config'
import { useRoleSync } from '@/hooks/auth/use-role-sync'

interface AuthContextType {
	user: ParentAppUser | null
	loading: boolean
	isLoading: boolean // Alias for loading (backwards compatibility)
	error: string | null
	isAuthenticated: boolean
	login: (redirectUrl?: string) => void
	loginWithGoogle: (redirectUrl?: string) => void
	logout: () => Promise<void>
	refreshSession: () => Promise<boolean>
	refreshPermissions: () => Promise<void>
	getAccessToken: () => string | null
	hasPermission: (permission: string) => boolean
	hasRole: (role: string) => boolean
	hasAnyRole: (roles: string[]) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
	children: ReactNode
	autoValidate?: boolean
}

// Inner component that uses useSearchParams - must be wrapped in Suspense
interface AuthProviderInnerProps extends AuthProviderProps {
	setUser: (user: ParentAppUser | null) => void
	setLoading: (loading: boolean) => void
	setError: (error: string | null) => void
	user: ParentAppUser | null
	loading: boolean
	error: string | null
}

function AuthProviderInner({
	children,
	autoValidate = false,
	setUser,
	setLoading,
	setError,
	user,
	loading,
	error
}: AuthProviderInnerProps) {
	const searchParams = useSearchParams()
	const pathname = usePathname()

	// Sync session with local database (updates last_login, sessions, user_sessions, and fetches permissions)
	// Returns the local avatar_url, permissions, institution details if available
	const syncSession = useCallback(async (userData: ParentAppUser, accessToken?: string, refreshToken?: string, expiresIn?: number): Promise<{
		avatar_url: string | null
		permissions: string[]
		roles: string[]
		institution_id: string | null
		institution_code: string | null
		institution_name: string | null
		counselling_code: string | null
		myjkkn_institution_ids: string[] | null
		coe_user_id: string | null
		coe_roles: string[]
		has_coe_access: boolean
	}> => {
		try {
			const response = await fetch('/api/auth/sync-session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					email: userData.email,
					user_id: userData.id,
					full_name: userData.full_name,
					avatar_url: userData.avatar_url,
					role: userData.role,
					// Send institution_id (UUID) from MyJKKN session
					// sync-session will call MyJKKN API to get counselling_code and use it as institution_code
					institution_id: userData.institution_id,
					access_token: accessToken,
					refresh_token: refreshToken,
					expires_in: expiresIn || 3600, // Use actual expiry from parent app, default 1 hour
				}),
			})

			if (response.ok) {
				const data = await response.json()
				// Return local avatar_url, permissions, and full institution details from database
				return {
					avatar_url: data.avatar_url || null,
					permissions: data.permissions || [],
					roles: data.roles || [],
					institution_id: data.institution_id || null,
					institution_code: data.institution_code || null,
					institution_name: data.institution_name || null,
					counselling_code: data.counselling_code || null,
					myjkkn_institution_ids: data.myjkkn_institution_ids || null,
					coe_user_id: data.user_id || null,
					coe_roles: data.coe_roles || [],
					has_coe_access: data.has_coe_access || false,
				}
			}
			return {
				avatar_url: null,
				permissions: [],
				roles: [],
				institution_id: null,
				institution_code: null,
				institution_name: null,
				counselling_code: null,
				myjkkn_institution_ids: null,
				coe_user_id: null,
				coe_roles: [],
				has_coe_access: false,
			}
		} catch (err) {
			// Non-critical - just log and continue
			console.warn('Failed to sync session with local DB:', err)
			return {
				avatar_url: null,
				permissions: [],
				roles: [],
				institution_id: null,
				institution_code: null,
				institution_name: null,
				counselling_code: null,
				myjkkn_institution_ids: null,
				coe_user_id: null,
				coe_roles: [],
				has_coe_access: false,
			}
		}
	}, [])

	const handleOAuthCallback = useCallback(async () => {
		const token = searchParams.get('token')
		const refreshToken = searchParams.get('refresh_token')
		const userParam = searchParams.get('user')
		const expiresIn = searchParams.get('expires_in') // Get actual token expiry from parent app
		const redirectParam = searchParams.get('redirect') // Get redirect from URL

		if (token) {
			try {
				let userData: ParentAppUser | undefined
				if (userParam) {
					try {
						// Handle double-encoded URL (parent app might encode twice)
						let decodedUser = decodeURIComponent(userParam)
						// Check if still encoded (starts with %7B which is {)
						if (decodedUser.startsWith('%7B') || decodedUser.startsWith('%257B')) {
							decodedUser = decodeURIComponent(decodedUser)
						}
						userData = JSON.parse(decodedUser)
					} catch (parseError) {
						console.error('Failed to parse user data from URL:', parseError)
					}
				}

				// Parse expires_in (in seconds) - default to 1 hour if not provided
				const tokenExpirySeconds = expiresIn ? parseInt(expiresIn, 10) : 3600

				const authenticatedUser = await parentAuthService.handleCallback(
					token,
					refreshToken || undefined,
					userData,
					tokenExpirySeconds
				)

				if (authenticatedUser) {
					// Sync session with local database and fetch permissions + full institution details
					const {
						permissions,
						roles,
						avatar_url,
						institution_id,
						institution_code,
						institution_name,
						counselling_code,
						myjkkn_institution_ids,
						coe_user_id,
						coe_roles,
						has_coe_access
					} = await syncSession(
						authenticatedUser,
						token,
						refreshToken || undefined,
						tokenExpirySeconds
					)

					// Merge permissions and full institution details from database into the user object
					const userWithPermissions: ParentAppUser = {
						...authenticatedUser,
						permissions: permissions.length > 0 ? permissions : authenticatedUser.permissions,
						roles: roles.length > 0 ? roles : authenticatedUser.roles,
						avatar_url: avatar_url || authenticatedUser.avatar_url,
						institution_id: institution_id || authenticatedUser.institution_id,
						institution_code: institution_code || authenticatedUser.institution_code,
						institution_name: institution_name || authenticatedUser.institution_name,
						counselling_code: counselling_code || authenticatedUser.counselling_code,
						myjkkn_institution_ids: myjkkn_institution_ids || authenticatedUser.myjkkn_institution_ids,
						coe_user_id: coe_user_id || authenticatedUser.coe_user_id,
						coe_roles: coe_roles.length > 0 ? coe_roles : authenticatedUser.coe_roles,
						has_coe_access: has_coe_access || authenticatedUser.has_coe_access,
					}

					setUser(userWithPermissions)
					// Update stored user with permissions
					localStorage.setItem('user_data', JSON.stringify(userWithPermissions))

					// If user has no COE roles, redirect to MyJKKN
					if (!userWithPermissions.has_coe_access) {
						parentAuthService.clearSession()
						window.location.replace(process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://jkkn.ai')
						return
					}
				}

				// Determine redirect destination
				const targetRedirect = redirectParam || parentAuthService.getPostLoginRedirect() || '/dashboard'

				// Clean URL and redirect immediately
				window.location.replace(targetRedirect)
			} catch (err) {
				console.error('OAuth callback error:', err)
				setError('Authentication failed')
			}
		}
	}, [searchParams, syncSession])

	// Use ref for searchParams to avoid re-running initializeAuth on every navigation
	const searchParamsRef = useRef(searchParams)
	searchParamsRef.current = searchParams

	const initializeAuth = useCallback(async () => {
		setLoading(true)
		setError(null)

		try {
			// Check for OAuth callback params first (use ref to avoid dependency)
			const currentParams = searchParamsRef.current
			const token = currentParams.get('token')
			if (token) {
				await handleOAuthCallback()
				setLoading(false)
				return
			}

			// Check for OAuth error
			const oauthError = currentParams.get('error')
			if (oauthError) {
				setError(currentParams.get('error_description') || oauthError)
				setLoading(false)
				return
			}

			// Check for existing session
			const storedUser = parentAuthService.getStoredUser()
			const accessToken = parentAuthService.getAccessToken()

			if (storedUser && accessToken) {
				if (autoValidate) {
					// Validate token with server
					const validation = await parentAuthService.validateToken(accessToken)
					if (validation.valid && validation.user) {
						setUser(validation.user)
						localStorage.setItem('user_data', JSON.stringify(validation.user))
					} else {
						// Try refresh
						const refreshed = await parentAuthService.refreshToken()
						if (refreshed) {
							const newUser = parentAuthService.getStoredUser()
							setUser(newUser)
						} else {
							parentAuthService.clearSession()
							setUser(null)
						}
					}
				} else {
					// Always sync session to get fresh COE roles, permissions, and institution details
					const needsSync = !storedUser.coe_roles || !storedUser.coe_user_id || (storedUser.institution_id && !storedUser.institution_name)

					if (needsSync) {
						const {
							institution_id,
							institution_code,
							institution_name,
							counselling_code,
							permissions,
							roles,
							coe_user_id,
							coe_roles,
							has_coe_access,
						} = await syncSession(storedUser, accessToken)

						const updatedUser: ParentAppUser = {
							...storedUser,
							institution_id: institution_id || storedUser.institution_id,
							institution_code: institution_code || storedUser.institution_code,
							institution_name: institution_name || storedUser.institution_name,
							counselling_code: counselling_code || storedUser.counselling_code,
							permissions: permissions.length > 0 ? permissions : storedUser.permissions,
							roles: roles.length > 0 ? roles : storedUser.roles,
							coe_user_id: coe_user_id || storedUser.coe_user_id,
							coe_roles: coe_roles.length > 0 ? coe_roles : storedUser.coe_roles,
							has_coe_access: has_coe_access || storedUser.has_coe_access,
						}

						setUser(updatedUser)
						localStorage.setItem('user_data', JSON.stringify(updatedUser))
					} else {
						// Cached data already has coe_roles — use as-is
						setUser(storedUser)
					}
				}
			} else {
				setUser(null)
			}
		} catch (err) {
			console.error('Auth initialization error:', err)
			setError('Failed to initialize authentication')
			setUser(null)
		} finally {
			setLoading(false)
		}
	}, [handleOAuthCallback, autoValidate, syncSession])

	useEffect(() => {
		initializeAuth()
	}, [initializeAuth])

	// Auto-refresh session every 30 minutes to prevent logout
	useEffect(() => {
		if (!user) return

		const REFRESH_INTERVAL = 30 * 60 * 1000 // 30 minutes

		const autoRefresh = async () => {
			const token = parentAuthService.getAccessToken()
			const refreshToken = parentAuthService.getRefreshToken()
			const storedUser = parentAuthService.getStoredUser()

			if (!token && refreshToken) {
				// Token expired but refresh token exists - try to refresh
				const success = await parentAuthService.refreshToken()
				if (success) {
					const newUser = parentAuthService.getStoredUser()
					if (newUser) setUser(newUser)
				}
			} else if (token && storedUser) {
				// Token exists - extend cookie expiry by calling sync-session
				// This keeps the session alive during active use
				try {
					await fetch('/api/auth/sync-session', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						credentials: 'include',
						body: JSON.stringify({
							email: storedUser.email,
							user_id: storedUser.id,
							role: storedUser.role,
							institution_id: storedUser.institution_id,
							access_token: token,
							refresh_token: refreshToken,
						}),
					})
				} catch (err) {
					console.warn('Auto-refresh session failed:', err)
				}
			}
		}

		// Set up interval for periodic refresh (don't run immediately - already synced on login)
		const intervalId = setInterval(autoRefresh, REFRESH_INTERVAL)

		return () => clearInterval(intervalId)
	}, [user?.id])

	// Real-time role sync — listens to user_roles table changes via Supabase Realtime
	// When admin assigns/revokes roles, the user's session updates immediately
	const handleRoleChange = useCallback(async () => {
		const storedUser = parentAuthService.getStoredUser()
		const accessToken = parentAuthService.getAccessToken()
		if (!storedUser || !accessToken) return

		const {
			coe_user_id,
			coe_roles,
			has_coe_access,
			permissions,
		} = await syncSession(storedUser, accessToken)

		if (!has_coe_access) {
			// Access revoked — force logout immediately
			setUser(null)
			await parentAuthService.logout()
			return
		}

		// Roles changed — update silently
		const updatedUser: ParentAppUser = {
			...storedUser,
			coe_user_id: coe_user_id || storedUser.coe_user_id,
			coe_roles: coe_roles.length > 0 ? coe_roles : storedUser.coe_roles,
			has_coe_access,
			permissions: permissions.length > 0 ? permissions : storedUser.permissions,
		}
		setUser(updatedUser)
		localStorage.setItem('user_data', JSON.stringify(updatedUser))
	}, [syncSession])

	useRoleSync({
		userId: user?.coe_user_id || null,
		onRoleChange: handleRoleChange,
	})

	const login = useCallback((redirectUrl?: string) => {
		parentAuthService.login(redirectUrl || pathname)
	}, [pathname])

	const loginWithGoogle = useCallback((redirectUrl?: string) => {
		parentAuthService.loginWithGoogle(redirectUrl || pathname)
	}, [pathname])

	const logout = useCallback(async () => {
		setUser(null)
		await parentAuthService.logout()
	}, [])

	const refreshSession = useCallback(async (): Promise<boolean> => {
		const success = await parentAuthService.refreshToken()
		if (success) {
			const newUser = parentAuthService.getStoredUser()
			setUser(newUser)
		}
		return success
	}, [])

	// Refresh permissions from the database
	const refreshPermissions = useCallback(async (): Promise<void> => {
		if (!user) return

		try {
			const response = await fetch(`/api/auth/permissions/by-role?role=${encodeURIComponent(user.role)}&email=${encodeURIComponent(user.email)}`, {
				credentials: 'include'
			})
			if (response.ok) {
				const data = await response.json()
				const updatedUser: ParentAppUser = {
					...user,
					permissions: data.permissions || [],
					roles: data.roles?.length > 0 ? data.roles : user.roles
				}
				setUser(updatedUser)
				localStorage.setItem('user_data', JSON.stringify(updatedUser))
			}
		} catch (err) {
			console.warn('Failed to refresh permissions:', err)
		}
	}, [user])

	const getAccessToken = useCallback(() => {
		return parentAuthService.getAccessToken()
	}, [])

	// Stable refs for permission/role checking to avoid re-creating callbacks on every user change
	const userPermissionsRef = useRef(user?.permissions)
	const userRoleRef = useRef(user?.role)
	const userRolesRef = useRef(user?.roles)
	const userCoeRolesRef = useRef(user?.coe_roles)
	useEffect(() => {
		userPermissionsRef.current = user?.permissions
		userRoleRef.current = user?.role
		userRolesRef.current = user?.roles
		userCoeRolesRef.current = user?.coe_roles
	}, [user?.permissions, user?.role, user?.roles, user?.coe_roles])

	// Permission and role checking functions - use refs for stable callbacks
	const hasPermission = useCallback((permission: string): boolean => {
		if (!userPermissionsRef.current) return false
		return userPermissionsRef.current.includes(permission)
	}, [])

	// hasRole/hasAnyRole check ONLY COE roles (from user_roles table).
	// MyJKKN global roles are NOT used — they're a different system.
	const hasRole = useCallback((role: string): boolean => {
		if (!userCoeRolesRef.current || userCoeRolesRef.current.length === 0) return false
		return userCoeRolesRef.current.includes(role)
	}, [])

	const hasAnyRole = useCallback((roles: string[]): boolean => {
		if (!roles || roles.length === 0) return true
		if (!userCoeRolesRef.current || userCoeRolesRef.current.length === 0) return false
		return userCoeRolesRef.current.some(r => roles.includes(r))
	}, [])

	// Check if cookie exists - important to prevent redirect loops
	const hasAccessToken = typeof window !== 'undefined' && !!parentAuthService.getAccessToken()

	// Memoize context value to prevent unnecessary re-renders of all consumers
	const contextValue = useMemo<AuthContextType>(() => ({
		user,
		loading,
		isLoading: loading,
		error,
		isAuthenticated: !!user && hasAccessToken,
		login,
		loginWithGoogle,
		logout,
		refreshSession,
		refreshPermissions,
		getAccessToken,
		hasPermission,
		hasRole,
		hasAnyRole,
	}), [user, loading, error, hasAccessToken, login, loginWithGoogle, logout, refreshSession, refreshPermissions, getAccessToken, hasPermission, hasRole, hasAnyRole])

	return (
		<AuthContext.Provider value={contextValue}>
			{children}
		</AuthContext.Provider>
	)
}

// Main AuthProvider that wraps the inner component in Suspense
export function AuthProvider({ children, autoValidate = false }: AuthProviderProps) {
	const [user, setUser] = useState<ParentAppUser | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	return (
		<Suspense fallback={
			<AuthContext.Provider
				value={{
					user: null,
					loading: true,
					isLoading: true,
					error: null,
					isAuthenticated: false,
					login: () => {},
					loginWithGoogle: () => {},
					logout: async () => {},
					refreshSession: async () => false,
					refreshPermissions: async () => {},
					getAccessToken: () => null,
					hasPermission: () => false,
					hasRole: () => false,
					hasAnyRole: () => false,
				}}
			>
				{children}
			</AuthContext.Provider>
		}>
			<AuthProviderInner
				autoValidate={autoValidate}
				setUser={setUser}
				setLoading={setLoading}
				setError={setError}
				user={user}
				loading={loading}
				error={error}
			>
				{children}
			</AuthProviderInner>
		</Suspense>
	)
}

export function useAuth() {
	const context = useContext(AuthContext)
	if (context === undefined) {
		throw new Error('useAuth must be used within an AuthProvider')
	}
	return context
}

export function useIsAuthenticated(): boolean {
	const { isAuthenticated } = useAuth()
	return isAuthenticated
}

export function useCurrentUser(): ParentAppUser | null {
	const { user } = useAuth()
	return user
}
