import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import AdminLayout from '@/components/layout/AdminLayout'
import { getMisPermisos } from '@/app/actions/permisos'
import { resolveBranchId } from '@/lib/active-branch'
import { getImpersonatedTenantId } from '@/lib/impersonate'
import ImpersonationBanner from '@/components/ImpersonationBanner'

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
    .select('rol, nombre, activo, tenant_id')
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

  const permisosRes = await getMisPermisos()
  const esAdmin = (permisosRes.success && (permisosRes as any).esAdmin) || false
  const permisos = (permisosRes.success && permisosRes.data) ? permisosRes.data : []

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

  const activeBranchId = await resolveBranchId(supabase, user.id) || ''

  let creditos = null
  if (userData?.tenant_id) {
    const [{ data: org }, { data: quotas }] = await Promise.all([
      supabase.from('organizaciones').select('trial_activo, plans(creditos_diarios_trial, creditos_mensuales)').eq('id', userData.tenant_id).single(),
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
      <AdminLayout
        esAdmin={esAdmin}
        permisos={permisos}
        nombreUsuario={userData.nombre || user.email || ''}
        branches={branches}
        activeBranchId={activeBranchId}
        creditos={creditos}
        isImpersonating={isImpersonating}
      >
        {children}
      </AdminLayout>
    </>
  )
}
