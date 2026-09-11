'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { COOKIE_SUCURSAL_ACTIVA, sucursalesPermitidas } from '@/lib/active-branch'

export async function setActiveBranch(branchId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  // Solo se puede elegir una tienda en la que se puede trabajar. (La app lo
  // vuelve a comprobar en cada petición, pero así no se guarda basura.)
  const permitidas = await sucursalesPermitidas(supabase, user.id)
  if (!permitidas.some(s => s.id === branchId)) {
    return { success: false, error: 'No tienes acceso a esa sucursal.' }
  }

  const cookieStore = await cookies()

  // Guardamos la sucursal activa en una cookie que expira en 30 días
  cookieStore.set(COOKIE_SUCURSAL_ACTIVA, branchId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  // Refresca todo el layout para que los Server Components lean la nueva sucursal
  revalidatePath('/', 'layout')
  return { success: true }
}
