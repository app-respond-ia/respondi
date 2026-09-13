'use server'

import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { cargarAgenda, esRestaurante, huecosDelDia, servicioPorId, type Agenda } from '@/lib/agenda/disponibilidad'
import { crearCita, moverCita, cancelarCita, buscarOCrearContacto, citaPorToken, completarTelefono } from '@/lib/agenda/citas'
import { diaEnZona, leerFecha, sumarDias } from '@/lib/agenda/tiempo'
import { ESTADOS_ACTIVOS, ID_MESA, type Cita } from '@/lib/agenda/tipos'

// EL ENLACE PÚBLICO DE RESERVA (tramo 3). Sin cuenta ni contraseña: el
// cliente elige, se identifica con su teléfono o su correo (que es su
// contacto en Respondi) y recibe la confirmación con una llave secreta
// (`token_gestion`) para cambiar o cancelar. Mismas reglas y mismo motor que
// la IA y el panel; nunca por encima de otra reserva.
//
// Estas acciones no piden sesión: cualquiera puede llamarlas. Por eso todo se
// valida aquí y solo se enseña lo que el negocio ha marcado como público.

function limpiarEnlace(enlace: string) {
  return String(enlace || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '').slice(0, 40)
}

async function agendaPorEnlace(enlace: string): Promise<{ agenda: Agenda; tenant_id: string } | null> {
  const slug = limpiarEnlace(enlace)
  if (slug.length < 3) return null
  const { data: fila } = await supabaseAdmin
    .from('agenda_ajustes')
    .select('branch_id, tenant_id, activa, enlace_activo')
    .eq('enlace_publico', slug)
    .maybeSingle()
  if (!fila || !fila.activa || !fila.enlace_activo) return null
  const agenda = await cargarAgenda(fila.branch_id)
  if (!agenda) return null
  return { agenda, tenant_id: fila.tenant_id }
}

function serviciosPublicos(agenda: Agenda) {
  return agenda.servicios
    .filter(s => s.reservable && s.disponible && s.reservable_online)
    .map(s => ({ id: s.id, nombre: s.nombre, descripcion: s.descripcion, duracion_minutos: s.duracion_minutos || 30, precio: s.precio, precio_tipo: s.precio_tipo, moneda: s.moneda || agenda.negocio.moneda, precio_por_persona: s.precio_por_persona, aforo: s.aforo, extras: s.extras, tipo_recurso: s.tipo_recurso }))
}

function resumenPublico(agenda: Agenda) {
  const restaurante = esRestaurante(agenda)
  const mesas = agenda.recursos.filter(r => r.activo && r.tipo === 'mesa')
  return {
    negocio: { nombre: agenda.negocio.nombre, direccion: agenda.negocio.direccion, zona_horaria: agenda.zona },
    modo: agenda.ajustes.modo,
    paso_minutos: agenda.ajustes.paso_minutos,
    antelacion_minima_minutos: agenda.ajustes.antelacion_minima_minutos,
    antelacion_maxima_dias: agenda.ajustes.antelacion_maxima_dias,
    cancelacion_horas: agenda.ajustes.cancelacion_horas,
    grupo_grande_desde: agenda.ajustes.grupo_grande_desde,
    confirmacion: agenda.ajustes.confirmacion,
    turnos: agenda.ajustes.turnos,
    servicios: serviciosPublicos(agenda),
    // Solo las personas que el cliente puede elegir por nombre
    profesionales: agenda.recursos.filter(r => r.activo && r.elegible && r.tipo === 'persona').map(r => ({ id: r.id, nombre: r.nombre })),
    zonas: restaurante ? [...new Set(mesas.map(m => (m.zona || '').trim()).filter(Boolean))] : [],
    hay_mesas: mesas.length > 0,
    hoy: diaEnZona(new Date(), agenda.zona),
    hasta: sumarDias(diaEnZona(new Date(), agenda.zona), agenda.ajustes.antelacion_maxima_dias)
  }
}

export async function getReservaPublica(enlace: string) {
  const r = await agendaPorEnlace(enlace)
  if (!r) return { success: false, error: 'Este enlace de reservas no está activo.' }
  const resumen = resumenPublico(r.agenda)
  if (!resumen.servicios.length && !(resumen.modo === 'restaurante' && resumen.hay_mesas)) return { success: false, error: 'Este negocio todavía no tiene nada que reservar por internet.' }
  return { success: true, data: resumen }
}

