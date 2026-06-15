require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const url = `${supabaseUrl}/rest/v1/plans?select=id,nombre,usuarios_max,sucursales_max`;
  const res = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    console.error(await res.text());
  } else {
    console.log(await res.json());
  }
}
main();
