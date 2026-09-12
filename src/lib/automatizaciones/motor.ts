import { supabaseAdmin } from '@/utils/supabase/admin'
import { automatizacionPorClave } from './catalogo'
import { ajustesConDefectos, type Automatizacion, type Condicion, type Paso } from './tipos'
import { enviarMensajeSaliente } from '@/lib/canales/salida'
import { ultimoMensajeDelCliente, ventanaAbierta } from '@/lib/canales/ventana'
import { notificarAAdminsDeOrganizacion } from '@/lib/notificaciones'
import { registrarError } from '@/lib/errores'

// EL MOTOR: quien ejecuta las recetas.
//
// Cada vez que una automatización actúa sobre algo concreto (un pedido, un
// carrito, un cliente) se crea una fila en `automatizaciones_ejecuciones`.
// Esa fila es a la vez la cola (cuando la receta dice "espera 2 horas") y el
// registro (qué se hizo y por qué se dejó de hacer).
//
// Frenos de seguridad, por orden:
//   1. Una automatización solo actúa una vez sobre la misma cosa (lo impide
//      la propia base de datos con una clave única).
//   2. Tope de mensajes al día por sucursal.
//   3. Las de promoción, solo a quien las haya aceptado.
//   4. Fuera de la ventana de 24 h de WhatsApp, solo con plantilla aprobada:
//      si no hay, no se manda nada (y se explica en el registro).

export const TOPE_MENSAJES_DIA = 500
const MAX_INTENTOS = 3

export interface Contexto {
  tenant_id: string
  branch_id: string
  tienda_id?: string | null
  // Sobre qué actúa: el número de pedido, el id del carrito, el del cliente.
  // Es lo que impide repetirse.
  referencia: string
  pedido?: {
    numero?: string
    id?: string
    total?: number
    moneda?: string
    productos?: string[]
    seguimiento?: string | null
    enlace_seguimiento?: string | null
    contrareembolso?: boolean
    falta_dato?: string | null
    enviado?: boolean
    cancelado?: boolean
    creado?: string
  }
  cliente?: {
    nombre?: string | null
    email?: string | null
    telefono?: string | null
    acepta_marketing?: boolean
    compras?: number
    gasto?: number
    ha_contestado?: boolean
    id_tienda?: string | null
  }
  producto?: { nombre?: string; enlace?: string | null; hay_stock?: boolean; precio?: number }
  carrito?: { enlace?: string | null; comprado?: boolean; productos?: string[] }
  etiqueta?: string
  [clave: string]: any
}

type Resultado = { estado: 'hecha' | 'omitida' | 'error'; detalle?: string }

// ---------------------------------------------------------------------------
// Poner en marcha una automatización sobre algo concreto
// ---------------------------------------------------------------------------
export async function lanzarAutomatizacion(clave: string, contexto: Contexto): Promise<{ lanzada: boolean; motivo?: string; id?: string }> {
  const definicion = automatizacionPorClave(clave)
  if (!definicion) return { lanzada: false, motivo: 'no existe' }
  if (definicion.estado !== 'lista') return { lanzada: false, motivo: 'todavía no está construida' }

  const { data: guardada } = await supabaseAdmin
    .from('automatizaciones')
    .select('id, activa, ajustes')
    .eq('branch_id', contexto.branch_id)
    .eq('clave', clave)
    .maybeSingle()

  if (!guardada?.activa) return { lanzada: false, motivo: 'apagada' }

  const ajustes = ajustesConDefectos(definicion, guardada.ajustes as any)

  // Las condiciones de entrada: si no se cumplen, ni se empieza (y se apunta,
  // para que el cliente vea por qué no ha pasado nada)
  if (definicion.receta.condiciones?.length && !cumpleCondiciones(definicion.receta.condiciones, contexto, ajustes)) {
    await apuntarOmitida(definicion, guardada.id, contexto, 'No se cumplían las condiciones.')
    return { lanzada: false, motivo: 'no cumple las condiciones' }
  }

  const { data: ejecucion, error } = await supabaseAdmin
    .from('automatizaciones_ejecuciones')
    .insert({
      tenant_id: contexto.tenant_id,
      branch_id: contexto.branch_id,
      automatizacion_id: guardada.id,
      clave,
      referencia: contexto.referencia,
      estado: 'programada',
      paso: 0,
      ejecutar_en: new Date().toISOString(),
      datos: contexto as any
    })
    .select('id, paso, intentos, datos')
    .single()

  // Ya se hizo antes sobre esto mismo: el freno de "no escribir dos veces"
  if (error?.code === '23505') return { lanzada: false, motivo: 'ya se hizo' }
  if (error || !ejecucion) return { lanzada: false, motivo: error?.message || 'no se ha podido apuntar' }

  await continuarEjecucion({ ...ejecucion, clave, automatizacion_id: guardada.id, tenant_id: contexto.tenant_id, branch_id: contexto.branch_id })
  return { lanzada: true, id: ejecucion.id }
}

