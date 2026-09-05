import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { determinarRedireccionPostAuth } from '@/lib/auth-redirect'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    // Si no hay 'code', podría ser un enlace antiguo o una invitación que envía el token en el fragmento (hash).
    // Devolvemos un pequeño HTML que revisa el hash en el cliente y redirige en consecuencia.
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script>
            if (window.location.hash.includes('access_token')) {
              window.location.href = '/auth/procesar-hash' + window.location.hash;
            } else {
              window.location.href = '/login?error=no_code';
            }
          </script>
        </head>
        <body>Procesando...</body>
      </html>
    `;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
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

  const destino = await determinarRedireccionPostAuth(user, type, next, origin)
  return NextResponse.redirect(destino)
}
