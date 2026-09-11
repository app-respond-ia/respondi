import crypto from 'crypto'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import { supabaseAdmin } from '@/utils/supabase/admin'

// Canal de correo: el negocio conecta su propio buzón con sus datos (opción A,
// decidida con Jorge el 11-09-2026). Respondi lee los correos nuevos por IMAP
// y contesta por SMTP desde la dirección del negocio. Está separado en dos
// piezas —leer y enviar— para que mañana se pueda añadir otra forma de
// recibir o de enviar (reenvío, proveedor de envío...) sin tocar el resto.

export interface ServidorCorreo { host: string; puerto: number; seguro: boolean }

export interface ConfigCorreo {
  imap: ServidorCorreo
  smtp: ServidorCorreo
  usuario: string
  direccion: string
  nombre_remitente?: string | null
  firma?: string | null
  // Hasta qué correo se ha leído (para no volver a leerlo ni leer lo antiguo)
  lectura?: { uidvalidity: string; ultimo_uid: number } | null
}

export class ErrorCorreo extends Error {
  constructor(message: string, public tipo: 'credenciales' | 'conexion' | 'otro') {
    super(message)
  }
  get reintentable() {
    return this.tipo === 'conexion'
  }
}

// ---------- Claves (caja fuerte) ----------

export async function leerContrasenaCorreo(channelId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc('leer_credenciales_canal', { p_channel_id: channelId })
  if (error || !data) return null
  try {
    return JSON.parse(data as string)?.contrasena || null
  } catch {
    return null
  }
}

export async function guardarContrasenaCorreo(channelId: string, contrasena: string) {
  const { error } = await supabaseAdmin.rpc('guardar_credenciales_canal', {
    p_channel_id: channelId,
    p_credenciales: JSON.stringify({ contrasena })
  })
  if (error) throw new Error(error.message)
}

// ---------- Errores en palabras que se entiendan ----------

function traducirError(e: any, donde: 'leer' | 'enviar'): ErrorCorreo {
  const texto = String(e?.response || e?.message || e || '')
  if (e?.authenticationFailed || e?.code === 'EAUTH' || /auth|credential|password|login|535|534|invalid user/i.test(texto)) {
    return new ErrorCorreo(
      'El servidor de correo no ha aceptado el usuario o la contraseña. Si es Gmail o Google Workspace, hace falta una "contraseña de aplicación" (no la contraseña normal).',
      'credenciales'
    )
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(texto) || e?.code === 'ENOTFOUND') {
    return new ErrorCorreo(`No se encuentra el servidor de ${donde === 'leer' ? 'entrada (IMAP)' : 'salida (SMTP)'}. Revisa el nombre del servidor.`, 'otro')
  }
  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|timeout|socket|ESOCKET|ECONNECTION|greeting/i.test(texto) || ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(e?.code)) {
    return new ErrorCorreo(`No se ha podido conectar con el servidor de ${donde === 'leer' ? 'entrada (IMAP)' : 'salida (SMTP)'}. Revisa el servidor y el puerto, o inténtalo en un rato.`, 'conexion')
  }
  return new ErrorCorreo(texto.slice(0, 200) || 'Error desconocido del servidor de correo', 'otro')
}

function clienteImap(config: ConfigCorreo, contrasena: string) {
  return new ImapFlow({
    host: config.imap.host,
    port: config.imap.puerto,
    secure: config.imap.seguro,
    auth: { user: config.usuario, pass: contrasena },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000
  })
}

function transporteSmtp(config: ConfigCorreo, contrasena: string) {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.puerto,
    secure: config.smtp.seguro,
    auth: { user: config.usuario, pass: contrasena },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000
  })
}

// ---------- Comprobar al conectar ----------

