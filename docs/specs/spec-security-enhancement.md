# COE Security Enhancement Spec

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Build a comprehensive, reusable security layer for the JKKN COE portal — IP-based access restriction, audit logging, email OTP for sensitive operations, and device-lock sessions. Designed as generic infrastructure that any page/module can opt into with minimal code.

**Architecture:** Database-driven configuration (no redeployment to change rules). Reusable hooks + wrapper components for UI enforcement. API middleware for server-side enforcement. Defense in depth — both client and server validate independently.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL), Shadcn UI, Tailwind CSS, Existing SMTP (for OTP emails)

---

## Summary of Decisions

| Decision | Choice |
|----------|--------|
| **IP restriction scope** | Generic system — any page can opt in via hook/component |
| **IP-restricted pages (first)** | Mark entry pages (expandable to any page via feature keys) |
| **Blocked UX** | Block with message: "Only accessible from COE office network. Your IP: x.x.x.x" |
| **IP config storage** | Database table (`allowed_ips`) — admin manages via UI |
| **IP management access** | `super_admin` COE role only |
| **Enforcement level** | Both API + UI (defense in depth) |
| **Feature keys** | Predefined dropdown + custom option |
| **Bypass mechanism** | `super_admin` bypasses all IP rules automatically |
| **2FA method** | Email OTP (6-digit code via existing SMTP) |
| **2FA trigger** | Result publishing, bulk mark changes |
| **Audit logging** | Log every sensitive action with user, IP, timestamp, before/after values |
| **Device lock** | Lock session to device/browser fingerprint; force re-auth on mismatch |
| **Priority** | Phase 1: IP restriction → Phase 2: Audit logging → Phase 3: Email OTP → Phase 4: Device lock |

---

## Phase 1 — IP-Based Access Restriction

### Overview

Any page or API route can be IP-restricted by associating it with a **feature key** (e.g., `mark_entry`, `result_publish`). Allowed IP addresses/ranges are stored in a database table and managed via an admin UI. The `super_admin` COE role bypasses all IP restrictions.

### Database Schema

#### `allowed_ips`

```sql
CREATE TABLE allowed_ips (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID REFERENCES institutions(id),
  label             TEXT NOT NULL,
  ip_address        INET,
  ip_range          CIDR,
  applies_to        TEXT[] NOT NULL DEFAULT '{}',
  description       TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT ip_or_range CHECK (ip_address IS NOT NULL OR ip_range IS NOT NULL)
);

CREATE INDEX idx_allowed_ips_active ON allowed_ips(is_active) WHERE is_active = true;
CREATE INDEX idx_allowed_ips_applies ON allowed_ips USING gin(applies_to);
CREATE INDEX idx_allowed_ips_institution ON allowed_ips(institution_id);
```

#### Predefined Feature Keys

| Key | Description | First Usage |
|-----|-------------|-------------|
| `mark_entry` | Internal & external mark entry pages | Phase 1 |
| `result_publish` | Final marks publishing, grade generation | Phase 1 |
| `exam_registration` | Exam registration management | Future |
| `hall_tickets` | Hall ticket generation | Future |
| `report_export` | Report downloads/exports | Future |
| `admin` | Admin pages (role management, settings) | Future |
| `ip_management` | IP management page itself | Future |
| *(custom)* | Admin can add new keys via UI | Anytime |

### API Design

#### `GET /api/security/check-ip?feature={feature_key}`

Server-side IP check. Returns whether the client's IP is allowed for the given feature.

**Request flow:**

```
Client request
     │
     ▼
Extract IP from headers:
  x-forwarded-for → x-real-ip → request.ip
     │
     ▼
Is user super_admin? → YES → { allowed: true, bypass: 'super_admin' }
     │ NO
     ▼
Query: SELECT * FROM allowed_ips
  WHERE is_active = true
  AND '{feature_key}' = ANY(applies_to)
  AND (
    ip_address = client_ip::inet
    OR client_ip::inet <<= ip_range
  )
  AND (institution_id IS NULL OR institution_id = user_institution_id)
     │
     ├─ Match → { allowed: true, matched_rule: label }
     └─ No match → {
          allowed: false,
          client_ip: 'x.x.x.x',
          message: 'This page is only accessible from the COE office network.'
        }
```

**Response:**

```typescript
interface IpCheckResponse {
  allowed: boolean
  client_ip: string
  bypass?: 'super_admin'
  matched_rule?: string
  message?: string
}
```

