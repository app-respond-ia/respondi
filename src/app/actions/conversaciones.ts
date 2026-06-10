'use server'

import { createClient } from '@/utils/supabase/server'

export async function getConversaciones(filtros?: { estado?: string, canal?: string, search?: string, iaPausada?: boolean }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  // Obtener tenant_id del usuario
  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const tenantId = userData?.tenant_id
  if (!tenantId) return { success: false, error: 'No tenant' }

  let query = supabase
    .from('conversations')
    .select(`
      id,
      estado,
      canal,
      ia_pausada,
      fecha_inicio,
      fecha_ultimo_mensaje,
      resumen,
      contacts:contact_id (nombre, canal, identificador_canal),
      conversation_tags (
        message_categories (nombre, color)
      )
    `)
    .eq('tenant_id', tenantId)
    .order('fecha_ultimo_mensaje', { ascending: false, nullsFirst: false })

  if (filtros?.estado && filtros.estado !== 'Todas') {
    const est = filtros.estado === 'Activas' ? 'activa' : filtros.estado === 'Cerradas' ? 'cerrada' : null
    if (est) query = query.eq('estado', est)
  }
  
  if (filtros?.canal && filtros.canal !== 'Todos') {
    query = query.eq('canal', filtros.canal.toLowerCase())
  }

  if (filtros?.iaPausada) {
    query = query.eq('ia_pausada', true)
  }

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  let result = data || []
  
  if (filtros?.search) {
    const s = filtros.search.toLowerCase()
    result = result.filter(c => {
      const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts
      return (
        (contact?.nombre && contact.nombre.toLowerCase().includes(s)) ||
        (contact?.identificador_canal && contact.identificador_canal.toLowerCase().includes(s)) ||
        (c.resumen && c.resumen.toLowerCase().includes(s))
      )
    })
  }

  return { success: true, data: result }
}

export async function getConversacionDetalle(convId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const tenantId = userData?.tenant_id

  const { data: conv, error } = await supabase
    .from('conversations')
    .select(`
      id,
      estado,
      canal,
      ia_pausada,
      fecha_inicio,
      fecha_ultimo_mensaje,
      resumen,
      contacts:contact_id (nombre, canal, identificador_canal),
      conversation_tags (
        message_categories (nombre, color)
      )
    `)
    .eq('id', convId)
    .eq('tenant_id', tenantId)
    .single()

  if (error || !conv) return { success: false, error: error?.message || 'Conversación no encontrada' }

  const { data: msgs } = await supabase
    .from('messages')
    .select('id, remitente, contenido, timestamp')
    .eq('conversation_id', convId)
    .eq('tenant_id', tenantId)
    .order('timestamp', { ascending: true })

  return { 
    success: true, 
    data: { 
      ...conv, 
      mensajes: msgs || [],
      etiquetas: conv.conversation_tags?.map((t: any) => t.message_categories) || []
    } 
  }
}

export async function pausarIA(convId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { error } = await supabase
    .from('conversations')
    .update({ ia_pausada: true, atendida_por: user.id })
    .eq('id', convId)

  return { success: !error, error: error?.message }
}

export async function reanudarIA(convId: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('conversations')
    .update({ ia_pausada: false, atendida_por: null })
    .eq('id', convId)

  return { success: !error, error: error?.message }
}

export async function enviarMensajeAgenteConv(convId: string, contenido: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()

  const { error } = await supabase
    .from('messages')
    .insert({
      tenant_id: userData?.tenant_id,
      conversation_id: convId,
      remitente: 'agente',
      contenido: contenido
    })

  // Actualizar la fecha del último mensaje
  await supabase
    .from('conversations')
    .update({ fecha_ultimo_mensaje: new Date().toISOString() })
    .eq('id', convId)

  return { success: !error, error: error?.message }
}
