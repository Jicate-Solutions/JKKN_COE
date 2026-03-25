# CLAUDE.md Update Summary

## Overview
Added comprehensive Product Requirements Document (PRD) reference to CLAUDE.md to provide AI assistants with better context about the JKKN COE project.

## Changes Made

### Location
**File:** [CLAUDE.md](CLAUDE.md)
**Section:** Added new "Product Requirements Document (PRD)" subsection under "Project Overview"
**Lines:** 9-52

## What Was Added

### 1. PRD Reference Link
- Direct link to [CoE PRD.txt](CoE PRD.txt) for complete product requirements

### 2. Key Project Information

#### Purpose & Scope
- Comprehensive digital examination management system
- Child application within MyJKKN platform
- Serves JKKN Arts Colleges

#### Development Timeline
- 90-day rapid development cycle
- AI-assisted development using Cursor IDE & Claude Code

#### Technology Stack
- **Frontend**: React.js with TypeScript (Next.js 15)
- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL (Supabase)
- **Cache**: Redis for session management
- **Storage**: AWS S3 compatible storage

### 3. Core Modules Overview

Listed all 8 major modules from PRD Section 3:
1. Pre-Examination Module
2. Question Paper Management
3. Examination Conduct
4. Evaluation Module
5. Internal Examinations (Arts College Specific)
6. Result Processing
7. Certification
8. Analytics & Reporting

### 4. Development Acceleration Strategy

From PRD Sections 6 & 7:
- **Cursor IDE Integration**: Component templates, AI-powered auto-complete
- **Claude Code CLI**: Automated scaffolding, testing, documentation
- **Expected Velocity**: 70% faster UI, 80% faster API, 60% faster business logic
- **Team Composition**: 7-member team structure

### 5. Success Metrics

Key performance indicators from PRD Section 8:
- 60% reduction in result processing time
- 70% reduction in internal exam processing time
- 80% reduction in paper consumption
- 99.9% system uptime
- Same-day digital certificate generation

### 6. Important Considerations

Critical requirements for development:
- **Security**: AES-256 encryption for exam data
- **Arts College Features**: Performance arts, visual arts practicals
- **Assessment Types**: Rubric-based, portfolio, competency mapping
- **Accessibility**: WCAG 2.1 Level AA compliance
- **Multi-language**: English, Tamil, regional languages

## Benefits of This Addition

### For AI Assistants (Claude, Cursor)
1. **Better Context**: Understands full project scope and requirements
2. **Module Awareness**: Knows which features belong to which modules
3. **Technical Alignment**: Can suggest technologies that match the stack
4. **Feature Prioritization**: Understands which features are core vs. secondary
5. **Development Standards**: Aware of security, accessibility, and performance requirements

### For Developers
1. **Quick Reference**: Easy access to key project information
2. **Onboarding**: New team members can understand project scope quickly
3. **Consistency**: AI-generated code aligns with PRD requirements
4. **Feature Completeness**: Reminds developers of all required modules

### For Project Management
1. **Scope Tracking**: Clear reference to all planned features
2. **Milestone Alignment**: Development aligns with PRD timeline
3. **Metric Awareness**: Team knows success criteria upfront
4. **Compliance**: Security and accessibility requirements are documented

## How AI Will Use This Information

### Code Generation
- When generating examination-related features, AI will consider:
  - Security requirements (encryption, audit trails)
  - Arts College specific needs (performance arts evaluation)
  - Accessibility standards (WCAG 2.1)
  - Multi-language support

### Feature Development
- AI will suggest implementations that align with:
  - Module structure from PRD
  - Technology stack (Next.js 15, Supabase, etc.)
  - Success metrics (performance, efficiency)

### Error Prevention
- AI will avoid suggestions that conflict with:
  - Security requirements
  - Accessibility standards
  - Performance targets

## Example AI Behavior Changes

### Before Adding PRD to CLAUDE.md
**Developer Prompt**: "Create a result processing module"
**AI Response**: Generic result processing code without considering exam security, audit trails, or Arts College specific requirements

### After Adding PRD to CLAUDE.md
**Developer Prompt**: "Create a result processing module"
**AI Response**:
- Implements multi-level approval workflow (PRD Section 3.5.2)
- Includes encryption for sensitive data (PRD Section 4.2)
- Adds audit trail logging
- Supports practical examination results (Arts College specific)
- Implements revaluation system (PRD Section 3.5.3)
- Includes analytics hooks for success metrics

## Maintenance

### When to Update
1. **PRD Changes**: If CoE PRD.txt is updated, sync changes to CLAUDE.md summary
2. **New Modules**: Add any new core modules to the list
3. **Technology Updates**: Update tech stack if changed
4. **Success Metrics**: Update if new KPIs are defined

### Version Control
- PRD Version: 1.0 (September 2025)
- Last CLAUDE.md Update: October 13, 2025
- Next Review: After Phase 1 completion (per PRD Section 11)

## Related Files

