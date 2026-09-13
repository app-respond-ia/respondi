'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { getAuthContext } from '@/lib/auth-context'
import { sinPermiso } from '@/lib/permisos-servidor'
import { registrarAuditoria } from '@/lib/auditoria'
import { registrarError } from '@/lib/errores'
import { getMisPermisos } from '@/app/actions/permisos'
import { cargarAgenda, huecosDelDia, bloqueosEntre, servicioPorId } from '@/lib/agenda/disponibilidad'
import { crearCita, moverCita, cancelarCita, cambiarEstadoCita, buscarOCrearContacto, completarTelefono } from '@/lib/agenda/citas'
import { AJUSTES_POR_DEFECTO, PASOS_AGENDA, RECURSOS_MAXIMO, TIPOS_RECURSO, type AjustesAgenda, type EstadoCita, type HorarioRecurso } from '@/lib/agenda/tipos'
import { leerFecha } from '@/lib/agenda/tiempo'

// LA AGENDA DESDE EL PANEL: ajustes, recursos, bloqueos y citas.
// Permiso: sección "Agenda" (lectura para ver, escritura para tocar).

// Quién llama y en qué sucursal (con los tipos ya seguros)
async function sesion(): Promise<{ error: string } | { tenant_id: string; branch_id: string; user_id: string }> {
  const supabase = await createClient()
  const a: any = await getAuthContext(supabase)
  if (a.error) return { error: String(a.error) }
  return { tenant_id: String(a.tenant_id), branch_id: String(a.branch_id), user_id: String(a.user_id) }
}

async function nivelAgenda(): Promise<'ninguno' | 'lectura' | 'escritura'> {
  const permisos = await getMisPermisos()
  if (!permisos.success) return 'ninguno'
  if ((permisos as any).esAdmin) return 'escritura'
  return ((permisos.data || []).find((p: any) => p.seccion === 'agenda')?.nivel || 'ninguno') as any
}

export async function getAgenda() {
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  const nivel = await nivelAgenda()
  if (nivel === 'ninguno') return { success: false, error: 'No tienes acceso a la agenda.' }

  const agenda = await cargarAgenda(auth.branch_id)
  if (!agenda) return { success: false, error: 'No se ha encontrado la sucursal.' }
  const ahora = new Date()
  const bloqueos = await bloqueosEntre(auth.branch_id, new Date(ahora.getTime() - 7 * 24 * 3600 * 1000), new Date(ahora.getTime() + 120 * 24 * 3600 * 1000))
  // Todos los artículos de la lista, para elegir cuáles se reservan
  const { data: lista } = await supabaseAdmin
    .from('price_list')
    .select('id, nombre, tipo, precio, precio_tipo, moneda, reservable, duracion_minutos, disponible')
    .eq('branch_id', auth.branch_id)
    .order('nombre', { ascending: true })
  return {
    success: true,
    data: {
      ajustes: agenda.ajustes,
      zona: agenda.zona,
      negocio: agenda.negocio,
      recursos: agenda.recursos,
      servicios: agenda.servicios,
      lista: lista || [],
      vinculos: Object.fromEntries([...agenda.vinculos.entries()].map(([k, v]) => [k, [...v]])),
      vinculos_por_recurso: Object.fromEntries([...agenda.vinculosPorRecurso.entries()].map(([k, v]) => [k, [...v]])),
      combinaciones: agenda.combinaciones,
      horario_sucursal: agenda.horarioSucursal,
      bloqueos,
      nivel_permiso: nivel,
      tipos_recurso: TIPOS_RECURSO,
      pasos: PASOS_AGENDA
    }
  }
}

const CAMPOS_AJUSTES: (keyof AjustesAgenda)[] = [
  'activa', 'modo', 'paso_minutos', 'antelacion_minima_minutos', 'antelacion_maxima_dias', 'max_citas_activas_por_cliente',
  'confirmacion', 'grupo_grande_desde', 'cancelacion_horas', 'tiempo_cortesia_minutos', 'turnos', 'duracion_por_comensales',
  'aforo_por_turno', 'combinar_mesas', 'instrucciones_ia', 'enlace_publico', 'enlace_activo'
]

