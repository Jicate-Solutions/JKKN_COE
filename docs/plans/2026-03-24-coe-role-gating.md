# COE Role-Based Access Gating Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Only users explicitly assigned a COE role (admin, coe, coe_mark_entry, coe_office, dupty_coe, nad_coordinator, super_admin) can access the COE portal. Users authenticating via MyJKKN without a COE role are redirected to jkkn.ai.

**Architecture:** sync-session checks user_roles table for COE roles, sets a `coe_access` cookie. Middleware checks this cookie on every request. A new Role Management admin page lets admins search MyJKKN users and assign COE roles.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL), Shadcn UI, Tailwind CSS, TypeScript

---

## Current State

- **Roles table** has 7 roles: admin, coe, coe_mark_entry, coe_office, dupty_coe, nad_coordinator, super_admin
- **user_roles table** exists but is EMPTY (no assignments)
- **users table** has 1 user (admin@jkkn.ac.in). Current active user (viswanathan.s@jkkn.ac.in) is NOT in this table
- **Middleware** only checks `access_token` cookie, no COE role gate
- **sync-session** queries user_roles for permissions but doesn't gate access

---

## Task 1: Update sync-session to return COE roles and set cookie

**Files:**
- Modify: `app/api/auth/sync-session/route.ts`

**Step 1: Add COE role fetching helper**

After the existing `fetchUserPermissions` function (around line 65), add:

```typescript
/**
 * Fetch COE-specific roles for a user from the user_roles table
 */
async function fetchUserCoeRoles(supabase: any, userId: string | null): Promise<string[]> {
	if (!userId) return []

	const { data: userRoles } = await supabase
		.from('user_roles')
		.select('roles!inner(name, is_active)')
		.eq('user_id', userId)
		.eq('is_active', true)

	if (!userRoles) return []

	return userRoles
		.filter((ur: any) => ur.roles?.is_active !== false && ur.roles?.name)
		.map((ur: any) => ur.roles.name)
}
```

**Step 2: Call it in the existing-user branch (after permissions fetch, ~line 292)**

After `const permissions = await fetchUserPermissions(...)`, add:

```typescript
// Fetch COE-specific roles from user_roles table
const coeRoles = await fetchUserCoeRoles(supabase, existingUser.id)
```

**Step 3: Add `coe_roles` and `has_coe_access` to the response JSON (existing-user branch)**

In the `NextResponse.json({...})` object, add after the `roles` line:

```typescript
coe_roles: coeRoles,
has_coe_access: coeRoles.length > 0,
```

**Step 4: Set `coe_access` cookie on the response (existing-user branch)**

After the existing cookie-setting block (after `access_token` and `refresh_token` cookies), add:

```typescript
// Set COE access flag cookie for middleware gate
if (coeRoles.length > 0) {
	response.cookies.set('coe_access', 'true', {
		path: '/',
		maxAge: sevenDaysInSeconds,
		httpOnly: false,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production'
	})
} else {
	// Ensure cookie is removed if user has no COE roles
	response.cookies.delete('coe_access')
}
```

**Step 5: Handle the new-user branch (else block ~line 349)**

In the else branch (user not in COE DB), the response should include:

```typescript
coe_roles: [],
has_coe_access: false,
```

And do NOT set the `coe_access` cookie (no COE role = no access).

**Step 6: Commit**

```bash
git add app/api/auth/sync-session/route.ts
git commit -m "feat: sync-session returns COE roles and sets coe_access cookie"
```

---

## Task 2: Update ParentAppUser type and auth context

**Files:**
- Modify: `lib/auth/config.ts`
- Modify: `lib/auth/auth-context-parent.tsx`

**Step 1: Add `coe_roles` and `has_coe_access` to ParentAppUser interface**

In `lib/auth/config.ts`, add to the `ParentAppUser` interface:

```typescript
coe_roles?: string[]
has_coe_access?: boolean
```

**Step 2: Update syncSession return type in auth-context-parent.tsx**

In the `syncSession` callback return type (around line 57), add:

```typescript
coe_roles: string[]
has_coe_access: boolean
```

**Step 3: Extract coe_roles from sync-session response**

In the `syncSession` callback body, where `response.ok` is checked and data is returned (around line 88), add to the return object:

