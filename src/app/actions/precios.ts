'use server'

import { sinPermiso } from '@/lib/permisos-servidor'
import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { registrarAuditoria } from '@/lib/auditoria'

export interface PrecioData {
  nombre: string
  tipo: 'producto' | 'servicio'
  precio: number | null
  precio_tipo: 'exacto' | 'desde' | 'consultar'
  // Si no viene, se usa la de la sucursal (se elige al configurar el negocio)
  moneda?: string
  descripcion: string | null
  disponible: boolean
  categoria_id: string | null
  etiquetas: string[]
  visible_ia: boolean
  // Reservas (agenda): solo si `reservable`
  reservable?: boolean
  duracion_minutos?: number | null
  tiempo_antes_minutos?: number
  tiempo_despues_minutos?: number
  huecos_internos?: { desde_minuto: number; minutos: number }[]
  tipo_recurso?: string | null
  recursos_necesarios?: number
  aforo?: number | null
  precio_por_persona?: boolean
  extras?: { nombre: string; precio?: number; minutos?: number }[]
  cancelacion_horas?: number | null
  confirmacion?: 'automatica' | 'manual' | null
  reservable_online?: boolean
}

// Los campos de reserva, limpios y con sus límites. Devuelve un mensaje si
// algo no cuadra (un servicio reservable sin duración, por ejemplo).
function camposDeReserva(data: Partial<PrecioData>): { campos: Record<string, any>; error?: string } {
  const campos: Record<string, any> = {}
  const entero = (v: any, min: number, max: number, porDefecto: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : porDefecto
  }
  if (data.reservable !== undefined) campos.reservable = !!data.reservable
  if (data.duracion_minutos !== undefined) campos.duracion_minutos = data.duracion_minutos === null || data.duracion_minutos === ('' as any) ? null : entero(data.duracion_minutos, 5, 1440, 30)
  if (data.tiempo_antes_minutos !== undefined) campos.tiempo_antes_minutos = entero(data.tiempo_antes_minutos, 0, 240, 0)
  if (data.tiempo_despues_minutos !== undefined) campos.tiempo_despues_minutos = entero(data.tiempo_despues_minutos, 0, 240, 0)
  if (data.huecos_internos !== undefined) campos.huecos_internos = (Array.isArray(data.huecos_internos) ? data.huecos_internos : []).filter(h => h && Number(h.minutos) > 0).slice(0, 5).map(h => ({ desde_minuto: entero(h.desde_minuto, 0, 1440, 0), minutos: entero(h.minutos, 1, 1440, 1) }))
  if (data.tipo_recurso !== undefined) campos.tipo_recurso = ['persona', 'mesa', 'sala', 'equipo', 'otro'].includes(String(data.tipo_recurso)) ? data.tipo_recurso : null
  if (data.recursos_necesarios !== undefined) campos.recursos_necesarios = entero(data.recursos_necesarios, 1, 10, 1)
  if (data.aforo !== undefined) campos.aforo = data.aforo ? entero(data.aforo, 1, 1000, 1) : null
  if (data.precio_por_persona !== undefined) campos.precio_por_persona = !!data.precio_por_persona
  if (data.extras !== undefined) campos.extras = (Array.isArray(data.extras) ? data.extras : []).filter(e => e && String(e.nombre || '').trim()).slice(0, 20).map(e => ({ nombre: String(e.nombre).trim().slice(0, 60), ...(e.precio !== undefined && e.precio !== null && e.precio !== ('' as any) ? { precio: Math.max(0, Number(e.precio) || 0) } : {}), ...(e.minutos ? { minutos: entero(e.minutos, 0, 600, 0) } : {}) }))
  if (data.cancelacion_horas !== undefined) campos.cancelacion_horas = data.cancelacion_horas === null || data.cancelacion_horas === ('' as any) ? null : entero(data.cancelacion_horas, 0, 720, 24)
  if (data.confirmacion !== undefined) campos.confirmacion = data.confirmacion === 'automatica' || data.confirmacion === 'manual' ? data.confirmacion : null
  if (data.reservable_online !== undefined) campos.reservable_online = data.reservable_online !== false
  if (campos.reservable && !campos.duracion_minutos && data.duracion_minutos !== undefined) return { campos, error: 'Un servicio reservable necesita una duración (en minutos).' }
  return { campos }
}

import { getAuthContext } from '@/lib/auth-context'

