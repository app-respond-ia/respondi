'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { registrarAuditoria } from '@/lib/auditoria'

export interface TipoNovedadData {
  id?: string
  nombre: string
  icono: string
  color: string
}

import { getAuthContext } from '@/lib/auth-context'

export async function getTiposNovedad() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('tipos_novedad')
    .select('*')
    .eq('branch_id', auth.branch_id)
    .order('created_at', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function crearTipoNovedad(data: TipoNovedadData) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: insertedData, error } = await supabase
    .from('tipos_novedad')
    .insert([{
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      nombre: data.nombre,
      icono: data.icono,
      color: data.color
    }])
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `creó un nuevo tipo de novedad: ${data.nombre}`,
    tabla_afectada: 'tipos_novedad',
    registro_id: insertedData.id,
    valor_nuevo: insertedData
  })

  return { success: true, data: insertedData }
}

export async function actualizarTipoNovedad(id: string, data: TipoNovedadData) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('tipos_novedad')
    .select('*')
    .eq('id', id)
    .single()

  const { data: updatedData, error } = await supabase
    .from('tipos_novedad')
    .update({
      nombre: data.nombre,
      icono: data.icono,
      color: data.color
    })
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `editó el tipo de novedad: ${data.nombre}`,
    tabla_afectada: 'tipos_novedad',
    registro_id: id,
    valor_anterior: anterior,
    valor_nuevo: updatedData
  })

  return { success: true, data: updatedData }
}

export async function eliminarTipoNovedad(id: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('tipos_novedad')
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('tipos_novedad')
    .delete()
    .eq('id', id)
    .eq('branch_id', auth.branch_id)

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `eliminó el tipo de novedad: ${anterior?.nombre || 'desconocido'}`,
    tabla_afectada: 'tipos_novedad',
    registro_id: id,
    valor_anterior: anterior
  })

  return { success: true }
}
