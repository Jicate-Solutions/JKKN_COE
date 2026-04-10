# NAD Report — Standalone Page Design

**Date:** 2026-04-09
**Author:** Viswanathan (with Claude)
**Status:** Approved — ready for implementation planning

---

## 1. Problem

The NAD/ABC CSV export is currently buried as a tab inside `/result/dashboard?tab=nad`,
alongside unrelated result-analytics dashboards (College, Program, Subject, NAAC).
This coupling creates three problems:

1. **Role leakage.** A `nad_coordinator` user has no business seeing the other analytics
   tabs, but today they see the full Result Analytics menu group just to access NAD.
2. **UX drift.** The NAD tab mixes compliance analytics (header card, metric tiles,
   charts) with the CSV download — two fundamentally different operations fighting for
   screen real estate.
3. **Code weight.** The dashboard page is 3,055 lines. NAD-specific state, handlers,
   and markup inflate it further and slow every unrelated edit.

## 2. Goal

Move NAD/ABC CSV export to a focused, permission-gated standalone page at
`/reports/nad`, aligned with the existing reports folder pattern. Delete the NAD tab
from the Result Analytics dashboard entirely (with a one-release redirect for existing
`?tab=nad` bookmarks).

## 3. Non-goals

- Not creating new permissions — `nad.view` / `nad.export` already exist and are
  assigned to the relevant roles via migration `20260307_create_nad_coordinator_role.sql`.
- Not assigning the `nad_coordinator` role to any specific user — that is done
  through the existing `/users/user-roles` admin UI.
- Not porting the NAD compliance analytics (header card, metric tiles, sync status,
  charts) to the new page — the new page is strictly an export tool.
- Not modifying `nad_abc_upload_view` or the TOT_CREDIT bulk-fetch logic (both
  recently fixed in the pivot export route).
- Not deleting orphaned compliance-summary API endpoints — flag them but leave them
  alone; orphan cleanup is a separate decision.

## 4. Existing state (pre-implementation)

| Item | State |
|---|---|
| `nad_coordinator` role | ✅ Exists in DB |
| `nad.view` / `nad.export` permissions | ✅ Exist, mapped to `nad_coordinator`, `super_admin`, `coe`, `deputy_coe`, `admin` |
| `/api/result-analytics/nad-csv-export` | ✅ Works (24-column official format, one row per subject) |
| `/api/result-analytics/nad-pivot-export` | ✅ Works (pivot format, SUB1..SUBn columns; TOT_CREDIT / TOT_CREDIT_POINTS now sourced from `semester_results`) |
| `/result/dashboard?tab=nad` | ⚠️ Current location of NAD CSV download |
| `/reports/nad` | ❌ Does not exist — **will be created** |
| Users assigned to `nad_coordinator` | 0 |

## 5. Design

### 5.1 File layout

```
app/(coe)/reports/nad/page.tsx                       ← NEW
app/api/result-analytics/nad-csv-export/route.ts     ← MODIFIED (add count_only=true branch + perm check)
app/api/result-analytics/nad-pivot-export/route.ts   ← MODIFIED (add count_only=true branch + perm check)
app/(coe)/result/dashboard/page.tsx                  ← MODIFIED (remove NAD tab + handlers + state)
lib/navigation-data.ts                               ← MODIFIED (move NAD nav entry)
lib/auth/check-permission.ts                         ← NEW or reused (server-side permission helper)
```

### 5.2 Page shell — `/reports/nad`

- `'use client'` React component wrapped in `<ProtectedRoute requiredPermissions={['nad.view']}>`.
- Standard page chrome: `<AppSidebar>` + `<AppHeader>` + `<AppFooter>` + breadcrumb
  (`Reports > NAD Report`) — matches the `/reports/semester-marksheet` pattern.
- Three stacked cards: **Filter bar**, **Preview**, **Download**.

### 5.3 Filter bar (Card 1)

| Field | Type | Required? | Source |
|---|---|---|---|
| Examination Session | Combobox (searchable single-select) | required | `/api/examination-sessions?institutions_id=<current>` |
| Program | Combobox ("CODE - NAME") | required | `/api/programs?institutions_id=<current>` (via `useMyJKKNInstitutionFilter`) |
| Semester | Multi-select chips, optional | optional | Static 1..10 |

Institution comes from the global `useInstitutionFilter()` context. If the user is
`super_admin` with "All Institutions" selected, render the standard
`mustSelectInstitution` empty state.

### 5.4 Preview card (Card 2) — the count_only API branch

Both export routes gain a `count_only=true` query parameter that short-circuits the
CSV generation and returns a JSON summary:

```json
{
  "student_count": 12,
  "subject_row_count": 84,
  "unpublished_semester_result_count": 12,
  "students_missing_semester_result": 0,
  "semester_filter_applied": [1],
  "can_download": true
}
```

After both required filters are set, the page debounces (400ms) and hits the pivot
endpoint with `count_only=true`. The preview card displays:

