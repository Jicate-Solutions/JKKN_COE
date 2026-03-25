const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use the service role key to bypass RLS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Using Supabase URL:', supabaseUrl);

// Create client with service role to bypass RLS
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const sampleUsers = [
  {
    full_name: 'John Doe',
    email: 'john.doe@jkkn.edu',
    phone: '+91 9876543210',
    is_active: true,
    is_verified: true,
    roles: 'admin',
    location: 'Chennai',
    bio: 'System Administrator at JKKN COE',
  },
  {
    full_name: 'Sarah Johnson',
    email: 'sarah.johnson@jkkn.edu',
    phone: '+91 9876543211',
    is_active: true,
    is_verified: true,
    roles: 'moderator',
    location: 'Coimbatore',
    bio: 'Academic Coordinator',
  },
  {
    full_name: 'Michael Chen',
    email: 'michael.chen@jkkn.edu',
    phone: '+91 9876543212',
    is_active: true,
    is_verified: true,
    roles: 'user',
    location: 'Chennai',
    bio: 'Faculty Member - Computer Science',
  },
  {
    full_name: 'Emily Davis',
    email: 'emily.davis@jkkn.edu',
    phone: '+91 9876543213',
    is_active: false,
    is_verified: true,
    roles: 'user',
    location: 'Madurai',
    bio: 'Faculty Member - Electronics',
  },
  {
    full_name: 'Robert Wilson',
    email: 'robert.wilson@jkkn.edu',
    phone: '+91 9876543214',
    is_active: true,
    is_verified: false,
    roles: 'user',
    location: 'Chennai',
    bio: 'New Faculty Member',
  },
  {
    full_name: 'Lisa Anderson',
    email: 'lisa.anderson@jkkn.edu',
    phone: '+91 9876543215',
    is_active: true,
    is_verified: true,
    roles: 'moderator',
    location: 'Trichy',
    bio: 'Examination Coordinator',
  },
  {
    full_name: 'James Martinez',
    email: 'james.martinez@jkkn.edu',
    phone: '+91 9876543216',
    is_active: true,
    is_verified: true,
    roles: 'user',
    location: 'Salem',
    bio: 'Faculty Member - Mechanical',
  },
  {
    full_name: 'Jennifer Taylor',
    email: 'jennifer.taylor@jkkn.edu',
    phone: '+91 9876543217',
    is_active: true,
    is_verified: true,
    roles: 'admin',
    location: 'Chennai',
    bio: 'Deputy Controller of Examinations',
  },
  {
    full_name: 'William Brown',
    email: 'william.brown@jkkn.edu',
    phone: '+91 9876543218',
    is_active: false,
    is_verified: false,
    roles: 'user',
    location: 'Erode',
    bio: 'Former Faculty',
  },
  {
    full_name: 'Patricia Garcia',
    email: 'patricia.garcia@jkkn.edu',
    phone: '+91 9876543219',
    is_active: true,
    is_verified: true,
    roles: 'user',
    location: 'Chennai',
    bio: 'Faculty Member - Civil Engineering',
  },
  {
    full_name: 'Christopher Lee',
    email: 'chris.lee@jkkn.edu',
    phone: '+91 9876543220',
    is_active: true,
    is_verified: true,
    roles: 'moderator',
    location: 'Coimbatore',
    bio: 'Lab Coordinator',
  },
  {
    full_name: 'Nancy White',
    email: 'nancy.white@jkkn.edu',
    phone: '+91 9876543221',
    is_active: true,
    is_verified: true,
    roles: 'user',
    location: 'Chennai',
    bio: 'Faculty Member - Mathematics',
  },
  {
    full_name: 'Daniel Harris',
    email: 'daniel.harris@jkkn.edu',
    phone: '+91 9876543222',
    is_active: true,
    is_verified: false,
    roles: 'user',
    location: 'Kanchipuram',
    bio: 'Guest Faculty',
  },
  {
    full_name: 'Michelle Clark',
    email: 'michelle.clark@jkkn.edu',
    phone: '+91 9876543223',
    is_active: true,
    is_verified: true,
    roles: 'admin',
    location: 'Chennai',
    bio: 'Controller of Examinations',
  },
  {
    full_name: 'Kevin Lewis',
    email: 'kevin.lewis@jkkn.edu',
    phone: '+91 9876543224',
    is_active: true,
    is_verified: true,
    roles: 'user',
    location: 'Vellore',
    bio: 'Faculty Member - Physics',
  },
];

