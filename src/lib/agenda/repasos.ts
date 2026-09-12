import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { cargarAgenda, type Agenda } from './disponibilidad'
import { apuntarHistorial, cambiarEstadoCita, contextoDeCita } from './citas'
import { diaEnZona } from './tiempo'
import type { Cita } from './tipos'

// LO QUE EL RELOJ MIRA EN LA AGENDA (y lo que pasa al cancelar).
//
//   · Recordatorios: X horas antes de cada cita confirmada (y un segundo
//     aviso más cerca, si el negocio quiere).
//   · Pedir confirmación: X horas antes; si el cliente responde SÍ, queda
//     anotado en la cita.
//   · Clientes que llevan semanas sin venir.
//   · Lista de espera: al cancelarse una cita, se avisa a quien esperaba ese
//     día.
// Cada aviso queda apuntado en `citas.avisos`, así nunca se manda dos veces.

async function marcarAviso(citaId: string, avisos: Record<string, any>, clave: string, valor: string) {
  await supabaseAdmin.from('citas').update({ avisos: { ...(avisos || {}), [clave]: valor } }).eq('id', citaId)
}

async function lanzar(clave: string, contexto: any) {
  const { lanzarAutomatizacion } = await import('@/lib/automatizaciones/motor')
  return lanzarAutomatizacion(clave, contexto)
}

// Recordatorio de cita: primer aviso a `horas_antes`, segundo a
// `segundo_aviso_horas` (0 = ninguno). Una cita reservada después del punto
// del aviso no lo recibe (acaba de reservar: no hace falta recordárselo).
export async function repasarRecordatoriosCitas(tenantId: string, branchId: string, ajustes: any) {
  const agenda = await cargarAgenda(branchId)
  if (!agenda) return 0
  const h1 = Math.max(0, Number(ajustes?.horas_antes ?? 24))
  const h2 = Math.max(0, Number(ajustes?.segundo_aviso_horas ?? 2))
  const ventana = Math.max(h1, h2)
  if (!ventana) return 0
  const ahora = Date.now()
  const { data: citas } = await supabaseAdmin
    .from('citas')
    .select('*')
    .eq('branch_id', branchId)
    .eq('estado', 'confirmada')
    .gt('inicio', new Date(ahora).toISOString())
    .lte('inicio', new Date(ahora + ventana * 3600 * 1000).toISOString())
    .limit(300)
  let lanzadas = 0
  for (const c of (citas || []) as Cita[]) {
    const inicio = new Date(c.inicio).getTime()
    const creada = new Date(c.created_at).getTime()
    for (const [clave, horas] of [['recordatorio_1', h1], ['recordatorio_2', h2]] as [string, number][]) {
      if (!horas) continue
      const punto = inicio - horas * 3600 * 1000
      if (ahora < punto) continue
      if (c.avisos?.[clave]) continue
      if (creada > punto) { await marcarAviso(c.id, c.avisos, clave, 'omitido: reservada después'); continue }
      const contexto = await contextoDeCita(c, agenda)
      const r = await lanzar('recordatorio_cita', { ...contexto, referencia: `cita:${c.id}:${clave}`, aviso: clave === 'recordatorio_1' ? 'primero' : 'segundo' })
      await marcarAviso(c.id, c.avisos, clave, new Date().toISOString())
      c.avisos = { ...(c.avisos || {}), [clave]: 'hecho' }
      if (r.lanzada) lanzadas++
    }
  }
  return lanzadas
}

