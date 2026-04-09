# NAD Report Standalone Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move NAD/ABC CSV export out of the `/result/dashboard?tab=nad` tab into a focused, permission-gated standalone page at `/reports/nad`, and delete the NAD tab from the dashboard.

**Architecture:** Single client page under `app/(coe)/reports/nad/page.tsx` gated by `<ProtectedRoute requiredPermissions={['nad.view']}>`. Both NAD export API routes (`nad-pivot-export`, `nad-csv-export`) gain a `count_only=true` branch used by the page's preview card — same query path as the CSV download, guaranteeing preview/download agreement. A small server-side user-permission helper is added to `lib/auth/` and applied to both export routes. Navigation entries move from "Result Analytics → NAD Compliance" to "Reports → NAD Report". Dashboard NAD code is deleted after verifying no cross-tab references; a 6-line redirect handles stale `?tab=nad` URLs.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (SSR client via `@/lib/supabase-route-handler`), Tailwind, Shadcn UI, `useInstitutionFilter`, `useMyJKKNInstitutionFilter`, lucide-react icons.

**Design doc:** [`docs/plans/2026-04-09-nad-report-standalone-page-design.md`](./2026-04-09-nad-report-standalone-page-design.md) (committed in `b4be313`).

---

## Pre-flight

- [ ] Confirm you are on the `main` branch with a clean working tree **for the NAD-related files** listed in this plan. Unrelated uncommitted work (seen in prior `git status`) is fine — just don't stage it in the NAD commits.
- [ ] Confirm dev server can start: `npm run dev` → http://localhost:3000 loads the login page.
- [ ] Confirm you have Supabase MCP access to run verification SQL queries.

---

## Task 1 — Create server-side user-permission helper

**Purpose:** The existing `lib/api-auth/permission-check.ts` checks *external-app* token permissions, not user-session permissions. We need a helper that takes the current user's Supabase session and checks whether they hold a named permission (e.g., `nad.view`). This helper will be used by both export route modifications in Tasks 2 and 3.

**Files:**
- Create: `lib/auth/check-user-permission.ts`

**Step 1.1: Create the helper file**

Write this exact content to `lib/auth/check-user-permission.ts`:

```ts
/**
 * Server-side permission check for user sessions inside API route handlers.
 *
 * Mirrors the logic in /api/auth/permissions/current:
 *   1. Resolve the authenticated user from the SSR cookie-bound client.
 *   2. Look up the user row by email (falling back to the service client if
 *      RLS blocks the cookie client).
 *   3. super_admin users are allowed everything.
 *   4. Regular users: check the cached `users.permissions` JSONB first
 *      (same cache the UI's hasPermission() reads from). If missing, compute
 *      live from user_roles → role_permissions → permissions.
 *
 * Returns { ok: true, userId } when the permission is held; otherwise
 * { ok: false, status, error } with a suggested HTTP status code.
 */

import { createRouteHandlerSupabaseClient } from '@/lib/supabase-route-handler'
import { getSupabaseServer } from '@/lib/supabase-server'

export type PermissionCheckSuccess = {
	ok: true
	userId: string
	email: string
	isSuperAdmin: boolean
}

export type PermissionCheckFailure = {
	ok: false
	status: 401 | 403 | 500
	error: string
}

export type PermissionCheckOutcome = PermissionCheckSuccess | PermissionCheckFailure

export async function requireUserPermission(
	permissionName: string,
): Promise<PermissionCheckOutcome> {
	try {
		const routeClient = await createRouteHandlerSupabaseClient()
		const { data: authData, error: authErr } = await routeClient.auth.getUser()

		if (authErr || !authData?.user?.email) {
			return { ok: false, status: 401, error: 'Not authenticated' }
		}

		const email = authData.user.email

		// Try cookie client first; fall back to service client if RLS blocks
		let userRow: {
			id: string
			is_super_admin: boolean | null
			permissions: Record<string, boolean> | null
		} | null = null

		{
			const { data } = await routeClient
				.from('users')
				.select('id, is_super_admin, permissions')
				.eq('email', email)
				.maybeSingle()
			userRow = data
		}

		if (!userRow) {
			const svc = getSupabaseServer()
			const { data } = await svc
				.from('users')
				.select('id, is_super_admin, permissions')
				.eq('email', email)
				.maybeSingle()
			userRow = data
		}

		if (!userRow) {
			return { ok: false, status: 403, error: 'User record not found' }
		}

		// Super admins are allowed everything
		if (userRow.is_super_admin) {
			return {
				ok: true,
				userId: userRow.id,
				email,
				isSuperAdmin: true,
			}
		}

		// Prefer the cached JSONB permissions map
		const cached = userRow.permissions || {}
		if (cached[permissionName] === true) {
			return {
				ok: true,
				userId: userRow.id,
				email,
				isSuperAdmin: false,
			}
		}

		// Cache miss (or stale/empty) — compute live from normalized RBAC
		const svc = getSupabaseServer()
		const { data: userRoles } = await svc
			.from('user_roles')
			.select('role_id')
			.eq('user_id', userRow.id)
			.eq('is_active', true)
			.or('expires_at.is.null,expires_at.gt.now()')

		const roleIds = (userRoles ?? []).map(r => r.role_id)
		if (roleIds.length === 0) {
			return {
				ok: false,
				status: 403,
				error: `Forbidden: ${permissionName} permission required`,
			}
		}

		const { data: rolePerms } = await svc
			.from('role_permissions')
			.select('permissions!inner(name, is_active)')
			.in('role_id', roleIds)

		const holdsPermission = (rolePerms ?? []).some(rp => {
			const p = rp.permissions as unknown as { name: string; is_active: boolean } | null
			return p?.is_active !== false && p?.name === permissionName
		})

		if (!holdsPermission) {
			return {
				ok: false,
				status: 403,
				error: `Forbidden: ${permissionName} permission required`,
			}
		}

		return {
			ok: true,
			userId: userRow.id,
			email,
			isSuperAdmin: false,
		}
	} catch (err) {
		console.error('[requireUserPermission] Unexpected error:', err)
		return {
			ok: false,
			status: 500,
			error: 'Internal permission check error',
		}
	}
}
```

**Step 1.2: Type-check the new helper in isolation**

Run: `npx tsc --noEmit`

Expected: passes with zero errors. If errors appear about `permissions!inner(...)` typing, relax to `permissions(*)` and extract the field via a cast.

**Step 1.3: Commit**

