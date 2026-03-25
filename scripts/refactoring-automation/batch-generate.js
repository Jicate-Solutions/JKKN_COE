#!/usr/bin/env node

/**
 * Batch 5-Layer Architecture Generator
 *
 * Generates 5-layer structure for multiple entities at once
 *
 * Usage: node batch-generate.js
 */

const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(message) {
  log(`\n${'='.repeat(70)}`, 'cyan');
  log(message, 'bright');
  log(`${'='.repeat(70)}`, 'cyan');
}

// Configuration: List of entities to generate
const entities = [
  { name: 'exam-rooms', options: '--with-hook --with-validation --with-export' },
  { name: 'exam-registrations', options: '--with-hook --with-validation --with-export' },
  { name: 'exam-types', options: '--with-hook --with-validation --with-export' },
  { name: 'examination-sessions', options: '--with-hook --with-validation --with-export' },
  { name: 'exam-attendance', options: '--with-hook --with-validation --with-export' },
  { name: 'batch', options: '--with-hook --with-validation --with-export' },
  { name: 'board', options: '--with-hook --with-validation --with-export' },
  { name: 'program', options: '--with-hook --with-validation --with-export' },
  { name: 'department', options: '--with-hook --with-validation --with-export' },
  { name: 'degree', options: '--with-hook --with-validation --with-export' },
  { name: 'semester', options: '--with-hook --with-validation --with-export' },
  { name: 'section', options: '--with-hook --with-validation --with-export' },
  { name: 'academic-years', options: '--with-hook --with-validation --with-export' },
  { name: 'grade-system', options: '--with-hook --with-validation --with-export' },
  { name: 'grades', options: '--with-hook --with-validation --with-export' },
];

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

logSection('📦 Batch 5-Layer Architecture Generator');

if (dryRun) {
  log('\n🔍 DRY RUN MODE - No files will be created\n', 'blue');
}

log(`\nProcessing ${entities.length} entities...\n`);

let successCount = 0;
let failCount = 0;
const results = [];

entities.forEach((entity, index) => {
  logSection(`[${index + 1}/${entities.length}] Processing: ${entity.name}`);

  try {
    const command = `node generate-5-layer.js ${entity.name} ${entity.options}${dryRun ? ' --dry-run' : ''}${force ? ' --force' : ''}`;
    log(`\nCommand: ${command}`, 'blue');

    execSync(command, { stdio: 'inherit' });

    successCount++;
    results.push({ entity: entity.name, status: 'success' });
    log(`\n✅ Completed: ${entity.name}`, 'green');
  } catch (error) {
    failCount++;
    results.push({ entity: entity.name, status: 'failed' });
    log(`\n❌ Failed: ${entity.name}`, 'red');
  }
});

// Summary
logSection('📊 Batch Generation Summary');

log(`\n✅ Successful: ${successCount}`, 'green');
if (failCount > 0) {
  log(`❌ Failed: ${failCount}`, 'red');
}

log('\n📋 Detailed Results:\n');
results.forEach(result => {
  const icon = result.status === 'success' ? '✅' : '❌';
  const color = result.status === 'success' ? 'green' : 'red';
  log(`  ${icon} ${result.entity}`, color);
});

if (dryRun) {
  log('\n🔍 DRY RUN COMPLETE - No files were created', 'blue');
  log('Run without --dry-run to actually create the files\n');
} else {
  log('\n🎉 Batch generation complete!\n', 'green');
}

log('Next steps:');
log('  1. Review generated files in types/, services/, hooks/, and lib/utils/');
log('  2. Update type definitions with actual database fields');
log('  3. Customize validation rules and export mappings');
log('  4. Update page.tsx files to use the generated modules\n');
