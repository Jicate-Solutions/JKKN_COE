/**
 * Record-level institution isolation: which records does a request refer to
 * by id? (Whether the caller may touch them is decided in
 * institution-scope-request.ts, which looks each one up.)
 *
 * A request reaches a record three ways:
 *   • the route itself       /api/exam-rooms/<id>
 *   • an `id` parameter      ?id=<id>, or `id` in a JSON body
 *   • a reference field      ?examination_session_id=<id>, or the same field
 *                            anywhere in a JSON body
 * The registry of which table each of those refers to is generated from the
 * schema and the handlers (scripts/generate-resource-ownership.cjs).
 */

/** Table → the column that names the institution owning each row. */
export type OwnedTables = Readonly<Record<string, 'institutions_id' | 'institution_id' | 'institution_code'>>

/** Request field → the table whose `id` it holds. */
export type ReferenceFields = Readonly<Record<string, string>>

export interface RouteRecord {
	/** Route path with '*' for dynamic segments. */
	pattern: string
	table: string
	/** Index of the path segment holding the record id, or null. */
	segment: number | null
	/** The handler also reads the record id from `?id=` (and from `id` in a body). */
	query: boolean
}

export interface ResourceRegistry {
	fields: ReferenceFields
	routes: readonly RouteRecord[]
}

export interface RecordRef {
	table: string
	id: string
	/** Where it was named, for the log line. */
	source: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BODY_NODES = 50_000

function matchRoute(pathname: string, routes: readonly RouteRecord[]): { route: RouteRecord; segments: string[] } | null {
	const segments = pathname.replace(/\/+$/, '').split('/')
	for (const route of routes) {
		const want = route.pattern.split('/')
		if (want.length !== segments.length) continue
		if (want.every((segment, i) => segment === '*' || segment === segments[i])) return { route, segments }
	}
	return null
}

/**
 * Every record a request refers to by id. Values that are not UUIDs are
 * ignored — they cannot be primary keys of the tables in the registry.
 */
export function recordsNamedInRequest(
	pathname: string,
	searchParams: URLSearchParams,
	body: unknown,
	registry: ResourceRegistry
): RecordRef[] {
	const seen = new Set<string>()
	const refs: RecordRef[] = []
	const add = (table: string, value: unknown, source: string) => {
		if (typeof value !== 'string') return
		for (const part of value.split(',')) {
			const id = part.trim().toLowerCase()
			if (!UUID.test(id) || seen.has(`${table}:${id}`)) continue
			seen.add(`${table}:${id}`)
			refs.push({ table, id, source })
		}
	}

	// The record the route itself addresses
	const matched = matchRoute(pathname, registry.routes)
	if (matched) {
		const { route, segments } = matched
		if (route.segment !== null) add(route.table, segments[route.segment], 'path')
		if (route.query) {
			add(route.table, searchParams.get('id'), '?id')
			if (body && typeof body === 'object' && !Array.isArray(body)) {
				add(route.table, (body as Record<string, unknown>).id, 'body.id')
			}
		}
	}

	// Reference fields in the query string
	for (const [key, value] of searchParams) {
		const table = registry.fields[key]
		if (table) add(table, value, `?${key}`)
	}

	// Reference fields anywhere in the body (objects and arrays of rows, nested)
	const stack: unknown[] = [body]
	let visited = 0
	while (stack.length > 0 && visited < MAX_BODY_NODES) {
		const node = stack.pop()
		visited++
		if (Array.isArray(node)) {
			for (const item of node) if (item && typeof item === 'object') stack.push(item)
		} else if (node && typeof node === 'object') {
			for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
				const table = registry.fields[key]
				if (table) {
					if (Array.isArray(value)) value.forEach((v) => add(table, v, `body.${key}`))
					else add(table, value, `body.${key}`)
				} else if (value && typeof value === 'object') stack.push(value)
			}
		}
	}

	return refs
}
