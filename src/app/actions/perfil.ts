'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { registrarAuditoria } from '@/lib/auditoria'
import { getAuthContext } from '@/lib/auth-context'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/utils/supabase/admin'

export async function getPerfilSucursal() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const branchId = auth.branch_id
  const userData = { tenant_id: auth.tenant_id }

  // 1. Obtener datos de la sucursal
  const { data: sucursal } = await supabase
    .from('sucursales')
    .select('id, nombre, direccion, pais, timezone')
    .eq('id', branchId)
    .eq('tenant_id', userData.tenant_id)
    .single()

  // 2. Obtener datos del business_profile
  const { data: businessProfile } = await supabase
    .from('business_profiles')
    .select('id, servicios, politicas, idioma_base, tono, msg_fuera_horario, caso_fuera_horario, modo_horario_ia')
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

export async function savePerfilSucursal(data: { 
  nombreSucursal: string, 
  direccion: string, 
  pais: string,
  timezone: string, 
  servicios: string, 
  politicas: {titulo: string, descripcion: string}[], 
  idioma_base: string, 
  tono: string, 
  msg_fuera_horario: string,
  caso_fuera_horario: boolean,
  modo_horario_ia: string
}) {
  if (data.servicios && data.servicios.length > 500) {
    return { success: false, error: 'La información del negocio no puede superar los 500 caracteres.' }
  }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const branchId = auth.branch_id
  const userData = { tenant_id: auth.tenant_id }
  const user = { id: auth.user_id }

  const { data: sucursalAnterior } = await supabase
    .from('sucursales')
    .select('nombre, direccion, timezone')
    .eq('id', branchId)
    .single()

  const { data: perfilAnterior } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('branch_id', branchId)
    .single()

  // 1. Actualizar sucursales
  const { error: errorSucursal } = await supabase
    .from('sucursales')
    .update({
      nombre: data.nombreSucursal,
      direccion: data.direccion,
      pais: data.pais,
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
        msg_fuera_horario: data.msg_fuera_horario,
        caso_fuera_horario: data.caso_fuera_horario,
        modo_horario_ia: data.modo_horario_ia
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
        msg_fuera_horario: data.msg_fuera_horario,
        caso_fuera_horario: data.caso_fuera_horario,
        modo_horario_ia: data.modo_horario_ia
      })
      
    if (errorInsert) return { success: false, error: errorInsert.message }
  }

  await registrarAuditoria({
    tenant_id: userData.tenant_id,
    user_id: user.id,
    accion: 'actualizó el perfil de la sucursal',
    tabla_afectada: 'perfil',
    registro_id: branchId,
    valor_anterior: { ...sucursalAnterior, ...perfilAnterior },
    valor_nuevo: data
  })

  return { success: true }
}


export async function actualizarPerfilCliente(nombre: string, apodo: string, avatarUrl: string, color: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ 
      nombre: nombre.trim(), 
      apodo: apodo.trim() || null, 
      avatar_url: avatarUrl,
      color
    })
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }
  
  revalidatePath('/dashboard', 'layout')
  
  return { success: true }
}

export async function cambiarContrasenaCliente(password: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { success: false, error: error.message }
  return { success: true }
}
