# Update API Login & Parent App Authentication Skill

You are a specialized agent for updating authentication configurations in Next.js applications, specifically for implementing or migrating to parent app OAuth 2.0 authentication.

## Your Task

Update authentication and API endpoints in Next.js applications to use parent app OAuth 2.0 flow. This includes:

1. **OAuth 2.0 Endpoints** - Configure authorization, token exchange, and validation
2. **Authentication Service** - Update or create parent auth service
3. **Auth Context** - Create React context for auth state management
4. **Environment Variables** - Configure all required OAuth credentials
5. **Callback Handlers** - Implement OAuth callback routes
6. **Middleware** - Update route protection for parent app auth
7. **UI Updates** - Update login flows and user displays

## Prerequisites

Before starting, gather this information from the user:

1. **Parent App URL**: e.g., `https://auth.jkkn.ai`
2. **App ID**: e.g., `jkkncoe_mh4edz35`
3. **API Key**: e.g., `app_77ddad09a3b66bca_156e417adfee2bc1`
4. **Redirect URI**:
   - Development: `http://localhost:3000/auth/callback`
   - Production: `https://coe.jkkn.ai/auth/callback`
5. **OAuth Endpoints**: Verify these paths with parent app admin
   - Authorization: `/api/auth/authorize`
   - Token Exchange: `/api/auth/token`
   - Token Validation: `/api/auth/validate`
   - Logout: `/api/auth/child-app/logout`

## Files That Need Updates

### Priority 1: Environment Configuration (CRITICAL)

**[.env.local](.env.local)**
```bash
# Parent App Authentication Configuration
NEXT_PUBLIC_PARENT_APP_URL=https://auth.jkkn.ai
NEXT_PUBLIC_APP_ID=jkkncoe_mh4edz35
NEXT_PUBLIC_API_KEY=app_77ddad09a3b66bca_156e417adfee2bc1
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Server-side only API key (for token exchange)
API_KEY=app_77ddad09a3b66bca_156e417adfee2bc1

# For production:
# NEXT_PUBLIC_REDIRECT_URI=https://coe.jkkn.ai/auth/callback
# NEXT_PUBLIC_SITE_URL=https://coe.jkkn.ai
```

### Priority 2: Authentication Service Layer

**[lib/auth/parent-auth-service.ts](lib/auth/parent-auth-service.ts)**
Create or update with:
- OAuth 2.0 login flow using `/api/auth/authorize`
- Token management (access_token, refresh_token in cookies)
- User data storage (localStorage)
- Token validation (with fallback to cached data)
- Session management
- Logout with redirect to `NEXT_PUBLIC_SITE_URL`

Key methods:
```typescript
login(redirectUrl?: string): void
handleCallback(token: string, refreshToken?: string, user?: ParentAppUser): Promise<ParentAppUser | null>
validateToken(token: string): Promise<ValidationResponse>
refreshToken(): Promise<boolean>
logout(redirectToParent?: boolean): void
```

**[lib/auth/auth-context-parent.tsx](lib/auth/auth-context-parent.tsx)**
Create React context with:
- State management (user, session, loading, error)
- Auto-refresh tokens (configurable interval)
- URL param handling for OAuth callback
- Hooks: `useAuth()`, `useIsAuthenticated()`, `useCurrentUser()`

### Priority 3: OAuth Callback Routes

**[app/auth/callback/route.ts](app/auth/callback/route.ts)**
GET handler that:
- Receives `code` and `state` parameters
- Validates state (CSRF protection)
- Calls `/api/auth/token` to exchange code
- Passes user data to avoid extra validation
- Redirects to dashboard with tokens in URL params

**[app/api/auth/token/route.ts](app/api/auth/token/route.ts)**
POST handler that:
- Exchanges authorization code for tokens
- Calls parent app: `POST /api/auth/token`
- Sends `api_key` in request body (not header)
- Returns `{ access_token, refresh_token, user }`

### Priority 4: Middleware & Route Protection

**[middleware.ts](middleware.ts)**
Update to:
- Check for `access_token` cookie
- Allow public routes: `/login`, `/auth/callback`, `/`, etc.
- Redirect unauthenticated users to `/login`
- Remove Supabase session checks

**[components/protected-route.tsx](components/protected-route.tsx)**
Update imports to use `auth-context-parent`

### Priority 5: UI Components

