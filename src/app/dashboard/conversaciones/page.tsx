'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getConversaciones } from '@/app/actions/conversaciones'

export default function ConversacionesPage() {
  const [conversaciones, setConversaciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('Todas')
  const [canalFilter, setCanalFilter] = useState('Todos')
  const [iaPausada, setIaPausada] = useState(false)

  const estados = ['Todas', 'Activas', 'Cerradas']
  const canales = ['Todos', 'Instagram', 'WhatsApp', 'Facebook']

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      const res = await getConversaciones({
        estado: estadoFilter,
        canal: canalFilter,
        search: search,
        iaPausada: iaPausada
      })
      if (res.success) setConversaciones(res.data || [])
      setLoading(false)
    }
    cargar()
  }, [estadoFilter, canalFilter, search, iaPausada])

  const getCanalIcon = (canal: string) => {
    if (canal === 'instagram') {
      return (
        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
        </div>
      )
    }
    if (canal === 'whatsapp') {
      return (
        <div className="w-6 h-6 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12.01 2.014a9.982 9.982 0 00-8.528 15.17l-1.435 5.253 5.372-1.41a9.98 9.98 0 104.591-19.013zm4.568 13.626c-.19.532-1.112 1.01-1.543 1.042-.4.03-1.002.136-3.14-.746-2.585-1.066-4.238-3.705-4.364-3.876-.128-.17-1.043-1.385-1.043-2.641 0-1.256.65-1.874.882-2.129.231-.255.503-.319.673-.319.17 0 .34.004.49.01.155.008.362-.061.567.436.213.518.736 1.795.8 1.922.064.128.106.277.02.447-.085.17-.128.277-.255.425-.128.149-.27.327-.383.447-.128.128-.266.266-.118.521.149.255.663 1.096 1.428 1.782.99.889 1.82 1.155 2.075 1.282.255.128.404.106.553-.064.149-.17.638-.745.808-1.001.17-.255.34-.213.574-.128.234.085 1.488.702 1.743.83.255.128.425.191.489.3.064.106.064.617-.127 1.149z"/></svg>
        </div>
      )
    }
    return (
      <div className="w-6 h-6 rounded-full bg-[#1877F2] flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      </div>
    )
  }

  const formatFecha = (dateStr: string) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    const hoy = new Date()
    if (d.getDate() === hoy.getDate() && d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
  }

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 font-display">Conversaciones</h1>
        <p className="text-ink-500 mt-1">Revisa el historial de interacciones con tus clientes.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="relative w-full md:w-80 lg:w-96">
            <svg className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" placeholder="Buscar por nombre, teléfono o contenido..." 
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition" />
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
              {estados.map(est => (
                <button key={est} onClick={() => setEstadoFilter(est)}
                  className={`px-4 h-9 rounded-lg text-sm font-medium transition ${estadoFilter === est ? 'bg-white text-ink-900 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-ink-900'}`}>
                  {est}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl hover:bg-slate-100 transition">
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={iaPausada} onChange={e => setIaPausada(e.target.checked)} />
                <div className={`block w-10 h-6 rounded-full transition ${iaPausada ? 'bg-amber-500' : 'bg-slate-300'}`}></div>
                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform ${iaPausada ? 'translate-x-4' : ''}`}></div>
              </div>
              <span className="text-sm font-medium text-slate-700 select-none">Solo IA pausada</span>
            </label>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
          <span className="text-sm font-medium text-slate-500">Canal:</span>
          <div className="flex flex-wrap gap-2">
            {canales.map(can => (
              <button key={can} onClick={() => setCanalFilter(can)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${canalFilter === can ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {can}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-500 font-medium">Cargando conversaciones...</div>
      ) : conversaciones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          </div>
          <h3 className="text-xl font-bold text-ink-900 mb-2">No hay conversaciones</h3>
          <p className="text-slate-500 max-w-sm mx-auto">Tus filtros actuales no muestran resultados.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  <th className="p-4 pl-6 font-medium">Contacto</th>
                  <th className="p-4 font-medium">Resumen / Etiquetas</th>
                  <th className="p-4 font-medium text-center">IA</th>
                  <th className="p-4 font-medium text-center">Estado</th>
                  <th className="p-4 pr-6 font-medium text-right">Último mensaje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {conversaciones.map((conv) => {
                  const contact = Array.isArray(conv.contacts) ? conv.contacts[0] : conv.contacts
                  return (
                    <tr key={conv.id} className="hover:bg-slate-50/50 transition group cursor-pointer relative">
                      <td className="p-4 pl-6">
                        <Link href={`/dashboard/conversaciones/${conv.id}`} className="absolute inset-0 z-0"></Link>
                        <div className="flex items-center gap-3 relative z-10 pointer-events-none">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold font-display">
                              {contact?.nombre?.substring(0,2).toUpperCase() || 'US'}
                            </div>
                            <div className="absolute -bottom-1 -right-1 ring-2 ring-white rounded-full">
                              {getCanalIcon(contact?.canal || conv.canal)}
                            </div>
                          </div>
                          <div>
                            <p className="font-semibold text-ink-900 group-hover:text-brand-600 transition">{contact?.nombre || 'Desconocido'}</p>
                            <p className="text-xs text-slate-500">{contact?.identificador_canal}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 max-w-sm relative z-10 pointer-events-none">
                        <p className="text-sm text-slate-600 truncate mb-1.5 font-medium">
                          {conv.resumen || <span className="italic opacity-60 font-normal">Sin resumen aún...</span>}
                        </p>
                        <div className="flex gap-1 flex-wrap">
                          {conv.conversation_tags?.map((t:any, i:number) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                              {t.message_categories?.nombre}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-center relative z-10 pointer-events-none">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${
                          conv.ia_pausada ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {conv.ia_pausada ? 'Pausada' : 'Activa'}
                        </span>
                      </td>
                      <td className="p-4 text-center relative z-10 pointer-events-none">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                          conv.estado === 'activa' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {conv.estado}
                        </span>
                      </td>
                      <td className="p-4 pr-6 text-right relative z-10 pointer-events-none">
                        <p className="text-sm font-semibold text-slate-700">
                          {formatFecha(conv.fecha_ultimo_mensaje || conv.fecha_inicio)}
                        </p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
