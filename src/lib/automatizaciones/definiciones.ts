import { automatizacionPorClave } from './catalogo'
import { CAMPO_CANAL, CANALES_SALIDA, type Automatizacion, type Condicion, type Disparador, type Paso, type Receta } from './tipos'
import { describirDisparador, describirPaso, describirCondicion } from './describir'

// De una fila de `automatizaciones` a su definición completa. Hay tres casos:
//   · del catálogo, tal cual: la receta es la nuestra
//   · del catálogo, moldeada: el cliente guardó su propia receta encima
//   · propia (clave `propia_...`): todo viene de la fila
// El motor y las pantallas solo hablan con esto; así el día del editor visual
// nadie tiene que tocar el motor.

export interface FilaAutomatizacion {
  id?: string
  clave: string
  nombre?: string | null
  descripcion?: string | null
  activa?: boolean
  ajustes?: Record<string, any> | null
  receta?: Receta | null
  marketing?: boolean | null
}

export const PREFIJO_PROPIA = 'propia_'
export const MAXIMO_PROPIAS_POR_SUCURSAL = 20

export function esPropia(clave: string) {
  return clave.startsWith(PREFIJO_PROPIA)
}

export const CAMPO_PLANTILLA_PROPIA = {
  clave: 'plantilla',
  etiqueta: 'Plantilla de WhatsApp',
  tipo: 'plantilla' as const,
  porDefecto: null,
  ayuda: 'WhatsApp solo deja escribir a un cliente que lleve más de 24 h sin hablarte usando una plantilla aprobada por Meta. Sus huecos se rellenan por orden con: nombre del cliente, número de pedido, total y enlace.'
}

export function definicionDeFila(fila: FilaAutomatizacion): Automatizacion | null {
  if (esPropia(fila.clave)) {
    if (!fila.receta) return null
    const escribe = fila.receta.pasos.some(p => p.tipo === 'mensaje')
    return {
      clave: fila.clave,
      nombre: (fila.nombre || 'Mi automatización').trim(),
      descripcion: (fila.descripcion || '').trim() || 'Automatización creada por ti.',
      detalle: (fila.descripcion || '').trim() || 'Automatización creada por ti.',
      categoria: 'propias' as any,
      estado: 'lista',
      requiereTienda: fila.receta.disparador.tipo === 'evento_tienda',
      permisos: fila.receta.disparador.tipo === 'evento_tienda' ? ['read_orders'] : [],
      escribeAlCliente: escribe,
      marketing: !!fila.marketing,
      campos: escribe ? [{ ...CAMPO_CANAL }, { ...CAMPO_PLANTILLA_PROPIA }] : [],
      receta: fila.receta
    }
  }
  const base = automatizacionPorClave(fila.clave)
  if (!base) return null
  if (!fila.receta) return base
  // Moldeada: la receta del cliente encima de la nuestra. Los ajustes que la
  // receta ya no usa se esconden de la pantalla (siguen guardados por si
  // vuelve a la de fábrica).
  return { ...base, receta: fila.receta, campos: camposQueUsa(base, fila.receta) }
}

// Qué ajustes sigue necesitando una receta (los que nombra + canal + plantilla)
export function camposQueUsa(base: Automatizacion, receta: Receta) {
  const usados = new Set<string>(['canal', 'plantilla'])
  const mirar = (c?: Condicion[]) => (c || []).forEach(x => x.ajuste && usados.add(x.ajuste))
  mirar(receta.condiciones)
  for (const p of receta.pasos) {
    if (p.tipo === 'esperar' && p.ajuste) usados.add(p.ajuste)
    if (p.tipo === 'comprobar') mirar(p.condiciones)
    if (p.tipo === 'mensaje') { if (p.ajuste_texto) usados.add(p.ajuste_texto); if (p.plantilla) usados.add(p.plantilla) }
    if (p.tipo === 'crear_descuento' && p.ajuste_porcentaje) usados.add(p.ajuste_porcentaje)
  }
  return base.campos.filter(c => usados.has(c.clave))
}

