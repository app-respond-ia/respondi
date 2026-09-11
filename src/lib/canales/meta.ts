import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'

// Conversación directa con la API de WhatsApp de Meta (Cloud API), sin n8n.
// La dirección se puede cambiar con WHATSAPP_GRAPH_URL para las pruebas
// (un Meta simulado); en producción es la de Meta, versión 25 (febrero 2026).
const GRAPH = process.env.WHATSAPP_GRAPH_URL || 'https://graph.facebook.com/v25.0'

export interface CredencialesMeta {
  access_token: string
  app_secret: string
}

// Las claves de un canal, de la caja fuerte (Vault). Nunca salen del servidor.
export async function leerCredencialesMeta(channelId: string): Promise<CredencialesMeta | null> {
  const { data, error } = await supabaseAdmin.rpc('leer_credenciales_canal', { p_channel_id: channelId })
  if (error || !data) return null
  try {
    const c = JSON.parse(data as string)
    return c?.access_token && c?.app_secret ? c : null
  } catch {
    return null
  }
}

export async function guardarCredencialesMeta(channelId: string, credenciales: CredencialesMeta) {
  const { error } = await supabaseAdmin.rpc('guardar_credenciales_canal', {
    p_channel_id: channelId,
    p_credenciales: JSON.stringify(credenciales)
  })
  if (error) throw new Error(error.message)
}

// Meta firma cada aviso con la clave secreta de la app. Sin comprobarlo,
// cualquiera podría mandarnos mensajes falsos haciéndose pasar por Meta.
export function firmaValida(cuerpo: Buffer, cabecera: string | null, appSecret: string) {
  if (!cabecera || !cabecera.startsWith('sha256=')) return false
  const recibida = cabecera.slice('sha256='.length)
  const esperada = crypto.createHmac('sha256', appSecret).update(cuerpo).digest('hex')
  if (recibida.length !== esperada.length || !/^[0-9a-f]+$/i.test(recibida)) return false
  return crypto.timingSafeEqual(Buffer.from(recibida, 'hex'), Buffer.from(esperada, 'hex'))
}

export class ErrorMeta extends Error {
  constructor(message: string, public codigo: number | null, public estadoHttp: number | null) {
    super(message)
  }
  // Fallos pasajeros que tiene sentido volver a intentar
  get reintentable() {
    if (this.estadoHttp === null) return true // sin conexión / tiempo agotado
    if (this.estadoHttp >= 500) return true
    return [1, 2, 4, 80007, 130429, 131000, 131056].includes(this.codigo ?? -1)
  }
  // Las claves ya no sirven (token caducado o sin permisos)
  get clavesInvalidas() {
    return [190, 10, 200].includes(this.codigo ?? -1) || this.estadoHttp === 401
  }
  // Han pasado más de 24 h desde el último mensaje del cliente
  get fueraDeVentana() {
    return this.codigo === 131047
  }
}

async function graph(ruta: string, token: string, init: RequestInit = {}) {
  let r: Response
  try {
    r = await fetch(`${GRAPH}/${ruta}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(15000)
    })
  } catch (e: any) {
    throw new ErrorMeta(`No se ha podido conectar con Meta (${e?.message || 'sin respuesta'})`, null, null)
  }
  const cuerpo: any = await r.json().catch(() => ({}))
  if (!r.ok) {
    // Cuando Meta trae una explicación pensada para el usuario (por ejemplo, por
    // qué no acepta una plantilla), se usa esa
    const e = cuerpo?.error || {}
    const texto = e.error_user_msg ? `${e.error_user_title ? `${e.error_user_title}: ` : ''}${e.error_user_msg}` : e.message
    throw new ErrorMeta(texto || `Meta ha respondido con un error ${r.status}`, e.code ?? null, r.status)
  }
  return cuerpo
}

// Comprueba que el número y el token son buenos, y trae cómo se ve el número
export async function comprobarNumero(phoneNumberId: string, token: string) {
  const d = await graph(`${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`, token)
  return { numeroVisible: d.display_phone_number as string, nombreVerificado: d.verified_name as string, calidad: d.quality_rating as string | undefined }
}

// WhatsApp admite hasta 4096 caracteres por mensaje de texto
export async function enviarTexto(phoneNumberId: string, token: string, destino: string, texto: string): Promise<string> {
  const d = await graph(`${encodeURIComponent(phoneNumberId)}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: destino.replace(/\D/g, ''),
      type: 'text',
      text: { preview_url: false, body: texto.slice(0, 4096) }
    })
  })
  const id = d?.messages?.[0]?.id
  if (!id) throw new ErrorMeta('Meta no ha devuelto el identificador del mensaje enviado', null, 200)
  return id
}