- Student count, subject-row count, and a semester badge.
- **Amber warning** if `unpublished_semester_result_count > 0` — explains that
  TOT_CREDIT still resolves from `semester_results` (recent fix).
- **Red warning** if `students_missing_semester_result > 0` — those students will
  hit the fallback path (subject-sum) and TOT_CREDIT may overstate credits.
- Empty state if `student_count === 0`; download buttons hidden.

**Why reuse the export endpoint rather than creating a separate preview endpoint:**
one source of truth for filter logic. A separate endpoint would drift.

### 5.5 Download section (Card 3)

Two side-by-side buttons (stacked on mobile):

- **Pivot CSV** — one row per learner with SUB1..SUBn columns. For ABC portal bulk upload.
- **Official CSV** — 24 fixed columns, one row per subject. For NAD portal audit.

Each button is disabled until `preview.can_download && hasPermission('nad.export')`.
If the user has `nad.view` but not `nad.export`, the buttons render with a padlock icon
and a tooltip explaining the missing permission. Download triggers the existing CSV
endpoints unchanged.

Filenames: `nad_pivot_{program}_{session}_{date}.csv`,
`nad_official_{program}_{session}_{date}.csv`.

### 5.6 Permission gating — three layers

**Layer 1 — Route-level (server-side, UI):**
```tsx
<ProtectedRoute requiredPermissions={['nad.view']}>
  <NADReportContent />
</ProtectedRoute>
```

**Layer 2 — API-level (server-side, data):**

| Endpoint call | Permission required |
|---|---|
| `GET …/nad-pivot-export?...&count_only=true` | `nad.view` |
| `GET …/nad-pivot-export?...` (CSV) | `nad.export` |
| `GET …/nad-csv-export?...&count_only=true` | `nad.view` |
| `GET …/nad-csv-export?...` (CSV) | `nad.export` |

Both routes gain a `checkUserPermission()` helper call before running the query.
If the helper does not already exist in `lib/auth/`, it is added:

```sql
SELECT 1
FROM user_roles ur
JOIN role_permissions rp ON rp.role_id = ur.role_id
JOIN permissions p       ON p.id = rp.permission_id
WHERE ur.user_id = $1
  AND p.name   = $2
  AND p.is_active
LIMIT 1;
```

**Layer 3 — UI-level (client-side, UX polish):**
`hasPermission('nad.export')` controls the download button disabled state and tooltip.

### 5.7 Navigation changes — `lib/navigation-data.ts`

**Remove** the NAD entry from the Result Analytics group, and remove `nad_coordinator`
from that group's `coe_roles` (since NAD was the only reason it was there):

```diff
 {
   title: 'Result Analytics',
-  coe_roles: ['super_admin', 'coe', 'deputy_coe', 'nad_coordinator'],
+  coe_roles: ['super_admin', 'coe', 'deputy_coe'],
   items: [
     { title: 'Dashboard',        url: '/result/dashboard',             ... },
     { title: 'College Analysis', url: '/result/dashboard?tab=college', ... },
     { title: 'Program Analysis', url: '/result/dashboard?tab=program', ... },
     { title: 'Subject Analysis', url: '/result/dashboard?tab=subject', ... },
     { title: 'NAAC Reports',     url: '/result/dashboard?tab=naac',    ... },
-    { title: 'NAD Compliance',   url: '/result/dashboard?tab=nad',     icon: Shield, coe_roles: [..., 'nad_coordinator'] },
   ],
 },
```

**Add** `nad_coordinator` to the Reports group's `coe_roles` (so the menu parent is
visible to that role) and insert the new NAD Report item:

```diff
 {
   title: 'Reports',
-  coe_roles: ['super_admin', 'coe', 'deputy_coe'],
+  coe_roles: ['super_admin', 'coe', 'deputy_coe', 'nad_coordinator'],
   items: [
     // ...existing reports...
+    {
+      title: 'NAD Report',
+      url: '/reports/nad',
+      icon: Shield,
+      coe_roles: ['super_admin', 'coe', 'deputy_coe', 'nad_coordinator'],
+    },
   ],
 },
```

### 5.8 Dashboard cleanup — `/result/dashboard`

Deletions, in order (to minimize cascade compile errors):

1. `<TabsContent value="nad">` block (~lines 2680-2900).
2. `<TabsTrigger value="nad">` entry (~line 1289).
3. Two NAD CSV buttons in the dashboard header toolbar (~lines 1005-1022).
4. `handleExportNADCSV` and `handleExportNAADPivotCSV` useCallback handlers (~lines 736-860).
5. `canAccessNAD` / `canExportNAD` role+permission checks (~lines 203-205).
6. NAD data-fetch `useEffect` and `loadingNaad` / `naadData` state.
7. NAD-only imports from lucide-react and component modules. Grep each one
   (`Target`, `Shield`, `LayoutGrid`, `Progress`, `CheckCircle2`, `Clock`,
   `ComplianceDashboardSkeleton`) before removing — keep anything used by other tabs.

