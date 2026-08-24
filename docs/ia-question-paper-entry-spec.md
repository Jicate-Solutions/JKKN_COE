# Spec — Question Paper Entry (authoring screen)

**Status:** as-built in COE, to be reimplemented in MyJKKN
**COE source of truth:** `app/(coe)/pre-exam/question-papers/page.tsx`, `lib/ia/*`, `components/ia/*`, `app/api/pre-exam/question-papers/*`, `app/api/v1/ia/*`
**Related docs:** [ia-question-math-table-editor-spec.md](ia-question-math-table-editor-spec.md) · [ia-question-pdf-renderer.md](ia-question-pdf-renderer.md) · [plans/2026-07-17-ia-question-paper-templates.md](plans/2026-07-17-ia-question-paper-templates.md) · [api/COE-PUBLIC-API-REFERENCE.md](api/COE-PUBLIC-API-REFERENCE.md)

---

## 0. What this document is

Everything needed to build the **question paper entry screen** a second time, in MyJKKN, so that a paper authored there is identical to one authored in COE and prints through the same renderer.

It covers the two screens (paper list, paper editor), the stored question shape, the merge/save protocol, every validation rule with its exact message, the rich-text and image contracts, and the API surface MyJKKN calls.

### 0.1 System of record

**COE owns the data.** `ia_question_papers` (COE Supabase) is the single store; MyJKKN must not create a parallel table. MyJKKN is a second *client* of the same rows, talking to `/api/v1/ia/*` with an API key.

That matters because:

- question ids are minted by COE's scaffolder and are the key for question-wise CIA mark entry (`cia_marks.question_marks`);
- the PDF renderer runs in COE and reads the same JSONB;
- a CIA round with `mark_entry_type: "question_wise"` pulls its entry columns straight from the paper.

If MyJKKN forked the storage, marks entered in one app would point at questions that do not exist in the other.

### 0.2 Scope boundary — CIA only

`/api/v1/ia/*` deliberately hides **end-semester (ESE) papers**: a paper built from a template whose `exam_scope = 'ese'` returns `404` with

> End-semester question papers are not available on this API — they are authored by the appointed examiner in the question-paper setter portal.

MyJKKN authors internal (CIA) papers. ESE authoring stays in COE's examiner portal. Do not build UI that implies otherwise.

---

## 1. Domain vocabulary

| Term | Meaning |
|---|---|
| **Template** (`ia_paper_templates`) | The *format*: Part A/B/C, how many questions, marks each, choice on/off. COE-level, versioned, per institution. Never edited from the entry screen. |
| **Part** (`ia_template_parts`) | One section of the template — `part_label` "A", a question type, `num_questions`, `marks_per_question`, `has_choice`, `num_to_answer`, `capture_co`, `capture_klevel`. |
| **Paper** (`ia_question_papers`) | One instance: session × CIA round × course offering × set. Carries the `questions` JSONB. |
| **Question slot** | One element of `questions[]`. Created by the scaffolder from the template — **the author never adds or deletes slots**. |
| **Choice branch** | When a part has `has_choice`, each question number produces two slots, `a` and `b`; `b` has `is_choice_alternative: true` and prints as "(OR)". |
| **Sub-division** | Author-defined split of one slot into `i. / ii. / …`. A **paper-level** decision, never a template one. One level only. |
| **Set** | A/B variants of the same paper, driven by `courses.multiple_qp_set`. |
| **Authored** | The paper has at least one question with non-empty text. Gates PDF download and hides Rebuild. |

Terminology: JKKN standard applies — **learner**, never "student".

---

## 2. Data model

### 2.1 Tables (COE Supabase — reference only; MyJKKN creates none of these)

```
ia_question_types      per-institution registry: type_code, is_objective, has_options, default_option_count
ia_paper_templates     header: exam_scope, applicability, total_marks, capture_co/klevel, status, version
ia_template_parts      part_label, question_type_code, num_questions, num_to_answer, marks_per_question,
                       has_choice, choice_group_size, option_count, capture_co, capture_klevel, part_max_marks
ia_course_outcomes     CO master per course: co_code, co_description, display_order
ia_question_papers     the paper + questions JSONB (see 2.2)
ia_paper_setters       faculty assigned to author a course paper
```

Migrations: `supabase/migrations/20260717_create_ia_question_paper_templates.sql` plus the `20260718…20260822` follow-ups.

Notes that bite:

- `part_max_marks = COALESCE(NULLIF(num_to_answer,0), num_questions, 0) * marks_per_question` — set by a BEFORE trigger; `ia_paper_templates.total_marks` is rolled up by an AFTER trigger. A "10 questions, answer any 5" part contributes 5 × marks, not 10 ×.
- `ia_paper_questions` (the old per-row table) is **dead**. Everything reads and writes `ia_question_papers.questions`.
- `created_by` / `author_id` / `approved_by` / `paper_setter_id` are plain UUIDs — MyJKKN staff profile ids, no FK.

### 2.2 The `questions` JSONB contract

Ordered array. Every field below is stored verbatim; the renderer and the mark-entry flattener both read this shape.