// La moneda de la sucursal, que es la que se usa en su lista de precios. La
// pantalla no la mandaba y la columna no admite vacío: crear un producto con
// precio fallaba con un error de base de datos ("null value in column moneda").
async function monedaDeLaSucursal(supabase: any, branchId?: string | null) {
  if (!branchId) return 'EUR'
  const { data } = await supabase.from('sucursales').select('moneda').eq('id', branchId).maybeSingle()
  return data?.moneda || 'EUR'
}

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
  const denegado = await sinPermiso('precios')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Cada campo con su valor por defecto si no viene: un `undefined` aquí
  // llegaba a la base de datos como vacío y las columnas obligatorias lo
  // rechazaban (pasaba con la moneda y con "disponible")
  const fila: Record<string, any> = {
    tenant_id: auth.tenant_id,
    branch_id: auth.branch_id,
    nombre: (data.nombre || '').trim(),
    tipo: data.tipo || 'producto',
    precio: data.precio_tipo === 'consultar' ? null : (data.precio ?? null),
    precio_tipo: data.precio_tipo || 'exacto',
    moneda: data.moneda || (await monedaDeLaSucursal(supabase, auth.branch_id)),
    descripcion: data.descripcion || null,
    disponible: data.disponible ?? true,
    categoria_id: data.categoria_id || null,
    etiquetas: data.etiquetas || [],
    visible_ia: data.visible_ia ?? true,
    ...camposDeReserva(data).campos
  }
  if (!fila.nombre) return { success: false, error: 'El nombre es obligatorio.' }
  if (fila.reservable && !fila.duracion_minutos) return { success: false, error: 'Un servicio reservable necesita una duración (en minutos).' }
  if (fila.precio !== null && (typeof fila.precio !== 'number' || isNaN(fila.precio) || fila.precio < 0)) {
    return { success: false, error: 'El precio tiene que ser un número positivo.' }
  }
  if (fila.precio === null && fila.precio_tipo !== 'consultar') {
    return { success: false, error: 'Pon el precio o marca el tipo "a consultar".' }
  }

  const { data: insertedData, error } = await supabase
    .from('price_list')
    .insert([fila])
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
  const denegado = await sinPermiso('precios')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('price_list')
    .select('*')
    .eq('id', id)
    .single()

  // Sin quitar lo que no venga: `update` con campos a undefined los pondría a
  // vacío y la moneda no lo admite
  const cambios: Record<string, any> = {}
  for (const [k, v] of Object.entries(data)) if (v !== undefined) cambios[k] = v
  if ('moneda' in cambios && !cambios.moneda) cambios.moneda = await monedaDeLaSucursal(supabase, auth.branch_id)
  // Los campos de reserva pasan por su limpieza
  const reserva = camposDeReserva(data)
  Object.assign(cambios, reserva.campos)
  const reservable = cambios.reservable ?? anterior?.reservable
  const duracion = cambios.duracion_minutos !== undefined ? cambios.duracion_minutos : anterior?.duracion_minutos
  if (reservable && !duracion) return { success: false, error: 'Un servicio reservable necesita una duración (en minutos).' }

  const { data: updatedData, error } = await supabase
    .from('price_list')
    .update(cambios)
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
  const denegado = await sinPermiso('precios')
  if (denegado) return { success: false, error: denegado }

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
  const denegado = await sinPermiso('precios')
  if (denegado) return { success: false, error: denegado }

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

  const monedaSucursal = await monedaDeLaSucursal(supabase, auth.branch_id)
  const rowsToInsert: Record<string, any>[] = []

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
      moneda: monedaSucursal,
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

  // 3. Guardar. La plantilla que se descarga trae los productos que el negocio
  //    ya tiene, así que importarla otra vez duplicaba TODA la lista. Ahora lo
  //    que ya existe (mismo nombre en esa sucursal, sin distinguir mayúsculas)
  //    se actualiza y solo se crea lo nuevo.
  const { data: existentes } = await supabase
    .from('price_list')
    .select('id, nombre')
    .eq('branch_id', auth.branch_id)

  const porNombre = new Map((existentes || []).map((e: any) => [e.nombre.trim().toLowerCase(), e.id]))
  const nuevas = []
  let actualizados = 0

  for (const fila of rowsToInsert) {
    const id = porNombre.get(String(fila.nombre).trim().toLowerCase())
    if (id) {
      const { error } = await supabase
        .from('price_list')
        .update({
          tipo: fila.tipo,
          precio: fila.precio,
          precio_tipo: fila.precio_tipo,
          moneda: fila.moneda,
          categoria_id: fila.categoria_id,
          descripcion: fila.descripcion
        })
        .eq('id', id)
        .eq('branch_id', auth.branch_id)
      if (error) return { success: false, error: error.message }
      actualizados++
    } else {
      nuevas.push(fila)
    }
  }

  if (nuevas.length > 0) {
    const { error: insertError } = await supabase.from('price_list').insert(nuevas)
    if (insertError) return { success: false, error: insertError.message }
  }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `importó una lista de precios desde un archivo: ${nuevas.length} nuevos y ${actualizados} actualizados`,
    tabla_afectada: 'precios',
    valor_nuevo: { nuevos: nuevas.length, actualizados }
  })

  return { success: true, total: rowsToInsert.length, nuevos: nuevas.length, actualizados }
}
