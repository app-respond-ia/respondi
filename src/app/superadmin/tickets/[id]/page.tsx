'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getTicketDetalleSuperadmin, responderTicket, asignarCategoriaPrioridad, cambiarEstatusTicket } from '@/app/actions/superadmin'
import { createClient } from '@/utils/supabase/client'
import Loading from '@/components/Loading'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export default function TicketDetalleSuperadminPage() {
  const { id } = useParams()
  const router = useRouter()
  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [realtimeStatus, setRealtimeStatus] = useState('conectando...')
  const mensajesEndRef = useRef<HTMLDivElement>(null)

  const cargarDetalle = useCallback(async () => {
    const res = await getTicketDetalleSuperadmin(id as string)
    if (res.success) {
      setTicket(res.data)
    } else {
      router.push('/superadmin/tickets')
    }
    setLoading(false)
  }, [id, router])

  useEffect(() => {
    cargarDetalle()

    const supabase = createClient()
    const channel = supabase
      .channel(`ticket-admin-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_ticket_messages', filter: `ticket_id=eq.${id}` },
        (payload) => {
          console.log('EVENTO RECIBIDO:', payload)
          setRealtimeStatus(`Evento recibido: ${JSON.stringify(payload.new)}`)
          cargarDetalle()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${id}` },
        () => cargarDetalle()
      )
      .subscribe((status) => {
        console.log('Realtime status:', status)
        setRealtimeStatus(status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, cargarDetalle])

  useEffect(() => {
    if (mensajesEndRef.current) {
      mensajesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [ticket?.support_ticket_messages])

  const handleEnviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoMensaje.trim() || isSubmitting) return

    setIsSubmitting(true)
    const res = await responderTicket(id as string, nuevoMensaje)
    
    if (res.success) {
      setNuevoMensaje('')
      cargarDetalle() // Recargar para obtener el mensaje con IDs reales y notificar
    }
    setIsSubmitting(false)
  }

  const handleChangeCategoria = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value || null
    setTicket({ ...ticket, categoria: newVal })
    await asignarCategoriaPrioridad(ticket.id, newVal, ticket.prioridad)
  }

  const handleChangePrioridad = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value
    setTicket({ ...ticket, prioridad: newVal })
    await asignarCategoriaPrioridad(ticket.id, ticket.categoria, newVal)
  }

  const handleToggleEstatus = async () => {
    const newStatus = ticket.estatus === 'abierto' ? 'cerrado' : 'abierto'
    setTicket({ ...ticket, estatus: newStatus })
    await cambiarEstatusTicket(ticket.id, newStatus)
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
          <div className="flex justify-between items-center mb-4">
            <Link href="/superadmin/tickets" className="inline-flex items-center gap-1.5 text-sm font-600 text-brand-600 hover:text-brand-700 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
              Volver a tickets
            </Link>
            <span className="text-[10px] uppercase font-700 text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              Realtime: {realtimeStatus}
            </span>
          </div>
          
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-display font-700 text-2xl text-ink-900 leading-tight">
              {ticket.asunto}
            </h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-700 uppercase tracking-wide shrink-0 ${getEstatusBadge(ticket.estatus)}`}>
              {ticket.estatus}
            </span>
          </div>
          <p className="text-sm text-ink-500 mt-1">
            Vendedor: <span className="font-600 text-ink-700">{ticket.vendedores?.nombre}</span>
          </p>
        </div>

        {/* Zona de Mensajes */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
          {(!ticket.support_ticket_messages || ticket.support_ticket_messages.length === 0) ? (
            <div className="text-center py-12 text-ink-400 text-sm">No hay mensajes.</div>
          ) : (
            ticket.support_ticket_messages.map((msg: any) => {
              const esVendedor = msg.users?.rol === 'vendedor' || msg.user_id === ticket.vendedores?.user_id
              
              return (
                <div key={msg.id} className={`flex gap-4 ${esVendedor ? '' : 'flex-row-reverse'}`}>
                  <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-700 text-sm uppercase ${esVendedor ? 'bg-slate-200 text-slate-600' : 'bg-brand-100 text-brand-700'}`}>
                    {msg.users?.nombre ? msg.users.nombre.substring(0, 2) : (esVendedor ? 'V' : 'S')}
                  </div>
                  <div className={`max-w-[80%] border rounded-2xl p-4 shadow-sm ${esVendedor ? 'bg-white border-slate-200 rounded-tl-none' : 'bg-brand-50 border-brand-100 rounded-tr-none'}`}>
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <p className="text-sm font-700 text-ink-900">
                        {msg.users?.nombre || (esVendedor ? 'Vendedor' : 'Soporte')}
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
        <div className="shrink-0 bg-white rounded-2xl border border-slate-200 p-2 sm:p-3 shadow-sm">
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
              {isSubmitting ? 'Enviando...' : 'Enviar'}
            </button>
          </form>
        </div>
      </div>

      {/* Panel lateral: Configuración del Ticket */}
      <div className="w-full lg:w-72 shrink-0 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5 shadow-sm sticky top-0">
          <h3 className="font-display font-700 text-lg text-ink-900 border-b border-slate-100 pb-3">Detalles del ticket</h3>
          
          <div>
            <label className="block text-sm font-600 text-ink-700 mb-2">Categoría</label>
            <select 
              value={ticket.categoria || ''} 
              onChange={handleChangeCategoria}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 text-sm focus:outline-none focus:border-brand-500 transition"
            >
              <option value="">Sin asignar</option>
              <option value="comisiones">Comisiones</option>
              <option value="clientes">Clientes</option>
              <option value="tecnico">Problema técnico</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-600 text-ink-700 mb-2">Prioridad</label>
            <select 
              value={ticket.prioridad || 'normal'} 
              onChange={handleChangePrioridad}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 text-sm focus:outline-none focus:border-brand-500 transition"
            >
              <option value="alta">Alta</option>
              <option value="normal">Normal</option>
              <option value="baja">Baja</option>
            </select>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button 
              onClick={handleToggleEstatus}
              className={`w-full h-10 rounded-xl font-600 text-sm transition ${
                ticket.estatus === 'abierto' 
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' 
                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
              }`}
            >
              {ticket.estatus === 'abierto' ? 'Cerrar ticket' : 'Reabrir ticket'}
            </button>
          </div>
        </div>
      </div>
      
    </div>
  )
}
