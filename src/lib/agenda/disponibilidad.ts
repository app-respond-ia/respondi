import { supabaseAdmin } from '@/utils/supabase/admin'
import { AJUSTES_POR_DEFECTO, ESTADOS_ACTIVOS, ID_MESA, type AjustesAgenda, type Bloqueo, type Combinacion, type Hueco, type HorarioRecurso, type Recurso, type Servicio } from './tipos'
import { instanteLocal, leerFecha, minutosDeHora, partesEnZona, seSolapan, sumarDias, zonaValida } from './tiempo'

// CÁLCULO DE HUECOS.
//
// Un hueco es una hora de inicio en la que el servicio cabe entero: todos los
// tramos que ocupa (antes, el servicio menos sus huecos internos, después)
// caen dentro del horario del recurso, no pisan ningún bloqueo ni ninguna
// cita, y respetan la antelación mínima y máxima. Si el servicio necesita
// varios recursos, hacen falta tantos libres como pida.
//
// Todo se calcula en la zona horaria de la sucursal y se devuelve en UTC.

export interface Agenda {
  ajustes: AjustesAgenda
  zona: string
  recursos: Recurso[]
  horarioSucursal: HorarioRecurso[]
  servicios: Servicio[]
  // Qué recursos pueden hacer cada servicio (por servicio, para la pantalla)
  vinculos: Map<string, Set<string>>
  // Y al revés: qué servicios hace cada recurso. Un recurso sin entradas
  // hace todos los de su tipo; con entradas, solo esos.
  vinculosPorRecurso: Map<string, Set<string>>
  // Restaurante: mesas que se pueden juntar
  combinaciones: Combinacion[]
  negocio: { nombre: string; direccion: string | null; moneda: string }
}

export interface Tramo { desde: Date; hasta: Date }

interface Ocupacion { recurso_id: string; desde: Date; hasta: Date; grupo: string; cita_id: string }

export function servicioDeFila(f: any): Servicio {
  return {
    id: f.id,
    nombre: f.nombre,
    tipo: f.tipo,
    precio: f.precio === null || f.precio === undefined ? null : Number(f.precio),
    precio_tipo: f.precio_tipo,
    moneda: f.moneda || null,
    descripcion: f.descripcion || null,
    disponible: f.disponible !== false,
    visible_ia: f.visible_ia !== false,
    reservable: !!f.reservable,
    duracion_minutos: f.duracion_minutos ? Number(f.duracion_minutos) : null,
    tiempo_antes_minutos: Number(f.tiempo_antes_minutos || 0),
    tiempo_despues_minutos: Number(f.tiempo_despues_minutos || 0),
    huecos_internos: Array.isArray(f.huecos_internos) ? f.huecos_internos.filter((h: any) => h && Number(h.minutos) > 0).map((h: any) => ({ desde_minuto: Number(h.desde_minuto || 0), minutos: Number(h.minutos) })) : [],
    tipo_recurso: f.tipo_recurso || null,
    recursos_necesarios: Math.max(1, Number(f.recursos_necesarios || 1)),
    aforo: f.aforo ? Number(f.aforo) : null,
    precio_por_persona: !!f.precio_por_persona,
    extras: Array.isArray(f.extras) ? f.extras.filter((e: any) => e && e.nombre).map((e: any) => ({ nombre: String(e.nombre), precio: e.precio !== undefined && e.precio !== null ? Number(e.precio) : undefined, minutos: e.minutos ? Number(e.minutos) : undefined })) : [],
    cancelacion_horas: f.cancelacion_horas === null || f.cancelacion_horas === undefined ? null : Number(f.cancelacion_horas),
    confirmacion: f.confirmacion || null,
    reservable_online: f.reservable_online !== false
  }
}

export function ajustesDeFila(f: any, branchId: string, tenantId: string): AjustesAgenda {
  return {
    ...AJUSTES_POR_DEFECTO,
    ...(f || {}),
    branch_id: branchId,
    tenant_id: tenantId,
    turnos: Array.isArray(f?.turnos) ? f.turnos : [],
    duracion_por_comensales: Array.isArray(f?.duracion_por_comensales) ? f.duracion_por_comensales : []
  }
}

