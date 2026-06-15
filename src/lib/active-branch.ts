import { cookies } from 'next/headers'

export async function resolveBranchId(
  supabase: any,
  userId: string
): Promise<string | null> {
  const cookieStore = await cookies()
  const cookieBranch = cookieStore.get('respondi_active_branch')?.value

  if (cookieBranch) {
    const { data } = await supabase
      .from('user_branches')
      .select('branch_id')
      .eq('user_id', userId)
      .eq('branch_id', cookieBranch)
      .single()
    if (data) return data.branch_id
  }

  // Fallback: primera sucursal de user_branches para este usuario
  const { data } = await supabase
    .from('user_branches')
    .select('branch_id')
    .eq('user_id', userId)
    .order('branch_id', { ascending: true })
    .limit(1)
    .single()
    
  return data?.branch_id ?? null
}
