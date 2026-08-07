'use server'

import { createClient } from '@/utils/supabase/server'

export async function getCasos(filtros?: { estado?: string, canal?: string, search?: string, agentesIds?: string[], dateRange?: { from: string, to: string }, sort?: 'asc' | 'desc' }) {
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
      prioridad,
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
    .order('fecha_apertura', { ascending: filtros?.sort === 'asc' })

  if (filtros?.estado && filtros.estado !== 'Todos') {
    query = query.eq('estatus', filtros.estado.toLowerCase())
  }
  
  if (filtros?.canal && filtros.canal !== 'Todos') {
    query = query.eq('contacts.canal', filtros.canal.toLowerCase())
  }

  if (filtros?.agentesIds && filtros.agentesIds.length > 0) {
    const ids = filtros.agentesIds.filter(id => id !== 'unassigned')
    const hasUnassigned = filtros.agentesIds.includes('unassigned')
    
    if (ids.length > 0 && hasUnassigned) {
      query = query.or(`agente_id.in.(${ids.join(',')}),agente_id.is.null`)
    } else if (ids.length > 0) {
      query = query.in('agente_id', ids)
    } else if (hasUnassigned) {
      query = query.is('agente_id', null)
    }
  }

  if (filtros?.dateRange?.from) {
    query = query.gte('fecha_apertura', filtros.dateRange.from)
  }
  if (filtros?.dateRange?.to) {
    // Add 23:59:59 to include the whole end day
    query = query.lte('fecha_apertura', filtros.dateRange.to + 'T23:59:59.999Z')
  }

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  let result = data || []
  
  // Post-filtro para fallbacks (Supabase a veces no filtra bien joins externos condicionales)
  if (filtros?.canal && filtros.canal !== 'Todos') {
    result = result.filter(c => {
      const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts
      return contact && contact.canal === filtros.canal!.toLowerCase()
    })
  }
  
  if (filtros?.search) {
    const s = filtros.search.toLowerCase()
    result = result.filter(c => {
      const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts
      return (
        c.id.toLowerCase().includes(s) ||
        (contact?.nombre && contact.nombre.toLowerCase().includes(s)) ||
        (contact?.identificador_canal && contact.identificador_canal.toLowerCase().includes(s)) ||
        (c.descripcion && c.descripcion.toLowerCase().includes(s))
      )
    })
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
      agente_id,
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

  return { success: true, data: { ...caso, mensajes, etiquetas, current_user_id: user.id } }
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

export async function reabrirCaso(casoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { error } = await supabase
    .from('cases')
    .update({ estatus: 'pendiente', agente_id: null, fecha_cierre: null })
    .eq('id', casoId)

  return { success: !error, error: error?.message }
}

export async function crearCasoDesdeConversacion(conversationId: string, agenteId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!userData?.tenant_id) return { success: false, error: 'Sin organización' }

  // 1. Obtener datos de la conversación para rellenar el caso
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('contact_id, branch_id')
    .eq('id', conversationId)
    .eq('tenant_id', userData.tenant_id)
    .single()

  if (convError || !conv) return { success: false, error: 'Conversación no encontrada' }

  // 2. Verificar que no exista ya un caso para esta conversación
  const { data: existingCase } = await supabase
    .from('cases')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', userData.tenant_id)
    .maybeSingle()

  if (existingCase) return { success: false, error: 'Esta conversación ya tiene un caso asociado' }

  // 3. Crear el caso
  const { data: nuevoCaso, error } = await supabase
    .from('cases')
    .insert([{
      tenant_id: userData.tenant_id,
      branch_id: conv.branch_id,
      contact_id: conv.contact_id,
      conversation_id: conversationId,
      tipo: 'normal',
      descripcion: 'Caso creado manualmente desde la conversación',
      estatus: 'pendiente',
      agente_id: agenteId,
      fecha_apertura: new Date().toISOString()
    }])
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: nuevoCaso }
}

export async function asignarCaso(casoId: string, agenteId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()

  const { error } = await supabase
    .from('cases')
    .update({ agente_id: agenteId })
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)

  return { success: !error, error: error?.message }
}

export async function soltarCaso(casoId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()

  const { error } = await supabase
    .from('cases')
    .update({ agente_id: null })
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)

  return { success: !error, error: error?.message }
}

export async function getAgentesParaCasos() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase.from('users').select('tenant_id, branch_id').eq('id', user.id).single()
  if (!userData?.tenant_id || !userData?.branch_id) return { success: false, error: 'Sin sucursal' }

  const { data: users, error } = await supabase
    .from('users')
    .select('id, nombre, email, roles_personalizados(es_propietario, permisos)')
    .eq('tenant_id', userData.tenant_id)
    .eq('branch_id', userData.branch_id)
    .eq('activo', true)

  if (error) return { success: false, error: error.message }

  // Filtrar los que tengan acceso a la sección de casos
  const agentesValidos = (users || []).filter((u: any) => {
    const rol = Array.isArray(u.roles_personalizados) ? u.roles_personalizados[0] : u.roles_personalizados
    if (!rol) return false
    if (rol.es_propietario) return true
    
    // Verificar permisos
    const permisos = rol.permisos || []
    const pCasos = permisos.find((p: any) => p.seccion === 'casos')
    return pCasos && pCasos.nivel !== 'ninguno'
  })

  return { success: true, data: agentesValidos }
}

