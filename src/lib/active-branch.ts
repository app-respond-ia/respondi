import { cookies } from 'next/headers'

export async function resolveBranchId(
  supabase: any,
  tenantId: string,
  userBranchId: string | null,
  rol: string
): Promise<string | null> {
  if (rol === 'admin') {
    const cookieStore = await cookies()
    const cookieBranch = cookieStore.get('respondi_active_branch')?.value

    if (cookieBranch) {
      const { data } = await supabase
        .from('sucursales')
        .select('id')
        .eq('id', cookieBranch)
        .eq('tenant_id', tenantId)
        .single()
      if (data) return data.id
    }

    // Fallback: primera sucursal del tenant por antigüedad
    const { data } = await supabase
      .from('sucursales')
      .select('id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    return data?.id ?? null
  }

  return userBranchId
}
