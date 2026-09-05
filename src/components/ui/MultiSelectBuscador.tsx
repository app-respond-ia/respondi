'use client'
import { useState, useRef, useEffect } from 'react'

interface Opcion {
  id: string
  label: string
}

interface Props {
  opciones: Opcion[]
  seleccionados: string[]
  onChange: (ids: string[]) => void
  placeholder: string
  disabled?: boolean
}

export function MultiSelectBuscador({ opciones, seleccionados, onChange, placeholder, disabled }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const opcionesFiltradas = opciones.filter(o =>
    o.label.toLowerCase().includes(busqueda.toLowerCase())
  )

  const toggleOpcion = (id: string) => {
    if (seleccionados.includes(id)) {
      onChange(seleccionados.filter(s => s !== id))
    } else {
      onChange([...seleccionados, id])
    }
  }

  const quitarChip = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(seleccionados.filter(s => s !== id))
  }

  const seleccionadosLabels = opciones.filter(o => seleccionados.includes(o.id))

  // Cerrar si hacen click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setAbierto(false)
      }
    }
    if (abierto) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [abierto])

  return (
    <div className="relative w-full sm:w-64" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto(!abierto)}
        className="w-full min-h-10 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm text-left focus:outline-none focus:border-brand-500 transition disabled:bg-slate-50 disabled:text-ink-400 flex items-center flex-wrap gap-1"
      >
        {seleccionadosLabels.length === 0 ? (
          <span className="text-ink-400">{placeholder}</span>
        ) : (
          seleccionadosLabels.map(o => (
            <span key={o.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-600">
              {o.label}
              <span onClick={(e) => quitarChip(o.id, e)} className="hover:text-brand-900 cursor-pointer">×</span>
            </span>
          ))
        )}
      </button>

      {abierto && !disabled && (
        <div className="absolute left-0 mt-1 w-full bg-white rounded-xl shadow-lg border border-slate-200 z-50 p-2">
          <div className="relative mb-2">
            <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              autoFocus
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:border-brand-500 transition"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {opcionesFiltradas.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-3">Sin resultados</p>
            ) : (
              opcionesFiltradas.map(o => (
                <label key={o.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                  <input type="checkbox" checked={seleccionados.includes(o.id)} onChange={() => toggleOpcion(o.id)} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300" />
                  <span className="truncate">{o.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
