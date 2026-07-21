'use client'

import { useState, useEffect } from 'react'
import { getMisPermisos } from '@/app/actions/permisos'
import { getSkillsParaCliente, toggleSkillCliente } from '@/app/actions/skills-globales'
import { resolveBranchId } from '@/lib/active-branch'

export default function SkillsPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const permisosRes = await getMisPermisos()

    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        setNivelPermiso('escritura')
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'skills')
        setNivelPermiso(p?.nivel || 'ninguno')
      }

      const bid = (permisosRes as any).branchId
      const tid = (permisosRes as any).tenantId
      setBranchId(bid)
      setTenantId(tid)

      if (bid) {
        const skillsRes = await getSkillsParaCliente(bid)
        if (skillsRes.success && skillsRes.data) setItems(skillsRes.data)
      }
    }
    setLoading(false)
  }

  const handleToggle = async (item: any) => {
    if (!item.cliente_puede_toggle) return
    if (!branchId || !tenantId) return

    const nuevoEstado = !item.activo
    setItems(prev => prev.map(s => s.id === item.id ? { ...s, activo: nuevoEstado } : s))

    const res = await toggleSkillCliente(branchId, tenantId, item.nombre, nuevoEstado)
    if (!res.success) {
      setItems(prev => prev.map(s => s.id === item.id ? { ...s, activo: item.activo } : s))
      setMensaje({ tipo: 'error', texto: res.error || 'Error al actualizar' })
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
        <div className={`mb-6 p-4 rounded-xl font-500 text-sm border ${mensaje.tipo === 'exito' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {mensaje.texto}
        </div>
      )}

      <div className="mb-6">
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Skills de IA</h1>
        <p className="text-ink-500 mt-1">Activa o desactiva las capacidades de tu agente.</p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="font-semibold text-ink-900 text-lg mb-1">No hay skills disponibles.</p>
          <p className="text-ink-500 text-sm">Las skills se configuran desde el panel de administración.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {items.map(item => (
            <div key={item.id} className={`p-4 sm:p-5 flex items-center gap-4 ${!item.cliente_puede_toggle ? 'bg-slate-50/50' : 'bg-white'}`}>
              <button
                onClick={() => handleToggle(item)}
                disabled={!item.cliente_puede_toggle || nivelPermiso !== 'escritura'}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${item.activo ? 'bg-emerald-500' : 'bg-slate-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
                role="switch"
                aria-checked={item.activo}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${item.activo ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-600 text-ink-900">{item.nombre}</h3>
                  {!item.cliente_puede_toggle && (
                    <span className="text-[10px] font-600 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Siempre activa</span>
                  )}
                </div>
                {item.descripcion && (
                  <p className="text-xs text-ink-500 mt-0.5">{item.descripcion}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 flex items-start gap-3">
        <svg className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <p>Las skills activas determinan qué capacidades tiene tu agente de IA. Puedes cambiarlas en cualquier momento.</p>
      </div>
    </div>
  )
}
