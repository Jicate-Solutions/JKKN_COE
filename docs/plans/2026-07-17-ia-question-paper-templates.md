# Internal Assessment Question Paper Templates & Authoring

**Date:** 2026-07-17
**Status:** Design / awaiting approval
**Module home:** `app/(coe)/pre-exam/question-paper-templates/` + `app/(coe)/pre-exam/question-papers/`

## 1. Goal

Let COE define **configurable question-paper format templates** (like the attached CIA I&II
sample: Part A 5×1 MCQ, Part B 1×5, Part C 2×10 = 30 marks) at the institution level,
then — for **each exam session → CIA round (CIA 1/2/3) → each registered course** — scaffold a
question paper from the applicable template, let faculty fill in the actual questions manually,
and export a printable PDF matching the sample layout.

## 2. Interview decisions (locked)

| Decision | Answer |
|----------|--------|
| Scope | Full workflow: **template designer + manual question authoring + PDF export** |
| Template model | **Fully configurable builder** (add/remove parts, marks, types) — not fixed presets |
| Question source | **Manual entry** per course per CIA round (paper scaffolds from template) |
| Question types | MCQ (option count **3 or 4, configurable**), short answer, essay/long, fill-blank/TF — **and institutions define their own**: question types are a **configurable lookup**, not a fixed enum |

## 3. What already exists (reuse — do NOT rebuild)

- **CIA rounds:** `cia_entry_settings` (holds `cia_rounds` JSONB) + `cia_marks.cia_round` (1/2/3). The
  exam-session → CIA-round dimension is already modeled — key off it, don't invent new CIA ids.
- **Course anchor:** `exam_registrations` → `course_offerings` (session+program+semester+section) →
  `course_mapping`/`courses`. "Courses registered this session" comes from here.
- **Versioned template pattern:** `internal_assessment_patterns` (+ `pattern_course_associations`,
  `pattern_program_associations`, resolver `get_applicable_pattern()`). We **mirror its shape** for
  template resolution (course-specific → program-specific → institution default).
- **Course paper config on `courses`:** `qp_code`, `exam_duration`, `internal_max_mark`,
  `multiple_qp_set`, `no_of_qp_setter`, `no_of_scrutinizer`.
- **PDF infra:** `pdf_institution_settings` (letterhead / CoE signature) — reuse for paper PDF.
- **Institution scoping:** `institutions_id` FK everywhere + `useInstitutionFilter()`.
- **CO / Bloom (K-level):** greenfield — **nothing to reuse**. Captured as fields on the template &
  paper (see §5). Bloom levels seeded from the `question-bank` skill reference.

## 4. Data model (new tables — migration `20260717_create_ia_question_paper_templates.sql`)

All tables: `institutions_id UUID` FK, UUID PK (`gen_random_uuid()`), audit cols, `updated_at`
trigger, RLS enabled (authenticated read + service_role manage), mirroring
`internal_assessment_patterns` conventions.

### 4a. `ia_question_types` — the configurable type registry (institution-owned)
> This is what makes "institutions decide their own types" work.

| Column | Notes |
|--------|-------|
| `id`, `institutions_id` | |
| `type_code`, `type_label` | e.g. `mcq` / "Multiple Choice", `short` / "Short Answer" |
| `is_objective` | bool — objective vs descriptive |
| `has_options` | bool — shows option rows (MCQ, T/F) |
| `default_option_count` | int (e.g. 4 or 3) — editable per template part |
| `display_order`, `is_active` | |

Seeded with sensible defaults (MCQ-4, Short, Essay, Fill-blank, True/False); COE can add/edit/disable.

### 4b. `ia_paper_templates` — template header (mirror `internal_assessment_patterns`)

`id`, `institutions_id`, `institution_code`, `regulation_id`, `regulation_code`,
`template_code`, `template_name`, `description`,
`exam_scope` (`cia` | `ese` | `all`), `total_marks` (auto-summed from parts), `duration_minutes`,
applicability (`course_type_applicability`, `program_type_applicability`),
`wef_date`, `version_number`, `status` (`draft`|`active`|`archived`), `is_default`,
`capture_co` / `capture_klevel` (defaults, overridable per part),
`created_by`, `approved_by`, timestamps.
Unique `(institutions_id, template_code, version_number)`.

### 4c. `ia_template_parts` — the parts (Part A / B / C …)

`id`, `template_id`, `part_label` ("A"), `part_title` ("PART A"), `instruction`
("Answer ALL questions, choosing correct answer"),
`question_type_code` (→ `ia_question_types`), `num_questions`, `marks_per_question`,
`has_choice` (OR) + `choice_group_size`, `option_count` (for MCQ; null otherwise),
`capture_co`, `capture_klevel`, `display_order`,
`part_max_marks` (computed = num_questions × marks_per_question, adjusted for choice).
Template `total_marks` = Σ parts.

### 4d. `ia_question_papers` — one paper instance per course per CIA round

