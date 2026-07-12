'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

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
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('roles_personalizados')
    .select('*')
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function crearRolPersonalizado(data: {
  nombre: string
  descripcion?: string
  permisos: { seccion: string, nivel: string, alcance?: string }[]
}) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }
  if (auth.rol !== 'admin') return { success: false, error: 'Solo el administrador puede crear roles' }

  const { data: result, error } = await supabase
    .from('roles_personalizados')
    .insert([{
      tenant_id: auth.tenant_id,
      nombre: data.nombre,
      descripcion: data.descripcion || null,
      permisos: data.permisos
    }])
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: result }
}

export async function actualizarRolPersonalizado(id: string, data: {
  nombre?: string
  descripcion?: string
  permisos?: { seccion: string, nivel: string, alcance?: string }[]
}) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }
  if (auth.rol !== 'admin') return { success: false, error: 'Solo el administrador puede editar roles' }

  const { data: result, error } = await supabase
    .from('roles_personalizados')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: result }
}

export async function eliminarRolPersonalizado(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }
  if (auth.rol !== 'admin') return { success: false, error: 'Solo el administrador puede eliminar roles' }

  const { error } = await supabase
    .from('roles_personalizados')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
