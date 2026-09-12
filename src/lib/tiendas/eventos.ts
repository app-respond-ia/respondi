import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { definicionDeFila } from '@/lib/automatizaciones/definiciones'
import { lanzarAutomatizacion, automatizacionesActivas, type Contexto } from '@/lib/automatizaciones/motor'
import { consultarTienda } from './shopify'

// De lo que pasa en la tienda a lo que entiende el motor.
//
// Shopify avisa con su propio vocabulario ('orders/create', 'line_items',
// 'fulfillment_status'...). Aquí se traduce una vez, y a partir de ahí las
// recetas hablan de "pedido", "cliente" y "producto".

export interface TiendaBasica {
  id: string
  tenant_id: string
  branch_id: string
  dominio: string
  moneda?: string | null
}

// ---------------------------------------------------------------------------
// Un pedido, venga como venga (aviso de Shopify o consulta nuestra)
// ---------------------------------------------------------------------------
export function contextoDePedido(pedido: any, tienda: TiendaBasica): Contexto {
  const cliente = pedido?.customer || {}
  const envio = pedido?.shipping_address || {}
  const entrega = (pedido?.fulfillments || [])[0] || {}

  const nombre = [cliente.first_name, cliente.last_name].filter(Boolean).join(' ').trim()
    || String(envio.name || '').trim()
    || null

  const telefono = pedido?.phone || cliente.phone || envio.phone || null
  const correo = pedido?.email || cliente.email || null

  return {
    tenant_id: tienda.tenant_id,
    branch_id: tienda.branch_id,
    tienda_id: tienda.id,
    referencia: String(pedido?.name || pedido?.id || ''),
    pedido: {
      numero: pedido?.name || `#${pedido?.id}`,
      id: String(pedido?.id || ''),
      total: numero(pedido?.total_price ?? pedido?.current_total_price),
      moneda: pedido?.currency || tienda.moneda || 'EUR',
      productos: (pedido?.line_items || []).map((l: any) => l?.title).filter(Boolean),
      seguimiento: entrega.tracking_number || null,
      enlace_seguimiento: entrega.tracking_url || (entrega.tracking_urls || [])[0] || null,
      contrareembolso: esContraReembolso(pedido),
      falta_dato: datoQueFalta(pedido),
      enviado: pedido?.fulfillment_status === 'fulfilled',
      cancelado: !!pedido?.cancelled_at,
      creado: pedido?.created_at || null,
      // Para las condiciones del editor
      pais: envio.country || pedido?.billing_address?.country || null,
      productos_texto: (pedido?.line_items || []).map((l: any) => l?.title).filter(Boolean).join(', ')
    },
    cliente: {
      nombre,
      email: correo,
      telefono,
      acepta_marketing: aceptaMarketing(cliente),
      compras: numero(cliente.orders_count) ?? 0,
      gasto: numero(cliente.total_spent) ?? 0,
      primera_compra: (numero(cliente.orders_count) ?? 1) <= 1,
      id_tienda: cliente.id ? String(cliente.id) : null
    }
  }
}

// El mismo pedido cuando lo pedimos nosotros por GraphQL (nombres distintos)
export function contextoDePedidoGraphql(nodo: any, tienda: TiendaBasica): Contexto {
  const entrega = (nodo?.fulfillments || [])[0] || {}
  const seguimiento = (entrega.trackingInfo || [])[0] || {}
  const cliente = nodo?.customer || {}

  return {
    tenant_id: tienda.tenant_id,
    branch_id: tienda.branch_id,
    tienda_id: tienda.id,
    referencia: String(nodo?.name || nodo?.id || ''),
    pedido: {
      numero: nodo?.name || '',
      id: String(nodo?.id || ''),
      total: numero(nodo?.totalPriceSet?.shopMoney?.amount),
      moneda: nodo?.totalPriceSet?.shopMoney?.currencyCode || tienda.moneda || 'EUR',
      productos: (nodo?.lineItems?.nodes || nodo?.lineItems || []).map((l: any) => l?.title).filter(Boolean),
      seguimiento: seguimiento.number || null,
      enlace_seguimiento: seguimiento.url || null,
      contrareembolso: false,
      falta_dato: null,
      enviado: nodo?.displayFulfillmentStatus === 'FULFILLED',
      cancelado: !!nodo?.cancelledAt,
      creado: nodo?.createdAt || null
    },
    cliente: {
      nombre: [cliente.firstName, cliente.lastName].filter(Boolean).join(' ').trim() || null,
      email: nodo?.email || cliente.email || null,
      telefono: nodo?.phone || cliente.phone || null,
      acepta_marketing: cliente?.emailMarketingConsent?.marketingState === 'SUBSCRIBED',
      compras: numero(cliente.numberOfOrders) ?? 0,
      gasto: numero(cliente.amountSpent?.amount) ?? 0,
      id_tienda: cliente.id ? String(cliente.id) : null
    }
  }
}