// ---------------------------------------------------------------------------
// Lo que el editor deja hacer (y el motor sabe hacer hoy)
// ---------------------------------------------------------------------------
export const DISPARADORES_EDITOR: { valor: string; etiqueta: string; disparador: Disparador }[] = [
  { valor: 'orders/create', etiqueta: 'Cuando entra un pedido nuevo en la tienda', disparador: { tipo: 'evento_tienda', evento: 'orders/create' } },
  { valor: 'orders/fulfilled', etiqueta: 'Cuando se marca un pedido como enviado', disparador: { tipo: 'evento_tienda', evento: 'orders/fulfilled' } },
  { valor: 'orders/cancelled', etiqueta: 'Cuando se cancela un pedido', disparador: { tipo: 'evento_tienda', evento: 'orders/cancelled' } },
  { valor: 'cada_dia', etiqueta: 'Cada día a una hora', disparador: { tipo: 'programado', cada: 'dia', hora: 9 } },
  { valor: 'cada_hora', etiqueta: 'Cada hora', disparador: { tipo: 'programado', cada: 'hora' } }
]

export const CAMPOS_CONDICION: { campo: string; etiqueta: string; tipo: 'numero' | 'texto' | 'si_no' }[] = [
  { campo: 'pedido.total', etiqueta: 'El total del pedido', tipo: 'numero' },
  { campo: 'pedido.pais', etiqueta: 'El país del pedido', tipo: 'texto' },
  { campo: 'pedido.contrareembolso', etiqueta: 'El pedido se paga a la entrega', tipo: 'si_no' },
  { campo: 'pedido.enviado', etiqueta: 'El pedido ya ha salido', tipo: 'si_no' },
  { campo: 'cliente.acepta_marketing', etiqueta: 'El cliente acepta promociones', tipo: 'si_no' },
  { campo: 'cliente.compras', etiqueta: 'El número de compras del cliente', tipo: 'numero' },
  { campo: 'cliente.primera_compra', etiqueta: 'Es su primera compra', tipo: 'si_no' },
  { campo: 'pedido.productos_texto', etiqueta: 'Los productos del pedido', tipo: 'texto' }
]

export const OPERADORES_POR_TIPO: Record<'numero' | 'texto' | 'si_no', { valor: Condicion['operador']; etiqueta: string }[]> = {
  numero: [{ valor: 'mayor', etiqueta: 'es mayor que' }, { valor: 'menor', etiqueta: 'es menor que' }, { valor: 'igual', etiqueta: 'es igual a' }],
  texto: [{ valor: 'igual', etiqueta: 'es' }, { valor: 'distinto', etiqueta: 'no es' }, { valor: 'contiene', etiqueta: 'contiene' }],
  si_no: [{ valor: 'es_cierto', etiqueta: 'sí' }, { valor: 'es_falso', etiqueta: 'no' }]
}

export const PASOS_EDITOR: { tipo: Paso['tipo']; etiqueta: string }[] = [
  { tipo: 'mensaje', etiqueta: 'Escribir al cliente' },
  { tipo: 'esperar', etiqueta: 'Esperar' },
  { tipo: 'comprobar', etiqueta: 'Seguir solo si…' },
  { tipo: 'avisar_equipo', etiqueta: 'Avisar al equipo' },
  { tipo: 'abrir_caso', etiqueta: 'Abrir un caso' },
  { tipo: 'etiquetar', etiqueta: 'Etiquetar la conversación' },
  { tipo: 'crear_descuento', etiqueta: 'Crear un código de descuento en la tienda' }
]

const MAX_PASOS = 15
const MAX_ESPERA_MS = 30 * 24 * 3600 * 1000
const MAX_CONDICIONES = 5

