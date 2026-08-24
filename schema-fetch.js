const fs = require('fs');

function loadEnv() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}
loadEnv();

async function run() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_SERVICE_ROLE_KEY}`);
    const data = await res.json();
    
    const targetTables = ['organizaciones', 'vendedores', 'comisiones', 'billing', 'message_quotas', 'support_tickets', 'support_ticket_messages', 'client_tickets', 'client_ticket_messages', 'client_ticket_notas', 'cases', 'case_notes', 'conversations', 'messages', 'users', 'roles_personalizados', 'audit_log', 'ai_logs', 'error_logs', 'notifications'];
    
    const result = {};
    for (const table of targetTables) {
      if (data.definitions && data.definitions[table]) {
        result[table] = Object.keys(data.definitions[table].properties);
      } else {
        result[table] = null;
      }
    }
    
    fs.writeFileSync('schema-results.json', JSON.stringify(result, null, 2));
    console.log('Schema dumped to schema-results.json');
  } catch(e) {
    console.error('Error fetching schema:', e);
  }
}
run();
