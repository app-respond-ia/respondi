'use client'

import { useState, useEffect } from 'react'
import {
  getNovedades,
  crearNovedad,
  actualizarNovedad,
  NovedadData
} from '@/app/actions/novedades'

const TIPO_CONFIG = {
  horario: {
    label: 'HORARIO',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-600',
    badge: 'bg-blue-100 text-blue-700',
    selected: 'border-blue-500 bg-blue-50/40 ring-4 ring-blue-50',
    selectedIconText: 'text-blue-600',
    selectedLabelText: 'text-blue-700',
  },
  stock: {
    label: 'STOCK',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    selected: 'border-amber-500 bg-amber-50/40 ring-4 ring-amber-50',
    selectedIconText: 'text-amber-600',
    selectedLabelText: 'text-amber-700',
  },
  promo: {
    label: 'PROMOCIÓN',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
    iconBg: 'bg-purple-100',
    iconText: 'text-purple-600',
    badge: 'bg-purple-100 text-purple-700',
    selected: 'border-purple-500 bg-purple-50/40 ring-4 ring-purple-50',
    selectedIconText: 'text-purple-600',
    selectedLabelText: 'text-purple-700',
  },
  evento: {
    label: 'EVENTO',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    iconBg: 'bg-pink-100',
    iconText: 'text-pink-600',
    badge: 'bg-pink-100 text-pink-700',
    selected: 'border-pink-500 bg-pink-50/40 ring-4 ring-pink-50',
    selectedIconText: 'text-pink-600',
    selectedLabelText: 'text-pink-700',
  },
  otro: {
    label: 'OTRO',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
      </svg>
    ),
    iconBg: 'bg-slate-100',
    iconText: 'text-slate-600',
    badge: 'bg-slate-100 text-slate-700',
    selected: 'border-slate-500 bg-slate-50/40 ring-4 ring-slate-50',
    selectedIconText: 'text-slate-600',
    selectedLabelText: 'text-slate-700',
  }
} as const

type TipoNovedad = keyof typeof TIPO_CONFIG

