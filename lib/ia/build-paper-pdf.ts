// Shared A5 question-paper PDF builder (hall-ticket-style letterhead, auto-fit to 1 page).
// Used by the internal route and the /api/v1 route so output stays identical.

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

function formatDuration(mins?: number | null): string {
	if (!mins || mins <= 0) return '1 Hour'
	const h = mins / 60
	if (Number.isInteger(h)) return `${h} Hour${h > 1 ? 's' : ''}`
	const whole = Math.floor(h)
	if (Math.abs(h - whole - 0.5) < 0.001) {
		const label = whole === 0 ? '½' : `${whole}½`
		return `${label} Hour${whole >= 1 ? 's' : ''}`
	}
	return `${h.toFixed(1)} Hours`
}

async function fetchImageAsDataUrl(url?: string | null): Promise<{ data: string; format: string } | null> {
	if (!url) return null
	try {
		const res = await fetch(url)
		if (!res.ok) return null
		const ct = res.headers.get('content-type') || ''
		const format = /png/i.test(ct) ? 'PNG' : /jpe?g/i.test(ct) ? 'JPEG' : url.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG'
		const buf = Buffer.from(await res.arrayBuffer())
		return { data: `data:${ct || 'image/png'};base64,${buf.toString('base64')}`, format }
	} catch {
		return null
	}
}

export interface BuildPaperPdfResult {
	buffer: Buffer
	filename: string
}

/**
 * Build the A5 PDF for a single question paper.
 * @param supabase service-role client
 * @param id       ia_question_papers.id
 * @param origin   request origin, used to resolve relative logo URLs
 * @returns null if the paper is not found
 */
