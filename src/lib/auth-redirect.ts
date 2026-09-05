import { supabaseAdmin } from '@/utils/supabase/admin'
import type { User } from '@supabase/supabase-js'

export async function resolverAltaUsuario(userId: string, email: string, nombreFallback: string): Promise<{ manejado: boolean }> {
  const { data: invitacion } = await supabaseAdmin
    .from('invitaciones_pendientes')
    .select('*')
    .eq('email', email)
    .eq('aceptada', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!invitacion) {
    return { manejado: false }
  }

  if (invitacion.tipo === 'vendedor') {
    const datos = invitacion.datos as any

    await supabaseAdmin.from('users').insert({
      id: userId,
      email: email,
      nombre: datos.nombre || nombreFallback,
      rol: 'vendedor',
      activo: true,
      invitacion_aceptada: true
    })

    await supabaseAdmin.from('vendedores').insert({
      user_id: userId,
      nombre: datos.nombre || nombreFallback,
      email: email,
      comision_conversion_pct: datos.comision_conversion_pct ?? 10,
      comision_mrr_pct: datos.comision_mrr_pct ?? 5,
      telefono: datos.telefono || null,
      dni_nif: datos.dni_nif || null,
      direccion: datos.direccion || {},
      activo: true
    })
  }

  if (invitacion.tipo === 'admin_trial') {
    const datos = invitacion.datos as any

    const { data: orgId, error: rpcError } = await supabaseAdmin.rpc('crear_cuenta_completa', {
      p_user_id: userId,
      p_email: email,
      p_nombre: datos.nombre || nombreFallback,
      p_org_nombre: datos.nombre_organizacion
    })

    if (rpcError) {
      console.error('Error en crear_cuenta_completa vía invitación admin_trial:', rpcError)
      return { manejado: false }
    }

    if (datos.vendedor_id) {
      await supabaseAdmin
        .from('organizaciones')
        .update({ id_vendedor: datos.vendedor_id })
        .eq('id', orgId)

      await supabaseAdmin.from('vendedor_clientes').insert({
        vendedor_id: datos.vendedor_id,
        organizacion_id: orgId,
        estado_seguimiento: 'trial'
      })
    }
  }

  if (invitacion.tipo === 'usuario_organizacion') {
    const datos = invitacion.datos as any

    await supabaseAdmin.from('users').insert({
      id: userId,
      tenant_id: datos.tenant_id,
      branch_id: datos.branch_ids?.[0] || null,
      email: email,
      nombre: datos.nombre || nombreFallback,
      rol: 'tenant_user',
      rol_personalizado_id: datos.rol_personalizado_id,
      activo: true,
      invitacion_aceptada: true
    })

    if (datos.branch_ids && datos.branch_ids.length > 0) {
      await supabaseAdmin.from('user_branches').insert(
        datos.branch_ids.map((bid: string) => ({ user_id: userId, branch_id: bid }))
      )
    }
  }

  await supabaseAdmin
    .from('invitaciones_pendientes')
    .update({ aceptada: true })
    .eq('id', invitacion.id)

  return { manejado: true }
}

export async function determinarRedireccionPostAuth(user: User, type: string | null, next: string, origin: string): Promise<string> {
  if (type === 'recovery') {
    return `${origin}/restablecer-contrasena`
  }

  let { data: usersData, error: userQueryError } = await supabaseAdmin
    .from('users')
    .select('tenant_id, branch_id, rol, invitacion_aceptada')
    .or(`id.eq.${user.id},email.eq.${user.email}`)
    .limit(1)

  if (userQueryError) {
    console.error('Error consultando users en callback:', userQueryError, JSON.stringify(userQueryError))
  }

  let userData = usersData && usersData.length > 0 ? usersData[0] : null

  if (!userData) {
    const nombre = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario'

    const { manejado } = await resolverAltaUsuario(user.id, user.email!, nombre)

    if (!manejado) {
      const { error: rpcError } = await supabaseAdmin.rpc('create_trial_account', {
        p_user_id: user.id,
        p_email: user.email!,
        p_nombre: nombre,
        p_org_nombre: 'Organización de ' + nombre
      })

      if (rpcError) {
        console.error('Error en create_trial_account:', rpcError, JSON.stringify(rpcError))
        return `${origin}/login?error=account_setup_failed`
      }
    }

    const res = await supabaseAdmin
      .from('users')
      .select('tenant_id, branch_id, rol, invitacion_aceptada')
      .or(`id.eq.${user.id},email.eq.${user.email}`)
      .limit(1)
    userData = res.data && res.data.length > 0 ? res.data[0] : null
  }

  if (!userData) {
    return `${origin}/onboarding`
  }

  if (userData.invitacion_aceptada === false) {
    await supabaseAdmin
      .from('users')
      .update({ invitacion_aceptada: true, activo: true })
      .eq('id', user.id)

    return `${origin}/dashboard`
  }

  if (userData.rol === 'vendedor') {
    return `${origin}/vendedor`
  }

  if (userData.rol === 'super_admin') {
    return `${origin}/superadmin`
  }

  if (!userData.tenant_id) {
    return `${origin}/onboarding`
  }

  let branchId = userData.branch_id

  if (!branchId) {
    const { data: branch } = await supabaseAdmin
      .from('sucursales')
      .select('id, onboarding_completado')
      .eq('tenant_id', userData.tenant_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (branch) {
      branchId = branch.id
      await supabaseAdmin.from('users').update({ branch_id: branchId }).eq('id', user.id)

      if (!branch.onboarding_completado) {
        return `${origin}/onboarding`
      }
    } else {
      return `${origin}/onboarding`
    }
  } else {
    const { data: sucursal } = await supabaseAdmin
      .from('sucursales')
      .select('onboarding_completado')
      .eq('id', branchId)
      .single()

    if (!sucursal?.onboarding_completado) {
      return `${origin}/onboarding`
    }
  }

  if (next !== '/') {
    return `${origin}${next}`
  }

  return `${origin}/dashboard`
}
