# Central Valuation (CV) Report — Specification & Development Guide

**Module:** `/reports/cv-report`
**Status:** Production
**Last Updated:** 2026-05-07

---

## 1. Overview

The CV Report module produces three institution-level reports for Central Valuation:

| Tab | Report | Purpose |
|-----|--------|---------|
| 1 | **CV Pass Percentage** | Course-wise appeared / passed / pass % for the selected board |
| 2 | **CV for Examiner** | Per-examiner mark-distribution and pass/fail counts |
| 3 | **CV Panel of Examiners** | Chief-grouped panel of all examiners assigned to the board |

All three are downloadable as PDF and respect the JKKN multi-tenant institution filter.

---

## 2. Routes

### 2.1 Page

| Path | File |
|------|------|
| `/reports/cv-report` | `app/(coe)/reports/cv-report/page.tsx` |

### 2.2 API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/reports/cv-report/pass-percentage` | Pass percentage by course for a board |
| GET | `/api/reports/cv-report/examiner-valuation?action=list-examiners` | List all examiners on a board |
| GET | `/api/reports/cv-report/examiner-valuation?examiner_key=...` | Mark distribution for one examiner |
| GET | `/api/reports/cv-report/panel-of-examiners` | Panel grouped by Chief |
| GET | `/api/post-exam/central-valuation/boards` | Reused for board dropdown |
| GET | `/api/pre-exam/examiner-allotment?action=institutions` | Reused for institution dropdown |
| GET | `/api/pre-exam/examiner-allotment?action=sessions&institutionId=…` | Reused for session dropdown |

---

## 3. Filter Cascade & UI Behavior

### 3.1 Filters (top of page)

```
Institution → Examination Session → Board → (Examiner — only on tab 2)
```

| Field | Visibility | Default Value | Notes |
|-------|------------|---------------|-------|
| Institution | Visible only when `mustSelectInstitution=true` | Pulled from global filter when changed | Hidden for normal users — context auto-fills |
| Session | Always visible after institution is set | First load empty | Reset when institution changes |
| Board | Always visible after session is set | First load empty | Displayed as `CODE - NAME` (e.g., `UTA - TAMIL`) |
| Examiner | Only on tab `examiner` | Selected from list of examiners on the board | Hidden on other tabs |

### 3.2 Critical UI Rules

| Rule | Why |
|------|-----|
| `effectiveInstitutionId = selectedInstitutionId \|\| contextInstitutionId` | Combines local pick + global filter |
| Clear `selectedInstitutionId` when `mustSelectInstitution=true` and `contextInstitutionId` changes | Without this, super admin's old local pick overrides the new global filter |
| Load institutions for **all users** (not gated on `mustSelectInstitution`) | Required so `selectedInstitution` is resolved for PDF metadata even when dropdown is hidden |
| `panelData?.chiefs` must be null-guarded | `chiefs` may be undefined when the API returns no data |

---

## 4. Data Model & Source Tables

### 4.1 Tables Used

| Table | Used For | Key Columns |
|-------|----------|-------------|
| `board` | UG/PG detection, board name | `board_code`, `board_type` ('UG'/'PG'), `board_name`, `display_name` |
| `courses` | Course list per board, per-course pass mark | `id`, `course_code`, `course_name`, `external_pass_mark`, `board_code` |
| `course_mapping` | Semester + course order | `course_id`, `semester_code`, `course_order`, `is_active` |
| `exam_registrations` | Total students registered | `id`, `course_code`, `institutions_id`, `examination_session_id` |
| `exam_attendance` | Appeared count (Present) | `exam_registration_id`, `course_id`, `attendance_status` |
| `marks_entry` | Pass count via marks vs pass mark | `exam_registration_id`, `course_id`, `total_marks_obtained` |
| `bundle_numbers` | Bundle no. on examiner reports | `course_id`, `bundle_number` |
| `answer_sheet_packets` | Per-examiner packet allocation | `course_id`, `packet_no`, `total_sheets`, examiner role columns |
| `examiners` | External examiner names | `id`, `full_name`, `designation` |

### 4.2 Important Schema Constraints

> **`courses` table does NOT have:**
> - `course_level`
> - `semester`
> - `course_order`
>
> Use `board.board_type` for UG/PG, and `course_mapping` for semester/order.

> **`exam_registrations` does NOT have `course_id`** — use `course_code` instead.

---

## 5. Report 1 — CV Pass Percentage

### 5.1 Aggregation Logic

For each course on the board:

