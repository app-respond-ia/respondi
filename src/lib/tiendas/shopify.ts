import { supabaseAdmin } from '@/utils/supabase/admin'

// Conversación con la tienda del negocio en Shopify (Admin API), sin
// intermediarios. Cada cliente crea una "app personalizada" en su propio
// Shopify y pega aquí el token: nosotros no somos Partner ni centralizamos
// cuentas, igual que con Meta y con el correo.
//
// Se usa GraphQL y no REST porque desde 2025 Shopify quitó los productos de
// REST: GraphQL es la única puerta que lo tiene todo.
//
// La dirección se puede cambiar con SHOPIFY_API_URL para las pruebas (una
// tienda simulada); en producción es la de la propia tienda.
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-01'

function direccionApi(dominio: string) {
  const simulada = process.env.SHOPIFY_API_URL
  if (simulada) return `${simulada.replace(/\/$/, '')}/${dominio}/admin/api/${VERSION}/graphql.json`
  return `https://${dominio}/admin/api/${VERSION}/graphql.json`
}

export interface CredencialesTienda {
  access_token: string
  // Clave secreta de la app, para comprobar que los avisos son de Shopify de
  // verdad. Es opcional: sin ella no se aceptan avisos, solo repasos.
  api_secret?: string | null
}

export class ErrorShopify extends Error {
  constructor(
    message: string,
    public codigo: string | null = null,
    public estadoHttp: number | null = null
  ) {
    super(message)
  }
  // Fallos pasajeros que tiene sentido volver a intentar
  get reintentable() {
    if (this.estadoHttp === null) return true // sin conexión / tiempo agotado
    if (this.estadoHttp === 429 || this.estadoHttp >= 500) return true
    return this.codigo === 'THROTTLED'
  }
  // El token ya no sirve (borrado, caducado o de otra tienda)
  get clavesInvalidas() {
    return this.estadoHttp === 401 || this.codigo === 'UNAUTHORIZED'
  }
  // El token funciona pero le falta un permiso: hay que volver a darlo en
  // Shopify. Se distingue porque el arreglo es distinto: no es cambiar el
  // token, es marcar una casilla más.
  get faltaPermiso() {
    return this.codigo === 'ACCESS_DENIED' || this.estadoHttp === 403
  }
}

// "mitienda", "mitienda.myshopify.com", la dirección del panel o la de la
// tienda: todo acaba en el dominio técnico, que es el que entiende la API.
export function normalizarDominio(entrada: string): string | null {
  let t = (entrada || '').trim().toLowerCase()
  if (!t) return null
  t = t.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  // Dirección del panel de Shopify: admin.shopify.com/store/mitienda
  const panel = t.match(/^admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/)
  if (panel) return `${panel[1]}.myshopify.com`
  t = t.split('/')[0]
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(t)) return t
  // Solo el nombre de la tienda
  if (/^[a-z0-9][a-z0-9-]*$/.test(t)) return `${t}.myshopify.com`
  return null
}

const ESPERA_MAXIMA = 3

function pausa(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// Una llamada a Shopify. Shopify no cobra por llamada sino por "coste": si se
// pide demasiado seguido responde THROTTLED y hay que esperar a que se
// rellene el depósito. Eso se reintenta solo.
export async function consultarShopify<T = any>(
  dominio: string,
  token: string,
  consulta: string,
  variables: Record<string, any> = {}
): Promise<T> {
  let ultimo: ErrorShopify | null = null

  for (let intento = 0; intento < ESPERA_MAXIMA; intento++) {
    let r: Response
    try {
      r = await fetch(direccionApi(dominio), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query: consulta, variables }),
        signal: AbortSignal.timeout(20000)
      })
    } catch (e: any) {
      ultimo = new ErrorShopify(`No se ha podido conectar con la tienda (${e?.message || 'sin respuesta'})`, null, null)
      await pausa(500 * (intento + 1))
      continue
    }

    if (!r.ok) {
      const texto = await r.text().catch(() => '')
      ultimo = new ErrorShopify(mensajeHttp(r.status, texto), null, r.status)
      if (!ultimo.reintentable) throw ultimo
      // Shopify dice cuánto esperar cuando frena
      const espera = Number(r.headers.get('retry-after')) || (intento + 1)
      await pausa(Math.min(espera, 3) * 1000)
      continue
    }

    const cuerpo: any = await r.json().catch(() => null)
    if (!cuerpo) throw new ErrorShopify('La tienda ha respondido algo que no se entiende.', null, r.status)

    if (Array.isArray(cuerpo.errors) && cuerpo.errors.length) {
      const primero = cuerpo.errors[0]
      const codigo = primero?.extensions?.code || null
      const error = new ErrorShopify(mensajeGraphql(primero), codigo, r.status)
      if (!error.reintentable) throw error
      ultimo = error
      // Cuando frena por coste, espera a que se rellene el depósito
      const estado = cuerpo.extensions?.cost?.throttleStatus
      const faltan = estado ? Math.max(0, (estado.maximumAvailable - estado.currentlyAvailable) / (estado.restoreRate || 50)) : 1
      await pausa(Math.min(Math.ceil(faltan), 3) * 1000)
      continue
    }

    return cuerpo.data as T
  }

  throw ultimo || new ErrorShopify('La tienda no ha respondido.', null, null)
}