// Comprueba una receta antes de guardarla. Devuelve el problema en cristiano,
// o null si está bien. Es la única puerta: lo que pase por aquí, el motor lo
// puede ejecutar sin sorpresas.
export function problemaDeReceta(receta: any, opciones: { propia: boolean }): string | null {
  if (!receta || typeof receta !== 'object') return 'La receta está vacía.'
  const d = receta.disparador
  if (!d || typeof d !== 'object') return 'Falta decir cuándo se dispara.'
  if (opciones.propia) {
    if (!DISPARADORES_EDITOR.some(x => JSON.stringify(x.disparador) === JSON.stringify({ ...x.disparador, ...d }) && x.disparador.tipo === d.tipo && ((x.disparador as any).evento === d.evento || (x.disparador as any).cada === d.cada))) {
      return 'Ese disparador no está entre los que se pueden elegir.'
    }
    if (d.tipo === 'programado' && d.cada === 'dia' && (!Number.isInteger(d.hora) || d.hora < 0 || d.hora > 23)) return 'La hora tiene que estar entre 0 y 23.'
  }

  const problemaCondiciones = (lista: any, donde: string): string | null => {
    if (lista === undefined || lista === null) return null
    if (!Array.isArray(lista)) return `Las condiciones ${donde} no tienen la forma esperada.`
    if (lista.length > MAX_CONDICIONES) return `Como mucho ${MAX_CONDICIONES} condiciones ${donde}.`
    for (const c of lista) {
      if (!c || typeof c.campo !== 'string' || !c.campo.trim()) return `Una condición ${donde} no dice qué mirar.`
      if (opciones.propia && !CAMPOS_CONDICION.some(x => x.campo === c.campo)) return `"${c.campo}" no es un dato que se pueda comprobar.`
      if (!['mayor', 'menor', 'igual', 'distinto', 'contiene', 'es_cierto', 'es_falso', 'existe', 'no_existe'].includes(c.operador)) return `Una condición ${donde} tiene una comparación que no existe.`
      if (['mayor', 'menor', 'igual', 'distinto', 'contiene'].includes(c.operador) && c.ajuste === undefined && (c.valor === undefined || c.valor === null || c.valor === '')) {
        return `Una condición ${donde} está sin valor.`
      }
      if (typeof c.valor === 'string' && c.valor.length > 200) return `El valor de una condición ${donde} es demasiado largo.`
    }
    return null
  }
  const pc = problemaCondiciones(receta.condiciones, 'de entrada')
  if (pc) return pc

  if (!Array.isArray(receta.pasos) || !receta.pasos.length) return 'La automatización tiene que hacer algo: añade al menos un paso.'
  if (receta.pasos.length > MAX_PASOS) return `Como mucho ${MAX_PASOS} pasos.`

  // Las propias solo pueden llevar los pasos del editor. Las del catálogo
  // moldeadas conservan además los pasos que Respondi ya les puso (la IA
  // contesta, crear descuento...), pero tampoco admiten nada que el motor no
  // conozca: "reembolsar" no existe para nadie.
  const permitidos = new Set<string>(PASOS_EDITOR.map(p => p.tipo))
  const delMotor = new Set<string>([...permitidos, 'ia_responde', 'pausar_ia', 'crear_descuento', 'enlace_compra', 'etiquetar_en_tienda', 'importar_catalogo', 'importar_politicas'])
  for (const [i, p] of receta.pasos.entries()) {
    const n = i + 1
    if (!p || typeof p.tipo !== 'string') return `El paso ${n} no tiene tipo.`
    if (!delMotor.has(p.tipo)) return `El paso ${n} ("${p.tipo}") no existe.`
    if (opciones.propia && !permitidos.has(p.tipo)) return `El paso ${n} ("${p.tipo}") no está entre los que se pueden usar.`
    switch (p.tipo) {
      case 'esperar': {
        const ms = ((p.dias || 0) * 24 * 3600 + (p.horas || 0) * 3600 + (p.minutos || 0) * 60) * 1000
        if (!p.ajuste && ms <= 0) return `El paso ${n} (esperar) tiene que esperar algo de tiempo.`
        if (ms > MAX_ESPERA_MS) return `El paso ${n} espera más de 30 días.`
        break
      }
      case 'comprobar': {
        const pp = problemaCondiciones(p.condiciones, `del paso ${n}`)
        if (pp) return pp
        if (!p.condiciones?.length) return `El paso ${n} ("seguir solo si") no tiene ninguna condición.`
        break
      }
      case 'mensaje': {
        const texto = String(p.texto || '').trim()
        if (!p.ajuste_texto && !texto) return `El paso ${n} (escribir al cliente) no tiene texto.`
        if (texto.length > 1000) return `El paso ${n}: el mensaje no puede pasar de 1000 caracteres.`
        break
      }
      case 'avisar_equipo':
        if (!String(p.texto || '').trim()) return `El paso ${n} (avisar al equipo) no tiene texto.`
        if (String(p.texto).length > 500) return `El paso ${n}: el aviso no puede pasar de 500 caracteres.`
        break
      case 'abrir_caso':
        if (!String(p.asunto || '').trim()) return `El paso ${n} (abrir caso) no tiene asunto.`
        if (String(p.asunto).length > 200) return `El paso ${n}: el asunto no puede pasar de 200 caracteres.`
        if (p.prioridad && !['baja', 'normal', 'alta'].includes(p.prioridad)) return `El paso ${n}: la prioridad tiene que ser baja, normal o alta.`
        break
      case 'crear_descuento': {
        const pct = p.ajuste_porcentaje ? undefined : Number(p.porcentaje)
        if (pct !== undefined && (!Number.isFinite(pct) || pct < 1 || pct > 90)) return `El paso ${n}: el descuento tiene que estar entre 1 y 90 %.`
        if (p.dias_validez !== undefined && (!Number.isFinite(Number(p.dias_validez)) || Number(p.dias_validez) < 1 || Number(p.dias_validez) > 90)) return `El paso ${n}: los días de validez tienen que estar entre 1 y 90.`
        break
      }
      case 'etiquetar':
        if (!String(p.etiqueta || '').trim()) return `El paso ${n} (etiquetar) no dice qué etiqueta.`
        if (String(p.etiqueta).length > 60) return `El paso ${n}: el nombre de la etiqueta es demasiado largo.`
        break
      case 'ia_responde':
        if (!String(p.instruccion || '').trim()) return `El paso ${n} (la IA contesta) no tiene instrucción.`
        break
      default:
        break
    }
  }
  return null
}

