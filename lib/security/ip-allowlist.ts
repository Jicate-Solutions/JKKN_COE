import { NextRequest, NextResponse } from 'next/server'

/**
 * IP Allowlisting for sensitive routes (e.g., /api/admin).
 *
 * Configured via the ADMIN_ALLOWED_IPS environment variable:
 *   - Comma-separated list of IPs or CIDR ranges
 *   - If empty or not set, allowlisting is DISABLED (all IPs allowed)
 *   - Supports IPv4 addresses and CIDR notation (e.g., "10.0.0.0/8")
 *
 * Example .env:
 *   ADMIN_ALLOWED_IPS=192.168.1.100,10.0.0.0/8,172.16.0.0/12
 */

// Route prefixes protected by IP allowlisting
const IP_PROTECTED_ROUTES = ['/api/admin']

/**
 * Parse the allowlist from env var on first use, then cache.
 */
let parsedAllowlist: string[] | null = null

function getAllowlist(): string[] {
	if (parsedAllowlist !== null) return parsedAllowlist

	const raw = process.env.ADMIN_ALLOWED_IPS || ''
	parsedAllowlist = raw
		.split(',')
		.map((ip) => ip.trim())
		.filter(Boolean)

	return parsedAllowlist
}

/**
 * Check if an IP matches a CIDR range (e.g., "10.0.0.0/8").
 */
function matchesCidr(ip: string, cidr: string): boolean {
	const [range, bitsStr] = cidr.split('/')
	if (!bitsStr) return ip === range // Exact match, not CIDR

	const bits = parseInt(bitsStr, 10)
	if (isNaN(bits) || bits < 0 || bits > 32) return false

	const ipNum = ipToNumber(ip)
	const rangeNum = ipToNumber(range)
	if (ipNum === null || rangeNum === null) return false

	const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
	return (ipNum & mask) === (rangeNum & mask)
}

/**
 * Convert an IPv4 address string to a 32-bit number.
 */
function ipToNumber(ip: string): number | null {
	const parts = ip.split('.')
	if (parts.length !== 4) return null

	let num = 0
	for (const part of parts) {
		const octet = parseInt(part, 10)
		if (isNaN(octet) || octet < 0 || octet > 255) return null
		num = (num << 8) | octet
	}
	return num >>> 0 // Ensure unsigned
}

/**
 * Extract client IP from request.
 */
function getClientIp(request: NextRequest): string {
	return (
		request.headers.get('cf-connecting-ip') ||
		request.headers.get('true-client-ip') ||
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		request.headers.get('x-real-ip') ||
		'unknown'
	)
}

/**
 * Check if the request IP is allowed to access IP-protected routes.
 * Returns null if allowed, or an error response if blocked.
 */
export function checkIpAllowlist(request: NextRequest): NextResponse | null {
	const pathname = request.nextUrl.pathname

	// Only check IP-protected routes
	if (!IP_PROTECTED_ROUTES.some((prefix) => pathname.startsWith(prefix))) {
		return null
	}

	const allowlist = getAllowlist()

	// If no allowlist configured, allow all (feature disabled)
	if (allowlist.length === 0) return null

	const clientIp = getClientIp(request)

	// Always allow localhost in development
	if (
		process.env.NODE_ENV === 'development' &&
		(clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost')
	) {
		return null
	}

	// Check against allowlist
	const isAllowed = allowlist.some((entry) => {
		if (entry.includes('/')) return matchesCidr(clientIp, entry)
		return clientIp === entry
	})

	if (!isAllowed) {
		return NextResponse.json(
			{ error: 'Access denied from this IP address.' },
			{ status: 403 }
		)
	}

	return null
}
