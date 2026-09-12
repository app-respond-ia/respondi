import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { ESTADOS_ACTIVOS, type Cita, type CodigoErrorCita, type EstadoCita, type OrigenCita, type Servicio } from './tipos'
import { cargarAgenda, duracionServicio, grupoDeClase, huecosDelDia, patronOcupacion, type Agenda } from './disponibilidad'
import { diaEnZona, textoFecha, textoHora } from './tiempo'

// CREAR, MOVER, CANCELAR Y CAMBIAR DE ESTADO UNA CITA.
//
// Por aquí pasan las tres puertas: la IA en el chat, el panel del negocio y el
// enlace público. Las reglas (antelación, plazo de cancelación, tope por
// cliente, grupo grande) se aplican a la IA y al enlace; el panel puede
// saltárselas (`forzar`), pero nunca puede poner una cita encima de otra: eso
// lo impide la base de datos.

export type ResultadoCita =
  | { ok: true; cita: Cita }
  | { ok: false; codigo: CodigoErrorCita; error: string }

export interface DatosNuevaCita {
  tenant_id: string
  branch_id: string
  servicio_id: string
  inicio: string // ISO (UTC)
  personas?: number
  recurso_id?: string | null
  extras?: string[]
  contact_id?: string | null
  conversation_id?: string | null
  canal_conversacion?: string | null
  nombre_cliente?: string | null
  telefono?: string | null
  email?: string | null
  notas?: string | null
  peticiones?: string | null
  origen: OrigenCita
  creado_por?: string | null
  // El panel: fuera de horario, sin antelación, sin tope por cliente
  forzar?: boolean
  // Forzar el estado inicial (el panel puede dejarla pendiente a propósito)
  estado?: EstadoCita
}

const CANALES_TELEFONO = new Set(['whatsapp'])

export function normalizarTelefono(valor: string | null | undefined) {
  if (!valor) return null
  const limpio = String(valor).replace(/[^\d+]/g, '')
  if (limpio.replace(/\D/g, '').length < 8) return null
  return limpio.startsWith('+') ? limpio : `+${limpio}`
}

// El contacto de Respondi para este teléfono o correo (se crea si no existe:
// es el "registro" del cliente, sin que él haga nada)
export async function buscarOCrearContacto(tenantId: string, canal: 'whatsapp' | 'email', identificador: string, nombre?: string | null): Promise<{ id: string; nombre: string | null; no_promociones: boolean } | null> {
  const id = canal === 'email' ? identificador.trim().toLowerCase() : normalizarTelefono(identificador)
  if (!id) return null
  const { data: existente } = await supabaseAdmin
    .from('contacts')
    .select('id, nombre, no_promociones')
    .eq('tenant_id', tenantId)
    .eq('canal', canal)
    .eq('identificador_canal', id)
    .maybeSingle()
  if (existente) {
    if (nombre && !existente.nombre) await supabaseAdmin.from('contacts').update({ nombre }).eq('id', existente.id)
    return { id: existente.id, nombre: existente.nombre || nombre || null, no_promociones: !!existente.no_promociones }
  }
  const { data: nuevo, error } = await supabaseAdmin
    .from('contacts')
    .insert({ tenant_id: tenantId, canal, identificador_canal: id, nombre: nombre || null })
    .select('id, nombre, no_promociones')
    .single()
  if (error || !nuevo) return null
  return { id: nuevo.id, nombre: nuevo.nombre, no_promociones: !!nuevo.no_promociones }
}

async function citaPorId(id: string): Promise<Cita | null> {
  const { data } = await supabaseAdmin.from('citas').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  return await conRecursos(data as Cita)
}

async function conRecursos(cita: Cita): Promise<Cita> {
  const { data } = await supabaseAdmin
    .from('citas_recursos')
    .select('recurso_id, recursos:recurso_id(id, nombre, tipo)')
    .eq('cita_id', cita.id)
  const vistos = new Set<string>()
  const recursos: { id: string; nombre: string; tipo: any }[] = []
  for (const f of data || []) {
    const r: any = Array.isArray((f as any).recursos) ? (f as any).recursos[0] : (f as any).recursos
    if (r && !vistos.has(r.id)) { vistos.add(r.id); recursos.push({ id: r.id, nombre: r.nombre, tipo: r.tipo }) }
  }
  return { ...cita, recursos }
}

