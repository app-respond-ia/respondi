import { supabaseAdmin } from '@/utils/supabase/admin'

// Un mensaje que entra de un cliente, venga del proveedor que venga (hoy,
// Meta). Aquí se hace lo mismo para todos: identificar al contacto y su
// conversación, guardar el archivo si lo hay y guardar el mensaje.
export interface MensajeEntrante {
  canal: { id: string; tenant_id: string; branch_id: string; tipo: string }
  // En WhatsApp, el número con prefijo: '+34600111222'
  contactoExterno: string
  nombreContacto: string | null
  // Identificador del mensaje en el proveedor: si llega dos veces, se ignora
  mensajeExterno: string
  contenido: string
  archivo?: { datos: Buffer; tipo: string; nombre: string } | null
}

const TAMANO_MAXIMO = 50 * 1024 * 1024

export async function registrarMensajeEntrante(m: MensajeEntrante): Promise<{ ok: boolean; duplicado?: boolean; messageId?: string; error?: string }> {
  // 1. Contacto y conversación (la base de datos lo resuelve de una vez)
  const { data: contexto, error: errContexto } = await supabaseAdmin.rpc('resolve_incoming_message_context', {
    p_tenant_id: m.canal.tenant_id,
    p_branch_id: m.canal.branch_id,
    p_canal: m.canal.tipo,
    p_identificador_canal: m.contactoExterno,
    p_nombre_contacto: m.nombreContacto || 'Desconocido'
  })
  if (errContexto || !contexto) return { ok: false, error: `No se pudo resolver el contacto: ${errContexto?.message}` }
  const conversationId = (contexto as any).conversation_id

  // 2. El archivo, si lo hay, al almacenamiento privado. Se guarda la ruta, no
  //    un enlace firmado: el enlace caduca y rompería el historial del chat.
  let contenido = m.contenido
  let mediaUrl: string | null = null
  let mediaTipo: string | null = null
  if (m.archivo) {
    if (m.archivo.datos.length > TAMANO_MAXIMO) {
      contenido = `${contenido ? contenido + ' ' : ''}[El cliente ha enviado un archivo de más de 50 MB que no se ha podido guardar]`
    } else {
      const extension = (m.archivo.nombre.includes('.') ? m.archivo.nombre.split('.').pop() : m.archivo.tipo.split('/').pop()?.split(';')[0]) || 'bin'
      const ruta = `${m.canal.tenant_id}/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`
      const { error: errSubida } = await supabaseAdmin.storage
        .from('whatsapp_media')
        .upload(ruta, m.archivo.datos, { contentType: m.archivo.tipo, upsert: false })
      if (errSubida) return { ok: false, error: `No se pudo guardar el archivo: ${errSubida.message}` }
      mediaUrl = ruta
      mediaTipo = m.archivo.tipo
    }
  }

  // 3. El mensaje
  const { data: nuevo, error: errMensaje } = await supabaseAdmin
    .from('messages')
    .insert({
      tenant_id: m.canal.tenant_id,
      conversation_id: conversationId,
      remitente: 'cliente',
      contenido,
      media_url: mediaUrl,
      media_tipo: mediaTipo,
      identificador_externo: m.mensajeExterno
    })
    .select('id')
    .single()

  if (errMensaje) {
    // Ya lo teníamos: el proveedor lo ha mandado dos veces
    if (errMensaje.code === '23505') return { ok: true, duplicado: true }
    return { ok: false, error: `No se pudo guardar el mensaje: ${errMensaje.message}` }
  }

  await supabaseAdmin.from('channels').update({ ultima_actividad: new Date().toISOString() }).eq('id', m.canal.id)
  return { ok: true, messageId: nuevo.id }
}
