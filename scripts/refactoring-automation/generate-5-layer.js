#!/usr/bin/env node

/**
 * 5-Layer Architecture Generator
 *
 * Automates the refactoring of page.tsx files to follow the 5-layer architecture:
 * Layer 1: Types
 * Layer 2: Services
 * Layer 3: Hooks & Utils
 * Layer 5: Pages
 *
 * Usage: node generate-5-layer.js <entity-name> [options]
 * Example: node generate-5-layer.js courses
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logSection(message) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(message, 'bright');
  log(`${'='.repeat(60)}`, 'cyan');
}

// Parse command line arguments
const args = process.argv.slice(2);
const entityName = args[0];
const options = {
  withHook: args.includes('--with-hook'),
  withValidation: args.includes('--with-validation'),
  withExport: args.includes('--with-export'),
  force: args.includes('--force'),
  dryRun: args.includes('--dry-run'),
};

if (!entityName) {
  logError('Please provide an entity name');
  console.log('\nUsage: node generate-5-layer.js <entity-name> [options]');
  console.log('\nOptions:');
  console.log('  --with-hook         Generate custom hook');
  console.log('  --with-validation   Generate validation utilities');
  console.log('  --with-export       Generate export/import utilities');
  console.log('  --force             Overwrite existing files');
  console.log('  --dry-run           Show what would be created without creating files');
  console.log('\nExample:');
  console.log('  node generate-5-layer.js courses --with-hook --with-validation');
  process.exit(1);
}

// Convert entity name to different cases
const entityNameLower = entityName.toLowerCase();
const entityNamePascal = entityName.charAt(0).toUpperCase() + entityName.slice(1);
const entityNameCamel = entityName.charAt(0).toLowerCase() + entityName.slice(1);

logSection(`🚀 5-Layer Architecture Generator for "${entityNamePascal}"`);

// Define file paths
const rootDir = path.join(__dirname, '..', '..');
const typesFile = path.join(rootDir, 'types', `${entityNameLower}.ts`);
const servicesFile = path.join(rootDir, 'services', `${entityNameLower}-service.ts`);
const hookFile = path.join(rootDir, 'hooks', `use-${entityNameLower}.ts`);
const validationFile = path.join(rootDir, 'lib', 'utils', entityNameLower, 'validation.ts');
const exportImportFile = path.join(rootDir, 'lib', 'utils', entityNameLower, 'export-import.ts');

// Create directories if they don't exist
function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logInfo(`Created directory: ${dir}`);
  }
}

// Check if file exists
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

// Generate Layer 1: Types
function generateTypes() {
  logSection('Layer 1: Types');

  const content = `// ${entityNamePascal} type definitions
export interface ${entityNamePascal} {
	id: string
	// TODO: Add fields based on your database schema
	created_at: string
	updated_at?: string
	is_active: boolean
}

export interface ${entityNamePascal}FormData extends Omit<${entityNamePascal}, 'id' | 'created_at' | 'updated_at'> {}

export interface ${entityNamePascal}ImportError {
	row: number
	// TODO: Add identifying fields (e.g., code, name)
	errors: string[]
}

export interface UploadSummary {
	total: number
	success: number
	failed: number
}
`;

  if (fileExists(typesFile) && !options.force) {
    logWarning(`Types file already exists: ${typesFile}`);
    logInfo('Use --force to overwrite');
    return false;
  }

  if (!options.dryRun) {
    ensureDirectoryExists(typesFile);
    fs.writeFileSync(typesFile, content);
    logSuccess(`Created types: ${typesFile}`);
  } else {
    logInfo(`[DRY RUN] Would create: ${typesFile}`);
  }
  return true;
}

// Generate Layer 2: Services
function generateServices() {
  logSection('Layer 2: Services');

  const content = `import type { ${entityNamePascal}, ${entityNamePascal}FormData } from '@/types/${entityNameLower}'

// Fetch all ${entityNameLower}
export async function fetch${entityNamePascal}s(): Promise<${entityNamePascal}[]> {
	const response = await fetch('/api/${entityNameLower}')
	if (!response.ok) {
		throw new Error('Failed to fetch ${entityNameLower}')
	}
	return response.json()
}

// Create new ${entityNameLower}
export async function create${entityNamePascal}(data: ${entityNamePascal}FormData): Promise<${entityNamePascal}> {
	const response = await fetch('/api/${entityNameLower}', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to create ${entityNameLower}')
	}

	return response.json()
}

// Update existing ${entityNameLower}
export async function update${entityNamePascal}(id: string, data: ${entityNamePascal}FormData): Promise<${entityNamePascal}> {
	const response = await fetch(\`/api/${entityNameLower}/\${id}\`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to update ${entityNameLower}')
	}

	return response.json()
}

// Delete ${entityNameLower}
export async function delete${entityNamePascal}(id: string): Promise<void> {
	const response = await fetch(\`/api/${entityNameLower}/\${id}\`, {
		method: 'DELETE',
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to delete ${entityNameLower}')
	}
}
`;

  if (fileExists(servicesFile) && !options.force) {
    logWarning(`Services file already exists: ${servicesFile}`);
    logInfo('Use --force to overwrite');
    return false;
  }

  if (!options.dryRun) {
    ensureDirectoryExists(servicesFile);
    fs.writeFileSync(servicesFile, content);
    logSuccess(`Created services: ${servicesFile}`);
  } else {
    logInfo(`[DRY RUN] Would create: ${servicesFile}`);
  }
  return true;
}

// Generate Layer 3: Custom Hook
function generateHook() {
  if (!options.withHook) {
    logInfo('Skipping hook generation (use --with-hook to generate)');
    return false;
  }

  logSection('Layer 3: Custom Hook');

  const content = `import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import type { ${entityNamePascal}, ${entityNamePascal}FormData } from '@/types/${entityNameLower}'
import {
	fetch${entityNamePascal}s as fetch${entityNamePascal}sService,
	create${entityNamePascal},
	update${entityNamePascal},
	delete${entityNamePascal}
} from '@/services/${entityNameLower}-service'

export function use${entityNamePascal}s() {
	const { toast } = useToast()
	const [${entityNameCamel}s, set${entityNamePascal}s] = useState<${entityNamePascal}[]>([])
	const [loading, setLoading] = useState(true)

	// Fetch ${entityNameLower}
	const fetch${entityNamePascal}s = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetch${entityNamePascal}sService()
			set${entityNamePascal}s(data)
		} catch (error) {
			console.error('Error fetching ${entityNameLower}:', error)
			toast({
				title: '❌ Fetch Failed',
				description: 'Failed to load ${entityNameLower}.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}, [toast])

	// Refresh ${entityNameLower}
	const refresh${entityNamePascal}s = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetch${entityNamePascal}sService()
			set${entityNamePascal}s(data)
			toast({
				title: '✅ Refreshed',
				description: \`Loaded \${data.length} ${entityNameLower}.\`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error refreshing ${entityNameLower}:', error)
			toast({
				title: '❌ Refresh Failed',
				description: 'Failed to load ${entityNameLower}.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}, [toast])

	// Save ${entityNameLower} (create or update)
	const save${entityNamePascal} = useCallback(async (data: ${entityNamePascal}FormData, editing: ${entityNamePascal} | null) => {
		try {
			let saved${entityNamePascal}: ${entityNamePascal}

			if (editing) {
				saved${entityNamePascal} = await update${entityNamePascal}(editing.id, data)
				set${entityNamePascal}s(prev => prev.map(item => item.id === editing.id ? saved${entityNamePascal} : item))
				toast({
					title: '✅ Record Updated',
					description: 'Record has been updated successfully.',
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			} else {
				saved${entityNamePascal} = await create${entityNamePascal}(data)
				set${entityNamePascal}s(prev => [saved${entityNamePascal}, ...prev])
				toast({
					title: '✅ Record Created',
					description: 'Record has been created successfully.',
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			}

			return saved${entityNamePascal}
		} catch (error) {
			console.error('Save ${entityNameLower} error:', error)
			toast({
				title: '❌ Operation Failed',
				description: error instanceof Error ? error.message : 'Failed to save record.',
				variant: 'destructive'
			})
			throw error
		}
	}, [toast])

	// Remove ${entityNameLower}
	const remove${entityNamePascal} = useCallback(async (id: string) => {
		try {
			await delete${entityNamePascal}(id)
			set${entityNamePascal}s(prev => prev.filter(item => item.id !== id))
			toast({
				title: '✅ Record Deleted',
				description: 'Record has been removed.',
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error deleting ${entityNameLower}:', error)
			toast({
				title: '❌ Delete Failed',
				description: 'Failed to delete record.',
				variant: 'destructive'
			})
			throw error
		}
	}, [toast])

	// Load ${entityNameLower} on mount
	useEffect(() => {
		fetch${entityNamePascal}s()
	}, [fetch${entityNamePascal}s])

	return {
		${entityNameCamel}s,
		loading,
		setLoading,
		fetch${entityNamePascal}s,
		refresh${entityNamePascal}s,
		save${entityNamePascal},
		remove${entityNamePascal},
	}
}
`;

  if (fileExists(hookFile) && !options.force) {
    logWarning(`Hook file already exists: ${hookFile}`);
    logInfo('Use --force to overwrite');
    return false;
  }

  if (!options.dryRun) {
    ensureDirectoryExists(hookFile);
    fs.writeFileSync(hookFile, content);
    logSuccess(`Created hook: ${hookFile}`);
  } else {
    logInfo(`[DRY RUN] Would create: ${hookFile}`);
  }
  return true;
}

// Generate Layer 3: Validation Utils
function generateValidation() {
  if (!options.withValidation) {
    logInfo('Skipping validation generation (use --with-validation to generate)');
    return false;
  }

  logSection('Layer 3: Validation Utilities');

  const content = `export function validate${entityNamePascal}Data(data: any): Record<string, string> {
	const errors: Record<string, string> = {}

	// TODO: Add validation rules based on your requirements
	// Example:
	// if (!data.name?.trim()) errors.name = "Name is required"
	// if (!data.code?.trim()) errors.code = "Code is required"

	// Email validation example
	// if (data.email && data.email.trim()) {
	//   const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/
	//   if (!emailRegex.test(data.email)) {
	//     errors.email = "Invalid email format"
	//   }
	// }

	return errors
}

export function validate${entityNamePascal}Import(data: any, rowIndex: number): string[] {
	const errors: string[] = []

	// TODO: Add import validation rules
	// Example:
	// if (!data.name || data.name.toString().trim() === '') {
	//   errors.push('Name is required')
	// }

	return errors
}
`;

  if (fileExists(validationFile) && !options.force) {
    logWarning(`Validation file already exists: ${validationFile}`);
    logInfo('Use --force to overwrite');
    return false;
  }

  if (!options.dryRun) {
    ensureDirectoryExists(validationFile);
    fs.writeFileSync(validationFile, content);
    logSuccess(`Created validation: ${validationFile}`);
  } else {
    logInfo(`[DRY RUN] Would create: ${validationFile}`);
  }
  return true;
}

// Generate Layer 3: Export/Import Utils
function generateExportImport() {
  if (!options.withExport) {
    logInfo('Skipping export/import generation (use --with-export to generate)');
    return false;
  }

  logSection('Layer 3: Export/Import Utilities');

  const content = `import * as XLSX from 'xlsx'
import type { ${entityNamePascal} } from '@/types/${entityNameLower}'

// Export to JSON
export function exportToJSON(items: ${entityNamePascal}[]): void {
	const exportData = items.map(item => ({
		// TODO: Map fields for export
		...item
	}))

	const json = JSON.stringify(exportData, null, 2)
	const blob = new Blob([json], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = \`${entityNameLower}_\${new Date().toISOString().split('T')[0]}.json\`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

// Export to Excel
export function exportToExcel(items: ${entityNamePascal}[]): void {
	const excelData = items.map((item) => ({
		// TODO: Map fields for Excel export with readable column names
		'ID': item.id,
		'Created': new Date(item.created_at).toISOString().split('T')[0],
		'Status': item.is_active ? 'Active' : 'Inactive',
		// Add more fields...
	}))

	const ws = XLSX.utils.json_to_sheet(excelData)

	// Set column widths
	const colWidths = [
		{ wch: 20 }, // ID
		{ wch: 12 }, // Created
		{ wch: 10 }, // Status
		// Add more widths...
	]
	ws['!cols'] = colWidths

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, '${entityNamePascal}s')
	XLSX.writeFile(wb, \`${entityNameLower}_export_\${new Date().toISOString().split('T')[0]}.xlsx\`)
}

// Export template
export function exportTemplate(): void {
	const sample = [{
		// TODO: Add sample data for template
		'Field 1': 'Sample value',
		'Field 2': 'Sample value',
		// Add more fields...
	}]

	const ws = XLSX.utils.json_to_sheet(sample)

	// Set column widths
	const colWidths = [
		{ wch: 20 },
		{ wch: 20 },
		// Add more widths...
	]
	ws['!cols'] = colWidths

	// Style header row
	const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
	const mandatoryFields = ['Field 1'] // TODO: List mandatory fields

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
	XLSX.writeFile(wb, \`${entityNameLower}_template_\${new Date().toISOString().split('T')[0]}.xlsx\`)
}
`;

  if (fileExists(exportImportFile) && !options.force) {
    logWarning(`Export/import file already exists: ${exportImportFile}`);
    logInfo('Use --force to overwrite');
    return false;
  }

  if (!options.dryRun) {
    ensureDirectoryExists(exportImportFile);
    fs.writeFileSync(exportImportFile, content);
    logSuccess(`Created export/import: ${exportImportFile}`);
  } else {
    logInfo(`[DRY RUN] Would create: ${exportImportFile}`);
  }
  return true;
}

// Generate summary
function generateSummary() {
  logSection('📊 Summary');

  const filesCreated = [];
  if (fileExists(typesFile) || options.dryRun) filesCreated.push('types/' + path.basename(typesFile));
  if (fileExists(servicesFile) || options.dryRun) filesCreated.push('services/' + path.basename(servicesFile));
  if (options.withHook && (fileExists(hookFile) || options.dryRun)) filesCreated.push('hooks/' + path.basename(hookFile));
  if (options.withValidation && (fileExists(validationFile) || options.dryRun)) filesCreated.push('lib/utils/' + entityNameLower + '/validation.ts');
  if (options.withExport && (fileExists(exportImportFile) || options.dryRun)) filesCreated.push('lib/utils/' + entityNameLower + '/export-import.ts');

  log('\n📁 Files created:');
  filesCreated.forEach(file => log(`  ✓ ${file}`, 'green'));

  log('\n📝 Next steps:');
  log('  1. Review and update the generated type definitions');
  log('  2. Implement validation rules if generated');
  log('  3. Customize export/import field mappings if generated');
  log('  4. Update your page.tsx to use the generated modules:');
  log('');
  log(`     import type { ${entityNamePascal} } from '@/types/${entityNameLower}'`, 'cyan');
  log(`     import { fetch${entityNamePascal}s, create${entityNamePascal}, ... } from '@/services/${entityNameLower}-service'`, 'cyan');
  if (options.withHook) {
    log(`     import { use${entityNamePascal}s } from '@/hooks/use-${entityNameLower}'`, 'cyan');
  }
  log('');

  if (options.dryRun) {
    logWarning('DRY RUN MODE - No files were actually created');
    logInfo('Run without --dry-run to create the files');
  }
}

// Main execution
function main() {
  try {
    generateTypes();
    generateServices();
    generateHook();
    generateValidation();
    generateExportImport();
    generateSummary();

    if (!options.dryRun) {
      logSuccess('\n🎉 5-layer architecture generated successfully!');
    }
  } catch (error) {
    logError(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
