import { useCallback } from 'react'
import { useToast } from '@/hooks/common/use-toast'

interface UseExcelExportOptions<T> {
  filename?: string
  sheetName?: string
  columns?: {
    key: keyof T
    header: string
  }[]
  formatData?: (item: T) => Record<string, any>
}

interface ExcelExportState<T> {
  exportToExcel: (data: T[]) => void
  downloadTemplate: (columns: string[]) => void
}

/**
 * Custom hook for exporting data to Excel files
 *
 * @example
 * const { exportToExcel, downloadTemplate } = useExcelExport<Course>({
 *   filename: 'courses',
 *   sheetName: 'Courses',
 *   columns: [
 *     { key: 'course_code', header: 'Course Code' },
 *     { key: 'course_title', header: 'Course Title' },
 *     { key: 'credits', header: 'Credits' }
 *   ]
 * })
 *
 * // Export data
 * exportToExcel(courses)
 *
 * // Download template
 * downloadTemplate(['Course Code', 'Course Title', 'Credits'])
 */
export function useExcelExport<T>(
  options: UseExcelExportOptions<T> = {}
): ExcelExportState<T> {
  const {
    filename = 'export',
    sheetName = 'Sheet1',
    columns,
    formatData
  } = options

  const { toast } = useToast()

  const exportToExcel = useCallback(async (data: T[]) => {
    try {
      if (data.length === 0) {
        toast({
          title: '⚠️ No Data',
          description: 'There is no data to export.',
          variant: 'destructive',
          className: 'bg-yellow-50 border-yellow-200 text-yellow-800'
        })
        return
      }

      let exportData: Record<string, any>[] = data as Record<string, any>[]

      // Format data if formatter provided
      if (formatData) {
        exportData = data.map(formatData)
      }
      // Filter by columns if specified
      else if (columns && columns.length > 0) {
        exportData = data.map(item => {
          const row: Record<string, any> = {}
          columns.forEach(col => {
            row[col.header] = item[col.key]
          })
          return row
        })
      }

      // Dynamic import to avoid loading ~500KB ExcelJS in every page bundle
      const ExcelJS = await import('exceljs')

      // Create workbook and worksheet
      const workbook = new ExcelJS.default.Workbook()
      const worksheet = workbook.addWorksheet(sheetName)

      // Get headers from first row of data
      const headers = Object.keys(exportData[0] || {})

      // Add header row
      worksheet.addRow(headers)

      // Style header row
      const headerRow = worksheet.getRow(1)
      headerRow.font = { bold: true }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      }

      // Add data rows
      exportData.forEach(row => {
        worksheet.addRow(headers.map(h => row[h]))
      })

      // Auto-size columns
      const maxWidth = 50
      worksheet.columns.forEach((column, index) => {
        const header = headers[index] || ''
        let maxLength = header.length

        exportData.forEach(row => {
          const cellValue = String(row[header] || '')
          maxLength = Math.max(maxLength, cellValue.length)
        })

        column.width = Math.min(maxLength + 2, maxWidth)
      })

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0]
      const finalFilename = `${filename}_${timestamp}.xlsx`

      // Generate buffer and download
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = finalFilename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: '✅ Export Successful',
        description: `Exported ${data.length} record${data.length > 1 ? 's' : ''} to ${finalFilename}`,
        className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export file'

      toast({
        title: '❌ Export Failed',
        description: errorMessage,
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
    }
  }, [filename, sheetName, columns, formatData, toast])

  const downloadTemplate = useCallback(async (templateColumns: string[]) => {
    try {
      // Dynamic import to avoid loading ~500KB ExcelJS in every page bundle
      const ExcelJS = await import('exceljs')

      // Create workbook and worksheet
      const workbook = new ExcelJS.default.Workbook()
      const worksheet = workbook.addWorksheet(sheetName)

      // Add header row
      worksheet.addRow(templateColumns)

      // Style header row
      const headerRow = worksheet.getRow(1)
      headerRow.font = { bold: true }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      }

      // Auto-size columns based on header length
      worksheet.columns = templateColumns.map(header => ({
        width: Math.max(header.length + 2, 15)
      }))

      // Generate filename
      const finalFilename = `${filename}_template.xlsx`

      // Generate buffer and download
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = finalFilename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast({
        title: '✅ Template Downloaded',
        description: `Downloaded template: ${finalFilename}`,
        className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to download template'

      toast({
        title: '❌ Download Failed',
        description: errorMessage,
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
    }
  }, [filename, sheetName, toast])

  return {
    exportToExcel,
    downloadTemplate
  }
}
