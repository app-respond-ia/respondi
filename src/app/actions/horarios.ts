'use server'

import { sinPermiso } from '@/lib/permisos-servidor'
import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { registrarAuditoria } from '@/lib/auditoria'
import { getAuthContext } from '@/lib/auth-context'
import {
  validarHorarios,
  horariosARegistros,
  registrosAHorarios,
  type HorarioDia
} from '@/lib/horarios'

// OJO: en un archivo 'use server' NO se pueden reexportar tipos
// (`export type { ... }`). Next convierte todos los exports del módulo en
// referencias de servidor y al arrancar busca un valor real que no existe,
// así que el módulo entero revienta y se lleva por delante cualquier
// pantalla que lo importe. Los tipos se importan de '@/lib/horarios'.

export async function getHorarios(tipo: 'negocio' | 'ia' = 'negocio') {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const branchId = auth.branch_id

  const { data: rows, error } = await supabase
    .from('business_hours')
    .select('*')
    .eq('branch_id', branchId)
    .eq('tipo', tipo)
    .order('dia_semana', { ascending: true })
    .order('orden', { ascending: true })

  if (error) return { success: false, error: error.message }

  // Filas de business_hours → forma canónica (defaults incluidos si no hay filas)
  return { success: true, data: registrosAHorarios(rows) }
}

export async function saveHorarios(horarios: HorarioDia[], tipo: 'negocio' | 'ia' = 'negocio') {
  const denegado = await sinPermiso('perfil')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const branchId = auth.branch_id
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }

  const errorValidacion = validarHorarios(horarios)
  if (errorValidacion) return { success: false, error: errorValidacion }

  const { data: horariosAnteriores } = await supabase
    .from('business_hours')
    .select('*')
    .eq('branch_id', branchId)
    .eq('tipo', tipo)

  // Borrar horarios actuales
  const { error: errorDelete } = await supabase
    .from('business_hours')
    .delete()
    .eq('branch_id', branchId)
    .eq('tipo', tipo)

  if (errorDelete) return { success: false, error: errorDelete.message }

  const records = horariosARegistros(horarios, branchId!, tipo)

  const { error: errorInsert } = await supabase
    .from('business_hours')
    .insert(records)

  if (errorInsert) return { success: false, error: errorInsert.message }

  await registrarAuditoria({
    tenant_id: userData.tenant_id,
    user_id: user.id,
    accion: 'actualizó los horarios de atención',
    tabla_afectada: 'horarios',
    valor_anterior: horariosAnteriores,
    valor_nuevo: records
  })

  return { success: true }
}
