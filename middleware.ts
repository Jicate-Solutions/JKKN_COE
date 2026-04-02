import { NextRequest, NextResponse } from 'next/server'

// List of public routes that don't require authentication
const publicRoutes = [
	'/login',
	'/auth/callback',
	'/callback',
	'/contact-admin',
	'/verify-email',
	'/arts-examiner-registration',
	'/engg-examiner-registration',
	'/',
]

// List of API routes that don't require authentication
const publicApiRoutes = [
	'/api/auth',
	'/api/token',
	'/api/myjkkn',
	'/api/public',
	'/api/v1',
]

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl
	const res = NextResponse.next()

	// Allow public routes
	if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
		return res
	}

	// Allow public API routes
	if (publicApiRoutes.some((route) => pathname.startsWith(route))) {
		return res
	}

	// Allow static assets and Next.js internals
	if (
		pathname.startsWith('/_next') ||
		pathname.startsWith('/static') ||
		pathname.includes('.') // Files with extensions (images, etc.)
	) {
		return res
	}

	// Check for access_token cookie (parent app OAuth)
	const accessToken = request.cookies.get('access_token')?.value

	// If no token and trying to access protected route
	if (!accessToken) {
		if (pathname.startsWith('/api')) {
			return NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 }
			)
		}

		// Redirect to login with redirect URL
		const url = request.nextUrl.clone()
		url.pathname = '/login'
		url.searchParams.set('redirect', pathname)
		return NextResponse.redirect(url)
	}

	// Check for COE access (user must have COE-specific roles assigned)
	const coeAccess = request.cookies.get('coe_access')?.value

	if (!coeAccess) {
		if (pathname.startsWith('/api')) {
			return NextResponse.json(
				{ error: 'COE access not granted. Contact administrator for role assignment.' },
				{ status: 403 }
			)
		}

		// Redirect to MyJKKN - user is authenticated but has no COE role
		const parentAppUrl = process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://jkkn.ai'
		return NextResponse.redirect(parentAppUrl)
	}

	// Token + COE access exist, allow request
	return res
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except:
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 * - public folder
		 */
		'/((?!_next/static|_next/image|favicon.ico|public).*)',
	],
}
