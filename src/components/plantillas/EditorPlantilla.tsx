'use client'

import { useEffect, useMemo, useState } from 'react'
import { ETIQUETA_CATEGORIA_PLANTILLA, NOMBRE_HUECO, huecosDe, problemaDelCuerpo, rellenar } from '@/lib/canales/plantillas-texto'

// El editor de una plantilla de WhatsApp, en un panel lateral. Sirve para
// tres cosas: crear una nueva, editar una que ya existe (sale una versión
// nueva) y ajustar una prediseñada antes de mandarla a Meta.
//
// Las prediseñadas (y las versiones que salen de ellas) solo pueden usar los
// huecos que la automatización sabe rellenar: {{1}} es siempre el primer
// dato de la lista, {{2}} el segundo... El cliente puede quitar los últimos
// o cambiar el texto de alrededor, pero no inventar huecos nuevos.

export const IDIOMAS_PLANTILLA = [
  { codigo: 'es_ES', nombre: 'Español (España)' },
  { codigo: 'es', nombre: 'Español' },
  { codigo: 'es_MX', nombre: 'Español (México)' },
  { codigo: 'es_AR', nombre: 'Español (Argentina)' },
  { codigo: 'ca', nombre: 'Catalán' },
  { codigo: 'en_US', nombre: 'Inglés (EE. UU.)' },
  { codigo: 'en_GB', nombre: 'Inglés (Reino Unido)' },
  { codigo: 'pt_BR', nombre: 'Portugués (Brasil)' },
  { codigo: 'fr', nombre: 'Francés' },
  { codigo: 'it', nombre: 'Italiano' },
  { codigo: 'de', nombre: 'Alemán' }
]

// "Pedido listo" → "pedido_listo" (lo que Meta admite como nombre)
export function comoNombreDePlantilla(texto: string) {
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+/, '')
    .slice(0, 500)
}

export interface DatosEditor {
  nombre: string
  categoria: 'utilidad' | 'marketing'
  idioma: string
  contenido: string
  ejemplos: string[]
}