// Entra en el buzón y en el servidor de salida con esos datos. Devuelve desde
// dónde empezar a leer: solo los correos que lleguen a partir de ahora (no se
// contesta a toda la bandeja de entrada antigua).
export async function comprobarCorreo(config: ConfigCorreo, contrasena: string) {
  const imap = clienteImap(config, contrasena)
  let lectura: { uidvalidity: string; ultimo_uid: number }
  try {
    await imap.connect()
    const lock = await imap.getMailboxLock('INBOX')
    try {
      const buzon: any = imap.mailbox
      lectura = { uidvalidity: String(buzon.uidValidity), ultimo_uid: Math.max(0, Number(buzon.uidNext || 1) - 1) }
    } finally {
      lock.release()
    }
  } catch (e) {
    throw traducirError(e, 'leer')
  } finally {
    await imap.logout().catch(() => {})
  }
  try {
    await transporteSmtp(config, contrasena).verify()
  } catch (e) {
    throw traducirError(e, 'enviar')
  }
  return lectura
}

// ---------- Leer ----------

export interface CorreoEntrante {
  uid: number
  de: { direccion: string; nombre: string | null }
  asunto: string
  texto: string
  messageId: string | null
  referencias: string[]
  adjuntos: { nombre: string; tipo: string; datos: Buffer }[]
  automatico: boolean
}

// Correos que no hay que contestar: respuestas automáticas ("estoy de
// vacaciones"), rebotes, boletines y listas, y los que manda el propio buzón
function esAutomatico(p: any, propia: string) {
  const h = p.headers as Map<string, any>
  const cab = (k: string) => String(h?.get(k)?.value ?? h?.get(k) ?? '').toLowerCase()
  const de = String(p.from?.value?.[0]?.address || '').toLowerCase()
  if (de && de === propia.toLowerCase()) return true
  if (/mailer-daemon|postmaster|no-?reply|donotreply|do-not-reply|bounce/i.test(de)) return true
  const auto = cab('auto-submitted')
  if (auto && auto !== 'no') return true
  if (h?.has('x-autoreply') || h?.has('x-autorespond') || h?.has('list-unsubscribe') || h?.has('list-id')) return true
  if (/^(bulk|junk|list|auto_reply)$/.test(cab('precedence'))) return true
  return false
}

