'use client'

import { useState, useEffect } from 'react'
import {
  getBlacklistConfig,
  actualizarBlacklistConfig,
  getContactosBloqueados,
  bloquearContacto,
  desbloquearContacto,
  BlacklistConfigData,
  BloquearContactoData
} from '@/app/actions/blacklist'

const CANAL_CONFIG = {
  instagram: {
    label: 'Instagram',
    iconBg: 'bg-gradient-to-br from-pink-500 to-purple-500',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  whatsapp: {
    label: 'WhatsApp',
    iconBg: 'bg-emerald-500',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/>
      </svg>
    ),
  },
  facebook: {
    label: 'Facebook',
    iconBg: 'bg-blue-600',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
} as const

type CanalConfigKey = keyof typeof CANAL_CONFIG
type BlacklistModo = 'ignorar' | 'respuesta_automatica' | 'derivar'

function formatDate(isoStr: string) {
  const d = new Date(isoStr)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export default function BlacklistPage() {
  const [loading, setLoading] = useState(true)
  const [contactos, setContactos] = useState<any[]>([])
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)
  
  // Config state
  const [modo, setModo] = useState<BlacklistModo>('ignorar')
  const [respuestaAuto, setRespuestaAuto] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [savingContacto, setSavingContacto] = useState(false)
  const [modalFormData, setModalFormData] = useState<{
    canal: CanalConfigKey
    identificador_canal: string
    nombre: string
    blacklist_razon: string
  }>({
    canal: 'instagram',
    identificador_canal: '',
    nombre: '',
    blacklist_razon: ''
  })

  const cargar = async () => {
    setLoading(true)
    const [configRes, contactosRes] = await Promise.all([
      getBlacklistConfig(),
      getContactosBloqueados()
    ])

    if (configRes.success && configRes.data) {
      setModo(configRes.data.blacklist_modo as BlacklistModo || 'ignorar')
      setRespuestaAuto(configRes.data.blacklist_respuesta_auto || '')
    }

    if (contactosRes.success && contactosRes.data) {
      setContactos(contactosRes.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    const payload: BlacklistConfigData = {
      blacklist_modo: modo,
      blacklist_respuesta_auto: modo === 'respuesta_automatica' ? respuestaAuto : null
    }

    const res = await actualizarBlacklistConfig(payload)
    if (res.success) {
      setMensaje({ tipo: 'exito', texto: 'Configuración guardada correctamente ✓' })
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar la configuración' })
    }
    setTimeout(() => setMensaje(null), 3000)
    setSavingConfig(false)
  }

  const openAñadir = () => {
    setModalFormData({
      canal: 'instagram',
      identificador_canal: '',
      nombre: '',
      blacklist_razon: ''
    })
    setIsModalOpen(true)
  }

  const handleBloquear = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingContacto(true)

    const res = await bloquearContacto({
      canal: modalFormData.canal,
      identificador_canal: modalFormData.identificador_canal,
      nombre: modalFormData.nombre || null,
      blacklist_razon: modalFormData.blacklist_razon
    })

    if (res.success && res.data) {
      // Remove possible existing from list first
      setContactos(prev => [res.data, ...prev.filter(c => c.id !== res.data.id)])
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: 'Contacto bloqueado correctamente ✓' })
    } else {
      setMensaje({ tipo: 'error', texto: 'Error al bloquear contacto: ' + res.error })
    }
    setTimeout(() => setMensaje(null), 3000)
    setSavingContacto(false)
  }

  const handleDesbloquear = async (id: string) => {
    if (!window.confirm('¿Quitar este contacto de la blacklist?')) return

    const res = await desbloquearContacto(id)
    if (res.success) {
      setContactos(prev => prev.filter(c => c.id !== id))
      setMensaje({ tipo: 'exito', texto: 'Contacto desbloqueado correctamente ✓' })
    } else {
      setMensaje({ tipo: 'error', texto: 'Error al desbloquear contacto: ' + res.error })
    }
    setTimeout(() => setMensaje(null), 3000)
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando blacklist...</div>
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

      {/* Encabezado + acciones */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Blacklist</h1>
          <p className="text-ink-500 mt-1 max-w-xl">Contactos bloqueados. La IA detecta abusos y los sugiere, tú decides.</p>
        </div>
        <button onClick={openAñadir} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
          Bloquear contacto
        </button>
      </div>

      {/* ====== CONFIGURACIÓN DE MODO ====== */}
      <section className="mb-10">
        <div className="mb-4">
          <h2 className="font-display font-600 text-lg text-ink-900">Qué hacer cuando un contacto está bloqueado</h2>
          <p className="text-sm text-ink-500 mt-0.5">Aplica a todos los contactos de la blacklist.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Modo 1: ignorar */}
          <label className={`relative rounded-2xl border-2 p-4 cursor-pointer transition ${modo === 'ignorar' ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
            <input type="radio" name="modo" value="ignorar" checked={modo === 'ignorar'} onChange={() => setModo('ignorar')} className="sr-only" />
            {modo === 'ignorar' && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              </span>
            )}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${modo === 'ignorar' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
            </div>
            <p className="font-600 text-sm text-ink-900">Ignorar en silencio</p>
            <p className="text-xs text-ink-500 mt-1 leading-relaxed">no responde, no avisa</p>
          </label>

          {/* Modo 2: respuesta_automatica */}
          <label className={`relative rounded-2xl border-2 p-4 cursor-pointer transition ${modo === 'respuesta_automatica' ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
            <input type="radio" name="modo" value="respuesta_automatica" checked={modo === 'respuesta_automatica'} onChange={() => setModo('respuesta_automatica')} className="sr-only" />
            {modo === 'respuesta_automatica' && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              </span>
            )}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${modo === 'respuesta_automatica' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
            </div>
            <p className="font-600 text-sm text-ink-900">Respuesta automática</p>
            <p className="text-xs text-ink-500 mt-1 leading-relaxed">envía un mensaje fijo, la IA no se activa</p>
          </label>

          {/* Modo 3: derivar */}
          <label className={`relative rounded-2xl border-2 p-4 cursor-pointer transition ${modo === 'derivar' ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
            <input type="radio" name="modo" value="derivar" checked={modo === 'derivar'} onChange={() => setModo('derivar')} className="sr-only" />
            {modo === 'derivar' && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              </span>
            )}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${modo === 'derivar' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-6a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <p className="font-600 text-sm text-ink-900">Derivar a un agente</p>
            <p className="text-xs text-ink-500 mt-1 leading-relaxed">abre un caso para que un humano gestione cada mensaje</p>
          </label>
        </div>

        {modo === 'respuesta_automatica' && (
          <div className="mt-4 p-4 rounded-2xl bg-white border border-slate-200">
            <label className="block text-sm font-500 text-ink-700 mb-1.5">Mensaje que se enviará</label>
            <textarea rows={2} 
              value={respuestaAuto}
              onChange={e => setRespuestaAuto(e.target.value)}
              placeholder="Lo sentimos, no podemos atender tu mensaje en este momento. Para cualquier consulta urgente, contáctanos por otro canal."
              className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
          </div>
        )}

        <div className="mt-4 flex items-center gap-4">
          <button onClick={handleSaveConfig} disabled={savingConfig} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
            {savingConfig ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      </section>

      {/* ====== LISTA DE CONTACTOS BLOQUEADOS ====== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-600 text-lg text-ink-900">Contactos bloqueados</h2>
          <span className="text-sm font-500 text-ink-500 px-3 py-1 bg-slate-100 rounded-full">{contactos.length} contactos</span>
        </div>

        {contactos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="font-semibold text-ink-900 text-lg mb-2">No tienes contactos bloqueados.</p>
            <p className="text-ink-500 text-sm">Cuando bloquees a alguien, aparecerá aquí.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col divide-y divide-slate-100 relative">
            {contactos.map((contacto) => {
              const conf = CANAL_CONFIG[contacto.canal as CanalConfigKey]
              return (
                <div key={contacto.id} className="p-4 sm:p-5 flex items-start gap-4 hover:bg-slate-50 transition-colors bg-white">
                  
                  {/* Icono fijo */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${conf?.iconBg || 'bg-slate-500'} text-white`}>
                    {conf?.icon}
                  </div>

                  {/* Info principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-600 text-ink-900">{contacto.identificador_canal}</p>
                      {contacto.nombre && (
                        <span className="text-sm text-ink-600">({contacto.nombre})</span>
                      )}
                      <span className="text-xs text-ink-400 mt-0.5">{conf?.label || contacto.canal}</span>
                    </div>
                    
                    <p className="text-sm text-ink-500 mb-2 line-clamp-2">{contacto.blacklist_razon}</p>
                    
                    {/* Pie */}
                    <p className="text-xs text-ink-400">
                      Bloqueado el {contacto.fecha_blacklist ? formatDate(contacto.fecha_blacklist) : 'desconocido'}
                    </p>
                  </div>

                  {/* Controles */}
                  <div className="flex items-center shrink-0 ml-2">
                    <button onClick={() => handleDesbloquear(contacto.id)} className="px-3 h-9 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-600 text-ink-700 transition">
                      Desbloquear
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* =========================================================
           POPUP · Bloquear contacto
           ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !savingContacto && setIsModalOpen(false)}></div>
        
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl pointer-events-auto flex flex-col">
              
              <form onSubmit={handleBloquear} className="flex flex-col h-full">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                  <h2 className="font-display font-700 text-lg text-ink-900">Bloquear contacto</h2>
                  <button type="button" onClick={() => !savingContacto && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
        
                <div className="px-6 py-5 space-y-4">
                  {/* Canal */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Canal</label>
                    <select required
                      value={modalFormData.canal}
                      onChange={e => setModalFormData({...modalFormData, canal: e.target.value as CanalConfigKey})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm">
                      <option value="instagram">Instagram</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="facebook">Facebook</option>
                    </select>
                  </div>

                  {/* Identificador */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Identificador del contacto</label>
                    <input type="text" placeholder="Ej. @usuario o +58 414 555 0000" required
                      value={modalFormData.identificador_canal}
                      onChange={e => setModalFormData({...modalFormData, identificador_canal: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" />
                  </div>

                  {/* Nombre */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre <span className="text-ink-400 font-400">· opcional</span></label>
                    <input type="text" placeholder="Nombre del contacto si lo conoces"
                      value={modalFormData.nombre}
                      onChange={e => setModalFormData({...modalFormData, nombre: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" />
                  </div>

                  {/* Razón */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Razón del bloqueo</label>
                    <textarea rows={3} placeholder="Ej. Insultos repetidos, spam, lenguaje ofensivo..." required
                      value={modalFormData.blacklist_razon}
                      onChange={e => setModalFormData({...modalFormData, blacklist_razon: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm"></textarea>
                  </div>
                </div>
        
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                  <button type="button" disabled={savingContacto} onClick={() => setIsModalOpen(false)} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={savingContacto} className="px-5 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-600 shadow-lg shadow-red-600/30 transition flex items-center gap-2 disabled:bg-red-400">
                    {savingContacto ? 'Bloqueando...' : 'Bloquear'}
                  </button>
                </div>
              </form>
        
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