```bash
git add lib/auth/check-user-permission.ts
git commit -m "feat(auth): add requireUserPermission helper for API routes

Server-side user-session permission checker matching the logic in
/api/auth/permissions/current. Used by NAD export routes to gate
count_only previews (nad.view) and CSV downloads (nad.export).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — Add `count_only=true` branch + permission check to `nad-pivot-export`

**Purpose:** The preview card on the new page will call this endpoint with `count_only=true` to get student count, subject-row count, and warning counters (unpublished semester results, students missing a semester result). Using the same endpoint as the CSV download guarantees the preview agrees with the downloaded file.

**Files:**
- Modify: `app/api/result-analytics/nad-pivot-export/route.ts`

**Step 2.1: Add the permission check at the start of `GET`**

Open `app/api/result-analytics/nad-pivot-export/route.ts`.

Find the `GET` function signature (near line 261) and the first lines inside the `try {` block. Insert the permission gate **before** the existing `const supabase = getSupabaseServer()` line.

Add this import near the other imports at the top of the file:

```ts
import { requireUserPermission } from '@/lib/auth/check-user-permission'
```

Then inside `GET`:

```ts
export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url)
		const countOnly = searchParams.get('count_only') === 'true'

		// Permission gate: count_only previews require nad.view, CSV downloads require nad.export
		const requiredPermission = countOnly ? 'nad.view' : 'nad.export'
		const permResult = await requireUserPermission(requiredPermission)
		if (!permResult.ok) {
			return NextResponse.json(
				{ error: permResult.error },
				{ status: permResult.status },
			)
		}

		const supabase = getSupabaseServer()
		// ... rest of existing logic unchanged for now
```

Move the existing `const { searchParams } = new URL(req.url)` line **up** to be the first line in `try` if it isn't already. If the existing code already parses `searchParams` earlier, keep one copy and delete any duplicate.

**Step 2.2: Add the `count_only=true` short-circuit branch**

Find the spot **after** student grouping, semester correction, semester filtering, and the `total_credits_earned` bulk fetch — i.e. after the block that ends around line 510 with:

```ts
console.log(
	`[NAD Export] Resolved semester_results credits for ${resolvedCount}/${studentMap.size} students ` +
	`(${unpublishedCount} from unpublished/draft rows)`
)
```

But **before** the "Calculate percentage and grade for each student" loop (around line 491 in the current file — the exact line will drift after Step 2.1's insertion).

Insert this short-circuit block:

```ts
		// ── count_only short-circuit ──────────────────────────────────────────
		// The preview card on /reports/nad calls with count_only=true to learn
		// how many students and subject-rows will be in the download, plus any
		// warnings about unpublished semester_results or missing rows. Returning
		// from the same endpoint that generates the CSV guarantees the preview
		// matches the download byte-for-byte.
		if (countOnly) {
			let subjectRowCount = 0
			let studentsMissingSemesterResult = 0
			const unpublishedStudentIds = new Set<string>()

			for (const student of Array.from(studentMap.values())) {
				subjectRowCount += student.subjects.length
				if (student.total_credits_earned === null) {
					studentsMissingSemesterResult++
				}
			}

			// unpublishedSemesterResultCount is the number of students whose
			// total_credits_earned WAS resolved but from an unpublished row.
			// That count was logged above as `unpublishedCount` — recompute here
			// because the log variable is out of scope after its block.
			// We use a small second pass querying semester_results directly with
			// is_published = false filter — cheap because we already have IDs.
			// NOTE: If you want to skip this extra query, just omit the field.
			let unpublishedSemesterResultCount = 0
			{
				const studentIds = Array.from(studentMap.values()).map(s => s.student_id)
				const examSessionIds = Array.from(
					new Set(Array.from(studentMap.values()).map(s => s.examination_session_id)),
				)
				if (studentIds.length > 0 && examSessionIds.length > 0) {
					const { data: unpubRows } = await supabase
						.from('semester_results')
						.select('student_id, examination_session_id')
						.in('student_id', studentIds)
						.in('examination_session_id', examSessionIds)
						.eq('is_active', true)
						.eq('is_published', false)
					unpublishedSemesterResultCount = unpubRows?.length ?? 0
				}
			}

			return NextResponse.json({
				student_count: studentMap.size,
				subject_row_count: subjectRowCount,
				unpublished_semester_result_count: unpublishedSemesterResultCount,
				students_missing_semester_result: studentsMissingSemesterResult,
				semester_filter_applied: semester ? [semester] : [],
				can_download: studentMap.size > 0,
			})
		}
		// ── end count_only ────────────────────────────────────────────────────
```

**Step 2.3: Verify nothing downstream is affected by the early return**

Run: `npx tsc --noEmit`

Expected: zero errors. The early return must not leave dangling variables. If it complains about unused vars, leave them — the CSV branch still uses them.

**Step 2.4: Manual smoke test via curl (or browser devtools)**

Start `npm run dev`. In another terminal (logged in as a user with `nad.view`):

```bash
# Get a session cookie from the browser after logging in.
# Then call the endpoint with count_only=true.
curl -i "http://localhost:3000/api/result-analytics/nad-pivot-export?institution_id=<INST>&examination_session_id=402d740b-0fcf-404c-8c8e-021b377da73f&program_id=<UCH_UUID>&semester=1&count_only=true" \
  --cookie "<your-session-cookie>"
```

Expected response body (values will vary):

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

If you see `401` → you're not logged in. `403` → your user lacks `nad.view`. `200` with CSV body → you forgot to include `count_only=true`.

**Step 2.5: Commit**

```bash
git add app/api/result-analytics/nad-pivot-export/route.ts
git commit -m "feat(api): add count_only=true branch to NAD pivot export

Preview endpoint for the new /reports/nad page. Returns a JSON summary
(student count, subject-row count, unpublished/missing counters, ready
flag) from the same query path as the CSV download so preview and
download can never disagree. Also adds nad.view / nad.export permission
gate via requireUserPermission.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — Add `count_only=true` branch + permission check to `nad-csv-export`

**Purpose:** Same as Task 2, but for the 24-column official format endpoint. This lets the preview card be backed by either export variant, and ensures both endpoints are permission-gated consistently.

**Files:**
- Modify: `app/api/result-analytics/nad-csv-export/route.ts`

**Step 3.1: Add the permission check and count_only branch**

Open `app/api/result-analytics/nad-csv-export/route.ts`. This route is simpler than the pivot export — it reads directly from `nad_abc_upload_view` with no bulk fetch.