export async function guardarAjustesAgenda(cambios: Partial<AjustesAgenda>) {
  const denegado = await sinPermiso('agenda')
  if (denegado) return { success: false, error: denegado }
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }

  const fila: Record<string, any> = {}
  for (const k of CAMPOS_AJUSTES) if (cambios[k] !== undefined) fila[k] = cambios[k]
  if (fila.paso_minutos !== undefined && !PASOS_AGENDA.includes(Number(fila.paso_minutos))) return { success: false, error: 'El paso de la agenda tiene que ser 5, 10, 15, 20, 30 o 60 minutos.' }
  if (fila.modo !== undefined && !['servicios', 'restaurante'].includes(fila.modo)) return { success: false, error: 'Modo no válido.' }
  if (fila.confirmacion !== undefined && !['automatica', 'manual'].includes(fila.confirmacion)) return { success: false, error: 'Confirmación no válida.' }
  for (const k of ['antelacion_minima_minutos', 'antelacion_maxima_dias', 'max_citas_activas_por_cliente', 'grupo_grande_desde', 'cancelacion_horas', 'tiempo_cortesia_minutos']) {
    if (fila[k] !== undefined) {
      const n = Number(fila[k])
      if (!Number.isFinite(n) || n < 0) return { success: false, error: 'Hay un número que no es válido.' }
      fila[k] = Math.round(n)
    }
  }
  if (fila.aforo_por_turno !== undefined) fila.aforo_por_turno = fila.aforo_por_turno ? Math.max(1, Math.round(Number(fila.aforo_por_turno))) : null
  if (fila.enlace_publico !== undefined) {
    const limpio = String(fila.enlace_publico || '').toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
    fila.enlace_publico = limpio || null
    if (fila.enlace_publico && fila.enlace_publico.length < 3) return { success: false, error: 'El enlace tiene que tener al menos 3 letras.' }
  }
  if (fila.instrucciones_ia !== undefined) fila.instrucciones_ia = String(fila.instrucciones_ia || '').trim().slice(0, 1500) || null
  if (Array.isArray(fila.turnos)) {
    fila.turnos = fila.turnos.filter((t: any) => t && /^\d{2}:\d{2}$/.test(t.inicio || '') && /^\d{2}:\d{2}$/.test(t.fin || '')).slice(0, 6).map((t: any) => ({ nombre: String(t.nombre || 'Turno').slice(0, 30), inicio: t.inicio, fin: t.fin, ...(t.ultima_entrada ? { ultima_entrada: t.ultima_entrada } : {}) }))
  }
  if (Array.isArray(fila.duracion_por_comensales)) {
    fila.duracion_por_comensales = fila.duracion_por_comensales.filter((d: any) => d && Number(d.hasta_personas) > 0 && Number(d.minutos) > 0).slice(0, 10).map((d: any) => ({ hasta_personas: Math.round(Number(d.hasta_personas)), minutos: Math.round(Number(d.minutos)) })).sort((a: any, b: any) => a.hasta_personas - b.hasta_personas)
  }

  const { data: anterior } = await supabaseAdmin.from('agenda_ajustes').select('*').eq('branch_id', auth.branch_id).maybeSingle()
  const { data, error } = await supabaseAdmin
    .from('agenda_ajustes')
    .upsert({ ...(anterior ? {} : AJUSTES_POR_DEFECTO), ...(anterior || {}), ...fila, branch_id: auth.branch_id, tenant_id: auth.tenant_id, actualizado_en: new Date().toISOString() }, { onConflict: 'branch_id' })
    .select('*')
    .single()
  if (error) {
    if (/agenda_ajustes_enlace_unico/.test(error.message)) return { success: false, error: 'Ese enlace ya lo usa otro negocio. Elige otro.' }
    await registrarError({ origen: 'app', descripcion: 'No se han podido guardar los ajustes de la agenda', stacktrace: JSON.stringify({ error: error.message }), tenant_id: auth.tenant_id })
    return { success: false, error: error.message }
  }
  await registrarAuditoria({ tenant_id: auth.tenant_id, user_id: auth.user_id, accion: 'cambió los ajustes de la agenda', tabla_afectada: 'agenda_ajustes', registro_id: auth.branch_id, valor_anterior: anterior, valor_nuevo: data })
  return { success: true, data }
}

