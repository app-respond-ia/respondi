import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import AdminLayout from '@/components/layout/AdminLayout'
import { getMisPermisos } from '@/app/actions/permisos'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('rol, nombre, activo')
    .eq('id', user.id)
    .single()

  if (!userData) redirect('/login')
  if (!userData.activo) redirect('/login?error=cuenta_inactiva')

  if (userData.rol === 'super_admin') redirect('/superadmin')
  if (userData.rol === 'vendedor') redirect('/vendedor')

  const permisosRes = await getMisPermisos()

  const esAdmin = userData.rol === 'admin' ||
    (permisosRes.success && (permisosRes as any).esAdmin) || false
  const permisos = (permisosRes.success && permisosRes.data) ? permisosRes.data : []

  return (
    <AdminLayout
      esAdmin={esAdmin}
      permisos={permisos}
      nombreUsuario={userData.nombre || user.email || ''}
    >
      {children}
    </AdminLayout>
  )
}
