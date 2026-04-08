---
name: search-and-favorites
description: Global search (Ctrl+K command menu) and user-specific favorites system for JKKN COE. Use when implementing, debugging, or extending the command palette search, favorites (starred pages), sidebar favorites menu, favorites management page, or drag & drop reorder. Triggers on "search menu", "command menu", "Ctrl+K", "favorites", "starred pages", "bookmark pages", "reorder favorites", "favorite menu missing", "search not working".
---

# Search & Favorites System

## Architecture Overview

```
lib/navigation-data.ts          ← Single source of truth for all pages
hooks/use-favorites.ts          ← Favorites state + API + localStorage cache
components/layout/command-menu.tsx  ← Ctrl+K search dialog + CommandMenuProvider
components/layout/app-sidebar.tsx   ← Injects Favorites group into sidebar nav
app/(coe)/favorites/page.tsx    ← Manage favorites page (list/grid + drag & drop)
app/api/user-favorites/route.ts ← CRUD + reorder API (GET/POST/PUT/DELETE)
```

**Database:** `user_favorites` table (no FK to `users` — supports both COE and MyJKKN user IDs).

## Key Files

### `lib/navigation-data.ts`

Exports `navMain` (all nav groups with roles) and `getFlatNavItems(items, hasAnyRole)` which flattens the tree into searchable `FlatNavItem[]`, filtering by user roles and excluding `url === '#'` placeholders.

Add new pages here — they automatically appear in both sidebar and search.

### `hooks/use-favorites.ts`

Two-tier persistence: localStorage cache for instant loading + Supabase API for durability.

**User ID resolution:** `user?.coe_user_id || user?.id || getStoredUserId()`. Falls back to MyJKKN auth ID for users without COE `users` table records.

**Cache safety:** `hasSyncedRef` prevents cache wipe on mount. Cache only written after API confirms or user actions.

Returns: `favorites`, `records`, `loading`, `isFavorite`, `toggleFavorite`, `addFavorite`, `removeFavorite`, `reorderFavorites`, `refetch`.

### `components/layout/command-menu.tsx`

`CommandMenuProvider` wraps `(coe)/layout.tsx`. Provides `useCommandMenu()` context with `{ open, setOpen }`.

Uses custom `customFilter` (case-insensitive substring) instead of cmdk's default `commandScore`.

Each `CommandItem` value includes `"${title} ${group} ${url}"` — must be unique (prefix `"fav "` for favorites section items).

### `components/layout/app-sidebar.tsx`

Builds synthetic `Favorites` nav group and prepends to `filteredNavItems`. Includes `"Manage Favorites"` link as first sub-item. Uses URL-derived fallback titles when `flatItems` hasn't resolved (roles still loading).

### `app/api/user-favorites/route.ts`

| Method | Endpoint | Body/Params | Purpose |
|--------|----------|-------------|---------|
| GET | `?user_id=<uuid>` | — | Fetch all, sorted by `sort_order` |
| POST | — | `{ user_id, page_url, page_title?, page_group? }` | Add favorite |
| PUT | — | `{ user_id, items: [{ page_url, sort_order }] }` | Batch reorder |
| DELETE | `?user_id=<uuid>&page_url=<url>` | — | Remove favorite |

## Common Issues & Fixes

### Search shows no results / only Dashboard

**Cause:** `useMemo` dependency doesn't detect role changes. `hasAnyRole` is a stable ref callback.

**Fix:** Use `user` object as dependency, not `user?.coe_roles`:
```tsx
const allItems = React.useMemo(
  () => getFlatNavItems(navMain, hasAnyRole),
  [hasAnyRole, user]  // NOT [hasAnyRole, user?.coe_roles]
)
```

### Favorites menu missing on some pages

**Cause 1:** Cache wiped on mount by `useEffect` writing `[]` before API resolves.
**Fix:** `hasSyncedRef` gate — only write cache after API confirms.

**Cause 2:** `coe_user_id` null for non-super_admin users.
**Fix:** Fall back to `user.id` (MyJKKN auth UUID, always present).

**Cause 3:** `flatItems` empty when roles not loaded → favorite URLs don't resolve → `favSubItems` empty.
**Fix:** URL-derived fallback titles in `app-sidebar.tsx`:
```tsx
const segments = url.split('/').filter(Boolean)
const fallbackTitle = segments[segments.length - 1]
  ?.replace(/-/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase()) || url
```

### cmdk `DialogTitle` accessibility error

**Fix:** Add `DialogTitle` + `DialogDescription` with `className="sr-only"` inside `CommandDialog` in `components/ui/command.tsx`.

### Duplicate values in cmdk

cmdk v1.x deduplicates by lowercased `value`. Favorites and main list must have different value prefixes.

## Adding a New Page to Search

Add it to `navMain` in `lib/navigation-data.ts`. It automatically appears in:
- Sidebar navigation (role-filtered)
- Ctrl+K search (role-filtered)
- Favorites "Add New" browser (role-filtered)

## Database Schema

```sql
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,  -- COE user ID or MyJKKN auth ID (no FK)
  page_url TEXT NOT NULL,
  page_title TEXT,
  page_group TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_user_favorites_user_page UNIQUE (user_id, page_url)
);
```

## Extending the System

### Add star toggle to any page

```tsx
import { useFavorites } from '@/hooks/use-favorites'

const { isFavorite, toggleFavorite } = useFavorites()

<button onClick={() => toggleFavorite('/some/url', 'Page Title', 'Group')}>
  <Star className={isFavorite('/some/url') ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'} />
</button>
```

### Add search trigger button anywhere

```tsx
import { useCommandMenu } from '@/components/layout/command-menu'

const { setOpen } = useCommandMenu()

<button onClick={() => setOpen(true)}>Search</button>
```
