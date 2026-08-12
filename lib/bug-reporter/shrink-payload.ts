/**
 * Bug Reporter payload shrinking.
 *
 * The SDK (@boobalan_jkkn/bug-reporter-sdk) captures its mandatory screenshot as
 * an uncompressed full-page PNG — `canvas.toDataURL('image/png', 1)` — and posts
 * it inline as `screenshot_data_url`, alongside `network_trace`, `console_logs`
 * and base64 `attachments`.
 *
 * On a data-heavy COE page that JSON body routinely exceeds 4.5 MB, which is the
 * hard request-body limit on Vercel. The platform rejects it at the edge with
 * 413 FUNCTION_PAYLOAD_TOO_LARGE *before* the function runs, so the response
 * carries no CORS headers — the browser then blocks it and the SDK surfaces the
 * generic `TypeError: Failed to fetch` instead of the real cause.
 *
 * Both the browser -> bug-reporter hop and any proxy we could add are subject to
 * the same cap, so the payload has to be shrunk client-side, before it is sent.
 */

/** Vercel's limit is 4.5 MB; stay clear of it to leave room for headers. */
const MAX_BODY_BYTES = 3.5 * 1024 * 1024

/** Progressively harsher screenshot re-encodes, tried in order. */
const SCREENSHOT_STEPS = [
	{ maxDimension: 1600, quality: 0.72 },
	{ maxDimension: 1280, quality: 0.6 },
	{ maxDimension: 1024, quality: 0.5 },
	{ maxDimension: 800, quality: 0.4 }
]

const MAX_CONSOLE_LOGS = 200
const MAX_NETWORK_ENTRIES = 100
const MAX_LOG_CHARS = 2000

function byteLength(value: string) {
	return new TextEncoder().encode(value).length
}

function loadImage(dataUrl: string) {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error('Could not decode screenshot data URL'))
		image.src = dataUrl
	})
}

/**
 * Re-encode a PNG data URL as a scaled-down JPEG. Returns the original string if
 * the re-encode is not actually smaller (very small screenshots, or a browser
 * that refuses the canvas export).
 */
async function reencodeScreenshot(
	dataUrl: string,
	maxDimension: number,
	quality: number
) {
	const image = await loadImage(dataUrl)

	const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
	const width = Math.max(1, Math.round(image.width * scale))
	const height = Math.max(1, Math.round(image.height * scale))

	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height

	const context = canvas.getContext('2d')
	if (!context) {
		return dataUrl
	}

	// JPEG has no alpha channel — paint white first so transparent regions do not
	// come out black.
	context.fillStyle = '#ffffff'
	context.fillRect(0, 0, width, height)
	context.drawImage(image, 0, 0, width, height)

	const encoded = canvas.toDataURL('image/jpeg', quality)
	return encoded.length < dataUrl.length ? encoded : dataUrl
}

function truncate(value: unknown) {
	if (typeof value !== 'string') {
		return value
	}
	return value.length > MAX_LOG_CHARS
		? `${value.slice(0, MAX_LOG_CHARS)}… [truncated]`
		: value
}

function trimConsoleLogs(logs: unknown) {
	if (!Array.isArray(logs)) {
		return logs
	}

	// Keep the most recent entries — those are the ones near the failure.
	return logs.slice(-MAX_CONSOLE_LOGS).map(entry => {
		if (entry && typeof entry === 'object') {
			const record = entry as Record<string, unknown>
			return { ...record, message: truncate(record.message) }
		}
		return truncate(entry)
	})
}

function trimNetworkTrace(trace: unknown) {
	if (!Array.isArray(trace)) {
		return trace
	}

	return trace.slice(-MAX_NETWORK_ENTRIES).map(entry => {
		if (entry && typeof entry === 'object') {
			const record = entry as Record<string, unknown>
			return {
				...record,
				requestBody: truncate(record.requestBody),
				responseBody: truncate(record.responseBody)
			}
		}
		return entry
	})
}

/**
 * Shrink a bug-report payload until it fits inside `MAX_BODY_BYTES`.
 *
 * Order of sacrifice: log/trace volume first (cheap, low signal), then screenshot
 * fidelity, then attachments — attachments go last because the reporter chose
 * those deliberately, but an unsendable report helps nobody.
 */
