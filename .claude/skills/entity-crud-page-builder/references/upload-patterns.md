# Upload/Import Patterns

Complete implementation patterns for Excel/JSON import with detailed error tracking and visual feedback.

## State Management

```typescript
const [uploadSummary, setUploadSummary] = useState<{
  total: number
  success: number
  failed: number
}>({ total: 0, success: 0, failed: 0 })

const [importErrors, setImportErrors] = useState<Array<{
  row: number
  [entity]_code: string
  [entity]_name: string
  errors: string[]
}>>([])

const [errorPopupOpen, setErrorPopupOpen] = useState(false)
```

## Template Export with Reference Sheet

```typescript
const handleTemplateExport = () => {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Template with sample row
  const sample = [{
    'Institution Code': 'JKKN',
    'Degree Code': 'BSC',
    'Degree Name': 'Bachelor of Science',
    'Display Name': 'B.Sc',
    'Description': 'A comprehensive science degree program',
    'Status': 'Active'
  }]

  const ws = XLSX.utils.json_to_sheet(sample)

  // Set column widths
  const colWidths = [
    { wch: 18 }, // Institution Code
    { wch: 15 }, // Degree Code
    { wch: 30 }, // Degree Name
    { wch: 15 }, // Display Name
    { wch: 40 }, // Description
    { wch: 10 }  // Status
  ]
  ws['!cols'] = colWidths

  // Style the header row - mark mandatory fields red
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const mandatoryFields = ['Institution Code', 'Degree Code', 'Degree Name']

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
    if (!ws[cellAddress]) continue

    const cell = ws[cellAddress]
    const isMandatory = mandatoryFields.includes(cell.v as string)

    if (isMandatory) {
      // Mark mandatory fields with red and asterisk
      cell.v = cell.v + ' *'
      cell.s = {
        font: { color: { rgb: 'FF0000' }, bold: true },
        fill: { fgColor: { rgb: 'FFE6E6' } }
      }
    } else {
      // Regular field headers
      cell.s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'F0F0F0' } }
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Template')

  // Sheet 2: Institution Code References
  const institutionReference = institutions.map(inst => ({
    'Institution Code': inst.institution_code,
    'Institution Name': inst.name || 'N/A',
    'Status': inst.is_active ? 'Active' : 'Inactive'
  }))

  const wsRef = XLSX.utils.json_to_sheet(institutionReference)

  // Set column widths for reference sheet
  const refColWidths = [
    { wch: 20 }, // Institution Code
    { wch: 40 }, // Institution Name
    { wch: 10 }  // Status
  ]
  wsRef['!cols'] = refColWidths

  // Style the reference sheet header
  const refRange = XLSX.utils.decode_range(wsRef['!ref'] || 'A1')
  for (let col = refRange.s.c; col <= refRange.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
    if (wsRef[cellAddress]) {
      wsRef[cellAddress].s = {
        font: { bold: true, color: { rgb: '1F2937' } },
        fill: { fgColor: { rgb: 'DBEAFE' } }
      }
    }
  }

  // Style data rows in reference sheet
  for (let row = 1; row <= refRange.e.r; row++) {
    for (let col = refRange.s.c; col <= refRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
      if (wsRef[cellAddress]) {
        wsRef[cellAddress].s = {
          fill: { fgColor: { rgb: 'F0F9FF' } },
          font: { color: { rgb: '374151' } }
        }
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, wsRef, 'Institution Codes')

  XLSX.writeFile(wb, `degrees_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}
