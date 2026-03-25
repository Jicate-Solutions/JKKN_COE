// Describe Table Schema
// This script shows detailed schema information for a specific table

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

async function describeTable(tableName) {
  if (!tableName) {
    console.log('❌ Please provide a table name')
    console.log('\nUsage: node scripts/describe-table.js <table_name>')
    console.log('\nExamples:')
    console.log('  node scripts/describe-table.js institutions')
    console.log('  node scripts/describe-table.js students')
    console.log('  node scripts/describe-table.js courses')
    process.exit(1)
  }

  console.log(`📋 Describing table: ${tableName}\n`)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  try {
    // Get count
    const { count, error: countError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.log(`❌ Table "${tableName}" not found or not accessible`)
      console.log(`   Error: ${countError.message}`)
      process.exit(1)
    }

    // Get sample record
    const { data: sample, error: sampleError } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)

    if (sampleError) {
      console.log(`❌ Error fetching sample: ${sampleError.message}`)
      process.exit(1)
    }

    console.log('═'.repeat(80))
    console.log(`TABLE: ${tableName}`)
    console.log('═'.repeat(80))
    console.log(`Records: ${count?.toLocaleString() || 0}`)
    console.log(`Columns: ${sample && sample.length > 0 ? Object.keys(sample[0]).length : 0}`)
    console.log('═'.repeat(80))

    if (sample && sample.length > 0) {
      const columns = Object.keys(sample[0])
      const sampleData = sample[0]

      console.log('\n📝 COLUMNS:\n')
      console.log('COLUMN NAME                       TYPE              SAMPLE VALUE')
      console.log('─'.repeat(80))

      columns.forEach(col => {
        const value = sampleData[col]
        const type = typeof value === 'object' && value !== null
          ? 'object'
          : typeof value === 'number'
            ? (Number.isInteger(value) ? 'integer' : 'float')
            : typeof value === 'boolean'
              ? 'boolean'
              : typeof value === 'string'
                ? (value.match(/^\d{4}-\d{2}-\d{2}/) ? 'date/timestamp' : 'string')
                : 'null'

        let sampleValue = value === null
          ? 'NULL'
          : typeof value === 'object'
            ? JSON.stringify(value).substring(0, 30) + '...'
            : String(value).substring(0, 30)

        const colName = col.padEnd(34)
        const colType = type.padEnd(18)

        console.log(`${colName}${colType}${sampleValue}`)
      })

      console.log('\n' + '═'.repeat(80))

      // Show full sample record
      console.log('\n📊 SAMPLE RECORD:\n')
      console.log(JSON.stringify(sampleData, null, 2))
      console.log('\n' + '═'.repeat(80))
    } else {
      console.log('\n⚠️  No records found in this table (empty table)')
    }

    // Show more records if available
    if (count && count > 1) {
      console.log(`\n💡 This table has ${count.toLocaleString()} records`)
      console.log(`   To see more records, query the table directly:\n`)
      console.log(`   const { data } = await supabase.from('${tableName}').select('*').limit(10)`)
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Get table name from command line argument
const tableName = process.argv[2]
describeTable(tableName)
