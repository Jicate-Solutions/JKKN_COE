# Real-Time Permission Synchronization

## Overview

The JKKN COE application now supports **real-time permission updates** without requiring users to log out and log back in. When an administrator changes a user's roles or permissions, those changes are automatically reflected in the user's active session within seconds.

## Architecture

### Components

1. **Supabase Realtime**: Listens for changes to the `user_roles` table
2. **usePermissionSync Hook** (`lib/auth/use-permission-sync.tsx`): Client-side hook that subscribes to database changes
3. **Auth Context** (`lib/auth/auth-context.tsx`): Integrates the hook and manages permission refresh
4. **Auth Service** (`lib/auth/supabase-auth-service.ts`): Supports force refresh with cache bypass
5. **Permissions API** (`app/api/auth/permissions/current/route.ts`): Provides force refresh endpoint

### How It Works

```
1. Admin changes user roles in database (INSERT/UPDATE/DELETE in user_roles table)
   ↓
2. Supabase Realtime detects change and sends event to subscribed clients
   ↓
3. usePermissionSync hook receives event and triggers refreshPermissions()
   ↓
4. Auth context calls API with ?force=true parameter (bypasses cache)
   ↓
5. API queries user_roles and role_permissions tables (fresh data from DB)
   ↓
6. Auth service updates user object with new roles and permissions
   ↓
7. UI automatically re-renders with updated permissions
   ↓
8. Sidebar menu items appear/disappear based on new access rights
   ↓
9. User sees toast notification: "🔄 Permissions Updated"
```

## Setup Requirements

### 1. Enable Supabase Realtime

Ensure Realtime is enabled for the `user_roles` table in your Supabase project:

1. Go to Supabase Dashboard → Database → Replication
2. Find the `user_roles` table
3. Enable replication for the table
4. Enable the following events:
   - ✅ INSERT
   - ✅ UPDATE
   - ✅ DELETE

### 2. Environment Variables

Ensure your `.env.local` has the correct Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Browser Compatibility

Real-time updates require:
- WebSocket support (all modern browsers)
- Active network connection
- Browser tab must be active (background tabs may have reduced frequency)

## Testing Real-Time Permission Updates

### Test Scenario 1: Adding a New Role

**Setup:**
1. Open two browser windows:
   - Window A: User session (e.g., viswanathan.s@jkkn.ac.in)
   - Window B: Admin panel at `/user` (super_admin user)

**Steps:**
1. **Window A**: Login and navigate to dashboard
2. **Window A**: Open browser console (F12) to see logs
3. **Window A**: Note which menu items are visible (e.g., only "Dashboard", no "Master" section)
4. **Window B**: Login as super_admin
5. **Window B**: Go to Users page, find viswanathan.s@jkkn.ac.in
6. **Window B**: Assign new role (e.g., change from `coe_office` to `super_admin`)
7. **Window B**: Click Save

**Expected Results:**
- **Window A Console**: Shows messages:
  ```
  User roles changed: {eventType: 'UPDATE', ...}
  🔄 Refreshing permissions...
  🔄 Force refresh requested - bypassing cache
  User viswanathan.s@jkkn.ac.in has roles: ['super_admin']
  ✅ Permissions force refreshed: ['super_admin']
  ✅ Permissions refreshed successfully
  ```
- **Window A UI**:
  - Toast notification appears: "🔄 Permissions Updated - Your access permissions have been updated. The menu will refresh automatically."
  - Sidebar automatically updates to show new menu items (e.g., "Master" section now visible)
  - User role in header/dashboard changes to "Super Admin"
  - **NO PAGE REFRESH REQUIRED**

### Test Scenario 2: Removing a Role

**Setup:**
1. User has `coe_office` role with access to "Exam Attendance"
2. Admin removes this role or changes to lower role

**Steps:**
1. **User Window**: Navigate to "Exam Attendance" page (accessible)
2. **Admin Window**: Remove `coe_office` role or downgrade user
3. **Wait 1-2 seconds** for real-time sync

**Expected Results:**
- **User Window**:
  - Toast notification appears
  - Sidebar menu automatically updates
  - "Exam Attendance" menu item disappears
  - If currently on restricted page, user may see access denied (depending on route protection)

### Test Scenario 3: Multiple Simultaneous Users

**Setup:**
1. Open 3 browser windows with same user account
2. Each window on different pages

**Steps:**
1. Admin changes user's roles
2. Observe all 3 windows simultaneously

**Expected Results:**
- All 3 windows receive the real-time update within 1-2 seconds
- All windows show the same toast notification
- All windows update their sidebar menus identically
- Console logs appear in all windows

### Test Scenario 4: Offline/Online Behavior

**Steps:**
1. User is logged in and viewing dashboard
2. Disconnect network (turn off WiFi or disconnect Ethernet)
3. Admin changes user's roles (in database directly or via another admin)
4. Wait 30 seconds
5. Reconnect network

**Expected Results:**
- While offline: No updates received (real-time connection lost)
- When reconnecting:
  - Real-time subscription re-establishes automatically
  - User receives missed updates
  - Permissions refresh automatically
  - UI updates to reflect current state

## Console Logs for Debugging

### Successful Real-Time Update

```
Setting up real-time permission sync for user: 9fd71b2e-5f69-4c0d-88f5-7d060165a476
✅ Real-time permission sync active
User roles changed: {
  eventType: "UPDATE",
  new: {user_id: "...", role_id: "...", is_active: true},
  old: {user_id: "...", role_id: "...", is_active: false}
}
Permission change detected, refreshing...
🔄 Refreshing permissions...
🔄 Force refresh requested - bypassing cache
User viswanathan.s@jkkn.ac.in has roles: ['super_admin', 'coe_office']
Computed 45 permissions for user viswanathan.s@jkkn.ac.in
✅ Permissions force refreshed: ['super_admin', 'coe_office']
✅ Permissions refreshed successfully
```