```typescript
coe_roles: data.coe_roles || [],
has_coe_access: data.has_coe_access || false,
```

And in the fallback return (both error and non-ok), add:

```typescript
coe_roles: [],
has_coe_access: false,
```

**Step 4: Merge coe_roles into user object in handleOAuthCallback**

In `handleOAuthCallback` where `userWithPermissions` is constructed (~line 180), add:

```typescript
coe_roles: coe_roles.length > 0 ? coe_roles : authenticatedUser.coe_roles,
has_coe_access: has_coe_access || authenticatedUser.has_coe_access,
```

And destructure `coe_roles` and `has_coe_access` from the `syncSession()` result alongside permissions/roles.

**Step 5: Add redirect logic for users without COE access**

After the user object is set and before the redirect to dashboard (~line 198), add:

```typescript
// If user has no COE roles, redirect to MyJKKN instead of dashboard
if (!userWithPermissions.has_coe_access) {
	// Clear local session since they can't use COE
	parentAuthService.clearSession()
	window.location.replace(process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://jkkn.ai')
	return
}
```

**Step 6: Commit**

```bash
git add lib/auth/config.ts lib/auth/auth-context-parent.tsx
git commit -m "feat: auth context supports COE roles and redirects unauthorized users"
```

---

## Task 3: Update middleware to check coe_access cookie

**Files:**
- Modify: `middleware.ts`

**Step 1: Add COE access check after the access_token check**

After the existing `access_token` check block (line 46-62), and before the final `return res` (line 66), add:

```typescript
// Check for COE access (user must have COE-specific roles)
const coeAccess = request.cookies.get('coe_access')?.value

if (!coeAccess) {
	if (pathname.startsWith('/api')) {
		return NextResponse.json(
			{ error: 'COE access not granted. Contact administrator for role assignment.' },
			{ status: 403 }
		)
	}

	// Redirect to MyJKKN - user is authenticated but has no COE role
	const parentAppUrl = process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://jkkn.ai'
	return NextResponse.redirect(parentAppUrl)
}
```

**Step 2: Add `/no-coe-access` to public routes (optional fallback)**

Add to the `publicRoutes` array:

```typescript
'/no-coe-access',
```

**Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: middleware gates COE access via coe_access cookie"
```

---

## Task 4: Update logout to clear coe_access cookie

**Files:**
- Modify: `lib/auth/parent-auth-service.ts`

**Step 1: Add coe_access cookie removal in clearSession()**

In the `clearSession()` method, after the existing cookie removals (line 194-197), add:

```typescript
Cookies.remove('coe_access', { path: '/' })
Cookies.remove('coe_access')
```

**Step 2: Commit**

```bash
git add lib/auth/parent-auth-service.ts
git commit -m "feat: logout clears coe_access cookie"
```

---

## Task 5: Create Role Management API routes

**Files:**
- Create: `app/api/admin/role-management/route.ts`
- Create: `app/api/admin/role-management/assign/route.ts`
- Create: `app/api/admin/role-management/revoke/route.ts`

**Step 1: GET /api/admin/role-management — List users with COE roles**

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const search = searchParams.get('search')

	let query = supabase
		.from('users')
		.select(`
			id,
			email,
			full_name,
			avatar_url,
			is_active,
			institution_id,
			user_roles(
				id,
				is_active,
				assigned_at,
				roles(id, name, description)
			)
		`)
		.order('full_name')

	if (search) {
		query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
	}

	const { data, error } = await query.range(0, 999)

	if (error) {
		return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
	}

	// Format: include only users who have at least one active COE role, unless searching
	const users = (data || []).map((u: any) => ({
		...u,
		coe_roles: (u.user_roles || [])
			.filter((ur: any) => ur.is_active && ur.roles?.name)
			.map((ur: any) => ({
				id: ur.id,
				role_id: ur.roles.id,
				role_name: ur.roles.name,
				role_description: ur.roles.description,
				assigned_at: ur.assigned_at,
			})),
	}))

	return NextResponse.json(users)
}
```

**Step 2: POST /api/admin/role-management/assign — Assign COE role**

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { getSupabaseParent } from '@/lib/supabase-parent'