// Toda la agenda de una sucursal, de una vez (ajustes, recursos con horario,
// servicios reservables, horario del negocio)
export async function cargarAgenda(branchId: string): Promise<Agenda | null> {
  const { data: sucursal } = await supabaseAdmin
    .from('sucursales')
    .select('id, tenant_id, nombre, direccion, timezone, moneda')
    .eq('id', branchId)
    .maybeSingle()
  if (!sucursal) return null

  const [{ data: ajustes }, { data: recursos }, { data: horarios }, { data: horarioSucursal }, { data: servicios }, { data: vinculos }, { data: combinaciones }] = await Promise.all([
    supabaseAdmin.from('agenda_ajustes').select('*').eq('branch_id', branchId).maybeSingle(),
    supabaseAdmin.from('recursos').select('*').eq('branch_id', branchId).order('orden', { ascending: true }).order('created_at', { ascending: true }),
    supabaseAdmin.from('recursos_horarios').select('recurso_id, dia_semana, apertura, cierre, orden').eq('branch_id', branchId),
    supabaseAdmin.from('business_hours').select('dia_semana, apertura, cierre, cerrado, orden').eq('branch_id', branchId).eq('tipo', 'negocio'),
    supabaseAdmin.from('price_list').select('*').eq('branch_id', branchId).eq('reservable', true),
    supabaseAdmin.from('recursos_servicios').select('recurso_id, precio_id').eq('branch_id', branchId),
    supabaseAdmin.from('recursos_combinaciones').select('id, nombre, recurso_ids, capacidad_min, capacidad_max, activa').eq('branch_id', branchId).order('capacidad_max', { ascending: true })
  ])

  const porRecurso = new Map<string, HorarioRecurso[]>()
  for (const h of horarios || []) {
    const lista = porRecurso.get(h.recurso_id) || []
    lista.push({ dia_semana: h.dia_semana, apertura: String(h.apertura).slice(0, 5), cierre: String(h.cierre).slice(0, 5), orden: h.orden })
    porRecurso.set(h.recurso_id, lista)
  }
  const mapaVinculos = new Map<string, Set<string>>()
  const porRecursoVinculos = new Map<string, Set<string>>()
  for (const v of vinculos || []) {
    const s = mapaVinculos.get(v.precio_id) || new Set<string>()
    s.add(v.recurso_id)
    mapaVinculos.set(v.precio_id, s)
    const r = porRecursoVinculos.get(v.recurso_id) || new Set<string>()
    r.add(v.precio_id)
    porRecursoVinculos.set(v.recurso_id, r)
  }

  return {
    ajustes: ajustesDeFila(ajustes, branchId, sucursal.tenant_id),
    zona: zonaValida(sucursal.timezone),
    recursos: (recursos || []).map((r: any) => ({ ...r, horarios: porRecurso.get(r.id) || [] })),
    horarioSucursal: (horarioSucursal || []).filter((h: any) => !h.cerrado && h.apertura && h.cierre).map((h: any) => ({ dia_semana: h.dia_semana, apertura: String(h.apertura).slice(0, 5), cierre: String(h.cierre).slice(0, 5), orden: h.orden })),
    servicios: (servicios || []).map(servicioDeFila),
    vinculos: mapaVinculos,
    vinculosPorRecurso: porRecursoVinculos,
    combinaciones: (combinaciones || []) as Combinacion[],
    negocio: { nombre: sucursal.nombre, direccion: sucursal.direccion || null, moneda: sucursal.moneda || 'EUR' }
  }
}

// ---------------------------------------------------------------------------
// Restaurante: el "servicio" es la mesa
// ---------------------------------------------------------------------------
export function esRestaurante(agenda: Agenda) {
  return agenda.ajustes.modo === 'restaurante'
}

// Cuánto dura una mesa según los comensales (los tramos del ajuste; si no hay, 90 min)
export function duracionMesa(agenda: Agenda, personas: number) {
  const tramos = [...(agenda.ajustes.duracion_por_comensales || [])].sort((a, b) => a.hasta_personas - b.hasta_personas)
  const tramo = tramos.find(t => personas <= t.hasta_personas) || tramos[tramos.length - 1]
  return tramo?.minutos || 90
}

