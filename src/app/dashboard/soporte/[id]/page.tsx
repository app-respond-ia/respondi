'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getTicketDetalleCliente, enviarMensajeTicketCliente } from '@/app/actions/soporte-cliente'
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
  const [loading, setLoading] = useState(true)
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const mensajesEndRef = useRef<HTMLDivElement>(null)

  const cargarDetalle = useCallback(async () => {
    const res = await getTicketDetalleCliente(id as string)
    if (res.success && res.data) {
      setTicket(res.data)
      setMensajes(res.data.mensajes || [])
    } else {
      router.push('/dashboard/soporte')
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
      // Si el ticket estaba cerrado, se reabre en el backend, actualizamos estado local
      if (ticket.estatus === 'cerrado') {
        setTicket((prev: any) => ({ ...prev, estatus: 'abierto' }))
      }
    }
    setIsSubmitting(false)
  }

  const getEstatusBadge = (estatus: string) => {
    if (estatus === 'abierto') return 'bg-amber-100 text-amber-700'
    if (estatus === 'cerrado') return 'bg-emerald-100 text-emerald-700'
    return 'bg-slate-100 text-slate-700'
  }

  if (loading) return <Loading />
  if (!ticket) return null

  return (
    <div className="max-w-3xl mx-auto space-y-6 flex flex-col h-[calc(100vh-8rem)]">
      
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
  )
}
