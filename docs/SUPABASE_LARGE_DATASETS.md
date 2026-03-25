# Handling Large Datasets in Supabase (100k+ Rows)

## Problem

Supabase has a **default limit of 1,000 rows** per query. This limit cannot be increased beyond **10,000 rows** even with `.limit()`. For tables with 100,000+ rows, you need special handling.

## Solutions Overview

| Solution | Best For | Max Rows | Memory Usage | Complexity |
|----------|----------|----------|--------------|------------|
| **Pagination Loop** | Fetching all data | Unlimited | High | Low |
| **Streaming** | Processing batches | Unlimited | Low | Medium |
| **RPC Function** | Complex queries | Unlimited | High | High |
| **Incremental Load** | UI tables | Any | Low | Low |

---

## Solution 1: Pagination Loop ⭐ RECOMMENDED

**Best for:** Exporting data, analytics, reports, bulk operations

### Implementation

```typescript
import { fetchAllRows } from '@/lib/utils/supabase-fetch-all'

// Fetch all 100k+ students
const students = await fetchAllRows(supabase, 'students', {
  orderBy: 'stu_register_no',
  ascending: true,
  batchSize: 1000
})

console.log(`Fetched ${students.length} students`)
```

### With Filters

```typescript
// Fetch only active students
const activeStudents = await fetchAllRows(supabase, 'students', {
  orderBy: 'created_at',
  filters: {
    is_active: true,
    institution_id: 'abc-123'
  }
})
```

### With Progress Tracking

```typescript
import { fetchAllRowsWithProgress } from '@/lib/utils/supabase-fetch-all'

const students = await fetchAllRowsWithProgress(
  supabase,
  'students',
  (loaded, total) => {
    console.log(`Progress: ${loaded} / ${total || '?'}`)
    // Update UI progress bar
  },
  { batchSize: 1000 }
)
```

### Pros & Cons

✅ **Pros:**
- Simple to use
- Works with any table
- Can apply filters
- Supports joins

❌ **Cons:**
- Loads all data into memory
- Can be slow for 1M+ rows
- High memory usage

---

## Solution 2: Streaming ⭐ BEST FOR PROCESSING

**Best for:** Processing large datasets without loading all into memory

### Implementation

```typescript
import { streamRows } from '@/lib/utils/supabase-fetch-all'

let processedCount = 0

// Process students in batches of 1000
for await (const batch of streamRows(supabase, 'students', {
  orderBy: 'stu_register_no',
  batchSize: 1000
})) {
  // Process this batch
  await processStudentBatch(batch)
  processedCount += batch.length

  console.log(`Processed ${processedCount} students...`)
}
```

### Use Cases

```typescript
// Example 1: Send bulk emails
for await (const batch of streamRows(supabase, 'students')) {
  await sendBulkEmails(batch)
}

// Example 2: Generate certificates
for await (const batch of streamRows(supabase, 'students')) {
  await generateCertificates(batch)
}

// Example 3: Data transformation
for await (const batch of streamRows(supabase, 'exam_attendance')) {
  await transformAndSaveToWarehouse(batch)
}
```

### Pros & Cons

✅ **Pros:**
- Low memory usage
- Can process unlimited rows
- Great for ETL/data processing
- Doesn't block UI

❌ **Cons:**
- Can't access all data at once
- Requires async iteration
- More complex than simple fetch

---

## Solution 3: API Route with Streaming

**Best for:** Client-side fetching with progress updates

### Server-Side (API Route)

```typescript
// app/api/students/fetch-all-stream/route.ts
export async function GET() {
  const stream = new ReadableStream({
    async start(controller) {
      for await (const batch of streamRows(supabase, 'students')) {
        // Send progress update
        controller.enqueue(
          encoder.encode(JSON.stringify({
            type: 'batch',
            data: batch
          }) + '\n')
        )
      }
      controller.close()
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' }
  })
}
```

### Client-Side (React Component)

```typescript
const response = await fetch('/api/students/fetch-all-stream')
const reader = response.body?.getReader()
const decoder = new TextDecoder()

let buffer = ''
while (true) {
  const { done, value } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    const chunk = JSON.parse(line)
    if (chunk.type === 'batch') {
      // Update UI with new data
      setData(prev => [...prev, ...chunk.data])
    }
  }
}
```

---

## Solution 4: Database RPC Function

**Best for:** Complex queries, aggregations, custom logic

### Create PostgreSQL Function

```sql
-- supabase/migrations/xxx_fetch_all_students.sql

CREATE OR REPLACE FUNCTION fetch_all_active_students()
RETURNS TABLE (
  id UUID,
  stu_register_no VARCHAR,
  student_name VARCHAR,
  email VARCHAR,
  program_code VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.stu_register_no,
    s.student_name,
    s.email,
    s.program_code
  FROM students s
  WHERE s.is_active = TRUE
  ORDER BY s.stu_register_no ASC;
END;
$$ LANGUAGE plpgsql;
```

### Call from TypeScript

```typescript
const { data, error } = await supabase
  .rpc('fetch_all_active_students')

console.log(`Fetched ${data.length} students`)
```

### With Parameters

