'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

export interface SkillData {
  nombre: string
  descripcion: string
  activo: boolean
}

// Función auxiliar para obtener credenciales del usuario activo
async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id, rol')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a un comercio' }
  }

  const branchId = await resolveBranchId(supabase, userData.tenant_id, userData.branch_id, userData.rol)
  if (!branchId) return { error: 'Usuario no vinculado a una sucursal' }

  return { tenant_id: userData.tenant_id, branch_id: branchId }
}

export async function getSkills() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('branch_id', auth.branch_id)
    .order('orden', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function crearSkill(data: SkillData) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Calcular el máximo orden actual
  const { data: currentSkills, error: fetchError } = await supabase
    .from('skills')
    .select('orden')
    .eq('branch_id', auth.branch_id)
    .order('orden', { ascending: false })
    .limit(1)

  if (fetchError) return { success: false, error: fetchError.message }

  const nuevoOrden = currentSkills && currentSkills.length > 0 ? currentSkills[0].orden + 1 : 0

  const { data: insertedData, error } = await supabase
    .from('skills')
    .insert([{
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      nombre: data.nombre,
      descripcion: data.descripcion,
      activo: data.activo,
      orden: nuevoOrden
    }])
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: insertedData }
}

export async function actualizarSkill(id: string, data: Partial<{ nombre: string, descripcion: string, activo: boolean, orden: number }>) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: updatedData, error } = await supabase
    .from('skills')
    .update(data)
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: updatedData }
}

export async function eliminarSkill(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { error } = await supabase
    .from('skills')
    .delete()
    .eq('id', id)
    .eq('branch_id', auth.branch_id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function reordenarSkills(ids: string[]) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const { error } = await supabase
      .from('skills')
      .update({ orden: i })
      .eq('id', id)
      .eq('branch_id', auth.branch_id)
    
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
}