async function apuntarOmitida(definicion: Automatizacion, automatizacionId: string, contexto: Contexto, detalle: string) {
  await supabaseAdmin.from('automatizaciones_ejecuciones').insert({
    tenant_id: contexto.tenant_id,
    branch_id: contexto.branch_id,
    automatizacion_id: automatizacionId,
    clave: definicion.clave,
    referencia: contexto.referencia,
    estado: 'omitida',
    datos: contexto as any,
    detalle
  })
}

// ---------------------------------------------------------------------------
// Seguir una ejecución por donde iba
// ---------------------------------------------------------------------------
interface FilaEjecucion {
  id: string
  tenant_id: string
  branch_id: string
  automatizacion_id: string
  clave: string
  paso: number
  intentos?: number
  datos: any
}

export async function continuarEjecucion(ejecucion: FilaEjecucion): Promise<Resultado> {
  const definicion = automatizacionPorClave(ejecucion.clave)
  if (!definicion) return await cerrar(ejecucion, 'error', 'Esta automatización ya no existe.')

  const { data: guardada } = await supabaseAdmin
    .from('automatizaciones')
    .select('activa, ajustes')
    .eq('id', ejecucion.automatizacion_id)
    .maybeSingle()

  // La han apagado mientras esperaba: no se sigue
  if (!guardada?.activa) return await cerrar(ejecucion, 'cancelada' as any, 'La automatización se apagó mientras esperaba.')

  const ajustes = ajustesConDefectos(definicion, guardada.ajustes as any)
  const contexto: Contexto = ejecucion.datos || {}
  const pasos = definicion.receta.pasos

  for (let i = ejecucion.paso; i < pasos.length; i++) {
    const paso = pasos[i]

    if (paso.tipo === 'esperar') {
      const ms = milisegundosDeEspera(paso, ajustes)
      await supabaseAdmin
        .from('automatizaciones_ejecuciones')
        .update({ paso: i + 1, ejecutar_en: new Date(Date.now() + ms).toISOString(), actualizado_en: new Date().toISOString() })
        .eq('id', ejecucion.id)
      return { estado: 'hecha', detalle: 'esperando' }
    }

    if (paso.tipo === 'comprobar') {
      if (!cumpleCondiciones(paso.condiciones, contexto, ajustes)) {
        return await cerrar(ejecucion, 'omitida', 'Ya no se cumplían las condiciones.')
      }
      continue
    }

    try {
      const r = await ejecutarPaso(paso, definicion, ejecucion, contexto, ajustes)
      if (r?.parar) return await cerrar(ejecucion, 'omitida', r.detalle)
    } catch (e: any) {
      const intentos = (ejecucion.intentos || 0) + 1
      if (intentos >= MAX_INTENTOS) {
        await registrarError({
          origen: 'app',
          descripcion: `La automatización "${definicion.nombre}" ha fallado ${intentos} veces`,
          stacktrace: JSON.stringify({ ejecucion: ejecucion.id, clave: ejecucion.clave, error: e?.message }),
          tenant_id: ejecucion.tenant_id
        })
        return await cerrar(ejecucion, 'error', e?.message || 'Error inesperado')
      }
      // Se reintenta más tarde, desde este mismo paso
      await supabaseAdmin
        .from('automatizaciones_ejecuciones')
        .update({
          paso: i,
          intentos,
          ejecutar_en: new Date(Date.now() + intentos * 5 * 60 * 1000).toISOString(),
          detalle: e?.message || 'Error inesperado',
          actualizado_en: new Date().toISOString()
        })
        .eq('id', ejecucion.id)
      return { estado: 'error', detalle: e?.message }
    }
  }

  return await cerrar(ejecucion, 'hecha')
}

