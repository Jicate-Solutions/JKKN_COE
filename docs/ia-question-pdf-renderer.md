# IA Question Paper — Faithful HTML→PDF Renderer

**App:** COE (JKKN_COE)
**File:** `lib/ia/build-paper-pdf-html.ts`
**Replaces:** the jsPDF renderer `lib/ia/build-paper-pdf.ts` (kept as a hardened fallback)
**Status:** Built, typecheck-clean. Ships on the next COE deploy.

This documents the COE half — turning a question paper (whose `question_text` is now rich HTML with math + tables) into a faithful A4 PDF. The MyJKKN authoring editor is documented in `MyJKKN/docs/ia-question-math-table-editor.md`.

---

## 1. Why it changed

`question_text` is now **sanitized HTML** — inline math as `<span data-latex="…">`, tables as `<table>`, plus bold/italic/sub/sup. The old renderer drew it with **jsPDF**, which prints strings verbatim — so HTML landed on the page as literal `<p>…</p>` / `<sup>…</sup>` tags, and jsPDF cannot typeset math or nested tables at all.

The new renderer prints through **headless Chromium** (same pattern as `lib/pdf/central-valuation-appointment-letter.ts`), so the browser parses and renders the HTML — real superscripts, real formulas, real table grids.

---

## 2. Architecture

```
buildPaperPdfHtml(supabase, id, origin)
  1. fetch paper + institution + ia_template_parts        (same queries as jsPDF version)
  2. per question:  question_text HTML
        → DOMPurify.sanitize (allowlist)
        → expand each <span data-latex="…"> to KaTeX MathML
  3. assemble one A4 HTML document (letterhead + parts + question tables)
  4. launch Chromium (isVercel ? puppeteer-core+@sparticuz/chromium : puppeteer)
  5. page.setContent(html) → one-page fit (scale down if overflow) → page.pdf({A4})
  6. return { buffer, filename }
```

Same signature/return as the jsPDF `buildPaperPdf`, so the routes swap cleanly.

---

## 3. Key design decisions

### 3.1 KaTeX **MathML** output (not KaTeX HTML)
```ts
katex.renderToString(latex, { output: 'mathml', throwOnError: false, strict: false })
```
KaTeX's default HTML output positions glyphs with ~20 bundled `.woff2` **font files** referenced by CSS `url()`. In a Vercel/Lambda function, `fs`-reading those from `node_modules` throws `ENOENT` — Next.js output-file-tracing usually misses them. **MathML** output emits a native `<math>` element that modern Chromium (`@sparticuz/chromium` v143 = MathML Core) renders with **zero external assets**. Same LaTeX → same content; robust on first deploy. (Trade-off: subtle glyph styling differs from the editor's KaTeX-HTML — acceptable for an exam paper.)

### 3.2 Reuse the proven Chromium launch
The `isVercel` branch, `chromium.executablePath()`, and args are copied verbatim from `central-valuation-appointment-letter.ts` — that file already paid the cost of making Chromium boot on Vercel. Don't re-derive it from the puppeteer docs.

### 3.2a ⚠️ REQUIRED: register the route in `outputFileTracingIncludes`
`@sparticuz/chromium` is in `serverExternalPackages`, and its binary is loaded at **runtime** via `chromium.executablePath()` — so Vercel's file tracer can't see it as a dependency and won't ship it. **Every route that renders a PDF via Chromium must be listed in `next.config.ts` → `outputFileTracingIncludes`**, or it deploys **without the Chromium binary** and fails at runtime ("unable to download"). This worked in local dev (full `puppeteer` with a bundled Chromium) but broke on Vercel until the routes were added:

```ts
outputFileTracingIncludes: {
  '/api/v1/ia/question-papers/**':      ['./node_modules/@sparticuz/chromium/**/*'],
  '/api/pre-exam/question-papers/**':   ['./node_modules/@sparticuz/chromium/**/*'],
}
```

### 3.2b No jsdom in the hot path
Sanitization uses a small dependency-free allowlist (`sanitizeHtml`), NOT `isomorphic-dompurify` — DOMPurify pulls in `jsdom`, which is fragile under Vercel output-file-tracing. The one-page-fit `page.evaluate` is wrapped in try/catch so a layout hiccup can never abort the render.

### 3.3 One-page fit via CSS scale
The jsPDF version auto-shrank the font to fit one page. Here, after `setContent`, `page.evaluate` measures `#sheet.scrollHeight` vs the A4 printable height (297 − 16 mm) and applies `transform: scale(…)` (min 0.5) if it overflows — the CSS analogue of the font auto-shrink.

### 3.4 Sanitize on read
User-authored HTML is sanitized with an allowlist before rendering:
- **tags:** `p br strong b em i u s sub sup ul ol li span table thead tbody tr td th`
- **attrs:** `data-latex class colspan rowspan`
- `style` and `<colgroup>/<col>` are stripped (layout hints + mild XSS surface); tables still render as bordered grids via the renderer's own CSS.

Entities in `data-latex` (Tiptap escapes `& < > "`) are decoded before KaTeX.

---

## 4. Routes

Both PDF routes now call `buildPaperPdfHtml` and declare the Node runtime (Chromium needs it) + a longer timeout for cold starts:

| Route | Purpose |
|---|---|
| `app/api/v1/ia/question-papers/[id]/pdf/route.ts` | External API — **the one MyJKKN proxies** |
| `app/api/pre-exam/question-papers/[id]/pdf/route.ts` | Internal COE app |

```ts
export const runtime = 'nodejs'
export const maxDuration = 60
```

---

## 5. Legacy jsPDF renderer — hardened fallback

`lib/ia/build-paper-pdf.ts` is no longer wired to the routes but is kept as a safety net. It was hardened with `stripHtmlToText()` so that **if** it is ever hit, it flattens HTML to clean text (`<p>`→line, `<br>`→break, entities decoded) and degrades inline math to its LaTeX source — never printing raw tags. Defense-in-depth for the format transition.

---

## 6. Tamil fonts (Unicode / Bamini / Suntommy)

Fonts live in `public/fonts/tamil/`. PDF embeds whatever is present as base64 `@font-face`
(see `lib/ia/tamil-fonts.ts`). The TipTap editor has a Font dropdown with the same family names.

| File | Family | Encoding |
|---|---|---|
| `NotoSansTamil-Regular.ttf` | Noto Sans Tamil | Unicode (shipped) |
| `Bamini.ttf` | Bamini | Legacy — drop-in |
| `Suntommy.ttf` | Suntommy | Legacy — drop-in |

- **Unicode**: type with a Unicode Tamil keyboard; Noto covers Tamil codepoints via `unicode-range`.
- **Bamini / Suntommy**: text is Latin codepoints; select that font in the editor so PDF applies the same face.
- Sanitizer keeps allowlisted `font-family` on spans so the PDF matches the editor.

---

## 7. Verification

- Scoped typecheck: `tsconfig` extending the base with `include: [build-paper-pdf.ts, build-paper-pdf-html.ts]`, run `tsc -p` (whole-repo `tsc` OOMs). Both files clean.
- Pipeline proof: sanitize + `data-latex`→MathML was run in Node against real samples — `<p>…<sup>…` stays as real tags (Chromium renders them), the authored table sanitizes to a bordered grid, `\frac{…}` expands to MathML. No raw tags survive.
- End-to-end: generate a PDF for a paper containing a formula + a table → both render faithfully, no `<p>` tags.

---

## 8. Related docs

- MyJKKN editor: `MyJKKN/docs/ia-question-math-table-editor.md`
- COE editor port spec: `docs/ia-question-math-table-editor-spec.md`
