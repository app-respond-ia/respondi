import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { ejecutarPendientes } from '@/lib/automatizaciones/motor'
import { procesarEvento, repasarPedidosRetrasados, tiendasConProgramadas, type TiendaBasica } from '@/lib/tiendas/eventos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// El latido del motor, cada minuto. Hace tres cosas, por orden de urgencia:
//   1. Los avisos de la tienda que se quedaron sin tratar (porque el proceso
//      se cortó, o porque Shopify avisó mientras se desplegaba).
//   2. Las automatizaciones que estaban esperando ("escribe en 2 horas").
//   3. Los repasos programados, solo a su hora.
//
// Todo con un presupuesto de tiempo: si no da tiempo, lo que quede se coge en
// la siguiente vuelta. Nunca se deja el trabajo a medias sin apuntarlo.
const PRESUPUESTO_MS = 25000

export async function POST(req: Request) {
  const auth = req.headers.get('Authorization') || ''
  const secreto = process.env.CRON_INTERNAL_SECRET || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!secreto || token.length !== secreto.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secreto))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const empezar = Date.now()
  const resumen: Record<string, any> = {}

  // 1. Avisos de la tienda sin tratar
  const { data: eventos, error: errEventos } = await supabaseAdmin
    .from('tienda_eventos')
    .select('id, tipo, datos, tiendas:tienda_id(id, tenant_id, branch_id, dominio, moneda, estado)')
    .is('procesado_en', null)
    .order('recibido_en', { ascending: true })
    .limit(25)
  if (errEventos) return NextResponse.json({ error: `No se han podido leer los avisos: ${errEventos.message}` }, { status: 503 })

  let tratados = 0
  for (const evento of eventos || []) {
    if (Date.now() - empezar > PRESUPUESTO_MS) break
    const tienda: any = Array.isArray((evento as any).tiendas) ? (evento as any).tiendas[0] : (evento as any).tiendas
    if (!tienda || tienda.estado === 'desconectado') {
      await supabaseAdmin
        .from('tienda_eventos')
        .update({ procesado_en: new Date().toISOString(), error: 'La tienda ya no está conectada.' })
        .eq('id', (evento as any).id)
      continue
    }
    await procesarEvento((evento as any).id, (evento as any).tipo, (evento as any).datos, tienda as TiendaBasica)
    tratados++
  }
  resumen.avisos = tratados

  // 2. Lo que estaba esperando
  if (Date.now() - empezar < PRESUPUESTO_MS) {
    const r = await ejecutarPendientes(PRESUPUESTO_MS - (Date.now() - empezar))
    resumen.esperando = r
  }

  // 3. Los repasos programados, solo en su hora en punto
  if (Date.now() - empezar < PRESUPUESTO_MS) {
    try {
      resumen.repasos = await repasosProgramados()
    } catch (e: any) {
      await registrarError({
        origen: 'cron',
        descripcion: 'Fallo en los repasos programados de automatizaciones',
        stacktrace: JSON.stringify({ error: e?.message })
      })
    }
  }

  resumen.ms = Date.now() - empezar
  return NextResponse.json(resumen)
}

// Los repasos que no dependen de un aviso de Shopify sino del reloj. Se
// ejecutan en el primer minuto de su hora (en la zona horaria de la sucursal)
// y el freno de "una vez por cosa" evita repetir.
async function repasosProgramados() {
  const hecho: Record<string, number> = {}

  const retrasados = await tiendasConProgramadas('pedido_retrasado')
  for (const { tienda, ajustes } of retrasados) {
    if (!(await esSuHora(tienda.branch_id, 9))) continue
    hecho.pedido_retrasado = (hecho.pedido_retrasado || 0) + await repasarPedidosRetrasados(tienda, Number(ajustes?.dias) || 3)
  }

  return hecho
}

// ¿Son las X en punto en esa sucursal? El cron corre cada minuto, así que se
// deja pasar solo la primera vuelta de esa hora.
async function esSuHora(branchId: string, hora: number) {
  const { data: sucursal } = await supabaseAdmin
    .from('sucursales')
    .select('timezone')
    .eq('id', branchId)
    .maybeSingle()
  const zona = sucursal?.timezone || 'Europe/Madrid'
  try {
    const ahora = new Intl.DateTimeFormat('es-ES', { timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
    const [h, m] = ahora.split(':').map(Number)
    return h === hora && m < 5
  } catch {
    return false
  }
}
