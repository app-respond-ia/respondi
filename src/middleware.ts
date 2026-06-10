import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Update session
  const { supabaseResponse, user, supabase } = await updateSession(request)

  const { pathname } = request.nextUrl

  // Rutas públicas que no requieren autenticación
  const publicRoutes = ['/login', '/registro-trial', '/recuperar-contrasena', '/aceptar-invitacion', '/auth/callback']
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route)) || pathname === '/'

  // Rutas protegidas por rol
  const protectedRoutes = ['/dashboard', '/superadmin', '/agente', '/operario', '/onboarding']
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route))

  // Función helper para redirigir copiando las cookies
  const redirectWithCookies = (url: URL | string) => {
    const response = NextResponse.redirect(new URL(url, request.url))
    // Importantísimo: propagar cookies para no perder sesión en Vercel Edge
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value, cookie)
    })
    return response
  }

  // Si no hay usuario y trata de acceder a una ruta protegida
  if (!user && isProtectedRoute) {
    return redirectWithCookies('/login')
  }

  // Si hay usuario, verificamos su rol para enrutamiento
  if (user && (isPublicRoute || isProtectedRoute)) {
    // Obtenemos el rol desde la tabla public.users
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('rol, tenant_id')
      .eq('id', user.id)
      .single()

    const role = userData?.rol

    // Determinar la ruta base según el rol
    let roleBasePath = ''
    if (role === 'super_admin') roleBasePath = '/superadmin'
    else if (role === 'admin') roleBasePath = '/dashboard'
    else if (role === 'agente') roleBasePath = '/agente'
    else if (role === 'operario') roleBasePath = '/operario'

    // Onboarding obligatorio para admins
    if (role === 'admin' && userData?.tenant_id) {
      const { data: comercio } = await supabase
        .from('comercios')
        .select('onboarding_completado')
        .eq('id', userData.tenant_id)
        .single()

      const onboardingCompleto = comercio?.onboarding_completado ?? false

      // Si no completó el onboarding y no está ya en /onboarding → mandarlo al onboarding
      if (!onboardingCompleto && !pathname.startsWith('/onboarding')) {
        return redirectWithCookies('/onboarding')
      }

      // Si ya completó el onboarding y está en /onboarding → mandarlo al dashboard
      if (onboardingCompleto && pathname.startsWith('/onboarding')) {
        return redirectWithCookies('/dashboard')
      }
    }

    // Si el usuario está logueado pero no tiene registro en public.users
    // significa que inició sesión con Google sin haber pasado por el trial o invitación.
    if (!roleBasePath && isPublicRoute && pathname !== '/registro-trial') {
      return redirectWithCookies('/registro-trial')
    }

    // Si está en una ruta pública (ej. login) y está autenticado, lo mandamos a su panel
    if (isPublicRoute && roleBasePath) {
      return redirectWithCookies(roleBasePath)
    }

    // Si está en una ruta protegida, validar que coincida con su rol
    if (isProtectedRoute && roleBasePath && !pathname.startsWith(roleBasePath) && !pathname.startsWith('/onboarding')) {
      return redirectWithCookies(roleBasePath)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
