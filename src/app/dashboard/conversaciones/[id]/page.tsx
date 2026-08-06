'use client'
import Loading from '@/components/Loading'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getConversacionDetalle, pausarIA, reanudarIA } from '@/app/actions/conversaciones'

export default function ConversacionDetallePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [conv, setConv] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [cambiandoIA, setCambiandoIA] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cargarDatos()
  }, [id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conv?.mensajes])

  const cargarDatos = async () => {
    setLoading(true)
    const res = await getConversacionDetalle(id)
    if (!res.success || !res.data) {
      router.replace('/dashboard/conversaciones')
      return
    }
    setConv(res.data)
    setLoading(false)
  }

  const toggleIA = async () => {
    if (!conv) return
    setCambiandoIA(true)
    if (conv.ia_pausada) {
      await reanudarIA(id)
    } else {
      await pausarIA(id)
    }
    await cargarDatos()
    setCambiandoIA(false)
  }

  if (loading) return <Loading />
  if (!conv) return null

  const contact = Array.isArray(conv.contacts) ? conv.contacts[0] : conv.contacts
  const canalIcon = contact?.canal === 'whatsapp' ? 'text-[#25D366]' : 
                    contact?.canal === 'instagram' ? 'text-purple-500' : 'text-[#1877F2]'

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 mx-auto max-w-7xl overflow-hidden">
      <div className="mb-4 shrink-0">
        <Link href="/dashboard/conversaciones" className="text-sm font-semibold text-slate-500 hover:text-brand-600 flex items-center gap-1 w-max">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Volver a Conversaciones
        </Link>
        <div className="flex items-center justify-between mt-3">
          <h1 className="text-2xl font-bold text-ink-900 font-display flex items-center gap-3">
            <span className="capitalize">{contact?.nombre || 'Desconocido'}</span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${
              conv.estado === 'activa' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
            }`}>
              {conv.estado}
            </span>
          </h1>
          
          <button 
            disabled={cambiandoIA}
            onClick={toggleIA}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition shadow-sm border ${
              conv.ia_pausada 
                ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200' 
                : 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
            } disabled:opacity-50`}
          >
            <div className={`w-2.5 h-2.5 rounded-full shadow-inner ${conv.ia_pausada ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
            {conv.ia_pausada ? 'IA Pausada (Reanudar)' : 'IA Activa (Pausar)'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        {/* PANEL IZQUIERDO: CHAT */}
        <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 p-4 shrink-0 flex items-center justify-between">
            <h3 className="font-semibold text-ink-900">Mensajes</h3>
            <p className="text-xs font-semibold text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm">
              Último: {conv.fecha_ultimo_mensaje ? new Date(conv.fecha_ultimo_mensaje).toLocaleString() : 'N/A'}
            </p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50">
            {conv.mensajes.map((m: any) => {
              const isCliente = m.remitente === 'cliente'
              const isIA = m.remitente === 'ia'
              return (
                <div key={m.id} className={`flex ${isCliente ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm ${
                    isCliente ? 'bg-white border border-slate-200 rounded-br-none text-ink-900' : 
                    isIA ? 'bg-purple-100 border border-purple-200 rounded-bl-none text-purple-900' : 
                    'bg-emerald-100 border border-emerald-200 rounded-bl-none text-emerald-900'
                  }`}>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-60">
                      {m.remitente}
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.contenido}</p>
                    <div className="text-[10px] opacity-50 mt-1 text-right font-medium">
                      {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                </div>
              )
            })}
            {conv.mensajes.length === 0 && (
              <p className="text-center text-slate-400 mt-10 font-medium">No hay mensajes registrados.</p>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-slate-200 shrink-0 flex justify-center">
            <Link 
              href={`/dashboard/chats?chat=${id}`}
              className="w-full sm:w-auto px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              Abrir en Chats
            </Link>
          </div>
        </div>

        {/* PANEL DERECHO: INFO */}
        <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0 min-h-0 overflow-y-auto pb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-ink-900 mb-4 pb-2 border-b border-slate-100">Información del Cliente</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Canal de contacto</p>
                <p className={`font-semibold capitalize flex items-center gap-1.5 ${canalIcon}`}>
                  {contact?.canal}
                </p>
                <p className="text-sm text-slate-600 mt-0.5">{contact?.identificador_canal}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-ink-900 mb-4 pb-2 border-b border-slate-100">Detalles de Conversación</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Apertura</p>
                <p className="text-sm font-medium text-ink-900">
                  {new Date(conv.fecha_inicio).toLocaleString()}
                </p>
              </div>
              
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Resumen IA</p>
                <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed font-medium">
                  {conv.resumen || <span className="italic opacity-60">La IA aún no ha generado un resumen.</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-ink-900 mb-3 pb-2 border-b border-slate-100">Etiquetas aplicadas</h3>
            <div className="flex flex-wrap gap-2">
              {conv.etiquetas && conv.etiquetas.length > 0 ? (
                conv.etiquetas.map((t: any, i: number) => (
                  <span key={i} className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                    {t.nombre}
                  </span>
                ))
              ) : (
                <span className="text-xs font-semibold px-2.5 py-1 bg-slate-50 text-slate-400 rounded-md border border-slate-200 italic">
                  Descategorizado
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
