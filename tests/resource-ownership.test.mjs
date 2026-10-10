// Run with:  npm test
//
// Record-level institution isolation (lib/auth/resource-ownership.ts): which
// records does a request refer to by id? proxy.ts looks each one up and
// refuses the request when the record belongs to another institution.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordsNamedInRequest } from '../lib/auth/resource-ownership.ts'
import { OWNED_TABLES, REFERENCE_FIELDS, ROUTE_RECORDS } from '../lib/auth/resource-ownership.generated.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

const registry = {
	fields: { examination_session_id: 'examination_sessions', course_offering_id: 'course_offerings' },
	routes: [
		{ pattern: '/api/exam-rooms/*', table: 'exam_rooms', segment: 3, query: false },
		{ pattern: '/api/exam-registrations', table: 'exam_registrations', segment: null, query: true },
	],
}
const refs = (path, query = '', body) =>
	recordsNamedInRequest(path, new URLSearchParams(query), body, registry).map((r) => `${r.table}:${r.id}`)

test('the record a route is addressed by — in the path, in ?id=, or as id in the body', () => {
	assert.deepEqual(refs(`/api/exam-rooms/${A}`), [`exam_rooms:${A}`])
	assert.deepEqual(refs('/api/exam-registrations', `id=${A}`), [`exam_registrations:${A}`])
	assert.deepEqual(refs('/api/exam-registrations', '', { id: B, remarks: 'x' }), [`exam_registrations:${B}`])
})

test('a reference to another record is found in the query string', () => {
	assert.deepEqual(refs('/api/anything', `examination_session_id=${A}&program_code=BCA`), [`examination_sessions:${A}`])
})

test('references are found anywhere in a body — top level, rows, nested', () => {
	const body = {
		examination_session_id: A,
		rows: [{ course_offering_id: B, marks: 40 }, { course_offering_id: C }],
		filters: { examination_session_id: A },
	}
	assert.deepEqual(refs('/api/anything', '', body).sort(), [
		`course_offerings:${B}`,
		`course_offerings:${C}`,
		`examination_sessions:${A}`,
	])
})

test('each record is listed once however often it is named', () => {
	const body = Array.from({ length: 500 }, () => ({ examination_session_id: A }))
	assert.deepEqual(refs('/api/anything', `examination_session_id=${A}`, body), [`examination_sessions:${A}`])
})

test('values that cannot be record ids are ignored', () => {
	assert.deepEqual(refs('/api/exam-rooms/not-an-id'), [])
	assert.deepEqual(refs('/api/anything', 'examination_session_id=all&course_offering_id='), [])
	assert.deepEqual(refs('/api/anything', '', { examination_session_id: 42, course_offering_id: null }), [])
})

test('an id is only read from ?id= on a route that is addressed that way', () => {
	assert.deepEqual(refs('/api/unknown-route', `id=${A}`), [])
	assert.deepEqual(refs(`/api/exam-rooms/${A}`, `id=${B}`), [`exam_rooms:${A}`])
})

test('fields outside the registry are not treated as record ids', () => {
	assert.deepEqual(refs('/api/anything', `program_id=${A}&student_id=${B}`), [])
})

test('the generated registry only points at tables that record their institution', () => {
	assert.ok(Object.keys(OWNED_TABLES).length > 50)
	for (const [field, table] of Object.entries(REFERENCE_FIELDS)) {
		assert.ok(OWNED_TABLES[table], `${field} → ${table} has no institution column`)
	}
	assert.ok(ROUTE_RECORDS.length > 40)
	for (const route of ROUTE_RECORDS) {
		assert.ok(OWNED_TABLES[route.table], `${route.pattern} → ${route.table} has no institution column`)
		assert.ok(route.pattern.startsWith('/api/'), route.pattern)
		assert.ok(route.segment !== null || route.query, `${route.pattern} names no way to reach the record`)
		if (route.segment !== null) assert.equal(route.pattern.split('/')[route.segment], '*', route.pattern)
	}
})

test('the registry covers the records that matter most', () => {
	const fromRegistry = (path, query, body) =>
		recordsNamedInRequest(path, new URLSearchParams(query), body, { fields: REFERENCE_FIELDS, routes: ROUTE_RECORDS })
			.map((r) => r.table)
	assert.deepEqual(fromRegistry('/api/grading/final-marks', `id=${A}`), ['final_marks'])
	assert.deepEqual(fromRegistry('/api/exam-management/exam-registrations', '', { id: A }), ['exam_registrations'])
	assert.ok(fromRegistry('/api/x', `examination_session_id=${A}`).includes('examination_sessions'))
	assert.ok(fromRegistry('/api/x', '', { rows: [{ course_offering_id: B }] }).includes('course_offerings'))
})
