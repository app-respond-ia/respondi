const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase URL or KEY");
  process.exit(1);
}

const tenantId = 'd665eb91-09eb-451d-93d2-90ad15e05a72';

async function fetchSupabase(table, query = '') {
  const url = `${supabaseUrl}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    console.error(await res.text());
    return null;
  }
  return res.json();
}

async function main() {
  console.log("=== 1. message_categories ===");
  const categories = await fetchSupabase('message_categories', `tenant_id=eq.${tenantId}&select=id,nombre,branch_id`);
  console.log(categories);

  console.log("\n=== 2. sucursales ===");
  const sucursales = await fetchSupabase('sucursales', `tenant_id=eq.${tenantId}&select=id,nombre`);
  console.log(sucursales);

  console.log("\n=== 3. users (jorgito@propulsesystem.com) ===");
  const users = await fetchSupabase('users', `email=eq.jorgito@propulsesystem.com&select=id,branch_id`);
  console.log(users);

  console.log("\n=== 4. price_list ===");
  const priceList = await fetchSupabase('price_list', `tenant_id=eq.${tenantId}&select=id,nombre&limit=2`);
  console.log(priceList);
}

main();
