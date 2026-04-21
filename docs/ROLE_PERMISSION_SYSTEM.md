# Role & Permission System Guide

Complete guide for building new pages with role-based access control (RBAC) in JKKN COE.

> **Goal:** Build a page once with permission checks → let admins create roles, assign permissions, and manage users entirely from the UI. **No code changes needed** after initial setup.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Database Schema](#database-schema)
3. [Admin UI Pages](#admin-ui-pages)
4. [End-to-End Workflow](#end-to-end-workflow)
5. [Developer Guide: Building a New Page](#developer-guide-building-a-new-page)
6. [Admin Guide: Managing Roles & Permissions](#admin-guide-managing-roles--permissions)
7. [Real-Time Updates](#real-time-updates)
8. [Quick Reference](#quick-reference)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer (Supabase)                │
│  ┌─────────┐  ┌────────────────┐  ┌──────────────────┐      │
│  │  roles  │→ │role_permissions│ ←│   permissions    │      │
│  └────┬────┘  └────────────────┘  └──────────────────┘      │
│       ↓                                                     │
│  ┌──────────┐        ┌───────┐                              │
│  │user_roles│  ────→ │ users │ (cached permissions JSONB)   │
│  └──────────┘        └───────┘                              │
└─────────────────────────────────────────────────────────────┘
                         ↓ syncs on login / role change
┌─────────────────────────────────────────────────────────────┐
│                  Auth Context (React)                       │
│  user.permissions[]  →  hasPermission('resource:action')    │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    Pages & API Routes                       │
│  • hasPermission('x:view')         ← UI conditional render  │
│  • requireUserPermission('x:edit') ← API route guard        │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `roles` | Defines roles | `id`, `name`, `description`, `is_active`, `is_system_role` |
| `permissions` | Defines permissions | `id`, `name`, `resource`, `action`, `description`, `is_active` |
| `role_permissions` | Maps permissions to roles | `role_id`, `permission_id` |
| `user_roles` | Assigns roles to users | `user_id`, `role_id`, `is_active`, `expires_at` |
| `users.permissions` | JSONB cache (5-min TTL) | `{ "resource:action": true, ... }` |

### Permission Naming Convention

```
{resource}:{action}

Resource  = snake_case module/entity name (e.g. exam_attendance, marks, degrees)
Action    = view | create | edit | delete | report | import | export | admin
```

**Examples:**
- `degrees:view`
- `exam_attendance:create`
- `marks:report`
- `users:admin` (full access to resource)

---

## Admin UI Pages

All admin pages are under the **Admin** menu in the sidebar (visible only to `admin` / `super_admin`).

| Page | URL | Purpose |
|------|-----|---------|
| **Permissions** | `/users/permissions` | Create / edit / delete permissions |
| **Roles** | `/users/roles` | Create / edit / delete roles |
| **Role Permissions** | `/users/role-permissions` | Assign permissions to roles (matrix UI) |
| **Role Management** | `/admin/role-management` | Assign roles to users |
| **User Log Activity** | `/admin/user-log-activity` | Audit trail |

---

## End-to-End Workflow

```
┌──────────────────────────────────────────────────────────┐
│ Step 1: DEVELOPER                                        │
│ Register permissions (once, via SQL migration or UI)     │
│ e.g. exam_attendance:view, :create, :edit, :delete       │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│ Step 2: ADMIN (UI)                                       │
│ Create a Role (/users/roles)                             │
│ e.g. "coe_office_staff"                                  │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│ Step 3: ADMIN (UI)                                       │
│ Assign Permissions to Role (/users/role-permissions)     │
│ Use matrix UI to tick permissions per resource           │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│ Step 4: ADMIN (UI)                                       │
│ Assign Role to User (/admin/role-management)             │
│ Search user by email → select role → assign              │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│ Step 5: USER                                             │
│ Login → permissions loaded into auth context             │
│ UI shows/hides features based on hasPermission()         │
└──────────────────────────────────────────────────────────┘

If role changes while user is logged in:
┌──────────────────────────────────────────────────────────┐
│ Supabase Realtime → auth context refresh →               │
│ UI updates immediately (no logout required)              │
└──────────────────────────────────────────────────────────┘
```

---

## Developer Guide: Building a New Page

### Step 1 — Define Permissions for Your Module

For any new feature (say **Exam Attendance**), decide which actions are needed:

| Action | Permission Name | When User Needs It |
|--------|----------------|---------------------|
| View list | `exam_attendance:view` | To open the page |
| Create record | `exam_attendance:create` | Show "Add" button |
| Edit record | `exam_attendance:edit` | Show "Edit" button |
| Delete record | `exam_attendance:delete` | Show "Delete" button |
| Export report | `exam_attendance:report` | Show "Export" button |

### Step 2 — Register Permissions in DB

**Option A — SQL Migration** (preferred for new modules):

Create `supabase/migrations/YYYYMMDD_exam_attendance_permissions.sql`:

```sql
INSERT INTO permissions (name, resource, action, description) VALUES
  ('exam_attendance:view',   'exam_attendance', 'view',   'View attendance records'),
  ('exam_attendance:create', 'exam_attendance', 'create', 'Mark attendance'),
  ('exam_attendance:edit',   'exam_attendance', 'edit',   'Edit attendance records'),
  ('exam_attendance:delete', 'exam_attendance', 'delete', 'Delete attendance records'),
  ('exam_attendance:report', 'exam_attendance', 'report', 'Export attendance reports')
ON CONFLICT (resource, action) DO NOTHING;
```

**Option B — UI**: Go to `/users/permissions` → Add Permission (repeat for each action).

### Step 3 — Use Permissions in Your Page

```typescript
'use client'

import { useAuth } from '@/lib/auth/auth-context-parent'
import { Button } from '@/components/ui/button'

export default function ExamAttendancePage() {
  const { hasPermission } = useAuth()

  // Page-level guard
  if (!hasPermission('exam_attendance:view')) {
    return (
      <div className="p-8 text-center">
        <h2>Access Denied</h2>
        <p>You don't have permission to view attendance records.</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Exam Attendance</h1>

      {/* Create button — only visible to users with create permission */}
      {hasPermission('exam_attendance:create') && (
        <Button onClick={handleCreate}>+ Mark Attendance</Button>
      )}

      {/* Report button — only visible to users with report permission */}
      {hasPermission('exam_attendance:report') && (
        <Button onClick={handleExport}>Export Report</Button>
      )}

      <DataTable
        records={records}
        canEdit={hasPermission('exam_attendance:edit')}
        canDelete={hasPermission('exam_attendance:delete')}
      />
    </div>
  )
}
```

### Step 4 — Guard Your API Routes (Server-Side)

**Critical:** Always enforce permissions on the server — never trust the client alone.

```typescript
// app/api/exam-attendance/route.ts
import { NextResponse } from 'next/server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET = view
export async function GET(request: Request) {
  const check = await requireUserPermission('exam_attendance:view')
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  const supabase = getSupabaseServer()
  const { data, error } = await supabase.from('exam_attendance').select('*')
  if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST = create
export async function POST(request: Request) {
  const check = await requireUserPermission('exam_attendance:create')
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  const body = await request.json()
  // ... save logic
}

// PUT = edit
export async function PUT(request: Request) {
  const check = await requireUserPermission('exam_attendance:edit')
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }
  // ... update logic
}

// DELETE = delete
export async function DELETE(request: Request) {
  const check = await requireUserPermission('exam_attendance:delete')
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }
  // ... delete logic
}
```

### Step 5 — (Optional) Role-Based Protection Wrapper

For pages that should be entirely restricted to specific roles:

```typescript
import { ProtectedRoute } from '@/components/protected-route'

export default function AdminPage() {
  return (
    <ProtectedRoute requiredRoles={['admin', 'super_admin']}>
      <YourPageContent />
    </ProtectedRoute>
  )
}
```

### Step 6 — Add Page to Sidebar Navigation

Edit [lib/navigation-data.ts](../lib/navigation-data.ts):

```typescript
{
  title: 'Exam Management',
  url: '#',
  icon: ClipboardList,
  coe_roles: ['super_admin', 'coe', 'coe_office'],
  items: [
    { title: 'Exam Attendance', url: '/exam-management/attendance', icon: CheckSquare },
    // ... other items
  ],
}
```

> **Note:** `coe_roles` controls menu visibility. `hasPermission()` controls feature visibility inside the page.

---

## Admin Guide: Managing Roles & Permissions

### Creating a New Role

1. Navigate to **Admin → Roles** (`/users/roles`)
2. Click **+ Add Role**
3. Fill in:
   - **Role Name**: e.g. `exam_coordinator` (snake_case)
   - **Description**: e.g. "Coordinates exam scheduling and attendance"
4. Click **Save**

### Assigning Permissions to a Role

1. Navigate to **Admin → Role Permissions** (`/users/role-permissions`)
2. Select the role from the dropdown
3. A **matrix UI** appears with:
   - Rows = resources (grouped by module: Master Data, Exam Management, Marks & Results, etc.)
   - Columns = actions (view, create, edit, delete, report, etc.)
4. Tick the boxes you want
5. Quick actions:
   - **Select All** / **Clear All** — all permissions at once
   - **Module checkbox** — all permissions in a module
   - **Action column button** — all permissions for one action across resources
6. Click **Save Changes**

### Assigning a Role to a User

1. Navigate to **Admin → Role Management** (`/admin/role-management`)
2. Search the user by name or email
3. Click **Assign Role** on their row
4. Select one or more roles from the list
5. Click **Save**

The change takes effect **immediately** — no logout required (see [Real-Time Updates](#real-time-updates)).

### Revoking a Role

1. On **Role Management** page
2. Click the ✕ icon next to the role badge on the user's row
3. Confirm — the `user_roles.is_active` flag is set to `false` (soft delete)

---

## Real-Time Updates

The system uses **Supabase Realtime** to propagate role changes instantly.

### How It Works

```
1. Admin clicks "Assign Role" in UI
        ↓
2. API writes to user_roles table
        ↓
3. users.permissions JSONB cache updated via DB trigger
        ↓
4. Supabase Realtime fires event on user_roles channel
        ↓
5. Target user's browser (auth-context-parent.tsx) receives event
        ↓
6. handleRoleChange() calls /api/auth/sync-session
        ↓
7. user.permissions[] updated in React state
        ↓
8. All hasPermission() checks re-run → UI updates
```

### Key Files

| File | Role |
|------|------|
| [lib/auth/auth-context-parent.tsx](../lib/auth/auth-context-parent.tsx) | Client auth state, Realtime listener |
| [hooks/auth/use-role-sync.ts](../hooks/auth/use-role-sync.ts) | Supabase Realtime subscription |
| [lib/auth/check-user-permission.ts](../lib/auth/check-user-permission.ts) | Server-side permission guard |
| [app/api/auth/sync-session/route.ts](../app/api/auth/sync-session/route.ts) | Session refresh endpoint |
| [app/api/auth/permissions/current/route.ts](../app/api/auth/permissions/current/route.ts) | Live permissions fetch |

### Cache TTL

- **Cached permissions** (in `users.permissions` JSONB): 5 minutes
- After TTL expires, the system recomputes from `user_roles → role_permissions → permissions`
- Force refresh: append `?force=true` to `/api/auth/permissions/current`

---

## Quick Reference

### Client-Side (React)

```typescript
import { useAuth } from '@/lib/auth/auth-context-parent'

const {
  user,               // current user object
  hasPermission,      // (name: string) => boolean
  hasRole,            // (role: string) => boolean (COE roles only)
  hasAnyRole,         // (roles: string[]) => boolean
  refreshPermissions, // force refresh from server
} = useAuth()

// Examples
if (hasPermission('marks:edit')) { /* show edit button */ }
if (hasRole('super_admin')) { /* full access */ }
if (hasAnyRole(['coe', 'coe_office'])) { /* COE staff access */ }
```

### Server-Side (API Routes)

```typescript
import { requireUserPermission } from '@/lib/auth/check-user-permission'

const check = await requireUserPermission('marks:edit')
if (!check.ok) {
  return NextResponse.json({ error: check.error }, { status: check.status })
}
// check.userId, check.email, check.isSuperAdmin are now available
```

### SQL: Add Permissions for a Module

```sql
INSERT INTO permissions (name, resource, action, description) VALUES
  ('my_module:view',   'my_module', 'view',   'View my module'),
  ('my_module:create', 'my_module', 'create', 'Create records'),
  ('my_module:edit',   'my_module', 'edit',   'Edit records'),
  ('my_module:delete', 'my_module', 'delete', 'Delete records'),
  ('my_module:report', 'my_module', 'report', 'Export reports')
ON CONFLICT (resource, action) DO NOTHING;
```

### Special Rules

- **Super Admin** (`users.is_super_admin = true`) **bypasses all permission checks** — has access to everything.
- **Role deactivation** (`roles.is_active = false`) — users retain the `user_roles` row but lose effective permissions.
- **Role expiration** (`user_roles.expires_at`) — supports time-bound role assignments.
- **Institution filtering** works alongside permissions (see [CLAUDE.md](../.claude/CLAUDE.md) → Multi-Tenant Institution Context).

---

## Developer Checklist for New Pages

```
Before shipping a new page:

□ 1. Define required permissions (usually view/create/edit/delete[/report])
□ 2. Insert permissions via SQL migration
□ 3. Add page-level guard: if (!hasPermission('x:view')) return <AccessDenied />
□ 4. Conditionally render buttons using hasPermission()
□ 5. Guard every API route with requireUserPermission()
□ 6. Add entry to lib/navigation-data.ts (with coe_roles filter if needed)
□ 7. Test with a non-admin user to verify access denials work
□ 8. (Optional) Assign permissions to default roles via migration
```

---

## Related Files

| File | Purpose |
|------|---------|
| [lib/auth/auth-context-parent.tsx](../lib/auth/auth-context-parent.tsx) | Auth context + hasPermission() |
| [lib/auth/check-user-permission.ts](../lib/auth/check-user-permission.ts) | Server-side permission guard |
| [components/protected-route.tsx](../components/protected-route.tsx) | Role-based route wrapper |
| [lib/navigation-data.ts](../lib/navigation-data.ts) | Sidebar menu + role filters |
| [app/(coe)/users/permissions/page.tsx](../app/(coe)/users/permissions/page.tsx) | Permissions admin UI |
| [app/(coe)/users/roles/page.tsx](../app/(coe)/users/roles/page.tsx) | Roles admin UI |
| [app/(coe)/users/role-permissions/page.tsx](../app/(coe)/users/role-permissions/page.tsx) | Role-Permission matrix UI |
| [app/(coe)/admin/role-management/page.tsx](../app/(coe)/admin/role-management/page.tsx) | User-Role assignment UI |
| [supabase/migrations/20250929_rbac_setup.sql](../supabase/migrations/20250929_rbac_setup.sql) | Base RBAC schema |
| [supabase/migrations/20250929_user_roles_table.sql](../supabase/migrations/20250929_user_roles_table.sql) | user_roles table + functions |
| [supabase/migrations/20251112_enable_realtime_user_roles.sql](../supabase/migrations/20251112_enable_realtime_user_roles.sql) | Realtime enablement |

---

**Last Updated:** 2026-04-20
