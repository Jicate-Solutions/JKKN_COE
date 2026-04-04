import Cookies from 'js-cookie'
import { ParentAppUser, ValidationResponse } from './config'

// Read env vars dynamically to ensure they're available on client
const getConfig = () => ({
	parentAppUrl: process.env.NEXT_PUBLIC_PARENT_APP_URL || '',
	parentSupabaseUrl: process.env.NEXT_PUBLIC_PARENT_SUPABASE_URL || '',
	appId: process.env.NEXT_PUBLIC_APP_ID || '',
	redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || '',
	siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '',
	scopes: 'read write profile',
})

class ParentAuthService {
	private generateState(): string {
		return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
	}

	login(redirectUrl?: string): void {
		const config = getConfig()

		if (!config.parentAppUrl || !config.appId || !config.redirectUri) {
			console.error('Missing OAuth config:', {
				parentAppUrl: !!config.parentAppUrl,
				appId: !!config.appId,
				redirectUri: !!config.redirectUri,
			})
			alert('OAuth configuration is missing. Please check environment variables.')
			return
		}

		if (redirectUrl) {
			localStorage.setItem('post_login_redirect', redirectUrl)
		}

		// After logout, force Google to show the password form by going through
		// the parent's Supabase Auth directly with prompt=login.
		// Once re-authenticated, Supabase redirects back to COE login with ?reauth=complete,
		// which auto-triggers the normal parent authorize flow (step 2).
		const reauthRequired = Cookies.get('coe_reauth_required')
		if (reauthRequired && config.parentSupabaseUrl) {
			Cookies.remove('coe_reauth_required', { path: '/' })
			const siteUrl = config.siteUrl || window.location.origin
			const redirectTo = `${siteUrl}/login?reauth=complete`
			window.location.href = `${config.parentSupabaseUrl}/auth/v1/authorize?provider=google&prompt=login&redirect_to=${encodeURIComponent(redirectTo)}`
			return
		}

		// Normal login flow — redirect to parent's authorize endpoint
		const state = this.generateState()
		localStorage.setItem('oauth_state', state)

		const params = new URLSearchParams({
			client_id: config.appId,
			redirect_uri: config.redirectUri,
			response_type: 'code',
			scope: config.scopes,
			state: state,
			prompt: 'login',
		})

		const authUrl = `${config.parentAppUrl}/api/auth/authorize?${params}`
		window.location.href = authUrl
	}

	loginWithGoogle(redirectUrl?: string): void {
		this.login(redirectUrl)
	}

	async handleCallback(
		token: string,
		refreshToken?: string,
		user?: ParentAppUser,
		expiresIn?: number // Token expiry in seconds from parent app
	): Promise<ParentAppUser | null> {
		// Extended session: use 7 days for access token cookie to allow longer work sessions
		// The actual token validity is still controlled by the parent app, but we keep the cookie longer
		const accessTokenExpiryDays = 7 // Extended to 7 days for longer work sessions
		const refreshTokenExpiryDays = 30 // Refresh token typically lasts longer

		// Store tokens in cookies with security flags
		const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:'
		Cookies.set('access_token', token, {
			expires: accessTokenExpiryDays,
			path: '/',
			sameSite: 'Lax',
			secure: isProduction,
		})
		if (refreshToken) {
			// Refresh token is set server-side with httpOnly: true.
			// Only set client-side as fallback for callback flow.
			Cookies.set('refresh_token', refreshToken, {
				expires: refreshTokenExpiryDays,
				path: '/',
				sameSite: 'Lax',
				secure: isProduction,
			})
		}

		// Store timestamp
		localStorage.setItem('auth_timestamp', Date.now().toString())

		// If user data is provided, normalize and store it
		if (user) {
			const normalizedUser = this.normalizeUserData(user)
			localStorage.setItem('user_data', JSON.stringify(normalizedUser))
			return normalizedUser
		}

		// Otherwise validate token to get user data
		const validation = await this.validateToken(token)
		if (validation.valid && validation.user) {
			const normalizedUser = this.normalizeUserData(validation.user)
			localStorage.setItem('user_data', JSON.stringify(normalizedUser))
			return normalizedUser
		}

		return null
	}

