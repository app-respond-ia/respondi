'use client'

import { useEffect, useState } from 'react'
import { PAISES, paisPorCodigo, paisPorPrefijo } from '@/lib/paises'

// El teléfono siempre en dos campos: el prefijo del país (elegido de la lista
// de todos los países) y el número. Decidido con Jorge: el prefijo lo pone
// siempre quien escribe el teléfono, nunca se supone por el país del negocio.

const SELECT = 'h-12 px-2 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:bg-slate-50 disabled:opacity-75'
const INPUT = 'h-12 px-4 rounded-xl border border-slate-300 bg-white text-base placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:bg-slate-50 disabled:opacity-75'

export function SelectorPrefijo({ prefijo, onCambiar, id, disabled, className }: {
  prefijo: string
  onCambiar: (prefijo: string, codigoPais: string) => void
  id?: string
  disabled?: boolean
  className?: string
}) {
  // Se recuerda el país elegido, porque varios comparten prefijo (+1 es
  // Estados Unidos, Canadá, Puerto Rico...) y el cliente no debe ver saltar
  // su elección a otro país
  const [codigo, setCodigo] = useState(() => paisPorPrefijo(prefijo)?.codigo || '')
  useEffect(() => {
    if (paisPorCodigo(codigo)?.prefijo !== prefijo) setCodigo(paisPorPrefijo(prefijo)?.codigo || '')
  }, [prefijo]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <select
      id={id}
      value={codigo}
      disabled={disabled}
      aria-label="Prefijo del país"
      onChange={e => {
        const p = paisPorCodigo(e.target.value)
        if (!p) return
        setCodigo(p.codigo)
        onCambiar(p.prefijo, p.codigo)
      }}
      className={className || `${SELECT} w-36 shrink-0`}
    >
      {!codigo && <option value="">País</option>}
      {PAISES.map(p => <option key={p.codigo} value={p.codigo}>{p.bandera} {p.nombre} ({p.prefijo})</option>)}
    </select>
  )
}

export function CampoTelefono({ prefijo, numero, onCambiar, id, disabled, placeholder, obligatorio, autoComplete, claseSelect, claseInput }: {
  prefijo: string
  numero: string
  onCambiar: (valor: { prefijo: string; numero: string }) => void
  id?: string
  disabled?: boolean
  placeholder?: string
  obligatorio?: boolean
  autoComplete?: string
  claseSelect?: string
  claseInput?: string
}) {
  return (
    <div className="flex gap-2 min-w-0">
      <SelectorPrefijo prefijo={prefijo} onCambiar={p => onCambiar({ prefijo: p, numero })} id={id ? `${id}-prefijo` : undefined} disabled={disabled} className={claseSelect} />
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete || 'tel-national'}
        value={numero}
        disabled={disabled}
        required={obligatorio}
        placeholder={placeholder || '600 000 000'}
        onChange={e => onCambiar({ prefijo, numero: e.target.value.replace(/[^\d\s]/g, '') })}
        className={claseInput || `${INPUT} flex-1 min-w-0 w-full`}
      />
    </div>
  )
}
