'use client'
import Loading from '@/components/Loading'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSucursales, crearSucursal, desactivarSucursal, reactivarSucursal } from '@/app/actions/sucursales'
import { getMisPermisos } from '@/app/actions/permisos'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { PAISES } from '@/lib/paises'

export default function SucursalesPage() {
  const [loading, setLoading] = useState(true)
  const [sucursales, setSucursales] = useState<any[]>([])
  const [sucursalesMax, setSucursalesMax] = useState<number | null>(null)
  const [sucursalesActivasCount, setSucursalesActivasCount] = useState<number>(0)
  const { showToast } = useToast()
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  // CAMBIO 6: Modal de confirmación para desactivar
  const [confirmarDesactivar, setConfirmarDesactivar] = useState<any | null>(null)

  // Modal Crear
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalData, setModalData] = useState<{ nombre: string, direccion: string, pais: string, copiarDesdeId: string }>({
    nombre: '', direccion: '', pais: '', copiarDesdeId: ''
  })

  const cargar = async () => {
    setLoading(true)
    const [res, permisosRes] = await Promise.all([
      getSucursales(),
      getMisPermisos()
    ])

    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        setNivelPermiso('escritura')
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'sucursales')
        setNivelPermiso(p?.nivel || 'ninguno')
      }
    }

    if (res.success && res.data) {
      setSucursales(res.data.sucursales)
      setSucursalesMax(res.data.sucursales_max)
      setSucursalesActivasCount(res.data.sucursales_activas_count || 0)
    } else {
      showToast(res.error || 'Error al cargar sucursales', 'error')
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const handleOpenModal = () => {
    setModalData({ nombre: '', direccion: '', pais: '', copiarDesdeId: '' })
    setIsModalOpen(true)
  }

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault()
    setModalLoading(true)

    const res = await crearSucursal(modalData.nombre, modalData.direccion, modalData.copiarDesdeId || undefined, modalData.pais)

    if (res.success && res.data) {
      setIsModalOpen(false)
      showToast('Sucursal creada correctamente ✓', 'success')
      setSucursales([...sucursales, res.data])
    } else {
      showToast(res.error || 'Error al crear sucursal', 'error')
    }
    setModalLoading(false)
  }

  const handleToggleActivo = async (sucursal: any) => {
    if (sucursal.activa) {
      // CAMBIO 6: Mostrar modal de confirmación antes de desactivar
      setConfirmarDesactivar(sucursal)
      return
    }
    // Reactivar directamente sin confirmación
    const res = await reactivarSucursal(sucursal.id)
    if (res.success) {
      showToast('Sucursal reactivada correctamente ✓', 'success')
      cargar()
    } else {
      showToast(res.error || 'Error al reactivar la sucursal', 'error')
    }
  }

  const handleConfirmarDesactivar = async () => {
    if (!confirmarDesactivar) return
    const sucursal = confirmarDesactivar
    setConfirmarDesactivar(null)
    const res = await desactivarSucursal(sucursal.id)
    if (res.success) {
      showToast('Sucursal desactivada correctamente ✓', 'success')
      cargar()
    } else {
      showToast(res.error || 'Error al desactivar la sucursal', 'error')
    }
  }

  if (loading || nivelPermiso === null) {
    return <Loading />
  }

  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-bold text-ink-900 mb-2">Acceso denegado</h2>
        <p className="text-ink-500">No tienes permisos para ver las sucursales.</p>
      </div>
    )
  }

  const limitReached = sucursalesMax !== null && sucursalesActivasCount >= sucursalesMax

  return (
    <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto pb-20">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Sucursales</h1>
          <p className="text-ink-500 mt-1">Las sucursales de tu organización. Nunca se eliminan, solo se desactivan.</p>
        </div>
        
        <div className="group relative">
          {limitReached || nivelPermiso !== 'escritura' ? (
            <button disabled className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 text-white text-sm font-600 transition opacity-50 cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
              Añadir sucursal
            </button>
          ) : (
            <Link href="/dashboard/sucursales/nueva" className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition shadow-lg shadow-brand-600/30">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
              Añadir sucursal
            </Link>
          )}
          {limitReached && (
            <div className="absolute top-full right-0 mt-2 px-2 py-1 bg-ink-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none z-10">
              Has alcanzado el límite de sucursales de tu plan
            </div>
          )}
        </div>
      </div>

      {/* Contador de plan */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6">
        {sucursalesMax !== null ? (
          <>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-600 text-ink-900">Sucursales del plan</p>
                <p className="text-xs text-ink-500 mt-0.5">Estás usando {sucursalesActivasCount} de {sucursalesMax} disponibles</p>
              </div>
              <span className="font-display font-700 text-2xl text-ink-900">{sucursalesActivasCount}<span className="text-ink-400 font-500 text-lg">/{sucursalesMax}</span></span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full" style={{ width: `${Math.min((sucursalesActivasCount / sucursalesMax) * 100, 100)}%` }}></div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-600 text-ink-900">Sucursales del plan</p>
              <p className="text-xs text-ink-500 mt-0.5">Sin límite de sucursales</p>
            </div>
            <span className="font-display font-700 text-2xl text-ink-900">{sucursalesActivasCount}</span>
          </div>
        )}
      </div>

      {/* Lista de sucursales */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {sucursales.map(sucursal => (
          <div key={sucursal.id} className={`flex items-center gap-4 p-5 ${!sucursal.activa ? 'opacity-50' : ''}`}>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <p className="font-600 text-ink-900 text-lg">
                  {sucursal.nombre}
                </p>
                {sucursal.activa ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-600">
                    Activa
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 text-xs font-600">
                    Inactiva
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-500 truncate">
                {sucursal.direccion || 'Sin dirección'}
              </p>
            </div>

            <button 
              onClick={() => handleToggleActivo(sucursal)}
              disabled={nivelPermiso !== 'escritura'}
              className={`px-3 py-1.5 rounded-lg text-sm font-600 border transition ${
                sucursal.activa 
                  ? 'border-red-200 bg-white text-red-600 hover:bg-red-50' 
                  : 'border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50'
              }`}
            >
              {sucursal.activa ? 'Desactivar' : 'Reactivar'}
            </button>
          </div>
        ))}
        {sucursales.length === 0 && (
          <div className="p-8 text-center text-ink-500">No tienes sucursales.</div>
        )}
      </div>

      {/* =========================================================
           POPUP · Añadir sucursal
           ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !modalLoading && setIsModalOpen(false)}></div>
        
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl pointer-events-auto flex flex-col max-h-[90vh]">
              
              <form onSubmit={handleCrear} className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                  <h2 className="font-display font-700 text-lg text-ink-900">Añadir sucursal</h2>
                  <button type="button" onClick={() => !modalLoading && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
        
                <div className="px-6 py-5 space-y-4 overflow-y-auto">
                  
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre</label>
                    <input type="text" placeholder="Ej: Sucursal Centro" required
                      value={modalData.nombre} onChange={e => setModalData({...modalData, nombre: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Dirección <span className="text-ink-400 font-400">· opcional</span></label>
                    <input type="text" placeholder="Calle principal 123"
                      value={modalData.direccion} onChange={e => setModalData({...modalData, direccion: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" />
                  </div>

                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">País</label>
                    <select
                      value={modalData.pais} onChange={e => setModalData({...modalData, pais: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm"
                    >
                      <option value="">Selecciona un país</option>
                      {PAISES.map(p => <option key={p.codigo} value={p.codigo}>{p.bandera} {p.nombre}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Copiar configuración desde <span className="text-ink-400 font-400">· opcional</span></label>
                    <select
                      value={modalData.copiarDesdeId}
                      onChange={e => setModalData({...modalData, copiarDesdeId: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm"
                    >
                      <option value="">No copiar (empezar vacía)</option>
                      {sucursales.map(s => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
        
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                  <button type="button" disabled={modalLoading} onClick={() => setIsModalOpen(false)} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={modalLoading || modalData.nombre.trim().length === 0} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50">
                    {modalLoading ? 'Guardando...' : 'Guardar sucursal'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmarDesactivar}
        title="¿Desactivar sucursal?"
        message={confirmarDesactivar ? `Vas a desactivar ${confirmarDesactivar.nombre}. La sucursal no se eliminará y podrás reactivarla cuando quieras.` : ''}
        confirmText="Sí, desactivar"
        cancelText="Cancelar"
        type="danger"
        onConfirm={handleConfirmarDesactivar}
        onClose={() => setConfirmarDesactivar(null)}
      />
    </div>
  )
}