async function cerrar(ejecucion: FilaEjecucion, estado: 'hecha' | 'omitida' | 'error' | 'cancelada', detalle?: string): Promise<Resultado> {
  await supabaseAdmin
    .from('automatizaciones_ejecuciones')
    .update({ estado, detalle: detalle || null, actualizado_en: new Date().toISOString() })
    .eq('id', ejecucion.id)
  if (estado === 'hecha') {
    await supabaseAdmin
      .from('automatizaciones')
      .update({ ultima_ejecucion: new Date().toISOString() })
      .eq('id', ejecucion.automatizacion_id)
  }
  return { estado: estado === 'cancelada' ? 'omitida' : estado, detalle }
}

function milisegundosDeEspera(paso: Extract<Paso, { tipo: 'esperar' }>, ajustes: Record<string, any>) {
  if (paso.ajuste) {
    const valor = Number(ajustes[paso.ajuste]) || 0
    // El nombre del ajuste dice la unidad: esperar_horas, dias, esperar_minutos
    if (/minuto/.test(paso.ajuste)) return valor * 60 * 1000
    if (/dia/.test(paso.ajuste)) return valor * 24 * 3600 * 1000
    return valor * 3600 * 1000
  }
  return ((paso.dias || 0) * 24 * 3600 + (paso.horas || 0) * 3600 + (paso.minutos || 0) * 60) * 1000
}

// ---------------------------------------------------------------------------
// Las condiciones
// ---------------------------------------------------------------------------
export function valorDeCampo(contexto: Contexto, campo: string): any {
  return campo.split('.').reduce<any>((donde, parte) => (donde == null ? undefined : donde[parte]), contexto)
}

export function cumpleCondiciones(condiciones: Condicion[], contexto: Contexto, ajustes: Record<string, any>): boolean {
  return condiciones.every(c => {
    const valor = valorDeCampo(contexto, c.campo)
    const esperado = c.ajuste !== undefined ? ajustes[c.ajuste] : c.valor
    switch (c.operador) {
      case 'es_cierto': return valor === true
      case 'es_falso': return valor === false || valor === undefined || valor === null
      case 'existe': return valor !== undefined && valor !== null && valor !== ''
      case 'no_existe': return valor === undefined || valor === null || valor === ''
      case 'mayor': return Number(valor) > Number(esperado)
      case 'menor': return Number(valor) < Number(esperado)
      case 'igual': return String(valor) === String(esperado)
      case 'distinto': return String(valor) !== String(esperado)
      case 'contiene': return String(valor ?? '').toLowerCase().includes(String(esperado ?? '').toLowerCase())
      default: return false
    }
  })
}

// ---------------------------------------------------------------------------
// Los huecos del texto
// ---------------------------------------------------------------------------
export function rellenarHuecos(texto: string, contexto: Contexto, ajustes: Record<string, any>): string {
  const dinero = (n: any, moneda?: string) =>
    n === undefined || n === null ? '' : `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda || contexto.pedido?.moneda || ''}`.trim()

  const valores: Record<string, string> = {
    cliente: (contexto.cliente?.nombre || '').trim() || 'hola',
    pedido: contexto.pedido?.numero || '',
    total: dinero(contexto.pedido?.total),
    seguimiento: contexto.pedido?.enlace_seguimiento || contexto.pedido?.seguimiento || '',
    producto: contexto.producto?.nombre || (contexto.pedido?.productos || contexto.carrito?.productos || []).join(', '),
    enlace: contexto.carrito?.enlace || contexto.producto?.enlace || contexto.enlace || '',
    codigo: contexto.codigo_descuento || '',
    descuento: ajustes.porcentaje ? `${ajustes.porcentaje}%` : '',
    dias: String(ajustes.avisar_dias_antes ?? ajustes.dias ?? ''),
    falta: contexto.pedido?.falta_dato || '',
    etiqueta: contexto.etiqueta || ''
  }

  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (entero, nombre) => {
    const v = valores[String(nombre).toLowerCase()]
    return v !== undefined ? v : entero
  })
}

