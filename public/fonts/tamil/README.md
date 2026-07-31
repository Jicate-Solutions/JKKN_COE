# Tamil fonts for question papers

These fonts power the TipTap Font dropdown and PDF download.

| File | Font | Encoding | Status |
|---|---|---|---|
| `NotoSansTamil-Regular.ttf` | Unicode Tamil (Noto Sans Tamil) | Unicode | Included |
| `Bamini.ttf` | Bamini | Legacy | Included |
| `Suntommy.ttf` | Suntommy | Legacy | Included |

## How to use

1. In the question editor, pick **Unicode Tamil**, **Bamini**, or **Suntommy** from the Font dropdown, then type/paste.
2. For MCQ options, use **Option font** under the options grid (same three faces).
3. Save, then download PDF — Chromium embeds these fonts automatically.

## Notes

- **Unicode Tamil**: use a Unicode Tamil keyboard (or Windows Tamil input).
- **Bamini / Suntommy**: text is stored as Latin letters; it only looks like Tamil when that font is applied. Always select the matching font before typing.
- Restart the Next.js server after replacing any `.ttf` in this folder.

## These fonts must NEVER be in an inheritable font stack

`Bamini` and `Suntommy` are legacy (TSCII) faces: their **Latin** codepoints carry
Tamil glyphs. If they appear in the `body`/editor `font-family` list, any English
character that fails to match an earlier family renders as Tamil — the whole paper
prints Tamil while the PDF text layer stays English. That is exactly what happened
in headless Chromium, which has no `Times New Roman`. They are applied only via an
explicit `font-family` on a span (the Font / Option font dropdowns).

## If a font renders as plain English letters

Chromium's sanitizer (OTS) silently rejects malformed sfnt files — `Bamini.ttf`
shipped with a bad table directory, misaligned `post`, and an over-long `cmap`
subtable length. Repair any such file in place (glyph data untouched):

```bash
node scripts/normalize-sfnt-font.js public/fonts/tamil/YourFont.ttf
```

To confirm a face loads, look for `OTS parsing error` in the browser console, or
check `document.fonts` status — a rejected face reports `error`.
