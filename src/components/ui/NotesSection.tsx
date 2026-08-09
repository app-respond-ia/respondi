'use client'

import { useState, useEffect } from 'react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { getNotas, crearNota, eliminarNota } from '@/app/actions/notas'
import Loading from '@/components/Loading'

interface Nota {
  id: string
  contenido: string
  created_at: string
  user_id: string
  users?: {
    nombre: string
    email: string
  }
}

interface NotesSectionProps {
  conversationId: string
  canDelete: boolean
}

export function NotesSection({ conversationId, canDelete }: NotesSectionProps) {
  const [notas, setNotas] = useState<Nota[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newNota, setNewNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notaToDelete, setNotaToDelete] = useState<string | null>(null)

  useEffect(() => {
    cargarNotas()
  }, [conversationId])

  const cargarNotas = async () => {
    setLoading(true)
    const res = await getNotas(conversationId)
    if (res.success && res.data) {
      setNotas(res.data as unknown as Nota[])
      setError(null)
    } else {
      setError('Error al cargar las notas')
    }
    setLoading(false)
  }

  const handleCrearNota = async () => {
    if (!newNota.trim()) return
    setSaving(true)
    setError(null)
    
    const res = await crearNota(conversationId, newNota)
    
    if (res.success && res.data) {
      // Add new note to the top of the list
      setNotas(prev => [res.data as unknown as Nota, ...prev])
      setNewNota('')
    } else {
      setError(res.error || 'Error al guardar la nota')
    }
    setSaving(false)
  }

  const handleEliminarNota = async () => {
    if (!notaToDelete) return
    const currentToDelete = notaToDelete
    setNotaToDelete(null)
    
    const res = await eliminarNota(currentToDelete)
    if (res.success) {
      setNotas(prev => prev.filter(n => n.id !== currentToDelete))
    } else {
      alert(res.error || 'Error al eliminar la nota')
    }
  }

  // Format relative time (e.g. "Hace 2 h", "Ayer", etc)
  const formatTimeRelativo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffSecs < 60) return 'Ahora mismo'
    if (diffMins < 60) return `Hace ${diffMins} m`
    if (diffHours < 24) return `Hace ${diffHours} h`
    if (diffDays === 1) return 'Ayer'
    if (diffDays < 7) return `Hace ${diffDays} d`
    
    return date.toLocaleDateString([], { day: '2-digit', month: 'short' })
  }

  if (loading) {
    return (
      <div className="flex justify-center p-4">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-h-[300px]">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
        <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Notas internas
        </h3>
        {notas.length > 0 && (
          <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
            {notas.length}
          </span>
        )}
      </div>

      <div className="p-3 border-b border-slate-100 bg-white shrink-0">
        <div className="relative">
          <textarea
            value={newNota}
            onChange={(e) => setNewNota(e.target.value)}
            placeholder="Escribe una nota interna para el equipo..."
            className="w-full text-sm border border-slate-200 rounded-xl p-3 bg-slate-50 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition resize-none min-h-[80px]"
          />
          <button
            onClick={handleCrearNota}
            disabled={!newNota.trim() || saving}
            className={`absolute bottom-3 right-3 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
              newNota.trim() && !saving
                ? 'bg-brand-600 text-white hover:bg-brand-700'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {saving ? 'Guardando...' : 'Añadir'}
          </button>
        </div>
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50">
        {notas.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-400 italic">No hay notas internas.</p>
          </div>
        ) : (
          notas.map((nota) => (
            <div key={nota.id} className="bg-amber-50 rounded-xl p-3 border border-amber-100 shadow-sm relative group">
              <div className="flex justify-between items-start mb-1.5">
                <span className="text-xs font-bold text-amber-900">
                  {nota.users?.nombre || nota.users?.email || 'Usuario'}
                </span>
                <span className="text-[10px] font-medium text-amber-700/60 bg-amber-100/50 px-1.5 py-0.5 rounded">
                  {formatTimeRelativo(nota.created_at)}
                </span>
              </div>
              <p className="text-sm text-amber-900/80 whitespace-pre-wrap break-words">{nota.contenido}</p>
              
              {canDelete && (
                <button
                  onClick={() => setNotaToDelete(nota.id)}
                  className="absolute -top-2 -right-2 bg-white rounded-full p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                  title="Eliminar nota"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <ConfirmModal
        isOpen={!!notaToDelete}
        onClose={() => setNotaToDelete(null)}
        onConfirm={handleEliminarNota}
        title="Eliminar nota"
        message="¿Estás seguro de eliminar esta nota interna? Esta acción no se puede deshacer."
        confirmText="Sí, eliminar"
        cancelText="Cancelar"
        type="danger"
      />
    </div>
  )
}
