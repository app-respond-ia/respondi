'use client'
import Loading from '@/components/Loading'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getOrganizaciones, actualizarEstadoOrganizacion, entrarComoOrganizacion, getPlanes, cambiarPlanOrganizacion, registrarPagoYRenovar } from '@/app/actions/superadmin'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useSuperadminPermisos } from '@/components/layout/SuperadminPermisosContext'


export default function OrganizacionesPage() {
  const [organizaciones, setOrganizaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('Todos')
  const [search, setSearch] = useState('')
  const router = useRouter()
  const { showToast } = useToast()
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)

  const [modalOrganizacion, setModalOrganizacion] = useState<any>(null)
  const [planes, setPlanes] = useState<any[]>([])
  
  const [modalPlan, setModalPlan] = useState<any>(null)
  const [planSeleccionado, setPlanSeleccionado] = useState('')
  const [guardandoPlan, setGuardandoPlan] = useState(false)

  const [modalPago, setModalPago] = useState<any>(null)
  const [pagoForm, setPagoForm] = useState({ importe: '', moneda: 'USD', notas: '' })
  const [registrandoPago, setRegistrandoPago] = useState(false)

  const [confirmarEstado, setConfirmarEstado] = useState<{org: any, nuevoEstado: string} | null>(null)
  const [changingEstado, setChangingEstado] = useState(false)

  const { hasPermission } = useSuperadminPermisos()
  const canWrite = hasPermission('organizaciones', 'escritura')

  useEffect(() => {
    loadOrganizaciones()
    loadPlanes()
  }, [filtro])

  async function loadPlanes() {
    const res = await getPlanes()
    if (res.success && res.planes) setPlanes(res.planes)
  }

  async function loadOrganizaciones() {
    setLoading(true)
    const { success, organizaciones: data } = await getOrganizaciones(filtro)
    if (success && data) {
      setOrganizaciones(data)
    }
    setLoading(false)
  }

  const organizacionesFiltradas = organizaciones.filter(o => {
    const nombresVendedores = (o.vendedor_clientes || [])
      .map((vc: any) => vc.vendedores?.nombre)
      .filter(Boolean)
      .join(', ')

    return o.nombre.toLowerCase().includes(search.toLowerCase()) || 
      nombresVendedores.toLowerCase().includes(search.toLowerCase())
  })

  const openModal = (organizacion: any) => {
    setModalOrganizacion(organizacion)
    document.body.style.overflow = 'hidden'
  }

  const closeModal = () => {
    setModalOrganizacion(null)
    document.body.style.overflow = ''
  }

  const handleConfirmarCambioEstado = async () => {
    if (!confirmarEstado) return
    const { org, nuevoEstado } = confirmarEstado
    
    setChangingEstado(true)
    const res = await actualizarEstadoOrganizacion(org.id, nuevoEstado)
    setChangingEstado(false)
    
    if (res && res.success) {
      loadOrganizaciones()
      if (modalOrganizacion?.id === org.id) {
        setModalOrganizacion({ ...modalOrganizacion, estado: nuevoEstado })
      }
      showToast(`Organización ${nuevoEstado === 'suspendido' ? 'suspendida' : 'activada'} correctamente`, 'success')
      setConfirmarEstado(null)
    } else {
      showToast(res?.error || 'Error al cambiar estado', 'error')
    }
  }

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'activo': return 'bg-emerald-100 text-emerald-700 marker:bg-emerald-500'
      case 'trial': return 'bg-blue-100 text-blue-700 marker:bg-blue-500'
      case 'vencido': return 'bg-amber-100 text-amber-700 marker:bg-amber-500'
      case 'suspendido': return 'bg-red-100 text-red-700 marker:bg-red-500'
      default: return 'bg-slate-100 text-slate-700 marker:bg-slate-500'
    }
  }

  const getAvatarColor = (estado: string) => {
    switch (estado) {
      case 'activo': return 'bg-brand-100 text-brand-700'
      case 'trial': return 'bg-blue-100 text-blue-700'
      case 'vencido': return 'bg-amber-100 text-amber-700'
      case 'suspendido': return 'bg-slate-200 text-slate-600'
      default: return 'bg-slate-100 text-slate-700'
    }
  }

  const handleImpersonar = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setImpersonatingId(id)
    const res = await entrarComoOrganizacion(id)
    if (res.success) {
      window.location.href = '/dashboard'
    } else {
      setImpersonatingId(null)
      showToast(res.error || 'Error al intentar impersonar la organización', 'error')
    }
  }

  const handleGuardarPlan = async () => {
    if (!planSeleccionado) return
    setGuardandoPlan(true)
    const res = await cambiarPlanOrganizacion(modalPlan.id, planSeleccionado)
    if (res.success) {
      showToast('Plan actualizado correctamente', 'success')
      setModalPlan(null)
      loadOrganizaciones()
      if (modalOrganizacion?.id === modalPlan.id) {
        const currentPlan = planes.find(p => p.id === modalPlan.plan_id)
        const nextPlan = planes.find(p => p.id === planSeleccionado)
        const currentPrice = currentPlan ? Number(currentPlan.precio_usd) : 0
        const nextPrice = nextPlan ? Number(nextPlan.precio_usd) : 0
        
        if (nextPrice >= currentPrice) {
          setModalOrganizacion({ ...modalOrganizacion, plan_id: planSeleccionado, plan_pendiente_id: null })
        } else {
          setModalOrganizacion({ ...modalOrganizacion, plan_pendiente_id: planSeleccionado })
        }
      }
    } else {
      showToast(res.error || 'Error al cambiar plan', 'error')
    }
    setGuardandoPlan(false)
  }

  const handleRegistrarPago = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pagoForm.importe || isNaN(Number(pagoForm.importe))) return showToast('Importe inválido', 'error')
    
    setRegistrandoPago(true)
    const res = await registrarPagoYRenovar(
      modalPago.id,
      Number(pagoForm.importe),
      pagoForm.moneda,
      pagoForm.notas
    )
    if (res.success) {
      showToast('Pago registrado y renovación aplicada', 'success')
      setModalPago(null)
      loadOrganizaciones()
      if (modalOrganizacion?.id === modalPago.id) closeModal()
    } else {
      showToast(res.error || 'Error al registrar pago', 'error')
    }
    setRegistrandoPago(false)
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Organizaciones</h1>
        <p className="text-ink-500 mt-1">Todos los negocios que usan Respondi.</p>
      </div>

      {/* Buscador + filtros */}
      <div className="space-y-3 mb-5">
        <div className="relative">
          <svg className="w-5 h-5 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input 
            type="text" 
            placeholder="Buscar organización o vendedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-11 pl-11 pr-4 rounded-xl border border-slate-300 bg-white text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200 overflow-x-auto">
            {['Todos', 'Activo', 'Trial', 'Vencido', 'Suspendido'].map(f => (
              <button 
                key={f}
                onClick={() => setFiltro(f)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm transition ${filtro === f ? 'font-600 bg-brand-600 text-white' : 'font-500 text-ink-500'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista de organizaciones */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {loading ? (
          <Loading />
        ) : organizacionesFiltradas.length === 0 ? (
          <div className="p-8 text-center text-ink-500">No se encontraron organizaciones.</div>
        ) : (
          organizacionesFiltradas.map(o => {
            const statusStyle = getStatusColor(o.estado)
            const avatarStyle = getAvatarColor(o.estado)
            const iniciales = o.nombre.substring(0, 2).toUpperCase()
            
            return (
              <div key={o.id} onClick={() => openModal(o)} className="w-full text-left flex items-center gap-3 p-4 hover:bg-slate-50 transition cursor-pointer">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-600 shrink-0 ${avatarStyle}`}>{iniciales}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-600 text-ink-900">{o.nombre}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-600 ${statusStyle.split(' marker:')[0]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.split(' marker:')[1]}`}></span> {o.estado}
                    </span>
                  </div>
                  <p className="text-sm text-ink-500 mt-0.5 truncate">
                    Plan {o.plans?.nombre || 'Ninguno'} {o.plan_pendiente_id && planes.find(p => p.id === o.plan_pendiente_id) ? `(→ ${planes.find(p => p.id === o.plan_pendiente_id).nombre})` : ''} · vence el {o.fecha_vencimiento ? new Date(o.fecha_vencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'} · vendedor: {((o.vendedor_clientes || []).map((vc: any) => vc.vendedores?.nombre).filter(Boolean).join(', ')) || 'Sin vendedor'}
                  </p>
                </div>
                
                {canWrite && (
                  <button
                    onClick={(e) => handleImpersonar(e, o.id)}
                    disabled={impersonatingId === o.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-600 bg-brand-50 text-brand-700 hover:bg-brand-100 transition shrink-0 mr-2 disabled:opacity-50"
                  >
                    {impersonatingId === o.id ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Entrando...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>
                        Entrar como
                      </>
                    )}
                  </button>
                )}
                
                <svg className="w-5 h-5 text-ink-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </div>
            )
          })
        )}
      </div>

      {/* MODAL DETALLE ORGANIZACIÓN */}
      {modalOrganizacion && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="relative min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">{modalOrganizacion.nombre}</h2>
                <button onClick={closeModal} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                
                {/* Estado actual */}
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${modalOrganizacion.estado === 'activo' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(modalOrganizacion.estado).split(' marker:')[1]}`}></span>
                  <div className="flex-1">
                    <p className="text-sm font-600 text-ink-900">Plan {modalOrganizacion.plans?.nombre} · {modalOrganizacion.estado}</p>
                    {modalOrganizacion.plan_pendiente_id && planes.find(p => p.id === modalOrganizacion.plan_pendiente_id) && (
                      <p className="text-xs font-600 text-brand-600 mt-0.5">Cambiará a {planes.find(p => p.id === modalOrganizacion.plan_pendiente_id).nombre} el {modalOrganizacion.fecha_vencimiento ? new Date(modalOrganizacion.fecha_vencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'próxima renovación'}</p>
                    )}
                    <p className="text-xs text-ink-500">Vence el {modalOrganizacion.fecha_vencimiento ? new Date(modalOrganizacion.fecha_vencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}</p>
                  </div>
                </div>

                {/* Datos */}
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-ink-500">Alta</dt><dd className="text-ink-900 font-500 text-right">{new Date(modalOrganizacion.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-ink-500">Vendedor</dt><dd className="text-ink-900 font-500 text-right">{((modalOrganizacion.vendedor_clientes || []).map((vc: any) => vc.vendedores?.nombre).filter(Boolean).join(', ')) || 'Sin vendedor'}</dd></div>
                </dl>

                {/* Acciones de gestión */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-600 text-ink-500 uppercase tracking-wide">Gestión del plan</p>
                  <button onClick={() => {
                    setModalPago(modalOrganizacion)
                    setPagoForm({ importe: '', moneda: 'USD', notas: '' })
                  }} disabled={!canWrite} className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-600 transition">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Registrar pago y renovar
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button disabled={!canWrite} onClick={() => {
                      setModalPlan(modalOrganizacion)
                      setPlanSeleccionado(modalOrganizacion.plan_id || '')
                    }} className="h-10 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-sm font-600 text-ink-700 transition">Cambiar plan</button>
                    {modalOrganizacion.estado === 'suspendido' ? (
                      <button disabled={!canWrite} onClick={() => setConfirmarEstado({ org: modalOrganizacion, nuevoEstado: 'activo' })} className="h-10 rounded-xl border border-emerald-200 bg-white hover:bg-emerald-50 disabled:opacity-50 text-sm font-600 text-emerald-600 transition">Activar</button>
                    ) : (
                      <button disabled={!canWrite} onClick={() => setConfirmarEstado({ org: modalOrganizacion, nuevoEstado: 'suspendido' })} className="h-10 rounded-xl border border-red-200 bg-white hover:bg-red-50 disabled:opacity-50 text-sm font-600 text-red-600 transition">Suspender</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CAMBIAR PLAN */}
      {modalPlan && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => setModalPlan(null)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">Cambiar plan</h2>
                <button onClick={() => setModalPlan(null)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                {modalPlan.plan_pendiente_id && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 mb-4">
                    <strong>Cambio programado:</strong> La organización cambiará al plan {planes.find(p => p.id === modalPlan.plan_pendiente_id)?.nombre} en su próxima renovación ({modalPlan.fecha_vencimiento ? new Date(modalPlan.fecha_vencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}).
                  </div>
                )}
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Nuevo plan</label>
                  <select 
                    value={planSeleccionado} 
                    onChange={e => setPlanSeleccionado(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
                  >
                    <option value="">Selecciona un plan</option>
                    {planes.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre} (${p.precio_usd})</option>
                    ))}
                  </select>
                </div>
                
                {planSeleccionado && planSeleccionado !== modalPlan.plan_id && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-ink-600">
                    {(() => {
                      const currentPlan = planes.find(p => p.id === modalPlan.plan_id)
                      const nextPlan = planes.find(p => p.id === planSeleccionado)
                      const currentPrice = currentPlan ? Number(currentPlan.precio_usd) : 0
                      const nextPrice = nextPlan ? Number(nextPlan.precio_usd) : 0
                      
                      if (nextPrice >= currentPrice) {
                        return <p><span className="font-600 text-ink-900">Upgrade (o igual):</span> Este cambio se aplicará de inmediato.</p>
                      } else {
                        return <p><span className="font-600 text-ink-900">Downgrade:</span> Este cambio se aplicará en la próxima renovación. El cliente mantiene su plan actual hasta entonces.</p>
                      }
                    })()}
                  </div>
                )}
                
                <button 
                  onClick={handleGuardarPlan} 
                  disabled={guardandoPlan || !planSeleccionado || planSeleccionado === modalPlan.plan_id}
                  className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-600 transition flex items-center justify-center"
                >
                  {guardandoPlan ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR PAGO Y RENOVAR */}
      {modalPago && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => setModalPago(null)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">Registrar pago y renovar</h2>
                <button onClick={() => setModalPago(null)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <form onSubmit={handleRegistrarPago} className="px-6 py-5 space-y-4">
                <p className="text-sm text-ink-500">
                  Esta acción extenderá la suscripción por 1 mes (y activará la cuenta si estaba suspendida/vencida).
                </p>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Importe</label>
                    <input 
                      type="number" step="0.01" required
                      value={pagoForm.importe} onChange={e => setPagoForm({...pagoForm, importe: e.target.value})}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
                      placeholder="Ej. 19.90"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Moneda</label>
                    <select 
                      value={pagoForm.moneda} onChange={e => setPagoForm({...pagoForm, moneda: e.target.value})}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
                    >
                      {['USD', 'EUR', 'COP', 'MXN', 'ARS', 'CLP', 'PEN'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Notas (Opcional)</label>
                  <textarea 
                    value={pagoForm.notas} onChange={e => setPagoForm({...pagoForm, notas: e.target.value})}
                    className="w-full h-20 px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition resize-none"
                    placeholder="Referencia de pago, detalles..."
                  />
                </div>

                <button 
                  type="submit"
                  disabled={registrandoPago || !pagoForm.importe}
                  className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-600 transition flex items-center justify-center"
                >
                  {registrandoPago ? 'Registrando...' : 'Registrar y renovar'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ConfirmModal Estado */}
      <ConfirmModal
        isOpen={!!confirmarEstado}
        title={confirmarEstado?.nuevoEstado === 'suspendido' ? 'Suspender organización' : 'Activar organización'}
        message={confirmarEstado ? `¿Estás seguro de que quieres ${confirmarEstado.nuevoEstado === 'suspendido' ? 'suspender' : 'activar'} la organización "${confirmarEstado.org.nombre}"?` : ''}
        confirmText={confirmarEstado?.nuevoEstado === 'suspendido' ? 'Suspender' : 'Activar'}
        type={confirmarEstado?.nuevoEstado === 'suspendido' ? 'danger' : 'info'}
        isLoading={changingEstado}
        onConfirm={handleConfirmarCambioEstado}
        onClose={() => setConfirmarEstado(null)}
      />
    </>
  )
}
