'use client'
import Loading from '@/components/Loading'
import { ErrorCarga } from '@/components/ui/ErrorCarga'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { HelpPopover } from '@/components/ui/HelpPopover'
import { MessageBubble } from '@/components/ui/MessageBubble'
import { NotesSection } from '@/components/ui/NotesSection'
import { ActivityLog } from '@/components/ui/ActivityLog'
import { AIToggle } from '@/components/ui/AIToggle'
import { getHiloCliente, pausarIA, reanudarIA } from '@/app/actions/conversaciones'
import { getMensajes } from '@/app/actions/chats'
import { getAgentesParaCasos, crearCasoDesdeConversacion } from '@/app/actions/casos'
import { useToast } from '@/components/ui/Toast'
import { getLogsAuditoria } from '@/app/actions/audit-log'
import { getMisPermisos } from '@/app/actions/permisos'
import { createClient } from '@/utils/supabase/client'
import { EtiquetaPill } from '@/components/ui/EtiquetaPill'
import { nombreCanal } from '@/lib/canales/nombres'

// La ficha de un cliente: todas sus conversaciones con esta sucursal en un
// solo hilo, de la más antigua (arriba) a la más reciente (abajo), como un
// WhatsApp largo. Las anteriores salen plegadas en su resumen y se despliegan
// con un clic; la conversación desde la que se ha llegado sale desplegada.
// Para atender en vivo está Chats: aquí se consulta.

const ETIQUETA_CASO: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: 'Caso en cola', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  atendiendo: { texto: 'Caso en curso', clase: 'bg-blue-50 text-blue-700 border-blue-200' },
  resuelto: { texto: 'Caso resuelto', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cerrado: { texto: 'Caso resuelto', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
}

function mismoDia(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}

function fechaCorta(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoy = new Date()
  const ayer = new Date()
  ayer.setDate(hoy.getDate() - 1)
  if (mismoDia(d, hoy)) return 'Hoy'
  if (mismoDia(d, ayer)) return 'Ayer'
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {})
  })
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function tramoHorario(c: any) {
  if (c.estado === 'activa') return `desde las ${hora(c.fecha_inicio)}`
  const fin = c.fecha_cierre || c.fecha_ultimo_mensaje
  if (!fin) return hora(c.fecha_inicio)
  return mismoDia(new Date(c.fecha_inicio), new Date(fin))
    ? `${hora(c.fecha_inicio)} – ${hora(fin)}`
    : `${hora(c.fecha_inicio)} – ${fechaCorta(fin)}, ${hora(fin)}`
}

