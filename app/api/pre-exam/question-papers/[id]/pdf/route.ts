import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// GET - render a printable question paper PDF in the CIA sample layout
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params

		const { data: paper, error } = await supabase
			.from('ia_question_papers')
			.select('*, ia_paper_questions(*)')
			.eq('id', id)
			.single()
		if (error || !paper) {
			return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
		}

		const [{ data: institution }, { data: parts }] = await Promise.all([
			supabase.from('institutions').select('name, city, pin_code').eq('id', paper.institutions_id).single(),
			paper.template_id
				? supabase
						.from('ia_template_parts')
						.select('*')
						.eq('template_id', paper.template_id)
						.order('display_order', { ascending: true })
				: Promise.resolve({ data: [] as any[] }),
		])

		const questions = (paper.ia_paper_questions || []).sort(
			(a: any, b: any) => a.display_order - b.display_order
		)
		const partList = (parts || []).slice().sort((a: any, b: any) => a.display_order - b.display_order)

		const doc = new jsPDF({ unit: 'pt', format: 'a4' })
		const pageW = doc.internal.pageSize.getWidth()
		const center = (text: string, y: number, size = 11, bold = true) => {
			doc.setFont('times', bold ? 'bold' : 'normal')
			doc.setFontSize(size)
			doc.text(text, pageW / 2, y, { align: 'center' })
		}

		let y = 40
		center((institution?.name || 'Institution').toUpperCase(), y, 12)
		y += 15
		center(`${institution?.city || ''}${institution?.pin_code ? ' – ' + institution.pin_code : ''}`, y, 10, false)
		y += 15
		center('DEGREE EXAMINATIONS', y, 10)
		y += 14
		const roundName = paper.cia_round_name || `Continuous Internal Assessment - ${paper.cia_round || 1}`
		center(`(${roundName})`, y, 10)
		y += 20

		// Meta box (subject code/title, time, max marks)
		doc.setFont('times', 'normal')
		doc.setFontSize(10)
		doc.text(`Subject Code: ${paper.course_code || ''}`, 40, y)
		doc.text(`Set: ${paper.set_label || 'A'}`, pageW - 120, y)
		y += 14
		doc.text(`Subject Title: ${paper.subject_title || ''}`, 40, y)
		y += 14
		const dur = paper.duration_minutes ? `${paper.duration_minutes} min` : '1 Hour'
		doc.text(`Time: ${dur}`, 40, y)
		doc.text(`Maximum: ${Number(paper.max_marks) || 0} Marks`, pageW - 160, y)
		y += 6

		// Group questions by part
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

		for (const [label, qs] of grouped) {
			const part: any = partByLabel.get(label)
			const marksEach = part?.marks_per_question ?? qs[0]?.marks ?? 0
			const count = part?.num_questions ?? qs.filter((q: any) => !q.is_choice_alternative).length
			const total = Number(marksEach) * Number(count)
			const heading = `PART ${label} – (${count} x ${marksEach} = ${total})`

			const rows: any[] = []
			// group heading row spanning content, with CO / K headers
			for (const q of qs) {
				const prefix = q.sub_label
					? `${q.question_number} ${q.sub_label})`
					: `${q.question_number}.`
				let text = `${prefix} ${q.question_text || ''}`
				const opts = optionLine(q.options)
				if (opts) text += `\n     ${opts}`
				if (q.is_choice_alternative) text = `(OR)\n${text}`
				rows.push([text, q.co_code || '', q.k_level || ''])
			}

			autoTable(doc, {
				startY: y + 8,
				head: [[{ content: `${heading}${part?.instruction ? '\n' + part.instruction : ''}`, styles: { halign: 'left' } }, 'CO', 'K level']],
				body: rows,
				theme: 'grid',
				styles: { font: 'times', fontSize: 9, cellPadding: 4, valign: 'top' },
				headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
				columnStyles: { 0: { cellWidth: pageW - 80 - 90 }, 1: { cellWidth: 45, halign: 'center' }, 2: { cellWidth: 45, halign: 'center' } },
				margin: { left: 40, right: 40 },
			})
			y = (doc as any).lastAutoTable.finalY + 6
		}

		const buffer = Buffer.from(doc.output('arraybuffer'))
		const filename = `QP_${paper.course_code || 'paper'}_CIA${paper.cia_round || 1}${paper.set_label ? '_' + paper.set_label : ''}.pdf`
		return new NextResponse(buffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `inline; filename="${filename}"`,
			},
		})
	} catch (error) {
		console.error('Error in GET paper PDF:', error)
		return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
	}
}
