import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  let next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && sessionData.user) {
      const user = sessionData.user
      
      const cookieStore = await cookies()
      const pendingComercio = cookieStore.get('respondi_pending_trial')?.value

      if (pendingComercio) {
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
            p_comercio_nombre: pendingComercio
          })
          
          next = '/dashboard'
        }
      }

      // Preparamos la respuesta de redirección
      const response = NextResponse.redirect(`${origin}${next}`)
      
      // Importantísimo: propagar cookies para no perder sesión en Vercel Edge
      cookieStore.getAll().forEach((cookie) => {
        response.cookies.set(cookie.name, cookie.value, cookie)
      })

      // Borramos la cookie temporal de forma segura en la respuesta
      if (pendingComercio) {
        response.cookies.delete('respondi_pending_trial')
      }

      return response
    }
  }

  // Si hay error o no hay código, borramos la cookie por si acaso y redirigimos con error
  const errorResponse = NextResponse.redirect(`${origin}/login?error=AuthCallbackFailed`)
  errorResponse.cookies.delete('respondi_pending_trial')
  return errorResponse
}