export async function apuntarHistorial(cita: { id: string; tenant_id: string; branch_id: string }, cambio: string, detalle: Record<string, any> = {}, origen: string = 'sistema', usuarioId?: string | null) {
  await supabaseAdmin.from('citas_historial').insert({
    tenant_id: cita.tenant_id, branch_id: cita.branch_id, cita_id: cita.id, cambio, detalle, origen, usuario_id: usuarioId || null
  })
}

function precioEstimado(servicio: Servicio, personas: number, extras: string[]) {
  if (servicio.precio === null) return null
  let total = servicio.precio * (servicio.precio_por_persona ? personas : 1)
  for (const nombre of extras) {
    const e = servicio.extras.find(x => x.nombre.toLowerCase() === nombre.toLowerCase())
    if (e?.precio) total += e.precio * (servicio.precio_por_persona ? personas : 1)
  }
  return Math.round(total * 100) / 100
}

function fallo(codigo: CodigoErrorCita, error: string): ResultadoCita {
  return { ok: false, codigo, error }
}

// Cuántas citas activas tiene ya este contacto (de hoy en adelante)
async function citasActivasDelContacto(branchId: string, contactId: string) {
  const { count } = await supabaseAdmin
    .from('citas')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .eq('contact_id', contactId)
    .in('estado', ESTADOS_ACTIVOS)
    .gte('fin', new Date().toISOString())
  return count || 0
}

