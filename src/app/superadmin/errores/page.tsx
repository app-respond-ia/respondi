'use client'
import { Tabla } from '@/components/ui/Tabla'
import { PAGINA } from '@/lib/ui'

import { useState, useEffect } from 'react'
import { getErrores, resolverError } from '@/app/actions/superadmin'
import { useSuperadminPermisos } from '@/components/layout/SuperadminPermisosContext'

import { useToast } from '@/components/ui/Toast'

const ORIGEN_ETIQUETA: Record<string, string> = {
  n8n: 'n8n',
  api_meta: 'API Meta',
  llm: 'LLM',
  base_datos: 'Base de datos',
  cron: 'Cron jobs'
}

export default function ErroresPage() {
  const [errores, setErrores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()
  
  // Filtros (el estado resuelto/sin resolver lo llevan las pestañas de la tabla)
  const [filtroOrigen, setFiltroOrigen] = useState('Todos')
  const [resolviendoId, setResolviendoId] = useState<string | null>(null)
  
  const [modalData, setModalData] = useState<any>(null)

  const { hasPermission } = useSuperadminPermisos()
  const canWrite = hasPermission('errores', 'escritura')

  useEffect(() => {
    loadErrores()
  }, [])

  // El servidor devuelve como mucho 100 por consulta, así que se piden los
  // dos estados por separado: si se pidieran todos juntos, un aluvión de
  // resueltos podría tapar errores sin resolver más antiguos.
  async function loadErrores() {
    setLoading(true)
    const [sinResolver, resueltos] = await Promise.all([getErrores('sin_resolver'), getErrores('resuelto')])
    const error = sinResolver.error || resueltos.error
    if (error) showToast(error, 'error')
    setErrores([...(sinResolver.errores || []), ...(resueltos.errores || [])])
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

  const resolver = async (errorData: any) => {
    if (!errorData) return
    setResolviendoId(errorData.id)
    const res = await resolverError(errorData.id)
    setResolviendoId(null)
    if (res && res.success) {
      showToast('Error marcado como resuelto ✓', 'success')
      if (modalData?.id === errorData.id) closeModal()
      loadErrores()
    } else {
      showToast(res?.error || 'Error al actualizar', 'error')
    }
  }

  const markResolved = () => resolver(modalData)

  const getOrigenIcon = (origen: string) => {
    switch (origen) {
      case 'n8n': return <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
      case 'api_meta': return <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
      case 'llm': return <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
      case 'base_datos': return <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/></svg>
      default: return <svg className="w-5 h-5 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
    }
  }

  const formatFecha = (d: string) => d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className={PAGINA}>
      <div className="mb-5">
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Errores del sistema</h1>
        <p className="text-ink-500 mt-1">Monitorización de fallos técnicos en la plataforma.</p>
      </div>

      {/* Lista */}
      <Tabla
        filas={erroresFiltrados}
        idDe={e => e.id}
        cargando={loading}
        nombre={['error', 'errores']}
        buscar={{ placeholder: 'Buscar por descripción u organización…', en: e => `${e.descripcion || ''} ${e.organizaciones?.nombre || ''} ${ORIGEN_ETIQUETA[e.origen] || e.origen || ''}` }}
        pestanas={[
          { id: 'sin_resolver', etiqueta: 'Sin resolver', filtro: e => !e.resuelto },
          { id: 'resuelto', etiqueta: 'Resueltos', filtro: e => !!e.resuelto },
          { id: 'todos', etiqueta: 'Todos' }
        ]}
        pestanaInicial="sin_resolver"
        herramientas={
          <select value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value)} aria-label="Origen"
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-ink-700 focus:outline-none focus:border-brand-500 transition">
            <option value="Todos">Todos los orígenes</option>
            <option value="n8n">n8n</option>
            <option value="api_meta">API Meta</option>
            <option value="llm">LLM</option>
            <option value="base_datos">Base de datos</option>
            <option value="cron">Cron jobs</option>
          </select>
        }
        ordenInicial={{ clave: 'fecha', direccion: 'desc' }}
        onFilaClick={openModal}
        columnas={[
          { clave: 'descripcion', titulo: 'Error', enMovil: 'titulo', valor: e => e.descripcion || '', clase: 'max-w-md', render: e => (
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${e.resuelto ? 'bg-slate-100' : 'bg-red-50'}`}>
                {getOrigenIcon(e.origen)}
              </div>
              <p className={`font-600 line-clamp-2 ${e.resuelto ? 'text-ink-600' : 'text-ink-900'}`} title={e.descripcion}>{e.descripcion}</p>
            </div>
          ) },
          { clave: 'origen', titulo: 'Origen', valor: e => ORIGEN_ETIQUETA[e.origen] || e.origen || '', render: e => <span className="text-xs font-500 text-ink-500 bg-slate-100 px-2 py-0.5 rounded whitespace-nowrap">{e.origen}</span> },
          { clave: 'organizacion', titulo: 'Organización', valor: e => e.organizaciones?.nombre || '', render: e => e.organizaciones?.nombre ? <span className="text-ink-700">{e.organizaciones.nombre}</span> : <span className="text-ink-400">—</span> },
          { clave: 'fecha', titulo: 'Fecha', valor: e => e.timestamp || '', render: e => <span className="text-ink-500 whitespace-nowrap text-xs">{formatFecha(e.timestamp)}</span> },
          { clave: 'estado', titulo: 'Estado', valor: e => (e.resuelto ? 'Resuelto' : 'Requiere atención'), render: e => (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-700 uppercase tracking-wider whitespace-nowrap ${e.resuelto ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-700'}`}>
              {e.resuelto ? 'Resuelto' : 'Requiere atención'}
            </span>
          ) }
        ]}
        acciones={e => (
          <>
            <button onClick={() => openModal(e)} className="px-3 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-600 text-ink-700 transition">Detalle</button>
            {canWrite && !e.resuelto && (
              <button onClick={() => resolver(e)} disabled={resolviendoId === e.id}
                className="ml-2 px-3 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-600 transition disabled:opacity-50">
                {resolviendoId === e.id ? 'Un momento…' : 'Marcar resuelto'}
              </button>
            )}
          </>
        )}
        vacio={
          <div className="flex flex-col items-center text-ink-500">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 text-ink-300">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <p className="font-600 text-ink-900 text-lg">Todo en orden</p>
            <p>No se han encontrado errores con estos filtros.</p>
          </div>
        }
      />

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
                {canWrite && !modalData.resuelto && (
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
    </div>
  )
}
