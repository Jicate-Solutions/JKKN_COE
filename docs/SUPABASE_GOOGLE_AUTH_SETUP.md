# Supabase Google Authentication Setup Guide

## Overview
This application uses Supabase's built-in Google OAuth provider with strict user validation. Only pre-authorized users in the database can access the system.

## Authentication Flow

```mermaid
Google Login → Supabase Auth → Check Users Table → Validate (Email, Role, is_active) → Grant/Deny Access
```

### Validation Requirements
✅ User email must exist in the `users` table
✅ User must have a valid `role` assigned
✅ User account must be active (`is_active = TRUE`)
❌ If any validation fails: "This user cannot access the portal"

## Setup Instructions

### 1. Google Cloud Console Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select or create a project
3. Navigate to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client ID**
5. Configure the OAuth consent screen:
   - Application name: Your app name
   - User support email: Your email
   - Authorized domains: Your domain
6. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: Your app name
   - Authorized redirect URIs:
     ```
     https://[YOUR-PROJECT-ID].supabase.co/auth/v1/callback
     ```
   - Copy the **Client ID** and **Client Secret**

### 2. Supabase Dashboard Configuration

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Authentication → Providers**
3. Find **Google** in the list and click to expand
4. Enable Google provider
5. Add your Google OAuth credentials:
   - **Client ID**: Paste from Google Cloud Console
   - **Client Secret**: Paste from Google Cloud Console
6. Save the configuration

### 3. Supabase Project Settings

1. In Supabase Dashboard, go to **Settings → API**
2. Copy your project URL and anon key
3. Go to **Authentication → URL Configuration**
4. Set the following:
   - **Site URL**: `http://localhost:3000` (for development)
   - **Redirect URLs**: Add `http://localhost:3000/auth/callback`

### 4. Environment Variables

Update your `.env.local` file:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://[YOUR-PROJECT-ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Site URL for redirects
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 5. Database Setup

Ensure your `users` table has the required fields:

```sql
-- Create users table if not exists
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);

-- Example: Add authorized users
INSERT INTO users (id, email, full_name, role, is_active)
VALUES
  (gen_random_uuid(), 'admin@example.com', 'Admin User', 'admin', true),
  (gen_random_uuid(), 'user@example.com', 'Regular User', 'user', true);
```

## User Management

### Adding New Users

Users must be pre-registered in the database before they can login:

```sql
-- Add a new authorized user
INSERT INTO users (id, email, full_name, role, is_active)
VALUES (gen_random_uuid(), 'newuser@example.com', 'New User', 'user', true);
```

### Deactivating Users

To revoke access immediately:

```sql
-- Deactivate a user
UPDATE users
SET is_active = false
WHERE email = 'user@example.com';
```

### Changing User Roles

```sql
-- Update user role
UPDATE users
SET role = 'admin'
WHERE email = 'user@example.com';
```

## Implementation Details

### Authentication Service
The app uses `supabase-auth-service.ts` which:
- Initiates Google OAuth flow via Supabase
- Validates users against the database
- Handles session management
- Signs out unauthorized users automatically

### Middleware Protection
`middleware.ts` protects routes by:
- Checking for valid Supabase session
- Validating user is active in database
- Verifying user has assigned role
- Redirecting unauthorized users to login

### Key Files
- `/lib/auth/supabase-auth-service.ts` - Core authentication service
- `/lib/auth/auth-context.tsx` - React context for auth state
- `/middleware.ts` - Route protection middleware
- `/app/auth/callback/page.tsx` - OAuth callback handler
- `/app/login/page.tsx` - Login page with Google button

## Testing

### Test Page
Navigate to `/test-supabase-google` to:
- Test Google Sign-In flow
- Verify user validation
- Check session status
- View detailed error messages

### Test Scenarios

1. **Valid User**
   - Email exists in database ✅
   - Role assigned ✅
   - is_active = true ✅
   - Result: Successful login

2. **User Not in Database**
   - Email not found ❌
   - Result: "This user cannot access the portal. User not found in the system."

3. **No Role Assigned**
   - Email exists ✅
   - Role is null ❌
   - Result: "This user cannot access the portal. User role not assigned."

4. **Inactive User**
   - Email exists ✅
   - Role assigned ✅
   - is_active = false ❌
   - Result: "This user cannot access the portal. User account is inactive."

## Security Features

### Session Management
- Sessions expire based on Supabase settings
- Tokens are validated on each request
- Inactive users are immediately logged out

### Access Control
- Email-based user identification
- Role-based permissions
- Active status validation
- No self-registration allowed

### Best Practices
1. Always pre-create users in database
2. Use strong role definitions
3. Regularly audit user access
4. Monitor failed login attempts
5. Keep user table synchronized

## Troubleshooting

### Common Issues

#### "This user cannot access the portal"
- Verify email exists in users table
- Check role is assigned
- Confirm is_active = true

#### Google Sign-In not working
- Verify Google OAuth credentials in Supabase
- Check redirect URIs match exactly
- Ensure Site URL is configured

#### Session expires quickly
- Check Supabase JWT expiry settings
- Verify refresh token configuration

#### Middleware redirect loops
- Clear browser cookies
- Check public routes configuration
- Verify Supabase client initialization

### Debug Mode
Enable debug logging in `.env.local`:
```env
NEXT_PUBLIC_AUTH_DEBUG=true
```

Check browser console and server logs for detailed error messages.

## Production Deployment

### 1. Update Environment Variables
Set production values for:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

### 2. Update Google OAuth
Add production redirect URI:
```
https://[YOUR-PROJECT-ID].supabase.co/auth/v1/callback
```

### 3. Update Supabase Settings
- Set production Site URL
- Add production redirect URLs
- Configure session timeout

### 4. Security Checklist
- [ ] Remove debug logging
- [ ] Use secure service role key
- [ ] Enable RLS policies
- [ ] Set appropriate CORS headers
- [ ] Configure rate limiting
- [ ] Monitor authentication logs

## Support

For issues or questions:
1. Check Supabase Dashboard logs
2. Review browser console errors
3. Verify database user records
4. Contact JKKN COE administrator