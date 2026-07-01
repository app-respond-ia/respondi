'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

export type SeccionPermiso = 
  | 'casos' | 'conversaciones' | 'chats' | 'novedades' | 'blacklist'
  | 'skills' | 'precios' | 'reglas' | 'etiquetas' | 'canales'
  | 'usuarios' | 'sucursales' | 'perfil' | 'audit_log'

export type NivelPermiso = 'ninguno' | 'lectura' | 'escritura'
export type AlcancePermiso = 'todos' | 'propios'

export interface PermisoSeccion {
  seccion: SeccionPermiso
  nivel: NivelPermiso
  alcance?: AlcancePermiso
}

// Secciones que soportan el campo alcance
export const SECCIONES_CON_ALCANCE: SeccionPermiso[] = ['casos', 'conversaciones', 'chats']

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
  const esAdmin = adminData.rol === 'admin'
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

// Obtener los permisos del usuario autenticado en su sucursal activa
export async function getMisPermisos() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase
    .from('users')
    .select('rol, tenant_id')
    .eq('id', user.id)
    .single()

  if (!userData) return { success: false, error: 'No autorizado' }

  // Admin tiene acceso total — devolvemos todos los permisos en nivel escritura
  if (userData.rol === 'admin' || userData.rol === 'super_admin') {
    return { 
      success: true, 
      esAdmin: true,
      data: [] // El frontend sabrá que es admin y dará acceso total
    }
  }

  const branchId = await resolveBranchId(supabase, user.id)
  if (!branchId) return { success: false, error: 'No hay sucursal activa' }

  const { data: permisos, error } = await supabase
    .from('user_permissions')
    .select('seccion, nivel, alcance')
    .eq('user_id', user.id)
    .eq('branch_id', branchId)

  if (error) return { success: false, error: error.message }

  return { success: true, esAdmin: false, data: permisos || [] }
}

// Guardar/actualizar permisos de un usuario en una sucursal
// Solo el admin puede hacer esto
export async function setPermisosUsuario(
  userId: string,
  branchId: string,
  permisos: PermisoSeccion[]
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: adminData } = await supabase
    .from('users')
    .select('rol, tenant_id')
    .eq('id', user.id)
    .single()

  if (!adminData || adminData.rol !== 'admin') {
    return { success: false, error: 'Solo el administrador puede modificar permisos' }
  }

  // Verificar que la sucursal pertenece al tenant del admin
  const { data: branchData } = await supabase
    .from('sucursales')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', adminData.tenant_id)
    .single()

  if (!branchData) {
    return { success: false, error: 'Sucursal no encontrada en tu organización' }
  }

  // Obtener permisos anteriores para audit_log
  const { data: permisosAnteriores } = await supabase
    .from('user_permissions')
    .select('seccion, nivel, alcance')
    .eq('user_id', userId)
    .eq('branch_id', branchId)

  // Upsert de todos los permisos enviados
  const rows = permisos.map(p => ({
    user_id: userId,
    branch_id: branchId,
    seccion: p.seccion,
    nivel: p.nivel,
    alcance: SECCIONES_CON_ALCANCE.includes(p.seccion) ? (p.alcance || 'todos') : null,
    updated_at: new Date().toISOString()
  }))

  const { error: upsertError } = await supabase
    .from('user_permissions')
    .upsert(rows, { onConflict: 'user_id,branch_id,seccion' })

  if (upsertError) return { success: false, error: upsertError.message }

  // Registrar en audit_log
  await supabase.from('audit_log').insert({
    tenant_id: adminData.tenant_id,
    user_id: user.id,
    accion: 'actualizar_permisos',
    tabla_afectada: 'user_permissions',
    registro_id: userId,
    valor_anterior: permisosAnteriores ? { permisos: permisosAnteriores } : null,
    valor_nuevo: { permisos: rows, branch_id: branchId }
  })

  return { success: true }
}
