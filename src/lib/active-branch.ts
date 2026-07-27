import { cookies } from 'next/headers'

export async function resolveBranchId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies()
  const cookieBranchId = cookieStore.get('active_branch_id')?.value

  if (cookieBranchId) {
    const { data: branch } = await supabase
      .from('sucursales')
      .select('id')
      .eq('id', cookieBranchId)
      .single()

    if (branch) return cookieBranchId
  }

  const { data: userData } = await supabase
    .from('users')
    .select('branch_id, tenant_id')
    .eq('id', userId)
    .single()

  if (userData?.branch_id) {
    cookieStore.set('active_branch_id', userData.branch_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    })
    return userData.branch_id
  }

  if (userData?.tenant_id) {
    const { data: branch } = await supabase
      .from('sucursales')
      .select('id')
      .eq('tenant_id', userData.tenant_id)
      .eq('activa', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (branch) {
      cookieStore.set('active_branch_id', branch.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7
      })
      await supabase
        .from('users')
        .update({ branch_id: branch.id })
        .eq('id', userId)
      return branch.id
    }
  }

  return null
}
