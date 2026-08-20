'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

import { getAuthContext } from '@/lib/auth-context'

export async function getConversaciones(filtros?: { 
  estado?: string, 
  canal?: string, 
  search?: string, 
  iaPausada?: string, 
  tieneCaso?: string, 
  asignadosAMi?: boolean, 
  agentesIds?: string[], 
  etiquetasIds?: string[], 
  dateRange?: { from: string, to: string }, 
  sort?: 'asc' | 'desc' 
}) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  let query = supabase
    .from('conversations')
    .select(`
      *,
      contacts (
        nombre,
        identificador_canal,
        canal
      ),
      cases (
        id,
        estatus,
        agente_id,
        agente:agente_id (nombre)
      ),
      messages (
        contenido
      ),
      conversation_tags (
        message_categories (id, nombre, color)
      )
    `)
    .eq('branch_id', auth.branch_id)
    .order('timestamp', { foreignTable: 'messages', ascending: false })
    .limit(1, { foreignTable: 'messages' })
    .order('fecha_ultimo_mensaje', { ascending: filtros?.sort === 'asc', nullsFirst: false })

  if (filtros?.estado && filtros.estado !== 'Todas') {
    const est = filtros.estado === 'Activas' ? 'activa' : filtros.estado === 'Cerradas' ? 'cerrada' : null
    if (est) query = query.eq('estado', est)
  }

  if (filtros?.canal && filtros.canal !== 'Todos') {
    query = query.eq('canal', filtros.canal.toLowerCase())
  }

  if (filtros?.iaPausada && filtros.iaPausada !== 'Todas') {
    query = query.eq('ia_pausada', filtros.iaPausada === 'Pausada')
  }

  if (filtros?.dateRange?.from) {
    query = query.gte('fecha_ultimo_mensaje', filtros.dateRange.from)
  }
  if (filtros?.dateRange?.to) {
    query = query.lte('fecha_ultimo_mensaje', filtros.dateRange.to + 'T23:59:59.999Z')
  }

  const { data: rawData, error } = await query

  if (error) return { success: false, error: error.message }
  
  let result = rawData || []

  // Memory filtering for complex joins
  if (filtros?.tieneCaso && filtros.tieneCaso !== 'Todas') {
    result = result.filter(c => {
      const hasCase = c.cases && c.cases.length > 0
      return filtros.tieneCaso === 'Con caso' ? hasCase : !hasCase
    })
  }

  if (filtros?.asignadosAMi) {
    result = result.filter(c => {
      const isAgent = c.cases?.some((cas: any) => cas.agente_id === auth.user_id)
      return isAgent
    })
  }

  if (filtros?.agentesIds && filtros.agentesIds.length > 0) {
    result = result.filter(c => {
      const cas = c.cases && c.cases.length > 0 ? c.cases[0] : null
      if (!cas) return false // Filter only applies to those with a case
      if (!cas.agente_id) return filtros.agentesIds!.includes('unassigned')
      return filtros.agentesIds!.includes(cas.agente_id)
    })
  }

  if (filtros?.etiquetasIds && filtros.etiquetasIds.length > 0) {
    result = result.filter(c => {
      if (!c.conversation_tags || c.conversation_tags.length === 0) return false
      return c.conversation_tags.some((t: any) => 
        t.message_categories && filtros.etiquetasIds!.includes(t.message_categories.id)
      )
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
        (contact?.canal && contact.canal.toLowerCase().includes(s))
      )
    })
  }

  return { success: true, data: { conversaciones: result } }
}

export async function getEtiquetasTenant() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('message_categories')
    .select('id, nombre, color')
    .eq('tenant_id', auth.tenant_id)
    .order('nombre')

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function getMensajes(conversationId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Check tenant
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('tenant_id', auth.tenant_id)
    .single()
    
  if (!conv) return { success: false, error: 'Conversación no encontrada' }

  const { data: mensajes, error } = await supabase
    .from('messages')
    .select('*, users(nombre)')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data: { mensajes } }
}

export async function toggleIAPausa(conversationId: string, pausada: boolean) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: conversacion, error: errConv } = await supabase
    .from('conversations')
    .select('canal')
    .eq('id', conversationId)
    .eq('branch_id', auth.branch_id)
    .single()

  if (errConv) {
    return { success: false, error: errConv.message }
  }
  if (!conversacion) {
    return { success: false, error: 'Conversación no encontrada.' }
  }

  // Verificar que el canal está activo
  const { data: canales, error: errCanales } = await supabase
    .from('channels')
    .select('estado')
    .eq('tipo', conversacion.canal)
    .eq('branch_id', auth.branch_id)
    .limit(1)

  const canal = canales?.[0]
  if (errCanales) {
    return { success: false, error: errCanales.message }
  }
  if (!canal || canal.estado !== 'activo') {
    return { success: false, error: 'El canal de esta conversación no está activo.' }
  }

  const { data, error } = await supabase
    .from('conversations')
    .update({ 
      ia_pausada: pausada,
      atendida_por: pausada ? auth.user_id : null 
    })
    .eq('id', conversationId)
    .eq('branch_id', auth.branch_id)
    .select(`
      *,
      contacts (
        nombre,
        identificador_canal,
        canal
      )
    `)
    .single()

  if (!error) {
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: auth.tenant_id,
      user_id: auth.user_id,
      accion: pausada ? 'pausó la IA en la conversación' : 'reanudó la IA en la conversación',
      tabla_afectada: 'conversations',
      registro_id: conversationId
    })
  }

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function cerrarConversacion(conversationId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('conversations')
    .update({ 
      estado: 'cerrada',
      fecha_cierre: new Date().toISOString()
    })
    .eq('id', conversationId)
    .eq('branch_id', auth.branch_id)
    .select(`
      *,
      contacts (
        nombre,
        identificador_canal,
        canal
      )
    `)
    .single()

  if (!error) {
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: auth.tenant_id,
      user_id: auth.user_id,
      accion: 'cerró la conversación',
      tabla_afectada: 'conversations',
      registro_id: conversationId
    })
  }

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function reabrirConversacion(conversationId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('conversations')
    .update({ 
      estado: 'activa',
      fecha_cierre: null,
      ia_pausada: false
    })
    .eq('id', conversationId)
    .eq('branch_id', auth.branch_id)
    .select(`
      *,
      contacts (
        nombre,
        identificador_canal,
        canal
      )
    `)
    .single()

  if (!error) {
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: auth.tenant_id,
      user_id: auth.user_id,
      accion: 'reabrió la conversación',
      tabla_afectada: 'conversations',
      registro_id: conversationId
    })
  }

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function getContextoChat(conversationId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  
  if (auth.error) {
    return { success: false, error: auth.error }
  }

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      estado,
      canal,
      ia_pausada,
      contacts (
        id,
        nombre,
        canal,
        identificador_canal
      ),
      conversation_tags (
        message_categories (
          id,
          nombre,
          color
        )
      ),
      cases (
        id,
        estatus,
        prioridad,
        fecha_apertura,
        agente:agente_id (
          id,
          nombre,
          avatar_url
        )
      )
    `)
    .eq('id', conversationId)
    .eq('tenant_id', auth.tenant_id)
    .single()

  if (error) return { success: false, error: error.message }
  
  // Format the output specifically for the frontend
  const contexto = {
    ...data,
    etiquetas: data.conversation_tags?.map((t: any) => t.message_categories) || [],
    caso_asociado: data.cases && data.cases.length > 0 ? {
      ...data.cases[0],
      agente: data.cases[0].agente
    } : null
  }
  
  return { success: true, data: contexto }
}