export async function POST(request: Request) {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const { email, full_name, role_name, assigned_by, parent_user_id, institution_id, avatar_url } = body

	if (!email || !role_name) {
		return NextResponse.json({ error: 'Email and role_name are required' }, { status: 400 })
	}

	// 1. Find or create user in COE users table
	let { data: user } = await supabase
		.from('users')
		.select('id')
		.eq('email', email)
		.single()

	if (!user) {
		// Fetch avatar from parent Supabase Auth if not provided
		let resolvedAvatar = avatar_url || null
		if (!resolvedAvatar && parent_user_id) {
			try {
				const parentSupabase = getSupabaseParent()
				const { data: authUser } = await parentSupabase.auth.admin.getUserById(parent_user_id)
				resolvedAvatar = authUser?.user?.user_metadata?.avatar_url || null
			} catch {}
		}

		// Create user in COE database
		const { data: newUser, error: createErr } = await supabase
			.from('users')
			.insert({
				email,
				full_name: full_name || email.split('@')[0],
				role: 'user',
				is_active: true,
				avatar_url: resolvedAvatar,
				institution_id: institution_id || null,
			})
			.select('id')
			.single()

		if (createErr) {
			return NextResponse.json({ error: 'Failed to create user: ' + createErr.message }, { status: 500 })
		}
		user = newUser
	}

	// 2. Find role by name
	const { data: role } = await supabase
		.from('roles')
		.select('id')
		.eq('name', role_name)
		.eq('is_active', true)
		.single()

	if (!role) {
		return NextResponse.json({ error: `Role "${role_name}" not found` }, { status: 400 })
	}

	// 3. Assign role (upsert)
	const { error: assignErr } = await supabase
		.from('user_roles')
		.upsert({
			user_id: user.id,
			role_id: role.id,
			is_active: true,
			assigned_by: assigned_by || null,
			assigned_at: new Date().toISOString(),
		}, { onConflict: 'user_id,role_id' })

	if (assignErr) {
		return NextResponse.json({ error: 'Failed to assign role: ' + assignErr.message }, { status: 500 })
	}

	return NextResponse.json({ success: true, message: `Role "${role_name}" assigned to ${email}` }, { status: 201 })
}
```

**Step 3: POST /api/admin/role-management/revoke — Revoke COE role**

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function POST(request: Request) {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const { user_id, role_name } = body

	if (!user_id || !role_name) {
		return NextResponse.json({ error: 'user_id and role_name are required' }, { status: 400 })
	}

	// Find role
	const { data: role } = await supabase
		.from('roles')
		.select('id')
		.eq('name', role_name)
		.single()

	if (!role) {
		return NextResponse.json({ error: `Role "${role_name}" not found` }, { status: 400 })
	}

	// Soft-delete: set is_active = false
	const { error } = await supabase
		.from('user_roles')
		.update({ is_active: false, updated_at: new Date().toISOString() })
		.eq('user_id', user_id)
		.eq('role_id', role.id)

	if (error) {
		return NextResponse.json({ error: 'Failed to revoke role' }, { status: 500 })
	}

	return NextResponse.json({ success: true, message: `Role "${role_name}" revoked` })
}
```

**Step 4: Commit**

```bash
git add app/api/admin/role-management/
git commit -m "feat: role management API routes (list, assign, revoke)"
```

---

## Task 6: Create MyJKKN user search API

**Files:**
- Create: `app/api/admin/role-management/search-myjkkn/route.ts`

**Step 1: Create search endpoint that queries parent Supabase users**

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseParent } from '@/lib/supabase-parent'

