import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import AdminLayout from '@/components/layout/AdminLayout'

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

  // 3. Obtener sucursales desde user_branches
  const { data: ubData } = await supabase
    .from('user_branches')
    .select('branch_id, sucursales(id, nombre)')
    .eq('user_id', user.id)
    .order('branch_id', { ascending: true })

  const branches = ((ubData || [])
    .map((ub: any) => {
      const s = Array.isArray(ub.sucursales) ? ub.sucursales[0] : ub.sucursales
      return s ? { id: s.id, nombre: s.nombre } : null
    })
    .filter(Boolean) as { id: string, nombre: string }[])

  // 4. Determinar sucursal activa (por cookie o la primera por defecto)
  const cookieStore = await cookies()
  const activeBranchCookie = cookieStore.get('respondi_active_branch')?.value
  
  let activeBranchId = ''
  if (branches.length > 0) {
    const isValidCookie = branches.some(b => b.id === activeBranchCookie)
    activeBranchId = isValidCookie && activeBranchCookie ? activeBranchCookie : branches[0].id
  }

  // 5. Preparar objeto de usuario para la UI
  const roleLabels: Record<string, string> = {
    super_admin: 'Super Administrador',
    admin: 'Administrador',
    agente: 'Agente',
    operario: 'Operario',
  }

  const initials = userData.nombre
    ? userData.nombre.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    : user.email?.substring(0, 2).toUpperCase() || 'U'

  const userForUI = {
    nombre: userData.nombre || user.email || 'Usuario',
    email: user.email || '',
    initials,
    roleName: roleLabels[userData.rol] || 'Usuario',
  }

  return (
    <AdminLayout user={userForUI} branches={branches} activeBranchId={activeBranchId}>
      {children}
    </AdminLayout>
  )
}