export function servicioMesa(agenda: Agenda, personas: number): Servicio {
  const n = Math.max(1, Math.round(personas || 1))
  return {
    id: ID_MESA,
    nombre: `Mesa para ${n}`,
    tipo: 'servicio',
    precio: null,
    precio_tipo: 'consultar',
    moneda: agenda.negocio.moneda,
    descripcion: null,
    disponible: true,
    visible_ia: true,
    reservable: true,
    duracion_minutos: duracionMesa(agenda, n),
    tiempo_antes_minutos: 0,
    tiempo_despues_minutos: 0,
    huecos_internos: [],
    tipo_recurso: 'mesa',
    recursos_necesarios: 1,
    aforo: null,
    precio_por_persona: false,
    extras: [],
    cancelacion_horas: null,
    confirmacion: null,
    reservable_online: true
  }
}

// El servicio por su id; en un restaurante, sin id (o "mesa") es la mesa
export function servicioPorId(agenda: Agenda, id: string | null | undefined, personas = 1): Servicio | null {
  if (esRestaurante(agenda) && (!id || id === ID_MESA)) return servicioMesa(agenda, personas)
  return agenda.servicios.find(s => s.id === id) || null
}

// Cuánto dura el servicio para el cliente, con sus extras
export function duracionServicio(servicio: Servicio, extras: string[] = []) {
  const base = servicio.duracion_minutos || 30
  const deExtras = extras.reduce((n, nombre) => {
    const e = servicio.extras.find(x => x.nombre.toLowerCase() === nombre.toLowerCase())
    return n + (e?.minutos || 0)
  }, 0)
  return base + deExtras
}

// Lo que ocupa de verdad un recurso con este servicio empezando a `inicio`:
// tiempo antes + el servicio (menos sus huecos internos) + tiempo después.
export function patronOcupacion(servicio: Servicio, inicio: Date, extras: string[] = []): { fin: Date; tramos: Tramo[] } {
  const duracion = duracionServicio(servicio, extras)
  const t0 = inicio.getTime()
  const fin = new Date(t0 + duracion * 60000)
  // El servicio en sí, quitando los huecos internos (en minutos desde el inicio)
  const libres = servicio.huecos_internos
    .map(h => ({ desde: Math.max(0, h.desde_minuto), hasta: Math.min(duracion, h.desde_minuto + h.minutos) }))
    .filter(h => h.hasta > h.desde)
    .sort((a, b) => a.desde - b.desde)
  const tramos: Tramo[] = []
  let cursor = -servicio.tiempo_antes_minutos
  for (const libre of libres) {
    if (libre.desde > cursor) tramos.push({ desde: new Date(t0 + cursor * 60000), hasta: new Date(t0 + libre.desde * 60000) })
    cursor = Math.max(cursor, libre.hasta)
  }
  const final = duracion + servicio.tiempo_despues_minutos
  if (final > cursor) tramos.push({ desde: new Date(t0 + cursor * 60000), hasta: new Date(t0 + final * 60000) })
  return { fin, tramos }
}

// Las franjas en las que un recurso está abierto ese día (en UTC)
export function franjasAbiertas(agenda: Agenda, recurso: Recurso, fecha: { anio: number; mes: number; dia: number }): Tramo[] {
  const diaSemana = new Date(Date.UTC(fecha.anio, fecha.mes - 1, fecha.dia)).getUTCDay()
  const horario = recurso.usa_horario_sucursal || !(recurso.horarios || []).length ? agenda.horarioSucursal : (recurso.horarios || [])
  const franjas: Tramo[] = []
  for (const h of horario.filter(x => x.dia_semana === diaSemana)) {
    const a = minutosDeHora(h.apertura), c = minutosDeHora(h.cierre)
    const desde = instanteLocal(agenda.zona, fecha.anio, fecha.mes, fecha.dia, Math.floor(a / 60), a % 60)
    // Si cierra "antes" de abrir, cierra al día siguiente (22:00 → 02:00)
    const siguiente = c <= a ? leerFecha(sumarDias(`${fecha.anio}-${String(fecha.mes).padStart(2, '0')}-${String(fecha.dia).padStart(2, '0')}`, 1))! : fecha
    const hasta = instanteLocal(agenda.zona, siguiente.anio, siguiente.mes, siguiente.dia, Math.floor(c / 60), c % 60)
    if (hasta > desde) franjas.push({ desde, hasta })
  }
  return franjas.sort((x, y) => x.desde.getTime() - y.desde.getTime())
}

