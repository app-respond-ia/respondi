'use server'

import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { crearNotificacion, notificarAAdminsDeOrganizacion } from '@/lib/notificaciones'
import { after } from 'next/server'
import { cerrarConversacionYCaso, resumirConversacionCerrada } from '@/lib/conversaciones/cierre'
import { casoTerminado, DESCRIPCION_CASO_MANUAL } from '@/lib/casos/estados'

// Un caso solo se ve y se toca desde la tienda a la que pertenece.
async function casoDeLaTienda(supabase: any, auth: any, casoId: string, campos: string): Promise<any> {
  const { data } = await supabase
    .from('cases')
    .select(campos)
    .eq('id', casoId)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()
  return data
}

// Quién puede llevar casos en la tienda activa: el propietario o un
// administrador, y quien tenga asignada esta tienda y permiso de Casos. Antes
// se miraba la "tienda por defecto" de cada usuario, que no sirve para quien
// trabaja en varias.
async function agentesDeLaTienda(supabase: any, auth: any) {
  const [{ data: usuarios, error }, { data: asignados }] = await Promise.all([
    supabase
      .from('users')
      .select('id, nombre, email, rol, roles_personalizados(es_propietario, permisos)')
      .eq('tenant_id', auth.tenant_id)
      .eq('activo', true),
    supabase
      .from('user_branches')
      .select('user_id')
      .eq('branch_id', auth.branch_id)
  ])

  if (error) return { error: error.message, agentes: [] as any[] }

  const enLaTienda = new Set((asignados || []).map((a: any) => a.user_id))
  const agentes = (usuarios || []).filter((u: any) => {
    const rol = Array.isArray(u.roles_personalizados) ? u.roles_personalizados[0] : u.roles_personalizados
    if (u.rol === 'admin' || rol?.es_propietario) return true
    if (!rol || !enLaTienda.has(u.id)) return false
    const pCasos = (rol.permisos || []).find((p: any) => p.seccion === 'casos')
    return !!pCasos && pCasos.nivel !== 'ninguno'
  }).map((u: any) => ({ id: u.id, nombre: u.nombre, email: u.email, roles_personalizados: u.roles_personalizados }))

  return { error: null, agentes }
}

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
    // Cada tienda ve solo sus casos
    .eq('branch_id', auth.branch_id)
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
    .eq('branch_id', auth.branch_id)
    .single()

  if (error || !caso) return { success: false, error: error?.message || 'Caso no encontrado' }

  let mensajes: any[] = []
  let etiquetas: any[] = []
  
  if (caso.conversation_id) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, remitente, contenido, timestamp, media_url, media_tipo, asunto')
      .eq('conversation_id', caso.conversation_id)
      .eq('tenant_id', userData?.tenant_id)
      .order('timestamp', { ascending: true })

    const { conEnlacesDeArchivos } = await import('@/lib/canales/archivos')
    mensajes = await conEnlacesDeArchivos(msgs)

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
  const caso = await casoDeLaTienda(supabase, auth, casoId, 'conversation_id, estatus')

  if (!caso) return { success: false, error: 'Caso no encontrado' }
  // Tomar un caso resuelto lo dejaría "atendiendo" colgado de una conversación
  // cerrada; para volver a trabajarlo está "Reabrir caso".
  if (casoTerminado(caso.estatus)) {
    return { success: false, error: 'Este caso ya está resuelto. Reábrelo si hay que volver a atenderlo.' }
  }

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
  
  const caso = await casoDeLaTienda(supabase, auth, casoId, 'conversation_id')
  if (!caso) return { success: false, error: 'Caso no encontrado' }

  const { error } = await supabase
    .from('cases')
    .update({ estatus: 'resuelto', fecha_cierre: new Date().toISOString() })
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)

  // Resolver el caso cierra también su conversación, por el camino común: con
  // fecha de cierre y con su resumen, para que la IA recuerde a este cliente.
  if (!error && caso?.conversation_id) {
    await cerrarConversacionYCaso(supabase, caso.conversation_id, userData.tenant_id, 'Resuelto al cerrar el caso')
    const convId = caso.conversation_id
    after(() => resumirConversacionCerrada(convId))
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

// Un caso abierto tiene que poder atenderse, y eso significa poder escribir al
// cliente, que solo se puede en una conversación abierta. Al reabrir:
//   · si su conversación sigue abierta, se queda en ella;
//   · si está cerrada pero el cliente ya ha vuelto a escribir (tiene otra
//     abierta por el mismo canal), el caso se lleva a esa;
//   · si no hay ninguna abierta, se reabre también la suya.
// En los tres casos la IA queda en pausa: hay una persona encargándose.
// Antes, en el último caso el caso se reabría colgado de una conversación
// cerrada (el agente no tenía dónde escribir), y en el segundo fallaba con un
// error de base de datos si esa otra conversación ya tenía su propio caso.
export async function reabrirCaso(casoId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const caso = await casoDeLaTienda(supabase, auth, casoId, 'id, estatus, agente_id, conversation_id, contact_id, branch_id, conversations ( canal, estado )')

  if (!caso) return { success: false, error: 'Caso no encontrado' }
  if (!casoTerminado(caso.estatus)) return { success: true }

  const convDelCaso: any = Array.isArray(caso.conversations) ? caso.conversations[0] : caso.conversations
  let destino: string | null = caso.conversation_id
  let reabrirSuConversacion = false

  if (caso.conversation_id && convDelCaso?.estado !== 'activa') {
    const { data: activa } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', caso.contact_id)
      .eq('branch_id', caso.branch_id)
      .eq('canal', convDelCaso?.canal)
      .eq('estado', 'activa')
      .limit(1)
      .maybeSingle()

    if (activa) {
      // Una conversación tiene como mucho un caso: si la actual del cliente ya
      // tiene el suyo, se trabaja desde ese.
      const { data: casoDeLaActiva } = await supabase
        .from('cases')
        .select('id')
        .eq('conversation_id', activa.id)
        .neq('estatus', 'cerrado')
        .limit(1)
        .maybeSingle()

      if (casoDeLaActiva) {
        return { success: false, error: 'El cliente ya tiene un caso en su conversación actual. Atiéndelo desde ese caso.' }
      }
      destino = activa.id
    } else {
      reabrirSuConversacion = true
    }
  }

  if (reabrirSuConversacion && destino) {
    const { error: errConv } = await supabase
      .from('conversations')
      .update({
        estado: 'activa',
        fecha_cierre: null,
        motivo_bloqueo: null,
        bloqueada_desde: null,
        ia_procesando_desde: null,
        fecha_ultimo_mensaje: new Date().toISOString()
      })
      .eq('id', destino)
      .eq('tenant_id', auth.tenant_id)

    if (errConv) {
      return {
        success: false,
        error: errConv.code === '23505'
          ? 'El cliente acaba de escribir y ya tiene otra conversación abierta. Vuelve a intentarlo.'
          : errConv.message
      }
    }
  }

  const { error } = await supabase
    .from('cases')
    .update({
      estatus: caso.agente_id ? 'atendiendo' : 'pendiente',
      fecha_cierre: null,
      conversation_id: destino
    })
    .eq('id', casoId)
    .eq('tenant_id', auth.tenant_id)

  if (error) return { success: false, error: error.message }

  if (destino) {
    await supabase
      .from('conversations')
      .update({ ia_pausada: true, atendida_por: caso.agente_id })
      .eq('id', destino)
      .eq('tenant_id', auth.tenant_id)
  }

  await supabase.from('case_notes').insert({
    tenant_id: auth.tenant_id,
    case_id: casoId,
    user_id: auth.user_id,
    nota: destino !== caso.conversation_id
      ? 'Caso reabierto y llevado a la conversación actual del cliente.'
      : 'Caso reabierto.'
  })

  const { registrarAuditoria } = await import('@/lib/auditoria')
  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: 'reabrió el caso',
    tabla_afectada: 'cases',
    registro_id: casoId
  })

  return { success: true }
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
    .select('contact_id, branch_id, estado')
    .eq('id', conversationId)
    .eq('tenant_id', userData.tenant_id)
    .eq('branch_id', auth.branch_id)
    .single()

  if (convError || !conv) return { success: false, error: 'Conversación no encontrada' }

  if (agenteId) {
    const { agentes } = await agentesDeLaTienda(supabase, auth)
    if (!agentes.some((a: any) => a.id === agenteId)) {
      return { success: false, error: 'Ese agente no trabaja en esta sucursal.' }
    }
  }
  if (conv.estado !== 'activa') {
    return { success: false, error: 'La conversación está cerrada. Reábrela para poder atender al cliente.' }
  }

  // 2. Una conversación tiene como mucho un caso
  const { data: existingCase } = await supabase
    .from('cases')
    .select('id, estatus')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', userData.tenant_id)
    .order('fecha_apertura', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingCase) {
    return {
      success: false,
      error: casoTerminado(existingCase.estatus)
        ? 'Esta conversación ya tuvo un caso y está resuelto. Usa «Reabrir caso».'
        : 'Esta conversación ya tiene un caso abierto.'
    }
  }

  // 3. Crear el caso
  const { data: nuevoCaso, error } = await supabase
    .from('cases')
    .insert([{
      tenant_id: userData.tenant_id,
      branch_id: conv.branch_id,
      contact_id: conv.contact_id,
      conversation_id: conversationId,
      tipo: 'normal',
      descripcion: DESCRIPCION_CASO_MANUAL,
      estatus: agenteId ? 'atendiendo' : 'pendiente',
      agente_id: agenteId,
      fecha_apertura: new Date().toISOString()
    }])
    .select('id')
    .single()

  // Igual que al tomar un caso: si nace ya con agente, hay una persona
  // atendiendo esta conversación y la IA se aparta.
  if (!error && agenteId) {
    await supabase
      .from('conversations')
      .update({ ia_pausada: true, atendida_por: agenteId })
      .eq('id', conversationId)
      .eq('tenant_id', userData.tenant_id)
  }

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

  const caso = await casoDeLaTienda(supabase, auth, casoId, 'id')
  if (!caso) return { success: false, error: 'Caso no encontrado' }

  // No se puede dar un caso a alguien que no trabaja en esta tienda
  const { agentes } = await agentesDeLaTienda(supabase, auth)
  if (!agentes.some((a: any) => a.id === agenteId)) {
    return { success: false, error: 'Ese agente no trabaja en esta sucursal.' }
  }

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

  const caso = await casoDeLaTienda(supabase, auth, casoId, 'estatus, conversation_id')
  if (!caso) return { success: false, error: 'Caso no encontrado' }
  if (casoTerminado(caso.estatus)) return { success: false, error: 'Este caso ya está resuelto.' }

  // Soltar un caso lo devuelve a la cola: sin agente y pendiente. Antes se
  // quitaba el agente pero seguía "atendiendo", un estado sin nadie detrás
  // que no aparecía en el filtro de pendientes. La IA sigue en pausa: el
  // cliente sigue esperando a una persona.
  const { error } = await supabase
    .from('cases')
    .update({ agente_id: null, estatus: 'pendiente' })
    .eq('id', casoId)
    .eq('tenant_id', userData?.tenant_id)

  if (!error && caso.conversation_id) {
    await supabase
      .from('conversations')
      .update({ atendida_por: null })
      .eq('id', caso.conversation_id)
      .eq('tenant_id', auth.tenant_id)
  }

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
  const { error, agentes } = await agentesDeLaTienda(supabase, auth)
  if (error) return { success: false, error }
  return { success: true, data: agentes }
}

export async function actualizarPrioridadCaso(casoId: string, prioridad: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }
  
  const anterior = await casoDeLaTienda(supabase, auth, casoId, 'prioridad')
  if (!anterior) return { success: false, error: 'Caso no encontrado' }

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

  const anterior = await casoDeLaTienda(supabase, auth, casoId, 'sla_horas')
  if (!anterior) return { success: false, error: 'Caso no encontrado' }

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