```jsonc
{
  "id": "uuid",                    // stable, minted at scaffold. NEVER regenerate client-side.
  "part_label": "B",
  "question_number": 11,           // shared by both branches of an OR pair
  "sub_label": "a",                // "a" | "b" | null (null when the part has no choice)
  "is_choice_alternative": false,  // true = the "(OR)" branch
  "question_type_code": "essay",
  "question_text": "<p>…</p>",     // sanitized HTML from the rich editor; null/"" = empty
  "marks": 15,
  "options": [                     // null for descriptive questions
    { "key": "a", "text": "plain mirror", "text_html": "<p>rich</p>" }
  ],
  "option_font": null,             // CSS family override for this question's options
  "image": {                       // null when no figure
    "url": "https://…/question-images/<paperId>/<uuid>.webp",
    "path": "<paperId>/<uuid>.webp",
    "width_pct": 60,
    "px_w": 1200, "px_h": 480, "bytes": 84213
  },
  "correct_option": null,          // MCQ answer key
  "co_code": "CO1",                // null when the question is split
  "k_level": "K3",                 // null when the question is split
  "sub_questions": [               // null / [] = not split
    {
      "id": "uuid",
      "label": "i",                // roman, recomputed on every add/remove
      "question_text": "<p>…</p>",
      "marks": 8,
      "co_code": "CO2",
      "k_level": "K3",
      "image": { "…": "…" },
      "display_order": 1
    }
  ],
  "display_order": 21              // paper-wide sequence, 1..N
}
```

Rules baked into the readers (`lib/ia/sub-questions.ts`):

- `sub_questions` are re-sorted by `display_order` and re-labelled `i, ii, iii…` on every read. Max 10.
- `image` is normalised by `readQuestionImage`: **only `http(s)` URLs survive**. `javascript:` and `data:` payloads are dropped, because the value lands in an `<img src>` inside the PDF renderer.
- A question is splittable only when it has no `options` (`canSplit`).
- Display prefix (`questionPrefix`): `"12 a)"` when `sub_label` is set, else `"12."`.
- Mark-entry label (`entryLabel`): `"12a"`, or `"12a i"` for a sub-division.

### 2.3 Scaffolding (how slots come into existence)

`lib/ia/paper-scaffold.ts::scaffoldQuestions(parts)` — parts sorted by `display_order`; a running `counter` numbers questions across the whole paper and a running `order` numbers `display_order`:

```
for each part:
  for qi in 1..num_questions:
    counter++
    push slot { sub_label: has_choice ? 'a' : null, is_choice_alternative: false,
                marks: marks_per_question, options: buildOptions(option_count) }
    if has_choice:
      push slot { sub_label: 'b', is_choice_alternative: true, same number, same marks }
```

`buildOptions(n)` returns `null` when `n < 2`, else `[{key:'a',text:''},…]` using letters `a..j`.

`sub_questions` and `image` are **never** scaffolded — they are author decisions.

---

## 3. Lifecycle

### 3.1 Paper status machine

```
draft ──Submit──▶ submitted ──Approve──▶ approved ──Lock──▶ locked
```

| Status | Stamps | Questions editable? | Delete? |
|---|---|---|---|
| `draft` | — | yes | yes |
| `submitted` | `submitted_at` | yes | yes |
| `approved` | `approved_at` (`approved_by` from `author_id` on v1) | no\* | yes |
| `locked` | `locked_at` | no\* | no |

\* COE grants `super_admin` and `coe` an override — they may edit, rebuild and delete at any status. **`/api/v1` has no override**: `EDITABLE = ['draft','submitted']`, full stop. Build MyJKKN's UI on the v1 rule.

Downstream gate worth knowing: question-wise CIA marks may only be entered against a paper that is `submitted`, `approved` or `locked`. Drafts are excluded because a rebuild could invalidate the question ids those marks were keyed to.

### 3.2 Generation (papers are generated, not hand-created)

`POST /api/v1/ia/question-papers` with `examination_session_id`, `program_code`, `semester` (+ optional `institution_code`, `cia_setting_id`, `cia_round`, `cia_round_name`, `template_id`, `author_id`).

Server algorithm:

1. Load active `course_offerings` for institution + session + program + semester.
2. Enrich from `courses` (`course_category`, `evaluation_type`, `multiple_qp_set`, `course_name`).
3. Skip any course whose `evaluation_type` is set and is neither `CIA` nor `CIA + ESE`.
4. Pick the template whose Course Type applicability covers that course's `course_category` (`pickTemplateForCourse`). **No match → no paper**, and the course is reported in `not_applicable_courses`. This holds even when `template_id` was passed explicitly — a Theory-only template still skips Practical courses.
5. `setCount(multiple_qp_set)`: `true → 2`, a number `> 1 → n`, anything else `→ 1`. `set_label` = `A`/`B`… only when more than one set.
6. Skip `(course_offering_id, set_number)` pairs that already exist → counted as `skipped`.
7. Insert with `status: 'draft'`, `max_marks` = template `total_marks`, `subject_title` = `course_name`, `questions` = scaffold.