function mensajeHttp(estado: number, cuerpo: string) {
  if (estado === 401) return 'El token de la tienda no vale (puede que lo hayan borrado o cambiado en Shopify).'
  if (estado === 403) return 'Al token le faltan permisos. Revísalos en la app de Shopify y vuelve a conectar la tienda.'
  if (estado === 402) return 'La tienda de Shopify está sin plan activo o congelada.'
  if (estado === 404) return 'No existe ninguna tienda con ese dominio.'
  if (estado === 423) return 'Shopify ha bloqueado esta tienda.'
  if (estado === 429) return 'La tienda está recibiendo demasiadas peticiones; se reintentará en un momento.'
  if (estado >= 500) return 'Shopify está fallando en este momento; se reintentará solo.'
  const detalle = (cuerpo || '').slice(0, 200)
  return `Shopify ha respondido con un error (${estado})${detalle ? `: ${detalle}` : ''}`
}

function mensajeGraphql(error: any) {
  const codigo = error?.extensions?.code
  if (codigo === 'ACCESS_DENIED') {
    const falta = error?.extensions?.requiredAccess
    return `Al token le falta el permiso${falta ? ` "${falta}"` : ''}. Añádelo en la app de Shopify y vuelve a conectar la tienda.`
  }
  if (codigo === 'THROTTLED') return 'La tienda está frenando las peticiones; se reintentará en un momento.'
  if (codigo === 'SHOP_INACTIVE') return 'La tienda de Shopify no está activa.'
  return error?.message || 'Shopify ha devuelto un error.'
}

// ---------------------------------------------------------------------------
// Las claves de una tienda (de la caja fuerte, nunca salen del servidor)
// ---------------------------------------------------------------------------
export async function leerCredencialesTienda(tiendaId: string): Promise<CredencialesTienda | null> {
  const { data, error } = await supabaseAdmin.rpc('leer_credenciales_tienda', { p_tienda_id: tiendaId })
  // Un fallo pasajero de la base de datos no es lo mismo que no tener token
  if (error) {
    throw new ErrorShopify('No se han podido leer las claves guardadas: la base de datos no ha respondido. Inténtalo en un momento.', null, 503)
  }
  if (!data) return null
  try {
    const c = JSON.parse(data as string)
    return c?.access_token ? c : null
  } catch {
    return null
  }
}

export async function guardarCredencialesTienda(tiendaId: string, credenciales: CredencialesTienda) {
  const { error } = await supabaseAdmin.rpc('guardar_credenciales_tienda', {
    p_tienda_id: tiendaId,
    p_credenciales: JSON.stringify(credenciales)
  })
  if (error) throw new Error(error.message)
}

export async function borrarCredencialesTienda(tiendaId: string) {
  const { error } = await supabaseAdmin.rpc('borrar_credenciales_tienda', { p_tienda_id: tiendaId })
  if (error) throw new Error(error.message)
}

// Atajo para el resto de la app: llamar a la tienda guardada sin tener que
// acordarse de leer el token.
export async function consultarTienda<T = any>(
  tienda: { id: string; dominio: string },
  consulta: string,
  variables: Record<string, any> = {}
): Promise<T> {
  const credenciales = await leerCredencialesTienda(tienda.id)
  if (!credenciales) throw new ErrorShopify('La tienda no tiene token guardado. Vuelve a conectarla.', 'UNAUTHORIZED', 401)
  return consultarShopify<T>(tienda.dominio, credenciales.access_token, consulta, variables)
}

