import { createClient } from '@supabase/supabase-js'

// Load environment variables
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('=== Step 1: Get CAS Institution from COE ===')

  const { data: institution, error: instError } = await supabase
    .from('institutions')
    .select('id, institution_code, name, counselling_code, myjkkn_institution_ids')
    .eq('institution_code', 'CAS')
    .single()

  if (instError) {
    console.error('Error fetching institution:', instError)
    return
  }

  console.log('Institution:', JSON.stringify(institution, null, 2))

  const counsellingCode = institution.counselling_code
  const myjkknIds = institution.myjkkn_institution_ids || []

  console.log('\nCounselling Code:', counsellingCode)
  console.log('MyJKKN Institution IDs:', myjkknIds)

  if (myjkknIds.length === 0) {
    console.log('\n⚠️  No myjkkn_institution_ids set for CAS')
    console.log('Programs cannot be fetched without MyJKKN institution mapping')
    return
  }

  console.log('\n=== Step 2: Fetch Programs from MyJKKN API ===')

  // MyJKKN API base URL and key
  const myjkknBaseUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
  const apiKey = process.env.MYJKKN_API_KEY

  if (!apiKey) {
    console.error('❌ MYJKKN_API_KEY not set in environment')
    return
  }

  const allPrograms = []
  const seenCodes = new Set()

  for (const instId of myjkknIds) {
    console.log(`\nFetching programs for institution_id: ${instId}`)

    try {
      // Correct endpoint: /api-management/organizations/programs
      const url = `${myjkknBaseUrl}/api-management/organizations/programs?institution_id=${instId}&is_active=true&limit=100`
      console.log('URL:', url)

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      })

      if (!response.ok) {
        const text = await response.text()
        console.error('API Error:', response.status, response.statusText, text.slice(0, 200))
        continue
      }

      const result = await response.json()
      const programs = result.data || result || []

      console.log(`Found ${programs.length} programs for this institution:`)

      // Client-side filter by institution_id and deduplicate
      const filtered = programs.filter(p => p.institution_id === instId)
      console.log(`After filtering by institution_id: ${filtered.length} programs`)

      filtered.forEach((p, i) => {
        const code = p.program_id || p.program_code
        const name = p.program_name || p.name
        const isDupe = seenCodes.has(code)

        if (!isDupe) {
          seenCodes.add(code)
          allPrograms.push(p)
        }

        if (i < 15) {
          console.log(`  ${i+1}. ${code} - ${name} ${isDupe ? '(DUPLICATE)' : ''}`)
        }
      })

      if (filtered.length > 15) {
        console.log(`  ... and ${filtered.length - 15} more`)
      }
    } catch (err) {
      console.error('Fetch error:', err.message)
    }
  }

  console.log('\n=== Final Result ===')
  console.log(`Total unique programs for CAS: ${allPrograms.length}`)
  console.log('\nProgram List:')
  allPrograms.forEach((p, i) => {
    console.log(`  ${i+1}. ${p.program_id || p.program_code} - ${p.program_name || p.name}`)
  })
}

main().catch(console.error)