	// Normalize user data from different OAuth providers
	private normalizeUserData(user: any): ParentAppUser {
		return {
			id: user.id || user.sub || '',
			email: user.email || '',
			full_name: user.full_name || user.name || user.displayName || '',
			first_name: user.first_name || user.given_name || '',
			last_name: user.last_name || user.family_name || '',
			role: user.role || 'user',
			roles: user.roles || [],
			// Handle different avatar field names from various OAuth providers
			avatar_url: user.avatar_url || user.picture || user.image || user.photo_url || user.profile_image || '',
			permissions: user.permissions || [],
			institution_id: user.institution_id || '',
			institution_code: user.institution_code || '',
			department_code: user.department_code || '',
			is_active: user.is_active ?? true,
			is_super_admin: user.is_super_admin ?? false,
			last_login: user.last_login || '',
		}
	}

	async validateToken(token: string): Promise<ValidationResponse> {
		const config = getConfig()
		try {
			const response = await fetch(`${config.parentAppUrl}/api/auth/validate`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					access_token: token,
					child_app_id: config.appId,
				}),
			})

			if (!response.ok) {
				return { valid: false, error: 'Token validation failed' }
			}

			const data = await response.json()
			return { valid: true, user: data.user }
		} catch (error) {
			console.error('Token validation error:', error)
			return { valid: false, error: 'Network error during validation' }
		}
	}

	async refreshToken(): Promise<boolean> {
		const refreshToken = Cookies.get('refresh_token')
		if (!refreshToken) return false

		try {
			const response = await fetch('/api/token/refresh', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ refresh_token: refreshToken }),
			})

			if (!response.ok) {
				this.clearSession()
				return false
			}

			const data = await response.json()
			const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:'
			Cookies.set('access_token', data.access_token, { expires: 7, path: '/', sameSite: 'Lax', secure: isProduction })
			if (data.refresh_token) {
				Cookies.set('refresh_token', data.refresh_token, { expires: 30, path: '/', sameSite: 'Lax', secure: isProduction })
			}
			localStorage.setItem('auth_timestamp', Date.now().toString())

			return true
		} catch {
			this.clearSession()
			return false
		}
	}

	getAccessToken(): string | null {
		return Cookies.get('access_token') || null
	}

	getRefreshToken(): string | null {
		return Cookies.get('refresh_token') || null
	}

	getStoredUser(): ParentAppUser | null {
		try {
			const userData = localStorage.getItem('user_data')
			return userData ? JSON.parse(userData) : null
		} catch {
			return null
		}
	}

	isAuthenticated(): boolean {
		return !!this.getAccessToken() && !!this.getStoredUser()
	}

	clearSession(): void {
		// Remove cookies with explicit path
		Cookies.remove('access_token', { path: '/' })
		Cookies.remove('refresh_token', { path: '/' })
		Cookies.remove('access_token')
		Cookies.remove('refresh_token')
		Cookies.remove('coe_access', { path: '/' })
		Cookies.remove('coe_access')

		// Clear specific localStorage items
		const keys = ['user_data', 'session_data', 'auth_timestamp', 'oauth_state', 'post_login_redirect']
		keys.forEach((key) => localStorage.removeItem(key))

		// Clear entire localStorage and sessionStorage
		localStorage.clear()
		sessionStorage.clear()
	}

	async logout(): Promise<void> {
		// Get current token and user data before clearing
		const accessToken = this.getAccessToken()
		const storedUser = this.getStoredUser()

		// Single API call handles both COE + parent session cleanup
		try {
			await fetch('/api/auth/logout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: storedUser?.email,
					access_token: accessToken,
					user_id: storedUser?.id,
				}),
			})
		} catch (err) {
			console.warn('Failed to invalidate sessions:', err)
		}

		// Set flag so the next login forces Google re-authentication
		Cookies.set('coe_reauth_required', 'true', { expires: 1 / 144, path: '/' }) // 10 min expiry

		// Clear local session (cookies, localStorage, sessionStorage)
		this.clearSession()

		// Redirect to login page
		window.location.href = '/login'
	}

	getPostLoginRedirect(): string | null {
		const redirect = localStorage.getItem('post_login_redirect')
		if (redirect) {
			localStorage.removeItem('post_login_redirect')
		}
		return redirect
	}
}

export const parentAuthService = new ParentAuthService()