```
total_students  = COUNT(exam_registrations) WHERE course_code AND institutions_id AND examination_session_id
appeared        = COUNT(exam_attendance) WHERE exam_registration_id IN regs AND attendance_status = 'Present'
passed          = COUNT(marks_entry)     WHERE exam_registration_id IN regs AND total_marks_obtained ≥ courses.external_pass_mark
pass_percentage = (passed / appeared) × 100
```

### 5.2 Pass Mark Resolution

```
passMark = courses.external_pass_mark
        ?? (board.board_type = 'PG' ? PG_FALLBACK=38 : UG_FALLBACK=30)
```

### 5.3 Semester Display

Semester is pulled from `course_mapping.semester_code` (e.g., `UCS-1`, `UBA-2`) and converted to Roman numerals for display:

| semester_code | Displayed As |
|---------------|--------------|
| `UCS-1` / `UBA-1` / etc. | `I` |
| `*-2` | `II` |
| `*-3` | `III` |
| `*-4` | `IV` |
| `*-5` | `V` |
| `*-6` | `VI` |

### 5.4 Sort Order

`semester_number ASC → course_order ASC → course_code ASC`

### 5.5 Response Schema

```ts
[
  {
    semester: 'I' | 'II' | …,
    course_code: '24UGTA01',
    course_name: 'GENERAL TAMIL-I',
    total_students: 226,
    appeared: 44,
    passed: 21,
    pass_percentage: 47.7
  }
]
```

---

## 6. Report 2 — CV for Examiner

### 6.1 Mark-Distribution Bands

Bands depend on **course level** (resolved via `board.board_type`):

| Level | Band 1 | Band 2 | Band 3 | Band 4 | Band 5 |
|-------|--------|--------|--------|--------|--------|
| UG    | 0–10 | 11–20 | 21–25 | 26–29 | Above 30 |
| PG    | 0–10 | 11–20 | 21–30 | 31–39 | Above 40 |

### 6.2 Pass / Fail Threshold

Per-course `external_pass_mark` from courses table. If null/zero, fall back to:

| Level | Fallback |
|-------|----------|
| UG | 30 |
| PG | 38 |

### 6.3 Examiner Types

`examiner_key` format: `<type>:<id>`

| Type | Source |
|------|--------|
| `internal` | `answer_sheet_packets.internal_examiner_staff_id` |
| `external` | `answer_sheet_packets.external_examiner_id` → joined to `examiners` table |
| `chief`    | `answer_sheet_packets.chief_examiner_staff_id` |
| `assistant`| `answer_sheet_packets.assistant_examiner_staff_id` |

### 6.4 Aggregation

For each packet allocated to the examiner:
- Slice `marks_entry` rows by `total_sheets` (sequential per course)
- Place each mark in the correct band
- Increment pass/fail using per-course pass mark
- Sum into per-row totals + grand total

### 6.5 Response Schema

```ts
{
  board_name: string,
  examiner_name: string,
  examiner_designation: string,
  course_level: 'UG' | 'PG',
  rows: ExaminerValuationRow[],
  totals: ExaminerValuationRow
}
```

---

## 7. Report 3 — CV Panel of Examiners

Groups all examiners on the board by Chief Examiner. For each chief, lists their examiners with:
- S.No, Examiner name + designation + institution
- Course code, Bundle, Pocket
- Papers per session, Cumulative total

Source: `answer_sheet_packets` joined with examiner ID columns.

---

## 8. PDF Generation

### 8.1 Files

| Report | Generator |
|--------|-----------|
| Pass Percentage | `lib/utils/generate-cv-pass-percentage-pdf.ts` |
| Examiner Valuation | `lib/utils/generate-cv-examiner-valuation-pdf.ts` |
| Panel of Examiners | `lib/utils/generate-cv-panel-of-examiners-pdf.ts` |
| Shared header/footer | `lib/utils/generate-cv-report-header.ts` |

### 8.2 Header Layout

```
┌─────────────────────────────────────────────────────────┐
│ [logoLeft]   J.K.K.NATARAJA COLLEGE OF…    [logoRight] │
│             (Accredited by NAAC, …)                     │
│             Komarapalayam - 638 183, Tamil Nadu         │
│             APRIL-MAY-2026                              │
│             PASS PERCENTAGE REPORT OF                   │
│             TAMIL DEGREE EXAMINATIONS APRIL-MAY-2026    │
│                                       Date: 07.05.2026  │
└─────────────────────────────────────────────────────────┘
```

### 8.3 Logos

Loaded as base64 in the page (not by the PDF generator) so the user only pays for one fetch:

```ts
const leftRes  = await fetch('/jkkn_logo.png')      // left
const rightRes = await fetch('/jkkncas_logo.png')   // right
```

Both are passed to the PDF generators as `logoLeft` / `logoRight`.

---

## 9. Multi-Tenant & Permission Rules

| Role | Behavior |
|------|----------|
| Normal user | Institution auto-filled from context. Dropdown hidden. |
| Super admin (specific institution) | Same as normal user — institution preselected. |
| Super admin (All Institutions) | Must select institution in the in-page dropdown. Dropdown re-syncs when global filter changes. |

The fix that makes super-admin → global filter work:

```tsx
useEffect(() => {
  if (isReady && mustSelectInstitution) setSelectedInstitutionId('')
}, [isReady, mustSelectInstitution, contextInstitutionId])
```

---

## 10. Development History (Fix Log)

| Date | Commit | Fix |
|------|--------|-----|
| 2026-05-07 | `8e0dbb2` | Sync CV Report institution dropdown with global filter changes |
| 2026-05-07 | `cd78730` | Load institutions for all users so PDF download works |
| 2026-05-07 | `cd23b30` | Logo loading + board dropdown CODE-NAME + panel null guard |
| 2026-05-07 | `2099f56` | Support PG mark bands in examiner valuation |
| 2026-05-07 | `cc1016f` | Set PG_PASS_THRESHOLD = 40 |
| 2026-05-07 | `706931c` | Adjust PG_PASS_THRESHOLD = 38 |
| 2026-05-07 | `6ce3873` | Use marks_entry, exam_attendance, per-course pass mark |
| 2026-05-07 | `77ef046` | Fix `course_level` doesn't exist — use `board.board_type` |
| 2026-05-07 | `6b74e3a` | exam_registrations uses course_code; semester from course_mapping; Roman numerals |

---

## 11. Known Constraints / Edge Cases

| Case | Behavior |
|------|----------|
| Course has no `external_pass_mark` set | Falls back to UG=30 / PG=38 based on `board.board_type` |
| Course has no `course_mapping` row | Semester is empty; sorted last |
| Examiner exists but assigned no packets | Excluded from `list-examiners` |
| `panelData.chiefs` is undefined | UI shows "No examiners assigned" instead of crashing |
| Logo fetch fails | PDF generates without logos (logged warning) |
| Network glitch on dropdowns | Shows toast: "Failed to load …" |

---

## 12. Testing Checklist

### Functional
- [ ] Normal user: open page → defaults to their institution → can download PDF
- [ ] Super admin "All Institutions": dropdown shows institutions, must select one
- [ ] Super admin changes global filter → in-page dropdown updates immediately
- [ ] Board dropdown shows `CODE - NAME` for all boards
- [ ] All three tabs render data
- [ ] PDF downloads and contains both logos
- [ ] Pass-percentage semester shows Roman numerals
- [ ] Examiner valuation bands change between UG and PG boards

### Data Integrity
- [ ] `total_students` = exam_registration count
- [ ] `appeared` = exam_attendance Present count
- [ ] `passed` = marks_entry count where total_marks_obtained ≥ external_pass_mark
- [ ] Per-course pass mark used (not blanket fallback) when configured

### Edge Cases
- [ ] Board with zero published courses → "No published results"
- [ ] Examiner with no packets → not in dropdown
- [ ] Panel with empty chief group → "No examiners assigned"
- [ ] Network failure during fetch → toast error, no crash

---

## 13. File Index

```
app/(coe)/reports/cv-report/
├── page.tsx                                             # UI

app/api/reports/cv-report/
├── pass-percentage/route.ts                             # Report 1
├── examiner-valuation/route.ts                          # Report 2 (list + detail)
└── panel-of-examiners/route.ts                          # Report 3

lib/utils/
├── generate-cv-report-header.ts                         # Shared header/footer
├── generate-cv-pass-percentage-pdf.ts
├── generate-cv-examiner-valuation-pdf.ts
└── generate-cv-panel-of-examiners-pdf.ts

public/
├── jkkn_logo.png                                        # Left logo
└── jkkncas_logo.png                                     # Right logo

hooks/
└── use-institution-filter.ts                            # Multi-tenant filter
```

---

## 14. Future Enhancements

- Make `external_pass_mark` mandatory in course master to remove the fallback
- Add semester filter to allow viewing one semester at a time
- Per-course PASS_THRESHOLD override for special cases (e.g., mathematics 35 vs general 30)
- Email PDF directly to chief examiners
- Add date-range filter for valuations crossing multiple sessions
