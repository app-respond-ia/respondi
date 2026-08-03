import ws from 'ws'

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/?apikey=' + process.env.SUPABASE_SERVICE_ROLE_KEY
  const res = await fetch(url)
  const schema = await res.json()
  
  const rolesDef = schema.definitions.roles_personalizados
  if (rolesDef) {
    console.log('Estructura de roles_personalizados según OpenAPI:')
    console.log(rolesDef.properties)
  } else {
    console.log('No se encontró roles_personalizados en el esquema.')
  }
}

run()
