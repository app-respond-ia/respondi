'use client'

import { useState, useEffect } from 'react'
import { getComisiones, getVendedores, aprobarComision, marcarComisionPagada, crearComisionManual } from '@/app/actions/superadmin'

export default function ComisionesPage() {
  const [comisiones, setComisiones] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  // Filtros
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
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
    tipo: 'conversion' as 'conversion' | 'mrr_mensual',
    importe: 0,
    moneda: 'EUR',
    mes_referencia: '',
    notas_pago: ''
  })

  useEffect(() => { cargar() }, [filtroVendedor, filtroEstado, filtroTipo])

  const cargar = async () => {
    setLoading(true)
    const [resC, resV] = await Promise.all([
      getComisiones({
        vendedor_id: filtroVendedor || undefined,
        estado: filtroEstado || undefined,
        tipo: filtroTipo || undefined
      }),
      getVendedores()
    ])
    if (resC.success && resC.comisiones) setComisiones(resC.comisiones)
    if (resV.success && resV.vendedores) setVendedores(resV.vendedores)
    setLoading(false)
  }

  const handleAprobar = async (id: string) => {
    const res = await aprobarComision(id)
    if (res.success) {
      setMensaje({ tipo: 'exito', texto: 'Comisión aprobada ✓' })
      cargar()
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al aprobar' })
    }
    setTimeout(() => setMensaje(null), 3000)
  }

  const handleMarcarPagada = async () => {
    if (!modalPago) return
    setSavingPago(true)
    const res = await marcarComisionPagada(modalPago.id, notasPago)
    if (res.success) {
      setModalPago(null)
      setNotasPago('')
      setMensaje({ tipo: 'exito', texto: 'Comisión marcada como pagada ✓' })
      cargar()
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al marcar como pagada' })
    }
    setTimeout(() => setMensaje(null), 3000)
    setSavingPago(false)
  }

  const handleCrearManual = async () => {
    if (!formCrear.vendedor_id || !formCrear.organizacion_id || formCrear.importe <= 0) {
      setMensaje({ tipo: 'error', texto: 'Rellena todos los campos obligatorios' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setSavingCrear(true)
    const res = await crearComisionManual({
      ...formCrear,
      mes_referencia: formCrear.mes_referencia || undefined
    })
    if (res.success) {
      setIsModalCrear(false)
      setMensaje({ tipo: 'exito', texto: 'Comisión creada manualmente ✓' })
      cargar()
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al crear comisión' })
    }
    setTimeout(() => setMensaje(null), 3000)
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
    return 'bg-cyan-100 text-cyan-700'
  }

  const totalPendiente = comisiones.filter(c => c.estado === 'pendiente').reduce((acc, c) => acc + Number(c.importe), 0)
  const totalAprobado = comisiones.filter(c => c.estado === 'aprobada').reduce((acc, c) => acc + Number(c.importe), 0)
  const totalPagado = comisiones.filter(c => c.estado === 'pagada').reduce((acc, c) => acc + Number(c.importe), 0)

  // Clientes disponibles según vendedor seleccionado
  const vendedorSeleccionado = vendedores.find(v => v.id === formCrear.vendedor_id)
  const clientesDisponibles = vendedorSeleccionado?.vendedor_clientes || []

  return (
    <>
      {mensaje && (
        <div className={`mb-6 p-4 rounded-xl font-500 text-sm border flex items-center gap-2 ${
          mensaje.tipo === 'exito' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {mensaje.texto}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Comisiones</h1>
          <p className="text-ink-500 mt-1">Gestiona y aprueba las comisiones de los vendedores.</p>
        </div>
        <button onClick={() => setIsModalCrear(true)} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition shadow-lg shadow-brand-600/30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Crear manual
        </button>
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

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
          <option value="">Todos los vendedores</option>
          {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobada">Aprobada</option>
          <option value="pagada">Pagada</option>
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
          <option value="">Todos los tipos</option>
          <option value="conversion">Conversión</option>
          <option value="mrr_mensual">MRR mensual</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-ink-500">Cargando comisiones...</div>
        ) : comisiones.length === 0 ? (
          <div className="p-8 text-center text-ink-500">No hay comisiones con estos filtros.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-ink-500">
                  <th className="font-600 px-5 py-3">Vendedor</th>
                  <th className="font-600 px-5 py-3">Cliente</th>
                  <th className="font-600 px-5 py-3">Tipo</th>
                  <th className="font-600 px-5 py-3">Importe</th>
                  <th className="font-600 px-5 py-3">Estado</th>
                  <th className="font-600 px-5 py-3">Fecha</th>
                  <th className="font-600 px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comisiones.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-3.5 font-500 text-ink-900">{c.vendedores?.nombre || '—'}</td>
                    <td className="px-5 py-3.5 text-ink-600">{c.organizaciones?.nombre || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${getTipoBadge(c.tipo)}`}>
                        {c.tipo === 'conversion' ? 'Conversión' : 'MRR'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-600 text-ink-900">{Number(c.importe).toFixed(2)} {c.moneda}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-600 capitalize ${getEstadoBadge(c.estado)}`}>
                        {c.estado}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-ink-500">{formatFecha(c.fecha_generacion)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {c.estado === 'pendiente' && (
                          <button onClick={() => handleAprobar(c.id)}
                            className="px-3 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-600 transition">
                            Aprobar
                          </button>
                        )}
                        {c.estado === 'aprobada' && (
                          <button onClick={() => { setModalPago(c); setNotasPago('') }}
                            className="px-3 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-600 transition">
                            Marcar pagada
                          </button>
                        )}
                        {c.estado === 'pagada' && (
                          <span className="text-xs text-ink-400">{formatFecha(c.fecha_pago)}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                    {clientesDisponibles.map((c: any) => (
                      <option key={c.organizacion_id} value={c.organizacion_id}>{c.organizaciones?.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Tipo</label>
                    <select value={formCrear.tipo} onChange={e => setFormCrear({...formCrear, tipo: e.target.value as any})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
                      <option value="conversion">Conversión</option>
                      <option value="mrr_mensual">MRR mensual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Moneda</label>
                    <select value={formCrear.moneda} onChange={e => setFormCrear({...formCrear, moneda: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
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
                <button onClick={handleCrearManual} disabled={savingCrear}
                  className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50">
                  {savingCrear ? 'Creando...' : 'Crear comisión'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
