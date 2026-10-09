// Renders the bulk exam-registration page in a headless browser with stubbed API
// responses and reads back what the Learners panel lists per regulation.
const fs = require('fs')
const path = require('path')

const OUT_DIR = process.argv[2] || '.'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const SEM_ID = '11111111-1111-4111-8111-111111111111'

const learner = (n, regulation, reg, year) => ({
	id: `learner-${n}`,
	stu_register_no: reg,
	student_name: `LEARNER ${n}`,
	regulation_code: regulation,
	admission_year: year,
})
// 5 recorded R-2025, 2 with no regulation (2025 batch), 3 recorded R-2021
const COHORT = [
	learner(1, 'R-2025', '731325105001', 2025), learner(2, 'R-2025', '731325105002', 2025),
	learner(3, 'R-2025', '731325105003', 2025), learner(4, 'R-2025', '731325105004', 2025),
	learner(5, 'R-2025', '731325105301', 2026), learner(6, '', '731325105006', 2025),
	learner(7, '', '731325105007', 2025), learner(8, 'R-2021', '731324105008', 2024),
	learner(9, 'R-2021', '731324105009', 2024), learner(10, 'R-2021', '731324105010', 2024),
]

const institution = { id: 'inst-1', institution_code: 'CET', institution_name: 'JKKN CET', name: 'JKKN CET', is_active: true, myjkkn_institution_ids: ['myjkkn-inst-1'] }
const session = { id: 'session-1', session_code: 'NOV-DEC-2026', session_name: 'NOV-DEC-2026', institutions_id: 'inst-1' }