function formatDate(isoStr: string | null) {
  if (!isoStr) return 'sin fecha límite'
  const d = new Date(isoStr)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${min}`
}

function toDatetimeLocal(isoStr: string | null) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function fromDatetimeLocal(dtLocal: string) {
  if (!dtLocal) return null
  return new Date(dtLocal).toISOString()
}

export default function NovedadesManager() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [filtro, setFiltro] = useState<'vigentes' | 'expiradas' | 'todas'>('vigentes')
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'añadir' | 'editar'>('añadir')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  const [formData, setFormData] = useState<{
    tipo: TipoNovedad
    descripcion: string
    fecha_vigencia_inicio: string
    fecha_vigencia_fin: string
  }>({
    tipo: 'stock',
    descripcion: '',
    fecha_vigencia_inicio: '',
    fecha_vigencia_fin: ''
  })

  const cargar = async () => {
    setLoading(true)
    const res = await getNovedades()
    if (res.success && res.data) {
      setItems(res.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const openAñadir = () => {
    setModalMode('añadir')
    setEditingId(null)
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    
    setFormData({
      tipo: 'stock',
      descripcion: '',
      fecha_vigencia_inicio: now.toISOString().slice(0, 16),
      fecha_vigencia_fin: ''
    })
    setIsModalOpen(true)
  }

  const openEditar = (item: any) => {
    setModalMode('editar')
    setEditingId(item.id)
    setFormData({
      tipo: item.tipo as TipoNovedad,
      descripcion: item.descripcion || '',
      fecha_vigencia_inicio: toDatetimeLocal(item.fecha_vigencia_inicio),
      fecha_vigencia_fin: toDatetimeLocal(item.fecha_vigencia_fin)
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    const dataToSave = { 
      tipo: formData.tipo,
      descripcion: formData.descripcion,
      fecha_vigencia_inicio: fromDatetimeLocal(formData.fecha_vigencia_inicio)!,
      fecha_vigencia_fin: fromDatetimeLocal(formData.fecha_vigencia_fin)
    }

    let res
    if (modalMode === 'añadir') {
      res = await crearNovedad(dataToSave as NovedadData)
    } else {
      res = await actualizarNovedad(editingId!, dataToSave)
    }

    if (res.success && res.data) {
      if (modalMode === 'añadir') {
        setItems(prev => [res.data, ...prev])
      } else {
        setItems(prev => prev.map(it => it.id === editingId ? { ...it, ...res.data } : it))
      }
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: modalMode === 'añadir' ? 'Novedad añadida correctamente ✓' : 'Novedad actualizada correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar la novedad' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando novedades...</div>
  }

  const filteredItems = items.filter(item => {
    if (filtro === 'vigentes') return item.activo === true
    if (filtro === 'expiradas') return item.activo === false
    return true
  })

  const countVigentes = items.filter(i => i.activo).length
  const countExpiradas = items.filter(i => !i.activo).length
  const countTodas = items.length

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
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Novedades del día</h1>
          <p className="text-ink-500 mt-1 max-w-xl">Cambios puntuales que tu IA debe saber para responder mejor.</p>
        </div>
        <button onClick={openAñadir} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nueva novedad
        </button>
      </div>

      {items.length > 0 ? (
        <>
          {/* Pestañas de filtrado */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-6 w-fit">
            <button
              onClick={() => setFiltro('vigentes')}
              className={`px-4 py-2 text-sm font-600 rounded-lg transition-all ${filtro === 'vigentes' ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500 hover:text-ink-700 hover:bg-slate-200/50'}`}
            >
              Vigentes ({countVigentes})
            </button>
            <button
              onClick={() => setFiltro('expiradas')}
              className={`px-4 py-2 text-sm font-600 rounded-lg transition-all ${filtro === 'expiradas' ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500 hover:text-ink-700 hover:bg-slate-200/50'}`}
            >
              Expiradas ({countExpiradas})
            </button>
            <button
              onClick={() => setFiltro('todas')}
              className={`px-4 py-2 text-sm font-600 rounded-lg transition-all ${filtro === 'todas' ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500 hover:text-ink-700 hover:bg-slate-200/50'}`}
            >
              Todas ({countTodas})
            </button>
          </div>

          {/* Lista */}
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500">
              No hay novedades en esta vista.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col divide-y divide-slate-100 relative">
              {filteredItems.map((item) => {
                const conf = TIPO_CONFIG[item.tipo as TipoNovedad] || TIPO_CONFIG.otro
                return (
                  <div key={item.id} className="p-4 sm:p-5 flex items-start gap-4 hover:bg-slate-50 transition-colors bg-white">
                    {/* Icono fijo */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${conf.iconBg} ${conf.iconText}`}>
                      {conf.icon}
                    </div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-700 ${conf.badge}`}>
                          {conf.label}
                        </span>
                        
                        {/* Estado */}
                        <div className="flex items-center gap-1.5 text-xs font-500">
                          <span className={`w-2 h-2 rounded-full ${item.activo ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                          <span className={item.activo ? 'text-emerald-700' : 'text-slate-500'}>
                            {item.activo ? 'Vigente' : 'Expirada'}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-sm text-ink-700 mb-3 whitespace-pre-wrap">{item.descripcion}</p>
                      
                      {/* Pie */}
                      <p className="text-xs text-ink-400">
                        Hasta {formatDate(item.fecha_vigencia_fin)} · cargado por {item.users?.nombre || item.users?.email} el {formatDate(item.created_at)}
                      </p>
                    </div>

                    {/* Controles */}
                    <div className="flex items-center shrink-0 ml-2">
                      <button onClick={() => openEditar(item)} className="p-2 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition" aria-label="Editar">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        /* Estado Vacío global */
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-5 text-slate-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p className="font-semibold text-ink-900 text-lg mb-2">No tienes ninguna novedad cargada.</p>
          <p className="text-ink-500 text-sm mb-6 max-w-sm mx-auto">Añade cambios temporales en horarios, ofertas de stock o eventos para que la IA los comunique a tus clientes.</p>
          <div className="flex items-center justify-center">
            <button 
              onClick={openAñadir} 
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition"
            >
              Nueva novedad
            </button>
          </div>
        </div>
      )}

      {/* Info box inferior */}
      {items.length > 0 && (
        <div className="mt-8 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 flex items-start gap-3">
          <svg className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>La IA solo usa las novedades vigentes para responder. Las novedades caducadas se archivan automáticamente cada 15 minutos.</p>
        </div>
      )}

      {/* =========================================================
           POPUP · Añadir / Editar novedad
           ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
        
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]">
              
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 h-full">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                  <h2 className="font-display font-700 text-lg text-ink-900">{modalMode === 'editar' ? 'Editar novedad' : 'Nueva novedad'}</h2>
                  <button type="button" onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
        
                <div className="flex-1 min-h-0 px-6 py-5 space-y-6 overflow-y-auto">
                  {/* Selector de Tipo */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-2">Tipo de novedad</label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                      {(Object.entries(TIPO_CONFIG) as [TipoNovedad, typeof TIPO_CONFIG[TipoNovedad]][]).map(([key, conf]) => {
                        const isSelected = formData.tipo === key
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setFormData({...formData, tipo: key})}
                            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${isSelected ? conf.selected : 'border-slate-200 bg-white hover:border-slate-300'}`}
                          >
                            <div className={`${isSelected ? conf.selectedIconText : 'text-slate-400'}`}>
                              {conf.icon}
                            </div>
                            <span className={`text-[10px] font-700 ${isSelected ? conf.selectedLabelText : 'text-slate-500'}`}>
                              {conf.label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Descripción */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Descripción</label>
                    <textarea rows={4} placeholder="Ej. Hoy cerramos a las 18:00 por festivo local..." required
                      value={formData.descripcion}
                      onChange={e => setFormData({...formData, descripcion: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
                    <p className="text-xs text-ink-400 mt-1.5">
                      Esto es lo que la IA tendrá en cuenta al responder.
                    </p>
                  </div>

                  {/* Vigencia */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-2">Vigencia</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-500 text-slate-500 mb-1">Desde</label>
                        <input type="datetime-local" required
                          value={formData.fecha_vigencia_inicio}
                          onChange={e => setFormData({...formData, fecha_vigencia_inicio: e.target.value})}
                          className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-500 text-slate-500 mb-1">Hasta (opcional)</label>
                        <input type="datetime-local"
                          value={formData.fecha_vigencia_fin}
                          onChange={e => setFormData({...formData, fecha_vigencia_fin: e.target.value})}
                          className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" 
                        />
                      </div>
                    </div>
                    <p className="text-xs text-ink-400 mt-2">
                      Pasada la fecha de "Hasta", la novedad se archiva y deja de afectar a la IA.
                    </p>
                  </div>
        
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
                    ) : 'Guardar novedad'}
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
