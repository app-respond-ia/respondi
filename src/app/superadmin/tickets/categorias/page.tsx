'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getCategoriasTickets, crearCategoriaTicket, actualizarCategoriaTicket, borrarCategoriaTicket } from '@/app/actions/superadmin'
import Loading from '@/components/Loading'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'

export default function CategoriasTicketsPage() {
  const [loading, setLoading] = useState(true)
  const [categorias, setCategorias] = useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'añadir' | 'editar'>('añadir')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null)
  const { showToast } = useToast()

  const cargarCategorias = async () => {
    setLoading(true)
    const res = await getCategoriasTickets()
    if (res.success && res.data) {
      setCategorias(res.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    cargarCategorias()
  }, [])

  const openAñadir = () => {
    setModalMode('añadir')
    setEditingId(null)
    setNombre('')
    setColor('#6366f1')
    setIsModalOpen(true)
  }

  const openEditar = (cat: any) => {
    setModalMode('editar')
    setEditingId(cat.id)
    setNombre(cat.nombre)
    setColor(cat.color)
    setIsModalOpen(true)
  }

  const handleConfirmarBorrar = async () => {
    if (!confirmarBorrar) return
    setSaving(true)
    const res = await borrarCategoriaTicket(confirmarBorrar)
    setSaving(false)
    
    if (res.success) {
      setCategorias(prev => prev.filter(c => c.id !== confirmarBorrar))
      setConfirmarBorrar(null)
      showToast('Categoría eliminada correctamente', 'success')
    } else {
      setConfirmarBorrar(null)
      showToast(res.error || 'Error al eliminar', 'error')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return

    setSaving(true)
    let res
    if (modalMode === 'añadir') {
      res = await crearCategoriaTicket(nombre, color)
    } else {
      res = await actualizarCategoriaTicket(editingId!, nombre, color)
    }

    if (res.success) {
      await cargarCategorias()
      setIsModalOpen(false)
      showToast(modalMode === 'añadir' ? 'Categoría añadida' : 'Categoría actualizada', 'success')
    } else {
      showToast(res.error || 'Error al guardar', 'error')
    }
    setSaving(false)
  }

  if (loading) return <Loading />

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-center bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div>
          <Link href="/superadmin/tickets" className="inline-flex items-center gap-1.5 text-sm font-600 text-brand-600 hover:text-brand-700 transition mb-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            Volver a tickets
          </Link>
          <h1 className="font-display font-700 text-2xl text-ink-900 leading-tight">Categorías de Tickets</h1>
          <p className="text-ink-500 mt-1">Gestiona los nombres y colores de las etiquetas de soporte.</p>
        </div>
        <button onClick={openAñadir} className="inline-flex items-center gap-2 px-5 h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nueva categoría
        </button>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {categorias.length === 0 ? (
          <div className="text-center py-12 text-ink-400">No hay categorías configuradas.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-ink-500 bg-slate-50/50">
                <th className="font-600 px-6 py-4">Color</th>
                <th className="font-600 px-6 py-4">Nombre</th>
                <th className="font-600 px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categorias.map(cat => (
                <tr key={cat.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md shadow-sm border border-black/10" style={{ backgroundColor: cat.color }}></div>
                      <span className="text-xs text-ink-400 font-mono">{cat.color}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-600 text-ink-900">
                    <span className="px-3 py-1 rounded-full text-xs" style={{ backgroundColor: `${cat.color}15`, color: cat.color, border: `1px solid ${cat.color}30` }}>
                      {cat.nombre}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEditar(cat)} className="p-2 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition" title="Editar">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={() => setConfirmarBorrar(cat.id)} className="p-2 rounded-lg text-ink-400 hover:text-red-500 hover:bg-red-50 transition" title="Eliminar">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h2 className="font-display font-700 text-lg text-ink-900">{modalMode === 'añadir' ? 'Nueva categoría' : 'Editar categoría'}</h2>
                <button type="button" onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre</label>
                  <input type="text" required placeholder="Ej. Bug técnico"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Color</label>
                  <div className="flex gap-3 items-center">
                    <input type="color" required
                      value={color}
                      onChange={e => setColor(e.target.value)}
                      className="w-12 h-12 rounded-xl border border-slate-300 cursor-pointer" 
                    />
                    <input type="text" value={color} onChange={e => setColor(e.target.value)} pattern="^#+([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$" className="flex-1 h-12 px-4 rounded-xl border border-slate-300 font-mono text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" disabled={saving} onClick={() => setIsModalOpen(false)} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ConfirmModal Eliminación */}
      <ConfirmModal
        isOpen={!!confirmarBorrar}
        title="Eliminar categoría"
        message="¿Estás seguro de que quieres eliminar esta categoría? No se podrá borrar si hay tickets usándola."
        confirmText="Eliminar"
        type="danger"
        isLoading={saving}
        onConfirm={handleConfirmarBorrar}
        onClose={() => setConfirmarBorrar(null)}
      />
    </div>
  )
}
