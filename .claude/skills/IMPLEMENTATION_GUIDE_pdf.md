# 🚀 Implementation Guide - Institution-Aware PDF System

## 📦 What You've Received

A complete, production-ready PDF generation system with:

✅ **Database Schema** - PostgreSQL table with RLS, triggers, and seed data
✅ **TypeScript Types** - Full type safety for all components
✅ **API Routes** - Settings management and PDF generation endpoints
✅ **React Hooks** - Easy-to-use hooks for PDF generation
✅ **Example Components** - Certificate and hall ticket generators
✅ **Configuration Utils** - Helper functions for PDF customization
✅ **Documentation** - Comprehensive guides and API reference

## 🎯 What This System Does

### The Problem It Solves

Traditional PDF systems require changing code in multiple places to update:
- Paper sizes (A4, Letter, Legal)
- Margins and spacing
- Colors and branding
- Headers and footers
- Institution logos

### The Solution

**Single source of truth** in the database. Change settings once, and all generated PDFs automatically reflect the new configuration.

```sql
-- Change paper size for ALL future certificates
UPDATE pdf_institution_settings 
SET paper_size = 'Letter' 
WHERE institution_code = 'JKKNCOE';
```

## 📂 File Structure

```
Your Next.js Project/
│
├── 001_pdf_institution_settings.sql  ← Run this first
├── package.json                      ← Add these dependencies
├── .env.example                      ← Copy to .env.local
│
├── lib/
│   └── pdf/
│       ├── types.ts                  ← Type definitions
│       ├── config.ts                 ← Configuration utilities
│       └── hooks.ts                  ← React hooks
│
├── app/
│   ├── api/
│   │   └── pdf/
│   │       ├── settings/
│   │       │   └── route.ts         ← Settings API
│   │       └── generate/
│   │           └── route.ts         ← PDF generation API
│   │
│   ├── certificates/
│   │   └── page.tsx                 ← Example: Certificates
│   │
│   └── halltickets/
│       └── page.tsx                 ← Example: Hall tickets
│
└── Documentation/
    ├── README.md                    ← Full documentation
    ├── QUICKSTART.md               ← 5-minute setup
    ├── CHANGELOG.md                ← Version history
    └── PROJECT_SUMMARY.md          ← Architecture overview
```

## 🛠️ Installation Steps

### Step 1: Database Setup (5 minutes)

#### Option A: Supabase Dashboard
```bash
1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to SQL Editor
4. Open: 001_pdf_institution_settings.sql
5. Copy entire contents
6. Paste and click "Run"
7. Verify: SELECT * FROM pdf_institution_settings;
```

#### Option B: Command Line
```bash
# Set your database connection
export DATABASE_URL="postgresql://user:pass@host:5432/db"

# Run migration
psql $DATABASE_URL -f 001_pdf_institution_settings.sql

# Verify
psql $DATABASE_URL -c "SELECT institution_code, institution_name FROM pdf_institution_settings;"
```

**Expected Result:** 3 institutions (JKKNCOE, JKKNCAS, EASC)

### Step 2: Install Dependencies (2 minutes)

```bash
# Install required packages
npm install @supabase/supabase-js puppeteer

# Optional: For serverless deployments
npm install chrome-aws-lambda puppeteer-core
```

### Step 3: Environment Variables (2 minutes)

```bash
# Copy template
cp .env.example .env.local

# Edit .env.local with your values:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY  
# - SUPABASE_SERVICE_ROLE_KEY
# - NEXT_PUBLIC_APP_URL
```

### Step 4: Copy Project Files (1 minute)

Copy all files from the outputs directory to your Next.js project:

```bash
# From outputs directory
cp -r lib/ /path/to/your/nextjs/project/
cp -r app/ /path/to/your/nextjs/project/
```

### Step 5: Add Logos (2 minutes)

Place institution logos in `/public/logos/`:

```bash
public/
└── logos/
    ├── jkkncoe.png  (recommended: 200x200px)
    ├── jkkncas.png
    └── easc.png
```

### Step 6: Test (1 minute)