export interface DatosRecurso {
  id?: string
  nombre: string
  tipo: string
  capacidad_min?: number
  capacidad_max?: number
  zona?: string | null
  color?: string | null
  orden?: number
  activo?: boolean
  usa_horario_sucursal?: boolean
  elegible?: boolean
  notas?: string | null
  horarios?: HorarioRecurso[]
  // Servicios que puede hacer (ids de la lista de precios). Vacío = todos los de su tipo.
  servicios?: string[]
}

export async function guardarRecurso(datos: DatosRecurso) {
  const denegado = await sinPermiso('agenda')
  if (denegado) return { success: false, error: denegado }
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }

  const nombre = String(datos.nombre || '').trim().slice(0, 80)
  if (!nombre) return { success: false, error: 'El nombre es obligatorio.' }
  if (!TIPOS_RECURSO.some(t => t.valor === datos.tipo)) return { success: false, error: 'Tipo de recurso no válido.' }
  const capMin = Math.max(1, Math.round(Number(datos.capacidad_min ?? 1)))
  const capMax = Math.max(capMin, Math.round(Number(datos.capacidad_max ?? capMin)))
  const horarios = (datos.horarios || []).filter(h => h && h.dia_semana >= 0 && h.dia_semana <= 6 && /^\d{2}:\d{2}$/.test(h.apertura) && /^\d{2}:\d{2}$/.test(h.cierre) && h.cierre > h.apertura).slice(0, 21)

  const fila = {
    tenant_id: auth.tenant_id,
    branch_id: auth.branch_id,
    nombre,
    tipo: datos.tipo,
    capacidad_min: capMin,
    capacidad_max: capMax,
    zona: String(datos.zona || '').trim().slice(0, 40) || null,
    color: String(datos.color || '').trim().slice(0, 20) || null,
    orden: Math.round(Number(datos.orden || 0)),
    activo: datos.activo !== false,
    usa_horario_sucursal: datos.usa_horario_sucursal !== false || horarios.length === 0,
    elegible: datos.elegible !== false,
    notas: String(datos.notas || '').trim().slice(0, 500) || null,
    actualizado_en: new Date().toISOString()
  }

  let id = datos.id
  let anterior: any = null
  if (id) {
    const { data: previo } = await supabaseAdmin.from('recursos').select('*').eq('id', id).eq('branch_id', auth.branch_id).maybeSingle()
    if (!previo) return { success: false, error: 'Ese recurso no existe.' }
    anterior = previo
    const { error } = await supabaseAdmin.from('recursos').update(fila).eq('id', id)
    if (error) return { success: false, error: error.message }
  } else {
    const { count } = await supabaseAdmin.from('recursos').select('id', { count: 'exact', head: true }).eq('branch_id', auth.branch_id)
    if ((count || 0) >= RECURSOS_MAXIMO) return { success: false, error: `Como mucho ${RECURSOS_MAXIMO} recursos por sucursal.` }
    const { data, error } = await supabaseAdmin.from('recursos').insert(fila).select('id').single()
    if (error || !data) return { success: false, error: error?.message || 'No se ha podido crear el recurso.' }
    id = data.id
  }

  // Horario propio y servicios que hace: se sustituyen enteros
  await supabaseAdmin.from('recursos_horarios').delete().eq('recurso_id', id)
  if (horarios.length && !fila.usa_horario_sucursal) {
    await supabaseAdmin.from('recursos_horarios').insert(horarios.map((h, i) => ({ tenant_id: auth.tenant_id, branch_id: auth.branch_id, recurso_id: id, dia_semana: h.dia_semana, apertura: h.apertura, cierre: h.cierre, orden: h.orden ?? i })))
  }
  if (datos.servicios !== undefined) {
    await supabaseAdmin.from('recursos_servicios').delete().eq('recurso_id', id)
    const ids = [...new Set((datos.servicios || []).filter(Boolean))].slice(0, 200)
    if (ids.length) {
      const { data: validos } = await supabaseAdmin.from('price_list').select('id').eq('branch_id', auth.branch_id).in('id', ids)
      const filas = (validos || []).map((v: any) => ({ tenant_id: auth.tenant_id, branch_id: auth.branch_id, recurso_id: id, precio_id: v.id }))
      if (filas.length) await supabaseAdmin.from('recursos_servicios').insert(filas)
    }
  }

  await registrarAuditoria({ tenant_id: auth.tenant_id, user_id: auth.user_id, accion: `${anterior ? 'editó' : 'añadió'} el recurso "${nombre}" de la agenda`, tabla_afectada: 'recursos', registro_id: id, valor_anterior: anterior, valor_nuevo: fila })
  return { success: true, data: { id } }
}

