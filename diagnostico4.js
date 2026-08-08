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
  const res = await fetch(`${supabaseUrl}/rest/v1/channels?limit=1`, { headers })
  const text = await res.text()
  console.log("Channels:", text)
}

main()