export async function getHuecosPublicos(enlace: string, p: { servicio_id: string; fecha: string; personas?: number; recurso_id?: string | null; zona?: string | null; extras?: string[] }) {
  const r = await agendaPorEnlace(enlace)
  if (!r) return { success: false, error: 'Este enlace de reservas no está activo.' }
  if (!leerFecha(p.fecha)) return { success: false, error: 'Fecha no válida.' }
  const personas = Math.max(1, Math.min(500, Math.round(Number(p.personas) || 1)))
  const servicio = servicioPorId(r.agenda, p.servicio_id, personas)
  if (!servicio || (servicio.id !== ID_MESA && !servicio.reservable_online)) return { success: false, error: 'Ese servicio no se reserva por internet.' }
  if (p.recurso_id && !r.agenda.recursos.some(x => x.id === p.recurso_id && x.activo && x.elegible)) return { success: false, error: 'Ese profesional no se puede elegir.' }
  if (personas >= r.agenda.ajustes.grupo_grande_desde) return { success: true, data: { huecos: [], motivo: `Para ${r.agenda.ajustes.grupo_grande_desde} personas o más, escríbenos y lo organizamos contigo.`, grupo_grande: true } }
  const h = await huecosDelDia({ agenda: r.agenda, servicio, fecha: p.fecha, personas, recursoId: p.recurso_id || null, zona: p.zona || null, extras: p.extras || [] })
  return { success: true, data: { huecos: h.huecos, motivo: h.motivo } }
}

export interface DatosReservaPublica {
  servicio_id: string
  inicio: string
  personas?: number
  recurso_id?: string | null
  zona?: string | null
  extras?: string[]
  nombre: string
  telefono?: string | null
  email?: string | null
  peticiones?: string | null
  acepta: boolean
  // Trampa para robots: un campo que las personas no ven y no rellenan
  web?: string
}

function citaPublica(c: Cita, agenda: Agenda) {
  const recursos = (c.recursos || []).map(x => ({ nombre: x.nombre, tipo: x.tipo, zona: agenda.recursos.find(r => r.id === x.id)?.zona || null }))
  return {
    id: c.id,
    token: c.token_gestion,
    servicio: c.servicio_nombre,
    inicio: c.inicio,
    fin: c.fin,
    personas: c.personas,
    estado: c.estado,
    nombre: c.nombre_cliente,
    telefono: c.telefono,
    email: c.email,
    peticiones: c.peticiones,
    precio_estimado: c.precio_estimado,
    moneda: c.moneda,
    con: recursos.filter(x => x.tipo === 'persona').map(x => x.nombre).join(', ') || null,
    zona: [...new Set(recursos.filter(x => x.tipo === 'mesa').map(x => x.zona).filter(Boolean))].join(' + ') || null,
    zona_horaria: agenda.zona,
    negocio: agenda.negocio.nombre,
    direccion: agenda.negocio.direccion,
    cancelacion_horas: agenda.ajustes.cancelacion_horas
  }
}

export async function crearReservaPublica(enlace: string, d: DatosReservaPublica) {
  const r = await agendaPorEnlace(enlace)
  if (!r) return { success: false, error: 'Este enlace de reservas no está activo.' }
  // Un robot ha rellenado el campo invisible: se le dice que sí y no se hace nada
  if (d.web && String(d.web).trim()) return { success: false, error: 'No se ha podido hacer la reserva. Inténtalo de nuevo.' }
  if (!d.acepta) return { success: false, error: 'Tienes que aceptar la política de privacidad.' }
  const nombre = String(d.nombre || '').trim().slice(0, 80)
  if (nombre.length < 2) return { success: false, error: 'Dinos tu nombre.' }
  const telefono = completarTelefono(d.telefono, r.agenda.negocio.pais)
  const email = String(d.email || '').trim().toLowerCase()
  if (String(d.telefono || '').trim() && !telefono) return { success: false, error: 'El teléfono no parece correcto. Ponlo con el prefijo del país, por ejemplo +34 600 000 000.' }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: 'El correo no parece correcto.' }
  if (!telefono && !email) return { success: false, error: 'Necesitamos tu WhatsApp o tu correo para confirmarte la reserva.' }
  const personas = Math.max(1, Math.min(500, Math.round(Number(d.personas) || 1)))
  const servicio = servicioPorId(r.agenda, d.servicio_id, personas)
  if (!servicio || (servicio.id !== ID_MESA && !servicio.reservable_online)) return { success: false, error: 'Ese servicio no se reserva por internet.' }
  if (d.recurso_id && !r.agenda.recursos.some(x => x.id === d.recurso_id && x.activo && x.elegible)) return { success: false, error: 'Ese profesional no se puede elegir.' }
  if (personas >= r.agenda.ajustes.grupo_grande_desde) return { success: false, error: `Para ${r.agenda.ajustes.grupo_grande_desde} personas o más, escríbenos y lo organizamos contigo.` }

  const contacto = telefono
    ? await buscarOCrearContacto(r.tenant_id, 'whatsapp', telefono, nombre)
    : await buscarOCrearContacto(r.tenant_id, 'email', email, nombre)
  if (!contacto) return { success: false, error: 'No se ha podido guardar tu contacto. Inténtalo de nuevo.' }

  const res = await crearCita({
    tenant_id: r.tenant_id,
    branch_id: r.agenda.ajustes.branch_id,
    servicio_id: servicio.id,
    inicio: String(d.inicio || ''),
    personas,
    recurso_id: d.recurso_id || null,
    zona: d.zona || null,
    extras: Array.isArray(d.extras) ? d.extras.map(String).slice(0, 20) : [],
    contact_id: contacto.id,
    nombre_cliente: nombre,
    telefono,
    email: email || null,
    peticiones: String(d.peticiones || '').trim().slice(0, 300) || null,
    origen: 'enlace'
  })
  if (!res.ok) {
    if (res.codigo === 'limite') return { success: false, error: 'Ya tienes varias reservas activas con nosotros. Cambia o cancela alguna desde el enlace que te enviamos, o escríbenos.' }
    if (res.codigo === 'sin_hueco' || res.codigo === 'ocupado' || res.codigo === 'aforo') return { success: false, error: 'Ese hueco se acaba de ocupar. Elige otra hora, por favor.', volver_a_huecos: true }
    return { success: false, error: res.error }
  }
  return { success: true, data: citaPublica(res.cita, r.agenda) }
}

