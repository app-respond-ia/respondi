'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { data: authData, error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    return { error: error.message }
  }

  return { success: true, session: authData.session }
}

import { cookies } from 'next/headers'

export async function loginWithGoogle(nombreOrganizacion?: string) {
  if (nombreOrganizacion) {
    const cookieStore = await cookies()
    cookieStore.set('respondi_pending_trial', nombreOrganizacion, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60, // 1 hora
      path: '/'
    })
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  if (data.url) {
    return { url: data.url }
  }
}

export async function signupTrial(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const nombre = (formData.get('nombre') as string) || 'Usuario'
  const nombreOrganizacion = (formData.get('comercio') as string) || 'Mi organización'

  // 1. Crear el usuario en Auth (usamos admin porque queremos controlar el insert posterior)
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirmar en trial
  })

  if (authError || !authUser.user) {
    return { error: authError?.message || 'Error al crear usuario' }
  }

  const userId = authUser.user.id

  // 2. Transacción manual mediante RPC con Security Definer
  const { error: rpcError } = await supabaseAdmin.rpc('create_trial_account', {
    p_user_id: userId,
    p_email: email,
    p_nombre: nombre,
    p_org_nombre: nombreOrganizacion
  })

  if (rpcError) {
    // Si falla el RPC, borramos el usuario de Auth para hacer rollback
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return { error: rpcError.message }
  }

  // Iniciar sesión automáticamente
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.signInWithPassword({ email, password })

  return { success: true, redirectUrl: '/dashboard', session: authData.session }
}

export async function resetPasswordForEmail(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
  })

  if (error) return { error: error.message }
  return { success: 'Te hemos enviado un correo con instrucciones.' }
}

export async function updatePasswordAndAcceptInvite(formData: FormData) {
  const supabase = await createClient()
  const password = formData.get('password') as string
  const nombre = formData.get('nombre') as string

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) return { error: updateError.message }

  const { data: { user } } = await supabase.auth.getUser()
  
  if (user) {
    await supabaseAdmin
      .from('users')
      .update({ nombre, invitacion_aceptada: true })
      .eq('id', user.id)
  }

  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