Add the import:

```ts
import { requireUserPermission } from '@/lib/auth/check-user-permission'
```

At the start of `GET`, add:

```ts
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const countOnly = searchParams.get('count_only') === 'true'

		const requiredPermission = countOnly ? 'nad.view' : 'nad.export'
		const permResult = await requireUserPermission(requiredPermission)
		if (!permResult.ok) {
			return NextResponse.json(
				{ error: permResult.error },
				{ status: permResult.status },
			)
		}

		// ... existing filter parsing and query logic unchanged
```

Then, **after** the query has run and `viewData` is populated (around current line 115, after the `if (!viewData || viewData.length === 0)` check), insert the count_only short-circuit:

```ts
		// ── count_only short-circuit ──────────────────────────────────────────
		if (countOnly) {
			// The 24-column format has one row per student per subject.
			// student_count = distinct (student_id, exam_session_id) pairs.
			const studentKeys = new Set<string>()
			for (const row of viewData) {
				studentKeys.add(`${row.student_id}-${row.examination_session_id}`)
			}

			return NextResponse.json({
				student_count: studentKeys.size,
				subject_row_count: viewData.length,
				// Official CSV doesn't use semester_results fallback logic,
				// so these two counters are always 0 for this endpoint:
				unpublished_semester_result_count: 0,
				students_missing_semester_result: 0,
				semester_filter_applied: semester ? [semester] : [],
				can_download: studentKeys.size > 0,
			})
		}
		// ── end count_only ────────────────────────────────────────────────────
```

**Step 3.2: Type-check**

Run: `npx tsc --noEmit`

Expected: zero errors.

**Step 3.3: Smoke test**

Same curl pattern as Step 2.4 but hit `/api/result-analytics/nad-csv-export` instead. Expect a smaller `subject_row_count` value if the filter matches fewer subjects.

**Step 3.4: Commit**