```bash
# Start development server
npm run dev

# Visit test page
http://localhost:3000/certificates
```

## 🎯 Usage Examples

### Example 1: Simple Certificate

```typescript
'use client';

import { usePDFGenerator } from '@/lib/pdf/hooks';

export default function CertificatePage() {
  const { downloadPDF, loading } = usePDFGenerator('JKKNCOE');
  
  return (
    <button 
      onClick={() => downloadPDF('certificate', {
        studentName: 'JOHN DOE',
        registerNumber: '12345678',
        courseName: 'B.E Computer Science',
        certificateNumber: 'CERT-001',
        dateOfIssue: '28 Oct 2025'
      })}
      disabled={loading}
    >
      {loading ? 'Generating...' : 'Download Certificate'}
    </button>
  );
}
```

### Example 2: Hall Ticket

```typescript
const { downloadPDF } = usePDFGenerator('JKKNCOE');

const hallTicketData = {
  studentName: 'JANE SMITH',
  registerNumber: '87654321',
  examName: 'End Semester - Dec 2025',
  examDate: '15 Dec 2025',
  examTime: '9:30 AM - 12:30 PM',
  venue: 'Main Hall',
  subjects: [
    { code: 'CS301', name: 'Data Structures', date: '15-Dec', session: 'FN' },
    { code: 'CS302', name: 'DBMS', date: '18-Dec', session: 'FN' }
  ]
};

await downloadPDF('hallticket', hallTicketData);
```

### Example 3: Custom Template

```typescript
const customHTML = `
  <div style="padding: 40px;">
    <h1 style="color: {primary_color};">{institution_name}</h1>
    <h2>Bonafide Certificate</h2>
    <p>This is to certify that {studentName} is a bonafide student.</p>
  </div>
`;

await downloadPDF('custom', { studentName: 'John' }, customHTML);
```

## 🎨 Customization Guide

### Change Paper Size Globally

```sql
-- Switch all PDFs to Letter size
UPDATE pdf_institution_settings 
SET paper_size = 'Letter' 
WHERE institution_code = 'JKKNCOE';

-- Or Legal size
UPDATE pdf_institution_settings 
SET paper_size = 'Legal' 
WHERE institution_code = 'JKKNCOE';
```

### Change to Landscape

```sql
UPDATE pdf_institution_settings 
SET orientation = 'landscape' 
WHERE institution_code = 'JKKNCOE';
```

### Update Colors

```sql
UPDATE pdf_institution_settings 
SET 
  primary_color = '#0000FF',    -- Blue
  secondary_color = '#666666',  -- Gray
  accent_color = '#FF6600'      -- Orange
WHERE institution_code = 'JKKNCOE';
```

### Adjust Margins

```sql
UPDATE pdf_institution_settings 
SET 
  margin_top = '30mm',
  margin_bottom = '30mm',
  margin_left = '25mm',
  margin_right = '25mm'
WHERE institution_code = 'JKKNCOE';
```

### Custom Header

```sql
UPDATE pdf_institution_settings 
SET header_html = '
<div style="text-align: center; border-bottom: 3px solid {primary_color}; padding: 20px;">
  <img src="{logo_url}" style="width: {logo_width}; height: {logo_height};" />
  <h1 style="color: {primary_color}; margin: 10px 0;">{institution_name}</h1>
  <p style="color: {secondary_color};">Accredited by NAAC | Affiliated to University</p>
</div>
'
WHERE institution_code = 'JKKNCOE';
```

## 🔥 Common Use Cases

### 1. Batch Certificate Generation

```typescript
const students = await fetchStudentsFromDatabase();

for (const student of students) {
  await generatePDF('certificate', {
    studentName: student.name,
    registerNumber: student.regNo,
    courseName: student.course,
    certificateNumber: `CERT-${student.regNo}`,
    dateOfIssue: new Date().toLocaleDateString()
  });
  
  // Rate limiting
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

### 2. Preview Before Download

```typescript
const { previewPDF } = usePDFGenerator('JKKNCOE');

