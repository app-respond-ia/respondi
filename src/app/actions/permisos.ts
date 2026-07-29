'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { resolveBranchId } from '@/lib/active-branch'

import type { SeccionPermiso, NivelPermiso, PermisoSeccion } from '@/lib/permisos-types'
import { SECCIONES_CON_ALCANCE } from '@/lib/permisos-types'

// Obtener los permisos de un usuario en una sucursal específica
export async function getPermisosUsuario(userId: string, branchId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  // Solo admin puede consultar permisos de otros usuarios
  const { data: adminData } = await supabase
    .from('users')
    .select('rol, tenant_id')
    .eq('id', user.id)
    .single()

  if (!adminData) return { success: false, error: 'No autorizado' }

  // El usuario puede ver sus propios permisos, o el admin los de su tenant
  const esAdmin = false // TODO: sustituir por lógica de nivel/es_propietario en el siguiente paso
  const esPropios = userId === user.id

  if (!esAdmin && !esPropios) {
    return { success: false, error: 'No tienes permisos para ver esto' }
  }

  const { data: permisos, error } = await supabase
    .from('user_permissions')
    .select('seccion, nivel, alcance')
    .eq('user_id', userId)
    .eq('branch_id', branchId)

  if (error) return { success: false, error: error.message }

  return { success: true, data: permisos || [] }
}

export async function getMisPermisos() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('rol, tenant_id, rol_personalizado_id, roles_personalizados(es_propietario, permisos, nivel)')
    .eq('id', user.id)
    .single()

  if (!userData) return { success: false, error: 'No autorizado' }

  const branchId = await resolveBranchId(supabase, user.id)

  const esSuperAdmin = userData.rol === 'super_admin'
  const roleData = Array.isArray(userData.roles_personalizados) 
    ? userData.roles_personalizados[0] 
    : userData.roles_personalizados

  const esPropietario = roleData?.es_propietario || false

  if (esSuperAdmin || esPropietario) {
    return { 
      success: true, 
      esAdmin: true,
      tenantId: userData.tenant_id,
      branchId: branchId,
      data: [],
      userLevel: esSuperAdmin ? 0 : 1
    }
  }

  if (!branchId) return { success: false, error: 'No hay sucursal activa' }

  const permisos = roleData?.permisos || []

  return { 
    success: true, 
    esAdmin: false, 
    tenantId: userData.tenant_id,
    branchId: branchId,
    data: permisos,
    userLevel: roleData?.nivel ?? 5
  }
}

// Guardar/actualizar permisos de un usuario en una sucursal
// Solo el admin puede hacer esto
export async function setPermisosUsuario(
  userId: string,
  branchId: string,
  permisos: PermisoSeccion[]
) {
  return { success: false, error: 'Los permisos ahora se gestionan por rol' }
}
