// Supabase devuelve de vez en cuando un 504 (tarda 5-7 s y se rinde) en la
// primera petición de un proceso que arranca justo al empezar el minuto,
// cuando saltan a la vez los crons. Visto en producción el 11-09-2026: unos 2
// por hora, y dejó un buzón de correo marcado con error sin motivo. Las
// lecturas se repiten una vez; las escrituras no, porque podrían quedar
// hechas dos veces.

// Funciones de la base de datos que solo leen (se pueden repetir sin riesgo)
const RPC_DE_LECTURA = new Set(['leer_credenciales_canal'])

function esRepetible(input: RequestInfo | URL, init?: RequestInit) {
  const metodo = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (metodo === 'GET' || metodo === 'HEAD') return true
  if (metodo !== 'POST') return false
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const rpc = new URL(url).pathname.match(/\/rest\/v1\/rpc\/([^/]+)$/)
  return !!rpc && RPC_DE_LECTURA.has(rpc[1])
}

export async function fetchConReintento(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!esRepetible(input, init)) return fetch(input, init)
  try {
    const r = await fetch(input, init)
    if (![502, 503, 504].includes(r.status)) return r
    await r.body?.cancel().catch(() => {})
  } catch (e) {
    // Si lo ha cancelado quien lo pidió, no se repite
    if (init?.signal?.aborted) throw e
  }
  await new Promise(res => setTimeout(res, 400))
  return fetch(input, init)
}
