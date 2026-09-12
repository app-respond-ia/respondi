import { supabaseAdmin } from '@/utils/supabase/admin'
import { consultarTienda } from './shopify'
import type { TiendaBasica } from './eventos'

// IMPORTAR DE LA TIENDA A RESPONDI (mantenimiento, sin mensajes a nadie).
//
//   · El catálogo: productos, precios y existencias → lista de precios. Cada
//     producto se reconoce por su id de Shopify (`origen_externo`), así que
//     volver a importar actualiza en vez de duplicar, y no toca lo que el
//     negocio añadió a mano.
//   · Las políticas: envíos, devoluciones, privacidad... → fuentes de
//     políticas de la IA, que el procesado de siempre trocea y vectoriza.

const CONSULTA_CATALOGO = `query catalogo($cursor: String) {
  products(first: 100, after: $cursor, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title status productType tags descriptionHtml totalInventory onlineStoreUrl
      variants(first: 20) { nodes { price availableForSale inventoryQuantity } }
    }
  }
}`

function sinHtml(html: string) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

export async function importarCatalogo(tienda: TiendaBasica, opciones: { soloActivos?: boolean } = {}) {
  const soloActivos = opciones.soloActivos !== false
  const productos: any[] = []
  let cursor: string | null = null
  for (let pagina = 0; pagina < 25; pagina++) {
    const datos: any = await consultarTienda<any>(tienda, CONSULTA_CATALOGO, { cursor })
    productos.push(...(datos?.products?.nodes || []))
    if (!datos?.products?.pageInfo?.hasNextPage) break
    cursor = datos.products.pageInfo.endCursor
  }

  // Las categorías: una por tipo de producto de Shopify, en la raíz
  const { data: categorias } = await supabaseAdmin
    .from('categorias_precios')
    .select('id, nombre, parent_id')
    .eq('branch_id', tienda.branch_id)
  const porNombre = new Map((categorias || []).filter((c: any) => !c.parent_id).map((c: any) => [String(c.nombre).toLowerCase(), c.id]))
  async function categoriaDe(tipo: string | null | undefined) {
    const nombre = String(tipo || '').trim()
    if (!nombre) return null
    const clave = nombre.toLowerCase()
    if (porNombre.has(clave)) return porNombre.get(clave)
    const { data } = await supabaseAdmin
      .from('categorias_precios')
      .insert({ tenant_id: tienda.tenant_id, branch_id: tienda.branch_id, nombre, parent_id: null, orden: 100 })
      .select('id')
      .single()
    if (data?.id) porNombre.set(clave, data.id)
    return data?.id || null
  }

  // Lo que ya vino de la tienda otras veces
  const { data: existentes } = await supabaseAdmin
    .from('price_list')
    .select('id, origen_externo')
    .eq('branch_id', tienda.branch_id)
    .not('origen_externo', 'is', null)
  const existentePorGid = new Map((existentes || []).map((e: any) => [e.origen_externo, e.id]))

  let nuevos = 0, actualizados = 0, saltados = 0
  for (const p of productos) {
    if (soloActivos && p.status !== 'ACTIVE') { saltados++; continue }
    const variantes = (p.variants?.nodes || []) as any[]
    const precios = variantes.map(v => Number(v.price)).filter(n => Number.isFinite(n))
    if (!precios.length) { saltados++; continue }
    const min = Math.min(...precios), max = Math.max(...precios)
    const fila = {
      tenant_id: tienda.tenant_id,
      branch_id: tienda.branch_id,
      nombre: String(p.title || '').slice(0, 200),
      tipo: 'producto',
      precio: min,
      precio_tipo: min === max ? 'exacto' : 'desde',
      moneda: tienda.moneda || 'EUR',
      descripcion: sinHtml(p.descriptionHtml).slice(0, 500) || null,
      disponible: (p.totalInventory ?? 0) > 0 || variantes.some(v => v.availableForSale),
      categoria_id: await categoriaDe(p.productType),
      etiquetas: Array.isArray(p.tags) ? p.tags.slice(0, 20) : [],
      visible_ia: true,
      origen_externo: p.id
    }
    const idExistente = existentePorGid.get(p.id)
    if (idExistente) {
      const { error } = await supabaseAdmin.from('price_list').update(fila).eq('id', idExistente)
      if (!error) actualizados++
    } else {
      const { error } = await supabaseAdmin.from('price_list').insert(fila)
      if (!error) nuevos++
    }
  }

  // Lo que ya no está en la tienda deja de estar disponible (no se borra:
  // puede estar en presupuestos o conversaciones)
  const gidsVivos = new Set(productos.map((p: any) => p.id))
  const desaparecidos = (existentes || []).filter((e: any) => !gidsVivos.has(e.origen_externo)).map((e: any) => e.id)
  if (desaparecidos.length) {
    await supabaseAdmin.from('price_list').update({ disponible: false }).in('id', desaparecidos)
  }

  return { nuevos, actualizados, saltados, retirados: desaparecidos.length, total: productos.length }
}

const CONSULTA_POLITICAS = `{ shop { shopPolicies { type title body } } }`

const NOMBRE_POLITICA: Record<string, string> = {
  REFUND_POLICY: 'Política de devoluciones y reembolsos',
  SHIPPING_POLICY: 'Política de envíos',
  PRIVACY_POLICY: 'Política de privacidad',
  TERMS_OF_SERVICE: 'Condiciones del servicio',
  TERMS_OF_SALE: 'Condiciones de venta',
  LEGAL_NOTICE: 'Aviso legal',
  SUBSCRIPTION_POLICY: 'Política de suscripciones',
  CONTACT_INFORMATION: 'Información de contacto'
}

export async function importarPoliticas(tienda: TiendaBasica) {
  const datos = await consultarTienda<any>(tienda, CONSULTA_POLITICAS)
  // Mismo mínimo que una política escrita a mano en Respondi
  const politicas = ((datos?.shop?.shopPolicies || []) as any[]).filter(p => sinHtml(p?.body).length >= 10)
  let nuevas = 0, actualizadas = 0
  for (const p of politicas) {
    const nombre = `Shopify · ${NOMBRE_POLITICA[String(p.type)] || p.title || p.type}`
    const texto = sinHtml(p.body).slice(0, 20000)
    const { data: existente } = await supabaseAdmin
      .from('policy_sources')
      .select('id, texto_manual')
      .eq('branch_id', tienda.branch_id)
      .eq('nombre', nombre)
      .maybeSingle()
    if (existente) {
      // Si no ha cambiado, no se vuelve a procesar (cuesta embeddings)
      if (existente.texto_manual === texto) continue
      await supabaseAdmin.from('policy_sources').update({ texto_manual: texto, estado: 'procesando' }).eq('id', existente.id)
      actualizadas++
    } else {
      await supabaseAdmin.from('policy_sources').insert({
        tenant_id: tienda.tenant_id,
        branch_id: tienda.branch_id,
        nombre,
        tipo_origen: 'texto_manual',
        texto_manual: texto,
        estado: 'procesando'
      })
      nuevas++
    }
  }
  return { nuevas, actualizadas, total: politicas.length }
}
