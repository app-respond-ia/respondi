import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { AUTOMATIZACIONES } from '@/lib/automatizaciones/catalogo'
import { lanzarAutomatizacion, type Contexto } from '@/lib/automatizaciones/motor'
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
      creado: pedido?.created_at || null
    },
    cliente: {
      nombre,
      email: correo,
      telefono,
      acepta_marketing: aceptaMarketing(cliente),
      compras: numero(cliente.orders_count) ?? 0,
      gasto: numero(cliente.total_spent) ?? 0,
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
export async function repartirEvento(evento: string, datos: any, tienda: TiendaBasica) {
  const interesadas = AUTOMATIZACIONES.filter(
    a => a.estado === 'lista' && a.receta.disparador.tipo === 'evento_tienda' && a.receta.disparador.evento === evento
  )
  if (!interesadas.length) return { lanzadas: 0, detalle: 'ninguna automatización espera este aviso' }

  const contexto = contextoDePedido(datos, tienda)
  if (!contexto.referencia) return { lanzadas: 0, detalle: 'el aviso no traía pedido' }

  let lanzadas = 0
  const motivos: string[] = []
  for (const automatizacion of interesadas) {
    const r = await lanzarAutomatizacion(automatizacion.clave, contexto)
    if (r.lanzada) lanzadas++
    else motivos.push(`${automatizacion.clave}: ${r.motivo}`)
  }
  return { lanzadas, detalle: motivos.join(' · ') || undefined }
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
