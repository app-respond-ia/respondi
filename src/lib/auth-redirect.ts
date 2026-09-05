import { supabaseAdmin } from '@/utils/supabase/admin'
import type { User } from '@supabase/supabase-js'

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
