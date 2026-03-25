# MyJKKN API Explorer Page Reference

Complete implementation of an API Explorer/Test page for MyJKKN integration.

## File Location

`app/(coe)/test-myjkkn-api/page.tsx`

## Core Features

1. **Endpoint Selection**: Visual card selector for all API endpoints
2. **Dynamic Filters**: Filters change based on selected endpoint
3. **Data Table**: Paginated table with custom column renderers
4. **Raw JSON Response**: Collapsible JSON viewer with copy functionality
5. **API Documentation**: Tabs for endpoints, authentication, response format
6. **Pagination Controls**: Top and bottom pagination with page navigation

## Type Definitions

```typescript
type EndpointType =
  | "institutions"
  | "departments"
  | "programs"
  | "degrees"
  | "courses"
  | "semesters"
  | "students"
  | "staff"

interface EndpointConfig {
  name: string
  description: string
  icon: React.ElementType
  endpoint: string
  color: string
  filters: FilterConfig[]
  columns: ColumnConfig[]
}

interface FilterConfig {
  key: string
  label: string
  type: "text" | "select" | "boolean"
  placeholder?: string
  options?: { value: string; label: string }[]
}

interface ColumnConfig {
  key: string
  label: string
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode
}

interface ApiMetadata {
  page: number
  totalPages: number
  total: number
  limit?: number
  returned?: number
}

interface ApiResponse {
  data: Record<string, unknown>[]
  metadata: ApiMetadata
  error?: string
}
```

## Endpoint Configurations

```typescript
const endpointConfigs: Record<EndpointType, EndpointConfig> = {
  institutions: {
    name: "Institutions",
    description: "Fetch organization/institution data",
    icon: School,
    endpoint: "/api/myjkkn/institutions",
    color: "bg-blue-500",
    filters: [
      { key: "search", label: "Search", type: "text", placeholder: "Search by name..." },
      { key: "is_active", label: "Active Only", type: "boolean" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "counselling_code", label: "Counselling Code" },
      { key: "category", label: "Category" },
      { key: "institution_type", label: "Type" },
      {
        key: "is_active",
        label: "Status",
        render: (value) => (
          <Badge className={value ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
            {value ? "Active" : "Inactive"}
          </Badge>
        )
      },
    ],
  },
  departments: {
    name: "Departments",
    description: "Fetch department data with institution/degree filters",
    icon: Building2,
    endpoint: "/api/myjkkn/departments",
    color: "bg-purple-500",
    filters: [
      { key: "search", label: "Search", type: "text", placeholder: "Search by name or code..." },
      { key: "institution_id", label: "Institution ID", type: "text", placeholder: "UUID..." },
      { key: "degree_id", label: "Degree ID", type: "text", placeholder: "UUID..." },
      { key: "is_active", label: "Active Only", type: "boolean" },
    ],
    columns: [
      { key: "department_name", label: "Name" },
      { key: "department_code", label: "Code" },
      {
        key: "institution",
        label: "Institution",
        render: (value) => (value as { name?: string })?.name || "-"
      },
      {
        key: "degree",
        label: "Degree",
        render: (value) => (value as { degree_name?: string })?.degree_name || "-"
      },
      {
        key: "is_active",
        label: "Status",
        render: (value) => (
          <Badge className={value ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
            {value ? "Active" : "Inactive"}
          </Badge>
        )
      },
    ],
  },
  students: {
    name: "Students",
    description: "Fetch student data with filters",
    icon: Users,
    endpoint: "/api/myjkkn/students",
    color: "bg-indigo-500",
    filters: [
      { key: "search", label: "Search", type: "text", placeholder: "Search by name, email, roll number..." },
      { key: "institution_id", label: "Institution ID", type: "text", placeholder: "UUID..." },
      { key: "department_id", label: "Department ID", type: "text", placeholder: "UUID..." },
      { key: "program_id", label: "Program ID", type: "text", placeholder: "UUID..." },
      { key: "is_profile_complete", label: "Profile Complete", type: "boolean" },
    ],
    columns: [
      {
        key: "name",
        label: "Name",
        render: (_, row) => `${row.first_name || ""} ${row.last_name || ""}`.trim() || "-"
      },
      { key: "roll_number", label: "Roll Number" },
      { key: "student_email", label: "Email" },
      { key: "student_mobile", label: "Mobile" },
      {
        key: "institution",
        label: "Institution",
        render: (value) => (value as { name?: string })?.name || "-"
      },
      {
        key: "program",
        label: "Program",
        render: (value) => (value as { program_name?: string })?.program_name || "-"
      },
    ],
  },
  // ... other endpoints follow similar pattern
}
```

