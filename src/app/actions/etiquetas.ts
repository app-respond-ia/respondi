'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

export interface EtiquetaData {
  nombre: string
  descripcion_intencion?: string
  color: string
  activa: boolean
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

  const branchId = await resolveBranchId(supabase, user.id)
  if (!branchId) return { error: 'Usuario no vinculado a una sucursal' }

  return { tenant_id: userData.tenant_id, branch_id: branchId }
}

export async function getEtiquetas() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // 1. Obtener etiquetas
  const { data: etiquetas, error } = await supabase
    .from('message_categories')
    .select('*')
    .eq('branch_id', auth.branch_id)
    .order('orden', { ascending: true })

  if (error) return { success: false, error: error.message }
  if (!etiquetas) return { success: true, data: [] }

  // 2. Obtener recuento de aplicaciones este mes
  const now = new Date()
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const dataConRecuento = await Promise.all(
    etiquetas.map(async (etiqueta) => {
      const { count } = await supabase
        .from('conversation_tags')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', etiqueta.id)
        .gte('created_at', firstDayOfMonth)
      
      return {
        ...etiqueta,
        aplicadas_este_mes: count || 0
      }
    })
  )

  return { success: true, data: dataConRecuento }
}

export async function crearEtiqueta(data: EtiquetaData) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Calcular el máximo orden actual
  const { data: currentTags, error: fetchError } = await supabase
    .from('message_categories')
    .select('orden')
    .eq('branch_id', auth.branch_id)
    .order('orden', { ascending: false })
    .limit(1)

  if (fetchError) return { success: false, error: fetchError.message }

  const nuevoOrden = currentTags && currentTags.length > 0 ? currentTags[0].orden + 1 : 0

  const { data: insertedData, error } = await supabase
    .from('message_categories')
    .insert([{
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      nombre: data.nombre,
      descripcion_intencion: data.descripcion_intencion,
      color: data.color,
      activa: data.activa,
      es_plantilla: false,
      orden: nuevoOrden
    }])
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: { ...insertedData, aplicadas_este_mes: 0 } }
}

export async function actualizarEtiqueta(id: string, data: Partial<{ nombre: string, descripcion_intencion: string, color: string, activa: boolean, orden: number }>) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: updatedData, error } = await supabase
    .from('message_categories')
    .update(data)
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  
  // No devolvemos aplicadas_este_mes modificado porque no cambia en un update de metadata
  return { success: true, data: updatedData }
}

export async function eliminarEtiqueta(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { error } = await supabase
    .from('message_categories')
    .delete()
    .eq('id', id)
    .eq('branch_id', auth.branch_id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function reordenarEtiquetas(ids: string[]) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const { error } = await supabase
      .from('message_categories')
      .update({ orden: i })
      .eq('id', id)
      .eq('branch_id', auth.branch_id)
    
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
}

export async function crearEtiquetasPlantilla() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Verificar si ya existen etiquetas
  const { data: existentes, error: checkError } = await supabase
    .from('message_categories')
    .select('id')
    .eq('branch_id', auth.branch_id)
    .limit(1)

  if (checkError) return { success: false, error: checkError.message }
  if (existentes && existentes.length > 0) {
    return { success: false, error: 'Ya existen etiquetas para esta sucursal' }
  }

  const plantillas = [
    { nombre: "Reclamo", color: "amber", descripcion_intencion: "El cliente reclama, se queja, reporta un problema o expresa insatisfacción con un producto o servicio.", orden: 0 },
    { nombre: "Consulta de precio", color: "purple", descripcion_intencion: "El cliente pregunta por el precio, costo o tarifa de un producto o servicio.", orden: 1 },
    { nombre: "Disponibilidad", color: "blue", descripcion_intencion: "El cliente pregunta si hay stock, disponibilidad o existencias de un producto.", orden: 2 },
    { nombre: "Pedido", color: "emerald", descripcion_intencion: "El cliente quiere hacer un pedido, comprar o encargar algo.", orden: 3 },
    { nombre: "Reserva", color: "pink", descripcion_intencion: "El cliente quiere reservar, agendar o programar una cita, mesa o servicio.", orden: 4 },
    { nombre: "Información general", color: "slate", descripcion_intencion: "El cliente pide información general sobre el negocio, horarios, ubicación o servicios.", orden: 5 },
    { nombre: "Devolución", color: "red", descripcion_intencion: "El cliente quiere devolver, cambiar o solicitar un reembolso por un producto.", orden: 6 },
    { nombre: "Otros", color: "slate-d", descripcion_intencion: "El mensaje no encaja claramente en ninguna otra categoría.", orden: 7 }
  ]

  const recordsToInsert = plantillas.map(p => ({
    tenant_id: auth.tenant_id,
    branch_id: auth.branch_id,
    nombre: p.nombre,
    color: p.color,
    descripcion_intencion: p.descripcion_intencion,
    orden: p.orden,
    es_plantilla: true,
    activa: true
  }))

  const { data, error } = await supabase
    .from('message_categories')
    .insert(recordsToInsert)
    .select()

  if (error) return { success: false, error: error.message }

  // Add aplicadas_este_mes so it matches getEtiquetas format
  const dataConRecuento = data.map(d => ({ ...d, aplicadas_este_mes: 0 }))
  
  return { success: true, data: dataConRecuento }
}
