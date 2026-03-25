const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

async function setupRegulationsTable() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables:')
    console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing')
    console.error('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing')
    console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    console.log('🔍 Checking if regulations table exists...')
    
    // Check if regulations table exists
    const { data, error } = await supabase
      .from('regulations')
      .select('count')
      .limit(1)

    if (error) {
      if (error.message.includes('relation "regulations" does not exist')) {
        console.log('📋 Regulations table does not exist, creating it...')
        
        // Read the migration file
        const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250102_create_regulations_table.sql')
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
        
        console.log('📝 Please run the following SQL in your Supabase SQL Editor:')
        console.log('🔗 Go to: https://supabase.com/dashboard/project/ndnulujelcnnnhydfyum/sql')
        console.log('\n' + '='.repeat(80))
        console.log(migrationSQL)
        console.log('='.repeat(80))
        
        console.log('\n✅ After running the SQL above, the regulations table will be created and ready to use.')
        console.log('🔄 You can then try creating regulations again in the application.')
        
      } else {
        console.error('❌ Database error:', error)
        process.exit(1)
      }
    } else {
      console.log('✅ Regulations table already exists!')
      console.log(`📊 Current regulations count: ${data.length > 0 ? data[0].count : 0}`)
    }

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

// Run the setup
setupRegulationsTable()
