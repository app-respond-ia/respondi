// El idioma de la agenda: recursos (lo que se ocupa), servicios (lo que se
// reserva) y citas (quién, qué, cuándo). Vale para una peluquería, una
// clínica, un taller, una academia o un restaurante.

export type TipoRecurso = 'persona' | 'mesa' | 'sala' | 'equipo' | 'otro'

export const TIPOS_RECURSO: { valor: TipoRecurso; etiqueta: string; plural: string; ayuda: string }[] = [
  { valor: 'persona', etiqueta: 'Persona', plural: 'Personas', ayuda: 'Un profesional: peluquero, médico, mecánico, profesor.' },
  { valor: 'mesa', etiqueta: 'Mesa', plural: 'Mesas', ayuda: 'Una mesa del restaurante, con su número de comensales.' },
  { valor: 'sala', etiqueta: 'Sala', plural: 'Salas', ayuda: 'Un espacio: gabinete, sala de yoga, reservado, pista.' },
  { valor: 'equipo', etiqueta: 'Equipo', plural: 'Equipos', ayuda: 'Una máquina o un puesto: láser, elevador, camilla.' },
  { valor: 'otro', etiqueta: 'Otro', plural: 'Otros', ayuda: 'Cualquier otra cosa que se ocupe al reservar.' }
]

export type EstadoCita =
  | 'pendiente'
  | 'confirmada'
  | 'en_curso'
  | 'completada'
  | 'no_presentado'
  | 'cancelada_cliente'
  | 'cancelada_negocio'

export const ESTADOS_CITA: Record<EstadoCita, { etiqueta: string; color: string }> = {
  pendiente: { etiqueta: 'Pendiente de confirmar', color: 'amber' },
  confirmada: { etiqueta: 'Confirmada', color: 'emerald' },
  en_curso: { etiqueta: 'En curso', color: 'sky' },
  completada: { etiqueta: 'Completada', color: 'slate' },
  no_presentado: { etiqueta: 'No se presentó', color: 'rose' },
  cancelada_cliente: { etiqueta: 'Cancelada por el cliente', color: 'slate' },
  cancelada_negocio: { etiqueta: 'Cancelada por el negocio', color: 'slate' }
}

// Las que ocupan hueco de verdad
export const ESTADOS_ACTIVOS: EstadoCita[] = ['pendiente', 'confirmada', 'en_curso']

export type ModoAgenda = 'servicios' | 'restaurante'
export type Confirmacion = 'automatica' | 'manual'
export type OrigenCita = 'ia' | 'panel' | 'enlace'

export interface Turno {
  nombre: string
  inicio: string // "13:00"
  fin: string // "16:00"
  ultima_entrada?: string // "15:00"
}

export interface DuracionPorComensales {
  hasta_personas: number
  minutos: number
}

export interface AjustesAgenda {
  branch_id: string
  tenant_id: string
  activa: boolean
  modo: ModoAgenda
  paso_minutos: number
  antelacion_minima_minutos: number
  antelacion_maxima_dias: number
  max_citas_activas_por_cliente: number
  confirmacion: Confirmacion
  grupo_grande_desde: number
  cancelacion_horas: number
  tiempo_cortesia_minutos: number
  turnos: Turno[]
  duracion_por_comensales: DuracionPorComensales[]
  aforo_por_turno: number | null
  combinar_mesas: boolean
  instrucciones_ia: string | null
  enlace_publico: string | null
  enlace_activo: boolean
}

export const AJUSTES_POR_DEFECTO: Omit<AjustesAgenda, 'branch_id' | 'tenant_id'> = {
  activa: false,
  modo: 'servicios',
  paso_minutos: 15,
  antelacion_minima_minutos: 120,
  antelacion_maxima_dias: 60,
  max_citas_activas_por_cliente: 3,
  confirmacion: 'automatica',
  grupo_grande_desde: 8,
  cancelacion_horas: 24,
  tiempo_cortesia_minutos: 15,
  turnos: [],
  duracion_por_comensales: [],
  aforo_por_turno: null,
  combinar_mesas: true,
  instrucciones_ia: null,
  enlace_publico: null,
  enlace_activo: false
}

