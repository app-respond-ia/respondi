import { createClient } from '@/utils/supabase/server'
import { signOut } from '@/app/actions/auth'

export default async function OperarioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold mb-4">Panel de Operario</h1>
      <p>Bienvenido, {user?.email}</p>
      <form action={signOut} className="mt-4">
        <button className="bg-red-500 text-white px-4 py-2 rounded">Cerrar sesión</button>
      </form>
    </div>
  )
}