#### `GET /api/admin/ip-management` — List IP rules

#### `POST /api/admin/ip-management` — Create IP rule

```typescript
{
  label: string           // 'COE Office Block A'
  ip_address?: string     // Single IP: '192.168.1.100'
  ip_range?: string       // CIDR range: '192.168.1.0/24'
  applies_to: string[]    // ['mark_entry', 'result_publish']
  institution_id?: string // Per-institution (null = all institutions)
  description?: string
}
```

#### `PUT /api/admin/ip-management/:id` — Update IP rule

#### `DELETE /api/admin/ip-management/:id` — Delete IP rule

#### `GET /api/admin/ip-management/feature-keys` — List predefined + custom feature keys

### Client-Side Integration

#### `useIpRestriction` Hook

```typescript
// hooks/security/use-ip-restriction.ts

interface UseIpRestrictionResult {
  allowed: boolean
  checking: boolean
  clientIp: string | null
  message: string | null
  bypass: boolean       // true if super_admin bypass
}

function useIpRestriction(featureKey: string): UseIpRestrictionResult

// Usage in any page:
const { allowed, checking, clientIp, message } = useIpRestriction('mark_entry')

if (checking) return <LoadingSpinner />
if (!allowed) return <IpBlockedMessage ip={clientIp} message={message} />
return <MarkEntryForm />
```

#### `<IpRestricted>` Wrapper Component

```typescript
// components/security/ip-restricted.tsx

interface IpRestrictedProps {
  feature: string
  children: React.ReactNode
  fallback?: React.ReactNode  // Custom blocked message
}

// Usage — declarative, wraps any page content:
<IpRestricted feature="mark_entry">
  <MarkEntryForm />
</IpRestricted>

// With custom fallback:
<IpRestricted feature="result_publish" fallback={<CustomBlockedPage />}>
  <ResultPublishPage />
</IpRestricted>
```

#### Default Blocked Message Component

```typescript
// components/security/ip-blocked-message.tsx

// Displays:
// ┌─────────────────────────────────────────┐
// │  🔒 Access Restricted                   │
// │                                         │
// │  This page is only accessible from the  │
// │  COE office network.                    │
// │                                         │
// │  Your IP: 103.45.67.89                  │
// │                                         │
// │  Contact your administrator if you      │
// │  need access from this location.        │
// └─────────────────────────────────────────┘
```

#### API Route Middleware Helper

```typescript
// lib/security/check-ip-access.ts

async function checkIpAccess(
  request: Request,
  featureKey: string,
  userCoeRoles?: string[]
): Promise<IpCheckResponse>

// Usage in any API route:
export async function POST(request: Request) {
  const check = await checkIpAccess(request, 'mark_entry', user.coe_roles)
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 403 })
  }
  // ... proceed with mark entry
}
```

### Admin UI — IP Management Page

**Page:** `/admin/ip-management`
**Access:** `super_admin` COE role only

**Features:**
- Table listing all IP rules with: Label, IP/Range, Feature tags (as badges), Institution, Active toggle, Actions
- Add/Edit form (Sheet) with:
  - Label (text)
  - IP Address (single) or CIDR Range — toggle between the two
  - Feature keys (multi-select from predefined + custom input)
  - Institution dropdown (optional — null = all institutions)
  - Active toggle
  - Description (optional notes)
- Delete with confirmation
- Test button: "Check my IP" — shows whether current admin IP matches any rules for a given feature

### Sidebar Navigation

Add under Admin section:
```
Admin
  ├── Users
  ├── Role Management
  ├── IP Management        ← NEW
  ├── Roles
  ├── Permissions
  └── Role Permission
```

### Apply to Mark Entry Pages (First Usage)

Pages to protect with `feature="mark_entry"`:

| Page | Path |
|------|------|
| External Mark Entry | `/post-exam/external-mark-entry` |
| External Mark Bulk Upload | `/post-exam/external-mark-bulk-upload` |
| External Mark Correction | `/post-exam/external-mark-correction` |
| Practical Mark Entry | `/post-exam/practical-mark-entry` |
| Bulk Internal Marks | `/pre-exam/bulk-internal-marks` |
| Comment Grade Entry | `/marks-management/comment-grades` |
| Credit Entry | `/marks-management/credit-entry` |

