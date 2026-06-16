'use server'

import { createClient } from '@/utils/supabase/server'

async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', user_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a un comercio', user_id: user.id }
  }

  return { tenant_id: userData.tenant_id, user_id: user.id }
}

export async function getAuditLog(filtros?: { userId?: string, tabla?: string, busqueda?: string }) {
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
