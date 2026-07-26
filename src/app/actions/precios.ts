'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

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
    .select('tenant_id, branch_id, rol')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a una organización' }
  }

  const branchId = await resolveBranchId(supabase, user.id)
  if (!branchId) return { error: 'Usuario no vinculado a una sucursal' }

  return { tenant_id: userData.tenant_id, branch_id: branchId }
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

export async function importarPreciosMasivo(items: {
  nombre: string
  tipo: string
  precio: number | null
  precio_tipo: string
  descripcion: string | null
}[]) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  if (!items || items.length === 0) return { success: false, error: 'No hay ítems para importar' }

  const rows = items.map(item => ({
    tenant_id: auth.tenant_id,
    branch_id: auth.branch_id,
    nombre: item.nombre,
    tipo: item.tipo || 'producto',
    precio: item.precio,
    precio_tipo: item.precio_tipo || 'exacto',
    descripcion: item.descripcion || null,
    activo: true
  }))

  const { error } = await supabase
    .from('price_list')
    .insert(rows)

  if (error) return { success: false, error: error.message }
  return { success: true, total: rows.length }
}