// ---------------------------------------------------------------------------
// Los pasos
// ---------------------------------------------------------------------------
async function ejecutarPaso(
  paso: Paso,
  definicion: Automatizacion,
  ejecucion: FilaEjecucion,
  contexto: Contexto,
  ajustes: Record<string, any>
): Promise<{ parar?: boolean; detalle?: string } | void> {
  switch (paso.tipo) {
    case 'mensaje':
      return await pasoMensaje(paso, definicion, ejecucion, contexto, ajustes)
    case 'avisar_equipo':
      return await pasoAvisarEquipo(paso, definicion, ejecucion, contexto, ajustes)
    case 'abrir_caso':
      return await pasoAbrirCaso(paso, ejecucion, contexto, ajustes)
    case 'etiquetar':
      return await pasoEtiquetar(paso, ejecucion, contexto, ajustes)
    default:
      // Los pasos que todavía no sabe hacer el motor no rompen nada: se
      // apuntan y la automatización sigue. Ninguna automatización 'lista'
      // lleva pasos sin construir.
      return { parar: true, detalle: `El paso "${paso.tipo}" todavía no está construido.` }
  }
}

// --- Escribir al cliente ---------------------------------------------------
async function pasoMensaje(
  paso: Extract<Paso, { tipo: 'mensaje' }>,
  definicion: Automatizacion,
  ejecucion: FilaEjecucion,
  contexto: Contexto,
  ajustes: Record<string, any>
) {
  const plantilla = paso.plantilla ? ajustes[paso.plantilla] : null
  const textoBase = paso.ajuste_texto ? ajustes[paso.ajuste_texto] : paso.texto
  const texto = rellenarHuecos(String(textoBase || '').trim(), contexto, ajustes)
  if (!texto) return { parar: true, detalle: 'El mensaje estaba vacío.' }

  // Tope diario de la sucursal
  const desde = new Date(); desde.setHours(0, 0, 0, 0)
  const { data: hoy } = await supabaseAdmin
    .from('automatizaciones_ejecuciones')
    .select('mensajes_enviados')
    .eq('branch_id', ejecucion.branch_id)
    .gte('created_at', desde.toISOString())
    .gt('mensajes_enviados', 0)
  const enviadosHoy = (hoy || []).reduce((n: number, f: any) => n + (f.mensajes_enviados || 0), 0)
  if (enviadosHoy >= TOPE_MENSAJES_DIA) {
    return { parar: true, detalle: `Tope de seguridad: ya se han enviado ${TOPE_MENSAJES_DIA} mensajes automáticos hoy en esta sucursal.` }
  }

  const destino = await buscarDestino(contexto)
  if (!destino) return { parar: true, detalle: 'No hay forma de escribir a este cliente: ni WhatsApp ni correo conectados, o faltan sus datos.' }

  // Las promociones, solo a quien las haya aceptado
  if (definicion.marketing && contexto.cliente?.acepta_marketing !== true) {
    return { parar: true, detalle: 'Es un mensaje de promoción y este cliente no ha aceptado recibirlas.' }
  }

  // Fuera de la ventana de 24 h, WhatsApp solo deja plantillas aprobadas
  let plantillaLista: any = null
  if (destino.canal === 'whatsapp') {
    const ultimo = await ultimoMensajeDelCliente(destino.contact_id, ejecucion.branch_id)
    if (!ventanaAbierta(ultimo)) {
      if (!plantilla) {
        return { parar: true, detalle: 'Han pasado más de 24 h desde el último mensaje del cliente: para escribirle hace falta elegir una plantilla de WhatsApp aprobada en los ajustes.' }
      }
      plantillaLista = await prepararPlantilla(plantilla, ejecucion, contexto, texto)
      if (typeof plantillaLista === 'string') return { parar: true, detalle: plantillaLista }
    }
  }

  const { data: nuevo, error } = await supabaseAdmin
    .from('messages')
    .insert({
      tenant_id: ejecucion.tenant_id,
      conversation_id: destino.conversation_id,
      remitente: 'ia',
      contenido: plantillaLista?.contenido || texto,
      agrupado: true,
      estado_envio: 'pendiente',
      ...(plantillaLista ? { plantilla: plantillaLista.plantilla } : {}),
      ...(destino.canal === 'email' ? { asunto: asuntoDelCorreo(definicion, contexto) } : {})
    })
    .select('id')
    .single()
  if (error || !nuevo) throw new Error(error?.message || 'No se ha podido guardar el mensaje.')

  const envio = await enviarMensajeSaliente(nuevo.id)
  if (envio.estado === 'fallido') {
    return { parar: true, detalle: `No se ha podido enviar: ${envio.error}` }
  }

  await supabaseAdmin
    .from('automatizaciones_ejecuciones')
    .update({
      mensajes_enviados: 1,
      contact_id: destino.contact_id,
      conversation_id: destino.conversation_id,
      actualizado_en: new Date().toISOString()
    })
    .eq('id', ejecucion.id)

  await supabaseAdmin
    .from('conversations')
    .update({ fecha_ultimo_mensaje: new Date().toISOString() })
    .eq('id', destino.conversation_id)
}

