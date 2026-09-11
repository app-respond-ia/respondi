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
    throw new ErrorMeta(cuerpo?.error?.message || `Meta ha respondido con un error ${r.status}`, cuerpo?.error?.code ?? null, r.status)
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