// Opens in new tab
await previewPDF('certificate', certificateData);
```

### 3. Save to Database

```typescript
const { generatePDF } = usePDFGenerator('JKKNCOE');

const result = await generatePDF('certificate', data);

if (result.success) {
  // Save to database
  await saveToDatabase({
    studentId: student.id,
    pdfUrl: result.pdfUrl,
    filename: result.filename,
    generatedAt: new Date()
  });
}
```

### 4. Multi-Institution Support

```typescript
const institutions = ['JKKNCOE', 'JKKNCAS', 'EASC'];

for (const code of institutions) {
  const { downloadPDF } = usePDFGenerator(code);
  await downloadPDF('certificate', studentData);
}
```

## 🐛 Troubleshooting

### Issue: "Institution not found"

**Fix:**
```sql
-- Check if institution exists
SELECT * FROM pdf_institution_settings 
WHERE institution_code = 'JKKNCOE';

-- Rerun migration if empty
\i 001_pdf_institution_settings.sql
```

### Issue: PDF generation fails

**Fix:**
```bash
# Check Puppeteer installation
npm list puppeteer

# Reinstall if needed
npm install puppeteer --force

# On Ubuntu/Debian, install Chrome dependencies
sudo apt-get install -y chromium-browser
```

### Issue: Logo not showing

**Fix:**
1. Verify file exists: `/public/logos/jkkncoe.png`
2. Check permissions: `chmod 644 public/logos/*.png`
3. Verify URL in database:
```sql
SELECT logo_url FROM pdf_institution_settings;
```

## 📊 Performance Tips

1. **Cache Settings**: Settings auto-cache for 5 minutes
2. **Optimize Images**: Keep logos under 100KB
3. **Batch Processing**: Add 1-second delay between generations
4. **Use CDN**: Host logos on CDN for faster loading
5. **Monitor Memory**: Puppeteer can use 100-200MB per instance

## 🔒 Security Checklist

- ✅ Environment variables are in `.env.local` (not `.env`)
- ✅ `.env.local` is in `.gitignore`
- ✅ Service role key is never exposed to client
- ✅ RLS policies are enabled on settings table
- ✅ HTML sanitization is enabled for custom templates

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Add environment variables in Vercel dashboard
```

### Docker

```dockerfile
FROM node:18-alpine

# Install Chromium
RUN apk add --no-cache chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

EXPOSE 3000
CMD ["npm", "start"]
```

## 📚 Next Steps

1. ✅ **Test the System**: Generate test certificates and hall tickets
2. 📝 **Customize Settings**: Update colors, margins, and branding
3. 🎨 **Add Your Logo**: Replace placeholder logos
4. 🔧 **Create Templates**: Build custom PDF templates
5. 🚀 **Deploy**: Push to production

## 📞 Support

- **Documentation**: See README.md for full docs
- **Quick Start**: See QUICKSTART.md for 5-minute setup
- **Issues**: Check CHANGELOG.md for known issues
- **Architecture**: See PROJECT_SUMMARY.md for details

## 💡 Pro Tips

1. **Settings Reload**: Changes take effect immediately (5-min cache)
2. **Filename Format**: Use descriptive names with timestamps
3. **Error Handling**: Always wrap PDF generation in try-catch
4. **Loading States**: Show progress indicators during generation
5. **Rate Limiting**: Add delays for batch operations

---

## ✅ Verification Checklist

Before going to production:

- [ ] Database migration completed successfully
- [ ] All 3 institutions present in database
- [ ] Environment variables configured
- [ ] Logos uploaded and accessible
- [ ] Test certificate generates successfully
- [ ] Test hall ticket generates successfully
- [ ] Colors and branding look correct
- [ ] Page numbers display properly
- [ ] Headers and footers render correctly
- [ ] Paper size is correct (A4/Letter/Legal)
- [ ] Orientation works (portrait/landscape)
- [ ] Error handling works properly

---

**🎉 Congratulations! Your institution-aware PDF system is ready!**

**Questions?** Refer to README.md for comprehensive documentation.

**Built with ❤️ for JKKN Institutions**
