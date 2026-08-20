import { getImpersonatedTenantId } from '@/lib/impersonate'
import { resolveBranchId } from '@/lib/active-branch'

export async function getAuthContext(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id, rol')
    .eq('id', user.id)
    .single()
  
  let tenant_id = userData?.tenant_id
  let isImpersonating = false

  // Lógica de impersonación para super_admin
  if (userData?.rol === 'super_admin') {
    const impId = await getImpersonatedTenantId()
    if (impId) {
      tenant_id = impId
      isImpersonating = true
    }
  }

  if (!tenant_id) return { error: 'Usuario no vinculado a una organización' }

  // Buscamos branch_id
  let branch_id = await resolveBranchId(supabase, user.id)
  if (!branch_id && isImpersonating) {
    // Si el superadmin no tiene branch vinculada (lo normal), asignamos la primera del tenant
    const { data: branch } = await supabase
      .from('sucursales')
      .select('id')
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    if (branch) {
      branch_id = branch.id
    }
  }

  if (!branch_id) return { error: 'No se encontró sucursal válida para operar' }

  return { tenant_id, branch_id, user_id: user.id, isImpersonating }
}
