import { supabaseAdmin } from '@/utils/supabase/admin'
import { consultarTienda, ErrorShopify } from './shopify'
import { definicionDeFila } from '@/lib/automatizaciones/definiciones'
import { ajustesConDefectos } from '@/lib/automatizaciones/tipos'
import { notificarAAdminsDeOrganizacion } from '@/lib/notificaciones'

// LAS HERRAMIENTAS DE LA IA CON DATOS DE LA TIENDA.
//
// Cada una existe solo si el cliente ha encendido la automatización que la
// gobierna (así el catálogo de Automatizaciones manda, y no hay que tocar las
// skills):
//   · buscar_en_tienda   ← "Venta asistida"
//   · estado_del_pedido  ← "¿Dónde está mi pedido?"
//   · enlace_de_compra   ← "Carrito armado por la IA"
//
// Reglas de oro (decididas con Jorge el 12-09-2026): la IA puede buscar,
// informar del estado de un pedido (tras comprobar que es de quien pregunta)
// y mandar enlaces de compra. Nunca reembolsa, cancela ni edita pedidos: no
// existe herramienta para eso.

export interface ContextoTienda {
  tienda: { id: string; dominio: string; moneda: string | null; tenant_id: string; branch_id: string }
  contacto: { canal: string | null; identificador: string | null; nombre: string | null }
  encendidas: Set<string>
  ajustes: Record<string, Record<string, any>>
}

const GOBIERNAN: Record<string, string> = {
  buscar_en_tienda: 'venta_asistida',
  estado_del_pedido: 'donde_esta_mi_pedido',
  enlace_de_compra: 'carrito_por_la_ia'
}

export function esHerramientaDeTienda(nombre: string) {
  return nombre in GOBIERNAN
}

// Qué herramientas de tienda tiene esta sucursal, según lo que haya encendido
export async function cargarHerramientasDeTienda(branchId: string, contactId: string | null): Promise<{ contexto: ContextoTienda | null; definiciones: any[]; instrucciones: string }> {
  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, dominio, moneda, tenant_id, branch_id, estado')
    .eq('branch_id', branchId)
    .eq('estado', 'activo')
    .maybeSingle()
  if (!tienda) return { contexto: null, definiciones: [], instrucciones: '' }

  const { data: filas } = await supabaseAdmin
    .from('automatizaciones')
    .select('id, clave, nombre, descripcion, activa, ajustes, receta, marketing')
    .eq('branch_id', branchId)
    .eq('activa', true)
    .in('clave', Object.values(GOBIERNAN))
  const encendidas = new Set<string>()
  const ajustes: Record<string, Record<string, any>> = {}
  for (const f of filas || []) {
    const def = definicionDeFila(f as any)
    if (!def) continue
    encendidas.add(f.clave)
    ajustes[f.clave] = ajustesConDefectos(def, f.ajustes as any)
  }
  if (!encendidas.size) return { contexto: null, definiciones: [], instrucciones: '' }

  let contacto = { canal: null as string | null, identificador: null as string | null, nombre: null as string | null }
  if (contactId) {
    const { data: c } = await supabaseAdmin.from('contacts').select('canal, identificador_canal, nombre').eq('id', contactId).maybeSingle()
    if (c) contacto = { canal: c.canal, identificador: c.identificador_canal, nombre: c.nombre }
  }

  const definiciones: any[] = []
  const notas: string[] = [`El negocio tiene su tienda online conectada (${tienda.dominio}).`]

  if (encendidas.has('venta_asistida')) {
    definiciones.push({
      type: 'function',
      function: {
        name: 'buscar_en_tienda',
        description: 'Busca productos en la tienda online del negocio, con su precio real de hoy, si hay stock y el enlace para comprarlo. Úsala SIEMPRE que el cliente pregunte por un producto, un precio o si hay algo disponible. No inventes productos, precios ni stock.',
        parameters: {
          type: 'object',
          properties: { busqueda: { type: 'string', description: 'Lo que busca el cliente, con sus palabras (por ejemplo "tarta sin gluten").' } },
          required: ['busqueda']
        }
      }
    })
    notas.push('Para productos, precios y stock usa buscar_en_tienda. Cuando hables de un producto, incluye SIEMPRE su enlace tal cual te lo da la herramienta, en la misma respuesta.')
  }

  if (encendidas.has('donde_esta_mi_pedido')) {
    definiciones.push({
      type: 'function',
      function: {
        name: 'estado_del_pedido',
        description: 'Consulta en la tienda el estado real de un pedido (pagado, preparándose, enviado con su seguimiento, entregado, cancelado). Úsala cuando el cliente pregunte por su pedido. Si no tienes el número de pedido, pídeselo. Si la herramienta pide comprobar la identidad, pide al cliente el correo o el teléfono con el que compró.',
        parameters: {
          type: 'object',
          properties: {
            numero_pedido: { type: 'string', description: 'Número del pedido tal y como lo dice el cliente (por ejemplo "#1042" o "1042").' },
            email: { type: 'string', description: 'Correo con el que compró, si lo ha dicho.' },
            telefono: { type: 'string', description: 'Teléfono con el que compró, si lo ha dicho.' }
          },
          required: ['numero_pedido']
        }
      }
    })
    notas.push('Nunca des datos de un pedido si la herramienta dice que la identidad no está comprobada. Nunca prometas reembolsos, cancelaciones ni cambios en pedidos: eso lo hace siempre una persona del equipo.')
  }

  if (encendidas.has('carrito_por_la_ia')) {
    definiciones.push({
      type: 'function',
      function: {
        name: 'enlace_de_compra',
        description: 'Prepara el carrito en la tienda con los productos y cantidades que quiere el cliente y devuelve un enlace para que pague en la tienda. Úsala solo cuando el cliente tenga claro qué quiere comprar. Pasa cada producto con el nombre que ha dicho y su cantidad.',
        parameters: {
          type: 'object',
          properties: {
            lineas: {
              type: 'array',
              items: { type: 'object', properties: { producto: { type: 'string' }, cantidad: { type: 'number' } }, required: ['producto', 'cantidad'] }
            }
          },
          required: ['lineas']
        }
      }
    })
    notas.push('El pago siempre se hace en la tienda a través del enlace de enlace_de_compra: no pidas datos de tarjeta por el chat.')
  }

  return {
    contexto: { tienda: tienda as any, contacto, encendidas, ajustes },
    definiciones,
    instrucciones: notas.join(' ')
  }
}

