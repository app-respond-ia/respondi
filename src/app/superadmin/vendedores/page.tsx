'use client'

import { useState, useEffect } from 'react'
import { getVendedores, crearVendedor, actualizarVendedor } from '@/app/actions/superadmin'

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalData, setModalData] = useState<any>(null) // null = cerrado, obj = editar, {} = crear
  
  // form state
  const [formData, setFormData] = useState({
    nombre: '', email: '', datos_fiscales: '', porcentaje_comision: 15, tipo_comision: 'recurrente'
  })

  useEffect(() => {
    loadVendedores()
  }, [])

  async function loadVendedores() {
    setLoading(true)
    const { success, vendedores: data } = await getVendedores()
    if (success && data) setVendedores(data)
    setLoading(false)
  }

  const openModal = (vendedor?: any) => {
    if (vendedor) {
      setFormData({
        nombre: vendedor.nombre || '',
        email: vendedor.email || '',
        datos_fiscales: vendedor.datos_fiscales || '',
        porcentaje_comision: vendedor.porcentaje_comision || 15,
        tipo_comision: vendedor.tipo_comision || 'recurrente'
      })
      setModalData(vendedor)
    } else {
      setFormData({ nombre: '', email: '', datos_fiscales: '', porcentaje_comision: 15, tipo_comision: 'recurrente' })
      setModalData({}) // indica modo creacion
    }
    document.body.style.overflow = 'hidden'
  }

  const closeModal = () => {
    setModalData(null)
    document.body.style.overflow = ''
  }

  const saveVendedor = async () => {
    if (modalData.id) {
      await actualizarVendedor(modalData.id, formData)
    } else {
      await crearVendedor(formData)
    }
    closeModal()
    loadVendedores()
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Vendedores</h1>
          <p className="text-ink-500 mt-1">Quién trae organizaciones y cuánto comisiona.</p>
        </div>
        <button onClick={() => openModal()} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nuevo vendedor
        </button>
      </div>

      {/* Resumen */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-100 p-4 mb-6 flex items-center gap-4 flex-wrap">
        <div>
          <p className="text-sm text-ink-600">Vendedores registrados</p>
          <p className="font-display font-700 text-2xl text-ink-900">{vendedores.length}</p>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-ink-500">Cargando vendedores...</div>
        ) : vendedores.length === 0 ? (
          <div className="p-8 text-center text-ink-500">No hay vendedores registrados.</div>
        ) : (
          vendedores.map((v, i) => {
            const isRecurrente = v.tipo_comision === 'recurrente'
            const badgeClass = isRecurrente 
              ? 'bg-emerald-100 text-emerald-700' 
              : 'bg-amber-100 text-amber-700'
            const avatarColors = ['bg-brand-100 text-brand-700', 'bg-blue-100 text-blue-700', 'bg-orange-100 text-orange-700']
            const color = avatarColors[i % avatarColors.length]
            const iniciales = v.nombre.substring(0, 2).toUpperCase()

            return (
              <button key={v.id} onClick={() => openModal(v)} className="w-full text-left flex items-center gap-3 p-4 hover:bg-slate-50 transition">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-600 shrink-0 ${color}`}>{iniciales}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-600 text-ink-900">{v.nombre}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-600 ${badgeClass}`}>
                      {v.porcentaje_comision}% {v.tipo_comision}
                    </span>
                  </div>
                  <p className="text-sm text-ink-500 mt-0.5 truncate">{v.email || 'Sin correo'}</p>
                </div>
                <svg className="w-5 h-5 text-ink-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            )
          })
        )}
      </div>

      {/* MODAL */}
      {modalData && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="relative min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">{modalData.id ? 'Editar Vendedor' : 'Nuevo Vendedor'}</h2>
                <button onClick={closeModal} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre</label>
                  <input type="text" placeholder="Nombre del vendedor"
                    value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Correo</label>
                  <input type="email" placeholder="vendedor@ejemplo.com"
                    value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Datos fiscales <span className="text-ink-400 font-400">· para liquidar</span></label>
                  <input type="text" placeholder="RIF / NIF"
                    value={formData.datos_fiscales} onChange={e => setFormData({...formData, datos_fiscales: e.target.value})}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Comisión (%)</label>
                    <input type="number" value={formData.porcentaje_comision} onChange={e => setFormData({...formData, porcentaje_comision: parseFloat(e.target.value)})} 
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                  </div>
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Tipo</label>
                    <select value={formData.tipo_comision} onChange={e => setFormData({...formData, tipo_comision: e.target.value})}
                      className="w-full h-12 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
                      <option value="recurrente">Recurrente</option>
                      <option value="puntual">Puntual</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <svg className="w-4 h-4 text-ink-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <p className="text-xs text-ink-600"><strong>Recurrente:</strong> comisiona en cada renovación. <strong>Puntual:</strong> solo en el primer pago de la organización.</p>
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
                <button onClick={closeModal} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition">Cancelar</button>
                <button onClick={saveVendedor} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