## Component State Management

```typescript
export default function TestMyJKKNApiPage() {
  // Endpoint selection
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointType>("institutions")

  // Loading & error states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Response data
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [rawResponse, setRawResponse] = useState<string>("")

  // UI state
  const [copied, setCopied] = useState(false)
  const [rawResponseOpen, setRawResponseOpen] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  // Dynamic filters (key-value pairs)
  const [filters, setFilters] = useState<Record<string, string | boolean>>({})

  const config = endpointConfigs[selectedEndpoint]

  // ...
}
```

## Key Functions

### Reset on Endpoint Change

```typescript
const handleEndpointChange = (endpoint: EndpointType) => {
  setSelectedEndpoint(endpoint)
  setPage(1)
  setFilters({})
  setResponse(null)
  setRawResponse("")
  setError(null)
}
```

### Build Query Parameters

```typescript
const buildQueryParams = useCallback(() => {
  const params = new URLSearchParams()
  params.append("page", String(page))
  params.append("limit", String(limit))

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== "" && value !== undefined) {
      params.append(key, String(value))
    }
  })

  return params.toString()
}, [page, limit, filters])
```

### Fetch Data

```typescript
const fetchData = async () => {
  try {
    setLoading(true)
    setError(null)

    const queryString = buildQueryParams()
    const url = `${config.endpoint}?${queryString}`
    console.log("[Test Page] Fetching:", url)

    const res = await fetch(url)
    const data = await res.json()

    setRawResponse(JSON.stringify(data, null, 2))

    if (!res.ok) {
      setError(data.error || `HTTP ${res.status}: ${res.statusText}`)
      setResponse(null)
      return
    }

    setResponse(data)
  } catch (err) {
    console.error("[Test Page] Error:", err)
    setError(err instanceof Error ? err.message : "Unknown error")
    setResponse(null)
  } finally {
    setLoading(false)
  }
}
```

### Render Cell Value

```typescript
const renderCellValue = (column: ColumnConfig, row: Record<string, unknown>) => {
  const value = row[column.key]
  if (column.render) {
    return column.render(value, row)
  }
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">-</span>
  }
  if (typeof value === "object") {
    return <span className="text-muted-foreground">[Object]</span>
  }
  return String(value)
}
```

## Page Layout Structure

```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset className="flex flex-col min-h-screen">
    <AppHeader />
    <PageTransition>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
        {/* Breadcrumb */}
        {/* Page Header Card */}
        {/* Endpoint Selector Cards */}
        {/* Selected Endpoint Info */}
        {/* Filters & Controls */}
        {/* Error Display */}
        {/* Success Response */}
        {/* Data Table */}
        {/* Raw Response (Collapsible) */}
        {/* API Documentation Card */}
      </div>
    </PageTransition>
    <AppFooter />
  </SidebarInset>
</SidebarProvider>
```

## UI Components Used

```typescript
// Layout
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { PageTransition } from "@/components/common/page-transition"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

// Navigation
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

// Icons
import {
  Loader2, RefreshCw, Search, ChevronLeft, ChevronRight, CheckCircle2,
  XCircle, Info, Database, Users, GraduationCap, School, BookOpen,
  Calendar, Building2, Briefcase, Copy, Check, ChevronDown, ChevronUp,
  Code2, ExternalLink, Globe,
} from "lucide-react"
```