function asuntoDelCorreo(definicion: Automatizacion, contexto: Contexto) {
  if (contexto.pedido?.numero) return `${definicion.nombre} · pedido ${contexto.pedido.numero}`
  return definicion.nombre
}

// Deja la plantilla lista para enviar: comprueba que está aprobada y rellena
// sus huecos con los datos del pedido. Devuelve un texto si algo falla.
async function prepararPlantilla(plantillaId: string, ejecucion: FilaEjecucion, contexto: Contexto, textoPlano: string): Promise<any | string> {
  const { data: plantilla } = await supabaseAdmin
    .from('whatsapp_templates')
    .select('id, nombre, idioma, estado, contenido, componentes')
    .eq('id', plantillaId)
    .eq('branch_id', ejecucion.branch_id)
    .maybeSingle()
  if (!plantilla) return 'La plantilla elegida ya no existe en esta sucursal.'
  if (plantilla.estado !== 'aprobada') return 'La plantilla elegida no está aprobada por Meta.'

  const { analizarComponentes, rellenar } = await import('@/lib/canales/plantillas-texto')
  const info = analizarComponentes(plantilla.componentes as any[], plantilla.contenido)
  if (!info.enviable) return `Esa plantilla no se puede enviar desde Respondi: ${info.motivoNoEnviable?.toLowerCase()}.`
  // Una automatización no puede pedir a nadie un archivo ni el valor de un
  // botón: solo valen las plantillas que salen solas
  if (!info.automatica) return 'Esa plantilla lleva una foto, un documento o un botón que hay que rellenar a mano: elige una de solo texto.'

  // Los huecos se rellenan por orden, siempre el mismo: nombre del cliente,
  // número de pedido, total y enlace. Está dicho así en la ayuda del ajuste.
  const aMano = [
    (contexto.cliente?.nombre || '').trim() || 'cliente',
    contexto.pedido?.numero || '-',
    contexto.pedido?.total !== undefined ? `${contexto.pedido.total} ${contexto.pedido.moneda || ''}`.trim() : '-',
    contexto.pedido?.enlace_seguimiento || contexto.carrito?.enlace || contexto.producto?.enlace || '-'
  ]

  const parametros = info.huecos.map((_, i) => (aMano[i] || '-').replace(/\s+/g, ' ').trim())

  return {
    plantilla: { nombre: plantilla.nombre, idioma: plantilla.idioma, parametros, parametrosCabecera: [], botones: [] },
    contenido: rellenar(info.cuerpo || textoPlano, parametros)
  }
}

// ¿Por dónde se le escribe a este cliente? WhatsApp si tenemos su teléfono y
// hay canal; si no, correo. Si ya existe conversación con él, se usa esa.
async function buscarDestino(contexto: Contexto): Promise<{ canal: string; contact_id: string; conversation_id: string } | null> {
  const { data: canales } = await supabaseAdmin
    .from('channels')
    .select('tipo, metodo, estado')
    .eq('branch_id', contexto.branch_id)
    .eq('estado', 'activo')

  const hay = (tipo: string) => (canales || []).some((c: any) => c.tipo === tipo)
  const telefono = normalizarTelefono(contexto.cliente?.telefono)
  const correo = (contexto.cliente?.email || '').trim().toLowerCase()

  const opciones: { canal: string; identificador: string }[] = []
  if (telefono && hay('whatsapp')) opciones.push({ canal: 'whatsapp', identificador: telefono })
  if (correo && hay('email')) opciones.push({ canal: 'email', identificador: correo })
  if (!opciones.length) return null

  const elegida = opciones[0]
  const { data: contexto2, error } = await supabaseAdmin.rpc('resolve_incoming_message_context', {
    p_tenant_id: contexto.tenant_id,
    p_branch_id: contexto.branch_id,
    p_canal: elegida.canal,
    p_identificador_canal: elegida.identificador,
    p_nombre_contacto: contexto.cliente?.nombre || 'Cliente'
  })
  if (error || !contexto2) throw new Error(`No se ha podido preparar la conversación: ${error?.message}`)

  return {
    canal: elegida.canal,
    contact_id: (contexto2 as any).contact_id,
    conversation_id: (contexto2 as any).conversation_id
  }
}

