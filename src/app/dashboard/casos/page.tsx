'use client'
import Loading from '@/components/Loading'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getCasos, getAgentesParaCasos } from '@/app/actions/casos'
import { getMisPermisos } from '@/app/actions/permisos'

export default function CasosPage() {
  const router = useRouter()
  const [casos, setCasos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const isFirstMount = useRef(true)
  const [isFetching, setIsFetching] = useState(false)
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  
  const [agentesOpciones, setAgentesOpciones] = useState<any[]>([])
  const [agentesFilter, setAgentesFilter] = useState<string[]>([])
  
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('Todos')
  const [canalFilter, setCanalFilter] = useState('Todos')
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  
  const [showFilters, setShowFilters] = useState(false)
  const [agentSearch, setAgentSearch] = useState('')
  const filtersRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setShowFilters(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])
  
  const filteredAgentes = agentesOpciones.filter(ag => (ag.nombre || ag.email).toLowerCase().includes(agentSearch.toLowerCase()))
  
  const getActiveFiltersCount = () => {
    let count = 0
    if (canalFilter !== 'Todos') count++
    if (dateRange.from || dateRange.to) count++
    if (sortOrder !== 'desc') count++
    if (agentesFilter.length > 0) count++
    return count
  }

  const estados = ['Todos', 'Pendiente', 'Atendiendo', 'Resuelto']
  const canales = ['Todos', 'Instagram', 'WhatsApp', 'Facebook']

  useEffect(() => {
    const fetchAgentes = async () => {
      const res = await getAgentesParaCasos()
      if (res.success && res.data) setAgentesOpciones(res.data)
    }
    fetchAgentes()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const cargar = async () => {
      if (isFirstMount.current) {
        setLoading(true)
      }
      setIsFetching(true)

      const [res, permisosRes] = await Promise.all([
        getCasos({
          estado: estadoFilter,
          canal: canalFilter,
          search: debouncedSearch,
          agentesIds: agentesFilter,
          dateRange: dateRange.from || dateRange.to ? dateRange : undefined,
          sort: sortOrder
        }),
        getMisPermisos()
      ])

      if (res.success) setCasos(res.data || [])

      if (permisosRes.success) {
        if ((permisosRes as any).esAdmin) {
          setNivelPermiso('escritura')
        } else {
          const p = (permisosRes.data || []).find((p: any) => p.seccion === 'casos')
          setNivelPermiso(p?.nivel || 'ninguno')
        }
      }
      if (isFirstMount.current) {
        setLoading(false)
        isFirstMount.current = false
      }
      setIsFetching(false)
    }
    cargar()
  }, [estadoFilter, canalFilter, debouncedSearch, agentesFilter, dateRange, sortOrder])

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

  const getEstatusStyle = (estatus: string) => {
    if (estatus === 'pendiente') return 'bg-amber-100 text-amber-800'
    if (estatus === 'atendiendo') return 'bg-blue-100 text-blue-800'
    if (estatus === 'resuelto') return 'bg-emerald-100 text-emerald-800'
    return 'bg-slate-100 text-slate-800'
  }

  const getTimeAgo = (dateStr: string) => {
    const min = Math.round((new Date().getTime() - new Date(dateStr).getTime()) / 60000)
    if (min < 60) return `${min} m`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} h`
    return `${Math.floor(hr / 24)} d`
  }

  if (loading || nivelPermiso === null) {
    return <Loading />
  }

  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-10 text-center">
        <p className="text-ink-500 font-500">No tienes acceso a esta sección.</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-10 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 font-display">Casos</h1>
        <p className="text-ink-500 mt-1">Gestiona las conversaciones que requieren atención humana.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-6 relative">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center w-full">
          <div className="flex-1 flex gap-2 w-full">
            <div className="relative flex-1">
              <svg className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input type="text" placeholder="Buscar caso o cliente..." 
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none" />
            </div>
            
            <div className="relative" ref={filtersRef}>
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`h-10 px-4 rounded-xl text-sm font-medium border flex items-center gap-2 transition ${getActiveFiltersCount() > 0 ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
                Filtros
                {getActiveFiltersCount() > 0 && (
                  <span className="bg-brand-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">{getActiveFiltersCount()}</span>
                )}
              </button>

              {showFilters && (
                <div className="absolute top-full right-0 mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-[80vh] overflow-y-auto">
                  <div className="p-4 flex flex-col gap-5">
                    
                    <div>
                      <span className="block text-sm font-semibold text-slate-700 mb-2">Canal</span>
                      <div className="flex flex-wrap gap-2">
                        {canales.map(can => (
                          <button key={can} onClick={() => setCanalFilter(can)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${canalFilter === can ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            {can}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="block text-sm font-semibold text-slate-700">Agentes</span>
                        {agentesFilter.length > 0 && <span className="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-bold">{agentesFilter.length}</span>}
                      </div>
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="p-2 border-b border-slate-100 bg-slate-50">
                          <input type="text" placeholder="Buscar agente..." value={agentSearch} onChange={e => setAgentSearch(e.target.value)} className="w-full px-2 py-1 text-xs rounded border border-slate-200 focus:outline-none focus:border-brand-500" />
                        </div>
                        <div className="max-h-40 overflow-y-auto p-1">
                          <label className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-md cursor-pointer">
                            <input type="checkbox" checked={agentesFilter.includes('unassigned')} onChange={() => {
                              if (agentesFilter.includes('unassigned')) setAgentesFilter(agentesFilter.filter(id => id !== 'unassigned'))
                              else setAgentesFilter([...agentesFilter, 'unassigned'])
                            }} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                            <span className="text-xs text-slate-700">Sin asignar</span>
                          </label>
                          {filteredAgentes.map(ag => (
                            <label key={ag.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-md cursor-pointer">
                              <input type="checkbox" checked={agentesFilter.includes(ag.id)} onChange={() => {
                                if (agentesFilter.includes(ag.id)) setAgentesFilter(agentesFilter.filter(id => id !== ag.id))
                                else setAgentesFilter([...agentesFilter, ag.id])
                              }} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                              <span className="text-xs text-slate-700">{ag.nombre || ag.email}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <span className="block text-sm font-semibold text-slate-700 mb-2">Fecha</span>
                      <div className="flex items-center gap-2">
                        <input type="date" value={dateRange.from} onChange={e => setDateRange({...dateRange, from: e.target.value})} className="flex-1 w-full px-2 py-1.5 rounded-lg text-sm border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-slate-700 bg-white" />
                        <span className="text-slate-400">-</span>
                        <input type="date" value={dateRange.to} onChange={e => setDateRange({...dateRange, to: e.target.value})} className="flex-1 w-full px-2 py-1.5 rounded-lg text-sm border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-slate-700 bg-white" />
                      </div>
                    </div>

                    <div>
                      <span className="block text-sm font-semibold text-slate-700 mb-2">Orden</span>
                      <select value={sortOrder} onChange={e => setSortOrder(e.target.value as 'desc'|'asc')} className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-slate-700 bg-white">
                        <option value="desc">Más recientes primero</option>
                        <option value="asc">Más antiguos primero</option>
                      </select>
                    </div>

                  </div>
                  
                  {getActiveFiltersCount() > 0 && (
                    <div className="p-3 border-t border-slate-100 bg-slate-50">
                      <button onClick={() => {
                        setCanalFilter('Todos')
                        setDateRange({ from: '', to: '' })
                        setSortOrder('desc')
                        setAgentesFilter([])
                      }} className="w-full text-sm text-brand-600 font-semibold py-1.5 hover:bg-brand-50 rounded-lg transition">
                        Limpiar filtros
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
            {estados.map(est => (
              <button key={est} onClick={() => setEstadoFilter(est)}
                className={`px-4 h-8 rounded-lg text-sm font-medium transition ${estadoFilter === est ? 'bg-white text-ink-900 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-ink-900'}`}>
                {est}
              </button>
            ))}
          </div>
        </div>
      </div>

      {casos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
          </div>
          <h3 className="text-xl font-bold text-ink-900 mb-2">No hay casos por aquí</h3>
          <p className="text-slate-500 max-w-sm mx-auto">Tus filtros actuales no muestran resultados o todo está bajo control.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  <th className="p-4 pl-6 font-medium">Contacto</th>
                  <th className="p-4 font-medium">Caso</th>
                  <th className="p-4 font-medium">Descripción</th>
                  <th className="p-4 font-medium">Estado</th>
                  <th className="p-4 pr-6 font-medium text-right">Tiempo</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-slate-100 transition-opacity duration-200 ${isFetching ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                {casos.map(caso => (
                  <tr key={caso.id} onClick={() => router.push(`/dashboard/casos/${caso.id}`)} className="hover:bg-slate-100 transition group cursor-pointer">
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold font-display">
                            {caso.contacts?.nombre?.substring(0,2).toUpperCase() || 'US'}
                          </div>
                          <div className="absolute -bottom-1 -right-1 ring-2 ring-white rounded-full">
                            {getCanalIcon(caso.contacts?.canal || 'whatsapp')}
                          </div>
                        </div>
                        <div>
                          <p className="font-semibold text-ink-900 group-hover:text-brand-600 transition">{caso.contacts?.nombre || 'Desconocido'}</p>
                          <p className="text-xs text-slate-500">{caso.contacts?.identificador_canal}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-brand-600 font-medium group-hover:underline">
                        #{caso.id.substring(0,8).toUpperCase()}
                      </span>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {caso.conversations?.conversation_tags?.map((t:any, i:number) => {
                          const color = t.message_categories?.color || '#94a3b8'; // default slate-400
                          return (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded font-medium border"
                              style={{ 
                                backgroundColor: `${color}15`, 
                                color: color,
                                borderColor: `${color}30`
                              }}>
                              {t.message_categories?.nombre}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td className="p-4 max-w-xs truncate text-slate-600 text-sm">
                      {caso.descripcion || 'Sin descripción...'}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${getEstatusStyle(caso.estatus)}`}>
                        {caso.estatus}
                      </span>
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <p className="text-sm font-medium text-slate-700">{getTimeAgo(caso.fecha_apertura)}</p>
                      {caso.sla_horas && (
                        <p className="text-xs font-semibold text-amber-600 mt-1">SLA: {caso.sla_horas}h</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
