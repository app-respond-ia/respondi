'use client'

import { useState, useEffect } from 'react'
import { getCanales, conectarCanal, desconectarCanal } from '@/app/actions/canales'

type TipoCanal = 'instagram' | 'whatsapp' | 'facebook'
type MetodoCanal = 'whaticket' | 'meta_oficial'
type EstadoCanal = 'activo' | 'pendiente' | 'desconectado' | 'error'

interface Canal {
  id: string
  tipo: TipoCanal
  metodo: MetodoCanal
  estado: EstadoCanal
  identificador_externo?: string
  fecha_conexion?: string
}

export default function CanalesPage() {
  const [loading, setLoading] = useState(true)
  const [canales, setCanales] = useState<Canal[]>([])
  const [canalesMax, setCanalesMax] = useState<number | null>(null)
  const [canalesActivosCount, setCanalesActivosCount] = useState<number>(0)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  // Modal de Conexión
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalTipo, setModalTipo] = useState<TipoCanal | null>(null)
  const [modalMetodo, setModalMetodo] = useState<'oficial' | 'whaticket'>('oficial')
  const [modalLoading, setModalLoading] = useState(false)
  const [aceptaRiesgo, setAceptaRiesgo] = useState(false)

  const cargar = async () => {
    setLoading(true)
    const res = await getCanales()
    if (res.success && res.data) {
      setCanales(res.data.canales)
      setCanalesMax(res.data.canales_max)
      setCanalesActivosCount(res.data.canales_activos_count || 0)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al cargar canales' })
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const limitReached = canalesMax !== null && canalesActivosCount >= canalesMax

  const handleOpenModal = (tipo: TipoCanal) => {
    if (limitReached) return
    setModalTipo(tipo)
    setModalMetodo('oficial')
    setAceptaRiesgo(false)
    setIsModalOpen(true)
  }

  const handleConectar = async () => {
    if (!modalTipo) return
    if (modalMetodo === 'whaticket' && !aceptaRiesgo) return

    setModalLoading(true)
    const res = await conectarCanal(modalTipo, modalMetodo === 'oficial' ? 'meta_oficial' : 'whaticket')
    if (res.success) {
      setMensaje({ tipo: 'exito', texto: 'Canal configurado. Esperando validación.' })
      setTimeout(() => setMensaje(null), 3000)
      setIsModalOpen(false)
      cargar()
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al conectar canal' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setModalLoading(false)
  }

  const handleDesconectar = async (id: string) => {
    if (confirm('¿Desconectar este canal? Dejarás de recibir mensajes por aquí.')) {
      const res = await desconectarCanal(id)
      if (res.success) {
        setMensaje({ tipo: 'exito', texto: 'Canal desconectado.' })
        setTimeout(() => setMensaje(null), 3000)
        cargar()
      } else {
        setMensaje({ tipo: 'error', texto: res.error || 'Error al desconectar canal' })
        setTimeout(() => setMensaje(null), 3000)
      }
    }
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando canales...</div>
  }

  const getCanal = (tipo: TipoCanal) => canales.find(c => c.tipo === tipo)

  const renderCard = (tipo: TipoCanal, titulo: string, Icono: any, descSinConectar: string, bgClass: string) => {
    const canal = getCanal(tipo)
    const isActivo = canal?.estado === 'activo'
    const isPendiente = canal?.estado === 'pendiente'
    const isDesconectado = !canal || canal.estado === 'desconectado' || canal.estado === 'error'

    if (isActivo || isPendiente) {
      return (
        <article className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4">
          <div className="p-5">
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-white shadow-lg ${bgClass}`}>
                {Icono}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-display font-600 text-lg text-ink-900">{titulo}</h3>
                  {isActivo ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Conectado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      Pendiente
                    </span>
                  )}
                </div>
                {isActivo && (
                  <>
                    <p className="text-sm text-ink-600">{canal.identificador_externo || 'Sin identificador'} · Conectado vía {canal.metodo === 'meta_oficial' ? 'Meta oficial' : 'Whaticket'}</p>
                    <p className="text-xs text-ink-400 mt-1">Desde el {canal.fecha_conexion ? new Date(canal.fecha_conexion).toLocaleDateString() : 'Desconocido'}</p>
                  </>
                )}
                {isPendiente && (
                  <p className="text-sm text-ink-500">Esperando configuración...</p>
                )}
              </div>
            </div>

            {/* Indicador de método solo si está activo */}
            {isActivo && canal.metodo === 'meta_oficial' && (
              <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                <p className="text-xs text-ink-700"><strong>Conexión oficial con Meta.</strong> Sin riesgo de baneo. Recomendado para uso profesional.</p>
              </div>
            )}
            {isActivo && canal.metodo === 'whaticket' && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z"/></svg>
                <p className="text-xs text-ink-700"><strong>Conexión vía Whaticket.</strong> Más económica pero con riesgo de baneo por parte de Meta. Aceptaste el riesgo al conectar este canal.</p>
              </div>
            )}
          </div>
          {/* Acciones */}
          {isActivo && (
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 border-t border-slate-200">
              <button onClick={() => handleDesconectar(canal.id)} className="text-sm font-600 text-red-600 hover:text-red-700 hover:underline underline-offset-2 transition">Desconectar</button>
            </div>
          )}
        </article>
      )
    }

    return (
      <article className="bg-white rounded-2xl border-2 border-dashed border-slate-300 mb-4">
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-400">
              {Icono}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-display font-600 text-lg text-ink-900">{titulo}</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-600">
                  Sin conectar
                </span>
              </div>
              <p className="text-sm text-ink-500">{descSinConectar}</p>
            </div>
            <div className="group relative hidden sm:inline-block">
              <button onClick={() => handleOpenModal(tipo)} disabled={limitReached} className={`shrink-0 flex items-center gap-1.5 px-5 h-11 rounded-xl bg-brand-600 text-white text-sm font-600 transition ${limitReached ? 'opacity-50 cursor-not-allowed' : 'hover:bg-brand-700'}`}>
                Conectar
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
              </button>
              {limitReached && (
                <div className="absolute top-full right-0 mt-2 px-2 py-1 bg-ink-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none z-10">
                  Has alcanzado el límite de canales de tu plan
                </div>
              )}
            </div>
          </div>
          <div className="group relative sm:hidden mt-5">
            <button onClick={() => handleOpenModal(tipo)} disabled={limitReached} className={`w-full h-12 rounded-xl bg-brand-600 text-white text-sm font-600 transition flex items-center justify-center gap-1.5 ${limitReached ? 'opacity-50 cursor-not-allowed' : 'hover:bg-brand-700'}`}>
              Conectar {titulo}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
            </button>
            {limitReached && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-ink-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none z-10">
                Límite alcanzado
              </div>
            )}
          </div>
        </div>
      </article>
    )
  }

  return (
    <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto pb-20">
      {/* Mensaje global */}
      {mensaje && (
        <div className={`mb-6 p-4 rounded-xl font-500 text-sm border flex items-center gap-2 ${
          mensaje.tipo === 'exito' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Canales</h1>
        <p className="text-ink-500 mt-1">Las redes sociales por donde tu IA atiende a tus clientes.</p>
      </div>

      {/* Banner del plan */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-100 p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-600 text-ink-900">
              Plan activo · {canalesMax === null ? 'Canales ilimitados' : `${canalesMax} canales disponibles`}
            </p>
            <p className="text-sm text-ink-600">Puedes elegir cómo conectar cada canal: vía Whaticket (sin costo extra, con riesgo) o vía Meta oficial (sin riesgo).</p>
          </div>
        </div>
      </div>

      {renderCard('instagram', 'Instagram', <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>, 'Conecta tu cuenta de Instagram para responder mensajes.', 'bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 shadow-pink-200')}
      
      {renderCard('whatsapp', 'WhatsApp', <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>, 'Conecta tu número de WhatsApp para atender a tus clientes.', 'bg-emerald-500 shadow-emerald-200')}
      
      {renderCard('facebook', 'Facebook', <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>, 'Conecta tu página de Facebook para recibir Messenger.', 'bg-[#1877F2] shadow-blue-200')}

      {/* POPUP conectar canal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !modalLoading && setIsModalOpen(false)}></div>
          <div className="relative min-h-full flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl z-10">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="font-display font-700 text-lg text-ink-900">Conectar {modalTipo}</h2>
                <button onClick={() => !modalLoading && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-3">
                <p className="text-sm text-ink-500 mb-2">Elige cómo quieres conectar este canal:</p>

                {/* Opción 1: Meta oficial */}
                <label className={`relative block rounded-2xl border-2 p-4 cursor-pointer transition ${modalMetodo === 'oficial' ? 'border-emerald-500 bg-emerald-50/40 ring-4 ring-emerald-100' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
                  <input type="radio" name="metodo" value="oficial" className="sr-only" checked={modalMetodo === 'oficial'} onChange={() => setModalMetodo('oficial')} />
                  {modalMetodo === 'oficial' && (
                    <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                    </span>
                  )}
                  <div className="flex items-start gap-3 pr-8">
                    <svg className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-600 text-sm text-ink-900">Conexión oficial con Meta</p>
                        <span className="text-[10px] font-600 text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded uppercase tracking-wide">Recomendado</span>
                      </div>
                      <p className="text-xs text-ink-600 mb-2">Autoriza tu página desde Meta. Sin riesgo de baneo, conexión estable.</p>
                      <p className="text-xs text-emerald-700 font-500">Sin costo adicional</p>
                    </div>
                  </div>
                </label>

                {/* Opción 2: Whaticket */}
                <label className={`relative block rounded-2xl border-2 p-4 cursor-pointer transition ${modalMetodo === 'whaticket' ? 'border-amber-500 bg-amber-50/40 ring-4 ring-amber-100' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
                  <input type="radio" name="metodo" value="whaticket" className="sr-only" checked={modalMetodo === 'whaticket'} onChange={() => setModalMetodo('whaticket')} />
                  {modalMetodo === 'whaticket' && (
                    <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-amber-600 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                    </span>
                  )}
                  <div className="flex items-start gap-3 pr-8">
                    <svg className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z"/></svg>
                    <div className="flex-1">
                      <p className="font-600 text-sm text-ink-900 mb-1">Conexión vía Whaticket</p>
                      <p className="text-xs text-ink-600 mb-2">Se conecta escaneando un código QR desde tu cuenta. Más rápido pero con riesgo de que Meta detecte la sesión y bloquee tu cuenta.</p>
                      <p className="text-xs text-amber-700 font-500">Requiere aceptación de riesgo</p>
                    </div>
                  </div>
                </label>
                
                {modalMetodo === 'whaticket' && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={aceptaRiesgo} onChange={e => setAceptaRiesgo(e.target.checked)} className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500" />
                      <span className="text-sm font-500 text-ink-700">Entiendo y acepto el riesgo de baneo por usar esta conexión no oficial.</span>
                    </label>
                  </div>
                )}

              </div>
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
                <button onClick={() => setIsModalOpen(false)} disabled={modalLoading} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">Cancelar</button>
                <button onClick={handleConectar} disabled={modalLoading || (modalMetodo === 'whaticket' && !aceptaRiesgo)} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50">
                  {modalLoading ? 'Conectando...' : 'Continuar →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