export function EditorPlantilla({ modo, inicial, huecosNombres, titulo, onGuardar, onCerrar }: {
  modo: 'nueva' | 'editar' | 'predisenada'
  inicial?: Partial<DatosEditor> & { version?: number; automatizacion?: string }
  // Qué dato va en cada hueco (solo prediseñadas): limita cuántos se pueden usar
  huecosNombres?: string[] | null
  titulo?: string
  onGuardar: (datos: DatosEditor) => Promise<{ success: boolean; error?: string }>
  onCerrar: () => void
}) {
  const [nombre, setNombre] = useState(inicial?.nombre || '')
  const [categoria, setCategoria] = useState<'utilidad' | 'marketing'>(inicial?.categoria || 'utilidad')
  const [idioma, setIdioma] = useState(inicial?.idioma || 'es_ES')
  const [contenido, setContenido] = useState(inicial?.contenido || '')
  const [ejemplos, setEjemplos] = useState<string[]>(inicial?.ejemplos || [])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const maxHuecos = huecosNombres ? huecosNombres.length : null
  const huecos = useMemo(() => huecosDe(contenido), [contenido])
  useEffect(() => {
    setEjemplos(prev => huecos.map((_, i) => prev[i] || (huecosNombres && inicial?.ejemplos ? inicial.ejemplos[i] : '') || ''))
  }, [huecos.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const problema = contenido.trim() ? problemaDelCuerpo(contenido) : null
  const sobran = maxHuecos !== null && huecos.length > maxHuecos
    ? `Esta plantilla solo puede llevar ${maxHuecos} ${maxHuecos === 1 ? 'hueco' : 'huecos'}: los datos que la automatización sabe rellenar.`
    : null
  const sinCambios = modo !== 'nueva' && contenido.trim() === (inicial?.contenido || '').trim()

  const anadirHueco = () => {
    const siguiente = (huecos[huecos.length - 1] || 0) + 1
    if (maxHuecos !== null && siguiente > maxHuecos) return
    setContenido(t => `${t}${t && !t.endsWith(' ') ? ' ' : ''}{{${siguiente}}}`)
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (problema || sobran) return
    setGuardando(true)
    setError(null)
    const r = await onGuardar({ nombre, categoria, idioma, contenido, ejemplos }).catch(() => ({ success: false, error: 'No se ha podido conectar. Revisa la conexión.' }))
    setGuardando(false)
    if (!r.success) setError(r.error || 'No se ha podido guardar la plantilla')
  }

  const cabecera = titulo || (modo === 'nueva' ? 'Nueva plantilla' : modo === 'editar' ? `Editar «${inicial?.nombre || ''}»` : 'Ajustar la plantilla')
  const puedeEnviar = !guardando && !problema && !sobran && !sinCambios && !!contenido.trim() && (modo !== 'nueva' || !!nombre)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={() => !guardando && onCerrar()}></div>
      <form onSubmit={guardar} className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col" aria-labelledby="titulo-editor-plantilla">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 id="titulo-editor-plantilla" className="font-display font-700 text-lg text-ink-900 truncate pr-4">{cabecera}</h2>
          <button type="button" onClick={() => !guardando && onCerrar()} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {modo === 'editar' && (
            <p className="text-sm text-ink-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
              Al guardar se crea la <strong>versión {(inicial?.version || 1) + 1}</strong> y va a Meta a revisión. Hasta que la aprueben se sigue usando la de ahora, y siempre podrás volver a una versión anterior desde el historial.
            </p>
          )}
          {modo === 'predisenada' && (
            <p className="text-sm text-ink-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
              Esta plantilla viene escrita siguiendo las normas de Meta{inicial?.automatizacion ? <> para la automatización <strong>{inicial.automatizacion}</strong></> : null}. Puedes cambiar el texto; los huecos son los datos que Respondi rellena solo.
            </p>
          )}

          {modo === 'nueva' ? (
            <div>
              <label htmlFor="pl-nombre" className="block text-sm font-600 text-ink-900 mb-1">Nombre</label>
              <input id="pl-nombre" value={nombre} onChange={e => setNombre(comoNombreDePlantilla(e.target.value))} placeholder="pedido_listo" required className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
              <p className="text-xs text-ink-500 mt-1">Solo lo ves tú. Minúsculas, números y guiones bajos.</p>
            </div>
          ) : (
            <div className="text-sm text-ink-600"><span className="font-600 text-ink-900">Nombre:</span> <span className="break-all">{inicial?.nombre}</span> · {IDIOMAS_PLANTILLA.find(i => i.codigo === idioma)?.nombre || idioma}</div>
          )}

          {modo === 'predisenada' ? (
            <p className="text-sm text-ink-600"><span className="font-600 text-ink-900">Tipo:</span> {ETIQUETA_CATEGORIA_PLANTILLA[categoria]}{categoria === 'marketing' ? ' (Meta la considera promoción: solo se manda a quien haya aceptado recibirlas)' : ''}</p>
          ) : (
            <fieldset>
              <legend className="block text-sm font-600 text-ink-900 mb-2">Tipo</legend>
              <div className="grid gap-2">
                {([
                  ['utilidad', 'Utilidad', 'Avisos sobre algo que el cliente ha pedido: un pedido listo, una cita, una reserva.'],
                  ['marketing', 'Marketing', 'Promociones y novedades. Meta las cobra más caras y el cliente puede darse de baja.']
                ] as const).map(([valor, tituloTipo, texto]) => (
                  <label key={valor} className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition ${categoria === valor ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" name="categoria" className="mt-1 accent-brand-600" checked={categoria === valor} onChange={() => setCategoria(valor)} />
                    <span><span className="block text-sm font-600 text-ink-900">{tituloTipo}</span><span className="block text-xs text-ink-500">{texto}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {modo === 'nueva' && (
            <div>
              <label htmlFor="pl-idioma" className="block text-sm font-600 text-ink-900 mb-1">Idioma</label>
              <select id="pl-idioma" value={idioma} onChange={e => setIdioma(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                {IDIOMAS_PLANTILLA.map(i => <option key={i.codigo} value={i.codigo}>{i.nombre}</option>)}
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="pl-texto" className="block text-sm font-600 text-ink-900">Texto</label>
              {(maxHuecos === null || huecos.length < maxHuecos) && (
                <button type="button" onClick={anadirHueco} className="text-xs font-600 text-brand-700 hover:text-brand-800">+ Añadir hueco</button>
              )}
            </div>
            <textarea id="pl-texto" value={contenido} onChange={e => setContenido(e.target.value)} rows={6} maxLength={1024} required placeholder="Hola {{1}}, tu pedido ya está listo para recoger en tienda." className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-y" />
            <p className="text-xs text-ink-500 mt-1">Los huecos ({'{{1}}'}, {'{{2}}'}…) son lo que cambia en cada envío. Se rellenan al enviarla.</p>
            {(problema || sobran) && <p className="text-xs text-rose-600 mt-1">{problema || sobran}</p>}
            {!problema && !sobran && sinCambios && contenido.trim() && <p className="text-xs text-amber-700 mt-1">No has cambiado el texto todavía.</p>}
          </div>

          {huecosNombres && huecosNombres.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-600 text-ink-700 mb-1.5">Qué va en cada hueco</p>
              <ul className="text-xs text-ink-600 space-y-0.5">
                {huecosNombres.map((h, i) => (
                  <li key={h + i} className={huecos.includes(i + 1) ? '' : 'text-ink-400'}>
                    <code className="px-1 rounded bg-slate-100 text-ink-800">{`{{${i + 1}}}`}</code> = {NOMBRE_HUECO[h] || h}{huecos.includes(i + 1) ? '' : ' · sin usar'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {huecos.length > 0 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-600 text-ink-900">Ejemplos para Meta</p>
                <p className="text-xs text-ink-500">Meta los usa para revisar la plantilla; no se envían a nadie.</p>
              </div>
              {huecos.map((n, i) => (
                <div key={n}>
                  <label htmlFor={`pl-ejemplo-${n}`} className="block text-xs font-600 text-ink-600 mb-1">{`{{${n}}}`}{huecosNombres?.[i] ? ` · ${NOMBRE_HUECO[huecosNombres[i]] || huecosNombres[i]}` : ''}</label>
                  <input id={`pl-ejemplo-${n}`} value={ejemplos[i] || ''} onChange={e => setEjemplos(v => huecos.map((_, j) => (j === i ? e.target.value : v[j] || '')))} placeholder={n === 1 ? 'Carmen' : ''} required className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
                </div>
              ))}
            </div>
          )}

          {contenido.trim() && (
            <div>
              <p className="text-xs font-600 text-ink-500 mb-1.5">Vista previa</p>
              <div className="rounded-2xl rounded-tr-sm bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-900 whitespace-pre-wrap break-words">
                {rellenar(contenido, ejemplos)}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
          <p className="text-xs text-ink-500">Al guardarla se envía a Meta para revisión, que suele tardar de unos minutos a un día. Meta cobra cada plantilla que se envía a un cliente.</p>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onCerrar} disabled={guardando} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={!puedeEnviar} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50">
            {guardando ? 'Enviando a Meta…' : 'Enviar a revisión'}
          </button>
        </div>
      </form>
    </div>
  )
}
