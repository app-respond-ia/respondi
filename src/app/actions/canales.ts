'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', user_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a una organización', user_id: user.id }
  }

  const branchId = await resolveBranchId(supabase, user.id)
  if (!branchId) return { error: 'No hay sucursal activa', user_id: user.id }

  return { tenant_id: userData.tenant_id, branch_id: branchId, user_id: user.id }
}

export async function getCanales() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: canales, error } = await supabase
    .from('channels')
    .select('*')
    .eq('branch_id', auth.branch_id)
    .order('created_at', { ascending: true })

  if (error) return { success: false, error: error.message }

  const { data: organizacion } = await supabase
    .from('organizaciones')
    .select('plan_id, plans(canales_max)')
    .eq('id', auth.tenant_id)
    .single()
  const plan = Array.isArray(organizacion?.plans) ? organizacion.plans[0] : organizacion?.plans
  const canales_max = plan?.canales_max ?? null
  const canales_activos_count = (canales || []).filter((c: any) => c.estado === 'activo').length

  return { success: true, data: { canales, canales_max, canales_activos_count } }
}

export async function conectarCanal(tipo: 'instagram'|'whatsapp'|'facebook', metodo: 'whaticket'|'meta_oficial') {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: existing } = await supabase
    .from('channels')
    .select('id, estado')
    .eq('branch_id', auth.branch_id)
    .eq('tipo', tipo)
    .maybeSingle()

  if (existing) {
    if (existing.estado === 'desconectado' || existing.estado === 'error') {
      const { data, error } = await supabase
        .from('channels')
        .update({ estado: 'pendiente', metodo })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) return { success: false, error: error.message }
      return { success: true, data }
    } else {
      return { success: false, error: 'El canal ya está activo o pendiente' }
    }
  }

  const { data, error } = await supabase
    .from('channels')
    .insert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      tipo,
      metodo,
      estado: 'pendiente'
    })
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function desconectarCanal(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('channels')
    .update({ estado: 'desconectado' })
    .eq('id', id)
    .eq('branch_id', auth.branch_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}
