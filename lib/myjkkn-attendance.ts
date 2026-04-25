const MYJKKN_API = process.env.MYJKKN_API_URL!
const MYJKKN_API_KEY = process.env.MYJKKN_API_KEY!

// Returns map of register_number → attendance_pct
export async function fetchMyJKKNAttendance(opts: {
	myjkkn_institution_ids: string[]
	from: string
	to: string
}): Promise<Map<string, number>> {
	const { myjkkn_institution_ids, from, to } = opts
	const byRegNo = new Map<string, number>()

	for (const inst of myjkkn_institution_ids) {
		let page = 1
		// Cap at 50 pages (10k learners per institution)
		for (let attempt = 0; attempt < 50; attempt++) {
			const url = `${MYJKKN_API}/attendance?institution_id=${inst}&from=${from}&to=${to}&page=${page}&per_page=200`
			const res = await fetchWithRetry(url)
			if (!res.ok) throw new Error(`MyJKKN attendance fetch failed: ${res.status}`)
			const body = await res.json()
			const rows: any[] = body.data || body || []
			if (rows.length === 0) break

			for (const row of rows) {
				const reg = (row.register_number || '').trim()
				if (!reg) continue
				let pct = row.attendance_pct
				if (pct == null && row.present_count != null && row.total_count) {
					pct = Math.round((row.present_count / row.total_count) * 10000) / 100
				}
				if (pct != null) byRegNo.set(reg, pct)
			}

			if (rows.length < 200) break
			page++
		}
	}

	return byRegNo
}

async function fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			const res = await fetch(url, {
				headers: { Authorization: `Bearer ${MYJKKN_API_KEY}` },
				signal: AbortSignal.timeout(30_000),
			})
			if (res.ok || res.status < 500) return res
		} catch {
			// retry
		}
		if (i < maxAttempts - 1) {
			await new Promise(r => setTimeout(r, Math.pow(3, i) * 1000))
		}
	}
	return fetch(url, { headers: { Authorization: `Bearer ${MYJKKN_API_KEY}` } })
}
