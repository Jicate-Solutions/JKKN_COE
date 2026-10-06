# Spec — Question Paper Entry Methods (COE parity) for the MyJKKN application

**Audience:** MyJKKN developers building or upgrading the question-paper authoring screen
(`app/(routes)/academic/question-papers`). **Reference implementation:** the COE examiner
portal and CoE authoring page, as of 5 Oct 2026. **Scope:** how a question is *entered* —
the text box, Tamil fonts, equations entered the way Word does it, pasted LaTeX, attached
figures (question, sub-division, answer key), split questions — and the UI around them.

Out of scope here: templates, the approval workflow, and the PDF / Word renderers. One rule
from the renderers does apply throughout: **what MyJKKN stores must be exactly the shape COE
stores**, because COE's renderers print MyJKKN's papers (§2).

---

## 0. Decisions taken (5 Oct 2026)

Settled with the product owner; the rest of this document is written to them.

| # | Question | Decision |
|---|---|---|
| 1 | Where MyJKKN stores figures | **Private Google Drive**, the same folder and account COE uses, with the registry row and a MyJKKN proxy (§6.5). The public bucket stops receiving new figures. |
| 2 | Editor base | **Upgrade MyJKKN to TipTap v3 and copy COE's files verbatim** (editor, maths node, equation dialog, maths field, catalog). No piecemeal port of a v2 editor. |
| 3 | Saving model | **Explicit Save stays.** Drafts save without checks; the Submit transition runs the full validation with anchored messages. No autosave, no local mirror (§9). |
| 4 | Answer keys | **Later phase.** The fields stay in the stored shape so COE can print them; MyJKKN builds no answer-key UI now. |
| 5 | Tamil fonts | **Ship all three** faces — Noto Sans Tamil, Bamini, Suntommy (§5.3). |
| 6 | Equation editor | **The full Word-style editor**: Symbols row, Structure galleries, click-and-type field, LaTeX source toggle, print check (§4). |
| 7 | Code sharing | **Copy files per app.** No shared package; §10 carries the file list and the diff checklist for later syncs. |
| 8 | Build order | **Equations + LaTeX paste → Tamil fonts → figure storage + paste-anywhere → split polish → (later) answer keys.** |

### Build order, as phases

| Phase | Delivers | Depends on |
|---|---|---|
| 1 | TipTap v3 upgrade; COE editor, maths node, Word-style equation dialog with MathLive, catalog; LaTeX paste (§3, §4) | `mathlive`, `@tiptap/* ^3` |
| 2 | Tamil font files + `@font-face` + unicode-range; canonical names; the two font controls checked against them (§5) | — |
| 3 | Private Drive upload + registry row + MyJKKN file proxy; Ctrl+V anywhere in the card with per-sub-division scope (§6) | COE migration adding `'myjkkn'` to the registry's uploader check |
| 4 | Split polish: `allow_split` from the template part, "Split into (i)/(ii)" seeding two halves, footer sum in red (§7) | — |
| 5 (later) | Answer key + answer-key figure per question / sub-division, same editor and image field | Phases 1 and 3 |

---

## 1. Where MyJKKN stands against COE today

