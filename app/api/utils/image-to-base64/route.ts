import { NextResponse } from 'next/server'

/**
 * API route to fetch an image and convert it to base64
 * This is needed because client-side fetch of Supabase storage URLs may fail due to CORS
 *
 * PERFORMANCE: results are memoised per URL for CACHE_TTL_MS. Batch reports call
 * this once per learner, and a user typically downloads the same cohort more than
 * once (with header / without header, or after tweaking a filter) — without the
 * cache every one of those runs re-downloaded every photo from origin. The cache
 * is bounded by both entry count and total bytes so a large batch cannot grow the
 * server heap without limit.
 */

const CACHE_TTL_MS = 10 * 60 * 1000
const MAX_ENTRIES = 600
const MAX_CACHE_BYTES = 64 * 1024 * 1024

interface CachedImage {
	dataUri: string
	bytes: number
	cachedAt: number
}

const imageCache = new Map<string, CachedImage>()
let cacheBytes = 0

function readCache(url: string): string | null {
	const hit = imageCache.get(url)
	if (!hit) return null
	if (Date.now() - hit.cachedAt > CACHE_TTL_MS) {
		imageCache.delete(url)
		cacheBytes -= hit.bytes
		return null
	}
	// Refresh insertion order so hot images survive eviction
	imageCache.delete(url)
	imageCache.set(url, hit)
	return hit.dataUri
}

function writeCache(url: string, dataUri: string) {
	const bytes = dataUri.length
	if (bytes > MAX_CACHE_BYTES) return  // single image too large to be worth caching

	const existing = imageCache.get(url)
	if (existing) cacheBytes -= existing.bytes

	imageCache.set(url, { dataUri, bytes, cachedAt: Date.now() })
	cacheBytes += bytes

	// Evict oldest entries until back within both limits
	while (imageCache.size > MAX_ENTRIES || cacheBytes > MAX_CACHE_BYTES) {
		const oldestKey = imageCache.keys().next().value
		if (oldestKey === undefined) break
		const oldest = imageCache.get(oldestKey)!
		imageCache.delete(oldestKey)
		cacheBytes -= oldest.bytes
	}
}

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const imageUrl = searchParams.get('url')

		if (!imageUrl) {
			return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 })
		}

		// Validate URL format
		try {
			new URL(imageUrl)
		} catch {
			console.error('[Image to Base64] Invalid URL format:', imageUrl)
			return NextResponse.json({ error: 'Invalid URL format', base64: null }, { status: 200 })
		}

		const cached = readCache(imageUrl)
		if (cached) {
			return NextResponse.json({ base64: cached, cached: true })
		}

		// Fetch the image from the URL with timeout
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 15000)  // 15 second timeout

		let response: Response
		try {
			response = await fetch(imageUrl, {
				signal: controller.signal,
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; JKKNCOE/1.0)',
					'Accept': 'image/*'
				}
			})
		} catch (fetchError: any) {
			clearTimeout(timeoutId)
			if (fetchError.name === 'AbortError') {
				console.error('[Image to Base64] Fetch timeout after 15 seconds:', imageUrl?.substring(0, 100))
				return NextResponse.json({ error: 'Fetch timeout', base64: null }, { status: 200 })
			}
			console.error('[Image to Base64] Fetch error:', fetchError.message || fetchError)
			return NextResponse.json({ error: `Fetch failed: ${fetchError.message}`, base64: null }, { status: 200 })
		}
		clearTimeout(timeoutId)

		if (!response.ok) {
			console.warn(`[Image to Base64] Failed to fetch image: ${response.status} ${response.statusText}`)
			return NextResponse.json({ error: `Failed to fetch image: ${response.status}`, base64: null }, { status: 200 })
		}

		// Get the content type
		const contentType = response.headers.get('content-type') || 'image/jpeg'

		// Verify it's actually an image
		if (!contentType.startsWith('image/')) {
			console.warn('[Image to Base64] Response is not an image:', contentType)
			return NextResponse.json({ error: 'Response is not an image', base64: null }, { status: 200 })
		}

		// Convert to array buffer then to base64
		const arrayBuffer = await response.arrayBuffer()

		// Check if we got actual data
		if (arrayBuffer.byteLength === 0) {
			console.warn('[Image to Base64] Empty response body')
			return NextResponse.json({ error: 'Empty image response', base64: null }, { status: 200 })
		}

		const base64 = Buffer.from(arrayBuffer).toString('base64')

		// Return as data URI
		const dataUri = `data:${contentType};base64,${base64}`
		writeCache(imageUrl, dataUri)

		return NextResponse.json({ base64: dataUri })

	} catch (error: any) {
		console.error('[Image to Base64] Unexpected error:', error?.message || error, error?.stack)
		return NextResponse.json({ error: `Unexpected error: ${error?.message || 'Unknown'}`, base64: null }, { status: 200 })
	}
}