Response: `{ data: { created, skipped, not_applicable, not_applicable_courses, templates_cover? } }`.
`400` when the institution has no active CIA template; `404` when no offerings match.

COE's own route additionally returns `no_offerings: true` instead of an error when a program has nothing in that semester — a normal condition when the semester list is a union across several programs. Mirror that leniency: loop the selected programs, sum the counters, and report the empty ones as information, not failures.

### 3.3 Rebuild

`PUT { regenerate: true }` re-scaffolds slots from the current template and **merges authored content back in** (`mergeAuthored`), matching on `part_label|question_number|sub_label|is_choice_alternative`. Preserved across a rebuild: `question_text`, option `text`/`text_html`, `option_font`, `image`, `correct_option`, `co_code`, `k_level`, `sub_questions`. `max_marks` is refreshed from the template.

- Draft only on v1 (`400 Rebuild only in draft`).
- Returns `409 { error: "AUTHORED" }` when any question already has text; retry with `force: true`.
- UI rule in COE: the per-paper **Rebuild** button is hidden entirely once anything is authored, and "Rebuild All" only touches drafts and treats a `409` as "kept".

---

## 4. Screen 1 — Paper list

Route in COE: `/pre-exam/question-papers`. Page permission `page.pre_exam.question_papers.view`, granted to `super_admin` and `coe`.

### 4.1 Filters

Two modes, as tabs: **Program-wise** and **Board-wise**. Switching modes clears semester, selection and the loaded list.

| Filter | Source | Notes |
|---|---|---|
| Institution | COE institutions | Hidden unless the user must choose (super admin viewing "All Institutions") |
| Exam Session | `examination_sessions` for the institution | |
| Program(s) | multi-select | Program-wise only |
| Board | `board` master | Board-wise only; resolves to course codes via `courses.board_code` / `board_id` |
| Semester | union of offering semesters across the chosen programs/board | recomputed whenever programs/board/session change |
| CIA Round | **the CIA Setting for that institution + session** | never a hardcoded 1/2/3 list; auto-selects when only one round exists, and drops a selection the setting no longer offers |
| Template | active CIA templates for the institution | reset whenever the institution changes |

**Generate** stays disabled until every filter is set; the button title names what is missing ("Select institution, exam session, program(s), semester, CIA round, template first"). Without a CIA round the list is not fetched at all — the API would otherwise return every round's papers.

### 4.2 Table

`☐ | S.No | Course | Course Name | Program | Sem | Set | Max (right) | Status | ⋯`

- Only papers with `authored: true` are selectable and downloadable.
- Status badge colours: `draft` amber, `submitted` blue, `approved` green, `locked` grey.
- Row menu: **Open**, **PDF**, **PDF (2-up)** (both disabled unless authored), **Approve** (when submitted), **Lock** (when approved), **Delete** (destructive, blocked on locked).
- Bulk: **Download ZIP** and **Download ZIP (2-up)**; Board-wise mode with nothing ticked falls back to "all authored papers currently listed". **Rebuild All** operates on drafts only and reports `rebuilt / kept (already authored) / failed`.
- ZIP entry names are `NNN_<paper filename>` so on-screen order survives; the archive is `question-papers-CIA<round>[_<BOARD>][-2up].zip`.

---

## 5. Screen 2 — Paper entry editor

A full-width sheet/drawer over the list (`max-w-7xl` content, scrollable body, sticky action bar). Closing with unsaved edits asks *"You have unsaved changes. Close without saving?"*.

### 5.1 Header

```
EE25302 — ELECTRIC CIRCUIT ANALYSIS            [● Unsaved] | [✓ Saved 22 answer(s)]
Default Language [ Default (English) ▾ ]  Applies to every question & option in this paper · Save to keep.
[submitted]  Set A · Max 50   [(read-only — approved)] | [(editing a locked paper — CoE override)]
```

- Title = `course_code — subject_title`.
- The chip is **amber "● Unsaved"** while `dirty`, **green "✓ Saved N answer(s)"** after a successful save (N = `saved_count`). Any edit anywhere sets `dirty`.
- **Default Language** writes `default_font`: `Default (English)` → `null`, plus the three families from `TAMIL_FONT_FAMILIES`:

  | Label | stored `default_font` |
  |---|---|
  | Unicode Tamil | `Noto Sans Tamil` |
  | Bamini | `Bamini` |
  | Suntommy | `Suntommy` |

  It is a **paper-level** choice — there is no per-question font picker. It cascades into every editor as the CSS variable `--qp-editor-font`, and the PDF reads the same column, so screen and print agree. Inline `font-family` marks saved on older papers still override it.

### 5.2 Meta fields

Two columns: **Course Name** (`subject_title`) and **Exam Date** (`exam_date`, `type="date"`, sent as `YYYY-MM-DD`).

> ⚠️ In COE today the Course Name input is **not** disabled when the paper is read-only, while Exam Date is. Do not copy that; gate both on `editable`.

### 5.3 Course Outcomes manager (collapsed by default)

Header row: `Course Outcomes (N) — <course_code>` with a chevron.

