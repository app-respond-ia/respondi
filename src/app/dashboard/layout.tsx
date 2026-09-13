import { redirect } from 'next/navigation'
import { estadoCreditos } from '@/lib/creditos'
import { createClient } from '@/utils/supabase/server'
import AdminLayout from '@/components/layout/AdminLayout'
import { getMisPermisos } from '@/app/actions/permisos'
import { resolveBranchId, sucursalesPermitidas } from '@/lib/active-branch'
import { getImpersonatedTenantId } from '@/lib/impersonate'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import { ToastProvider } from '@/components/ui/Toast'

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
    .select('rol, nombre, activo, tenant_id, apodo, avatar_url, color')
    .eq('id', user.id)
    .single()

  if (!userData) redirect('/login')
  if (!userData.activo) redirect('/login?error=cuenta_inactiva')

  let orgName = ''
  let isImpersonating = false

  if (userData.rol === 'super_admin') {
    const impId = await getImpersonatedTenantId()
    if (impId) {
      userData.tenant_id = impId
      isImpersonating = true
      
      const { data: org } = await supabase.from('organizaciones').select('nombre').eq('id', impId).single()
      if (org) orgName = org.nombre
    } else {
      redirect('/superadmin')
    }
  }

  if (userData.rol === 'vendedor') redirect('/vendedor')

  // El middleware ya obliga a terminar el onboarding, pero su redirección
  // sobre las peticiones de Server Actions dejaba al usuario atrapado en una
  // pantalla del panel cuyos datos nunca llegaban. Repetimos aquí la misma
  // comprobación para sacarlo antes de que se pinte nada.
  if (userData.rol === 'tenant_user' && userData.tenant_id) {
    const { data: primeraSucursal } = await supabase
      .from('sucursales')
      .select('onboarding_completado')
      .eq('tenant_id', userData.tenant_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (!primeraSucursal?.onboarding_completado) redirect('/onboarding')
  }

  // Permisos, tiendas del selector, tienda activa y créditos no dependen unos
  // de otros: se piden a la vez (antes iban uno detrás de otro y cada página
  // del panel tardaba más en empezar a pintarse).
  // La misma cuenta que Facturación y el inicio (src/lib/creditos.ts)
  const creditosDeLaOrganizacion = async () => {
    if (!userData?.tenant_id) return null
    const estado = await estadoCreditos(userData.tenant_id)
    return estado ? { saldo: estado.saldo, max: estado.max } : null
  }

  // La lista del selector sale de la misma regla que decide a qué tiendas se
  // puede entrar (también al impersonar: las de la organización impersonada).
  const [permisosRes, branches, sucursalActiva, creditos] = await Promise.all([
    getMisPermisos(),
    sucursalesPermitidas(supabase, user.id),
    resolveBranchId(supabase, user.id),
    creditosDeLaOrganizacion()
  ])
  const esAdmin = (permisosRes.success && (permisosRes as any).esAdmin) || false
  const permisos = (permisosRes.success && permisosRes.data) ? permisosRes.data : []
  const activeBranchId = sucursalActiva || ''

  return (
    <>
      {isImpersonating && <ImpersonationBanner orgName={orgName} />}
      <ToastProvider>
        <AdminLayout
          esAdmin={esAdmin}
          permisos={permisos}
          nombreUsuario={userData.nombre || user.email || ''}
          branches={branches}
          activeBranchId={activeBranchId}
          creditos={creditos}
          isImpersonating={isImpersonating}
          userId={user.id}
          apodo={userData.apodo}
          avatarUrl={userData.avatar_url}
          color={userData.color}
        >
          {children}
        </AdminLayout>
      </ToastProvider>
    </>
  )
}
