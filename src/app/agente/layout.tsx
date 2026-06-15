import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import AgenteSidebar from '@/components/AgenteSidebar'

export default async function AgenteLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // 1. Obtener sesión
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // 2. Obtener datos del usuario en public.users
  const { data: userData } = await supabase
    .from('users')
    .select('rol, nombre, branch_id')
    .eq('id', user.id)
    .single()

  if (!userData) {
    redirect('/login')
  }

  // Redirigir si no es agente
  if (userData.rol !== 'agente') {
    if (userData.rol === 'super_admin') redirect('/superadmin')
    if (userData.rol === 'admin') redirect('/dashboard')
    if (userData.rol === 'operario') redirect('/operario')
  }

  // 3. Obtener nombre de la sucursal (branch_id)
  let sucursalNombre = 'Sucursal'
  if (userData.branch_id) {
    const { data: branchData } = await supabase
      .from('sucursales')
      .select('nombre')
      .eq('id', userData.branch_id)
      .single()

    if (branchData) {
      sucursalNombre = branchData.nombre
    }
  }

  const userNombre = userData.nombre || user.email || 'Agente'

  return (
    <AgenteSidebar nombre={userNombre} sucursal={sucursalNombre}>
      {children}
    </AgenteSidebar>
  )
}
