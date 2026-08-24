const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  const fs = require('fs');
  const envFile = fs.readFileSync('.env.local', 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  });
}
loadEnv();

async function run() {
  // Use service role since requireSuperAdmin() works with super_admin RLS 
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const res = await supabase.from('organizaciones').select('estado, fecha_inicio, fecha_vencimiento, plans(precio_usd)');
  if (res.error) console.error("Error:", res.error);
  console.log("Count:", res.data ? res.data.length : 0);
}
run();
