import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { verificarEvento, aplicarEventoStripe } from '@/lib/stripe'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// La dirección a la que Stripe avisa de cobros, impagos y bajas. Se pega en
// Stripe → Developers → Webhooks y su clave de firma va en
// STRIPE_WEBHOOK_SECRET. Cada aviso se comprueba con la firma y se aplica
// una sola vez (tabla `stripe_eventos`), aunque Stripe lo reenvíe.
export async function POST(req: Request) {
  const cuerpo = await req.text()
  let evento
  try {
    evento = verificarEvento(cuerpo, req.headers.get('stripe-signature'))
  } catch (e: any) {
    return NextResponse.json({ error: `Firma no válida: ${e?.message}` }, { status: 400 })
  }

  const { error: yaVisto } = await supabaseAdmin.from('stripe_eventos').insert({ id: evento.id, tipo: evento.type })
  if (yaVisto) {
    // Clave duplicada: ya se aplicó. Cualquier otro fallo de la base de datos
    // se contesta con error para que Stripe lo reintente
    if (/duplicate|unique|23505/i.test(yaVisto.message)) return NextResponse.json({ ok: true, repetido: true })
    return NextResponse.json({ error: yaVisto.message }, { status: 503 })
  }

  try {
    const resultado = await aplicarEventoStripe(evento)
    return NextResponse.json({ ok: true, resultado })
  } catch (e: any) {
    // Se deja libre el identificador para que el reintento de Stripe lo vuelva a aplicar
    await supabaseAdmin.from('stripe_eventos').delete().eq('id', evento.id)
    await registrarError({ origen: 'app', descripcion: `Fallo al aplicar un aviso de Stripe (${evento.type}); Stripe lo reintentará`, stacktrace: JSON.stringify({ id: evento.id, message: e?.message }) })
    return NextResponse.json({ error: 'Error procesando el aviso' }, { status: 500 })
  }
}
