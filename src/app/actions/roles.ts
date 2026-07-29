'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { supabaseAdmin } from '@/utils/supabase/admin'

export async function canManageRole(userId: string, targetRoleLevel: number, targetRoleTenantId?: string) {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('rol, tenant_id, rol_personalizado_id, roles_personalizados(nivel)')
    .eq('id', userId)
    .single()

  if (!user) return { allowed: false, error: 'Usuario no encontrado' }
  
  if (user.rol === 'super_admin') {
    return { allowed: true, userLevel: 0, tenantId: user.tenant_id }
  }

  if (targetRoleTenantId && targetRoleTenantId !== user.tenant_id) {
    return { allowed: false, error: 'El rol pertenece a otra organización' }
  }

  const roleData = Array.isArray(user.roles_personalizados) 
    ? user.roles_personalizados[0] 
    : user.roles_personalizados

  const userLevel = roleData?.nivel ?? 5

  if (userLevel >= targetRoleLevel) {
    return { 
      allowed: false, 
      error: 'No tienes jerarquía suficiente para gestionar roles de este nivel' 
    }
  }

  return { allowed: true, userLevel, tenantId: user.tenant_id }
}


async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', user_id: null, tenant_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, rol')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) return { error: 'Sin organización', user_id: user.id, tenant_id: null }
  return { user_id: user.id, tenant_id: userData.tenant_id, rol: userData.rol }
}

export async function getRolesPersonalizados() {
  try {
    const supabase = await createClient()
    const auth = await getAuthData(supabase)
    if (auth.error) return { success: false, error: auth.error }

    const { data, error } = await supabaseAdmin
      .from('roles_personalizados')
      .select('*')
      .eq('tenant_id', auth.tenant_id)
      .order('nivel', { ascending: true })

    if (error) return { success: false, error: error.message }
    return { success: true, data: data || [] }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error al cargar los roles' }
  }
}

export async function crearRolPersonalizado(data: {
  nombre: string
  descripcion?: string
  nivel?: number
  permisos: { seccion: string, nivel: string, alcance?: string }[]
}) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }
  
  const newLevel = data.nivel ?? 5
  if (newLevel <= 1) return { success: false, error: 'No se pueden crear roles de nivel 1 manualmente' }

  const check = await canManageRole(auth.user_id, newLevel, auth.tenant_id)
  if (!check.allowed) return { success: false, error: check.error }

  const { data: result, error } = await supabaseAdmin
    .from('roles_personalizados')
    .insert([{
      tenant_id: auth.tenant_id,
      nombre: data.nombre,
      descripcion: data.descripcion || null,
      nivel: newLevel,
      permisos: data.permisos
    }])
    .select()
    .single()

  if (error) return { success: false, error: error!.message }
  return { success: true, data: result }
}

export async function actualizarRolPersonalizado(id: string, data: {
  nombre?: string
  descripcion?: string
  nivel?: number
  permisos?: { seccion: string, nivel: string, alcance?: string }[]
}) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: targetRole } = await supabaseAdmin
    .from('roles_personalizados')
    .select('nivel, tenant_id, es_propietario')
    .eq('id', id)
    .single()

  if (!targetRole) return { success: false, error: 'Rol no encontrado' }
  if (targetRole.es_propietario) return { success: false, error: 'El rol Propietario no se puede editar' }
  
  const check = await canManageRole(auth.user_id, targetRole.nivel, targetRole.tenant_id)
  if (!check.allowed) return { success: false, error: check.error }

  if (data.nivel && data.nivel !== targetRole.nivel) {
    if (data.nivel <= 1) return { success: false, error: 'No se puede cambiar un rol a nivel 1' }
    const newCheck = await canManageRole(auth.user_id, data.nivel, targetRole.tenant_id)
    if (!newCheck.allowed) return { success: false, error: newCheck.error }
  }

  const { data: result, error } = await supabaseAdmin
    .from('roles_personalizados')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select()
    .single()

  if (error) return { success: false, error: error!.message }
  return { success: true, data: result }
}

export async function eliminarRolPersonalizado(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: targetRole } = await supabaseAdmin
    .from('roles_personalizados')
    .select('nivel, tenant_id, es_propietario')
    .eq('id', id)
    .single()

  if (!targetRole) return { success: false, error: 'Rol no encontrado' }
  if (targetRole.es_propietario) return { success: false, error: 'El rol Propietario no se puede eliminar' }
  
  const check = await canManageRole(auth.user_id, targetRole.nivel, targetRole.tenant_id)
  if (!check.allowed) return { success: false, error: check.error }

  const { error } = await supabaseAdmin
    .from('roles_personalizados')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)

  if (error) return { success: false, error: error!.message }
  return { success: true }
}
