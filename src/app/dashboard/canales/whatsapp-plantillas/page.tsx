'use client'
import Loading from '@/components/Loading'
import { ErrorCarga } from '@/components/ui/ErrorCarga'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getPlantillasWhatsApp, crearPlantillaWhatsApp, sincronizarPlantillasWhatsApp, borrarPlantillaWhatsApp } from '@/app/actions/whatsapp-plantillas'
import { getMisPermisos } from '@/app/actions/permisos'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { ETIQUETA_ESTADO_PLANTILLA, ETIQUETA_CATEGORIA_PLANTILLA, huecosDe, problemaDelCuerpo, rellenar } from '@/lib/canales/plantillas-texto'

// Las plantillas son los mensajes que Meta aprueba de antemano: la única forma
// de escribir por WhatsApp a un cliente cuando han pasado más de 24 h desde su
// último mensaje. Se crean aquí (y se mandan a Meta a revisar) o directamente
// en Meta; "Actualizar desde Meta" trae las de allí y su estado.

const COLOR_ESTADO: Record<string, string> = {
  aprobada: 'bg-emerald-100 text-emerald-800',
  pendiente: 'bg-amber-100 text-amber-800',
  rechazada: 'bg-rose-100 text-rose-700',
  pausada: 'bg-orange-100 text-orange-800',
  desactivada: 'bg-slate-200 text-slate-700'
}

const IDIOMAS = [
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
function comoNombre(texto: string) {
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+/, '')
    .slice(0, 512)
}

