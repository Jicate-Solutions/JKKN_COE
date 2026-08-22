// Conversions between the editor's stored HTML and plain text.
//
// MCQ options keep BOTH shapes: `text_html` is what the author typed (bold,
// sub/superscript, equations) and `text` is a plain mirror so anything reading
// options as strings — exports, legacy papers, search — still works.

/** Escape plain text into HTML so a legacy option like "x < 5" loads verbatim. */
export function plainTextToHtml(text: string): string {
	const t = (text || '').trim()
	if (!t) return ''
	return `<p>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
}

/** Flatten editor HTML to plain text: math falls back to its LaTeX source. */
export function richTextToPlain(html: string): string {
	if (!html) return ''
	return html
		// A formula prints as its LaTeX in the plain mirror — better than dropping it.
		.replace(/<span[^>]*\bdata-latex="([^"]*)"[^>]*>[\s\S]*?<\/span>/g, ' $1 ')
		.replace(/<\/(p|div|li|tr|h[1-6])>/gi, ' ')
		.replace(/<br\s*\/?>/gi, ' ')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim()
}

/** What the option editor should load: rich content when present, else the legacy text. */
export function optionEditorValue(option: { text?: string | null; text_html?: string | null }): string {
	if (option?.text_html) return option.text_html
	return plainTextToHtml(option?.text || '')
}
