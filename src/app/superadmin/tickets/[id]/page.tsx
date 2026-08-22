'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getTicketDetalleSuperadmin, responderTicket, asignarCategoriaPrioridad, cambiarEstatusTicket, getCategoriasTickets, getSuperadmins, asignarTicket } from '@/app/actions/superadmin'
import { createClient } from '@/utils/supabase/client'
import Loading from '@/components/Loading'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export default function TicketDetalleSuperadminPage() {
  const { id } = useParams()
  const router = useRouter()
  const [ticket, setTicket] = useState<any>(null)
  const [categorias, setCategorias] = useState<any[]>([])
  const [superadmins, setSuperadmins] = useState<any[]>([])
  const [miUserId, setMiUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTogglingEstatus, setIsTogglingEstatus] = useState(false)
  const mensajesEndRef = useRef<HTMLDivElement>(null)

  const cargarDetalle = useCallback(async () => {
    const res = await getTicketDetalleSuperadmin(id as string)
    if (res.success) {
      setTicket(res.data)
    } else {
      router.push('/superadmin/tickets')
      return
    }

    const [catsRes, adminsRes] = await Promise.all([
      getCategoriasTickets(),
      getSuperadmins()
    ])
    if (catsRes.success && catsRes.data) setCategorias(catsRes.data)
    if (adminsRes.success && adminsRes.data) setSuperadmins(adminsRes.data)

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
        setMiUserId(session.user.id)
      }

      if (!isMounted) return

      channel = supabase
        .channel(`ticket-admin-${id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'support_ticket_messages', filter: `ticket_id=eq.${id}` },
          () => cargarDetalle()
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${id}` },
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
    setTicket({ ...ticket, categoria_id: newVal })
    await asignarCategoriaPrioridad(ticket.id, newVal, ticket.prioridad)
  }

  const handleChangePrioridad = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value
    setTicket({ ...ticket, prioridad: newVal })
    await asignarCategoriaPrioridad(ticket.id, ticket.categoria_id, newVal)
  }

  const handleAsignar = async (userId: string | null) => {
    setTicket({ ...ticket, asignado_a: userId })
    await asignarTicket(ticket.id, userId)
  }

  const handleToggleEstatus = async () => {
    if (isTogglingEstatus) return
    setIsTogglingEstatus(true)
    const newStatus = ticket.estatus === 'abierto' ? 'cerrado' : 'abierto'
    const res = await cambiarEstatusTicket(ticket.id, newStatus)
    if (res.success) {
      setTicket({ ...ticket, estatus: newStatus })
    }
    setIsTogglingEstatus(false)
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
          <Link href="/superadmin/tickets" className="inline-flex items-center gap-1.5 text-sm font-600 text-brand-600 hover:text-brand-700 transition mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            Volver a tickets
          </Link>
          
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
        <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-600 text-ink-700">Categoría</label>
              <Link href="/superadmin/tickets/categorias" className="text-xs font-500 text-brand-600 hover:text-brand-700 transition">Gestionar categorías</Link>
            </div>
            <select 
              value={ticket.categoria_id || ''} 
              onChange={handleChangeCategoria}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 text-sm focus:outline-none focus:border-brand-500 transition"
            >
              <option value="">Sin asignar</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
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

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-600 text-ink-700">Asignado a</label>
              {miUserId && ticket.asignado_a !== miUserId && (
                <button type="button" onClick={() => handleAsignar(miUserId)} className="text-xs font-500 text-brand-600 hover:text-brand-700 transition">Asignarme a mí</button>
              )}
            </div>
            <select 
              value={ticket.asignado_a || ''} 
              onChange={(e) => handleAsignar(e.target.value || null)}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 text-sm focus:outline-none focus:border-brand-500 transition"
            >
              <option value="">Sin asignar</option>
              {superadmins.map(admin => (
                <option key={admin.id} value={admin.id}>{admin.nombre}</option>
              ))}
            </select>
          </div>

          <div className="pt-2">
            <button 
              onClick={handleToggleEstatus}
              className={`w-full h-10 rounded-xl font-600 text-sm transition shadow-sm hover:shadow flex items-center justify-center gap-2 ${
                ticket.estatus === 'cerrado' 
                  ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50' 
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white'
              }`}
            >
              {ticket.estatus === 'cerrado' ? 'Reabrir ticket' : 'Marcar como resuelto'}
            </button>
          </div>

          {ticket.calificacion && (
            <div className="border-t border-slate-100 pt-4 mt-2">
              <h4 className="font-600 text-sm text-ink-900 mb-2">Valoración del Vendedor</h4>
              <div className="flex gap-1 mb-2">
                {[1,2,3,4,5].map(star => (
                  <svg key={star} className={`w-4 h-4 ${star <= ticket.calificacion ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                ))}
              </div>
              {ticket.comentario_calificacion && (
                <p className="text-xs text-ink-600 italic mt-1">"{ticket.comentario_calificacion}"</p>
              )}
            </div>
          )}
        </div>
      </div>
      
    </div>
  )
}