// ---------------------------------------------------------------------------
// Comprobar la tienda al conectarla
// ---------------------------------------------------------------------------
export interface DatosTienda {
  nombre: string
  dominio: string
  moneda: string
  zona_horaria: string
  direccion_publica: string | null
  correo_contacto: string | null
  permisos: string[]
}

const CONSULTA_TIENDA = `{
  shop {
    name
    myshopifyDomain
    currencyCode
    ianaTimezone
    contactEmail
    primaryDomain { url }
  }
}`

const CONSULTA_PERMISOS = `{
  currentAppInstallation { accessScopes { handle } }
}`

// Los permisos mínimos para que la IA pueda contestar con datos de verdad
export const PERMISOS_MINIMOS = ['read_products', 'read_orders']

export const PERMISOS_RECOMENDADOS = [
  'read_products',
  'read_inventory',
  'read_orders',
  'read_fulfillments',
  'read_customers',
  // Para etiquetar clientes en Shopify desde las automatizaciones
  'write_customers',
  'read_shipping',
  'read_content',
  'write_draft_orders',
  'write_discounts'
]

// ¿Existe la tienda, vale el token y qué permisos tiene? Se hace ANTES de
// guardar nada, como con el buzón de correo.
export async function comprobarTienda(dominio: string, token: string): Promise<DatosTienda> {
  const datos = await consultarShopify<any>(dominio, token, CONSULTA_TIENDA)
  const shop = datos?.shop
  if (!shop) throw new ErrorShopify('La tienda no ha devuelto sus datos. Revisa el dominio y el token.')

  let permisos: string[] = []
  try {
    const p = await consultarShopify<any>(dominio, token, CONSULTA_PERMISOS)
    permisos = (p?.currentAppInstallation?.accessScopes || []).map((s: any) => s.handle).filter(Boolean)
  } catch {
    // Si no se pueden leer los permisos no es motivo para no conectar: se
    // sabrá igual en cuanto haga falta uno que no está.
    permisos = []
  }

  return {
    nombre: shop.name || dominio,
    dominio: shop.myshopifyDomain || dominio,
    moneda: shop.currencyCode || 'EUR',
    zona_horaria: shop.ianaTimezone || 'Europe/Madrid',
    direccion_publica: shop.primaryDomain?.url || null,
    correo_contacto: shop.contactEmail || null,
    permisos
  }
}

// Los permisos que faltan de una lista, para avisar en pantalla en vez de
// fallar más tarde sin explicación.
export function permisosQueFaltan(permisos: string[], necesarios: string[]) {
  if (!permisos.length) return [] // no se pudieron leer: no inventamos avisos
  return necesarios.filter(p => !permisos.includes(p))
}

// ---------------------------------------------------------------------------
// La app de Respondi en Shopify (Dev Dashboard) — 13-09-2026
// ---------------------------------------------------------------------------
// Desde el 1 de enero de 2026 los comerciantes ya no pueden crear "apps
// personalizadas" en su Shopify, así que la forma normal de conectar es
// instalar la app de Respondi: el cliente escribe su tienda, Shopify le pide
// permiso y nos devuelve un código que cambiamos por el token. Los avisos
// (webhooks) los registra Respondi sola. Hace falta que Jorge cree la app en
// el Dev Dashboard y ponga su clave y su secreto en Vercel
// (SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET). Sin ellos, queda la app
// personalizada con token para las tiendas que aún la tengan.
import crypto from 'crypto'

export function instalacionDisponible() {
  return !!process.env.SHOPIFY_CLIENT_ID && !!process.env.SHOPIFY_CLIENT_SECRET
}

function claveApp() {
  const id = process.env.SHOPIFY_CLIENT_ID, secreto = process.env.SHOPIFY_CLIENT_SECRET
  if (!id || !secreto) throw new ErrorShopify('La app de Respondi en Shopify no está configurada (faltan SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET).')
  return { id, secreto }
}

export function urlDeRetorno() {
  return `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://respondi.vercel.app').replace(/\/$/, '')}/api/tiendas/shopify/oauth/callback`
}

// El "state" que va y vuelve de Shopify: quién pide la instalación, firmado
// para que nadie pueda colgar una tienda ajena en una cuenta que no es suya
export function firmarEstadoInstalacion(datos: { tenant_id: string; branch_id: string; user_id: string; dominio: string }) {
  const { secreto } = claveApp()
  const carga = Buffer.from(JSON.stringify({ ...datos, exp: Date.now() + 30 * 60 * 1000, n: crypto.randomBytes(8).toString('hex') })).toString('base64url')
  const firma = crypto.createHmac('sha256', secreto).update(carga).digest('base64url')
  return `${carga}.${firma}`
}