// ---------------------------------------------------------------------------
// Ejecutar una herramienta y devolverle al modelo un texto claro
// ---------------------------------------------------------------------------
export async function ejecutarHerramientaDeTienda(nombre: string, args: any, ctx: ContextoTienda): Promise<string> {
  const gobierna = GOBIERNAN[nombre]
  if (!gobierna || !ctx.encendidas.has(gobierna)) return 'Esta herramienta no está disponible en este negocio.'
  try {
    if (nombre === 'buscar_en_tienda') return await buscarEnTienda(args, ctx)
    if (nombre === 'estado_del_pedido') return await estadoDelPedido(args, ctx)
    if (nombre === 'enlace_de_compra') return await enlaceDeCompra(args, ctx)
  } catch (e: any) {
    if (e instanceof ErrorShopify) return `No se ha podido consultar la tienda ahora mismo (${e.message}). Dile al cliente que lo comprobarás en un momento y no inventes datos.`
    return `No se ha podido consultar la tienda ahora mismo. Dile al cliente que lo comprobarás en un momento y no inventes datos.`
  }
  return 'Herramienta desconocida.'
}

const dinero = (cantidad: any, moneda?: string | null) =>
  `${Number(cantidad || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda || 'EUR'}`

const CONSULTA_PRODUCTOS = `query productos($query: String!, $first: Int!) {
  products(first: $first, query: $query) {
    nodes {
      id title handle status totalInventory onlineStoreUrl
      variants(first: 10) { nodes { id title price availableForSale inventoryQuantity sku } }
    }
  }
}`

const sinTildes = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

