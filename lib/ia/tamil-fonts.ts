/**
 * Server-only Tamil font loading for question-paper PDF embed.
 * Place TTFs under public/fonts/tamil/ (see README there).
 */

import fs from 'fs'
import path from 'path'

export { TAMIL_FONT_FAMILIES, canonicalizeFontFamily } from '@/lib/ia/tamil-font-meta'
export type { TamilFontId } from '@/lib/ia/tamil-font-meta'

interface FontFaceSpec {
	cssName: string
	files: string[]
	unicodeRange?: string
}

const FONT_FILES: FontFaceSpec[] = [
	{
		cssName: 'Noto Sans Tamil',
		files: [
			'NotoSansTamil-Regular.ttf',
			'NotoSansTamil-Regular.otf',
			'NotoSansTamil.ttf',
		],
		// Keep Latin glyphs on Times; only Tamil codepoints use this face.
		unicodeRange: 'U+0B80-0BFF, U+200C-200D',
	},
	{
		cssName: 'Bamini',
		files: ['Bamini.ttf', 'bamini.ttf', 'Baamini.ttf', 'baamini.ttf'],
	},
	{
		cssName: 'Suntommy',
		files: ['Suntommy.ttf', 'suntommy.ttf', 'SunTommy.ttf', 'Suntommy.otf'],
	},
]

/**
 * Latin serif for the PDF body, embedded as 'QP Serif'.
 * Headless Chromium on Vercel has NO Times New Roman (@sparticuz/chromium ships
 * Open Sans only), so without a file here a paper printed in production comes
 * out in a sans-serif face. A Times-metric family in public/fonts/latin/ makes
 * the printed paper look the same everywhere.
 *
 * Each entry is one family; the first whose regular face is on disk wins. The
 * bold / italic faces are optional — Chromium synthesises any that are missing,
 * but a smeared regular is visibly not the real bold, and half the paper
 * (headings, question numbers, CO / K-Level) is bold.
 */
interface LatinSerifFamily {
	regular: string
	bold?: string
	italic?: string
	boldItalic?: string
}

const LATIN_SERIF_FAMILIES: LatinSerifFamily[] = [
	{
		regular: 'Tinos-Regular.ttf',
		bold: 'Tinos-Bold.ttf',
		italic: 'Tinos-Italic.ttf',
		boldItalic: 'Tinos-BoldItalic.ttf',
	},
	{
		regular: 'LiberationSerif-Regular.ttf',
		bold: 'LiberationSerif-Bold.ttf',
		italic: 'LiberationSerif-Italic.ttf',
		boldItalic: 'LiberationSerif-BoldItalic.ttf',
	},
	{ regular: 'TimesNewRoman.ttf' },
	{ regular: 'times.ttf', bold: 'timesbd.ttf', italic: 'timesi.ttf', boldItalic: 'timesbi.ttf' },
	{
		regular: 'NotoSerif-Regular.ttf',
		bold: 'NotoSerif-Bold.ttf',
		italic: 'NotoSerif-Italic.ttf',
		boldItalic: 'NotoSerif-BoldItalic.ttf',
	},
]

/**
 * What 'QP Serif' may set: Latin, Greek (α β μ Ω typed straight into a question),
 * punctuation, super/subscripts, currency, letterlike and number forms, arrows
 * and mathematical operators. NEVER the Tamil block — that stays with Noto Sans
 * Tamil, further down the stack.
 */
const LATIN_SERIF_RANGE =
	'U+0000-024F, U+0370-03FF, U+2000-206F, U+2070-209F, U+20A0-20BF, U+2100-218F, U+2190-2BFF'

function fontsDir(sub: 'tamil' | 'latin' = 'tamil'): string {
	return path.join(process.cwd(), 'public', 'fonts', sub)
}

function findFontFile(candidates: string[], sub: 'tamil' | 'latin' = 'tamil'): string | null {
	const dir = fontsDir(sub)
	for (const name of candidates) {
		const full = path.join(dir, name)
		if (fs.existsSync(full)) return full
	}
	return null
}

function readFontAsDataUri(filePath: string): { dataUri: string; format: string } | null {
	try {
		const buf = fs.readFileSync(filePath)
		const ext = path.extname(filePath).toLowerCase()
		const mime =
			ext === '.otf'
				? 'font/otf'
				: ext === '.woff2'
					? 'font/woff2'
					: ext === '.woff'
						? 'font/woff'
						: 'font/ttf'
		const format =
			ext === '.otf'
				? 'opentype'
				: ext === '.woff2'
					? 'woff2'
					: ext === '.woff'
						? 'woff'
						: 'truetype'
		return {
			dataUri: `data:${mime};base64,${buf.toString('base64')}`,
			format,
		}
	} catch {
		return null
	}
}

/** @font-face CSS for every Tamil font found on disk (PDF embed). */
export function buildTamilFontFaceCss(): string {
	const blocks: string[] = []
	for (const font of FONT_FILES) {
		const file = findFontFile(font.files)
		if (!file) continue
		const loaded = readFontAsDataUri(file)
		if (!loaded) continue
		const range = font.unicodeRange ? `unicode-range: ${font.unicodeRange};` : ''
		blocks.push(`@font-face {
	font-family: '${font.cssName}';
	src: url(${loaded.dataUri}) format('${loaded.format}');
	font-weight: normal;
	font-style: normal;
	font-display: block;
	${range}
}`)
	}
	return blocks.join('\n')
}

/**
 * @font-face rules for the Latin body serif ('QP Serif') — one per face of the
 * first family found in public/fonts/latin/. Returns '' when none is present —
 * the stack then falls back to the host's serif. The range is limited so it can
 * never shadow Tamil glyphs.
 */
export function buildLatinSerifFontFaceCss(): string {
	const family = LATIN_SERIF_FAMILIES.find(f => !!findFontFile([f.regular], 'latin'))
	if (!family) return ''
	const faces: Array<{ file?: string; weight: string; style: string }> = [
		{ file: family.regular, weight: 'normal', style: 'normal' },
		{ file: family.bold, weight: 'bold', style: 'normal' },
		{ file: family.italic, weight: 'normal', style: 'italic' },
		{ file: family.boldItalic, weight: 'bold', style: 'italic' },
	]
	const blocks: string[] = []
	for (const face of faces) {
		const file = face.file ? findFontFile([face.file], 'latin') : null
		const loaded = file ? readFontAsDataUri(file) : null
		if (!loaded) continue
		blocks.push(`@font-face {
	font-family: 'QP Serif';
	src: url(${loaded.dataUri}) format('${loaded.format}');
	font-weight: ${face.weight};
	font-style: ${face.style};
	font-display: block;
	unicode-range: ${LATIN_SERIF_RANGE};
}`)
	}
	return blocks.join('\n')
}

/**
 * The raw font file of one Tamil face, by its CSS family name — embedded into a
 * Word export so the paper opens correctly on a PC that does not have Bamini /
 * Suntommy / Noto Sans Tamil installed. Null when the file is not on disk.
 */
export function readTamilFontFile(cssName: string): Buffer | null {
	const spec = FONT_FILES.find(f => f.cssName.toLowerCase() === cssName.toLowerCase())
	if (!spec) return null
	const file = findFontFile(spec.files)
	if (!file) return null
	try {
		return fs.readFileSync(file)
	} catch {
		return null
	}
}

/** Which Tamil faces are available for logging / UI hints. */
export function listAvailableTamilFonts(): string[] {
	return FONT_FILES.filter((f) => !!findFontFile(f.files)).map((f) => f.cssName)
}