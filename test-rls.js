const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

async function main() {
  const email = 'jorgito@propulsesystem.com';
  const password = process.argv[2];

  if (!password) {
    console.error("Por favor provee la contraseña como argumento: node --env-file=.env.local test-rls.js <contraseña>");
    process.exit(1);
  }

  console.log(`Intentando iniciar sesión con ${email}...`);
  
  // Login to get access token
  const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  if (!authRes.ok) {
    const errorText = await authRes.text();
    console.error("Error al iniciar sesión:", errorText);
    process.exit(1);
  }

  const authData = await authRes.json();
  const accessToken = authData.access_token;
  
  console.log("Sesión iniciada correctamente como:", authData.user.id);

  // Consulta idéntica a la de la action
  console.log("Ejecutando consulta de casos...");
  
  const select = '*,contacts(nombre,canal,identificador_canal),conversation_tags:conversations(conversation_tags(message_categories(nombre,color)))';
  const query = `estatus=in.(pendiente,atendiendo)&order=fecha_apertura.asc&select=${select}`;
  
  const casesRes = await fetch(`${supabaseUrl}/rest/v1/cases?${query}`, {
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!casesRes.ok) {
    const errorText = await casesRes.text();
    console.error("Error en la consulta RLS:", errorText);
    process.exit(1);
  }

  const casesData = await casesRes.json();

  console.log(`\n=== RESULTADO (Total: ${casesData.length}) ===\n`);
  
  if (casesData.length > 0) {
    console.log(JSON.stringify(casesData, null, 2));
    
    console.log("\nRevisando campo conversation_tags del primer caso:");
    console.log(JSON.stringify(casesData[0].conversation_tags, null, 2));
  } else {
    console.log("No se encontraron casos bajo las reglas RLS de este usuario.");
  }
}

main();
