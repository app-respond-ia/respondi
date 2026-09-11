'use server'

import { createClient } from '@/utils/supabase/server'
import { getMisPermisos } from './permisos'

import { getAuthContext } from '@/lib/auth-context'

// Las notas de una conversación son de su tienda: solo se ven y se tocan
// desde la tienda activa.
async function esDeLaTiendaActiva(supabase: any, auth: any, conversationId: string) {
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()
  return !!data
}

// Las notas son de la persona, no solo de una conversación: lo que el equipo
// apuntó la vez anterior ("prefiere que le llamen por la tarde") sigue
// sirviendo cuando vuelve a escribir. Se devuelven las de todas sus
// conversaciones con esta tienda, marcando cuáles son de otra conversación.
// Las nuevas se guardan en la conversación desde la que se escriben.
export async function getNotas(conversationId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, contact_id')
    .eq('id', conversationId)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()
  if (!conv) return { success: false, error: 'Conversación no encontrada' }

  const { data: suyas } = await supabase
    .from('conversations')
    .select('id, fecha_inicio')
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .eq('contact_id', conv.contact_id)
  const inicioDe: Record<string, string> = {}
  for (const c of suyas || []) inicioDe[c.id] = c.fecha_inicio

  const { data, error } = await supabase
    .from('internal_notes')
    .select(`
      id,
      contenido,
      created_at,
      user_id,
      conversation_id,
      users:user_id (nombre, email)
    `)
    .in('conversation_id', Object.keys(inicioDe).length ? Object.keys(inicioDe) : [conversationId])
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: (data || []).map((n: any) => ({
      ...n,
      de_otra_conversacion: n.conversation_id !== conversationId,
      inicio_conversacion: inicioDe[n.conversation_id] || null
    }))
  }
}

export async function crearNota(conversationId: string, contenido: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  if (!contenido || contenido.trim() === '') {
    return { success: false, error: 'La nota no puede estar vacía' }
  }
  if (!(await esDeLaTiendaActiva(supabase, auth, conversationId))) return { success: false, error: 'Conversación no encontrada' }

  const { data, error } = await supabase
    .from('internal_notes')
    .insert({
      tenant_id: auth.tenant_id,
      conversation_id: conversationId,
      user_id: auth.user_id,
      contenido: contenido.trim()
    })
    .select(`
      id,
      contenido,
      created_at,
      user_id,
      users:user_id (nombre, email)
    `)
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function eliminarNota(notaId: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Check permissions: Only level 1, 2, or owner can delete notes
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('roles_personalizados(nivel, es_propietario)')
    .eq('id', auth.user_id)
    .single()

  if (userError) return { success: false, error: 'Error verificando permisos' }

  const roleData = Array.isArray(userData?.roles_personalizados) ? userData?.roles_personalizados[0] : userData?.roles_personalizados
  const isOwner = roleData?.es_propietario === true
  const level = roleData?.nivel ?? 5

  if (!isOwner && level > 2) {
    return { success: false, error: 'No tienes permisos para eliminar notas' }
  }

  const { data: nota } = await supabase.from('internal_notes').select('conversation_id').eq('id', notaId).eq('tenant_id', auth.tenant_id).maybeSingle()
  if (!nota || !(await esDeLaTiendaActiva(supabase, auth, nota.conversation_id))) return { success: false, error: 'Nota no encontrada' }

  const { error } = await supabase
    .from('internal_notes')
    .delete()
    .eq('id', notaId)
    .eq('tenant_id', auth.tenant_id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
