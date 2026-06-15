'use client'

import { useState, useEffect } from 'react'
import { getSucursales, crearSucursal, desactivarSucursal, reactivarSucursal } from '@/app/actions/sucursales'

export default function SucursalesPage() {
  const [loading, setLoading] = useState(true)
  const [sucursales, setSucursales] = useState<any[]>([])
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  // Modal Crear
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalData, setModalData] = useState<{ nombre: string, direccion: string, copiarDesdeId: string }>({
    nombre: '', direccion: '', copiarDesdeId: ''
  })
  const [modalError, setModalError] = useState<string | null>(null)

  const cargar = async () => {
    setLoading(true)
    const res = await getSucursales()
    if (res.success && res.data) {
      setSucursales(res.data.sucursales)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al cargar sucursales' })
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const handleOpenModal = () => {
    setModalData({ nombre: '', direccion: '', copiarDesdeId: '' })
    setModalError(null)
    setIsModalOpen(true)
  }

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault()
    setModalLoading(true)
    setModalError(null)

    const res = await crearSucursal(modalData.nombre, modalData.direccion, modalData.copiarDesdeId || undefined)

    if (res.success && res.data) {
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: 'Sucursal creada correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
      setSucursales([...sucursales, res.data])
    } else {
      setModalError(res.error || 'Error al crear sucursal')
    }
    setModalLoading(false)
  }

  const handleToggleActivo = async (sucursal: any) => {
    const isDesactivando = sucursal.activa
    let res

    if (isDesactivando) {
      res = await desactivarSucursal(sucursal.id)
    } else {
      res = await reactivarSucursal(sucursal.id)
    }

    if (res.success) {
      setMensaje({ tipo: 'exito', texto: `Sucursal ${isDesactivando ? 'desactivada' : 'reactivada'} correctamente ✓` })
      setTimeout(() => setMensaje(null), 3000)
      cargar()
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al cambiar estado de la sucursal' })
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando sucursales...</div>
  }

  return (
    <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto pb-20">
      {/* Mensaje global */}
      {mensaje && (
        <div className={`mb-6 p-4 rounded-xl font-500 text-sm border flex items-center gap-2 ${
          mensaje.tipo === 'exito' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Sucursales</h1>
          <p className="text-ink-500 mt-1">Las sucursales de tu comercio. Nunca se eliminan, solo se desactivan.</p>
        </div>
        
        <button 
          onClick={handleOpenModal}
          className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 text-white text-sm font-600 transition hover:bg-brand-700">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Añadir sucursal
        </button>
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
                  {modalError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm font-500">
                      {modalError}
                    </div>
                  )}

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
    </div>
  )
}
