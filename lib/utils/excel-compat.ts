/**
 * ExcelJS Compatibility Layer
 *
 * Provides xlsx-like API using ExcelJS under the hood.
 * This allows easy migration from xlsx package to ExcelJS.
 */

import ExcelJS from 'exceljs'

export interface SheetData {
  [key: string]: any
}

export interface ColumnWidth {
  wch: number
}

export interface DataValidation {
  type: 'list' | 'whole' | 'decimal' | 'date' | 'time' | 'textLength' | 'custom'
  sqref: string
  formula1: string
  showDropDown?: boolean
  showErrorMessage?: boolean
  errorTitle?: string
  error?: string
  showInputMessage?: boolean
  promptTitle?: string
  prompt?: string
}

export interface MergeRange {
  s: { r: number; c: number }
  e: { r: number; c: number }
}

export interface WorksheetCompat {
  '!cols'?: ColumnWidth[]
  '!ref'?: string
  '!dataValidation'?: DataValidation[]
  '!merges'?: MergeRange[]
  '!wrapCols'?: number[]
  [key: string]: any
}

export interface WorkbookCompat {
  SheetNames: string[]
  Sheets: { [name: string]: WorksheetCompat }
  _workbook: ExcelJS.Workbook
}

/**
 * Converts JSON data to worksheet format
 */
export function json_to_sheet(data: Record<string, any>[]): WorksheetCompat {
  if (data.length === 0) {
    return { '!ref': 'A1', '!cols': [] }
  }

  const headers = Object.keys(data[0])
  const lastColLetter = colIndexToLetters(headers.length - 1)
  const ws: WorksheetCompat = {
    '!ref': `A1:${lastColLetter}${data.length + 1}`
  }

  // Add header cells
  headers.forEach((header, colIndex) => {
    const cellRef = encode_cell({ r: 0, c: colIndex })
    ws[cellRef] = { v: header, t: 's' }
  })

  // Add data cells
  data.forEach((row, rowIndex) => {
    headers.forEach((header, colIndex) => {
      const cellRef = encode_cell({ r: rowIndex + 1, c: colIndex })
      const value = row[header]
      ws[cellRef] = {
        v: value,
        t: typeof value === 'number' ? 'n' : 's'
      }
    })
  })

  return ws
}

/**
 * Converts array of arrays to worksheet format
 */
export function aoa_to_sheet(data: any[][]): WorksheetCompat {
  if (data.length === 0) {
    return { '!ref': 'A1', '!cols': [] }
  }

  const maxCols = Math.max(...data.map(row => row.length))
  const lastColLetter = colIndexToLetters(maxCols - 1)
  const ws: WorksheetCompat = {
    '!ref': `A1:${lastColLetter}${data.length}`
  }

  data.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const cellRef = encode_cell({ r: rowIndex, c: colIndex })
      ws[cellRef] = {
        v: value,
        t: typeof value === 'number' ? 'n' : 's'
      }
    })
  })

  return ws
}

/**
 * Creates a new workbook
 */
export function book_new(): WorkbookCompat {
  return {
    SheetNames: [],
    Sheets: {},
    _workbook: new ExcelJS.Workbook()
  }
}

/**
 * Appends a sheet to the workbook
 */
export function book_append_sheet(wb: WorkbookCompat, ws: WorksheetCompat, name: string): void {
  wb.SheetNames.push(name)
  wb.Sheets[name] = ws
}

/**
 * Converts worksheet to JSON
 */
export function sheet_to_json<T = Record<string, any>>(ws: WorksheetCompat): T[] {
  const result: T[] = []
  const ref = ws['!ref']
  if (!ref) return result

  // Parse ref to get range
  const match = ref.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/)
  if (!match) return result

  const startCol = colLettersToIndex(match[1])
  const startRow = parseInt(match[2])
  const endCol = colLettersToIndex(match[3])
  const endRow = parseInt(match[4])

  // Get headers from first row
  const headers: string[] = []
  for (let col = startCol; col <= endCol; col++) {
    const cellRef = encode_cell({ r: startRow - 1, c: col })
    const cell = ws[cellRef]
    headers.push(cell?.v?.toString() || '')
  }

  // Get data rows
  for (let row = startRow + 1; row <= endRow; row++) {
    const rowData: Record<string, any> = {}
    for (let col = startCol; col <= endCol; col++) {
      const cellRef = encode_cell({ r: row - 1, c: col })
      const cell = ws[cellRef]
      const header = headers[col - startCol]
      if (header) {
        rowData[header] = cell?.v
      }
    }
    result.push(rowData as T)
  }

  return result
}

/**
 * Decodes range string to object
 */
export function decode_range(ref: string): { s: { r: number; c: number }; e: { r: number; c: number } } {
  const match = ref.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/)
  if (!match) {
    return { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }
  }

  return {
    s: {
      r: parseInt(match[2]) - 1,
      c: colLettersToIndex(match[1])
    },
    e: {
      r: parseInt(match[4]) - 1,
      c: colLettersToIndex(match[3])
    }
  }
}

