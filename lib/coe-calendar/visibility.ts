/**
 * COE Calendar — audience role tags.
 *
 * Mirrors the vocabulary enforced in the database by
 * `coe_calendar_role_tags()` / `coe_calendar_valid_role_tags()`.
 * Keep the two in sync: adding a tag here also needs the SQL function updated.
 *
 * A consumer sees a calendar row when its own tags OVERLAP the row's
 * `visible_to_roles`. `ALL` is a real stored value rather than a
 * "tick everything" shortcut, so that a tag added later is automatically
 * included by every row marked ALL instead of silently excluded.
 */

export const COE_ROLE_TAGS = [
	'ALL',
	'LEARNERS',
	'TEACHING',
	'NON_TEACHING',
	'ADMINISTRATIVE',
	'MANAGEMENT',
	'ACCOUNTS',
	'COE_OFFICE',
] as const

export type CoeRoleTag = (typeof COE_ROLE_TAGS)[number]

export const COE_ROLE_TAG_CONFIG: Record<CoeRoleTag, { label: string; description: string }> = {
	ALL:            { label: 'All',            description: 'Visible to everyone' },
	LEARNERS:       { label: 'Learners',       description: 'Learner portal' },
	TEACHING:       { label: 'Teaching',       description: 'Teaching staff' },
	NON_TEACHING:   { label: 'Non-Teaching',   description: 'Non-teaching staff' },
	ADMINISTRATIVE: { label: 'Administrative', description: 'Administrative staff' },
	MANAGEMENT:     { label: 'Management',     description: 'Management / correspondent office' },
	ACCOUNTS:       { label: 'Accounts',       description: 'Accounts and finance' },
	COE_OFFICE:     { label: 'COE Office',     description: 'COE office internal only' },
}

export const DEFAULT_ROLE_TAGS: CoeRoleTag[] = ['ALL']

export function isRoleTag(value: unknown): value is CoeRoleTag {
	return typeof value === 'string' && (COE_ROLE_TAGS as readonly string[]).includes(value)
}

/**
 * Normalises arbitrary input (query string, Excel cell, JSON body) into a
 * valid tag array. Returns `null` when the input contains an unknown tag, so
 * callers can surface a precise error instead of silently dropping it —
 * a dropped tag would hide the row from an audience with no warning.
 */
export function parseRoleTags(input: unknown): CoeRoleTag[] | null {
	const raw = Array.isArray(input)
		? input
		: typeof input === 'string'
			? input.split(',')
			: null

	if (!raw) return null

	const tags = raw
		.map(t => String(t).trim().toUpperCase().replace(/[\s-]+/g, '_'))
		.filter(Boolean)

	if (tags.length === 0) return null
	if (!tags.every(isRoleTag)) return null

	const unique = Array.from(new Set(tags)) as CoeRoleTag[]

	// ALL subsumes everything else — matches the DB CHECK constraint.
	return unique.includes('ALL') ? ['ALL'] : unique
}

/**
 * Builds the tag list used to filter a request. `ALL` is appended so that a
 * row tagged `{ALL}` overlaps every caller — this collapses what would
 * otherwise be an `ALL OR overlap` branch into one indexed `.overlaps()`.
 */
export function toFilterTags(callerTags: readonly CoeRoleTag[]): CoeRoleTag[] {
	return Array.from(new Set<CoeRoleTag>([...callerTags, 'ALL']))
}

/**
 * Maps a COE application role to the audience tags it may see.
 *
 * COE staff roles see everything, since they author the calendar and must be
 * able to edit rows they have hidden from other audiences. Roles outside the
 * COE office get the narrower staff view.
 */
const COE_ROLE_TO_TAGS: Record<string, CoeRoleTag[]> = {
	super_admin:    [...COE_ROLE_TAGS],
	admin:          [...COE_ROLE_TAGS],
	coe:            [...COE_ROLE_TAGS],
	deputy_coe:     [...COE_ROLE_TAGS],
	coe_office:     [...COE_ROLE_TAGS],
	coe_office_1:   [...COE_ROLE_TAGS],
	coe_mark_entry: ['TEACHING', 'ADMINISTRATIVE'],
	nad_coordinator: ['ADMINISTRATIVE'],
}

export function tagsForCoeRoles(roles: readonly string[]): CoeRoleTag[] {
	const tags = new Set<CoeRoleTag>()
	for (const role of roles) {
		for (const tag of COE_ROLE_TO_TAGS[role] || []) tags.add(tag)
	}
	return tags.size > 0 ? Array.from(tags) : ['LEARNERS']
}