// Lo que la gente deja debajo al contestar (el correo anterior citado) no es
// parte de lo que pregunta ahora
export function sinCitas(texto: string) {
  const lineas = (texto || '').replace(/\r\n/g, '\n').split('\n')
  const corte = lineas.findIndex((l, i) =>
    /^\s*(El|On|Le|Am|Il)\s.{0,200}(escribió|wrote|a écrit|schrieb|ha scritto)\s*:?\s*$/i.test(l) ||
    /^\s*-{2,}\s*(Original Message|Mensaje original|Mensaje reenviado|Forwarded message)/i.test(l) ||
    /^\s*_{20,}\s*$/.test(l) ||
    (/^\s*(De|From):\s.+/i.test(l) && /^\s*(Enviado|Sent|Fecha|Date):\s/i.test(lineas[i + 1] || ''))
  )
  const utiles = (corte >= 0 ? lineas.slice(0, corte) : lineas).filter(l => !/^\s*>/.test(l))
  return utiles.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Los correos nuevos desde la última vez (como mucho 20 por pasada)
export async function leerCorreosNuevos(config: ConfigCorreo, contrasena: string): Promise<{ correos: CorreoEntrante[]; lectura: { uidvalidity: string; ultimo_uid: number } }> {
  const imap = clienteImap(config, contrasena)
  try {
    await imap.connect()
  } catch (e) {
    throw traducirError(e, 'leer')
  }
  try {
    const lock = await imap.getMailboxLock('INBOX')
    try {
      const buzon: any = imap.mailbox
      const uidvalidity = String(buzon.uidValidity)
      const uidNext = Number(buzon.uidNext || 1)
      // Primera vez, o el buzón se ha rehecho: se empieza desde ahora
      if (!config.lectura || config.lectura.uidvalidity !== uidvalidity) {
        return { correos: [], lectura: { uidvalidity, ultimo_uid: Math.max(0, uidNext - 1) } }
      }
      const desde = config.lectura.ultimo_uid + 1
      if (desde >= uidNext) return { correos: [], lectura: config.lectura }

      const correos: CorreoEntrante[] = []
      let ultimo = config.lectura.ultimo_uid
      for await (const m of imap.fetch({ uid: `${desde}:*` }, { uid: true, source: true }, { uid: true })) {
        if (!m.uid || m.uid <= config.lectura.ultimo_uid) continue
        if (correos.length >= 20) break
        ultimo = Math.max(ultimo, m.uid)
        const p: any = await simpleParser(m.source as Buffer)
        const de = p.from?.value?.[0] || {}
        const referencias = [
          ...(Array.isArray(p.references) ? p.references : p.references ? [p.references] : []),
          ...(p.inReplyTo ? [p.inReplyTo] : [])
        ].filter((x: string, i: number, a: string[]) => x && a.indexOf(x) === i)
        const cuerpo = p.text || (p.html ? String(p.html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ') : '')
        correos.push({
          uid: m.uid,
          de: { direccion: String(de.address || '').toLowerCase(), nombre: de.name || null },
          asunto: (p.subject || '').trim(),
          texto: sinCitas(cuerpo),
          messageId: p.messageId || null,
          referencias,
          adjuntos: (p.attachments || [])
            .filter((a: any) => a.contentDisposition !== 'inline' || !a.contentId)
            .map((a: any) => ({ nombre: a.filename || 'adjunto', tipo: a.contentType || 'application/octet-stream', datos: a.content as Buffer })),
          automatico: esAutomatico(p, config.direccion)
        })
      }
      return { correos, lectura: { uidvalidity, ultimo_uid: ultimo } }
    } finally {
      lock.release()
    }
  } catch (e) {
    throw e instanceof ErrorCorreo ? e : traducirError(e, 'leer')
  } finally {
    await imap.logout().catch(() => {})
  }
}

// ---------- Enviar ----------

function aHtml(texto: string) {
  const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return texto
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 12px">${escapar(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

// Un correo dentro del hilo del cliente: "Re: asunto", y las cabeceras que
// usan los programas de correo para agruparlo con los anteriores. Devuelve su
// identificador (Message-ID), que se guarda para seguir el hilo.
export async function enviarCorreo(config: ConfigCorreo, contrasena: string, c: {
  para: string
  asunto: string
  texto: string
  enRespuestaA?: string | null
  referencias?: string[]
}): Promise<string> {
  const dominio = (config.direccion.split('@')[1] || 'respondi.local').toLowerCase()
  const messageId = `<${crypto.randomUUID()}@${dominio}>`
  const cuerpo = config.firma?.trim() ? `${c.texto.trim()}\n\n${config.firma.trim()}` : c.texto.trim()
  const opciones = {
    from: { name: config.nombre_remitente || '', address: config.direccion },
    to: c.para,
    subject: c.asunto,
    text: cuerpo,
    html: aHtml(cuerpo),
    messageId,
    ...(c.enRespuestaA ? { inReplyTo: c.enRespuestaA } : {}),
    ...(c.referencias?.length ? { references: c.referencias } : {})
  }
  const bruto: Buffer = await new MailComposer(opciones as any).compile().build()

  try {
    await transporteSmtp(config, contrasena).sendMail({ envelope: { from: config.direccion, to: c.para }, raw: bruto })
  } catch (e) {
    throw traducirError(e, 'enviar')
  }

  // Que quede en su carpeta de Enviados, como si lo hubiera escrito él. Gmail
  // lo guarda solo; en los demás se deja una copia (si falla, el correo ya ha
  // salido y no pasa nada).
  if (!/gmail|googlemail/i.test(config.smtp.host)) {
    const imap = clienteImap(config, contrasena)
    try {
      await imap.connect()
      const enviados = (await imap.list()).find((f: any) => f.specialUse === '\\Sent')
      if (enviados) await imap.append(enviados.path, bruto, ['\\Seen'])
    } catch {
      // sin copia en Enviados
    } finally {
      await imap.logout().catch(() => {})
    }
  }
  return messageId
}
