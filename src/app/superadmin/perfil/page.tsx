import PerfilForm from './PerfilForm'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export const metadata = {
  title: 'Mi perfil - Respondi Superadmin',
}

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) redirect('/login')

  const { data: user } = await supabase
    .from('users')
    .select('nombre, apodo, email, avatar_url')
    .eq('id', session.user.id)
    .single()

  if (!user) redirect('/login')

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-700 text-ink-900 font-display">Mi perfil</h1>
        <p className="text-ink-500 mt-1">Gestiona tu información personal.</p>
      </div>

      <PerfilForm superadmin={user} />
    </div>
  )
}
