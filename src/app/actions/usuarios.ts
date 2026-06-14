'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'

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

export async function getUsuarios() {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: sucursales, error: sucErr } = await supabase
    .from('sucursales')
    .select('id, nombre')
    .eq('tenant_id', auth.tenant_id)
  
  if (sucErr) return { success: false, error: sucErr.message }

  const { data: comercio, error: comErr } = await supabase
    .from('comercios')
    .select('plan_id, plans(nombre, usuarios_max)')
    .eq('id', auth.tenant_id)
    .single()

  if (comErr) return { success: false, error: comErr.message }

  // Acceder a usuarios_max y plan_nombre (si es array se toma el primero, si es objeto se toma la prop)
  let usuarios_max = null
  let plan_nombre = null
  if (comercio?.plans) {
    const plan = Array.isArray(comercio.plans) ? comercio.plans[0] : comercio.plans as any
    usuarios_max = plan?.usuarios_max ?? null
    plan_nombre = plan?.nombre ?? null
  }

  const { data: usuarios, error: usrErr } = await supabase
    .from('users')
    .select('*')
    .eq('tenant_id', auth.tenant_id)
    .order('fecha_creacion', { ascending: true })

  if (usrErr) return { success: false, error: usrErr.message }

  return { success: true, data: { usuarios, usuarios_max, plan_nombre, current_user_id: auth.user_id, sucursales } }
}

export async function invitarUsuario(data: { email: string, nombre: string | null, rol: 'agente' | 'operario', branch_id: string }) {
  if (data.rol !== 'agente' && data.rol !== 'operario') {
    return { success: false, error: 'Rol inválido. Solo se permite agente u operario.' }
  }

  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // Comprobar límite de usuarios
  const { data: config } = await getUsuarios()
  if (config?.usuarios && config.usuarios_max !== null && config.usuarios_max !== undefined) {
    if (config.usuarios.length >= config.usuarios_max) {
      return { success: false, error: 'Has alcanzado el límite de usuarios de tu plan' }
    }
  }

  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/aceptar-invitacion`
  })

  if (inviteError || !inviteData.user) {
    return { success: false, error: inviteError?.message || 'Error al invitar usuario' }
  }

  const { error: insertError } = await supabaseAdmin
    .from('users')
    .insert([{
      id: inviteData.user.id,
      tenant_id: auth.tenant_id,
      branch_id: data.branch_id,
      email: data.email,
      nombre: data.nombre || null,
      rol: data.rol,
      activo: true,
      invitacion_aceptada: false
    }])

  if (insertError) {
    await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
    return { success: false, error: insertError.message }
  }

  const { data: newUser } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', inviteData.user.id)
    .single()

  return { success: true, data: newUser }
}

export async function actualizarUsuario(id: string, data: Partial<{ nombre: string, rol: 'agente'|'operario', branch_id: string }>) {
  if (data.rol && data.rol !== 'agente' && data.rol !== 'operario') {
    return { success: false, error: 'No tienes permisos para asignar este rol' }
  }

  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: updated, error } = await supabase
    .from('users')
    .update({
      ...(data.nombre !== undefined && { nombre: data.nombre }),
      ...(data.rol && { rol: data.rol }),
      ...(data.branch_id && { branch_id: data.branch_id })
    })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select('*')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: updated }
}

export async function reenviarInvitacion(email: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: userRow } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .eq('tenant_id', auth.tenant_id)
    .eq('invitacion_aceptada', false)
    .single()

  if (!userRow) {
    return { success: false, error: 'No se encontró una invitación pendiente para ese email en tu comercio' }
  }

  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/aceptar-invitacion`
  })

  if (inviteError) {
    return { success: false, error: `No se pudo reenviar: ${inviteError.message}` }
  }

  return { success: true }
}

export async function desactivarUsuario(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: updated, error } = await supabase
    .from('users')
    .update({ activo: false })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select('*')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: updated }
}

export async function reactivarUsuario(id: string) {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: updated, error } = await supabase
    .from('users')
    .update({ activo: true })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select('*')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: updated }
}