// --- Gestionar una reserva con su llave ------------------------------------
async function reservaPorToken(token: string): Promise<{ cita: Cita; agenda: Agenda } | null> {
  const cita = await citaPorToken(String(token || ''))
  if (!cita) return null
  const agenda = await cargarAgenda(cita.branch_id)
  if (!agenda) return null
  return { cita, agenda }
}

export async function getReservaPorToken(token: string) {
  const r = await reservaPorToken(token)
  if (!r) return { success: false, error: 'No encontramos esa reserva. Puede que el enlace no sea correcto.' }
  return { success: true, data: { ...citaPublica(r.cita, r.agenda), activa: ESTADOS_ACTIVOS.includes(r.cita.estado), en_plazo: new Date(r.cita.inicio).getTime() - Date.now() >= r.agenda.ajustes.cancelacion_horas * 3600 * 1000, hoy: diaEnZona(new Date(), r.agenda.zona), hasta: sumarDias(diaEnZona(new Date(), r.agenda.zona), r.agenda.ajustes.antelacion_maxima_dias) } }
}

export async function getHuecosPorToken(token: string, fecha: string) {
  const r = await reservaPorToken(token)
  if (!r) return { success: false, error: 'No encontramos esa reserva.' }
  if (!leerFecha(fecha)) return { success: false, error: 'Fecha no válida.' }
  const servicio = servicioPorId(r.agenda, r.cita.servicio_id, r.cita.personas)
  if (!servicio) return { success: false, error: 'Ese servicio ya no existe.' }
  const recursoActual = (r.cita.recursos || []).find(x => x.tipo === 'persona')?.id || null
  let h = await huecosDelDia({ agenda: r.agenda, servicio, fecha, personas: r.cita.personas, recursoId: recursoActual, extras: r.cita.extras, ignorarCitaId: r.cita.id })
  if (!h.huecos.length && recursoActual) h = await huecosDelDia({ agenda: r.agenda, servicio, fecha, personas: r.cita.personas, extras: r.cita.extras, ignorarCitaId: r.cita.id })
  return { success: true, data: { huecos: h.huecos, motivo: h.motivo } }
}

export async function moverReservaPorToken(token: string, inicio: string) {
  const r = await reservaPorToken(token)
  if (!r) return { success: false, error: 'No encontramos esa reserva.' }
  const res = await moverCita(r.cita.id, { inicio: String(inicio || ''), por: 'cliente', origen: 'enlace' })
  if (!res.ok) return { success: false, error: res.error, codigo: res.codigo }
  return { success: true, data: citaPublica(res.cita, r.agenda) }
}

export async function cancelarReservaPorToken(token: string) {
  const r = await reservaPorToken(token)
  if (!r) return { success: false, error: 'No encontramos esa reserva.' }
  const res = await cancelarCita(r.cita.id, { por: 'cliente', origen: 'enlace' })
  if (!res.ok) return { success: false, error: res.error, codigo: res.codigo }
  return { success: true, data: citaPublica(res.cita, r.agenda) }
}

// Para que un fallo inesperado quede registrado sin tumbar la página
export async function registrarFalloPublico(donde: string, detalle: string) {
  try {
    await registrarError({ origen: 'app', descripcion: `Fallo en el enlace público de reservas (${String(donde).slice(0, 40)})`, stacktrace: String(detalle).slice(0, 500) })
  } catch { /* nada */ }
  return { success: true }
}
