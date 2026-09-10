'use client'

import { SelectorHorarioIA, type ModoHorarioIA } from '@/components/sucursales/SelectorHorarioIA'
import { type HorarioDia } from '@/lib/horarios'

interface ConfiguracionMensajeIAProps {
  mensaje: string
  onChangeMensaje: (msg: string) => void
  sinMensaje: boolean
  onChangeSinMensaje: (v: boolean) => void
  modo: string
  onChangeModo: (modo: ModoHorarioIA) => void
  horariosIA: HorarioDia[]
  onChangeHorariosIA: (h: HorarioDia[]) => void
  abrirCaso: boolean
  onChangeAbrirCaso: (v: boolean) => void
  nivelPermiso?: 'lectura' | 'escritura'
}

// Paso "Mensaje de bienvenida" compartido por el onboarding principal y el
// alta de una sucursal nueva. Antes cada asistente tenía su propia versión
// (y el de sucursal nueva ni siquiera lo tenía como paso: lo amontonaba
// junto al perfil, con un checkbox de 2 opciones en vez de los 3 modos).
export function ConfiguracionMensajeIA({
  mensaje,
  onChangeMensaje,
  sinMensaje,
  onChangeSinMensaje,
  modo,
  onChangeModo,
  horariosIA,
  onChangeHorariosIA,
  abrirCaso,
  onChangeAbrirCaso,
  nivelPermiso = 'escritura'
}: ConfiguracionMensajeIAProps) {
  const soloLectura = nivelPermiso !== 'escritura'

  return (
    <div>
      <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={sinMensaje}
          disabled={soloLectura}
          onChange={e => {
            onChangeSinMensaje(e.target.checked)
            if (e.target.checked) onChangeMensaje('')
          }}
          className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
        />
        <span className="font-semibold text-ink-900 text-sm">No quiero enviar mensaje de bienvenida</span>
      </label>

      <textarea
        rows={5}
        value={mensaje}
        onChange={e => onChangeMensaje(e.target.value)}
        disabled={sinMensaje || soloLectura}
        placeholder="Ej. ¡Hola! Soy el asistente virtual de Pastelería Dulce Hogar. Estoy aquí para ayudarte con información sobre nuestros productos y precios. ¿En qué puedo ayudarte hoy?"
        className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:opacity-50 disabled:bg-slate-50"
      ></textarea>

      <div className="flex items-start gap-3 mt-4 rounded-xl bg-brand-50 border border-brand-100 p-3.5">
        <svg className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-ink-700">Es buena idea aclarar que se trata de un asistente virtual. Así el cliente sabe que habla con una IA.</p>
      </div>

      <div className="mt-6">
        <SelectorHorarioIA
          modo={modo}
          onChangeModo={m => {
            onChangeModo(m)
            if (m === 'siempre_activa') onChangeAbrirCaso(false)
          }}
          horariosIA={horariosIA}
          onChangeHorariosIA={onChangeHorariosIA}
          nivelPermiso={nivelPermiso}
        />
      </div>

      {modo !== 'siempre_activa' && (
        <div className="mt-4">
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={abrirCaso}
              disabled={soloLectura}
              onChange={e => onChangeAbrirCaso(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            />
            <span className="text-sm font-500 text-ink-900 group-hover:text-brand-700 transition">
              Abrir un caso automáticamente cuando llega un mensaje fuera de horario
            </span>
          </label>
        </div>
      )}
    </div>
  )
}
