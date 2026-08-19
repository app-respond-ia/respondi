import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import SuperadminLayout from '@/components/layout/SuperadminLayout'

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // 1. Auth check
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session) {
    redirect('/login')
  }

  // 2. Verificar rol super_admin
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('rol, nombre')
    .eq('id', session.user.id)
    .single()

  if (userError || !userData || userData.rol !== 'super_admin') {
    redirect('/dashboard') // No tiene permisos, mandarlo a su dashboard normal
  }

  const nombreUsuario = userData.nombre || session.user.email || 'Atsura'
  const iniciales = nombreUsuario.substring(0, 2).toUpperCase()

  // 3. Obtener contador de tickets abiertos
  const { count } = await supabase
    .from('support_tickets')
    .select('*', { count: 'exact', head: true })
    .eq('estatus', 'abierto')

  return (
    <SuperadminLayout nombreUsuario={nombreUsuario} iniciales={iniciales} ticketsAbiertos={count || 0}>
      {children}
    </SuperadminLayout>
  )
}
