'use client'

import { useState, useEffect } from 'react'
import { getVendedorClientes, actualizarClienteSeguimiento } from '@/app/actions/superadmin'

const ESTADOS = ['trial', 'negociacion', 'activo', 'en_riesgo', 'perdido'] as const
type EstadoSeguimiento = typeof ESTADOS[number]

const ESTADO_CONFIG: Record<EstadoSeguimiento, { label: string, badge: string }> = {
  trial: { label: 'Trial', badge: 'bg-amber-100 text-amber-700' },
  negociacion: { label: 'En negociación', badge: 'bg-blue-100 text-blue-700' },
  activo: { label: 'Activo', badge: 'bg-emerald-100 text-emerald-700' },
  en_riesgo: { label: 'En riesgo', badge: 'bg-orange-100 text-orange-700' },
  perdido: { label: 'Perdido', badge: 'bg-red-100 text-red-700' },
}

export default function VendedorClientesPage() {
  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('')
  const [selectedCliente, setSelectedCliente] = useState<any>(null)
  const [editEstado, setEditEstado] = useState<EstadoSeguimiento>('trial')
  const [editNotas, setEditNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const res = await getVendedorClientes()
    if (res.success && res.clientes) setClientes(res.clientes)
    setLoading(false)
  }

  const openModal = (c: any) => {
    setSelectedCliente(c)
    setEditEstado(c.estado_seguimiento)
    setEditNotas(c.notas || '')
  }

  const handleGuardar = async () => {
    if (!selectedCliente) return
    setSaving(true)
    const res = await actualizarClienteSeguimiento(selectedCliente.id, {
      estado_seguimiento: editEstado,
      notas: editNotas
    })
    if (res.success) {
      setSelectedCliente(null)
      setMensaje({ tipo: 'exito', texto: 'Cliente actualizado ✓' })
      cargar()
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al actualizar' })
    }
    setTimeout(() => setMensaje(null), 3000)
    setSaving(false)
  }

  const clientesFiltrados = filtroEstado
    ? clientes.filter(c => c.estado_seguimiento === filtroEstado)
    : clientes

  const formatFecha = (d: string) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="space-y-6">
      {mensaje && (
        <div className={`p-4 rounded-xl font-500 text-sm border ${mensaje.tipo === 'exito' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {mensaje.texto}
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Mis clientes</h1>
          <p className="text-ink-500 mt-1">Gestiona el seguimiento de tu cartera.</p>
        </div>
        <a href="/vendedor/nuevo-cliente"
          className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition shadow-lg shadow-brand-600/30">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nuevo cliente
        </a>
      </div>

      {/* Filtro por estado */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFiltroEstado('')}
          className={`px-3 py-1.5 rounded-lg text-sm font-500 transition ${!filtroEstado ? 'bg-ink-900 text-white' : 'bg-white border border-slate-200 text-ink-600 hover:bg-slate-50'}`}>
          Todos ({clientes.length})
        </button>
        {ESTADOS.map(e => {
          const count = clientes.filter(c => c.estado_seguimiento === e).length
          if (count === 0) return null
          return (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={`px-3 py-1.5 rounded-lg text-sm font-500 transition ${filtroEstado === e ? 'bg-ink-900 text-white' : 'bg-white border border-slate-200 text-ink-600 hover:bg-slate-50'}`}>
              {ESTADO_CONFIG[e].label} ({count})
            </button>
          )
        })}
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-ink-500">Cargando clientes...</div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="p-8 text-center text-ink-500">No hay clientes con este filtro.</div>
        ) : (
          clientesFiltrados.map(c => {
            const org = c.organizaciones
            const conf = ESTADO_CONFIG[c.estado_seguimiento as EstadoSeguimiento]
            return (
              <div key={c.id} className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-600 text-slate-600 shrink-0">
                  {org?.nombre?.substring(0, 2).toUpperCase() || '??'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-600 text-ink-900">{org?.nombre || 'Sin nombre'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${conf.badge}`}>{conf.label}</span>
                  </div>
                  <p className="text-xs text-ink-400 mt-0.5">
                    Plan: {org?.plans?.nombre || 'Sin plan'} · Alta: {formatFecha(c.fecha_vinculacion)}
                  </p>
                  {c.notas && <p className="text-xs text-ink-500 mt-1 truncate">{c.notas}</p>}
                </div>
                <button onClick={() => openModal(c)}
                  className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Modal editar seguimiento */}
      {selectedCliente && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setSelectedCliente(null)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl pointer-events-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">Actualizar seguimiento</h2>
                <button onClick={() => setSelectedCliente(null)} className="p-1.5 rounded-lg text-ink-400 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="font-600 text-ink-900">{selectedCliente.organizaciones?.nombre}</p>
                  <p className="text-sm text-ink-500">{selectedCliente.organizaciones?.plans?.nombre}</p>
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-2">Estado de seguimiento</label>
                  <div className="grid grid-cols-1 gap-2">
                    {ESTADOS.map(e => (
                      <label key={e} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${editEstado === e ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                        <input type="radio" name="estado" value={e} checked={editEstado === e} onChange={() => setEditEstado(e)} className="sr-only" />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${ESTADO_CONFIG[e].badge}`}>{ESTADO_CONFIG[e].label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Notas <span className="text-ink-400 font-400">· opcional</span></label>
                  <textarea rows={3} value={editNotas} onChange={e => setEditNotas(e.target.value)}
                    placeholder="Observaciones, próximos pasos..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
                <button onClick={() => setSelectedCliente(null)} disabled={saving}
                  className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button onClick={handleGuardar} disabled={saving}
                  className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
