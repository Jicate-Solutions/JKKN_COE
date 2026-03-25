# COE RBAC Architecture — Complete Reference

## Overview

The COE portal uses a **dual-system architecture** for access control:

- **MyJKKN (Parent Platform)** handles **authentication** — who are you?
- **COE (Local Portal)** handles **authorization** — what can you do here?

MyJKKN global roles (super_admin, coe, faculty, student) do NOT grant COE access. Only users explicitly assigned a COE role via the Role Management page can enter.

---

## 1. MyJKKN Users (Parent Platform)

**Database:** Parent Supabase

| Field | Example | Notes |
|-------|---------|-------|
| id | `dfbfd163-49ee-...` | Parent user UUID |
| email | `viswanathan.s@jkkn.ac.in` | Unique identifier |
| full_name | `Viswanathan S` | Display name |
| role | `super_admin` | **Global** role (NOT used in COE) |
| institution_id | `a33138b6-...` | MyJKKN institution UUID |
| is_active | `true` | Account status |

**Purpose:**
- Stores ALL JKKN platform users (learners, faculty, staff, admins)
- Assigns a global role used across all child apps
- Handles Google OAuth login via Supabase Auth
- Searched by COE admins when assigning COE roles

**Important:** The global role means NOTHING in COE. A user with MyJKKN role `"coe"` still cannot access COE unless they are assigned a COE-specific role.

---

## 2. Role Management (The Bridge)

**Page:** `/admin/role-management`

**API Endpoints:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/role-management` | List COE users with roles |
| GET | `/api/admin/role-management/roles` | List available COE roles |
| GET | `/api/admin/role-management/search-myjkkn?search=` | Search MyJKKN users |
| POST | `/api/admin/role-management/assign` | Assign COE role(s) |
| POST | `/api/admin/role-management/revoke` | Revoke COE role |

**Assignment Flow:**

1. Admin searches MyJKKN users by email or name
2. Selects a user and picks one or more COE roles (checkboxes)
3. System creates the user in COE `users` table if not already present
4. Inserts role assignment(s) into `user_roles` table
5. On next login, the user gets `coe_access` cookie and can enter COE

**Assign API Request:**

```json
{
  "email": "testuser@jkkn.ac.in",
  "full_name": "test user",
  "role_names": ["coe_mark_entry"],
  "parent_user_id": "dfbfd163-...",
  "institution_id": "a33138b6-...",
  "avatar_url": "https://..."
}
```

---

## 3. Roles (COE-Specific)

**Table:** `roles`
**Page:** `/users/roles`

These are COE portal roles, completely separate from MyJKKN roles.

| Role Name | Description | Typical Access |
|-----------|-------------|----------------|
| `super_admin` | Full COE access | Everything |
| `admin` | Administrative access | Users, Roles, Permissions |
| `coe` | Controller of Examination | All exam modules |
| `coe_office` | COE Office Staff | Courses, limited exam access |
| `coe_mark_entry` | Mark entry staff | Practical attendance + marks only |
| `dupty_coe` | Deputy COE | Examiners, Result Analytics |
| `nad_coordinator` | NAD/ABC compliance | NAD exports and reports |

**Each role controls two things:**

1. **Sidebar visibility** — Which menu sections and sub-items the user sees
2. **Permissions** — What actions the user can perform (via role_permissions mapping)

**Example — coe_mark_entry sidebar visibility:**

| Section | Visible? | Why |
|---------|----------|-----|
| Dashboard | Yes | `coe_roles: []` (everyone) |
| During-Exam | Yes | includes `"coe_mark_entry"` |
| - Practical Attendance | Yes | `coe_roles: []` (everyone) |
| - Exam Attendance | No | `["super_admin", "coe"]` only |
| Post-Exam | Yes | includes `"coe_mark_entry"` |
| - Practical Mark Entry | Yes | `coe_roles: []` (everyone) |
| - Dummy Numbers | No | `["super_admin", "coe"]` only |
| Grading | No | `["super_admin", "coe"]` only |
| Reports | No | `["super_admin", "coe"]` only |

---

## 4. Permissions (Granular Actions)

**Table:** `permissions`
**Page:** `/users/permissions`

Each permission represents a specific action on a specific resource.

**Format:** `resource.action`

| Resource | Actions | Permission Names |
|----------|---------|-----------------|
| courses | view, create, edit, delete | `courses.view`, `courses.create`, `courses.edit`, `courses.delete` |
| practical_attendance | view, edit | `practical_attendance.view`, `practical_attendance.edit` |
| practical_mark_entry | view, edit | `practical_mark_entry.view`, `practical_mark_entry.edit` |
| external_marks | view, create, edit, delete | `external_marks.view`, `external_marks.create`, etc. |
| dashboard | view | `dashboard.view` |

**Total:** 200+ permissions covering all COE modules.

**How permissions are checked in code:**

```typescript
const { hasPermission } = useAuth()

// Check before showing a button
if (hasPermission('courses.create')) {
  // Show "Add Course" button
}

