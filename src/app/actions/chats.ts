'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

import { getAuthContext } from '@/lib/auth-context'
import { after } from 'next/server'
import { cerrarConversacionYCaso, resumirConversacionCerrada } from '@/lib/conversaciones/cierre'

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

  const { data: rawData, error } = await supabase
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

  if (error) return { success: false, error: error.message }

  // Una fila por persona. Antes salía una fila por cada conversación, así que
  // un cliente que había escrito cuatro veces aparecía cuatro veces. De cada
  // persona se enseña su conversación abierta (si la tiene) o la última, y
  // cuántas lleva en total con esta sucursal; el historial completo está en
  // su ficha (Conversaciones). Los filtros miran esa conversación, la que
  // cuenta ahora: alguien que está hablando no sale en "Cerradas" por tener
  // conversaciones antiguas cerradas.
  const porPersona = new Map<string, any>()
  const totales: Record<string, number> = {}
  const idsPorPersona: Record<string, string[]> = {}
  for (const c of rawData || []) {
    totales[c.contact_id] = (totales[c.contact_id] || 0) + 1
    ;(idsPorPersona[c.contact_id] ||= []).push(c.id)
    const actual = porPersona.get(c.contact_id)
    const mejor = !actual ||
      (c.estado === 'activa' && actual.estado !== 'activa') ||
      (c.estado === actual.estado && String(c.fecha_ultimo_mensaje || c.fecha_inicio) > String(actual.fecha_ultimo_mensaje || actual.fecha_inicio))
    if (mejor) porPersona.set(c.contact_id, c)
  }

  let result = [...porPersona.values()]

  if (filtros?.estado && filtros.estado !== 'Todas') {
    const est = filtros.estado === 'Activas' ? 'activa' : filtros.estado === 'Cerradas' ? 'cerrada' : null
    if (est) result = result.filter(c => c.estado === est)
  }

  if (filtros?.canal && filtros.canal !== 'Todos') {
    const canal = filtros.canal.toLowerCase()
    result = result.filter(c => c.canal === canal)
  }

  if (filtros?.iaPausada && filtros.iaPausada !== 'Todas') {
    const pausada = filtros.iaPausada === 'Pausada'
    result = result.filter(c => !!c.ia_pausada === pausada)
  }

  if (filtros?.dateRange?.from) {
    const desde = filtros.dateRange.from
    result = result.filter(c => c.fecha_ultimo_mensaje && c.fecha_ultimo_mensaje >= desde)
  }
  if (filtros?.dateRange?.to) {
    const hasta = new Date(filtros.dateRange.to + 'T23:59:59.999Z').getTime()
    result = result.filter(c => c.fecha_ultimo_mensaje && new Date(c.fecha_ultimo_mensaje).getTime() <= hasta)
  }

  if (filtros?.tieneCaso && filtros.tieneCaso !== 'Todas') {
    result = result.filter(c => {
      const hasCase = c.cases && c.cases.length > 0
      return filtros.tieneCaso === 'Con caso' ? hasCase : !hasCase
    })
  }

  if (filtros?.asignadosAMi) {
    result = result.filter(c => c.cases?.some((cas: any) => cas.agente_id === auth.user_id))
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
        (idsPorPersona[c.contact_id] || [c.id]).some(id => id.toLowerCase().includes(s)) ||
        (contact?.nombre && contact.nombre.toLowerCase().includes(s)) ||
        (contact?.identificador_canal && contact.identificador_canal.toLowerCase().includes(s)) ||
        (contact?.canal && contact.canal.toLowerCase().includes(s))
      )
    })
  }

  const asc = filtros?.sort === 'asc'
  const conversaciones = result
    .map(c => ({
      ...c,
      total_conversaciones: totales[c.contact_id] || 1,
      // Para abrir el chat de la persona desde cualquiera de sus conversaciones
      // (por ejemplo, desde un caso de una conversación antigua)
      ids_conversaciones: idsPorPersona[c.contact_id] || [c.id]
    }))
    .sort((a, b) => {
      const fa = String(a.fecha_ultimo_mensaje || a.fecha_inicio), fb = String(b.fecha_ultimo_mensaje || b.fecha_inicio)
      return asc ? fa.localeCompare(fb) : fb.localeCompare(fa)
    })

  return { success: true, data: { conversaciones } }
}

