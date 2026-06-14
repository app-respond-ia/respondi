'use client'

import { useState, useEffect } from 'react'
import {
  getEtiquetas,
  crearEtiqueta,
  actualizarEtiqueta,
  eliminarEtiqueta,
  reordenarEtiquetas,
  crearEtiquetasPlantilla,
  EtiquetaData
} from '@/app/actions/etiquetas'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const COLORS = [
  { id: 'amber', bg: 'bg-amber-100', text: 'text-amber-700', square: 'bg-amber-500', ring: 'ring-amber-500' },
  { id: 'purple', bg: 'bg-purple-100', text: 'text-purple-700', square: 'bg-purple-500', ring: 'ring-purple-500' },
  { id: 'blue', bg: 'bg-blue-100', text: 'text-blue-700', square: 'bg-blue-500', ring: 'ring-blue-500' },
  { id: 'emerald', bg: 'bg-emerald-100', text: 'text-emerald-700', square: 'bg-emerald-500', ring: 'ring-emerald-500' },
  { id: 'pink', bg: 'bg-pink-100', text: 'text-pink-700', square: 'bg-pink-500', ring: 'ring-pink-500' },
  { id: 'red', bg: 'bg-red-100', text: 'text-red-700', square: 'bg-red-500', ring: 'ring-red-500' },
  { id: 'orange', bg: 'bg-orange-100', text: 'text-orange-700', square: 'bg-orange-500', ring: 'ring-orange-500' },
  { id: 'indigo', bg: 'bg-indigo-100', text: 'text-indigo-700', square: 'bg-indigo-500', ring: 'ring-indigo-500' },
  { id: 'slate', bg: 'bg-slate-100', text: 'text-slate-700', square: 'bg-slate-500', ring: 'ring-slate-500' },
  { id: 'slate-d', bg: 'bg-slate-200', text: 'text-slate-800', square: 'bg-slate-700', ring: 'ring-slate-700' }
]

function getPillClasses(colorId: string) {
  const c = COLORS.find(c => c.id === colorId) || COLORS[8] // default slate
  return `${c.bg} ${c.text}`
}

function EtiquetaPill({ nombre, colorId }: { nombre: string, colorId: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-600 ${getPillClasses(colorId)}`}>
      {nombre}
    </span>
  )
}

function EtiquetaRow({ item, onToggle, onEdit, onDelete, dragHandleProps, disableDrag }: {
  item: any,
  onToggle: (item: any) => void,
  onEdit: (item: any) => void,
  onDelete: (id: string) => void,
  dragHandleProps?: any,
  disableDrag?: boolean
}) {
  return (
    <div className="p-4 sm:p-5 flex items-center gap-4 bg-white">
      {/* Drag handle */}
      <button 
        {...(disableDrag ? {} : dragHandleProps)}
        disabled={disableDrag}
        className={`p-1 -ml-2 text-slate-300 ${disableDrag ? 'opacity-30 cursor-not-allowed' : 'hover:text-slate-500 touch-none ' + (dragHandleProps?.className || 'cursor-grab active:cursor-grabbing')}`}
        aria-label="Reordenar"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </button>

      {/* Info principal */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <EtiquetaPill nombre={item.nombre} colorId={item.color} />
          {item.es_plantilla && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-500 bg-slate-100 text-slate-500">
              Plantilla
            </span>
          )}
          <span className="text-xs text-ink-400">
            {item.aplicadas_este_mes} este mes
          </span>
        </div>
        {item.descripcion_intencion && (
          <p className="text-xs text-ink-500 line-clamp-2 pr-4">{item.descripcion_intencion}</p>
        )}
      </div>

      {/* Toggle */}
      <button 
        onClick={() => onToggle(item)} 
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${item.activa ? 'bg-emerald-500' : 'bg-slate-200'}`}
        role="switch" 
        aria-checked={item.activa}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${item.activa ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>

      {/* Controles */}
      <div className="flex items-center gap-1 shrink-0 border-l border-slate-100 pl-2 ml-1">
        <button onClick={() => onEdit(item)} className="p-1.5 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition" aria-label="Editar">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        </button>
        <button onClick={() => onDelete(item.id)} className="p-1.5 rounded-lg text-ink-400 hover:text-red-500 hover:bg-red-50 transition" aria-label="Eliminar">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </div>
  )
}