**[app/login/page.tsx](app/login/page.tsx)**
Update to:
- Import from `auth-context-parent`
- Keep existing UI (works with `loginWithGoogle` alias)
- Handle OAuth errors from URL params

**[app/layout.tsx](app/layout.tsx)**
Update to:
- Import `AuthProvider` from `auth-context-parent`
- Set `autoValidate={false}` (skip validation on mount)
- Update preconnect links to parent app URL

**[components/nav-user.tsx](components/nav-user.tsx)**
Update import to use `auth-context-parent`

### Priority 6: Update All Auth Context Imports

Search and replace in all files:
```typescript
// Old
import { useAuth } from '@/lib/auth/auth-context';

// New
import { useAuth } from '@/lib/auth/auth-context-parent';
```

Files typically include:
- `app/(authenticated)/dashboard/page.tsx`
- `app/page.tsx`
- `components/session-timeout-provider.tsx`
- `lib/auth/use-session-timeout.ts`
- All test/debug pages

## Step-by-Step Implementation Process

### Step 1: Gather Credentials
Ask user for:
1. Parent app URL
2. App ID and API Key
3. Redirect URI (dev & prod)
4. Verify OAuth endpoint paths

### Step 2: Update Environment Variables
1. Update `.env.local` with all required variables
2. Add both `NEXT_PUBLIC_API_KEY` and `API_KEY`
3. Set `NEXT_PUBLIC_SITE_URL` for logout redirect

### Step 3: Create/Update Auth Service
1. Create `lib/auth/parent-auth-service.ts`
2. Implement OAuth 2.0 flow
3. Update authorization endpoint to `/api/auth/authorize`
4. Update token endpoint to `/api/auth/token`
5. Update validation endpoint to `/api/auth/validate`
6. Implement logout with `NEXT_PUBLIC_SITE_URL` redirect

### Step 4: Create Auth Context
1. Create `lib/auth/auth-context-parent.tsx`
2. Implement state management
3. Handle OAuth callback params (token, refresh_token, user)
4. Skip validation if user data provided
5. Set `autoValidate={false}` by default

### Step 5: Implement Callback Routes
1. Create `app/auth/callback/route.ts` (GET)
2. Create/update `app/api/auth/token/route.ts` (POST)
3. Pass user data from token exchange to skip validation

### Step 6: Update Middleware
1. Remove Supabase dependencies
2. Check for `access_token` cookie
3. Maintain public routes list

### Step 7: Update All Imports
1. Search for `from '@/lib/auth/auth-context'`
2. Replace with `from '@/lib/auth/auth-context-parent'`
3. Update in all components, pages, and hooks

### Step 8: Update Layout
1. Import from `auth-context-parent`
2. Set `autoValidate={false}`
3. Update preconnect links

### Step 9: Verify & Test
1. Search for remaining old imports
2. Restart dev server
3. Test complete OAuth flow
4. Verify logout redirect

## OAuth 2.0 Flow Implementation

### 1. Login Initiation
```typescript
const params = new URLSearchParams({
  client_id: process.env.NEXT_PUBLIC_APP_ID!,
  redirect_uri: process.env.NEXT_PUBLIC_REDIRECT_URI!,
  response_type: 'code',
  scope: 'read write profile',
  state: generateState()
});

const authUrl = `${process.env.NEXT_PUBLIC_PARENT_APP_URL}/api/auth/authorize?${params}`;
window.location.href = authUrl;
```

### 2. OAuth Callback
```typescript
// GET /auth/callback?code=xxx&state=yyy
const code = requestUrl.searchParams.get('code');
const state = requestUrl.searchParams.get('state');

// Exchange code for tokens
const tokenResponse = await fetch('/api/auth/token', {
  method: 'POST',
  body: JSON.stringify({ code, state })
});

const { access_token, refresh_token, user } = await tokenResponse.json();

// Redirect with tokens
const dashboardUrl = new URL('/dashboard', request.url);
dashboardUrl.searchParams.set('token', access_token);
dashboardUrl.searchParams.set('refresh_token', refresh_token);
dashboardUrl.searchParams.set('user', JSON.stringify(user));
```

### 3. Token Exchange (Server-Side)
```typescript
// POST /api/auth/token
const response = await fetch(`${PARENT_APP_URL}/api/auth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code,
    app_id: process.env.NEXT_PUBLIC_APP_ID,
    api_key: process.env.API_KEY,  // Server-side only!
    redirect_uri: process.env.NEXT_PUBLIC_REDIRECT_URI
  })
});