### Failed Connection

```
Setting up real-time permission sync for user: 9fd71b2e-5f69-4c0d-88f5-7d060165a476
❌ Real-time channel error
```

**Solution**: Check Supabase Realtime settings, ensure table replication is enabled

### Timeout

```
Setting up real-time permission sync for user: 9fd71b2e-5f69-4c0d-88f5-7d060165a476
⚠️ Real-time subscription timed out
```

**Solution**: Check network connection, Supabase project status

## Manual Permission Refresh

If automatic real-time updates aren't working, users can manually refresh permissions:

### Option 1: Use Browser Console

```javascript
// Call the refresh function directly
const authContext = document.querySelector('[data-auth-context]');
if (authContext) {
  authContext.refreshPermissions();
}
```

### Option 2: Logout and Login Again

Traditional method - always works but less convenient.

### Option 3: API Call (for testing)

```javascript
// Fetch fresh permissions
fetch('/api/auth/permissions/current?force=true')
  .then(res => res.json())
  .then(data => console.log('Fresh permissions:', data));
```

## Performance Considerations

### Caching Strategy

- **Normal requests**: Permissions cached for 5 minutes
- **Force refresh**: Bypasses cache, queries database directly
- **Real-time updates**: Trigger force refresh automatically

### Network Usage

- Realtime connection: ~1-2 KB/minute (minimal overhead)
- Permission refresh: ~5-10 KB per update
- Updates only when changes occur (event-driven, not polling)

### Scalability

- Each user has one WebSocket connection to Supabase
- Connections are lightweight and managed by Supabase
- No custom backend infrastructure needed
- Scales automatically with Supabase infrastructure

## Troubleshooting

### Real-time updates not working

**Check:**
1. ✅ Supabase Realtime enabled for `user_roles` table
2. ✅ User has active session (logged in)
3. ✅ Browser console shows "✅ Real-time permission sync active"
4. ✅ Network connection is stable
5. ✅ `.env.local` has correct Supabase credentials
6. ✅ Adblockers/firewalls not blocking WebSocket connections

### Permissions not updating in UI

**Solutions:**
1. Check browser console for errors
2. Verify `usePermissionSync` hook is called (check logs)
3. Check `refreshPermissions()` is executing
4. Verify API returns updated data with `?force=true`
5. Clear browser cache and refresh
6. Try logout/login as fallback

### Performance issues

**If real-time updates cause lag:**
1. Check number of active WebSocket connections (browser dev tools)
2. Verify only one subscription per user (not duplicate connections)
3. Check network latency to Supabase
4. Review browser console for error loops

## Security Considerations

### Authentication

- Real-time subscriptions are authenticated via Supabase session
- Only changes for the current user's roles trigger updates
- Cannot listen to other users' permission changes

### Authorization

- `user_roles` table has RLS (Row Level Security) policies
- Users can only see their own role assignments
- Admins can see/modify all role assignments
- Real-time events respect RLS policies

### Data Privacy

- Real-time events contain:
  - User ID (UUID)
  - Role ID (UUID)
  - Active status (boolean)
  - Timestamps
- No sensitive data transmitted
- All communication over HTTPS/WSS

## Related Files

- **Hook**: [lib/auth/use-permission-sync.tsx](lib/auth/use-permission-sync.tsx)
- **Auth Context**: [lib/auth/auth-context.tsx](lib/auth/auth-context.tsx)
- **Auth Service**: [lib/auth/supabase-auth-service.ts](lib/auth/supabase-auth-service.ts)
- **Permissions API**: [app/api/auth/permissions/current/route.ts](app/api/auth/permissions/current/route.ts)
- **Sidebar**: [components/app-sidebar.tsx](components/app-sidebar.tsx)
- **Navigation**: [components/nav-main.tsx](components/nav-main.tsx)

## Database Schema

### user_roles Table

```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, role_id)
);
```

### Realtime Filter

The real-time subscription filters by user_id:
```javascript
filter: `user_id=eq.${userId}`
```

This ensures users only receive updates for their own roles.

## Future Enhancements

### Potential Improvements

1. **Notification Center**: Store permission change history for user review
2. **Granular Updates**: Update specific UI components instead of full refresh
3. **Optimistic Updates**: Show changes immediately, rollback on error
4. **Batch Updates**: Combine multiple permission changes into single notification
5. **Admin Dashboard**: Real-time view of who's online and their current permissions
6. **Audit Trail**: Log all permission changes with timestamps and actors

## FAQ

**Q: Do users need to refresh the page?**
A: No, updates happen automatically without page refresh.

**Q: What if the user's browser is offline?**
A: Updates will sync when they reconnect to the internet.

**Q: How fast are the updates?**
A: Typically 1-2 seconds from admin action to user UI update.

**Q: Does this work on mobile devices?**
A: Yes, works on all devices with WebSocket support (all modern browsers).

**Q: What happens if Supabase Realtime is down?**
A: Users can still use the app, but won't receive real-time updates. They'll need to logout/login or wait for cache expiry (5 minutes).

**Q: Can I disable real-time updates?**
A: Yes, comment out the `usePermissionSync` call in auth-context.tsx. Users will then rely on cache expiry or manual refresh.

**Q: How much does Supabase Realtime cost?**
A: Included in Supabase Pro plan. Free tier has limits on concurrent connections (~200 connections).

---

**Last Updated**: 2025-10-30
**Version**: 1.0.0
**Status**: ✅ Production Ready
