'use client'
import Loading from '@/components/Loading'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { HelpPopover } from '@/components/ui/HelpPopover'
import { MessageBubble } from '@/components/ui/MessageBubble'
import { NotesSection } from '@/components/ui/NotesSection'
import { ActivityLog } from '@/components/ui/ActivityLog'
import { AIToggle } from '@/components/ui/AIToggle'
import { getConversacionDetalle, pausarIA, reanudarIA } from '@/app/actions/conversaciones'
import { getAgentesParaCasos, crearCasoDesdeConversacion } from '@/app/actions/casos'
import { getLogsAuditoria } from '@/app/actions/audit-log'
import { getMisPermisos } from '@/app/actions/permisos'


export default function ConversacionDetallePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [conv, setConv] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [cambiandoIA, setCambiandoIA] = useState(false)
  const [agentes, setAgentes] = useState<any[]>([])
  const [procesandoCaso, setProcesandoCaso] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [hasLogPerm, setHasLogPerm] = useState(false)
  const [canDeleteNotes, setCanDeleteNotes] = useState(false)
  
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    action: 'asignar_mi' | 'asignar_otro' | 'cola' | null;
    targetAgenteId?: string;
  }>({ isOpen: false, action: null })
  
  const [agentSearch, setAgentSearch] = useState('')
  const [showAgentDropdown, setShowAgentDropdown] = useState(false)
  const agentDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) {
        setShowAgentDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cargarDatos()
    cargarAgentes()
    cargarLogs()
  }, [id])

  const cargarLogs = async () => {
    const res = await getLogsAuditoria('conversations', id)
    if (res.success) {
      setHasLogPerm(res.hasPermission || false)
      setLogs(res.data || [])
    }
  }

  const cargarAgentes = async () => {
    const res = await getAgentesParaCasos()
    if (res.success && res.data) setAgentes(res.data)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conv?.mensajes])

  const cargarDatos = async () => {
    setLoading(true)
    const [res, permisosRes] = await Promise.all([
      getConversacionDetalle(id),
      getMisPermisos()
    ])
    if (!res.success || !res.data) {
      router.replace('/dashboard/conversaciones')
      return
    }
    setConv(res.data)
    
    if (permisosRes.success) {
      setCanDeleteNotes(((permisosRes as any).esAdmin) || ((permisosRes as any).userLevel || 5) <= 2)
    }
    setLoading(false)
  }

  const handleToggleIA = async (newPausedState: boolean) => {
    try {
      setCambiandoIA(true)
      if (!newPausedState) {
        await reanudarIA(id)
      } else {
        await pausarIA(id)
      }
      await cargarDatos()
      setCambiandoIA(false)
      return true
    } catch (e) {
      alert('Error al modificar estado de la IA')
      setCambiandoIA(false)
      return false
    }
  }

  const handleConfirmCaso = async () => {
    if (!modalState.action) return
    setProcesandoCaso(true)
    
    let targetAgenteId = null
    if (modalState.action === 'asignar_mi') targetAgenteId = conv?.current_user_id
    if (modalState.action === 'asignar_otro' && modalState.targetAgenteId) targetAgenteId = modalState.targetAgenteId

    const res = await crearCasoDesdeConversacion(id, targetAgenteId)
    if (res.success) {
      setModalState({ isOpen: false, action: null })
      await cargarDatos()
      if (hasLogPerm) await cargarLogs()
    }
    setProcesandoCaso(false)
  }

  const openModal = (action: typeof modalState.action, targetAgenteId?: string) => {
    setModalState({ isOpen: true, action, targetAgenteId })
  }

  if (loading) return <Loading />
  if (!conv) return null

  const contact = Array.isArray(conv.contacts) ? conv.contacts[0] : conv.contacts
  const canalIcon = contact?.canal === 'whatsapp' ? 'text-[#25D366]' : 
                    contact?.canal === 'instagram' ? 'text-purple-500' : 'text-[#1877F2]'

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 mx-auto w-full max-w-7xl overflow-hidden">
      <div className="mb-4 shrink-0">
        <Link href="/dashboard/conversaciones" className="text-sm font-semibold text-slate-500 hover:text-brand-600 flex items-center gap-1 w-max">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Volver a Conversaciones
        </Link>
        <div className="flex items-center justify-between mt-3">
          <h1 className="text-2xl font-bold text-ink-900 font-display flex items-center gap-3">
            <span className="capitalize">{contact?.nombre || 'Desconocido'}</span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${
              conv.estado === 'activa' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
            }`}>
              {conv.estado}
            </span>
          </h1>
          
          <div className="flex items-center gap-2">
            <AIToggle 
              isPaused={conv.ia_pausada} 
              onToggleConfirm={handleToggleIA} 
              disabled={cambiandoIA} 
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        {/* PANEL IZQUIERDO: CHAT */}
        <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200 p-4 shrink-0 flex items-center justify-between">
            <h3 className="font-semibold text-ink-900">Mensajes</h3>
            <p className="text-xs font-semibold text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm">
              Último: {conv.fecha_ultimo_mensaje ? new Date(conv.fecha_ultimo_mensaje).toLocaleString() : 'N/A'}
            </p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50">
            {conv.mensajes.map((m: any) => (
              <MessageBubble 
                key={m.id} 
                msg={m} 
                contactName={contact?.nombre} 
                channelId={contact?.identificador_canal} 
              />
            ))}
            {conv.mensajes.length === 0 && (
              <p className="text-center text-slate-400 mt-10 font-medium">No hay mensajes registrados.</p>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-slate-200 shrink-0 flex justify-center">
            <Link 
              href={`/dashboard/chats?chat=${id}`}
              className="w-full sm:w-auto px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-sm transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
              Abrir en Chats
            </Link>
          </div>
        </div>

        {/* PANEL DERECHO: INFO */}
        <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0 min-h-0 overflow-y-auto pb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-ink-900 mb-4 pb-2 border-b border-slate-100">Información del Cliente</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Canal de contacto</p>
                <p className={`font-semibold capitalize flex items-center gap-1.5 ${canalIcon}`}>
                  {contact?.canal}
                </p>
                <p className="text-sm text-slate-600 mt-0.5">{contact?.identificador_canal}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-ink-900 mb-4 pb-2 border-b border-slate-100">Gestión de Caso</h3>
            {conv.caso_asociado_id ? (
              <div>
                <p className="text-sm text-slate-500 mb-3">Esta conversación ya forma parte de un caso.</p>
                <Link 
                  href={`/dashboard/casos/${conv.caso_asociado_id}`}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold rounded-xl transition text-sm"
                >
                  Ver caso #{conv.caso_asociado_id.substring(0,8).toUpperCase()}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <button 
                  onClick={() => openModal('asignar_mi')}
                  disabled={procesandoCaso}
                  className="w-full py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl shadow-md shadow-brand-600/20 transition text-sm disabled:opacity-50"
                >
                  Asignarme a mí
                </button>
                <button 
                  onClick={() => openModal('cola')}
                  disabled={procesandoCaso}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl border border-slate-200 transition text-sm disabled:opacity-50"
                >
                  Dejar en cola (sin asignar)
                </button>
                <div className="pt-3 border-t border-slate-100 relative" ref={agentDropdownRef}>
                  <p className="text-xs text-slate-500 font-medium mb-2">Asignar a...</p>
                  <div className="relative">
                    <button 
                      onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                      disabled={procesandoCaso}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl bg-slate-50 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow disabled:opacity-50"
                    >
                      <span className="text-slate-500">Selecciona un agente...</span>
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>

                    {showAgentDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                        <div className="p-2 border-b border-slate-100 bg-slate-50">
                          <input 
                            type="text" 
                            placeholder="Buscar agente..." 
                            value={agentSearch} 
                            onChange={e => setAgentSearch(e.target.value)} 
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500" 
                          />
                        </div>
                        <div className="max-h-[160px] overflow-y-auto p-1">
                          {agentes.filter(a => 
                            (a.nombre || '').toLowerCase().includes(agentSearch.toLowerCase()) || 
                            (a.email || '').toLowerCase().includes(agentSearch.toLowerCase())
                          ).map(a => (
                            <button
                              key={a.id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded-lg transition text-ink-900 truncate"
                              onClick={() => {
                                setShowAgentDropdown(false)
                                setAgentSearch('')
                                openModal('asignar_otro', a.id)
                              }}
                            >
                              {a.nombre || a.email}
                            </button>
                          ))}
                          {agentes.length === 0 && (
                            <div className="px-3 py-2 text-sm text-slate-500 text-center">No hay agentes disponibles</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-ink-900 mb-4 pb-2 border-b border-slate-100">Detalles de Conversación</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Apertura</p>
                <p className="text-sm font-medium text-ink-900">
                  {new Date(conv.fecha_inicio).toLocaleString()}
                </p>
              </div>
              
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Resumen IA</p>
                <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed font-medium">
                  {conv.resumen || <span className="italic opacity-60">La IA aún no ha generado un resumen.</span>}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-ink-900 mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
              Etiquetas aplicadas
              <HelpPopover content="Categorías aplicadas automáticamente por la IA o por un agente, útiles para filtrar y buscar conversaciones similares." />
            </h3>
            <div className="flex flex-wrap gap-2">
              {conv.etiquetas && conv.etiquetas.length > 0 ? (
                conv.etiquetas.map((t: any, i: number) => (
                  <span 
                    key={i} 
                    className="text-xs font-semibold px-2.5 py-1 rounded-md border"
                    style={{
                      backgroundColor: `${t.color}26`, // 15% opacity hex
                      color: t.color,
                      borderColor: t.color
                    }}
                  >
                    {t.nombre}
                  </span>
                ))
              ) : (
                <span className="text-xs font-semibold px-2.5 py-1 bg-slate-50 text-slate-400 rounded-md border border-slate-200 italic">
                  Descategorizado
                </span>
              )}
            </div>
          </div>

          {/* Notas Internas */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
            <NotesSection conversationId={id} canDelete={canDeleteNotes} />
          </div>

          {hasLogPerm && logs.length > 0 && (
            <ActivityLog logs={logs} />
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={modalState.isOpen}
        title="Crear caso"
        message={
          modalState.action === 'asignar_mi' ? 'Se creará un nuevo caso vinculado a esta conversación y se te asignará a ti.' :
          modalState.action === 'cola' ? 'Se creará un nuevo caso vinculado a esta conversación y quedará en cola (sin asignar).' :
          'Se creará un nuevo caso vinculado a esta conversación y se le asignará al agente seleccionado.'
        }
        confirmText="Confirmar"
        type="info"
        onConfirm={handleConfirmCaso}
        onClose={() => setModalState({ isOpen: false, action: null })}
        isLoading={procesandoCaso}
      />
    </div>
  )
}
