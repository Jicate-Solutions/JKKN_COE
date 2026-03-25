# Exam Session Management Strategy

## Problem Statement

In COE application, every institution has multiple exam sessions each year (typically April and November). Over time, this creates:

- **Cluttered dropdowns** with 10+ sessions after 5 years
- **User confusion** - accidentally selecting old sessions
- **Performance issues** - loading unnecessary historical data
- **Report needs** - super_admin needs ALL sessions for historical reports

### Current Behavior

| Year | Sessions | Day-to-Day Use | Historical Need |
|------|----------|----------------|-----------------|
| Year 1 | Apr 2024, Nov 2024 | Not needed | Reports only |
| Year 2 | Apr 2025, Nov 2025 | Active | Current work |
| Year 3 | Apr 2026... | Future | Not yet created |

---

## Recommended Solution: Hybrid Approach

Combine **Session Status** + **Global Session Context** + **Institution Default**

### Architecture Overview

```
+-------------------------------------------------------------+
|  Header Bar                                                  |
|  [JKKN Engineering v]  [Session: Apr 2025 - Active v]       |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|  SessionContext Provider                                     |
|  - currentSession: ExamSession                               |
|  - availableSessions: ExamSession[] (filtered by status)    |
|  - setCurrentSession()                                       |
|  - isReady: boolean                                          |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|  Page Components                                             |
|  - Auto-filter by currentSession                            |
|  - Reports can override with showAllSessions=true           |
+-------------------------------------------------------------+
```

---

## Database Schema Changes

### 1. Add Status to exam_sessions

```sql
-- Migration: add_status_to_exam_sessions.sql
ALTER TABLE exam_sessions
ADD COLUMN status VARCHAR(20) DEFAULT 'active';

-- Add check constraint
ALTER TABLE exam_sessions
ADD CONSTRAINT exam_sessions_status_check
CHECK (status IN ('upcoming', 'active', 'completed', 'archived'));

-- Add index for filtering
CREATE INDEX idx_exam_sessions_status ON exam_sessions(status);

-- Update existing sessions (mark old ones as completed)
UPDATE exam_sessions
SET status = 'completed'
WHERE end_date < CURRENT_DATE;

UPDATE exam_sessions
SET status = 'active'
WHERE end_date >= CURRENT_DATE;
```

### 2. Create Institution Session Settings

```sql
-- Migration: create_institution_session_settings.sql
CREATE TABLE institution_session_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  current_exam_session_id UUID REFERENCES exam_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(institutions_id)
);

-- RLS Policy
ALTER TABLE institution_session_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their institution settings"
ON institution_session_settings FOR SELECT
USING (
  institutions_id IN (
    SELECT institutions_id FROM user_institutions WHERE user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_super_admin = true)
);

CREATE POLICY "Admins can update their institution settings"
ON institution_session_settings FOR UPDATE
USING (
  institutions_id IN (
    SELECT institutions_id FROM user_institutions
    WHERE user_id = auth.uid() AND role IN ('admin', 'coe_admin')
  )
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_super_admin = true)
);
```

### 3. Session Status Definitions

| Status | Description | Visible In | Editable | Use Cases |
|--------|-------------|------------|----------|-----------|
| `upcoming` | Future session, planning phase | Planning pages only | Full edit | Timetable setup, registration config |
| `active` | Current working session | All pages | Full edit | Day-to-day operations |
| `completed` | Session ended, results finalized | Reports only | Locked | Historical reports, transcripts |
| `archived` | Old sessions, rarely accessed | super_admin reports | Locked | Audit, compliance |

---

## Implementation Components

### 1. Types

```typescript
// types/exam-session.ts

export type ExamSessionStatus = 'upcoming' | 'active' | 'completed' | 'archived'

export interface ExamSession {
  id: string
  session_name: string
  session_code: string
  academic_year: string
  semester: string
  start_date: string
  end_date: string
  status: ExamSessionStatus
  institutions_id: string
  created_at: string
  updated_at: string
}

export interface InstitutionSessionSettings {
  id: string
  institutions_id: string
  current_exam_session_id: string | null
  created_at: string
  updated_at: string
}

export interface SessionContextType {
  currentSession: ExamSession | null
  availableSessions: ExamSession[]
  setCurrentSession: (session: ExamSession) => void
  isReady: boolean
  showAllSessions: boolean
  setShowAllSessions: (show: boolean) => void
}
```

### 2. Session Context Provider

