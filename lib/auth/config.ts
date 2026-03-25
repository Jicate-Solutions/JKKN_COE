export const authConfig = {
	parentAppUrl: process.env.NEXT_PUBLIC_PARENT_APP_URL!,
	appId: process.env.NEXT_PUBLIC_APP_ID!,
	apiKey: process.env.API_KEY!,
	redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI!,
	siteUrl: process.env.NEXT_PUBLIC_SITE_URL!,
	scopes: 'read write profile',
}

export interface ParentAppUser {
	id: string
	email: string
	full_name: string
	first_name?: string
	last_name?: string
	role: string
	roles?: string[]
	avatar_url?: string
	permissions?: string[]
	institution_id?: string
	institution_code?: string
	institution_name?: string
	counselling_code?: string
	myjkkn_institution_ids?: string[] | null  // MyJKKN institution UUIDs for API filtering
	short_name?: string
	institution_type?: string
	department_code?: string
	is_active?: boolean
	is_super_admin?: boolean
	coe_user_id?: string
	coe_roles?: string[]
	has_coe_access?: boolean
	last_login?: string
}

export interface AuthTokens {
	access_token: string
	refresh_token: string
	token_type?: string
	expires_in?: number
	user?: ParentAppUser
}

export interface ValidationResponse {
	valid: boolean
	user?: ParentAppUser
	error?: string
}
