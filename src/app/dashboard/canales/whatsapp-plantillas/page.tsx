'use client'
import Loading from '@/components/Loading'
import { PAGINA } from '@/lib/ui'
import { ErrorCarga } from '@/components/ui/ErrorCarga'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getPlantillasWhatsApp, crearPlantillaWhatsApp, editarPlantillaWhatsApp, usarVersionPlantilla, sincronizarPlantillasWhatsApp, borrarPlantillaWhatsApp, guardarPlantillaReapertura } from '@/app/actions/whatsapp-plantillas'
import { enviarPlantillaPredisenada } from '@/app/actions/automatizaciones'
import { getMisPermisos } from '@/app/actions/permisos'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { ETIQUETA_ESTADO_PLANTILLA, ETIQUETA_CATEGORIA_PLANTILLA, NOMBRE_ARCHIVO_CABECERA, NOMBRE_HUECO } from '@/lib/canales/plantillas-texto'
import { EditorPlantilla, IDIOMAS_PLANTILLA, type DatosEditor } from '@/components/plantillas/EditorPlantilla'

// Las plantillas son los mensajes que Meta aprueba de antemano: la única forma
// de escribir por WhatsApp a un cliente cuando han pasado más de 24 h desde su
// último mensaje. Se crean aquí (y se mandan a Meta a revisar) o directamente
// en Meta; "Actualizar desde Meta" trae las de allí y su estado.
//
// Cada plantilla tiene VERSIONES: editarla crea una nueva que va a Meta a
// revisión; mientras tanto se sigue usando la de siempre, y desde el
// historial se puede volver a cualquier versión aprobada.

