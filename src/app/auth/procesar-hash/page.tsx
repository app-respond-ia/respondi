'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function ProcesarHashPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    
    // Al instanciarse, el cliente de Supabase lee automáticamente el hash de la URL 
    // (si detectSessionInUrl no está deshabilitado) y establece la sesión.
    // Solo necesitamos esperar a que termine.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Redirigir a /aceptar-invitacion
        router.replace('/aceptar-invitacion')
      } else {
        router.replace('/login?error=InvalidInviteLink')
      }
    })
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
        <p className="text-ink-600 font-500 text-sm animate-pulse">Procesando invitación...</p>
      </div>
    </div>
  )
}