export async function borrarRecurso(id: string) {
  const denegado = await sinPermiso('agenda')
  if (denegado) return { success: false, error: denegado }
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  const { data: recurso } = await supabaseAdmin.from('recursos').select('*').eq('id', id).eq('branch_id', auth.branch_id).maybeSingle()
  if (!recurso) return { success: false, error: 'Ese recurso no existe.' }
  // Con citas futuras no se borra: se desactiva (las citas se quedarían sin nadie)
  const { count } = await supabaseAdmin.from('citas_recursos').select('id', { count: 'exact', head: true }).eq('recurso_id', id).gte('hasta', new Date().toISOString())
  if ((count || 0) > 0) return { success: false, error: `Tiene ${count} ${count === 1 ? 'cita futura' : 'citas futuras'}. Muévelas o cancélalas antes, o desactívalo en vez de borrarlo.` }
  const { error } = await supabaseAdmin.from('recursos').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await registrarAuditoria({ tenant_id: auth.tenant_id, user_id: auth.user_id, accion: `borró el recurso "${recurso.nombre}" de la agenda`, tabla_afectada: 'recursos', registro_id: id, valor_anterior: recurso })
  return { success: true }
}

export async function crearBloqueo(datos: { recurso_id?: string | null; desde: string; hasta: string; motivo?: string | null }) {
  const denegado = await sinPermiso('agenda')
  if (denegado) return { success: false, error: denegado }
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  const desde = new Date(datos.desde), hasta = new Date(datos.hasta)
  if (isNaN(desde.getTime()) || isNaN(hasta.getTime()) || hasta <= desde) return { success: false, error: 'El bloqueo tiene que acabar después de empezar.' }
  if (datos.recurso_id) {
    const { data: r } = await supabaseAdmin.from('recursos').select('id').eq('id', datos.recurso_id).eq('branch_id', auth.branch_id).maybeSingle()
    if (!r) return { success: false, error: 'Ese recurso no existe.' }
  }
  const { data, error } = await supabaseAdmin
    .from('agenda_bloqueos')
    .insert({ tenant_id: auth.tenant_id, branch_id: auth.branch_id, recurso_id: datos.recurso_id || null, desde: desde.toISOString(), hasta: hasta.toISOString(), motivo: String(datos.motivo || '').trim().slice(0, 120) || null, creado_por: auth.user_id })
    .select('*')
    .single()
  if (error) return { success: false, error: error.message }
  await registrarAuditoria({ tenant_id: auth.tenant_id, user_id: auth.user_id, accion: `bloqueó la agenda${datos.motivo ? ` (${datos.motivo})` : ''}`, tabla_afectada: 'agenda_bloqueos', registro_id: data.id, valor_nuevo: data })
  return { success: true, data }
}

export async function borrarBloqueo(id: string) {
  const denegado = await sinPermiso('agenda')
  if (denegado) return { success: false, error: denegado }
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  const { data: bloqueo } = await supabaseAdmin.from('agenda_bloqueos').select('*').eq('id', id).eq('branch_id', auth.branch_id).maybeSingle()
  if (!bloqueo) return { success: false, error: 'Ese bloqueo no existe.' }
  await supabaseAdmin.from('agenda_bloqueos').delete().eq('id', id)
  await registrarAuditoria({ tenant_id: auth.tenant_id, user_id: auth.user_id, accion: 'quitó un bloqueo de la agenda', tabla_afectada: 'agenda_bloqueos', registro_id: id, valor_anterior: bloqueo })
  return { success: true }
}

