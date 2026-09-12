import { supabaseAdmin } from '@/utils/supabase/admin'

// Un mensaje que entra de un cliente, venga del proveedor que venga (Meta
// para WhatsApp, el buzón del negocio para el correo). Aquí se hace lo mismo para todos: identificar al contacto y su
// conversación, guardar el archivo si lo hay y guardar el mensaje.
export interface MensajeEntrante {
  canal: { id: string; tenant_id: string; branch_id: string; tipo: string }
  // En WhatsApp, el número con prefijo: '+34600111222'
  contactoExterno: string
  nombreContacto: string | null
  // Identificador del mensaje en el proveedor: si llega dos veces, se ignora
  mensajeExterno: string
  contenido: string
  // Un mensaje de WhatsApp trae como mucho un archivo; un correo, varios
  archivo?: { datos: Buffer; tipo: string; nombre: string } | null
  archivos?: { datos: Buffer; tipo: string; nombre: string }[]
  // Solo en correos: el asunto y el hilo (para contestar dentro del mismo hilo)
  asunto?: string | null
  referencias?: string[]
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
  const entrantes = [...(m.archivo ? [m.archivo] : []), ...(m.archivos || [])]
  const adjuntos: { ruta: string; tipo: string; nombre: string }[] = []
  let grandes = 0
  for (const archivo of entrantes) {
    if (archivo.datos.length > TAMANO_MAXIMO) { grandes++; continue }
    const extension = (archivo.nombre.includes('.') ? archivo.nombre.split('.').pop() : archivo.tipo.split('/').pop()?.split(';')[0]) || 'bin'
    const ruta = `${m.canal.tenant_id}/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`
    const { error: errSubida } = await supabaseAdmin.storage
      .from('whatsapp_media')
      .upload(ruta, archivo.datos, { contentType: archivo.tipo, upsert: false })
    if (errSubida) return { ok: false, error: `No se pudo guardar el archivo: ${errSubida.message}` }
    adjuntos.push({ ruta, tipo: archivo.tipo, nombre: archivo.nombre })
  }
  if (grandes) {
    contenido = `${contenido ? contenido + ' ' : ''}[El cliente ha enviado ${grandes === 1 ? 'un archivo' : `${grandes} archivos`} de más de 50 MB que no se ${grandes === 1 ? 'ha' : 'han'} podido guardar]`
  }
  // El primero va también en media_url/media_tipo: es lo que mira la IA
  const mediaUrl = adjuntos[0]?.ruta || null
  const mediaTipo = adjuntos[0]?.tipo || null

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
      ...(adjuntos.length ? { adjuntos } : {}),
      identificador_externo: m.mensajeExterno,
      ...(m.asunto !== undefined ? { asunto: m.asunto || null } : {}),
      ...(m.referencias?.length ? { email_referencias: m.referencias.join(' ') } : {})
    })
    .select('id')
    .single()

  if (errMensaje) {
    // Ya lo teníamos: el proveedor lo ha mandado dos veces
    if (errMensaje.code === '23505') return { ok: true, duplicado: true }
    return { ok: false, error: `No se pudo guardar el mensaje: ${errMensaje.message}` }
  }

  // Si la conversación estaba parada porque habían pasado las 24 h de
  // WhatsApp, el cliente acaba de escribir: la ventana se abre otra vez y la
  // IA ya puede contestar
  await supabaseAdmin
    .from('conversations')
    .update({ motivo_bloqueo: null, bloqueada_desde: null })
    .eq('id', conversationId)
    .eq('motivo_bloqueo', 'ventana_cerrada')

  await supabaseAdmin.from('channels').update({ ultima_actividad: new Date().toISOString() }).eq('id', m.canal.id)

  // "BAJA": el cliente no quiere más promociones. Manda sobre lo que diga la
  // tienda, y las automatizaciones de promoción lo respetan desde ya.
  if (/^\s*(baja|stop|no m[aá]s (avisos|mensajes|promociones))\s*[.!]*\s*$/i.test(contenido || '')) {
    await supabaseAdmin.from('contacts').update({ no_promociones: true }).eq('id', (contexto as any).contact_id)
  }

  // "SÍ" a una petición de confirmación de cita: queda anotado en la cita
  try {
    const { confirmarCitaPorRespuesta } = await import('@/lib/agenda/repasos')
    await confirmarCitaPorRespuesta(m.canal.tenant_id, m.canal.branch_id, (contexto as any).contact_id, contenido || '')
  } catch {
    // Nunca por esto se deja de guardar el mensaje
  }

  // Aviso a las automatizaciones que actúan cuando entra un mensaje
  // (etiquetar la conversación con datos de la tienda). Va a la cola de la
  // tienda y lo recoge el reloj: aquí no se hace esperar al proveedor.
  await encolarEventoInterno(m.canal.tenant_id, m.canal.branch_id, 'mensaje_entrante', conversationId, {
    conversation_id: conversationId,
    contact_id: (contexto as any).contact_id,
    canal: m.canal.tipo,
    identificador: m.contactoExterno,
    nombre: m.nombreContacto
  })

  return { ok: true, messageId: nuevo.id }
}

// Un evento interno para las automatizaciones, en la cola de la tienda de la
// sucursal (si no hay tienda conectada, no hay automatización que lo quiera)
export async function encolarEventoInterno(tenantId: string, branchId: string, evento: string, referencia: string, datos: Record<string, any>) {
  try {
    const { data: tienda } = await supabaseAdmin.from('tiendas').select('id').eq('branch_id', branchId).eq('estado', 'activo').maybeSingle()
    if (!tienda) return
    await supabaseAdmin.from('tienda_eventos').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      tienda_id: tienda.id,
      tipo: `interno:${evento}`,
      referencia: `${evento}:${referencia}:${Date.now()}`,
      datos
    })
  } catch {
    // Un evento interno que no se apunta no rompe la entrada del mensaje
  }
}