// Quitar los bloqueos de las franjas abiertas
export function restarTramos(franjas: Tramo[], quitar: Tramo[]): Tramo[] {
  let resultado = franjas.map(f => ({ ...f }))
  for (const q of quitar) {
    const siguiente: Tramo[] = []
    for (const f of resultado) {
      if (!seSolapan(f.desde.getTime(), f.hasta.getTime(), q.desde.getTime(), q.hasta.getTime())) { siguiente.push(f); continue }
      if (q.desde > f.desde) siguiente.push({ desde: f.desde, hasta: q.desde })
      if (q.hasta < f.hasta) siguiente.push({ desde: q.hasta, hasta: f.hasta })
    }
    resultado = siguiente
  }
  return resultado
}

function dentroDeAlguna(tramos: Tramo[], franjas: Tramo[]) {
  return tramos.every(t => franjas.some(f => t.desde >= f.desde && t.hasta <= f.hasta))
}

export async function bloqueosEntre(branchId: string, desde: Date, hasta: Date): Promise<Bloqueo[]> {
  const { data } = await supabaseAdmin
    .from('agenda_bloqueos')
    .select('id, branch_id, recurso_id, desde, hasta, motivo')
    .eq('branch_id', branchId)
    .lt('desde', hasta.toISOString())
    .gt('hasta', desde.toISOString())
  return (data || []) as Bloqueo[]
}

export async function ocupacionEntre(branchId: string, desde: Date, hasta: Date, ignorarCitaId?: string | null): Promise<Ocupacion[]> {
  let consulta = supabaseAdmin
    .from('citas_recursos')
    .select('recurso_id, desde, hasta, grupo, cita_id')
    .eq('branch_id', branchId)
    .lt('desde', hasta.toISOString())
    .gt('hasta', desde.toISOString())
  if (ignorarCitaId) consulta = consulta.neq('cita_id', ignorarCitaId)
  const { data } = await consulta
  return (data || []).map((o: any) => ({ ...o, desde: new Date(o.desde), hasta: new Date(o.hasta) }))
}

// Plazas ocupadas por grupo (clases con aforo) en ese rango
async function plazasPorGrupo(branchId: string, desde: Date, hasta: Date, ignorarCitaId?: string | null): Promise<Map<string, number>> {
  let consulta = supabaseAdmin
    .from('citas')
    .select('grupo, personas, id')
    .eq('branch_id', branchId)
    .not('grupo', 'is', null)
    .in('estado', ESTADOS_ACTIVOS)
    .lt('inicio', hasta.toISOString())
    .gt('fin', desde.toISOString())
  if (ignorarCitaId) consulta = consulta.neq('id', ignorarCitaId)
  const { data } = await consulta
  const mapa = new Map<string, number>()
  for (const c of data || []) mapa.set(c.grupo, (mapa.get(c.grupo) || 0) + Number(c.personas || 1))
  return mapa
}

export function grupoDeClase(servicioId: string, inicio: Date) {
  return `${servicioId}:${inicio.toISOString()}`
}

// Los recursos que podrían hacer este servicio
export function recursosCandidatos(agenda: Agenda, servicio: Servicio, recursoId?: string | null): Recurso[] {
  return agenda.recursos.filter(r => {
    if (!r.activo) return false
    if (servicio.tipo_recurso && r.tipo !== servicio.tipo_recurso) return false
    if (recursoId && r.id !== recursoId) return false
    // Un recurso con lista de servicios solo hace esos
    const suyos = agenda.vinculosPorRecurso.get(r.id)
    return !suyos || suyos.size === 0 || suyos.has(servicio.id)
  })
}

export interface OpcionesHuecos {
  agenda: Agenda
  servicio: Servicio
  fecha: string // YYYY-MM-DD en la zona de la sucursal
  personas?: number
  recursoId?: string | null
  extras?: string[]
  ahora?: Date
  // Al mover una cita, su propia ocupación no cuenta
  ignorarCitaId?: string | null
  // El panel puede reservar fuera de horario y sin antelación (nunca encima de otra)
  sinReglas?: boolean
  // Solo comprobar una hora concreta
  soloInicio?: Date | null
  // Restaurante: zona preferida (terraza, interior...)
  zona?: string | null
}