- Empty state: *"No COs for this course yet — dropdowns fall back to CO1–CO6."* plus **+ Add CO1–CO5** (bulk upsert of five outcomes).
- Populated: chips `CO1 · description…`, each with an `✕` delete.
- Add row: `CO code` input + `Description (optional)` input + `+`.
- Backed by `/api/v1/ia/course-outcomes` (`GET` by `course_id`, `POST` single or `outcomes[]` bulk upsert on `course_id,co_code`, `DELETE ?id=`).
- CO dropdown options are the defined COs, or `CO1…CO6` when none are defined — **selection is never blocked by missing masters**.

### 5.4 Guidance banner

> Click **Save** to persist questions — the header shows ✓ Saved N answer(s). Once a paper has entered questions, **Rebuild will not erase it** (Rebuild All skips it; per-paper Rebuild asks to confirm).

### 5.5 Part block

Questions are grouped by `part_label` in `display_order`. One bordered block per part with a muted header:

```
PART A — (10 x 2 = 20)                                  [Choice (OR): Off]
Answer ALL the questions
No (OR) — enable "Choice (OR)" on this part in Question Paper Templates, then Rebuild.
```

- Heading maths: `answerCount = num_to_answer > 0 ? num_to_answer : num_questions`; print `— (answerCount x marks_per_question = answerCount × marks_per_question)`, and append `· answer {answerCount} of {num_questions}` when `answerCount < num_questions`.
- Badge: green `Choice (OR): On` when `has_choice`, muted `Choice (OR): Off` otherwise.
- `instruction` from the part prints under the heading.
- The amber hint appears only when the part has no choice — it tells the author the fix is in the template, not here.

### 5.6 Question card

```
Q1 · 2 marks                                        [⤴ Split into sub-divisions]
┌ B I U x₂ x² │ Σ Equation │ ▦ ▤ ▥ ▦ ▧ 🗑 ────────────────────────────────────┐
│ Differentiate between series and parallel circuit.                          │
└─────────────────────────────────────────────────────────────────────────────┘
[🖼 Add image]
CO * [CO1 ▾]   K * [K2 ▾]
```

- Prefix: `(OR) ` when `is_choice_alternative`, then `Q{question_number}`, then ` {sub_label})` when present. Followed by `· {marks} marks`.
- **Split into sub-divisions** shows only when `editable` and the question has no options; the label becomes **Add sub-division** once split, and is disabled at 10.
- Placeholder is `Enter the question…`, or — once split — *"Optional shared stem — e.g. "For the circuit shown below:" (leave blank to print nothing)"*.
- **MCQ options** (when `options` is non-empty) render in a 1/2/3-column grid, each `a)` label + a **compact** rich editor. Every keystroke writes both shapes: `text_html` = the HTML, `text` = `richTextToPlain(html)`.
- **Answer** select (MCQ only) sets `correct_option`.
- **CO \*** and **K \*** selects appear when the part's `capture_co` / `capture_klevel` are true **and the question is not split**. Empty + editable renders the trigger with a red border. K options come from `K_LEVELS` (K1 Remember … K6 Create) and display just the code.

### 5.7 Sub-divisions

Badge on the question row: `{n} sub-division{s} · {allocated}/{budget}` — green when balanced, red when not.

Dashed panel below the question:

```
Sub-divisions                                    Allocated 15 / 15 ✓
┌ i.   Marks [ 8 ]   CO * [CO2▾]  K * [K3▾]                        ✕ ┐
│ [rich editor]                                                       │
│ [image field — "Add image to i."]                                   │
└─────────────────────────────────────────────────────────────────────┘
```

Behaviour:

- **The first split seeds two halves** of the parent budget — `ceil(m/2)` and `floor(m/2)` (15 → 8 + 7) — each inheriting the parent's CO/K. Every later add comes in at **0 marks, no CO/K**, so allocation is deliberate.
- Labels and `display_order` are recomputed on every add/remove (`relabelSubs`).
- Marks input: `type=number`, `min 0`, `max = parent marks`, `step 0.5`.
- When split, the **parent's CO/K controls disappear** and are nulled on save — each sub-division carries its own.
- Unbalanced panel text: `⚠ Allocated {a} / {b} — must total {b}`.

### 5.8 Error panels

Above the action bar, both red-bordered:

1. **Sub-division marks must total the question's marks** — visible whenever `subMarkErrors` is non-empty; blocks Save.
2. **{n} item(s) to complete before submitting** — shown *only after* a Submit/Approve has actually been blocked, first 8 items plus "…and N more". Never blocks Save.

### 5.9 Action bar (sticky, right-aligned)

| Button | Visible when |
|---|---|
| **PDF** | always |
| **PDF (2-up)** | always — *A4 landscape, two identical copies side by side (cut down the middle)* |
| **Rebuild** | status is `draft` (or CoE override) **and** nothing is authored yet |
| **Save** | status ≠ `locked` (or CoE override); disabled while `subMarkErrors` |
| **Submit** | status is `draft` |
| **Approve** | status is `submitted` |
| **Lock** | status is `approved` |