/**
 * Converts a 0-based column index to Excel column letters (0=A, 25=Z, 26=AA, etc.)
 */
function colIndexToLetters(index: number): string {
  let result = ''
  let n = index
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

/**
 * Converts Excel column letters to a 0-based column index (A=0, Z=25, AA=26, etc.)
 */
function colLettersToIndex(letters: string): number {
  let result = 0
  for (let i = 0; i < letters.length; i++) {
    result = result * 26 + (letters.charCodeAt(i) - 65 + 1)
  }
  return result - 1
}

/**
 * Encodes cell address from row/col
 */
export function encode_cell(cell: { r: number; c: number }): string {
  return `${colIndexToLetters(cell.c)}${cell.r + 1}`
}

/**
 * Decodes cell reference string to row/col object
 */
export function decode_cell(ref: string): { r: number; c: number } {
  const match = ref.match(/([A-Z]+)(\d+)/)
  if (!match) return { r: 0, c: 0 }
  return {
    c: colLettersToIndex(match[1]),
    r: parseInt(match[2]) - 1
  }
}

/**
 * Encodes range object to range string
 */
export function encode_range(range: { s: { r: number; c: number }; e: { r: number; c: number } }): string {
  return `${encode_cell(range.s)}:${encode_cell(range.e)}`
}

/**
 * Writes workbook to file (downloads in browser)
 */
export async function writeFile(wb: WorkbookCompat, filename: string): Promise<void> {
  const workbook = new ExcelJS.Workbook()

  // Convert each sheet
  for (const sheetName of wb.SheetNames) {
    const wsCompat = wb.Sheets[sheetName]
    const worksheet = workbook.addWorksheet(sheetName)

    const ref = wsCompat['!ref']
    if (!ref) continue

    const range = decode_range(ref)

    // Get headers
    const headers: string[] = []
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = encode_cell({ r: 0, c: col })
      const cell = wsCompat[cellRef]
      headers.push(cell?.v?.toString() || '')
    }

    // Add header row
    worksheet.addRow(headers)

    // Default font for all cells
    const defaultFont: Partial<ExcelJS.Font> = { name: 'Times New Roman', size: 12 }

    // Style header row
    const headerRow = worksheet.getRow(1)
    headerRow.font = { ...defaultFont, bold: true }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    }

    // Add data rows
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const rowData: any[] = []
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = encode_cell({ r: row, c: col })
        const cell = wsCompat[cellRef]
        rowData.push(cell?.v)
      }
      worksheet.addRow(rowData)
    }

    // Apply font and borders to all cells (header + data)
    const thinBorder: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } }
    const totalRows = range.e.r - range.s.r + 1
    const totalCols = range.e.c - range.s.c + 1
    for (let r = 1; r <= totalRows; r++) {
      for (let c = 1; c <= totalCols; c++) {
        const cell = worksheet.getCell(r, c)
        cell.font = r === 1 ? { ...defaultFont, bold: true } : { ...defaultFont }
        cell.border = {
          top: thinBorder,
          left: thinBorder,
          bottom: thinBorder,
          right: thinBorder,
        }
      }
    }

    // Apply column widths
    if (wsCompat['!cols']) {
      wsCompat['!cols'].forEach((colWidth, index) => {
        if (worksheet.columns[index]) {
          worksheet.columns[index].width = colWidth.wch
        }
      })
    }

    // Apply merge ranges
    if (wsCompat['!merges']) {
      wsCompat['!merges'].forEach(merge => {
        // ExcelJS uses 1-based row/col indices
        worksheet.mergeCells(merge.s.r + 1, merge.s.c + 1, merge.e.r + 1, merge.e.c + 1)
        // Center the merged cell content vertically and horizontally
        const cell = worksheet.getCell(merge.s.r + 1, merge.s.c + 1)
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })
    }

    // Apply wrap text to specified columns
    if (wsCompat['!wrapCols'] && wsCompat['!wrapCols'].length > 0) {
      const wrapColIndices = wsCompat['!wrapCols']
      for (let r = 1; r <= totalRows; r++) {
        for (const colIdx of wrapColIndices) {
          const cell = worksheet.getCell(r, colIdx + 1) // 1-based
          cell.alignment = { ...cell.alignment, wrapText: true, vertical: 'middle' }
        }
      }
    }

    // Apply data validation (dropdown lists) for columns with validation rules
    if (wsCompat['!dataValidation'] && wsCompat['!dataValidation'].length > 0) {
      // Create a hidden sheet for valid values lookup (for conditional formatting)
      const validationSheet = workbook.addWorksheet('_ValidCodes')
      validationSheet.state = 'hidden' // Use 'hidden' instead of 'veryHidden' for better compatibility

      let colIndex = 1 // Start from column A

      wsCompat['!dataValidation'].forEach(validation => {
        const sqref = validation.sqref

        // Parse formula1 to get values: '"AHS,CAS,COE"' -> ['AHS', 'CAS', 'COE']
        let values: string[] = []
        if (validation.formula1) {
          let formula = validation.formula1
          if (formula.startsWith('"') && formula.endsWith('"')) {
            formula = formula.slice(1, -1)
          }
          values = formula.split(',')
        }

        if (values.length === 0) return

        // Write valid values to hidden sheet column (always needed for conditional formatting)
        values.forEach((value, rowIdx) => {
          validationSheet.getCell(rowIdx + 1, colIndex).value = value
        })

        // Apply data validation to target range (creates dropdown)
        const rangeMatch = sqref.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/)
        if (rangeMatch) {
          const targetCol = rangeMatch[1]
          const startRow = parseInt(rangeMatch[2])
          const endRow = Math.min(parseInt(rangeMatch[4]), startRow + 99) // Limit to 100 rows

          // Get column index from letter (A=1, B=2, etc.)
          const colNum = targetCol.charCodeAt(0) - 64

          // Check if values fit in Excel's 255 character limit for inline formula
          const inlineFormula = `"${values.join(',')}"`
          const canUseInlineDropdown = inlineFormula.length <= 255

          // Reference to hidden sheet for long lists
          const sheetRef = `'_ValidCodes'!$${String.fromCharCode(64 + colIndex)}$1:$${String.fromCharCode(64 + colIndex)}$${values.length}`

          // Apply data validation with dropdown list for each row in the range
          // Only add dropdown if within Excel's limit, otherwise just use conditional formatting
          if (canUseInlineDropdown) {
            for (let row = startRow; row <= endRow; row++) {
              const cell = worksheet.getCell(row, colNum)
              cell.dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [inlineFormula],
                showErrorMessage: validation.showErrorMessage ?? true,
                errorTitle: validation.errorTitle || 'Invalid Value',
                error: validation.error || 'Please select a valid value from the dropdown list',
                errorStyle: 'warning' // 'stop', 'warning', or 'information'
              }
            }
          } else {
            // For long lists, try using sheet reference for dropdown
            // Note: This may not work in all Excel versions
            for (let row = startRow; row <= endRow; row++) {
              const cell = worksheet.getCell(row, colNum)
              cell.dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [sheetRef],
                showErrorMessage: validation.showErrorMessage ?? true,
                errorTitle: validation.errorTitle || 'Invalid Value',
                error: validation.error || 'Please select a valid value from the dropdown list',
                errorStyle: 'warning'
              }
            }
          }

          // ALWAYS add conditional formatting to highlight invalid values in red
          // This works regardless of dropdown, provides visual feedback for invalid entries
          const colLetter = String.fromCharCode(64 + colIndex)
          const validRange = `'_ValidCodes'!$${colLetter}$1:$${colLetter}$${values.length}`

          worksheet.addConditionalFormatting({
            ref: `${targetCol}${startRow}:${targetCol}${endRow}`,
            rules: [
              {
                type: 'expression',
                formulae: [`AND(${targetCol}${startRow}<>"",COUNTIF(${validRange},${targetCol}${startRow})=0)`],
                style: {
                  fill: {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFFC7CE' } // Light red background
                  },
                  font: {
                    color: { argb: 'FF9C0006' } // Dark red text
                  }
                },
                priority: 1
              }
            ]
          })
        }

        colIndex++
      })
    }
  }

  // Generate buffer and download
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Reads Excel file from ArrayBuffer
 */
