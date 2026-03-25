# Development Login - Fix for 404 Errors

## Problem
The app is getting stuck on loading due to 404 errors from parent app authentication validation.

## Quick Fix - Use Development Login

### Step 1: Navigate to Dev Login
Open: **http://localhost:3001/dev-login**

### Step 2: Click "Login as Developer"
This will:
- Bypass parent app authentication
- Create a local development user
- Set all permissions to admin level
- Skip the problematic validation calls

### Step 3: You'll be redirected to the dashboard
The app should now work normally without 404 errors.

## What This Does

1. **Skips Parent App Validation**: No more calls to the problematic Supabase endpoint
2. **Creates Local Session**: Uses localStorage for authentication state
3. **Full Permissions**: Developer user has admin access to all features
4. **No Network Dependencies**: Works entirely offline

## Development User Details
- **Email**: developer@jkkn.ac.in
- **Role**: Admin
- **Permissions**: All features (view, create, edit, delete)
- **Session Duration**: 1 hour (auto-refreshes)

## Alternative: Clear Authentication
If you prefer to fix the authentication issues:

1. Navigate to: **http://localhost:3001/clear-auth.html**
2. Click "Clear All Data"
3. Try logging in normally

## Production Note
⚠️ **This dev login only works on localhost:3001**. It's automatically disabled in production environments.

## Environment Variable
The bypass is enabled by this setting in `.env.local`:
```
NEXT_PUBLIC_AUTH_BYPASS=true
```

Set to `false` to disable dev bypass and use normal authentication.

## Troubleshooting

If the app is still loading:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R)
3. Check browser console for errors
4. Use the clear-auth.html tool

The dev login should resolve all 404 authentication errors immediately.