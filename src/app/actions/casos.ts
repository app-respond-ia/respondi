'use server'

import { createClient } from '@/utils/supabase/server'

export async function getCasos(filtros?: { estado?: string, canal?: string, search?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  // Obtener tenant_id del usuario
  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const tenantId = userData?.tenant_id
  if (!tenantId) return { success: false, error: 'No tenant' }

  let query = supabase
    .from('cases')
    .select(`
      id,
      tipo,
      descripcion,
      estatus,
      fecha_apertura,
      sla_horas,
      contacts:contact_id (nombre, canal, identificador_canal),
      agente:agente_id (nombre),
      conversations:conversation_id (
        id,
        conversation_tags (
          message_categories (nombre, color)
        )
      )
    `)
    .eq('tenant_id', tenantId)
    .order('fecha_apertura', { ascending: false })

  if (filtros?.estado && filtros.estado !== 'Todos') {
    query = query.eq('estatus', filtros.estado.toLowerCase())
  }
  
  if (filtros?.canal && filtros.canal !== 'Todos') {
    query = query.eq('contacts.canal', filtros.canal.toLowerCase())
  }

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  let result = data || []
  
  // Post-filtro para fallbacks (Supabase a veces no filtra bien joins externos condicionales)
  if (filtros?.canal && filtros.canal !== 'Todos') {
    result = result.filter(c => c.contacts && c.contacts.canal === filtros.canal.toLowerCase())
  }
  
  if (filtros?.search) {
    const s = filtros.search.toLowerCase()
    result = result.filter(c => 
      c.id.toLowerCase().includes(s) || 
      (c.contacts?.nombre && c.contacts.nombre.toLowerCase().includes(s)) ||
      (c.descripcion && c.descripcion.toLowerCase().includes(s))
    )
  }

  return { success: true, data: result }
}

export async function getCasoDetalle(casoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  
  const { data: caso, error } = await supabase
    .from('cases')
    .select(`
      id,
      tipo,
      descripcion,
      estatus,
      fecha_apertura,
      sla_horas,
      contacts:contact_id (nombre, canal, identificador_canal),
      agente:agente_id (nombre),
      conversation_id
    `)
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)
    .single()

  if (error || !caso) return { success: false, error: error?.message || 'Caso no encontrado' }

  let mensajes: any[] = []
  let etiquetas: any[] = []
  
  if (caso.conversation_id) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, remitente, contenido, timestamp')
      .eq('conversation_id', caso.conversation_id)
      .eq('tenant_id', userData?.tenant_id)
      .order('timestamp', { ascending: true })
    
    mensajes = msgs || []

    const { data: tags } = await supabase
      .from('conversation_tags')
      .select('message_categories(nombre, color)')
      .eq('conversation_id', caso.conversation_id)

    etiquetas = tags?.map(t => t.message_categories) || []
  }

  return { success: true, data: { ...caso, mensajes, etiquetas } }
}

export async function tomarCaso(casoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: caso } = await supabase.from('cases').select('conversation_id').eq('id', casoId).single()
  
  const { error } = await supabase
    .from('cases')
    .update({ estatus: 'atendiendo', agente_id: user.id })
    .eq('id', casoId)

  if (caso?.conversation_id) {
    await supabase
      .from('conversations')
      .update({ ia_pausada: true, atendida_por: user.id })
      .eq('id', caso.conversation_id)
  }

  return { success: !error, error: error?.message }
}

export async function cerrarCaso(casoId: string) {
  const supabase = await createClient()
  
  const { data: caso } = await supabase.from('cases').select('conversation_id').eq('id', casoId).single()

  const { error } = await supabase
    .from('cases')
    .update({ estatus: 'resuelto', fecha_cierre: new Date().toISOString() })
    .eq('id', casoId)

  if (caso?.conversation_id) {
    await supabase
      .from('conversations')
      .update({ estado: 'cerrada' })
      .eq('id', caso.conversation_id)
  }

  return { success: !error, error: error?.message }
}

export async function enviarMensajeAgente(conversationId: string, contenido: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()

  const { error } = await supabase
    .from('messages')
    .insert({
      tenant_id: userData?.tenant_id,
      conversation_id: conversationId,
      remitente: 'agente',
      contenido: contenido
    })

  return { success: !error, error: error?.message }
}
