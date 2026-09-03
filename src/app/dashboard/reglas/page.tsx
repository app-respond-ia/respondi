'use client'
import Loading from '@/components/Loading'

import { useState, useEffect } from 'react'
import {
  getReglas,
  crearRegla,
  actualizarRegla,
  eliminarRegla,
  crearReglasPlantilla,
  reordenarReglas,
  ReglaData
} from '@/app/actions/reglas'
import { getMisPermisos } from '@/app/actions/permisos'
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
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

function ReglaRow({ item, onToggle, onEdit, onDelete, dragHandleProps, disableDrag, soloLectura }: {
  item: any,
  onToggle: (item: any) => void,
  onEdit: (item: any) => void,
  onDelete: (id: string) => void,
  dragHandleProps?: any,
  disableDrag?: boolean,
  soloLectura?: boolean
}) {
  return (
    <div className="p-4 sm:p-5 flex items-start gap-4 hover:bg-slate-50 transition-colors bg-white">
      {/* Drag handle */}
      <button 
        {...(disableDrag ? {} : dragHandleProps)}
        disabled={disableDrag}
        className={`mt-2.5 p-1 -ml-2 text-slate-300 ${disableDrag ? 'opacity-30 cursor-not-allowed' : 'hover:text-slate-500 touch-none ' + (dragHandleProps?.className || 'cursor-grab active:cursor-grabbing')}`}
        aria-label="Reordenar"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </button>

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
          <div className="flex items-center gap-2 mt-1">
            {item.tipo_caso && (
              <div className="flex items-center gap-1.5 text-xs text-ink-400">
                <span>Crea un caso:</span>
                <span className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded-md font-500">
                  {item.tipo_caso}
                </span>
              </div>
            )}
            {item.prioridad_default && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${
                item.prioridad_default === 'alta' ? 'bg-red-50 text-red-700 border-red-200' :
                item.prioridad_default === 'baja' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                Prioridad: {item.prioridad_default}
              </span>
            )}
          </div>
        {item.created_at && (
          <p className="text-[11px] text-ink-300 mt-1.5">
            Creado el {new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} a las {new Date(item.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Controles de la derecha */}
      <div className="flex flex-col items-end gap-3 shrink-0 ml-1">
        {/* Toggle */}
        <button 
          onClick={() => onToggle(item)} 
          disabled={soloLectura}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${item.activa ? 'bg-emerald-500' : 'bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
          role="switch" 
          aria-checked={item.activa}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${item.activa ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
        
        {/* Botones editar / eliminar */}
        {item.es_protegida ? (
          <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-500 px-2 py-1 rounded border border-slate-200">Del sistema</span>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(item)} disabled={soloLectura} className="p-1.5 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Editar">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button onClick={() => onDelete(item.id)} disabled={soloLectura} className="p-1.5 rounded-lg text-ink-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Eliminar">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SortableItem({ item, onToggle, onEdit, onDelete, disableDrag, soloLectura }: { 
  item: any, 
  onToggle: (item: any) => void,
  onEdit: (item: any) => void,
  onDelete: (id: string) => void,
  disableDrag?: boolean,
  soloLectura?: boolean
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
    <div ref={setNodeRef} style={style}>
      <ReglaRow 
        item={item} 
        onToggle={onToggle} 
        onEdit={onEdit} 
        onDelete={onDelete} 
        disableDrag={disableDrag}
        dragHandleProps={{ ...attributes, ...listeners }} 
        soloLectura={soloLectura}
      />
    </div>
  )
}

export default function ReglasPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'añadir' | 'editar'>('añadir')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const [busqueda, setBusqueda] = useState('')
  
  const [reglaAEliminar, setReglaAEliminar] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todas' | 'activas' | 'inactivas'>('todas')
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  const [formData, setFormData] = useState<ReglaData>({
    nombre: '',
    descripcion_intencion: '',
    tipo_caso: '',
    activa: true,
    prioridad_default: 'normal'
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
      activa: true,
      prioridad_default: 'normal'
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
      activa: item.activa,
      prioridad_default: item.prioridad_default || 'normal'
    })
    setIsModalOpen(true)
  }

  const handleDelete = (id: string) => {
    setReglaAEliminar(id)
  }

  const handleConfirmDelete = async () => {
    if (!reglaAEliminar) return
    
    const res = await eliminarRegla(reglaAEliminar)
    if (res.success) {
      setItems(prev => prev.filter(it => it.id !== reglaAEliminar))
      showToast('Regla eliminada correctamente ✓', 'success')
    } else {
      showToast(res.error || 'Error al eliminar la regla', 'error')
    }
    setReglaAEliminar(null)
  }

  const handleToggleActiva = async (item: any) => {
    const newActiva = !item.activa
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, activa: newActiva } : it))
    
    const res = await actualizarRegla(item.id, { activa: newActiva })
    if (!res.success) {
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, activa: item.activa } : it))
      showToast(res.error || 'Error al actualizar el estado', 'error')
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
    const res = await reordenarReglas(ids)
    if (!res.success) {
      setItems(items) // Revert
      showToast(res.error || 'Error al reordenar las reglas', 'error')
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
        setItems(prev => [...prev, res.data].sort((a, b) => a.orden - b.orden))
      } else {
        setItems(prev => prev.map(it => it.id === editingId ? { ...it, ...res.data } : it).sort((a, b) => a.orden - b.orden))
      }
      setIsModalOpen(false)
      showToast(modalMode === 'añadir' ? 'Regla añadida correctamente ✓' : 'Regla actualizada correctamente ✓', 'success')
    } else {
      showToast(res.error || 'Error al guardar la regla', 'error')
    }
    setSaving(false)
  }

  const handleCargarPlantillas = async () => {
    setSaving(true)
    const res = await crearReglasPlantilla()
    if (res.success && res.data) {
      setItems(res.data)
      showToast('Reglas sugeridas cargadas correctamente ✓', 'success')
    } else {
      showToast(res.error || 'Error al cargar sugerencias', 'error')
    }
    setSaving(false)
  }

  const itemsFiltrados = items.filter(item => {
    const matchFiltro =
      filtro === 'activas' ? item.activa :
      filtro === 'inactivas' ? !item.activa :
      true
    if (!matchFiltro) return false
    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    return (
      item.nombre?.toLowerCase().includes(q) ||
      item.descripcion_intencion?.toLowerCase().includes(q) ||
      item.tipo_caso?.toLowerCase().includes(q)
    )
  })

  if (loading || nivelPermiso === null) {
    return <Loading />
  }

  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-10 text-center">
        <p className="text-ink-500 font-500">No tienes acceso a esta sección.</p>
      </div>
    )
  }

  const disableDrag = filtro !== 'todas' || nivelPermiso !== 'escritura'

  return (
    <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto pb-20">

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

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm font-500 text-ink-500 mb-1">Total</p>
              <p className="text-2xl font-bold text-ink-900">{items.length}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm font-500 text-ink-500 mb-1">Activas</p>
              <p className="text-2xl font-bold text-ink-900">{items.filter(i => i.activa).length}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <p className="text-sm font-500 text-ink-500 mb-1">Inactivas</p>
              <p className="text-2xl font-bold text-ink-900">{items.filter(i => !i.activa).length}</p>
            </div>
          </div>

          <div className="relative mb-5">
            <svg className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input
              type="text"
              placeholder="Buscar por nombre, descripción o tipo..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-300 bg-white text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
            />
          </div>

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
        </>
      )}

      {itemsFiltrados.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col divide-y divide-slate-100 relative">
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setActiveId(e.active.id as string)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext 
              items={itemsFiltrados.map(it => it.id)}
              strategy={verticalListSortingStrategy}
            >
              {itemsFiltrados.map((item) => (
                <SortableItem 
                  key={item.id} 
                  item={item} 
                  onToggle={handleToggleActiva}
                  onEdit={openEditar}
                  onDelete={handleDelete}
                  disableDrag={disableDrag}
                  soloLectura={nivelPermiso !== 'escritura'}
                />
              ))}
            </SortableContext>

            <DragOverlay>
              {activeId ? (
                <div className="shadow-2xl ring-1 ring-brand-500/20 bg-white opacity-100 scale-[1.02] cursor-grabbing rounded-xl overflow-hidden">
                  <ReglaRow 
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
      ) : items.length > 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-ink-500 text-sm">No hay resultados para "{busqueda}".</p>
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
                    <input type="text" required placeholder="EJ. ATENCION_URGENTE"
                      value={formData.tipo_caso}
                      onChange={e => setFormData({...formData, tipo_caso: e.target.value.toUpperCase()})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition uppercase" 
                    />
                    <p className="text-xs text-ink-400 mt-1.5">
                      Se escribe en mayúsculas para diferenciarlo de las etiquetas normales. Manténlo breve y conciso, ej. "RECLAMO" o "PEDIDO_URGENTE".
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Prioridad por defecto</label>
                    <select
                      value={formData.prioridad_default}
                      onChange={e => setFormData({...formData, prioridad_default: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
                    >
                      <option value="baja">Baja</option>
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                    </select>
                    <p className="text-xs text-ink-400 mt-1.5">
                      Prioridad que tendrá el caso al ser creado por esta regla.
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

      <ConfirmModal
        isOpen={!!reglaAEliminar}
        title="Eliminar regla"
        message="¿Estás seguro de que quieres eliminar esta regla?"
        confirmText="Eliminar"
        cancelText="Cancelar"
        type="danger"
        onConfirm={handleConfirmDelete}
        onClose={() => setReglaAEliminar(null)}
      />
    </div>
  )
}
