# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

```bash
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Build production bundle
npm run lint         # Run ESLint
```

**Key Paths:**
- Auth: `lib/auth/`, `middleware.ts`, `components/protected-route.tsx`
- API Routes: `app/api/`
- Pages: `app/(coe)/`
- Services: `services/`
- Types: `types/`
- Migrations: `supabase/migrations/`

## Database Architecture

**CRITICAL:** When debugging database issues, always check BOTH databases:

| Database | Contains | Key Tables |
|----------|----------|------------|
| **COE (Local Supabase)** | Exam data, registrations, marks, results | `exam_registrations`, `internal_marks`, `final_marks`, `course_offerings`, `institutions` |
| **MyJKKN (External API)** | Learner profiles, photos, DOB, batches | `learners_profiles` (via API), `student_photo_url`, `date_of_birth` |

**Common Mistake:** Learner photos/DOB do NOT exist in COE — always fetch from MyJKKN API.

## Project Overview

JKKN COE (Controller of Examination) — Next.js 15, TypeScript, Supabase, Shadcn UI, Tailwind CSS.

**Complete PRD:** `.claude/COE PRD.txt`

## JKKN Terminology Standards

**CRITICAL:** Always use JKKN terminology:

| Use | Never use |
|-----|-----------|
| **Learner** | Student |
| `learner_id` | `student_id` |
| `/learners` | `/students` |
| "Needs improvement" | "Failed" |
| "Learning opportunity" | "Backlog" |

## Architecture

**Auth flow:** Google OAuth → Supabase Auth → Middleware → Auth Context → Protected Routes

**Public routes:** `/login`, `/auth/callback`, `/contact-admin`, `/verify-email`, `/`

**Multi-tenant:** Users see only their institution's data unless `super_admin`.
- Hook: `useInstitutionFilter()` from `hooks/use-institution-filter.ts`
- `mustSelectInstitution` — true when super_admin views "All Institutions"
- `getInstitutionIdForCreate()` — returns institution ID for new records
- Full guide: `.claude/skills/myjkkn-coe-dev-rules/SKILL.md`

**MyJKKN field name differences:**

| MyJKKN | COE | Note |
|--------|-----|------|
| `course_name` | `course_title` | Different name |
| `program_id` | `program_code` | Is a CODE string ("BCA"), not UUID |
| `institution_id` | `institutions_id` | COE uses plural |
| `college_email` | `learner_email` | — |

**MyJKKN rules:**
1. Use `myjkkn_institution_ids` array directly — no two-step lookup
2. Server-side filtering is unreliable — always filter client-side by `institution_id`
3. Deduplicate by CODE field, not `id`
4. Always handle both shapes: `const data = response.data || response || []`

## Code Style

Tabs, single quotes, no semicolons, strict equality (`===`). Default Server Components; `'use client'` only when needed.

## Debugging

| Symptom | Check First |
|---------|-------------|
| Course missing from marksheet | `final_marks.status` = `Pending` not `Published`? |
| Learner photo not showing | `student_photo_url` null → fetch from MyJKKN API |
| Marks not in report | `is_locked` = false (amber state)? |
| Export showing wrong data | Filtering by correct `institution_id`? |

**Data status:** `Draft → Pending → Published → Locked`

## Important Notes

- **RLS Bypass:** Service role key bypasses RLS — use in server API routes only
- **Row Limits:** Use `.range(0, 9999)` to override Supabase's default 1000-row limit
- **Race Conditions:** Use atomic updates with `.is('used_at', null)`
- **Institution in Updates:** Never allow changing `institutions_id` after record creation
- **FK Auto-Mapping:** Always resolve `institution_code` → UUID before insert; store both

## Skills Reference

Use these skills for detailed patterns — do not ask Claude to reproduce them inline:

| Task | Skill |
|------|-------|
| Build CRUD page | `entity-crud-page-builder` |
| API route templates | `nextjs-module-builder` |
| MyJKKN integration rules | `myjkkn-coe-dev-rules` |
| UI patterns (tables, forms, sheets) | `saas-ui-patterns` |
| Excel import/export | `excel-import-export` |
| Institution filtering | `institution-filter` |
| Schema changes | `supabase-schema-change` |
| Debug database | `debug-db` |
| PDF reports | `pdf-processing-pro` |
| Role-based access (6 roles, route guards) | `rbac-coe-permissions` |
| Audit trail for mark changes | `exam-audit-trail` |
| Exam registration + eligibility checks | `exam-registration` |
| Hall ticket PDF + QR generation | `hall-ticket-pdf` |
| Mark entry draft/submit/approve flow | `mark-entry-workflow` |
| CIA+ESE result compilation + grace marks | `result-compilation` |
| Multi-level result declaration approval | `result-declaration-workflow` |
| Grade card / marksheet PDF | `grade-card-pdf` |
| Semester marksheet PDF (data fetch, arrears, part GPA, batch) | `semester-marksheet-pdf` |
| Revaluation application + result revision | `revaluation-system` |
| Question bank + Bloom's taxonomy + blueprints | `question-bank` |