export default function HiloClientePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { showToast } = useToast()

  const [hilo, setHilo] = useState<any>(null)
  const hiloActualRef = useRef<any>(null)
  useEffect(() => { hiloActualRef.current = hilo }, [hilo])
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState(false)
  // Mensajes ya pedidos, por conversación, y cuáles están desplegadas
  const [mensajes, setMensajes] = useState<Record<string, any[]>>({})
  const [desplegadas, setDesplegadas] = useState<Set<string>>(new Set())
  const [cargandoMensajes, setCargandoMensajes] = useState<Set<string>>(new Set())

  const [cambiandoIA, setCambiandoIA] = useState(false)
  const [agentes, setAgentes] = useState<any[]>([])
  const [procesandoCaso, setProcesandoCaso] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [hasLogPerm, setHasLogPerm] = useState(false)
  const [canDeleteNotes, setCanDeleteNotes] = useState(false)
  const [miUsuario, setMiUsuario] = useState<string | null>(null)

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    action: 'asignar_mi' | 'asignar_otro' | 'cola' | null;
    targetAgenteId?: string;
  }>({ isOpen: false, action: null })

  const [agentSearch, setAgentSearch] = useState('')
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const agentDropdownRef = useRef<HTMLDivElement>(null)
  const hiloRef = useRef<HTMLDivElement>(null)
  const colocado = useRef(false)
  const idsDelHilo = useRef<Set<string>>(new Set())
  const recargarHiloRef = useRef<() => void>(() => {})

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) {
        setShowAgentDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    colocado.current = false
    setMensajes({})
    setDesplegadas(new Set([id]))
    setErrorCarga(false)
    // Si la carga falla (por ejemplo, sin conexión), se avisa en vez de
    // quedarse en "Cargando..." para siempre
    cargarHilo(true).catch(() => setErrorCarga(true))
    cargarAgentes().catch(() => {})
    cargarLogs().catch(() => {})
  }, [id])

  const cargarLogs = async () => {
    const res = await getLogsAuditoria('conversations', id)
    if (res.success) {
      setHasLogPerm(res.hasPermission || false)
      setLogs(res.data || [])
    }
  }

  const cargarAgentes = async () => {
    const res = await getAgentesParaCasos()
    if (res.success && res.data) setAgentes(res.data)
  }

  const cargarHilo = async (primeraVez = false) => {
    if (primeraVez) setLoading(true)
    const [res, permisosRes] = await Promise.all([
      getHiloCliente(id),
      primeraVez ? getMisPermisos() : Promise.resolve(null)
    ])
    if (!res.success || !res.data) {
      if (primeraVez) {
        router.replace('/dashboard/conversaciones')
        return
      }
      showToast(res.error || 'No se pudo actualizar el historial', 'error')
      return
    }
    setHilo(res.data)
    idsDelHilo.current = new Set(res.data.conversaciones.map((c: any) => c.id))
    setMensajes(prev => ({ ...prev, [id]: res.data.mensajesActuales }))

    if (permisosRes?.success) {
      setCanDeleteNotes(((permisosRes as any).esAdmin) || ((permisosRes as any).userLevel || 5) <= 2)
      setMiUsuario((permisosRes as any).userId || null)
    }
    if (primeraVez) setLoading(false)
  }

  recargarHiloRef.current = () => { cargarHilo().catch(() => {}) }

  // Al entrar, el hilo se coloca en la conversación desde la que se ha
  // llegado. Si es la última, se ve su final (lo más reciente).
  useEffect(() => {
    if (loading || !hilo || colocado.current) return
    colocado.current = true
    requestAnimationFrame(() => {
      const convs = hilo.conversaciones
      const esLaUltima = convs.length && convs[convs.length - 1].id === id
      if (esLaUltima && hiloRef.current) {
        hiloRef.current.scrollTop = hiloRef.current.scrollHeight
      } else {
        document.getElementById(`conv-${id}`)?.scrollIntoView({ block: 'start' })
      }
    })
  }, [loading, hilo, id])

  // Lo que pasa mientras se mira: mensajes nuevos en las conversaciones del
  // cliente y cambios de estado (cerrada, IA en pausa).
  useEffect(() => {
    const supabase = createClient()
    let channel: any
    const conectar = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)
      channel = supabase
        .channel(`hilo_cliente_${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const nuevo = payload.new as any
          if (!idsDelHilo.current.has(nuevo.conversation_id)) return
          setMensajes(prev => {
            const lista = prev[nuevo.conversation_id]
            if (!lista || lista.some(m => m.id === nuevo.id)) return prev
            return { ...prev, [nuevo.conversation_id]: [...lista, nuevo] }
          })
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
          const cambiado = payload.new as any
          if (!idsDelHilo.current.has(cambiado.conversation_id)) return
          setMensajes(prev => {
            const lista = prev[cambiado.conversation_id]
            if (!lista) return prev
            return {
              ...prev,
              [cambiado.conversation_id]: lista.map(m => m.id === cambiado.id
                ? { ...m, estado_envio: cambiado.estado_envio, error_envio: cambiado.error_envio }
                : m)
            }
          })
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
          const cambiada = payload.new as any
          if (!idsDelHilo.current.has(cambiada.id)) return
          // Si se ha cerrado o reabierto, su caso también ha cambiado: se
          // vuelve a pedir todo. Si no, basta con actualizarla.
          const antes = hiloActualRef.current?.conversaciones.find((c: any) => c.id === cambiada.id)
          if (antes && antes.estado !== cambiada.estado) {
            recargarHiloRef.current()
            return
          }
          setHilo((prev: any) => prev && ({
            ...prev,
            conversaciones: prev.conversaciones.map((c: any) => c.id === cambiada.id
              ? { ...c, estado: cambiada.estado, ia_pausada: cambiada.ia_pausada, fecha_cierre: cambiada.fecha_cierre, fecha_ultimo_mensaje: cambiada.fecha_ultimo_mensaje, resumen: cambiada.resumen }
              : c)
          }))
        })
        .subscribe()
    }
    conectar()
    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [id])

  const pedirMensajes = async (convId: string) => {
    if (mensajes[convId] || cargandoMensajes.has(convId)) return
    setCargandoMensajes(prev => new Set(prev).add(convId))
    try {
      const res = await getMensajes(convId)
      if (res.success && res.data) {
        setMensajes(prev => ({ ...prev, [convId]: res.data.mensajes || [] }))
      } else {
        showToast(res.error || 'No se pudieron cargar los mensajes', 'error')
      }
    } catch {
      showToast('No se pudieron cargar los mensajes. Revisa la conexión.', 'error')
    }
    setCargandoMensajes(prev => {
      const siguiente = new Set(prev)
      siguiente.delete(convId)
      return siguiente
    })
  }

  const alternar = (convId: string) => {
    const abrir = !desplegadas.has(convId)
    setDesplegadas(prev => {
      const siguiente = new Set(prev)
      if (abrir) siguiente.add(convId)
      else siguiente.delete(convId)
      return siguiente
    })
    if (abrir) pedirMensajes(convId)
  }

  const todasDesplegadas = !!hilo && hilo.conversaciones.every((c: any) => desplegadas.has(c.id))

  const alternarTodas = () => {
    if (!hilo) return
    if (todasDesplegadas) {
      setDesplegadas(new Set())
    } else {
      setDesplegadas(new Set(hilo.conversaciones.map((c: any) => c.id)))
      hilo.conversaciones.forEach((c: any) => pedirMensajes(c.id))
    }
  }

  const irA = (convId: string) => {
    if (!desplegadas.has(convId)) alternar(convId)
    document.getElementById(`conv-${convId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (errorCarga) return <ErrorCarga />
  if (loading) return <Loading />
  if (!hilo) return null

  const contact = hilo.contacto
  const conversaciones: any[] = hilo.conversaciones
  // La conversación abierta del cliente, si la tiene (como mucho una por
  // canal; si hubiera varias, la más reciente). Sobre ella actúan la IA y el
  // caso; las cerradas solo se consultan.
  const abierta = [...conversaciones].reverse().find(c => c.estado === 'activa') || null
  const ultima = conversaciones[conversaciones.length - 1]
  const primeraFecha = conversaciones[0]?.fecha_inicio
  const nombre = contact?.nombre || contact?.identificador_canal || 'Cliente sin nombre'
  const iniciales = nombre.substring(0, 2).toUpperCase()

  const handleToggleIA = async (newPausedState: boolean) => {
    if (!abierta) return false
    setCambiandoIA(true)
    const res = await (newPausedState ? pausarIA(abierta.id) : reanudarIA(abierta.id))
      .catch(() => ({ success: false, error: 'No se pudo cambiar la IA. Revisa la conexión.' }))
    setCambiandoIA(false)
    if (!res.success) {
      showToast(res.error || 'No se pudo cambiar la IA', 'error')
      return false
    }
    await cargarHilo()
    if (hasLogPerm) cargarLogs()
    return true
  }

  const handleConfirmCaso = async () => {
    if (!modalState.action || !abierta) return
    setProcesandoCaso(true)

    let targetAgenteId: string | null = null
    if (modalState.action === 'asignar_mi') targetAgenteId = miUsuario
    if (modalState.action === 'asignar_otro' && modalState.targetAgenteId) targetAgenteId = modalState.targetAgenteId

    if (modalState.action === 'asignar_mi' && !targetAgenteId) {
      showToast('No se ha podido saber quién eres. Recarga la página e inténtalo de nuevo.', 'error')
      setProcesandoCaso(false)
      return
    }

    const res = await crearCasoDesdeConversacion(abierta.id, targetAgenteId)
      .catch(() => ({ success: false, error: 'No se pudo crear el caso. Revisa la conexión.' }))
    if (res.success) {
      setModalState({ isOpen: false, action: null })
      showToast('Caso creado', 'success')
      await cargarHilo()
      if (hasLogPerm) await cargarLogs()
    } else {
      showToast(res.error || 'No se pudo crear el caso', 'error')
    }
    setProcesandoCaso(false)
  }

  const openModal = (action: typeof modalState.action, targetAgenteId?: string) => {
    setModalState({ isOpen: true, action, targetAgenteId })
  }

  return (
    // En el ordenador, historial y lateral se desplazan cada uno por su lado; en
    // el móvil baja la página entera (si no, el lateral quedaba fuera de la
    // pantalla sin forma de llegar a él) y el historial tiene su propio alto
    <div className="lg:h-full flex flex-col sm:p-2 lg:p-6 mx-auto w-full max-w-7xl lg:overflow-hidden">
      <div className="mb-4 shrink-0">
        <Link href="/dashboard/conversaciones" className="text-sm font-semibold text-slate-500 hover:text-brand-600 flex items-center gap-1 w-max">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Volver a Conversaciones
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink-900 font-display flex items-center gap-3 flex-wrap">
              <span className="truncate">{nombre}</span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                abierta ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {abierta ? 'Conversación abierta' : 'Sin conversación abierta'}
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {primeraFecha && <>Cliente desde el {new Date(primeraFecha).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })} · </>}
              {conversaciones.length} {conversaciones.length === 1 ? 'conversación' : 'conversaciones'}
              {contact?.canal && <> · {nombreCanal(contact.canal)} {contact.identificador_canal}</>}
            </p>
          </div>

          {abierta && (
            <div className="flex items-center gap-2">
              <AIToggle
                isPaused={abierta.ia_pausada}
                onToggleConfirm={handleToggleIA}
                disabled={cambiandoIA}
              />
            </div>
          )}
        </div>
      </div>

      <div className="lg:flex-1 lg:min-h-0 flex flex-col lg:flex-row gap-6">
        {/* HILO */}
        <div className="h-[75vh] lg:h-auto lg:flex-1 lg:min-h-0 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 shrink-0 flex items-center justify-between gap-3">
            <h3 className="font-semibold text-ink-900 text-sm">
              Historial <span className="font-normal text-slate-500">· de la más antigua a la más reciente</span>
            </h3>
            {conversaciones.length > 1 && (
              <button
                type="button"
                onClick={alternarTodas}
                className="text-xs font-semibold text-brand-700 bg-white hover:bg-brand-50 border border-slate-200 px-2.5 py-1.5 rounded-lg transition shrink-0"
              >
                {todasDesplegadas ? 'Plegar todas' : 'Desplegar todas'}
              </button>
            )}
          </div>

          <div ref={hiloRef} className="flex-1 overflow-y-auto px-3 sm:px-5 py-5 bg-slate-50/50">
            <div className="relative">
              <div className="absolute left-[11px] top-3 bottom-3 w-px bg-slate-200" aria-hidden="true"></div>
              <div className="flex flex-col gap-4">
                {conversaciones.map((c: any) => {
                  const abiertaEsta = desplegadas.has(c.id)
                  const esLaDeEntrada = c.id === id
                  const caso = c.caso
                  const infoCaso = caso ? ETIQUETA_CASO[caso.estatus] || ETIQUETA_CASO.pendiente : null
                  const lista = mensajes[c.id]
                  return (
                    <article key={c.id} id={`conv-${c.id}`} className="relative pl-8 scroll-mt-3">
                      <span
                        className={`absolute left-[6px] top-4 w-[11px] h-[11px] rounded-full border-2 ${
                          c.estado === 'activa' ? 'bg-brand-600 border-brand-600' : 'bg-white border-slate-300'
                        }`}
                        aria-hidden="true"
                      ></span>
                      <div className={`bg-white rounded-xl border overflow-hidden ${
                        esLaDeEntrada ? 'border-brand-300 ring-1 ring-brand-100' : 'border-slate-200'
                      }`}>
                        <div className="p-3 sm:p-4">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <span className="text-sm font-bold text-ink-900">{fechaCorta(c.fecha_inicio)}</span>
                            <span className="text-xs text-slate-500 tabular-nums">{tramoHorario(c)}</span>
                            <span className="text-[11px] text-slate-500">· {nombreCanal(c.canal)}</span>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              c.estado === 'activa' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {c.estado === 'activa' ? 'Abierta' : 'Cerrada'}
                            </span>
                            {c.etiquetas.map((t: any, i: number) => (
                              <EtiquetaPill key={i} pequena nombre={t.nombre} color={t.color} />
                            ))}
                            {caso && infoCaso && (
                              <Link
                                href={`/dashboard/casos/${caso.id}`}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border hover:underline ${infoCaso.clase}`}
                              >
                                {infoCaso.texto}{caso.agente?.nombre ? ` · ${caso.agente.nombre}` : ''}
                              </Link>
                            )}
                          </div>

                          {c.estado !== 'activa' && (
                            <p className="text-sm text-slate-600 leading-relaxed mt-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1.5">Resumen</span>
                              {c.resumen || <span className="italic text-slate-400">Todavía sin resumen.</span>}
                            </p>
                          )}

                          {c.notas.length > 0 && (
                            <div className="mt-2 flex flex-col gap-1.5">
                              {c.notas.map((n: any) => (
                                <p key={n.id} className="text-xs text-amber-900/80 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 whitespace-pre-wrap break-words">
                                  <b className="text-amber-900">Nota · {n.users?.nombre || n.users?.email || 'Equipo'}:</b> {n.contenido}
                                </p>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => alternar(c.id)}
                            aria-expanded={abiertaEsta}
                            aria-controls={`mensajes-${c.id}`}
                            className="mt-2.5 text-xs font-semibold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
                          >
                            {abiertaEsta ? 'Ocultar mensajes' : 'Ver mensajes'}
                            <svg className={`w-3.5 h-3.5 transition-transform ${abiertaEsta ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                          </button>
                        </div>

                        {abiertaEsta && (
                          <div id={`mensajes-${c.id}`} className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4 space-y-4">
                            {!lista ? (
                              <div className="flex justify-center py-4">
                                <div className="w-5 h-5 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin"></div>
                              </div>
                            ) : lista.length === 0 ? (
                              <p className="text-center text-sm text-slate-400 py-2">No hay mensajes en esta conversación.</p>
                            ) : (
                              lista.map((m: any) => (
                                <MessageBubble
                                  key={m.id}
                                  msg={m}
                                  contactName={contact?.nombre}
                                  channelId={contact?.identificador_canal}
                                />
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="p-3 bg-white border-t border-slate-200 shrink-0 flex justify-center">
            <Link
              href={`/dashboard/chats?chat=${(abierta || ultima)?.id}`}
              className="w-full sm:w-auto px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              Abrir en Chats
            </Link>
          </div>
        </div>

        {/* LATERAL */}
        <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0 lg:min-h-0 lg:overflow-y-auto pb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-ink-900 mb-4 pb-2 border-b border-slate-100">Cliente</h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-semibold text-sm shrink-0">
                {iniciales}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-ink-900 text-sm truncate">{nombre}</p>
                <p className="text-xs text-slate-500 truncate">
                  {nombreCanal(contact?.canal)} · {contact?.identificador_canal}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-slate-50 rounded-xl px-2 py-2 text-center">
                <p className="text-base font-bold text-ink-900 tabular-nums">{conversaciones.length}</p>
                <p className="text-[10px] text-slate-500">{conversaciones.length === 1 ? 'conversación' : 'conversaciones'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl px-2 py-2 text-center">
                <p className="text-base font-bold text-ink-900 tabular-nums">{hilo.totalCasos}</p>
                <p className="text-[10px] text-slate-500">{hilo.totalCasos === 1 ? 'caso' : 'casos'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl px-2 py-2 text-center">
                <p className="text-base font-bold text-ink-900">{fechaCorta(primeraFecha)}</p>
                <p className="text-[10px] text-slate-500">primera vez</p>
              </div>
            </div>
          </div>

          {conversaciones.length > 1 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-ink-900 mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                Sus conversaciones
                <span className="text-[11px] font-normal text-slate-400">pulsa para ir</span>
              </h3>
              <ul className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                {conversaciones.map((c: any) => {
                  const partes = [
                    c.etiquetas[0]?.nombre,
                    c.caso ? (ETIQUETA_CASO[c.caso.estatus]?.texto || 'Caso').toLowerCase() : null,
                    c.estado === 'activa' ? 'abierta' : null
                  ].filter(Boolean) as string[]
                  const texto = partes.join(' · ') || 'Sin etiqueta'
                  const que = texto.charAt(0).toUpperCase() + texto.slice(1)
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => irA(c.id)}
                        aria-current={c.id === id ? 'true' : undefined}
                        className={`w-full text-left flex items-baseline gap-3 px-2.5 py-2 rounded-lg transition ${
                          c.id === id ? 'bg-brand-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-xs font-bold text-ink-900 w-14 shrink-0">{fechaCorta(c.fecha_inicio)}</span>
                        <span className="text-xs text-slate-600 truncate">{que}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {abierta && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-ink-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                Caso
                <HelpPopover content="Un caso es una tarea para una persona del equipo sobre la conversación abierta del cliente. Los casos de conversaciones anteriores se ven en el historial." />
              </h3>
              {abierta.caso ? (
                <div>
                  <p className="text-sm text-slate-500 mb-3">La conversación abierta ya tiene un caso.</p>
                  <Link
                    href={`/dashboard/casos/${abierta.caso.id}`}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold rounded-xl transition text-sm"
                  >
                    Ver caso #{abierta.caso.id.substring(0, 8).toUpperCase()}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => openModal('asignar_mi')}
                    disabled={procesandoCaso}
                    className="w-full py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-md shadow-brand-600/20 transition text-sm disabled:opacity-50"
                  >
                    Asignarme a mí
                  </button>
                  <button
                    onClick={() => openModal('cola')}
                    disabled={procesandoCaso}
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl border border-slate-200 transition text-sm disabled:opacity-50"
                  >
                    Dejar en cola (sin asignar)
                  </button>
                  <div className="pt-3 border-t border-slate-100 relative" ref={agentDropdownRef}>
                    <p className="text-xs text-slate-500 font-medium mb-2">Asignar a...</p>
                    <div className="relative">
                      <button
                        onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                        disabled={procesandoCaso}
                        className="w-full h-10 px-3 border border-slate-200 rounded-xl bg-slate-50 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow disabled:opacity-50"
                      >
                        <span className="text-slate-500">Selecciona un agente...</span>
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                      </button>

                      {showAgentDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                          <div className="p-2 border-b border-slate-100 bg-slate-50">
                            <input
                              type="text"
                              placeholder="Buscar agente..."
                              value={agentSearch}
                              onChange={e => setAgentSearch(e.target.value)}
                              className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                            />
                          </div>
                          <div className="max-h-[160px] overflow-y-auto p-1">
                            {agentes.filter(a =>
                              (a.nombre || '').toLowerCase().includes(agentSearch.toLowerCase()) ||
                              (a.email || '').toLowerCase().includes(agentSearch.toLowerCase())
                            ).map(a => (
                              <button
                                key={a.id}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded-lg transition text-ink-900 truncate"
                                onClick={() => {
                                  setShowAgentDropdown(false)
                                  setAgentSearch('')
                                  openModal('asignar_otro', a.id)
                                }}
                              >
                                {a.nombre || a.email}
                              </button>
                            ))}
                            {agentes.length === 0 && (
                              <div className="px-3 py-2 text-sm text-slate-500 text-center">No hay agentes disponibles</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notas del cliente: las de todas sus conversaciones; las nuevas
              se apuntan en la abierta, o en esta si no tiene ninguna abierta */}
          <NotesSection
            conversationId={abierta?.id || id}
            canDelete={canDeleteNotes}
            onCambio={() => { cargarHilo().catch(() => {}) }}
          />

          {hasLogPerm && logs.length > 0 && (
            <ActivityLog logs={logs} />
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={modalState.isOpen}
        title="Crear caso"
        message={
          modalState.action === 'asignar_mi' ? 'Se creará un caso para la conversación abierta del cliente y se te asignará a ti. La IA quedará en pausa en esa conversación.' :
          modalState.action === 'cola' ? 'Se creará un caso para la conversación abierta del cliente y quedará en cola (sin asignar).' :
          'Se creará un caso para la conversación abierta del cliente y se le asignará al agente seleccionado. La IA quedará en pausa en esa conversación.'
        }
        confirmText="Confirmar"
        type="info"
        onConfirm={handleConfirmCaso}
        onClose={() => setModalState({ isOpen: false, action: null })}
        isLoading={procesandoCaso}
      />
    </div>
  )
}
