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

  // Obtener datos del usuario
  let { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id, rol, invitacion_aceptada')
    .eq('id', user.id)
    .single()

  // Si el usuario no existe en public.users (por ejemplo, primer inicio con Google OAuth), crear cuenta trial
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

  // Usuario no existe en tabla users todavía (puede pasar en race condition si el rpc falló)
  if (!userData) {
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  // Usuario invitado que aún no ha aceptado la invitación
  if (userData.invitacion_aceptada === false) {
    // Marcar invitación como aceptada
    await supabaseAdmin
      .from('users')
      .update({ invitacion_aceptada: true, activo: true })
      .eq('id', user.id)

    return NextResponse.redirect(`${origin}/dashboard`)
  }

  // Vendedor
  if (userData.rol === 'vendedor') {
    return NextResponse.redirect(`${origin}/vendedor`)
  }

  // Superadmin
  if (userData.rol === 'super_admin') {
    return NextResponse.redirect(`${origin}/superadmin`)
  }

  // Usuario sin tenant — va a onboarding
  if (!userData.tenant_id) {
    return NextResponse.redirect(`${origin}/onboarding`)
  }

  // Verificar onboarding completado
  let branchId = userData.branch_id

  if (!branchId) {
    const { data: branch } = await supabase
      .from('sucursales')
      .select('id, onboarding_completado')
      .eq('tenant_id', userData.tenant_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (branch) {
      branchId = branch.id
      await supabase.from('users').update({ branch_id: branchId }).eq('id', user.id)

      if (!branch.onboarding_completado) {
        return NextResponse.redirect(`${origin}/onboarding`)
      }
    } else {
      return NextResponse.redirect(`${origin}/onboarding`)
    }
  } else {
    const { data: sucursal } = await supabase
      .from('sucursales')
      .select('onboarding_completado')
      .eq('id', branchId)
      .single()

    if (!sucursal?.onboarding_completado) {
      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }

  // Todo correcto — ir al dashboard o al parámetro next
  if (next !== '/') {
    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
