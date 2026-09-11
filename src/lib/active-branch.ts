import { cookies } from 'next/headers'
import { getImpersonatedTenantId } from '@/lib/impersonate'

// La tienda (sucursal) con la que está trabajando el usuario ahora mismo.
//
// El selector de la cabecera guarda la elegida en esta cookie. Antes aquí se
// leía otra (`active_branch_id`) que nadie escribía, así que el selector no
// cambiaba nada y todos trabajaban siempre en su tienda por defecto.
export const COOKIE_SUCURSAL_ACTIVA = 'respondi_active_branch'

export type SucursalPermitida = { id: string; nombre: string }

// Las tiendas en las que puede trabajar el usuario: el propietario o un
// administrador, todas las de su organización; el resto, las que tiene
// asignadas. Es la misma regla que aplica la base de datos
// (`auth_sucursales()`), y de aquí sale también la lista del selector.
export async function sucursalesPermitidas(supabase: any, userId: string): Promise<SucursalPermitida[]> {
  const { data: u } = await supabase
    .from('users')
    .select('rol, tenant_id, roles_personalizados(es_propietario)')
    .eq('id', userId)
    .single()

  if (!u) return []

  const rolPersonalizado = Array.isArray(u.roles_personalizados) ? u.roles_personalizados[0] : u.roles_personalizados

  let tenantId: string | null = u.tenant_id
  let todas = u.rol === 'admin' || !!rolPersonalizado?.es_propietario

  if (u.rol === 'super_admin') {
    tenantId = await getImpersonatedTenantId()
    todas = true
  }

  if (!tenantId) return []

  if (todas) {
    const { data } = await supabase
      .from('sucursales')
      .select('id, nombre')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
    return data || []
  }

  const { data } = await supabase
    .from('user_branches')
    .select('sucursales(id, nombre, tenant_id, created_at)')
    .eq('user_id', userId)

  return ((data || [])
    .map((ub: any) => (Array.isArray(ub.sucursales) ? ub.sucursales[0] : ub.sucursales))
    .filter((s: any) => s && s.tenant_id === tenantId)
    .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((s: any) => ({ id: s.id, nombre: s.nombre })))
}

// Solo se acepta la tienda elegida si el usuario puede trabajar en ella. Antes
// no se comprobaba: bastaba con poner otra tienda en la cookie.
export async function resolveBranchId(supabase: any, userId: string): Promise<string | null> {
  const permitidas = await sucursalesPermitidas(supabase, userId)
  if (permitidas.length === 0) return null
  const esPermitida = (id?: string | null) => !!id && permitidas.some(s => s.id === id)

  const cookieStore = await cookies()
  const elegida = cookieStore.get(COOKIE_SUCURSAL_ACTIVA)?.value
  if (esPermitida(elegida)) return elegida!

  const { data: userData } = await supabase
    .from('users')
    .select('branch_id')
    .eq('id', userId)
    .single()

  if (esPermitida(userData?.branch_id)) return userData.branch_id

  return permitidas[0].id
}
