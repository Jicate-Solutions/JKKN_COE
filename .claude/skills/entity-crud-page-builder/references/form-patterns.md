# Form Design Patterns

Complete form design and layout patterns for JKKN COE entity CRUD pages.

## Form Container Pattern

```typescript
<Sheet open={sheetOpen} onOpenChange={(o) => {
  if (!o) resetForm()
  setSheetOpen(o)
}}>
  <SheetContent className="sm:max-w-[800px] overflow-y-auto">
    {/* Form content */}
  </SheetContent>
</Sheet>
```

### Form Widths
- **Default**: `sm:max-w-[800px]` (standard forms)
- **Narrow**: `sm:max-w-[600px]` (simple forms with few fields)
- **Wide**: `sm:max-w-[1000px]` (complex forms with many fields)

## Header Structure

```typescript
<SheetHeader className="pb-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
        <GraduationCap className="h-5 w-5 text-white" />
      </div>
      <div>
        <SheetTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          {editing ? "Edit Degree" : "Add Degree"}
        </SheetTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {editing ? "Update degree information" : "Create a new degree record"}
        </p>
      </div>
    </div>
  </div>
</SheetHeader>
```

### Header Gradient Variations
- **Blue/Indigo**: Primary entities (degrees, courses)
- **Green/Emerald**: Academic entities (programs, students)
- **Purple/Violet**: Administrative entities (sections, semesters)
- **Orange/Amber**: Configuration entities (regulations, institutions)

## Form Section Structure

```typescript
<div className="mt-6 space-y-6">
  {/* Basic Information Section */}
  <div className="space-y-4">
    <div className="flex items-center gap-3 pb-3 border-b border-blue-200 dark:border-blue-800">
      <div className="h-8 w-8 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
        <GraduationCap className="h-4 w-4 text-white" />
      </div>
      <h3 className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
        Basic Information
      </h3>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Fields */}
    </div>
  </div>

  {/* Additional Details Section */}
  <div className="space-y-4">
    <div className="flex items-center gap-3 pb-3 border-b border-purple-200 dark:border-purple-800">
      <div className="h-8 w-8 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center">
        <FileText className="h-4 w-4 text-white" />
      </div>
      <h3 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
        Additional Details
      </h3>
    </div>
    <div className="grid grid-cols-1 gap-4">
      {/* Fields */}
    </div>
  </div>

  {/* Status Section */}
  <div className="space-y-4">
    <div className="flex items-center gap-3 pb-3 border-b border-teal-200 dark:border-teal-800">
      <div className="h-8 w-8 rounded-lg bg-gradient-to-r from-teal-500 to-green-600 flex items-center justify-center">
        <CheckCircle className="h-4 w-4 text-white" />
      </div>
      <h3 className="text-lg font-bold bg-gradient-to-r from-teal-600 to-green-600 bg-clip-text text-transparent">
        Status
      </h3>
    </div>
    <div className="flex items-center gap-4">
      {/* Status toggle */}
    </div>
  </div>
</div>
```

## Field Patterns

### Required Text Input

```typescript
<div className="space-y-2">
  <Label htmlFor="degree_code" className="text-sm font-semibold">
    Degree Code <span className="text-red-500">*</span>
  </Label>
  <Input
    id="degree_code"
    value={formData.degree_code}
    onChange={(e) => setFormData({ ...formData, degree_code: e.target.value })}
    className={`h-10 ${errors.degree_code ? 'border-destructive' : ''}`}
    placeholder="e.g., BSC"
  />
  {errors.degree_code && (
    <p className="text-xs text-destructive">{errors.degree_code}</p>
  )}
</div>
```

### Optional Text Input

```typescript
<div className="space-y-2">
  <Label htmlFor="display_name" className="text-sm font-medium">
    Display Name
  </Label>
  <Input
    id="display_name"
    value={formData.display_name}
    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
    className="h-10"
    placeholder="e.g., B.Sc"
  />
</div>
```

### Dropdown/Select (Foreign Key)