```typescript
// context/session-context.tsx

'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { useInstitution } from '@/context/institution-context'

const SessionContext = createContext<SessionContextType | undefined>(undefined)

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { selectedInstitution } = useInstitution()
  const [currentSession, setCurrentSession] = useState<ExamSession | null>(null)
  const [availableSessions, setAvailableSessions] = useState<ExamSession[]>([])
  const [showAllSessions, setShowAllSessions] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!user || !selectedInstitution) return

    const fetchSessions = async () => {
      // Fetch sessions based on institution and status
      const statusFilter = showAllSessions
        ? ['upcoming', 'active', 'completed', 'archived']
        : ['upcoming', 'active']

      const response = await fetch(
        `/api/exam-sessions?institutions_id=${selectedInstitution.id}&status=${statusFilter.join(',')}`
      )
      const data = await response.json()
      setAvailableSessions(data)

      // Set current session from settings or default to latest active
      const settings = await fetch(
        `/api/institution-session-settings?institutions_id=${selectedInstitution.id}`
      )
      const settingsData = await settings.json()

      if (settingsData.current_exam_session_id) {
        const current = data.find(s => s.id === settingsData.current_exam_session_id)
        setCurrentSession(current || data[0])
      } else {
        // Default to first active session
        const activeSession = data.find(s => s.status === 'active')
        setCurrentSession(activeSession || data[0])
      }

      setIsReady(true)
    }

    fetchSessions()
  }, [user, selectedInstitution, showAllSessions])

  return (
    <SessionContext.Provider value={{
      currentSession,
      availableSessions,
      setCurrentSession,
      isReady,
      showAllSessions,
      setShowAllSessions
    }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within SessionProvider')
  }
  return context
}
```

### 3. Session Selector Component

```typescript
// components/session-selector.tsx

'use client'

import { useSession } from '@/context/session-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

const statusColors = {
  upcoming: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  archived: 'bg-yellow-100 text-yellow-800',
}

export function SessionSelector() {
  const { currentSession, availableSessions, setCurrentSession, isReady } = useSession()

  if (!isReady) return <div className="h-9 w-48 animate-pulse bg-gray-200 rounded" />

  return (
    <Select
      value={currentSession?.id}
      onValueChange={(id) => {
        const session = availableSessions.find(s => s.id === id)
        if (session) setCurrentSession(session)
      }}
    >
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Select session" />
      </SelectTrigger>
      <SelectContent>
        {availableSessions.map((session) => (
          <SelectItem key={session.id} value={session.id}>
            <div className="flex items-center gap-2">
              <span>{session.session_name}</span>
              <Badge className={statusColors[session.status]} variant="outline">
                {session.status}
              </Badge>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

### 4. useSessionFilter Hook

```typescript
// hooks/use-session-filter.ts

import { useSession } from '@/context/session-context'
import { useMemo } from 'react'

interface UseSessionFilterOptions {
  includeAllSessions?: boolean  // For reports pages
}

