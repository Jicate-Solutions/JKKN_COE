# PDF Institution Settings System

## Overview

The PDF Institution Settings System provides a centralized, institution-based header and footer management system for all PDF documents generated in the JKKN COE platform. This system allows non-developer admin users to configure PDF headers, footers, logos, watermarks, and styling without any code changes.

## Features

- **Institution-specific configuration**: Each institution can have its own PDF settings
- **Multiple template types**: Support for different templates (default, certificate, hall ticket, marksheet, report)
- **Live preview**: Preview PDF changes before saving
- **Rich customization**: Control logos, colors, fonts, margins, watermarks, page numbering, and signature sections
- **Automatic caching**: 5-minute server-side cache for optimal performance
- **Audit logging**: All changes are logged to transaction_logs table
- **RLS security**: Row-level security policies restrict access based on user roles

## Architecture

### Database Schema

```
pdf_institution_settings
├── id (UUID)
├── institution_id (FK to institutions)
├── institution_code
├── template_type (default, certificate, hallticket, marksheet, report)
├── Logo Settings
│   ├── logo_url, logo_width, logo_height, logo_position
│   └── secondary_logo_url, secondary_logo_width, secondary_logo_height
├── Header Settings
│   ├── header_html (HTML template with placeholders)
│   ├── header_height, header_background_color
├── Footer Settings
│   ├── footer_html (HTML template)
│   ├── footer_height, footer_background_color
├── Watermark Settings
│   ├── watermark_url, watermark_opacity, watermark_enabled
├── Paper/Layout
│   ├── paper_size (A4, Letter, Legal)
│   ├── orientation (portrait, landscape)
│   └── margins (top, bottom, left, right)
├── Typography
│   ├── font_family, font_size_body, font_size_heading, font_size_subheading
├── Colors
│   ├── primary_color, secondary_color, accent_color, border_color
├── Page Numbering
│   ├── page_numbering_enabled, page_numbering_format, page_numbering_position
├── Signature Section
│   ├── signature_section_enabled, signature_labels, signature_line_width
├── Status
│   ├── active (boolean)
└── Metadata
    ├── created_by, updated_by, created_at, updated_at
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pdf-settings` | List all settings (admin) |
| GET | `/api/pdf-settings?institution_code=XXX` | Get settings for institution |
| POST | `/api/pdf-settings` | Create new settings |
| PUT | `/api/pdf-settings` | Update settings |
| DELETE | `/api/pdf-settings?id=XXX` | Delete settings |
| GET | `/api/pdf-settings/[id]` | Get settings by ID |
| PUT | `/api/pdf-settings/[id]` | Update settings by ID |
| DELETE | `/api/pdf-settings/[id]` | Delete settings by ID |
| PATCH | `/api/pdf-settings/[id]` | Toggle active or duplicate |
| POST | `/api/pdf-settings/preview` | Generate preview PDF |

### File Structure

```
lib/
├── pdf/
│   ├── index.ts                 # Central exports
│   ├── settings-service.ts      # Server-side service
│   ├── use-pdf-settings.ts      # React hook
│   └── pdf-header-renderer.ts   # jsPDF integration
├── validations/
│   └── pdf-settings.ts          # Zod schemas

types/
└── pdf-settings.ts              # TypeScript types

app/
├── api/
│   └── pdf-settings/
│       ├── route.ts             # Main CRUD routes
│       ├── [id]/route.ts        # Individual record routes
│       └── preview/route.ts     # Preview generation
└── (coe)/
    └── admin/
        └── pdf-settings/
            └── page.tsx         # Admin UI

supabase/migrations/
└── 20251213_create_pdf_institution_settings.sql
```

## Usage

### Admin UI

Access the PDF Settings admin page at:
```
/admin/pdf-settings
```

Features:
- View all configured institutions
- Create new settings
- Edit existing settings with tabbed interface
- Preview changes before saving
- Duplicate settings for different template types
- Toggle active/inactive status

### Server-Side Integration

```typescript
import { getPdfGenerationConfig, createInstitutionPdf } from '@/lib/pdf'

// Method 1: Get configuration for manual PDF generation
const config = await getPdfGenerationConfig('JKKNCAS', 'hallticket', {
  exam_name: 'End Semester Exam - Dec 2025',
  student_name: 'John Doe'
})

// Use config values in your PDF generation
console.log(config.colors.primary)  // '#1a365d'
console.log(config.font_family)     // 'Times New Roman, serif'
console.log(config.margins.top)     // 20 (mm)

// Method 2: Create PDF with institution header pre-rendered
const { doc, config, contentStartY } = await createInstitutionPdf('JKKNCAS', 'certificate')

// Add your content starting at contentStartY
doc.text('Certificate Content', pageWidth / 2, contentStartY + 10)
```

