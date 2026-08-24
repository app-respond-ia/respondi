import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/app/actions/superadmin'
import { superadminHasPermission } from '@/lib/permisosSuperadmin'

export default async function SuperadminRolesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const auth = await requireSuperAdmin()
  if (!superadminHasPermission(auth, 'gestion_superadmins', 'escritura')) {
    redirect('/superadmin')
  }

  return <>{children}</>
}
