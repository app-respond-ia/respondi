import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/app/actions/superadmin'
import { superadminHasPermission } from '@/lib/permisosSuperadmin'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  const auth = await requireSuperAdmin()
  if (!superadminHasPermission(auth, 'soporte_clientes', 'lectura')) {
    redirect('/superadmin')
  }
  return <>{children}</>
}