export async function crearCita(d: DatosNuevaCita): Promise<ResultadoCita> {
  const agenda = await cargarAgenda(d.branch_id)
  if (!agenda) return fallo('no_existe', 'No se ha encontrado la sucursal.')
  if (!agenda.ajustes.activa && !d.forzar) return fallo('agenda_apagada', 'La agenda de este negocio no está activada.')
  const servicio = agenda.servicios.find(s => s.id === d.servicio_id)
  if (!servicio || !servicio.reservable) return fallo('servicio', 'Ese servicio no se puede reservar.')
  if (!servicio.disponible && !d.forzar) return fallo('servicio', 'Ese servicio no está disponible ahora mismo.')
  const inicio = new Date(d.inicio)
  if (isNaN(inicio.getTime())) return fallo('antelacion', 'La fecha y hora no son válidas.')
  const personas = Math.max(1, Math.round(Number(d.personas || 1)))
  const extras = (d.extras || []).filter(e => servicio.extras.some(x => x.nombre.toLowerCase() === String(e).toLowerCase()))

  if (!d.forzar) {
    if (personas >= agenda.ajustes.grupo_grande_desde) return fallo('grupo_grande', `A partir de ${agenda.ajustes.grupo_grande_desde} personas la reserva la gestiona una persona del equipo.`)
    if (d.contact_id) {
      const activas = await citasActivasDelContacto(d.branch_id, d.contact_id)
      if (activas >= agenda.ajustes.max_citas_activas_por_cliente) return fallo('limite', `Ya tiene ${activas} ${activas === 1 ? 'reserva activa' : 'reservas activas'}; el máximo es ${agenda.ajustes.max_citas_activas_por_cliente}.`)
    }
  }

  // ¿Cabe a esa hora, y con qué recursos?
  const fecha = diaEnZona(inicio, agenda.zona)
  const { huecos, motivo } = await huecosDelDia({ agenda, servicio, fecha, personas, recursoId: d.recurso_id, extras, sinReglas: !!d.forzar, soloInicio: inicio })
  const hueco = huecos.find(h => h.inicio === inicio.toISOString())
  if (!hueco) {
    const ahora = Date.now()
    if (!d.forzar && inicio.getTime() - ahora < agenda.ajustes.antelacion_minima_minutos * 60000) return fallo('antelacion', `Hay que reservar con al menos ${textoAntelacion(agenda.ajustes.antelacion_minima_minutos)} de antelación.`)
    if (!d.forzar && inicio.getTime() - ahora > agenda.ajustes.antelacion_maxima_dias * 24 * 3600 * 1000) return fallo('antelacion', `Solo se puede reservar hasta ${agenda.ajustes.antelacion_maxima_dias} días antes.`)
    return fallo('sin_hueco', motivo || 'A esa hora no hay hueco.')
  }

  const { fin, tramos } = patronOcupacion(servicio, inicio, extras)
  const grupo = servicio.aforo ? grupoDeClase(servicio.id, inicio) : null
  const confirmacion = servicio.confirmacion || agenda.ajustes.confirmacion
  const estado: EstadoCita = d.estado || (d.origen !== 'panel' && confirmacion === 'manual' ? 'pendiente' : 'confirmada')

  const r = await supabaseAdmin.rpc('reservar_cita', {
    p: {
      tenant_id: d.tenant_id,
      branch_id: d.branch_id,
      contact_id: d.contact_id || null,
      conversation_id: d.conversation_id || null,
      servicio_id: servicio.id,
      servicio_nombre: servicio.nombre,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      personas,
      estado,
      origen: d.origen,
      grupo,
      aforo: servicio.aforo,
      nombre_cliente: d.nombre_cliente || null,
      telefono: normalizarTelefono(d.telefono) || null,
      email: d.email ? d.email.trim().toLowerCase() : null,
      notas: d.notas || null,
      peticiones: d.peticiones || null,
      extras,
      precio_estimado: precioEstimado(servicio, personas, extras),
      moneda: servicio.moneda || agenda.negocio.moneda,
      creado_por: d.creado_por || null,
      ocupacion: hueco.recursos.flatMap(recursoId => tramos.map(t => ({ recurso_id: recursoId, desde: t.desde.toISOString(), hasta: t.hasta.toISOString() })))
    }
  })
  if (r.error) {
    await registrarError({ origen: 'app', descripcion: 'No se ha podido guardar una cita', stacktrace: JSON.stringify({ error: r.error.message, branch: d.branch_id }), tenant_id: d.tenant_id })
    return fallo('ocupado', 'No se ha podido guardar la reserva. Inténtalo de nuevo.')
  }
  const resultado: any = r.data
  if (resultado?.error === 'ocupado') return fallo('ocupado', 'Alguien acaba de coger ese hueco. Elige otro.')
  if (resultado?.error === 'aforo') return fallo('aforo', resultado.libres ? `Solo quedan ${resultado.libres} plazas en ese hueco.` : 'Ese hueco ya está completo.')

  const cita = await citaPorId(resultado.id)
  if (!cita) return fallo('no_existe', 'La reserva se ha guardado pero no se ha podido leer.')
  await apuntarHistorial(cita, 'creada', { estado, origen: d.origen, personas, servicio: servicio.nombre }, d.origen, d.creado_por)
  await dispararEventoAgenda('cita_creada', cita, agenda)
  return { ok: true, cita }
}

function textoAntelacion(minutos: number) {
  if (minutos % 1440 === 0) return `${minutos / 1440} ${minutos / 1440 === 1 ? 'día' : 'días'}`
  if (minutos % 60 === 0) return `${minutos / 60} ${minutos / 60 === 1 ? 'hora' : 'horas'}`
  return `${minutos} minutos`
}

// ¿Puede el cliente tocar esta cita todavía? (plazo de cancelación)
function dentroDelPlazo(cita: Cita, agenda: Agenda) {
  const servicio = agenda.servicios.find(s => s.id === cita.servicio_id)
  const horas = servicio?.cancelacion_horas ?? agenda.ajustes.cancelacion_horas
  return new Date(cita.inicio).getTime() - Date.now() >= horas * 3600 * 1000
}

export interface DatosMover {
  inicio: string
  recurso_id?: string | null
  por: 'cliente' | 'negocio'
  origen: OrigenCita
  usuario_id?: string | null
  forzar?: boolean
}

