import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { leerCredencialesMeta, enviarTexto, enviarPlantilla, subirArchivoAMeta, ErrorMeta } from '@/lib/canales/meta'
import { enviarCorreo, leerContrasenaCorreo, ErrorCorreo, type ConfigCorreo } from '@/lib/canales/correo'

// Saca hacia el cliente un mensaje ya guardado (de la IA, de un agente o un
// aviso automático) por el canal de su sucursal, y apunta cómo ha ido en el
// propio mensaje (`estado_envio`), que es lo que ve el agente en Chats.
//
// Antes esto no existía: las respuestas se guardaban en la base de datos y se
// dejaba una anotación de "simulación", pero no salían hacia el WhatsApp de
// nadie.
export const MAX_INTENTOS_ENVIO = 3

type Resultado = { estado: 'enviado' | 'fallido' | 'reintentar' | 'omitido'; error?: string }

async function apuntar(messageId: string, cambios: Record<string, any>) {
  await supabaseAdmin.from('messages').update(cambios).eq('id', messageId)
}

export async function enviarMensajeSaliente(messageId: string): Promise<Resultado> {
  const { data: msg } = await supabaseAdmin
    .from('messages')
    .select('id, tenant_id, conversation_id, remitente, contenido, plantilla, estado_envio, intentos_envio, conversations(branch_id, canal, contacts(identificador_canal))')
    .eq('id', messageId)
    .maybeSingle()

  if (!msg || msg.remitente === 'cliente') return { estado: 'omitido' }
  // Ya salió (o ya se dio por perdido): no se manda dos veces
  if (['enviado', 'entregado', 'leido'].includes(msg.estado_envio || '')) return { estado: 'omitido' }

  const conv: any = Array.isArray(msg.conversations) ? msg.conversations[0] : msg.conversations
  const contacto: any = Array.isArray(conv?.contacts) ? conv.contacts[0] : conv?.contacts
  const intentos = (msg.intentos_envio || 0) + 1

  const fallar = async (error: string, reintentable = false): Promise<Resultado> => {
    const estado = reintentable && intentos < MAX_INTENTOS_ENVIO ? 'reintentar' : 'fallido'
    await apuntar(messageId, {
      estado_envio: estado,
      error_envio: estado === 'fallido' && reintentable ? `No se ha podido enviar tras ${intentos} intentos: ${error}` : error,
      intentos_envio: intentos,
      ultimo_intento_envio: new Date().toISOString()
    })
    return { estado, error }
  }

  if (!conv || !contacto?.identificador_canal || !msg.contenido?.trim()) {
    return fallar('Falta el destinatario o el texto del mensaje.')
  }

  const { data: canal } = await supabaseAdmin
    .from('channels')
    .select('id, metodo, estado, meta_phone_number_id, configuracion')
    .eq('tenant_id', msg.tenant_id)
    .eq('branch_id', conv.branch_id)
    .eq('tipo', conv.canal)
    .neq('estado', 'desconectado')
    .maybeSingle()

  if (!canal) return fallar(`No hay ningún canal de ${conv.canal} conectado en esta sucursal.`)
  if (canal.metodo === 'imap_smtp') return enviarPorCorreo(msg, conv, contacto, canal, intentos, fallar)
  if (canal.metodo !== 'meta_oficial') return fallar('Este canal todavía no puede enviar mensajes desde Respondi (solo está disponible la conexión oficial de Meta).')
  if (canal.estado !== 'activo' || !canal.meta_phone_number_id) return fallar('El canal de WhatsApp no está activo. Revisa la conexión en Canales.')

  let credenciales
  try {
    credenciales = await leerCredencialesMeta(canal.id)
  } catch (e: any) {
    return fallar(e?.message || 'No se han podido leer las claves guardadas.', true)
  }
  if (!credenciales) return fallar('El canal de WhatsApp no tiene las claves de Meta guardadas. Revisa la conexión en Canales.')

  // Marcado antes de llamar a Meta: si el proceso se corta a medias, el cron de
  // reintentos lo encuentra "pendiente" y lo vuelve a intentar.
  await apuntar(messageId, { estado_envio: 'pendiente', intentos_envio: intentos, ultimo_intento_envio: new Date().toISOString() })

  try {
    // Una plantilla sale como plantilla (con sus huecos rellenos); lo demás,
    // como texto. `contenido` de una plantilla es solo para enseñarla en Chats.
    const plantilla: any = msg.plantilla
    let idExterno: string
    if (plantilla?.nombre) {
      // La foto, el vídeo o el documento de la cabecera se sube a Meta en el
      // momento de enviar (su identificador dura 30 días, y en un reintento
      // podría haber caducado)
      let cabeceraArchivo = null
      if (plantilla.cabeceraArchivo?.ruta) {
        const a = plantilla.cabeceraArchivo
        const { data: archivo, error: errArchivo } = await supabaseAdmin.storage.from('whatsapp_media').download(a.ruta)
        if (errArchivo || !archivo) return fallar('No se ha encontrado el archivo de la plantilla. Vuelve a enviarla adjuntándolo de nuevo.')
        const idEnMeta = await subirArchivoAMeta(canal.meta_phone_number_id, credenciales.access_token, {
          datos: Buffer.from(await archivo.arrayBuffer()),
          tipo: a.tipo || 'application/octet-stream',
          nombre: a.nombre || 'archivo'
        })
        cabeceraArchivo = { formato: a.formato, id: idEnMeta, nombre: a.nombre }
      }
      idExterno = await enviarPlantilla(canal.meta_phone_number_id, credenciales.access_token, contacto.identificador_canal, {
        nombre: plantilla.nombre,
        idioma: plantilla.idioma,
        parametros: Array.isArray(plantilla.parametros) ? plantilla.parametros : [],
        parametrosCabecera: Array.isArray(plantilla.parametrosCabecera) ? plantilla.parametrosCabecera : [],
        cabeceraArchivo,
        botones: Array.isArray(plantilla.botones) ? plantilla.botones : []
      })
    } else {
      idExterno = await enviarTexto(canal.meta_phone_number_id, credenciales.access_token, contacto.identificador_canal, msg.contenido)
    }
    await apuntar(messageId, { estado_envio: 'enviado', error_envio: null, identificador_externo: idExterno })
    return { estado: 'enviado' }
  } catch (e: any) {
    if (e instanceof ErrorMeta) {
      // Fallos propios de las plantillas (códigos 132xxx de Meta)
      if ((msg.plantilla as any)?.nombre && e.codigo && e.codigo >= 132000 && e.codigo < 133000) {
        const textos: Record<number, string> = {
          132000: 'El número de huecos rellenados no coincide con la plantilla.',
          132001: 'La plantilla no existe en Meta (o no en ese idioma). Actualiza la lista en Canales → Plantillas.',
          132007: 'Meta ha rechazado el texto por sus normas.',
          132015: 'Meta ha pausado esta plantilla por su calidad.',
          132016: 'Meta ha desactivado esta plantilla.'
        }
        return fallar(textos[e.codigo] || `Meta no ha aceptado la plantilla: ${e.message}`)
      }
      if (e.fueraDeVentana) {
        return fallar('Han pasado más de 24 h desde el último mensaje del cliente: WhatsApp solo deja escribirle con una plantilla aprobada.')
      }
      if (e.clavesInvalidas) {
        await supabaseAdmin.from('channels').update({ estado: 'error', ultimo_error: `Meta ha rechazado las claves: ${e.message}` }).eq('id', canal.id)
        return fallar('Meta ha rechazado las claves del canal (puede que el token haya caducado). Hay que actualizarlas en Canales.')
      }
      return fallar(e.message, e.reintentable)
    }
    await registrarError({
      origen: 'api_meta',
      descripcion: 'Fallo inesperado al enviar un mensaje por WhatsApp',
      stacktrace: JSON.stringify({ messageId, message: e?.message }),
      tenant_id: msg.tenant_id
    })
    return fallar(e?.message || 'Error inesperado', true)
  }
}

