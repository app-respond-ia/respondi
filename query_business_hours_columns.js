global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const envFile = require('fs').readFileSync('.env.local', 'utf-8');
const env = envFile.split('\n').reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val) acc[key.trim()] = val.join('=').trim().replace(/^['"]|['"]$/g, '');
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('business_hours')
    .select('*')
    .limit(1);
    
  if (error) {
    console.error("Error fetching:", error);
    return;
  }
  
  if (data && data.length > 0) {
    console.log("Columns:", Object.keys(data[0]));
  } else {
    // Insert a dummy row to get columns, then delete it, or just use PostgREST RPC if possible.
    console.log("No data found to infer columns from JS client directly.");
  }
}

main().catch(console.error);
