const XLSX = require('xlsx');

// Read the generated Excel file
const workbook = XLSX.readFile('department_zoology_import.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to JSON to see the data
const jsonData = XLSX.utils.sheet_to_json(worksheet);

console.log('Sheet name:', sheetName);
console.log('Column headers:', Object.keys(jsonData[0] || {}));
console.log('Data:', JSON.stringify(jsonData, null, 2));