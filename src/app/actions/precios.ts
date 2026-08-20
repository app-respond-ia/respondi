'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { registrarAuditoria } from '@/lib/auditoria'

export interface PrecioData {
  nombre: string
  tipo: 'producto' | 'servicio'
  precio: number | null
  precio_tipo: 'exacto' | 'desde' | 'consultar'
  moneda: string
  descripcion: string | null
  disponible: boolean
  categoria: string | null
  subcategoria: string | null
}

import { getAuthContext } from '@/lib/auth-context'

export async function getPrecios() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
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
  const auth = await getAuthContext(supabase)
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
      disponible: data.disponible,
      categoria: data.categoria || null,
      subcategoria: data.subcategoria || null
    }])
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `añadió el ítem "${data.nombre}" a la lista de precios`,
    tabla_afectada: 'precios',
    registro_id: insertedData.id,
    valor_nuevo: insertedData
  })

  return { success: true, data: insertedData }
}

export async function actualizarPrecio(id: string, data: Partial<PrecioData>) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('price_list')
    .select('*')
    .eq('id', id)
    .single()

  const { data: updatedData, error } = await supabase
    .from('price_list')
    .update(data)
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `editó el ítem "${updatedData.nombre}" de la lista de precios`,
    tabla_afectada: 'precios',
    registro_id: id,
    valor_anterior: anterior,
    valor_nuevo: updatedData
  })

  return { success: true, data: updatedData }
}

export async function eliminarPrecio(id: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('price_list')
    .select('*')
    .eq('id', id)
    .single()

  // Se fuerza validación eq('branch_id', auth.branch_id) por seguridad
  const { error } = await supabase
    .from('price_list')
    .delete()
    .eq('id', id)
    .eq('branch_id', auth.branch_id)

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `eliminó el ítem "${anterior?.nombre || id}" de la lista de precios`,
    tabla_afectada: 'precios',
    registro_id: id,
    valor_anterior: anterior
  })

  return { success: true }
}

export async function importarPreciosMasivo(items: {
  nombre: string
  tipo: string
  precio: number | null
  precio_tipo: string
  categoria?: string | null
  subcategoria?: string | null
  descripcion: string | null
}[]) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  if (!items || items.length === 0) return { success: false, error: 'No hay ítems para importar' }

  const rows = items.map(item => ({
    tenant_id: auth.tenant_id,
    branch_id: auth.branch_id,
    nombre: item.nombre,
    tipo: item.tipo || 'producto',
    precio: item.precio,
    precio_tipo: item.precio_tipo || 'exacto',
    categoria: item.categoria || null,
    subcategoria: item.subcategoria || null,
    descripcion: item.descripcion || null,
    disponible: true
  }))

  const { error } = await supabase
    .from('price_list')
    .insert(rows)

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `importó ${rows.length} ítems a la lista de precios desde un archivo`,
    tabla_afectada: 'precios',
    valor_nuevo: { total_importados: rows.length }
  })

  return { success: true, total: rows.length }
}