// Deja la receta limpia de cosas que no son suyas (lo que llegue de la
// pantalla puede traer campos de más)
export function limpiarReceta(receta: any): Receta {
  const cond = (lista: any): Condicion[] | undefined => Array.isArray(lista) && lista.length
    ? lista.map((c: any) => ({ campo: String(c.campo), operador: c.operador, ...(c.ajuste !== undefined ? { ajuste: String(c.ajuste) } : {}), ...(c.valor !== undefined ? { valor: typeof c.valor === 'string' ? c.valor.trim() : c.valor } : {}) }))
    : undefined
  const d = receta.disparador
  const disparador: Disparador = d.tipo === 'programado'
    ? { tipo: 'programado', cada: d.cada, ...(d.cada === 'dia' ? { hora: Number(d.hora ?? 9) } : {}) }
    : d.tipo === 'evento_tienda' ? { tipo: 'evento_tienda', evento: String(d.evento) }
    : d.tipo === 'mensaje_cliente' ? { tipo: 'mensaje_cliente', intencion: String(d.intencion) }
    : { tipo: 'evento_interno', evento: String(d.evento) }
  const pasos: Paso[] = receta.pasos.map((p: any): Paso => {
    switch (p.tipo) {
      case 'esperar': return { tipo: 'esperar', ...(p.ajuste ? { ajuste: String(p.ajuste) } : {}), ...(p.dias ? { dias: Number(p.dias) } : {}), ...(p.horas ? { horas: Number(p.horas) } : {}), ...(p.minutos ? { minutos: Number(p.minutos) } : {}) }
      case 'comprobar': return { tipo: 'comprobar', condiciones: cond(p.condiciones) || [] }
      case 'mensaje': return { tipo: 'mensaje', texto: String(p.texto || '').trim(), ...(p.ajuste_texto ? { ajuste_texto: String(p.ajuste_texto) } : {}), plantilla: 'plantilla' }
      case 'avisar_equipo': return { tipo: 'avisar_equipo', texto: String(p.texto || '').trim() }
      case 'abrir_caso': return { tipo: 'abrir_caso', asunto: String(p.asunto || '').trim(), prioridad: p.prioridad || 'normal' }
      case 'etiquetar': return { tipo: 'etiquetar', etiqueta: String(p.etiqueta || '').trim() }
      case 'ia_responde': return { tipo: 'ia_responde', instruccion: String(p.instruccion || '').trim() }
      case 'pausar_ia': return { tipo: 'pausar_ia' }
      case 'crear_descuento': return { tipo: 'crear_descuento', ...(p.ajuste_porcentaje ? { ajuste_porcentaje: String(p.ajuste_porcentaje) } : {}), ...(p.porcentaje ? { porcentaje: Number(p.porcentaje) } : {}), ...(p.dias_validez ? { dias_validez: Number(p.dias_validez) } : {}) }
      case 'enlace_compra': return { tipo: 'enlace_compra' }
      case 'etiquetar_en_tienda': return { tipo: 'etiquetar_en_tienda', etiqueta: String(p.etiqueta || '').trim() }
      case 'importar_catalogo': return { tipo: 'importar_catalogo' }
      case 'importar_politicas': return { tipo: 'importar_politicas' }
      default: return p
    }
  })
  const condiciones = cond(receta.condiciones)
  return { disparador, ...(condiciones ? { condiciones } : {}), pasos }
}

