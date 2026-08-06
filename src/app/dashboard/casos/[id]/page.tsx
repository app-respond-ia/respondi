'use client'
import Loading from '@/components/Loading'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCasoDetalle, tomarCaso, cerrarCaso, asignarCaso, soltarCaso, getAgentesParaCasos } from '@/app/actions/casos'

export default function CasoDetallePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [caso, setCaso] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [agentes, setAgentes] = useState<any[]>([])
  const [procesando, setProcesando] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cargarDatos()
    cargarAgentes()
  }, [id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [caso?.mensajes])

  const cargarAgentes = async () => {
    const res = await getAgentesParaCasos()
    if (res.success && res.data) setAgentes(res.data)
  }

  const cargarDatos = async () => {
    setLoading(true)
    const res = await getCasoDetalle(id)
    if (!res.success || !res.data) {
      // Caso no encontrado o sin acceso
      router.replace('/dashboard/casos')
      return
    }
    setCaso(res.data)
    setLoading(false)
  }

  const handleTomar = async () => {
    setProcesando(true)
    const res = await tomarCaso(id)
    if (res.success) await cargarDatos()
    setProcesando(false)
  }

  const handleCerrar = async () => {
    setProcesando(true)
    const res = await cerrarCaso(id)
    if (res.success) await cargarDatos()
    setProcesando(false)
  }

  const handleAsignarme = async () => {
    if (!caso?.current_user_id) return
    setProcesando(true)
    const res = await asignarCaso(id, caso.current_user_id)
    if (res.success) await cargarDatos()
    setProcesando(false)
  }

  const handleSoltar = async () => {
    setProcesando(true)
    const res = await soltarCaso(id)
    if (res.success) await cargarDatos()
    setProcesando(false)
  }

  const handleTransferir = async (agenteId: string) => {
    if (!agenteId) return
    setProcesando(true)
    const res = await asignarCaso(id, agenteId)
    if (res.success) await cargarDatos()
    setProcesando(false)
  }

  if (loading) return <Loading />
  if (!caso) return null

  const esPendiente = caso.estatus === 'pendiente'
  const esAtendiendo = caso.estatus === 'atendiendo'
  const esCerrado = caso.estatus === 'resuelto' || caso.estatus === 'cerrado'

  const canalIcon = caso.contacts?.canal === 'whatsapp' ? 'text-[#25D366]' : 
                    caso.contacts?.canal === 'instagram' ? 'text-purple-500' : 'text-[#1877F2]'

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 mx-auto max-w-7xl overflow-hidden">
      <div className="mb-4 shrink-0">
        <Link href="/dashboard/casos" className="text-sm font-semibold text-slate-500 hover:text-brand-600 flex items-center gap-1 w-max">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Volver a Casos
        </Link>
        <div className="flex items-center justify-between mt-3">
          <h1 className="text-2xl font-bold text-ink-900 font-display flex items-center gap-3">
            Caso #{caso.id.substring(0,8).toUpperCase()}
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase ${
              esPendiente ? 'bg-amber-100 text-amber-800' : 
              esAtendiendo ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {caso.estatus}
            </span>
          </h1>
          <div className="flex gap-3">
            {esPendiente && (
              <button onClick={handleTomar} className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-brand-600/20 transition">
                Tomar caso
              </button>
            )}
            {esAtendiendo && (
              <button onClick={handleCerrar} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-emerald-600/20 transition">
                Cerrar caso
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        {/* PANEL IZQUIERDO: CHAT */}
        <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 p-4 shrink-0">
            <h3 className="font-semibold text-ink-900">Historial de conversación</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50">
            {caso.mensajes.map((m: any) => {
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
                    <div className="text-[10px] opacity-50 mt-1 text-right">
                      {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-slate-200 shrink-0 flex justify-center">
            {caso?.conversation_id ? (
              <Link 
                href={`/dashboard/chats?chat=${caso.conversation_id}`}
                className="w-full sm:w-auto px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                Abrir en Chats
              </Link>
            ) : (
              <p className="text-center text-slate-500 text-sm font-medium p-2 bg-slate-50 rounded-lg w-full">Este caso no tiene un chat asociado.</p>
            )}
          </div>
        </div>

        {/* PANEL DERECHO: INFO */}
        <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0 min-h-0 overflow-y-auto pb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-ink-900 mb-4 pb-2 border-b border-slate-100">Información del Cliente</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Nombre</p>
                <p className="font-semibold text-ink-900">{caso.contacts?.nombre || 'Desconocido'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Canal de contacto</p>
                <p className={`font-semibold capitalize flex items-center gap-1.5 ${canalIcon}`}>
                  {caso.contacts?.canal}
                </p>
                <p className="text-sm text-slate-600 mt-0.5">{caso.contacts?.identificador_canal}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-ink-900 mb-4 pb-2 border-b border-slate-100">Detalles del Caso</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Motivo / Tipo</p>
                <p className="font-medium text-ink-900 capitalize">{caso.tipo}</p>
                <p className="text-sm text-slate-600 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">{caso.descripcion}</p>
              </div>
              
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Agente Asignado</p>
                {caso.agente ? (
                  <p className="font-medium text-ink-900 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                      {caso.agente.nombre.substring(0,1).toUpperCase()}
                    </span>
                    {caso.agente.nombre}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500 italic">Sin asignar</p>
                )}
              </div>

              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Apertura</p>
                <p className="text-sm font-medium text-ink-900">
                  {new Date(caso.fecha_apertura).toLocaleString()}
                </p>
              </div>

              {caso.sla_horas && (
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-1">SLA Objetivo</p>
                  <p className="text-sm font-bold text-amber-600">{caso.sla_horas} horas</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-ink-900 mb-4 pb-2 border-b border-slate-100">Gestión de Asignación</h3>
            
            <div className="space-y-3">
              {caso.agente_id !== caso.current_user_id ? (
                <button 
                  onClick={handleAsignarme} 
                  disabled={procesando}
                  className="w-full py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold rounded-xl transition text-sm disabled:opacity-50"
                >
                  Asignarme este caso
                </button>
              ) : (
                <button 
                  onClick={handleSoltar} 
                  disabled={procesando}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl border border-slate-200 transition text-sm disabled:opacity-50"
                >
                  Soltar caso
                </button>
              )}

              <div className="pt-2 border-t border-slate-100">
                <label className="text-xs text-slate-500 font-medium block mb-1.5">Transferir a...</label>
                <select 
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50 disabled:opacity-50"
                  value=""
                  onChange={(e) => handleTransferir(e.target.value)}
                  disabled={procesando || agentes.length === 0}
                >
                  <option value="" disabled>Selecciona un agente</option>
                  {agentes.filter(a => a.id !== caso.agente_id).map(a => (
                    <option key={a.id} value={a.id}>{a.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {caso.etiquetas && caso.etiquetas.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-ink-900 mb-3 pb-2 border-b border-slate-100">Etiquetas de la charla</h3>
              <div className="flex flex-wrap gap-2">
                {caso.etiquetas.map((t: any, i: number) => (
                  <span key={i} className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                    {t.nombre}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
