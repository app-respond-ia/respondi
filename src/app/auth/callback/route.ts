import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  if (code) {
    const supabase = await createClient()
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && sessionData.user) {
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/restablecer-contrasena`)
      }

      const user = sessionData.user
      
      // Comprobamos si el usuario ya existe en public.users
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!existingUser) {
        // Nuevo usuario: ejecutar transacción RPC atómica
        const nombre = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario'
        
        await supabaseAdmin.rpc('create_trial_account', {
          p_user_id: user.id,
          p_email: user.email!,
          p_nombre: nombre,
          p_comercio_nombre: 'Comercio de ' + nombre
        })
      }

      // En ambos casos (nuevo o existente), redirigimos a /onboarding.
      // El middleware se encargará de mandar a /dashboard si ya lo completó.
      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }

  // Si hay error o no hay código, redirigimos con error
  return NextResponse.redirect(`${origin}/login?error=AuthCallbackFailed`)
}
