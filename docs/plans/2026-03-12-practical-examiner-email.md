# Practical Examiner Email System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Enable sending formal PDF appointment letters to practical exam examiners (internal, external, skilled) via email with batch tracking and status monitoring.

**Architecture:** Reads examiner assignments from `exam_timetable_examiners`, groups by examiner, generates PDF appointment letters using Puppeteer (HTML→PDF), sends via institution-specific SMTP (Gmail), tracks batch progress with polling UI.

**Tech Stack:** Next.js 15 API routes, Puppeteer PDF generation, Nodemailer SMTP, Supabase PostgreSQL, Shadcn UI + Tailwind CSS

---

## Files Created

### Database
- `supabase/migrations/20260312_practical_email_system.sql` — Adds skilled examiner support, `practical_email_batches` table, email log columns, email template seed, `active_pdf_settings` view

### Types
- `types/practical-email.ts` — `PracticalExaminerAssignment`, `PracticalEmailBatch`, `AppointmentLetterData`, API request/response types

### PDF Generation
- `lib/pdf/practical-appointment-letter.ts` — `buildAppointmentLetterHtml()` + `generateAppointmentPdf()` using Puppeteer

### API Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/pre-exam/practical-email/assignments` | GET | Fetch examiner assignments grouped by examiner |
| `/api/pre-exam/practical-email/send` | POST | Trigger batch email send (returns batch_id, processes in background) |
| `/api/pre-exam/practical-email/status` | GET | Poll batch status + per-examiner details |
| `/api/pre-exam/practical-email/resend` | POST | Resend failed emails |
| `/api/pre-exam/practical-email/pdf-preview` | GET | Preview/download appointment letter PDF |

### UI
- `app/(coe)/pre-exam/practical-email/page.tsx` — Full page with institution/session filters, two tabs (Assigned Examiners + Email Status), expandable rows, PDF preview/download, send progress dialog with polling

## Data Flow

```
Examiner Allotment Page (assigns examiners to batches)
        ↓ stores in exam_timetable_examiners
Practical Email Page (this module)
        ↓ reads assignments, groups by examiner
Admin selects examiners → clicks Send
        ↓ POST /send → creates batch, returns batch_id
Background: for each examiner:
        ↓ generate PDF (Puppeteer) → send email (SMTP) → log
Frontend polls GET /status?batch_id=... every 2s
        ↓ shows progress bar + per-examiner status
Done → refresh data
```

## Email Configuration

Uses existing `smtp_configuration` table with Gmail SMTP:
- Host: smtp.gmail.com, Port: 587
- Auth: institution email + app password
- Configurable per institution via `institution_code`

## Dependencies Added
- `puppeteer` — headless Chrome for PDF rendering
