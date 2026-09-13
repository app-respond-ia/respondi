'use client'
import { Tabla } from '@/components/ui/Tabla'
import { PAGINA } from '@/lib/ui'

import { useState, useEffect } from 'react'
import { getComisiones, getVendedores, aprobarComision, marcarComisionPagada, crearComisionManual, getOrganizacionesBasico } from '@/app/actions/superadmin'
import { useToast } from '@/components/ui/Toast'
import { useSuperadminPermisos } from '@/components/layout/SuperadminPermisosContext'

export default function ComisionesPage() {
  const [comisiones, setComisiones] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [organizaciones, setOrganizaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()

  // Filtros (el estado lo llevan las pestañas de la tabla)
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  // Modal pago
  const [modalPago, setModalPago] = useState<any>(null)
  const [notasPago, setNotasPago] = useState('')
  const [savingPago, setSavingPago] = useState(false)

  // Modal crear manual
  const [isModalCrear, setIsModalCrear] = useState(false)
  const [savingCrear, setSavingCrear] = useState(false)
  const [formCrear, setFormCrear] = useState({
    vendedor_id: '',
    organizacion_id: '',
    tipo: 'manual' as 'conversion' | 'mrr_mensual' | 'manual',
    importe: 0,
    moneda: 'EUR',
    mes_referencia: '',
    notas_pago: ''
  })

  const { hasPermission } = useSuperadminPermisos()
  const canWrite = hasPermission('comisiones', 'escritura')

  useEffect(() => { cargar() }, [filtroVendedor, filtroTipo])

  const cargar = async () => {
    setLoading(true)
    const [resC, resV, resO] = await Promise.all([
      getComisiones({
        vendedor_id: filtroVendedor || undefined,
        tipo: filtroTipo || undefined
      }),
      getVendedores(),
      getOrganizacionesBasico()
    ])
    if (resC.success && resC.comisiones) setComisiones(resC.comisiones)
    if (resV.success && resV.vendedores) setVendedores(resV.vendedores)
    if (resO.success && resO.organizaciones) setOrganizaciones(resO.organizaciones)
    setLoading(false)
  }

  const handleAprobar = async (id: string) => {
    const res = await aprobarComision(id)
    if (res.success) {
      showToast('Comisión aprobada ✓', 'success')
      cargar()
    } else {
      showToast(res.error || 'Error al aprobar', 'error')
    }
  }

  const handleMarcarPagada = async () => {
    if (!modalPago) return
    setSavingPago(true)
    const res = await marcarComisionPagada(modalPago.id, notasPago)
    if (res.success) {
      setModalPago(null)
      setNotasPago('')
      showToast('Comisión marcada como pagada ✓', 'success')
      cargar()
    } else {
      showToast(res.error || 'Error al marcar como pagada', 'error')
    }
    setSavingPago(false)
  }

  const handleCrearManual = async () => {
    setSavingCrear(true)
    const res = await crearComisionManual({
      ...formCrear,
      mes_referencia: formCrear.mes_referencia || undefined
    })
    if (res.success) {
      setIsModalCrear(false)
      showToast('Comisión creada manualmente ✓', 'success')
      cargar()
    } else {
      showToast(res.error || 'Error al crear comisión', 'error')
    }
    setSavingCrear(false)
  }

  const formatFecha = (d: string) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const getEstadoBadge = (estado: string) => {
    if (estado === 'pendiente') return 'bg-amber-100 text-amber-700'
    if (estado === 'aprobada') return 'bg-blue-100 text-blue-700'
    if (estado === 'pagada') return 'bg-emerald-100 text-emerald-700'
    return 'bg-slate-100 text-slate-600'
  }

  const getTipoBadge = (tipo: string) => {
    if (tipo === 'conversion') return 'bg-purple-100 text-purple-700'
    if (tipo === 'manual') return 'bg-orange-100 text-orange-700'
    return 'bg-cyan-100 text-cyan-700'
  }

  const etiquetaTipo = (tipo: string) => tipo === 'conversion' ? 'Conversión' : tipo === 'manual' ? 'Manual' : 'MRR'

  const totalPendiente = comisiones.filter(c => c.estado === 'pendiente').reduce((acc, c) => acc + Number(c.importe), 0)
  const totalAprobado = comisiones.filter(c => c.estado === 'aprobada').reduce((acc, c) => acc + Number(c.importe), 0)
  const totalPagado = comisiones.filter(c => c.estado === 'pagada').reduce((acc, c) => acc + Number(c.importe), 0)

  const formularioValido = formCrear.vendedor_id && formCrear.organizacion_id && formCrear.importe > 0

  return (
    <div className={PAGINA}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Comisiones</h1>
          <p className="text-ink-500 mt-1">Gestiona y aprueba las comisiones de los vendedores.</p>
        </div>
        {canWrite && (
          <button onClick={() => setIsModalCrear(true)} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition shadow-lg shadow-brand-600/30">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Crear manual
          </button>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Pendiente de aprobar</p>
          <p className="font-display font-700 text-2xl text-amber-600">{totalPendiente.toFixed(2)} €</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Aprobado, por pagar</p>
          <p className="font-display font-700 text-2xl text-blue-600">{totalAprobado.toFixed(2)} €</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Total pagado</p>
          <p className="font-display font-700 text-2xl text-emerald-600">{totalPagado.toFixed(2)} €</p>
        </div>
      </div>

      {/* Tabla */}
      <Tabla
        filas={comisiones}
        idDe={c => c.id}
        cargando={loading}
        nombre={['comisión', 'comisiones']}
        buscar={{ placeholder: 'Buscar por vendedor o cliente…', en: c => `${c.vendedores?.nombre || ''} ${c.organizaciones?.nombre || ''}` }}
        pestanas={[
          { id: 'todas', etiqueta: 'Todas' },
          { id: 'pendiente', etiqueta: 'Pendientes', filtro: c => c.estado === 'pendiente' },
          { id: 'aprobada', etiqueta: 'Aprobadas', filtro: c => c.estado === 'aprobada' },
          { id: 'pagada', etiqueta: 'Pagadas', filtro: c => c.estado === 'pagada' }
        ]}
        herramientas={
          <>
            <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} aria-label="Vendedor"
              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
              <option value="">Todos los vendedores</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} aria-label="Tipo"
              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
              <option value="">Todos los tipos</option>
              <option value="conversion">Conversión</option>
              <option value="mrr_mensual">MRR mensual</option>
              <option value="manual">Manual</option>
            </select>
          </>
        }
        ordenInicial={{ clave: 'fecha', direccion: 'desc' }}
        columnas={[
          { clave: 'vendedor', titulo: 'Vendedor', enMovil: 'titulo', valor: c => c.vendedores?.nombre || '', render: c => <span className="font-500 text-ink-900">{c.vendedores?.nombre || '—'}</span> },
          { clave: 'cliente', titulo: 'Cliente', valor: c => c.organizaciones?.nombre || '', render: c => <span className="text-ink-600">{c.organizaciones?.nombre || '—'}</span> },
          { clave: 'tipo', titulo: 'Tipo', valor: c => etiquetaTipo(c.tipo), render: c => <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${getTipoBadge(c.tipo)}`}>{etiquetaTipo(c.tipo)}</span> },
          { clave: 'importe', titulo: 'Importe', alinear: 'derecha', valor: c => Number(c.importe || 0), render: c => <span className="font-600 text-ink-900 whitespace-nowrap tabular-nums">{Number(c.importe).toFixed(2)} {c.moneda}</span> },
          { clave: 'estado', titulo: 'Estado', valor: c => c.estado, render: c => <span className={`text-xs px-2 py-0.5 rounded-full font-600 capitalize ${getEstadoBadge(c.estado)}`}>{c.estado}</span> },
          { clave: 'fecha', titulo: 'Fecha', valor: c => c.fecha_generacion || '', render: c => <span className="text-ink-500 whitespace-nowrap">{formatFecha(c.fecha_generacion)}</span> }
        ]}
        acciones={c => (
          <>
            {canWrite && c.estado === 'pendiente' && (
              <button onClick={() => handleAprobar(c.id)}
                className="px-3 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-600 transition">
                Aprobar
              </button>
            )}
            {canWrite && c.estado === 'aprobada' && (
              <button onClick={() => { setModalPago(c); setNotasPago('') }}
                className="px-3 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-600 transition">
                Marcar pagada
              </button>
            )}
            {c.estado === 'pagada' && (
              <span className="text-xs text-ink-400">Pagada el {formatFecha(c.fecha_pago)}</span>
            )}
          </>
        )}
        vacio={<p className="text-ink-500">No hay comisiones con estos filtros.</p>}
      />

      {/* MODAL: Marcar como pagada */}
      {modalPago && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !savingPago && setModalPago(null)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl pointer-events-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">Marcar como pagada</h2>
                <button onClick={() => setModalPago(null)} className="p-1.5 rounded-lg text-ink-400 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-sm font-600 text-ink-900">{modalPago.vendedores?.nombre}</p>
                  <p className="text-sm text-ink-500">{modalPago.organizaciones?.nombre} · {Number(modalPago.importe).toFixed(2)} {modalPago.moneda}</p>
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Notas del pago <span className="text-ink-400 font-400">· opcional</span></label>
                  <textarea rows={3} placeholder="Referencia de transferencia, fecha real de pago..."
                    value={notasPago} onChange={e => setNotasPago(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
                <button onClick={() => setModalPago(null)} disabled={savingPago}
                  className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleMarcarPagada} disabled={savingPago}
                  className="px-5 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-600 transition disabled:opacity-50">
                  {savingPago ? 'Guardando...' : 'Confirmar pago'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Crear comisión manual */}
      {isModalCrear && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !savingCrear && setIsModalCrear(false)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl pointer-events-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">Crear comisión manual</h2>
                <button onClick={() => setIsModalCrear(false)} className="p-1.5 rounded-lg text-ink-400 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Vendedor</label>
                  <select value={formCrear.vendedor_id} onChange={e => setFormCrear({...formCrear, vendedor_id: e.target.value, organizacion_id: ''})}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
                    <option value="">Seleccionar vendedor</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Cliente</label>
                  <select value={formCrear.organizacion_id} onChange={e => setFormCrear({...formCrear, organizacion_id: e.target.value})}
                    disabled={!formCrear.vendedor_id}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:opacity-50">
                    <option value="">Seleccionar cliente</option>
                    {organizaciones.map((o: any) => (
                      <option key={o.id} value={o.id}>{o.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Tipo</label>
                    <input type="text" value="Manual" disabled
                      className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-sm focus:outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Moneda</label>
                    <select value={formCrear.moneda} onChange={e => setFormCrear({...formCrear, moneda: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                      <option value="MXN">MXN</option>
                      <option value="ARS">ARS</option>
                      <option value="COP">COP</option>
                      <option value="CLP">CLP</option>
                      <option value="BRL">BRL</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Importe</label>
                  <input type="number" min="0" step="0.01" value={formCrear.importe}
                    onChange={e => setFormCrear({...formCrear, importe: parseFloat(e.target.value)})}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                {formCrear.tipo === 'mrr_mensual' && (
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Mes de referencia</label>
                    <input type="month" value={formCrear.mes_referencia}
                      onChange={e => setFormCrear({...formCrear, mes_referencia: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Notas <span className="text-ink-400 font-400">· opcional</span></label>
                  <textarea rows={2} value={formCrear.notas_pago}
                    onChange={e => setFormCrear({...formCrear, notas_pago: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
                <button onClick={() => setIsModalCrear(false)} disabled={savingCrear}
                  className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleCrearManual} disabled={savingCrear || !formularioValido}
                  className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50">
                  {savingCrear ? 'Creando...' : 'Crear comisión'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
