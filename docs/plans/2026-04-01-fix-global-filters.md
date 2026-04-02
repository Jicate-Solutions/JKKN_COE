# Global Filter Bug Fixes + Examination Session Selector

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 12 filtering bugs found in QA validation and add global Examination Session Selector to header.

**Architecture:** Three parallel workstreams — (1) Dashboard RPC/query fixes via Supabase migration, (2) API security hardening with institution validation, (3) UI fixes + new Session Selector context/component.

**Tech Stack:** Next.js 15, Supabase PostgreSQL (RPCs, views), React Context API, Shadcn UI

---

## Completed Tasks

### Task 1: Examination Session Selector (DONE)
- Created: `context/examination-session-context.tsx` — Context provider + hooks
- Created: `components/layout/session-selector.tsx` — Header dropdown component  
- Modified: `components/layout/app-header.tsx` — Added SessionSelector next to InstitutionSelector
- Modified: `app/(coe)/layout.tsx` — Added ExaminationSessionProvider

### Task 2: Dashboard RPC Fixes (IN PROGRESS - Agent)
- Create: `supabase/migrations/20260401_fix_dashboard_rpc_functions.sql`
- Fix: `dashboard_student_count`, `dashboard_grade_distribution`, `dashboard_performance_trends` RPCs

### Task 3: API Security Fixes (IN PROGRESS - Agent)
- Fix: `app/api/post-exam/external-marks/route.ts` — Add institutions_id validation to POST
- Fix: `app/api/students/fetch-all/route.ts` — Make institution_id required
- Fix: `app/api/room-allocations/route.ts` — Add institutions_id filter to GET
- Fix: `app/api/seat-allocations/route.ts` — Add institutions_id filter to GET

### Task 4: UI Fixes (IN PROGRESS - Agent)
- Fix: `app/(coe)/dashboard/page.tsx` — Access Status shows selected institution name
- Fix: `app/(coe)/master/programs/page.tsx` — Hide Inst. Code column when specific institution selected