// Pedir confirmación X horas antes (una vez por cita)
export async function repasarConfirmacionesCitas(tenantId: string, branchId: string, ajustes: any) {
  const agenda = await cargarAgenda(branchId)
  if (!agenda) return 0
  const horas = Math.max(1, Number(ajustes?.horas_antes ?? 48))
  const ahora = Date.now()
  const { data: citas } = await supabaseAdmin
    .from('citas')
    .select('*')
    .eq('branch_id', branchId)
    .eq('estado', 'confirmada')
    .gt('inicio', new Date(ahora).toISOString())
    .lte('inicio', new Date(ahora + horas * 3600 * 1000).toISOString())
    .limit(300)
  let lanzadas = 0
  for (const c of (citas || []) as Cita[]) {
    if (c.avisos?.confirmacion_pedida || c.avisos?.confirmada_cliente) continue
    const punto = new Date(c.inicio).getTime() - horas * 3600 * 1000
    if (new Date(c.created_at).getTime() > punto) { await marcarAviso(c.id, c.avisos, 'confirmacion_pedida', 'omitido: reservada después'); continue }
    const contexto = await contextoDeCita(c, agenda)
    const r = await lanzar('pedir_confirmacion_cita', { ...contexto, referencia: `cita:${c.id}:confirmacion` })
    await marcarAviso(c.id, c.avisos, 'confirmacion_pedida', new Date().toISOString())
    if (r.lanzada) lanzadas++
  }
  return lanzadas
}

// El cliente responde "SÍ" a la petición de confirmación: queda anotado
const DICE_SI = /^\s*(s[ií]+|confirmo|confirmad[oa]|ok|okey|vale|claro( que s[ií])?|perfecto|de acuerdo|all[ií] estar[ée])\s*[.!]*\s*$/i

export async function confirmarCitaPorRespuesta(tenantId: string, branchId: string, contactId: string | null | undefined, texto: string | null | undefined) {
  if (!contactId || !texto || !DICE_SI.test(texto)) return false
  const { data: citas } = await supabaseAdmin
    .from('citas')
    .select('id, tenant_id, branch_id, avisos, inicio')
    .eq('branch_id', branchId)
    .eq('contact_id', contactId)
    .eq('estado', 'confirmada')
    .gt('inicio', new Date().toISOString())
    .order('inicio', { ascending: true })
    .limit(5)
  const pendiente = (citas || []).find((c: any) => c.avisos?.confirmacion_pedida && !String(c.avisos.confirmacion_pedida).startsWith('omitido') && !c.avisos?.confirmada_cliente)
  if (!pendiente) return false
  await marcarAviso(pendiente.id, pendiente.avisos, 'confirmada_cliente', new Date().toISOString())
  await apuntarHistorial(pendiente as any, 'confirmada_por_cliente', {}, 'sistema')
  return true
}

// Clientes cuya última cita terminada fue hace más de X semanas y no tienen
// otra por venir. Una vez por cliente y por "última cita".
export async function repasarClientesSinCita(tenantId: string, branchId: string, ajustes: any) {
  const agenda = await cargarAgenda(branchId)
  if (!agenda) return 0
  const semanas = Math.max(1, Number(ajustes?.semanas ?? 6))
  const limite = new Date(Date.now() - semanas * 7 * 24 * 3600 * 1000)
  // No se rasca más atrás de un año: sería escribir a gente que se fue
  const suelo = new Date(Date.now() - 365 * 24 * 3600 * 1000)
  const { data: terminadas } = await supabaseAdmin
    .from('citas')
    .select('*')
    .eq('branch_id', branchId)
    .eq('estado', 'completada')
    .not('contact_id', 'is', null)
    .gte('inicio', suelo.toISOString())
    .order('inicio', { ascending: false })
    .limit(2000)
  const ultimaPor = new Map<string, Cita>()
  for (const c of (terminadas || []) as Cita[]) if (c.contact_id && !ultimaPor.has(c.contact_id)) ultimaPor.set(c.contact_id, c)
  let lanzadas = 0
  for (const [contactId, ultima] of ultimaPor) {
    if (new Date(ultima.inicio) > limite) continue
    const { count } = await supabaseAdmin
      .from('citas')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('contact_id', contactId)
      .in('estado', ['pendiente', 'confirmada', 'en_curso'])
      .gte('fin', new Date().toISOString())
    if (count) continue
    // Si ya hubo una cita después (aunque fuera plantón o cancelada), no cuenta como dormido desde esta
    const { count: posteriores } = await supabaseAdmin
      .from('citas')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('contact_id', contactId)
      .gt('inicio', ultima.inicio)
    if (posteriores) continue
    const semanasSin = Math.floor((Date.now() - new Date(ultima.inicio).getTime()) / (7 * 24 * 3600 * 1000))
    const contexto = await contextoDeCita(ultima, agenda)
    const r = await lanzar('reactivar_sin_cita', { ...contexto, referencia: `sin_cita:${contactId}:${ultima.id}`, tiempo: semanasSin >= 8 ? `${Math.round(semanasSin / 4)} meses` : `${semanasSin} semanas` })
    if (r.lanzada) lanzadas++
  }
  return lanzadas
}

