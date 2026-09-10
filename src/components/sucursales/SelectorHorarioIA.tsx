'use client'

import { EditorHorarios } from '@/components/sucursales/EditorHorarios'
import { type HorarioDia } from '@/lib/horarios'

export type ModoHorarioIA = 'mismo_negocio' | 'siempre_activa' | 'personalizado'

export const MODOS_HORARIO_IA: { id: ModoHorarioIA; label: string }[] = [
  { id: 'mismo_negocio', label: 'Mismo que el negocio' },
  { id: 'siempre_activa', label: 'Siempre activa (24/7)' },
  { id: 'personalizado', label: 'Horario personalizado' }
]

interface SelectorHorarioIAProps {
  modo: string
  onChangeModo: (modo: ModoHorarioIA) => void
  horariosIA: HorarioDia[]
  onChangeHorariosIA: (horarios: HorarioDia[]) => void
  nivelPermiso?: 'lectura' | 'escritura'
}

// Selector único del horario en que responde la IA, compartido por
// perfil-sucursal, alta de sucursal y onboarding. Antes cada sitio ofrecía
// opciones distintas para lo mismo (aquí 3 modos, allí un checkbox de 2).
export function SelectorHorarioIA({
  modo,
  onChangeModo,
  horariosIA,
  onChangeHorariosIA,
  nivelPermiso = 'escritura'
}: SelectorHorarioIAProps) {
  const soloLectura = nivelPermiso !== 'escritura'

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-slate-700">Horario de atención de la IA</label>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {MODOS_HORARIO_IA.map(opt => (
          <label
            key={opt.id}
            className={`flex items-center gap-3 p-4 rounded-xl border transition ${soloLectura ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${modo === opt.id ? 'bg-brand-50 border-brand-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}
          >
            <input
              type="radio"
              name="modo_horario_ia"
              value={opt.id}
              checked={modo === opt.id}
              onChange={() => onChangeModo(opt.id)}
              disabled={soloLectura}
              className="text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm font-500 text-ink-900">{opt.label}</span>
          </label>
        ))}
      </div>

      {modo === 'personalizado' && (
        <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
          <EditorHorarios
            horarios={horariosIA}
            onChange={onChangeHorariosIA}
            nivelPermiso={soloLectura ? 'lectura' : 'escritura'}
            variant="ia"
          />
        </div>
      )}

      {modo === 'mismo_negocio' && (
        <p className="text-xs text-ink-500 mt-1">La IA seguirá el horario del negocio configurado arriba.</p>
      )}

      {modo === 'siempre_activa' && (
        <p className="text-xs text-ink-500 mt-1">La IA responde en cualquier momento del día, todos los días, sin restricción de horario.</p>
      )}
    </div>
  )
}