Implementation: Wrap each page's content with `<IpRestricted feature="mark_entry">`.

---

## Phase 2 — Audit Logging

### Overview

Log every sensitive action with full context: who did what, from where, when, and what changed.

### Database Schema

#### `audit_logs`

```sql
CREATE TABLE audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    UUID REFERENCES institutions(id),
  user_id           UUID REFERENCES users(id),
  user_email        TEXT,
  action            TEXT NOT NULL,
  resource_type     TEXT NOT NULL,
  resource_id       TEXT,
  ip_address        INET,
  user_agent        TEXT,
  before_data       JSONB,
  after_data        JSONB,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_institution ON audit_logs(institution_id);
```

### Actions to Log

| Action | Resource Type | Trigger |
|--------|--------------|---------|
| `mark.create` | `external_marks` | External mark entry |
| `mark.update` | `external_marks` | Mark correction |
| `mark.bulk_upload` | `external_marks` | Bulk mark upload |
| `mark.internal_create` | `internal_marks` | Internal mark entry |
| `result.publish` | `final_marks` | Publish final marks |
| `result.lock` | `final_marks` | Lock results |
| `role.assign` | `user_roles` | Role assigned to user |
| `role.revoke` | `user_roles` | Role revoked |
| `user.remove` | `users` | User removed from COE |
| `ip_rule.create` | `allowed_ips` | IP rule created |
| `ip_rule.update` | `allowed_ips` | IP rule modified |
| `ip_rule.delete` | `allowed_ips` | IP rule deleted |
| `session.logout` | `sessions` | User logout |
| `session.force_logout` | `sessions` | Force logout (role revoke) |

### API Helper

```typescript
// lib/security/audit-log.ts

async function logAudit(params: {
  supabase: SupabaseClient
  userId: string
  userEmail: string
  action: string
  resourceType: string
  resourceId?: string
  institutionId?: string
  request?: Request          // Extracts IP + user-agent
  beforeData?: Record<string, unknown>
  afterData?: Record<string, unknown>
  metadata?: Record<string, unknown>
}): Promise<void>

// Usage:
await logAudit({
  supabase,
  userId: user.id,
  userEmail: user.email,
  action: 'mark.create',
  resourceType: 'external_marks',
  resourceId: markId,
  institutionId,
  request,
  afterData: { marks: newMarks },
})
```

### Admin UI — Audit Log Viewer

**Page:** `/admin/audit-logs`
**Access:** `super_admin` COE role only

**Features:**
- Table: Timestamp, User, Action, Resource, IP, Details (expandable)
- Filters: Date range, User email, Action type, Resource type
- Export to CSV
- Before/After diff viewer for data changes

---

## Phase 3 — Email OTP for Sensitive Operations

### Overview

Before executing high-impact operations (result publishing, bulk mark changes), the system sends a 6-digit OTP to the user's email. The operation only proceeds after OTP verification.

### Database Schema

#### `otp_codes`

```sql
CREATE TABLE otp_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  email         TEXT NOT NULL,
  code          TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  verified_at   TIMESTAMPTZ,
  attempts      INTEGER DEFAULT 0,
  max_attempts  INTEGER DEFAULT 3,
  ip_address    INET,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_otp_codes_user ON otp_codes(user_id, purpose, created_at DESC);
```

### Operations Requiring OTP

| Operation | Purpose Key | Page |
|-----------|-------------|------|
| Publish final marks | `result_publish` | Generate Final Marks |
| Bulk mark upload | `bulk_mark_upload` | External Mark Bulk Upload |
| Lock semester results | `result_lock` | Semester Results |
| Delete user from COE | `user_delete` | Role Management |

### Flow

```
User clicks "Publish Results"
     │
     ▼
OTP Confirmation Dialog opens:
  "This action requires verification.
   An OTP will be sent to your email."
  [Send OTP] [Cancel]
     │
     ▼
POST /api/security/otp/send
  → Generate 6-digit code
  → Store in otp_codes (expires in 10 min)
  → Send via SMTP to user email
     │
     ▼
User enters OTP in dialog:
  [______] [Verify & Proceed]
     │
     ▼
POST /api/security/otp/verify
  → Check code, expiry, attempts
  → Return verified token
     │
     ▼
Original action proceeds with verified token
```

### Client Component