// Al cancelarse una cita: avisar a quien esperaba ese día (por orden de
// llegada, como mucho a tres, y una vez a cada uno)
export async function avisarListaEspera(cancelada: Cita, agenda: Agenda) {
  try {
    const fecha = diaEnZona(new Date(cancelada.inicio), agenda.zona)
    const { data: espera } = await supabaseAdmin
      .from('agenda_espera')
      .select('id, contact_id, servicio_id, servicio_nombre, personas, franja, contacts:contact_id(id, nombre, canal, identificador_canal, no_promociones)')
      .eq('branch_id', cancelada.branch_id)
      .eq('fecha', fecha)
      .is('avisado_en', null)
      .order('created_at', { ascending: true })
      .limit(10)
    const candidatos = (espera || []).filter((e: any) => !e.servicio_id || e.servicio_id === cancelada.servicio_id).slice(0, 3)
    if (!candidatos.length) return 0
    const base = await contextoDeCita(cancelada, agenda)
    let avisados = 0
    for (const e of candidatos as any[]) {
      const c: any = Array.isArray(e.contacts) ? e.contacts[0] : e.contacts
      if (!c) continue
      const r = await lanzar('hueco_liberado', {
        ...base,
        referencia: `espera:${e.id}:${cancelada.id}`,
        contact_id: c.id,
        conversation_id: null,
        cliente: { nombre: c.nombre || null, telefono: c.canal === 'whatsapp' ? c.identificador_canal : null, email: c.canal === 'email' ? c.identificador_canal : null, acepta_marketing: !c.no_promociones }
      })
      await supabaseAdmin.from('agenda_espera').update({ avisado_en: new Date().toISOString() }).eq('id', e.id)
      if (r.lanzada) avisados++
    }
    return avisados
  } catch (err: any) {
    await registrarError({ origen: 'app', descripcion: 'Fallo al avisar a la lista de espera de la agenda', stacktrace: JSON.stringify({ error: err?.message, cita: cancelada.id }), tenant_id: cancelada.tenant_id })
    return 0
  }
}

// Restaurante: pasada la cortesía sin que llegue nadie, la mesa se libera
// (la reserva queda como "no se presentó" y, si está encendida, sale la
// automatización de plantón)
export async function repasarCortesia(tenantId: string, branchId: string) {
  const agenda = await cargarAgenda(branchId)
  if (!agenda || agenda.ajustes.modo !== 'restaurante' || !agenda.ajustes.tiempo_cortesia_minutos) return 0
  const limite = new Date(Date.now() - agenda.ajustes.tiempo_cortesia_minutos * 60000)
  const { data: citas } = await supabaseAdmin
    .from('citas')
    .select('id')
    .eq('branch_id', branchId)
    .eq('estado', 'confirmada')
    .is('llegada_en', null)
    .lte('inicio', limite.toISOString())
    .gte('inicio', new Date(Date.now() - 12 * 3600 * 1000).toISOString())
    .limit(100)
  let liberadas = 0
  for (const c of citas || []) {
    const r = await cambiarEstadoCita(c.id, 'no_presentado', { origen: 'sistema', detalle: { motivo: `pasados ${agenda.ajustes.tiempo_cortesia_minutos} min de cortesía sin llegar` } })
    if (r.ok) liberadas++
  }
  return liberadas
}

// Las sucursales con agenda de restaurante activa (para el reloj)
export async function restaurantesActivos(): Promise<{ tenant_id: string; branch_id: string }[]> {
  const { data } = await supabaseAdmin
    .from('agenda_ajustes')
    .select('tenant_id, branch_id')
    .eq('activa', true)
    .eq('modo', 'restaurante')
    .gt('tiempo_cortesia_minutos', 0)
  return (data || []) as any
}
