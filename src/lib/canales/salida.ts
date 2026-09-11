import { supabaseAdmin } from '@/utils/supabase/admin'
import { registrarError } from '@/lib/errores'
import { leerCredencialesMeta, enviarTexto, ErrorMeta } from '@/lib/canales/meta'

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
    .select('id, tenant_id, conversation_id, remitente, contenido, estado_envio, intentos_envio, conversations(branch_id, canal, contacts(identificador_canal))')
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
    .select('id, metodo, estado, meta_phone_number_id')
    .eq('tenant_id', msg.tenant_id)
    .eq('branch_id', conv.branch_id)
    .eq('tipo', conv.canal)
    .neq('estado', 'desconectado')
    .maybeSingle()

  if (!canal) return fallar(`No hay ningún canal de ${conv.canal} conectado en esta sucursal.`)
  if (canal.metodo !== 'meta_oficial') return fallar('Este canal todavía no puede enviar mensajes desde Respondi (solo está disponible la conexión oficial de Meta).')
  if (canal.estado !== 'activo' || !canal.meta_phone_number_id) return fallar('El canal de WhatsApp no está activo. Revisa la conexión en Canales.')

  const credenciales = await leerCredencialesMeta(canal.id)
  if (!credenciales) return fallar('El canal de WhatsApp no tiene las claves de Meta guardadas. Revisa la conexión en Canales.')

  // Marcado antes de llamar a Meta: si el proceso se corta a medias, el cron de
  // reintentos lo encuentra "pendiente" y lo vuelve a intentar.
  await apuntar(messageId, { estado_envio: 'pendiente', intentos_envio: intentos, ultimo_intento_envio: new Date().toISOString() })

  try {
    const idExterno = await enviarTexto(canal.meta_phone_number_id, credenciales.access_token, contacto.identificador_canal, msg.contenido)
    await apuntar(messageId, { estado_envio: 'enviado', error_envio: null, identificador_externo: idExterno })
    return { estado: 'enviado' }
  } catch (e: any) {
    if (e instanceof ErrorMeta) {
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
