import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import OperarioLayout from '@/components/layout/OperarioLayout'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // 1. Obtener sesión
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // 2. Obtener datos del usuario en public.users
  const { data: userData } = await supabase
    .from('users')
    .select('*, comercios(nombre)')
    .eq('id', user.id)
    .single()

  if (!userData) {
    redirect('/login')
  }

  // 3. Obtener nombre de la sucursal del operario
  let nombreSucursal = ''
  if (userData.branch_id) {
    const { data: sucursalData } = await supabase
      .from('sucursales')
      .select('nombre')
      .eq('id', userData.branch_id)
      .single()
    if (sucursalData) {
      nombreSucursal = sucursalData.nombre
    }
  }

  // 4. Preparar objeto de usuario para la UI
  const initials = userData.nombre
    ? userData.nombre.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    : user.email?.substring(0, 2).toUpperCase() || 'U'

  const userForUI = {
    nombre: userData.nombre || user.email || 'Usuario',
    email: user.email || '',
    initials,
    roleName: 'Operario',
    nombreSucursal
  }

  return (
    <OperarioLayout user={userForUI}>
      {children}
    </OperarioLayout>
  )
}
