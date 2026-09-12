import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { ejecutarPendientes } from '@/lib/automatizaciones/motor'
import { procesarEvento, repasarPedidosRetrasados, repasarCarritosAbandonados, repasarStockBajo, repasarResumenDiario, repasarClientesEsperando, repasarAniversarios, repasarClientesDormidos, repasarRecompras, repasarGarantias, tiendasConProgramadas, sucursalesConProgramada, lanzarPropiasProgramadas, type TiendaBasica } from '@/lib/tiendas/eventos'
import { lanzarAutomatizacion } from '@/lib/automatizaciones/motor'
import { repasarVueltaStock, repasarBajadasDePrecio } from '@/lib/tiendas/intereses'
import { repasarRecordatoriosCitas, repasarConfirmacionesCitas, repasarClientesSinCita, repasarCortesia, restaurantesActivos } from '@/lib/agenda/repasos'

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
  // Con la clave del cron se puede pedir un repaso ahora mismo, sin esperar a
  // su hora: { "forzar": ["carrito_abandonado"] }. Lo usan las pruebas.
  const cuerpo: any = await req.json().catch(() => ({}))
  const forzar = new Set<string>(Array.isArray(cuerpo?.forzar) ? cuerpo.forzar.map(String) : [])

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
      resumen.repasos = await repasosProgramados(forzar)
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
async function repasosProgramados(forzar: Set<string>) {
  const hecho: Record<string, number> = {}
  const primerMinutoDeHora = new Date().getMinutes() < 5

  // Cada día a las 9: pedidos pagados que siguen sin salir
  for (const { tienda, ajustes } of await tiendasConProgramadas('pedido_retrasado')) {
    if (!forzar.has('pedido_retrasado') && !(await esSuHora(tienda.branch_id, 9))) continue
    hecho.pedido_retrasado = (hecho.pedido_retrasado || 0) + await repasarPedidosRetrasados(tienda, Number(ajustes?.dias) || 3)
  }

  // Cada hora: carritos que llevan más de X horas sin terminar la compra
  for (const { tienda, ajustes } of await tiendasConProgramadas('carrito_abandonado')) {
    if (!forzar.has('carrito_abandonado') && !primerMinutoDeHora) continue
    hecho.carrito_abandonado = (hecho.carrito_abandonado || 0) + await repasarCarritosAbandonados(tienda, Number(ajustes?.esperar_horas) || 2)
  }

  // Cada día a la hora que diga el cliente: stock por debajo del mínimo
  for (const { tienda, ajustes } of await tiendasConProgramadas('aviso_stock_bajo')) {
    if (!forzar.has('aviso_stock_bajo') && !(await esSuHora(tienda.branch_id, Number(ajustes?.hora ?? 9)))) continue
    hecho.aviso_stock_bajo = (hecho.aviso_stock_bajo || 0) + await repasarStockBajo(tienda, Number(ajustes?.minimo ?? 3))
  }

  // Cada día a la hora que diga el cliente: el resumen del día para el equipo
  for (const { tienda, ajustes } of await tiendasConProgramadas('resumen_diario')) {
    if (!forzar.has('resumen_diario') && !(await esSuHora(tienda.branch_id, Number(ajustes?.hora ?? 20)))) continue
    hecho.resumen_diario = (hecho.resumen_diario || 0) + await repasarResumenDiario(tienda)
  }

  // Cada hora: productos con gente esperando que vuelven a tener stock
  for (const { tienda } of await tiendasConProgramadas('aviso_vuelve_stock')) {
    if (!forzar.has('aviso_vuelve_stock') && !primerMinutoDeHora) continue
    hecho.aviso_vuelve_stock = (hecho.aviso_vuelve_stock || 0) + await repasarVueltaStock(tienda)
  }

  // Cada día a las 10: productos por los que preguntaron y han bajado de precio
  for (const { tienda, ajustes } of await tiendasConProgramadas('bajo_de_precio')) {
    if (!forzar.has('bajo_de_precio') && !(await esSuHora(tienda.branch_id, 10))) continue
    hecho.bajo_de_precio = (hecho.bajo_de_precio || 0) + await repasarBajadasDePrecio(tienda, Number(ajustes?.bajada_minima ?? 10))
  }

  // Cada día a las 9: aniversario de una compra de hace un año
  for (const { tienda } of await tiendasConProgramadas('cumpleanos')) {
    if (!forzar.has('cumpleanos') && !(await esSuHora(tienda.branch_id, 9))) continue
    hecho.cumpleanos = (hecho.cumpleanos || 0) + await repasarAniversarios(tienda)
  }

  // Cada día a las 11: clientes dormidos y recompras
  for (const { tienda, ajustes } of await tiendasConProgramadas('cliente_dormido')) {
    if (!forzar.has('cliente_dormido') && !(await esSuHora(tienda.branch_id, 11))) continue
    hecho.cliente_dormido = (hecho.cliente_dormido || 0) + await repasarClientesDormidos(tienda, Number(ajustes?.dias ?? 90))
  }
  for (const { tienda, ajustes } of await tiendasConProgramadas('recompra')) {
    if (!forzar.has('recompra') && !(await esSuHora(tienda.branch_id, 11))) continue
    hecho.recompra = (hecho.recompra || 0) + await repasarRecompras(tienda, Number(ajustes?.dias ?? 30))
  }
  // Cada día a las 10: garantías por vencer
  for (const { tienda, ajustes } of await tiendasConProgramadas('garantia_por_vencer')) {
    if (!forzar.has('garantia_por_vencer') && !(await esSuHora(tienda.branch_id, 10))) continue
    hecho.garantia_por_vencer = (hecho.garantia_por_vencer || 0) + await repasarGarantias(tienda, Number(ajustes?.meses_garantia ?? 24), Number(ajustes?.avisar_dias_antes ?? 30))
  }
  // Mantenimiento: el catálogo cada día a la hora elegida; las políticas los lunes a las 5
  const hoy = new Date().toISOString().slice(0, 10)
  for (const { tienda, ajustes } of await tiendasConProgramadas('importar_catalogo')) {
    if (!forzar.has('importar_catalogo') && !(await esSuHora(tienda.branch_id, Number(ajustes?.hora ?? 4)))) continue
    const r = await lanzarAutomatizacion('importar_catalogo', { tenant_id: tienda.tenant_id, branch_id: tienda.branch_id, tienda_id: tienda.id, referencia: `importar_catalogo:${hoy}${forzar.has('importar_catalogo') ? ':' + Date.now() : ''}` })
    if (r.lanzada) hecho.importar_catalogo = (hecho.importar_catalogo || 0) + 1
  }
  for (const { tienda } of await tiendasConProgramadas('importar_politicas')) {
    if (!forzar.has('importar_politicas') && !(new Date().getDay() === 1 && (await esSuHora(tienda.branch_id, 5)))) continue
    const r = await lanzarAutomatizacion('importar_politicas', { tenant_id: tienda.tenant_id, branch_id: tienda.branch_id, tienda_id: tienda.id, referencia: `importar_politicas:${hoy}${forzar.has('importar_politicas') ? ':' + Date.now() : ''}` })
    if (r.lanzada) hecho.importar_politicas = (hecho.importar_politicas || 0) + 1
  }

  // Cada vuelta: clientes que llevan más de X minutos sin respuesta (no
  // necesita tienda)
  for (const { tenant_id, branch_id, ajustes } of await sucursalesConProgramada('cliente_esperando')) {
    if (!forzar.has('cliente_esperando') && new Date().getMinutes() % 5 !== 0) continue
    hecho.cliente_esperando = (hecho.cliente_esperando || 0) + await repasarClientesEsperando(tenant_id, branch_id, Number(ajustes?.minutos ?? 15))
  }

  // Agenda: recordatorios y confirmaciones cada 5 minutos; los que llevan
  // semanas sin venir, cada día a las 11 (no necesitan tienda)
  const cadaCinco = new Date().getMinutes() % 5 === 0
  for (const { tenant_id, branch_id, ajustes } of await sucursalesConProgramada('recordatorio_cita')) {
    if (!forzar.has('recordatorio_cita') && !cadaCinco) continue
    hecho.recordatorio_cita = (hecho.recordatorio_cita || 0) + await repasarRecordatoriosCitas(tenant_id, branch_id, ajustes)
  }
  for (const { tenant_id, branch_id, ajustes } of await sucursalesConProgramada('pedir_confirmacion_cita')) {
    if (!forzar.has('pedir_confirmacion_cita') && !cadaCinco) continue
    hecho.pedir_confirmacion_cita = (hecho.pedir_confirmacion_cita || 0) + await repasarConfirmacionesCitas(tenant_id, branch_id, ajustes)
  }
  // Restaurantes: mesas reservadas a las que no ha llegado nadie pasada la cortesía
  if (forzar.has('cortesia') || cadaCinco) {
    for (const { tenant_id, branch_id } of await restaurantesActivos()) {
      hecho.cortesia = (hecho.cortesia || 0) + await repasarCortesia(tenant_id, branch_id)
    }
  }
  for (const { tenant_id, branch_id, ajustes } of await sucursalesConProgramada('reactivar_sin_cita')) {
    if (!forzar.has('reactivar_sin_cita') && !(await esSuHora(branch_id, 11))) continue
    hecho.reactivar_sin_cita = (hecho.reactivar_sin_cita || 0) + await repasarClientesSinCita(tenant_id, branch_id, ajustes)
  }

  // Las que ha creado el cliente con reloj ("cada día a las X", "cada hora")
  const propias = await lanzarPropiasProgramadas(
    forzar.has('propias') ? async () => true : esSuHora,
    () => forzar.has('propias') || primerMinutoDeHora
  )
  if (propias) hecho.propias = propias

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