export async function moverCita(citaId: string, d: DatosMover): Promise<ResultadoCita> {
  const cita = await citaPorId(citaId)
  if (!cita) return fallo('no_existe', 'Esa reserva no existe.')
  if (!ESTADOS_ACTIVOS.includes(cita.estado)) return fallo('estado', 'Esa reserva ya no se puede mover.')
  const agenda = await cargarAgenda(cita.branch_id)
  if (!agenda) return fallo('no_existe', 'No se ha encontrado la sucursal.')
  const servicio = agenda.servicios.find(s => s.id === cita.servicio_id)
  if (!servicio) return fallo('servicio', 'El servicio de esa reserva ya no existe en la lista de precios.')
  if (d.por === 'cliente' && !dentroDelPlazo(cita, agenda)) {
    const horas = servicio.cancelacion_horas ?? agenda.ajustes.cancelacion_horas
    return fallo('plazo_cancelacion', `Ya no se puede cambiar: hay que avisar con ${horas} horas de antelación. Puede pedírselo al equipo.`)
  }
  const inicio = new Date(d.inicio)
  if (isNaN(inicio.getTime())) return fallo('antelacion', 'La fecha y hora no son válidas.')
  const sinReglas = !!d.forzar && d.por === 'negocio'
  const fecha = diaEnZona(inicio, agenda.zona)
  const recursoPreferido = d.recurso_id === undefined ? (cita.recursos?.[0]?.id || null) : d.recurso_id
  let { huecos, motivo } = await huecosDelDia({ agenda, servicio, fecha, personas: cita.personas, recursoId: recursoPreferido, extras: cita.extras, ignorarCitaId: cita.id, sinReglas, soloInicio: inicio })
  // Si con su recurso de siempre no cabe, vale otro
  if (!huecos.length && recursoPreferido && d.recurso_id === undefined) {
    ;({ huecos, motivo } = await huecosDelDia({ agenda, servicio, fecha, personas: cita.personas, extras: cita.extras, ignorarCitaId: cita.id, sinReglas, soloInicio: inicio }))
  }
  const hueco = huecos.find(h => h.inicio === inicio.toISOString())
  if (!hueco) return fallo('sin_hueco', motivo || 'A esa hora no hay hueco.')

  const { fin, tramos } = patronOcupacion(servicio, inicio, cita.extras)
  const grupo = servicio.aforo ? grupoDeClase(servicio.id, inicio) : null
  const r = await supabaseAdmin.rpc('mover_cita', {
    p: {
      cita_id: cita.id,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      grupo,
      aforo: servicio.aforo,
      ocupacion: hueco.recursos.flatMap(recursoId => tramos.map(t => ({ recurso_id: recursoId, desde: t.desde.toISOString(), hasta: t.hasta.toISOString() })))
    }
  })
  if (r.error) return fallo('ocupado', 'No se ha podido mover la reserva. Inténtalo de nuevo.')
  const resultado: any = r.data
  if (resultado?.error === 'ocupado') return fallo('ocupado', 'Alguien acaba de coger ese hueco. Elige otro.')
  if (resultado?.error === 'aforo') return fallo('aforo', 'Ese hueco ya está completo.')

  const nueva = await citaPorId(cita.id)
  if (!nueva) return fallo('no_existe', 'La reserva se ha movido pero no se ha podido leer.')
  await apuntarHistorial(nueva, 'movida', { de: cita.inicio, a: nueva.inicio, por: d.por }, d.origen, d.usuario_id)
  await dispararEventoAgenda('cita_movida', nueva, agenda, { inicio_anterior: cita.inicio })
  return { ok: true, cita: nueva }
}

export interface DatosCancelar {
  por: 'cliente' | 'negocio'
  motivo?: string | null
  origen: OrigenCita
  usuario_id?: string | null
  forzar?: boolean
}

