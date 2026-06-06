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

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    return { error: error.message }
  }

  redirect('/') // El middleware lo redirigirá al panel correcto
}

export async function loginWithGoogle() {
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
    redirect(data.url)
  }
}

export async function signupTrial(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const nombre = formData.get('nombre') as string
  const comercioNombre = formData.get('comercio') as string

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

  // 2. Transacción manual simulada (ya que no hay RPC para esto configurado)
  // Crear comercio
  const { data: comercio, error: comercioError } = await supabaseAdmin
    .from('comercios')
    .insert({
      nombre: comercioNombre,
      estado: 'trial',
      trial_activo: true,
      // fecha_inicio y fecha_vencimiento (14 días) se podrían setear aquí
    })
    .select()
    .single()

  if (comercioError) return { error: comercioError.message }

  // Crear sucursal
  const { data: sucursal, error: sucursalError } = await supabaseAdmin
    .from('sucursales')
    .insert({
      tenant_id: comercio.id,
      nombre: 'Principal',
    })
    .select()
    .single()

  if (sucursalError) return { error: sucursalError.message }

  // Insertar en public.users
  const { error: userError } = await supabaseAdmin
    .from('users')
    .insert({
      id: userId,
      tenant_id: comercio.id,
      branch_id: sucursal.id,
      email: email,
      nombre: nombre,
      rol: 'admin',
      invitacion_aceptada: true, // Es el creador, ya aceptado
    })

  if (userError) return { error: userError.message }

  // Iniciar sesión automáticamente
  const supabase = await createClient()
  await supabase.auth.signInWithPassword({ email, password })

  redirect('/dashboard')
}

export async function resetPasswordForEmail(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/aceptar-invitacion`,
  })

  if (error) return { error: error.message }
  return { success: 'Te hemos enviado un correo con instrucciones.' }
}

export async function updatePasswordAndAcceptInvite(formData: FormData) {
  const supabase = await createClient()
  const password = formData.get('password') as string
  const nombre = formData.get('nombre') as string

  // Actualizar contraseña en Auth
  const { error: updateError } = await supabase.auth.updateUser({
    password,
  })

  if (updateError) return { error: updateError.message }

  // Obtener usuario actual
  const { data: { user } } = await supabase.auth.getUser()
  
  if (user) {
    // Actualizar nombre y estado de invitación en public.users
    await supabaseAdmin
      .from('users')
      .update({ nombre, invitacion_aceptada: true })
      .eq('id', user.id)
  }

  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