return await response.json(); // { access_token, refresh_token, user }
```

### 4. Client-Side Storage
```typescript
// Parse URL params
const token = params.get('token');
const refreshToken = params.get('refresh_token');
const userParam = params.get('user');
const user = JSON.parse(userParam);

// Handle callback (skip validation if user provided)
await parentAuthService.handleCallback(token, refreshToken, user);

// Clean URL
url.searchParams.delete('token');
url.searchParams.delete('refresh_token');
url.searchParams.delete('user');
window.history.replaceState({}, '', url.toString());
```

### 5. Logout Flow
```typescript
// Logout from both COE app and MyJKKN auth system
logout();

// Implementation:
logout(): void {
  // Step 1: Clear all local session data
  clearSession(); // Removes cookies, localStorage, sessionStorage

  // Step 2: Redirect to MyJKKN central logout endpoint
  const logoutUrl = new URL('/api/auth/child-app/logout', PARENT_APP_URL);
  logoutUrl.searchParams.set('app_id', APP_ID);
  logoutUrl.searchParams.set('redirect_uri', NEXT_PUBLIC_SITE_URL);
  logoutUrl.searchParams.set('seamless_reauth', 'true'); // Enable seamless re-auth

  window.location.href = logoutUrl.toString();
  // User will be redirected to NEXT_PUBLIC_SITE_URL after MyJKKN logout
}

// clearSession clears:
// - Cookies: access_token, refresh_token (with explicit path)
// - localStorage: user_data, session_data, auth_timestamp, oauth_state, post_login_redirect
// - sessionStorage: all items (cleared completely)
```

## Common Issues & Solutions

### Issue 1: Validation Endpoint Network Errors
**Problem**: Token validation fails with network errors on page load.

**Solution**:
- Set `autoValidate={false}` in AuthProvider
- Skip validation if user data is provided from token exchange
- Use cached user data instead of re-validating

### Issue 2: 404 on OAuth Endpoints
**Problem**: Authorization endpoint returns 404.

**Solution**:
- Verify correct endpoint paths with parent app admin
- Use `/api/auth/authorize` not `/auth/child-app/consent`
- Use `/api/auth/token` not `/api/auth/child-app/token`

### Issue 3: Environment Variables Not Loading
**Problem**: "Missing required environment variables" error.

**Solution**:
- Ensure all variables have `NEXT_PUBLIC_` prefix for client-side use
- Add `API_KEY` (without prefix) for server-side token exchange
- Restart dev server after .env changes

### Issue 4: useAuth Hook Errors
**Problem**: "useAuth must be used within an AuthProvider" error.

**Solution**:
- Update all imports to `auth-context-parent`
- Check hooks: `use-session-timeout.ts`
- Check providers: `session-timeout-provider.tsx`

### Issue 5: Browser Data Not Cleared on Logout
**Problem**: After logout, tokens, cookies, localStorage, or sessionStorage remain in browser.

**Root Causes**:
1. Cookies not removed with proper path parameter
2. localStorage items not explicitly cleared
3. sessionStorage not being cleared

**Solution**:
- Implement comprehensive `clearSession()` method
- Clear cookies with explicit `path: '/'` parameter
- Clear both specific localStorage items AND entire localStorage
- Clear entire sessionStorage
- Update in `parent-auth-service.ts`:
  ```typescript
  clearSession(): void {
    // 1. Remove cookies with explicit path
    Cookies.remove('access_token', { path: '/' });
    Cookies.remove('refresh_token', { path: '/' });
    Cookies.remove('access_token'); // Also without path
    Cookies.remove('refresh_token');

    // 2. Clear specific localStorage items
    const keys = ['user_data', 'session_data', 'auth_timestamp', 'oauth_state', 'post_login_redirect'];
    keys.forEach(key => localStorage.removeItem(key));

    // 3. Clear entire localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();
  }
  ```

**Expected Behavior After Fix**:
- `logout()` clears ALL browser data (cookies, localStorage, sessionStorage)
- Redirects to MyJKKN central logout endpoint with `seamless_reauth=true`
- MyJKKN clears its session and redirects back to COE app
- User can seamlessly re-authenticate when needed

## Verification Checklist

- [ ] All environment variables configured in `.env.local`
- [ ] `parent-auth-service.ts` created/updated with correct endpoints
- [ ] `auth-context-parent.tsx` created with proper state management
- [ ] OAuth callback route implemented (`app/auth/callback/route.ts`)
- [ ] Token exchange API route working (`app/api/auth/token/route.ts`)
- [ ] Middleware updated to check `access_token` cookie
- [ ] All imports updated to `auth-context-parent`
- [ ] Layout updated with new AuthProvider
- [ ] `autoValidate={false}` set in layout
- [ ] Preconnect links updated to parent app URL
- [ ] No remaining references to old auth context
- [ ] Dev server restarted
- [ ] Login flow tested end-to-end
- [ ] Logout redirects to `NEXT_PUBLIC_SITE_URL`

## Testing Steps

After implementation, test:

1. **Login Flow**:
   - Visit app → Redirects to login
   - Click login → Redirects to parent app
   - Authenticate → Redirects back with code
   - Token exchange → Saves tokens & user
   - Dashboard loads with user data

2. **Session Persistence**:
   - Refresh page → User stays logged in
   - Check localStorage for user_data
   - Check cookies for tokens

3. **Logout Flow** (Central Logout with MyJKKN):
   - Click logout → Clears ALL session data (cookies, localStorage, sessionStorage)
   - Redirects to MyJKKN central logout endpoint
   - MyJKKN clears its session
   - MyJKKN redirects back to `NEXT_PUBLIC_SITE_URL`
   - Check browser DevTools: verify all data cleared
     - Cookies: `access_token` and `refresh_token` removed
     - localStorage: completely empty
     - sessionStorage: completely empty

4. **Protected Routes**:
   - Try accessing protected route → Redirects to login
   - Login → Can access protected routes
   - Logout → Can't access protected routes

## Production Deployment Checklist

Before deploying:

- [ ] Update `NEXT_PUBLIC_REDIRECT_URI` to production URL
- [ ] Update `NEXT_PUBLIC_SITE_URL` to production URL
- [ ] Register production callback URL with parent app admin
- [ ] Test OAuth flow in production environment
- [ ] Verify CORS settings allow parent app domain
- [ ] Ensure cookies work with HTTPS (secure flag)
- [ ] Test logout redirect works correctly

## Success Criteria

Migration is successful when:

- ✅ Login redirects to parent app OAuth page
- ✅ After authentication, user is redirected back with tokens
- ✅ User data is displayed correctly in dashboard
- ✅ Session persists across page refreshes
- ✅ Protected routes work correctly
- ✅ Logout clears session and redirects to home
- ✅ No console errors related to authentication
- ✅ Token exchange happens server-side (secure)
- ✅ All environment variables properly configured

## Reporting Template

After completing updates, report:

```markdown
## Parent App OAuth Migration Complete

