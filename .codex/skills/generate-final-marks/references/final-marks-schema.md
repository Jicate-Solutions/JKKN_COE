# final_marks table schema

Complete column reference for the `final_marks` table written by `POST /api/grading/final-marks`.

## Columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `institutions_id` | uuid (FK) | → institutions.id; filters every query |
| `examination_session_id` | uuid (FK) | → examination_sessions.id |
| `exam_registration_id` | uuid/text (FK) | → exam_registrations.id; `cia-virtual-{id}` for CIA fallback |
| `course_offering_id` | uuid (FK) | → course_offerings.id |
| `program_id` | uuid (FK) | → programs.id |
| `course_id` | uuid (FK) | → courses.id |
| `student_id` | uuid (FK) | learner id |
| `internal_marks_id` | uuid (FK, nullable) | → internal_marks.id |
| `marks_entry_id` | uuid (FK, nullable) | → marks_entry.id |
| `internal_marks_obtained` | numeric | capped at internal max |
| `internal_marks_maximum` | numeric | |
| `external_marks_obtained` | numeric | capped at external max |
| `external_marks_maximum` | numeric | |
| `total_marks_obtained` | numeric | internal + external |
| `total_marks_maximum` | numeric | |
| `percentage` | numeric | `round(total/totalMax * 100, 2)`, normalized to 100-scale |
| `grace_marks` | numeric | |
| `grace_marks_reason` | text (nullable) | |
| `letter_grade` | text | e.g. 'O', 'A+', 'U', 'AAA' (absent) |
| `grade_points` | numeric | `round(percentage / 10, 2)` |
| `grade_description` | text | |
| `credit` | numeric | course credit |
| `total_grade_points` | numeric | grade_points × credit (credit points) |
| `is_pass` | boolean | |
| `pass_status` | enum | see below |
| `result_status` | enum | see below; initial = 'Pending' |
| `is_moderated` | boolean | |
| `moderated_by` | uuid (FK, nullable) | |
| `moderation_date` | timestamp (nullable) | |
| `marks_before_moderation` | numeric (nullable) | |
| `is_locked` | boolean | |
| `locked_by` | uuid (FK, nullable) | |
| `locked_date` | timestamp (nullable) | |
| `calculated_by` | uuid (FK, nullable) | |
| `calculated_at` | timestamp (nullable) | |
| `is_active` | boolean | |
| `created_at` | timestamp | |
| `updated_at` | timestamp (nullable) | |

## Enums

- **`pass_status`**: `Pass` | `Fail` | `Reappear` | `Absent` | `Withheld` | `Expelled`
- **`result_status`**: `Pending` | `Published` | `Withheld` | `Cancelled` | `Under Review`

## Upsert conflict key

```
onConflict: 'institutions_id,exam_registration_id,course_offering_id'
```

Any existing row with a non-null `result_status` on a selected course blocks regeneration (400).