function initScript(data) {
	localStorage.setItem('user_data', JSON.stringify({
		id: 'user-1', email: 'tester@example.com', full_name: 'Tester', role: 'super_admin', is_super_admin: true,
		coe_roles: ['super_admin'], coe_user_id: 'user-1', has_coe_access: true,
		institution_id: data.institution.id, institution_name: data.institution.institution_name,
	}))
	localStorage.setItem('selected_institution', JSON.stringify(data.institution))
	localStorage.setItem('selected_examination_session', JSON.stringify(data.session))

	const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
	const realFetch = window.fetch.bind(window)
	window.__calls = []
	window.fetch = (input, init) => {
		const url = typeof input === 'string' ? input : input.url
		if (!url.includes('/api/')) return realFetch(input, init)
		window.__calls.push(url)
		const u = new URL(url, location.origin)
		const type = u.searchParams.get('type')
		if (u.pathname === '/api/master/institutions') return Promise.resolve(json([data.institution]))
		if (u.pathname === '/api/exam-management/examination-sessions') return Promise.resolve(json([data.session]))
		if (u.pathname === '/api/course-management/course-mapping') return Promise.resolve(json([{ program_code: 'EEE' }]))
		if (u.pathname === '/api/master/programs-cache') return Promise.resolve(json([{ program_code: 'EEE', program_name: 'B.E. Electrical and Electronics Engineering', program_order: 1 }]))
		if (u.pathname === '/api/course-management/course-offering/lookups') {
			if (type === 'regulations') return Promise.resolve(json(['R-2021', 'R-2025']))
			if (type === 'semesters') return Promise.resolve(json([{ semester_id: data.semId, semester_code: 'EEE-3' }]))
		}
		if (u.pathname === '/api/exam-management/exam-registrations/bulk-create/lookups') {
			if (type === 'courses') return Promise.resolve(json([{ course_offering_id: 'co-1', course_mapping_id: 'cm-1', course_code: 'MA3303', course_name: 'PROBABILITY AND COMPLEX FUNCTIONS', semester: 3, semester_code: 'EEE-3' }]))
			return Promise.resolve(json([]))
		}
		if (u.pathname === '/api/exam-management/exam-registrations/bulk-create/eligible-learners') {
			return Promise.resolve(json({ data: data.cohort, count: data.cohort.length, source: 'myjkkn' }))
		}
		return Promise.resolve(json([]))
	}
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function pickCombobox(page, label, optionText) {
	await page.evaluate((label) => {
		const field = [...document.querySelectorAll('label')].find(l => l.textContent.trim().startsWith(label))
		field.parentElement.querySelector('button[role="combobox"]').click()
	}, label)
	await sleep(500)
	const clicked = await page.evaluate((optionText) => {
		const items = [...document.querySelectorAll('[cmdk-item], [role="option"]')]
		const item = items.find(i => i.textContent.trim().startsWith(optionText))
		if (!item) return items.map(i => i.textContent.trim())
		item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
		item.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
		item.click()
		return true
	}, optionText)
	if (clicked !== true) throw new Error(`option "${optionText}" not found for ${label}; saw ${JSON.stringify(clicked)}`)
	await sleep(700)
}

async function pickSemester(page, optionText) {
	const trigger = await page.evaluateHandle(() => {
		const field = [...document.querySelectorAll('label')].find(l => l.textContent.trim().startsWith('Semester'))
		return field.parentElement.querySelector('button[role="combobox"]')
	})
	await trigger.asElement().click()
	await sleep(500)
	const option = await page.evaluateHandle((optionText) =>
		[...document.querySelectorAll('[role="option"]')].find(o => o.textContent.trim() === optionText), optionText)
	if (!option.asElement()) throw new Error(`semester option "${optionText}" not found`)
	await option.asElement().click()
	await sleep(1200)
}

async function readLearners(page) {
	return page.evaluate(() => {
		const heading = [...document.querySelectorAll('h3')].find(h => h.textContent.trim() === 'Learners')
		const card = heading.closest('.flex.flex-col')
		return {
			header: [...heading.parentElement.querySelectorAll('p')].map(p => p.textContent.trim()),
			rows: [...card.querySelectorAll('label .font-mono')].map(s => s.textContent.trim()),
			empty: [...card.querySelectorAll('.text-center p')].map(p => p.textContent.trim()),
		}
	})
}

;(async () => {
	let puppeteer, launchOptions = { headless: 'new', defaultViewport: { width: 1400, height: 900 } }
	try {
		puppeteer = require('puppeteer')
		if (!fs.existsSync(puppeteer.executablePath())) throw new Error('no bundled browser')
	} catch {
		puppeteer = require('puppeteer-core')
		launchOptions.executablePath = EDGE
	}
	const browser = await puppeteer.launch(launchOptions)
	try {
		const page = await browser.newPage()
		const errors = []
		page.on('pageerror', e => errors.push(String(e)))
		await page.setCookie(
			{ name: 'access_token', value: 'local-browser-check', url: 'http://localhost:3000' },
			{ name: 'coe_access', value: 'true', url: 'http://localhost:3000' },
		)
		await page.evaluateOnNewDocument(initScript, { institution, session, cohort: COHORT, semId: SEM_ID })
		await page.goto('http://localhost:3000/exam-management/exam-registrations/bulk-create', { waitUntil: 'domcontentloaded', timeout: 120000 })
		await page.waitForFunction(() => [...document.querySelectorAll('h2')].some(h => h.textContent.includes('Bulk Exam Registration')), { timeout: 120000 })
		await sleep(2500)
		console.log('landed on', page.url())

		for (const regulation of ['R-2025', 'R-2021']) {
			if (regulation === 'R-2025') await pickCombobox(page, 'Program', 'EEE')
			await pickCombobox(page, 'Regulation', regulation)
			await pickSemester(page, 'Semester III')
			console.log(`\n${regulation} + Semester III:`)
			console.log(JSON.stringify(await readLearners(page), null, 1))
			await page.screenshot({ path: path.join(OUT_DIR, `bulkreg-${regulation}.png`) })
		}
		console.log('\npage errors:', errors.length ? errors : 'none')
	} finally {
		await browser.close()
	}
})().catch(e => { console.error('BROWSER CHECK FAILED:', e); process.exit(1) })