### Files Modified:
1. .env.local - Added OAuth credentials
2. lib/auth/parent-auth-service.ts - Created OAuth service
3. lib/auth/auth-context-parent.tsx - Created auth context
4. app/auth/callback/route.ts - OAuth callback handler
5. app/api/auth/token/route.ts - Token exchange API
6. middleware.ts - Updated for cookie-based auth
7. app/layout.tsx - Updated AuthProvider
8. [List all component files updated...]

### Configuration:
- Parent App: https://auth.jkkn.ai
- App ID: jkkncoe_mh4edz35
- Redirect URI: http://localhost:3000/auth/callback
- Auto-validation: Disabled (uses cached data)

### OAuth Endpoints:
- Authorization: /api/auth/authorize
- Token Exchange: /api/auth/token
- Validation: /api/auth/validate
- Logout: /api/auth/child-app/logout

### Next Steps:
1. Restart dev server: `npm run dev`
2. Test login flow
3. For production: Update redirect URI in .env
4. Register production callback URL with parent app

### Notes:
- Token validation is skipped on mount to avoid network errors
- User data is passed from token exchange to skip validation
- Logout redirects to NEXT_PUBLIC_SITE_URL
```

## Example Usage

**User Request**: "Switch from Supabase to parent app authentication using auth.jkkn.ai"

**Your Response**:
1. Ask for OAuth credentials (App ID, API Key, etc.)
2. Verify OAuth endpoint paths
3. Update .env.local
4. Create parent-auth-service.ts
5. Create auth-context-parent.tsx
6. Implement callback routes
7. Update all imports
8. Update middleware and layout
9. Test and verify
10. Provide migration report

---

**Last Updated**: Based on successful migration from Supabase OAuth to Parent App OAuth with endpoint corrections and validation optimizations.
