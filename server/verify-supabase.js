// server/verify-supabase.js
// Quick script to verify Supabase configuration and table existence

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { supabase, verifyTableExists } = require('./supabase');

async function verify() {
  console.log('🔍 Verifying Supabase Configuration...\n');

  // Check environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  console.log('1. Environment Variables:');
  console.log('   SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  console.log('   SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? '✅ Set' : '⚠️  Missing (recommended for backend)');
  console.log('   SUPABASE_ANON_KEY:', anonKey ? '✅ Set' : '⚠️  Missing (alternative)');
  console.log('');

  if (!supabaseUrl) {
    console.error('❌ SUPABASE_URL is required!');
    console.error('   Get it from: Supabase Dashboard → Settings → API → Project URL');
    process.exit(1);
  }

  if (!serviceRoleKey && !anonKey) {
    console.error('❌ Either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is required!');
    console.error('   Get it from: Supabase Dashboard → Settings → API → Project API keys');
    console.error('   Recommended: Use SUPABASE_SERVICE_ROLE_KEY for backend operations');
    process.exit(1);
  }

  // Check Supabase client
  console.log('2. Supabase Client:');
  if (!supabase) {
    console.error('❌ Failed to create Supabase client');
    process.exit(1);
  }
  console.log('   ✅ Supabase client created successfully');
  console.log('');

  // Verify table exists
  console.log('3. Table Verification:');
  const tableCheck = await verifyTableExists('Users');
  if (tableCheck.exists && !tableCheck.isCacheIssue) {
    console.log('   ✅ Users table exists');
  } else if (tableCheck.isCacheIssue) {
    console.warn('   ⚠️  Table exists but schema cache needs refresh');
    console.warn('   This is a common issue after creating tables in Supabase');
    console.log('');
  } else {
    console.error('   ❌ Users table does not exist!');
    console.error('   Error:', tableCheck.error);
    console.error('');
    console.error('   📝 To fix this:');
    console.error('   1. Open your Supabase Dashboard');
    console.error('   2. Go to SQL Editor');
    console.error('   3. Click "New Query"');
    console.error('   4. Copy and paste the SQL from server/supabase-schema.sql');
    console.error('   5. Click "Run" to execute');
    process.exit(1);
  }
  console.log('');

  // Test a simple query
  console.log('4. Database Connection Test:');
  try {
    // Try to query the table - use a simple select without count
    const { data, error } = await supabase
      .from('Users')
      .select('Id')
      .limit(1);

    if (error) {
      console.error('   ❌ Query failed:', error.message);
      console.error('   Error Code:', error.code || 'Unknown');
      console.error('   Error Details:', error.details || 'No details');
      
      if (error.code === 'PGRST116' || error.message.includes('schema cache')) {
        console.error('');
        console.error('   ⚠️  SCHEMA CACHE ISSUE DETECTED!');
        console.error('');
        console.error('   📝 To fix this:');
        console.error('   1. Go to Supabase Dashboard → Settings → API');
        console.error('   2. Scroll down to "Schema" section');
        console.error('   3. Click "Reload schema" or "Refresh schema cache"');
        console.error('   OR');
        console.error('   4. Go to Database → Tables → Click on "users" table');
        console.error('   5. In the table editor, click the "..." menu → "API Settings"');
        console.error('   6. Make sure the table is exposed to the API');
        console.error('   OR');
        console.error('   7. Wait 30-60 seconds and try again (auto-refresh)');
        console.error('   OR');
        console.error('   8. Run this SQL in SQL Editor to refresh PostgREST:');
        console.error('      SELECT pg_notify(\'pgrst\', \'reload schema\');');
        console.error('');
        console.error('   If the issue persists, verify the table exists:');
        console.error('   - Go to Table Editor and check if "users" table is visible');
        console.error('   - Make sure table is in the "public" schema');
      }
      process.exit(1);
    }
    console.log('   ✅ Database connection successful');
    console.log('   ✅ Table is accessible via PostgREST API');
  } catch (err) {
    console.error('   ❌ Connection error:', err.message);
    process.exit(1);
  }
  console.log('');

  console.log('✅ All checks passed! Supabase is configured correctly.');
  console.log('');
  console.log('You can now:');
  console.log('  1. Start your server: npm start');
  console.log('  2. Test signup/login endpoints');
}

verify().catch(err => {
  console.error('❌ Verification failed:', err.message);
  process.exit(1);
});

