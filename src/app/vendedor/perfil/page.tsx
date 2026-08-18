import { getVendedorDashboard } from '@/app/actions/vendedor'
import PerfilForm from './PerfilForm'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Mi perfil - Respondi Vendedores',
}

export default async function PerfilPage() {
  const res = await getVendedorDashboard()
  if (!res.success || !res.data) {
    redirect('/login')
  }

  const { vendedor } = res.data

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-700 text-ink-900 font-display">Mi perfil</h1>
        <p className="text-ink-500 mt-1">Gestiona tu información personal y revisa tus condiciones.</p>
      </div>

      <PerfilForm vendedor={vendedor} />
    </div>
  )
}