| Capability | MyJKKN today | COE today (target) |
|---|---|---|
| Rich text (bold / italic / underline, sub / superscript, tables) | TipTap v2, same toolbar | TipTap v3, same toolbar — no change in behaviour |
| Equation editing | Chip palette + live preview + LaTeX textarea | **Word-style editor**: Symbols row (8 sets), Structures row (11 galleries), a click-and-type equation field (MathLive), Tab between boxes, LaTeX kept behind a toggle |
| Pasting LaTeX into the question text | Lands as raw text | **Becomes a live formula** (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`, or a bare expression) |
| Tamil | Paper-level default font + per-option font; no font files shipped | Same two controls, plus the three faces **shipped and embedded** (Noto Sans Tamil, Bamini, Suntommy) with the unicode-range rule, so the screen matches print on any PC |
| Figure on a question / sub-division | Field exists: click, drop, width 40/60/85, dpi readout; public Supabase bucket | Same field, plus **Ctrl+V anywhere in the question card** (nearest sub-division wins); stored in **private Google Drive** behind an authenticated proxy (decision 1) |
| Split questions | Exists: i. / ii. …, max 10, marks must sum, CO/K per sub-division, per-sub figure | Same, plus per-part `allow_split` switch and "Split into (i)/(ii)" seeding two halves. COE also keys answers per sub-division — later phase for MyJKKN (decision 4) |
| Saving and validation | Explicit Save; Submit transition validates | **Kept as is** (decision 3). Add: every Submit problem anchored to its field and scrolled to, with the sub-division marks sum shown live |

Everything below describes the target. Where MyJKKN already matches, it says so.

---

## 2. The storage contract (unchanged — do not break)

A question is one JSON object inside `questions[]` of the paper row. The fields the entry
methods write:

```jsonc
{
  "id": "q-uuid", "question_number": 7, "sub_label": "a", "part_label": "B",
  "is_choice_alternative": false, "marks": 16,
  "co_code": "CO4", "k_level": "K2",                       // null once the question is split
  "question_text": "<p>Find the divided difference table …</p><table>…</table>",
  "options": [{ "key": "a", "text": "plain mirror", "text_html": "<p>rich</p>" }],
  "option_font": null,                                      // "Bamini" | "Suntommy" | "Noto Sans Tamil" | null
  "correct_option": null,
  "image": { "url": "…", "width_pct": 60, "px_w": 1200, "px_h": 640, "bytes": 84211 },
  "sub_questions": [
    { "id": "s1", "label": "i", "question_text": "<p>…</p>", "marks": 8, "co_code": "CO4", "k_level": "K3",
      "image": null, "answer_key": null, "answer_key_image": null, "display_order": 1 }
  ],
  "answer_key": null, "answer_key_image": null,                 // kept in the shape; no MyJKKN UI yet (decision 4)
  "display_order": 7
}
```

Paper-level: `default_font` (same three values or null).

### 2.1 Question HTML — the allowlist

`question_text`, `options[].text_html`, `sub_questions[].question_text` and the answer keys
are HTML restricted to:

- tags: `p br strong b em i u s sub sup ul ol li span table thead tbody tr td th`
- attributes: `data-latex`, `class`, `colspan`, `rowspan`, and `style` carrying only
  `text-align` and an allowlisted `font-family`
- **a formula is** `<span data-latex="\frac{1}{1+x^{2}}" class="qp-math">…</span>` — store the
  LaTeX source only, **never** KaTeX's rendered HTML or MathML
- **a Tamil span is** `<span style="font-family:'Bamini'">…</span>` — only the three canonical
  names survive (§5.3)
- an empty editor is stored as `""`, not `<p></p>`

Anything else is stripped by COE's sanitizer before print, so a MyJKKN editor that emits
more will *look* fine on screen and print differently.

### 2.2 Figure reference

`image` / `sub_questions[].image` / `answer_key_image` is `IaQuestionImage`:
`{ url, path?, drive_file_id?, drive_url?, width_pct, px_w, px_h, bytes }`. The URL must be
`https://…` or COE's proxy path `/api/examiner/question-paper/file/<id>`; the renderer drops
anything else. Existing public-bucket figures stay valid as `https` URLs; new figures follow
§6.5 (Drive): `url` is the COE proxy path and `drive_file_id` is what both apps resolve from.

---

## 3. Entry method A — the question text box

COE: `components/ia/question-rich-editor.tsx` (TipTap v3). One component, two variants:

- **`full`** — question stem and answer keys. Toolbar, left to right:
  `B  I  U  x₂  x²  │  Σ Equation  │  ⊞ Insert 2×2 table  ⊟ Add row  ⫼ Add column  ⊟ Delete row  ⫼ Delete column  🗑 Delete table`
  (the five table buttons are enabled only while the caret is inside a table).
- **`compact`** — MCQ options and sub-division text: same marks and the Equation button,
  no table tools, single-line height (`min-h 34px`).

Behaviour to reproduce:

1. Extensions: StarterKit (includes Underline — do not add it twice), Subscript, Superscript,
   TextStyle + FontFamily (loaded so old font marks still render; **no font button on the
   toolbar**), Table (not resizable), the maths node (§4.4), Placeholder.
2. Toolbar buttons use `onMouseDown={e => e.preventDefault()}` so clicking never steals the
   selection, and are defined at module level (an inner component remounted every button
   of every editor on each keystroke).
3. `onChange` emits `editor.getHTML()`, normalised to `""` for `<p></p>` / `<p><br></p>`.
4. External value changes (server reload, rebuild) are pushed in with `setContent(…, {
   emitUpdate: false })` so they do not echo back as edits.
5. **Paste from Word keeps** paragraphs, bold/italic/underline, sub/superscript, lists and
   real tables. It **loses** Equation Editor 3.0 / MathType objects and pictures (Word puts
   only a local file path on the clipboard). The remedy is §4 (type or paste LaTeX) or §6
   (paste a screenshot). Put that sentence in the help text.
6. Placeholders: `Type the question…`; when split, the stem reads `Common stem (optional)…`;
   a sub-division reads `Type this sub-division…`; an option reads `Option a *`.
7. The editor body carries class `qp-rich-editor-body` whose `font-family` is
   `var(--qp-editor-font, …UI stack…, 'Noto Sans Tamil', sans-serif)`; the wrapper sets
   `--qp-editor-font` from the paper default (§5.2). Never list Bamini / Suntommy in that
   fallback stack.

---

## 4. Entry method B — equations, entered the way Word does it

### 4.1 The dialog

COE: `components/ia/equation-editor-dialog.tsx` + `components/ia/math-field.tsx` +
`lib/ia/math-catalog.ts`. It is laid out like Word's Equation Tools because that is what every
examiner already knows:

```
┌ Equation ──────────────────────────────────────────────────────────────────────┐
│ Pick a structure or a symbol, then click a box and type into it. Tab moves on.  │
│                                                                                 │
│ SYMBOLS                                              [ Basic Math        ▾ ]    │
│  ±  ∞  =  ≠  ~  ×  ÷  !  ∝  <  ≪  >  ≫  ≤  ≥  ∓  ≅  ≈  ≡  ∀  ∁  ∂  √  ∛  ∜  ∪  ∩ │
│  ∅  %  °  ℉  ℃  ∆  ∇  ∃  ∄  ∈  ∋  ←  ↑  →  ↓  ↔  ∴  +  −  ¬  α  β  γ  δ  ε  … │
│                                                                                 │
│ STRUCTURES                                                                      │
│  [Fraction▾] [Script▾] [Radical▾] [Integral▾] [Large Operator▾] [Bracket▾]      │
│  [Function▾] [Accent▾] [Limit and Log▾] [Operator▾] [Matrix▾]                   │
│                                                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────────┐ │
│ │                      ∫₀⁶  ▢ / (1 + x²)  dx            ← click a box, type   │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│  2 empty boxes — click a box and type, or press Tab for the next one   [‹] [›]  │
│  [⌫ Clear]  [</> LaTeX source]                                                  │
│                                                                                 │
│  A box left empty prints as a small square.      [Cancel]  [Insert equation ↵]  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- **Symbols** — one scrolling two-row grid, switched by the set picker between Word's eight
  sets: Basic Math, Greek Letters, Letter-Like Symbols, Operators, Arrows, Negated
  Relations, Scripts, Geometry. Clicking a symbol inserts it at the caret.
- **Structures** — eleven buttons, each opening a gallery popover of template shapes drawn
  with KaTeX, grouped exactly as Word groups them (e.g. *Integral → Integrals, Contour
  Integrals, Differentials, Common Integrals*; *Matrix → Empty Matrices, Dots, Identity
  Matrices, Matrices with Brackets*). Each template carries empty boxes.
- **The equation field** is MathLive's `<math-field>`: the author clicks an empty box and
  types into it, moves with the arrow keys, and can click into any part of a finished
  formula and change it in place. Typing `/` builds a fraction, `^` and `_` scripts,
  brackets auto-close (`smartFence`). A raw `\command` can be typed too.
- **Keys**: `Tab` / `Shift+Tab` next / previous empty box (the `‹ ›` buttons do the same
  with the mouse) · `Enter` inserts the equation (not while a `\command` is being completed)
  · `Ctrl+Enter` adds a matrix row · `Esc` cancels. The keyboard never has to leave the
  equation.
- **Status line** under the field: "*N empty boxes — click a box and type, or press Tab for
  the next one*", or "*Enter inserts the equation. In a matrix, Ctrl + Enter adds a row.*"
- **Clear** empties the field. **LaTeX source** toggles a textarea for the few who type or
  paste LaTeX; pasted `$$…$$`, `\[…\]`, `\(…\)` or `$…$` wrappers are stripped on insert.
- **Print check**: every change is run through KaTeX (the engine that prints the paper) with
  `throwOnError: true`. If it fails, a warning shows the message and **Insert is disabled**.
- Opening the dialog with the caret on an existing formula pre-fills it; the button then
  reads **Update equation**. The toolbar button is a single Σ Equation button for both.

### 4.2 The placeholder convention

The empty box is `\square` in stored LaTeX and `\placeholder{}` inside MathLive. The field
component converts on the way in and out (`toFieldLatex` / `fromFieldLatex`) so nothing else
in the app knows MathLive exists. The value handed out is MathLive's **fully expanded**
LaTeX, so its private macros (`\differentialD`, `\exponentialE`…) never reach KaTeX or the
printed paper. A box left empty prints as a small square — intentional, visible, fixable.

### 4.3 MathLive setup (copy as-is)

- `mathlive ^0.111` (COE), imported **inside an effect** — it touches `window` at import.
- `fontsDirectory = null` (it draws with the KaTeX_* faces the page already serves through
  `katex.min.css`, so nothing new is needed in `font-src`); `soundsDirectory = null`;
  `mathVirtualKeyboardPolicy = 'manual'`; `menuItems = []`; `smartFence = true`.
- Placeholder colour `#2563eb` so empty boxes read as "type here".
- CSP: COE allows `font-src 'self' https://fonts.gstatic.com data:` and `media-src 'self'`;
  with the two directories nulled MathLive needs nothing more.

### 4.4 The maths node in the text box

`components/ia/math-node.ts`: an inline atom node, `parseHTML` on `span[data-latex]`,
`renderHTML` writes `<span data-latex class="qp-math">LATEX</span>`, and a NodeView renders it
live with KaTeX (`throwOnError: false`). Commands `insertMath(latex)` / `updateMath(latex)`.
Clicking the rendered formula and pressing Σ opens the dialog on it.

### 4.5 Pasting LaTeX straight into the text box (new)

`lib/ia/latex-paste.ts` + a ProseMirror `handlePaste` on the maths node. Plain text pasted
into the question is split into text and formula segments:

| Pasted | Result |
|---|---|
| `Evaluate $\int_0^6 \frac{1}{1+x^2}\,dx$ using Trapezoidal rule.` | words + one inline formula + words |
| `$$A = \begin{bmatrix} 1 & 1 \\ 1 & 1 \end{bmatrix}$$`, `\[…\]`, `\(…\)` | one formula |
| `A = \begin{bmatrix} 1 & 1 \\ 1 & 1 \end{bmatrix}` (bare, one line, has a `\command` or `^{`/`_{`) | one formula |
| several lines, each `$…$` | one paragraph per line |
| `Fees are $5 and $10 per head` | **unchanged** — `$…$` must not start/end with a space or be followed by a digit |
| text with no LaTeX | normal paste |

This is how MathType's *Copy as LaTeX*, Overleaf and chat tools hand formulas over, and it
is the shortest route for the Equation Editor 3.0 objects a Word paste drops.

---

## 5. Entry method C — Tamil

### 5.1 Three faces, two keyboards

| Face | Encoding | Typed with |
|---|---|---|
| Noto Sans Tamil (`unicode`, label "Unicode Tamil") | Unicode `U+0B80–0BFF` | any Unicode Tamil keyboard; needs no font choice at all |
| Bamini | TSCII — Latin codepoints carry Tamil glyphs | the Bamini keyboard layout; **must** be selected as the font or it reads as English letters |
| Suntommy | TSCII | the Suntommy layout; same rule |

Canonical names come from `lib/ia/tamil-font-meta.ts` (`TAMIL_FONT_FAMILIES`,
`canonicalizeFontFamily`). The latter maps whatever the editor emits (`"Bamini", sans-serif`,
`nirmala ui`, `unicode tamil`…) to one of the three or `null`; anything else is dropped by the
sanitizer.

### 5.2 Where the author chooses it — two controls only

1. **Paper header → "Default Language"** select: `Default (English)`, `Unicode Tamil`,
   `Bamini`, `Suntommy` → `paper.default_font`. Help text: *Applies to every question &
   option in this paper · Save to keep.* The authoring page sets `--qp-editor-font` on the
   wrapper, so every editor shows it live.
2. **Per MCQ question → "Option font"** select (same values) → `question.option_font`, cascaded
   into that question's option editors only (`defaultFontFamily={q.option_font ||
   paper.default_font}`).

There is deliberately **no font button in the toolbar**: a paper is in one language. Inline
`font-family` spans still render if an older paper carries them. MyJKKN already has both
controls; keep them.

### 5.3 Ship the fonts (the gap)

- Put the files under `public/fonts/tamil/`: `NotoSansTamil-Regular.ttf`, `Bamini.ttf`,
  `Suntommy.ttf` (copy COE's — its Bamini was repaired; the original is rejected by
  Chromium's font sanitizer and silently falls back to Latin letters).
- `globals.css`:
  ```css
  @font-face { font-family: 'Noto Sans Tamil'; src: url('/fonts/tamil/NotoSansTamil-Regular.ttf') format('truetype'); unicode-range: U+0B80-0BFF, U+200C-200D; }
  @font-face { font-family: 'Bamini';   src: url('/fonts/tamil/Bamini.ttf')   format('truetype'); }
  @font-face { font-family: 'Suntommy'; src: url('/fonts/tamil/Suntommy.ttf') format('truetype'); }
  ```
  The `unicode-range` on Noto is what lets English stay in the UI font inside a Tamil
  paper. **Never** put Bamini or Suntommy in any fallback stack — every English character
  would render as Tamil.
- Without shipped fonts a faculty PC that lacks Bamini shows the stem as English garbage
  while the printed paper (which embeds the fonts) is correct — the author cannot trust the
  screen.

---

## 6. Entry method D — figures (question, sub-division, answer key)

One image per question and per sub-division (and, in the later answer-key phase, per
answer key); it prints **centred under that text** at the chosen share of the text column.
COE: `components/ia/question-image-field.tsx` + `lib/ia/question-image.ts`. MyJKKN already has
both; the deltas are §6.2 (paste anywhere in the card) and §6.5 (storage).

### 6.1 The field

```
Empty:    ┌ 🖼 Add image  — click, drop, or paste a screenshot (Ctrl+V) ───────────────┐
          └──────────────────────────────────────────────────────────────────────────┘