export default function WhatsappPlantillasPage() {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [plantillas, setPlantillas] = useState<any[]>([])
  const [canal, setCanal] = useState<{ id: string; tieneCuenta: boolean } | null>(null)
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  const [actualizando, setActualizando] = useState(false)
  const [aBorrar, setABorrar] = useState<any>(null)
  const [borrando, setBorrando] = useState(false)

  const [formAbierto, setFormAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [formNombre, setFormNombre] = useState('')
  const [formCategoria, setFormCategoria] = useState<'utilidad' | 'marketing'>('utilidad')
  const [formIdioma, setFormIdioma] = useState('es_ES')
  const [formContenido, setFormContenido] = useState('')
  const [formEjemplos, setFormEjemplos] = useState<string[]>([])

  const puedeEditar = nivelPermiso === 'escritura'

  const cargar = async () => {
    const [res, permisosRes] = await Promise.all([getPlantillasWhatsApp(), getMisPermisos()])
    if (!res.success || !permisosRes.success) {
      setErrorCarga(true)
      return
    }
    setPlantillas((res as any).plantillas || [])
    setCanal((res as any).canal || null)
    if ((permisosRes as any).esAdmin) setNivelPermiso('escritura')
    else setNivelPermiso(((permisosRes as any).data || []).find((p: any) => p.seccion === 'canales')?.nivel || 'ninguno')
  }

  useEffect(() => {
    cargar().catch(() => setErrorCarga(true)).finally(() => setLoading(false))
  }, [])

  // Los huecos del texto que se está escribiendo y un ejemplo para cada uno
  const huecos = useMemo(() => huecosDe(formContenido), [formContenido])
  useEffect(() => {
    setFormEjemplos(prev => huecos.map((_, i) => prev[i] || ''))
  }, [huecos.length])
  const problema = formContenido.trim() ? problemaDelCuerpo(formContenido) : null

  const anadirHueco = () => {
    const siguiente = (huecos[huecos.length - 1] || 0) + 1
    setFormContenido(t => `${t}${t && !t.endsWith(' ') ? ' ' : ''}{{${siguiente}}}`)
  }

  const abrirFormulario = () => {
    setFormNombre('')
    setFormCategoria('utilidad')
    setFormIdioma('es_ES')
    setFormContenido('')
    setFormEjemplos([])
    setFormAbierto(true)
  }

  const actualizar = async () => {
    setActualizando(true)
    const r = await sincronizarPlantillasWhatsApp().catch(() => ({ success: false, error: 'No se ha podido conectar. Revisa la conexión.' }))
    if (r.success) {
      await cargar().catch(() => {})
      showToast('Lista al día con Meta', 'success')
    } else {
      showToast((r as any).error || 'No se ha podido actualizar', 'error')
    }
    setActualizando(false)
  }

  const crear = async (e: React.FormEvent) => {
    e.preventDefault()
    if (problema) return
    setGuardando(true)
    const r = await crearPlantillaWhatsApp({
      nombre: formNombre,
      contenido: formContenido,
      idioma: formIdioma,
      categoria: formCategoria,
      ejemplos: formEjemplos
    }).catch(() => ({ success: false, error: 'No se ha podido conectar. Revisa la conexión.' }))
    setGuardando(false)
    if (!r.success) {
      showToast((r as any).error || 'No se ha podido crear la plantilla', 'error')
      return
    }
    setFormAbierto(false)
    await cargar().catch(() => {})
    const cambiada = (r as any).categoriaCambiada
    showToast(cambiada
      ? `Enviada a Meta. Meta la ha clasificado como ${ETIQUETA_CATEGORIA_PLANTILLA[(r as any).plantilla?.categoria] || 'otra categoría'}.`
      : 'Enviada a Meta para revisión. Suele tardar unos minutos.', 'success')
  }

  const borrar = async () => {
    if (!aBorrar) return
    setBorrando(true)
    const r = await borrarPlantillaWhatsApp(aBorrar.id).catch(() => ({ success: false, error: 'No se ha podido conectar. Revisa la conexión.' }))
    setBorrando(false)
    if (r.success) {
      setPlantillas(prev => prev.filter(p => p.id !== aBorrar.id))
      showToast('Plantilla borrada', 'success')
      setABorrar(null)
    } else {
      showToast((r as any).error || 'No se ha podido borrar', 'error')
    }
  }

  if (errorCarga) return <ErrorCarga />
  if (loading || nivelPermiso === null) return <Loading />
  if (nivelPermiso === 'ninguno') {
    return <div className="p-10 text-center text-ink-500">No tienes acceso a esta sección.</div>
  }

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div className="min-w-0">
          <Link href="/dashboard/canales" className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-brand-600 transition mb-3">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Volver a Canales
          </Link>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Plantillas de WhatsApp</h1>
          <p className="text-ink-500 mt-1 max-w-2xl">Mensajes aprobados por Meta. Son la única forma de escribir a un cliente cuando han pasado más de 24 h desde su último mensaje.</p>
        </div>
        {canal?.tieneCuenta && (
          <div className="flex gap-2 shrink-0">
            <button onClick={actualizar} disabled={actualizando} className="px-4 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
              {actualizando ? 'Actualizando…' : 'Actualizar desde Meta'}
            </button>
            {puedeEditar && (
              <button onClick={abrirFormulario} className="px-5 h-11 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-600 shadow-lg shadow-brand-600/30 transition">
                Nueva plantilla
              </button>
            )}
          </div>
        )}
      </div>

      {!canal ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <p className="font-600 text-amber-900 mb-1">No hay un WhatsApp conectado con Meta en esta sucursal</p>
          <p className="text-sm text-amber-800 mb-4">Conéctalo primero en Canales; después podrás crear y usar plantillas.</p>
          <Link href="/dashboard/canales" className="inline-flex px-5 h-10 items-center rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-600 transition">Ir a Canales</Link>
        </div>
      ) : !canal.tieneCuenta ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <p className="font-600 text-amber-900 mb-1">Falta el identificador de tu cuenta de WhatsApp Business</p>
          <p className="text-sm text-amber-800 mb-4">Meta guarda las plantillas en esa cuenta. Añádelo en Canales → WhatsApp → Cambiar claves (está en tu app de Meta, junto al identificador del número).</p>
          <Link href="/dashboard/canales" className="inline-flex px-5 h-10 items-center rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-600 transition">Ir a Canales</Link>
        </div>
      ) : plantillas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <p className="font-600 text-ink-900 mb-1">Aún no hay plantillas</p>
          <p className="text-sm text-ink-500 max-w-md mx-auto">Crea la primera con «Nueva plantilla». Si ya tienes plantillas en tu cuenta de Meta, pulsa «Actualizar desde Meta» para traerlas.</p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {plantillas.map(p => (
            <li key={p.id} className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="font-600 text-ink-900 break-all">{p.nombre}</span>
                <span className="text-xs text-ink-400">{IDIOMAS.find(i => i.codigo === p.idioma)?.nombre || p.idioma}</span>
                <span className="text-[11px] font-600 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{ETIQUETA_CATEGORIA_PLANTILLA[p.categoria] || p.categoria}</span>
                <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full ${COLOR_ESTADO[p.estado] || COLOR_ESTADO.pendiente}`}>{ETIQUETA_ESTADO_PLANTILLA[p.estado] || p.estado}</span>
                {puedeEditar && (
                  <button onClick={() => setABorrar(p)} className="ml-auto text-xs font-600 text-ink-400 hover:text-rose-600 transition">Borrar</button>
                )}
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-ink-800 whitespace-pre-wrap break-words">
                {p.cabecera && <p className="font-600 mb-1">{p.cabecera}</p>}
                <p>{p.cuerpo}</p>
                {p.pie && <p className="text-xs text-ink-500 mt-2">{p.pie}</p>}
                {p.botones?.length > 0 && <p className="text-xs font-600 text-brand-700 mt-2">{p.botones.join(' · ')}</p>}
              </div>
              {p.estado === 'rechazada' && p.motivo_rechazo && (
                <p className="text-xs text-rose-600 mt-2">{p.motivo_rechazo}</p>
              )}
              {p.estado === 'aprobada' && !p.enviable && (
                <p className="text-xs text-ink-500 mt-2">No se puede enviar desde Respondi todavía: {p.motivoNoEnviable?.toLowerCase()}.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {formAbierto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={() => !guardando && setFormAbierto(false)}></div>
          <form onSubmit={crear} className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col" aria-labelledby="titulo-nueva-plantilla">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 id="titulo-nueva-plantilla" className="font-display font-700 text-lg text-ink-900">Nueva plantilla</h2>
              <button type="button" onClick={() => !guardando && setFormAbierto(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <label htmlFor="pl-nombre" className="block text-sm font-600 text-ink-900 mb-1">Nombre</label>
                <input id="pl-nombre" value={formNombre} onChange={e => setFormNombre(comoNombre(e.target.value))} placeholder="pedido_listo" required className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
                <p className="text-xs text-ink-500 mt-1">Solo lo ves tú. Minúsculas, números y guiones bajos.</p>
              </div>

              <fieldset>
                <legend className="block text-sm font-600 text-ink-900 mb-2">Tipo</legend>
                <div className="grid gap-2">
                  {([
                    ['utilidad', 'Utilidad', 'Avisos sobre algo que el cliente ha pedido: un pedido listo, una cita, una reserva.'],
                    ['marketing', 'Marketing', 'Promociones y novedades. Meta las cobra más caras y el cliente puede darse de baja.']
                  ] as const).map(([valor, titulo, texto]) => (
                    <label key={valor} className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition ${formCategoria === valor ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <input type="radio" name="categoria" className="mt-1 accent-brand-600" checked={formCategoria === valor} onChange={() => setFormCategoria(valor)} />
                      <span><span className="block text-sm font-600 text-ink-900">{titulo}</span><span className="block text-xs text-ink-500">{texto}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="pl-idioma" className="block text-sm font-600 text-ink-900 mb-1">Idioma</label>
                <select id="pl-idioma" value={formIdioma} onChange={e => setFormIdioma(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                  {IDIOMAS.map(i => <option key={i.codigo} value={i.codigo}>{i.nombre}</option>)}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="pl-texto" className="block text-sm font-600 text-ink-900">Texto</label>
                  <button type="button" onClick={anadirHueco} className="text-xs font-600 text-brand-700 hover:text-brand-800">+ Añadir hueco</button>
                </div>
                <textarea id="pl-texto" value={formContenido} onChange={e => setFormContenido(e.target.value)} rows={5} maxLength={1024} required placeholder="Hola {{1}}, tu pedido ya está listo para recoger en tienda." className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-y" />
                <p className="text-xs text-ink-500 mt-1">Los huecos ({'{{1}}'}, {'{{2}}'}…) son lo que cambia en cada envío, como el nombre del cliente o el número de pedido. Se rellenan al enviarla.</p>
                {problema && <p className="text-xs text-rose-600 mt-1">{problema}</p>}
              </div>

              {huecos.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-600 text-ink-900">Ejemplos para Meta</p>
                    <p className="text-xs text-ink-500">Meta los usa para revisar la plantilla; no se envían a nadie.</p>
                  </div>
                  {huecos.map((n, i) => (
                    <div key={n}>
                      <label htmlFor={`pl-ejemplo-${n}`} className="block text-xs font-600 text-ink-600 mb-1">{`{{${n}}}`}</label>
                      <input id={`pl-ejemplo-${n}`} value={formEjemplos[i] || ''} onChange={e => setFormEjemplos(v => huecos.map((_, j) => (j === i ? e.target.value : v[j] || '')))} placeholder={n === 1 ? 'Carmen' : ''} required className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" />
                    </div>
                  ))}
                </div>
              )}

              {formContenido.trim() && (
                <div>
                  <p className="text-xs font-600 text-ink-500 mb-1.5">Vista previa</p>
                  <div className="rounded-2xl rounded-tr-sm bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-900 whitespace-pre-wrap break-words">
                    {rellenar(formContenido, formEjemplos)}
                  </div>
                </div>
              )}

              <p className="text-xs text-ink-500">Al guardarla se envía a Meta para revisión, que suele tardar unos minutos. Meta cobra cada plantilla que se envía a un cliente.</p>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button type="button" onClick={() => setFormAbierto(false)} disabled={guardando} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">Cancelar</button>
              <button type="submit" disabled={guardando || !!problema || !formNombre || !formContenido.trim()} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50">
                {guardando ? 'Enviando a Meta…' : 'Enviar a revisión'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        isOpen={!!aBorrar}
        onClose={() => !borrando && setABorrar(null)}
        onConfirm={borrar}
        title="Borrar plantilla"
        message={`¿Borrar la plantilla "${aBorrar?.nombre || ''}"? Se borra también en Meta y no se puede deshacer.`}
        confirmText="Sí, borrar"
        cancelText="Cancelar"
        type="danger"
        isLoading={borrando}
      />
    </div>
  )
}
