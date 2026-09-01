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
  categoria_id: string | null
  etiquetas: string[]
  visible_ia: boolean
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
      categoria_id: data.categoria_id || null,
      etiquetas: data.etiquetas || [],
      visible_ia: data.visible_ia ?? true
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

  // 1. Cargar las categorías existentes de la sucursal en memoria
  const { data: categoriasActuales, error: catError } = await supabase
    .from('categorias_precios')
    .select('id, nombre, parent_id')
    .eq('branch_id', auth.branch_id)
    
  if (catError) return { success: false, error: catError.message }

  // Mapa en memoria para búsquedas rápidas ignorando mayúsculas/minúsculas
  // Clave: "parent_id|nombre_en_minusculas" (usamos "root" para categorías padre)
  const categoryCache = new Map<string, string>()
  for (const cat of (categoriasActuales || [])) {
    const parentKey = cat.parent_id || 'root'
    categoryCache.set(`${parentKey}|${cat.nombre.toLowerCase().trim()}`, cat.id)
  }

  const rowsToInsert = []

  // 2. Iterar sobre los ítems para procesar y crear categorías on-the-fly
  for (const item of items) {
    let finalCategoriaId = null

    // Si tiene categoría definida
    if (item.categoria?.trim()) {
      const rootCatName = item.categoria.trim()
      const rootCatKey = `root|${rootCatName.toLowerCase()}`
      let rootCatId = categoryCache.get(rootCatKey)
      
      // Si la categoría raíz no existe en memoria, la creamos en BD
      if (!rootCatId) {
        const { data: newRootCat, error: insertRootErr } = await supabase
          .from('categorias_precios')
          .insert([{ 
            tenant_id: auth.tenant_id, 
            branch_id: auth.branch_id, 
            nombre: rootCatName, 
            parent_id: null 
          }])
          .select('id')
          .single()

        if (insertRootErr) return { success: false, error: insertRootErr.message }
        rootCatId = newRootCat.id
        categoryCache.set(rootCatKey, rootCatId!) // Actualizamos caché
      }

      finalCategoriaId = rootCatId

      // Si también tiene subcategoría definida
      if (item.subcategoria?.trim()) {
        const subCatName = item.subcategoria.trim()
        const subCatKey = `${rootCatId}|${subCatName.toLowerCase()}`
        let subCatId = categoryCache.get(subCatKey)
        
        // Si la subcategoría no existe en memoria, la creamos en BD
        if (!subCatId) {
          const { data: newSubCat, error: insertSubErr } = await supabase
            .from('categorias_precios')
            .insert([{ 
              tenant_id: auth.tenant_id, 
              branch_id: auth.branch_id, 
              nombre: subCatName, 
              parent_id: rootCatId 
            }])
            .select('id')
            .single()

          if (insertSubErr) return { success: false, error: insertSubErr.message }
          subCatId = newSubCat.id
          categoryCache.set(subCatKey, subCatId!) // Actualizamos caché
        }

        finalCategoriaId = subCatId
      }
    }

    // Añadimos la fila lista para insertar en price_list
    rowsToInsert.push({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      nombre: item.nombre,
      tipo: item.tipo || 'producto',
      precio: item.precio,
      precio_tipo: item.precio_tipo || 'exacto',
      categoria_id: finalCategoriaId,
      etiquetas: [],
      visible_ia: true,
      descripcion: item.descripcion || null,
      disponible: true
    })
  }

  // 3. Insertar todos los productos masivamente con sus UUIDs
  const { error: insertError } = await supabase
    .from('price_list')
    .insert(rowsToInsert)

  if (insertError) return { success: false, error: insertError.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `importó ${rowsToInsert.length} ítems a la lista de precios desde un archivo`,
    tabla_afectada: 'precios',
    valor_nuevo: { total_importados: rowsToInsert.length }
  })

  return { success: true, total: rowsToInsert.length }
}