// Un checkout (carrito con el pago empezado), como lo manda Shopify
export function contextoDeCheckout(c: any, tienda: TiendaBasica): Contexto {
  const cliente = c?.customer || {}
  const productos = (c?.line_items || []).map((l: any) => l?.title).filter(Boolean)
  return {
    tenant_id: tienda.tenant_id,
    branch_id: tienda.branch_id,
    tienda_id: tienda.id,
    referencia: `checkout:${c?.token || c?.id}`,
    carrito: { enlace: c?.abandoned_checkout_url || null, comprado: false, productos },
    pedido: { total: numero(c?.total_price), moneda: c?.currency || tienda.moneda || 'EUR', productos },
    producto: { nombre: productos.join(', ') },
    cliente: {
      nombre: [cliente.first_name, cliente.last_name].filter(Boolean).join(' ').trim() || String(c?.shipping_address?.name || '').trim() || null,
      email: c?.email || cliente.email || null,
      telefono: c?.phone || cliente.phone || c?.shipping_address?.phone || null,
      acepta_marketing: aceptaMarketing(cliente) || c?.buyer_accepts_marketing === true,
      id_tienda: cliente.id ? String(cliente.id) : null
    }
  }
}

function numero(valor: any): number | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined
  const n = Number(valor)
  return Number.isFinite(n) ? n : undefined
}

// ¿Ha aceptado recibir promociones? Shopify lo cuenta de dos formas según la
// antigüedad de la tienda: la vieja (`accepts_marketing`) y la de ahora
// (`email_marketing_consent.state`). Ante la duda, no.
function aceptaMarketing(cliente: any): boolean {
  const estado = String(cliente?.email_marketing_consent?.state || '').toLowerCase()
  if (estado) return estado === 'subscribed'
  const sms = String(cliente?.sms_marketing_consent?.state || '').toLowerCase()
  if (sms) return sms === 'subscribed'
  return cliente?.accepts_marketing === true
}

function esContraReembolso(pedido: any) {
  const formas = [...(pedido?.payment_gateway_names || []), pedido?.gateway].filter(Boolean).map((g: any) => String(g).toLowerCase())
  return formas.some(g => g.includes('cash on delivery') || g.includes('contra') || g === 'cod')
}

// Lo que impediría enviar el pedido, dicho en cristiano
function datoQueFalta(pedido: any): string | null {
  const envio = pedido?.shipping_address || null
  if (!envio) return null // pedido digital o recogida: no falta nada
  if (!envio.address1) return 'la dirección'
  if (!envio.zip) return 'el código postal'
  if (!envio.city) return 'la ciudad'
  if (!pedido?.phone && !envio.phone) return 'un teléfono de contacto'
  return null
}