```

## Data Export (Current Data)

```typescript
const handleExport = () => {
  const excelData = filtered.map((r) => ({
    'Institution Code': r.institution_code,
    'Degree Code': r.degree_code,
    'Degree Name': r.degree_name,
    'Display Name': r.display_name || '',
    'Description': r.description || '',
    'Status': r.is_active ? 'Active' : 'Inactive',
    'Created': new Date(r.created_at).toISOString().split('T')[0],
  }))

  const ws = XLSX.utils.json_to_sheet(excelData)

  // Set column widths
  const colWidths = [
    { wch: 20 }, // Institution Code
    { wch: 15 }, // Degree Code
    { wch: 30 }, // Degree Name
    { wch: 15 }, // Display Name
    { wch: 40 }, // Description
    { wch: 10 }, // Status
    { wch: 12 }  // Created
  ]
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Degrees')
  XLSX.writeFile(wb, `degrees_export_${new Date().toISOString().split('T')[0]}.xlsx`)
}
```

## Import Handler with Row Tracking

```typescript
const handleImport = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.csv,.xlsx,.xls'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      let rows: Partial<Degree>[] = []

      // Parse JSON
      if (file.name.endsWith('.json')) {
        const text = await file.text()
        rows = JSON.parse(text)
      }
      // Parse CSV
      else if (file.name.endsWith('.csv')) {
        const text = await file.text()
        const lines = text.split('\n').filter(line => line.trim())
        if (lines.length < 2) {
          toast({
            title: "❌ Invalid CSV File",
            description: "CSV file must have at least a header row and one data row",
            variant: "destructive",
          })
          return
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
        const dataRows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
          const row: Record<string, string> = {}
          headers.forEach((header, index) => {
            row[header] = values[index] || ''
          })
          return row
        })

        rows = dataRows.map(j => ({
          degree_code: String(j['Degree Code *'] || j['Degree Code'] || ''),
          degree_name: String(j['Degree Name *'] || j['Degree Name'] || ''),
          display_name: String(j['Display Name'] || ''),
          description: String(j['Description'] || ''),
          is_active: String(j['Status'] || '').toLowerCase() === 'active'
        }))
      }
      // Parse Excel
      else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const data = new Uint8Array(await file.arrayBuffer())
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
        rows = json.map(j => ({
          institution_code: String(j['Institution Code *'] || j['Institution Code'] || ''),
          degree_code: String(j['Degree Code *'] || j['Degree Code'] || ''),
          degree_name: String(j['Degree Name *'] || j['Degree Name'] || ''),
          display_name: String(j['Display Name'] || ''),
          description: String(j['Description'] || ''),
          is_active: String(j['Status'] || '').toLowerCase() === 'active'
        }))
      }

      const now = new Date().toISOString()
      const validationErrors: Array<{
        row: number
        degree_code: string
        degree_name: string
        errors: string[]
      }> = []

      const mapped = rows.map((r, index) => {
        const degreeData = {
          id: String(Date.now() + Math.random()),
          institution_code: (r as any).institution_code || '',
          degree_code: r.degree_code!,
          degree_name: r.degree_name as string,
          display_name: r.display_name || '',
          description: r.description || '',
          is_active: r.is_active ?? true,
          created_at: now,
        }

        // Validate the data
        const errors = validateDegreeData(degreeData, index + 2)
        if (errors.length > 0) {
          validationErrors.push({
            row: index + 2,
            degree_code: degreeData.degree_code || 'N/A',
            degree_name: degreeData.degree_name || 'N/A',
            errors: errors
          })
        }

        return degreeData
      }).filter(r => r.degree_code && r.degree_name) as Degree[]

      // If there are validation errors, show them in popup
      if (validationErrors.length > 0) {
        setImportErrors(validationErrors)
        setUploadSummary({
          total: rows.length,
          success: 0,
          failed: validationErrors.length
        })
        setErrorPopupOpen(true)
        return
      }

      if (mapped.length === 0) {
        toast({
          title: "❌ No Valid Data",
          description: "No valid data found in the file.",
          variant: "destructive",
        })
        return
      }

      // Save each degree to the database
      setLoading(true)
      let successCount = 0
      let errorCount = 0
      const uploadErrors: Array<{
        row: number
        degree_code: string
        degree_name: string
        errors: string[]
      }> = []

      for (let i = 0; i < mapped.length; i++) {
        const degree = mapped[i]
        const rowNumber = i + 2 // +2 for header row in Excel

        try {
          const response = await fetch('/api/degrees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(degree),
          })

          if (response.ok) {
            const savedDegree = await response.json()
            setItems(prev => [savedDegree, ...prev])
            successCount++
          } else {
            const errorData = await response.json()
            errorCount++
            uploadErrors.push({
              row: rowNumber,
              degree_code: degree.degree_code || 'N/A',
              degree_name: degree.degree_name || 'N/A',
              errors: [errorData.error || 'Failed to save degree']
            })
          }
        } catch (error) {
          errorCount++
          uploadErrors.push({
            row: rowNumber,
            degree_code: degree.degree_code || 'N/A',
            degree_name: degree.degree_name || 'N/A',
            errors: [error instanceof Error ? error.message : 'Network error']
          })
        }
      }

      setLoading(false)
      const totalRows = mapped.length

      // Update upload summary
      setUploadSummary({
        total: totalRows,
        success: successCount,
        failed: errorCount
      })

      // Show error dialog if needed
      if (uploadErrors.length > 0) {
        setImportErrors(uploadErrors)
        setErrorPopupOpen(true)
      }

      // Show appropriate toast message
      if (successCount > 0 && errorCount === 0) {
        toast({
          title: "✅ Upload Complete",
          description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} to the database.`,
          className: "bg-green-50 border-green-200 text-green-800",
          duration: 5000,
        })
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: "⚠️ Partial Upload Success",
          description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: ${successCount} successful, ${errorCount} failed.`,
          className: "bg-yellow-50 border-yellow-200 text-yellow-800",
          duration: 6000,
        })
      } else if (errorCount > 0) {
        toast({
          title: "❌ Upload Failed",
          description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: 0 successful, ${errorCount} failed.`,
          variant: "destructive",
          className: "bg-red-50 border-red-200 text-red-800",
          duration: 6000,
        })
      }
    } catch (err) {
      console.error('Import error:', err)
      setLoading(false)
      toast({
        title: "❌ Import Error",
        description: "Import failed. Please check your file format.",
        variant: "destructive",
      })
    }
  }
  input.click()
}
```

## Error Dialog with Visual Summary

```typescript
<AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
  <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
    <AlertDialogHeader>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
          <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
        <div>
          <AlertDialogTitle className="text-xl font-bold text-red-600 dark:text-red-400">
            Data Validation Errors
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground mt-1">
            Please fix the following errors before importing the data
          </AlertDialogDescription>
        </div>
      </div>
    </AlertDialogHeader>

    <div className="space-y-4">
      {/* Upload Summary Cards */}
      {uploadSummary.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Total Rows</div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{uploadSummary.total}</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Successful</div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">{uploadSummary.success}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Failed</div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">{uploadSummary.failed}</div>
          </div>
        </div>
      )}

      {/* Error Summary */}
      <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <span className="font-semibold text-red-800 dark:text-red-200">
            {importErrors.length} row{importErrors.length > 1 ? 's' : ''} failed validation
          </span>
        </div>
        <p className="text-sm text-red-700 dark:text-red-300">
          Please correct these errors in your Excel file and try uploading again.
        </p>
      </div>

      {/* Detailed Error List */}
      <div className="space-y-3">
        {importErrors.map((error, index) => (
          <div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/5">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">
                  Row {error.row}
                </Badge>
                <span className="font-medium text-sm">
                  {error.degree_code} - {error.degree_name}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              {error.errors.map((err, errIndex) => (
                <div key={errIndex} className="flex items-start gap-2 text-sm">
                  <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-red-700 dark:text-red-300">{err}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Helpful Tips */}
      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mt-0.5">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">i</span>
          </div>
          <div>
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">Common Fixes:</h4>
            <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <li>• Ensure all required fields are provided and not empty</li>
              <li>• Foreign keys must reference existing records</li>
              <li>• Check field length constraints</li>
              <li>• Verify data format matches expected patterns</li>
              <li>• Status values: true/false or Active/Inactive</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => setErrorPopupOpen(false)}>
        Close
      </AlertDialogCancel>
      <Button
        onClick={() => {
          setErrorPopupOpen(false)
          setImportErrors([])
        }}
        className="bg-blue-600 hover:bg-blue-700 text-white"
      >
        Try Again
      </Button>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## Key Features

- ✅ **Row Count Tracking**: Total, success, failed metrics
- ✅ **Visual Summary Cards**: Color-coded (blue/green/red) in error dialog
- ✅ **Excel Row Numbers**: Shows exact row numbers matching Excel file
- ✅ **Detailed Error Messages**: Specific validation errors per row
- ✅ **Foreign Key Validation**: Client-side and server-side checks
- ✅ **Template with Reference**: Includes foreign key reference sheet
- ✅ **Multiple File Formats**: JSON, CSV, XLSX, XLS support
- ✅ **Proper Pluralization**: Handles singular/plural in messages
- ✅ **Enhanced Toast Duration**: 5-6 seconds for complex messages
- ✅ **Helpful Tips Section**: Guidance for common fixes