function SortableItem({ item, onToggle, onEdit, onDelete, disableDrag }: { 
  item: any, 
  onToggle: (item: any) => void,
  onEdit: (item: any) => void,
  onDelete: (id: string) => void,
  disableDrag?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: disableDrag })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    willChange: 'transform',
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as const,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="hover:bg-slate-50 transition-colors">
      <EtiquetaRow 
        item={item} 
        onToggle={onToggle} 
        onEdit={onEdit} 
        onDelete={onDelete} 
        disableDrag={disableDrag}
        dragHandleProps={{ ...attributes, ...listeners }} 
      />
    </div>
  )
}

export default function EtiquetasPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [filtro, setFiltro] = useState<'todas' | 'activas' | 'inactivas'>('todas')
  const [activeId, setActiveId] = useState<string | null>(null)
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'añadir' | 'editar'>('añadir')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  const [formData, setFormData] = useState<EtiquetaData>({
    nombre: '',
    descripcion_intencion: '',
    color: 'slate',
    activa: true
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  const cargar = async () => {
    setLoading(true)
    const res = await getEtiquetas()
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
    setFormData({
      nombre: '',
      descripcion_intencion: '',
      color: 'slate',
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
      color: item.color || 'slate',
      activa: item.activa
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta etiqueta?')) return
    
    const res = await eliminarEtiqueta(id)
    if (res.success) {
      setItems(prev => prev.filter(it => it.id !== id))
      setMensaje({ tipo: 'exito', texto: 'Etiqueta eliminada correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al eliminar la etiqueta' })
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const handleToggleActiva = async (item: any) => {
    const newActiva = !item.activa
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, activa: newActiva } : it))
    
    const res = await actualizarEtiqueta(item.id, { activa: newActiva })
    if (!res.success) {
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, activa: item.activa } : it))
      setMensaje({ tipo: 'error', texto: res.error || 'Error al actualizar el estado' })
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex(it => it.id === active.id)
    const newIndex = items.findIndex(it => it.id === over.id)

    const newItems = arrayMove(items, oldIndex, newIndex)
    const orderedItems = newItems.map((item, index) => ({ ...item, orden: index }))
    setItems(orderedItems)

    const ids = orderedItems.map(it => it.id)
    const res = await reordenarEtiquetas(ids)
    if (!res.success) {
      setItems(items) // Revert
      setMensaje({ tipo: 'error', texto: res.error || 'Error al reordenar las etiquetas' })
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    const dataToSave = { ...formData }

    let res
    if (modalMode === 'añadir') {
      res = await crearEtiqueta(dataToSave)
    } else {
      res = await actualizarEtiqueta(editingId!, dataToSave)
    }

    if (res.success && res.data) {
      if (modalMode === 'añadir') {
        setItems(prev => [...prev, res.data])
      } else {
        setItems(prev => prev.map(it => it.id === editingId ? { ...it, ...res.data } : it))
      }
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: modalMode === 'añadir' ? 'Etiqueta añadida correctamente ✓' : 'Etiqueta actualizada correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar la etiqueta' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setSaving(false)
  }

  const handleCargarPlantillas = async () => {
    setSaving(true)
    const res = await crearEtiquetasPlantilla()
    if (res.success && res.data) {
      setItems(res.data)
      setMensaje({ tipo: 'exito', texto: 'Etiquetas sugeridas cargadas correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al cargar sugerencias' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando etiquetas...</div>
  }

  const filteredItems = items.filter(item => {
    if (filtro === 'activas') return item.activa
    if (filtro === 'inactivas') return !item.activa
    return true
  })

  // Estadísticas
  const totalTags = items.length
  const totalActivas = items.filter(i => i.activa).length
  const totalAplicadas = items.reduce((acc, curr) => acc + (curr.aplicadas_este_mes || 0), 0)

  // Deshabilitar Drag & Drop si no estamos en la vista de "Todas"
  const disableDrag = filtro !== 'todas'

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
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Etiquetas</h1>
          <p className="text-ink-500 mt-1">Categorías que tu IA usa para clasificar las conversaciones.</p>
        </div>
        <button onClick={openAñadir} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nueva etiqueta
        </button>
      </div>

      {totalTags > 0 ? (
        <>
          {/* Tarjetas de estadísticas */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm font-500 text-ink-500 mb-1">Total</p>
              <p className="text-2xl font-bold text-ink-900">{totalTags}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm font-500 text-ink-500 mb-1">Activas</p>
              <p className="text-2xl font-bold text-ink-900">{totalActivas}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm font-500 text-ink-500 mb-1">Aplicadas este mes</p>
              <p className="text-2xl font-bold text-ink-900">{totalAplicadas}</p>
            </div>
          </div>

          {/* Pestañas de filtrado */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-6 w-fit">
            {(['todas', 'activas', 'inactivas'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-4 py-2 text-sm font-600 rounded-lg transition-all ${filtro === f ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500 hover:text-ink-700 hover:bg-slate-200/50'}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Lista */}
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500">
              No hay etiquetas en esta vista.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col divide-y divide-slate-100 relative">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={(e) => setActiveId(e.active.id as string)}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveId(null)}
              >
                <SortableContext 
                  items={filteredItems.map(it => it.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredItems.map((item) => (
                    <SortableItem 
                      key={item.id} 
                      item={item} 
                      onToggle={handleToggleActiva}
                      onEdit={openEditar}
                      onDelete={handleDelete}
                      disableDrag={disableDrag}
                    />
                  ))}
                </SortableContext>

                <DragOverlay>
                  {activeId ? (
                    <div className="shadow-2xl ring-1 ring-brand-500/20 bg-white opacity-100 scale-[1.02] cursor-grabbing rounded-xl overflow-hidden">
                      <EtiquetaRow 
                        item={items.find(i => i.id === activeId)}
                        onToggle={() => {}}
                        onEdit={() => {}}
                        onDelete={() => {}}
                        dragHandleProps={{ className: "cursor-grabbing touch-none text-slate-500" }}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          )}
        </>
      ) : (
        /* Estado Vacío */
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-5 text-slate-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
          </div>
          <p className="font-semibold text-ink-900 text-lg mb-2">Aún no tienes etiquetas configuradas.</p>
          <p className="text-ink-500 text-sm mb-6 max-w-sm mx-auto">Comienza cargando nuestras etiquetas sugeridas para casos de uso comunes, o crea una nueva desde cero.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button 
              onClick={handleCargarPlantillas} 
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-600 transition disabled:opacity-50"
            >
              {saving ? 'Cargando...' : 'Cargar etiquetas sugeridas'}
            </button>
            <button 
              onClick={openAñadir} 
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-ink-700 text-sm font-600 transition"
            >
              Nueva etiqueta
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
           POPUP · Añadir / Editar etiqueta
           ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
        
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]">
              
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 h-full">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                  <h2 className="font-display font-700 text-lg text-ink-900">{modalMode === 'editar' ? 'Editar etiqueta' : 'Nueva etiqueta'}</h2>
                  <button type="button" onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
        
                <div className="flex-1 min-h-0 px-6 py-5 space-y-5 overflow-y-auto">
                  {/* Preview */}
                  <div className="flex justify-center mb-6">
                    <EtiquetaPill nombre={formData.nombre || 'Nombre de etiqueta'} colorId={formData.color} />
                  </div>

                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre</label>
                    <input type="text" required placeholder="Ej. Devolución"
                      value={formData.nombre}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" 
                    />
                  </div>
        
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">¿Cuándo aplicar esta etiqueta?</label>
                    <textarea rows={3} placeholder="Describe el criterio para clasificar la conversación aquí..."
                      value={formData.descripcion_intencion}
                      onChange={e => setFormData({...formData, descripcion_intencion: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
                    <p className="text-xs text-ink-400 mt-1.5">
                      La IA usará esta descripción para detectar el tema y aplicar la etiqueta.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-3">Color</label>
                    <div className="flex flex-wrap gap-3">
                      {COLORS.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setFormData({...formData, color: c.id})}
                          className={`w-8 h-8 rounded-full ${c.square} ${formData.color === c.id ? `ring-2 ring-offset-2 ${c.ring}` : 'ring-0 ring-transparent'} transition-all`}
                          aria-label={`Color ${c.id}`}
                        />
                      ))}
                    </div>
                  </div>
        
                  <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <span className="text-sm font-500 text-ink-700">Etiqueta activa</span>
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
                    ) : 'Guardar etiqueta'}
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
