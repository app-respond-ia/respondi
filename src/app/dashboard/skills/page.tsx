'use client'

import { useState, useEffect } from 'react'
import { getSkills, actualizarSkill } from '@/app/actions/skills'
import { getMisPermisos } from '@/app/actions/permisos'

function SkillRow({ item, onToggle, soloLectura }: {
  item: any,
  onToggle: (item: any) => void,
  soloLectura?: boolean
}) {
  return (
    <div className="p-4 sm:p-5 flex items-center gap-4 bg-white">
      <button 
        onClick={() => onToggle(item)} 
        disabled={soloLectura}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${item.activo ? 'bg-emerald-500' : 'bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
        role="switch" 
        aria-checked={item.activo}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${item.activo ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-600 text-ink-900 truncate">{item.nombre}</h3>
        {item.descripcion && (
          <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">{item.descripcion}</p>
        )}
      </div>
    </div>
  )
}

export default function SkillsPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

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

      <div className="mb-6">
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Skills de IA</h1>
        <p className="text-ink-500 mt-1">Activa o desactiva las capacidades de tu agente.</p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="font-semibold text-ink-900 text-lg mb-1">No hay skills configuradas.</p>
          <p className="text-ink-500 text-sm">Las skills se configuran desde el panel de administración.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col divide-y divide-slate-100">
          {items.map((item) => (
            <SkillRow
              key={item.id}
              item={item}
              onToggle={handleToggleActivo}
              soloLectura={nivelPermiso !== 'escritura'}
            />
          ))}
        </div>
      )}

      <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 flex items-start gap-3">
        <svg className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>Las skills activas determinan qué capacidades tiene tu agente de IA. Puedes activarlas o desactivarlas en cualquier momento.</p>
      </div>
    </div>
  )
}