```typescript
<div className="space-y-2">
  <Label htmlFor="institution_code" className="text-sm font-semibold">
    Institution Code <span className="text-red-500">*</span>
  </Label>
  <Select
    value={formData.institution_code}
    onValueChange={(code) => {
      setFormData(prev => ({ ...prev, institution_code: code }))
    }}
  >
    <SelectTrigger className={`h-10 ${errors.institution_code ? 'border-destructive' : ''}`}>
      <SelectValue placeholder="Select Institution Code" />
    </SelectTrigger>
    <SelectContent>
      {institutions.map(inst => (
        <SelectItem key={inst.id} value={inst.institution_code}>
          {inst.institution_code}{inst.name ? ` - ${inst.name}` : ''}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  {errors.institution_code && (
    <p className="text-xs text-destructive">{errors.institution_code}</p>
  )}
</div>
```

### Number Input

```typescript
<div className="space-y-2">
  <Label htmlFor="credits" className="text-sm font-semibold">
    Credits <span className="text-red-500">*</span>
  </Label>
  <Input
    id="credits"
    type="number"
    min="0"
    max="10"
    step="0.5"
    value={formData.credits}
    onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
    className={`h-10 ${errors.credits ? 'border-destructive' : ''}`}
    placeholder="e.g., 4"
  />
  {errors.credits && (
    <p className="text-xs text-destructive">{errors.credits}</p>
  )}
</div>
```

### Textarea

```typescript
<div className="space-y-2">
  <Label htmlFor="description" className="text-sm font-medium">
    Description
  </Label>
  <Textarea
    id="description"
    value={formData.description}
    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
    className="min-h-[100px]"
    placeholder="Enter detailed description..."
  />
</div>
```

### Toggle Switch (Status)

```typescript
<div className="flex items-center gap-4">
  <Label className="text-sm font-semibold">Status</Label>
  <button
    type="button"
    onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
      formData.is_active ? 'bg-green-500' : 'bg-gray-300'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        formData.is_active ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
  <span className={`text-sm font-medium ${formData.is_active ? 'text-green-600' : 'text-red-500'}`}>
    {formData.is_active ? 'Active' : 'Inactive'}
  </span>
</div>
```

### Conditional Fields (Enabled/Disabled)

```typescript
<div className="space-y-2">
  <Label htmlFor="theory_credit" className="text-sm font-semibold">
    Theory Credit {formData.split_credit && <span className="text-red-500">*</span>}
  </Label>
  <Input
    id="theory_credit"
    type="number"
    value={formData.theory_credit}
    onChange={(e) => setFormData({ ...formData, theory_credit: e.target.value })}
    disabled={!formData.split_credit}
    className={`h-10 ${!formData.split_credit ? 'bg-muted cursor-not-allowed' : ''} ${errors.theory_credit ? 'border-destructive' : ''}`}
    placeholder="e.g., 3"
  />
  {errors.theory_credit && (
    <p className="text-xs text-destructive">{errors.theory_credit}</p>
  )}
</div>
```

### Date Input

```typescript
<div className="space-y-2">
  <Label htmlFor="start_date" className="text-sm font-semibold">
    Start Date <span className="text-red-500">*</span>
  </Label>
  <Input
    id="start_date"
    type="date"
    value={formData.start_date}
    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
    className={`h-10 ${errors.start_date ? 'border-destructive' : ''}`}
  />
  {errors.start_date && (
    <p className="text-xs text-destructive">{errors.start_date}</p>
  )}
</div>
```

## Action Buttons

```typescript
<div className="flex justify-end gap-3 pt-6 border-t">
  <Button
    variant="outline"
    size="sm"
    className="h-10 px-6"
    onClick={() => {
      setSheetOpen(false)
      resetForm()
    }}
  >
    Cancel
  </Button>
  <Button
    size="sm"
    className="h-10 px-6"
    onClick={save}
    disabled={loading}
  >
    {editing ? "Update Degree" : "Create Degree"}
  </Button>
</div>
```