```typescript
// components/security/otp-confirmation.tsx

interface OtpConfirmationProps {
  purpose: string
  title: string
  description: string
  onVerified: (token: string) => void
  onCancel: () => void
}

// Usage:
<OtpConfirmation
  purpose="result_publish"
  title="Publish Results"
  description="Publishing final marks for 450 learners. This cannot be undone."
  onVerified={(token) => publishResults(token)}
  onCancel={() => setShowOtp(false)}
/>
```

---

## Phase 4 — Device Lock

### Overview

On login, capture a device fingerprint (browser + OS + screen resolution hash). Store it in the session. If a subsequent request comes from a different fingerprint, force re-authentication.

### Implementation

#### Fingerprint Generation (Client)

```typescript
// lib/security/device-fingerprint.ts

function generateDeviceFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency,
  ]
  return sha256(components.join('|'))
}
```

#### Storage

Add `device_fingerprint` column to `sessions` table:

```sql
ALTER TABLE sessions ADD COLUMN device_fingerprint TEXT;
```

#### Check on Every Sync

During `sync-session`, compare the fingerprint sent by the client with the stored one. If mismatch → invalidate session.

---

## Module Structure

```
hooks/security/
  ├── use-ip-restriction.ts          # IP check hook for any page
  └── use-otp-confirmation.ts        # OTP flow hook

lib/security/
  ├── check-ip-access.ts             # Server-side IP check helper
  ├── audit-log.ts                   # Audit logging helper
  ├── device-fingerprint.ts          # Client-side fingerprint generation
  └── otp-service.ts                 # OTP generate/verify logic

components/security/
  ├── ip-restricted.tsx              # <IpRestricted feature="..."> wrapper
  ├── ip-blocked-message.tsx         # Default blocked message UI
  └── otp-confirmation.tsx           # OTP dialog component

app/api/security/
  ├── check-ip/route.ts              # GET — check client IP against rules
  ├── otp/send/route.ts              # POST — generate and send OTP
  └── otp/verify/route.ts            # POST — verify OTP code

app/api/admin/
  ├── ip-management/route.ts         # GET, POST — list/create IP rules
  ├── ip-management/[id]/route.ts    # PUT, DELETE — update/delete IP rule
  ├── ip-management/feature-keys/route.ts  # GET — list feature keys
  └── audit-logs/route.ts            # GET — query audit logs

app/(coe)/admin/
  ├── ip-management/page.tsx         # IP Management admin page
  └── audit-logs/page.tsx            # Audit Log viewer page
```

---

## Implementation Phases

| Phase | Scope | Depends On |
|-------|-------|------------|
| **1 — IP Restriction** | `allowed_ips` table, check-ip API, useIpRestriction hook, IpRestricted component, IP Management admin page, apply to mark entry pages | Nothing |
| **2 — Audit Logging** | `audit_logs` table, logAudit helper, integrate into role management + mark entry APIs, Audit Log viewer page | Phase 1 (logs IP access attempts) |
| **3 — Email OTP** | `otp_codes` table, send/verify APIs, OTP Confirmation component, integrate into result publish + bulk upload | Phase 2 (logs OTP events) |
| **4 — Device Lock** | Fingerprint generation, sessions.device_fingerprint column, sync-session comparison, force re-auth on mismatch | Phase 1-3 complete |

---

## Validation Rules

| Rule | Details |
|------|---------|
| IP format | Validate INET (single IP) or CIDR (range) format before insert |
| Feature key required | `applies_to` array must have at least one entry |
| super_admin bypass | Never blocked by IP rules; always `{ allowed: true }` |
| OTP expiry | 10 minutes; max 3 attempts |
| OTP rate limit | Max 3 OTPs per user per hour |
| Fingerprint mismatch | Log as security event + force re-auth (don't silently fail) |
| Audit log immutable | No UPDATE or DELETE on `audit_logs` — append-only |

---

## Open Questions

- [ ] Should IP rules be per-institution or global? (Current: both — `institution_id` nullable)
- [ ] Should failed IP checks be logged to audit_logs? (Recommended: yes)
- [ ] Should OTP be required for super_admin too? (Current design: yes)
- [ ] Audit log retention policy? (30 days? 1 year? Forever?)
- [ ] Should device lock apply to all users or only specific roles?
- [ ] VPN considerations: users on VPN may have dynamic IPs — how to handle?

---

*Spec version: 1.0 | Created: 2026-03-24 | Based on brainstorming session decisions*