// Los huecos de un día para un servicio
export async function huecosDelDia(o: OpcionesHuecos): Promise<{ huecos: Hueco[]; motivo?: string }> {
  const { agenda, servicio } = o
  const fecha = leerFecha(o.fecha)
  if (!fecha) return { huecos: [], motivo: 'La fecha no es válida.' }
  if (servicio.id === ID_MESA) return huecosRestaurante(o, fecha)
  const personas = Math.max(1, Number(o.personas || 1))
  const ahora = o.ahora || new Date()
  const extras = o.extras || []
  const paso = Math.max(5, agenda.ajustes.paso_minutos || 15)

  const candidatos = recursosCandidatos(agenda, servicio, o.recursoId)
  if (!candidatos.length) return { huecos: [], motivo: o.recursoId ? 'Ese profesional o recurso no hace este servicio.' : 'No hay ningún recurso que pueda hacer este servicio.' }
  // Cuántos hacen falta y si caben las personas
  const necesarios = servicio.recursos_necesarios
  const cabe = (r: Recurso) => servicio.aforo ? true : personas >= r.capacidad_min && personas <= r.capacidad_max
  const aptos = candidatos.filter(cabe)
  if (!aptos.length) return { huecos: [], motivo: `No hay ${servicio.tipo_recurso === 'mesa' ? 'mesa' : 'recurso'} para ${personas} ${personas === 1 ? 'persona' : 'personas'}.` }
  if (servicio.aforo && personas > servicio.aforo) return { huecos: [], motivo: `Este servicio admite como mucho ${servicio.aforo} personas por hueco.` }

  // Ventana del día con margen para lo que empieza antes o acaba después
  const inicioDia = instanteLocal(agenda.zona, fecha.anio, fecha.mes, fecha.dia, 0, 0)
  const finDia = new Date(inicioDia.getTime() + 36 * 3600 * 1000)
  const margen = 6 * 3600 * 1000
  const [bloqueos, ocupacion, plazas] = await Promise.all([
    o.sinReglas ? Promise.resolve([] as Bloqueo[]) : bloqueosEntre(agenda.ajustes.branch_id, new Date(inicioDia.getTime() - margen), new Date(finDia.getTime() + margen)),
    ocupacionEntre(agenda.ajustes.branch_id, new Date(inicioDia.getTime() - margen), new Date(finDia.getTime() + margen), o.ignorarCitaId),
    servicio.aforo ? plazasPorGrupo(agenda.ajustes.branch_id, inicioDia, finDia, o.ignorarCitaId) : Promise.resolve(new Map<string, number>())
  ])

  // Franjas abiertas de cada recurso, ya sin bloqueos
  const franjasPor = new Map<string, Tramo[]>()
  for (const r of aptos) {
    let franjas: Tramo[]
    if (o.sinReglas) {
      franjas = [{ desde: new Date(inicioDia.getTime() - margen), hasta: new Date(finDia.getTime() + margen) }]
    } else {
      franjas = franjasAbiertas(agenda, r, fecha)
      const suyos = bloqueos.filter(b => !b.recurso_id || b.recurso_id === r.id).map(b => ({ desde: new Date(b.desde), hasta: new Date(b.hasta) }))
      franjas = restarTramos(franjas, suyos)
    }
    franjasPor.set(r.id, franjas)
  }
  const ocupadoPor = new Map<string, Ocupacion[]>()
  for (const oc of ocupacion) {
    const lista = ocupadoPor.get(oc.recurso_id) || []
    lista.push(oc)
    ocupadoPor.set(oc.recurso_id, lista)
  }
  // Carga del día por recurso, para repartir (el menos cargado primero)
  const carga = (r: Recurso) => (ocupadoPor.get(r.id) || []).reduce((n, oc) => n + (oc.hasta.getTime() - oc.desde.getTime()), 0)

  // Las horas candidatas: desde la primera apertura hasta el último cierre,
  // de `paso` en `paso`, alineadas a la hora en punto local
  const todas = [...franjasPor.values()].flat()
  if (!todas.length) return { huecos: [], motivo: o.sinReglas ? undefined : 'Ese día está cerrado.' }
  const primera = Math.min(...todas.map(f => f.desde.getTime()))
  const ultima = Math.max(...todas.map(f => f.hasta.getTime()))
  const minAntelacion = o.sinReglas ? 0 : agenda.ajustes.antelacion_minima_minutos * 60000
  const maxAntelacion = o.sinReglas ? Infinity : agenda.ajustes.antelacion_maxima_dias * 24 * 3600 * 1000

  const huecos: Hueco[] = []
  const candidatas: Date[] = []
  if (o.soloInicio) {
    candidatas.push(o.soloInicio)
  } else {
    // Alinear al paso en hora local: se parte del inicio del día local
    for (let t = inicioDia.getTime(); t <= ultima; t += paso * 60000) {
      if (t < primera) continue
      candidatas.push(new Date(t))
    }
  }

  for (const inicio of candidatas) {
    // Sin reglas (el panel) vale incluso una hora ya pasada: apuntar a quien
    // acaba de entrar sin reserva
    if (!o.sinReglas && inicio.getTime() - ahora.getTime() < minAntelacion) continue
    if (inicio.getTime() - ahora.getTime() > maxAntelacion) continue
    // Solo huecos que empiezan ese día (en la zona)
    const p = partesEnZona(inicio, agenda.zona)
    if (p.anio !== fecha.anio || p.mes !== fecha.mes || p.dia !== fecha.dia) continue

    const { fin, tramos } = patronOcupacion(servicio, inicio, extras)
    const grupo = servicio.aforo ? grupoDeClase(servicio.id, inicio) : null
    const libres = aptos
      .filter(r => dentroDeAlguna(tramos, franjasPor.get(r.id) || []))
      .filter(r => {
        const suyas = ocupadoPor.get(r.id) || []
        return tramos.every(t => suyas.every(oc =>
          !seSolapan(t.desde.getTime(), t.hasta.getTime(), oc.desde.getTime(), oc.hasta.getTime())
          || (grupo !== null && oc.grupo === grupo)
        ))
      })
      .sort((a, b) => carga(a) - carga(b) || a.orden - b.orden)
    if (libres.length < necesarios) continue

    let plazasLibres: number | undefined
    if (servicio.aforo && grupo) {
      plazasLibres = servicio.aforo - (plazas.get(grupo) || 0)
      if (plazasLibres < personas) continue
    }
    huecos.push({ inicio: inicio.toISOString(), fin: fin.toISOString(), recursos: libres.slice(0, necesarios).map(r => r.id), ...(plazasLibres !== undefined ? { plazas: plazasLibres } : {}) })
  }
  return { huecos }
}

