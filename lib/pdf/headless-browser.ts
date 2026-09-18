// Headless Chromium for the PDF renderers — one launcher for all of them.
//
// On Vercel the browser is @sparticuz/chromium: executablePath() unpacks the
// binary into /tmp the first time it is called. Fluid compute runs several
// requests in ONE function instance, so two PDFs asked for at the same moment
// (a claim form opened while a ZIP is being built, say) both called
// executablePath(): one was still writing the binary while the other tried to
// spawn it, and the spawn failed with ETXTBSY ("text file busy"). The unpack
// is therefore done once per instance and shared, and a spawn that still hits
// ETXTBSY (a different instance mid-write on the same /tmp) is retried.
//
// On a dev box it is full puppeteer with its own Chrome.

export interface HeadlessLaunchOptions {
	defaultViewport?: { width: number; height: number }
}

let executablePathPromise: Promise<string> | null = null

async function serverlessExecutablePath(): Promise<string> {
	if (!executablePathPromise) {
		executablePathPromise = (async () => {
			const chromium = (await import('@sparticuz/chromium')).default
			return chromium.executablePath()
		})().catch(err => {
			// Let the next caller try the unpack again rather than caching a failure.
			executablePathPromise = null
			throw err
		})
	}
	return executablePathPromise
}

const isTextFileBusy = (err: unknown) => /ETXTBSY/i.test(String((err as any)?.message || err))

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Launch headless Chromium; the returned browser must be closed by the caller. */
export async function launchHeadlessBrowser(opts: HeadlessLaunchOptions = {}): Promise<any> {
	const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME

	if (!isServerless) {
		const puppeteer = (await import('puppeteer')).default
		return puppeteer.launch({
			args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
			headless: true,
			...(opts.defaultViewport ? { defaultViewport: opts.defaultViewport } : {}),
		})
	}

	const chromium = (await import('@sparticuz/chromium')).default
	const puppeteerCore = (await import('puppeteer-core')).default
	const executablePath = await serverlessExecutablePath()

	let lastError: unknown
	for (let attempt = 1; attempt <= 4; attempt++) {
		try {
			return await puppeteerCore.launch({
				args: chromium.args,
				defaultViewport: opts.defaultViewport || { width: 1240, height: 1754 },
				executablePath,
				headless: true,
			})
		} catch (err) {
			lastError = err
			if (!isTextFileBusy(err)) throw err
			// The binary is still being written by a concurrent unpack; give it a moment.
			await sleep(300 * attempt)
		}
	}
	throw lastError
}
