'use client'

import { useState, useEffect } from 'react'
import { getTicketsVendedor, crearTicketSoporte } from '@/app/actions/vendedor'
import Loading from '@/components/Loading'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export default function VendedorSoportePage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const [asunto, setAsunto] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const cargarTickets = async () => {
    setLoading(true)
    const res = await getTicketsVendedor()
    if (res.success && res.tickets) {
      setTickets(res.tickets)
    }
    setLoading(false)
  }

  useEffect(() => {
    cargarTickets()
  }, [])

  const handleCrearTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setIsSubmitting(true)
    
    const res = await crearTicketSoporte(asunto, mensaje)
    
    if (res.success) {
      setAsunto('')
      setMensaje('')
      setIsModalOpen(false)
      cargarTickets()
    } else {
      setErrorMsg(res.error || 'Error al crear el ticket')
    }
    setIsSubmitting(false)
  }

  const getEstatusBadge = (estatus: string) => {
    if (estatus === 'abierto') return 'bg-amber-100 text-amber-700'
    if (estatus === 'cerrado') return 'bg-emerald-100 text-emerald-700'
    return 'bg-slate-100 text-slate-700'
  }

  const getPrioridadBadge = (prioridad: string) => {
    if (prioridad === 'alta') return 'text-rose-600 bg-rose-50'
    if (prioridad === 'media') return 'text-amber-600 bg-amber-50'
    return 'text-slate-500 bg-slate-50'
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Ayuda y soporte</h1>
          <p className="text-ink-500 mt-1">Contacta con nuestro equipo para resolver tus dudas.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="h-11 px-5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-600 text-sm transition shadow-sm hover:shadow flex items-center gap-2 shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          Nuevo ticket
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {loading ? (
          <Loading />
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-12 h-12 text-ink-200 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            <h3 className="text-lg font-600 text-ink-900 mb-1">No tienes tickets</h3>
            <p className="text-ink-500 text-sm">Crea un nuevo ticket para hablar con nuestro equipo de soporte.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tickets.map(ticket => (
              <Link href={`/vendedor/soporte/${ticket.id}`} key={ticket.id} className="flex flex-col sm:flex-row gap-3 sm:gap-6 p-4 sm:p-5 hover:bg-slate-50 transition group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-600 uppercase tracking-wide ${getEstatusBadge(ticket.estatus)}`}>
                      {ticket.estatus}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-700 uppercase tracking-wide border border-current/10 ${getPrioridadBadge(ticket.prioridad)}`}>
                      Prioridad {ticket.prioridad}
                    </span>
                    <span className="text-xs text-ink-400 font-500">
                      {formatCategoria(ticket.categoria)}
                    </span>
                  </div>
                  <h4 className="font-600 text-ink-900 group-hover:text-brand-600 transition line-clamp-1">{ticket.asunto}</h4>
                </div>
                <div className="sm:text-right shrink-0 flex sm:flex-col justify-between items-center sm:items-end">
                  <span className="text-xs font-500 text-ink-400">
                    {formatDistanceToNow(new Date(ticket.fecha_apertura), { addSuffix: true, locale: es })}
                  </span>
                  <div className="text-brand-500 opacity-0 group-hover:opacity-100 transition hidden sm:block mt-1">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-display font-700 text-lg text-ink-900">Nuevo ticket de soporte</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-ink-400 hover:text-ink-700 transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            
            <form onSubmit={handleCrearTicket} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-red-50 text-red-700 text-sm font-500 rounded-lg">
                  {errorMsg}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-600 text-ink-900 mb-1.5">Asunto</label>
                <input 
                  type="text" 
                  value={asunto}
                  onChange={e => setAsunto(e.target.value)}
                  placeholder="Ej: Problema con la comisión de Acme Corp"
                  className="w-full px-3 h-11 rounded-xl border border-slate-300 text-sm text-ink-900 focus:ring-4 focus:ring-brand-100 focus:border-brand-500 outline-none transition"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-600 text-ink-900 mb-1.5">Mensaje inicial</label>
                <textarea 
                  value={mensaje}
                  onChange={e => setMensaje(e.target.value)}
                  placeholder="Explícanos tu duda o problema con el mayor detalle posible..."
                  rows={5}
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm text-ink-900 focus:ring-4 focus:ring-brand-100 focus:border-brand-500 outline-none transition resize-none"
                  required
                ></textarea>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 h-10 rounded-xl font-600 text-sm text-ink-600 hover:bg-slate-100 transition"
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-5 h-10 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-600 text-sm transition shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
                  disabled={isSubmitting || !asunto.trim() || !mensaje.trim()}
                >
                  {isSubmitting ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : 'Crear ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
