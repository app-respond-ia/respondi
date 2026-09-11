'use server'

import { createClient } from '@/utils/supabase/server'
import { getMisPermisos } from '@/app/actions/permisos'

import { getAuthContext } from '@/lib/auth-context'
export async function getAuditLog(filtros?: { userId?: string, tabla?: string, busqueda?: string, fechaInicio?: string, fechaFin?: string }) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const permisos = await getMisPermisos()
  const esAdmin = !!(permisos as any).esAdmin
  if (!esAdmin && !((permisos as any).data || []).some((p: any) => p.seccion === 'audit_log' && p.nivel !== 'ninguno')) {
    return { success: false, error: 'No tienes permiso para ver el registro de cambios.' }
  }

  let query = supabase
    .from('audit_log')
    .select(`
      *,
      users!user_id (
        id,
        nombre,
        email
      )
    `)
    .eq('tenant_id', auth.tenant_id)

  // Los cambios de la sucursal activa; los de toda la organización (usuarios,
  // plan, facturación...), solo para el propietario o un administrador.
  query = esAdmin
    ? query.or(`branch_id.eq.${auth.branch_id},branch_id.is.null`)
    : query.eq('branch_id', auth.branch_id)

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
  const auth = await getAuthContext(supabase)
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

  // El historial de una conversación o de un caso solo se ve desde su tienda
  const { data: registro } = await supabase
    .from(tablaAfectada)
    .select('id')
    .eq('id', registroId)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .maybeSingle()
  if (!registro) return { success: true, data: [], hasPermission: true }

  let query = supabase
    .from('audit_log')
    .select(`
      id,
      accion,
      timestamp,
      tabla_afectada,
      users!user_id (
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
