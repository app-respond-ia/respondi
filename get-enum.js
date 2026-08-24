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
  // Querying using standard fetch since it works perfectly
  try {
    const query = `
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = 'rol_usuario'::regtype;
    `;
    
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({ query })
    });
    const text = await res.text();
    console.log("RPC exec_sql result:", text);
    
  } catch(e) {
    console.error(e);
  }
}
run();
