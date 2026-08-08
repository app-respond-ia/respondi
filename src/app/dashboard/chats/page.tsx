'use client'
import Loading from '@/components/Loading'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getConversaciones, getMensajes, toggleIAPausa, cerrarConversacion, reabrirConversacion, getContextoChat, getEtiquetasTenant } from '@/app/actions/chats'
import { enviarMensajeAgenteConv } from '@/app/actions/conversaciones'
import { getMisPermisos } from '@/app/actions/permisos'
import { reabrirCaso, getAgentesParaCasos, crearCasoDesdeConversacion, asignarCaso, soltarCaso } from '@/app/actions/casos'
import { getLogsAuditoria } from '@/app/actions/audit-log'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { HelpPopover } from '@/components/ui/HelpPopover'
import { MessageBubble } from '@/components/ui/MessageBubble'
import { ActivityLog } from '@/components/ui/ActivityLog'
import { AIToggle } from '@/components/ui/AIToggle'
import Link from 'next/link'

function ChatsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialChatId = searchParams.get('chat')

  const [conversaciones, setConversaciones] = useState<any[]>([])
  const [mensajes, setMensajes] = useState<any[]>([])
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const isFirstMount = useRef(true)
  
  const [busqueda, setBusqueda] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filtroActivo, setFiltroActivo] = useState<'Todas' | 'Activas' | 'Cerradas'>('Todas')
  const [asignadosAMi, setAsignadosAMi] = useState(false)
  
  const [canalFilter, setCanalFilter] = useState('Todos')
  const [iaFilter, setIaFilter] = useState('Todas') 
  const [casoFilter, setCasoFilter] = useState('Todas') 
  const [agentesIds, setAgentesIds] = useState<string[]>([])
  const [etiquetasIds, setEtiquetasIds] = useState<string[]>([])
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  
  const [showFilters, setShowFilters] = useState(false)
  const filtersRef = useRef<HTMLDivElement>(null)
  
  const [etiquetasTenant, setEtiquetasTenant] = useState<any[]>([])
  const [agentFilterSearch, setAgentFilterSearch] = useState('')
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  
  // Contexto adicional
  const [contexto, setContexto] = useState<any>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [agentes, setAgentes] = useState<any[]>([])
  const [hasLogPerm, setHasLogPerm] = useState(false)
  const [loadingContext, setLoadingContext] = useState(false)
  
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [mensajeGlobal, setMensajeGlobal] = useState<{tipo: string, texto: string} | null>(null)
  
  const [mensajeText, setMensajeText] = useState('')
  const [enviando, setEnviando] = useState(false)
  
  const [procesando, setProcesando] = useState(false)
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    action: 'reabrir_caso' | 'reabrir_conv' | 'asignar_mi' | 'asignar_otro' | 'cola' | 'asignar_mi_existente' | 'asignar_otro_existente' | 'soltar_existente' | null;
    targetAgenteId?: string;
  }>({ isOpen: false, action: null })
  
  const [agentSearch, setAgentSearch] = useState('')
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const agentDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkLogs = async () => {
      const perms = await getMisPermisos()
      if (perms.success && perms.data) {
        const isAdmin = perms.data.role === 'admin' || perms.data.role === 'owner'
        const hasAudit = perms.data.permissions.includes('view_audit_log')
        setHasLogPerm(isAdmin || hasAudit)
      }
    }
    checkLogs()
    
    getEtiquetasTenant().then(res => {
      if (res.success && res.data) setEtiquetasTenant(res.data)
    })
    
    function handleClickOutside(event: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setShowFilters(false)
      }
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) {
        setShowAgentDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(busqueda)
    }, 400)
    return () => clearTimeout(timer)
  }, [busqueda])

  const getActiveFiltersCount = () => {
    let count = 0
    if (canalFilter !== 'Todos') count++
    if (iaFilter !== 'Todas') count++
    if (casoFilter !== 'Todas') count++
    if (agentesIds.length > 0) count++
    if (etiquetasIds.length > 0) count++
    if (dateRange.from || dateRange.to) count++
    if (sortOrder !== 'desc') count++
    return count
  }

  const canales = ['Todos', 'Instagram', 'WhatsApp', 'Facebook']

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const cargarConversaciones = async () => {
    if (isFirstMount.current) setLoadingChats(true)
    setIsFetching(true)
    
    const [res, permisosRes] = await Promise.all([
      getConversaciones({
        estado: filtroActivo,
        search: debouncedSearch,
        canal: canalFilter,
        iaPausada: iaFilter,
        tieneCaso: casoFilter,
        asignadosAMi: asignadosAMi,
        agentesIds: agentesIds,
        etiquetasIds: etiquetasIds,
        dateRange: dateRange.from || dateRange.to ? dateRange : undefined,
        sort: sortOrder
      }),
      getMisPermisos()
    ])

    if (res.success && res.data) {
      setConversaciones(res.data.conversaciones || [])
    } else {
      setMensajeGlobal({ tipo: 'error', texto: res.error || 'Error al cargar chats' })
    }

    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        setNivelPermiso('escritura')
        setHasLogPerm(true)
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'chats')
        setNivelPermiso(p?.nivel || 'ninguno')
        setHasLogPerm((permisosRes.data || []).some((p: any) => p.seccion === 'audit_logs'))
      }
    }
    
    if (initialChatId && res.success && res.data && isFirstMount.current) {
      const exists = (res.data.conversaciones || []).find((c: any) => c.id === initialChatId)
      if (exists) {
        setSelectedConvId(initialChatId)
        router.replace('/dashboard/chats', { scroll: false })
      }
    }

    if (isFirstMount.current) {
      setLoadingChats(false)
      isFirstMount.current = false
    }
    setIsFetching(false)
  }

  useEffect(() => {
    cargarConversaciones()
  }, [filtroActivo, debouncedSearch, canalFilter, iaFilter, casoFilter, asignadosAMi, agentesIds, etiquetasIds, dateRange, sortOrder])

  useEffect(() => {
    if (selectedConvId) {
      cargarMensajes(selectedConvId)
      cargarContexto(selectedConvId)
    } else {
      setContexto(null)
      setLogs([])
    }
  }, [selectedConvId])

  const cargarContexto = async (id: string) => {
    setLoadingContext(true)
    try {
      const [ctxRes, agRes, logRes] = await Promise.all([
        getContextoChat(id),
        getAgentesParaCasos(),
        hasLogPerm ? getLogsAuditoria('conversations', id) : Promise.resolve({ success: true, data: [] })
      ])
      
      if (ctxRes.success && ctxRes.data) {
        setContexto(ctxRes.data)
      }
      if (agRes.success && agRes.data) {
        setAgentes(agRes.data)
      }
      if (logRes.success && logRes.data) {
        setLogs(logRes.data)
      }
    } catch (error) {
      console.error(error)
    }
    setLoadingContext(false)
  }

  const cargarMensajes = async (id: string) => {
    setLoadingMsgs(true)
    setMensajes([])
    const res = await getMensajes(id)
    if (res.success && res.data) {
      setMensajes(res.data.mensajes || [])
    } else {
      setMensajeGlobal({ tipo: 'error', texto: res.error || 'Error al cargar mensajes' })
    }
    setLoadingMsgs(false)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])



  const handleCerrar = async (conv: any) => {
    if (confirm('¿Cerrar esta conversación?')) {
      const res = await cerrarConversacion(conv.id)
      if (res.success && res.data) {
        setConversaciones(prev => prev.map(c => c.id === conv.id ? { ...c, estado: res.data.estado } : c))
      }
    }
  }

  const handleConfirmAction = async () => {
    if (!selectedConvId) return
    setProcesando(true)
    let success = false

    if (modalState.action === 'reabrir_conv') {
      const res = await reabrirConversacion(selectedConvId)
      if (res.success && res.data) {
        setConversaciones(prev => prev.map(c => c.id === selectedConvId ? { ...c, estado: res.data.estado } : c))
        success = true
      }
    } else if (modalState.action === 'reabrir_caso') {
      const selectedConv = conversaciones.find(c => c.id === selectedConvId)
      const casoId = selectedConv?.cases?.[0]?.id
      if (casoId) {
        const res = await reabrirCaso(casoId)
        if (res.success) {
          // Update local case status
          setConversaciones(prev => prev.map(c => {
            if (c.id === selectedConvId && c.cases?.[0]) {
              return { ...c, cases: [{ ...c.cases[0], estatus: 'atendiendo' }] }
            }
            return c
          }))
          success = true
        }
      }
    } else if (modalState.action === 'asignar_mi' || modalState.action === 'asignar_otro' || modalState.action === 'cola') {
      let targetAgenteId = null
      if (modalState.action === 'asignar_mi') {
        const perms = await getMisPermisos()
        targetAgenteId = perms.data?.userId
      }
      if (modalState.action === 'asignar_otro' && modalState.targetAgenteId) {
        targetAgenteId = modalState.targetAgenteId
      }
      const res = await crearCasoDesdeConversacion(selectedConvId, targetAgenteId)
      if (res.success) {
        cargarContexto(selectedConvId)
        success = true
      } else {
        alert(res.error || 'Error al generar el caso')
      }
    } else if (modalState.action === 'asignar_mi_existente' || modalState.action === 'asignar_otro_existente' || modalState.action === 'soltar_existente') {
      const casoId = contexto?.caso_asociado?.id
      if (casoId) {
        let res
        if (modalState.action === 'soltar_existente') {
          res = await soltarCaso(casoId)
        } else {
          let targetAgenteId = null
          if (modalState.action === 'asignar_mi_existente') {
            const perms = await getMisPermisos()
            targetAgenteId = perms.data?.userId
          } else if (modalState.action === 'asignar_otro_existente') {
            targetAgenteId = modalState.targetAgenteId
          }
          if (targetAgenteId) {
            res = await asignarCaso(casoId, targetAgenteId)
          }
        }
        if (res && res.success) {
          cargarContexto(selectedConvId)
          success = true
        } else {
          alert(res?.error || 'Error al actualizar el caso')
        }
      }
    }

    if (success) {
      setModalState({ isOpen: false, action: null })
    }
    setProcesando(false)
  }

  const handleToggleIA = async (newPausedState: boolean) => {
    if (!selectedConvId) return false
    const res = await toggleIAPausa(selectedConvId, newPausedState)
    if (res.success && res.data) {
      setConversaciones(prev => prev.map(c => c.id === selectedConvId ? { ...c, ia_pausada: newPausedState } : c))
      cargarContexto(selectedConvId)
      return true
    } else {
      alert(res?.error || 'Error al modificar estado de la IA')
      return false
    }
  }

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mensajeText.trim() || !selectedConvId) return
    
    setEnviando(true)
    const res = await enviarMensajeAgenteConv(selectedConvId, mensajeText)
    if (res.success) {
      setMensajeText('')
      cargarMensajes(selectedConvId)
    } else {
      setMensajeGlobal({ tipo: 'error', texto: res.error || 'Error al enviar mensaje' })
    }
    setEnviando(false)
  }

  // Formatting helpers
  const getInitials = (name?: string) => name ? name.substring(0, 2).toUpperCase() : '??'
  
  const formatTime = (dateStr: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
  }

  const selectedConv = conversaciones.find(c => c.id === selectedConvId)

  if (loadingChats || nivelPermiso === null) {
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
    <div className="flex-1 -mx-4 sm:-mx-6 lg:-mx-8 -my-6 flex lg:flex-row overflow-hidden bg-white border-t border-slate-200">
      {/* PANEL IZQUIERDO */}
      <section className={`flex flex-col w-full lg:w-[320px] xl:w-96 lg:shrink-0 border-r border-slate-200 bg-white h-full ${selectedConvId ? 'hidden lg:flex' : 'flex'}`}>
        <div className="px-4 h-20 flex items-center gap-3 border-b border-slate-200 shrink-0">
          <h1 className="font-display font-700 text-xl text-ink-900">Chats</h1>
          <span className="text-xs font-600 px-2 py-0.5 rounded-md bg-brand-100 text-brand-700">
            {conversaciones.filter(c => c.estado === 'activa').length} activas
          </span>
        </div>

        <div className="p-3 space-y-2 border-b border-slate-200 shrink-0 relative z-40">
          {/* Fila 1: Buscador y Filtros */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:bg-white transition"
              />
            </div>
            
            <div className="relative" ref={filtersRef}>
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`h-9 px-3 rounded-lg text-sm font-medium border flex items-center gap-2 transition ${getActiveFiltersCount() > 0 ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
              >
                Filtros
                {getActiveFiltersCount() > 0 && (
                  <span className="bg-brand-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{getActiveFiltersCount()}</span>
                )}
              </button>
              
              {showFilters && (
                <div className="absolute top-full left-0 md:left-auto md:right-0 mt-2 w-[300px] bg-white rounded-xl shadow-xl border border-slate-200 z-50 flex flex-col max-h-[70vh] overflow-hidden">
                  <div className="p-4 flex flex-col gap-4 overflow-y-auto">
                    
                    <div>
                      <span className="block text-xs font-semibold text-slate-700 mb-1.5">Canal</span>
                      <div className="flex flex-wrap gap-1.5">
                        {canales.map(can => (
                          <button key={can} onClick={() => setCanalFilter(can)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${canalFilter === can ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            {can}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold text-slate-700 mb-1.5">IA</span>
                      <div className="flex bg-slate-100 p-1 rounded-lg">
                        {['Todas', 'Activa', 'Pausada'].map(opt => (
                          <button key={opt} onClick={() => setIaFilter(opt)}
                            className={`flex-1 py-1 text-[11px] font-medium rounded-md transition ${iaFilter === opt ? 'bg-white shadow-sm text-ink-900' : 'text-slate-500 hover:text-ink-700'}`}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold text-slate-700 mb-1.5">Tiene caso</span>
                      <select value={casoFilter} onChange={e => setCasoFilter(e.target.value)} className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-brand-500">
                        <option value="Todas">Todas</option>
                        <option value="Con caso">Con caso</option>
                        <option value="Sin caso">Sin caso</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-700">Agentes del caso</span>
                        {agentesIds.length > 0 && <span className="text-[9px] bg-brand-100 text-brand-700 px-1 rounded font-bold">{agentesIds.length}</span>}
                      </div>
                      <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col max-h-32">
                        <input type="text" placeholder="Buscar agente..." value={agentFilterSearch} onChange={e => setAgentFilterSearch(e.target.value)} className="px-2 py-1.5 text-[11px] border-b border-slate-100 bg-slate-50 outline-none w-full" />
                        <div className="overflow-y-auto p-1 flex-1">
                          <label className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                            <input type="checkbox" checked={agentesIds.includes('unassigned')} onChange={() => {
                              if (agentesIds.includes('unassigned')) setAgentesIds(prev => prev.filter(id => id !== 'unassigned'))
                              else setAgentesIds(prev => [...prev, 'unassigned'])
                            }} className="rounded text-brand-600 focus:ring-brand-500 w-3 h-3" />
                            <span className="text-[11px] text-slate-700 font-medium italic">Sin asignar</span>
                          </label>
                          {agentes.filter(a => (a.nombre || a.email).toLowerCase().includes(agentFilterSearch.toLowerCase())).map(a => (
                            <label key={a.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                              <input type="checkbox" checked={agentesIds.includes(a.id)} onChange={() => {
                                if (agentesIds.includes(a.id)) setAgentesIds(prev => prev.filter(id => id !== a.id))
                                else setAgentesIds(prev => [...prev, a.id])
                              }} className="rounded text-brand-600 focus:ring-brand-500 w-3 h-3" />
                              <span className="text-[11px] text-slate-700 truncate">{a.nombre || a.email}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-700">Etiquetas</span>
                        {etiquetasIds.length > 0 && <span className="text-[9px] bg-brand-100 text-brand-700 px-1 rounded font-bold">{etiquetasIds.length}</span>}
                      </div>
                      <div className="border border-slate-200 rounded-lg max-h-24 overflow-y-auto p-1">
                        {etiquetasTenant.map(t => (
                          <label key={t.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                            <input type="checkbox" checked={etiquetasIds.includes(t.id)} onChange={() => {
                              if (etiquetasIds.includes(t.id)) setEtiquetasIds(prev => prev.filter(id => id !== t.id))
                              else setEtiquetasIds(prev => [...prev, t.id])
                            }} className="rounded text-brand-600 focus:ring-brand-500 w-3 h-3" />
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }}></div>
                              <span className="text-[11px] text-slate-700 truncate">{t.nombre}</span>
                            </div>
                          </label>
                        ))}
                        {etiquetasTenant.length === 0 && <span className="text-[10px] text-slate-400 p-1">No hay etiquetas creadas</span>}
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold text-slate-700 mb-1.5">Fecha (último mensaje)</span>
                      <div className="flex items-center gap-1.5">
                        <input type="date" value={dateRange.from} onChange={e => setDateRange({...dateRange, from: e.target.value})} className="flex-1 w-full px-2 py-1 rounded text-[11px] border border-slate-200 outline-none text-slate-700 bg-slate-50" />
                        <span className="text-slate-400 text-xs">-</span>
                        <input type="date" value={dateRange.to} onChange={e => setDateRange({...dateRange, to: e.target.value})} className="flex-1 w-full px-2 py-1 rounded text-[11px] border border-slate-200 outline-none text-slate-700 bg-slate-50" />
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-semibold text-slate-700 mb-1.5">Orden</span>
                      <select value={sortOrder} onChange={e => setSortOrder(e.target.value as 'desc'|'asc')} className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-brand-500">
                        <option value="desc">Más recientes primero</option>
                        <option value="asc">Más antiguos primero</option>
                      </select>
                    </div>

                  </div>
                  
                  {getActiveFiltersCount() > 0 && (
                    <div className="p-2 border-t border-slate-100 bg-slate-50">
                      <button onClick={() => {
                        setCanalFilter('Todos')
                        setIaFilter('Todas')
                        setCasoFilter('Todas')
                        setAgentesIds([])
                        setEtiquetasIds([])
                        setDateRange({ from: '', to: '' })
                        setSortOrder('desc')
                      }} className="w-full text-xs text-brand-600 font-semibold py-1.5 hover:bg-brand-50 rounded-lg transition">
                        Limpiar todos los filtros
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Fila 2: Estados y Asignados a mi */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button onClick={() => setFiltroActivo('Todas')} className={`shrink-0 px-2 py-1 rounded text-[11px] font-600 transition ${filtroActivo === 'Todas' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-600'}`}>Todas</button>
              <button onClick={() => setFiltroActivo('Activas')} className={`shrink-0 px-2 py-1 rounded text-[11px] font-600 transition ${filtroActivo === 'Activas' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-600'}`}>Activas</button>
              <button onClick={() => setFiltroActivo('Cerradas')} className={`shrink-0 px-2 py-1 rounded text-[11px] font-600 transition ${filtroActivo === 'Cerradas' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-600'}`}>Cerradas</button>
            </div>
            
            <label className="flex items-center gap-1.5 cursor-pointer shrink-0 ml-1 bg-slate-50 px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 transition">
              <div className="relative flex items-center">
                <input type="checkbox" className="sr-only" checked={asignadosAMi} onChange={e => setAsignadosAMi(e.target.checked)} />
                <div className={`block w-5 h-3 rounded-full transition ${asignadosAMi ? 'bg-brand-500' : 'bg-slate-300'}`}></div>
                <div className={`absolute left-[1px] bg-white w-[10px] h-[10px] rounded-full transition transform ${asignadosAMi ? 'translate-x-[10px]' : ''}`}></div>
              </div>
              <span className="text-[10px] font-semibold text-slate-600">Asignados a mí</span>
            </label>
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto divide-y divide-slate-100 transition-opacity duration-200 ${isFetching ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          {conversaciones.length === 0 ? (
            <div className="p-4 text-center text-sm text-ink-500">No hay conversaciones en esta vista.</div>
          ) : (
            conversaciones.map(conv => {
              const contactName = conv.contacts?.nombre || conv.contacts?.identificador_canal || 'Desconocido'
              const bgAvatar = 'bg-slate-200 text-slate-700' // could be randomized
              const isSelected = selectedConvId === conv.id
              const isPausada = conv.ia_pausada

              let badgeIcon = null
              let badgeColor = ''
              if (conv.canal === 'instagram') {
                badgeColor = 'bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 text-white'
                badgeIcon = <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              } else if (conv.canal === 'whatsapp') {
                badgeColor = 'bg-emerald-500 text-white'
                badgeIcon = <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>
              } else {
                badgeColor = 'bg-blue-600 text-white'
                badgeIcon = <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              }

              return (
                <button key={conv.id} onClick={() => setSelectedConvId(conv.id)} className={`w-full text-left flex items-start gap-3 p-3 transition relative ${isSelected ? 'bg-brand-50' : 'hover:bg-slate-50'} ${conv.estado === 'cerrada' ? 'opacity-70' : ''}`}>
                  {isSelected && <span className="absolute left-0 top-0 bottom-0 w-1 bg-brand-600"></span>}
                  <div className="relative shrink-0">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center font-600 text-sm ${bgAvatar}`}>
                      {getInitials(contactName)}
                    </div>
                    <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white ${badgeColor}`}>
                      {badgeIcon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-600 text-sm text-ink-900 truncate">{contactName}</p>
                      <span className="text-[11px] text-ink-400 shrink-0">{formatTime(conv.fecha_ultimo_mensaje || conv.fecha_inicio)}</span>
                    </div>
                    <p className={`text-xs line-clamp-1 mt-0.5 ${conv.estado === 'cerrada' ? 'italic text-ink-400' : 'text-ink-500'}`}>
                      {conv.messages?.[0]?.contenido || conv.resumen || 'Sin mensajes aún'}
                    </p>
                    {isPausada && conv.estado === 'activa' && (
                      <span className="inline-block mt-1 text-[10px] font-600 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">IA pausada</span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </section>

      {/* PANEL DERECHO */}
      <section className={`flex flex-col flex-1 min-w-0 bg-slate-50 h-full ${!selectedConvId ? 'hidden lg:flex items-center justify-center' : 'flex'}`}>
        {!selectedConvId ? (
          <div className="text-center text-ink-500">Selecciona una conversación para ver el hilo</div>
        ) : (
          <>
            {/* Cabecera */}
            <div className="px-4 h-20 flex items-center gap-3 border-b border-slate-200 bg-white shrink-0">
              <button onClick={() => setSelectedConvId(null)} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 transition" aria-label="Volver">
                <svg className="w-6 h-6 text-ink-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
              </button>
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-600 text-slate-700 text-sm">
                  {getInitials(selectedConv?.contacts?.nombre || selectedConv?.contacts?.identificador_canal)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-600 text-ink-900 truncate">{selectedConv?.contacts?.nombre || selectedConv?.contacts?.identificador_canal || 'Desconocido'}</p>
                <p className="text-xs text-ink-500">{selectedConv?.canal}</p>
              </div>
              
              <div className="flex items-center gap-3 shrink-0">
                {selectedConv?.estado === 'activa' && (
                  <>
                    {/* Toggle IA */}
                    <AIToggle 
                      isPaused={selectedConv.ia_pausada} 
                      onToggleConfirm={handleToggleIA} 
                      disabled={nivelPermiso !== 'escritura'} 
                    />
                    {/* Botón cerrar */}
                    <button onClick={() => handleCerrar(selectedConv)} disabled={nivelPermiso !== 'escritura'} className="hidden sm:inline-flex px-3 py-1.5 bg-slate-100 text-ink-700 hover:bg-slate-200 rounded-lg text-xs font-600 transition disabled:opacity-50 disabled:cursor-not-allowed">
                      Cerrar
                    </button>
                  </>
                )}
                {selectedConv?.estado === 'cerrada' && (
                  <>
                    <button onClick={() => setModalState({ isOpen: true, action: 'reabrir_conv' })} disabled={nivelPermiso !== 'escritura'} className="hidden sm:inline-flex px-3 py-1.5 bg-slate-100 text-ink-700 hover:bg-slate-200 rounded-lg text-xs font-600 transition disabled:opacity-50 disabled:cursor-not-allowed">
                      Reabrir conversación
                    </button>
                    <span className="px-3 py-1.5 bg-slate-200 text-ink-600 rounded-lg text-xs font-600">
                      Cerrada
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Banner de Caso Cerrado */}
            {selectedConv?.cases?.[0] && (selectedConv.cases[0].estatus === 'resuelto' || selectedConv.cases[0].estatus === 'cerrado') && (
              <div className="bg-slate-100 border-b border-slate-200 p-3 shrink-0 flex items-center justify-between">
                <p className="text-sm text-slate-700">Esta conversación está vinculada a un caso <strong>{selectedConv.cases[0].estatus}</strong>.</p>
                <button onClick={() => setModalState({ isOpen: true, action: 'reabrir_caso' })} disabled={nivelPermiso !== 'escritura'} className="px-3 py-1.5 bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-600 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  Reabrir caso
                </button>
              </div>
            )}

            {selectedConv?.ia_pausada && selectedConv?.estado === 'activa' && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 shrink-0">
                <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <p className="text-xs text-amber-700">La IA está en pausa en este chat. Tus mensajes se envían directamente al cliente.</p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {loadingMsgs ? (
                <div className="text-center text-sm text-ink-400">Cargando mensajes...</div>
              ) : mensajes.length === 0 ? (
                <div className="text-center text-sm text-ink-400">No hay mensajes en esta conversación.</div>
              ) : (
                mensajes.map(msg => (
                  <MessageBubble 
                    key={msg.id} 
                    msg={msg} 
                    contactName={selectedConv?.contacts?.nombre} 
                    channelId={selectedConv?.contacts?.identificador_canal} 
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {selectedConv?.estado === 'activa' && (
              <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0">
                <form onSubmit={handleEnviar} className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea 
                      rows={1} 
                      value={mensajeText}
                      onChange={e => setMensajeText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleEnviar(e as unknown as React.FormEvent)
                        }
                      }}
                      placeholder="Escribe un mensaje..." 
                      disabled={nivelPermiso !== 'escritura' || enviando}
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-300 bg-white resize-none text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition max-h-32 disabled:opacity-50 disabled:bg-slate-50"
                    ></textarea>
                  </div>
                  <button 
                    type="submit"
                    disabled={nivelPermiso !== 'escritura' || enviando || !mensajeText.trim()} 
                    className="p-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed" 
                    aria-label="Enviar"
                  >
                    {enviando ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                    )}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </section>

      {/* PANEL DERECHO: CONTEXTO */}
      {selectedConvId && (
        <section className="hidden xl:flex flex-col w-80 shrink-0 border-l border-slate-200 bg-slate-50 h-full overflow-y-auto">
          {loadingContext ? (
            <div className="p-6 text-center text-sm text-slate-500">Cargando contexto...</div>
          ) : contexto ? (
            <div className="p-5 flex flex-col gap-6">
              
              {/* Información del Cliente */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <h3 className="font-semibold text-ink-900 mb-3 pb-2 border-b border-slate-100 flex justify-between items-center">
                  Cliente
                  <Link href={`/dashboard/conversaciones/${selectedConvId}`} className="text-brand-600 hover:text-brand-700 text-xs font-semibold">
                    Ver conversación
                  </Link>
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] text-slate-500 font-medium mb-0.5 uppercase tracking-wider">Nombre</p>
                    <p className="font-semibold text-ink-900 text-sm">{contexto.contacts?.nombre || 'Desconocido'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 font-medium mb-0.5 uppercase tracking-wider">Canal</p>
                    <p className="font-semibold capitalize text-sm">{contexto.contacts?.canal}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{contexto.contacts?.identificador_canal}</p>
                  </div>
                </div>
              </div>

              {/* Etiquetas */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <h3 className="font-semibold text-ink-900 mb-3 pb-2 border-b border-slate-100">Etiquetas aplicadas</h3>
                {contexto.etiquetas && contexto.etiquetas.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {contexto.etiquetas.map((t: any) => (
                      <span 
                        key={t.id} 
                        className="px-2.5 py-1 text-xs font-medium rounded-md border"
                        style={{
                          backgroundColor: `${t.color}15`,
                          color: t.color,
                          borderColor: `${t.color}30`
                        }}
                      >
                        {t.nombre}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Ninguna etiqueta aplicada.</p>
                )}
              </div>

              {/* Caso / Acciones */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <h3 className="font-semibold text-ink-900 mb-3 pb-2 border-b border-slate-100 flex justify-between items-center">
                  Caso asociado
                  {contexto.caso_asociado?.id && (
                    <Link href={`/dashboard/casos/${contexto.caso_asociado.id}`} className="text-brand-600 hover:text-brand-700 text-xs font-semibold">
                      Abrir caso
                    </Link>
                  )}
                </h3>
                
                {contexto.caso_asociado ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">Estado</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${
                        contexto.caso_asociado.estatus === 'pendiente' ? 'bg-amber-100 text-amber-700' :
                        contexto.caso_asociado.estatus === 'atendiendo' ? 'bg-brand-100 text-brand-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {contexto.caso_asociado.estatus}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">Prioridad</span>
                      <span className="text-xs font-semibold capitalize">{contexto.caso_asociado.prioridad}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">Agente</span>
                      <span className="text-xs font-semibold truncate max-w-[120px]">{contexto.caso_asociado.agente?.nombre || 'Ninguno'}</span>
                    </div>
                    
                    {contexto.caso_asociado.estatus !== 'resuelto' && contexto.caso_asociado.estatus !== 'cerrado' ? (
                      <div className="pt-2 mt-2 border-t border-slate-100 flex flex-col gap-2">
                        {nivelPermiso === 'escritura' && contexto.caso_asociado.agente?.id !== (contexto as any).current_user_id && (
                          <button onClick={() => setModalState({ isOpen: true, action: 'asignar_mi_existente' })} className="w-full py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition">
                            Asignarme el caso
                          </button>
                        )}
                        {nivelPermiso === 'escritura' && contexto.caso_asociado.agente?.id && (
                          <button onClick={() => setModalState({ isOpen: true, action: 'soltar_existente' })} className="w-full py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition">
                            Soltar caso
                          </button>
                        )}
                        {nivelPermiso === 'escritura' && (
                          <div className="relative mt-1" ref={agentDropdownRef}>
                            <p className="text-[10px] text-slate-500 font-medium mb-1.5">Transferir a...</p>
                            <button onClick={() => setShowAgentDropdown(!showAgentDropdown)} className="w-full h-8 px-2 border border-slate-200 rounded-lg bg-slate-50 text-xs text-left flex items-center justify-between focus:outline-none focus:border-brand-500 transition-shadow">
                              <span className="text-slate-500">Selecciona un agente...</span>
                              <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                            {showAgentDropdown && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-2">
                                <div className="px-2 pb-2 mb-2 border-b border-slate-100">
                                  <input 
                                    type="text" 
                                    value={agentSearch}
                                    onChange={e => setAgentSearch(e.target.value)}
                                    placeholder="Buscar agente..." 
                                    className="w-full text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded outline-none focus:border-brand-500"
                                  />
                                </div>
                                <div className="max-h-40 overflow-y-auto">
                                  {agentes.filter(a => (a.nombre || a.email).toLowerCase().includes(agentSearch.toLowerCase())).map(a => (
                                    <button 
                                      key={a.id}
                                      onClick={() => {
                                        setModalState({ isOpen: true, action: 'asignar_otro_existente', targetAgenteId: a.id })
                                        setShowAgentDropdown(false)
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 truncate"
                                    >
                                      <div className="font-semibold">{a.nombre || 'Sin nombre'}</div>
                                      <div className="text-[10px] text-slate-500">{a.email}</div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="pt-2 mt-2 border-t border-slate-100">
                        <button onClick={() => setModalState({ isOpen: true, action: 'reabrir_caso' })} disabled={nivelPermiso !== 'escritura'} className="w-full py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition disabled:opacity-50">
                          Reabrir caso
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-slate-500 mb-1">Esta conversación no tiene un caso de soporte activo.</p>
                    {nivelPermiso === 'escritura' && (
                      <>
                        <button onClick={() => setModalState({ isOpen: true, action: 'asignar_mi' })} className="w-full py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition">
                          Crear caso y asignarme
                        </button>
                        <div className="relative" ref={agentDropdownRef}>
                          <button onClick={() => setShowAgentDropdown(!showAgentDropdown)} className="w-full py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition">
                            Asignar a otro agente...
                          </button>
                          {showAgentDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-2">
                              <div className="px-2 pb-2 mb-2 border-b border-slate-100">
                                <input 
                                  type="text" 
                                  value={agentSearch}
                                  onChange={e => setAgentSearch(e.target.value)}
                                  placeholder="Buscar agente..." 
                                  className="w-full text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded outline-none focus:border-brand-500"
                                />
                              </div>
                              <div className="max-h-40 overflow-y-auto">
                                {agentes.filter(a => (a.nombre || a.email).toLowerCase().includes(agentSearch.toLowerCase())).map(a => (
                                  <button 
                                    key={a.id}
                                    onClick={() => {
                                      setModalState({ isOpen: true, action: 'asignar_otro', targetAgenteId: a.id })
                                      setShowAgentDropdown(false)
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 truncate"
                                  >
                                    <div className="font-semibold">{a.nombre || 'Sin nombre'}</div>
                                    <div className="text-[10px] text-slate-500">{a.email}</div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>


              {/* Registro de actividad */}
              {hasLogPerm && (
                <ActivityLog logs={logs} />
              )}
              
            </div>
          ) : null}
        </section>
      )}

        <ConfirmModal
          isOpen={modalState.isOpen}
          onClose={() => setModalState({ isOpen: false, action: null })}
          onConfirm={handleConfirmAction}
          title={
            modalState.action === 'reabrir_caso' ? '¿Reabrir este caso?' :
            modalState.action === 'reabrir_conv' ? '¿Reabrir esta conversación?' : 
            modalState.action === 'asignar_mi' ? '¿Crear caso y asignártelo?' :
            modalState.action === 'asignar_otro' ? '¿Crear caso y asignar a otro?' :
            modalState.action === 'asignar_mi_existente' ? '¿Asignarte este caso?' :
            modalState.action === 'asignar_otro_existente' ? '¿Transferir este caso?' :
            modalState.action === 'soltar_existente' ? '¿Soltar este caso?' :
            'Confirmar acción'
          }
          message={
            modalState.action === 'reabrir_caso' ? 'El caso asociado volverá a estar activo (se te asignará si ya lo tenías, o irá a la cola).' :
            modalState.action === 'reabrir_conv' ? 'La conversación volverá a estar activa y podrás enviar mensajes.' : 
            modalState.action === 'asignar_mi' ? 'Se creará un nuevo caso para esta conversación y quedarás como el agente responsable.' :
            modalState.action === 'asignar_otro' ? 'Se creará un nuevo caso para esta conversación y será asignado al agente seleccionado.' :
            modalState.action === 'asignar_mi_existente' ? 'Pasarás a ser el agente responsable de este caso.' :
            modalState.action === 'asignar_otro_existente' ? 'El caso será transferido al agente seleccionado.' :
            modalState.action === 'soltar_existente' ? 'El caso quedará sin agente asignado y disponible en la cola.' :
            '¿Estás seguro?'
          }
          confirmText={
            modalState.action === 'reabrir_caso' || modalState.action === 'reabrir_conv' ? 'Sí, reabrir' :
            'Sí, confirmar'
          }
        type="info"
        isLoading={procesando}
      />
    </div>
  )
}

export default function ChatsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ChatsContent />
    </Suspense>
  )
}
