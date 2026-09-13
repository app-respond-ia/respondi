import Link from 'next/link'
import { getReservaPorToken } from '@/app/actions/reservas-publicas'
import GestionarReserva from './GestionarReserva'

// La página de una reserva concreta, con su llave secreta: ver, cambiar de
// hora o cancelar (dentro del plazo del negocio). Es el enlace que va en la
// confirmación.

export const dynamic = 'force-dynamic'

export default async function PaginaReserva({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const r = await getReservaPorToken(token)
  if (!r.success || !r.data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <h1 className="font-display font-700 text-xl text-ink-900 mb-2">No encontramos esa reserva</h1>
          <p className="text-sm text-ink-600">{r.error || 'Comprueba el enlace que te enviamos.'}</p>
          <Link href="/" className="inline-block mt-6 text-sm font-600 text-brand-600">Respondi</Link>
        </div>
      </div>
    )
  }
  return <GestionarReserva token={token} inicial={r.data} />
}