export async function shrinkBugReportPayload(payload: Record<string, unknown>) {
	const notes: string[] = []
	const shrunk: Record<string, unknown> = {
		...payload,
		console_logs: trimConsoleLogs(payload.console_logs),
		network_trace: trimNetworkTrace(payload.network_trace)
	}

	if (byteLength(JSON.stringify(shrunk)) <= MAX_BODY_BYTES) {
		return { payload: shrunk, notes }
	}

	const screenshot = shrunk.screenshot_data_url
	if (typeof screenshot === 'string' && screenshot.startsWith('data:image/')) {
		const originalBytes = byteLength(screenshot)

		for (const step of SCREENSHOT_STEPS) {
			try {
				shrunk.screenshot_data_url = await reencodeScreenshot(
					screenshot,
					step.maxDimension,
					step.quality
				)
			} catch {
				// Canvas export can fail on tainted canvases; keep what we have and
				// fall through to trimming attachments instead.
				break
			}

			if (byteLength(JSON.stringify(shrunk)) <= MAX_BODY_BYTES) {
				break
			}
		}

		const finalBytes = byteLength(String(shrunk.screenshot_data_url))
		if (finalBytes < originalBytes) {
			notes.push(
				`Screenshot recompressed ${Math.round(originalBytes / 1024)} KB → ${Math.round(finalBytes / 1024)} KB to fit the upload limit.`
			)
		}
	}

	// Still too large: drop attachments from the end until it fits.
	if (Array.isArray(shrunk.attachments)) {
		const attachments = [...shrunk.attachments]
		const dropped: string[] = []

		while (
			attachments.length > 0 &&
			byteLength(JSON.stringify({ ...shrunk, attachments })) > MAX_BODY_BYTES
		) {
			const removed = attachments.pop() as Record<string, unknown> | undefined
			dropped.push(String(removed?.filename ?? removed?.name ?? 'attachment'))
		}

		shrunk.attachments = attachments.length > 0 ? attachments : undefined

		if (dropped.length > 0) {
			notes.push(
				`${dropped.length} attachment(s) omitted (too large to upload): ${dropped.join(', ')}.`
			)
		}
	}

	if (notes.length > 0 && typeof shrunk.description === 'string') {
		shrunk.description = `${shrunk.description}\n\n---\n${notes.join('\n')}`
	}

	return { payload: shrunk, notes }
}

/**
 * Patch `window.fetch` so bug-report submissions are shrunk on the way out.
 *
 * The SDK offers no hook between building the payload and sending it, so this
 * intercepts at the transport layer. Requests to any other URL pass through
 * untouched. Returns a cleanup function that restores the previous `fetch`.
 */
export function installBugReportShrinker(apiUrl: string) {
	if (typeof window === 'undefined' || !apiUrl) {
		return () => {}
	}

	// Match on origin + path rather than raw string equality: the SDK concatenates
	// `apiUrl + endpoint` verbatim, so a trailing slash in the env var yields a
	// double slash that an exact comparison would miss.
	// Built by concatenation, exactly as the SDK does (`apiUrl + endpoint`).
	// Resolving it as a relative URL instead would be wrong whenever apiUrl
	// carries a path — a root-relative '/api/...' would discard that prefix and
	// the match would silently never fire.
	let target: URL
	try {
		target = new URL(`${apiUrl.replace(/\/$/, '')}/api/v1/public/bug-reports`)
	} catch {
		return () => {}
	}

	const isSubmitUrl = (url: string) => {
		try {
			const parsed = new URL(url, window.location.origin)
			return (
				parsed.origin === target.origin &&
				parsed.pathname.replace(/\/{2,}/g, '/') === target.pathname
			)
		} catch {
			return false
		}
	}

	const originalFetch = window.fetch

	// Guard against double-installation across fast-refresh remounts.
	if ((originalFetch as { __bugReportShrinker?: boolean }).__bugReportShrinker) {
		return () => {}
	}

	const patched: typeof window.fetch = async (input, init) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.toString()
					: input.url

		const method = (
			init?.method ??
			(input instanceof Request ? input.method : 'GET')
		).toUpperCase()

		if (method !== 'POST' || !isSubmitUrl(url) || typeof init?.body !== 'string') {
			return originalFetch(input, init)
		}

		let body = init.body
		let finalBytes = byteLength(body)

		try {
			const parsed = JSON.parse(init.body) as Record<string, unknown>
			const { payload, notes } = await shrinkBugReportPayload(parsed)

			body = JSON.stringify(payload)
			finalBytes = byteLength(body)

			console.info(
				`[BugReporter] Submitting ${(finalBytes / 1024 / 1024).toFixed(2)} MB` +
					(notes.length > 0 ? ` (reduced: ${notes.join(' ')})` : '')
			)
		} catch (error) {
			console.warn('[BugReporter] Could not shrink payload, sending as-is:', error)
		}

		try {
			return await originalFetch(input, { ...init, body })
		} catch (error) {
			// A cross-origin failure here is opaque by design — the browser reports
			// only "Failed to fetch". Add the one detail that distinguishes the
			// likely causes, since a body over ~4.5 MB is rejected by Vercel's edge
			// with a CORS-less 413 that looks identical to a network error.
			console.error(
				`[BugReporter] Upload failed at ${(finalBytes / 1024 / 1024).toFixed(2)} MB. ` +
					(finalBytes > MAX_BODY_BYTES
						? 'Body exceeds the upload limit — the screenshot could not be compressed enough.'
						: 'Body is within the size limit, so this is a network/CORS failure, not a size failure.'),
				error
			)
			throw error
		}
	}

	;(patched as { __bugReportShrinker?: boolean }).__bugReportShrinker = true
	window.fetch = patched

	console.info(`[BugReporter] Payload shrinker installed for ${target.href}`)

	return () => {
		if (window.fetch === patched) {
			window.fetch = originalFetch
		}
	}
}