```bash
git add app/api/result-analytics/nad-csv-export/route.ts
git commit -m "feat(api): add count_only=true branch to NAD official CSV export

Preview support for the /reports/nad page. Also adds permission gate
(nad.view for count_only, nad.export for CSV downloads).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — Create standalone `/reports/nad` page

**Purpose:** The user-facing page. Filter bar + preview card + two download buttons. Uses the same patterns as `app/(coe)/reports/semester-marksheet/page.tsx` for the shell (sidebar, header, breadcrumbs, institution filter) and mirrors the filter UI from the current dashboard NAD tab.

**Files:**
- Create: `app/(coe)/reports/nad/page.tsx`

**Step 4.1: Verify the protected-route component and its API**

Open `components/protected-route.tsx` and confirm the prop name is `requiredPermissions: string[]`. Reference: [components/protected-route.tsx](components/protected-route.tsx). If the prop is named differently in your copy, use whatever is there.

**Step 4.2: Write the page file**

Create `app/(coe)/reports/nad/page.tsx` with this exact content:

```tsx
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSessionSync } from '@/hooks/use-session-sync'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@/components/ui/command'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { useToast } from '@/hooks/common/use-toast'
import {
	Loader2,
	FileText,
	Check,
	ChevronsUpDown,
	Download,
	Users,
	BookOpen,
	AlertTriangle,
	AlertCircle,
	CheckCircle2,
	Shield,
	LayoutGrid,
	Lock,
	X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import ProtectedRoute from '@/components/protected-route'

// =====================================================
// TYPES
// =====================================================

interface ExamSession {
	id: string
	session_name: string
}

interface Program {
	program_code: string
	program_name: string
}

interface NadPreview {
	student_count: number
	subject_row_count: number
	unpublished_semester_result_count: number
	students_missing_semester_result: number
	semester_filter_applied: number[]
	can_download: boolean
}

const SEMESTER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// =====================================================
// PAGE
// =====================================================

export default function NADReportPage() {
	return (
		<ProtectedRoute requiredPermissions={['nad.view']}>
			<NADReportContent />
		</ProtectedRoute>
	)
}

function NADReportContent() {
	useSessionSync()
	const { toast } = useToast()
	const { hasPermission } = useAuth()
	const canExport = hasPermission('nad.export')

	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId,
	} = useInstitutionFilter()

	// Dropdown data
	const [examSessions, setExamSessions] = useState<ExamSession[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [loadingDropdowns, setLoadingDropdowns] = useState(false)

	// Filter state
	const [sessionId, setSessionId] = useState<string>('')
	const [programCode, setProgramCode] = useState<string>('')
	const [selectedSemesters, setSelectedSemesters] = useState<number[]>([])

	// Combobox open state
	const [sessionOpen, setSessionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)

	// Preview state
	const [preview, setPreview] = useState<NadPreview | null>(null)
	const [previewLoading, setPreviewLoading] = useState(false)
	const [previewError, setPreviewError] = useState<string | null>(null)

	// Download state
	const [downloadingPivot, setDownloadingPivot] = useState(false)
	const [downloadingOfficial, setDownloadingOfficial] = useState(false)

	// =====================================================
	// DROPDOWN FETCHING
	// =====================================================

	useEffect(() => {
		if (!isReady || mustSelectInstitution) return

		let cancelled = false
		async function loadDropdowns() {
			setLoadingDropdowns(true)
			try {
				const [sessionsRes, programsRes] = await Promise.all([
					fetch(appendToUrl('/api/examination-sessions')),
					fetch(appendToUrl('/api/programs')),
				])

				if (!sessionsRes.ok) throw new Error('Failed to load examination sessions')
				if (!programsRes.ok) throw new Error('Failed to load programs')

				const sessionsData = await sessionsRes.json()
				const programsData = await programsRes.json()

				if (cancelled) return

				setExamSessions(Array.isArray(sessionsData) ? sessionsData : sessionsData?.data || [])
				setPrograms(Array.isArray(programsData) ? programsData : programsData?.data || [])
			} catch (err) {
				if (cancelled) return
				console.error('[NAD Report] Dropdown load error:', err)
				toast({
					title: 'Failed to load filters',
					description: err instanceof Error ? err.message : 'Unknown error',
					variant: 'destructive',
				})
			} finally {
				if (!cancelled) setLoadingDropdowns(false)
			}
		}

		loadDropdowns()
		return () => { cancelled = true }
	}, [isReady, mustSelectInstitution, appendToUrl, toast])

	// =====================================================
	// PREVIEW FETCHING (debounced)
	// =====================================================

	const hasRequiredFilters = sessionId !== '' && programCode !== ''

	useEffect(() => {
		if (!hasRequiredFilters || !isReady || mustSelectInstitution) {
			setPreview(null)
			setPreviewError(null)
			return
		}

		let cancelled = false
		const timer = setTimeout(async () => {
			setPreviewLoading(true)
			setPreviewError(null)
			try {
				const params = new URLSearchParams()
				if (institutionId) params.set('institution_id', institutionId)
				params.set('examination_session_id', sessionId)
				params.set('program_id', programCode)
				if (selectedSemesters.length === 1) {
					params.set('semester', String(selectedSemesters[0]))
				}
				params.set('count_only', 'true')

				const res = await fetch(`/api/result-analytics/nad-pivot-export?${params}`)
				if (!res.ok) {
					const err = await res.json().catch(() => ({}))
					throw new Error(err.error || `Request failed (${res.status})`)
				}
				const data: NadPreview = await res.json()
				if (cancelled) return
				setPreview(data)
			} catch (err) {
				if (cancelled) return
				console.error('[NAD Report] Preview error:', err)
				setPreviewError(err instanceof Error ? err.message : 'Unknown error')
				setPreview(null)
			} finally {
				if (!cancelled) setPreviewLoading(false)
			}
		}, 400) // debounce

		return () => {
			cancelled = true
			clearTimeout(timer)
		}
	}, [hasRequiredFilters, isReady, mustSelectInstitution, institutionId, sessionId, programCode, selectedSemesters])

	// =====================================================
	// DOWNLOAD HANDLERS
	// =====================================================

	const buildParams = useCallback(() => {
		const params = new URLSearchParams()
		if (institutionId) params.set('institution_id', institutionId)
		params.set('examination_session_id', sessionId)
		params.set('program_id', programCode)
		if (selectedSemesters.length === 1) {
			params.set('semester', String(selectedSemesters[0]))
		}
		return params
	}, [institutionId, sessionId, programCode, selectedSemesters])

	const downloadCsv = useCallback(
		async (endpoint: string, filenamePrefix: string, setLoading: (v: boolean) => void) => {
			setLoading(true)
			try {
				const res = await fetch(`${endpoint}?${buildParams()}`)
				if (!res.ok) {
					const err = await res.json().catch(() => ({}))
					throw new Error(err.error || `Request failed (${res.status})`)
				}

				// Might be JSON (empty result) or CSV
				const contentType = res.headers.get('content-type') || ''
				if (contentType.includes('application/json')) {
					const data = await res.json()
					toast({
						title: 'No Data Found',
						description: data.message || 'No published results for the selected filters',
						variant: 'destructive',
					})
					return
				}

				const blob = await res.blob()
				const url = URL.createObjectURL(blob)
				const link = document.createElement('a')
				link.href = url
				const prog = programCode.replace(/[^a-zA-Z0-9_-]/g, '')
				const date = new Date().toISOString().split('T')[0]
				link.download = `${filenamePrefix}_${prog}_${date}.csv`
				document.body.appendChild(link)
				link.click()
				document.body.removeChild(link)
				URL.revokeObjectURL(url)

				toast({
					title: '✅ Export Complete',
					description: 'NAD CSV file downloaded',
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
				})
			} catch (err) {
				console.error('[NAD Report] Download error:', err)
				toast({
					title: '❌ Export Failed',
					description: err instanceof Error ? err.message : 'Unknown error',
					variant: 'destructive',
				})
			} finally {
				setLoading(false)
			}
		},
		[buildParams, programCode, toast],
	)

	const handleDownloadPivot = useCallback(() => {
		return downloadCsv('/api/result-analytics/nad-pivot-export', 'nad_pivot', setDownloadingPivot)
	}, [downloadCsv])

	const handleDownloadOfficial = useCallback(() => {
		return downloadCsv('/api/result-analytics/nad-csv-export', 'nad_official', setDownloadingOfficial)
	}, [downloadCsv])

	// =====================================================
	// DERIVED UI STATE
	// =====================================================

	const selectedSession = useMemo(
		() => examSessions.find(s => s.id === sessionId),
		[examSessions, sessionId],
	)
	const selectedProgram = useMemo(
		() => programs.find(p => p.program_code === programCode),
		[programs, programCode],
	)

	const canDownloadNow = preview?.can_download && canExport && !downloadingPivot && !downloadingOfficial

	// =====================================================
	// RENDER
	// =====================================================

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<div className="flex-1 space-y-6 p-4 md:p-8">
					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/">Home</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink>Reports</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>NAD Report</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page title */}
					<div className="flex items-center gap-3">
						<div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
							<Shield className="h-6 w-6 text-white" />
						</div>
						<div>
							<h1 className="text-2xl font-bold tracking-tight">NAD Report</h1>
							<p className="text-sm text-muted-foreground">Download NAD/ABC compliant CSV exports for the portal upload.</p>
						</div>
					</div>

					{/* mustSelectInstitution guard */}
					{mustSelectInstitution && (
						<Card>
							<CardContent className="p-12 text-center">
								<AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
								<p className="text-sm text-muted-foreground">
									Please select a specific institution from the header dropdown before using NAD Report.
								</p>
							</CardContent>
						</Card>
					)}

					{/* Filter bar */}
					{!mustSelectInstitution && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Report Filters</CardTitle>
								<CardDescription>Select filters to preview and download the NAD report.</CardDescription>
							</CardHeader>
							<CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
								{/* Examination Session */}
								<div className="space-y-2">
									<Label>Examination Session <span className="text-red-500">*</span></Label>
									<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between">
												{selectedSession ? selectedSession.session_name : 'Select session…'}
												<ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
											<Command>
												<CommandInput placeholder="Search session…" />
												<CommandList>
													<CommandEmpty>{loadingDropdowns ? 'Loading…' : 'No session found.'}</CommandEmpty>
													<CommandGroup>
														{examSessions.map(s => (
															<CommandItem
																key={s.id}
																value={s.session_name}
																onSelect={() => {
																	setSessionId(s.id)
																	setSessionOpen(false)
																}}
															>
																<Check className={cn('mr-2 h-4 w-4', sessionId === s.id ? 'opacity-100' : 'opacity-0')} />
																{s.session_name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Program */}
								<div className="space-y-2">
									<Label>Program <span className="text-red-500">*</span></Label>
									<Popover open={programOpen} onOpenChange={setProgramOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between">
												{selectedProgram ? `${selectedProgram.program_code} - ${selectedProgram.program_name}` : 'Select program…'}
												<ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
											<Command>
												<CommandInput placeholder="Search program…" />
												<CommandList>
													<CommandEmpty>{loadingDropdowns ? 'Loading…' : 'No program found.'}</CommandEmpty>
													<CommandGroup>
														{programs.map(p => (
															<CommandItem
																key={p.program_code}
																value={`${p.program_code} ${p.program_name}`}
																onSelect={() => {
																	setProgramCode(p.program_code)
																	setProgramOpen(false)
																}}
															>
																<Check className={cn('mr-2 h-4 w-4', programCode === p.program_code ? 'opacity-100' : 'opacity-0')} />
																{p.program_code} - {p.program_name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Semester (optional multi) */}
								<div className="space-y-2">
									<Label>
										Semester <span className="text-xs text-muted-foreground">(Optional - Multi)</span>
									</Label>
									<div className="flex flex-wrap gap-1.5">
										{SEMESTER_OPTIONS.map(sem => {
											const isSelected = selectedSemesters.includes(sem)
											return (
												<Badge
													key={sem}
													variant={isSelected ? 'default' : 'outline'}
													className="cursor-pointer select-none"
													onClick={() => {
														setSelectedSemesters(prev =>
															prev.includes(sem) ? prev.filter(x => x !== sem) : [...prev, sem],
														)
													}}
												>
													{sem}
													{isSelected && <X className="ml-1 h-3 w-3" />}
												</Badge>
											)
										})}
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Preview card */}
					{!mustSelectInstitution && hasRequiredFilters && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Preview</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								{previewLoading && (
									<div className="flex items-center gap-2 text-sm text-muted-foreground">
										<Loader2 className="h-4 w-4 animate-spin" />
										Fetching preview…
									</div>
								)}

								{previewError && !previewLoading && (
									<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/20 dark:border-red-900 dark:text-red-200">
										{previewError}
									</div>
								)}

								{preview && !previewLoading && !previewError && (
									<>
										<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
											<div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3">
												<Users className="h-5 w-5 text-purple-600" />
												<div>
													<p className="text-xs text-muted-foreground">Learners</p>
													<p className="text-xl font-bold tabular-nums">{preview.student_count}</p>
												</div>
											</div>
											<div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3">
												<BookOpen className="h-5 w-5 text-blue-600" />
												<div>
													<p className="text-xs text-muted-foreground">Subject rows</p>
													<p className="text-xl font-bold tabular-nums">{preview.subject_row_count}</p>
												</div>
											</div>
											<div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3">
												<FileText className="h-5 w-5 text-emerald-600" />
												<div>
													<p className="text-xs text-muted-foreground">Semester filter</p>
													<p className="text-sm font-medium">
														{preview.semester_filter_applied.length > 0
															? `Sem ${preview.semester_filter_applied.join(', ')}`
															: 'All'}
													</p>
												</div>
											</div>
										</div>

										{preview.unpublished_semester_result_count > 0 && (
											<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-200">
												<AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
												<div>
													<p className="font-medium">{preview.unpublished_semester_result_count} learners have draft/unpublished semester results.</p>
													<p className="text-xs mt-0.5">TOT_CREDIT will still resolve from semester_results (earned-credit value).</p>
												</div>
											</div>
										)}

										{preview.students_missing_semester_result > 0 && (
											<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2 dark:bg-red-950/20 dark:border-red-900 dark:text-red-200">
												<AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
												<div>
													<p className="font-medium">{preview.students_missing_semester_result} learners have no semester result row.</p>
													<p className="text-xs mt-0.5">TOT_CREDIT for these learners will fall back to subject-sum (may overstate credits).</p>
												</div>
											</div>
										)}

										{preview.student_count === 0 && (
											<div className="rounded-md border border-muted bg-muted/20 p-6 text-center text-sm text-muted-foreground">
												<AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
												No published results found for the selected filters.
											</div>
										)}

										{preview.student_count > 0 && (
											<div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
												<CheckCircle2 className="h-4 w-4" />
												Ready to download
											</div>
										)}
									</>
								)}
							</CardContent>
						</Card>
					)}

					{/* Download buttons */}
					{!mustSelectInstitution && hasRequiredFilters && preview?.student_count ? (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Download</CardTitle>
								<CardDescription>
									{canExport
										? 'Choose the export format for the NAD/ABC portal upload.'
										: 'You do not have the nad.export permission. Contact an administrator.'}
								</CardDescription>
							</CardHeader>
							<CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Pivot CSV */}
								<div className="rounded-lg border p-4 space-y-3">
									<div className="flex items-center gap-2">
										<LayoutGrid className="h-5 w-5 text-violet-600" />
										<h3 className="font-semibold">Pivot CSV</h3>
									</div>
									<p className="text-xs text-muted-foreground">
										One row per learner with SUB1..SUBn columns. Use this for ABC portal bulk upload.
									</p>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<div>
													<Button
														onClick={handleDownloadPivot}
														disabled={!canDownloadNow}
														className="w-full"
													>
														{downloadingPivot ? (
															<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Downloading…</>
														) : canExport ? (
															<><Download className="h-4 w-4 mr-2" /> Download Pivot</>
														) : (
															<><Lock className="h-4 w-4 mr-2" /> Download Pivot</>
														)}
													</Button>
												</div>
											</TooltipTrigger>
											{!canExport && (
												<TooltipContent>You don't have permission to export NAD CSVs.</TooltipContent>
											)}
										</Tooltip>
									</TooltipProvider>
								</div>

								{/* Official CSV */}
								<div className="rounded-lg border p-4 space-y-3">
									<div className="flex items-center gap-2">
										<FileText className="h-5 w-5 text-blue-600" />
										<h3 className="font-semibold">Official CSV</h3>
									</div>
									<p className="text-xs text-muted-foreground">
										24 fixed columns, one row per subject. Use this for NAD portal audit uploads.
									</p>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<div>
													<Button
														onClick={handleDownloadOfficial}
														disabled={!canDownloadNow}
														variant="secondary"
														className="w-full"
													>
														{downloadingOfficial ? (
															<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Downloading…</>
														) : canExport ? (
															<><Download className="h-4 w-4 mr-2" /> Download Official</>
														) : (
															<><Lock className="h-4 w-4 mr-2" /> Download Official</>
														)}
													</Button>
												</div>
											</TooltipTrigger>
											{!canExport && (
												<TooltipContent>You don't have permission to export NAD CSVs.</TooltipContent>
											)}
										</Tooltip>
									</TooltipProvider>
								</div>
							</CardContent>
						</Card>
					) : null}
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
```

**Step 4.3: Fix any import-path issues**

The imports above assume these paths exist. If any fails:

- `@/lib/auth/auth-context-parent` — should exist based on earlier exploration. If the named export is `useAuth` it'll work; if it's something else (e.g., `useParentAuth`), update the import.
- `@/hooks/use-session-sync` — exists; used by `semester-marksheet/page.tsx`.
- `@/hooks/use-institution-filter` — exists.
- `@/hooks/common/use-toast` — exists.
- `@/components/protected-route` — exists; check the default vs named export.

Run: `npx tsc --noEmit`

Expected: zero errors. Fix any import or type issue before proceeding.

**Step 4.4: Visual smoke test**

Start `npm run dev` and open `http://localhost:3000/reports/nad`.

Expected:
1. If logged out → redirected to login.
2. If logged in as a role without `nad.view` → redirected out (by `<ProtectedRoute>`).
3. If logged in as `super_admin`, `coe`, `deputy_coe`, `admin`, or `nad_coordinator` → page renders with breadcrumb, title, filter card, and the "Please select a specific institution" empty state (if "All Institutions" selected) or the filter dropdowns.
4. Selecting Exam Session + Program triggers the preview card after 400ms.
5. For the `NOV-DEC-2025 / UCH / Sem 1` filter from the earlier investigation, preview should show **12 learners**, **84** subject rows (7 subjects × 12 students), and an **amber warning** about unpublished results.
6. Clicking "Download Pivot" downloads `nad_pivot_UCH_2026-04-09.csv`. Open it in Excel/LibreOffice and verify the **TOT_CREDIT** column shows 14 for the 5 fail students (25JUGCHE004, 008, 009, 010, 012) and 22 for the rest.
7. Clicking "Download Official" downloads `nad_official_UCH_2026-04-09.csv` with ~84 rows.

**Step 4.5: Commit**

```bash
git add app/(coe)/reports/nad/page.tsx
git commit -m "feat(reports): add standalone /reports/nad report page

Focused NAD CSV export page: filter bar (exam session, program,
semester), auto-refreshing preview card (backed by count_only=true
endpoint), and two download buttons (pivot + official). Gated with
<ProtectedRoute requiredPermissions={['nad.view']}> and uses the
existing institution-filter context. Download buttons check
hasPermission('nad.export') for disabled/tooltip state.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — Update navigation: move NAD entry from Result Analytics to Reports

**Purpose:** Relocate the NAD entry in the sidebar so `nad_coordinator` users see only the Reports group with "NAD Report", and other users find it in the expected place.

**Files:**
- Modify: `lib/navigation-data.ts` (lines 305-334 based on earlier exploration)

**Step 5.1: Edit 1 — remove `nad_coordinator` from Result Analytics parent `coe_roles`**

In `lib/navigation-data.ts`, around line 325, change:

```ts
	{
		title: 'Result Analytics',
		url: '#',
		icon: BarChart3,
		coe_roles: ['super_admin', 'coe', 'deputy_coe', 'nad_coordinator'],
		items: [
```

to:

```ts
	{
		title: 'Result Analytics',
		url: '#',
		icon: BarChart3,
		coe_roles: ['super_admin', 'coe', 'deputy_coe'],
		items: [
```

**Step 5.2: Edit 2 — remove the NAD Compliance sub-item from Result Analytics**

Delete the entire line at 332:

```ts
			{ title: 'NAD Compliance', url: '/result/dashboard?tab=nad', icon: Shield, coe_roles: ['super_admin', 'coe', 'deputy_coe', 'nad_coordinator'] },
```

**Step 5.3: Edit 3 — add `nad_coordinator` to Reports parent `coe_roles` and insert NAD Report sub-item**

Find the Reports group (around line 305-320). Change:

```ts
	{
		title: 'Reports',
		url: '#',
		icon: PieChart,
		coe_roles: ['super_admin', 'coe'],
		items: [
			{ title: 'Comprehensive Reports', url: '/reports/comprehensive', icon: BarChart3 },
			{ title: 'Exam Reports Summary', url: '/reports/exam-registration-reports', icon: ClipboardCheck },
			{ title: 'Attendance Report', url: '/exam-management/reports/attendance', icon: PieChart },
			{ title: 'Course Count Report', url: '/exam-management/reports/course-count', icon: Calculator },
			{ title: 'Marksheet Distribution', url: '/reports/marksheet-distribution', icon: FileText },
			{ title: 'Semester Marksheet', url: '/reports/semester-marksheet', icon: FileText },
			{ title: 'Practical Exam Reports', url: '/reports/practical-exam/practical-need', icon: FlaskConical },
			{ title: 'Dummy Number Report', url: '/reports/dummy-numbers', icon: Hash },
		],
	},
```

to:

```ts
	{
		title: 'Reports',
		url: '#',
		icon: PieChart,
		coe_roles: ['super_admin', 'coe', 'nad_coordinator'],
		items: [
			{ title: 'Comprehensive Reports', url: '/reports/comprehensive', icon: BarChart3, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Exam Reports Summary', url: '/reports/exam-registration-reports', icon: ClipboardCheck, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Attendance Report', url: '/exam-management/reports/attendance', icon: PieChart, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Course Count Report', url: '/exam-management/reports/course-count', icon: Calculator, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Marksheet Distribution', url: '/reports/marksheet-distribution', icon: FileText, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Semester Marksheet', url: '/reports/semester-marksheet', icon: FileText, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Practical Exam Reports', url: '/reports/practical-exam/practical-need', icon: FlaskConical, coe_roles: ['super_admin', 'coe'] },
			{ title: 'Dummy Number Report', url: '/reports/dummy-numbers', icon: Hash, coe_roles: ['super_admin', 'coe'] },
			{ title: 'NAD Report', url: '/reports/nad', icon: Shield, coe_roles: ['super_admin', 'coe', 'deputy_coe', 'nad_coordinator'] },
		],
	},
```

**Why add per-item `coe_roles` to the other reports:** Without these, a `nad_coordinator` user would see ALL reports (because the parent group is now visible to them) instead of *only* NAD Report. Explicit per-item roles prevent that leak. The existing non-NAD items previously inherited from the parent; we now make the inheritance explicit.

**Step 5.4: Verify the Shield icon is imported at the top of the file**

The new sub-item uses `Shield`. Check the top of `lib/navigation-data.ts` — if `Shield` was already imported (it was, for the old NAD Compliance entry), no change needed. If the old entry was the only user and you accidentally removed the import in Step 5.2, re-add it.

Run: `npx tsc --noEmit`

Expected: zero errors. Fix any missing-import error.

**Step 5.5: Visual smoke test of navigation**

Reload the app. As a `super_admin`:
- "Reports" group expanded should now contain "NAD Report" at the bottom.
- "Result Analytics" group should NOT contain "NAD Compliance".

If possible, test with a `nad_coordinator`-only user (create one via `/users/user-roles` if needed):
- Only the "Reports" group should be visible.
- Inside Reports, only "NAD Report" should be visible.
- "Result Analytics" group should be hidden entirely.

**Step 5.6: Commit**

```bash
git add lib/navigation-data.ts
git commit -m "chore(nav): move NAD entry from Result Analytics to Reports group

Relocates the NAD/ABC export navigation link from 'Result Analytics ->
NAD Compliance' to 'Reports -> NAD Report' to reflect the new
standalone page at /reports/nad. Adds explicit per-item coe_roles to
the Reports children so a nad_coordinator-only user sees only NAD
Report inside Reports (not every report). Removes nad_coordinator
from the Result Analytics parent group since NAD was the sole reason
it was listed there.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — Remove NAD tab from `/result/dashboard` + add legacy URL redirect

**Purpose:** Delete all NAD-specific code from the dashboard page now that the standalone page is live. Add a 6-line redirect so stale `?tab=nad` bookmarks auto-navigate to `/reports/nad`.

**This task is the highest risk in the plan.** The dashboard is 3,055 lines with intertwined state. Follow the exact deletion order below to minimize cascade errors.

**Files:**
- Modify: `app/(coe)/result/dashboard/page.tsx`

**Step 6.1: Pre-delete verification — grep for shared symbols**

Before deleting anything, run these searches and record which symbols are used **only** in NAD blocks (safe to delete) vs used by other tabs (must be kept):

```bash
# Run each and note whether matches are inside NAD-only blocks
```

Run these greps via the Grep tool in the main dashboard file:
- `Target` — used by NAD header (`h-8 w-8 text-white` Target icon). Check if any other tab uses it.
- `Shield` — used by NAD icon. Check other tabs.
- `LayoutGrid` — used by pivot CSV button. Check other tabs.
- `CheckCircle2` — used by NAD "Synced" badge. Check other tabs.
- `Clock` — used by NAD "Pending" badge. Check other tabs.
- `Progress` — used by NAD compliance progress bar. Check other tabs.
- `ComplianceDashboardSkeleton` — NAD-only (likely).
- `naadData`, `loadingNaad`, `setNaadData`, `setLoadingNaad` — NAD state.
- `handleExportNADCSV`, `handleExportNAADPivotCSV` — NAD handlers.
- `canAccessNAD`, `canExportNAD` — NAD permission flags.

**Write down** which imports are NAD-only. Anything that appears in the `TabsContent value="college|program|subject|naac|dashboard"` blocks stays.

**Step 6.2: Delete `<TabsContent value="nad">` block**

This is the biggest block (~lines 2680-2900+). Open the file, locate the opening `<TabsContent value="nad" ...>` and its matching closing `</TabsContent>`. Delete everything between and including both tags.

Run: `npx tsc --noEmit`

Expected: errors will appear about unused imports/state/handlers. That's fine — we'll clean them up next.

**Step 6.3: Delete `<TabsTrigger value="nad">`**

Around line 1289-1295, delete the `<TabsTrigger value="nad" ...>NAD</TabsTrigger>` block.

**Step 6.4: Delete the two NAD CSV toolbar buttons**

Around lines 1005-1022, find the two `<Button>` components whose `onClick` is `handleExportNADCSV` and `handleExportNAADPivotCSV`. Delete both (and the `<Separator orientation="vertical" ...>` between them if it was only there to separate NAD buttons from others — otherwise keep it).

**Step 6.5: Delete the two useCallback handlers**

Around lines 736-860, delete:
- `const handleExportNADCSV = useCallback(async () => { ... }, [...])`
- `const handleExportNAADPivotCSV = useCallback(async () => { ... }, [...])`

**Step 6.6: Delete permission flags**

Around lines 203-205, delete:

```ts
const canAccessNAD = hasAnyRole(['super_admin', 'coe', 'deputy_coe', 'nad_coordinator']) || hasPermission('nad.view')
const canExportNAD = hasAnyRole(['super_admin', 'coe', 'deputy_coe', 'nad_coordinator']) || hasPermission('nad.export')
```

**Step 6.7: Delete NAD data-fetch useEffect and state**

Search the file for `naadData`, `loadingNaad`, `setNaadData`, `setLoadingNaad`. Delete their `useState` declarations and the `useEffect` that populates them. If the fetch targets an endpoint like `/api/result-analytics/nad-compliance-summary` or similar, **note the endpoint path** for the PR description — it may be orphaned after this delete.

**Step 6.8: Clean up NAD-only imports**

Remove from the top of the file **only** the icon/component imports you identified in Step 6.1 as NAD-only. **Keep** anything used by other tabs. Typical NAD-only imports to remove:

- `Target`, `Shield`, `LayoutGrid`, `ComplianceDashboardSkeleton` (probably)
- `Clock`, `Progress`, `CheckCircle2` — **only if** no other tab uses them. Verify with grep first.

**Step 6.9: Add the `?tab=nad` redirect**

Near the top of the component function, after the existing `useSearchParams()` / `useRouter()` calls (or add those if not present), insert:

```tsx
import { useRouter, useSearchParams } from 'next/navigation'

// ... inside the component:
const router = useRouter()
const searchParams = useSearchParams()

useEffect(() => {
	if (searchParams.get('tab') === 'nad') {
		router.replace('/reports/nad')
	}
}, [searchParams, router])
```

If `useRouter` / `useSearchParams` are already imported and used, just add the redirect `useEffect`. Place it near the top of the component's body, before other effects, so it fires before anything else tries to use `?tab=nad`.

**Step 6.10: Type-check**

Run: `npx tsc --noEmit`

Expected: zero errors. If errors remain:
- "Cannot find name 'foo'" → import was removed that another tab still uses; re-add it.
- "'foo' is declared but never used" → leftover state or handler; delete it.

**Step 6.11: Smoke test all remaining tabs**

Start `npm run dev`, log in as `super_admin`, and click through every tab in `/result/dashboard`:
- Dashboard (default)
- College Analysis
- Program Analysis
- Subject Analysis
- NAAC Reports

Each should render without console errors or missing icons. If any tab throws, revisit Step 6.1 — a needed import was deleted.

**Step 6.12: Verify legacy URL redirect**

Navigate to `http://localhost:3000/result/dashboard?tab=nad` in the browser. Expected: instant redirect to `/reports/nad`.

**Step 6.13: Lint**

Run: `npm run lint`

Expected: zero errors from files we touched. Pre-existing warnings are fine.

**Step 6.14: Commit**

```bash
git add app/\(coe\)/result/dashboard/page.tsx
git commit -m "refactor(dashboard): remove NAD tab and add legacy URL redirect

NAD CSV export now lives at /reports/nad. This commit:
- Deletes <TabsContent value=\"nad\"> compliance panel
- Deletes <TabsTrigger value=\"nad\"> tab button
- Deletes the two NAD CSV toolbar buttons
- Deletes handleExportNADCSV and handleExportNAADPivotCSV handlers
- Deletes canAccessNAD / canExportNAD permission flags
- Deletes naadData / loadingNaad state and the fetch useEffect
- Removes NAD-only icon and component imports
- Adds 6-line useEffect that redirects ?tab=nad -> /reports/nad
  for backward compatibility with existing bookmarks

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — End-to-end verification

**Purpose:** After all code commits, run a structured manual test to confirm the full feature works in multiple user contexts.

**Files:** None — manual checks only.

**Step 7.1: Full TypeScript check**

Run: `npx tsc --noEmit`

Expected: zero errors across the whole project. If errors appear in files unrelated to this plan, stop and investigate — they probably indicate a shared symbol was accidentally deleted.

**Step 7.2: Lint check**

Run: `npm run lint`

Expected: zero new warnings/errors in the files touched by this plan.

**Step 7.3: Smoke test — `super_admin`**

1. Log in as `super_admin`.
2. Navigate: sidebar → Reports → **NAD Report**. Page renders.
3. Select `NOV-DEC-2025` + `UCH - B.Sc. CHEMISTRY` + Sem 1. Preview card appears within 1s.
4. Preview shows **12 learners**, **84 subject rows**, **amber "12 unpublished" warning**.
5. Click **Download Pivot**. CSV downloads.
6. Open CSV, find `TOT_CREDIT` column. For registers `25JUGCHE004`, `25JUGCHE008`, `25JUGCHE009`, `25JUGCHE010`, `25JUGCHE012`, the value must be `14`. For the 7 Pass students, value must be `22`.
7. Click **Download Official**. CSV downloads with ~84 data rows + header.
8. Navigate directly to `/result/dashboard?tab=nad`. Expect instant redirect to `/reports/nad`.
9. Navigate to `/result/dashboard`. Verify tabs (Dashboard, College, Program, Subject, NAAC) all render without errors. **There should be no "NAD" tab.**

**Step 7.4: Smoke test — `nad_coordinator`-only user**

1. Via `/users/user-roles`, assign the `nad_coordinator` role to a test user. Ensure no other roles are assigned.
2. Log in as that user.
3. Sidebar should show **only** the Reports menu group, containing **only** "NAD Report".
4. Other menu groups (Result Analytics, Exam Management, etc.) should be hidden or empty.
5. `/reports/nad` should render and function identically to the super_admin test.
6. Direct navigation to `/result/dashboard` should be blocked (route protection from the existing middleware — if not, that's a separate issue not caused by this plan).

**Step 7.5: Smoke test — read-only user (nad.view only)**

If you have (or can create) a role that holds `nad.view` but not `nad.export`:
1. Log in as that user.
2. `/reports/nad` should render, filters work, preview loads.
3. Both download buttons should be **disabled** with a padlock icon and the tooltip "You don't have permission to export NAD CSVs."
4. Open devtools Network tab. Trigger a preview (should succeed, 200). Manually edit the URL in the address bar to drop `count_only=true` and reload — the endpoint should return **403**.

**Step 7.6: Smoke test — unrelated user (no NAD permissions)**

1. Log in as a user whose roles hold no NAD permissions (e.g., a normal `coe` user should work; pick any role NOT in `super_admin`/`coe`/`deputy_coe`/`admin`/`nad_coordinator`).
2. Sidebar should not contain "NAD Report".
3. Direct navigation to `/reports/nad` should redirect out (via `<ProtectedRoute>`).

**Step 7.7: Spot-check orphaned endpoints**

Run a project-wide grep for whatever endpoint `naadData` was fetching in Step 6.7. If the only remaining caller is the now-deleted dashboard code, flag the endpoint path in the final PR description as "orphaned, pending cleanup decision." **Do NOT delete it** — orphan cleanup is out of scope for this plan.

**Step 7.8: Final commit (if any touch-ups)**

If Steps 7.3-7.6 surfaced small UI bugs (typos, wrong colors, missing null guards), fix them and commit:

```bash
git add <touched files>
git commit -m "fix(reports): polish NAD report page after smoke test

<short description of the fixes>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Summary of commits

After executing the full plan, your branch should have 6-7 new commits on top of `main`:

1. `feat(auth): add requireUserPermission helper for API routes`
2. `feat(api): add count_only=true branch to NAD pivot export`
3. `feat(api): add count_only=true branch to NAD official CSV export`
4. `feat(reports): add standalone /reports/nad report page`
5. `chore(nav): move NAD entry from Result Analytics to Reports group`
6. `refactor(dashboard): remove NAD tab and add legacy URL redirect`
7. *(optional)* `fix(reports): polish NAD report page after smoke test`

Each commit should be independently compilable. `tsc --noEmit` should pass after each.

## Out-of-scope reminders

- ❌ Do **not** create new permissions — `nad.view` / `nad.export` already exist.
- ❌ Do **not** assign `nad_coordinator` to any user via SQL migration — use the admin UI if needed.
- ❌ Do **not** delete any API endpoint, even if it becomes orphaned after Task 6.
- ❌ Do **not** modify `nad_abc_upload_view` or the TOT_CREDIT fetch logic — they are correct.
- ❌ Do **not** add tests for the new page (this codebase doesn't have UI tests; manual smoke is the existing convention).
