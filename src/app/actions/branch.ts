'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function setActiveBranch(branchId: string) {
  const cookieStore = await cookies()
  
  // Guardamos la sucursal activa en una cookie que expira en 30 días
  cookieStore.set('respondi_active_branch', branchId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, 
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  // Refresca todo el layout para que los Server Components lean la nueva sucursal
  revalidatePath('/', 'layout')
}