// ---------------------------------------------------------------------------
// Probar con un pedido de ejemplo: qué haría, sin hacer nada
// ---------------------------------------------------------------------------
export interface Entorno {
  canales: string[]              // los conectados: 'whatsapp', 'email'
  plantillaAprobada: boolean     // ¿la plantilla elegida está aprobada?
  etiquetas: string[]            // las que existen en la sucursal
  tiendaConectada: boolean
}

export interface PasoSimulado {
  titulo: string
  resultado: 'haria' | 'saltaria' | 'pararia' | 'aviso'
  detalle?: string
}

export const PEDIDO_DE_EJEMPLO = {
  referencia: '#1042',
  negocio: 'Tu negocio',
  pedido: { numero: '#1042', id: '1042', total: 43.4, moneda: 'EUR', productos: ['Tarta Sacher'], seguimiento: 'ABC123', enlace_seguimiento: 'https://seguimiento.ejemplo.com/ABC123', contrareembolso: false, falta_dato: null, enviado: false, cancelado: false, pais: 'España', productos_texto: 'Tarta Sacher' },
  cliente: { nombre: 'Laura', email: 'laura@ejemplo.com', telefono: '+34600111222', acepta_marketing: true, compras: 3, gasto: 120, primera_compra: false, ha_contestado: false },
  carrito: { enlace: 'https://tutienda.com/carrito/abc', comprado: false, productos: ['Tarta Sacher'] },
  producto: { nombre: 'Tarta Sacher', enlace: 'https://tutienda.com/productos/tarta-sacher', hay_stock: true, precio: 28.5 }
}

function valorDe(contexto: any, campo: string) {
  return campo.split('.').reduce((d, p) => (d == null ? undefined : d[p]), contexto)
}

