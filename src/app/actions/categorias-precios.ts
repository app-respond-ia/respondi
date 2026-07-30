'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

export interface CategoriaData {
  nombre: string
  parent_id: string | null
  orden?: number
}

async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a una organización' }
  }

  const branchId = await resolveBranchId(supabase, user.id)
  if (!branchId) return { error: 'Usuario no vinculado a una sucursal' }

  return { tenant_id: userData.tenant_id, branch_id: branchId }
}

export async function getCategorias() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('categorias_precios')
    .select('*')
    .eq('branch_id', auth.branch_id)
    .order('orden', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function crearCategoria(data: CategoriaData) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  if (!data.nombre?.trim()) {
    return { success: false, error: 'El nombre es obligatorio' }
  }

  const { data: inserted, error } = await supabase
    .from('categorias_precios')
    .insert([{
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      nombre: data.nombre.trim(),
      parent_id: data.parent_id || null,
      orden: data.orden || 0
    }])
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: inserted }
}

export async function actualizarCategoria(id: string, data: Partial<CategoriaData>) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: updated, error } = await supabase
    .from('categorias_precios')
    .update(data)
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: updated }
}

export async function eliminarCategoria(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { error } = await supabase
    .from('categorias_precios')
    .delete()
    .eq('id', id)
    .eq('branch_id', auth.branch_id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
