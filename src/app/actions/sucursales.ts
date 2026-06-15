'use server'

import { createClient } from '@/utils/supabase/server'

async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', user_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a un comercio', user_id: user.id }
  }

  return { tenant_id: userData.tenant_id, branch_id: userData.branch_id, user_id: user.id }
}

export async function getSucursales() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: sucursales, error } = await supabase
    .from('sucursales')
    .select('id, nombre, direccion, activa, created_at')
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data: { sucursales } }
}

export async function crearSucursal(nombre: string, direccion?: string) {
  if (!nombre || nombre.trim().length === 0) {
    return { success: false, error: 'El nombre es obligatorio' }
  }

  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('sucursales')
    .insert({
      tenant_id: auth.tenant_id,
      nombre: nombre.trim(),
      direccion: direccion?.trim() || null,
      activa: true
    })
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function desactivarSucursal(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Check how many active branches are there
  const { count, error: countError } = await supabase
    .from('sucursales')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', auth.tenant_id)
    .eq('activa', true)

  if (countError) return { success: false, error: countError.message }

  if (count === null || count <= 1) {
    return { success: false, error: 'No puedes desactivar tu única sucursal activa' }
  }

  const { data, error } = await supabase
    .from('sucursales')
    .update({ activa: false })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function reactivarSucursal(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('sucursales')
    .update({ activa: true })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}
