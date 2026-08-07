'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { registrarAuditoria } from '@/lib/auditoria'

export interface ReglaData {
  nombre: string
  descripcion_intencion?: string
  tipo_caso?: string
  condicion?: string
  accion?: string
  activa: boolean
  prioridad_default?: string
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

  return { tenant_id: userData.tenant_id, branch_id: branchId, user_id: user.id }
}

export async function getReglas() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('case_rules')
    .select('*')
    .eq('branch_id', auth.branch_id)
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function crearRegla(data: ReglaData) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const condicion = data.condicion || data.descripcion_intencion
  const accion = data.accion || data.tipo_caso

  if (!data.nombre?.trim()) {
    return { success: false, error: 'El nombre de la regla es obligatorio.' }
  }
  if (!condicion?.trim()) {
    return { success: false, error: 'La condición de la regla es obligatoria.' }
  }
  if (!accion?.trim()) {
    return { success: false, error: 'La acción de la regla es obligatoria.' }
  }

  const { data: insertedData, error } = await supabase
    .from('case_rules')
    .insert([{
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      nombre: data.nombre,
      descripcion_intencion: condicion,
      tipo_caso: accion,
      activa: data.activa,
      es_plantilla: false,
      prioridad_default: data.prioridad_default || 'normal'
    }])
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `creó la regla de escalado "${data.nombre}"`,
    tabla_afectada: 'reglas',
    registro_id: insertedData.id,
    valor_nuevo: insertedData
  })

  return { success: true, data: insertedData }
}

export async function actualizarRegla(id: string, data: Partial<{ nombre: string, descripcion_intencion: string, tipo_caso: string, activa: boolean, prioridad_default: string }>) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('case_rules')
    .select('*')
    .eq('id', id)
    .single()

  const { data: updatedData, error } = await supabase
    .from('case_rules')
    .update(data)
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `editó la regla de escalado "${updatedData.nombre}"`,
    tabla_afectada: 'reglas',
    registro_id: id,
    valor_anterior: anterior,
    valor_nuevo: updatedData
  })

  return { success: true, data: updatedData }
}

export async function eliminarRegla(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('case_rules')
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('case_rules')
    .delete()
    .eq('id', id)
    .eq('branch_id', auth.branch_id)

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `eliminó la regla de escalado "${anterior?.nombre || id}"`,
    tabla_afectada: 'reglas',
    registro_id: id,
    valor_anterior: anterior
  })

  return { success: true }
}

export async function crearReglasPlantilla() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Verificar si ya existen reglas
  const { data: existentes, error: checkError } = await supabase
    .from('case_rules')
    .select('id')
    .eq('branch_id', auth.branch_id)
    .limit(1)

  if (checkError) return { success: false, error: checkError.message }
  if (existentes && existentes.length > 0) {
    return { success: false, error: 'Ya existen reglas para esta sucursal' }
  }

  const plantillas = [
    {
      nombre: "Cliente con reclamo",
      descripcion_intencion: "El cliente reclama, se queja, expresa insatisfacción con un producto o servicio, o reporta un problema.",
      tipo_caso: "reclamo"
    },
    {
      nombre: "Cliente quiere hablar con un humano",
      descripcion_intencion: "El cliente pide explícitamente hablar con una persona, con un encargado, o dice que no quiere seguir hablando con un bot.",
      tipo_caso: "derivacion_solicitada"
    },
    {
      nombre: "Pedido grande o al por mayor",
      descripcion_intencion: "El cliente consulta por pedidos grandes, al por mayor, para eventos, o solicita presupuesto personalizado.",
      tipo_caso: "venta_consultiva"
    },
    {
      nombre: "Tema sensible o fuera de competencia",
      descripcion_intencion: "El cliente pregunta sobre temas legales, médicos, fiscales, denuncias, o cualquier asunto delicado fuera de lo que el negocio puede responder.",
      tipo_caso: "tema_sensible"
    },
    {
      nombre: "Cliente molesto o agresivo",
      descripcion_intencion: "El tono del cliente es claramente molesto, agresivo, ofensivo, o muestra señales de mucha frustración.",
      tipo_caso: "atencion_urgente",
      prioridad_default: "alta"
    }
  ]

  const recordsToInsert = plantillas.map(p => ({
    tenant_id: auth.tenant_id,
    branch_id: auth.branch_id,
    ...p,
    es_plantilla: true,
    activa: true
  }))

  const { data, error } = await supabase
    .from('case_rules')
    .insert(recordsToInsert)
    .select()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}