const COLOR_ESTADO: Record<string, string> = {
  aprobada: 'bg-emerald-100 text-emerald-800',
  pendiente: 'bg-amber-100 text-amber-800',
  rechazada: 'bg-rose-100 text-rose-700',
  pausada: 'bg-orange-100 text-orange-800',
  desactivada: 'bg-slate-200 text-slate-700',
  borrada: 'bg-slate-100 text-slate-500'
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

type Editor =
  | { modo: 'nueva' }
  | { modo: 'editar'; plantilla: any }
  | { modo: 'predisenada'; predisenada: any }

export default function WhatsappPlantillasPage() {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  const [familias, setFamilias] = useState<any[]>([])
  const [predisenadas, setPredisenadas] = useState<any[]>([])
  const [canal, setCanal] = useState<{ id: string; tieneCuenta: boolean; plantillaReaperturaId: string | null } | null>(null)
  const [guardandoReapertura, setGuardandoReapertura] = useState(false)
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  const [actualizando, setActualizando] = useState(false)
  const [aBorrar, setABorrar] = useState<any>(null)
  const [borrando, setBorrando] = useState(false)
  const [historialAbierto, setHistorialAbierto] = useState<Record<string, boolean>>({})
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)

  const puedeEditar = nivelPermiso === 'escritura'

  const cargar = async () => {
    const [res, permisosRes] = await Promise.all([getPlantillasWhatsApp(), getMisPermisos()])
    if (!res.success || !permisosRes.success) {
      setErrorCarga(true)
      return
    }
    setFamilias((res as any).familias || [])
    setPredisenadas((res as any).predisenadas || [])
    setCanal((res as any).canal || null)
    if ((permisosRes as any).esAdmin) setNivelPermiso('escritura')
    else setNivelPermiso(((permisosRes as any).data || []).find((p: any) => p.seccion === 'canales')?.nivel || 'ninguno')
  }

  useEffect(() => {
    cargar().catch(() => setErrorCarga(true)).finally(() => setLoading(false))
  }, [])

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

  // Lo que hace el editor al guardar, según para qué se abrió
  const guardarDesdeEditor = async (d: DatosEditor): Promise<{ success: boolean; error?: string }> => {
    if (!editor) return { success: false }
    let r: any
    if (editor.modo === 'nueva') {
      r = await crearPlantillaWhatsApp({ nombre: d.nombre, contenido: d.contenido, idioma: d.idioma, categoria: d.categoria, ejemplos: d.ejemplos })
    } else if (editor.modo === 'editar') {
      r = await editarPlantillaWhatsApp({ id: editor.plantilla.id, contenido: d.contenido, ejemplos: d.ejemplos, categoria: d.categoria })
    } else {
      r = await enviarPlantillaPredisenada(editor.predisenada.clave, { contenido: d.contenido, ejemplos: d.ejemplos })
    }
    if (!r?.success) return { success: false, error: r?.error }
    setEditor(null)
    await cargar().catch(() => {})
    const cambiada = r.categoriaCambiada
    if (editor.modo === 'editar' && r.sigueEnUso) showToast('Versión nueva enviada a Meta. Hasta que la aprueben se sigue usando la de ahora.', 'success')
    else if (editor.modo === 'predisenada' && r.data?.sigueEnUso) showToast('Enviada a Meta. Hasta que la aprueben se sigue usando la versión anterior.', 'success')
    else showToast(cambiada
      ? `Enviada a Meta. Meta la ha clasificado como ${ETIQUETA_CATEGORIA_PLANTILLA[r.plantilla?.categoria] || 'otra categoría'}.`
      : 'Enviada a Meta para revisión. Suele tardar unos minutos.', 'success')
    return { success: true }
  }

  const enviarPredisenadaTalCual = async (p: any) => {
    setOcupada(p.nombre)
    const r = await enviarPlantillaPredisenada(p.clave).catch(() => ({ success: false, error: 'No se ha podido conectar. Revisa la conexión.' }))
    setOcupada(null)
    if (r.success) {
      await cargar().catch(() => {})
      showToast('Enviada a Meta para revisión. Cuando la apruebe, la automatización la usará sola.', 'success')
    } else {
      showToast((r as any).error || 'No se ha podido enviar', 'error')
    }
  }

  const usarVersion = async (v: any) => {
    setOcupada(v.id)
    const r = await usarVersionPlantilla(v.id).catch(() => ({ success: false, error: 'No se ha podido conectar. Revisa la conexión.' }))
    setOcupada(null)
    if (r.success) {
      await cargar().catch(() => {})
      showToast(v.estado === 'aprobada' ? `Versión ${v.version} en uso` : 'Texto enviado otra vez a Meta como versión nueva', 'success')
    } else {
      showToast((r as any).error || 'No se ha podido cambiar la versión', 'error')
    }
  }

  const borrar = async () => {
    if (!aBorrar) return
    setBorrando(true)
    const r = await borrarPlantillaWhatsApp(aBorrar.id).catch(() => ({ success: false, error: 'No se ha podido conectar. Revisa la conexión.' }))
    setBorrando(false)
    if (r.success) {
      await cargar().catch(() => {})
      showToast('Plantilla borrada', 'success')
      setABorrar(null)
    } else {
      showToast((r as any).error || 'No se ha podido borrar', 'error')
    }
  }

  const cambiarReapertura = async (id: string) => {
    setGuardandoReapertura(true)
    const r = await guardarPlantillaReapertura(id || null).catch(() => ({ success: false, error: 'No se ha podido conectar. Revisa la conexión.' }))
    setGuardandoReapertura(false)
    if (r.success) {
      setCanal(c => c ? { ...c, plantillaReaperturaId: id || null } : c)
      showToast(id ? 'Plantilla de reapertura guardada' : 'Sin plantilla de reapertura', 'success')
    } else {
      showToast((r as any).error || 'No se ha podido guardar', 'error')
    }
  }

  // Las que valen para reabrir: la versión en uso, aprobada, enviable sola y con como mucho un hueco
  const enviables = familias.map(f => (f.enUso && f.enUso.estado === 'aprobada' ? f.enUso : f.versiones.find((v: any) => v.estado === 'aprobada' && v.meta_template_id)) || null).filter(Boolean)
  const paraReabrir = enviables.filter((p: any) => p.automatica && (p.huecos?.length || 0) <= 1)
  // La reapertura guarda una versión concreta: se enseña como elegida su familia
  const reaperturaElegida = familias.find(f => f.versiones.some((v: any) => v.id === canal?.plantillaReaperturaId))
  const valorReapertura = paraReabrir.find((p: any) => reaperturaElegida && p.familia === reaperturaElegida.familia && p.idioma === reaperturaElegida.idioma)?.id || ''

  if (errorCarga) return <ErrorCarga />
  if (loading || nivelPermiso === null) return <Loading />
  if (nivelPermiso === 'ninguno') {
    return <div className="p-10 text-center text-ink-500">No tienes acceso a esta sección.</div>
  }

  return (
    <div className={PAGINA}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div className="min-w-0">
          <Link href="/dashboard/canales" className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-brand-600 transition mb-3">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Volver a Canales
          </Link>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Plantillas de WhatsApp</h1>
          <p className="text-ink-500 mt-1 max-w-2xl">Mensajes aprobados por Meta. Son la única forma de escribir a un cliente cuando han pasado más de 24 h desde su último mensaje. Puedes editar cualquiera: la versión nueva va a Meta y, hasta que la apruebe, se sigue usando la de ahora.</p>
        </div>
        {canal?.tieneCuenta && (
          <div className="flex gap-2 shrink-0">
            <button onClick={actualizar} disabled={actualizando} className="px-4 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
              {actualizando ? 'Actualizando…' : 'Actualizar desde Meta'}
            </button>
            {puedeEditar && (
              <button onClick={() => setEditor({ modo: 'nueva' })} className="px-5 h-11 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-600 shadow-lg shadow-brand-600/30 transition">
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
      ) : (
        <>
        <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
          <p className="font-600 text-ink-900">Cuando abres y han pasado más de 24 h</p>
          <p className="text-sm text-ink-500 mt-1 mb-3 max-w-3xl">
            Si un cliente escribe con el negocio cerrado y abrís más de 24 h después (por ejemplo, tras un fin de semana), WhatsApp no deja contestarle con un mensaje normal. Elige una plantilla y la IA se la mandará al abrir, sin gastar crédito; cuando el cliente conteste, la IA le atenderá con normalidad. Sin plantilla, esas conversaciones quedan para tu equipo.
          </p>
          <select
            id="plantilla-reapertura"
            value={valorReapertura}
            onChange={e => cambiarReapertura(e.target.value)}
            disabled={!puedeEditar || guardandoReapertura}
            className="w-full sm:w-96 h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:opacity-60"
          >
            <option value="">Ninguna (queda para el equipo)</option>
            {paraReabrir.map((p: any) => <option key={p.id} value={p.id}>{p.familia} · {p.idioma}</option>)}
          </select>
          <p className="text-xs text-ink-400 mt-2">Valen las plantillas aprobadas sin huecos o con uno solo ({'{{1}}'}), que se rellena con el nombre del cliente. Si la editas, se usará la versión nueva en cuanto Meta la apruebe.</p>
        </section>

        <h2 className="font-display font-700 text-lg text-ink-900 mb-3">Tus plantillas</h2>
        {familias.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center mb-8">
            <p className="font-600 text-ink-900 mb-1">Aún no hay plantillas</p>
            <p className="text-sm text-ink-500 max-w-md mx-auto">Crea la primera con «Nueva plantilla», envía una de las que vienen hechas (más abajo) o, si ya tienes plantillas en tu cuenta de Meta, pulsa «Actualizar desde Meta» para traerlas.</p>
          </div>
        ) : (
          <ul className="grid gap-4 mb-8">
            {familias.map(f => {
              const p = f.principal
              const clave = `${f.familia}|${f.idioma}`
              const abierto = !!historialAbierto[clave]
              const soloTexto = !p.archivoCabecera && !p.cabeceraTexto && !p.pie && !(p.botones?.length)
              return (
                <li key={clave} className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="font-600 text-ink-900 break-all">{f.familia}</span>
                    <span className="text-xs text-ink-400">{IDIOMAS_PLANTILLA.find(i => i.codigo === f.idioma)?.nombre || f.idioma}</span>
                    <span className="text-[11px] font-600 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{ETIQUETA_CATEGORIA_PLANTILLA[p.categoria] || p.categoria}</span>
                    <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full ${COLOR_ESTADO[p.estado] || COLOR_ESTADO.pendiente}`}>{ETIQUETA_ESTADO_PLANTILLA[p.estado] || p.estado}</span>
                    {f.versiones.length > 1 && <span className="text-[11px] font-600 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">Versión {p.version}{p.en_uso ? ' en uso' : ''}</span>}
                    {f.pendiente && <span className="text-[11px] font-600 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Versión {f.pendiente.version} en revisión</span>}
                    {puedeEditar && (
                      <div className="ml-auto flex items-center gap-3">
                        {soloTexto && p.categoria !== 'autenticacion' && (
                          <button onClick={() => setEditor({ modo: 'editar', plantilla: p })} className="text-xs font-600 text-brand-700 hover:text-brand-800 transition">Editar</button>
                        )}
                        {f.versiones.length === 1 && (
                          <button onClick={() => setABorrar(p)} className="text-xs font-600 text-ink-400 hover:text-rose-600 transition">Borrar</button>
                        )}
                      </div>
                    )}
                  </div>
                  {f.predisenada && <p className="text-xs text-ink-500 mb-2">Plantilla de Respondi para la automatización «{f.predisenada.automatizacion}»{p.origen === 'predisenada' && p.version > 1 ? ', editada por ti' : ''}.</p>}
                  <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-ink-800 whitespace-pre-wrap break-words">
                    {p.cabecera && <p className="font-600 mb-1">{p.cabecera}</p>}
                    <p>{p.cuerpo}</p>
                    {p.pie && <p className="text-xs text-ink-500 mt-2">{p.pie}</p>}
                    {p.botonesTexto?.length > 0 && <p className="text-xs font-600 text-brand-700 mt-2">{p.botonesTexto.join(' · ')}</p>}
                    {p.estado === 'aprobada' && p.enviable && (p.archivoCabecera || p.huecosCabecera?.length || p.botones?.some((b: any) => b.necesitaValor)) && (
                      <p className="text-xs text-ink-500 mt-2">
                        Al enviarla desde Chats se te pedirá{' '}
                        {[p.archivoCabecera ? `la ${NOMBRE_ARCHIVO_CABECERA[p.archivoCabecera]} de la cabecera` : null,
                          p.huecosCabecera?.length ? 'el hueco de la cabecera' : null,
                          p.botones?.some((b: any) => b.necesitaValor) ? 'lo que llevan los botones' : null].filter(Boolean).join(', ')}.
                      </p>
                    )}
                  </div>
                  {Array.isArray(p.huecos) && p.huecos.length > 0 && (
                    <p className="text-xs text-ink-400 mt-2">{p.huecos.map((h: string, i: number) => `{{${i + 1}}} = ${NOMBRE_HUECO[h] || h}`).join(' · ')}</p>
                  )}
                  {p.estado === 'rechazada' && p.motivo_rechazo && (
                    <p className="text-xs text-rose-600 mt-2">{p.motivo_rechazo}</p>
                  )}
                  {p.estado === 'aprobada' && !p.enviable && (
                    <p className="text-xs text-ink-500 mt-2">No se puede enviar desde Respondi todavía: {p.motivoNoEnviable?.toLowerCase()}.</p>
                  )}
                  {!soloTexto && puedeEditar && (
                    <p className="text-xs text-ink-400 mt-2">Lleva cabecera, pie o botones: se edita en Meta y luego «Actualizar desde Meta».</p>
                  )}

                  {f.versiones.length > 1 && (
                    <div className="mt-3">
                      <button onClick={() => setHistorialAbierto(h => ({ ...h, [clave]: !abierto }))} className="text-xs font-600 text-ink-600 hover:text-ink-900 transition">
                        {abierto ? 'Ocultar el historial' : `Historial (${f.versiones.length} versiones)`}
                      </button>
                      {abierto && (
                        <ol className="mt-2 divide-y divide-slate-100 border border-slate-200 rounded-xl">
                          {f.versiones.map((v: any) => (
                            <li key={v.id} className={`p-3 ${v.en_uso ? 'bg-brand-50/40' : ''}`}>
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-sm font-600 text-ink-900">Versión {v.version}</span>
                                <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full ${COLOR_ESTADO[v.estado] || COLOR_ESTADO.pendiente}`}>{ETIQUETA_ESTADO_PLANTILLA[v.estado] || v.estado}</span>
                                {v.en_uso && <span className="text-[11px] font-600 px-2 py-0.5 rounded-full bg-brand-100 text-brand-800">En uso</span>}
                                {v.activar_al_aprobar && !v.en_uso && v.estado === 'pendiente' && <span className="text-[11px] text-ink-500">Se usará en cuanto Meta la apruebe</span>}
                                <span className="text-xs text-ink-400">{fecha(v.created_at)}</span>
                                {puedeEditar && (
                                  <div className="ml-auto flex items-center gap-3">
                                    {!v.en_uso && v.estado === 'aprobada' && v.meta_template_id && (
                                      <button onClick={() => usarVersion(v)} disabled={ocupada === v.id} className="text-xs font-600 text-brand-700 hover:text-brand-800 transition disabled:opacity-50">{ocupada === v.id ? 'Cambiando…' : 'Usar esta versión'}</button>
                                    )}
                                    {!v.en_uso && (v.estado === 'borrada' || v.estado === 'rechazada') && (
                                      <button onClick={() => usarVersion(v)} disabled={ocupada === v.id} className="text-xs font-600 text-brand-700 hover:text-brand-800 transition disabled:opacity-50">{ocupada === v.id ? 'Enviando…' : 'Volver a enviar a Meta'}</button>
                                    )}
                                    {!v.en_uso && (
                                      <button onClick={() => setABorrar(v)} className="text-xs font-600 text-ink-400 hover:text-rose-600 transition">Borrar</button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <p className="text-sm text-ink-700 whitespace-pre-wrap break-words">{v.cuerpo}</p>
                              {v.estado === 'rechazada' && v.motivo_rechazo && <p className="text-xs text-rose-600 mt-1">{v.motivo_rechazo}</p>}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {predisenadas.length > 0 && (
          <section className="mb-8">
            <h2 className="font-display font-700 text-lg text-ink-900">Plantillas que Respondi trae hechas</h2>
            <p className="text-sm text-ink-500 mt-1 mb-3 max-w-3xl">Una por cada automatización que escribe al cliente, escritas para que Meta las apruebe. Envíalas tal cual o cambia el texto antes; también las puedes editar después de aprobadas.</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {predisenadas.map(p => (
                <li key={p.nombre} className="bg-white border border-dashed border-slate-300 rounded-2xl p-4 flex flex-col">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-600 text-ink-900 text-sm">{p.automatizacion}</span>
                    <span className="text-[11px] font-600 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{ETIQUETA_CATEGORIA_PLANTILLA[p.categoria] || p.categoria}</span>
                  </div>
                  <p className="text-xs text-ink-400 mb-2 break-all">{p.nombre}</p>
                  <div className="bg-[#e7ffdb] rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-ink-800 shadow-sm whitespace-pre-wrap break-words">{p.ejemplo}</div>
                  {puedeEditar && (
                    <div className="flex items-center gap-3 flex-wrap mt-3">
                      <button onClick={() => enviarPredisenadaTalCual(p)} disabled={ocupada === p.nombre} className="px-4 h-9 rounded-xl bg-ink-900 text-white text-sm font-600 transition hover:bg-ink-800 disabled:opacity-50">{ocupada === p.nombre ? 'Enviando…' : 'Enviar a Meta'}</button>
                      <button onClick={() => setEditor({ modo: 'predisenada', predisenada: p })} className="text-sm font-600 text-brand-700 hover:text-brand-800 transition">Editar el texto antes</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        </>
      )}

      {editor && (
        <EditorPlantilla
          modo={editor.modo}
          inicial={editor.modo === 'nueva' ? undefined : editor.modo === 'editar'
            ? { nombre: editor.plantilla.familia, categoria: editor.plantilla.categoria === 'marketing' ? 'marketing' : 'utilidad', idioma: editor.plantilla.idioma, contenido: editor.plantilla.cuerpo, ejemplos: Array.isArray(editor.plantilla.ejemplos) ? editor.plantilla.ejemplos : [], version: editor.plantilla.version, automatizacion: familias.find(f => f.familia === editor.plantilla.familia)?.predisenada?.automatizacion }
            : { nombre: editor.predisenada.nombre, categoria: editor.predisenada.categoria, idioma: editor.predisenada.idioma, contenido: editor.predisenada.cuerpo, ejemplos: editor.predisenada.ejemplos, automatizacion: editor.predisenada.automatizacion }}
          huecosNombres={editor.modo === 'editar'
            ? (Array.isArray(editor.plantilla.huecos) && editor.plantilla.huecos.length ? editor.plantilla.huecos : (familias.find(f => f.familia === editor.plantilla.familia)?.predisenada?.huecos || null))
            : editor.modo === 'predisenada' ? editor.predisenada.huecos : null}
          onGuardar={guardarDesdeEditor}
          onCerrar={() => setEditor(null)}
        />
      )}

      <ConfirmModal
        isOpen={!!aBorrar}
        onClose={() => !borrando && setABorrar(null)}
        onConfirm={borrar}
        title="Borrar plantilla"
        message={`¿Borrar «${aBorrar?.nombre || ''}»${aBorrar?.version > 1 ? ` (versión ${aBorrar.version})` : ''}? Se borra también en Meta y no se puede deshacer.`}
        confirmText="Sí, borrar"
        cancelText="Cancelar"
        type="danger"
        isLoading={borrando}
      />
    </div>
  )
}
