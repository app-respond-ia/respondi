const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/error_logs?select=*&order=id.desc&limit=5';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

fetch(url, {
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  }
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
