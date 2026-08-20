import { cookies } from 'next/headers'

export async function setImpersonatedTenantId(tenantId: string) {
  const cookieStore = await cookies()
  cookieStore.set('impersonate_tenant_id', tenantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 2 // 2 horas
  })
}

export async function getImpersonatedTenantId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('impersonate_tenant_id')?.value || null
}

export async function clearImpersonatedTenantId() {
  const cookieStore = await cookies()
  cookieStore.delete('impersonate_tenant_id')
}
