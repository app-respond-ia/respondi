'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

export interface BlacklistConfigData {
  blacklist_modo: 'ignorar' | 'respuesta_automatica' | 'derivar'
  blacklist_respuesta_auto: string | null
}

export interface BloquearContactoData {
  canal: 'instagram' | 'whatsapp' | 'facebook'
  identificador_canal: string
  nombre: string | null
  blacklist_razon: string
}

// Función auxiliar para obtener credenciales del usuario activo
async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', user_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id, rol')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a una organización', user_id: user.id }
  }

  const branchId = await resolveBranchId(supabase, user.id)
  if (!branchId) return { error: 'Usuario no vinculado a una sucursal', user_id: user.id }

  return { tenant_id: userData.tenant_id, branch_id: branchId, user_id: user.id }
}

export async function getBlacklistConfig() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('sucursales')
    .select('blacklist_modo, blacklist_respuesta_auto')
    .eq('id', auth.branch_id)
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function actualizarBlacklistConfig(data: BlacklistConfigData) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: updatedData, error } = await supabase
    .from('sucursales')
    .update({
      blacklist_modo: data.blacklist_modo,
      blacklist_respuesta_auto: data.blacklist_respuesta_auto
    })
    .eq('id', auth.branch_id)
    .select('blacklist_modo, blacklist_respuesta_auto')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: updatedData }
}

export async function getContactosBloqueados() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('tenant_id', auth.tenant_id)
    .eq('blacklist', true)
    .order('fecha_blacklist', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function bloquearContacto(data: BloquearContactoData) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // 1. Buscar si ya existe el contacto
  const { data: existing, error: searchError } = await supabase
    .from('contacts')
    .select('*')
    .eq('tenant_id', auth.tenant_id)
    .eq('canal', data.canal)
    .eq('identificador_canal', data.identificador_canal)
    .maybeSingle()

  if (searchError) return { success: false, error: searchError.message }

  const ahora = new Date().toISOString()

  if (existing) {
    // 2. Si existe, actualizar
    const updatePayload: any = {
      blacklist: true,
      blacklist_razon: data.blacklist_razon,
      fecha_blacklist: ahora
    }

    if (data.nombre) {
      updatePayload.nombre = data.nombre
    }

    const { data: updated, error: updateError } = await supabase
      .from('contacts')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('*')
      .single()

    if (updateError) return { success: false, error: updateError.message }
    return { success: true, data: updated }
  } else {
    // 3. Si no existe, insertar
    const { data: inserted, error: insertError } = await supabase
      .from('contacts')
      .insert([{
        tenant_id: auth.tenant_id,
        canal: data.canal,
        identificador_canal: data.identificador_canal,
        nombre: data.nombre || null,
        blacklist: true,
        blacklist_razon: data.blacklist_razon,
        fecha_blacklist: ahora
      }])
      .select('*')
      .single()

    if (insertError) return { success: false, error: insertError.message }
    return { success: true, data: inserted }
  }
}

export async function desbloquearContacto(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data, error } = await supabase
    .from('contacts')
    .update({ blacklist: false })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select('*')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}
