const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase URL or KEY");
  process.exit(1);
}

const tenantId = 'd665eb91-09eb-451d-93d2-90ad15e05a72';
const agenteId = '2a379741-ca2d-43c1-bc8e-207b4895fc12';
const select = '*,contacts(nombre,canal,identificador_canal),conversation_tags:conversations(conversation_tags(message_categories(nombre,color)))';
const query = `tenant_id=eq.${tenantId}&agente_id=eq.${agenteId}&estatus=in.(pendiente,atendiendo)&select=${select}`;

async function main() {
  const url = `${supabaseUrl}/rest/v1/cases?${query}`;
  console.log("Fetching:", url);
  const res = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    console.error("Error from Supabase:", await res.text());
  } else {
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
    
    // Simulate the JS logic
    const counts = { todos: data.length, pendiente: 0, atendiendo: 0 };
    const processedCases = data.map(c => {
      if (c.estatus === 'pendiente') counts.pendiente++;
      if (c.estatus === 'atendiendo') counts.atendiendo++;

      let tag = null;
      if (c.conversation_tags && c.conversation_tags.conversation_tags) {
        const tagsArray = Array.isArray(c.conversation_tags.conversation_tags) 
          ? c.conversation_tags.conversation_tags 
          : [c.conversation_tags.conversation_tags];
        
        const firstTag = tagsArray[0];
        if (firstTag?.message_categories) {
          tag = firstTag.message_categories;
        }
      }
      return { ...c, primer_tag: tag };
    });
    console.log("\nCounts:", counts);
    if (processedCases.length > 0) {
       console.log("\nFirst processed case tag:", processedCases[0].primer_tag);
    }
  }
}

main();
