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

function fontsDir(): string {
	return path.join(process.cwd(), 'public', 'fonts', 'tamil')
}

function findFontFile(candidates: string[]): string | null {
	const dir = fontsDir()
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

/** Which Tamil faces are available for logging / UI hints. */
export function listAvailableTamilFonts(): string[] {
	return FONT_FILES.filter((f) => !!findFontFile(f.files)).map((f) => f.cssName)
}