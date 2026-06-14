'use server'

import { createClient } from '@/utils/supabase/server'

export async function getHorarios() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  // Obtener branch_id del usuario
  const { data: userData } = await supabase
    .from('users')
    .select('branch_id')
    .eq('id', user.id)
    .single()

  if (!userData?.branch_id) {
    return { success: false, error: 'Usuario no vinculado a una sucursal' }
  }

  // Obtener horarios de esa sucursal
  const { data: horarios, error } = await supabase
    .from('business_hours')
    .select('*')
    .eq('branch_id', userData.branch_id)
    .order('dia_semana', { ascending: true })

  if (error) return { success: false, error: error.message }

  // Si no hay horarios creados, devolver valores por defecto
  if (!horarios || horarios.length === 0) {
    const defaultHorarios = [
      { dia_semana: 1, apertura: '09:00', cierre: '18:00', cerrado: false },
      { dia_semana: 2, apertura: '09:00', cierre: '18:00', cerrado: false },
      { dia_semana: 3, apertura: '09:00', cierre: '18:00', cerrado: false },
      { dia_semana: 4, apertura: '09:00', cierre: '18:00', cerrado: false },
      { dia_semana: 5, apertura: '09:00', cierre: '18:00', cerrado: false },
      { dia_semana: 6, apertura: '09:00', cierre: '18:00', cerrado: true },
      { dia_semana: 0, apertura: '09:00', cierre: '18:00', cerrado: true }
    ]
    return { success: true, data: defaultHorarios }
  }

  return { success: true, data: horarios }
}

export async function saveHorarios(horarios: { dia_semana: number, apertura: string | null, cierre: string | null, cerrado: boolean }[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase
    .from('users')
    .select('branch_id')
    .eq('id', user.id)
    .single()

  if (!userData?.branch_id) {
    return { success: false, error: 'Usuario no vinculado a una sucursal' }
  }

  // 1. Borrar horarios actuales
  const { error: errorDelete } = await supabase
    .from('business_hours')
    .delete()
    .eq('branch_id', userData.branch_id)

  if (errorDelete) return { success: false, error: errorDelete.message }

  // 2. Preparar e insertar nuevos horarios
  const records = horarios.map(h => ({
    branch_id: userData.branch_id,
    dia_semana: h.dia_semana,
    apertura: h.apertura,
    cierre: h.cierre,
    cerrado: h.cerrado
  }))

  const { error: errorInsert } = await supabase
    .from('business_hours')
    .insert(records)

  if (errorInsert) return { success: false, error: errorInsert.message }

  return { success: true }
}
