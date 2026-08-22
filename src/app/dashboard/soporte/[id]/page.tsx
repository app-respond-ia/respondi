'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getTicketDetalleCliente, enviarMensajeTicketCliente, crearNotaTicket, getNotasTicket, calificarTicket } from '@/app/actions/soporte-cliente'
import { createClient } from '@/utils/supabase/client'
import Loading from '@/components/Loading'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export default function TicketDetalleClientePage() {
  const { id } = useParams()
  const router = useRouter()
  const [ticket, setTicket] = useState<any>(null)
  const [mensajes, setMensajes] = useState<any[]>([])
  const [notas, setNotas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [nuevaNota, setNuevaNota] = useState('')
  const [visibilidadNota, setVisibilidadNota] = useState<'privada' | 'compartida'>('privada')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmittingNota, setIsSubmittingNota] = useState(false)
  const [calificacion, setCalificacion] = useState<number>(0)
  const [comentarioCalificacion, setComentarioCalificacion] = useState('')
  const [isSubmittingCalificacion, setIsSubmittingCalificacion] = useState(false)
  const mensajesEndRef = useRef<HTMLDivElement>(null)

  const cargarDetalle = useCallback(async () => {
    const res = await getTicketDetalleCliente(id as string)
    if (res.success && res.data) {
      setTicket(res.data)
      setMensajes(res.data.mensajes || [])
    } else {
      router.push('/dashboard/soporte')
      return
    }

    const notasRes = await getNotasTicket(id as string)
    if (notasRes.success && notasRes.data) {
      setNotas(notasRes.data)
    }

    setLoading(false)
  }, [id, router])

  useEffect(() => {
    cargarDetalle()

    const supabase = createClient()
    let channel: any
    let isMounted = true

    const setupRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        supabase.realtime.setAuth(session.access_token)
      }

      if (!isMounted) return

      channel = supabase
        .channel(`client-ticket-${id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'client_ticket_messages', filter: `ticket_id=eq.${id}` },
          () => cargarDetalle()
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'client_tickets', filter: `id=eq.${id}` },
          () => cargarDetalle()
        )
        .subscribe()
    }

    setupRealtime()

    return () => {
      isMounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [id, cargarDetalle])

  useEffect(() => {
    if (mensajesEndRef.current) {
      mensajesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [mensajes])

  const handleEnviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoMensaje.trim() || isSubmitting) return

    setIsSubmitting(true)
    const res = await enviarMensajeTicketCliente(id as string, nuevoMensaje)
    
    if (res.success && res.data) {
      setMensajes(prev => [...prev, res.data])
      setNuevoMensaje('')
      if (ticket.estatus === 'cerrado') {
        setTicket((prev: any) => ({ ...prev, estatus: 'abierto' }))
      }
    }
    setIsSubmitting(false)
  }

  const handleCrearNota = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevaNota.trim() || isSubmittingNota) return

    setIsSubmittingNota(true)
    const res = await crearNotaTicket(id as string, nuevaNota, visibilidadNota)
    if (res.success && res.data) {
      setNotas(prev => [res.data, ...prev])
      setNuevaNota('')
    }
    setIsSubmittingNota(false)
  }

  const handleCalificar = async () => {
    if (calificacion === 0 || isSubmittingCalificacion) return

    setIsSubmittingCalificacion(true)
    const res = await calificarTicket(id as string, calificacion, comentarioCalificacion)
    if (res.success) {
      setTicket((prev: any) => ({
        ...prev,
        calificacion,
        comentario_calificacion: comentarioCalificacion,
        fecha_calificacion: new Date().toISOString()
      }))
    }
    setIsSubmittingCalificacion(false)
  }

  const getEstatusBadge = (estatus: string) => {
    if (estatus === 'abierto') return 'bg-amber-100 text-amber-700'
    if (estatus === 'cerrado') return 'bg-emerald-100 text-emerald-700'
    return 'bg-slate-100 text-slate-700'
  }

  if (loading) return <Loading />
  if (!ticket) return null

  return (
    <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      
      {/* Panel principal: Chat */}
      <div className="flex-1 flex flex-col space-y-4">
        {/* Header del Ticket */}
        <div className="shrink-0">
          <Link href="/dashboard/soporte" className="inline-flex items-center gap-1.5 text-sm font-600 text-brand-600 hover:text-brand-700 transition mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            Volver a soporte
          </Link>
          
          <h1 className="font-display font-700 text-2xl text-ink-900 mb-3 leading-tight">
            {ticket.asunto}
          </h1>
          
          <div className="flex items-center gap-3 flex-wrap border-b border-slate-200 pb-5">
            <span className={`text-xs px-2.5 py-1 rounded-full font-700 uppercase tracking-wide ${getEstatusBadge(ticket.estatus)}`}>
              {ticket.estatus}
            </span>
            {ticket.categoria && (
              <span className="text-xs font-600 px-2 py-1 rounded-md border border-slate-200 text-slate-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ticket.categoria.color }}></span>
                {ticket.categoria.nombre}
              </span>
            )}
          </div>
        </div>

        {/* Zona de Mensajes */}
      <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
        {mensajes.length === 0 ? (
          <div className="text-center py-12 text-ink-400 text-sm">No hay mensajes.</div>
        ) : (
          mensajes.map((msg, index) => {
            const esMio = msg.user_id === ticket.user_id
            
            return (
              <div key={msg.id} className={`flex gap-4 ${esMio ? 'flex-row-reverse' : ''}`}>
                <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-700 text-sm uppercase ${esMio ? 'bg-slate-200 text-slate-600' : 'bg-brand-100 text-brand-700'}`}>
                  {msg.user?.nombre ? msg.user.nombre.substring(0, 2) : (esMio ? 'Tú' : 'S')}
                </div>
                <div className={`max-w-[80%] border rounded-2xl p-4 shadow-sm ${esMio ? 'bg-white border-slate-200 rounded-tr-none' : 'bg-brand-50 border-brand-100 rounded-tl-none'}`}>
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <p className="text-sm font-700 text-ink-900">
                      {msg.user?.nombre || (esMio ? 'Tú' : 'Soporte Respondi')}
                    </p>
                    <p className="text-[11px] font-500 text-ink-400 shrink-0">
                      {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                  <p className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">
                    {msg.mensaje}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={mensajesEndRef} />
      </div>

      {/* Input inferior */}
      <div className="shrink-0 bg-white rounded-2xl border border-slate-200 p-2 sm:p-3 shadow-sm mt-0">
        <form onSubmit={handleEnviarMensaje} className="flex gap-2 sm:gap-3">
          <textarea 
            value={nuevoMensaje}
            onChange={e => setNuevoMensaje(e.target.value)}
            placeholder="Escribe tu respuesta aquí..."
            className="flex-1 max-h-32 min-h-[44px] h-[44px] px-3 py-2.5 text-sm text-ink-900 bg-transparent border-0 focus:ring-0 resize-none outline-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleEnviarMensaje(e)
              }
            }}
          ></textarea>
          <button 
            type="submit"
            disabled={!nuevoMensaje.trim() || isSubmitting}
            className="h-11 px-5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-600 text-sm transition shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center justify-center min-w-[120px]"
          >
            {isSubmitting ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : 'Enviar'}
          </button>
        </form>
      </div>
      </div>

      {/* Panel lateral: Notas y Valoración */}
      <div className="w-full lg:w-[360px] shrink-0 space-y-4 flex flex-col h-full overflow-hidden">
        
        {/* Valoración al cerrar el ticket */}
        {ticket.estatus === 'cerrado' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm shrink-0">
            <h3 className="font-display font-700 text-lg text-ink-900 mb-2">Valoración del soporte</h3>
            {ticket.calificacion ? (
              <div>
                <div className="flex gap-1 mb-2">
                  {[1,2,3,4,5].map(star => (
                    <svg key={star} className={`w-5 h-5 ${star <= ticket.calificacion ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                  ))}
                </div>
                {ticket.comentario_calificacion && (
                  <p className="text-sm text-ink-600 mt-2 italic">"{ticket.comentario_calificacion}"</p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-ink-600 mb-3">¿Cómo calificarías la atención recibida?</p>
                <div className="flex gap-1 mb-3">
                  {[1,2,3,4,5].map(star => (
                    <button key={star} type="button" onClick={() => setCalificacion(star)} className="focus:outline-none group">
                      <svg className={`w-6 h-6 transition ${star <= calificacion ? 'text-amber-400' : 'text-slate-200 group-hover:text-amber-200'}`} fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    </button>
                  ))}
                </div>
                <textarea 
                  value={comentarioCalificacion}
                  onChange={e => setComentarioCalificacion(e.target.value)}
                  placeholder="Comentario opcional..."
                  className="w-full h-20 px-3 py-2 text-sm border border-slate-300 rounded-xl focus:border-brand-500 outline-none resize-none mb-3"
                ></textarea>
                <button 
                  onClick={handleCalificar}
                  disabled={calificacion === 0 || isSubmittingCalificacion}
                  className="w-full h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-600 text-sm transition disabled:opacity-50"
                >
                  {isSubmittingCalificacion ? 'Enviando...' : 'Enviar valoración'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Bloc de notas */}
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 flex flex-col flex-1 overflow-hidden shadow-sm">
          <div className="shrink-0 mb-4">
            <h3 className="font-display font-700 text-lg text-ink-900 mb-1">Notas internas</h3>
            <p className="text-xs text-ink-500 leading-relaxed">
              Estas notas son solo visibles para tu equipo. Respondi no tiene acceso a ellas.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2 mb-4">
            {notas.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-6">No hay notas agregadas aún.</p>
            ) : (
              notas.map(nota => (
                <div key={nota.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm relative">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-700 text-slate-600 shrink-0">
                        {nota.user?.nombre?.substring(0,2).toUpperCase() || 'U'}
                      </div>
                      <span className="text-xs font-600 text-ink-900">{nota.user?.nombre || 'Usuario'}</span>
                    </div>
                    <span className="text-[10px] text-ink-400 whitespace-nowrap">
                      {formatDistanceToNow(new Date(nota.created_at), { addSuffix: true, locale: es })}
                    </span>
                  </div>
                  <p className="text-sm text-ink-700 whitespace-pre-wrap">{nota.nota}</p>
                  
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition">
                    <span className="text-[10px] font-600 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {nota.visibilidad === 'privada' ? 'Solo yo' : 'Compartida'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleCrearNota} className="shrink-0 border-t border-slate-200 pt-4">
            <textarea
              value={nuevaNota}
              onChange={e => setNuevaNota(e.target.value)}
              placeholder="Escribe una nota..."
              className="w-full h-20 px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:border-brand-500 outline-none resize-none mb-3"
            ></textarea>
            
            <div className="flex items-center justify-between gap-3">
              <select 
                value={visibilidadNota}
                onChange={e => setVisibilidadNota(e.target.value as any)}
                className="h-9 px-2.5 text-xs font-500 border border-slate-200 rounded-lg bg-white outline-none focus:border-brand-500"
              >
                <option value="privada">Solo yo</option>
                <option value="compartida">Mi equipo</option>
              </select>
              <button 
                type="submit"
                disabled={!nuevaNota.trim() || isSubmittingNota}
                className="h-9 px-4 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-600 text-xs transition shadow-sm hover:shadow disabled:opacity-50"
              >
                {isSubmittingNota ? 'Guardando...' : 'Guardar nota'}
              </button>
            </div>
          </form>
        </div>

      </div>

    </div>
  )
}
