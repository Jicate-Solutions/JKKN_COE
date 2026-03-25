import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * PUT /api/post-exam/answer-sheet-packets/[id]
 * Update an existing answer sheet packet
 */
export async function PUT(
	request: NextRequest,
	{ params }: { params: { id: string } }
) {
	try {
		const supabase = getSupabaseServer()
		const { id } = params
		const body = await request.json()

		const {
			packet_status,
			total_sheets,
			sheets_evaluated,
			assigned_to,
			packet_location,
			remarks,
			is_active,
		} = body

		// Build update object dynamically
		const updateData: Record<string, any> = {}

		if (packet_status !== undefined) updateData.packet_status = packet_status
		if (total_sheets !== undefined) updateData.total_sheets = Number(total_sheets)
		if (sheets_evaluated !== undefined) updateData.sheets_evaluated = Number(sheets_evaluated)
		if (assigned_to !== undefined) updateData.assigned_to = assigned_to || null
		if (packet_location !== undefined) updateData.packet_location = packet_location || null
		if (remarks !== undefined) updateData.remarks = remarks || null
		if (is_active !== undefined) updateData.is_active = is_active

		// Update packet
		const { data, error } = await supabase
			.from('answer_sheet_packets')
			.update(updateData)
			.eq('id', id)
			.select('*')
			.single()

		if (error) {
			console.error('Error updating packet:', error)

			// Handle foreign key constraint violation (23503)
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select valid values.',
				}, { status: 400 })
			}

			// Handle check constraint violation (23514)
			if (error.code === '23514') {
				return NextResponse.json({
					error: 'Invalid value. Please check your input.',
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to update packet' }, { status: 500 })
		}

		if (!data) {
			return NextResponse.json({ error: 'Packet not found' }, { status: 404 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Error in PUT /api/post-exam/answer-sheet-packets/[id]:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * DELETE /api/post-exam/answer-sheet-packets/[id]
 * Delete an answer sheet packet
 */
export async function DELETE(
	request: NextRequest,
	{ params }: { params: { id: string } }
) {
	try {
		const supabase = getSupabaseServer()
		const { id } = params

		// Before deleting, clear packet_no from student_dummy_numbers
		const { data: packetData } = await supabase
			.from('answer_sheet_packets')
			.select('packet_no, course_id, institutions_id, examination_session_id')
			.eq('id', id)
			.single()

		if (packetData) {
			// Clear packet_no for students assigned to this packet
			await supabase
				.from('student_dummy_numbers')
				.update({ packet_no: null })
				.eq('packet_no', packetData.packet_no)
				.eq('course_id', packetData.course_id)
				.eq('institutions_id', packetData.institutions_id)
				.eq('examination_session_id', packetData.examination_session_id)
		}

		// Delete packet
		const { error } = await supabase
			.from('answer_sheet_packets')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting packet:', error)
			return NextResponse.json({ error: 'Failed to delete packet' }, { status: 500 })
		}

		return NextResponse.json({ success: true, message: 'Packet deleted successfully' })
	} catch (error) {
		console.error('Error in DELETE /api/post-exam/answer-sheet-packets/[id]:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
