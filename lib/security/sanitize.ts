/**
 * Input sanitization utilities for XSS prevention.
 *
 * Two levels of sanitization:
 * 1. sanitizeText() — strips ALL HTML, for plain text fields (names, codes, emails)
 * 2. sanitizeHtml() — allows safe HTML subset, for rich text fields (TipTap editor content)
 */

// ── Plain Text Sanitization ────────────────────────────────────

/**
 * Strip all HTML tags and decode entities for plain text inputs.
 * Use this for names, codes, emails, descriptions — anything that shouldn't contain HTML.
 */
export function sanitizeText(input: string | null | undefined): string {
	if (!input) return ''
	return input
		.replace(/<[^>]*>/g, '') // Strip all HTML tags
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&#x2F;/g, '/')
		.trim()
}

/**
 * Escape HTML special characters for safe display in HTML context.
 * Use when you need to display user input inside HTML without it being interpreted.
 */
export function escapeHtml(input: string | null | undefined): string {
	if (!input) return ''
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;')
}

// ── Rich Text (HTML) Sanitization ──────────────────────────────

// Tags allowed in rich text content (TipTap editor output)
const ALLOWED_TAGS = new Set([
	'p', 'br', 'hr',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
	'ul', 'ol', 'li',
	'blockquote', 'pre', 'code',
	'a', 'img',
	'table', 'thead', 'tbody', 'tr', 'th', 'td',
	'span', 'div', 'sub', 'sup',
])

// Attributes allowed per tag
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
	'a': new Set(['href', 'title', 'target', 'rel', 'class']),
	'img': new Set(['src', 'alt', 'title', 'width', 'height', 'class']),
	'td': new Set(['colspan', 'rowspan', 'class']),
	'th': new Set(['colspan', 'rowspan', 'class']),
	'span': new Set(['style', 'class']),
	'p': new Set(['style', 'class']),
	'h1': new Set(['style', 'class']),
	'h2': new Set(['style', 'class']),
	'h3': new Set(['style', 'class']),
	'div': new Set(['style', 'class']),
}

// CSS properties allowed in style attributes
const ALLOWED_CSS_PROPERTIES = new Set([
	'color', 'background-color', 'font-size', 'font-weight', 'font-style',
	'text-align', 'text-decoration', 'margin', 'padding',
	'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
	'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
])

// URL schemes allowed in href/src attributes
const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'data:'])

/**
 * Validate that a URL doesn't contain dangerous schemes like javascript:
 */
function isUrlSafe(url: string): boolean {
	const trimmed = url.trim().toLowerCase()

	// Block javascript:, vbscript:, data: with script content
	if (trimmed.startsWith('javascript:') || trimmed.startsWith('vbscript:')) {
		return false
	}

	// Allow relative URLs
	if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('.')) {
		return true
	}

	// Check scheme for absolute URLs
	try {
		const parsed = new URL(url)
		return ALLOWED_URL_SCHEMES.has(parsed.protocol)
	} catch {
		// If URL can't be parsed, allow it (likely a relative URL)
		return true
	}
}

/**
 * Sanitize CSS style string, keeping only allowed properties.
 */
function sanitizeCss(style: string): string {
	return style
		.split(';')
		.map((rule) => rule.trim())
		.filter((rule) => {
			if (!rule) return false
			const colonIndex = rule.indexOf(':')
			if (colonIndex === -1) return false
			const property = rule.substring(0, colonIndex).trim().toLowerCase()
			return ALLOWED_CSS_PROPERTIES.has(property)
		})
		.join('; ')
}

/**
 * Sanitize rich text HTML content, keeping only safe tags and attributes.
 * Use this for content from the TipTap rich text editor before storing in the database.
 *
 * This is a regex-based sanitizer suitable for known-good input (TipTap output).
 * For truly untrusted HTML from external sources, consider using DOMPurify.
 */
export function sanitizeHtml(html: string | null | undefined): string {
	if (!html) return ''

	let result = html

	// Remove script tags and their content entirely
	result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

	// Remove style tags and their content (inline styles on elements are handled separately)
	result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')

	// Remove event handler attributes (onclick, onerror, onload, etc.)
	result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')

	// Process each HTML tag
	result = result.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)?\/?>/g, (match, tagName, attrs) => {
		const tag = tagName.toLowerCase()

		// Remove disallowed tags entirely (closing tags too)
		if (!ALLOWED_TAGS.has(tag)) {
			return ''
		}

		// For closing tags, just return the clean closing tag
		if (match.startsWith('</')) {
			return `</${tag}>`
		}

		// Filter attributes
		const allowedAttrs = ALLOWED_ATTRIBUTES[tag]
		if (!attrs || !allowedAttrs) {
			// Self-closing check
			return match.endsWith('/>') ? `<${tag} />` : `<${tag}>`
		}

		// Parse and filter attributes
		const cleanAttrs: string[] = []
		const attrRegex = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g
		let attrMatch

		while ((attrMatch = attrRegex.exec(attrs)) !== null) {
			const attrName = attrMatch[1].toLowerCase()
			const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''

			if (!allowedAttrs.has(attrName)) continue

			// Validate URLs in href and src
			if ((attrName === 'href' || attrName === 'src') && !isUrlSafe(attrValue)) {
				continue
			}

			// Sanitize style attributes
			if (attrName === 'style') {
				const cleanCss = sanitizeCss(attrValue)
				if (cleanCss) {
					cleanAttrs.push(`style="${cleanCss}"`)
				}
				continue
			}

			// Escape attribute values
			const escaped = attrValue.replace(/"/g, '&quot;')
			cleanAttrs.push(`${attrName}="${escaped}"`)
		}

		// Add rel="noopener noreferrer" to links with target="_blank"
		if (tag === 'a' && cleanAttrs.some((a) => a.includes('target="_blank"'))) {
			if (!cleanAttrs.some((a) => a.startsWith('rel='))) {
				cleanAttrs.push('rel="noopener noreferrer"')
			}
		}

		const attrString = cleanAttrs.length > 0 ? ' ' + cleanAttrs.join(' ') : ''
		return match.endsWith('/>') ? `<${tag}${attrString} />` : `<${tag}${attrString}>`
	})

	return result
}

// ── Batch Sanitization for API Routes ──────────────────────────

/**
 * Sanitize all string fields in an object (shallow).
 * Use in API route handlers before inserting into the database.
 *
 * @param data - The request body object
 * @param htmlFields - Field names that should be treated as rich text (HTML allowed)
 */
export function sanitizeRequestBody<T extends Record<string, unknown>>(
	data: T,
	htmlFields: string[] = []
): T {
	const htmlFieldSet = new Set(htmlFields)
	const sanitized = { ...data }

	for (const [key, value] of Object.entries(sanitized)) {
		if (typeof value === 'string') {
			(sanitized as Record<string, unknown>)[key] = htmlFieldSet.has(key)
				? sanitizeHtml(value)
				: sanitizeText(value)
		}
	}

	return sanitized
}
