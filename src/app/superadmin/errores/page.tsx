'use client'

import { useState, useEffect } from 'react'
import { getErrores, resolverError } from '@/app/actions/superadmin'


export default function ErroresPage() {
  const [errores, setErrores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filtros
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'sin_resolver' | 'resuelto'>('sin_resolver')
  const [filtroOrigen, setFiltroOrigen] = useState('Todos')
  
  const [modalData, setModalData] = useState<any>(null)

  useEffect(() => {
    loadErrores()
  }, [filtroEstado])

  async function loadErrores() {
    setLoading(true)
    const backendFiltro = filtroEstado === 'todos' ? undefined : filtroEstado
    const { success, errores: data } = await getErrores(backendFiltro)
    if (success && data) setErrores(data)
    setLoading(false)
  }

  const erroresFiltrados = errores.filter(e => {
    if (filtroOrigen === 'Todos') return true
    return e.origen === filtroOrigen
  })

  const openModal = (errorData: any) => {
    setModalData(errorData)
    document.body.style.overflow = 'hidden'
  }

  const closeModal = () => {
    setModalData(null)
    document.body.style.overflow = ''
  }

  const markResolved = async () => {
    if (modalData) {
      await resolverError(modalData.id)
      closeModal()
      loadErrores()
    }
  }

  const getOrigenIcon = (origen: string) => {
    switch (origen) {
      case 'n8n': return <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
      case 'api_meta': return <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
      case 'llm': return <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
      case 'base_datos': return <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/></svg>
      default: return <svg className="w-5 h-5 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
    }
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Errores del sistema</h1>
        <p className="text-ink-500 mt-1">Monitorización de fallos técnicos en la plataforma.</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200 overflow-x-auto shrink-0">
          <button onClick={() => setFiltroEstado('sin_resolver')} className={`px-4 py-2 rounded-lg text-sm transition ${filtroEstado === 'sin_resolver' ? 'font-600 bg-red-50 text-red-700' : 'font-500 text-ink-500 hover:text-ink-900'}`}>Sin resolver</button>
          <button onClick={() => setFiltroEstado('resuelto')} className={`px-4 py-2 rounded-lg text-sm transition ${filtroEstado === 'resuelto' ? 'font-600 bg-ink-100 text-ink-900' : 'font-500 text-ink-500 hover:text-ink-900'}`}>Resueltos</button>
          <button onClick={() => setFiltroEstado('todos')} className={`px-4 py-2 rounded-lg text-sm transition ${filtroEstado === 'todos' ? 'font-600 bg-ink-100 text-ink-900' : 'font-500 text-ink-500 hover:text-ink-900'}`}>Todos</button>
        </div>

        <div className="relative shrink-0">
          <select value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value)} className="h-11 pl-4 pr-10 rounded-xl border border-slate-200 bg-white text-sm font-500 text-ink-700 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 appearance-none">
            <option value="Todos">Todos los orígenes</option>
            <option value="n8n">n8n</option>
            <option value="api_meta">API Meta</option>
            <option value="llm">LLM</option>
            <option value="base_datos">Base de datos</option>
            <option value="cron">Cron jobs</option>
          </select>
          <svg className="w-5 h-5 text-ink-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4"/></svg>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-ink-500">Cargando errores...</div>
        ) : erroresFiltrados.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-ink-500 flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 text-ink-300">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <p className="font-600 text-ink-900 text-lg">Todo en orden</p>
            <p>No se han encontrado errores con estos filtros.</p>
          </div>
        ) : (
          erroresFiltrados.map(e => {
            const isResolved = e.resuelto
            return (
              <div key={e.id} onClick={() => openModal(e)} className={`bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-md transition ${isResolved ? 'border-slate-200 opacity-60' : 'border-red-200 shadow-sm'}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isResolved ? 'bg-slate-100' : 'bg-red-50'}`}>
                    {getOrigenIcon(e.origen)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-700 uppercase tracking-wider ${isResolved ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-700'}`}>
                            {isResolved ? 'Resuelto' : 'Requiere atención'}
                          </span>
                          <span className="text-xs font-500 text-ink-500 bg-slate-100 px-2 py-0.5 rounded">{e.origen}</span>
                          <span className="text-xs text-ink-400">{new Date(e.timestamp).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className={`font-600 truncate ${isResolved ? 'text-ink-700' : 'text-ink-900'}`}>{e.descripcion}</p>
                        {e.organizaciones?.nombre && (
                          <p className="text-sm text-ink-500 mt-1">Organización: <span className="font-500">{e.organizaciones.nombre}</span></p>
                        )}
                      </div>
                      <button className="shrink-0 p-1.5 text-ink-400 hover:text-ink-700 hover:bg-slate-100 rounded-lg transition" title="Ver detalle">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* MODAL DETALLE */}
      {modalData && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="relative min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${modalData.resuelto ? 'bg-slate-100' : 'bg-red-100'}`}>
                    {getOrigenIcon(modalData.origen)}
                  </div>
                  <h2 className="font-display font-700 text-lg text-ink-900">Detalle del error</h2>
                </div>
                <button onClick={closeModal} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-700 uppercase tracking-wider ${modalData.resuelto ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-700'}`}>
                    {modalData.resuelto ? 'Resuelto' : 'Sin resolver'}
                  </span>
                  <span className="text-sm font-500 text-ink-500 bg-slate-100 px-2 py-1 rounded">{modalData.origen}</span>
                  <span className="text-sm text-ink-400">{new Date(modalData.timestamp).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
                
                <div>
                  <h3 className="text-sm font-600 text-ink-500 uppercase tracking-wide mb-1">Descripción</h3>
                  <p className="text-ink-900 font-500 bg-red-50 text-red-900 p-3 rounded-xl border border-red-100">{modalData.descripcion}</p>
                </div>

                {modalData.organizaciones?.nombre && (
                  <div>
                    <h3 className="text-sm font-600 text-ink-500 uppercase tracking-wide mb-1">Organización afectada</h3>
                    <p className="text-ink-900 font-500">{modalData.organizaciones.nombre}</p>
                  </div>
                )}

                {modalData.stacktrace && (
                  <div>
                    <h3 className="text-sm font-600 text-ink-500 uppercase tracking-wide mb-2">Stacktrace / Contexto técnico</h3>
                    <div className="bg-ink-900 rounded-xl p-4 overflow-x-auto text-sm text-emerald-400 font-mono leading-relaxed">
                      <pre><code>{modalData.stacktrace}</code></pre>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
                <button onClick={closeModal} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition">Cerrar</button>
                {!modalData.resuelto && (
                  <button onClick={markResolved} className="px-5 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-600 transition flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                    Marcar como resuelto
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
