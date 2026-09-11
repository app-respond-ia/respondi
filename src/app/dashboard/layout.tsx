import { redirect } from 'next/navigation'
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

  const permisosRes = await getMisPermisos()
  const esAdmin = (permisosRes.success && (permisosRes as any).esAdmin) || false
  const permisos = (permisosRes.success && permisosRes.data) ? permisosRes.data : []

  // La lista del selector sale de la misma regla que decide a qué tiendas se
  // puede entrar (también al impersonar: las de la organización impersonada).
  const branches = await sucursalesPermitidas(supabase, user.id)
  const activeBranchId = await resolveBranchId(supabase, user.id) || ''

  let creditos = null
  if (userData?.tenant_id) {
    const [{ data: org }, { data: quotas }] = await Promise.all([
      supabase.from('organizaciones').select('trial_activo, plans!plan_id(creditos_diarios_trial, creditos_mensuales)').eq('id', userData.tenant_id).single(),
      supabase.from('message_quotas').select('saldo').eq('tenant_id', userData.tenant_id).order('timestamp', { ascending: false }).limit(1).maybeSingle()
    ])
    if (org) {
      const plan = Array.isArray(org.plans) ? org.plans[0] : org.plans
      const max = org.trial_activo ? plan?.creditos_diarios_trial : plan?.creditos_mensuales
      creditos = { saldo: quotas?.saldo || 0, max: max || 0 }
    }
  }

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