function cumple(condiciones: Condicion[], contexto: any, ajustes: Record<string, any>) {
  return condiciones.every(c => {
    const v = valorDe(contexto, c.campo)
    const e = c.ajuste !== undefined ? ajustes[c.ajuste] : c.valor
    switch (c.operador) {
      case 'es_cierto': return v === true
      case 'es_falso': return v === false || v == null
      case 'existe': return v != null && v !== ''
      case 'no_existe': return v == null || v === ''
      case 'mayor': return Number(v) > Number(e)
      case 'menor': return Number(v) < Number(e)
      case 'igual': return String(v) === String(e)
      case 'distinto': return String(v) !== String(e)
      case 'contiene': return String(v ?? '').toLowerCase().includes(String(e ?? '').toLowerCase())
      default: return false
    }
  })
}

function rellenar(texto: string, contexto: any, ajustes: Record<string, any>) {
  const valores: Record<string, string> = {
    negocio: contexto.negocio || '', cliente: contexto.cliente?.nombre || '', pedido: contexto.pedido?.numero || '',
    total: contexto.pedido?.total !== undefined ? `${Number(contexto.pedido.total).toLocaleString('es-ES', { minimumFractionDigits: 2 })} ${contexto.pedido?.moneda || ''}`.trim() : '',
    seguimiento: contexto.pedido?.enlace_seguimiento || '', producto: contexto.producto?.nombre || '', enlace: contexto.carrito?.enlace || contexto.producto?.enlace || '',
    codigo: 'EJEMPLO10', descuento: ajustes.porcentaje ? `${ajustes.porcentaje}%` : '', dias: String(ajustes.avisar_dias_antes ?? ajustes.dias ?? ''), falta: contexto.pedido?.falta_dato || '', etiqueta: ''
  }
  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (t, n) => valores[String(n).toLowerCase()] ?? t)
}

