# Spec — Rich Question Editor (Math Equations + Tables) for COE Pre-Exam Authoring

**Status:** Ready to implement
**Scope:** COE app only — the question-authoring editor in `app/(coe)/pre-exam/question-papers/page.tsx`
**Owner surface:** `ia_question_papers.questions[].question_text`
**Author of reference implementation:** already built and shipped in the MyJKKN app; this ports the same editor into COE so papers authored *inside COE* produce identical rich content.

---

## 1. Why this exists

`question_text` used to be plain text entered in a `<Textarea>`. It is now **sanitized HTML** that can contain:

- inline math — each formula is an atom `<span data-latex="…" class="qp-math">` (LaTeX source)
- tables — standard `<table><tbody><tr><td>…`
- basic formatting — `<strong> <em> <u> <sub> <sup> <p> <br> <ul> <ol> <li>`

**One representation, three surfaces** — all derive from the same HTML string:

1. **MyJKKN editor** (done) — Tiptap renders math live via KaTeX.
2. **COE PDF** (done — `lib/ia/build-paper-pdf-html.ts`) — sanitizes the HTML and expands each `data-latex` span to **MathML** (Chromium renders it natively), draws tables as real grids.
3. **COE authoring editor** — **THIS SPEC** — currently still a plain `<Textarea>`, so a COE author cannot enter math/tables and, worse, if they edit an HTML question the raw tags land in the textarea.

> After this spec, both authoring apps write the same HTML and both are consumed identically by the (already-built) faithful PDF renderer.

### Golden rule — do NOT store rendered KaTeX
Store only the **LaTeX source** in `data-latex`. KaTeX HTML output depends on ~20 `.woff2` font files that break under Vercel file-tracing; the PDF renderer deliberately re-renders LaTeX → **MathML** at print time (no fonts to bundle). The editor renders KaTeX-HTML live only for on-screen display. Never persist KaTeX HTML.

---

## 2. Prerequisites (dependencies)

COE already has: `katex@^0.18`, `isomorphic-dompurify`.

**Add Tiptap** (MyJKKN pins `^2.27.2` — match it exactly; the code below uses the v2 API):

```bash
npm install @tiptap/react@^2.27.2 @tiptap/core@^2.27.2 @tiptap/pm@^2.27.2 \
  @tiptap/starter-kit@^2.27.2 @tiptap/extension-underline@^2.27.2 \
  @tiptap/extension-subscript@^2.27.2 @tiptap/extension-superscript@^2.27.2 \
  @tiptap/extension-table@^2.27.2 @tiptap/extension-table-row@^2.27.2 \
  @tiptap/extension-table-header@^2.27.2 @tiptap/extension-table-cell@^2.27.2
npm install -D @types/katex
```

> **Version discipline:** the reference code uses `editor.commands.setContent(content, false)` — the **v2** signature (boolean 2nd arg). Tiptap v3 changed this to `{ emitUpdate: false }`. If you install v3 instead, that one call must change or external-value sync will re-mark rows dirty on every server reload.

---

## 3. Files to create

The four editor files are **framework-agnostic React/Tiptap** — copy them verbatim from the MyJKKN repo (same machine) and only fix the import aliases if COE's `@/` root differs (it does not — both use `@/*` → project root).

| Copy FROM (MyJKKN) | Copy TO (COE) | What it is |
|---|---|---|
| `lib/utils/question-papers/math-catalog.ts` | `lib/ia/math-catalog.ts` | The "all educational symbols" catalog (structures + categorized symbols → LaTeX) |
| `components/question-papers/math-node.ts` | `components/ia/math-node.ts` | Custom Tiptap inline **atom** node (`data-latex`, KaTeX NodeView) |
| `components/question-papers/equation-editor-dialog.tsx` | `components/ia/equation-editor-dialog.tsx` | Word-style equation dialog (ribbon + palette + LaTeX field + live preview) |
| `components/question-papers/question-rich-editor.tsx` | `components/ia/question-rich-editor.tsx` | The typeable box: toolbar (B/I/U, sub/sup, **Equation**, table controls) |

**Adjust the internal imports** in the copied files so they resolve inside COE:

- In `equation-editor-dialog.tsx`: `@/lib/utils/question-papers/math-catalog` → `@/lib/ia/math-catalog`.
- In `question-rich-editor.tsx`: `./math-node` and `./equation-editor-dialog` stay relative (both moved to `components/ia/`), so no change.
- Verify the shadcn/ui imports exist in COE: `@/components/ui/{dialog,button,textarea}`. COE has `Textarea` (`app/(coe)/pre-exam/question-papers/page.tsx` imports it) and standard shadcn Dialog/Button. If `Dialog`/`DialogFooter` differ, align the import names.

No other edits — the components carry their own KaTeX CSS import (`import 'katex/dist/katex.min.css'`).

### 3.1 Key contracts inside the copied files (for reviewers)

