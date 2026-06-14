'use server'

import { createClient } from '@/utils/supabase/server'

export interface NovedadData {
  tipo: 'horario' | 'stock' | 'promo' | 'evento' | 'otro'
  descripcion: string
  fecha_vigencia_inicio: string
  fecha_vigencia_fin: string | null
}

// Función auxiliar para obtener credenciales del usuario activo
async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', user_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id || !userData?.branch_id) {
    return { error: 'Usuario no vinculado a una sucursal', user_id: user.id }
  }

  return { tenant_id: userData.tenant_id, branch_id: userData.branch_id, user_id: user.id }
}

export async function getNovedades() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
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
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: insertedData, error } = await supabase
    .from('daily_updates')
    .insert([{
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      user_id: auth.user_id,
      tipo: data.tipo,
      descripcion: data.descripcion,
      fecha_vigencia_inicio: data.fecha_vigencia_inicio,
      fecha_vigencia_fin: data.fecha_vigencia_fin,
      activo: true
    }])
    .select('*, users (nombre, email)')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: insertedData }
}

export async function actualizarNovedad(id: string, data: Partial<NovedadData & { activo: boolean }>) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

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
  return { success: true, data: updatedData }
}