async function buscarProductos(ctx: ContextoTienda, texto: string, cuantos = 6) {
  const limpio = texto.replace(/["*:]/g, ' ').trim()
  // Shopify busca por palabras: "tarta sin gluten" → title:*tarta* OR title:*gluten*
  const palabras = limpio.split(/\s+/).filter(p => p.length > 2)
  const query = palabras.length ? palabras.map(p => `title:*${p}*`).join(' OR ') : limpio
  const datos = await consultarTienda<any>(ctx.tienda, CONSULTA_PRODUCTOS, { query: `${query} status:active`, first: Math.max(cuantos, 10) })
  const nodos = (datos?.products?.nodes || []) as any[]
  // Primero lo que encaja con más palabras ("tarta sin gluten" antes que
  // "Tarta Sacher" cuando se pide tarta sin gluten)
  const puntos = (p: any) => palabras.filter(w => sinTildes(String(p.title || '')).includes(sinTildes(w))).length
  return nodos.map(p => ({ p, n: puntos(p) })).sort((a, b) => b.n - a.n).map(x => x.p).slice(0, cuantos)
}

const disponible = (p: any) => (p.totalInventory ?? 0) > 0 || (p.variants?.nodes || []).some((v: any) => v.availableForSale)

async function buscarEnTienda(args: any, ctx: ContextoTienda) {
  const texto = String(args?.busqueda || '').trim()
  if (!texto) return 'Dime qué producto buscar.'
  const mostrarAgotados = !!ctx.ajustes.venta_asistida?.mostrar_agotados
  const productos = await buscarProductos(ctx, texto)
  const visibles = productos.filter(p => mostrarAgotados || disponible(p))
  const agotados = productos.filter(p => !disponible(p))
  if (!visibles.length) {
    return productos.length
      ? `Hay productos que encajan con "${texto}" pero están AGOTADOS ahora mismo: ${productos.map(p => p.title).join(', ')}. Díselo al cliente y no los ofrezcas como disponibles.`
      : `En la tienda no hay ningún producto que encaje con "${texto}". No inventes ninguno: dile al cliente que no lo tenemos y ofrécete a buscar otra cosa.`
  }
  const avisoAgotados = !mostrarAgotados && agotados.length
    ? `\nAGOTADOS ahora mismo (díselo si el cliente pregunta por ellos; no los vendas): ${agotados.map(p => p.title).join(', ')}.`
    : ''
  const avisoCompra = ctx.encendidas.has('carrito_por_la_ia')
    ? '\nSi el cliente quiere comprar, usa enlace_de_compra para prepararle el carrito: no le mandes el enlace del producto para que pague por su cuenta.'
    : ''
  const lineas = visibles.map(p => {
    const variantes = (p.variants?.nodes || []) as any[]
    const precios = variantes.map(v => Number(v.price)).filter(n => Number.isFinite(n))
    const min = Math.min(...precios), max = Math.max(...precios)
    const precio = precios.length ? (min === max ? dinero(min, ctx.tienda.moneda) : `desde ${dinero(min, ctx.tienda.moneda)}`) : 'precio no disponible'
    const stock = (p.totalInventory ?? 0) > 0 ? `hay ${p.totalInventory} en stock` : variantes.some(v => v.availableForSale) ? 'disponible' : 'AGOTADO'
    const opciones = variantes.length > 1 ? ` Opciones: ${variantes.map(v => `${v.title} (${dinero(v.price, ctx.tienda.moneda)}${v.availableForSale ? '' : ', agotada'})`).join('; ')}.` : ''
    return `- ${p.title}: ${precio}, ${stock}.${opciones}${p.onlineStoreUrl ? ` Enlace: ${p.onlineStoreUrl}` : ''}`
  })
  return `Productos de la tienda que encajan con "${texto}" (precios de hoy):\n${lineas.join('\n')}${avisoAgotados}${avisoCompra}`
}

const CONSULTA_PEDIDO = `query pedido($query: String!) {
  orders(first: 1, query: $query) {
    nodes {
      id name email phone createdAt cancelledAt
      displayFinancialStatus displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 10) { nodes { title quantity } }
      fulfillments(first: 3) { trackingInfo { number url company } estimatedDeliveryAt displayStatus }
      customer { firstName lastName email phone }
    }
  }
}`

function normalizarTelefono(v: any) {
  const d = String(v || '').replace(/[^\d]/g, '')
  return d.length >= 8 ? d.slice(-9) : ''
}

async function estadoDelPedido(args: any, ctx: ContextoTienda) {
  const numero = String(args?.numero_pedido || '').trim().replace(/^#/, '')
  if (!/^[A-Za-z0-9-]{1,20}$/.test(numero)) return 'Pide al cliente el número de pedido (aparece en su correo de confirmación, por ejemplo #1042).'
  const datos = await consultarTienda<any>(ctx.tienda, CONSULTA_PEDIDO, { query: `name:#${numero}` })
  const pedido = datos?.orders?.nodes?.[0]
  if (!pedido) return `No existe ningún pedido #${numero} en la tienda. Pide al cliente que compruebe el número.`

  // ¿Es suyo? Vale si escribe desde el teléfono con el que compró, o si da
  // el correo o el teléfono del pedido. Sin eso, no se cuenta nada.
  const pedirIdentificacion = ctx.ajustes.donde_esta_mi_pedido?.pedir_identificacion !== false
  const telPedido = normalizarTelefono(pedido.phone || pedido.customer?.phone)
  const mailPedido = String(pedido.email || pedido.customer?.email || '').trim().toLowerCase()
  const desdeSuTelefono = ctx.contacto.canal === 'whatsapp' && !!telPedido && normalizarTelefono(ctx.contacto.identificador) === telPedido
  const desdeSuCorreo = ctx.contacto.canal === 'email' && !!mailPedido && String(ctx.contacto.identificador || '').toLowerCase() === mailPedido
  const daCorreo = !!args?.email && String(args.email).trim().toLowerCase() === mailPedido && !!mailPedido
  const daTelefono = !!args?.telefono && !!telPedido && normalizarTelefono(args.telefono) === telPedido
  if (pedirIdentificacion && !desdeSuTelefono && !desdeSuCorreo && !daCorreo && !daTelefono) {
    return `IDENTIDAD NO COMPROBADA para el pedido #${numero}. No des ningún dato del pedido. Pide al cliente el correo electrónico o el teléfono con el que hizo la compra y vuelve a consultar con esos datos.`
  }

  const partes: string[] = []
  const nombre = [pedido.customer?.firstName, pedido.customer?.lastName].filter(Boolean).join(' ')
  partes.push(`Pedido ${pedido.name}${nombre ? ` de ${nombre}` : ''}, hecho el ${new Date(pedido.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}, total ${dinero(pedido.totalPriceSet?.shopMoney?.amount, pedido.totalPriceSet?.shopMoney?.currencyCode)}.`)
  partes.push(`Productos: ${(pedido.lineItems?.nodes || []).map((l: any) => `${l.quantity} × ${l.title}`).join(', ')}.`)
  if (pedido.cancelledAt) {
    partes.push('Estado: CANCELADO. Si el cliente pregunta por el reembolso, dile que lo gestiona una persona del equipo y no des plazos concretos.')
  } else {
    const pago: Record<string, string> = { PAID: 'pagado', PENDING: 'pago pendiente', REFUNDED: 'reembolsado', PARTIALLY_REFUNDED: 'reembolsado en parte', AUTHORIZED: 'pago autorizado', VOIDED: 'anulado' }
    const envio: Record<string, string> = { UNFULFILLED: 'todavía no ha salido (preparándose)', FULFILLED: 'enviado', PARTIALLY_FULFILLED: 'enviado en parte', IN_PROGRESS: 'preparándose', ON_HOLD: 'en espera', SCHEDULED: 'programado' }
    partes.push(`Pago: ${pago[pedido.displayFinancialStatus] || pedido.displayFinancialStatus}. Envío: ${envio[pedido.displayFulfillmentStatus] || pedido.displayFulfillmentStatus}.`)
    const entrega = (pedido.fulfillments || [])[0]
    const seguimiento = entrega?.trackingInfo?.[0]
    if (seguimiento?.number || seguimiento?.url) {
      partes.push(`Seguimiento${seguimiento.company ? ` (${seguimiento.company})` : ''}: ${seguimiento.number || ''}${seguimiento.url ? ` ${seguimiento.url}` : ''}.`)
    }
    if (entrega?.displayStatus === 'DELIVERED') partes.push('El transportista lo da por ENTREGADO.')
    else if (entrega?.estimatedDeliveryAt) partes.push(`Entrega estimada: ${new Date(entrega.estimatedDeliveryAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}.`)
  }
  partes.push('Recuerda: no puedes cancelar, cambiar ni reembolsar el pedido; si el cliente lo pide, dile que lo pasas a una persona del equipo.')
  return partes.join(' ')
}

const CREAR_BORRADOR = `mutation crear($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) { draftOrder { id invoiceUrl } userErrors { field message } }
}`

async function enlaceDeCompra(args: any, ctx: ContextoTienda) {
  const lineas = Array.isArray(args?.lineas) ? args.lineas : []
  if (!lineas.length) return 'Dime qué productos y cuántos quiere el cliente.'

  const items: { variantId: string; quantity: number; titulo: string; precio: number }[] = []
  const noEncontrados: string[] = []
  for (const l of lineas.slice(0, 20)) {
    const cantidad = Math.max(1, Math.min(99, Math.round(Number(l?.cantidad) || 1)))
    const encontrados = await buscarProductos(ctx, String(l?.producto || ''), 3)
    const producto = encontrados[0]
    const variante = (producto?.variants?.nodes || []).find((v: any) => v.availableForSale) || null
    if (!producto || !variante) { noEncontrados.push(String(l?.producto || '')); continue }
    items.push({ variantId: variante.id, quantity: cantidad, titulo: producto.title, precio: Number(variante.price) || 0 })
  }
  if (!items.length) return `No he encontrado en la tienda (o están agotados): ${noEncontrados.join(', ')}. Pregunta al cliente si quiere otra cosa; no inventes productos.`

  const total = items.reduce((s, i) => s + i.precio * i.quantity, 0)
  const maximo = Number(ctx.ajustes.carrito_por_la_ia?.importe_maximo ?? 300)
  if (maximo > 0 && total > maximo) {
    await notificarAAdminsDeOrganizacion(supabaseAdmin, ctx.tienda.tenant_id, {
      tipo: 'caso_asignado',
      titulo: 'Carrito grande pendiente de una persona',
      cuerpo: `${ctx.contacto.nombre || 'Un cliente'} quiere comprar por ${dinero(total, ctx.tienda.moneda)} (${items.map(i => `${i.quantity} × ${i.titulo}`).join(', ')}). Pasa del tope de ${dinero(maximo, ctx.tienda.moneda)}: hay que confirmarlo a mano.`,
      url: '/dashboard/chats'
    })
    return `El carrito suma ${dinero(total, ctx.tienda.moneda)}, por encima del tope de ${dinero(maximo, ctx.tienda.moneda)} que el negocio permite cerrar sin una persona. Ya se ha avisado al equipo. Dile al cliente que una persona le confirmará el pedido en breve; no le des enlace de pago.`
  }

  const datos = await consultarTienda<any>(ctx.tienda, CREAR_BORRADOR, {
    input: {
      lineItems: items.map(i => ({ variantId: i.variantId, quantity: i.quantity })),
      ...(ctx.contacto.canal === 'email' && ctx.contacto.identificador ? { email: ctx.contacto.identificador } : {}),
      note: 'Preparado por Respondi desde el chat'
    }
  })
  const errores = datos?.draftOrderCreate?.userErrors || []
  if (errores.length) return `La tienda no ha podido preparar el carrito: ${errores.map((e: any) => e.message).join('; ')}. Dile al cliente que lo revisará una persona.`
  const enlace = datos?.draftOrderCreate?.draftOrder?.invoiceUrl
  if (!enlace) return 'La tienda no ha devuelto el enlace de pago. Dile al cliente que lo revisará una persona.'
  const resumen = items.map(i => `${i.quantity} × ${i.titulo} (${dinero(i.precio, ctx.tienda.moneda)})`).join(', ')
  return `Carrito preparado: ${resumen}. Total ${dinero(total, ctx.tienda.moneda)}${noEncontrados.length ? ` (no encontrados: ${noEncontrados.join(', ')})` : ''}. Enlace para pagar en la tienda: ${enlace} — dáselo al cliente tal cual.`
}