- **`math-node.ts`** — `MathInline` is `inline: true, atom: true`. `renderHTML` emits `<span data-latex="…" class="qp-math">`. `parseHTML` matches `span[data-latex]`. Commands `insertMath(latex)` / `updateMath(latex)`. This is the persistence format the PDF renderer already reads.
- **`question-rich-editor.tsx`** — props `{ value, onChange, onBlur?, disabled?, placeholder?, className? }`. Emits `editor.getHTML()` (or `''` when empty) via `onChange`. Disabled state hides the toolbar and calls `editor.setEditable(false)`; NodeViews still render, so a locked paper shows formulas/tables read-only.
- **`equation-editor-dialog.tsx`** — opens with `initialLatex` (pre-fill when the caret is on an existing formula → edit vs insert), inserts a token's LaTeX at the caret, has a live KaTeX preview.

---

## 4. Integration into the COE authoring page

File: `app/(coe)/pre-exam/question-papers/page.tsx`

### 4.1 Add the import (top of file, near the other component imports)

```ts
import { QuestionRichEditor } from '@/components/ia/question-rich-editor'
```

### 4.2 Replace the question `<Textarea>` (around line 1341-1347)

**FROM:**
```tsx
<Textarea
  // …existing props…
  value={q.question_text || ''}
  // …
  onChange={e => updateQuestion(q.id, { question_text: e.target.value })}
/>
```

**TO:**
```tsx
<QuestionRichEditor
  value={q.question_text || ''}
  disabled={/* same condition the Textarea used, e.g. !isEditable / status locked */}
  placeholder="Enter the question…"
  onChange={html => updateQuestion(q.id, { question_text: html })}
  onBlur={/* keep whatever save/flush the Textarea's onBlur did, if any */}
/>
```

- `updateQuestion(q.id, { question_text })` is unchanged — it now receives an HTML string instead of plain text. `question_text` is still just a string; nothing downstream needs new types.
- Keep the existing `disabled` logic (COE freezes editing on approved/locked — same status machine).
- The MCQ **option** inputs stay plain `<input>` for now (options are short; math there is out of scope — revisit only if requested).

### 4.3 Leave `updateQuestion` / `setQuestions` / save payload as-is
The save payload sends `questions[].question_text` verbatim. HTML is a valid string value; no API/DTO change.

---

## 5. Sanitization

The **PDF renderer already sanitizes on read** (`renderQuestionHtml` in `lib/ia/build-paper-pdf-html.ts`, DOMPurify allowlist: `p,br,strong,b,em,i,u,s,sub,sup,ul,ol,li,span,table,thead,tbody,tr,td,th`; attrs `data-latex,class,colspan,rowspan`). Tiptap's schema already constrains output to safe tags, so **no extra sanitize step is required in the editor**. Optionally sanitize once more server-side on save with the same allowlist for defense-in-depth — do NOT strip `data-latex`.

---

## 6. Verification checklist

1. **Deps**: `npm install` clean; `npx tsc -p tsconfig.json --noEmit` on a **scoped** tsconfig including only the 4 new files + the page (whole-repo `tsc` OOMs — use a `tsconfig` that `extends` the base with a narrow `include`, run `tsc -p`).
2. **Editor renders**: open a draft paper in COE → each question shows the toolbar (B I U x₂ x² **Σ Equation** + table icons).
3. **Type math**: click **Equation** → dialog opens → click `x²` and Basic Math symbols → LaTeX fills, preview renders → **Insert** → formula appears inline in the box.
4. **Edit math**: click an existing formula → **Equation** re-opens pre-filled → change LaTeX → Insert updates it.
5. **Table**: click the table icon → 2×2 inserts; add/delete row & column work.
6. **Round-trip**: save, reload the page → the formula and table re-render (proves `data-latex` + table HTML persisted).
7. **PDF parity**: generate the PDF (already wired) → formula prints as real math, table as a grid, no raw `<p>`/`<sup>` tags. (The PDF pipeline is already verified; this only confirms COE-authored content flows through it.)
8. **Locked read-only**: approve the paper → editor shows content but toolbar is hidden and fields are disabled.

---

## 7. Out of scope / follow-ups

- **Tamil / Bamini in the PDF** — separate work in `build-paper-pdf-html.ts` (`TAMIL_FONT_CSS` placeholder). Needs the Bamini `.ttf` and confirmation whether stored Tamil is Unicode or legacy Bamini-encoded (Bamini is a glyph font mapping Latin codepoints — it will not render Unicode Tamil without a Unicode→TSCII step).
- **Math in MCQ options** — options remain plain text unless requested.
- **Whole-repo strict typecheck** — both apps run `strict: false`; keep the scoped-tsconfig verification pattern.

---

## 8. Reference — the storage/PDF contract (do not break)

```
Author (MyJKKN or COE)
   │  Tiptap → getHTML()
   ▼
ia_question_papers.questions[].question_text   (sanitized HTML;
   │                                            math = <span data-latex="…">)
   ├───────────────► MyJKKN editor: KaTeX live render (HTML output)
   ├───────────────► COE editor:    KaTeX live render (HTML output)   ← THIS SPEC
   └───────────────► COE PDF: DOMPurify + KaTeX → MathML + Chromium   (done)
```

Any new consumer of `question_text` MUST treat it as HTML (parse/sanitize), never print it as a literal string — that is the bug that showed raw `<p>` tags in the old jsPDF PDF.