Save keeps the sheet open and refreshes it in place. A status change closes the sheet and refetches the list.

---

## 6. Rich text editor contract

Implementation: `components/ia/question-rich-editor.tsx` (TipTap v3). Full detail in [ia-question-math-table-editor-spec.md](ia-question-math-table-editor-spec.md).

**Extensions:** `StarterKit`, `Underline`, `Subscript`, `Superscript`, `TextStyle` + `FontFamily`, `TableKit` (`resizable: false`), `Placeholder`, `MathInline`.

**Two variants:**

| variant | toolbar | min height | used for |
|---|---|---|---|
| `full` | B / I / U / x₂ / x² │ Σ Equation │ table: insert 2×2, add row, add column, delete row, delete column, delete table | 70 px | question text, sub-division text |
| `compact` | B / I / U / x₂ / x² │ Σ Equation | 34 px | MCQ options |

**Emit rules:**

- `onUpdate` emits `editor.getHTML()`, normalised: `''`, `'<p></p>'`, `'<p><br></p>'` all become `''`. An untouched question stays genuinely empty, which is what the completion validator tests.
- External value changes (server reload, rebuild) call `setContent(value, { emitUpdate: false })` so a refresh never marks the paper dirty.
- The toolbar buttons use `onMouseDown={e => e.preventDefault()}` so the caret is not lost.

**Golden rule — never persist rendered KaTeX.** A formula is stored as

```html
<span data-latex="\frac{V}{R}" class="qp-math">\frac{V}{R}</span>
```

On screen a TipTap NodeView renders it live with KaTeX; at print time COE converts the same LaTeX to MathML (Chromium renders MathML natively, so no fonts are bundled). Storing KaTeX HTML would break the PDF.

**Equation dialog** (`components/ia/equation-editor-dialog.tsx`): two ribbons — *Structures* and *Symbols* — from `lib/ia/math-catalog.ts`, each a set of category tabs of KaTeX-rendered buttons. Tokens use `\square` as the placeholder the author fills in. Below: a LaTeX textarea with a live preview. Tokens insert at the caret. Opening with the caret on an existing formula pre-fills it and the dialog updates instead of inserting.

**Plain mirror** (`lib/ia/rich-text.ts`): `richTextToPlain(html)` strips tags and falls a formula back to its LaTeX source. Used to keep `options[].text` in step with `options[].text_html`. `optionEditorValue(o)` loads `text_html` when present, else escapes the legacy `text` — a legacy option like `x < 5` must never be parsed as markup.

**Sanitization** happens server-side at render (`lib/ia/build-paper-pdf-html.ts`): a dependency-free allowlist over tags and the attributes `data-latex`, `class`, `colspan`, `rowspan`, with JavaScript disabled on the print page. MyJKKN does not need its own sanitizer for the PDF path, but should not widen what it stores beyond what that allowlist keeps.

---

## 7. Image attachment contract

Implementation: `components/ia/question-image-field.tsx` + `lib/ia/question-image.ts` + `app/api/pre-exam/question-papers/[id]/image/route.ts`.

**One image per question and per sub-division.** It prints centred under that question's text.

### 7.1 Client-side preparation (before upload)

| Constant | Value | Why |
|---|---|---|
| `MAX_EDGE_PX` | 1600 | ≈200 dpi across the full A4 text column |
| `TARGET_BYTES` | 180 KB | keeps stored objects at KB level |
| encoding | WebP when the browser can encode it, else JPEG on a white ground | WebP holds line art far better; JPEG has no alpha, and a transparent diagram would print black |
| quality ladder | 0.92 → 0.85 → 0.75 | cheapest lever first |
| shrink | × 0.8 per pass, max 4 passes | never below **800 px** on the long edge |

An image already within `MAX_EDGE_PX` and under `TARGET_BYTES` is uploaded untouched — no lossy pass over a crisp line drawing.

### 7.2 Print-size feedback

- Widths offered: **Small (40%)**, **Medium (60%)**, **Large (85%)**; default `60`. Stored as `width_pct`.
- Effective dpi: `px_w / ((190 mm × pct / 100) / 25.4)`, where 190 mm is the A4 text column.
- Below `MIN_PRINT_DPI = 150` the control shows an amber warning: *"may print soft — use a larger source image or a smaller width"*.
- The caption line reads `1200 × 480 px · 84 KB · ≈111 dpi at this width`.
- The preview mirrors the print: centred, at the chosen column width.

### 7.3 Upload / delete

```
POST   /api/pre-exam/question-papers/:id/image        multipart, field "file"  → { url, path, size, type }
DELETE /api/pre-exam/question-papers/:id/image?path=… → { success: true }
```

- Bucket `question-images`, **public read**, 5 MB limit, mime allowlist `image/png|jpeg|jpg|webp|gif`. Object path `<paperId>/<uuid>.<ext>`.
- Uploads run through the service-role key (RLS bypassed), so there are no write policies on the bucket.
- Delete is guarded: the path must start with `<paperId>/` and must not contain `..`.
- **Replace** uploads the new object then best-effort deletes the old one. **Remove** clears the field then deletes. An orphaned object never blocks the author.
- The upload is only *referenced* once the paper is saved — the toast says so: *"… · Save the paper to keep it."*
- The paper must be `draft`/`submitted` (or the caller a CoE/super-admin) or the route answers `400 Cannot edit images while paper is <status>`.

