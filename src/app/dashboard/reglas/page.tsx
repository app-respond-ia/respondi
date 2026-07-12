'use client'

import { useState, useEffect } from 'react'
import {
  getReglas,
  crearRegla,
  actualizarRegla,
  eliminarRegla,
  crearReglasPlantilla,
  ReglaData
} from '@/app/actions/reglas'
import { getMisPermisos } from '@/app/actions/permisos'

export default function ReglasPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'añadir' | 'editar'>('añadir')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  const [formData, setFormData] = useState<ReglaData>({
    nombre: '',
    descripcion_intencion: '',
    tipo_caso: '',
    activa: true
  })

  const cargar = async () => {
    setLoading(true)
    const res = await getReglas()
    if (res.success && res.data) {
      setItems(res.data)
    }

    const permisosRes = await getMisPermisos()
    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        setNivelPermiso('escritura')
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'reglas')
        setNivelPermiso(p?.nivel || 'ninguno')
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const openAñadir = () => {
    setModalMode('añadir')
    setEditingId(null)
    setFormData({
      nombre: '',
      descripcion_intencion: '',
      tipo_caso: '',
      activa: true
    })
    setIsModalOpen(true)
  }

  const openEditar = (item: any) => {
    setModalMode('editar')
    setEditingId(item.id)
    setFormData({
      nombre: item.nombre,
      descripcion_intencion: item.descripcion_intencion || '',
      tipo_caso: item.tipo_caso || '',
      activa: item.activa
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta regla?')) return
    
    const res = await eliminarRegla(id)
    if (res.success) {
      setItems(prev => prev.filter(it => it.id !== id))
      setMensaje({ tipo: 'exito', texto: 'Regla eliminada correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al eliminar la regla' })
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const handleToggleActiva = async (item: any) => {
    const newActiva = !item.activa
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, activa: newActiva } : it))
    
    const res = await actualizarRegla(item.id, { activa: newActiva })
    if (!res.success) {
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, activa: item.activa } : it))
      setMensaje({ tipo: 'error', texto: res.error || 'Error al actualizar el estado' })
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    const dataToSave = { ...formData }

    let res
    if (modalMode === 'añadir') {
      res = await crearRegla(dataToSave)
    } else {
      res = await actualizarRegla(editingId!, dataToSave)
    }

    if (res.success && res.data) {
      if (modalMode === 'añadir') {
        setItems(prev => [...prev, res.data])
      } else {
        setItems(prev => prev.map(it => it.id === editingId ? { ...it, ...res.data } : it))
      }
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: modalMode === 'añadir' ? 'Regla añadida correctamente ✓' : 'Regla actualizada correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar la regla' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setSaving(false)
  }

  const handleCargarPlantillas = async () => {
    setSaving(true)
    const res = await crearReglasPlantilla()
    if (res.success && res.data) {
      setItems(res.data)
      setMensaje({ tipo: 'exito', texto: 'Reglas sugeridas cargadas correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al cargar sugerencias' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setSaving(false)
  }

  if (loading || nivelPermiso === null) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando reglas...</div>
  }

  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-10 text-center">
        <p className="text-ink-500 font-500">No tienes acceso a esta sección.</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto pb-20">
      
      {mensaje && (
        <div className={`mb-6 text-sm font-semibold px-4 py-3 rounded-xl ${mensaje.tipo === 'exito' ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* Encabezado + acciones */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Escalado de casos</h1>
          <p className="text-ink-500 mt-1 max-w-xl">Define cuándo la IA debe escalar una conversación a un agente humano abriendo un caso.</p>
        </div>
        <button onClick={openAñadir} disabled={nivelPermiso !== 'escritura'} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nueva regla de escalado
        </button>
      </div>

      {items.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col divide-y divide-slate-100 relative">
          {items.map((item) => (
            <div key={item.id} className="p-4 sm:p-5 flex items-start gap-4 hover:bg-slate-50 transition-colors bg-white">
              {/* Icono fijo */}
              <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>

              {/* Info principal */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-600 text-ink-900 text-sm sm:text-base">{item.nombre}</span>
                  {item.es_plantilla && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-500 bg-slate-100 text-slate-500">
                      Plantilla
                    </span>
                  )}
                </div>
                {item.descripcion_intencion && (
                  <p className="text-sm text-ink-500 line-clamp-2 pr-4 mb-2">{item.descripcion_intencion}</p>
                )}
                {item.tipo_caso && (
                  <div className="flex items-center gap-1.5 text-xs text-ink-400">
                    <span>Crea un caso:</span>
                    <span className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded-md font-500">
                      {item.tipo_caso}
                    </span>
                  </div>
                )}
              </div>

              {/* Controles de la derecha */}
              <div className="flex flex-col items-end gap-3 shrink-0 ml-1">
                {/* Toggle */}
                <button 
                  onClick={() => handleToggleActiva(item)} 
                  disabled={nivelPermiso !== 'escritura'}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${item.activa ? 'bg-emerald-500' : 'bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
                  role="switch" 
                  aria-checked={item.activa}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${item.activa ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                
                {/* Botones editar / eliminar */}
                <div className="flex items-center gap-1">
                  <button onClick={() => openEditar(item)} disabled={nivelPermiso !== 'escritura'} className="p-1.5 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Editar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button onClick={() => handleDelete(item.id)} disabled={nivelPermiso !== 'escritura'} className="p-1.5 rounded-lg text-ink-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Eliminar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Estado Vacío */
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-5 text-slate-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="font-semibold text-ink-900 text-lg mb-2">Aún no tienes escalados configurados.</p>
          <p className="text-ink-500 text-sm mb-6 max-w-sm mx-auto">Comienza cargando los escalados sugeridos para derivaciones y reclamos comunes, o crea uno nuevo.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button 
              onClick={handleCargarPlantillas} 
              disabled={saving || nivelPermiso !== 'escritura'}
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Cargando...' : 'Cargar escalados sugeridos'}
            </button>
            <button 
              onClick={openAñadir} 
              disabled={nivelPermiso !== 'escritura'}
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-ink-700 text-sm font-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Nueva regla de escalado
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
           POPUP · Añadir / Editar regla
           ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
        
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]">
              
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 h-full">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                  <h2 className="font-display font-700 text-lg text-ink-900">{modalMode === 'editar' ? 'Editar regla de escalado' : 'Nueva regla de escalado'}</h2>
                  <button type="button" onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
        
                <div className="flex-1 min-h-0 px-6 py-5 space-y-5 overflow-y-auto">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre de la regla</label>
                    <input type="text" required placeholder="Ej. Cliente molesto"
                      value={formData.nombre}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" 
                    />
                  </div>
        
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">¿Cuándo debe dispararse esta regla?</label>
                    <textarea rows={3} placeholder="Ej. El cliente se queja de un pedido retrasado..." required
                      value={formData.descripcion_intencion}
                      onChange={e => setFormData({...formData, descripcion_intencion: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
                    <p className="text-xs text-ink-400 mt-1.5">
                      La IA entiende intenciones, no necesitas escribir palabras exactas.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Tipo de escalado</label>
                    <input type="text" required placeholder="Ej. atencion_urgente"
                      value={formData.tipo_caso}
                      onChange={e => setFormData({...formData, tipo_caso: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" 
                    />
                    <p className="text-xs text-ink-400 mt-1.5">
                      Esta etiqueta identificará el motivo del escalado en la bandeja de casos.
                    </p>
                  </div>
        
                  <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <span className="text-sm font-500 text-ink-700">Escalado activo</span>
                    <input type="checkbox" 
                      checked={formData.activa} 
                      onChange={e => setFormData({...formData, activa: e.target.checked})}
                      className="w-5 h-5 rounded text-brand-600 focus:ring-brand-400" 
                    />
                  </label>
                </div>
        
                <div className="flex justify-end gap-3 px-6 pt-5 pb-6 border-t border-slate-100 shrink-0">
                  <button type="button" disabled={saving} onClick={() => setIsModalOpen(false)} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition flex items-center gap-2 disabled:bg-brand-400">
                    {saving ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Guardando...
                      </>
                    ) : 'Guardar regla'}
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
