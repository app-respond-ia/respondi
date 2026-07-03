'use client'

import { useState, useEffect } from 'react'
import { getVendedorComisiones } from '@/app/actions/superadmin'

export default function VendedorComisionesPage() {
  const [comisiones, setComisiones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('')

  useEffect(() => {
    const cargar = async () => {
      const res = await getVendedorComisiones()
      if (res.success && res.comisiones) setComisiones(res.comisiones)
      setLoading(false)
    }
    cargar()
  }, [])

  const getEstadoBadge = (estado: string) => {
    if (estado === 'pendiente') return 'bg-amber-100 text-amber-700'
    if (estado === 'aprobada') return 'bg-blue-100 text-blue-700'
    if (estado === 'pagada') return 'bg-emerald-100 text-emerald-700'
    return 'bg-slate-100 text-slate-600'
  }

  const getTipoBadge = (tipo: string) => {
    if (tipo === 'conversion') return 'bg-purple-100 text-purple-700'
    return 'bg-cyan-100 text-cyan-700'
  }

  const formatFecha = (d: string) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const comisionesFiltradas = filtroEstado ? comisiones.filter(c => c.estado === filtroEstado) : comisiones

  const totalPendiente = comisiones.filter(c => c.estado === 'pendiente').reduce((acc, c) => acc + Number(c.importe), 0)
  const totalAprobado = comisiones.filter(c => c.estado === 'aprobada').reduce((acc, c) => acc + Number(c.importe), 0)
  const totalPagado = comisiones.filter(c => c.estado === 'pagada').reduce((acc, c) => acc + Number(c.importe), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Mis comisiones</h1>
        <p className="text-ink-500 mt-1">Historial completo de tus comisiones.</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-amber-200 p-5">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <p className="text-sm text-ink-500">Por aprobar</p>
          </div>
          <p className="font-display font-700 text-2xl text-amber-600">{totalPendiente.toFixed(2)} €</p>
        </div>
        <div className="bg-white rounded-2xl border border-blue-200 p-5">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <p className="text-sm text-ink-500">Por cobrar</p>
          </div>
          <p className="font-display font-700 text-2xl text-blue-600">{totalAprobado.toFixed(2)} €</p>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200 p-5">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <p className="text-sm text-ink-500">Cobrado</p>
          </div>
          <p className="font-display font-700 text-2xl text-emerald-600">{totalPagado.toFixed(2)} €</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: '', label: 'Todas' },
          { value: 'pendiente', label: 'Por aprobar' },
          { value: 'aprobada', label: 'Por cobrar' },
          { value: 'pagada', label: 'Cobradas' },
        ].map(f => (
          <button key={f.value} onClick={() => setFiltroEstado(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-500 transition ${filtroEstado === f.value ? 'bg-ink-900 text-white' : 'bg-white border border-slate-200 text-ink-600 hover:bg-slate-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-ink-500">Cargando comisiones...</div>
        ) : comisionesFiltradas.length === 0 ? (
          <div className="p-8 text-center text-ink-500">No hay comisiones en este filtro.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {comisionesFiltradas.map(c => (
              <div key={c.id} className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-600 text-ink-900">{c.organizaciones?.nombre || '—'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${getTipoBadge(c.tipo)}`}>
                      {c.tipo === 'conversion' ? 'Conversión' : 'MRR'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-600 capitalize ${getEstadoBadge(c.estado)}`}>
                      {c.estado === 'pendiente' ? 'Por aprobar' : c.estado === 'aprobada' ? 'Por cobrar' : 'Cobrada'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-400">
                    Generada el {formatFecha(c.fecha_generacion)}
                    {c.estado === 'pagada' && c.fecha_pago && ` · Pagada el ${formatFecha(c.fecha_pago)}`}
                    {c.notas_pago && ` · ${c.notas_pago}`}
                  </p>
                </div>
                <p className="font-display font-700 text-lg text-ink-900 shrink-0">
                  {Number(c.importe).toFixed(2)} {c.moneda}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
