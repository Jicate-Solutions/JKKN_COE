# Latin body serif for question-paper PDFs (optional)

The question-paper PDF is rendered by headless Chromium. On Vercel that Chromium
(`@sparticuz/chromium`) ships **only Open Sans** — there is no `Times New Roman`.
So a paper printed locally on Windows (Times) and the same paper printed in
production (Open Sans) do not look identical.

Drop **one** Times-metric TTF in this folder and it is auto-embedded as `QP Serif`,
the first family in the PDF font stack — production then matches local output.

Recognised filenames (first match wins):

| File | Font |
|---|---|
| `Tinos-Regular.ttf` | Tinos — metric-compatible with Times New Roman (Apache 2.0) |
| `LiberationSerif-Regular.ttf` | Liberation Serif — also Times-metric (OFL) |
| `TimesNewRoman.ttf` / `times.ttf` | Times New Roman (licence-restricted — do not commit) |
| `NotoSerif-Regular.ttf` | Noto Serif (OFL) |

No file here is fine: Chromium falls back to the host serif. Restart the Next.js
server after adding or replacing a `.ttf`.

## Do not put Tamil fonts here

`public/fonts/tamil/` holds those. `Bamini` and `Suntommy` are legacy (TSCII)
faces whose **Latin** codepoints carry Tamil glyphs — they must never enter an
inheritable font stack, or the entire English paper prints as Tamil. They apply
only where the editor's Font / Option font dropdown sets them on a span.