// ---------------------------------------------------------------------------
// Repartir un aviso de la tienda entre las automatizaciones que lo esperan
// ---------------------------------------------------------------------------
export async function repartirEvento(eventoCrudo: string, datos: any, tienda: TiendaBasica) {
  let evento = eventoCrudo
  let contexto: Contexto | null = null

  // Los eventos internos (de Respondi, no de Shopify) tienen su propio camino
  if (eventoCrudo.startsWith('interno:')) return await repartirEventoInterno(eventoCrudo.slice('interno:'.length), datos, tienda)

  // Un pago empezado y no terminado: Shopify avisa del checkout con la forma
  // de pago ya elegida (`gateway`) y sin completar
  if (eventoCrudo === 'checkouts/update' || eventoCrudo === 'checkouts/create') {
    if (datos?.completed_at) return { lanzadas: 0, detalle: 'el pago se completó' }
    if (!datos?.gateway && !(datos?.payment_gateway_names || []).length) return { lanzadas: 0, detalle: 'todavía no ha llegado al pago' }
    const interesadas = (await automatizacionesActivas(tienda.branch_id)).filter(
      ({ definicion }) => definicion.receta.disparador.tipo === 'evento_tienda' && definicion.receta.disparador.evento === 'checkouts/update'
    )
    if (!interesadas.length) return { lanzadas: 0, detalle: 'ninguna automatización encendida espera este aviso' }
    const contexto = contextoDeCheckout(datos, tienda)
    let lanzadas = 0
    for (const { definicion } of interesadas) {
      const r = await lanzarAutomatizacion(definicion.clave, contexto)
      if (r.lanzada) lanzadas++
    }
    return { lanzadas }
  }

  // Los avisos de envío traen solo el envío, no el pedido: se va a por el
  // pedido a la tienda. Y "entregado" no es un tema propio de Shopify, sino
  // un estado dentro del aviso de envío.
  if (eventoCrudo === 'fulfillments/update' || eventoCrudo === 'fulfillments/create') {
    if (String(datos?.shipment_status || '').toLowerCase() !== 'delivered') {
      return { lanzadas: 0, detalle: 'el envío todavía no está entregado' }
    }
    evento = 'fulfillments/delivered'
  }

  // Las encendidas en esta sucursal que esperan este aviso: las del catálogo
  // (moldeadas o no) y las propias del cliente
  const interesadas = (await automatizacionesActivas(tienda.branch_id)).filter(
    ({ definicion }) => definicion.receta.disparador.tipo === 'evento_tienda' && definicion.receta.disparador.evento === evento
  )
  if (!interesadas.length) return { lanzadas: 0, detalle: 'ninguna automatización encendida espera este aviso' }

  if (evento === 'fulfillments/delivered') {
    const pedido = await pedidoPorId(tienda, datos?.order_id)
    if (!pedido) return { lanzadas: 0, detalle: 'no se ha encontrado el pedido de ese envío en la tienda' }
    contexto = contextoDePedidoGraphql(pedido, tienda)
    contexto.pedido!.seguimiento = datos?.tracking_number || contexto.pedido!.seguimiento
    contexto.pedido!.enlace_seguimiento = datos?.tracking_url || (datos?.tracking_urls || [])[0] || contexto.pedido!.enlace_seguimiento
  } else {
    contexto = contextoDePedido(datos, tienda)
  }
  if (!contexto.referencia) return { lanzadas: 0, detalle: 'el aviso no traía pedido' }

  let lanzadas = 0
  const motivos: string[] = []
  for (const { definicion } of interesadas) {
    const r = await lanzarAutomatizacion(definicion.clave, contexto)
    if (r.lanzada) lanzadas++
    else motivos.push(`${definicion.clave}: ${r.motivo}`)
  }
  return { lanzadas, detalle: motivos.join(' · ') || undefined }
}

// Las automatizaciones propias con disparador de reloj ("cada día a las 9",
// "cada hora"), de todas las sucursales. La referencia lleva la fecha (o la
// fecha y la hora) para que solo actúen una vez por vuelta.
export async function lanzarPropiasProgramadas(esSuHora: (branchId: string, hora: number) => Promise<boolean>, esPrimerMinutoDeHora: () => boolean) {
  const { data: filas } = await supabaseAdmin
    .from('automatizaciones')
    .select('id, tenant_id, branch_id, clave, nombre, descripcion, activa, ajustes, receta, marketing')
    .eq('activa', true)
    .like('clave', 'propia\\_%')
  let lanzadas = 0
  for (const fila of filas || []) {
    const definicion = definicionDeFila(fila as any)
    const d = definicion?.receta.disparador
    if (!definicion || !d || d.tipo !== 'programado') continue
    const ahora = new Date()
    let toca = false
    let sello = ''
    if (d.cada === 'dia') { toca = await esSuHora(fila.branch_id, d.hora ?? 9); sello = ahora.toISOString().slice(0, 10) }
    else if (d.cada === 'hora') { toca = esPrimerMinutoDeHora(); sello = ahora.toISOString().slice(0, 13) }
    if (!toca) continue
    const { data: sucursal } = await supabaseAdmin.from('sucursales').select('nombre').eq('id', fila.branch_id).maybeSingle()
    const r = await lanzarAutomatizacion(fila.clave, {
      tenant_id: fila.tenant_id,
      branch_id: fila.branch_id,
      referencia: `${fila.clave}:${sello}`,
      negocio: sucursal?.nombre || ''
    })
    if (r.lanzada) lanzadas++
  }
  return lanzadas
}

