# Vercel Chromium / Puppeteer Fix Guide

How we resolved Vercel-specific Chromium issues in JKKN COE — apply the same four pieces to any other Next.js app that generates PDFs via Puppeteer on Vercel.

---

## TL;DR

Vercel serverless functions don't ship Chromium and have a 250 MB unzipped size limit. The fix is:

1. Use `@sparticuz/chromium` + `puppeteer-core` in production, regular `puppeteer` only locally.
2. Tell Next.js to externalize Chromium and trace the binary into the function bundle.
3. Branch at runtime: Vercel uses the Lambda Chromium; local uses bundled Puppeteer.
4. Give the function enough memory and time.

---

## 1. Install the right packages

```bash
npm install @sparticuz/chromium puppeteer-core
npm install -D puppeteer
```

| Package | Where | Purpose |
|---------|-------|---------|
| `@sparticuz/chromium` | dependencies | Lambda-compatible Chromium binary |
| `puppeteer-core` | dependencies | Lean driver, no bundled browser |
| `puppeteer` | devDependencies | Local dev only — ships full Chromium download |

**Version pinning matters.** `@sparticuz/chromium` major version must match `puppeteer-core`'s API. COE uses:

```json
"@sparticuz/chromium": "^143.0.4",
"puppeteer-core": "^24.40.0",
"puppeteer": "^24.40.0"
```

---

## 2. Configure `next.config.ts`

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ['@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/your-pdf-route/*': ['./node_modules/@sparticuz/chromium/**/*'],
  },
}

export default nextConfig
```

Why both keys matter:

- **`serverExternalPackages`** — stops Next from trying to bundle the native Chromium binary into the serverless function (would break it).
- **`outputFileTracingIncludes`** — forces Vercel to copy the Chromium binary files into the function output. Without this you get `ENOENT: chromium` at runtime.

Update the route glob to match every API path that generates PDFs. You can list multiple:

```ts
outputFileTracingIncludes: {
  '/api/pre-exam/practical-email/*': ['./node_modules/@sparticuz/chromium/**/*'],
  '/api/post-exam/marksheet/*': ['./node_modules/@sparticuz/chromium/**/*'],
},
```

---

## 3. Dual-mode launch in the PDF generator

Pattern used in `lib/pdf/central-valuation-appointment-letter.ts`:

```ts
import puppeteerCore from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

export async function generatePdf(html: string): Promise<Buffer> {
  const isVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME

  let browser
  if (isVercel) {
    const executablePath = await chromium.executablePath()
    browser = await puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: { width: 1920, height: 1080 },
      executablePath,
      headless: true,
    })
  } else {
    // Local dev — dynamic import keeps `puppeteer` out of the serverless bundle
    const puppeteer = (await import('puppeteer')).default
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: true,
    })
  }

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12.7mm', bottom: '12.7mm', left: '6.35mm', right: '6.35mm' },
    })
    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}
```

### Rules to never break

- **Detect Vercel via `process.env.VERCEL`** (Vercel sets this automatically). Fall back to `AWS_LAMBDA_FUNCTION_NAME` for other Lambda hosts.
- **Use `await import('puppeteer')` dynamically** — never a top-level `import puppeteer from 'puppeteer'`. A top-level import causes Vercel to try bundling the full ~300 MB puppeteer download, which breaks the 250 MB function size limit.
- **Always `try / finally` around `browser.close()`** — orphaned browsers eat Lambda memory and cause cold-start failures on the next invocation.

---

## 4. Vercel function settings

In **Vercel project → Settings → Functions**, or via `vercel.json`:

| Setting | Recommended | Why |
|---------|-------------|-----|
| Memory | 1024 MB minimum (3008 MB for large PDFs) | Chromium is memory-hungry |
| Max duration | 60s (Pro plan) | Cold-start alone is 2–4s |
| Region | Match your Supabase / DB region | Cuts data fetch latency |

`vercel.json` example:

```json
{
  "functions": {
    "app/api/your-pdf-route/route.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
```

---

## Quick checklist when porting to another app

- [ ] `@sparticuz/chromium` + `puppeteer-core` in `dependencies`
- [ ] `puppeteer` in `devDependencies` only
- [ ] `next.config.ts` has both `serverExternalPackages` and `outputFileTracingIncludes` glob pointing at the PDF route(s)
- [ ] PDF generator uses `isVercel` branch
- [ ] Local branch uses `await import('puppeteer')` (dynamic, never top-level)
- [ ] `try / finally` wraps `browser.close()`
- [ ] Function memory >= 1024 MB on Vercel
- [ ] No top-level `import puppeteer from 'puppeteer'` anywhere on the serverless path

---

## Common failure -> fix

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Could not find Chromium` / `ENOENT` | Missing `outputFileTracingIncludes` for that route | Add the route glob to `next.config.ts` |
| `Function exceeded max size 250 MB` | Top-level `import puppeteer from 'puppeteer'` | Move to `await import('puppeteer')` inside the local branch |
| Timeout on first call | Cold-start exceeds function duration | Bump memory and/or `maxDuration` |
| `Protocol error: Target closed` | Browser closed before `page.pdf()` finished | Wrap PDF logic in `try`, close in `finally` |
| Works locally, fails on Vercel | Local uses `puppeteer`, prod tries to as well | Verify `isVercel` branch resolves correctly via `process.env.VERCEL` |
| Out-of-memory on large PDFs | Default 1024 MB too small | Raise to 3008 MB |

---

## Reference files in COE

- [next.config.ts](../next.config.ts) — `serverExternalPackages` + `outputFileTracingIncludes`
- [lib/pdf/central-valuation-appointment-letter.ts](../lib/pdf/central-valuation-appointment-letter.ts#L386-L417) — canonical dual-mode launch + `try/finally`
- [lib/pdf/practical-appointment-letter.ts](../lib/pdf/practical-appointment-letter.ts#L500-L518) — same pattern, second reference
