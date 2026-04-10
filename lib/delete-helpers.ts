import { getSupabaseServer } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

interface Dependency {
	table: string
	column: string
	count: number
}

interface DependencyResult {
	has_dependencies: boolean
	total_count: number
	dependencies: Dependency[]
}

/**
 * Check if a record has dependencies in other tables before deleting.
 * Uses the check_record_dependencies() PostgreSQL function.
 *
 * @param tableName - The Supabase table name (e.g., 'courses', 'board')
 * @param recordId - The UUID of the record to check
 * @returns DependencyResult with has_dependencies flag and details
 */
export async function checkDependencies(
	tableName: string,
	recordId: string
): Promise<DependencyResult> {
	const supabase = getSupabaseServer()

	const { data, error } = await supabase.rpc('check_record_dependencies', {
		p_table_name: tableName,
		p_record_id: recordId,
	})

	if (error) {
		console.error(`Error checking dependencies for ${tableName}:`, error)
		return { has_dependencies: false, total_count: 0, dependencies: [] }
	}

	return data as DependencyResult
}

/**
 * Format dependency info into a human-readable warning message.
 */
export function formatDependencyWarning(deps: DependencyResult): string {
	if (!deps.has_dependencies) return ''

	const lines = deps.dependencies.map(
		(d) => `${d.table} (${d.count} records)`
	)
	return `This record is referenced by: ${lines.join(', ')}. Total: ${deps.total_count} related records will be deleted.`
}

/**
 * Standard delete handler with dependency checking.
 * Handles the common pattern: check deps → if ?force=true, delete anyway → else return warning.
 *
 * Usage in API routes:
 *   return handleDeleteWithDependencyCheck('board', id, request)
 *
 * Client-side flow:
 *   1. DELETE /api/entity?id=xxx → returns { has_dependencies, dependencies, warning }
 *   2. User confirms → DELETE /api/entity?id=xxx&force=true → actually deletes
 */
export async function handleDeleteWithDependencyCheck(
	tableName: string,
	recordId: string,
	request: Request
): Promise<NextResponse> {
	const { searchParams } = new URL(request.url)
	const force = searchParams.get('force') === 'true'

	const supabase = getSupabaseServer()

	// Check dependencies first
	const deps = await checkDependencies(tableName, recordId)

	// If has dependencies and not forcing, return warning
	if (deps.has_dependencies && !force) {
		return NextResponse.json(
			{
				has_dependencies: true,
				total_count: deps.total_count,
				dependencies: deps.dependencies,
				warning: formatDependencyWarning(deps),
			},
			{ status: 409 }
		)
	}

	// Proceed with delete (CASCADE will handle child records)
	const { error } = await supabase.from(tableName).delete().eq('id', recordId)

	if (error) {
		console.error(`Error deleting from ${tableName}:`, error)
		return NextResponse.json(
			{ error: `Failed to delete ${tableName} record` },
			{ status: 500 }
		)
	}

	return NextResponse.json({
		success: true,
		cascaded: deps.has_dependencies ? deps.dependencies : [],
	})
}