export async function read(data: ArrayBuffer): Promise<WorkbookCompat> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(data)

  const wb: WorkbookCompat = {
    SheetNames: [],
    Sheets: {},
    _workbook: workbook
  }

  workbook.worksheets.forEach(worksheet => {
    const sheetName = worksheet.name
    wb.SheetNames.push(sheetName)

    const ws: WorksheetCompat = {}
    const headers: string[] = []
    let maxRow = 0
    let maxCol = 0

    // Use includeEmpty: true to include empty cells
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      // Get actual column count from first row to determine maxCol
      if (rowNumber === 1) {
        maxCol = row.cellCount
      }

      // Iterate through all columns (including empty ones)
      for (let colNumber = 1; colNumber <= Math.max(row.cellCount, maxCol); colNumber++) {
        const cell = row.getCell(colNumber)
        const colIndex = colNumber - 1
        const rowIndex = rowNumber - 1

        if (rowNumber === 1) {
          headers[colIndex] = String(cell.value || '')
        }

        const cellRef = encode_cell({ r: rowIndex, c: colIndex })

        // Handle different cell value types
        let value = cell.value
        if (value && typeof value === 'object') {
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

        ws[cellRef] = {
          v: value,
          t: typeof value === 'number' ? 'n' : 's'
        }

        maxCol = Math.max(maxCol, colNumber)
      }

      maxRow = Math.max(maxRow, rowNumber)
    })

    ws['!ref'] = `A1:${colIndexToLetters(maxCol - 1)}${maxRow}`
    wb.Sheets[sheetName] = ws
  })

  return wb
}

// Export utils namespace for compatibility
export const utils = {
  json_to_sheet,
  aoa_to_sheet,
  book_new,
  book_append_sheet,
  sheet_to_json,
  decode_range,
  decode_cell,
  encode_cell,
  encode_range
}

// Default export for drop-in replacement
export default {
  utils,
  writeFile,
  read
}