// Correo: la respuesta sale por el servidor del negocio, dentro del hilo del
// último correo del cliente ("Re: su asunto"), para que su programa de correo
// la agrupe con lo anterior
async function enviarPorCorreo(
  msg: any, conv: any, contacto: any, canal: any, intentos: number,
  fallar: (error: string, reintentable?: boolean) => Promise<Resultado>
): Promise<Resultado> {
  const config = canal.configuracion as ConfigCorreo
  if (canal.estado !== 'activo' || !config?.smtp) return fallar('El canal de correo no está activo. Revisa la conexión en Canales.')
  let contrasena
  try {
    contrasena = await leerContrasenaCorreo(canal.id)
  } catch (e: any) {
    return fallar(e?.message || 'No se ha podido leer la contraseña guardada.', true)
  }
  if (!contrasena) return fallar('El canal de correo no tiene la contraseña guardada. Vuelve a conectarlo en Canales.')

  const { data: hilo } = await supabaseAdmin
    .from('messages')
    .select('identificador_externo, asunto, email_referencias')
    .eq('conversation_id', msg.conversation_id)
    .eq('remitente', 'cliente')
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle()
  const base = (hilo?.asunto || '').trim()
  const asunto = base ? (/^(re|aw|rv|res)\s*:/i.test(base) ? base : `Re: ${base}`) : `Mensaje de ${config.nombre_remitente || config.direccion}`
  const referencias = (hilo?.email_referencias || '').split(/\s+/).filter(Boolean)
  const enRespuestaA = hilo?.identificador_externo && /^<.+>$/.test(hilo.identificador_externo) ? hilo.identificador_externo : null

  await apuntar(msg.id, { estado_envio: 'pendiente', intentos_envio: intentos, ultimo_intento_envio: new Date().toISOString() })
  try {
    const messageId = await enviarCorreo(config, contrasena, {
      para: contacto.identificador_canal,
      asunto,
      texto: msg.contenido,
      enRespuestaA,
      referencias
    })
    await apuntar(msg.id, {
      estado_envio: 'enviado',
      error_envio: null,
      identificador_externo: messageId,
      asunto,
      email_referencias: [...referencias, messageId].join(' ')
    })
    return { estado: 'enviado' }
  } catch (e: any) {
    if (e instanceof ErrorCorreo) {
      if (e.tipo === 'credenciales') {
        await supabaseAdmin.from('channels').update({ estado: 'error', ultimo_error: e.message }).eq('id', canal.id)
      }
      return fallar(e.message, e.reintentable)
    }
    await registrarError({
      origen: 'app',
      descripcion: 'Fallo inesperado al enviar un correo',
      stacktrace: JSON.stringify({ messageId: msg.id, message: e?.message }),
      tenant_id: msg.tenant_id
    })
    return fallar(e?.message || 'Error inesperado', true)
  }
}
