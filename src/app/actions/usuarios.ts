'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { canManageRole } from './roles'
import { registrarAuditoria } from '@/lib/auditoria'
import { enviarEmailInvitacion } from '@/lib/email'
import { registrarError } from '@/lib/errores'
import { emailValido, normalizarEmail } from '@/lib/invitaciones'

import { getAuthContext } from '@/lib/auth-context'

export async function getUsuarios() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: sucursales, error: sucErr } = await supabase
    .from('sucursales')
    .select('id, nombre')
    .eq('tenant_id', auth.tenant_id)
  
  if (sucErr) return { success: false, error: sucErr.message }

  const { data: organizacion, error: comErr } = await supabase
    .from('organizaciones')
    .select('plan_id, plans!plan_id(nombre, usuarios_max)')
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
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // El email es lo único que enlaza la invitación con el alta posterior: si
  // está mal escrito no sale el correo y la invitación no se puede aceptar
  // nunca. Mismo control que en las invitaciones de vendedor y de cliente.
  if (!emailValido(data.email)) {
    return { success: false, error: 'Introduce una dirección de email válida.' }
  }
  data = { ...data, email: normalizarEmail(data.email) }

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

  const { data: invitacionCreada, error: invitacionError } = await supabaseAdmin
    .from('invitaciones_pendientes')
    .insert({
      email: data.email,
      tipo: 'usuario_organizacion',
      datos: {
        nombre: data.nombre,
        tenant_id: auth.tenant_id,
        branch_ids: data.branch_ids,
        rol_personalizado_id: data.rol_personalizado_id
      },
      creado_por: auth.user_id
    })
    .select()
    .single()

  if (invitacionError) {
    await registrarError({
      origen: 'app',
      descripcion: 'invitarUsuario: fallo al crear la invitación',
      stacktrace: JSON.stringify({ email: data.email, error: invitacionError }),
      tenant_id: auth.tenant_id
    })
    return { success: false, error: 'Error al crear la invitación. Inténtalo de nuevo.' }
  }

  const { error: emailError } = await enviarEmailInvitacion({
    email: data.email,
    actionLink: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login`,
    rol: 'agente'
  })

  if (emailError) {
    await registrarError({
      origen: 'app',
      descripcion: 'Invitación de usuario creada pero fallo al enviar el email',
      stacktrace: JSON.stringify(emailError)
    })
  }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `invitó al usuario "${data.email}"`,
    tabla_afectada: 'invitaciones_pendientes',
    registro_id: invitacionCreada.id,
    valor_nuevo: { email: data.email, nombre: data.nombre }
  })

  return { success: true, pendiente: true }
}

export async function actualizarUsuario(id: string, data: Partial<{ nombre: string, branch_ids: string[], activo: boolean, rol_personalizado_id: string }>) {

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
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
    // Este bloque borraba y reinsertaba las sucursales del usuario sin mirar
    // si alguna de las dos operaciones fallaba. Si el borrado iba bien y la
    // inserción no, el usuario se quedaba SIN NINGUNA sucursal asignada y no
    // quedaba rastro en ningún sitio: ni error en pantalla ni en error_logs.
    const { error: errBorrado } = await supabaseAdmin.from('user_branches')
      .delete().eq('user_id', id)

    if (errBorrado) {
      await registrarError({
        origen: 'app',
        descripcion: 'actualizarUsuario: fallo al borrar las sucursales del usuario',
        stacktrace: JSON.stringify({ userId: id, error: errBorrado }),
        tenant_id: auth.tenant_id
      })
      return { success: false, error: 'No se pudieron actualizar las sucursales del usuario.' }
    }

    if (data.branch_ids.length > 0) {
      const { error: errInsercion } = await supabaseAdmin.from('user_branches').insert(
        data.branch_ids.map(bid => ({
          user_id: id, branch_id: bid
        }))
      )

      if (errInsercion) {
        await registrarError({
          origen: 'app',
          descripcion: 'actualizarUsuario: fallo al asignar sucursales (el usuario se ha quedado sin ninguna)',
          stacktrace: JSON.stringify({ userId: id, branch_ids: data.branch_ids, error: errInsercion }),
          tenant_id: auth.tenant_id
        })
        return { success: false, error: 'El usuario se ha quedado sin sucursales asignadas. Vuelve a asignárselas.' }
      }
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
  const auth = await getAuthContext(supabase)
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