// Las citas entre dos instantes, con sus recursos
export async function getCitas(desde: string, hasta: string) {
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  if ((await nivelAgenda()) === 'ninguno') return { success: false, error: 'No tienes acceso a la agenda.' }
  const d = new Date(desde), h = new Date(hasta)
  if (isNaN(d.getTime()) || isNaN(h.getTime())) return { success: false, error: 'Fechas no válidas.' }
  const { data: citas, error } = await supabaseAdmin
    .from('citas')
    .select('*, citas_recursos(recurso_id)')
    .eq('branch_id', auth.branch_id)
    .lt('inicio', h.toISOString())
    .gt('fin', d.toISOString())
    .order('inicio', { ascending: true })
    .limit(1000)
  if (error) return { success: false, error: error.message }
  const bloqueos = await bloqueosEntre(auth.branch_id, d, h)
  return {
    success: true,
    data: {
      citas: (citas || []).map((c: any) => ({ ...c, recurso_ids: [...new Set((c.citas_recursos || []).map((x: any) => x.recurso_id))], citas_recursos: undefined })),
      bloqueos
    }
  }
}

export async function getHuecos(p: { servicio_id: string; fecha: string; personas?: number; recurso_id?: string | null; extras?: string[]; sin_reglas?: boolean; ignorar_cita_id?: string | null; zona?: string | null }) {
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  if ((await nivelAgenda()) === 'ninguno') return { success: false, error: 'No tienes acceso a la agenda.' }
  if (!leerFecha(p.fecha)) return { success: false, error: 'Fecha no válida.' }
  const agenda = await cargarAgenda(auth.branch_id)
  if (!agenda) return { success: false, error: 'No se ha encontrado la sucursal.' }
  const servicio = servicioPorId(agenda, p.servicio_id, Number(p.personas) || 1)
  if (!servicio) return { success: false, error: 'Ese servicio no se puede reservar.' }
  const r = await huecosDelDia({ agenda, servicio, fecha: p.fecha, personas: p.personas, recursoId: p.recurso_id, extras: p.extras, sinReglas: !!p.sin_reglas, ignorarCitaId: p.ignorar_cita_id, zona: p.zona })
  return { success: true, data: { huecos: r.huecos, motivo: r.motivo, zona: agenda.zona } }
}

export interface DatosCitaPanel {
  servicio_id: string
  inicio: string
  personas?: number
  recurso_id?: string | null
  extras?: string[]
  nombre?: string | null
  telefono?: string | null
  email?: string | null
  notas?: string | null
  peticiones?: string | null
  forzar?: boolean
  // "en_curso" = sentar a quien acaba de entrar sin reserva
  estado?: 'pendiente' | 'confirmada' | 'en_curso'
  zona?: string | null
}

export async function crearCitaPanel(d: DatosCitaPanel) {
  const denegado = await sinPermiso('agenda')
  if (denegado) return { success: false, error: denegado }
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }

  const { data: sucursal } = await supabaseAdmin.from('sucursales').select('pais').eq('id', auth.branch_id).maybeSingle()
  const telefono = completarTelefono(d.telefono, sucursal?.pais)
  const email = String(d.email || '').trim().toLowerCase() || null
  if (String(d.telefono || '').trim() && !telefono) return { success: false, error: 'El teléfono no parece correcto (con prefijo, por ejemplo +34...).' }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: 'El correo no parece correcto.' }
  let contacto: { id: string } | null = null
  if (telefono) contacto = await buscarOCrearContacto(auth.tenant_id, 'whatsapp', telefono, d.nombre)
  else if (email) contacto = await buscarOCrearContacto(auth.tenant_id, 'email', email, d.nombre)

  const r = await crearCita({
    tenant_id: auth.tenant_id,
    branch_id: auth.branch_id,
    servicio_id: d.servicio_id,
    inicio: d.inicio,
    personas: d.personas,
    recurso_id: d.recurso_id,
    extras: d.extras,
    contact_id: contacto?.id || null,
    nombre_cliente: String(d.nombre || '').trim().slice(0, 80) || null,
    telefono,
    email,
    notas: String(d.notas || '').trim().slice(0, 500) || null,
    peticiones: String(d.peticiones || '').trim().slice(0, 300) || null,
    origen: 'panel',
    creado_por: auth.user_id,
    forzar: d.forzar !== false,
    estado: d.estado,
    zona: d.zona || null
  })
  if (!r.ok) return { success: false, error: r.error, codigo: r.codigo }
  await registrarAuditoria({ tenant_id: auth.tenant_id, user_id: auth.user_id, accion: `creó una cita de "${r.cita.servicio_nombre}" para ${r.cita.nombre_cliente || 'un cliente'}`, tabla_afectada: 'citas', registro_id: r.cita.id, valor_nuevo: r.cita })
  return { success: true, data: r.cita }
}