// ---------------------------------------------------------------------------
// Restaurante: mesas y turnos
// ---------------------------------------------------------------------------
// Un hueco es una hora de entrada dentro de un turno (hasta la última
// entrada) en la que hay una mesa libre donde caben los comensales: primero
// la mesa más ajustada (una de 4 antes que una de 6), y si no cabe en
// ninguna y se pueden juntar mesas, una combinación. Se respetan los
// bloqueos, el aforo por turno y la antelación.
async function huecosRestaurante(o: OpcionesHuecos, fecha: { anio: number; mes: number; dia: number }): Promise<{ huecos: Hueco[]; motivo?: string }> {
  const { agenda } = o
  const personas = Math.max(1, Math.round(Number(o.personas || 1)))
  const ahora = o.ahora || new Date()
  const paso = Math.max(5, agenda.ajustes.paso_minutos || 15)
  const duracion = duracionMesa(agenda, personas)
  const zona = (o.zona || '').trim().toLowerCase()

  const mesas = agenda.recursos.filter(r => r.activo && r.tipo === 'mesa' && (!o.recursoId || r.id === o.recursoId) && (!zona || (r.zona || '').toLowerCase().includes(zona)))
  if (!mesas.length) return { huecos: [], motivo: zona ? `No hay mesas en "${o.zona}".` : 'No hay mesas configuradas.' }
  // Los "asientos" posibles: mesas sueltas donde caben, y combinaciones
  const asientos: { ids: string[]; capacidad: number; nombre: string }[] = mesas
    .filter(m => personas >= m.capacidad_min && personas <= m.capacidad_max)
    .map(m => ({ ids: [m.id], capacidad: m.capacidad_max, nombre: m.nombre }))
  if (agenda.ajustes.combinar_mesas && !o.recursoId) {
    for (const c of agenda.combinaciones) {
      if (!c.activa || personas < c.capacidad_min || personas > c.capacidad_max) continue
      const suyas = c.recurso_ids.map(id => mesas.find(m => m.id === id))
      if (suyas.some(m => !m)) continue
      asientos.push({ ids: c.recurso_ids, capacidad: c.capacidad_max, nombre: c.nombre })
    }
  }
  if (!asientos.length) return { huecos: [], motivo: `No hay mesa para ${personas} ${personas === 1 ? 'persona' : 'personas'}${zona ? ` en "${o.zona}"` : ''}.` }
  // Las sueltas más ajustadas primero; las combinaciones, después
  asientos.sort((a, b) => (a.ids.length - b.ids.length) || (a.capacidad - b.capacidad))

  const inicioDia = instanteLocal(agenda.zona, fecha.anio, fecha.mes, fecha.dia, 0, 0)
  const finDia = new Date(inicioDia.getTime() + 36 * 3600 * 1000)
  const margen = 6 * 3600 * 1000
  const [bloqueos, ocupacion, citasDia] = await Promise.all([
    o.sinReglas ? Promise.resolve([] as Bloqueo[]) : bloqueosEntre(agenda.ajustes.branch_id, new Date(inicioDia.getTime() - margen), new Date(finDia.getTime() + margen)),
    ocupacionEntre(agenda.ajustes.branch_id, new Date(inicioDia.getTime() - margen), new Date(finDia.getTime() + margen), o.ignorarCitaId),
    agenda.ajustes.aforo_por_turno ? citasActivasEntre(agenda.ajustes.branch_id, inicioDia, finDia, o.ignorarCitaId) : Promise.resolve([] as { inicio: Date; personas: number }[])
  ])
  const ocupadoPor = new Map<string, Ocupacion[]>()
  for (const oc of ocupacion) { const l = ocupadoPor.get(oc.recurso_id) || []; l.push(oc); ocupadoPor.set(oc.recurso_id, l) }
  const bloqueadaEn = (mesaId: string, desde: Date, hasta: Date) => bloqueos.some(b => (!b.recurso_id || b.recurso_id === mesaId) && seSolapan(desde.getTime(), hasta.getTime(), new Date(b.desde).getTime(), new Date(b.hasta).getTime()))
  const libreEn = (mesaId: string, desde: Date, hasta: Date) => !bloqueadaEn(mesaId, desde, hasta) && (ocupadoPor.get(mesaId) || []).every(oc => !seSolapan(desde.getTime(), hasta.getTime(), oc.desde.getTime(), oc.hasta.getTime()))

  // Las ventanas de entrada: los turnos del día (o el horario del negocio si no hay turnos)
  const aInstante = (hhmm: string) => { const m = minutosDeHora(hhmm); return instanteLocal(agenda.zona, fecha.anio, fecha.mes, fecha.dia, Math.floor(m / 60), m % 60) }
  let ventanas: { nombre: string; desde: Date; ultimaEntrada: Date; fin: Date }[] = []
  if (o.sinReglas) {
    ventanas = [{ nombre: '', desde: new Date(inicioDia.getTime() - margen), ultimaEntrada: new Date(finDia.getTime() + margen), fin: new Date(finDia.getTime() + margen) }]
  } else if (agenda.ajustes.turnos.length) {
    for (const t of agenda.ajustes.turnos) {
      const desde = aInstante(t.inicio)
      let fin = aInstante(t.fin)
      if (fin <= desde) fin = new Date(fin.getTime() + 24 * 3600 * 1000)
      let ultimaEntrada = t.ultima_entrada ? aInstante(t.ultima_entrada) : new Date(fin.getTime() - duracion * 60000)
      if (ultimaEntrada < desde) ultimaEntrada = new Date(ultimaEntrada.getTime() + 24 * 3600 * 1000)
      ventanas.push({ nombre: t.nombre, desde, ultimaEntrada, fin })
    }
  } else {
    const pseudo = { usa_horario_sucursal: true, horarios: [] } as unknown as Recurso
    ventanas = franjasAbiertas(agenda, pseudo, fecha).map(f => ({ nombre: '', desde: f.desde, ultimaEntrada: new Date(f.hasta.getTime() - duracion * 60000), fin: f.hasta }))
  }
  if (!ventanas.length) return { huecos: [], motivo: 'Ese día está cerrado.' }

  // Aforo por turno: comensales ya sentados en esa ventana
  const comensalesEn = (v: { desde: Date; fin: Date }) => citasDia.filter(c => c.inicio >= v.desde && c.inicio < v.fin).reduce((n, c) => n + c.personas, 0)
  const minAntelacion = o.sinReglas ? 0 : agenda.ajustes.antelacion_minima_minutos * 60000
  const maxAntelacion = o.sinReglas ? Infinity : agenda.ajustes.antelacion_maxima_dias * 24 * 3600 * 1000

  const huecos: Hueco[] = []
  for (const v of ventanas) {
    // El aforo por turno solo tiene sentido con turnos definidos (sin ellos
    // contaría a los de la comida y a los de la cena juntos)
    if (agenda.ajustes.aforo_por_turno && agenda.ajustes.turnos.length && !o.sinReglas && comensalesEn(v) + personas > agenda.ajustes.aforo_por_turno) continue
    const candidatas: Date[] = []
    if (o.soloInicio) {
      if (o.soloInicio >= v.desde && o.soloInicio <= v.ultimaEntrada) candidatas.push(o.soloInicio)
    } else {
      // Alineadas al paso desde el inicio del turno
      for (let t = v.desde.getTime(); t <= v.ultimaEntrada.getTime(); t += paso * 60000) candidatas.push(new Date(t))
    }
    for (const inicio of candidatas) {
      if (!o.sinReglas && inicio.getTime() - ahora.getTime() < minAntelacion) continue
      if (inicio.getTime() - ahora.getTime() > maxAntelacion) continue
      const fin = new Date(inicio.getTime() + duracion * 60000)
      const asiento = asientos.find(a => a.ids.every(id => libreEn(id, inicio, fin)))
      if (!asiento) continue
      // Copia por hueco: si se repite el mismo array, la respuesta de Next lo
      // convierte en referencias y quien la lea a mano ve un hueco vacío
      huecos.push({ inicio: inicio.toISOString(), fin: fin.toISOString(), recursos: [...asiento.ids], ...(v.nombre ? { turno: v.nombre } : {}) })
    }
  }
  return { huecos, ...(huecos.length ? {} : { motivo: `No queda mesa para ${personas} ${personas === 1 ? 'persona' : 'personas'} ese día.` }) }
}