export async function cancelarCita(citaId: string, d: DatosCancelar): Promise<ResultadoCita> {
  const cita = await citaPorId(citaId)
  if (!cita) return fallo('no_existe', 'Esa reserva no existe.')
  if (!ESTADOS_ACTIVOS.includes(cita.estado)) return fallo('estado', 'Esa reserva ya estaba cancelada o terminada.')
  const agenda = await cargarAgenda(cita.branch_id)
  if (!agenda) return fallo('no_existe', 'No se ha encontrado la sucursal.')
  if (d.por === 'cliente' && !d.forzar && !dentroDelPlazo(cita, agenda)) {
    const servicio = agenda.servicios.find(s => s.id === cita.servicio_id)
    const horas = servicio?.cancelacion_horas ?? agenda.ajustes.cancelacion_horas
    return fallo('plazo_cancelacion', `Ya no se puede cancelar: hay que avisar con ${horas} horas de antelación. Puede pedírselo al equipo.`)
  }
  const estado: EstadoCita = d.por === 'cliente' ? 'cancelada_cliente' : 'cancelada_negocio'
  const { error } = await supabaseAdmin.from('citas').update({ estado, actualizado_en: new Date().toISOString() }).eq('id', cita.id)
  if (error) return fallo('estado', 'No se ha podido cancelar la reserva.')
  // Se suelta el hueco
  await supabaseAdmin.from('citas_recursos').delete().eq('cita_id', cita.id)
  const cancelada = { ...cita, estado }
  await apuntarHistorial(cancelada, 'cancelada', { por: d.por, motivo: d.motivo || null }, d.origen, d.usuario_id)
  await dispararEventoAgenda('cita_cancelada', cancelada, agenda)
  // Y a quien esperaba ese día se le avisa del hueco
  try {
    const { avisarListaEspera } = await import('./repasos')
    await avisarListaEspera(cancelada, agenda)
  } catch { /* ya queda registrado dentro */ }
  return { ok: true, cita: cancelada }
}

// Confirmar (si estaba pendiente), empezar, terminar, no se presentó
export async function cambiarEstadoCita(citaId: string, estado: Extract<EstadoCita, 'confirmada' | 'en_curso' | 'completada' | 'no_presentado'>, d: { origen: OrigenCita; usuario_id?: string | null }): Promise<ResultadoCita> {
  const cita = await citaPorId(citaId)
  if (!cita) return fallo('no_existe', 'Esa reserva no existe.')
  const permitidos: Record<string, EstadoCita[]> = {
    confirmada: ['pendiente'],
    en_curso: ['pendiente', 'confirmada'],
    completada: ['pendiente', 'confirmada', 'en_curso'],
    no_presentado: ['pendiente', 'confirmada']
  }
  if (!permitidos[estado].includes(cita.estado)) return fallo('estado', `Una reserva "${cita.estado}" no puede pasar a "${estado}".`)
  const cambios: Record<string, any> = { estado, actualizado_en: new Date().toISOString() }
  if (estado === 'en_curso' && !cita.llegada_en) cambios.llegada_en = new Date().toISOString()
  const { error } = await supabaseAdmin.from('citas').update(cambios).eq('id', cita.id)
  if (error) return fallo('estado', 'No se ha podido cambiar el estado.')
  // Un plantón suelta el hueco por si aún queda tiempo aprovechable
  if (estado === 'no_presentado') await supabaseAdmin.from('citas_recursos').delete().eq('cita_id', cita.id)
  const nueva = { ...cita, ...cambios } as Cita
  await apuntarHistorial(nueva, estado, {}, d.origen, d.usuario_id)
  const agenda = await cargarAgenda(cita.branch_id)
  if (agenda) await dispararEventoAgenda(`cita_${estado}`, nueva, agenda)
  return { ok: true, cita: nueva }
}

// Las citas de un contacto (para "mis citas" y para que la IA solo toque las suyas)
export async function citasDelContacto(branchId: string, contactId: string, opciones: { soloFuturas?: boolean; limite?: number } = {}): Promise<Cita[]> {
  let consulta = supabaseAdmin
    .from('citas')
    .select('*')
    .eq('branch_id', branchId)
    .eq('contact_id', contactId)
    .order('inicio', { ascending: true })
    .limit(opciones.limite || 20)
  if (opciones.soloFuturas !== false) consulta = consulta.gte('fin', new Date().toISOString()).in('estado', ESTADOS_ACTIVOS)
  const { data } = await consulta
  const salida: Cita[] = []
  for (const c of data || []) salida.push(await conRecursos(c as Cita))
  return salida
}

