'use client'
import Loading from '@/components/Loading'

import { useState, useEffect } from 'react'
import { getPlanes, actualizarPlan, crearPlan, eliminarPlan } from '@/app/actions/superadmin'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import { useSuperadminPermisos } from '@/components/layout/SuperadminPermisosContext'

export default function PlanesPage() {
  const [planes, setPlanes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalData, setModalData] = useState<any>(null)
  
  const [confirmarBorrar, setConfirmarBorrar] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const { hasPermission } = useSuperadminPermisos()
  const canWrite = hasPermission('planes', 'escritura')

  const defaultFormData = {
    nombre: '', precio_usd: 0, creditos_mensuales: 1000, canales_max: 1, sucursales_max: 1, 
    usuarios_max: 1, precio_credito_adicional: 0.005, precio_sucursal_extra: 15, 
    dias_retencion_mensajes: 30, modelo_ia: 'gpt-4o-mini', activo: false, acumula_creditos: false
  }
  
  const [formData, setFormData] = useState({ ...defaultFormData })

  useEffect(() => {
    loadPlanes()
  }, [])

  async function loadPlanes() {
    setLoading(true)
    const { success, planes: data } = await getPlanes()
    if (success && data) setPlanes(data)
    setLoading(false)
  }

  const openModal = (plan: any) => {
    if (plan) {
      setFormData({
        nombre: plan.nombre || '',
        precio_usd: plan.precio_usd || 0,
        creditos_mensuales: plan.creditos_mensuales || 0,
        canales_max: plan.canales_max || 0,
        sucursales_max: plan.sucursales_max || 0,
        usuarios_max: plan.usuarios_max || 0,
        precio_credito_adicional: plan.precio_credito_adicional || 0,
        precio_sucursal_extra: plan.precio_sucursal_extra || 0,
        dias_retencion_mensajes: plan.dias_retencion_mensajes || 30,
        modelo_ia: plan.modelo_ia || 'gpt-4o-mini',
        activo: plan.activo ?? true,
        acumula_creditos: plan.acumula_creditos ?? false
      })
      setModalData(plan)
    } else {
      setFormData({ ...defaultFormData })
      setModalData({}) // Empty object for new plan
    }
    document.body.style.overflow = 'hidden'
  }

  const closeModal = () => {
    setModalData(null)
    document.body.style.overflow = ''
  }

  const handleGuardar = async () => {
    if (!formData.nombre.trim()) {
      showToast('El nombre es obligatorio.', 'error')
      return
    }
    if (formData.precio_usd !== undefined && formData.precio_usd < 0) {
      showToast('El precio no puede ser negativo.', 'error')
      return
    }
    
    setSaving(true)
    let res;
    if (modalData && modalData.id) {
      res = await actualizarPlan(modalData.id, formData)
    } else {
      res = await crearPlan(formData)
    }
    setSaving(false)

    if (res.success) {
      closeModal()
      showToast(modalData?.id ? 'Plan actualizado ✓' : 'Plan creado ✓', 'success')
      loadPlanes()
    } else {
      showToast(res.error || 'Error al guardar.', 'error')
    }
  }

  const handleToggleActivo = async (p: any) => {
    const res = await actualizarPlan(p.id, { activo: !p.activo })
    if (res.success) {
      showToast(`Plan ${!p.activo ? 'publicado' : 'ocultado'}`, 'success')
      loadPlanes()
    } else {
      showToast(res.error || 'Error al actualizar.', 'error')
    }
  }

  const handleConfirmarBorrar = async () => {
    if (!confirmarBorrar) return
    setSaving(true)
    const res = await eliminarPlan(confirmarBorrar.id)
    setSaving(false)
    if (res.success) {
      setConfirmarBorrar(null)
      closeModal() // In case it was opened from modal
      showToast('Plan eliminado ✓', 'success')
      loadPlanes()
    } else {
      setConfirmarBorrar(null)
      showToast(res.error || 'Error al eliminar.', 'error')
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Planes y precios</h1>
          <p className="text-ink-500 mt-1">Configura los límites de cada nivel de suscripción.</p>
        </div>
        {canWrite && (
          <button onClick={() => openModal(null)} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nuevo plan
          </button>
        )}
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {planes.map(p => {
            const isPro = p.nombre?.toLowerCase().includes('pro')
            return (
              <div key={p.id} className={`relative flex flex-col rounded-3xl border overflow-hidden ${isPro ? 'border-brand-500 shadow-2xl shadow-brand-900/10' : 'border-slate-200 bg-white'}`}>
                {isPro && (
                  <div className="absolute inset-0 bg-gradient-to-b from-brand-600 to-brand-800 opacity-5 pointer-events-none"></div>
                )}
                
                {/* Cabecera */}
                <div className={`p-6 border-b ${isPro ? 'bg-gradient-to-r from-brand-600 to-brand-800 text-white border-brand-800/50' : 'border-slate-100'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className={`font-display font-700 text-xl ${isPro ? 'text-white' : 'text-ink-900'}`}>{p.nombre}</h3>
                      <button disabled={!canWrite} onClick={() => handleToggleActivo(p)} className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-600 uppercase tracking-wider transition border disabled:opacity-50 disabled:cursor-not-allowed ${p.activo ? (isPro ? 'bg-white/20 text-white border-white/30 hover:bg-white/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100') : (isPro ? 'bg-red-500/20 text-red-100 border-red-500/30 hover:bg-red-500/40' : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100')}`}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>
                    <div className="text-right">
                      <p className={`font-display font-700 text-2xl ${isPro ? 'text-white' : 'text-ink-900'}`}>${p.precio_usd}</p>
                      <p className={`text-xs ${isPro ? 'text-brand-200' : 'text-ink-400'}`}>/mes</p>
                    </div>
                  </div>
                </div>

                {/* Límites */}
                <div className="p-6 flex-1 bg-white">
                  <ul className="space-y-3.5 text-sm">
                    <li className="flex items-center gap-3">
                      <svg className={`w-5 h-5 shrink-0 ${isPro ? 'text-brand-500' : 'text-ink-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      <span className="text-ink-700"><strong className="font-600 text-ink-900">{p.creditos_mensuales.toLocaleString()}</strong> créditos IA /mes</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <svg className={`w-5 h-5 shrink-0 ${isPro ? 'text-brand-500' : 'text-ink-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      <span className="text-ink-700"><strong className="font-600 text-ink-900">{p.canales_max}</strong> canales de conexión</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <svg className={`w-5 h-5 shrink-0 ${isPro ? 'text-brand-500' : 'text-ink-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      <span className="text-ink-700"><strong className="font-600 text-ink-900">{p.sucursales_max}</strong> sucursales permitidas</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <svg className={`w-5 h-5 shrink-0 ${isPro ? 'text-brand-500' : 'text-ink-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      <span className="text-ink-700"><strong className="font-600 text-ink-900">{p.usuarios_max}</strong> usuarios de equipo</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <svg className={`w-5 h-5 shrink-0 ${isPro ? 'text-brand-500' : 'text-ink-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                      <span className="text-ink-700">Modelo: <strong className="font-600 text-ink-900">{p.modelo_ia}</strong></span>
                    </li>
                  </ul>
                  <div className="mt-6 pt-5 border-t border-slate-100">
                    <p className="text-xs text-ink-500 mb-1">Costo adicional:</p>
                    <p className="text-xs text-ink-700">${p.precio_credito_adicional} por cada crédito extra</p>
                    <p className="text-xs text-ink-700">${p.precio_sucursal_extra} por sucursal extra</p>
                  </div>
                </div>

                {/* Botón */}
                {canWrite && (
                  <div className="p-6 pt-0 bg-white relative z-10 flex gap-2">
                    <button onClick={() => openModal(p)} className={`flex-1 h-11 rounded-xl text-sm font-600 transition ${isPro ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-ink-900'}`}>
                      Editar
                    </button>
                    <button onClick={() => setConfirmarBorrar(p)} className="px-4 rounded-xl text-ink-400 hover:bg-red-50 hover:text-red-600 transition" title="Eliminar plan">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL EDICIÓN */}
      {modalData && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="relative min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">{modalData.id ? `Editar plan: ${modalData.nombre}` : 'Nuevo plan'}</h2>
                <button onClick={closeModal} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-6">
                
                {/* Bloque Precios */}
                <div>
                  <h3 className="text-sm font-600 text-ink-900 mb-3 uppercase tracking-wide">Configuración básica</h3>
                  <div className="mb-4">
                    <label className="block text-xs font-500 text-ink-600 mb-1.5">Nombre del plan</label>
                    <input type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100" placeholder="Ej. Pro, Basic, Plus..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-500 text-ink-600 mb-1.5">Precio base (USD/mes)</label>
                      <input type="number" step="0.01" value={formData.precio_usd} onChange={e => setFormData({...formData, precio_usd: parseFloat(e.target.value)})} className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 mb-2 cursor-pointer">
                        <input type="checkbox" checked={formData.activo} onChange={e => setFormData({...formData, activo: e.target.checked})} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300" />
                        <span className="text-sm font-500 text-ink-700">Plan activo (visible)</span>
                      </label>
                      <label className="flex items-center gap-2 mb-2 cursor-pointer mt-2">
                        <input type="checkbox" checked={formData.acumula_creditos} onChange={e => setFormData({...formData, acumula_creditos: e.target.checked})} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300" />
                        <span className="text-sm font-500 text-ink-700">Acumular créditos no usados al renovar (por defecto, se resetean cada mes)</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100"></div>

                {/* Bloque Límites incluidos */}
                <div>
                  <h3 className="text-sm font-600 text-ink-900 mb-3 uppercase tracking-wide">Límites incluidos</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-500 text-ink-600 mb-1.5">Créditos IA /mes</label>
                      <input type="number" value={formData.creditos_mensuales} onChange={e => setFormData({...formData, creditos_mensuales: parseInt(e.target.value)})} className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-500 text-ink-600 mb-1.5">Canales máximos</label>
                      <input type="number" value={formData.canales_max} onChange={e => setFormData({...formData, canales_max: parseInt(e.target.value)})} className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-500 text-ink-600 mb-1.5">Sucursales máximas</label>
                      <input type="number" value={formData.sucursales_max} onChange={e => setFormData({...formData, sucursales_max: parseInt(e.target.value)})} className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-500 text-ink-600 mb-1.5">Usuarios máximos</label>
                      <input type="number" value={formData.usuarios_max} onChange={e => setFormData({...formData, usuarios_max: parseInt(e.target.value)})} className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-500 text-ink-600 mb-1.5">Modelo IA asignado</label>
                      <select value={formData.modelo_ia} onChange={e => setFormData({...formData, modelo_ia: e.target.value})} className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                        <option value="gpt-4o-mini">GPT-4o mini (Rápido)</option>
                        <option value="gpt-4o">GPT-4o (Complejo)</option>
                        <option value="claude-3-haiku">Claude 3 Haiku</option>
                        <option value="llama-3">Llama 3</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-500 text-ink-600 mb-1.5">Retención mensajes (días)</label>
                      <input type="number" value={formData.dias_retencion_mensajes} onChange={e => setFormData({...formData, dias_retencion_mensajes: parseInt(e.target.value)})} className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100"></div>

                {/* Bloque Extras */}
                <div>
                  <h3 className="text-sm font-600 text-ink-900 mb-3 uppercase tracking-wide">Costos extra</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-500 text-ink-600 mb-1.5">Precio x Crédito adicional ($)</label>
                      <input type="number" step="0.001" value={formData.precio_credito_adicional} onChange={e => setFormData({...formData, precio_credito_adicional: parseFloat(e.target.value)})} className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-500 text-ink-600 mb-1.5">Precio x Sucursal extra ($)</label>
                      <input type="number" step="0.01" value={formData.precio_sucursal_extra} onChange={e => setFormData({...formData, precio_sucursal_extra: parseFloat(e.target.value)})} className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    </div>
                  </div>
                </div>

              </div>
              <div className="flex justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                {modalData.id ? (
                  <button onClick={() => { closeModal(); setConfirmarBorrar(modalData); }} className="px-5 h-11 rounded-xl bg-white border border-red-200 hover:bg-red-50 text-sm font-600 text-red-600 transition">Eliminar</button>
                ) : (
                  <div></div>
                )}
                <div className="flex gap-3">
                  <button onClick={closeModal} disabled={saving} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">Cancelar</button>
                  <button onClick={handleGuardar} disabled={saving} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ConfirmModal Eliminación */}
      <ConfirmModal
        isOpen={!!confirmarBorrar}
        title="Eliminar plan"
        message={confirmarBorrar ? `¿Estás seguro de que quieres eliminar el plan ${confirmarBorrar.nombre}? Esto solo será posible si no hay clientes usando este plan.` : ''}
        confirmText="Eliminar"
        type="danger"
        isLoading={saving}
        onConfirm={handleConfirmarBorrar}
        onClose={() => setConfirmarBorrar(null)}
      />
    </>
  )
}