## Form Reset Handler

```typescript
const resetForm = () => {
  setFormData({
    institution_code: "",
    degree_code: "",
    degree_name: "",
    display_name: "",
    description: "",
    is_active: true,
  })
  setErrors({})
  setEditing(null)
}
```

## Form Open Handlers

```typescript
const openAdd = () => {
  resetForm()
  setSheetOpen(true)
}

const openEdit = (row: Degree) => {
  setEditing(row)
  setFormData({
    institution_code: row.institution_code,
    degree_code: row.degree_code,
    degree_name: row.degree_name,
    display_name: row.display_name || "",
    description: row.description || "",
    is_active: row.is_active,
  })
  setSheetOpen(true)
}
```

## Form Save Handler

```typescript
const save = async () => {
  if (!validate()) {
    toast({
      title: "⚠️ Validation Error",
      description: "Please fix all validation errors before submitting.",
      variant: "destructive",
      className: "bg-red-50 border-red-200 text-red-800"
    })
    return
  }

  try {
    setLoading(true)

    // Foreign key validation and auto-mapping
    const selectedInstitution = institutions.find(
      inst => inst.institution_code === formData.institution_code
    )

    if (!selectedInstitution) {
      toast({
        title: "❌ Error",
        description: "Selected institution not found. Please refresh and try again.",
        variant: "destructive",
      })
      setLoading(false)
      return
    }

    const payload = {
      ...formData,
      institutions_id: selectedInstitution.id
    }

    if (editing) {
      // Update existing record
      const response = await fetch('/api/degrees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, ...payload }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update degree')
      }

      const updatedDegree = await response.json()
      setItems((prev) => prev.map((p) => (p.id === editing.id ? updatedDegree : p)))

      toast({
        title: "✅ Degree Updated",
        description: `${updatedDegree.degree_name} has been successfully updated.`,
        className: "bg-green-50 border-green-200 text-green-800",
      })
    } else {
      // Create new record
      const response = await fetch('/api/degrees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create degree')
      }

      const newDegree = await response.json()
      setItems((prev) => [newDegree, ...prev])

      toast({
        title: "✅ Degree Created",
        description: `${newDegree.degree_name} has been successfully created.`,
        className: "bg-green-50 border-green-200 text-green-800",
      })
    }

    setSheetOpen(false)
    resetForm()
  } catch (error) {
    console.error('Error saving degree:', error)
    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to save degree. Please try again.'

    toast({
      title: "❌ Save Failed",
      description: errorMessage,
      variant: "destructive",
      className: "bg-red-50 border-red-200 text-red-800",
    })
  } finally {
    setLoading(false)
  }
}
```

## Grid Layouts

### 2-Column Grid (Standard)
```typescript
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {/* Fields */}
</div>
```

### 3-Column Grid (Compact)
```typescript
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  {/* Fields */}
</div>
```

### 1-Column Grid (Wide fields)
```typescript
<div className="grid grid-cols-1 gap-4">
  {/* Fields */}
</div>
```

## Styling Guidelines

### Field Heights
- **Standard inputs**: `h-10`
- **Textareas**: `min-h-[100px]`
- **Action buttons**: `h-10`

### Label Classes
- **Required fields**: `text-sm font-semibold` + red asterisk
- **Optional fields**: `text-sm font-medium`

### Error States
- **Border**: `border-destructive`
- **Text**: `text-xs text-destructive`

### Disabled State
- **Background**: `bg-muted`
- **Cursor**: `cursor-not-allowed`

### Spacing
- **Section spacing**: `space-y-6` (between sections)
- **Field spacing**: `space-y-4` (within section)
- **Label-Input spacing**: `space-y-2`

## Accessibility

- All inputs must have associated labels with `htmlFor` attribute
- Required fields marked with visual indicator (red asterisk)
- Error messages linked to inputs via ARIA attributes (handled by shadcn/ui)
- Focus management (auto-focus first field when form opens)
- Keyboard navigation support (Tab, Enter, Escape)
