'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { registrarAuditoria } from '@/lib/auditoria'

export interface NovedadData {
  tipo_id: string
  descripcion: string
  fecha_vigencia_inicio: string
  fecha_vigencia_fin: string | null
}

import { getAuthContext } from '@/lib/auth-context'

export async function getNovedades() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('daily_updates')
    .select('*, users (nombre, email)')
    .eq('branch_id', auth.branch_id)
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function crearNovedad(data: NovedadData) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Verificar límite diario de novedades
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('daily_updates')
    .select('*', { count: 'exact', head: true })
    .eq('branch_id', auth.branch_id)
    .gte('created_at', hoy.toISOString())

  if (count && count >= 20) {
    return { success: false, error: 'Has alcanzado el límite de 20 novedades por día.' }
  }

  let isActivo = true
  if (data.fecha_vigencia_fin !== null) {
    const fin = new Date(data.fecha_vigencia_fin).getTime()
    const ahora = new Date().getTime()
    isActivo = fin >= ahora
  }

  const { data: insertedData, error } = await supabase
    .from('daily_updates')
    .insert([{
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      user_id: auth.user_id,
      tipo_id: data.tipo_id,
      descripcion: data.descripcion,
      fecha_vigencia_inicio: data.fecha_vigencia_inicio,
      fecha_vigencia_fin: data.fecha_vigencia_fin,
      activo: isActivo
    }])
    .select('*, users (nombre, email)')
    .single()

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `publicó una novedad del día`,
    tabla_afectada: 'novedades',
    registro_id: insertedData.id,
    valor_nuevo: insertedData
  })

  return { success: true, data: insertedData }
}

export async function actualizarNovedad(id: string, data: Partial<NovedadData & { activo: boolean }>) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('daily_updates')
    .select('*')
    .eq('id', id)
    .single()

  if ('fecha_vigencia_fin' in data) {
    if (data.fecha_vigencia_fin === null) {
      data.activo = true
    } else {
      const fin = new Date(data.fecha_vigencia_fin!).getTime()
      const ahora = new Date().getTime()
      data.activo = fin >= ahora
    }
  }

  const { data: updatedData, error } = await supabase
    .from('daily_updates')
    .update(data)
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .select('*, users (nombre, email)')
    .single()

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: 'editó una novedad del día',
    tabla_afectada: 'novedades',
    registro_id: id,
    valor_anterior: anterior,
    valor_nuevo: updatedData
  })

  return { success: true, data: updatedData }
}

export async function eliminarNovedad(id: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: anterior } = await supabase
    .from('daily_updates')
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('daily_updates')
    .delete()
    .eq('id', id)
    .eq('branch_id', auth.branch_id)

  if (error) return { success: false, error: error.message }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: 'eliminó una novedad del día',
    tabla_afectada: 'novedades',
    registro_id: id,
    valor_anterior: anterior
  })

  return { success: true }
}
