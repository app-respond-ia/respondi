'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { registrarAuditoria } from '@/lib/auditoria'
import { getAuthContext } from '@/lib/auth-context'

export type Franja = {
  apertura: string
  cierre: string
  orden: number
}

export type HorarioDia = {
  dia_semana: number
  cerrado: boolean
  franjas: Franja[]
}

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

  // Agrupar por dia_semana → HorarioDia[]
  const diasMap: Record<number, HorarioDia> = {}

  if (!rows || rows.length === 0) {
    // Defaults: lun-vie abierto 09-18, sáb-dom cerrado
    const defaults = [1,2,3,4,5,6,0].map(dia => ({
      dia_semana: dia,
      cerrado: dia === 6 || dia === 0,
      franjas: [{ apertura: '09:00', cierre: '18:00', orden: 0 }]
    }))
    return { success: true, data: defaults }
  }

  for (const row of rows) {
    if (!diasMap[row.dia_semana]) {
      diasMap[row.dia_semana] = {
        dia_semana: row.dia_semana,
        cerrado: row.cerrado,
        franjas: []
      }
    }
    if (!row.cerrado) {
      diasMap[row.dia_semana].franjas.push({
        apertura: row.apertura || '09:00',
        cierre: row.cierre || '18:00',
        orden: row.orden || 0
      })
    }
    // Si está cerrado, aseguramos que cerrado=true
    if (row.cerrado) {
      diasMap[row.dia_semana].cerrado = true
    }
  }

  // Asegurar que los días cerrados tengan al menos una franja vacía para la UI
  for (const dia of [1,2,3,4,5,6,0]) {
    if (!diasMap[dia]) {
      diasMap[dia] = { dia_semana: dia, cerrado: true, franjas: [{ apertura: '09:00', cierre: '18:00', orden: 0 }] }
    }
    if (diasMap[dia].franjas.length === 0) {
      diasMap[dia].franjas = [{ apertura: '09:00', cierre: '18:00', orden: 0 }]
    }
  }

  const result = [1,2,3,4,5,6,0].map(dia => diasMap[dia])
  return { success: true, data: result }
}

export async function saveHorarios(horarios: HorarioDia[], tipo: 'negocio' | 'ia' = 'negocio') {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const branchId = auth.branch_id
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }

  // Validar que apertura < cierre en cada franja
  for (const h of horarios) {
    if (!h.cerrado) {
      for (const franja of h.franjas) {
        if (franja.apertura && franja.cierre && franja.apertura >= franja.cierre) {
          return { success: false, error: `El horario de apertura debe ser anterior al de cierre (día ${h.dia_semana}).` }
        }
      }
    }
  }

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

  // Construir registros: si cerrado → 1 fila con cerrado=true, si abierto → 1 fila por franja
  const records: any[] = []

  for (const h of horarios) {
    if (h.cerrado) {
      records.push({
        branch_id: branchId,
        dia_semana: h.dia_semana,
        apertura: null,
        cierre: null,
        cerrado: true,
        orden: 0,
        tipo
      })
    } else {
      h.franjas.forEach((f, idx) => {
        records.push({
          branch_id: branchId,
          dia_semana: h.dia_semana,
          apertura: f.apertura.length === 5 ? `${f.apertura}:00` : f.apertura,
          cierre: f.cierre.length === 5 ? `${f.cierre}:00` : f.cierre,
          cerrado: false,
          orden: idx,
          tipo
        })
      })
    }
  }

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
