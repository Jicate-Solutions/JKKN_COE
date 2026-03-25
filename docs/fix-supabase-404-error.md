# Fix for Supabase 404 Error - child_app_user_sessions

## Problem
The error occurs because the parent app (MyJKKN) is trying to query a `child_app_user_sessions` table that doesn't exist in its Supabase instance.

```
https://kvizhngldtiuufknvehv.supabase.co/rest/v1/child_app_user_sessions?select=... 404 (Not Found)
```

## Root Cause
- The parent app's Supabase URL: `kvizhngldtiuufknvehv.supabase.co`
- Your child app's Supabase URL: `ndnulujelcnnnhydfyum.supabase.co`
- The parent app is trying to track child app sessions in its own database, but the table doesn't exist

## Solution

### Option 1: Create the Table in Parent App's Supabase (Recommended)

1. **Access the Parent App's Supabase Dashboard**
   - URL: https://app.supabase.com/project/kvizhngldtiuufknvehv
   - You need admin access to the parent app's Supabase project

2. **Run the Migration Script**
   - Go to SQL Editor in Supabase Dashboard
   - Copy the contents of `docs/supabase-migration-child-app-sessions.sql`
   - Run the migration to create the table and policies

3. **Verify the Table**
   - Go to Table Editor
   - Confirm `child_app_user_sessions` table exists
   - Check that RLS policies are enabled

### Option 2: Local Session Management (Temporary Fix)

If you don't have access to the parent app's Supabase, use local session validation:

1. **Update your auth context** to use the local session validator:

```typescript
import { SessionValidator } from '@/lib/auth/session-validator';

// In your validation logic, replace Supabase call with:
const validation = SessionValidator.validateSession({
  lastActivityAt: session?.last_activity_at,
  expiresAt: session?.expires_at
});

if (validation.isValid) {
  // Session is valid
  SessionValidator.updateSessionActivity();
} else {
  // Session expired, redirect to login
  console.error(validation.error);
}
```

2. **Update activity tracking** in your auth hooks/middleware

### Option 3: Disable Parent App Session Tracking (Not Recommended)

As a last resort, you can comment out the session validation calls in the parent auth service, but this reduces security.

## Verification Steps

After implementing the fix:

1. Clear browser cache and cookies
2. Log out and log in again
3. Check browser console - the 404 error should be gone
4. Verify session persistence works correctly

## Notes

- The `child_app_user_sessions` table is used by the parent app to track which child apps a user has accessed
- This enables single sign-on (SSO) and session management across the ecosystem
- The table structure supports multiple child apps per user
- Sessions are automatically cleaned up after 30 days of inactivity

## Contact

If you need access to the parent app's Supabase instance, contact the MyJKKN admin team.