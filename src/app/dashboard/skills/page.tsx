'use client'

import { useState, useEffect } from 'react'
import { getSkills, crearSkill, actualizarSkill, eliminarSkill, reordenarSkills, SkillData } from '@/app/actions/skills'
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

function SkillRow({ item, onToggle, onEdit, onDelete, dragHandleProps, soloLectura }: {
  item: any,
  onToggle: (item: any) => void,
  onEdit: (item: any) => void,
  onDelete: (id: string) => void,
  dragHandleProps: any,
  soloLectura?: boolean
}) {
  return (
    <div className="p-4 sm:p-5 flex items-center gap-4 bg-white">
      {/* Drag handle */}
      <button 
        {...dragHandleProps}
        className={`p-1 -ml-2 text-slate-300 hover:text-slate-500 touch-none ${dragHandleProps?.className || 'cursor-grab active:cursor-grabbing'}`}
        aria-label="Reordenar"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
        </svg>
      </button>

      {/* Toggle */}
      <button 
        onClick={() => onToggle(item)} 
        disabled={soloLectura}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${item.activo ? 'bg-emerald-500' : 'bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
        role="switch" 
        aria-checked={item.activo}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${item.activo ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-600 text-ink-900 truncate">{item.nombre}</h3>
        {item.descripcion && (
          <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">{item.descripcion}</p>
        )}
      </div>

      {/* Controles */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onEdit(item)} disabled={soloLectura} className="p-1.5 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Editar">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
        </button>
        <button onClick={() => onDelete(item.id)} disabled={soloLectura} className="p-1.5 rounded-lg text-ink-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Eliminar">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      </div>
    </div>
  )
}

// Componente individual para fila ordenable
function SortableItem({ item, onToggle, onEdit, onDelete, soloLectura }: { 
  item: any, 
  onToggle: (item: any) => void,
  onEdit: (item: any) => void,
  onDelete: (id: string) => void,
  soloLectura?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

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
      <SkillRow 
        item={item} 
        onToggle={onToggle} 
        onEdit={onEdit} 
        onDelete={onDelete} 
        dragHandleProps={{ ...attributes, ...listeners }} 
        soloLectura={soloLectura}
      />
    </div>
  )
}

export default function SkillsPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'añadir' | 'editar'>('añadir')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  const [formData, setFormData] = useState<SkillData>({
    nombre: '',
    descripcion: '',
    activo: true
  })

  // Sensores DndKit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 }
    })
  )

  const cargar = async () => {
    setLoading(true)
    const res = await getSkills()
    if (res.success && res.data) {
      setItems(res.data)
    }

    const permisosRes = await getMisPermisos()
    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        setNivelPermiso('escritura')
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'skills')
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
      descripcion: '',
      activo: true
    })
    setIsModalOpen(true)
  }

  const openEditar = (item: any) => {
    setModalMode('editar')
    setEditingId(item.id)
    setFormData({
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      activo: item.activo
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta skill?')) return
    
    const res = await eliminarSkill(id)
    if (res.success) {
      setItems(prev => prev.filter(it => it.id !== id))
      setMensaje({ tipo: 'exito', texto: 'Skill eliminada correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al eliminar la skill' })
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const handleToggleActivo = async (item: any) => {
    const newActivo = !item.activo
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, activo: newActivo } : it))
    
    const res = await actualizarSkill(item.id, { activo: newActivo })
    if (!res.success) {
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, activo: item.activo } : it))
      setMensaje({ tipo: 'error', texto: res.error || 'Error al actualizar el estado de la skill' })
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
    // Update local orden so that it stays consistent if used elsewhere
    const orderedItems = newItems.map((item, index) => ({ ...item, orden: index }))
    setItems(orderedItems)

    const ids = orderedItems.map(it => it.id)
    const res = await reordenarSkills(ids)
    if (!res.success) {
      setItems(items) // Revert
      setMensaje({ tipo: 'error', texto: res.error || 'Error al reordenar las skills' })
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    const dataToSave = { ...formData }

    let res
    if (modalMode === 'añadir') {
      res = await crearSkill(dataToSave)
    } else {
      res = await actualizarSkill(editingId!, dataToSave)
    }

    if (res.success && res.data) {
      if (modalMode === 'añadir') {
        setItems(prev => [...prev, res.data])
      } else {
        setItems(prev => prev.map(it => it.id === editingId ? { ...it, ...res.data } : it))
      }
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: modalMode === 'añadir' ? 'Skill añadida correctamente ✓' : 'Skill actualizada correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar la skill' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setSaving(false)
  }

  if (loading || nivelPermiso === null) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando skills...</div>
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
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Skills de IA</h1>
          <p className="text-ink-500 mt-1">Activa o desactiva las capacidades de tu agente y personalízalas.</p>
        </div>
        <button onClick={openAñadir} disabled={nivelPermiso !== 'escritura'} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Añadir skill
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="font-semibold text-ink-900 text-lg mb-1">Aún no tienes skills configuradas.</p>
          <p className="text-ink-500 text-sm mb-4">Añade la primera para personalizar a tu agente.</p>
          <button onClick={openAñadir} disabled={nivelPermiso !== 'escritura'} className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-600 transition disabled:opacity-50 disabled:cursor-not-allowed">
            Añadir skill
          </button>
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
              items={items.map(it => it.id)}
              strategy={verticalListSortingStrategy}
            >
              {items.map((item) => (
                <SortableItem 
                  key={item.id} 
                  item={item} 
                  onToggle={handleToggleActivo}
                  onEdit={openEditar}
                  onDelete={handleDelete}
                  soloLectura={nivelPermiso !== 'escritura'}
                />
              ))}
            </SortableContext>

            <DragOverlay>
              {activeId ? (
                <div className="shadow-2xl ring-1 ring-brand-500/20 bg-white opacity-100 scale-[1.02] cursor-grabbing rounded-xl overflow-hidden">
                  <SkillRow 
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

      {/* =========================================================
           POPUP · Añadir / Editar skill
           ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
        
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]">
              
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 h-full">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                  <h2 className="font-display font-700 text-lg text-ink-900">{modalMode === 'editar' ? 'Editar skill' : 'Añadir skill'}</h2>
                  <button type="button" onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
        
                <div className="flex-1 min-h-0 px-6 py-5 space-y-4 overflow-y-auto">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre de la skill</label>
                    <input type="text" required placeholder="Ej. Idioma y saludo inicial"
                      value={formData.nombre}
                      onChange={e => setFormData({...formData, nombre: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" 
                    />
                  </div>
        
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Descripción</label>
                    <textarea rows={3} placeholder="Describe para qué sirve esta skill..."
                      value={formData.descripcion}
                      onChange={e => setFormData({...formData, descripcion: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
                  </div>
        
                  <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <span className="text-sm font-500 text-ink-700">Activo</span>
                    <input type="checkbox" 
                      checked={formData.activo} 
                      onChange={e => setFormData({...formData, activo: e.target.checked})}
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
                    ) : 'Guardar skill'}
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