**Backward-compat redirect.** Add a small `useEffect` at the top of the dashboard
component that redirects stale `?tab=nad` URLs:

```tsx
useEffect(() => {
  if (searchParams.get('tab') === 'nad') {
    router.replace('/reports/nad')
  }
}, [searchParams, router])
```

Leave this in place for one release cycle, then remove it in a follow-up commit.

**Pre-delete verification step.** Before removing the NAD data-fetch useEffect,
`grep` for `naadData`, `compliance_summary`, and the NAD compliance endpoint path
across the whole codebase. If any other page consumes them, leave the endpoint alone
and only delete the dashboard's fetch call. Flag any now-orphaned API route files
in the PR description but do not delete them.

### 5.9 Behavioral table — after all changes

| User role | Sees in sidebar | `/reports/nad` access | Preview | Download |
|---|---|---|---|---|
| `super_admin` | Full menu incl. "Reports → NAD Report" | ✅ | ✅ | ✅ |
| `coe` / `deputy_coe` / `admin` | Relevant menu incl. "Reports → NAD Report" | ✅ | ✅ | ✅ |
| `nad_coordinator` | **Only** "Reports → NAD Report" | ✅ | ✅ | ✅ |
| any other role | No NAD entries | ❌ (redirected) | ❌ (403) | ❌ (403) |

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Dashboard delete breaks unrelated tabs | Delete in the ordered sequence above, run `tsc --noEmit` after each major deletion, smoke-test every remaining tab |
| `?tab=nad` bookmarks silently fail | Add the 6-line redirect useEffect (Section 5.8) |
| Permission check helper doesn't exist | If `lib/auth/check-permission.ts` missing, add it during implementation using the SQL above |
| Preview count drifts from download count | Single endpoint with `count_only=true` branch means they use the exact same query path — drift impossible by construction |
| Orphaned compliance-summary endpoint | Flag it in the PR, do not delete (separate decision) |
| `nad_coordinator` user with only this role sees empty sidebar | Acceptable — the role's scope is literally "NAD exports only". The sidebar group label "Reports" is still visible, so the menu isn't completely empty |
| Another role inherits `nad.view` or `nad.export` unexpectedly | Already grep-checked: only `super_admin`, `coe`, `deputy_coe`, `admin`, `nad_coordinator` hold these permissions per the existing migration |

## 7. Testing strategy

### 7.1 Automated
- **TypeScript:** `npx tsc --noEmit` after dashboard deletion must pass with zero errors.
- **Lint:** `npm run lint` must pass.

### 7.2 Manual smoke test
1. Log in as `super_admin`, confirm `/reports/nad` renders, filters load, preview appears, both CSVs download and open correctly in a spreadsheet.
2. Log in as `coe` → same checks.
3. Create a test user with `nad_coordinator` role only via `/users/user-roles`. Log in and confirm:
   - Sidebar shows only "Reports → NAD Report"
   - `/reports/nad` renders
   - Both CSVs download successfully
   - `/result/dashboard` is **not** in the sidebar
   - Direct navigation to `/result/dashboard` redirects/denies (per existing route protection)
4. Create a test user with `nad.view` only (no `nad.export`). Confirm:
   - Page renders, preview renders
   - Both download buttons are disabled with the padlock tooltip
   - Manual `curl` to the export endpoint with this user's session returns 403
5. Log in as an unrelated role (e.g., `student_affairs`). Confirm:
   - No NAD nav entries
   - Direct navigation to `/reports/nad` redirects out
6. Navigate to the old URL `/result/dashboard?tab=nad` — confirm auto-redirect to `/reports/nad`.
7. Remaining dashboard tabs (Dashboard, College, Program, Subject, NAAC) still render correctly.

### 7.3 Data sanity
Using the NOV-DEC-2025 / UCH / Sem 1 filter (the test case from the TOT_CREDIT
investigation), confirm:
- Preview shows 12 students
- Preview shows an amber warning "12 unpublished"
- Downloaded Pivot CSV has 12 rows
- For students `25JUGCHE004/008/009/010/012`, TOT_CREDIT = **14** (not 22)
- For Pass students, TOT_CREDIT = 22

## 8. Open questions

None. All four clarification questions were answered during brainstorming:

1. **Dashboard tab fate:** Option 1 — remove entirely
2. **Page location:** Option 1 — `/reports/nad`
3. **Page scope:** Option 2 — filters + preview + both CSV buttons
4. **Permission handling:** Reuse existing `nad.view` / `nad.export`; gate the page
   only (no user-to-role assignment in this task)

## 9. Commit strategy

Recommended commits (one PR):

1. `feat(api): add count_only=true branch + permission check to NAD export routes`
2. `feat(reports): add standalone /reports/nad page with filter/preview/download UX`
3. `chore(nav): move NAD entry from Result Analytics to Reports group`
4. `refactor(dashboard): remove NAD tab, handlers, state, and add legacy URL redirect`

Each commit should be independently compilable and the test suite should pass after
each.
