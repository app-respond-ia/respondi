'use server'

import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { resolverAltaUsuario } from '@/lib/auth-redirect'

// --- Fix Bug C: Registro Trial (con validación de email duplicado y rollback) ---
export async function registroTrial(data: {
  email: string
  password: string
  nombre: string
  nombreNegocio: string
}) {
  const supabase = await createClient()

  // Verificar si el email ya existe antes de llamar al RPC
  const { data: userExistente } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', data.email)
    .single()

  if (userExistente) {
    return { success: false, error: 'Este email ya tiene una cuenta en Respondi. Inicia sesión o usa otro email.' }
  }

  // Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true
  })

  if (authError || !authData?.user) {
    const msg = authError?.message || ''
    if (msg.includes('already registered') || msg.includes('already exists')) {
      return { success: false, error: 'Este email ya tiene una cuenta en Respondi. Inicia sesión o usa otro email.' }
    }
    return { success: false, error: msg || 'Error al crear la cuenta. Inténtalo de nuevo.' }
  }

  const userId = authData.user.id

  // Esperar a que Auth propague el usuario antes de llamar al RPC
  await new Promise(resolve => setTimeout(resolve, 1000))

  const { manejado, fallo } = await resolverAltaUsuario(userId, data.email, data.nombre)

  // Tenía invitación pero el alta se rompió a mitad. No seguimos adelante
  // creando una organización suelta: perdería la vinculación con el vendedor
  // que lo trajo (y su comisión) sin que nadie llegue a enterarse.
  if (fallo) {
    return { success: false, error: 'No se pudo completar el alta desde tu invitación. Avísanos y lo revisamos.' }
  }

  if (!manejado) {
    const { error: rpcError } = await supabaseAdmin.rpc('crear_cuenta_completa', {
      p_user_id: userId,
      p_email: data.email,
      p_nombre: data.nombre,
      p_org_nombre: data.nombreNegocio
    })

    if (rpcError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return { success: false, error: 'Error al configurar la cuenta. Inténtalo de nuevo.' }
    }
  }


  // Iniciar sesión automáticamente
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password
  })

  if (signInError) {
    return { success: false, error: 'Cuenta creada pero error al iniciar sesión. Intenta iniciar sesión manualmente.' }
  }

  return { success: true, redirectUrl: '/dashboard', session: signInData.session }
}

// Compatibilidad con formularios existentes de registro (SignupForm.tsx)
// Datos mínimos de una invitación para pintar la pantalla de registro.
// Se consulta por id (un uuid que solo viaja en el enlace del correo) y solo
// devuelve el email y el nombre del negocio: nada más sale de aquí.
//
// Existe porque el email es lo único que enlaza la invitación con el alta. Si
// la persona se registraba escribiendo su correo con cualquier variación, se
// le creaba una organización suelta, sin vincular al vendedor que la trajo y
// sin la configuración que este había dejado preparada. Ahora el email viene
// dado y no se puede tocar.
export async function getInvitacionParaRegistro(id: string) {
  const { data } = await supabaseAdmin
    .from('invitaciones_pendientes')
    .select('email, datos, aceptada, tipo')
    .eq('id', id)
    .eq('aceptada', false)
    .maybeSingle()

  if (!data) return null

  const datos = (data.datos as any) || {}
  let nombre_organizacion: string | null = datos.nombre_organizacion || null

  // A un agente se le invita a una organización que ya existe, así que el
  // nombre hay que buscarlo; en las de cliente viene en la propia invitación.
  if (!nombre_organizacion && datos.tenant_id) {
    const { data: org } = await supabaseAdmin
      .from('organizaciones')
      .select('nombre')
      .eq('id', datos.tenant_id)
      .maybeSingle()
    nombre_organizacion = org?.nombre || null
  }

  return {
    email: data.email,
    tipo: data.tipo as 'admin_trial' | 'vendedor' | 'usuario_organizacion',
    nombre_organizacion
  }
}

export async function signupTrial(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const nombre = (formData.get('nombre') as string) || 'Usuario'
  const nombreNegocio = (formData.get('comercio') as string) || 'Mi organización'

  const res = await registroTrial({ email, password, nombre, nombreNegocio })
  if (!res.success) return { error: res.error }
  return { success: true, redirectUrl: '/dashboard', session: res.session }
}

// --- Fix Bug C: Login con mensajes de error descriptivos ---
export async function loginUser(data: { email: string, password: string }) {
  const supabase = await createClient()

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password
  })

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      return { success: false, error: 'Email o contraseña incorrectos.' }
    }
    if (error.message.includes('Email not confirmed')) {
      return { success: false, error: 'Confirma tu email antes de iniciar sesión.' }
    }
    return { success: false, error: error.message }
  }

  return { success: true, session: authData.session }
}

// Compatibilidad con LoginForm.tsx
export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const res = await loginUser({ email, password })
  if (!res.success) return { error: res.error }
  return { success: true, session: res.session }
}

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

// --- Fix Bug C: Logout ---
export async function logoutUser() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return { success: true }
}

// Compatibilidad con componentes que usan signOut()
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

// --- Fix Bug C: Recuperación y restablecimiento de contraseña ---
export async function recuperarContrasena(email: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/restablecer-contrasena`
  })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// Compatibilidad con RecoveryForm.tsx
export async function resetPasswordForEmail(formData: FormData) {
  const email = formData.get('email') as string
  const res = await recuperarContrasena(email)
  if (!res.success) return { error: res.error }
  return { success: 'Te hemos enviado un correo con instrucciones.' }
}

export async function restablecerContrasena(password: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// --- Fix Bug B: Aceptación de invitación y activación de usuario ---
export async function updatePasswordAndAcceptInvite(formData: FormData) {
  const supabase = await createClient()
  const password = formData.get('password') as string
  const nombre = formData.get('nombre') as string

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) return { error: updateError.message }

  const { data: { user } } = await supabase.auth.getUser()
  
  let redirectUrl = '/dashboard'

  if (user) {
    const updateData: any = { invitacion_aceptada: true, activo: true }
    if (nombre) updateData.nombre = nombre

    const { data: userData } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', user.id)
      .select('rol')
      .single()
      
    if (userData?.rol === 'super_admin') redirectUrl = '/superadmin'
    else if (userData?.rol === 'vendedor') redirectUrl = '/vendedor'
  }

  return { success: true, redirectUrl }
}
