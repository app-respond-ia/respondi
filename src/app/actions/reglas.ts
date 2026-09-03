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

import { getAuthContext } from '@/lib/auth-context'

export async function getReglas() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('case_rules')
    .select('*')
    .eq('branch_id', auth.branch_id)
    .order('orden', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function crearRegla(data: ReglaData) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
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

  const { data: currentRules, error: fetchError } = await supabase
    .from('case_rules')
    .select('orden')
    .eq('branch_id', auth.branch_id)
    .order('orden', { ascending: true })
    .limit(1)

  if (fetchError) return { success: false, error: fetchError.message }

  const nuevoOrden = currentRules && currentRules.length > 0 ? currentRules[0].orden - 1 : 0

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
      prioridad_default: data.prioridad_default || 'normal',
      orden: nuevoOrden
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
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('case_rules')
    .select('*')
    .eq('id', id)
    .single()

  if (anterior?.es_protegida) return { success: false, error: 'Esta regla es del sistema y no se puede editar ni desactivar.' }

  // Calculate new lowest order to place edited rule at the top
  const { data: currentRules } = await supabase
    .from('case_rules')
    .select('orden')
    .eq('branch_id', auth.branch_id)
    .order('orden', { ascending: true })
    .limit(1)

  const nuevoOrden = currentRules && currentRules.length > 0 ? currentRules[0].orden - 1 : 0

  const { data: updatedData, error } = await supabase
    .from('case_rules')
    .update({ ...data, orden: nuevoOrden })
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
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('case_rules')
    .select('*')
    .eq('id', id)
    .single()

  if (anterior?.es_protegida) return { success: false, error: 'Esta regla es del sistema y no se puede eliminar.' }

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

export async function reordenarReglas(ids: string[]) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const { error } = await supabase
      .from('case_rules')
      .update({ orden: i })
      .eq('id', id)
      .eq('branch_id', auth.branch_id)
    
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
}

export async function crearReglasPlantilla() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
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
    },
    {
      nombre: "Documento no procesable",
      descripcion_intencion: "El cliente envía un archivo PDF, Word, o documento similar que no podemos procesar automáticamente.",
      tipo_caso: "documento_no_procesable"
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
