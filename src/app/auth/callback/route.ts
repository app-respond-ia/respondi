import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=callback_error`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/login`)
  }

  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/restablecer-contrasena`)
  }

  let { data: userData, error: userQueryError } = await supabaseAdmin
    .from('users')
    .select('tenant_id, branch_id, rol, invitacion_aceptada')
    .eq('id', user.id)
    .single()

  if (userQueryError) {
    console.error('Error consultando users en callback:', userQueryError.message, userQueryError.code)
  }

  if (!userData) {
    const nombre = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario'
    const { error: rpcError } = await supabaseAdmin.rpc('create_trial_account', {
      p_user_id: user.id,
      p_email: user.email!,
      p_nombre: nombre,
      p_org_nombre: 'Organización de ' + nombre
    })

    if (rpcError) {
      console.error('Error en create_trial_account:', rpcError.message)
      return NextResponse.redirect(`${origin}/login?error=account_setup_failed`)
    }

    const res = await supabaseAdmin
      .from('users')
      .select('tenant_id, branch_id, rol, invitacion_aceptada')
      .eq('id', user.id)
      .single()
    userData = res.data
  }

  if (!userData) {
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  if (userData.invitacion_aceptada === false) {
    await supabaseAdmin
      .from('users')
      .update({ invitacion_aceptada: true, activo: true })
      .eq('id', user.id)

    return NextResponse.redirect(`${origin}/dashboard`)
  }

  if (userData.rol === 'vendedor') {
    return NextResponse.redirect(`${origin}/vendedor`)
  }

  if (userData.rol === 'super_admin') {
    return NextResponse.redirect(`${origin}/superadmin`)
  }

  if (!userData.tenant_id) {
    return NextResponse.redirect(`${origin}/onboarding`)
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
        return NextResponse.redirect(`${origin}/onboarding`)
      }
    } else {
      return NextResponse.redirect(`${origin}/onboarding`)
    }
  } else {
    const { data: sucursal } = await supabaseAdmin
      .from('sucursales')
      .select('onboarding_completado')
      .eq('id', branchId)
      .single()

    if (!sucursal?.onboarding_completado) {
      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }

  if (next !== '/') {
    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