// Check before an action
if (hasPermission('external_marks.edit')) {
  // Allow editing marks
}
```

---

## 5. Role Permissions (The Mapping)

**Table:** `role_permissions`
**Page:** `/users/role-permissions`

This junction table connects which role gets which permissions.

| Role | Permissions Count | Examples |
|------|-------------------|----------|
| `super_admin` | ALL 200+ | Everything |
| `coe` | ~180 | Most modules (no admin) |
| `coe_mark_entry` | 5 | practical_attendance.view/edit, practical_mark_entry.view/edit, dashboard.view |
| `coe_office` | ~50 | Mostly view permissions |
| `nad_coordinator` | ~10 | NAD-specific views and exports |

**How it works during login:**

```sql
-- sync-session queries this chain:
SELECT permissions.name
FROM user_roles
JOIN role_permissions ON role_permissions.role_id = user_roles.role_id
JOIN permissions ON permissions.id = role_permissions.permission_id
WHERE user_roles.user_id = {coe_user_id}
AND user_roles.is_active = true
AND permissions.is_active = true
```

**Result for coe_mark_entry user:**

```json
{
  "permissions": [
    "practical_attendance.view",
    "practical_attendance.edit",
    "practical_mark_entry.view",
    "practical_mark_entry.edit",
    "dashboard.view"
  ]
}
```

---

## Complete Login Flow

```
Step 1: User clicks "Continue with Google" on COE login page
         |
Step 2: MyJKKN authenticates via Google OAuth
        Returns: { email, role: "coe", institution_id }
         |
Step 3: COE sync-session API runs:
        - Find user in COE users table by email
        - Query user_roles: coe_roles = ["coe_mark_entry"]
        - Query role_permissions + permissions: [5 permissions]
        - Has COE roles? Set coe_access cookie
        - No roles? No cookie, user blocked by middleware
         |
Step 4: Client receives user object:
        {
          role: "coe",                      <-- MyJKKN (ignored by COE)
          coe_roles: ["coe_mark_entry"],    <-- COE (used for sidebar/access)
          permissions: [5 items],           <-- From coe_mark_entry role
          has_coe_access: true
        }
         |
Step 5: App renders:
        - Middleware allows request (coe_access cookie exists)
        - Sidebar shows only matching sections (hasAnyRole checks coe_roles)
        - Buttons/actions gated by hasPermission()
```

---

## Database Relationship Diagram

```
MyJKKN (Parent DB)                   COE (Local DB)
==================                   ==============

+------------+                       +------------+
|   users    |  -- search/import --> |   users    |
|  (global)  |                       |  (local)   |
+------------+                       +-----+------+
                                           |
                                           | user_id (FK)
                                           v
                                     +------------+
                                     | user_roles | (who has what role)
                                     +-----+------+
                                           |
                                           | role_id (FK)
                                           v
                                     +------------+
                                     |   roles    | (super_admin, coe, coe_mark_entry...)
                                     +-----+------+
                                           |
                                           | role_id (FK)
                                           v
                                     +------------------+
                                     | role_permissions | (which role gets which permission)
                                     +-----+------------+
                                           |
                                           | permission_id (FK)
                                           v
                                     +-------------+
                                     | permissions | (courses.view, marks.edit, ...)
                                     +-------------+
```

---

## Access Control Enforcement Points

| Layer | Component | What It Checks | How |
|-------|-----------|---------------|-----|
| 1 | **Middleware** | COE access gate | `coe_access` cookie (zero DB calls) |
| 2 | **Auth Context** | COE roles on login | `sync-session` returns `coe_roles` |
| 3 | **Sidebar** | Menu visibility | `hasAnyRole()` checks `user.coe_roles` |
| 4 | **Sub-items** | Sub-menu visibility | `hasAnyRole()` on each sub-item's `coe_roles` |
| 5 | **Page actions** | Button/action visibility | `hasPermission()` checks `user.permissions` |
| 6 | **API routes** | Server-side validation | Permission checks in route handlers |

---

## Key Files

| File | Purpose |
|------|---------|
| `app/api/auth/sync-session/route.ts` | Returns `coe_roles`, `permissions`, sets `coe_access` cookie |
| `lib/auth/auth-context-parent.tsx` | `hasRole()`, `hasAnyRole()`, `hasPermission()` — all use COE roles only |
| `lib/auth/config.ts` | `ParentAppUser` interface with `coe_roles`, `has_coe_access` |
| `middleware.ts` | Gates access via `coe_access` cookie |
| `components/layout/app-sidebar.tsx` | Filters nav items + sub-items by `coe_roles` |
| `app/api/admin/role-management/` | Assign, revoke, search, list APIs |
| `app/(coe)/admin/role-management/page.tsx` | Admin UI for role assignment |
| `lib/supabase-parent.ts` | Parent Supabase client for MyJKKN queries |

---

## Environment Variables

| Variable | Purpose | Scope |
|----------|---------|-------|
| `PARENT_SUPABASE_URL` | Parent Supabase URL | Server-side only |
| `PARENT_SUPABASE_SERVICE_ROLE_KEY` | Parent Supabase service key | Server-side only |
| `NEXT_PUBLIC_PARENT_SUPABASE_URL` | Parent Supabase URL | Client-side (for reauth flow) |
| `NEXT_PUBLIC_PARENT_APP_URL` | MyJKKN auth URL (auth.jkkn.ai) | Client-side |
| `NEXT_PUBLIC_APP_ID` | COE app ID (coe_miwp10or) | Client-side |

---

## Quick Reference: Adding a New Role

1. **Create role** in `/users/roles` page (e.g., `exam_coordinator`)
2. **Assign permissions** in `/users/role-permissions` page (select which permissions this role gets)
3. **Add to sidebar** in `components/layout/app-sidebar.tsx` — add `"exam_coordinator"` to relevant `coe_roles` arrays
4. **Assign to users** in `/admin/role-management` — search MyJKKN user, select the new role