async function citasActivasEntre(branchId: string, desde: Date, hasta: Date, ignorarCitaId?: string | null): Promise<{ inicio: Date; personas: number }[]> {
  let consulta = supabaseAdmin
    .from('citas')
    .select('inicio, personas, id')
    .eq('branch_id', branchId)
    .in('estado', ESTADOS_ACTIVOS)
    .gte('inicio', desde.toISOString())
    .lt('inicio', hasta.toISOString())
  if (ignorarCitaId) consulta = consulta.neq('id', ignorarCitaId)
  const { data } = await consulta
  return (data || []).map((c: any) => ({ inicio: new Date(c.inicio), personas: Number(c.personas || 1) }))
}

// Los huecos de varios días seguidos (para "¿cuándo tienes hueco?")
export async function huecosEntreDias(o: Omit<OpcionesHuecos, 'fecha'> & { desde: string; dias: number; maximoPorDia?: number }): Promise<{ porDia: { fecha: string; huecos: Hueco[] }[]; motivo?: string }> {
  const porDia: { fecha: string; huecos: Hueco[] }[] = []
  let motivo: string | undefined
  for (let i = 0; i < Math.min(31, Math.max(1, o.dias)); i++) {
    const fecha = sumarDias(o.desde, i)
    const r = await huecosDelDia({ ...o, fecha })
    if (r.motivo && !motivo && !r.huecos.length) motivo = r.motivo
    if (r.huecos.length) porDia.push({ fecha, huecos: o.maximoPorDia ? r.huecos.slice(0, o.maximoPorDia) : r.huecos })
  }
  return { porDia, motivo: porDia.length ? undefined : motivo }
}
