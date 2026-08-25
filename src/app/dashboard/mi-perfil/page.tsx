import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import MiPerfilForm from './MiPerfilForm'

export const metadata = {
  title: 'Mi perfil - Respondi',
}

export default async function MiPerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('nombre, apodo, avatar_url, email')
    .eq('id', user.id)
    .single()

  if (!userData) redirect('/login')

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-700 text-ink-900 font-display">Mi perfil</h1>
        <p className="text-ink-500 mt-1">Gestiona tu información personal en la plataforma.</p>
      </div>

      <MiPerfilForm user={userData} userId={user.id} />
    </div>
  )
}
