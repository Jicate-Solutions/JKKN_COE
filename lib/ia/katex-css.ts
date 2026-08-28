/**
 * Server-only: the KaTeX stylesheet with every woff2 face inlined as a data URI.
 *
 * Why this exists — formulae used to print through KaTeX's MathML output, which
 * Chromium lays out with the AMBIENT font. MathML Core renders a single-character
 * <mi> by mapping it into the Unicode Mathematical Alphanumeric block (U+1D400…),
 * and no ordinary text font carries those code points. On a dev Windows box it
 * still looked right (Cambria Math backs the fallback); inside @sparticuz/chromium,
 * which ships Open Sans and nothing else, every italic identifier printed BLANK —
 * "dy/dx" came out as a bare fraction bar and "x²" as a lone "2", while digits and
 * operators survived. Embedding KaTeX's own faces and using its HTML output makes
 * the render self-contained and byte-identical to the on-screen editor, which
 * loads the same katex.min.css.
 *
 * node_modules/katex/dist/{katex.min.css,fonts/} are DATA files: Next's output
 * file tracing follows `import katex from 'katex'` but not these, so the PDF
 * routes list `./node_modules/katex/**` in outputFileTracingIncludes
 * (next.config.ts). Without that this returns '' on Vercel and the caller falls
 * back to MathML.
 */

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

/** Locate node_modules/katex/dist across dev, standalone and Vercel layouts. */
function katexDistDir(): string | null {
	const candidates: string[] = []
	try {
		const req = createRequire(path.join(process.cwd(), 'package.json'))
		candidates.push(path.join(path.dirname(req.resolve('katex/package.json')), 'dist'))
	} catch {
		// resolve can fail under bundlers — fall through to the literal paths.
	}
	candidates.push(path.join(process.cwd(), 'node_modules', 'katex', 'dist'))
	for (const dir of candidates) {
		if (fs.existsSync(path.join(dir, 'katex.min.css'))) return dir
	}
	return null
}

let cached: string | null | undefined

/**
 * katex.min.css with `url(fonts/*.woff2)` replaced by base64 data URIs and the
 * woff/ttf fallbacks dropped (headless Chromium always supports woff2, and each
 * extra source would be one more unreachable relative URL). Returns '' when the
 * package data files are missing, so the caller can degrade to MathML.
 * Cached for the lifetime of the lambda — ~400 KB of CSS built once.
 */
export function buildKatexCss(): string {
	if (cached !== undefined) return cached || ''
	const dist = katexDistDir()
	if (!dist) {
		console.warn('[QP PDF] katex.min.css not found — formulae fall back to MathML')
		cached = null
		return ''
	}
	try {
		let css = fs.readFileSync(path.join(dist, 'katex.min.css'), 'utf8')
		// Drop the woff/ttf sources first: they are relative URLs Chromium cannot
		// resolve inside a setContent() page, and woff2 alone covers every face.
		css = css.replace(/,\s*url\([^)]*\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g, '')
		let missing = 0
		css = css.replace(/url\(\s*["']?([^)"']+?\.woff2)["']?\s*\)/g, (whole, rel: string) => {
			const file = path.join(dist, rel)
			if (!fs.existsSync(file)) {
				missing++
				return whole
			}
			return `url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')})`
		})
		if (missing > 0) {
			console.warn(`[QP PDF] ${missing} KaTeX font file(s) missing under ${dist}/fonts`)
		}
		cached = css
		return css
	} catch (e: any) {
		console.warn('[QP PDF] KaTeX CSS embed failed:', e?.message)
		cached = null
		return ''
	}
}
