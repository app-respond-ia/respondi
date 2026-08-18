'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getTicketDetalle, enviarMensajeTicket } from '@/app/actions/vendedor'
import Loading from '@/components/Loading'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export default function TicketDetallePage() {
  const { id } = useParams()
  const router = useRouter()
  const [ticket, setTicket] = useState<any>(null)
  const [mensajes, setMensajes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const mensajesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cargarDetalle = async () => {
      const res = await getTicketDetalle(id as string)
      if (res.success) {
        setTicket(res.ticket)
        setMensajes(res.mensajes || [])
      } else {
        router.push('/vendedor/soporte')
      }
      setLoading(false)
    }
    cargarDetalle()
  }, [id, router])

  useEffect(() => {
    if (mensajesEndRef.current) {
      mensajesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [mensajes])

  const handleEnviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoMensaje.trim() || isSubmitting) return

    setIsSubmitting(true)
    const res = await enviarMensajeTicket(id as string, nuevoMensaje)
    
    if (res.success && res.mensaje) {
      setMensajes(prev => [...prev, res.mensaje])
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

  const formatCategoria = (cat: string) => {
    if (!cat) return 'Sin asignar'
    const categorias: Record<string, string> = {
      'comisiones': 'Comisiones',
      'clientes': 'Clientes',
      'tecnico': 'Técnico',
      'facturacion': 'Facturación',
      'otro': 'Otro'
    }
    return categorias[cat] || cat
  }

  if (loading) return <Loading />
  if (!ticket) return null

  return (
    <div className="max-w-3xl mx-auto space-y-6 flex flex-col h-[calc(100vh-8rem)]">
      
      {/* Header del Ticket */}
      <div className="shrink-0">
        <Link href="/vendedor/soporte" className="inline-flex items-center gap-1.5 text-sm font-600 text-brand-600 hover:text-brand-700 transition mb-4">
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
          <span className="text-sm font-500 text-ink-500 bg-slate-100 px-3 py-1 rounded-full">
            Categoría: {formatCategoria(ticket.categoria)}
          </span>
          <span className="text-sm font-500 text-ink-500 bg-slate-100 px-3 py-1 rounded-full">
            Prioridad: <span className="capitalize">{ticket.prioridad}</span>
          </span>
        </div>
      </div>

      {/* Zona de Mensajes */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar">
        {mensajes.length === 0 ? (
          <div className="text-center py-12 text-ink-400 text-sm">No hay mensajes.</div>
        ) : (
          mensajes.map((msg, index) => {
            // El usuario actual es el vendedor_id de session o lo inferimos porque msg.users.nombre será del superadmin o del vendedor.
            // Para simplificar, si msg.users.rol !== 'vendedor', asumimos superadmin (o checkeamos si user_id coincide con el actual).
            // En este caso, si msg.users.nombre existe, es del usuario; si el ticket es del vendedor y el user_id es distinto al del vendedor (no lo tenemos directamente en client, pero podemos inferirlo de si el msj lo envía soporte)
            // Forma sencilla: los mensajes del vendedor tienen fondo blanco y borde, los de soporte fondo brand-50.
            const esMio = !msg.users || !msg.users.email?.includes('@respondi') // Esto es una heorística simple. En produccion se deberia comprobar userId===msg.user_id
            
            // Asumiendo que podemos deducir si es del staff por un flag o asumiendo alternancia
            // Vamos a mostrar un diseño neutral donde el autor está claro arriba.
            
            return (
              <div key={msg.id} className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0 flex items-center justify-center text-slate-600 font-700 text-sm uppercase">
                  {msg.users?.nombre ? msg.users.nombre.substring(0, 2) : 'S'}
                </div>
                <div className="flex-1 bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 shadow-sm">
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <p className="text-sm font-700 text-ink-900">
                      {msg.users?.nombre || 'Soporte Respondi'}
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
            {isSubmitting ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : 'Enviar'}
          </button>
        </form>
      </div>

    </div>
  )
}
