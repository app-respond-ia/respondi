'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getPlantillasParaEnviar } from '@/app/actions/whatsapp-plantillas'
import { enviarPlantillaConv } from '@/app/actions/conversaciones'
import { rellenar } from '@/lib/canales/plantillas-texto'

// Elegir una plantilla aprobada, rellenar sus huecos y enviarla. Es la única
// forma de escribir por WhatsApp a un cliente pasadas 24 h desde su último
// mensaje.

type Resultado = Awaited<ReturnType<typeof enviarPlantillaConv>>

export function EnviarPlantillaModal({ isOpen, onClose, convId, nombreCliente, onEnviada }: {
  isOpen: boolean
  onClose: () => void
  convId: string
  nombreCliente?: string | null
  onEnviada: (res: Resultado) => void
}) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [plantillas, setPlantillas] = useState<any[]>([])
  const [elegida, setElegida] = useState<string | null>(null)
  const [valores, setValores] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setCargando(true)
    setError(null)
    setElegida(null)
    setValores([])
    getPlantillasParaEnviar()
      .then(res => {
        if (res.success) setPlantillas((res as any).plantillas || [])
        else setError((res as any).error || 'No se han podido cargar las plantillas.')
      })
      .catch(() => setError('No se han podido cargar las plantillas. Revisa la conexión.'))
      .finally(() => setCargando(false))
  }, [isOpen])

  const plantilla = useMemo(() => plantillas.find(p => p.id === elegida) || null, [plantillas, elegida])

  const elegir = (id: string) => {
    setElegida(id)
    const p = plantillas.find(x => x.id === id)
    setValores((p?.huecos || []).map(() => ''))
  }

  const completos = !!plantilla && valores.every(v => v.trim())

  const enviar = async () => {
    if (!plantilla || !completos) return
    setEnviando(true)
    const res = await enviarPlantillaConv(convId, plantilla.id, valores)
      .catch(() => ({ success: false as const, error: 'No se ha podido enviar. Revisa la conexión.' }))
    setEnviando(false)
    if (res.success) onClose()
    onEnviada(res as Resultado)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !enviando && onClose()}></div>
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" role="dialog" aria-modal="true" aria-labelledby="titulo-enviar-plantilla">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 id="titulo-enviar-plantilla" className="font-display font-700 text-lg text-ink-900">Enviar plantilla</h2>
          <button onClick={() => !enviando && onClose()} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-4">
          <p className="text-sm text-ink-600">
            Han pasado más de 24 h desde el último mensaje{nombreCliente ? ` de ${nombreCliente}` : ' del cliente'}. WhatsApp solo deja escribirle con una plantilla aprobada por Meta. Cuando conteste, podrás volver a escribir con normalidad.
          </p>

          {cargando ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : plantillas.length === 0 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              No hay plantillas aprobadas que se puedan enviar.{' '}
              <Link href="/dashboard/canales/whatsapp-plantillas" className="font-600 underline underline-offset-2">Crea una en Plantillas</Link>
              {' '}(Meta suele revisarlas en unos minutos).
            </div>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-600 text-ink-900 mb-2">Plantilla</legend>
                {plantillas.map(p => (
                  <label key={p.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${elegida === p.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" name="plantilla" className="mt-1 accent-brand-600" checked={elegida === p.id} onChange={() => elegir(p.id)} />
                    <span className="min-w-0">
                      <span className="block text-sm font-600 text-ink-900">{p.nombre} <span className="font-normal text-ink-400">· {p.idioma}</span></span>
                      <span className="block text-xs text-ink-500 line-clamp-2">{p.cuerpo}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {plantilla && plantilla.huecos.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-600 text-ink-900">Rellena los huecos</p>
                  {plantilla.huecos.map((n: number, i: number) => (
                    <div key={n}>
                      <label htmlFor={`hueco-${n}`} className="block text-xs font-600 text-ink-600 mb-1">{`{{${n}}}`}</label>
                      <input
                        id={`hueco-${n}`}
                        value={valores[i] || ''}
                        onChange={e => setValores(v => v.map((x, j) => (j === i ? e.target.value.replace(/[\n\t]/g, ' ') : x)))}
                        maxLength={1000}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              {plantilla && (
                <div>
                  <p className="text-xs font-600 text-ink-500 mb-1.5">Así lo verá el cliente</p>
                  <div className="rounded-2xl rounded-tr-sm bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-900 whitespace-pre-wrap break-words">
                    {plantilla.cabecera && <p className="font-600 mb-1">{plantilla.cabecera}</p>}
                    <p>{rellenar(plantilla.cuerpo, valores)}</p>
                    {plantilla.pie && <p className="text-xs text-emerald-800/70 mt-2">{plantilla.pie}</p>}
                    {plantilla.botones?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-emerald-200 flex flex-wrap gap-2">
                        {plantilla.botones.map((b: string) => <span key={b} className="text-xs font-600 text-emerald-700">{b}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} disabled={enviando} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">Cancelar</button>
          <button onClick={enviar} disabled={!completos || enviando} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50">
            {enviando ? 'Enviando…' : 'Enviar plantilla'}
          </button>
        </div>
      </div>
    </div>
  )
}
