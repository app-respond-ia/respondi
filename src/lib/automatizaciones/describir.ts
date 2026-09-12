import { CANALES_SALIDA, type Automatizacion, type Condicion, type Disparador, type Paso, type Receta } from './tipos'

// La receta contada en cristiano, paso a paso, para pintar el workflow en la
// pantalla ("Cuando entra un pedido → Si el total pasa de 300 € → Avisar al
// equipo") y para el botón de probar con un pedido de ejemplo. No ejecuta
// nada: solo describe.

export interface PasoDescrito {
  // 'disparador' | 'condicion' | el tipo del paso
  tipo: string
  titulo: string
  detalle?: string
  // Posición en receta.pasos (los del disparador y condiciones no la tienen)
  indice?: number
}

const NOMBRE_EVENTO: Record<string, string> = {
  'orders/create': 'Cuando entra un pedido nuevo en la tienda',
  'orders/paid': 'Cuando se paga un pedido',
  'orders/fulfilled': 'Cuando se marca un pedido como enviado',
  'orders/cancelled': 'Cuando se cancela un pedido',
  'refunds/create': 'Cuando se reembolsa un pedido',
  'fulfillments/delivered': 'Cuando el transportista entrega el pedido',
  'checkouts/update': 'Cuando alguien llega al pago y no lo termina'
}

const NOMBRE_INTENCION: Record<string, string> = {
  estado_pedido: 'Cuando un cliente pregunta por su pedido',
  cambio_direccion: 'Cuando un cliente pide cambiar la dirección',
  busca_producto: 'Cuando un cliente pregunta por un producto',
  quiere_comprar: 'Cuando un cliente quiere comprar algo',
  pide_presupuesto: 'Cuando un cliente pide un presupuesto',
  devolucion: 'Cuando un cliente quiere devolver algo',
  producto_danado: 'Cuando un cliente dice que le llegó dañado o equivocado',
  reclamacion: 'Cuando un cliente pone una reclamación'
}

const NOMBRE_EVENTO_INTERNO: Record<string, string> = {
  carrito_primer_aviso_enviado: 'Después del primer aviso de carrito abandonado',
  conversacion_etiquetada: 'Cuando se etiqueta una conversación',
  mensaje_entrante: 'Cuando entra un mensaje de un cliente',
  caso_cerrado: 'Cuando se cierra un caso',
  primer_mensaje: 'Cuando un cliente escribe por primera vez'
}

const NOMBRE_CAMPO: Record<string, string> = {
  'pedido.total': 'el total del pedido',
  'pedido.pais': 'el país del pedido',
  'pedido.productos_texto': 'los productos del pedido',
  'pedido.contrareembolso': 'el pedido se paga a la entrega',
  'pedido.falta_dato': 'al pedido le falta algún dato',
  'pedido.enviado': 'el pedido ya ha salido',
  'pedido.cancelado': 'el pedido está cancelado',
  'cliente.acepta_marketing': 'el cliente acepta promociones',
  'cliente.ha_contestado': 'el cliente ha contestado',
  'cliente.compras': 'el número de compras del cliente',
  'cliente.gasto': 'lo que lleva gastado el cliente',
  'cliente.primera_compra': 'es su primera compra',
  'carrito.comprado': 'el carrito ya se ha comprado',
  'producto.hay_stock': 'hay stock del producto',
  'conversacion.canal': 'el canal de la conversación',
  'conversacion.etiqueta': 'la conversación lleva la etiqueta'
}

export function describirDisparador(d: Disparador): string {
  if (d.tipo === 'evento_tienda') return NOMBRE_EVENTO[d.evento] || `Cuando pasa "${d.evento}" en la tienda`
  if (d.tipo === 'mensaje_cliente') return NOMBRE_INTENCION[d.intencion] || `Cuando un cliente escribe (${d.intencion})`
  if (d.tipo === 'evento_interno') return NOMBRE_EVENTO_INTERNO[d.evento] || `Cuando pasa "${d.evento}" en Respondi`
  if (d.tipo === 'programado') {
    if (d.cada === 'hora') return 'Cada hora'
    if (d.cada === 'semana') return 'Una vez a la semana'
    return `Cada día a las ${String(d.hora ?? 9).padStart(2, '0')}:00`
  }
  return 'Cuando toque'
}

