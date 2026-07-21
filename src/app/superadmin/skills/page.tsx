'use client'

import { useState, useEffect } from 'react'
import { getSkillsGlobales, crearSkillGlobal, actualizarSkillGlobal, eliminarSkillGlobal } from '@/app/actions/skills-globales'

export default function SuperadminSkillsPage() {
  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'crear' | 'editar'>('crear')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    cliente_puede_toggle: true,
    activa_por_defecto: true,
  })

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const res = await getSkillsGlobales()
    if (res.success && res.data) setSkills(res.data)
    setLoading(false)
  }

  const openCrear = () => {
    setModalMode('crear')
    setSelectedId(null)
    setFormData({ nombre: '', descripcion: '', cliente_puede_toggle: true, activa_por_defecto: true })
    setIsModalOpen(true)
  }

  const openEditar = (s: any) => {
    setModalMode('editar')
    setSelectedId(s.id)
    setFormData({
      nombre: s.nombre,
      descripcion: s.descripcion || '',
      cliente_puede_toggle: s.cliente_puede_toggle,
      activa_por_defecto: s.activa_por_defecto,
    })
    setIsModalOpen(true)
  }

  const handleGuardar = async () => {
    if (!formData.nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'El nombre es obligatorio' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setSaving(true)
    let res
    if (modalMode === 'crear') {
      res = await crearSkillGlobal({ ...formData, orden: skills.length })
    } else {
      res = await actualizarSkillGlobal(selectedId!, formData)
    }
    if (res.success) {
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: modalMode === 'crear' ? 'Skill creada ✓' : 'Skill actualizada ✓' })
      cargar()
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar' })
    }
    setTimeout(() => setMensaje(null), 3000)
    setSaving(false)
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta skill? Afectará a todos los clientes.')) return
    const res = await eliminarSkillGlobal(id)
    if (res.success) {
      setSkills(prev => prev.filter(s => s.id !== id))
      setMensaje({ tipo: 'exito', texto: 'Skill eliminada ✓' })
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al eliminar' })
    }
    setTimeout(() => setMensaje(null), 3000)
  }

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
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Skills de IA</h1>
          <p className="text-ink-500 mt-1">Skills globales disponibles para todos los clientes.</p>
        </div>
        <button onClick={openCrear} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition shadow-lg shadow-brand-600/30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nueva skill
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-ink-500">Cargando skills...</div>
        ) : skills.length === 0 ? (
          <div className="p-8 text-center text-ink-500">No hay skills creadas.</div>
        ) : (
          skills.map(s => (
            <div key={s.id} className="flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-600 text-ink-900">{s.nombre}</p>
                <p className="text-xs text-ink-500 mt-0.5">{s.descripcion}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {!s.cliente_puede_toggle && (
                    <span className="text-[10px] font-600 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">El cliente no puede cambiarla</span>
                  )}
                  <span className={`text-[10px] font-600 px-1.5 py-0.5 rounded ${s.activa_por_defecto ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {s.activa_por_defecto ? 'Activa por defecto' : 'Desactivada por defecto'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEditar(s)} className="p-1.5 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button onClick={() => handleEliminar(s.id)} className="p-1.5 rounded-lg text-ink-400 hover:text-red-500 hover:bg-red-50 transition">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl pointer-events-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">{modalMode === 'crear' ? 'Nueva skill' : 'Editar skill'}</h2>
                <button onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre</label>
                  <input type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Descripción <span className="text-ink-400 font-400">· opcional</span></label>
                  <textarea rows={2} value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                  <div>
                    <p className="text-sm font-500 text-ink-900">El cliente puede activar/desactivar</p>
                    <p className="text-xs text-ink-500 mt-0.5">Si está desactivado, la skill siempre tendrá el estado por defecto</p>
                  </div>
                  <input type="checkbox" checked={formData.cliente_puede_toggle}
                    onChange={e => setFormData({...formData, cliente_puede_toggle: e.target.checked})}
                    className="w-5 h-5 rounded text-brand-600 focus:ring-brand-400 ml-3 shrink-0" />
                </label>
                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                  <div>
                    <p className="text-sm font-500 text-ink-900">Activa por defecto</p>
                    <p className="text-xs text-ink-500 mt-0.5">Estado inicial para nuevos clientes</p>
                  </div>
                  <input type="checkbox" checked={formData.activa_por_defecto}
                    onChange={e => setFormData({...formData, activa_por_defecto: e.target.checked})}
                    className="w-5 h-5 rounded text-brand-600 focus:ring-brand-400 ml-3 shrink-0" />
                </label>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
                <button onClick={() => setIsModalOpen(false)} disabled={saving}
                  className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleGuardar} disabled={saving}
                  className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50">
                  {saving ? 'Guardando...' : modalMode === 'crear' ? 'Crear skill' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
