# SaaS UI Pattern Code Snippets

Complete code patterns extracted from `app/(coe)/grading/grades/page.tsx`.

## Table of Contents

1. [Scorecard Pattern](#1-scorecard-pattern)
2. [Toolbar Pattern](#2-toolbar-pattern)
3. [Table Header Pattern](#3-table-header-pattern)
4. [MoreHorizontal Action Column](#4-morehorizontal-action-column)
5. [Dynamic Pagination State](#5-dynamic-pagination-state)
6. [Pagination UI](#6-pagination-ui)
7. [Standalone Delete AlertDialog](#7-standalone-delete-alertdialog)
8. [Form Sheet Header](#8-form-sheet-header)
9. [Form Section Dividers](#9-form-section-dividers)
10. [Loading State](#10-loading-state)
11. [Empty State](#11-empty-state)
12. [TooltipProvider Wrapper](#12-tooltipprovider-wrapper)

---

## 1. Scorecard Pattern

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
  <Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold tracking-tight">{items.length}</p>
          <p className="text-xs font-medium text-muted-foreground mt-0.5">Total Items</p>
        </div>
        <Award className="h-5 w-5 text-emerald-500/40" />
      </div>
    </CardContent>
  </Card>
  <Card className="border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold tracking-tight text-green-600 dark:text-green-400">{activeCount}</p>
          <p className="text-xs font-medium text-muted-foreground mt-0.5">Active</p>
        </div>
        <CheckCircle2 className="h-5 w-5 text-green-500/40" />
      </div>
    </CardContent>
  </Card>
  <Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{inactiveCount}</p>
          <p className="text-xs font-medium text-muted-foreground mt-0.5">Inactive</p>
        </div>
        <XOctagon className="h-5 w-5 text-amber-500/40" />
      </div>
    </CardContent>
  </Card>
  <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">{thisMonthCount}</p>
          <p className="text-xs font-medium text-muted-foreground mt-0.5">Added This Month</p>
        </div>
        <CalendarPlus className="h-5 w-5 text-blue-500/40" />
      </div>
    </CardContent>
  </Card>
</div>
```

## 2. Toolbar Pattern

```tsx
<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
  <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
    <div className="flex items-center gap-3">
      <div>
        <h2 className="text-base font-semibold">Entity Name</h2>
        <p className="text-xs text-muted-foreground">Manage entity records</p>
      </div>
    </div>
    <div className="flex items-center gap-2 w-full lg:w-auto">
      {/* Search */}
      <div className="relative flex-1 lg:w-[260px]">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search..." className="pl-8 h-8 text-sm" />
      </div>
      {/* Refresh */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
            onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh data</TooltipContent>
      </Tooltip>
      {/* Export Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-sm px-3 shrink-0">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
            <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleTemplateExport}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Download Template
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Export to Excel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" /> Export to JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Import */}
      <Button variant="outline" size="sm" className="h-8 text-sm px-3 shrink-0" onClick={handleImport}>
        <Upload className="h-3.5 w-3.5 mr-1.5" /> Import
      </Button>
      {/* Add */}
      <Button size="sm" className="h-8 text-sm px-4 shrink-0" onClick={openAdd}>
        <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Add Entity
      </Button>
    </div>
  </div>
</CardHeader>
```

## 3. Table Header Pattern

```tsx
<TableHeader className="sticky top-0 z-10 bg-muted/50">
  <TableRow className="hover:bg-transparent">
    <TableHead className="w-[80px] text-xs font-semibold">
      <Button variant="ghost" size="sm" onClick={() => handleSort("field")}
        className="h-auto p-0 font-semibold hover:bg-transparent text-xs">
        Column <span className="ml-1">{getSortIcon("field")}</span>
      </Button>
    </TableHead>
    <TableHead className="text-xs font-semibold">Description</TableHead>
    <TableHead className="w-[90px] text-xs font-semibold text-center">Actions</TableHead>
  </TableRow>
</TableHeader>
```

## 4. MoreHorizontal Action Column

```tsx
<TableCell>
  <div className="flex items-center justify-center">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={() => openEdit(row)}>
          <Edit className="h-3.5 w-3.5 mr-2" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20"
          onClick={() => setDeleteTarget(row)}>
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</TableCell>
```

## 5. Dynamic Pagination State

```tsx
// State
const [itemsPerPage, setItemsPerPage] = useState(10)
const [deleteTarget, setDeleteTarget] = useState<EntityType | null>(null)

// After filtered useMemo
const pageSizeOptions = useMemo(() => {
  const allSizes = [10, 20, 50, 100, 250, 500, 1000]
  const total = filtered.length
  const options = allSizes.filter(s => s < total)
  if (!options.includes(10)) options.unshift(10)
  if (total > 10) options.push(total)
  return options
}, [filtered.length])

const isShowAll = itemsPerPage >= filtered.length
const effectivePerPage = isShowAll ? filtered.length || 1 : itemsPerPage
const totalPages = Math.ceil(filtered.length / effectivePerPage) || 1
const startIndex = (currentPage - 1) * effectivePerPage
const endIndex = startIndex + effectivePerPage
const pageItems = filtered.slice(startIndex, endIndex)
```

## 6. Pagination UI

```tsx
<div className="flex items-center justify-between pt-3 px-4 pb-3 border-t">
  <div className="flex items-center gap-3">
    <p className="text-sm text-muted-foreground tabular-nums">
      {filtered.length === 0 ? 'No results' :
        `${startIndex + 1}\u2013${Math.min(endIndex, filtered.length)} of ${filtered.length}`}
    </p>
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Rows</span>
      <Select value={String(itemsPerPage)}
        onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
        <SelectTrigger className="h-7 w-[70px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {pageSizeOptions.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size === filtered.length ? 'All' : size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </div>
  <div className="flex items-center gap-1">
    <Button variant="outline" size="sm"
      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
      disabled={currentPage === 1} className="h-7 w-7 p-0">
      <ChevronLeft className="h-3.5 w-3.5" />
    </Button>
    <span className="text-xs text-muted-foreground px-2 tabular-nums">
      {currentPage} / {totalPages}
    </span>
    <Button variant="outline" size="sm"
      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
      disabled={currentPage >= totalPages} className="h-7 w-7 p-0">
      <ChevronRight className="h-3.5 w-3.5" />
    </Button>
  </div>
</div>
```

## 7. Standalone Delete AlertDialog

```tsx
{/* Place OUTSIDE the table, after Card/TooltipProvider closes */}
<AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Entity</AlertDialogTitle>
      <AlertDialogDescription>
        Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
        This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => { if (deleteTarget) remove(deleteTarget.id); setDeleteTarget(null) }}
        className="bg-red-600 hover:bg-red-700">
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## 8. Form Sheet Header

```tsx
<SheetContent className="sm:max-w-[720px] overflow-y-auto">
  <SheetHeader className="pb-4 border-b">
    <SheetTitle className="text-lg font-semibold">
      {editing ? "Edit Entity" : "Add Entity"}
    </SheetTitle>
    <p className="text-sm text-muted-foreground">
      {editing ? "Update entity information" : "Add a new entity record"}
    </p>
  </SheetHeader>
  <div className="mt-6 space-y-8">
    {/* Form sections */}
  </div>
</SheetContent>
```

## 9. Form Section Dividers

```tsx
{/* First section */}
<div className="space-y-4">
  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
    Basic Information
  </h3>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* fields */}
  </div>
</div>

{/* Subsequent sections - add border-t */}
<div className="space-y-4">
  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2 border-t">
    Settings
  </h3>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* fields */}
  </div>
</div>

{/* Form actions */}
<div className="flex justify-end gap-3 pt-6 border-t">
  <Button variant="outline" size="sm" className="h-10 px-6"
    onClick={() => { setSheetOpen(false); resetForm() }} disabled={saving}>
    Cancel
  </Button>
  <Button size="sm" className="h-10 px-6" onClick={save} disabled={saving}>
    {saving ? (editing ? 'Updating...' : 'Creating...') : (editing ? 'Update' : 'Create')}
  </Button>
</div>
```

## 10. Loading State

```tsx
<TableRow>
  <TableCell colSpan={columnCount} className="h-32 text-center">
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <RefreshCw className="h-5 w-5 animate-spin" />
      <span className="text-sm">Loading entities...</span>
    </div>
  </TableCell>
</TableRow>
```

## 11. Empty State

```tsx
<TableRow>
  <TableCell colSpan={columnCount} className="h-32 text-center">
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <EntityIcon className="h-8 w-8 opacity-20" />
      <span className="text-sm">No entities found</span>
      <span className="text-xs">Add an entity to get started</span>
    </div>
  </TableCell>
</TableRow>
```

## 12. TooltipProvider Wrapper

```tsx
<TooltipProvider delayDuration={300}>
  <Card className="flex-1 flex flex-col min-h-0">
    {/* CardHeader with toolbar */}
    {/* CardContent with table + pagination */}
  </Card>
</TooltipProvider>
```
