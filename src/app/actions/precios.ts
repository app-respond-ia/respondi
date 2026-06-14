'use server'

import { createClient } from '@/utils/supabase/server'

export interface PrecioData {
  nombre: string
  tipo: 'producto' | 'servicio'
  precio: number | null
  precio_tipo: 'exacto' | 'desde' | 'consultar'
  moneda: string
  descripcion: string | null
  disponible: boolean
}

// Función auxiliar para obtener credenciales del usuario activo
async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id || !userData?.branch_id) {
    return { error: 'Usuario no vinculado a una sucursal' }
  }

  return { tenant_id: userData.tenant_id, branch_id: userData.branch_id }
}

export async function getPrecios() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('price_list')
    .select('*')
    .eq('branch_id', auth.branch_id)
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function crearPrecio(data: PrecioData) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: insertedData, error } = await supabase
    .from('price_list')
    .insert([{
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      nombre: data.nombre,
      tipo: data.tipo,
      precio: data.precio,
      precio_tipo: data.precio_tipo,
      moneda: data.moneda,
      descripcion: data.descripcion,
      disponible: data.disponible
    }])
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: insertedData }
}

export async function actualizarPrecio(id: string, data: Partial<PrecioData>) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: updatedData, error } = await supabase
    .from('price_list')
    .update(data)
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: updatedData }
}

export async function eliminarPrecio(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Se fuerza validación eq('branch_id', auth.branch_id) por seguridad
  const { error } = await supabase
    .from('price_list')
    .delete()
    .eq('id', id)
    .eq('branch_id', auth.branch_id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
