# Latin body serif for question-paper PDFs

The question-paper PDF is rendered by headless Chromium. On Vercel that Chromium
(`@sparticuz/chromium`) ships **only Open Sans** — there is no `Times New Roman`.
Without a font in this folder a paper printed in production comes out sans-serif,
while the same paper printed locally on Windows is in Times.

The family in this folder is embedded as `QP Serif`, the first family in the PDF
font stack, so every machine prints the same Times-metric paper.

## What is here

**Liberation Serif 2.1.5** — regular, bold, italic and bold-italic. It is
metric-compatible with Times New Roman (same widths, same line breaks) and is
licensed under the SIL Open Font License; see `LiberationSerif-LICENSE.txt`.
The files are unmodified — the licence reserves the font name, so do not subset
or edit them under the same name.

## Recognised families (first whose regular face is present wins)

| Regular | Bold / Italic / Bold-italic | Font |
|---|---|---|
| `Tinos-Regular.ttf` | `Tinos-Bold.ttf`, `Tinos-Italic.ttf`, `Tinos-BoldItalic.ttf` | Tinos — Times-metric (Apache 2.0) |
| `LiberationSerif-Regular.ttf` | `LiberationSerif-Bold.ttf`, `-Italic.ttf`, `-BoldItalic.ttf` | Liberation Serif — Times-metric (OFL) |
| `TimesNewRoman.ttf` | — | Times New Roman (licence-restricted — do not commit) |
| `times.ttf` | `timesbd.ttf`, `timesi.ttf`, `timesbi.ttf` | Times New Roman (licence-restricted — do not commit) |
| `NotoSerif-Regular.ttf` | `NotoSerif-Bold.ttf`, `-Italic.ttf`, `-BoldItalic.ttf` | Noto Serif (OFL) |

The bold and italic faces are optional, but without them Chromium fakes bold by
smearing the regular face — and headings, question numbers and the CO / K-Level
columns are all bold. Restart the Next.js server after adding or replacing a file.

The Word export does not use these files: it names `Times New Roman`, which every
PC with Word already has.

## Do not put Tamil fonts here

`public/fonts/tamil/` holds those. `Bamini` and `Suntommy` are legacy (TSCII)
faces whose **Latin** codepoints carry Tamil glyphs — they must never enter an
inheritable font stack, or the entire English paper prints as Tamil. They apply
only where the editor's Font / Option font dropdown sets them on a span.