export interface HorarioRecurso {
  dia_semana: number // 0 = domingo
  apertura: string // "09:00"
  cierre: string // "18:00"
  orden?: number
}

export interface Recurso {
  id: string
  tenant_id: string
  branch_id: string
  nombre: string
  tipo: TipoRecurso
  capacidad_min: number
  capacidad_max: number
  zona: string | null
  color: string | null
  orden: number
  activo: boolean
  usa_horario_sucursal: boolean
  elegible: boolean
  notas: string | null
  horarios?: HorarioRecurso[]
}

export interface Bloqueo {
  id: string
  branch_id: string
  recurso_id: string | null
  desde: string
  hasta: string
  motivo: string | null
}

export interface HuecoInterno {
  desde_minuto: number
  minutos: number
}

export interface Extra {
  nombre: string
  precio?: number
  minutos?: number
}

// Lo que un servicio reservable aporta desde la lista de precios
export interface Servicio {
  id: string
  nombre: string
  tipo: string
  precio: number | null
  precio_tipo: string
  moneda: string | null
  descripcion: string | null
  disponible: boolean
  visible_ia: boolean
  reservable: boolean
  duracion_minutos: number | null
  tiempo_antes_minutos: number
  tiempo_despues_minutos: number
  huecos_internos: HuecoInterno[]
  tipo_recurso: TipoRecurso | null
  recursos_necesarios: number
  aforo: number | null
  precio_por_persona: boolean
  extras: Extra[]
  cancelacion_horas: number | null
  confirmacion: Confirmacion | null
  reservable_online: boolean
}

export interface Cita {
  id: string
  tenant_id: string
  branch_id: string
  contact_id: string | null
  conversation_id: string | null
  servicio_id: string | null
  servicio_nombre: string
  inicio: string
  fin: string
  personas: number
  estado: EstadoCita
  origen: OrigenCita
  grupo: string | null
  nombre_cliente: string | null
  telefono: string | null
  email: string | null
  notas: string | null
  peticiones: string | null
  extras: string[]
  precio_estimado: number | null
  moneda: string | null
  token_gestion: string
  avisos: Record<string, string>
  llegada_en: string | null
  creado_por: string | null
  created_at: string
  actualizado_en: string
  // Lo que se une al leer
  recursos?: { id: string; nombre: string; tipo: TipoRecurso }[]
}

// Un hueco libre que se puede reservar
export interface Hueco {
  inicio: string
  fin: string
  // Qué recursos lo harían (ids)
  recursos: string[]
  // Para las clases con aforo: plazas que quedan
  plazas?: number
  // Restaurante: en qué turno cae
  turno?: string
}

// Restaurante: mesas que se juntan para un grupo
export interface Combinacion {
  id: string
  nombre: string
  recurso_ids: string[]
  capacidad_min: number
  capacidad_max: number
  activa: boolean
}

// El "servicio" de un restaurante es la mesa: no está en la lista de precios
export const ID_MESA = 'mesa'

export const PASOS_AGENDA = [5, 10, 15, 20, 30, 60]

export const HUECOS_INTERNOS_MAXIMO = 5
export const EXTRAS_MAXIMO = 20
export const RECURSOS_MAXIMO = 100

// Mensajes de error con los que trabaja todo el mundo (acciones, IA, enlace)
export type CodigoErrorCita =
  | 'agenda_apagada'
  | 'servicio'
  | 'personas'
  | 'antelacion'
  | 'sin_hueco'
  | 'ocupado'
  | 'aforo'
  | 'limite'
  | 'grupo_grande'
  | 'plazo_cancelacion'
  | 'no_existe'
  | 'estado'
  | 'permiso'
