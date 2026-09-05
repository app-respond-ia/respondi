'use client'
import Loading from '@/components/Loading'
import { useState, useEffect } from 'react'
import { getMisPermisos } from '@/app/actions/permisos'
import { getMetricas, getMovimientosCreditosCliente } from '@/app/actions/metricas'

function StatCard({ label, value, sub }: { label: string, value: string | number, sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-sm text-ink-500 mb-1">{label}</p>
      <p className="font-display font-700 text-2xl text-ink-900">{value}</p>
      {sub && <p className="text-xs text-ink-400 mt-1">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-600 text-sm text-ink-500 uppercase tracking-wide mb-3">{children}</h2>
  )
}

export default function FacturacionPage() {
  const [loading, setLoading] = useState(true)
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  
  const [metricasCreditos, setMetricasCreditos] = useState<any>(null)
  const [movimientos, setMovimientos] = useState<any[]>([])
  
  const [filtros, setFiltros] = useState<{ tipo?: 'abono' | 'debito', origen?: string }>({})

  useEffect(() => { cargar() }, [filtros])

  const cargar = async () => {
    setLoading(true)
    
    // 1. Validamos los permisos y calculamos el nivel en una sola variable
    const permisosRes = await getMisPermisos()
    let pNivel: 'ninguno' | 'lectura' | 'escritura' = 'ninguno'
    
    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        pNivel = 'escritura'
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'facturacion')
        pNivel = p?.nivel || 'ninguno'
      }
    }
    
    setNivelPermiso(pNivel)

    // 2. Si tiene permiso (cualquier nivel), cargamos los datos
    if (pNivel !== 'ninguno') {
      const [resMetricas, resMov] = await Promise.all([
        getMetricas('mes'), // Reusado de Metricas, nos interesan solo los créditos
        getMovimientosCreditosCliente(filtros as any)
      ])
      
      if (resMetricas.success && resMetricas.data) {
        setMetricasCreditos(resMetricas.data.creditos)
      }
      if (resMov.success && resMov.movimientos) {
        setMovimientos(resMov.movimientos)
      }
    }
    
    setLoading(false)
  }

  if (loading || nivelPermiso === null) return <Loading />

  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-bold text-ink-900 mb-2">Acceso denegado</h2>
        <p className="text-ink-500">No tienes permisos para ver la configuración de facturación y créditos.</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 font-display">Facturación y créditos</h1>
        <p className="text-ink-500 mt-1">Gestiona tu suscripción, método de pago e historial de consumo de IA.</p>
      </div>

      {/* PLAN ACTUAL PLACEHOLDER */}
      <section className="mb-10 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <h2 className="text-xl font-bold text-ink-900 mb-2">Gestión de tu plan</h2>
        <p className="text-sm text-ink-500 mb-5">Gestión de suscripción y compra de créditos disponible próximamente.</p>
        <button disabled className="px-5 h-10 rounded-xl bg-slate-100 text-slate-400 text-sm font-600 cursor-not-allowed">
          Gestionar suscripción en Stripe
        </button>
      </section>

      {/* RESUMEN DE CRÉDITOS */}
      {metricasCreditos && (
        <section className="mb-10">
          <SectionTitle>Resumen de uso</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-sm">
              <p className="text-sm text-slate-400 mb-1">Disponibles</p>
              <p className="font-display font-700 text-3xl">{metricasCreditos.disponibles.toLocaleString()}</p>
              {metricasCreditos.diasRestantes !== null && (
                <p className="text-xs text-slate-400 mt-2">
                  ~{metricasCreditos.diasRestantes} días al ritmo actual
                </p>
              )}
            </div>
            <StatCard
              label="Consumidos en período"
              value={metricasCreditos.consumidos.toLocaleString()}
              sub="Mensajes respondidos por la IA en los últimos 30 días"
            />
            <StatCard
              label="Consumo diario promedio"
              value={metricasCreditos.consumoDiarioPromedio.toLocaleString()}
              sub="Media móvil de los últimos 30 días"
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-600 text-ink-700">Uso de créditos</p>
              <p className="text-sm text-ink-500">
                {metricasCreditos.consumidos.toLocaleString()} / {(metricasCreditos.disponibles + metricasCreditos.consumidos).toLocaleString()}
              </p>
            </div>
            <div className="h-4 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-700"
                style={{
                  width: `${Math.min(Math.round((metricasCreditos.consumidos / Math.max(metricasCreditos.disponibles + metricasCreditos.consumidos, 1)) * 100), 100)}%`
                }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-ink-400">
              <span>Consumido</span>
              <span>Disponible</span>
            </div>
          </div>
        </section>
      )}

      {/* HISTORIAL DE MOVIMIENTOS */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <SectionTitle>Historial de movimientos</SectionTitle>
          <div className="flex gap-2">
            <select
              value={filtros.tipo || ''}
              onChange={(e) => setFiltros(prev => ({ ...prev, tipo: e.target.value as any }))}
              className="h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            >
              <option value="">Cualquier tipo</option>
              <option value="abono">Abonos</option>
              <option value="debito">Débitos</option>
            </select>
            <select
              value={filtros.origen || ''}
              onChange={(e) => setFiltros(prev => ({ ...prev, origen: e.target.value }))}
              className="h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            >
              <option value="">Cualquier origen</option>
              <option value="recarga_plan">Renovación de plan</option>
              <option value="recarga_manual">Recarga manual</option>
              <option value="consumo_ia">Consumo IA</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          {movimientos.length === 0 ? (
            <div className="p-10 text-center text-slate-500">No hay movimientos que coincidan con los filtros.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Origen</th>
                    <th className="px-4 py-3 font-medium text-right">Cantidad</th>
                    <th className="px-4 py-3 font-medium text-right">Saldo post-op</th>
                    <th className="px-4 py-3 font-medium">Descripción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movimientos.map((m: any) => (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(m.timestamp).toLocaleString('es-ES', { 
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide ${
                          m.tipo === 'abono' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {m.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-500 text-slate-600 capitalize bg-slate-100 px-2 py-1 rounded-md">
                          {m.origen ? m.origen.replace('_', ' ') : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${m.tipo === 'abono' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {m.tipo === 'abono' ? '+' : '-'}{m.cantidad.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">
                        {m.saldo.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[200px]" title={m.descripcion}>
                        {m.descripcion || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
