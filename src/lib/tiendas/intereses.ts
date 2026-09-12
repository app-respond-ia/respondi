import { supabaseAdmin } from '@/utils/supabase/admin'
import { consultarTienda } from './shopify'
import { lanzarAutomatizacion, type Contexto } from '@/lib/automatizaciones/motor'
import type { TiendaBasica } from './eventos'

// INTERESES DE PRODUCTO: quién ha preguntado por qué.
//
// Los apunta la IA cuando busca en la tienda (tipo 'consulta', con el precio
// que vio) y cuando apunta a alguien en la lista de espera (tipo 'espera').
// Los consumen dos repasos: "Te aviso cuando vuelva" (cada hora) y "Bajó de
// precio" (cada día). Cada interés avisa una sola vez.

export async function apuntarInteres(datos: {
  tenant_id: string
  branch_id: string
  contact_id: string
  producto_id: string
  producto_nombre: string
  producto_enlace?: string | null
  tipo: 'espera' | 'consulta'
  precio_visto?: number | null
  moneda?: string | null
}) {
  const { data, error } = await supabaseAdmin
    .from('intereses_producto')
    .upsert({
      tenant_id: datos.tenant_id,
      branch_id: datos.branch_id,
      contact_id: datos.contact_id,
      producto_id: datos.producto_id,
      producto_nombre: datos.producto_nombre,
      producto_enlace: datos.producto_enlace || null,
      tipo: datos.tipo,
      precio_visto: datos.precio_visto ?? null,
      moneda: datos.moneda || null
    }, { onConflict: 'branch_id,contact_id,producto_id,tipo', ignoreDuplicates: datos.tipo === 'consulta' })
    .select('id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id || null
}

const CONSULTA_POR_IDS = `query porIds($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product { id title totalInventory onlineStoreUrl status variants(first: 10) { nodes { price availableForSale inventoryQuantity } } }
  }
}`

async function productosPorIds(tienda: TiendaBasica, ids: string[]) {
  const salida = new Map<string, any>()
  for (let i = 0; i < ids.length; i += 50) {
    const datos = await consultarTienda<any>(tienda, CONSULTA_POR_IDS, { ids: ids.slice(i, i + 50) })
    for (const n of datos?.nodes || []) if (n?.id) salida.set(n.id, n)
  }
  return salida
}

async function contextoDeInteres(tienda: TiendaBasica, interes: any, producto: any, extra: Partial<Contexto> = {}): Promise<Contexto | null> {
  const { data: contacto } = await supabaseAdmin
    .from('contacts')
    .select('id, nombre, canal, identificador_canal')
    .eq('id', interes.contact_id)
    .maybeSingle()
  if (!contacto) return null
  const variantes = (producto?.variants?.nodes || []) as any[]
  const precios = variantes.map(v => Number(v.price)).filter(n => Number.isFinite(n))
  return {
    tenant_id: tienda.tenant_id,
    branch_id: tienda.branch_id,
    tienda_id: tienda.id,
    referencia: String(interes.id),
    producto: {
      nombre: producto?.title || interes.producto_nombre,
      enlace: producto?.onlineStoreUrl || interes.producto_enlace || null,
      hay_stock: (producto?.totalInventory ?? 0) > 0 || variantes.some(v => v.availableForSale),
      precio: precios.length ? Math.min(...precios) : undefined
    },
    cliente: {
      nombre: contacto.nombre,
      telefono: contacto.canal === 'whatsapp' ? contacto.identificador_canal : null,
      email: contacto.canal === 'email' ? contacto.identificador_canal : null,
      // Los intereses nacen de una conversación en la que el cliente pidió
      // el aviso: se toma como que acepta que se le escriba de esto
      acepta_marketing: true
    },
    ...extra
  }
}

// Cada hora: los productos con gente esperando que vuelven a tener stock
export async function repasarVueltaStock(tienda: TiendaBasica) {
  const { data: intereses } = await supabaseAdmin
    .from('intereses_producto')
    .select('id, contact_id, producto_id, producto_nombre, producto_enlace')
    .eq('branch_id', tienda.branch_id)
    .eq('tipo', 'espera')
    .is('avisado_en', null)
    .limit(200)
  if (!intereses?.length) return 0

  const productos = await productosPorIds(tienda, Array.from(new Set(intereses.map((i: any) => i.producto_id))))
  let lanzadas = 0
  for (const interes of intereses) {
    const producto = productos.get(interes.producto_id)
    if (!producto) continue
    const hayStock = (producto.totalInventory ?? 0) > 0 || (producto.variants?.nodes || []).some((v: any) => v.availableForSale)
    if (!hayStock) continue
    const contexto = await contextoDeInteres(tienda, interes, producto)
    if (!contexto) continue
    const r = await lanzarAutomatizacion('aviso_vuelve_stock', contexto)
    if (r.lanzada || r.motivo === 'ya se hizo') {
      await supabaseAdmin.from('intereses_producto').update({ avisado_en: new Date().toISOString() }).eq('id', interes.id)
      if (r.lanzada) lanzadas++
    }
  }
  return lanzadas
}

// Cada día: los productos por los que alguien preguntó y ahora están más
// baratos que cuando los vio (al menos X %)
export async function repasarBajadasDePrecio(tienda: TiendaBasica, bajadaMinima: number) {
  const { data: intereses } = await supabaseAdmin
    .from('intereses_producto')
    .select('id, contact_id, producto_id, producto_nombre, producto_enlace, precio_visto, moneda')
    .eq('branch_id', tienda.branch_id)
    .eq('tipo', 'consulta')
    .is('avisado_en', null)
    .not('precio_visto', 'is', null)
    .gte('created_at', new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
    .limit(200)
  if (!intereses?.length) return 0

  const productos = await productosPorIds(tienda, Array.from(new Set(intereses.map((i: any) => i.producto_id))))
  const umbral = Math.max(1, Number(bajadaMinima) || 10) / 100
  let lanzadas = 0
  for (const interes of intereses) {
    const producto = productos.get(interes.producto_id)
    if (!producto) continue
    const precios = (producto.variants?.nodes || []).map((v: any) => Number(v.price)).filter((n: number) => Number.isFinite(n))
    if (!precios.length) continue
    const ahora = Math.min(...precios)
    const visto = Number(interes.precio_visto)
    if (!(visto > 0) || ahora > visto * (1 - umbral)) continue
    const contexto = await contextoDeInteres(tienda, interes, producto, { precio_antes: visto, precio_ahora: ahora })
    if (!contexto) continue
    // Que bajó de precio no es "pidió el aviso": el consentimiento de
    // promociones se mira de verdad
    contexto.cliente = { ...contexto.cliente, acepta_marketing: await aceptaPromociones(tienda, interes.contact_id) }
    const r = await lanzarAutomatizacion('bajo_de_precio', contexto)
    if (r.lanzada || r.motivo === 'ya se hizo' || r.motivo === 'no cumple las condiciones') {
      await supabaseAdmin.from('intereses_producto').update({ avisado_en: new Date().toISOString() }).eq('id', interes.id)
      if (r.lanzada) lanzadas++
    }
  }
  return lanzadas
}

// ¿Acepta promociones este contacto? Se pregunta a la tienda por su correo o
// teléfono; si no está en la tienda como cliente, no.
async function aceptaPromociones(tienda: TiendaBasica, contactId: string) {
  const { data: contacto } = await supabaseAdmin.from('contacts').select('canal, identificador_canal, no_promociones').eq('id', contactId).maybeSingle()
  if (!contacto || contacto.no_promociones) return false
  const filtro = contacto.canal === 'email' ? `email:${contacto.identificador_canal}` : `phone:${contacto.identificador_canal}`
  try {
    const r = await consultarTienda<any>(tienda, `query cliente($query: String!) { customers(first: 1, query: $query) { nodes { emailMarketingConsent { marketingState } } } }`, { query: filtro })
    return r?.customers?.nodes?.[0]?.emailMarketingConsent?.marketingState === 'SUBSCRIBED'
  } catch {
    return false
  }
}