// Un archivo que ha mandado el cliente: primero se pide a Meta el enlace y
// luego se descarga con el mismo token.
export async function descargarArchivo(mediaId: string, token: string): Promise<{ datos: Buffer; tipo: string }> {
  const info = await graph(encodeURIComponent(mediaId), token)
  let r: Response
  try {
    r = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) })
  } catch (e: any) {
    throw new ErrorMeta(`No se ha podido descargar el archivo de Meta (${e?.message})`, null, null)
  }
  if (!r.ok) throw new ErrorMeta(`Meta no ha dejado descargar el archivo (${r.status})`, null, r.status)
  return { datos: Buffer.from(await r.arrayBuffer()), tipo: (info.mime_type || r.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim() }
}

// ---------- Plantillas ----------
// WhatsApp solo deja escribir libremente al cliente durante las 24 h
// siguientes a su último mensaje; después, solo con una plantilla que Meta
// haya aprobado. Las plantillas son de la cuenta de WhatsApp Business (WABA),
// no del número.

// Que la cuenta existe, que el token llega a ella y que el número es suyo
export async function numeroEsDeLaCuenta(wabaId: string, token: string, phoneNumberId: string) {
  const d = await graph(`${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number&limit=100`, token)
  return (d?.data || []).some((n: any) => String(n.id) === String(phoneNumberId))
}

export interface PlantillaMeta {
  id: string
  name: string
  language: string
  status: string
  category: string
  components?: any[]
  rejected_reason?: string
  parameter_format?: string
}

const CAMPOS_PLANTILLA = 'id,name,language,status,category,components,rejected_reason,parameter_format'

export async function listarPlantillasMeta(wabaId: string, token: string): Promise<PlantillaMeta[]> {
  const todas: PlantillaMeta[] = []
  let despues: string | null = null
  // Hasta 20 páginas de 100 (una cuenta tiene como mucho unos cientos)
  for (let i = 0; i < 20; i++) {
    const d: any = await graph(`${encodeURIComponent(wabaId)}/message_templates?fields=${CAMPOS_PLANTILLA}&limit=100${despues ? `&after=${encodeURIComponent(despues)}` : ''}`, token)
    todas.push(...(d?.data || []))
    despues = d?.paging?.next && d?.paging?.cursors?.after ? d.paging.cursors.after : null
    if (!despues) break
  }
  return todas
}

// Solo cuerpo de texto con huecos numerados ({{1}}, {{2}}...). Meta pide un
// ejemplo de cada hueco para revisarla.
export async function crearPlantillaMeta(wabaId: string, token: string, p: { nombre: string; idioma: string; categoria: 'MARKETING' | 'UTILITY'; cuerpo: string; ejemplos: string[] }) {
  const d = await graph(`${encodeURIComponent(wabaId)}/message_templates`, token, {
    method: 'POST',
    body: JSON.stringify({
      name: p.nombre,
      language: p.idioma,
      category: p.categoria,
      components: [{
        type: 'BODY',
        text: p.cuerpo,
        ...(p.ejemplos.length ? { example: { body_text: [p.ejemplos] } } : {})
      }]
    })
  })
  if (!d?.id) throw new ErrorMeta('Meta no ha devuelto el identificador de la plantilla', null, 200)
  return { id: String(d.id), status: String(d.status || 'PENDING'), category: String(d.category || p.categoria) }
}

export async function borrarPlantillaMeta(wabaId: string, token: string, nombre: string, id: string) {
  await graph(`${encodeURIComponent(wabaId)}/message_templates?name=${encodeURIComponent(nombre)}&hsm_id=${encodeURIComponent(id)}`, token, { method: 'DELETE' })
}

export async function enviarPlantilla(phoneNumberId: string, token: string, destino: string, p: { nombre: string; idioma: string; parametros: string[] }): Promise<string> {
  const d = await graph(`${encodeURIComponent(phoneNumberId)}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: destino.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: p.nombre,
        language: { code: p.idioma },
        ...(p.parametros.length
          ? { components: [{ type: 'body', parameters: p.parametros.map(text => ({ type: 'text', text })) }] }
          : {})
      }
    })
  })
  const id = d?.messages?.[0]?.id
  if (!id) throw new ErrorMeta('Meta no ha devuelto el identificador del mensaje enviado', null, 200)
  return id
}

// Cuándo caduca un token: una fecha, null si no caduca, o undefined si Meta
// no lo dice (no se da nada por hecho). El token de prueba de Meta dura 24 h;
// el de "usuario del sistema" puede no caducar nunca.
export async function caducidadDelToken(token: string): Promise<Date | null | undefined> {
  try {
    const d = await graph(`debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`, token)
    const expira = Number(d?.data?.expires_at)
    if (d?.data?.is_valid === false || !Number.isFinite(expira)) return undefined
    return expira > 0 ? new Date(expira * 1000) : null
  } catch {
    return undefined
  }
}