export function leerEstadoInstalacion(estado: string | null): { tenant_id: string; branch_id: string; user_id: string; dominio: string } | null {
  if (!estado) return null
  const { secreto } = claveApp()
  const [carga, firma] = String(estado).split('.')
  if (!carga || !firma) return null
  const esperada = crypto.createHmac('sha256', secreto).update(carga).digest('base64url')
  if (firma.length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null
  try {
    const d = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'))
    if (!d.exp || d.exp < Date.now()) return null
    return { tenant_id: d.tenant_id, branch_id: d.branch_id, user_id: d.user_id, dominio: d.dominio }
  } catch {
    return null
  }
}

// Adónde mandar al cliente para que autorice la app
export function urlDeAutorizacion(dominio: string, estado: string) {
  const { id } = claveApp()
  const p = new URLSearchParams({ client_id: id, scope: PERMISOS_RECOMENDADOS.join(','), redirect_uri: urlDeRetorno(), state: estado })
  return `https://${dominio}/admin/oauth/authorize?${p.toString()}`
}

// Shopify firma la vuelta con el secreto de la app: sin comprobarlo,
// cualquiera podría inventarse una vuelta
export function vueltaFirmada(parametros: URLSearchParams) {
  const { secreto } = claveApp()
  const hmac = parametros.get('hmac') || ''
  const mensaje = [...parametros.entries()].filter(([k]) => k !== 'hmac' && k !== 'signature').sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&')
  const esperada = crypto.createHmac('sha256', secreto).update(mensaje).digest('hex')
  return hmac.length === esperada.length && /^[0-9a-f]+$/i.test(hmac) && crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(esperada, 'hex'))
}

// El código de la vuelta se cambia por el token de la tienda
export async function canjearCodigo(dominio: string, codigo: string): Promise<{ access_token: string; scope: string[] }> {
  const { id, secreto } = claveApp()
  const simulada = process.env.SHOPIFY_API_URL
  const direccion = simulada ? `${simulada.replace(/\/$/, '')}/${dominio}/admin/oauth/access_token` : `https://${dominio}/admin/oauth/access_token`
  let r: Response
  try {
    r = await fetch(direccion, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: id, client_secret: secreto, code: codigo }), signal: AbortSignal.timeout(20000) })
  } catch (e: any) {
    throw new ErrorShopify(`No se ha podido hablar con Shopify (${e?.message})`, null, null)
  }
  const cuerpo: any = await r.json().catch(() => ({}))
  if (!r.ok || !cuerpo?.access_token) throw new ErrorShopify(`Shopify no ha aceptado el código de instalación (${r.status}${cuerpo?.error_description ? `: ${cuerpo.error_description}` : ''})`, null, r.status)
  return { access_token: String(cuerpo.access_token), scope: String(cuerpo.scope || '').split(',').map(x => x.trim()).filter(Boolean) }
}

// Los avisos de la tienda, registrados por Respondi (una app puede; una app
// personalizada, no). Devuelve los que no se han podido crear.
export const SUCESOS_WEBHOOK_SHOPIFY = ['ORDERS_CREATE', 'ORDERS_PAID', 'ORDERS_FULFILLED', 'ORDERS_CANCELLED', 'CHECKOUTS_UPDATE', 'FULFILLMENTS_UPDATE'] as const

export async function registrarWebhooksDeTienda(dominio: string, token: string, callbackUrl: string): Promise<string[]> {
  const fallos: string[] = []
  for (const topic of SUCESOS_WEBHOOK_SHOPIFY) {
    try {
      const d = await consultarShopify<any>(dominio, token, `mutation crear($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) { webhookSubscription { id } userErrors { field message } }
      }`, { topic, webhookSubscription: { callbackUrl, format: 'JSON' } })
      const errores = (d?.webhookSubscriptionCreate?.userErrors || []).map((e: any) => String(e.message))
      // Uno que ya existía no es un fallo
      if (errores.length && !errores.some((m: string) => /already|taken|exists/i.test(m))) fallos.push(`${topic}: ${errores.join('; ')}`)
    } catch (e: any) {
      fallos.push(`${topic}: ${e?.message}`)
    }
  }
  return fallos
}
