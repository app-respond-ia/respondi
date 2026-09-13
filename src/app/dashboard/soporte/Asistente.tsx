'use client'

import { useState, useEffect, useRef } from 'react'
import { preguntarAsistente, confirmarAccionAsistente, rechazarAccionAsistente, getConversacionesAsistente, getConversacionAsistente, borrarConversacionAsistente } from '@/app/actions/asistente'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

// EL ASISTENTE DEL PANEL. Un chat normal, con una diferencia: cuando el
// asistente va a cambiar algo, no lo hace. Enseña una tarjeta y espera.

type Mensaje = { id: string; papel: 'usuario' | 'asistente'; contenido: string }
type Accion = { id: string; mensaje_id?: string | null; herramienta: string; resumen: string; estado: string; destructiva: boolean; error?: string | null }

const EJEMPLOS = [
  'Créame una etiqueta para las devoluciones',
  '¿Qué automatizaciones tengo encendidas?',
  'Los lunes abrimos de 9 a 14 y de 16 a 20',
  'Sube el corte de pelo a 15 euros'
]

export default function Asistente() {
  const { showToast } = useToast()
  const [conversacionId, setConversacionId] = useState<string | null>(null)
  const [conversaciones, setConversaciones] = useState<any[]>([])
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [acciones, setAcciones] = useState<Accion[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [ejecutando, setEjecutando] = useState<string | null>(null)
  const [aBorrar, setABorrar] = useState<Accion | null>(null)
  const finRef = useRef<HTMLDivElement>(null)

  const cargarConversaciones = async () => {
    const r = await getConversacionesAsistente()
    if (r.success) setConversaciones(r.data || [])
  }

  useEffect(() => { cargarConversaciones() }, [])
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, pensando])

  async function abrir(id: string) {
    const r = await getConversacionAsistente(id)
    if (!r.success) { showToast(r.error || 'No se ha podido abrir', 'error'); return }
    setConversacionId(id)
    setMensajes((r.data?.mensajes || []) as Mensaje[])
    setAcciones((r.data?.acciones || []) as Accion[])
  }

  function nueva() {
    setConversacionId(null); setMensajes([]); setAcciones([]); setTexto('')
  }

  async function enviar(e?: React.FormEvent, sugerencia?: string) {
    e?.preventDefault()
    const mensaje = (sugerencia ?? texto).trim()
    if (!mensaje || pensando) return
    setTexto('')
    setMensajes(prev => [...prev, { id: `tmp-${Date.now()}`, papel: 'usuario', contenido: mensaje }])
    setPensando(true)

    const r = await preguntarAsistente({ conversacion_id: conversacionId, mensaje })
    setPensando(false)

    if (!r.success) {
      showToast(r.error || 'No se ha podido enviar', 'error')
      return
    }
    setConversacionId(r.data!.conversacion_id)
    setMensajes(prev => [...prev, { id: `ia-${Date.now()}`, papel: 'asistente', contenido: r.data!.texto }])
    if (r.data!.acciones?.length) setAcciones(prev => [...prev, ...(r.data!.acciones as Accion[])])
    cargarConversaciones()
  }

  async function confirmar(accion: Accion) {
    setEjecutando(accion.id)
    const r = await confirmarAccionAsistente(accion.id)
    setEjecutando(null)
    if (r.success) {
      setAcciones(prev => prev.map(a => a.id === accion.id ? { ...a, estado: 'hecha' } : a))
      showToast((r as any).data?.mensaje || 'Hecho', 'success')
    } else {
      setAcciones(prev => prev.map(a => a.id === accion.id ? { ...a, estado: 'fallida', error: r.error } : a))
      showToast(r.error || 'No se ha podido hacer', 'error')
    }
  }

  async function rechazar(accion: Accion) {
    const r = await rechazarAccionAsistente(accion.id)
    if (r.success) setAcciones(prev => prev.map(a => a.id === accion.id ? { ...a, estado: 'rechazada' } : a))
  }

  async function borrarConversacion(id: string) {
    const r = await borrarConversacionAsistente(id)
    if (r.success) {
      if (id === conversacionId) nueva()
      cargarConversaciones()
    }
  }

  const pendientes = acciones.filter(a => a.estado === 'propuesta')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
      {/* Conversaciones anteriores */}
      <aside className="hidden lg:block">
        <button onClick={nueva} className="w-full h-10 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-600 transition mb-3">
          Nueva consulta
        </button>
        <div className="space-y-1">
          {conversaciones.map(c => (
            <div key={c.id} className={`group flex items-center gap-1 rounded-lg transition ${c.id === conversacionId ? 'bg-brand-50' : 'hover:bg-slate-100'}`}>
              <button onClick={() => abrir(c.id)} className="flex-1 min-w-0 text-left px-3 py-2">
                <span className={`block truncate text-sm ${c.id === conversacionId ? 'text-brand-700 font-600' : 'text-ink-600'}`}>{c.titulo || 'Consulta'}</span>
              </button>
              <button onClick={() => borrarConversacion(c.id)} title="Borrar" className="opacity-0 group-hover:opacity-100 px-2 text-ink-300 hover:text-red-500 transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* El chat */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-[60vh]">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-h-[60vh]">
          {mensajes.length === 0 && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
              </div>
              <h3 className="font-display font-700 text-lg text-ink-900">¿Qué necesitas?</h3>
              <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">
                Pregúntame cómo funciona algo o pídeme que lo cambie. Si es un cambio, te lo enseño antes y no lo hago hasta que lo confirmes.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-5">
                {EJEMPLOS.map(x => (
                  <button key={x} onClick={() => enviar(undefined, x)} className="px-3 py-1.5 rounded-full border border-slate-200 text-xs text-ink-600 hover:border-brand-300 hover:text-brand-700 transition">
                    {x}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensajes.map(m => (
            <div key={m.id}>
              <div className={`flex ${m.papel === 'usuario' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.papel === 'usuario' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-ink-800'}`}>
                  {m.contenido}
                </div>
              </div>
              {/* Las propuestas que colgaban de este mensaje */}
              {acciones.filter(a => a.mensaje_id === m.id).map(a => (
                <TarjetaAccion key={a.id} accion={a} ejecutando={ejecutando === a.id} onConfirmar={() => a.destructiva ? setABorrar(a) : confirmar(a)} onRechazar={() => rechazar(a)} />
              ))}
            </div>
          ))}

          {/* Las recién creadas todavía no cuelgan de ningún mensaje cargado */}
          {acciones.filter(a => !a.mensaje_id || !mensajes.some(m => m.id === a.mensaje_id)).map(a => (
            <TarjetaAccion key={a.id} accion={a} ejecutando={ejecutando === a.id} onConfirmar={() => a.destructiva ? setABorrar(a) : confirmar(a)} onRechazar={() => rechazar(a)} />
          ))}

          {pensando && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-2xl px-4 py-3 flex gap-1.5">
                {[0, 150, 300].map(d => <span key={d} className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            </div>
          )}
          <div ref={finRef} />
        </div>

        <form onSubmit={enviar} className="border-t border-slate-100 p-3 sm:p-4 flex gap-2 items-end">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
            rows={1}
            placeholder={pendientes.length ? 'Tienes algo esperando tu confirmación arriba…' : 'Escribe lo que necesitas…'}
            className="flex-1 resize-none px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-ink-900 focus:ring-4 focus:ring-brand-100 focus:border-brand-500 outline-none transition max-h-32"
          />
          <button type="submit" disabled={pensando || !texto.trim()} className="h-11 px-5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-600 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            Enviar
          </button>
        </form>
      </div>

      <ConfirmModal
        isOpen={!!aBorrar}
        title="Confirmar el cambio"
        message={aBorrar?.resumen || ''}
        confirmText="Sí, hazlo"
        type="danger"
        isLoading={!!ejecutando}
        onConfirm={async () => { const a = aBorrar; setABorrar(null); if (a) await confirmar(a) }}
        onClose={() => setABorrar(null)}
      />
    </div>
  )
}

function TarjetaAccion({ accion, ejecutando, onConfirmar, onRechazar }: { accion: Accion; ejecutando: boolean; onConfirmar: () => void; onRechazar: () => void }) {
  const hecha = accion.estado === 'hecha'
  const fallida = accion.estado === 'fallida'
  const rechazada = accion.estado === 'rechazada'
  const caducada = accion.estado === 'caducada'
  const pendiente = accion.estado === 'propuesta'

  const borde = hecha ? 'border-emerald-200 bg-emerald-50/60'
    : fallida ? 'border-red-200 bg-red-50/60'
    : rechazada || caducada ? 'border-slate-200 bg-slate-50'
    : accion.destructiva ? 'border-amber-300 bg-amber-50/70' : 'border-brand-200 bg-brand-50/50'

  return (
    <div className={`mt-2 ml-0 sm:ml-2 max-w-[85%] rounded-xl border p-3.5 ${borde}`}>
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-700 uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/70 border border-current/10 text-ink-500 shrink-0 mt-0.5">
          {hecha ? 'Hecho' : fallida ? 'No se pudo' : rechazada ? 'Descartado' : caducada ? 'Caducado' : accion.destructiva ? 'Cuidado' : 'Por confirmar'}
        </span>
        <p className="text-sm text-ink-800 whitespace-pre-wrap flex-1">{accion.resumen}</p>
      </div>

      {fallida && accion.error && <p className="text-xs text-red-700 mt-2">{accion.error}</p>}

      {pendiente && (
        <div className="flex gap-2 mt-3">
          <button onClick={onConfirmar} disabled={ejecutando}
            className={`h-9 px-4 rounded-lg text-white text-sm font-600 transition disabled:opacity-50 ${accion.destructiva ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-500 hover:bg-brand-600'}`}>
            {ejecutando ? 'Haciéndolo…' : 'Confirmar'}
          </button>
          <button onClick={onRechazar} disabled={ejecutando} className="h-9 px-4 rounded-lg text-sm font-600 text-ink-600 hover:bg-white/70 transition">
            Descartar
          </button>
        </div>
      )}
    </div>
  )
}
