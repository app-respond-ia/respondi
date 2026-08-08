const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      messages (
        texto
      )
    `)
    .order('timestamp', { foreignTable: 'messages', ascending: false })
    .limit(1, { foreignTable: 'messages' });

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Success:', data.length);
  }
}
test();