### Client-Side Hook

```typescript
'use client'
import { usePdfSettings, usePdfSettingsForm } from '@/lib/pdf'

function MyComponent() {
  const {
    settings,
    loading,
    fetchSettings,
    updateSettings,
    generatePreview,
    previewUrl
  } = usePdfSettings({ institutionCode: 'JKKNCAS', autoFetch: true })

  const { formData, updateField, validate } = usePdfSettingsForm(settings)

  const handleSave = async () => {
    if (validate()) {
      await updateSettings(settings.id, formData)
    }
  }

  return (
    // Your form UI
  )
}
```

### Applying Headers/Footers to Existing PDFs

```typescript
import jsPDF from 'jspdf'
import { applyInstitutionHeaderFooter } from '@/lib/pdf'

// After generating your PDF content
const doc = new jsPDF()
// ... add content ...

// Apply institution header/footer to all pages
await applyInstitutionHeaderFooter(doc, 'JKKNCAS', 'marksheet', {
  exam_name: 'End Semester Examination',
  institution_name: 'JKKN College of Arts & Science'
})

doc.save('report.pdf')
```

## HTML Template Placeholders

Use these placeholders in header_html and footer_html:

| Placeholder | Description |
|-------------|-------------|
| `{{institution_name}}` | Institution full name |
| `{{institution_code}}` | Institution code |
| `{{exam_name}}` | Examination name |
| `{{date}}` | Current date |
| `{{page_number}}` | Current page number |
| `{{total_pages}}` | Total page count |
| `{{page_number_text}}` | Formatted page text |
| `{{generation_date}}` | PDF generation timestamp |
| `{{logo_url}}` | Primary logo URL |
| `{{secondary_logo_url}}` | Secondary logo URL |
| `{{primary_color}}` | Primary theme color |
| `{{secondary_color}}` | Secondary theme color |
| `{{accreditation_text}}` | Institution accreditation |
| `{{address}}` | Institution address |
| `{{font_family}}` | Configured font family |

## Security

### RLS Policies

1. **Admin Access**: Users with `admin`, `super_admin`, or `coe_admin` roles can perform all CRUD operations
2. **Read Access**: All authenticated users can read active settings (for PDF generation)

### HTML Sanitization

Header and footer HTML is sanitized to prevent XSS attacks:
- Script tags are removed
- Event handlers (onclick, onload, etc.) are removed
- JavaScript URLs are blocked
- Data URLs are blocked

## Database Migration

Run the migration to create the table:

```bash
# Using Supabase CLI
npx supabase db push

# Or run manually via SQL Editor
# Copy contents of: supabase/migrations/20251213_create_pdf_institution_settings.sql
```

## Cache Management

Settings are cached for 5 minutes on the server side. To invalidate cache:

```typescript
import { invalidatePdfSettingsCache } from '@/lib/pdf'

// Invalidate for specific institution
invalidatePdfSettingsCache('JKKNCAS')

// Invalidate all cache
invalidatePdfSettingsCache()
```

## Troubleshooting

### Settings Not Applying

1. Check if settings exist and are active:
```typescript
const settings = await getPdfSettings('JKKNCAS', 'default')
console.log(settings?.active) // Should be true
```

2. Clear cache if recently updated:
```typescript
invalidatePdfSettingsCache('JKKNCAS')
```

### Preview Not Working

1. Check browser console for errors
2. Verify jsPDF is properly installed: `npm install jspdf`
3. Check API endpoint logs in terminal

### Permission Denied

1. Verify user has appropriate role (admin/coe_admin)
2. Check RLS policies are correctly applied
3. Verify session is valid

## Performance Tips

1. **Use caching**: Settings are cached for 5 minutes by default
2. **Batch operations**: When generating multiple PDFs, fetch settings once
3. **Optimize images**: Keep logo files under 100KB
4. **Use appropriate paper size**: Match paper size to actual printing requirements

## Future Enhancements

- [ ] Image upload UI for logos and watermarks (Supabase Storage integration)
- [ ] Template versioning and rollback
- [ ] Bulk import/export of settings
- [ ] Additional template types (transcripts, fee receipts, etc.)
- [ ] WYSIWYG header/footer editor
