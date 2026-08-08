'use server'

import { createClient } from '@/utils/supabase/server'
import { getMisPermisos } from '@/app/actions/permisos'

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

  return { tenant_id: userData.tenant_id, user_id: user.id }
}

export async function getAuditLog(filtros?: { userId?: string, tabla?: string, busqueda?: string, fechaInicio?: string, fechaFin?: string }) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  let query = supabase
    .from('audit_log')
    .select(`
      *,
      users (
        id,
        nombre,
        email
      )
    `)
    .eq('tenant_id', auth.tenant_id)

  if (filtros?.userId) query = query.eq('user_id', filtros.userId)
  if (filtros?.tabla) query = query.eq('tabla_afectada', filtros.tabla)
  if (filtros?.busqueda) query = query.ilike('accion', `%${filtros.busqueda}%`)
  if (filtros?.fechaInicio) query = query.gte('timestamp', filtros.fechaInicio)
  if (filtros?.fechaFin) query = query.lte('timestamp', filtros.fechaFin)

  query = query.order('timestamp', { ascending: false }).limit(200)

  const { data: entradas, error } = await query
  if (error) return { success: false, error: error.message }

  const { data: usuarios_disponibles, error: usersError } = await supabase
    .from('users')
    .select('id, nombre, email')
    .eq('tenant_id', auth.tenant_id)

  if (usersError) return { success: false, error: usersError.message }

  return { 
    success: true, 
    data: { 
      entradas, 
      usuarios_disponibles 
    } 
  }
}

export async function getLogsAuditoria(tablaAfectada: 'cases' | 'conversations', registroId: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const permisosRes = await getMisPermisos()
  if (!permisosRes.success) return { success: false, error: permisosRes.error }

  let hasLogsPerm = false
  if ((permisosRes as any).esAdmin) {
    hasLogsPerm = true
  } else {
    const p = (permisosRes.data || []).find((p: any) => p.seccion === 'audit_log')
    if (p && p.nivel !== 'ninguno') hasLogsPerm = true
  }

  if (!hasLogsPerm) return { success: true, data: [], hasPermission: false }

  let query = supabase
    .from('audit_log')
    .select(`
      id,
      accion,
      timestamp,
      tabla_afectada,
      users (
        nombre,
        email
      )
    `)
    .eq('tenant_id', auth.tenant_id)

  if (tablaAfectada === 'conversations') {
    const { data: caso } = await supabase
      .from('cases')
      .select('id')
      .eq('conversation_id', registroId)
      .eq('tenant_id', auth.tenant_id)
      .single()

    if (caso?.id) {
      query = query.or(`and(tabla_afectada.eq.conversations,registro_id.eq.${registroId}),and(tabla_afectada.eq.cases,registro_id.eq.${caso.id})`)
    } else {
      query = query.eq('tabla_afectada', 'conversations').eq('registro_id', registroId)
    }
  } else {
    query = query.eq('tabla_afectada', tablaAfectada).eq('registro_id', registroId)
  }

  query = query.order('timestamp', { ascending: false }).limit(15)

  const { data, error } = await query

  if (error) return { success: false, error: error.message }

  return { success: true, data: data || [], hasPermission: true }
}