export async function moverCitaPanel(id: string, d: { inicio: string; recurso_id?: string | null; forzar?: boolean }) {
  const denegado = await sinPermiso('agenda')
  if (denegado) return { success: false, error: denegado }
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  const { data: cita } = await supabaseAdmin.from('citas').select('id, inicio').eq('id', id).eq('branch_id', auth.branch_id).maybeSingle()
  if (!cita) return { success: false, error: 'Esa cita no existe.' }
  const r = await moverCita(id, { inicio: d.inicio, recurso_id: d.recurso_id, por: 'negocio', origen: 'panel', usuario_id: auth.user_id, forzar: d.forzar !== false })
  if (!r.ok) return { success: false, error: r.error, codigo: r.codigo }
  await registrarAuditoria({ tenant_id: auth.tenant_id, user_id: auth.user_id, accion: `movió una cita de "${r.cita.servicio_nombre}"`, tabla_afectada: 'citas', registro_id: id, valor_anterior: { inicio: cita.inicio }, valor_nuevo: { inicio: r.cita.inicio } })
  return { success: true, data: r.cita }
}

export async function cancelarCitaPanel(id: string, motivo?: string | null) {
  const denegado = await sinPermiso('agenda')
  if (denegado) return { success: false, error: denegado }
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  const { data: cita } = await supabaseAdmin.from('citas').select('id').eq('id', id).eq('branch_id', auth.branch_id).maybeSingle()
  if (!cita) return { success: false, error: 'Esa cita no existe.' }
  const r = await cancelarCita(id, { por: 'negocio', motivo: String(motivo || '').trim().slice(0, 200) || null, origen: 'panel', usuario_id: auth.user_id })
  if (!r.ok) return { success: false, error: r.error, codigo: r.codigo }
  await registrarAuditoria({ tenant_id: auth.tenant_id, user_id: auth.user_id, accion: `canceló una cita de "${r.cita.servicio_nombre}"`, tabla_afectada: 'citas', registro_id: id, valor_nuevo: { estado: r.cita.estado, motivo } })
  return { success: true, data: r.cita }
}

export async function cambiarEstadoCitaPanel(id: string, estado: 'confirmada' | 'en_curso' | 'completada' | 'no_presentado') {
  const denegado = await sinPermiso('agenda')
  if (denegado) return { success: false, error: denegado }
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  const { data: cita } = await supabaseAdmin.from('citas').select('id').eq('id', id).eq('branch_id', auth.branch_id).maybeSingle()
  if (!cita) return { success: false, error: 'Esa cita no existe.' }
  const r = await cambiarEstadoCita(id, estado, { origen: 'panel', usuario_id: auth.user_id })
  if (!r.ok) return { success: false, error: r.error, codigo: r.codigo }
  await registrarAuditoria({ tenant_id: auth.tenant_id, user_id: auth.user_id, accion: `marcó una cita de "${r.cita.servicio_nombre}" como ${estado.replace('_', ' ')}`, tabla_afectada: 'citas', registro_id: id, valor_nuevo: { estado } })
  return { success: true, data: r.cita }
}

export async function getHistorialCita(id: string) {
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  if ((await nivelAgenda()) === 'ninguno') return { success: false, error: 'No tienes acceso a la agenda.' }
  const { data } = await supabaseAdmin
    .from('citas_historial')
    .select('cambio, detalle, origen, usuario_id, created_at')
    .eq('cita_id', id)
    .eq('branch_id', auth.branch_id)
    .order('created_at', { ascending: true })
  return { success: true, data: data || [] }
}

