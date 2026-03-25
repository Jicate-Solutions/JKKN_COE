import XLSX from '@/lib/utils/excel-compat'
import type { Institution, DepartmentInfo } from '@/types/institutions'

// Helper function to format department data
function formatDepartment(dept: any): string {
  if (!dept || Object.keys(dept).length === 0) return ''

  const name = dept.name || ''
  const email = dept.email || ''
  const mobile = dept.mobile || ''
  const designation = dept.designation || ''

  return `${name}\n${email}\n${mobile}\n${designation}`
}

export function exportToJSON(institutions: Institution[]): void {
  const exportData = institutions.map(item => ({
    institution_code: item.institution_code,
    name: item.name,
    phone: item.phone || '',
    email: item.email || '',
    website: item.website || '',
    counselling_code: item.counselling_code || '',
    accredited_by: item.accredited_by || '',
    address_line1: item.address_line1 || '',
    address_line2: item.address_line2 || '',
    address_line3: item.address_line3 || '',
    city: item.city || '',
    state: item.state || '',
    country: item.country || '',
    pin_code: item.pin_code || '',
    logo_url: item.logo_url || '',
    institution_type: item.institution_type || '',
    timetable_type: item.timetable_type || '',
    transportation_dept: formatDepartment(item.transportation_dept),
    administration_dept: formatDepartment(item.administration_dept),
    accounts_dept: formatDepartment(item.accounts_dept),
    admission_dept: formatDepartment(item.admission_dept),
    placement_dept: formatDepartment(item.placement_dept),
    anti_ragging_dept: formatDepartment(item.anti_ragging_dept),
    is_active: item.is_active,
    created_at: item.created_at
  }))

  const json = JSON.stringify(exportData, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `institutions_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportToExcel(institutions: Institution[]): void {
  const excelData = institutions.map((r) => ({
    'Institution Code': r.institution_code,
    'Name': r.name,
    'Phone': r.phone || '',
    'Email': r.email || '',
    'Website': r.website || '',
    'Counselling Code': r.counselling_code || '',
    'Accredited By': r.accredited_by || '',
    'Address Line 1': r.address_line1 || '',
    'Address Line 2': r.address_line2 || '',
    'Address Line 3': r.address_line3 || '',
    'City': r.city || '',
    'State': r.state || '',
    'Country': r.country || '',
    'PIN Code': r.pin_code || '',
    'Logo URL': r.logo_url || '',
    'Institution Type': r.institution_type || '',
    'Timetable Type': r.timetable_type || '',
    'Transportation Dept': formatDepartment(r.transportation_dept),
    'Administration Dept': formatDepartment(r.administration_dept),
    'Accounts Dept': formatDepartment(r.accounts_dept),
    'Admission Dept': formatDepartment(r.admission_dept),
    'Placement Dept': formatDepartment(r.placement_dept),
    'Anti-Ragging Dept': formatDepartment(r.anti_ragging_dept),
    'Status': r.is_active ? 'Active' : 'Inactive',
    'Created': new Date(r.created_at).toISOString().split('T')[0],
  }))

  const ws = XLSX.utils.json_to_sheet(excelData)

  // Set column widths and wrap text for department columns
  const colWidths = [
    { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 25 }, { wch: 30 },
    { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 25 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 30 },
    { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 30 },
    { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 10 }, { wch: 12 }
  ]
  ws['!cols'] = colWidths

  // Apply wrap text to department columns
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const departmentCols = [17, 18, 19, 20, 21, 22] // Transportation, Administration, Accounts, Admission, Placement, Anti-Ragging

  for (let row = range.s.r; row <= range.e.r; row++) {
    for (const col of departmentCols) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
      if (ws[cellAddress]) {
        ws[cellAddress].s = {
          ...ws[cellAddress].s,
          alignment: { wrapText: true, vertical: 'top' }
        }
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Institutions')
  XLSX.writeFile(wb, `institutions_export_${new Date().toISOString().split('T')[0]}.xlsx`)
}

export function exportTemplate(): void {
  const sample = [{
    'Institution Code': 'JKKN',
    'Name': 'JKKN Institutions',
    'Phone': '+91 9000000000',
    'Email': 'info@example.com',
    'Website': 'https://jkkn.edu',
    'Counselling Code': 'JKKN001',
    'Accredited By': 'NAAC',
    'Address Line 1': '123 Main Street',
    'Address Line 2': 'Educational District',
    'Address Line 3': 'Near Landmark',
    'City': 'Chennai',
    'State': 'Tamil Nadu',
    'Country': 'India',
    'PIN Code': '600001',
    'Logo URL': 'https://example.com/logo.png',
    'Institution Type': 'university',
    'Timetable Type': 'week_order',
    'Status': 'Active'
  }]

  const ws = XLSX.utils.json_to_sheet(sample)

  // Set column widths
  const colWidths = [
    { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 25 }, { wch: 30 },
    { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 25 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 30 },
    { wch: 15 }, { wch: 15 }, { wch: 10 }
  ]
  ws['!cols'] = colWidths

  // Style the header row to make mandatory fields red
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const mandatoryFields = ['Institution Code', 'Name']

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
    if (!ws[cellAddress]) continue

    const cell = ws[cellAddress]
    const isMandatory = mandatoryFields.includes(cell.v as string)

    if (isMandatory) {
      cell.v = cell.v + ' *'
      cell.s = {
        font: { color: { rgb: 'FF0000' }, bold: true },
        fill: { fgColor: { rgb: 'FFE6E6' } }
      }
    } else {
      cell.s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'F0F0F0' } }
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  XLSX.writeFile(wb, `institutions_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}