## Endpoint Selector Cards

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
  {(Object.keys(endpointConfigs) as EndpointType[]).map((endpoint) => {
    const cfg = endpointConfigs[endpoint]
    const Icon = cfg.icon
    const isSelected = selectedEndpoint === endpoint

    return (
      <button
        key={endpoint}
        onClick={() => handleEndpointChange(endpoint)}
        className={`
          relative p-4 rounded-xl border-2 transition-all duration-200 text-left
          hover:shadow-md hover:scale-[1.02]
          ${isSelected
            ? "border-emerald-500 bg-emerald-50 shadow-lg dark:bg-emerald-950/20"
            : "border-slate-200 bg-white hover:border-emerald-300 dark:bg-slate-900"
          }
        `}
      >
        <div className={`h-10 w-10 rounded-lg ${cfg.color} flex items-center justify-center mb-2`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="font-semibold text-sm">{cfg.name}</div>
        {isSelected && (
          <div className="absolute top-2 right-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
        )}
      </button>
    )
  })}
</div>
```

## Dynamic Filters Section

```tsx
<CardContent className="px-6 py-4">
  <div className="flex flex-wrap items-center gap-3">
    {/* Pagination Controls */}
    <div className="flex items-center gap-1.5">
      <Label className="text-xs font-medium text-slate-600">Page:</Label>
      <Input
        type="number"
        value={page}
        onChange={(e) => setPage(Number(e.target.value) || 1)}
        className="w-14 h-8 text-xs rounded-lg border-slate-300"
        min={1}
      />
    </div>
    <div className="flex items-center gap-1.5">
      <Label className="text-xs font-medium text-slate-600">Limit:</Label>
      <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
        <SelectTrigger className="w-16 h-8 text-xs rounded-lg border-slate-300">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[5, 10, 20, 50, 100].map((n) => (
            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <div className="w-px h-6 bg-slate-200" />

    {/* Dynamic Filters */}
    {config.filters.map((filter) => (
      <div key={filter.key} className="flex items-center gap-1.5">
        {filter.type === "boolean" ? (
          <>
            <Switch
              id={filter.key}
              checked={filters[filter.key] === true}
              onCheckedChange={(checked) => handleFilterChange(filter.key, checked)}
              className="scale-90"
            />
            <Label htmlFor={filter.key} className="text-xs text-slate-600">
              {filter.label}
            </Label>
          </>
        ) : (
          <>
            <Label className="text-xs font-medium text-slate-600 whitespace-nowrap">{filter.label}:</Label>
            <Input
              value={String(filters[filter.key] || "")}
              onChange={(e) => handleFilterChange(filter.key, e.target.value)}
              placeholder={filter.placeholder}
              className="w-32 h-8 text-xs rounded-lg border-slate-300"
              onKeyDown={(e) => e.key === "Enter" && fetchData()}
            />
          </>
        )}
      </div>
    ))}
  </div>
</CardContent>
```

## Data Table with Pagination

```tsx
<Card className="border-slate-200 shadow-sm rounded-2xl">
  <CardHeader className="flex flex-row items-center justify-between px-8 py-6 border-b border-slate-200">
    <CardTitle className="text-lg flex items-center gap-2">
      <config.icon className="h-5 w-5 text-emerald-600" />
      {config.name} ({response.data.length})
    </CardTitle>
    {/* Pagination Controls */}
    {response.metadata.totalPages > 1 && (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Page {response.metadata.page} of {response.metadata.totalPages}
        </span>
        <Button variant="outline" size="sm" onClick={() => handlePageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => handlePageChange(page + 1)} disabled={page >= response.metadata.totalPages}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={fetchData}>Go</Button>
      </div>
    )}
  </CardHeader>
  <CardContent className="px-8 py-6 bg-slate-50/50">
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <ScrollArea className="max-h-[500px]">
        <Table>
          <TableHeader className="bg-slate-50 border-b border-slate-200">
            <TableRow>
              <TableHead className="w-12 text-center font-bold text-slate-700">#</TableHead>
              {config.columns.map((col) => (
                <TableHead key={col.key} className="font-bold text-slate-700">
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {response.data.map((row, index) => (
              <TableRow key={row.id as string || index} className="hover:bg-slate-50 border-b">
                <TableCell className="text-center font-mono text-xs text-muted-foreground">
                  {(page - 1) * limit + index + 1}
                </TableCell>
                {config.columns.map((col) => (
                  <TableCell key={col.key} className="text-sm">
                    {renderCellValue(col, row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  </CardContent>
</Card>
```

## Raw JSON Response (Collapsible)

```tsx
<Collapsible open={rawResponseOpen} onOpenChange={setRawResponseOpen}>
  <Card className="border-slate-200 shadow-sm rounded-2xl">
    <CollapsibleTrigger asChild>
      <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors px-8 py-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Code2 className="h-5 w-5 text-emerald-600" />
            Raw API Response
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleCopyJson()
              }}
              className="gap-1 rounded-lg border-slate-300"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
            {rawResponseOpen ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <CardContent className="pt-0 px-8 pb-6">
        <ScrollArea className="max-h-[400px]">
          <pre className="bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto">
            {rawResponse}
          </pre>
        </ScrollArea>
      </CardContent>
    </CollapsibleContent>
  </Card>
</Collapsible>
```

## API Documentation Card

```tsx
<Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 rounded-2xl">
  <CardHeader className="px-8 py-6 border-b border-blue-200 dark:border-blue-900">
    <CardTitle className="text-lg flex items-center gap-2 text-blue-800 dark:text-blue-300">
      <Info className="h-5 w-5" />
      API Documentation
    </CardTitle>
  </CardHeader>
  <CardContent className="px-8 py-6">
    <Tabs defaultValue="endpoints" className="w-full">
      <TabsList className="grid w-full grid-cols-3 rounded-xl">
        <TabsTrigger value="endpoints" className="rounded-lg">Endpoints</TabsTrigger>
        <TabsTrigger value="auth" className="rounded-lg">Authentication</TabsTrigger>
        <TabsTrigger value="response" className="rounded-lg">Response Format</TabsTrigger>
      </TabsList>
      <TabsContent value="endpoints" className="space-y-3 mt-4">
        <div className="grid gap-2">
          {(Object.keys(endpointConfigs) as EndpointType[]).map((endpoint) => {
            const cfg = endpointConfigs[endpoint]
            return (
              <div key={endpoint} className="flex items-center gap-3 p-2 rounded-lg bg-white/50 dark:bg-white/5">
                <Badge className={`${cfg.color} text-white`}>{cfg.name}</Badge>
                <code className="text-xs font-mono flex-1">GET {cfg.endpoint}</code>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </div>
            )
          })}
        </div>
      </TabsContent>
      <TabsContent value="auth" className="mt-4">
        <div className="space-y-2 text-sm">
          <p><strong>Method:</strong> Bearer Token Authentication</p>
          <p><strong>Header:</strong> <code className="bg-white/50 px-1 rounded">Authorization: Bearer {"<api_key>"}</code></p>
          <p><strong>Key Format:</strong> <code className="bg-white/50 px-1 rounded">jk_xxxxx_xxxxx</code></p>
          <p><strong>Env Variable:</strong> <code className="bg-white/50 px-1 rounded">MYJKKN_API_KEY</code></p>
        </div>
      </TabsContent>
      <TabsContent value="response" className="mt-4">
        <pre className="bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono">
{`{
  "data": [...],
  "metadata": {
    "page": 1,
    "totalPages": 10,
    "total": 100,
    "limit": 10,
    "returned": 10
  }
}`}
        </pre>
      </TabsContent>
    </Tabs>
  </CardContent>
</Card>
```

## Adding to Sidebar Navigation

In `components/layout/app-sidebar.tsx`, add the explorer link under the Master menu:

```typescript
{
  title: "MyJKKN API Explorer",
  url: "/test-myjkkn-api",
  icon: Globe,
}
```

## Styling Guidelines

### Card Styling
- Border radius: `rounded-2xl`
- Border color: `border-slate-200`
- Shadow: `shadow-sm`
- Padding: `px-8 py-6`

### Button Styling
- Size: `h-8` (small)
- Border radius: `rounded-lg`
- Primary: `bg-emerald-600 hover:bg-emerald-700`

### Input Styling
- Size: `h-8`
- Width: `w-32` for filters, `w-14` for page number
- Border radius: `rounded-lg`
- Border color: `border-slate-300`

### Color Scheme
- Primary: Emerald (`emerald-500/600/700`)
- Success: Green (`green-100/700`)
- Error: Red (`red-100/700`)
- Info: Blue (`blue-50/200/800`)