export function describirCondicion(c: Condicion, ajustes: Record<string, any> = {}): string {
  const que = NOMBRE_CAMPO[c.campo] || c.campo
  const valor = c.ajuste !== undefined ? ajustes[c.ajuste] : c.valor
  switch (c.operador) {
    case 'es_cierto': return `si ${que}`
    case 'es_falso': return `si no ${que}`
    case 'existe': return `si hay ${que}`
    case 'no_existe': return `si no hay ${que}`
    case 'mayor': return `si ${que} es mayor que ${valor ?? '…'}`
    case 'menor': return `si ${que} es menor que ${valor ?? '…'}`
    case 'igual': return `si ${que} es ${valor ?? '…'}`
    case 'distinto': return `si ${que} no es ${valor ?? '…'}`
    case 'contiene': return `si ${que} contiene "${valor ?? '…'}"`
    default: return que
  }
}

function tiempo(paso: Extract<Paso, { tipo: 'esperar' }>, ajustes: Record<string, any>) {
  if (paso.ajuste) {
    const v = Number(ajustes[paso.ajuste]) || 0
    if (/minuto/.test(paso.ajuste)) return `${v} ${v === 1 ? 'minuto' : 'minutos'}`
    if (/dia/.test(paso.ajuste)) return `${v} ${v === 1 ? 'día' : 'días'}`
    return `${v} ${v === 1 ? 'hora' : 'horas'}`
  }
  const partes: string[] = []
  if (paso.dias) partes.push(`${paso.dias} ${paso.dias === 1 ? 'día' : 'días'}`)
  if (paso.horas) partes.push(`${paso.horas} ${paso.horas === 1 ? 'hora' : 'horas'}`)
  if (paso.minutos) partes.push(`${paso.minutos} ${paso.minutos === 1 ? 'minuto' : 'minutos'}`)
  return partes.join(' y ') || 'un momento'
}

export function describirPaso(paso: Paso, ajustes: Record<string, any> = {}): { titulo: string; detalle?: string } {
  switch (paso.tipo) {
    case 'esperar':
      return { titulo: `Esperar ${tiempo(paso, ajustes)}` }
    case 'comprobar':
      return { titulo: 'Seguir solo ' + paso.condiciones.map(c => describirCondicion(c, ajustes)).join(' y ') }
    case 'mensaje': {
      const canal = CANALES_SALIDA.find(c => c.valor === (ajustes.canal || 'auto'))
      const texto = String((paso.ajuste_texto ? ajustes[paso.ajuste_texto] : paso.texto) || '').trim()
      return { titulo: `Escribir al cliente (${canal ? canal.etiqueta.split(':')[0].toLowerCase() : 'automático'})`, detalle: texto || undefined }
    }
    case 'ia_responde':
      return { titulo: 'La IA contesta', detalle: paso.instruccion }
    case 'etiquetar':
      return { titulo: `Etiquetar la conversación: "${paso.etiqueta}"` }
    case 'abrir_caso':
      return { titulo: `Abrir un caso para el equipo${paso.prioridad === 'alta' ? ' (prioridad alta)' : paso.prioridad === 'baja' ? ' (prioridad baja)' : ''}`, detalle: paso.asunto }
    case 'avisar_equipo':
      return { titulo: 'Avisar al equipo', detalle: paso.texto }
    case 'pausar_ia':
      return { titulo: 'La IA deja de contestar: sigue una persona' }
    case 'crear_descuento': {
      const pct = paso.ajuste_porcentaje ? ajustes[paso.ajuste_porcentaje] : paso.porcentaje
      return { titulo: `Crear un código de descuento${pct ? ` del ${pct}%` : ''} en la tienda` }
    }
    case 'enlace_compra':
      return { titulo: 'Preparar el carrito en la tienda y mandar el enlace para pagar' }
    case 'etiquetar_en_tienda':
      return { titulo: `Poner la etiqueta "${paso.etiqueta}" al cliente en Shopify` }
    case 'importar_catalogo':
      return { titulo: 'Traer los productos de la tienda a la lista de precios' }
    case 'importar_politicas':
      return { titulo: 'Traer las políticas de la tienda a las normas de la IA' }
    default:
      return { titulo: (paso as any).tipo }
  }
}

// La receta entera, en orden: disparador, condiciones de entrada y pasos
export function describirReceta(receta: Receta, ajustes: Record<string, any> = {}): PasoDescrito[] {
  const salida: PasoDescrito[] = [{ tipo: 'disparador', titulo: describirDisparador(receta.disparador) }]
  if (receta.condiciones?.length) {
    salida.push({ tipo: 'condicion', titulo: 'Solo ' + receta.condiciones.map(c => describirCondicion(c, ajustes)).join(' y ') })
  }
  receta.pasos.forEach((paso, indice) => {
    const d = describirPaso(paso, ajustes)
    salida.push({ tipo: paso.tipo, titulo: d.titulo, detalle: d.detalle, indice })
  })
  return salida
}

export function describirAutomatizacion(a: Automatizacion, ajustes: Record<string, any> = {}) {
  return describirReceta(a.receta, ajustes)
}
