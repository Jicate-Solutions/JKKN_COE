# Search & Favorites Implementation Guide

## File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `lib/navigation-data.ts` | ~390 | Nav data + types + `getFlatNavItems()` |
| `hooks/use-favorites.ts` | ~200 | Favorites hook (cache + API + state) |
| `components/layout/command-menu.tsx` | ~200 | CommandMenuProvider + search dialog |
| `components/layout/app-sidebar.tsx` | ~150 | Sidebar with search button + favorites group |
| `components/ui/command.tsx` | ~155 | Shadcn command primitives (cmdk wrapper) |
| `app/(coe)/favorites/page.tsx` | ~560 | Manage page (list/grid/add/reorder) |
| `app/api/user-favorites/route.ts` | ~130 | REST API for favorites CRUD |
| `app/(coe)/layout.tsx` | ~100 | Wraps children in CommandMenuProvider |

## Data Flow: Search

```
User presses Ctrl+K
  → CommandMenuProvider catches keydown
  → setOpen(true) → Dialog renders
  → getFlatNavItems(navMain, hasAnyRole) builds role-filtered flat list
  → cmdk Command with customFilter scores each item
  → User selects → router.push(url) → Dialog closes
```

## Data Flow: Favorites

```
Page loads
  → useFavorites() mounts
  → useState initializer reads localStorage cache (instant)
  → useEffect fires fetchFavorites() (background API sync)
  → API returns → setFavorites(urls) + setCachedFavorites()
  → hasSyncedRef = true (cache writes now enabled)

User clicks star
  → toggleFavorite(url, title, group)
  → Optimistic: setFavorites([...prev, url]) + setCachedFavorites()
  → API POST /api/user-favorites (background)
  → Success: refetch to get sort_order
  → Failure: revert state + cache

Sidebar renders
  → AppSidebar reads favorites from useFavorites()
  → Builds synthetic NavItem group with Star icon
  → Prepends to filteredNavItems array
  → NavMain renders it like any other collapsible group
```

## Data Flow: Reorder

```
User drags item in list/grid view
  → @dnd-kit DragEnd fires
  → arrayMove(favorites, oldIndex, newIndex) computes new order
  → reorderFavorites(newOrder):
    → Optimistic: setFavorites(newOrder) + setCachedFavorites()
    → API PUT /api/user-favorites { items: [{page_url, sort_order}] }
    → Failure: revert + refetch
```

## Key Patterns

### Custom Filter (not cmdk default)

```typescript
function customFilter(value: string, search: string): number {
  const v = value.toLowerCase()
  const s = search.toLowerCase().trim()
  if (!s) return 1
  if (v.startsWith(s)) return 1      // prefix = highest
  if (v.includes(s)) return 0.8      // contains = medium
  const words = s.split(/\s+/)
  if (words.every(w => v.includes(w))) return 0.6  // multi-word
  return 0                            // no match = hidden
}
```

### Cache Safety Pattern

```typescript
const hasSyncedRef = useRef(false)

// Only write cache after API confirms
fetchFavorites: hasSyncedRef.current = true; setCachedFavorites(userId, urls)

// User actions check the ref
updateFavorites: if (hasSyncedRef.current) setCachedFavorites(userId, next)
```

### User ID Resolution Chain

```typescript
// Priority: COE DB user → MyJKKN auth user → localStorage stored user
const userId = user?.coe_user_id || user?.id || getStoredUserId()

function getStoredUserId(): string {
  const user = JSON.parse(localStorage.getItem('user_data'))
  return user?.coe_user_id || user?.id || ''
}
```

### Sidebar Fallback Titles

When roles haven't loaded yet, `flatItems` is empty. Favorites still show with URL-derived titles:

```typescript
const segments = url.split('/').filter(Boolean)
const fallbackTitle = segments[segments.length - 1]
  ?.replace(/-/g, ' ')
  .replace(/\b\w/g, c => c.toUpperCase()) || url
// '/master/courses' → 'Courses'
// '/grading/generate-final-marks' → 'Generate Final Marks'
```

## Migrations

| Migration | Purpose |
|-----------|---------|
| `create_user_favorites_table` | Table + indexes + RLS |
| `drop_user_favorites_user_fkey` | Remove FK to support MyJKKN auth IDs |

## Dependencies

- `cmdk` v1.1.1 — Command palette primitives
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, `@dnd-kit/utilities` — Drag & drop
- `@radix-ui/react-dialog` — Dialog primitives (via shadcn)
