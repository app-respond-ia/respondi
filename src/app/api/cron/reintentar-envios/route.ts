import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { enviarMensajeSaliente, MAX_INTENTOS_ENVIO } from '@/lib/canales/salida'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Vuelve a intentar los envíos que fallaron por algo pasajero (Meta caído,
// sin conexión, demasiados mensajes seguidos) y los que se quedaron a medias.
// Lo llama el cron `reintentar-envios-whatsapp` solo cuando hay alguno.
export async function POST(req: Request) {
  const secreto = process.env.CRON_INTERNAL_SECRET
  const cabecera = req.headers.get('Authorization') || ''
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : ''
  if (!secreto || token.length !== secreto.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secreto))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const haceUnMinuto = new Date(Date.now() - 60000).toISOString()
  const haceTres = new Date(Date.now() - 180000).toISOString()
  const { data: pendientes } = await supabaseAdmin
    .from('messages')
    .select('id, intentos_envio, error_envio')
    .or(`and(estado_envio.eq.reintentar,ultimo_intento_envio.lt.${haceUnMinuto}),and(estado_envio.eq.pendiente,ultimo_intento_envio.lt.${haceTres})`)
    .order('ultimo_intento_envio', { ascending: true })
    .limit(50)

  let enviados = 0
  for (const m of pendientes || []) {
    if ((m.intentos_envio || 0) >= MAX_INTENTOS_ENVIO) {
      await supabaseAdmin.from('messages').update({
        estado_envio: 'fallido',
        error_envio: `No se ha podido enviar tras ${m.intentos_envio} intentos${m.error_envio ? `: ${m.error_envio}` : ''}`
      }).eq('id', m.id)
      continue
    }
    const r = await enviarMensajeSaliente(m.id)
    if (r.estado === 'enviado') enviados++
  }

  return NextResponse.json({ revisados: pendientes?.length || 0, enviados })
}