/**
 * Search users from parent MyJKKN Supabase for role assignment
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const search = searchParams.get('search')

	if (!search || search.length < 2) {
		return NextResponse.json({ error: 'Search query must be at least 2 characters' }, { status: 400 })
	}

	try {
		const parentSupabase = getSupabaseParent()

		const { data, error } = await parentSupabase
			.from('users')
			.select('id, parent_user_id, email, full_name, role, avatar_url, institution_id, is_active')
			.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
			.eq('is_active', true)
			.order('full_name')
			.limit(20)

		if (error) {
			return NextResponse.json({ error: 'Failed to search users' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (err) {
		console.error('MyJKKN user search error:', err)
		return NextResponse.json({ error: 'Failed to connect to MyJKKN' }, { status: 500 })
	}
}
```

**Step 2: Commit**

```bash
git add app/api/admin/role-management/search-myjkkn/route.ts
git commit -m "feat: MyJKKN user search API for role assignment"
```

---

## Task 7: Create Role Management admin page

**Files:**
- Create: `app/(coe)/admin/role-management/page.tsx`

**Step 1: Build the Role Management page**

This page should include:
- **Search bar** to search MyJKKN users by email/name
- **Search results** showing user info with "Assign Role" action
- **Role assignment dialog** with role dropdown (admin, coe, coe_mark_entry, coe_office, dupty_coe, nad_coordinator, super_admin)
- **Users with roles table** showing all COE users with their assigned roles
- **Revoke** action to remove a role from a user

Use existing UI patterns from the codebase:
- Reference: `app/(coe)/master/degrees/page.tsx` for Sheet/table pattern
- Shadcn UI components: `Input`, `Button`, `Table`, `Sheet`, `Select`, `Badge`, `Avatar`
- Toast notifications for success/error

Key features:
- `useState` for search query, results, loading states
- `fetch('/api/admin/role-management/search-myjkkn?search=...')` for MyJKKN user search
- `fetch('/api/admin/role-management')` to list users with COE roles
- `fetch('/api/admin/role-management/assign', { method: 'POST' })` to assign roles
- `fetch('/api/admin/role-management/revoke', { method: 'POST' })` to revoke roles
- Available roles fetched from `/api/admin/role-management/roles` or hardcoded from the DB

**Step 2: Commit**

```bash
git add app/(coe)/admin/role-management/page.tsx
git commit -m "feat: Role Management admin page with MyJKKN user search"
```

---

## Task 8: Add Role Management to navigation

**Files:**
- Modify: Navigation config file (wherever sidebar nav items are defined)

**Step 1: Add "Role Management" link under Admin section**

Add a navigation item:
- Label: "Role Management"
- Path: `/admin/role-management`
- Icon: `Shield` or `UserCog` from lucide-react
- Required role: `super_admin` or `admin`

**Step 2: Commit**

```bash
git add [nav config file]
git commit -m "feat: add Role Management to admin navigation"
```

---

## Task 9: Seed initial role assignment for current user

**Files:**
- Manual SQL or via the new Role Management page

**Step 1: Assign super_admin COE role to viswanathan.s@jkkn.ac.in**

Since the current user is NOT in the COE users table, the first role assignment must:
1. Create the user in COE users table
2. Assign the super_admin COE role

This can be done via the new Role Management page (Task 7) or manually:

```sql
-- 1. Insert user if not exists
INSERT INTO users (email, full_name, role, is_active, is_super_admin)
VALUES ('viswanathan.s@jkkn.ac.in', 'Viswanathan S', 'super_admin', true, true)
ON CONFLICT (email) DO NOTHING;

-- 2. Assign super_admin role
INSERT INTO user_roles (user_id, role_id, is_active, assigned_at)
SELECT u.id, r.id, true, NOW()
FROM users u, roles r
WHERE u.email = 'viswanathan.s@jkkn.ac.in'
AND r.name = 'super_admin'
ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = true;
```

**IMPORTANT:** This must be done BEFORE enabling the middleware gate (Task 3), otherwise you'll be locked out.

---

## Implementation Order

```
Task 9 (Seed your user + role) ← DO THIS FIRST to avoid lockout
   ↓
Task 1 (sync-session returns COE roles + cookie)
   ↓
Task 2 (Auth context + ParentAppUser type)
   ↓
Task 4 (Logout clears coe_access cookie)
   ↓
Task 3 (Middleware gate) ← Enable AFTER Tasks 1,2,4 are working
   ↓
Task 5 (Role Management API routes)
   ↓
Task 6 (MyJKKN user search API)
   ↓
Task 7 (Role Management page UI)
   ↓
Task 8 (Navigation link)
```

---

## Verification Steps

1. **After Task 1+2:** Log in → check browser console for `user.coe_roles` and `user.has_coe_access` in localStorage
2. **After Task 3:** Log in as user WITHOUT COE role → should redirect to MyJKKN
3. **After Task 4:** Log out → check that `coe_access` cookie is removed
4. **After Task 7:** Open Role Management page → search MyJKKN user → assign role → verify they can now access COE
5. **End-to-end:** Log out → log in as user with COE role → dashboard loads. Log in as user without COE role → redirected to MyJKKN.