export async function citaPorToken(token: string): Promise<Cita | null> {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) return null
  const { data } = await supabaseAdmin.from('citas').select('*').eq('token_gestion', token).maybeSingle()
  return data ? await conRecursos(data as Cita) : null
}

// ---------------------------------------------------------------------------
// Lo que pasa en la agenda, contado a las automatizaciones
// ---------------------------------------------------------------------------
// Cada cambio dispara las automatizaciones que escuchan ese evento
// (evento_agenda: cita_creada, cita_movida, cita_cancelada, cita_completada,
// cita_no_presentado, cita_confirmada...). El contexto lleva la cita en
// cristiano para los huecos de los mensajes.
export async function contextoDeCita(cita: Cita, agenda: Agenda, extra: Record<string, any> = {}) {
  let noPromociones = false
  let nombreContacto: string | null = null
  if (cita.contact_id) {
    const { data: c } = await supabaseAdmin.from('contacts').select('nombre, no_promociones').eq('id', cita.contact_id).maybeSingle()
    noPromociones = !!c?.no_promociones
    nombreContacto = c?.nombre || null
  }
  const recursos = cita.recursos || (await conRecursos(cita)).recursos || []
  return {
    tenant_id: cita.tenant_id,
    branch_id: cita.branch_id,
    referencia: `cita:${cita.id}`,
    cita: {
      id: cita.id,
      servicio: cita.servicio_nombre,
      inicio: cita.inicio,
      fin: cita.fin,
      fecha: textoFecha(cita.inicio, agenda.zona),
      hora: textoHora(cita.inicio, agenda.zona),
      personas: cita.personas,
      recursos: recursos.map(r => r.nombre),
      estado: cita.estado,
      origen: cita.origen,
      precio: cita.precio_estimado,
      token: cita.token_gestion,
      es_grupo: cita.personas >= agenda.ajustes.grupo_grande_desde
    },
    cliente: {
      nombre: cita.nombre_cliente || nombreContacto || null,
      telefono: cita.telefono || null,
      email: cita.email || null,
      acepta_marketing: !noPromociones
    },
    contact_id: cita.contact_id || null,
    conversation_id: cita.conversation_id || null,
    canal_conversacion: cita.conversation_id ? (cita.telefono ? 'whatsapp' : 'email') : null,
    negocio: agenda.negocio.nombre,
    direccion: agenda.negocio.direccion || '',
    servicio: cita.servicio_nombre,
    profesional: recursos.filter(r => r.tipo === 'persona').map(r => r.nombre).join(', ') || recursos.map(r => r.nombre).join(', '),
    cita_fecha: textoFecha(cita.inicio, agenda.zona),
    cita_hora: textoHora(cita.inicio, agenda.zona),
    personas: String(cita.personas),
    enlace_cita: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://respondi.vercel.app').replace(/\/$/, '')}/reserva/${cita.token_gestion}`,
    ...extra
  }
}

export async function dispararEventoAgenda(evento: string, cita: Cita, agenda: Agenda, extra: Record<string, any> = {}) {
  try {
    const { automatizacionesActivas, lanzarAutomatizacion } = await import('@/lib/automatizaciones/motor')
    const interesadas = (await automatizacionesActivas(cita.branch_id)).filter(({ definicion }) => {
      const d: any = definicion.receta.disparador
      return d.tipo === 'evento_agenda' && d.evento === evento
    })
    if (!interesadas.length) return 0
    const contexto = await contextoDeCita(cita, agenda, extra)
    let lanzadas = 0
    for (const { definicion } of interesadas) {
      const r = await lanzarAutomatizacion(definicion.clave, { ...contexto, referencia: `cita:${cita.id}:${evento}:${cita.actualizado_en || cita.created_at}` })
      if (r.lanzada) lanzadas++
    }
    return lanzadas
  } catch (e: any) {
    await registrarError({ origen: 'app', descripcion: `Fallo al avisar a las automatizaciones de la agenda (${evento})`, stacktrace: JSON.stringify({ error: e?.message, cita: cita.id }), tenant_id: cita.tenant_id })
    return 0
  }
}

export { duracionServicio }