// Tratar un aviso ya apuntado y dejar constancia de cómo ha ido. Lo usan las
// dos puertas de entrada: el propio aviso de Shopify (en cuanto llega) y el
// cron de cada minuto (para los que se quedaron sin tratar).
export async function procesarEvento(eventoId: string, tipo: string, datos: any, tienda: TiendaBasica) {
  try {
    const r = await repartirEvento(tipo, datos, tienda)
    await supabaseAdmin
      .from('tienda_eventos')
      .update({ procesado_en: new Date().toISOString(), error: null })
      .eq('id', eventoId)
    return r
  } catch (e: any) {
    await supabaseAdmin
      .from('tienda_eventos')
      .update({ procesado_en: new Date().toISOString(), error: e?.message || 'Error inesperado' })
      .eq('id', eventoId)
    await registrarError({
      origen: 'app',
      descripcion: 'Fallo al procesar un aviso de Shopify',
      stacktrace: JSON.stringify({ evento: eventoId, tipo, error: e?.message }),
      tenant_id: tienda.tenant_id
    })
    return { lanzadas: 0, detalle: e?.message }
  }
}

// ---------------------------------------------------------------------------
// Los repasos programados (lo que no avisa Shopify: "lleva 3 días sin salir")
// ---------------------------------------------------------------------------
const CONSULTA_PEDIDOS = `query pedidos($query: String!, $first: Int!) {
  orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id name email phone createdAt cancelledAt
      displayFinancialStatus displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 10) { nodes { title quantity } }
      fulfillments(first: 3) { trackingInfo { number url company } }
      customer { id firstName lastName email phone numberOfOrders amountSpent { amount } emailMarketingConsent { marketingState } }
    }
  }
}`

