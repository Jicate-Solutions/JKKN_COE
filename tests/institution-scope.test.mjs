// Run with:  npm test
//
// Institution isolation (lib/auth/institution-scope.ts): a user who is not a
// super admin may only work on their own institution — whether the request
// names an institution or leaves it out.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	NO_INSTITUTION_CODE,
	NO_INSTITUTION_ID,
	findOutOfScope,
	institutionParamValue,
	institutionsInBody,
	institutionsInQuery,
	resolveInstitutionScope,
} from '../lib/auth/institution-scope.ts'

const CAS = {
	id: 'aaaaaaaa-0000-0000-0000-000000000001',
	institution_code: 'CAS',
	counselling_code: 'CAS01',
	// Two MyJKKN institutions (aided + self-financing) map to one COE institution.
	myjkkn_institution_ids: ['11111111-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000b'],
}
const CET = {
	id: 'aaaaaaaa-0000-0000-0000-000000000002',
	institution_code: 'CET',
	counselling_code: 'CET01',
	myjkkn_institution_ids: ['22222222-0000-0000-0000-00000000000a'],
}
const INSTITUTIONS = [CAS, CET]

const staff = (overrides = {}) => ({
	isSuperAdmin: false,
	roles: ['coe'],
	institutionId: null,
	parentProfile: { institutionId: CAS.myjkkn_institution_ids[0], isSuperAdmin: false },
	...overrides,
})

const scopeOf = (session) => resolveInstitutionScope(session, INSTITUTIONS)
const blocked = (session, named) => findOutOfScope(named, scopeOf(session))
const query = (text) => institutionsInQuery(new URLSearchParams(text))

test('a CAS user cannot reach CET by changing the institution in the URL', () => {
	for (const text of [
		`institutions_id=${CET.id}`,
		'institution_code=CET',
		`institutionId=${CET.id}`,
		`institution_id=${CET.myjkkn_institution_ids[0]}`,
		`institution_code=CAS&institutions_id=${CET.id}`,
		`institution_ids=${CAS.id},${CET.id}`,
	]) {
		assert.ok(blocked(staff(), query(text)), `should block ?${text}`)
	}
})

test('every way of naming their own institution is accepted', () => {
	for (const text of [
		`institutions_id=${CAS.id}`,
		'institution_code=CAS',
		'institution_code=cas',
		`institution_id=${CAS.myjkkn_institution_ids[1]}`,
		`myjkkn_institution_ids=${CAS.myjkkn_institution_ids.join(',')}`,
		`institution_code=CAS&institutions_id=${CAS.id}`,
	]) {
		assert.equal(blocked(staff(), query(text)), null, `?${text}`)
	}
})

test('"not chosen" placeholders and unrelated fields are ignored', () => {
	assert.deepEqual(
		query('institutions_id=&institution_code=all&institutionId=undefined&institution_name=Other+College&program_code=BCA'),
		[]
	)
})

test('a write naming another institution is caught wherever it sits in the body', () => {
	const bodies = [
		{ institutions_id: CET.id, course_code: 'X' },
		[{ institutions_id: CAS.id }, { institutions_id: CET.id }],
		{ rows: [{ institution_code: 'CAS' }, { institution_code: 'CET' }] },
		{ filters: { institution_code: 'CET' }, data: [] },
		{ institutions_code: 'CET' },
	]
	for (const body of bodies) {
		assert.ok(blocked(staff(), institutionsInBody(body)), JSON.stringify(body).slice(0, 60))
	}
	assert.equal(
		blocked(staff(), institutionsInBody({ rows: [{ institutions_id: CAS.id, institution_code: 'CAS' }] })),
		null
	)
})

test('the institution on the COE user row counts as well as the MyJKKN one', () => {
	const session = staff({ institutionId: CET.id })
	assert.equal(blocked(session, query('institution_code=CET')), null)
	assert.equal(blocked(session, query('institution_code=CAS')), null)
})

test('super admins are unrestricted — COE flag, COE role, or MyJKKN super admin', () => {
	const cet = query(`institutions_id=${CET.id}`)
	assert.equal(blocked(staff({ isSuperAdmin: true }), cet), null)
	assert.equal(blocked(staff({ roles: ['super_admin'] }), cet), null)
	assert.equal(
		blocked(staff({ parentProfile: { institutionId: CAS.myjkkn_institution_ids[0], isSuperAdmin: true } }), cet),
		null
	)
})

test('a session without the MyJKKN record is still scoped, by the COE user row', () => {
	const session = staff({ parentProfile: null, institutionId: CAS.id })
	assert.equal(scopeOf(session).kind, 'limited')
	assert.ok(blocked(session, query(`institutions_id=${CET.id}`)))
	assert.equal(blocked(session, query(`institutions_id=${CAS.id}`)), null)
})

test('a user linked to no institution may not name any', () => {
	for (const session of [
		staff({ parentProfile: null, institutionId: null }),
		staff({ parentProfile: { institutionId: 'not-a-known-institution', isSuperAdmin: false } }),
	]) {
		assert.equal(scopeOf(session).kind, 'none')
		assert.ok(blocked(session, query(`institutions_id=${CAS.id}`)))
		assert.equal(blocked(session, []), null, 'a request naming nothing is not refused here')
	}
})

test('a request that names no institution defaults to the caller\'s own', () => {
	const scope = scopeOf(staff())
	assert.equal(institutionParamValue(null, 'institutions_id', scope), CAS.id)
	assert.equal(institutionParamValue(null, 'institution_code', scope), 'CAS')
	assert.equal(institutionParamValue('', 'institutions_id', scope), CAS.id)
	assert.equal(institutionParamValue('all', 'institution_code', scope), 'CAS')
})

test('a value the request does name is passed through untouched', () => {
	const scope = scopeOf(staff())
	assert.equal(institutionParamValue(CAS.id, 'institutions_id', scope), CAS.id)
	assert.equal(institutionParamValue('cas', 'institution_code', scope), 'cas')
})

test('a super admin who names no institution still gets all of them', () => {
	const scope = scopeOf(staff({ roles: ['super_admin'] }))
	assert.equal(institutionParamValue(null, 'institutions_id', scope), null)
	assert.equal(institutionParamValue('', 'institution_code', scope), '')
})

test('a user linked to no institution defaults to a value that matches nothing', () => {
	const scope = scopeOf(staff({ parentProfile: null, institutionId: null }))
	assert.equal(institutionParamValue(null, 'institutions_id', scope), NO_INSTITUTION_ID)
	assert.equal(institutionParamValue(null, 'institution_code', scope), NO_INSTITUTION_CODE)
	assert.match(NO_INSTITUTION_ID, /^[0-9a-f-]{36}$/, 'must be a valid uuid or uuid columns reject the filter')
})

test('with both a MyJKKN and a COE institution, the default is the MyJKKN one the browser uses', () => {
	const scope = scopeOf(staff({ institutionId: CET.id }))
	assert.equal(institutionParamValue(null, 'institution_code', scope), 'CAS')
})
