'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getCasoDetalle, actualizarEstadoCaso, agregarNotaCaso, enviarMensaje } from '@/app/actions/agente-caso-detalle'

const CANAL_CONFIG = {
  instagram: {
    iconBg: 'bg-gradient-to-br from-pink-500 to-purple-500',
    icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0z"/>
      </svg>
    ),
  },
  whatsapp: {
    iconBg: 'bg-emerald-500',
    icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24z"/>
      </svg>
    ),
  },
  facebook: {
    iconBg: 'bg-blue-600',
    icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
} as const

type CanalConfigKey = keyof typeof CANAL_CONFIG

const TAG_COLORS: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  purple: 'bg-purple-100 text-purple-700',
  red: 'bg-red-100 text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  pink: 'bg-pink-100 text-pink-700',
  indigo: 'bg-indigo-100 text-indigo-700',
}

function formatTimeElapsed(diffMs: number) {
  const min = Math.floor(diffMs / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} d`
}

function formatTimeOnly(isoString: string) {
  const d = new Date(isoString)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function AgenteCasoDetalle() {
  const params = useParams()
  const caseId = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [caso, setCaso] = useState<any>(null)
  const [mensajes, setMensajes] = useState<any[]>([])
  const [notas, setNotas] = useState<any[]>([])

  const [mensajeInput, setMensajeInput] = useState('')
  const [notaInput, setNotaInput] = useState('')
  
  const [enviandoMensaje, setEnviandoMensaje] = useState(false)
  const [guardandoNota, setGuardandoNota] = useState(false)
  const [actualizandoEstado, setActualizandoEstado] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isFirstRender = useRef(true)

  // Toast simple
  const [toast, setToast] = useState<{ message: string, type: 'error' | 'success' } | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await getCasoDetalle(caseId)
      if (!res.success || !res.data) {
        setError(res.error || 'Error al cargar el caso')
      } else {
        setCaso(res.data.caso)
        setMensajes(res.data.mensajes)
        setNotas(res.data.notas)
      }
      setLoading(false)
    }
    load()
  }, [caseId])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: isFirstRender.current ? 'auto' : 'smooth',
        block: 'end'
      })
      isFirstRender.current = false
    }
  }, [mensajes])

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleEnviarMensaje = async () => {
    if (!mensajeInput.trim() || !caso?.conversation_id) return
    setEnviandoMensaje(true)
    const res = await enviarMensaje(caso.conversation_id, mensajeInput)
    if (res.success && res.data) {
      setMensajes(prev => [...prev, res.data])
      setMensajeInput('')
    } else {
      showToast(res.error || 'Error al enviar mensaje')
    }
    setEnviandoMensaje(false)
  }

  const handleGuardarNota = async () => {
    if (!notaInput.trim()) return
    setGuardandoNota(true)
    const res = await agregarNotaCaso(caseId, notaInput)
    if (res.success && res.data) {
      setNotas(prev => [...prev, res.data])
      setNotaInput('')
    } else {
      showToast(res.error || 'Error al guardar nota')
    }
    setGuardandoNota(false)
  }

  const handleCambiarEstado = async (nuevoEstado: 'pendiente' | 'atendiendo' | 'resuelto') => {
    if (caso?.estatus === nuevoEstado) return
    setActualizandoEstado(true)
    const res = await actualizarEstadoCaso(caseId, nuevoEstado)
    if (res.success && res.data) {
      setCaso((prev: any) => ({ ...prev, estatus: res.data.estatus, fecha_cierre: res.data.fecha_cierre }))
    } else {
      showToast(res.error || 'Error al actualizar estado')
    }
    setActualizandoEstado(false)
  }

  if (loading) {
    return <div className="py-12 text-center text-slate-500 font-medium">Cargando caso...</div>
  }

  if (error || !caso) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-500 font-medium mb-4">{error || 'Caso no encontrado'}</p>
        <Link href="/agente" className="text-brand-600 hover:underline font-medium">Volver a Mis casos</Link>
      </div>
    )
  }

  const nombre = caso.contacts?.nombre || 'Cliente sin nombre'
  const initials = nombre === 'Cliente sin nombre' 
    ? '?' 
    : nombre.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
  
  const canal = (caso.contacts?.canal as CanalConfigKey) || 'instagram'
  const canalConf = CANAL_CONFIG[canal] || CANAL_CONFIG.instagram
  const canalCapitalized = canal.charAt(0).toUpperCase() + canal.slice(1)

  let tagClasses = ''
  if (caso.primer_tag) {
    tagClasses = TAG_COLORS[caso.primer_tag.color] || TAG_COLORS.slate
  }

  const ahora = new Date().getTime()
  const apertura = new Date(caso.fecha_apertura).getTime()
  const diffMs = ahora - apertura
  const timeStr = formatTimeElapsed(diffMs)

  const renderSlaBadgeOnly = () => {
    if (caso.estatus === 'pendiente') {
      const isVencido = caso.sla_horas !== null && (diffMs > caso.sla_horas * 3600000)
      if (isVencido) {
        return <span className="text-xs font-600 px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200">SLA vencido</span>
      } else {
        return <span className="text-xs font-600 px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">Pendiente</span>
      }
    }

    if (caso.estatus === 'atendiendo') {
      return <span className="text-xs font-600 px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">Atendiendo</span>
    }
    
    if (caso.estatus === 'resuelto') {
      return <span className="text-xs font-600 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">Resuelto</span>
    }

    return null
  }

  return (
    <>
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
          {toast.message}
        </div>
      )}

      {/* Cabecera del caso */}
      <Link href="/agente" className="inline-flex items-center gap-1.5 text-sm font-500 text-ink-500 hover:text-brand-600 mb-3 transition">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        Mis casos
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="font-display font-700 text-2xl text-ink-900">Caso #{caso.id.split('-')[0]}</h1>
            {caso.primer_tag && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-500 ${tagClasses}`}>
                {caso.primer_tag.nombre}
              </span>
            )}
            {renderSlaBadgeOnly()}
          </div>
          <p className="text-ink-500 mt-1">
            Abierto hace {timeStr}
            {caso.descripcion ? ` · ${caso.descripcion}` : ''}
          </p>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-3 lg:gap-6">
        {/* COLUMNA CHAT */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Cabecera contacto */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center font-600 text-brand-700">{initials}</div>
              <span className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full ${canalConf.iconBg} flex items-center justify-center text-white ring-2 ring-white shadow-sm`}>
                {canalConf.icon}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-600 text-ink-900">{nombre}</p>
              <p className="text-sm text-ink-500">
                {caso.contacts?.identificador_canal ? `${caso.contacts.identificador_canal} · ` : ''}
                {canalCapitalized}
              </p>
            </div>
            <button disabled className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-slate-100 text-slate-400 text-sm font-600 cursor-not-allowed">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>
              <span className="hidden sm:inline">Próximamente</span>
              <span className="sm:hidden">Chats</span>
            </button>
          </div>

          {/* Hilo */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {mensajes.length === 0 ? (
              <p className="text-center text-sm text-ink-500 py-4">Sin mensajes en esta conversación todavía.</p>
            ) : (
              <>
                {mensajes.map(msg => {
                  const isCliente = msg.remitente === 'cliente'
                  const isIa = msg.remitente === 'ia'
                  const isAgente = msg.remitente === 'agente'

                  if (isCliente) {
                    return (
                      <div key={msg.id} className="flex gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-600 shrink-0">{initials}</div>
                        <div className="max-w-[80%]">
                          <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-2.5">
                            <p className="text-sm text-ink-900 whitespace-pre-wrap">{msg.contenido}</p>
                          </div>
                          <p className="text-[11px] text-ink-400 mt-1 ml-1">{formatTimeOnly(msg.timestamp)}</p>
                        </div>
                      </div>
                    )
                  } else {
                    return (
                      <div key={msg.id} className="flex gap-2.5 justify-end">
                        <div className="max-w-[80%]">
                          <div className="bg-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5">
                            <p className="text-sm whitespace-pre-wrap">{msg.contenido}</p>
                          </div>
                          <div className="flex items-center justify-end gap-1.5 mt-1 mr-1">
                            {isIa && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-600 text-brand-600">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                IA
                              </span>
                            )}
                            <span className="text-[11px] text-ink-400">{formatTimeOnly(msg.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  }
                })}
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-brand-200"></div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-600 text-brand-700 bg-brand-50 px-3 py-1 rounded-full border border-brand-200">
                    Se te asignó este caso
                  </span>
                  <div className="flex-1 h-px bg-brand-200"></div>
                </div>
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Cuadro de respuesta */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <textarea 
              rows={3} 
              placeholder={`Escribe tu respuesta a ${nombre.split(' ')[0]}...`}
              value={mensajeInput}
              onChange={(e) => setMensajeInput(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
            />
            <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
              <p className="text-xs text-ink-400 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0z"/></svg>
                Se enviará por {canalCapitalized}
              </p>
              <button 
                onClick={handleEnviarMensaje}
                disabled={enviandoMensaje || !mensajeInput.trim()}
                className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-600 transition"
              >
                {enviandoMensaje ? 'Enviando...' : 'Enviar'}
                {!enviandoMensaje && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>}
              </button>
            </div>
          </div>

        </div>

        {/* COLUMNA GESTIÓN */}
        <div className="mt-6 lg:mt-0 space-y-4">
          
          {/* Estatus */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-600 text-sm text-ink-900 mb-3">Estado del caso</h3>
            <div className="space-y-2">
              <button 
                onClick={() => handleCambiarEstado('pendiente')}
                disabled={actualizandoEstado || caso.estatus === 'cerrado'}
                className={`w-full flex items-center gap-2 px-3 h-10 rounded-lg border-2 transition text-sm ${
                  caso.estatus === 'pendiente' 
                    ? 'border-amber-500 bg-amber-50/50 ring-4 ring-amber-100 font-600 text-ink-900' 
                    : 'border-slate-200 bg-white hover:border-amber-300 font-500 text-ink-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Pendiente
              </button>
              <button 
                onClick={() => handleCambiarEstado('atendiendo')}
                disabled={actualizandoEstado || caso.estatus === 'cerrado'}
                className={`w-full flex items-center gap-2 px-3 h-10 rounded-lg border-2 transition text-sm ${
                  caso.estatus === 'atendiendo' 
                    ? 'border-blue-500 bg-blue-50/50 ring-4 ring-blue-100 font-600 text-ink-900' 
                    : 'border-slate-200 bg-white hover:border-blue-300 font-500 text-ink-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> Atendiendo
              </button>
              <button 
                onClick={() => handleCambiarEstado('resuelto')}
                disabled={actualizandoEstado || caso.estatus === 'cerrado'}
                className={`w-full flex items-center gap-2 px-3 h-10 rounded-lg border-2 transition text-sm ${
                  caso.estatus === 'resuelto' 
                    ? 'border-emerald-500 bg-emerald-50/50 ring-4 ring-emerald-100 font-600 text-ink-900' 
                    : 'border-slate-200 bg-white hover:border-emerald-300 font-500 text-ink-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Resuelto
              </button>
            </div>
          </div>

          {/* Notas de avance */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-600 text-sm text-ink-900 mb-3">Notas de avance</h3>
            
            {notas.length > 0 && (
              <div className="space-y-2.5 mb-3">
                {notas.map(nota => (
                  <div key={nota.id} className="text-sm bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-ink-700 whitespace-pre-wrap">{nota.nota}</p>
                    <p className="text-xs text-ink-400 mt-1">
                      {nota.users?.nombre || 'Tú'} · {formatTimeOnly(nota.timestamp)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            
            <textarea 
              rows={2} 
              placeholder="Añadir una nota de avance..."
              value={notaInput}
              onChange={(e) => setNotaInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white resize-none text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"
            />
            <button 
              onClick={handleGuardarNota}
              disabled={guardandoNota || !notaInput.trim()}
              className="mt-2 w-full h-9 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 disabled:bg-slate-100 disabled:cursor-not-allowed text-sm font-600 text-ink-700 transition"
            >
              {guardandoNota ? 'Guardando...' : 'Guardar nota'}
            </button>
            <p className="text-[11px] text-ink-400 mt-2">Las notas no se pueden editar ni borrar una vez guardadas.</p>
          </div>

          {/* Datos del contacto */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-600 text-sm text-ink-900 mb-3">Contacto</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Nombre</dt>
                <dd className="text-ink-900 font-500">{nombre}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Canal</dt>
                <dd className="text-ink-900 font-500">{canalCapitalized}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Producto</dt>
                <dd className="text-ink-900 font-500 text-right">{caso.producto?.nombre || '—'}</dd>
              </div>
            </dl>
          </div>

        </div>
      </div>
    </>
  )
}
