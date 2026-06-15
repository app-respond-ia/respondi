'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

export async function getPerfilComercio() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  // Obtener tenant_id y branch_id del usuario
  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id, rol')
    .eq('id', user.id)
    .single()
    
  if (!userData?.tenant_id) {
    return { success: false, error: 'Usuario no vinculado a un comercio' }
  }

  const branchId = await resolveBranchId(supabase, userData.tenant_id, userData.branch_id, userData.rol)
  if (!branchId) return { success: false, error: 'Usuario no vinculado a una sucursal' }

  // 1. Obtener datos de la sucursal
  const { data: sucursal } = await supabase
    .from('sucursales')
    .select('id, nombre, direccion, timezone')
    .eq('id', branchId)
    .eq('tenant_id', userData.tenant_id)
    .single()

  // 2. Obtener datos del business_profile
  const { data: businessProfile } = await supabase
    .from('business_profiles')
    .select('id, servicios, politicas, idioma_base, tono, msg_fuera_horario')
    .eq('branch_id', branchId)
    .single()

  return {
    success: true,
    data: {
      sucursal: sucursal || null,
      perfil: businessProfile || null
    }
  }
}

export async function savePerfilComercio(data: { 
  nombreSucursal: string, 
  direccion: string, 
  timezone: string, 
  servicios: string, 
  politicas: string, 
  idioma_base: string, 
  tono: string, 
  msg_fuera_horario: string 
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id, rol')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { success: false, error: 'Usuario no vinculado a un comercio' }
  }

  const branchId = await resolveBranchId(supabase, userData.tenant_id, userData.branch_id, userData.rol)
  if (!branchId) return { success: false, error: 'Usuario no vinculado a una sucursal' }

  // 1. Actualizar sucursales
  const { error: errorSucursal } = await supabase
    .from('sucursales')
    .update({
      nombre: data.nombreSucursal,
      direccion: data.direccion,
      timezone: data.timezone
    })
    .eq('id', branchId)
    .eq('tenant_id', userData.tenant_id)

  if (errorSucursal) return { success: false, error: errorSucursal.message }

  // 2. Comprobar si existe business_profile
  const { data: checkProfile } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('branch_id', branchId)
    .single()

  if (checkProfile) {
    // Actualizar
    const { error: errorProfile } = await supabase
      .from('business_profiles')
      .update({
        servicios: data.servicios,
        politicas: data.politicas,
        idioma_base: data.idioma_base,
        tono: data.tono,
        msg_fuera_horario: data.msg_fuera_horario
      })
      .eq('branch_id', branchId)
      
    if (errorProfile) return { success: false, error: errorProfile.message }
  } else {
    // Insertar
    const { error: errorInsert } = await supabase
      .from('business_profiles')
      .insert({
        branch_id: branchId,
        servicios: data.servicios,
        politicas: data.politicas,
        idioma_base: data.idioma_base,
        tono: data.tono,
        msg_fuera_horario: data.msg_fuera_horario
      })
      
    if (errorInsert) return { success: false, error: errorInsert.message }
  }

  return { success: true }
}
