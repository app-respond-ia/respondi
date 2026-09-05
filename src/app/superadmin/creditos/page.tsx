'use client'
import Loading from '@/components/Loading'
import { useState, useEffect, Suspense } from 'react'
import { getMovimientosCreditos, getResumenCreditos, getOrganizacionesBasico } from '@/app/actions/superadmin'
import { useSuperadminPermisos } from '@/components/layout/SuperadminPermisosContext'
import { useSearchParams } from 'next/navigation'

function CreditosContent() {
  const searchParams = useSearchParams()
  const urlTenantId = searchParams.get('tenant_id') || ''

  const [movimientos, setMovimientos] = useState<any[]>([])
  const [organizaciones, setOrganizaciones] = useState<any[]>([])
  const [resumen, setResumen] = useState({ totalConsumido: 0, totalRecargaPlan: 0, totalRecargaManual: 0, saldoTotalPlataforma: 0 })
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filtroTenant, setFiltroTenant] = useState(urlTenantId)
  const [filtroSucursalId, setFiltroSucursalId] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroOrigen, setFiltroOrigen] = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

  const { hasPermission } = useSuperadminPermisos()
  const canRead = hasPermission('organizaciones', 'lectura')

  useEffect(() => {
    if (canRead) cargarFiltros()
  }, [canRead])

  useEffect(() => {
    if (canRead) cargarDatos()
  }, [filtroTenant, filtroSucursalId, filtroTipo, filtroOrigen, filtroDesde, filtroHasta, canRead])

  const cargarFiltros = async () => {
    const resO = await getOrganizacionesBasico()
    if (resO.success && resO.organizaciones) setOrganizaciones(resO.organizaciones)
    const resR = await getResumenCreditos()
    if (resR.success && resR.resumen) setResumen(resR.resumen)
  }

  const cargarDatos = async () => {
    setLoading(true)
    const res = await getMovimientosCreditos({
      tenant_id: filtroTenant || undefined,
      branch_id: filtroSucursalId || undefined,
      tipo: (filtroTipo as 'abono' | 'debito') || undefined,
      origen: (filtroOrigen as 'consumo_ia' | 'recarga_manual' | 'recarga_plan') || undefined,
      fecha_desde: filtroDesde ? new Date(filtroDesde).toISOString() : undefined,
      fecha_hasta: filtroHasta ? new Date(filtroHasta + 'T23:59:59.999Z').toISOString() : undefined,
    })
    
    if (res.success && res.movimientos) setMovimientos(res.movimientos)
    setLoading(false)
  }

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 text-red-500 flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        </div>
        <h2 className="text-xl font-display font-700 text-ink-900 mb-2">Acceso denegado</h2>
        <p className="text-ink-500">No tienes permisos para ver los movimientos de créditos.</p>
      </div>
    )
  }

  const formatFecha = (d: string) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const getTipoBadge = (tipo: string) => tipo === 'abono' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'

  const formatOrigen = (origen: string) => {
    if (origen === 'consumo_ia') return 'Consumo IA'
    if (origen === 'recarga_manual') return 'Recarga manual'
    if (origen === 'recarga_plan') return 'Recarga plan'
    return origen
  }

  const getOrigenBadge = (origen: string) => {
    if (origen === 'consumo_ia') return 'bg-amber-100 text-amber-700'
    if (origen === 'recarga_manual') return 'bg-purple-100 text-purple-700'
    if (origen === 'recarga_plan') return 'bg-blue-100 text-blue-700'
    return 'bg-slate-100 text-slate-600'
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Movimientos de créditos</h1>
          <p className="text-ink-500 mt-1">Auditoría global de consumos y recargas de IA en todas las organizaciones.</p>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Total consumido IA</p>
          <p className="font-display font-700 text-2xl text-amber-600">{resumen.totalConsumido.toLocaleString('es-ES')} cr</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Total recargado (Plan)</p>
          <p className="font-display font-700 text-2xl text-blue-600">{resumen.totalRecargaPlan.toLocaleString('es-ES')} cr</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Total recargado (Manual)</p>
          <p className="font-display font-700 text-2xl text-purple-600">{resumen.totalRecargaManual.toLocaleString('es-ES')} cr</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Saldo plataforma</p>
          <p className="font-display font-700 text-2xl text-emerald-600">{resumen.saldoTotalPlataforma.toLocaleString('es-ES')} cr</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={filtroTenant} onChange={e => setFiltroTenant(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition w-full sm:w-auto">
          <option value="">Todas las organizaciones</option>
          {organizaciones.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
        
        <input type="text" placeholder="ID Sucursal (opcional)" value={filtroSucursalId} onChange={e => setFiltroSucursalId(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition w-full sm:w-auto" />
        
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
          <option value="">Todos los tipos</option>
          <option value="abono">Abonos</option>
          <option value="debito">Débitos</option>
        </select>

        <select value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
          <option value="">Todos los orígenes</option>
          <option value="consumo_ia">Consumo IA</option>
          <option value="recarga_plan">Recarga por Plan</option>
          <option value="recarga_manual">Recarga Manual</option>
        </select>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
            className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-ink-600 focus:outline-none focus:border-brand-500 transition w-full" />
          <span className="text-ink-400">a</span>
          <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
            className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-ink-600 focus:outline-none focus:border-brand-500 transition w-full" />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <Loading />
        ) : movimientos.length === 0 ? (
          <div className="p-8 text-center text-ink-500">No hay movimientos con estos filtros.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-ink-500">
                  <th className="font-600 px-5 py-3">Fecha</th>
                  <th className="font-600 px-5 py-3">Organización</th>
                  <th className="font-600 px-5 py-3">Sucursal</th>
                  <th className="font-600 px-5 py-3">Tipo</th>
                  <th className="font-600 px-5 py-3">Origen</th>
                  <th className="font-600 px-5 py-3">Cantidad</th>
                  <th className="font-600 px-5 py-3">Saldo</th>
                  <th className="font-600 px-5 py-3">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movimientos.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3.5 text-ink-500 whitespace-nowrap">{formatFecha(m.timestamp)}</td>
                    <td className="px-5 py-3.5 font-500 text-ink-900">{m.organizaciones?.nombre || '—'}</td>
                    <td className="px-5 py-3.5 text-ink-600">{m.sucursales?.nombre || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-600 capitalize ${getTipoBadge(m.tipo)}`}>
                        {m.tipo}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${getOrigenBadge(m.origen)}`}>
                        {formatOrigen(m.origen)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-600 text-ink-900">
                      {m.tipo === 'abono' ? '+' : '-'}{Math.abs(Number(m.cantidad))}
                    </td>
                    <td className="px-5 py-3.5 font-600 text-ink-900">{m.saldo}</td>
                    <td className="px-5 py-3.5 text-ink-500 truncate max-w-[200px]" title={m.descripcion}>{m.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

export default function CreditosPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CreditosContent />
    </Suspense>
  )
}
