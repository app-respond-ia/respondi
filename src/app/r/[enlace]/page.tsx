import Link from 'next/link'
import { getReservaPublica } from '@/app/actions/reservas-publicas'
import Reservar from './Reservar'

// La página pública de reservas de un negocio: respondi.vercel.app/r/su-enlace
// Sin cuenta: el cliente elige, deja su WhatsApp o correo y listo.

export const dynamic = 'force-dynamic'

export default async function PaginaReservas({ params }: { params: Promise<{ enlace: string }> }) {
  const { enlace } = await params
  const r = await getReservaPublica(enlace)
  if (!r.success || !r.data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <h1 className="font-display font-700 text-xl text-ink-900 mb-2">Este enlace no está activo</h1>
          <p className="text-sm text-ink-600">{r.error || 'El negocio no admite reservas por aquí ahora mismo.'}</p>
          <Link href="/" className="inline-block mt-6 text-sm font-600 text-brand-600">Respondi</Link>
        </div>
      </div>
    )
  }
  return <Reservar enlace={enlace} datos={r.data} />
}