`id`, `institutions_id`, `examination_session_id`, `cia_setting_id`, `cia_round`, `cia_round_name`,
`course_offering_id`, `course_id`, `course_code`, `program_code`, `semester`,
`template_id`, `template_version`, `set_number` (for `multiple_qp_set`),
`status` (`draft`|`submitted`|`approved`|`locked`), `paper_setter_id`,
`subject_title`, `exam_date`, `duration_minutes`, `max_marks`,
`created_by`, `approved_by`, timestamps.
Unique `(cia_setting_id, cia_round, course_offering_id, set_number)`.

### 4e. `ia_paper_questions` — the actual questions filled in

`id`, `paper_id`, `part_id`, `part_label`, `question_number` (7), `sub_label` (a/b),
`is_choice_alternative` (the "(OR)" branch), `question_text`, `marks`,
`options` JSONB (`[{key:"a",text:"…"}]` for MCQ), `correct_option`,
`co_code` (CO1…), `k_level` (K1…K6 / Bloom), `display_order`.

## 5. Workflow

1. **Configure types** — COE reviews/edits `ia_question_types` (once per institution).
2. **Design template** — COE builds a template: add parts, pick a question type per part, set
   count/marks/choice/option-count, toggle CO & K-level capture. Live "Total = 30" preview mirroring
   the sample. Save as draft → activate.
3. **Assign** — set template as institution default and/or attach to specific regulations/programs/
   courses (course-specific → program → default resolution, same as `get_applicable_pattern`).
4. **Scaffold papers** — for a chosen exam session + CIA round, "Generate papers" enumerates the
   registered courses (`course_offerings` for that session) and creates one `ia_question_papers` +
   empty `ia_paper_questions` slots from the applicable template (respecting `multiple_qp_set`).
5. **Author** — faculty/paper-setter opens a paper, fills question text, options, CO, K-level into the
   pre-built slots. Autosave (draft). Validation: all slots filled, marks total matches template.
6. **Submit → Approve → Lock** — status machine (reuse the mark-entry approval pattern).
7. **Export PDF** — render the paper in the exact sample layout (college header, session, subject
   code/title, time, max marks, Part A/B/C tables with CO + K-level columns), with the CoE letterhead
   from `pdf_institution_settings`. Bulk export (zip) for a whole session/round.

## 6. Module layout (copy internal-assessment-patterns 5-layer shape)

```
types/ia-question-paper.ts
services/pre-exam/ia-question-paper-service.ts
app/api/pre-exam/question-paper-templates/route.ts          # template CRUD
app/api/pre-exam/question-paper-templates/[id]/parts/route.ts
app/api/pre-exam/question-types/route.ts                    # type registry CRUD
app/api/pre-exam/question-papers/route.ts                   # paper list + generate
app/api/pre-exam/question-papers/[id]/route.ts              # single paper + questions
app/api/pre-exam/question-papers/[id]/pdf/route.ts          # PDF export
app/(coe)/pre-exam/question-paper-templates/page.tsx        # designer (list + builder Sheet)
app/(coe)/pre-exam/question-papers/page.tsx                 # generate + author + export
supabase/migrations/20260717_create_ia_question_paper_templates.sql
```

## 7. RBAC

New page permissions (sidebar keys off `page.*.view` per project convention):
`ia_template.view/manage`, `ia_question_paper.view/enter/approve/export`.
Seed migration mirroring `20260518_seed_generate_internal_marks_permission.sql`.

## 8. Suggested phasing

- **Phase 1** — Migration + `ia_question_types` registry + template designer (§4a–4c, designer UI).
  *Deliverable: COE can build & save configurable templates.*
- **Phase 2** — Paper scaffolding from template + manual authoring UI + status machine (§4d–4e).
- **Phase 3** — PDF export matching the sample layout + bulk export + RBAC seed.

## 9. Resolved decisions (round 2)

1. **CO source → seed CO list per course, pick from dropdown.** Adds a small CO master:
   `ia_course_outcomes` (`id`, `institutions_id`, `course_id`, `course_code`, `co_code`,
   `co_description`, `display_order`, `is_active`). `ia_paper_questions.co_code` picks from it.
   A lightweight CO-master screen precedes authoring (Phase 1 or early Phase 2).
2. **Authoring → both CoE + assigned faculty.** CoE has full access; faculty scoped to their assigned
   course papers via a **paper-setter role** (uses `courses.no_of_qp_setter`). Adds a
   `ia_paper_setters` assignment table (`paper_id` or `course_offering_id` → `faculty_id`) + RBAC
   scoping in Phase 2.
3. **Paper sets → honor `courses.multiple_qp_set` now.** Scaffolding generates N sets (Set A/B…) per
   course when the flag is set; `ia_question_papers.set_number` already models this. PDF export labels
   the set.
4. **Approval → single approve.** Status machine `draft → submitted → approved → locked` (no separate
   scrutinizer stage in v1; `no_of_scrutinizer` deferred).
```
