const fs = require('fs')

const envFile = fs.readFileSync('.env.local', 'utf8')
let supabaseUrl = ''
let supabaseKey = ''

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim()
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) supabaseKey = line.split('=')[1].trim()
})

const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
  'Content-Type': 'application/json'
}

async function main() {
  const resContacts = await fetch(`${supabaseUrl}/rest/v1/contacts?nombre=ilike.*Javier Ruiz*&select=id,nombre,tenant_id,channel_id`, { headers })
  const contacts = await resContacts.json()
  console.log("Contactos Javier Ruiz (con channel_id):", contacts)
}

main()