export async function getEtiquetasTenant() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Las etiquetas son de cada tienda: el filtro de Chats solo ofrece las suyas
  const { data, error } = await supabase
    .from('message_categories')
    .select('id, nombre, color')
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .order('nombre')

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function getMensajes(conversationId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // La conversación tiene que ser de la tienda activa
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .single()
    
  if (!conv) return { success: false, error: 'Conversación no encontrada' }

  const { data: mensajes, error } = await supabase
    .from('messages')
    .select('*, users(nombre)')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true })

  if (error) return { success: false, error: error.message }
  // Con enlace temporal para poder ver las fotos y los archivos en Chats
  const { conEnlacesDeArchivos } = await import('@/lib/canales/archivos')
  return { success: true, data: { mensajes: await conEnlacesDeArchivos(mensajes) } }
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

  // Camino común de cierre: si la conversación tenía un caso abierto se da por
  // resuelto (antes se quedaba abierto, colgado de una conversación cerrada, y
  // el aviso de "caso sin resolver" saltaba para siempre), y se genera el
  // resumen para que la IA recuerde a este cliente.
  const { data: propia } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()
  if (!propia) return { success: false, error: 'Conversación no encontrada' }

  const cierre = await cerrarConversacionYCaso(supabase, conversationId, auth.tenant_id, 'Resuelto al cerrar la conversación desde Chats')
  if (!cierre.success) return { success: false, error: cierre.error }
  after(() => resumirConversacionCerrada(conversationId))

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      contacts (
        nombre,
        identificador_canal,
        canal
      )
    `)
    .eq('id', conversationId)
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

// Reabrir una conversación es algo que hace una persona para seguir hablando
// ella con el cliente, así que la IA vuelve en pausa (se puede reactivar desde
// el propio chat). Antes volvía activa y podía contestar de golpe mensajes
// viejos, o quedarse muda para siempre si la conversación arrastraba un
// bloqueo antiguo (fuera de horario, sin créditos...).
export async function reabrirConversacion(conversationId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, estado, contact_id, canal')
    .eq('id', conversationId)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()

  if (!conv) return { success: false, error: 'Conversación no encontrada' }

  // Un cliente solo puede tener una conversación abierta por canal: si ya ha
  // vuelto a escribir, lo suyo sigue en esa, no en la vieja.
  const yaTieneOtraAbierta = 'Este cliente ya tiene otra conversación abierta por este canal. Continúa en esa.'
  const { data: otraAbierta } = await supabase
    .from('conversations')
    .select('id')
    .eq('contact_id', conv.contact_id)
    .eq('branch_id', auth.branch_id)
    .eq('canal', conv.canal)
    .eq('estado', 'activa')
    .neq('id', conversationId)
    .limit(1)
    .maybeSingle()

  if (otraAbierta) return { success: false, error: yaTieneOtraAbierta }

  const { data, error } = await supabase
    .from('conversations')
    .update({
      estado: 'activa',
      fecha_cierre: null,
      ia_pausada: true,
      atendida_por: auth.user_id,
      motivo_bloqueo: null,
      bloqueada_desde: null,
      ia_procesando_desde: null,
      // Reabrir cuenta como actividad: el plazo de 24 h empieza ahora.
      fecha_ultimo_mensaje: new Date().toISOString()
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

  // Si justo entre la comprobación y el cambio entra un mensaje nuevo del
  // cliente, se habrá abierto otra conversación y la base de datos lo impide.
  if (error?.code === '23505') return { success: false, error: yaTieneOtraAbierta }
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
      contact_id,
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
    .eq('branch_id', auth.branch_id)
    .single()

  if (error) return { success: false, error: error.message }

  // La ventana de 24 h de WhatsApp: desde el último mensaje del cliente, en
  // cualquiera de sus conversaciones con esta sucursal. Cerrada, solo se le
  // puede escribir con una plantilla aprobada.
  let ventana: { abierta: boolean; cierra: string | null } | null = null
  if (data.canal === 'whatsapp') {
    const { data: ultimo } = await supabase
      .from('messages')
      .select('timestamp, conversations!inner(contact_id, branch_id)')
      .eq('remitente', 'cliente')
      .eq('conversations.contact_id', data.contact_id)
      .eq('conversations.branch_id', auth.branch_id)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()
    const cierra = ultimo ? new Date(new Date(ultimo.timestamp).getTime() + 24 * 3600 * 1000) : null
    ventana = { abierta: !!cierra && cierra.getTime() > Date.now(), cierra: cierra ? cierra.toISOString() : null }
  }

  // Format the output specifically for the frontend
  const contexto = {
    ...data,
    ventana,
    etiquetas: data.conversation_tags?.map((t: any) => t.message_categories) || [],
    caso_asociado: data.cases && data.cases.length > 0 ? {
      ...data.cases[0],
      agente: data.cases[0].agente
    } : null
  }
  
  return { success: true, data: contexto }
}

// Chats al entrar: permisos, etiquetas del filtro y la lista, en una sola
// petición. Next.js atiende las peticiones de una pantalla una detrás de
// otra, así que cada una que se ahorra es tiempo que el usuario no espera.
export async function inicioChats(filtros?: Parameters<typeof getConversaciones>[0]) {
  const { getMisPermisos } = await import('./permisos')
  const [permisos, etiquetas, lista] = await Promise.all([getMisPermisos(), getEtiquetasTenant(), getConversaciones(filtros)])
  return { permisos, etiquetas, lista }
}

// Un chat al abrirlo: mensajes, ficha, actividad y (la primera vez) los
// agentes de la sucursal, también en una sola petición
export async function abrirChat(conversationId: string, opciones: { actividad: boolean; agentes: boolean }) {
  const [{ getLogsAuditoria }, { getAgentesParaCasos }] = await Promise.all([import('./audit-log'), import('./casos')])
  const [mensajes, contexto, logs, agentes] = await Promise.all([
    getMensajes(conversationId),
    getContextoChat(conversationId),
    opciones.actividad ? getLogsAuditoria('conversations', conversationId) : Promise.resolve(null),
    opciones.agentes ? getAgentesParaCasos() : Promise.resolve(null)
  ])
  return { mensajes, contexto, logs, agentes }
}
