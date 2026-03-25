import { NextResponse } from 'next/server'

/**
 * API route to fetch an image and convert it to base64
 * This is needed because client-side fetch of Supabase storage URLs may fail due to CORS
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const imageUrl = searchParams.get('url')

		console.log('[Image to Base64] Received request for URL:', imageUrl?.substring(0, 100))

		if (!imageUrl) {
			return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 })
		}

		// Validate URL format
		try {
			const parsedUrl = new URL(imageUrl)
			console.log('[Image to Base64] URL host:', parsedUrl.host)
		} catch {
			console.error('[Image to Base64] Invalid URL format:', imageUrl)
			return NextResponse.json({ error: 'Invalid URL format', base64: null }, { status: 200 })
		}

		// Fetch the image from the URL with timeout
		console.log('[Image to Base64] Fetching image with 15s timeout...')

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
				console.error('[Image to Base64] Fetch timeout after 15 seconds')
				return NextResponse.json({ error: 'Fetch timeout', base64: null }, { status: 200 })
			}
			console.error('[Image to Base64] Fetch error:', fetchError.message || fetchError)
			return NextResponse.json({ error: `Fetch failed: ${fetchError.message}`, base64: null }, { status: 200 })
		}
		clearTimeout(timeoutId)

		console.log('[Image to Base64] Fetch response status:', response.status, response.statusText)

		if (!response.ok) {
			console.warn(`[Image to Base64] Failed to fetch image: ${response.status} ${response.statusText}`)
			return NextResponse.json({ error: `Failed to fetch image: ${response.status}`, base64: null }, { status: 200 })
		}

		// Get the content type
		const contentType = response.headers.get('content-type') || 'image/jpeg'
		console.log('[Image to Base64] Content-Type:', contentType)

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

		console.log('[Image to Base64] Converted to base64, size:', base64.length, 'chars, bytes:', arrayBuffer.byteLength)

		// Return as data URI
		const dataUri = `data:${contentType};base64,${base64}`

		return NextResponse.json({ base64: dataUri })

	} catch (error: any) {
		console.error('[Image to Base64] Unexpected error:', error?.message || error, error?.stack)
		return NextResponse.json({ error: `Unexpected error: ${error?.message || 'Unknown'}`, base64: null }, { status: 200 })
	}
}
