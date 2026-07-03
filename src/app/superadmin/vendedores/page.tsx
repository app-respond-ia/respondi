'use client'

import { useState, useEffect } from 'react'
import { getVendedores, crearVendedor, actualizarVendedor } from '@/app/actions/superadmin'

export default function VendedoresPage() {
  const [vendedores, setVendedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'crear' | 'editar'>('crear')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    comision_conversion_pct: 10,
    comision_mrr_pct: 5,
    activo: true,
    notas: ''
  })

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const res = await getVendedores()
    if (res.success && res.vendedores) setVendedores(res.vendedores)
    setLoading(false)
  }

  const openCrear = () => {
    setModalMode('crear')
    setSelectedId(null)
    setFormData({ nombre: '', email: '', comision_conversion_pct: 10, comision_mrr_pct: 5, activo: true, notas: '' })
    setIsModalOpen(true)
  }

  const openEditar = (v: any) => {
    setModalMode('editar')
    setSelectedId(v.id)
    setFormData({
      nombre: v.nombre || '',
      email: v.email || '',
      comision_conversion_pct: v.comision_conversion_pct || 10,
      comision_mrr_pct: v.comision_mrr_pct || 5,
      activo: v.activo ?? true,
      notas: v.notas || ''
    })
    setIsModalOpen(true)
  }

  const handleGuardar = async () => {
    if (!formData.nombre || !formData.email) {
      setMensaje({ tipo: 'error', texto: 'Nombre y email son obligatorios' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setSaving(true)
    let res
    if (modalMode === 'crear') {
      res = await crearVendedor(formData)
    } else {
      res = await actualizarVendedor(selectedId!, {
        nombre: formData.nombre,
        comision_conversion_pct: formData.comision_conversion_pct,
        comision_mrr_pct: formData.comision_mrr_pct,
        activo: formData.activo,
        notas: formData.notas
      })
    }
    if (res.success) {
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: modalMode === 'crear' ? 'Vendedor creado y email de acceso enviado ✓' : 'Vendedor actualizado ✓' })
      setTimeout(() => setMensaje(null), 4000)
      cargar()
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setSaving(false)
  }

  const totalClientes = vendedores.reduce((acc, v) => acc + (v.vendedor_clientes?.length || 0), 0)
  const totalActivos = vendedores.filter(v => v.activo).length

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
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Vendedores</h1>
          <p className="text-ink-500 mt-1">Afiliados externos que traen clientes a Respondi.</p>
        </div>
        <button onClick={openCrear} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition shadow-lg shadow-brand-600/30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nuevo vendedor
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Vendedores activos</p>
          <p className="font-display font-700 text-2xl text-ink-900">{totalActivos}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Total registrados</p>
          <p className="font-display font-700 text-2xl text-ink-900">{vendedores.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-sm text-ink-500 mb-1">Clientes en cartera</p>
          <p className="font-display font-700 text-2xl text-ink-900">{totalClientes}</p>
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
            const avatarColors = ['bg-brand-100 text-brand-700', 'bg-blue-100 text-blue-700', 'bg-orange-100 text-orange-700', 'bg-purple-100 text-purple-700']
            const color = avatarColors[i % avatarColors.length]
            const iniciales = v.nombre.substring(0, 2).toUpperCase()
            const numClientes = v.vendedor_clientes?.length || 0
            const clientesActivos = v.vendedor_clientes?.filter((c: any) => c.estado_seguimiento === 'activo').length || 0

            return (
              <div key={v.id} className="flex items-center gap-4 p-4">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-600 shrink-0 ${color} ${!v.activo ? 'opacity-40' : ''}`}>
                  {iniciales}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-600 text-ink-900">{v.nombre}</p>
                    {!v.activo && (
                      <span className="text-[10px] font-600 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Inactivo</span>
                    )}
                  </div>
                  <p className="text-sm text-ink-500 truncate">{v.email}</p>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-600">
                      Conv. {v.comision_conversion_pct}%
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-600">
                      MRR {v.comision_mrr_pct}%
                    </span>
                  </div>
                  <p className="text-xs text-ink-400">{numClientes} clientes · {clientesActivos} activos</p>
                </div>
                <button onClick={() => openEditar(v)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl pointer-events-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">
                  {modalMode === 'crear' ? 'Nuevo vendedor' : 'Editar vendedor'}
                </h2>
                <button onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre</label>
                  <input type="text" placeholder="Nombre completo" value={formData.nombre}
                    onChange={e => setFormData({...formData, nombre: e.target.value})}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">
                    Email {modalMode === 'editar' && <span className="text-ink-400 font-400">· no editable</span>}
                  </label>
                  <input type="email" placeholder="vendedor@ejemplo.com" value={formData.email}
                    disabled={modalMode === 'editar'}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:bg-slate-50 disabled:text-ink-400" />
                  {modalMode === 'crear' && (
                    <p className="text-xs text-ink-400 mt-1.5">Se enviará un email de invitación con acceso al panel de vendedor.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Comisión conversión (%)</label>
                    <input type="number" min="0" max="100" step="0.5" value={formData.comision_conversion_pct}
                      onChange={e => setFormData({...formData, comision_conversion_pct: parseFloat(e.target.value)})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    <p className="text-xs text-ink-400 mt-1">Por conversión de trial a pago</p>
                  </div>
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Comisión MRR (%)</label>
                    <input type="number" min="0" max="100" step="0.5" value={formData.comision_mrr_pct}
                      onChange={e => setFormData({...formData, comision_mrr_pct: parseFloat(e.target.value)})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    <p className="text-xs text-ink-400 mt-1">Mensual recurrente</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Notas internas <span className="text-ink-400 font-400">· opcional</span></label>
                  <textarea rows={2} placeholder="Datos fiscales, acuerdos especiales..."
                    value={formData.notas}
                    onChange={e => setFormData({...formData, notas: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                {modalMode === 'editar' && (
                  <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <span className="text-sm font-500 text-ink-700">Vendedor activo</span>
                    <input type="checkbox" checked={formData.activo}
                      onChange={e => setFormData({...formData, activo: e.target.checked})}
                      className="w-5 h-5 rounded text-brand-600 focus:ring-brand-400" />
                  </label>
                )}
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
                <button onClick={() => setIsModalOpen(false)} disabled={saving}
                  className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleGuardar} disabled={saving}
                  className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50">
                  {saving ? 'Guardando...' : modalMode === 'crear' ? 'Crear y enviar invitación' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
