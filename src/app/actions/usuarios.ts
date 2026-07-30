'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { canManageRole } from './roles'
import { registrarAuditoria } from '@/lib/auditoria'

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

  const { data: organizacion, error: comErr } = await supabase
    .from('organizaciones')
    .select('plan_id, plans(nombre, usuarios_max)')
    .eq('id', auth.tenant_id)
    .single()

  if (comErr) return { success: false, error: comErr.message }

  // Acceder a usuarios_max y plan_nombre (si es array se toma el primero, si es objeto se toma la prop)
  let usuarios_max = null
  let plan_nombre = null
  if (organizacion?.plans) {
    const plan = Array.isArray(organizacion.plans) ? organizacion.plans[0] : organizacion.plans as any
    usuarios_max = plan?.usuarios_max ?? null
    plan_nombre = plan?.nombre ?? null
  }

  const { data: usuarios, error: usrErr } = await supabaseAdmin
    .from('users')
    .select('*, user_branches(branch_id), roles_personalizados(nombre, nivel, es_propietario)')
    .eq('tenant_id', auth.tenant_id)
    .order('fecha_creacion', { ascending: true })

  if (usrErr) return { success: false, error: usrErr.message }

  const usuarios_activos_count = (usuarios || []).filter((u: any) => u.activo).length

  return { success: true, data: { usuarios, usuarios_max, plan_nombre, current_user_id: auth.user_id, sucursales, usuarios_activos_count } }
}

export async function invitarUsuario(data: { email: string, nombre: string | null, branch_ids: string[], rol_personalizado_id: string }) {

  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: targetRole } = await supabaseAdmin
    .from('roles_personalizados')
    .select('nivel, tenant_id, es_propietario')
    .eq('id', data.rol_personalizado_id)
    .single()

  if (!targetRole || targetRole.tenant_id !== auth.tenant_id) return { success: false, error: 'Rol no válido' }
  if (targetRole.es_propietario) return { success: false, error: 'No puedes asignar el rol Propietario' }

  const check = await canManageRole(auth.user_id, targetRole.nivel, targetRole.tenant_id)
  if (!check.allowed) return { success: false, error: check.error }

  // Comprobar límite de usuarios
  const { data: config } = await getUsuarios()
  if (config?.usuarios && config.usuarios_max !== null && config.usuarios_max !== undefined) {
    if (config.usuarios_activos_count >= config.usuarios_max) {
      return { success: false, error: 'Has alcanzado el límite de usuarios de tu plan' }
    }
  }

  // Verificar si el email ya existe en Respondi
  const { data: userExistente } = await supabaseAdmin
    .from('users')
    .select('id, tenant_id')
    .eq('email', data.email)
    .single()

  if (userExistente) {
    if (userExistente.tenant_id === auth.tenant_id) {
      return { success: false, error: 'Este usuario ya pertenece a tu organización.' }
    }
    return { success: false, error: 'Este email ya tiene una cuenta en Respondi. Usa otro email.' }
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
      branch_id: data.branch_ids[0],
      email: data.email,
      nombre: data.nombre || null,
      rol: 'tenant_user',
      rol_personalizado_id: data.rol_personalizado_id,
      activo: true,
      invitacion_aceptada: false
    }])

  if (insertError) {
    await supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
    return { success: false, error: insertError.message }
  }

  await supabaseAdmin.from('user_branches').insert(
    data.branch_ids.map(bid => ({
      user_id: inviteData.user.id,
      branch_id: bid
    }))
  )

  const { data: newUser } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', inviteData.user.id)
    .single()

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `invitó al usuario "${data.email}"`,
    tabla_afectada: 'users',
    registro_id: inviteData.user.id,
    valor_nuevo: newUser
  })

  return { success: true, data: newUser }
}

export async function actualizarUsuario(id: string, data: Partial<{ nombre: string, branch_ids: string[], activo: boolean, rol_personalizado_id: string }>) {

  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: targetUser } = await supabaseAdmin
    .from('users')
    .select('*, roles_personalizados(nivel, es_propietario)')
    .eq('id', id)
    .single()

  if (!targetUser) return { success: false, error: 'Usuario no encontrado' }
  
  const targetRoleData = Array.isArray(targetUser.roles_personalizados) ? targetUser.roles_personalizados[0] : targetUser.roles_personalizados
  const currentTargetLevel = targetRoleData?.nivel ?? 5
  
  const userCheck = await canManageRole(auth.user_id, currentTargetLevel)
  if (!userCheck.allowed) return { success: false, error: 'No tienes jerarquía suficiente para editar a este usuario' }

  if (data.activo === false && targetRoleData?.es_propietario) {
    return { success: false, error: 'No puedes desactivar al Propietario de la organización.' }
  }

  if (data.rol_personalizado_id) {
    const { data: targetRole } = await supabaseAdmin
      .from('roles_personalizados')
      .select('nivel, tenant_id, es_propietario')
      .eq('id', data.rol_personalizado_id)
      .single()

    if (!targetRole || targetRole.tenant_id !== auth.tenant_id) return { success: false, error: 'Rol no válido' }
    if (targetRole.es_propietario) return { success: false, error: 'No puedes asignar el rol Propietario' }

    const check = await canManageRole(auth.user_id, targetRole.nivel, targetRole.tenant_id)
    if (!check.allowed) return { success: false, error: check.error }
  }

  const { data: updated, error } = await supabaseAdmin
    .from('users')
    .update({
      ...(data.nombre !== undefined && { nombre: data.nombre }),
      ...(data.activo !== undefined && { activo: data.activo }),
      ...(data.rol_personalizado_id !== undefined && { rol_personalizado_id: data.rol_personalizado_id }),
      ...(data.branch_ids && data.branch_ids.length > 0 && { branch_id: data.branch_ids[0] })
    })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .select('*')
    .single()

  if (error) return { success: false, error: error.message }

  if (data.branch_ids) {
    await supabaseAdmin.from('user_branches')
      .delete().eq('user_id', id)
    if (data.branch_ids.length > 0) {
      await supabaseAdmin.from('user_branches').insert(
        data.branch_ids.map(bid => ({
          user_id: id, branch_id: bid
        }))
      )
    }
  }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `editó al usuario "${updated.email}"`,
    tabla_afectada: 'users',
    registro_id: id,
    valor_anterior: targetUser,
    valor_nuevo: updated
  })

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
    return { success: false, error: 'No se encontró una invitación pendiente para ese email en tu organización' }
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

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `desactivó al usuario "${updated.email}"`,
    tabla_afectada: 'users',
    registro_id: id,
    valor_anterior: { activo: true },
    valor_nuevo: { activo: false }
  })

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

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `reactivó al usuario "${updated.email}"`,
    tabla_afectada: 'users',
    registro_id: id,
    valor_anterior: { activo: false },
    valor_nuevo: { activo: true }
  })

  return { success: true, data: updated }
}
