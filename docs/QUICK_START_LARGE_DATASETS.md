# Quick Start: Fetch 100k+ Rows from Supabase

## 🚀 1-Minute Setup

### Step 1: Import the utility

```typescript
import { fetchAllRows } from '@/lib/utils/supabase-fetch-all'
import { getSupabaseServer } from '@/lib/supabase-server'
```

### Step 2: Fetch all rows

```typescript
const supabase = getSupabaseServer()

const students = await fetchAllRows(supabase, 'students', {
  orderBy: 'created_at',
  ascending: true
})

console.log(`Fetched ${students.length} students`)
```

**That's it!** ✅

---

## Common Use Cases

### 1. Export to Excel/CSV

```typescript
// Fetch all data
const students = await fetchAllRows(supabase, 'students', {
  select: 'stu_register_no, student_name, email',
  orderBy: 'stu_register_no'
})

// Convert to CSV
const csv = [
  'Register Number,Name,Email',
  ...students.map(s => `${s.stu_register_no},${s.student_name},${s.email}`)
].join('\n')

// Download
const blob = new Blob([csv], { type: 'text/csv' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'students.csv'
a.click()
```

### 2. API Endpoint

```typescript
// app/api/students/export/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/utils/supabase-fetch-all'

export async function GET() {
  const supabase = getSupabaseServer()

  const students = await fetchAllRows(supabase, 'students', {
    orderBy: 'stu_register_no'
  })

  return NextResponse.json({
    count: students.length,
    data: students
  })
}
```

### 3. Process in Batches (Low Memory)

```typescript
import { streamRows } from '@/lib/utils/supabase-fetch-all'

// Process 100k students without loading all into memory
for await (const batch of streamRows(supabase, 'students', { batchSize: 1000 })) {
  // Process 1000 students at a time
  await sendEmailsToBatch(batch)
}
```

### 4. With Filters

```typescript
// Only fetch active students
const activeStudents = await fetchAllRows(supabase, 'students', {
  filters: {
    is_active: true,
    institution_id: 'abc-123'
  }
})
```

### 5. With Progress Bar

```typescript
import { fetchAllRowsWithProgress } from '@/lib/utils/supabase-fetch-all'

const [progress, setProgress] = useState(0)

const students = await fetchAllRowsWithProgress(
  supabase,
  'students',
  (loaded, total) => {
    const percentage = total ? (loaded / total) * 100 : 0
    setProgress(percentage)
  }
)
```

---

## API Reference

### `fetchAllRows()`

Fetch all rows from a table.

```typescript
fetchAllRows<T>(
  supabase: SupabaseClient,
  tableName: string,
  options?: {
    batchSize?: number      // Default: 1000
    orderBy?: string        // Default: 'created_at'
    ascending?: boolean     // Default: true
    filters?: Record<string, any>
    select?: string         // Default: '*'
  }
): Promise<T[]>
```

### `streamRows()`

Stream rows in batches (low memory).

```typescript
streamRows<T>(
  supabase: SupabaseClient,
  tableName: string,
  options?: { ... }
): AsyncGenerator<T[], void, unknown>
```

### `fetchAllRowsWithProgress()`

Fetch with progress callback.

```typescript
fetchAllRowsWithProgress<T>(
  supabase: SupabaseClient,
  tableName: string,
  onProgress: (loaded: number, total?: number) => void,
  options?: { ... }
): Promise<T[]>
```

---

## Performance Tips

### ✅ DO

```typescript
// Use filters to reduce data
fetchAllRows(supabase, 'students', {
  filters: { is_active: true }
})

// Select only needed columns
fetchAllRows(supabase, 'students', {
  select: 'id, name, email'
})

// Use streaming for processing
for await (const batch of streamRows(...)) {
  process(batch)
}
```

### ❌ DON'T

```typescript
// Don't fetch all columns if not needed
fetchAllRows(supabase, 'students', { select: '*' })

// Don't load 1M rows without streaming
const all = await fetchAllRows(supabase, 'huge_table')

// Don't filter in JavaScript
const all = await fetchAllRows(...)
const filtered = all.filter(...)  // Use filters option instead!
```

---

## Troubleshooting

### "Out of memory" error

**Solution:** Use `streamRows()` instead:

```typescript
// ❌ Loads all into memory
const all = await fetchAllRows(supabase, 'huge_table')

// ✅ Streams in batches
for await (const batch of streamRows(supabase, 'huge_table')) {
  process(batch)
}
```

### Slow performance

**Solution:** Reduce batch size or add filters:

```typescript
fetchAllRows(supabase, 'table', {
  batchSize: 500,  // Smaller batches
  filters: { ... }  // Filter at database level
})
```

### Inconsistent results

**Solution:** Always use `orderBy`:

```typescript
fetchAllRows(supabase, 'table', {
  orderBy: 'id',  // or 'created_at'
  ascending: true
})
```

---

## Need Help?

Check the full documentation: [SUPABASE_LARGE_DATASETS.md](./SUPABASE_LARGE_DATASETS.md)
