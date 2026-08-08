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
  console.log("Conectando a Supabase via REST API...")
  
  // 1. Buscar contacto Javier Ruiz
  const resContacts = await fetch(`${supabaseUrl}/rest/v1/contacts?nombre=ilike.*Javier Ruiz*&select=id,nombre,tenant_id`, { headers })
  const contacts = await resContacts.json()
  
  console.log("Contactos Javier Ruiz:", contacts)
  if (!Array.isArray(contacts) || contacts.length === 0) return

  // 2. Buscar conversaciones
  const contactIds = contacts.map(c => c.id).join(',')
  const resConvs = await fetch(`${supabaseUrl}/rest/v1/conversations?contact_id=in.(${contactIds})&select=id,tenant_id,branch_id,channel_id`, { headers })
  const convs = await resConvs.json()
  
  console.log("Conversaciones de Javier Ruiz:", convs)

  // 3. Revisar usuarios de prueba
  const resUsers = await fetch(`${supabaseUrl}/rest/v1/users?select=id,email,tenant_id,branch_id,rol&limit=3`, { headers })
  const users = await resUsers.json()
  
  console.log("Usuarios (muestra de 3):", users)
}

main()