export function useSessionFilter(options: UseSessionFilterOptions = {}) {
  const { currentSession, availableSessions, isReady, showAllSessions, setShowAllSessions } = useSession()
  const { includeAllSessions = false } = options

  const filter = useMemo(() => {
    if (includeAllSessions || showAllSessions) {
      return {} // No session filter
    }
    return currentSession ? { exam_session_id: currentSession.id } : {}
  }, [currentSession, includeAllSessions, showAllSessions])

  const appendToUrl = (baseUrl: string) => {
    if (includeAllSessions || showAllSessions || !currentSession) {
      return baseUrl
    }
    const separator = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${separator}exam_session_id=${currentSession.id}`
  }

  return {
    filter,
    currentSession,
    availableSessions,
    isReady,
    appendToUrl,
    showAllSessions,
    setShowAllSessions,
  }
}
```

---

## Usage Examples

### Standard Page (Filtered by Current Session)

```typescript
// app/(coe)/exam-management/exam-registrations/page.tsx

'use client'

import { useSessionFilter } from '@/hooks/use-session-filter'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'

export default function ExamRegistrationsPage() {
  const { isReady: instReady, appendToUrl: appendInstUrl } = useInstitutionFilter()
  const { isReady: sessReady, appendToUrl: appendSessUrl, currentSession } = useSessionFilter()

  useEffect(() => {
    if (instReady && sessReady) {
      // Both filters applied
      let url = '/api/exam-registrations'
      url = appendInstUrl(url)
      url = appendSessUrl(url)

      fetch(url).then(...)
    }
  }, [instReady, sessReady, currentSession])

  return (
    <div>
      <h1>Exam Registrations - {currentSession?.session_name}</h1>
      {/* ... */}
    </div>
  )
}
```

### Reports Page (Access All Sessions)

```typescript
// app/(coe)/reports/historical/page.tsx

'use client'

import { useSessionFilter } from '@/hooks/use-session-filter'

export default function HistoricalReportsPage() {
  const {
    availableSessions,
    showAllSessions,
    setShowAllSessions
  } = useSessionFilter({ includeAllSessions: true })

  const [selectedSessions, setSelectedSessions] = useState<string[]>([])

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <Switch
          checked={showAllSessions}
          onCheckedChange={setShowAllSessions}
        />
        <Label>Show all sessions (including archived)</Label>
      </div>

      {/* Multi-select for session filtering in reports */}
      <MultiSelect
        options={availableSessions.map(s => ({ value: s.id, label: s.session_name }))}
        selected={selectedSessions}
        onChange={setSelectedSessions}
      />
    </div>
  )
}
```

---

## API Routes Updates

### GET /api/exam-sessions

```typescript
// app/api/exam-sessions/route.ts

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const institutionsId = searchParams.get('institutions_id')
  const statusParam = searchParams.get('status') // comma-separated

  let query = supabase
    .from('exam_sessions')
    .select('*')
    .order('start_date', { ascending: false })

  if (institutionsId) {
    query = query.eq('institutions_id', institutionsId)
  }

  if (statusParam) {
    const statuses = statusParam.split(',')
    query = query.in('status', statuses)
  } else {
    // Default: only active and upcoming
    query = query.in('status', ['active', 'upcoming'])
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

---

## Session Lifecycle Management

### Admin UI for Session Status

```typescript
// Components needed:
// 1. SessionStatusBadge - Shows current status with color
// 2. SessionStatusTransition - Dropdown to change status
// 3. BulkSessionArchive - Archive multiple old sessions

// Status transition rules:
// upcoming -> active (when session starts)
// active -> completed (when session ends and results finalized)
// completed -> archived (after 2+ years, for cleanup)
// archived -> completed (restore if needed - super_admin only)
```

### Automatic Status Updates (Optional)

```sql
-- Postgres function to auto-update status based on dates
CREATE OR REPLACE FUNCTION update_exam_session_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.end_date < CURRENT_DATE AND NEW.status = 'active' THEN
    NEW.status := 'completed';
  ELSIF NEW.start_date <= CURRENT_DATE AND NEW.status = 'upcoming' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_session_status_trigger
BEFORE UPDATE ON exam_sessions
FOR EACH ROW
EXECUTE FUNCTION update_exam_session_status();
```

---

## Migration Plan

### Phase 1: Database Schema
1. Add `status` column to `exam_sessions`
2. Create `institution_session_settings` table
3. Migrate existing data (mark old sessions as completed)

### Phase 2: Backend
1. Update `/api/exam-sessions` to filter by status
2. Create `/api/institution-session-settings` endpoints
3. Update all existing APIs to accept `exam_session_id` filter

### Phase 3: Frontend
1. Create `SessionContext` and `SessionProvider`
2. Create `SessionSelector` component
3. Add to header/layout
4. Create `useSessionFilter` hook

### Phase 4: Page Updates
1. Update all exam-related pages to use `useSessionFilter`
2. Update reports pages with "show all sessions" toggle
3. Add session management UI for admins

---

## Questions to Resolve Before Implementation

1. **Session Scope**: Are sessions institution-specific or shared across institutions?
2. **Multiple Active Sessions**: Can an institution have 2 active sessions (overlap during transition)?
3. **Permission Model**: Who can change session status? (super_admin only? institution admin?)
4. **Default Behavior**: What happens if no active session exists for an institution?
5. **Header Placement**: Should session selector be in header (like institution) or per-page?

---

## Related Files

- `context/institution-context.tsx` - Reference for context pattern
- `hooks/use-institution-filter.ts` - Reference for filter hook pattern
- `components/header.tsx` - Where to add session selector
- `app/api/exam-sessions/route.ts` - API to update

---

## Status

**Status**: Planned (Not Started)

**Priority**: Medium

**Estimated Effort**: 3-5 days

**Dependencies**: None (can be implemented independently)
