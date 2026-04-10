---
name: debug-db
description: Debug database issues in the JKKN COE dual-database architecture. Use when diagnosing missing data, failed queries, data not appearing in UI, or investigating table relationships. Covers both COE (local Supabase) and MyJKKN (external API) databases. Triggers on 'debug database', 'data missing', 'query failing', 'table error', 'data not showing', 'why is X empty', or any database troubleshooting.
---

# Debug Database Issues

## Dual-Database Check

COE has two data sources. Always check BOTH before concluding data is missing.

| Database | Contains | Access Method |
|----------|----------|---------------|
| **COE (Supabase)** | Exam data, registrations, marks, results, institutions | Direct Supabase queries |
| **MyJKKN (API)** | Learner profiles, photos, DOB, batches, programs | REST API via `myjkkn_institution_ids` |

**Common trap:** Learner photos, DOB, and batch info do NOT exist in COE — fetch from MyJKKN API.

## Debugging Workflow

1. **Identify the table** — Determine which database owns the data
2. **Check data status** — `Draft → Pending → Published → Locked`
3. **Verify relationships** — Check FK references are valid UUIDs (not codes)
4. **Inspect filters** — Ensure `institutions_id` filter is correct
5. **Check row limits** — Default Supabase limit is 1000 rows; use `.range(0, 9999)`

## Status-Based Checklist

| Symptom | Check First |
|---------|-------------|
| Course missing from marksheet | Is `final_marks.status` = `Pending` instead of `Published`? |
| Learner photo not showing | Is `student_photo_url` null in COE? → Fetch from MyJKKN API |
| Marks not appearing in report | Is course `is_locked` = false? |
| Export showing wrong data | Filtering by correct `institution_id`? |
| FK violation on insert | Resolve code → UUID before insert |

## Common PostgreSQL Error Codes

- `23505` — Duplicate key (unique constraint violation)
- `23503` — Foreign key violation (referenced record missing)
- `23514` — Check constraint violation
- `23502` — Not-null violation

## MyJKKN Data Debugging

When data appears missing but lives in MyJKKN:

1. Get `myjkkn_institution_ids` from COE `institutions` table
2. Call MyJKKN API with each ID
3. Filter response client-side by `institution_id`
4. Deduplicate by CODE field, not by `id`
