'use server'

import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { crearNotificacion, notificarAAdminsDeOrganizacion } from '@/lib/notificaciones'

export async function getCasos(filtros?: { estado?: string, canal?: string, search?: string, agentesIds?: string[], dateRange?: { from: string, to: string }, sort?: 'asc' | 'desc' }) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const tenantId = auth.tenant_id
  const user = { id: auth.user_id }

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
      fecha_sla_asignado,
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
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: userDataObj } = await supabase.from('users').select('roles_personalizados(nivel, es_propietario)').eq('id', auth.user_id).single()
  const userData = { tenant_id: auth.tenant_id, ...userDataObj }
  const user = { id: auth.user_id }
  
  const roleData = Array.isArray(userData?.roles_personalizados) ? userData?.roles_personalizados[0] : userData?.roles_personalizados
  const current_user_level = roleData?.nivel ?? 5
  const current_user_is_owner = roleData?.es_propietario ?? false

  const { data: caso, error } = await supabase
    .from('cases')
    .select(`
      id,
      tipo,
      descripcion,
      estatus,
      fecha_apertura,
      sla_horas,
      fecha_sla_asignado,
      prioridad,
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

  return { 
    success: true, 
    data: { 
      ...caso, 
      mensajes, 
      etiquetas, 
      current_user_id: user.id,
      current_user_level,
      current_user_is_owner
    } 
  }
}

export async function tomarCaso(casoId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }
  const { data: caso } = await supabase.from('cases').select('conversation_id').eq('id', casoId).single()
  
  const { error } = await supabase
    .from('cases')
    .update({ estatus: 'atendiendo', agente_id: user.id })
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)

  if (caso?.conversation_id) {
    await supabase
      .from('conversations')
      .update({ ia_pausada: true, atendida_por: user.id })
      .eq('id', caso.conversation_id)
  }

  if (!error) {
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: userData?.tenant_id,
      user_id: user.id,
      accion: 'tomó el caso',
      tabla_afectada: 'cases',
      registro_id: casoId
    })
  }

  return { success: !error, error: error?.message }
}

export async function cerrarCaso(casoId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }
  
  const { data: caso } = await supabase.from('cases').select('conversation_id').eq('id', casoId).single()

  const { error } = await supabase
    .from('cases')
    .update({ estatus: 'resuelto', fecha_cierre: new Date().toISOString() })
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)

  if (caso?.conversation_id) {
    await supabase
      .from('conversations')
      .update({ estado: 'cerrada' })
      .eq('id', caso.conversation_id)
  }

  if (!error) {
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: userData?.tenant_id,
      user_id: user.id,
      accion: 'cerró el caso',
      tabla_afectada: 'cases',
      registro_id: casoId
    })
  }

  return { success: !error, error: error?.message }
}

export async function enviarMensajeAgente(conversationId: string, contenido: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }

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
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }
  const { data: caso } = await supabase.from('cases').select(`
    agente_id, 
    conversation_id, 
    contact_id, 
    branch_id,
    conversations ( canal )
  `).eq('id', casoId).single()
  
  const nuevoEstatus = caso?.agente_id ? 'atendiendo' : 'pendiente'

  // Buscar si el contacto ya tiene una conversación nueva y activa
  let nuevaActiva = null
  const canalViejo = Array.isArray(caso?.conversations) 
    ? (caso?.conversations[0] as any)?.canal 
    : (caso?.conversations as any)?.canal

  if (caso?.contact_id && caso?.branch_id && canalViejo) {
    const { data: activa } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', caso.contact_id)
      .eq('branch_id', caso.branch_id)
      .eq('canal', canalViejo)
      .eq('estado', 'activa')
      .maybeSingle()
    
    if (activa) {
      nuevaActiva = activa.id
    }
  }

  const caseUpdatePayload: any = { estatus: nuevoEstatus, fecha_cierre: null }
  if (nuevaActiva) {
    caseUpdatePayload.conversation_id = nuevaActiva
  }

  const { error } = await supabase
    .from('cases')
    .update(caseUpdatePayload)
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)

  // Si reenganchamos a una nueva conversación activa, pausamos su IA para que el agente pueda trabajar
  if (nuevaActiva) {
    await supabase
      .from('conversations')
      .update({ ia_pausada: true })
      .eq('id', nuevaActiva)
  }
  // IMPORTANTE: Si no había nuevaActiva, NO tocamos nada de la tabla conversations (la vieja se queda igual).

  if (!error) {
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: userData?.tenant_id,
      user_id: user.id,
      accion: 'reabrió el caso',
      tabla_afectada: 'cases',
      registro_id: casoId
    })
  }

  return { success: !error, error: error?.message }
}

export async function crearCasoDesdeConversacion(conversationId: string, agenteId: string | null) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }

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
      estatus: agenteId ? 'atendiendo' : 'pendiente',
      agente_id: agenteId,
      fecha_apertura: new Date().toISOString()
    }])
    .select('id')
    .single()

  if (!error) {
    let accionMsg = 'creó el caso (en cola)'
    if (agenteId === user.id) {
      accionMsg = 'creó el caso (asignado a sí mismo)'
    } else if (agenteId) {
      const { data: targetUser } = await supabase.from('users').select('nombre, email').eq('id', agenteId).single()
      accionMsg = `creó el caso (asignado a ${targetUser?.nombre || targetUser?.email || 'desconocido'})`
    }
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: userData?.tenant_id,
      user_id: user.id,
      accion: accionMsg,
      tabla_afectada: 'cases',
      registro_id: nuevoCaso.id
    })

    await notificarAAdminsDeOrganizacion(supabaseAdmin, userData.tenant_id, {
      tipo: 'conversacion_escalada',
      titulo: 'Conversación escalada a soporte',
      cuerpo: 'Se ha creado un nuevo caso a partir de una conversación que requiere atención.',
      url: `/dashboard/casos/${nuevoCaso.id}`,
      entidadId: nuevoCaso.id
    })
  }

  if (error) return { success: false, error: error.message }
  return { success: true, data: nuevoCaso }
}

export async function asignarCaso(casoId: string, agenteId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }

  const { error } = await supabase
    .from('cases')
    .update({ agente_id: agenteId })
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)

  if (!error) {
    let accionMsg = 'se asignó el caso a sí mismo'
    if (agenteId !== user.id) {
      const { data: targetUser } = await supabase.from('users').select('nombre, email').eq('id', agenteId).single()
      accionMsg = `asignó el caso a ${targetUser?.nombre || targetUser?.email || 'desconocido'}`
    }
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: userData?.tenant_id,
      user_id: user.id,
      accion: accionMsg,
      tabla_afectada: 'cases',
      registro_id: casoId
    })

    if (agenteId !== user.id) {
      await crearNotificacion(supabaseAdmin, {
        userId: agenteId,
        tenantId: userData?.tenant_id,
        tipo: 'caso_asignado',
        titulo: 'Nuevo caso asignado',
        cuerpo: `Se te ha asignado un nuevo caso en soporte.`,
        url: `/dashboard/casos/${casoId}`,
        entidadId: casoId
      })
    }
  }

  return { success: !error, error: error?.message }
}

export async function soltarCaso(casoId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }

  const { error } = await supabase
    .from('cases')
    .update({ agente_id: null })
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)

  if (!error) {
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: userData?.tenant_id,
      user_id: user.id,
      accion: 'soltó el caso',
      tabla_afectada: 'cases',
      registro_id: casoId
    })
  }

  return { success: !error, error: error?.message }
}

export async function getAgentesParaCasos() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id, branch_id: auth.branch_id }
  const user = { id: auth.user_id }

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

export async function actualizarPrioridadCaso(casoId: string, prioridad: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }
  
  const { data: anterior } = await supabase.from('cases').select('prioridad').eq('id', casoId).single()

  const { error } = await supabase
    .from('cases')
    .update({ prioridad })
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)

  if (!error) {
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: userData?.tenant_id,
      user_id: user.id,
      accion: `cambió la prioridad del caso de ${anterior?.prioridad || 'normal'} a ${prioridad}`,
      tabla_afectada: 'cases',
      registro_id: casoId
    })
  }

  return { success: !error, error: error?.message }
}

export async function actualizarSLACaso(casoId: string, sla_horas: number | null) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }

  const { data: anterior } = await supabase.from('cases').select('sla_horas').eq('id', casoId).single()

  const { error } = await supabase
    .from('cases')
    .update({ 
      sla_horas,
      fecha_sla_asignado: sla_horas ? new Date().toISOString() : null
    })
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)

  if (!error) {
    const { registrarAuditoria } = await import('@/lib/auditoria')
    await registrarAuditoria({
      tenant_id: userData?.tenant_id,
      user_id: user.id,
      accion: `cambió el SLA del caso de ${anterior?.sla_horas || 'ninguno'} a ${sla_horas || 'ninguno'}`,
      tabla_afectada: 'cases',
      registro_id: casoId
    })
  }

  return { success: !error, error: error?.message }
}