// Un pedido concreto, por su id de Shopify (número o gid)
async function pedidoPorId(tienda: TiendaBasica, id: any) {
  const numero = String(id || '').replace(/^gid:\/\/shopify\/Order\//, '')
  if (!numero) return null
  const datos = await consultarTienda<any>(tienda, CONSULTA_PEDIDOS, { query: `id:${numero}`, first: 1 })
  return datos?.orders?.nodes?.[0] || null
}

// ---------------------------------------------------------------------------
// Carritos abandonados: Shopify no avisa de "abandonado", se pregunta cada
// hora por los que llevan más de X horas sin terminar la compra
// ---------------------------------------------------------------------------
const CONSULTA_CARRITOS = `query carritos($first: Int!) {
  abandonedCheckouts(first: $first, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id abandonedCheckoutUrl createdAt completedAt email phone
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 10) { nodes { title quantity } }
      customer { id firstName lastName email phone emailMarketingConsent { marketingState } }
    }
  }
}`

export async function repasarCarritosAbandonados(tienda: TiendaBasica, esperarHoras: number) {
  const datos = await consultarTienda<any>(tienda, CONSULTA_CARRITOS, { first: 50 })
  const ahora = Date.now()
  const limiteViejo = ahora - 7 * 24 * 3600 * 1000 // los de hace más de una semana ya no
  const limiteReciente = ahora - Math.max(1, esperarHoras) * 3600 * 1000

  let lanzadas = 0
  for (const c of datos?.abandonedCheckouts?.nodes || []) {
    if (c.completedAt) continue
    const creado = new Date(c.createdAt).getTime()
    if (!creado || creado > limiteReciente || creado < limiteViejo) continue
    const cliente = c.customer || {}
    const productos = (c.lineItems?.nodes || []).map((l: any) => l?.title).filter(Boolean)
    const contexto: Contexto = {
      tenant_id: tienda.tenant_id,
      branch_id: tienda.branch_id,
      tienda_id: tienda.id,
      referencia: String(c.id),
      carrito: { enlace: c.abandonedCheckoutUrl || null, comprado: false, productos },
      pedido: { total: Number(c.totalPriceSet?.shopMoney?.amount) || undefined, moneda: c.totalPriceSet?.shopMoney?.currencyCode || tienda.moneda || 'EUR', productos },
      producto: { nombre: productos.join(', ') },
      cliente: {
        nombre: [cliente.firstName, cliente.lastName].filter(Boolean).join(' ').trim() || null,
        email: c.email || cliente.email || null,
        telefono: c.phone || cliente.phone || null,
        acepta_marketing: cliente?.emailMarketingConsent?.marketingState === 'SUBSCRIBED',
        id_tienda: cliente.id ? String(cliente.id) : null
      }
    }
    const r = await lanzarAutomatizacion('carrito_abandonado', contexto)
    if (r.lanzada) lanzadas++
  }
  return lanzadas
}

// ---------------------------------------------------------------------------
// Stock bajo: una vez al día, lo que está por debajo del mínimo
// ---------------------------------------------------------------------------
const CONSULTA_STOCK = `query stock($query: String!, $first: Int!) {
  products(first: $first, query: $query) { nodes { id title totalInventory status } }
}`

export async function repasarStockBajo(tienda: TiendaBasica, minimo: number) {
  const datos = await consultarTienda<any>(tienda, CONSULTA_STOCK, { query: `inventory_total:<=${Math.max(0, minimo)} status:active`, first: 50 })
  const bajos = (datos?.products?.nodes || []).filter((p: any) => p?.status !== 'ARCHIVED' && p?.status !== 'DRAFT')
  if (!bajos.length) return 0
  const lista = bajos.map((p: any) => `${p.title} (${p.totalInventory ?? 0})`).join(', ')
  const r = await lanzarAutomatizacion('aviso_stock_bajo', {
    tenant_id: tienda.tenant_id,
    branch_id: tienda.branch_id,
    tienda_id: tienda.id,
    referencia: `stock:${new Date().toISOString().slice(0, 10)}`,
    producto: { nombre: lista }
  })
  return r.lanzada ? 1 : 0
}

// ---------------------------------------------------------------------------
// Resumen diario para el equipo: pedidos y ventas del día en la tienda, y
// conversaciones, respuestas de la IA y casos pendientes en Respondi
// ---------------------------------------------------------------------------
const CONSULTA_PEDIDOS_DEL_DIA = `query pedidosDelDia($query: String!) {
  orders(first: 100, query: $query) { nodes { id totalPriceSet { shopMoney { amount currencyCode } } cancelledAt } }
}`

export async function repasarResumenDiario(tienda: TiendaBasica) {
  const hoy = new Date().toISOString().slice(0, 10)
  const datos = await consultarTienda<any>(tienda, CONSULTA_PEDIDOS_DEL_DIA, { query: `created_at:>=${hoy}` })
  const pedidos = (datos?.orders?.nodes || []).filter((p: any) => !p.cancelledAt)
  const ventas = pedidos.reduce((s: number, p: any) => s + (Number(p.totalPriceSet?.shopMoney?.amount) || 0), 0)
  const moneda = pedidos[0]?.totalPriceSet?.shopMoney?.currencyCode || tienda.moneda || 'EUR'

  const desde = new Date(); desde.setHours(0, 0, 0, 0)
  const [{ count: conversaciones }, { count: respuestasIa }, { count: casosPendientes }] = await Promise.all([
    supabaseAdmin.from('conversations').select('id', { count: 'exact', head: true }).eq('branch_id', tienda.branch_id).gte('fecha_ultimo_mensaje', desde.toISOString()),
    supabaseAdmin.from('messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tienda.tenant_id).eq('remitente', 'ia').gte('timestamp', desde.toISOString()),
    supabaseAdmin.from('cases').select('id', { count: 'exact', head: true }).eq('branch_id', tienda.branch_id).in('estatus', ['pendiente', 'atendiendo'])
  ])

  const resumen = `Hoy: ${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'} por ${ventas.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda} · ${conversaciones || 0} ${conversaciones === 1 ? 'conversación' : 'conversaciones'} · ${respuestasIa || 0} respuestas de la IA · ${casosPendientes || 0} ${casosPendientes === 1 ? 'caso pendiente' : 'casos pendientes'}.`
  const r = await lanzarAutomatizacion('resumen_diario', {
    tenant_id: tienda.tenant_id,
    branch_id: tienda.branch_id,
    tienda_id: tienda.id,
    referencia: `resumen:${hoy}`,
    resumen
  })
  return r.lanzada ? 1 : 0
}

// ---------------------------------------------------------------------------
// Cliente esperando: conversaciones cuyo último mensaje es del cliente y lleva
// más de X minutos sin respuesta (de la IA o de una persona)
// ---------------------------------------------------------------------------
export async function repasarClientesEsperando(tenantId: string, branchId: string, minutos: number) {
  const limite = new Date(Date.now() - Math.max(1, minutos) * 60 * 1000).toISOString()
  const { data: conversaciones } = await supabaseAdmin
    .from('conversations')
    .select('id, canal, contact_id, fecha_ultimo_mensaje, contacts(nombre)')
    .eq('branch_id', branchId)
    .eq('estado', 'activa')
    .lte('fecha_ultimo_mensaje', limite)
    .gte('fecha_ultimo_mensaje', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .limit(100)

  let lanzadas = 0
  for (const c of conversaciones || []) {
    const { data: ultimo } = await supabaseAdmin
      .from('messages')
      .select('remitente, timestamp')
      .eq('conversation_id', c.id)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!ultimo || ultimo.remitente !== 'cliente') continue
    if (new Date(ultimo.timestamp).getTime() > new Date(limite).getTime()) continue
    const contacto: any = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts
    const esperando = Math.round((Date.now() - new Date(ultimo.timestamp).getTime()) / 60000)
    const r = await lanzarAutomatizacion('cliente_esperando', {
      tenant_id: tenantId,
      branch_id: branchId,
      // Una vez por conversación y por mensaje sin contestar
      referencia: `${c.id}:${ultimo.timestamp}`,
      cliente: { nombre: contacto?.nombre || null },
      minutos: esperando,
      canal: c.canal === 'email' ? 'correo' : c.canal
    })
    if (r.lanzada) lanzadas++
  }
  return lanzadas
}

// ---------------------------------------------------------------------------
// Eventos internos: lo que pasa en Respondi y mira a la tienda
// ---------------------------------------------------------------------------
const CONSULTA_PEDIDOS_DEL_CLIENTE = `query pedidosDelCliente($query: String!) {
  orders(first: 10, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes { id name cancelledAt displayFinancialStatus displayFulfillmentStatus customer { id } }
  }
}`

async function pedidosDelContacto(tienda: TiendaBasica, canal: string | null, identificador: string | null) {
  if (!identificador) return [] as any[]
  const filtro = canal === 'email' ? `email:${identificador}` : `phone:${identificador}`
  const datos = await consultarTienda<any>(tienda, CONSULTA_PEDIDOS_DEL_CLIENTE, { query: filtro })
  return (datos?.orders?.nodes || []) as any[]
}

async function repartirEventoInterno(evento: string, datos: any, tienda: TiendaBasica) {
  const activas = await automatizacionesActivas(tienda.branch_id)
  const quiere = (clave: string) => activas.some(a => a.definicion.clave === clave)

  if (evento === 'mensaje_entrante' && quiere('etiquetar_conversaciones')) {
    const pedidos = await pedidosDelContacto(tienda, datos?.canal, datos?.identificador)
    const vivos = pedidos.filter(p => !p.cancelledAt)
    const enCurso = vivos.some(p => p.displayFulfillmentStatus !== 'FULFILLED' && ['PAID', 'AUTHORIZED', 'PARTIALLY_PAID', 'PENDING'].includes(p.displayFinancialStatus))
    const etiqueta = enCurso ? 'Pedido en curso' : vivos.length ? 'Ya ha comprado' : 'Cliente nuevo'
    const r = await lanzarAutomatizacion('etiquetar_conversaciones', {
      tenant_id: tienda.tenant_id,
      branch_id: tienda.branch_id,
      tienda_id: tienda.id,
      // Una vez por conversación y etiqueta
      referencia: `${datos?.conversation_id}:${etiqueta}`,
      etiqueta,
      cliente: {
        nombre: datos?.nombre || null,
        telefono: datos?.canal === 'whatsapp' ? datos?.identificador : null,
        email: datos?.canal === 'email' ? datos?.identificador : null,
        compras: vivos.length
      }
    })
    return { lanzadas: r.lanzada ? 1 : 0, detalle: r.lanzada ? undefined : r.motivo }
  }

  if (evento === 'conversacion_etiquetada' && quiere('etiquetar_clientes_shopify')) {
    const pedidos = await pedidosDelContacto(tienda, datos?.canal, datos?.identificador)
    const idCliente = pedidos.find(p => p.customer?.id)?.customer?.id || null
    if (!idCliente) return { lanzadas: 0, detalle: 'el contacto no es cliente de la tienda' }
    const r = await lanzarAutomatizacion('etiquetar_clientes_shopify', {
      tenant_id: tienda.tenant_id,
      branch_id: tienda.branch_id,
      tienda_id: tienda.id,
      referencia: `${idCliente}:${datos?.etiqueta}`,
      etiqueta: String(datos?.etiqueta || ''),
      cliente: { nombre: datos?.nombre || null, id_tienda: idCliente, telefono: datos?.canal === 'whatsapp' ? datos?.identificador : null, email: datos?.canal === 'email' ? datos?.identificador : null }
    })
    return { lanzadas: r.lanzada ? 1 : 0, detalle: r.lanzada ? undefined : r.motivo }
  }

  return { lanzadas: 0, detalle: 'ninguna automatización encendida espera este evento' }
}

// ---------------------------------------------------------------------------
// Aniversario: una compra hace justo un año (Shopify no guarda cumpleaños)
// ---------------------------------------------------------------------------
export async function repasarAniversarios(tienda: TiendaBasica) {
  const haceUnAno = new Date(Date.now() - 365 * 24 * 3600 * 1000)
  const dia = haceUnAno.toISOString().slice(0, 10)
  const siguiente = new Date(haceUnAno.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10)
  const datos = await consultarTienda<any>(tienda, CONSULTA_PEDIDOS, { query: `created_at:>=${dia} created_at:<${siguiente}`, first: 50 })
  let lanzadas = 0
  const vistos = new Set<string>()
  for (const nodo of datos?.orders?.nodes || []) {
    if (nodo.cancelledAt) continue
    const contexto = contextoDePedidoGraphql(nodo, tienda)
    const clave = contexto.cliente?.id_tienda || contexto.cliente?.email || contexto.cliente?.telefono
    if (!clave || vistos.has(clave)) continue
    vistos.add(clave)
    contexto.referencia = `aniversario:${clave}:${new Date().getFullYear()}`
    const r = await lanzarAutomatizacion('cumpleanos', contexto)
    if (r.lanzada) lanzadas++
  }
  return lanzadas
}

// ---------------------------------------------------------------------------
// Repasos por fechas: dormido, recompra, garantía
// ---------------------------------------------------------------------------
const CONSULTA_CLIENTES = `query clientes($cursor: String) {
  customers(first: 100, after: $cursor, query: "orders_count:>0") {
    pageInfo { hasNextPage endCursor }
    nodes { id firstName lastName email phone numberOfOrders amountSpent { amount } emailMarketingConsent { marketingState } lastOrder { createdAt } }
  }
}`

// Clientes cuya última compra fue hace entre X y X+7 días (una ventana de una
// semana para que el aviso salga una vez, aunque el repaso sea diario)
export async function repasarClientesDormidos(tienda: TiendaBasica, dias: number) {
  const ahora = Date.now()
  const desde = ahora - (dias + 7) * 24 * 3600 * 1000
  const hasta = ahora - dias * 24 * 3600 * 1000
  const { data: fila } = await supabaseAdmin.from('tiendas').select('configuracion').eq('id', tienda.id).maybeSingle()
  const enlace = (fila?.configuracion as any)?.direccion_publica || `https://${tienda.dominio}`
  let lanzadas = 0
  let cursor: string | null = null
  for (let pagina = 0; pagina < 10; pagina++) {
    const datos: any = await consultarTienda<any>(tienda, CONSULTA_CLIENTES, { cursor })
    for (const c of datos?.customers?.nodes || []) {
      const ultima = c?.lastOrder?.createdAt ? new Date(c.lastOrder.createdAt).getTime() : 0
      if (!ultima || ultima < desde || ultima > hasta) continue
      const r = await lanzarAutomatizacion('cliente_dormido', {
        tenant_id: tienda.tenant_id,
        branch_id: tienda.branch_id,
        tienda_id: tienda.id,
        referencia: `dormido:${c.id}:${new Date(ultima).toISOString().slice(0, 10)}`,
        enlace,
        cliente: {
          nombre: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || null,
          email: c.email || null,
          telefono: c.phone || null,
          acepta_marketing: c?.emailMarketingConsent?.marketingState === 'SUBSCRIBED',
          compras: Number(c.numberOfOrders) || 0,
          gasto: Number(c.amountSpent?.amount) || 0,
          id_tienda: c.id
        }
      })
      if (r.lanzada) lanzadas++
    }
    if (!datos?.customers?.pageInfo?.hasNextPage) break
    cursor = datos.customers.pageInfo.endCursor
  }
  return lanzadas
}

// Pedidos hechos hace exactamente X días (ventana de un día)
async function pedidosDeHace(tienda: TiendaBasica, dias: number) {
  const dia = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const siguiente = new Date(Date.now() - (dias - 1) * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const datos = await consultarTienda<any>(tienda, CONSULTA_PEDIDOS, { query: `created_at:>=${dia} created_at:<${siguiente}`, first: 50 })
  return ((datos?.orders?.nodes || []) as any[]).filter(n => !n.cancelledAt)
}

// Recompra: X días después de una compra, por si se le acaba
export async function repasarRecompras(tienda: TiendaBasica, dias: number) {
  let lanzadas = 0
  for (const nodo of await pedidosDeHace(tienda, dias)) {
    const contexto = contextoDePedidoGraphql(nodo, tienda)
    contexto.referencia = `recompra:${nodo.id}`
    const primero = contexto.pedido?.productos?.[0]
    contexto.producto = { nombre: primero || 'lo que compraste', enlace: `https://${tienda.dominio}` }
    const r = await lanzarAutomatizacion('recompra', contexto)
    if (r.lanzada) lanzadas++
  }
  return lanzadas
}

// Garantía: aviso X días antes de que venza (meses de garantía desde la compra)
export async function repasarGarantias(tienda: TiendaBasica, mesesGarantia: number, avisarDiasAntes: number) {
  const dias = Math.max(1, Math.round(mesesGarantia * 30.44) - avisarDiasAntes)
  let lanzadas = 0
  for (const nodo of await pedidosDeHace(tienda, dias)) {
    const contexto = contextoDePedidoGraphql(nodo, tienda)
    contexto.referencia = `garantia:${nodo.id}`
    contexto.producto = { nombre: contexto.pedido?.productos?.join(', ') || 'tu compra' }
    contexto.dias = avisarDiasAntes
    const r = await lanzarAutomatizacion('garantia_por_vencer', contexto)
    if (r.lanzada) lanzadas++
  }
  return lanzadas
}

// Las sucursales con una automatización encendida, tenga tienda o no
export async function sucursalesConProgramada(clave: string): Promise<{ tenant_id: string; branch_id: string; ajustes: any }[]> {
  const { data } = await supabaseAdmin
    .from('automatizaciones')
    .select('tenant_id, branch_id, ajustes')
    .eq('clave', clave)
    .eq('activa', true)
  return (data || []) as any
}

// Pedidos pagados que siguen sin salir pasados X días
export async function repasarPedidosRetrasados(tienda: TiendaBasica, dias: number) {
  const limite = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const datos = await consultarTienda<any>(tienda, CONSULTA_PEDIDOS, {
    query: `financial_status:paid fulfillment_status:unfulfilled created_at:<${limite}`,
    first: 25
  })

  let lanzadas = 0
  for (const nodo of datos?.orders?.nodes || []) {
    const contexto = contextoDePedidoGraphql(nodo, tienda)
    const r = await lanzarAutomatizacion('pedido_retrasado', contexto)
    if (r.lanzada) lanzadas++
  }
  return lanzadas
}

// Las sucursales que tienen encendida una automatización programada y su
// tienda conectada. Se hace en dos consultas a propósito: `automatizaciones` y
// `tiendas` no están unidas por ninguna clave ajena, y pedirle a PostgREST que
// las cruce sería inventarse una relación que no existe.
export async function tiendasConProgramadas(clave: string): Promise<{ tienda: TiendaBasica; ajustes: any }[]> {
  const { data: encendidas } = await supabaseAdmin
    .from('automatizaciones')
    .select('branch_id, ajustes')
    .eq('clave', clave)
    .eq('activa', true)
  if (!encendidas?.length) return []

  const { data: tiendas } = await supabaseAdmin
    .from('tiendas')
    .select('id, tenant_id, branch_id, dominio, moneda')
    .eq('estado', 'activo')
    .in('branch_id', encendidas.map((e: any) => e.branch_id))

  const porSucursal = new Map((tiendas || []).map((t: any) => [t.branch_id, t]))
  return encendidas
    .filter((e: any) => porSucursal.has(e.branch_id))
    .map((e: any) => ({ tienda: porSucursal.get(e.branch_id) as TiendaBasica, ajustes: e.ajustes || {} }))
}