async function seedUsers() {
  console.log('Starting to seed users...\n');

  // First, check what columns the institutions table has
  const { data: instColumns, error: colError } = await supabase
    .from('institutions')
    .select('*')
    .limit(1);

  console.log('Institution table columns check:', instColumns ? 'Success' : colError);

  // Get institution ID (assuming there's at least one institution)
  const { data: institutions } = await supabase
    .from('institutions')
    .select('id')
    .limit(1);

  let institutionId = randomUUID();

  if (!institutions || institutions.length === 0) {
    console.log('No institutions found. Creating a default institution...');

    // Try to create institution with minimal fields
    const { data: newInst, error: instError } = await supabase
      .from('institutions')
      .insert({
        id: institutionId,
        name: 'JKKN College of Engineering',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (instError) {
      console.error('Error creating institution:', instError);
      console.log('Will try to proceed with a default institution ID');
    } else {
      institutionId = newInst.id;
      console.log('Created institution with ID:', institutionId);
    }
  } else {
    institutionId = institutions[0].id;
    console.log('Using existing institution ID:', institutionId);
  }

  // First, let's try to insert a single test user to check if it works
  console.log('\nTrying to insert a test user first...');

  const testUser = {
    id: randomUUID(),
    full_name: 'Test User',
    email: 'test.user@jkkn.edu',
    username: 'testuser',
    phone: '+91 9999999999',
    is_active: true,
    is_verified: true,
    roles: 'user',
    institution_id: institutionId,
    preferences: {},
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: testData, error: testError } = await supabase
    .from('users')
    .insert(testUser)
    .select();

  if (testError) {
    console.error('Test user insert failed:', testError);

    // Check if this is an RLS issue
    if (testError.message.includes('row-level security')) {
      console.log('\n⚠️  Row Level Security is blocking inserts.');
      console.log('You need to either:');
      console.log('1. Use the proper SERVICE_ROLE_KEY in your .env.local file');
      console.log('2. Or temporarily disable RLS on the users table in Supabase dashboard');
      console.log('3. Or create an RLS policy that allows inserts');

      // Try to use the API endpoint instead
      console.log('\n Trying to use the API endpoint instead...');
      const fetch = require('node-fetch');

      for (const user of sampleUsers.slice(0, 5)) { // Insert first 5 users via API
        const response = await fetch('http://localhost:3001/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...user,
            institution_id: institutionId,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Created user: ${user.full_name}`);
        } else {
          console.error(`❌ Failed to create user ${user.full_name}:`, await response.text());
        }
      }
    }
    return;
  }

  console.log('✅ Test user created successfully!');

  // Now insert all users
  const usersToInsert = sampleUsers.map(user => ({
    id: randomUUID(),
    ...user,
    username: user.email.split('@')[0],
    institution_id: institutionId,
    preferences: {},
    metadata: {
      source: 'seed_script',
      created_date: new Date().toISOString()
    },
    created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }));

  console.log(`\nInserting ${usersToInsert.length} users...`);

  const { data, error } = await supabase
    .from('users')
    .insert(usersToInsert)
    .select();

  if (error) {
    console.error('Error inserting users:', error);
  } else {
    console.log(`✅ Successfully created ${data.length} users!`);
    console.log('\nSample of created users:');
    data.slice(0, 3).forEach(user => {
      console.log(`- ${user.full_name} (${user.email}) - Role: ${user.roles}, Active: ${user.is_active}`);
    });
  }

  // Verify the count
  const { count } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  console.log(`\nTotal users in database now: ${count}`);
}

seedUsers().catch(console.error);