```sql
CREATE OR REPLACE FUNCTION fetch_students_by_institution(
  p_institution_id UUID
)
RETURNS TABLE (
  id UUID,
  stu_register_no VARCHAR,
  student_name VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.stu_register_no, s.student_name
  FROM students s
  WHERE s.institution_id = p_institution_id;
END;
$$ LANGUAGE plpgsql;
```

```typescript
const { data } = await supabase
  .rpc('fetch_students_by_institution', {
    p_institution_id: 'abc-123'
  })
```

---

## Solution 5: Incremental Loading (UI Tables)

**Best for:** DataTables, infinite scroll, load more button

### Implementation

```typescript
const [students, setStudents] = useState([])
const [page, setPage] = useState(0)
const [hasMore, setHasMore] = useState(true)
const PAGE_SIZE = 50

const loadMore = async () => {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data, count } = await supabase
    .from('students')
    .select('*', { count: 'exact' })
    .range(from, to)
    .order('stu_register_no')

  setStudents(prev => [...prev, ...data])
  setPage(page + 1)
  setHasMore(students.length + data.length < count)
}
```

---

## Performance Comparison

| Method | 10k rows | 100k rows | 1M rows | Memory |
|--------|----------|-----------|---------|--------|
| Pagination Loop | ~2s | ~20s | ~200s | High |
| Streaming | ~2s | ~20s | ~200s | Low |
| RPC Function | ~1s | ~10s | ~100s | Medium |
| Incremental | Instant | Instant | Instant | Low |

---

## Best Practices

### 1. Always Use Ordering

```typescript
// ✅ Good - Consistent pagination
await fetchAllRows(supabase, 'students', {
  orderBy: 'created_at', // or 'id'
  ascending: true
})

// ❌ Bad - Unpredictable results
await fetchAllRows(supabase, 'students')
```

### 2. Select Only Needed Columns

```typescript
// ✅ Good - Reduce data transfer
await fetchAllRows(supabase, 'students', {
  select: 'id, stu_register_no, student_name'
})

// ❌ Bad - Fetches all columns including large text/json
await fetchAllRows(supabase, 'students', {
  select: '*'
})
```

### 3. Use Filters When Possible

```typescript
// ✅ Good - Filter at database level
await fetchAllRows(supabase, 'students', {
  filters: { is_active: true }
})

// ❌ Bad - Fetch all, filter in JavaScript
const all = await fetchAllRows(supabase, 'students')
const active = all.filter(s => s.is_active)
```

### 4. Consider Batch Size

```typescript
// Fast network, powerful server
batchSize: 5000

// Slow network, limited memory
batchSize: 500

// Default (recommended)
batchSize: 1000
```

---

## Real-World Examples

### Export All Students to Excel

```typescript
import * as XLSX from 'xlsx'
import { fetchAllRows } from '@/lib/utils/supabase-fetch-all'

async function exportStudentsToExcel() {
  const students = await fetchAllRows(supabase, 'students', {
    select: 'stu_register_no, student_name, email, program_code',
    orderBy: 'stu_register_no'
  })

  const worksheet = XLSX.utils.json_to_sheet(students)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Students')
  XLSX.writeFile(workbook, 'students.xlsx')
}
```

### Generate Bulk Certificates

```typescript
import { streamRows } from '@/lib/utils/supabase-fetch-all'

async function generateAllCertificates() {
  for await (const batch of streamRows(supabase, 'students', {
    filters: { has_completed: true },
    batchSize: 100 // Process 100 at a time
  })) {
    await Promise.all(
      batch.map(student => generateCertificate(student))
    )
  }
}
```

### Sync to External System

```typescript
async function syncToExternalSystem() {
  for await (const batch of streamRows(supabase, 'students')) {
    await externalAPI.bulkUpdate(batch)
    await sleep(1000) // Rate limiting
  }
}
```

---

## When NOT to Fetch All Rows

❌ **Don't fetch all when:**
- Displaying in a UI table (use pagination instead)
- User only needs filtered subset (add filters to query)
- Data changes frequently (use real-time subscriptions)
- Processing can be done in database (use RPC functions)

✅ **Do fetch all when:**
- Exporting to file (CSV, Excel, PDF)
- Generating reports/analytics
- Data migration/ETL
- Bulk operations (email, certificates)
- Offline caching

---

## Files Created

1. `lib/utils/supabase-fetch-all.ts` - Core utility functions
2. `lib/utils/supabase-fetch-examples.ts` - Usage examples
3. `app/api/students/fetch-all/route.ts` - Simple API endpoint
4. `app/api/students/fetch-all-stream/route.ts` - Streaming API endpoint
5. `components/examples/fetch-large-dataset-example.tsx` - React component

---

## Quick Reference

```typescript
// Fetch all rows (simple)
const all = await fetchAllRows(supabase, 'table_name')

// Fetch with filters
const filtered = await fetchAllRows(supabase, 'table_name', {
  filters: { is_active: true }
})

// Fetch with progress
const data = await fetchAllRowsWithProgress(
  supabase,
  'table_name',
  (loaded, total) => console.log(`${loaded}/${total}`)
)

// Stream and process
for await (const batch of streamRows(supabase, 'table_name')) {
  await processBatch(batch)
}
```

---

## Support

For questions or issues, check:
- [Supabase Pagination Docs](https://supabase.com/docs/guides/api/pagination)
- [PostgREST Range Queries](https://postgrest.org/en/stable/api.html#limits-and-pagination)