### 7.4 The MyJKKN route

Use the v1 mirror — same bucket, same path scheme, same guards:

```
POST   /api/v1/ia/question-papers/{id}/image        multipart, field "file"  → { data: { url, path, size, type } }
DELETE /api/v1/ia/question-papers/{id}/image?path=… → { success: true }
```

`POST` needs `ia:create`, `DELETE` needs `ia:delete` — the module and operation are derived from the URL segment (`ia`) and the HTTP method, so an image upload cannot be granted separately from paper creation. Both refuse an `approved`/`locked` paper and both `404` an ESE paper.

Hosting the figure elsewhere also *works* — `readQuestionImage` accepts any `http(s)` URL and the renderer will fetch it — but then COE cannot clean up the orphans, and the URL must stay publicly readable for as long as the paper can be printed. Prefer the endpoint above.

---

## 8. Validation

Two tiers, deliberately separated: **Save is never blocked by incompleteness** (an author must be able to stop half-way), but **Submit and Approve are**.

### 8.1 Sub-division marks — blocks Save (`lib/ia/sub-questions.ts::validateSubMarks`)

For every split question:

| Condition | Message |
|---|---|
| any sub-division has no marks | `Q12a: every sub-division needs marks` |
| the sum ≠ the parent's marks | `Q12a: sub-divisions total 14, must be 15` |

Server rejects with `400 { error: "SUB_MARKS", message: "<errors joined by ' · '>" }`.

### 8.2 Completeness — blocks Submit / Approve (`lib/ia/validate-paper.ts::validatePaperComplete`)

Walked in `display_order`. `capture_co` / `capture_klevel` come from the question's template part and default to `true`.

| Case | Messages |
|---|---|
| unsplit question | `Q12a: enter the question` · `Q12a: select CO` · `Q12a: select K-level` |
| split question | the parent stem is **optional**; each sub-division must have text, CO and K — `Q12a i: enter the question`, etc. |
| MCQ | `Q12a: option b is empty` for every blank option |

"Text" means visible text: tags and `&nbsp;` are stripped before the emptiness test, so an empty `<p></p>` does not pass.

Server rejects with `400 { error: "INCOMPLETE", message: "N item(s) incomplete — <first 5 joined by ' · '> …" }`. Statuses that trigger the check: `submitted`, `approved` (`COMPLETION_REQUIRED_STATUSES`).

The UI must run the *same* pure functions so the author sees the list before the round trip — and must still handle the server's rejection, because a stale tab can slip past the client check.

---

## 9. Save protocol

### 9.1 The merge rule (`lib/ia/apply-question-edits.ts`)

> **A field the payload does not mention is preserved. Only an explicit value — including `null` / `''` — changes it.**

This exists because of a real data loss: a save whose payload omitted the Part B fields nulled every one of them and destroyed eight authored sub-divisions on a submitted paper.

Mechanics:

- Incoming questions are matched **by `id`**. Ids absent from the stored array are ignored — slots come from the template, never from the client. Questions can be neither added nor removed through this endpoint.
- Every stored question is returned, whether or not it was sent.
- `question_text`, `marks`, `options`, `option_font`, `image`, `correct_option`, `co_code`, `k_level` follow the mention rule. `image` is re-normalised on the way in.
- `sub_questions`: an omitted key **re-reads the stored value**; an objective question (has options) is forced to `[]`.
- A question with sub-divisions has its own `co_code` / `k_level` set to `null`.

### 9.2 Mass-clear guard

If the save would take **3 or more** questions from "authored" to "empty" (`MASS_CLEAR_THRESHOLD = 3`), the server refuses:

```
409 { "error": "WOULD_CLEAR",
      "message": "This save would erase authored content in 5 questions (11 a, 11 b, 12 a, …).
                  Reload the paper and re-enter, or pass allow_clear:true to clear them deliberately." }
```

The client shows that message in a confirm and retries with `allow_clear: true` if the author insists. One or two cleared questions is plausible hand-editing and passes silently.

### 9.3 Optimistic concurrency

Send `base_updated_at` = the `updated_at` the paper was loaded with. The UPDATE is filtered on it; no matching row means someone else saved first:

```
409 { "error": "CONFLICT", "message": "Paper changed elsewhere. Reload before saving." }
```

Client copy: *"Not saved — paper changed elsewhere. Reopen this paper to get the latest version, then re-enter."*

### 9.4 Request / response

```jsonc
// PUT /api/v1/ia/question-papers/{id}
{
  "questions": [ /* only when the paper is editable — the full array as edited */ ],
  "subject_title": "ELECTRIC CIRCUIT ANALYSIS",
  "exam_date": "2026-09-14",
  "base_updated_at": "2026-08-22T06:31:44.912Z",
  "allow_clear": false,        // only on the deliberate retry
  "status": "submitted"        // omit for a plain save
}
```

