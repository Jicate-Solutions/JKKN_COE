const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

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

  // Get institution ID (assuming there's at least one institution)
  const { data: institutions } = await supabase
    .from('institutions')
    .select('id')
    .limit(1);

  let institutionId = 'default-institution-id';

  if (!institutions || institutions.length === 0) {
    console.log('No institutions found. Creating a default institution...');
    const { data: newInst, error: instError } = await supabase
      .from('institutions')
      .insert({
        id: randomUUID(),
        name: 'JKKN College of Engineering',
        code: 'JKKN-COE',
        address: 'Chennai, Tamil Nadu',
        phone: '+91 44 12345678',
        email: 'info@jkkn.edu',
        website: 'www.jkkn.edu',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (instError) {
      console.error('Error creating institution:', instError);
      institutionId = randomUUID(); // Use a random ID as fallback
    } else {
      institutionId = newInst.id;
      console.log('Created institution with ID:', institutionId);
    }
  } else {
    institutionId = institutions[0].id;
    console.log('Using existing institution ID:', institutionId);
  }

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
    created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(), // Random date within last 30 days
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