function normalizarTelefono(valor: string | null | undefined) {
  if (!valor) return null
  const limpio = String(valor).replace(/[^\d+]/g, '')
  if (limpio.length < 8) return null
  return limpio.startsWith('+') ? limpio : `+${limpio}`
}

// --- Avisar al equipo ------------------------------------------------------
async function pasoAvisarEquipo(
  paso: Extract<Paso, { tipo: 'avisar_equipo' }>,
  definicion: Automatizacion,
  ejecucion: FilaEjecucion,
  contexto: Contexto,
  ajustes: Record<string, any>
) {
  const texto = rellenarHuecos(paso.texto, contexto, ajustes)
  await notificarAAdminsDeOrganizacion(supabaseAdmin, ejecucion.tenant_id, {
    tipo: 'caso_asignado',
    titulo: definicion.nombre,
    cuerpo: texto,
    url: '/dashboard/automatizaciones'
  })
}

// --- Abrir un caso ---------------------------------------------------------
async function pasoAbrirCaso(
  paso: Extract<Paso, { tipo: 'abrir_caso' }>,
  ejecucion: FilaEjecucion,
  contexto: Contexto,
  ajustes: Record<string, any>
) {
  const destino = await buscarDestino(contexto)
  const { data: caso, error } = await supabaseAdmin
    .from('cases')
    .insert({
      tenant_id: ejecucion.tenant_id,
      branch_id: ejecucion.branch_id,
      contact_id: destino?.contact_id || null,
      conversation_id: destino?.conversation_id || null,
      tipo: 'normal',
      descripcion: rellenarHuecos(paso.asunto, contexto, ajustes),
      prioridad: paso.prioridad || 'normal',
      estatus: 'pendiente'
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se ha podido abrir el caso: ${error.message}`)

  await supabaseAdmin
    .from('automatizaciones_ejecuciones')
    .update({ contact_id: destino?.contact_id || null, conversation_id: destino?.conversation_id || null })
    .eq('id', ejecucion.id)
  return void caso
}

// --- Etiquetar la conversación --------------------------------------------
async function pasoEtiquetar(
  paso: Extract<Paso, { tipo: 'etiquetar' }>,
  ejecucion: FilaEjecucion,
  contexto: Contexto,
  ajustes: Record<string, any>
) {
  const destino = await buscarDestino(contexto)
  if (!destino) return { parar: true, detalle: 'No hay conversación que etiquetar.' }

  const nombre = rellenarHuecos(paso.etiqueta, contexto, ajustes)
  // Solo se usan etiquetas que existan de verdad en la sucursal (regla de oro
  // de Respondi: la IA no inventa etiquetas)
  const { data: etiqueta } = await supabaseAdmin
    .from('message_categories')
    .select('id')
    .eq('branch_id', ejecucion.branch_id)
    .ilike('nombre', nombre)
    .maybeSingle()
  if (!etiqueta) return { parar: true, detalle: `No existe la etiqueta "${nombre}" en esta sucursal. Créala en Etiquetas.` }

  await supabaseAdmin
    .from('conversation_tags')
    .insert({ conversation_id: destino.conversation_id, category_id: etiqueta.id })
    .select()
    .maybeSingle()
}

// ---------------------------------------------------------------------------
// El latido: lo que toca hacer ahora mismo
// ---------------------------------------------------------------------------
export async function ejecutarPendientes(presupuestoMs = 25000, maximo = 50) {
  const hasta = Date.now() + presupuestoMs
  let hechas = 0

  const { data: pendientes } = await supabaseAdmin
    .from('automatizaciones_ejecuciones')
    .select('id, tenant_id, branch_id, automatizacion_id, clave, paso, intentos, datos')
    .eq('estado', 'programada')
    .lte('ejecutar_en', new Date().toISOString())
    .order('ejecutar_en', { ascending: true })
    .limit(maximo)

  for (const fila of pendientes || []) {
    if (Date.now() > hasta) break
    try {
      await continuarEjecucion(fila as any)
      hechas++
    } catch (e: any) {
      await registrarError({
        origen: 'app',
        descripcion: 'Fallo inesperado al seguir una automatización',
        stacktrace: JSON.stringify({ ejecucion: (fila as any).id, error: e?.message }),
        tenant_id: (fila as any).tenant_id
      })
    }
  }

  return { hechas, pendientes: (pendientes || []).length }
}