export function simularReceta(definicion: Automatizacion, ajustes: Record<string, any>, entorno: Entorno, contexto: any = PEDIDO_DE_EJEMPLO): PasoSimulado[] {
  const salida: PasoSimulado[] = []
  const r = definicion.receta
  salida.push({ titulo: describirDisparador(r.disparador), resultado: 'haria' })

  if (definicion.requiereTienda && !entorno.tiendaConectada) {
    salida.push({ titulo: 'Necesita la tienda conectada', resultado: 'aviso', detalle: 'Hasta que conectes tu tienda, esta automatización no se dispararía.' })
  }
  if (r.condiciones?.length) {
    const ok = cumple(r.condiciones, contexto, ajustes)
    salida.push({ titulo: 'Solo ' + r.condiciones.map(c => describirCondicion(c, ajustes)).join(' y '), resultado: ok ? 'haria' : 'pararia', detalle: ok ? 'Con el pedido de ejemplo, se cumple.' : 'Con el pedido de ejemplo no se cumple: aquí se pararía.' })
    if (!ok) return salida
  }
  if (definicion.marketing && contexto.cliente?.acepta_marketing !== true) {
    salida.push({ titulo: 'Es promoción', resultado: 'pararia', detalle: 'Este cliente no ha aceptado promociones: no se le escribiría.' })
    return salida
  }

  for (const paso of r.pasos) {
    const d = describirPaso(paso, ajustes)
    if (paso.tipo === 'comprobar') {
      const ok = cumple(paso.condiciones, contexto, ajustes)
      salida.push({ titulo: d.titulo, resultado: ok ? 'haria' : 'pararia', detalle: ok ? 'Se cumple con el pedido de ejemplo.' : 'No se cumple con el pedido de ejemplo: aquí se pararía.' })
      if (!ok) return salida
      continue
    }
    if (paso.tipo === 'mensaje') {
      const canal = (ajustes.canal || 'auto') as string
      const texto = rellenar(String((paso.ajuste_texto ? ajustes[paso.ajuste_texto] : paso.texto) || ''), contexto, ajustes)
      const hayWa = entorno.canales.includes('whatsapp'), hayMail = entorno.canales.includes('email')
      const posibles = canal === 'whatsapp' ? (hayWa ? ['WhatsApp'] : []) : canal === 'email' ? (hayMail ? ['correo'] : []) : canal === 'ambos' ? [hayWa && 'WhatsApp', hayMail && 'correo'].filter(Boolean) : [hayWa ? 'WhatsApp' : hayMail ? 'correo' : null].filter(Boolean)
      if (!posibles.length) {
        salida.push({ titulo: d.titulo, resultado: 'pararia', detalle: `No hay ${canal === 'email' ? 'correo' : canal === 'whatsapp' ? 'WhatsApp' : 'ningún canal'} conectado: no se podría escribir.` })
        return salida
      }
      salida.push({ titulo: `Escribir al cliente por ${posibles.join(' y ')}`, resultado: 'haria', detalle: texto })
      if (posibles.includes('WhatsApp') && !entorno.plantillaAprobada) {
        salida.push({ titulo: 'Ojo con WhatsApp', resultado: 'aviso', detalle: 'Sin una plantilla aprobada por Meta, por WhatsApp solo se escribiría a quien te haya escrito en las últimas 24 h. Los demás quedarían sin aviso.' })
      }
      continue
    }
    if (paso.tipo === 'etiquetar') {
      const existe = entorno.etiquetas.some(e => e.toLowerCase() === paso.etiqueta.toLowerCase())
      salida.push({ titulo: d.titulo, resultado: existe ? 'haria' : 'pararia', detalle: existe ? undefined : `La etiqueta "${paso.etiqueta}" no existe en esta sucursal: créala en Etiquetas.` })
      if (!existe) return salida
      continue
    }
    if (paso.tipo === 'avisar_equipo') { salida.push({ titulo: d.titulo, resultado: 'haria', detalle: rellenar(paso.texto, contexto, ajustes) }); continue }
    if (paso.tipo === 'abrir_caso') { salida.push({ titulo: d.titulo, resultado: 'haria', detalle: rellenar(paso.asunto, contexto, ajustes) }); continue }
    if (paso.tipo === 'crear_descuento') {
      if (!entorno.tiendaConectada) { salida.push({ titulo: d.titulo, resultado: 'pararia', detalle: 'Sin tienda conectada no se puede crear el descuento.' }); return salida }
      salida.push({ titulo: d.titulo, resultado: 'haria', detalle: 'Se crearía un código de un solo uso en Shopify (en la prueba: EJEMPLO10).' })
      continue
    }
    if (paso.tipo === 'etiquetar_en_tienda') { salida.push({ titulo: d.titulo, resultado: entorno.tiendaConectada ? 'haria' : 'pararia', detalle: entorno.tiendaConectada ? undefined : 'Sin tienda conectada no se puede etiquetar en Shopify.' }); if (!entorno.tiendaConectada) return salida; continue }
    if (paso.tipo === 'ia_responde') { salida.push({ titulo: d.titulo, resultado: 'haria', detalle: paso.instruccion }); continue }
    if (paso.tipo === 'pausar_ia') { salida.push({ titulo: d.titulo, resultado: 'haria' }); continue }
    if (paso.tipo === 'importar_catalogo' || paso.tipo === 'importar_politicas') { salida.push({ titulo: d.titulo, resultado: entorno.tiendaConectada ? 'haria' : 'pararia', detalle: entorno.tiendaConectada ? 'No manda mensajes a nadie.' : 'Hace falta la tienda conectada.' }); if (!entorno.tiendaConectada) return salida; continue }
    if (['enlace_compra'].includes(paso.tipo)) {
      salida.push({ titulo: d.titulo, resultado: 'aviso', detalle: 'Este paso todavía se está construyendo: de momento la automatización se pararía aquí.' })
      return salida
    }
    salida.push({ titulo: d.titulo, resultado: 'haria', detalle: d.detalle })
  }
  return salida
}

export { CANALES_SALIDA }
