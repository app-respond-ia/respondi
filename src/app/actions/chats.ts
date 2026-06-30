'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', user_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a una organización', user_id: user.id }
  }

  const branchId = await resolveBranchId(supabase, user.id)
  if (!branchId) return { error: 'No hay sucursal activa', user_id: user.id }

  return { tenant_id: userData.tenant_id, branch_id: branchId, user_id: user.id }
}

export async function getConversaciones() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: conversaciones, error } = await supabase
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
        agente_id
      )
    `)
    .eq('branch_id', auth.branch_id)
    .order('fecha_ultimo_mensaje', { ascending: false, nullsFirst: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data: { conversaciones } }
}

export async function getMensajes(conversationId: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
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
    .select('*')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data: { mensajes } }
}

export async function toggleIAPausa(conversationId: string, pausada: boolean) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

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

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function cerrarConversacion(conversationId: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
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

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}
