import { useState, useCallback, useRef } from 'react'
import ExcelJS from 'exceljs'
import { useToast } from '@/hooks/common/use-toast'

interface ImportError {
  row: number
  errors: string[]
  data?: Record<string, any>
}

interface ImportSummary {
  total: number
  success: number
  failed: number
}

interface UseExcelImportOptions<T> {
  onImport: (data: T[]) => Promise<ImportError[]>
  validateRow?: (row: any, rowIndex: number) => string[] | null
  mapColumns?: (row: any) => T
  requiredColumns?: string[]
  entityName?: string
}

interface ExcelImportState<T> {
  // State
  importing: boolean
  importErrors: ImportError[]
  importSummary: ImportSummary
  showErrorDialog: boolean

  // Actions
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  triggerFileInput: () => void
  closeErrorDialog: () => void
  resetImport: () => void

  // Ref
  fileInputRef: React.RefObject<HTMLInputElement>
}

/**
 * Custom hook for importing data from Excel files
 *
 * @example
 * const {
 *   importing,
 *   importErrors,
 *   importSummary,
 *   showErrorDialog,
 *   handleFileUpload,
 *   triggerFileInput,
 *   fileInputRef
 * } = useExcelImport<Course>({
 *   onImport: async (courses) => {
 *     // Import logic
 *     return errors // Return array of errors
 *   },
 *   validateRow: (row, index) => {
 *     const errors = []
 *     if (!row.course_code) errors.push('Course code required')
 *     return errors.length > 0 ? errors : null
 *   },
 *   entityName: 'Course'
 * })
 */
export function useExcelImport<T>(
  options: UseExcelImportOptions<T>
): ExcelImportState<T> {
  const {
    onImport,
    validateRow,
    mapColumns,
    requiredColumns = [],
    entityName = 'Item'
  } = options

  const [importing, setImporting] = useState(false)
  const [importErrors, setImportErrors] = useState<ImportError[]>([])
  const [importSummary, setImportSummary] = useState<ImportSummary>({
    total: 0,
    success: 0,
    failed: 0
  })
  const [showErrorDialog, setShowErrorDialog] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    const errors: ImportError[] = []

    try {
      // Read Excel file using ExcelJS
      const arrayBuffer = await file.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(arrayBuffer)

      const worksheet = workbook.worksheets[0]
      if (!worksheet) {
        throw new Error('Excel file has no worksheets')
      }

      // Convert worksheet to JSON
      const jsonData: Record<string, any>[] = []
      const headers: string[] = []

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          // First row is headers
          row.eachCell((cell, colNumber) => {
            headers[colNumber - 1] = String(cell.value || '')
          })
        } else {
          // Data rows
          const rowData: Record<string, any> = {}
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1]
            if (header) {
              // Handle different cell value types
              let value = cell.value
              if (value && typeof value === 'object') {
                // Handle rich text, formulas, etc.
                if ('result' in value) {
                  value = value.result
                } else if ('text' in value) {
                  value = value.text
                } else if ('richText' in value) {
                  value = (value as ExcelJS.CellRichTextValue).richText
                    .map(rt => rt.text)
                    .join('')
                }
              }
              rowData[header] = value
            }
          })
          // Only add row if it has data
          if (Object.keys(rowData).length > 0) {
            jsonData.push(rowData)
          }
        }
      })

      if (jsonData.length === 0) {
        throw new Error('Excel file is empty')
      }

      // Validate required columns
      if (requiredColumns.length > 0) {
        const missingColumns = requiredColumns.filter(col => !headers.includes(col))

        if (missingColumns.length > 0) {
          throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
        }
      }

      // Validate and map data
      const validData: T[] = []

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i]
        const rowNumber = i + 2 // +2 for Excel row number (1-indexed + header)

        // Validate row
        if (validateRow) {
          const rowErrors = validateRow(row, i)
          if (rowErrors && rowErrors.length > 0) {
            errors.push({
              row: rowNumber,
              errors: rowErrors,
              data: row
            })
            continue
          }
        }

        // Map columns
        const mappedData = mapColumns ? mapColumns(row) : (row as unknown as T)
        validData.push(mappedData)
      }

      // Import valid data
      const importErrors = await onImport(validData)

      // Update summary
      const totalRows = jsonData.length
      const failedRows = errors.length + importErrors.length
      const successRows = totalRows - failedRows

      setImportSummary({
        total: totalRows,
        success: successRows,
        failed: failedRows
      })

      // Combine validation and import errors
      const allErrors = [...errors, ...importErrors]
      setImportErrors(allErrors)

      // Show results
      if (allErrors.length > 0) {
        setShowErrorDialog(true)
      }

      if (successRows > 0 && failedRows === 0) {
        toast({
          title: '✅ Import Complete',
          description: `Successfully imported all ${successRows} ${entityName.toLowerCase()}${successRows > 1 ? 's' : ''}.`,
          className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
          duration: 5000
        })
      } else if (successRows > 0 && failedRows > 0) {
        toast({
          title: '⚠️ Partial Import Success',
          description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: ${successRows} successful, ${failedRows} failed. View error details.`,
          className: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
          duration: 6000
        })
      } else if (failedRows > 0) {
        toast({
          title: '❌ Import Failed',
          description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: 0 successful, ${failedRows} failed. View error details.`,
          variant: 'destructive',
          className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
          duration: 6000
        })
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to import file'

      toast({
        title: '❌ Import Error',
        description: errorMessage,
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
    } finally {
      setImporting(false)
      // Reset file input
      if (event.target) {
        event.target.value = ''
      }
    }
  }, [onImport, validateRow, mapColumns, requiredColumns, entityName, toast])

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const closeErrorDialog = useCallback(() => {
    setShowErrorDialog(false)
  }, [])

  const resetImport = useCallback(() => {
    setImportErrors([])
    setImportSummary({ total: 0, success: 0, failed: 0 })
    setShowErrorDialog(false)
  }, [])

  return {
    importing,
    importErrors,
    importSummary,
    showErrorDialog,
    handleFileUpload,
    triggerFileInput,
    closeErrorDialog,
    resetImport,
    fileInputRef
  }
}
