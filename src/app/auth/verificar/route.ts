import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { determinarRedireccionPostAuth } from '@/lib/auth-redirect'
import type { EmailOtpType } from '@supabase/supabase-js'

// Cache-bust: forzando invalidación de caché de Vercel para esta ruta (05/09/2026)

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=InvalidInviteLink`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=InvalidInviteLink`)
  }

  const destino = await determinarRedireccionPostAuth(data.user, type, next, origin)
  return NextResponse.redirect(destino)
}