Response `{ data: { …paper, questions: [...sorted], saved_count: N } }`.

Error table:

| Status | Body | Meaning |
|---|---|---|
| 400 | `Cannot edit questions while <status>` | paper not in `draft`/`submitted` |
| 400 | `{ error: "SUB_MARKS", message }` | §8.1 |
| 400 | `{ error: "INCOMPLETE", message }` | §8.2, on submit/approve |
| 400 | `Invalid status` | not one of the four |
| 409 | `{ error: "WOULD_CLEAR", message }` | §9.2 |
| 409 | `{ error: "CONFLICT", message }` | §9.3 |
| 409 | `{ error: "AUTHORED", message }` | rebuild over authored content |
| 404 | `Not found or not permitted` | wrong id, or outside the key's institutions |
| 404 | ESE message | paper built from an `exam_scope='ese'` template |

Coded errors carry the readable text in `message`, not `error` — surface `message ?? error`.

---

## 10. API surface MyJKKN calls

Base: `https://coe.jkkn.ai`. Headers on every request:

```http
X-API-Key-Id: ak_live_xxxxxxxx
X-API-Secret: sk_live_xxxxxxxxxxxxxxxx
Content-Type: application/json
```

Module permission `ia` — `ia:read`, `ia:create`, `ia:update`, `ia:delete`. Institution resolves from `institution_code` (query param on GET, body field on POST) and falls back to the key's own institution. **Note the COE↔MyJKKN institution mapping:** MyJKKN has separate SF and aided institutions; COE collapses both into one (`institution_code = "CAS"`). Scope by the COE code, not a MyJKKN institution id.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/ia/question-papers` | GET | list; filters `institution_code`, `examination_session_id`, `cia_round`, `program_code`, `semester`, `status`, `course_code` (comma-separated for a staff member's assigned courses), `author_id`. `questions` is stripped and replaced by `authored`. Capped at 10,000 rows, ordered by `course_code`, `set_number`. |
| `/api/v1/ia/question-papers` | POST | generate (§3.2) |
| `/api/v1/ia/question-papers/{id}` | GET | full paper + `questions` (sorted) + `template_parts` + `course_outcomes` |
| `/api/v1/ia/question-papers/{id}` | PUT | save / status / rebuild (§9) |
| `/api/v1/ia/question-papers/{id}` | DELETE | blocked on `locked` |
| `/api/v1/ia/question-papers/{id}/image` | POST DELETE | attach / remove a question figure (§7) |
| `/api/v1/ia/question-papers/{id}/pdf` | GET | rendered A4 PDF |
| `/api/v1/ia/paper-templates` | GET POST PUT DELETE | templates + parts |
| `/api/v1/ia/question-types` | GET POST PUT DELETE | per-institution type registry |
| `/api/v1/ia/course-outcomes` | GET POST DELETE | CO master per course |

The detail `GET` is what the editor needs: it returns the three things the screen renders from — the questions, the `template_parts` (for part headings, choice badges and `capture_co`/`capture_klevel`), and the `course_outcomes` (for the CO dropdown). The list endpoint does **not** carry `template_parts`; always fetch the detail before opening the editor.

`questions[].id` is stable across renumbering and reordering. **Always key saved marks by it, never by index or question number.**

---

## 11. Gaps between COE's console and the v1 API

### 11.1 Closed

| # | Gap | Resolution |
|---|---|---|
| 1 | No image endpoint on v1 | **Added** `app/api/v1/ia/question-papers/[id]/image/route.ts` — the same bucket, path scheme and guards as the pre-exam route, wrapped in `withExternalAuth` + `institutionAllowed` + `paperIsEse`. `POST` needs `ia:create`, `DELETE` needs `ia:delete` (the module/operation pair is derived from the path and the HTTP method, so there is no per-route override). §7.4 option 2 is no longer necessary. |
| 2 | v1 `PUT` ignored `default_font` | **Added** to the destructured body and the patch, matching the pre-exam route. Per-question `option_font` already worked — it rides inside the question object. |
| 5 | `docs/api/COE-PUBLIC-API-REFERENCE.md` §IA predated sub-divisions, images, `allow_clear`, `INCOMPLETE` and `SUB_MARKS` | **Rewritten** from §2.2, §8 and §9 of this document, including the merge rule and the two image endpoints. |

### 11.2 Open, by design

| # | Gap | Impact | Decision |
|---|---|---|---|
| 3 | v1 rebuild has no CoE override | A `coe`/`super_admin` user working inside MyJKKN cannot rebuild a non-draft paper | Acceptable — the override is a COE-console affordance for correcting a paper after approval. Say so in MyJKKN's UI copy rather than widening the API. |
| 4 | v1 list has no `board_code` filter and no `action=board-semesters` | Board-wise listing is COE-only | Program-wise covers the faculty use case. Add only if MyJKKN grows a board-wise screen. |

---

## 12. Downstream — why the shape matters

Question-wise CIA mark entry keys off this paper. `flattenEntryQuestions` turns `questions[]` into entry columns:

- an unsplit question contributes **itself**;
- a split question contributes **one column per sub-division** (its own id and marks), not the parent;
- `choice_group` = `part_label|question_number`, so `12a` and `12b` are one group;
- `branch_id` = the parent question's id, so the "only one branch of an OR pair" rule counts distinct *branches*, letting `12a i` and `12a ii` both be answered while `12b` stays locked.

Marks land in `cia_marks.question_marks` (JSONB) keyed by component code and then by **question id**:

```json
{ "test_1": { "paper_id": "uuid", "set_number": 1, "set_label": "A",
              "marks": { "<question id>": 3, "<question id>": 2.5 } } }
```

An omitted question id means *not attempted* — that is how the unanswered half of an OR pair is recorded. Absence is `cia_marks.grade = 'AAA'`, never a boolean.

This is the concrete reason MyJKKN must not mint its own question ids or renumber slots.

---

## 13. Print contract (COE-side, listed so MyJKKN does not rebuild it)

`lib/ia/build-paper-pdf-html.ts` renders HTML → PDF through headless Chromium so that inline math, tables and Tamil print exactly as authored.

- A4 portrait; `layout=2up` gives A4 landscape with two identical copies side by side.
- Letterhead per COE `institution_code` — `CAS` plain centred, `CET` a boxed engineering block with logo and a 12-cell Register Number grid.
- Formulas are re-rendered LaTeX → MathML at print time.
- A question image prints centred at `width_pct` of the ~190 mm text column.
- Tamil faces (Unicode / Bamini / Suntommy) are embedded as base64 `@font-face` from `public/fonts/tamil/`.
- Filename (`lib/ia/paper-filename.ts`): `QP_<course code>_<course name>_<CIAn>[_Set<X>][_2up].pdf`, e.g. `QP_EE3012_ELECTRICAL DRIVES_CIA1.pdf`. A round named something other than "CIA…" keeps its own name. `Content-Disposition` carries both an ASCII fallback and the RFC 5987 UTF-8 parameter, because a course title may be Tamil.

---

## 14. Build order for MyJKKN

1. **Read path** — list screen against `GET /api/v1/ia/question-papers`, detail fetch, render parts and questions read-only. Proves the filters and the `template_parts` join.
2. **Plain editing** — text-only questions, CO/K selects, Save with `base_updated_at`. Proves the merge rule and the conflict path.
3. **Rich editor** — port `question-rich-editor.tsx`, `math-node.ts`, `equation-editor-dialog.tsx`, `math-catalog.ts`, `rich-text.ts` verbatim; verify a saved formula round-trips as `data-latex` and prints.
4. **MCQ options** — compact editor, dual `text`/`text_html` write, Answer select.
5. **Sub-divisions** — port `sub-questions.ts` verbatim; the split UI, the allocation badge, `validateSubMarks` blocking Save.
6. **Completion gate** — port `validate-paper.ts` verbatim; Submit/Approve blocked with the panel, plus handling of the server's `INCOMPLETE`.
7. **Images** — after gap #1 is resolved; port `question-image.ts` and the field component.
8. **Generate + Rebuild** — the POST loop over programs, `regenerate` with the `AUTHORED` confirm.
9. **PDF + ZIP** — single, 2-up, bulk zip with the shared filename helper.

Port `lib/ia/sub-questions.ts`, `lib/ia/validate-paper.ts`, `lib/ia/apply-question-edits.ts`, `lib/ia/rich-text.ts`, `lib/ia/paper-filename.ts` and `lib/ia/question-image.ts` **unchanged** — they are pure, dependency-free, and shared by both COE writers precisely so the rules cannot drift. Any divergence between the two apps will show up as a rejected save or a mis-printed paper.

---

## 15. Acceptance checklist

- [ ] A generated draft shows every slot the template defines, in `display_order`, with `(OR)` branches paired under one question number.
- [ ] Part heading reads `PART B — (2 x 15 = 30)`; an "answer any N" part also reads `· answer 3 of 5`.
- [ ] Typing anywhere flips the header chip to **● Unsaved**; Save flips it to **✓ Saved N answer(s)**.
- [ ] Save with a payload that omits `sub_questions` leaves the stored sub-divisions intact.
- [ ] Blanking 3 authored questions is refused with `WOULD_CLEAR` and succeeds after the confirm.
- [ ] Two tabs: the second Save is refused with `CONFLICT`.
- [ ] Splitting a 15-mark question seeds 8 + 7 and hides the parent CO/K.
- [ ] Sub-marks 8 + 6 disable Save and show the red panel.
- [ ] Submit with one CO missing is refused, listing `Q12b: select CO`.
- [ ] A formula survives save → reload → PDF, rendered (not as raw LaTeX).
- [ ] A 4 MB PNG uploads as a sub-200 KB WebP and reports its dpi; below 150 dpi it warns.
- [ ] Rebuild on an authored paper asks first and keeps every answer, image and sub-division.
- [ ] An `approved` paper is read-only; PDF and 2-up PDF still download.
- [ ] A paper built from an ESE template is invisible to the API key.
