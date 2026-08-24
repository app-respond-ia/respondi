const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function loadEnv() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  });
}
loadEnv();

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Get sample rows
  const { data: roles } = await supabase.from('roles_personalizados').select('*').limit(3);
  console.log("=== ROLES SAMPLES ===");
  console.log(JSON.stringify(roles, null, 2));

  // Try to query information_schema for users.rol enum/check constraint
  const { data: enumInfo } = await supabase.rpc('query_information_schema', {
    // we don't have this RPC, we can just fetch via REST using the pg_type/pg_enum if we could, 
    // but REST API doesn't expose pg_class directly.
  }).catch(() => ({}));
}
run();