1. **[CoE PRD.txt](CoE PRD.txt)** - Complete Product Requirements Document (949 lines)
2. **[CLAUDE.md](CLAUDE.md)** - Claude Code guidance file (now includes PRD summary)
3. **[COURSE_MAPPING_CHANGES.md](COURSE_MAPPING_CHANGES.md)** - Recent feature implementation documentation
4. **[.cursor/rules/DEVELOPMENT_STANDARDS.md](.cursor/rules/DEVELOPMENT_STANDARDS.md)** - Development standards (referenced in CLAUDE.md)

## Testing

### Verification Steps
1. ✅ CLAUDE.md file updated successfully
2. ✅ PRD link is correct and points to CoE PRD.txt
3. ✅ All 8 core modules listed accurately
4. ✅ Technology stack matches PRD Section 5.1
5. ✅ Success metrics match PRD Section 8
6. ✅ Important considerations included (security, accessibility, etc.)

### AI Context Test
To verify AI has proper context, you can ask:
- "What are the core modules of the JKKN COE application?"
- "What security requirements apply to examination data?"
- "What Arts College specific features are needed?"
- "What is the expected development timeline?"

AI should be able to answer these questions using information from the PRD section in CLAUDE.md.

## Conclusion

This update significantly improves AI assistant effectiveness by providing comprehensive project context from the PRD. AI-generated code will now better align with project requirements, security standards, and success metrics.

**Impact**: Better code quality, faster development, fewer requirement mismatches, improved security compliance.

---

**Last Updated**: November 27, 2025
**Updated By**: AI Assistant (Claude Code)
**Approved By**: [Pending Review]

---

## Update: November 27, 2025 - Session Storage Documentation

### Session Details Saved After Login

Added comprehensive documentation of what data is stored during authentication.

#### 1. Browser Cookies (via `js-cookie`)

| Cookie | Description | Expiry |
|--------|-------------|--------|
| `access_token` | JWT access token from parent app | Based on `expires_in` (default 1 hour) |
| `refresh_token` | Token for refreshing session | 30 days |

#### 2. localStorage (Client-side)

| Key | Description |
|-----|-------------|
| `user_data` | JSON object with user details (ParentAppUser) |
| `auth_timestamp` | Login timestamp |
| `oauth_state` | OAuth state for CSRF protection |
| `post_login_redirect` | Redirect URL after login |

#### 3. ParentAppUser Interface

**File:** [lib/auth/config.ts](lib/auth/config.ts)

```typescript
interface ParentAppUser {
  id: string              // User UUID
  email: string           // Email address
  full_name: string       // Display name
  first_name?: string     // First name
  last_name?: string      // Last name
  role: string            // Primary role
  roles?: string[]        // Array of roles
  avatar_url?: string     // Profile picture URL
  permissions?: string[]  // List of permissions
  institution_id?: string // Institution UUID
  institution_code?: string // Institution code
  department_code?: string // Department code
  is_active?: boolean     // Account active status
  is_super_admin?: boolean // Super admin flag
  last_login?: string     // Last login timestamp
}
```

#### 4. Database Tables Updated on Login

**Via:** [app/api/auth/sync-session/route.ts](app/api/auth/sync-session/route.ts)

##### `users` table:
- `last_login` - Updated on each login
- `avatar_url` - Synced if provided

##### `sessions` table:
| Field | Description |
|-------|-------------|
| `user_id` | User UUID |
| `session_token` | Access token |
| `refresh_token` | Refresh token |
| `device_info` | `{ browser, os, device, raw }` |
| `ip_address` | Client IP address |
| `user_agent` | Browser user agent |
| `is_active` | Session active status |
| `expires_at` | Token expiry time |

##### `user_sessions` table (legacy):
| Field | Description |
|-------|-------------|
| `user_id` | User UUID |
| `access_token` | Access token |
| `refresh_token` | Refresh token |
| `expires_at` | Token expiry time |

#### 5. Auth Context Helper Functions

**File:** [lib/auth/auth-context-parent.tsx](lib/auth/auth-context-parent.tsx)

```typescript
const { user, hasPermission, hasRole, hasAnyRole } = useAuth()

// Check specific permission
hasPermission('courses:read')     // returns boolean

// Check specific role
hasRole('admin')                  // returns boolean

// Check if user has any of the roles
hasAnyRole(['admin', 'teacher'])  // returns boolean

// Direct access to user data
user.role          // Primary role
user.roles         // Array of roles
user.permissions   // Array of permissions
```

### Key Auth Files Updated

| File | Purpose |
|------|---------|
| [lib/auth/config.ts](lib/auth/config.ts) | Auth configuration & ParentAppUser interface |
| [lib/auth/parent-auth-service.ts](lib/auth/parent-auth-service.ts) | OAuth flow, token management, session storage |
| [lib/auth/auth-context-parent.tsx](lib/auth/auth-context-parent.tsx) | React context provider with auth hooks |
| [app/api/auth/sync-session/route.ts](app/api/auth/sync-session/route.ts) | Syncs session to database on login |
| [app/api/auth/logout/route.ts](app/api/auth/logout/route.ts) | Invalidates sessions on logout |

### Migration Note

The auth context has been migrated from `context/auth-context.tsx` to `lib/auth/auth-context-parent.tsx`. The old file now re-exports for backwards compatibility but should be migrated to use the new path directly.