export async function buildPaperPdf(
	supabase: any,
	id: string,
	origin: string
): Promise<BuildPaperPdfResult | null> {
	const absUrl = (u?: string | null) =>
		!u ? u : /^https?:\/\//i.test(u) ? u : `${origin}${u.startsWith('/') ? '' : '/'}${u}`

	const { data: paper, error } = await supabase
		.from('ia_question_papers')
		.select('*, ia_paper_questions(*)')
		.eq('id', id)
		.single()
	if (error || !paper) return null

	const [instRes, { data: session }, { data: parts }] = await Promise.all([
		supabase.from('institutions').select('*').eq('id', paper.institutions_id).single(),
		supabase
			.from('examination_sessions')
			.select('session_name, session_code')
			.eq('id', paper.examination_session_id)
			.single(),
		paper.template_id
			? supabase
					.from('ia_template_parts')
					.select('*')
					.eq('template_id', paper.template_id)
					.order('display_order', { ascending: true })
			: Promise.resolve({ data: [] as any[] }),
	])

	const institution: any = instRes.data
	if (instRes.error || !institution) {
		console.error('[QP PDF] institution lookup failed for', paper.institutions_id, instRes.error)
	}

	const { data: pdfSettings } = await supabase
		.from('pdf_institution_settings')
		.select('*')
		.eq('institution_code', institution?.institution_code || '')
		.eq('active', true)
		.order('wef_date', { ascending: false })
		.limit(1)
		.maybeSingle()

	const accreditation =
		pdfSettings?.accreditation_text ||
		institution?.accredited_by ||
		'(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)'
	const address =
		pdfSettings?.address ||
		[institution?.address_line1, institution?.address_line2, institution?.city, institution?.state]
			.filter(Boolean)
			.join(', ') ||
		''
	const [logo, secondLogo] = await Promise.all([
		fetchImageAsDataUrl(absUrl(pdfSettings?.logo_url || institution?.logo_url)),
		fetchImageAsDataUrl(absUrl(pdfSettings?.secondary_logo_url)),
	])

	const questions = (paper.ia_paper_questions || []).sort(
		(a: any, b: any) => a.display_order - b.display_order
	)
	const partList = (parts || []).slice().sort((a: any, b: any) => a.display_order - b.display_order)

	const partByLabel = new Map(partList.map((p: any) => [p.part_label, p]))
	const grouped = new Map<string, any[]>()
	for (const q of questions) {
		const key = q.part_label || '—'
		if (!grouped.has(key)) grouped.set(key, [])
		grouped.get(key)!.push(q)
	}
	const optionLine = (opts: any) => {
		if (!Array.isArray(opts) || opts.length === 0) return ''
		return opts.map((o: any) => `${o.key}) ${o.text || '____'}`).join('    ')
	}
	const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][paper.cia_round || 1] || String(paper.cia_round || 1)
	const sess = session?.session_name ? ` - ${session.session_name.toUpperCase()}` : ''

	const buildDoc = (qFont: number) => {
		const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })
		const pageW = doc.internal.pageSize.getWidth()
		const margin = 8
		const centerFit = (t: string, yy: number, size: number, bold = true, maxW?: number) => {
			doc.setFont('times', bold ? 'bold' : 'normal')
			const limit = maxW ?? pageW - margin * 2
			let s = size
			doc.setFontSize(s)
			while (doc.getTextWidth(t) > limit && s > 4.5) {
				s -= 0.5
				doc.setFontSize(s)
			}
			doc.text(t, pageW / 2, yy, { align: 'center' })
		}

		let y = margin
		const logoSize = 12
		const textMaxW = pageW - 2 * (margin + logoSize + 3)
		if (logo) {
			try { doc.addImage(logo.data, logo.format, margin, y, logoSize, logoSize) } catch { /* ignore */ }
		}
		if (secondLogo) {
			try { doc.addImage(secondLogo.data, secondLogo.format, pageW - margin - logoSize, y, logoSize, logoSize) } catch { /* ignore */ }
		}
		centerFit((institution?.name || 'Institution').toUpperCase(), y + 4, 12, true, textMaxW)
		centerFit(String(accreditation).replace(/\n/g, ' '), y + 8, 7, false, textMaxW)
		y += 11
		if (address) centerFit(address, y, 9, true, textMaxW)
		y += 5
		centerFit('DEGREE EXAMINATIONS', y, 12)
		y += 5
		centerFit(`Continuous Internal Assessment- ${roman}${sess}`, y, 11)
		y += 6

		doc.setFont('times', 'normal')
		doc.setFontSize(8)
		doc.text(`Subject Code: ${paper.course_code || ''}`, margin, y)
		doc.text(`Set: ${paper.set_label || 'A'}`, pageW - margin, y, { align: 'right' })
		y += 4
		doc.setFont('times', 'bold')
		doc.text(`Subject Title: ${paper.subject_title || ''}`, margin, y)
		y += 4
		doc.setFont('times', 'normal')
		doc.text(`Time: ${formatDuration(paper.duration_minutes)}`, margin, y)
		doc.text(`Maximum: ${Number(paper.max_marks) || 0} Marks`, pageW - margin, y, { align: 'right' })
		y += 2

		const contentW = pageW - margin * 2 - 24
		for (const [label, qs] of grouped) {
			const part: any = partByLabel.get(label)
			const marksEach = part?.marks_per_question ?? qs[0]?.marks ?? 0
			const count = part?.num_questions ?? qs.filter((q: any) => !q.is_choice_alternative).length
			const total = Number(marksEach) * Number(count)
			const heading = `PART ${label} – (${count} x ${marksEach} = ${total})`

			const rows: any[] = []
			for (const q of qs) {
				if (q.is_choice_alternative) {
					rows.push([{ content: '(OR)', colSpan: 3, styles: { halign: 'center', fontStyle: 'bold' } }])
				}
				const prefix = q.sub_label ? `${q.question_number} ${q.sub_label})` : `${q.question_number}.`
				let text = `${prefix} ${q.question_text || ''}`
				const opts = optionLine(q.options)
				if (opts) text += `\n     ${opts}`
				rows.push([text, q.co_code || '', q.k_level || ''])
			}

			autoTable(doc, {
				startY: y + 3,
				head: [[
					{ content: `${heading}${part?.instruction ? '\n' + part.instruction : ''}`, styles: { halign: 'center' } },
					'CO',
					'K',
				]],
				body: rows,
				theme: 'plain',
				styles: { font: 'times', fontSize: qFont, cellPadding: qFont >= 8 ? 2 : 1.4, valign: 'top' },
				headStyles: { fontStyle: 'bold', fontSize: qFont + 1, halign: 'center', textColor: 20 },
				columnStyles: {
					0: { cellWidth: contentW },
					1: { cellWidth: 12, halign: 'center' },
					2: { cellWidth: 12, halign: 'center' },
				},
				margin: { left: margin, right: margin },
			})
			y = (doc as any).lastAutoTable.finalY + 2
		}
		return doc
	}

	let qFont = 9
	let doc = buildDoc(qFont)
	while (doc.getNumberOfPages() > 1 && qFont > 5) {
		qFont -= 0.5
		doc = buildDoc(qFont)
	}

	const buffer = Buffer.from(doc.output('arraybuffer'))
	const filename = `QP_${paper.course_code || 'paper'}_CIA${paper.cia_round || 1}${paper.set_label ? '_' + paper.set_label : ''}.pdf`
	return { buffer, filename }
}