With one: ┌──────────────────────────────────────────────────────────────────────────┐
          │ [ thumbnail ]   Width [ Medium (60%) ▾ ]  1200 × 640 · 82 KB · ≈203 dpi at this width │
          │                 [Replace]  [🗑 Remove]                                   │
          └──────────────────────────────────────────────────────────────────────────┘
```

- Label variants: `Add image`, `Add image to (i)` (and `Add image to the answer` in the later
  answer-key phase).
- Width: `Small (40%)`, `Medium (60%)` (default), `Large (85%)` of the ~190 mm column.
- Readout: stored pixels · bytes · **effective print dpi** at that width; below **150 dpi**
  the dpi turns amber and a line appears: *⚠ may print soft — use a larger source image or a
  smaller width*.
- `Replace` opens the file picker; `Remove` deletes the stored object too (no orphans).
- Disabled while the paper is not editable (status gating is server-side as well).

### 6.2 Three ways in

1. **Click** the strip → file picker (`image/png, image/jpeg, image/webp, image/gif`).
2. **Drop** a file on the strip (the zone highlights only while a drag is over it).
3. **Paste a screenshot — anywhere in the question card.** Print Screen and the snipping
   tools put the bitmap on the clipboard, never on disk; without this the author has to
   save a file just to hand it back. Implementation (copy it exactly):
   - a native `paste` listener on the card element marked `data-qp-image-scope`, attached
     once, reading live props through a ref;
   - the **nearest scope to the paste target wins**: each sub-division is its own scope, so
     Ctrl+V while typing inside (ii) attaches to (ii)'s figure, not to every field on the
     card;
   - a paste with no image is ignored, so pasting text keeps working;
   - the first `image/*` item of the clipboard is taken; `getAsFile()` returns a nameless
     PNG blob, handled like any file.

### 6.3 Client-side preparation (before upload)

`prepareQuestionImage(file)`: keep the original if its long edge ≤ **1600 px** and it is
already small; otherwise downscale to 1600 px and re-encode (WebP where the browser can,
else JPEG) at quality 0.92 → 0.85 → 0.75 until under **180 KB**. 1600 px across the full
column is already ≥ 200 dpi on paper; more is bytes nobody can see. The result's pixel size
and bytes go into the stored ref so the dpi readout needs no round trip.

### 6.4 Server side

- Accept `image/png|jpeg|jpg|webp|gif`, max **5 MB**, multipart field `file`.
- Refuse when the paper is not in an editable status; authorise the caller against the
  paper (CoE user) or the assignment (external examiner).
- Respond `{ url, driveUrl?, driveFileId?, filename, size, type }`; the client merges
  `width_pct`, `px_w`, `px_h`, `bytes`.

### 6.5 Storage — decided: private Google Drive

MyJKKN writes today to COE's **public** `question-images` bucket. A question paper's circuit
diagram is question content, so new figures go where COE's own go: a **private Google Drive
folder**, a **registry row**, and an **authenticated proxy**. COE already prints such figures
(its renderer pre-fetches by `drive_file_id`), so nothing changes on the printing side.

What MyJKKN builds:

1. **Upload route** `POST /api/question-papers/:id/image` (replace the bucket write).
   Authorise the MyJKKN user against the paper and refuse when the paper is not editable.
   Accept the §6.4 types and limit. Upload with the **same Drive account and folder COE
   uses** — COE's Drive access is the MyJKKN homework-drive delegated account, so the
   credentials already exist on both sides; use a `question-papers/<paperId>/` sub-folder,
   never link-shared. Then:
   - insert the registry row in COE's `ia_question_paper_files` (MyJKKN already writes to
     COE's database for the paper itself): `paper_id`, `paper_kind = 'ia'`,
     `institutions_id`, `drive_file_id`, `drive_url`, `filename`, `mime_type`, `size_bytes`,
     `kind = 'question_image'`, `uploaded_by_kind = 'myjkkn'`, `uploaded_by = <email>`;
   - respond `{ url, driveUrl, driveFileId, filename, size, type }` where `url` is **COE's
     proxy path** `/api/examiner/question-paper/file/<driveFileId>` — that is the §2.2 contract
     COE's screens and renderer read.
2. **A COE migration** widening the check constraint:
   `uploaded_by_kind IN ('coe', 'examiner', 'migration', 'myjkkn')` (today it rejects
   anything else). COE's `QuestionPaperFileUploader` type gains `'myjkkn'` too.
3. **A MyJKKN file proxy** `GET /api/question-papers/file/:driveFileId` for the on-screen
   preview, authorised by the MyJKKN session: look the id up in the registry, stream the
   bytes from Drive with the right `Content-Type`, `Cache-Control: private`. The stored
   `url` is COE-relative and COE-authenticated, so MyJKKN's image field must **derive its
   preview from `drive_file_id`** through this proxy rather than render `url`.
4. **Remove / Replace** delete the Drive file (`deleteDriveFile`) and soft-delete the
   registry row (`deleted_at`); a failure here is logged, never shown as an error — an
   orphan is harmless.
5. **Legacy figures** already in the public bucket keep working as `https` URLs. Migrating
   them is a separate, optional job (COE did it with `supabase_path` / `migrated_at` on the
   registry row).

---

## 7. Entry method E — split questions, with photos

Rules (shared helpers `lib/ia/sub-questions.ts`, identical in MyJKKN):

- one level only; **max 10**; labels `i, ii, iii…` recomputed on every add/remove;
- sub marks must sum **exactly** to the question's marks;
- each sub-division has its own CO, K-level, text and **figure** (and, in the later phase, its
  own answer key + answer-key figure); the parent's CO/K are nulled on save;
- the parent keeps an optional stem (*"For the circuit shown below:"*);
- an objective question (one with `options`) cannot be split;
- the template part can forbid splitting (`ia_template_parts.allow_split = false`).

UI, as implemented in COE:

- Footer of the card: `Marks: 16` · when split `· sub-divisions 15 / 16` (turns red when
  the sum is off) · on the right **`⑂ Split into (i)/(ii)`**, shown only when
  `canSplit(q) && part.allow_split !== false && !split`.
- Clicking it seeds **two** sub-divisions with **half the marks each** (16 → 8 + 8), empty
  text, no CO/K, and the header's CO/K selects are replaced by the note *"CO and K-level per
  sub-division"*.
- Each sub-division row, inside a left-ruled block:
  `(i)   [Marks * ▢ step 0.5] [CO * ▾] [K-level * ▾] [×]`
  then a compact editor *"Type this sub-division…"*, then its own image strip *"Add image to
  (i)"* (the later answer-key phase adds *"Answer (i)"* beneath).
- `＋ Add sub-division` under the list until ten; `×` removes one and relabels the rest.
- Each sub-division is its own paste scope (§6.2), so a screenshot pasted while typing (ii)
  lands on (ii).

---

## 8. The question card — UI reference

```
┌ Q7  2 marks ✓ ─────────────────────────────────────────── [CO4 ▾] [K2 — Understand ▾] ┐
│  B  I  U  x₂  x²  │  Σ Equation  │  ⊞  ⊟  ⫼  ⊟  ⫼  🗑                                   │
│ ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Find the divided difference table for the following                                │ │
│ │ ┌────┬────┬────┬────┬────┐                                                         │ │
│ │ │ x: │ 30 │ 35 │ 45 │ 55 │                                                         │ │
│ │ │ y: │148 │ 96 │ 68 │ 34 │                                                         │ │
│ │ └────┴────┴────┴────┴────┘                                                         │ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│ ┌ 🖼 Add image — click, drop, or paste a screenshot (Ctrl+V) ─────────────────────────┐ │
│ └────────────────────────────────────────────────────────────────────────────────────┘ │
│  (MCQ only)  a) [compact editor]   b) [compact editor]                                 │
│              c) [compact editor]   d) [compact editor]        Option font [Default ▾]  │
│  (split only) ┃ (i)  [8 ▢][CO ▾][K ▾][×]  [compact editor]  [Add image to (i)]          │
│               ┃ (ii) [8 ▢][CO ▾][K ▾][×]  [compact editor]  [Add image to (ii)]         │
│               ┃ ＋ Add sub-division                                                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Marks: 2                                                     ⑂ Split into (i)/(ii)    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- Header: `Q7` badge, marks, a green tick once the question passes validation; CO / K-level
  selects on the right (`CO *`, `K-level *` placeholders; K options are `K1 — Remember` …
  `K6 — Create`).
- A choice alternative (`11 b)`) is the same card, indented and dashed, under an `(OR)` line.
- An invalid field gets a rose frame with the message under it, and the summary's "Fix"
  scrolls to it and flashes it (every problem has a stable DOM anchor).
- Preview / read-only mode shows the same card without controls: rendered text (KaTeX for
  formulas), the figure, `CO4 · K2` tags, and *"Question not entered"* in italics where empty.
- Paper header above the cards: course, **Default Language** select (§5.2), and the part
  heading `PART A – (10 x 2 = 20)` with its instruction.

---

## 9. Validation and saving (decision 3: explicit Save stays)

MyJKKN saves explicitly, by design, after an autosave once lost work; COE's examiner portal
autosaves with a local mirror. The decision is to **keep MyJKKN's model** and borrow only
COE's validation behaviour:

- **Save (draft) never validates.** The author must be able to stop half-way — empty
  questions, no CO, no K-level — and come back. The whole `questions[]` is sent with the
  paper's `updated_at` as the base; a stale base is reported, not silently overwritten.
- **Leaving with unsaved edits warns** (`beforeunload` while `dirty`), which is the cheap
  cover for a closed tab in place of a local mirror.
- **Live hints, not blocks, while editing:** the footer's `sub-divisions 15 / 16` turns red
  the moment the sum is off; nothing else nags before Submit.
- **Submit validates** (`validatePaperComplete` + `validateSubMarks`). Every problem carries a
  stable DOM anchor; the summary lists them and "Fix" scrolls to the field and flashes it.
  Messages, with the field in brackets:
  - `Q12 a: enter the question` [question_text] · `Q12 a i: enter the question` for a sub
  - `Q12 a i: enter the marks` [marks] · on the parent `Q12 a: sub-divisions total 15, must be
    16` or `Q12 a: every sub-division needs marks`
  - `… select a Course Outcome (CO)` [co_code] · `… select a K-level` [k_level]
  - `Q3: option b is empty` [option]
  - `Q5: has the same text as Q2` [duplicate]
  - template mismatches (`Part B: 4 questions found, the template needs 5`) are flagged
    *needs CoE* and block Submit without being the author's to fix.
  - (later phase) `Q12 a i: enter the answer key`
- Approve and Lock transitions never carry question edits (MyJKKN rule; unchanged).

---

## 10. Files to bring over from COE

| COE file | Purpose | MyJKKN counterpart / note |
|---|---|---|
| `components/ia/question-rich-editor.tsx` | editor + toolbar (TipTap v3) | replaces `components/question-papers/question-rich-editor.tsx` after the v3 upgrade (decision 2) |
| `components/ia/math-node.ts` | formula node, KaTeX NodeView, **LaTeX paste** | replaces `components/question-papers/math-node.ts` |
| `components/ia/equation-editor-dialog.tsx` | Word-style dialog | replaces the chip dialog |
| `components/ia/math-field.tsx` | MathLive field + `\square` convention | new; `npm i mathlive` |
| `lib/ia/math-catalog.ts` (520 lines) | 8 symbol sets, 11 structure galleries | replaces `lib/utils/question-papers/math-catalog.ts` (370 lines, older grouping) |
| `lib/ia/latex-paste.ts` | pasted-LaTeX splitter + delimiter stripping | new |
| `lib/ia/tamil-font-meta.ts` | canonical faces + `canonicalizeFontFamily` | new |
| `public/fonts/tamil/*` + `@font-face` | shipped faces | new |
| `components/ia/question-image-field.tsx`, `lib/ia/question-image.ts` | figure field | exists — add the scoped paste listener, `data-qp-image-scope` on the card and on each sub-division, and a preview URL derived from `drive_file_id` (§6.5) |
| `app/api/examiner/question-paper/upload/route.ts`, `…/file/[fileId]/route.ts`, `lib/ia/question-paper-files.ts` | Drive upload, authenticated file proxy, registry helpers (`registerQuestionPaperFile`, `getQuestionPaperFile`, `removeQuestionPaperFile`) | model for MyJKKN's `/api/question-papers/:id/image` and `/api/question-papers/file/:id`; registry helpers copy over with the COE table name unchanged |
| `lib/ia/sub-questions.ts` | split helpers | exists — add `allow_split` check and "Split into (i)/(ii)" seeding |
| `lib/ia/validate-paper.ts` | submit-time rules with anchors | adapt to MyJKKN's Submit transition (§9) |

Dependencies in COE: `@tiptap/* ^3.21`, `@tiptap/pm`, `katex ^0.18`, `mathlive ^0.111`.
The `@/components/ui/*` imports are the same shadcn set; `useToast` and `apiFetch` are the
only app-specific hooks in these files.

Adaptation points: the upload endpoint and its auth (`paperId` for a MyJKKN user, no
`assignmentId`), the Drive folder and registry writes (§6.5), the font files' path, and the
import alias (`@/lib/ia/*` → `@/lib/utils/question-papers/*` or wherever MyJKKN keeps them).

### Keeping the two copies in step (decision 7)

Each app owns its copy. Record the COE commit the copy was taken from at the top of each
copied file (`// Copied from COE <sha>, <date>`). When either side changes a shared file,
run a diff across the two checkouts before merging:

```
git diff --no-index ../COE/JKKN_COE/components/ia/question-rich-editor.tsx components/question-papers/question-rich-editor.tsx
```

Files on the sync list: the five editor files (§10 rows 1–5), `latex-paste.ts`,
`tamil-font-meta.ts`, `question-image.ts`, `question-image-field.tsx`, `sub-questions.ts`,
`validate-paper.ts`, and the Tamil font files.

---

## 11. Verification checklist

Manual, in the browser:

1. Type `Evaluate ` → Σ → *Integral → Integrals* → first template → fill `0`, `6`, `1/(1+x²)`,
   `dx` with Tab between boxes → Enter. The formula appears inline; click it, Σ, change `6`
   to `π`, *Update equation*.
2. Paste `Evaluate $\int_0^6 \frac{1}{1+x^2}\,dx$ using Trapezoidal rule.` into an empty
   question → words with a live formula. Paste `Fees are $5 and $10` → plain text.
3. Paste from a Word document containing a table and bold text → table and bold survive.
4. Set *Default Language* = Unicode Tamil, type Tamil in a question → the stem shows Tamil
   on a PC with no Tamil fonts installed; English in the same stem stays in the UI font.
   Set Bamini and type with a Bamini layout → Tamil shapes appear.
5. Take a screenshot (Win+Shift+S), click inside sub-division (ii)'s text, Ctrl+V → the
   figure lands on (ii), reports pixels / KB / dpi, prints centred under (ii).
6. Split a 16-mark question → i. (8) + ii. (8); set (ii) to 7 → footer shows `15 / 16` in
   red and Submit reports `Q12 a: sub-divisions total 15, must be 16`.
7. Save a draft with empty CO → saves; Submit → anchored message, Fix scrolls to it.
8. Open the paper's PDF through COE (`/api/pre-exam/question-papers/:id/pdf`) → formula,
   table, Tamil and the (ii) figure all print as on screen.
9. After phase 3: the uploaded figure is in the private Drive folder (no link sharing), its
   registry row exists with `uploaded_by_kind = 'myjkkn'`, the stored `url` is COE's proxy
   path, MyJKKN's preview loads through MyJKKN's own proxy, and COE's PDF prints it.
   Remove deletes the Drive file and soft-deletes the row.
10. Edit a question and close the tab → the browser warns about unsaved changes. Save a
    draft with empty CO → saves; Submit → anchored message, Fix scrolls to it.

Automated (how COE tests the editor): a temporary page that mounts the editor, driven with
`puppeteer-core` against the dev server, asserting the stored HTML after each action
(`span[data-latex]` present, no KaTeX markup stored, `""` for an emptied box).

---

## 12. Not in this spec

PDF / Word rendering (COE prints both from the contract above), templates and part
configuration, the CoE review and acceptance workflow, examiner assignment and remuneration,
and the answer-key UI (phase 5, later — the data shape is already reserved for it).
