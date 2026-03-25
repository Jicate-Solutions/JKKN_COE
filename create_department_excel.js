const XLSX = require('xlsx');

// Create a new workbook
const wb = XLSX.utils.book_new();

// Department data
const departmentData = [
  {
    'Institution Code': 'JKKNCAS',
    'Department Code': 'ZOO',
    'Department Name': 'ZOOLOGY',
    'Display Name': 'ZOOLOGY',
    'Description': 'ZOOLOGY',
    'Stream': 'Science',
    'Status': 'Active'
  }
];

// Create worksheet from data
const ws = XLSX.utils.json_to_sheet(departmentData);

// Set column widths for better readability
const columnWidths = [
  { wch: 20 }, // Institution Code
  { wch: 20 }, // Department Code
  { wch: 25 }, // Department Name
  { wch: 20 }, // Display Name
  { wch: 30 }, // Description
  { wch: 15 }, // Stream
  { wch: 10 }  // Status
];
ws['!cols'] = columnWidths;

// Add worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, 'Departments');

// Write the file
XLSX.writeFile(wb, 'department_zoology_import.xlsx');
console.log('✅ Excel file created: department_zoology_import.xlsx');