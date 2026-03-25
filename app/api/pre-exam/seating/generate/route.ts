import { NextResponse } from 'next/server'
import { generateSeatingAllocation } from '@/lib/seating/seating-engine'
import type { SeatingStudent, RoomSuggestion, ManualRoomAssignment } from '@/types/seating-allocation'

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { students, rooms, strategy, manualAssignments } = body as {
			students: SeatingStudent[]
			rooms: RoomSuggestion[]
			strategy: 'institution-standard' | 'smart-mixing' | 'strict' | 'manual'
			manualAssignments?: ManualRoomAssignment[]
		}

		if (!students || !rooms || !strategy) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}

		const result = generateSeatingAllocation(students, rooms, strategy, manualAssignments)
		return NextResponse.json(result)
	} catch (e) {
		console.error('Seating generate API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
