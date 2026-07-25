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