// Cuántas citas hay hoy y cuántas pendientes de confirmar (para la cabecera)
export async function getResumenAgenda() {
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  const { count: pendientes } = await supabaseAdmin.from('citas').select('id', { count: 'exact', head: true }).eq('branch_id', auth.branch_id).eq('estado', 'pendiente').gte('fin', new Date().toISOString())
  const estados: EstadoCita[] = ['pendiente', 'confirmada', 'en_curso']
  const { count: proximas } = await supabaseAdmin.from('citas').select('id', { count: 'exact', head: true }).eq('branch_id', auth.branch_id).in('estado', estados).gte('fin', new Date().toISOString()).lt('inicio', new Date(Date.now() + 24 * 3600 * 1000).toISOString())
  return { success: true, data: { pendientes: pendientes || 0, proximas_24h: proximas || 0 } }
}

// ---------------------------------------------------------------------------
// Restaurante: mesas que se juntan
// ---------------------------------------------------------------------------
export async function guardarCombinacion(datos: { id?: string; nombre: string; recurso_ids: string[]; capacidad_min: number; capacidad_max: number; activa?: boolean }) {
  const denegado = await sinPermiso('agenda')
  if (denegado) return { success: false, error: denegado }
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  const ids = [...new Set((datos.recurso_ids || []).filter(Boolean))]
  if (ids.length < 2) return { success: false, error: 'Una combinación necesita al menos dos mesas.' }
  const { data: mesas } = await supabaseAdmin.from('recursos').select('id, nombre, tipo').eq('branch_id', auth.branch_id).in('id', ids)
  if ((mesas || []).length !== ids.length || (mesas || []).some((m: any) => m.tipo !== 'mesa')) return { success: false, error: 'Todas tienen que ser mesas de esta sucursal.' }
  const capMin = Math.max(1, Math.round(Number(datos.capacidad_min || 1)))
  const capMax = Math.max(capMin, Math.round(Number(datos.capacidad_max || capMin)))
  const nombre = String(datos.nombre || '').trim().slice(0, 60) || (mesas || []).map((m: any) => m.nombre).join(' + ')
  const fila = { tenant_id: auth.tenant_id, branch_id: auth.branch_id, nombre, recurso_ids: ids, capacidad_min: capMin, capacidad_max: capMax, activa: datos.activa !== false }
  let id = datos.id
  if (id) {
    const { error } = await supabaseAdmin.from('recursos_combinaciones').update(fila).eq('id', id).eq('branch_id', auth.branch_id)
    if (error) return { success: false, error: error.message }
  } else {
    const { data, error } = await supabaseAdmin.from('recursos_combinaciones').insert(fila).select('id').single()
    if (error || !data) return { success: false, error: error?.message || 'No se ha podido crear.' }
    id = data.id
  }
  await registrarAuditoria({ tenant_id: auth.tenant_id, user_id: auth.user_id, accion: `${datos.id ? 'editó' : 'añadió'} la combinación de mesas "${nombre}"`, tabla_afectada: 'recursos_combinaciones', registro_id: id, valor_nuevo: fila })
  return { success: true, data: { id } }
}

export async function borrarCombinacion(id: string) {
  const denegado = await sinPermiso('agenda')
  if (denegado) return { success: false, error: denegado }
  const auth = await sesion()
  if ('error' in auth) return { success: false, error: auth.error }
  const { data: c } = await supabaseAdmin.from('recursos_combinaciones').select('*').eq('id', id).eq('branch_id', auth.branch_id).maybeSingle()
  if (!c) return { success: false, error: 'Esa combinación no existe.' }
  await supabaseAdmin.from('recursos_combinaciones').delete().eq('id', id)
  await registrarAuditoria({ tenant_id: auth.tenant_id, user_id: auth.user_id, accion: `borró la combinación de mesas "${c.nombre}"`, tabla_afectada: 'recursos_combinaciones', registro_id: id, valor_anterior: c })
  return { success: true }
}
