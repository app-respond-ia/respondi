'use client'
import Loading from '@/components/Loading'

import { useState, useEffect } from 'react'
import {
  getContactosConfig,
  actualizarContactosConfig,
  getContactos,
  actualizarTratoContacto,
  ContactosConfigData
} from '@/app/actions/contactos'
import { getMisPermisos } from '@/app/actions/permisos'
import { formatChannelId } from '@/lib/formatters'

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

const MODO_UI_CONFIG = {
  ignorar: {
    label: 'Ignorar en silencio',
    badgeColor: 'bg-slate-100 text-slate-700',
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
  },
  respuesta_automatica: {
    label: 'Respuesta automática',
    badgeColor: 'bg-brand-100 text-brand-700',
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
  },
  derivar: {
    label: 'Derivar a un agente',
    badgeColor: 'bg-orange-100 text-orange-700',
    icon: <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-6a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
  }
} as const

type CanalConfigKey = keyof typeof CANAL_CONFIG
type ModoContacto = 'ignorar' | 'respuesta_automatica' | 'derivar'
type TratoContacto = 'normal' | 'sin_ia' | 'bloqueado'

function formatDate(isoStr: string) {
  const d = new Date(isoStr)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export default function ContactosPage() {
  const [loading, setLoading] = useState(true)
  const [contactos, setContactos] = useState<any[]>([])
  
  // Filtros
  const [filtroTrato, setFiltroTrato] = useState<'todos' | 'normal' | 'sin_ia' | 'bloqueado'>('todos')
  const [filtroModo, setFiltroModo] = useState<'todos' | ModoContacto>('todos')
  
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  
  // Config state (Global settings)
  const [modo, setModo] = useState<ModoContacto>('ignorar')
  const [respuestaAuto, setRespuestaAuto] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalActiveTab, setModalActiveTab] = useState<'contacto' | 'global'>('contacto')
  const [savingContacto, setSavingContacto] = useState(false)
  
  const [modalFormData, setModalFormData] = useState<{
    id?: string
    canal: CanalConfigKey
    identificador_canal: string
    prefijo_whatsapp: string
    numero_whatsapp: string
    nombre: string
    trato: TratoContacto
    modo_contacto: ModoContacto | null
    nota: string
  }>({
    canal: 'whatsapp',
    identificador_canal: '',
    prefijo_whatsapp: '+34',
    numero_whatsapp: '',
    nombre: '',
    trato: 'bloqueado',
    modo_contacto: 'ignorar',
    nota: ''
  })

  const cargar = async () => {
    setLoading(true)
    const [configRes, contactosRes, permisosRes] = await Promise.all([
      getContactosConfig(),
      getContactos(),
      getMisPermisos()
    ])

    if (configRes.success && configRes.data) {
      setModo(configRes.data.trato_contactos_modo as ModoContacto || 'ignorar')
      setRespuestaAuto(configRes.data.trato_contactos_respuesta_auto || '')
    }

    if (contactosRes.success && contactosRes.data) {
      setContactos(contactosRes.data)
    }

    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        setNivelPermiso('escritura')
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'contactos')
        setNivelPermiso(p?.nivel || 'ninguno')
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  // Limpiar filtro modo si se selecciona 'normales'
  useEffect(() => {
    if (filtroTrato === 'normal') {
      setFiltroModo('todos')
    }
  }, [filtroTrato])

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingConfig(true)
    const payload: ContactosConfigData = {
      trato_contactos_modo: modo,
      trato_contactos_respuesta_auto: modo === 'respuesta_automatica' ? respuestaAuto : null
    }

    const res = await actualizarContactosConfig(payload)
    if (res.success) {
      setMensaje({ tipo: 'exito', texto: 'Configuración guardada correctamente ✓' })
      setIsModalOpen(false)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar la configuración' })
    }
    setTimeout(() => setMensaje(null), 3000)
    setSavingConfig(false)
  }

  const openAñadir = () => {
    setModalActiveTab('contacto')
    setModalFormData({
      canal: 'whatsapp',
      identificador_canal: '',
      prefijo_whatsapp: '+34',
      numero_whatsapp: '',
      nombre: '',
      trato: 'bloqueado',
      modo_contacto: modo,
      nota: ''
    })
    setIsModalOpen(true)
  }

  const openEditar = (contacto: any) => {
    let prefijo = '+34'
    let numero = ''
    
    if (contacto.canal === 'whatsapp') {
      const match = contacto.identificador_canal.match(/^(\+\d{1,4})(.*)$/)
      if (match) {
        prefijo = match[1]
        numero = match[2]
      } else {
        numero = contacto.identificador_canal.replace(/^\+/, '')
      }
    }

    setModalActiveTab('contacto')
    setModalFormData({
      id: contacto.id,
      canal: contacto.canal,
      identificador_canal: contacto.canal !== 'whatsapp' ? contacto.identificador_canal : '',
      prefijo_whatsapp: prefijo,
      numero_whatsapp: numero,
      nombre: contacto.nombre || '',
      trato: contacto.trato,
      modo_contacto: contacto.modo || modo,
      nota: contacto.nota || ''
    })
    setIsModalOpen(true)
  }

  const handleGuardarContacto = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingContacto(true)

    const identificadorRaw = modalFormData.canal === 'whatsapp'
      ? `${modalFormData.prefijo_whatsapp}${modalFormData.numero_whatsapp}`
      : modalFormData.identificador_canal

    const identificadorFormateado = formatChannelId(modalFormData.canal, identificadorRaw)

    const res = await actualizarTratoContacto({
      canal: modalFormData.canal,
      identificador_canal: identificadorFormateado,
      nombre: modalFormData.nombre || null,
      trato: modalFormData.trato,
      modo: modalFormData.trato === 'normal' ? null : modalFormData.modo_contacto,
      nota: modalFormData.nota
    })

    if (res.success && res.data) {
      setContactos(prev => [res.data, ...prev.filter(c => c.id !== res.data.id)])
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: 'Contacto guardado correctamente ✓' })
    } else {
      setMensaje({ tipo: 'error', texto: 'Error al guardar contacto: ' + res.error })
    }
    setTimeout(() => setMensaje(null), 3000)
    setSavingContacto(false)
  }

  const handleDesbloquear = async (contacto: any) => {
    if (!window.confirm('¿Cambiar el trato de este contacto a Normal? La IA volverá a responderle.')) return

    const res = await actualizarTratoContacto({
      canal: contacto.canal,
      identificador_canal: contacto.identificador_canal,
      nombre: contacto.nombre || null,
      trato: 'normal',
      nota: 'Restaurado a normal'
    })
    
    if (res.success && res.data) {
      setContactos(prev => [res.data, ...prev.filter(c => c.id !== contacto.id)])
      setMensaje({ tipo: 'exito', texto: 'Contacto restaurado a estado normal ✓' })
    } else {
      setMensaje({ tipo: 'error', texto: 'Error al actualizar contacto: ' + res.error })
    }
    setTimeout(() => setMensaje(null), 3000)
  }

  const contactosFiltrados = contactos.filter(c => {
    const pasaTrato = filtroTrato === 'todos' || c.trato === filtroTrato
    const pasaModo = filtroModo === 'todos' || c.modo === filtroModo
    return pasaTrato && pasaModo
  })

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
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Contactos</h1>
          <p className="text-ink-500 mt-1 max-w-xl">Gestiona el trato especial para contactos (bloqueados o sin IA).</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={openAñadir} disabled={nivelPermiso !== 'escritura'} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nuevo trato de contacto
          </button>
        </div>
      </div>

      {/* ====== LISTA DE CONTACTOS GESTIONADOS ====== */}
      <section>
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <h2 className="font-display font-600 text-lg text-ink-900">Contactos gestionados</h2>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filtro principal (Trato) */}
            <select
              value={filtroTrato}
              onChange={e => setFiltroTrato(e.target.value as any)}
              className="h-[32px] px-3 rounded-lg border border-slate-300 bg-white text-xs font-500 text-ink-700 focus:outline-none focus:border-brand-500 transition"
            >
              <option value="todos">Todos los tratos</option>
              <option value="normal">Normales</option>
              <option value="sin_ia">Sin IA</option>
              <option value="bloqueado">Bloqueados</option>
            </select>

            {/* Filtro secundario (Modo) */}
            {filtroTrato !== 'normal' && (
              <select
                value={filtroModo}
                onChange={e => setFiltroModo(e.target.value as any)}
                className="h-[32px] px-3 rounded-lg border border-slate-300 bg-white text-xs font-500 text-ink-700 focus:outline-none focus:border-brand-500 transition"
              >
                <option value="todos">Cualquier modo</option>
                <option value="ignorar">Ignorar en silencio</option>
                <option value="respuesta_automatica">Respuesta automática</option>
                <option value="derivar">Derivar a un agente</option>
              </select>
            )}
          </div>
        </div>

        {contactosFiltrados.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="font-semibold text-ink-900 text-lg mb-2">No hay contactos en esta vista.</p>
            <p className="text-ink-500 text-sm">Cambia el filtro o añade un nuevo trato especial.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col divide-y divide-slate-100 relative">
            {contactosFiltrados.map((contacto) => {
              const conf = CANAL_CONFIG[contacto.canal as CanalConfigKey]
              const modoInfo = contacto.modo && contacto.trato !== 'normal' ? MODO_UI_CONFIG[contacto.modo as ModoContacto] : null
              
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
                      
                      {contacto.trato === 'bloqueado' && (
                        <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-600 rounded">Bloqueado</span>
                      )}
                      {contacto.trato === 'sin_ia' && (
                        <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-600 rounded">Sin IA</span>
                      )}
                      {contacto.trato === 'normal' && (
                        <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-600 rounded">Normal</span>
                      )}
                      
                      {/* Badge de modo */}
                      {modoInfo && (
                        <span className={`flex items-center gap-1 px-2 py-0.5 text-xs font-600 rounded ${modoInfo.badgeColor}`}>
                          {modoInfo.icon}
                          {modoInfo.label}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-ink-500 mb-2 line-clamp-2">{contacto.nota}</p>
                    
                    {/* Pie */}
                    <p className="text-xs text-ink-400">
                      Actualizado el {contacto.fecha_actualizacion ? formatDate(contacto.fecha_actualizacion) : 'desconocido'}
                    </p>
                  </div>

                  {/* Controles */}
                  <div className="flex items-center shrink-0 ml-2 gap-2">
                    <button onClick={() => openEditar(contacto)} disabled={nivelPermiso !== 'escritura'} className="px-3 h-9 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-600 text-ink-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
                      Editar
                    </button>
                    {contacto.trato !== 'normal' && (
                      <button onClick={() => handleDesbloquear(contacto)} disabled={nivelPermiso !== 'escritura'} className="px-3 h-9 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-600 text-ink-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
                        Hacer normal
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* =========================================================
           POPUP · Guardar contacto / Ajustes Globales
           ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !savingContacto && !savingConfig && setIsModalOpen(false)}></div>
        
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl pointer-events-auto flex flex-col max-h-[90vh]">
              
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                <h2 className="font-display font-700 text-lg text-ink-900">{modalFormData.id ? 'Editar contacto' : 'Nuevo trato especial'}</h2>
                <button type="button" onClick={() => !savingContacto && !savingConfig && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>

              {!modalFormData.id && (
                <div className="px-6 pt-4 shrink-0">
                  <div className="flex p-1 bg-slate-100 rounded-xl">
                    <button type="button" onClick={() => setModalActiveTab('contacto')} className={`flex-1 py-2 text-sm font-600 rounded-lg transition ${modalActiveTab === 'contacto' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}>Contacto individual</button>
                    <button type="button" onClick={() => setModalActiveTab('global')} className={`flex-1 py-2 text-sm font-600 rounded-lg transition ${modalActiveTab === 'global' ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500 hover:text-ink-700'}`}>Ajustes globales</button>
                  </div>
                </div>
              )}

              {modalActiveTab === 'contacto' || modalFormData.id ? (
                <form onSubmit={handleGuardarContacto} className="flex flex-col flex-1 min-h-0">
                  <div className="px-6 py-5 space-y-4 overflow-y-auto">
                    {/* Trato */}
                    <div>
                      <label className="block text-sm font-500 text-ink-700 mb-1.5">Trato del contacto</label>
                      <select required
                        value={modalFormData.trato}
                        onChange={e => setModalFormData({...modalFormData, trato: e.target.value as TratoContacto})}
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm">
                        <option value="normal">Normal (Responde IA)</option>
                        <option value="sin_ia">Sin IA (Pausada siempre)</option>
                        <option value="bloqueado">Bloqueado</option>
                      </select>
                    </div>

                    {/* Modo (Solo si no es normal) */}
                    {modalFormData.trato !== 'normal' && (
                      <div>
                        <label className="block text-sm font-500 text-ink-700 mb-1.5">Acción a realizar</label>
                        <select required
                          value={modalFormData.modo_contacto || 'ignorar'}
                          onChange={e => setModalFormData({...modalFormData, modo_contacto: e.target.value as ModoContacto})}
                          className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm">
                          <option value="ignorar">Ignorar en silencio</option>
                          <option value="respuesta_automatica">Respuesta automática (Mensaje global)</option>
                          <option value="derivar">Derivar a un agente (Caso)</option>
                        </select>
                      </div>
                    )}

                    {/* Canal */}
                    <div>
                      <label className="block text-sm font-500 text-ink-700 mb-1.5">Canal</label>
                      <select required
                        disabled={!!modalFormData.id}
                        value={modalFormData.canal}
                        onChange={e => setModalFormData({...modalFormData, canal: e.target.value as CanalConfigKey})}
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm disabled:bg-slate-50 disabled:opacity-75">
                        <option value="whatsapp">WhatsApp</option>
                        <option value="instagram">Instagram</option>
                        <option value="facebook">Facebook</option>
                      </select>
                    </div>

                    {/* Identificador */}
                    <div>
                      <label className="block text-sm font-500 text-ink-700 mb-1.5">Identificador del contacto</label>
                      {modalFormData.canal === 'whatsapp' ? (
                        <div className="flex gap-2">
                          <select 
                            disabled={!!modalFormData.id}
                            value={modalFormData.prefijo_whatsapp}
                            onChange={e => setModalFormData({...modalFormData, prefijo_whatsapp: e.target.value})}
                            className="w-28 shrink-0 h-12 px-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm disabled:bg-slate-50 disabled:opacity-75">
                            <option value="+34">🇪🇸 +34</option>
                            <option value="+52">🇲🇽 +52</option>
                            <option value="+54">🇦🇷 +54</option>
                            <option value="+57">🇨🇴 +57</option>
                            <option value="+51">🇵🇪 +51</option>
                            <option value="+56">🇨🇱 +56</option>
                            <option value="+598">🇺🇾 +598</option>
                            <option value="+595">🇵🇾 +595</option>
                            <option value="+58">🇻🇪 +58</option>
                            <option value="+593">🇪🇨 +593</option>
                            <option value="+591">🇧🇴 +591</option>
                            <option value="+502">🇬🇹 +502</option>
                            <option value="+503">🇸🇻 +503</option>
                            <option value="+504">🇭🇳 +504</option>
                            <option value="+505">🇳🇮 +505</option>
                            <option value="+506">🇨🇷 +506</option>
                            <option value="+507">🇵🇦 +507</option>
                            <option value="+1">🇺🇸 +1</option>
                          </select>
                          <input type="text" placeholder="Ej. 414 555 0000" required
                            disabled={!!modalFormData.id}
                            value={modalFormData.numero_whatsapp}
                            onChange={e => setModalFormData({...modalFormData, numero_whatsapp: e.target.value.replace(/\D/g, '')})}
                            className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm disabled:bg-slate-50 disabled:opacity-75" />
                        </div>
                      ) : (
                        <input type="text" placeholder="Ej. @usuario" required
                          disabled={!!modalFormData.id}
                          value={modalFormData.identificador_canal}
                          onChange={e => setModalFormData({...modalFormData, identificador_canal: e.target.value.replace(/[^a-zA-Z0-9._@]/g, '')})}
                          className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm disabled:bg-slate-50 disabled:opacity-75" />
                      )}
                      {!modalFormData.id && (
                        <p className="text-xs text-ink-500 mt-1">Se formateará automáticamente al guardar.</p>
                      )}
                    </div>

                    {/* Nombre */}
                    <div>
                      <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre <span className="text-ink-400 font-400">· opcional</span></label>
                      <input type="text" placeholder="Nombre del contacto si lo conoces"
                        value={modalFormData.nombre}
                        onChange={e => setModalFormData({...modalFormData, nombre: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" />
                    </div>

                    {/* Nota */}
                    <div>
                      <label className="block text-sm font-500 text-ink-700 mb-1.5">Nota / Razón</label>
                      <textarea rows={3} placeholder="Ej. Insultos repetidos, cliente que prefiere humano..." required
                        value={modalFormData.nota}
                        onChange={e => setModalFormData({...modalFormData, nota: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm"></textarea>
                    </div>
                  </div>
          
                  <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                    <button type="button" disabled={savingContacto} onClick={() => setIsModalOpen(false)} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                      Cancelar
                    </button>
                    <button type="submit" disabled={savingContacto} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition flex items-center gap-2 disabled:bg-brand-400">
                      {savingContacto ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleSaveConfig} className="flex flex-col flex-1 min-h-0">
                  <div className="px-6 py-5 overflow-y-auto space-y-4">
                    <p className="text-sm text-ink-500">Define qué sucederá por defecto cuando un contacto tenga estado "Bloqueado".</p>
                    
                    <div className="grid grid-cols-1 gap-3">
                      {/* Modo 1: ignorar */}
                      <label className={`relative rounded-2xl border-2 p-4 cursor-pointer transition ${nivelPermiso !== 'escritura' ? 'pointer-events-none opacity-50' : ''} ${modo === 'ignorar' ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="modo_global" value="ignorar" checked={modo === 'ignorar'} onChange={() => setModo('ignorar')} disabled={nivelPermiso !== 'escritura'} className="sr-only" />
                        {modo === 'ignorar' && (
                          <span className="absolute top-4 right-4 w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                          </span>
                        )}
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${modo === 'ignorar' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                            {MODO_UI_CONFIG.ignorar.icon}
                          </div>
                          <div>
                            <p className="font-600 text-sm text-ink-900">Ignorar en silencio</p>
                            <p className="text-xs text-ink-500 mt-0.5">no responde, no avisa</p>
                          </div>
                        </div>
                      </label>

                      {/* Modo 2: respuesta_automatica */}
                      <label className={`relative rounded-2xl border-2 p-4 cursor-pointer transition ${nivelPermiso !== 'escritura' ? 'pointer-events-none opacity-50' : ''} ${modo === 'respuesta_automatica' ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="modo_global" value="respuesta_automatica" checked={modo === 'respuesta_automatica'} onChange={() => setModo('respuesta_automatica')} disabled={nivelPermiso !== 'escritura'} className="sr-only" />
                        {modo === 'respuesta_automatica' && (
                          <span className="absolute top-4 right-4 w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                          </span>
                        )}
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${modo === 'respuesta_automatica' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                            {MODO_UI_CONFIG.respuesta_automatica.icon}
                          </div>
                          <div>
                            <p className="font-600 text-sm text-ink-900">Respuesta automática</p>
                            <p className="text-xs text-ink-500 mt-0.5">envía un mensaje fijo, la IA no se activa</p>
                          </div>
                        </div>
                      </label>

                      {/* Modo 3: derivar */}
                      <label className={`relative rounded-2xl border-2 p-4 cursor-pointer transition ${nivelPermiso !== 'escritura' ? 'pointer-events-none opacity-50' : ''} ${modo === 'derivar' ? 'border-brand-500 bg-brand-50/50 ring-4 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="radio" name="modo_global" value="derivar" checked={modo === 'derivar'} onChange={() => setModo('derivar')} disabled={nivelPermiso !== 'escritura'} className="sr-only" />
                        {modo === 'derivar' && (
                          <span className="absolute top-4 right-4 w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                          </span>
                        )}
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${modo === 'derivar' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                            {MODO_UI_CONFIG.derivar.icon}
                          </div>
                          <div>
                            <p className="font-600 text-sm text-ink-900">Derivar a un agente</p>
                            <p className="text-xs text-ink-500 mt-0.5">abre un caso para que un humano gestione cada mensaje</p>
                          </div>
                        </div>
                      </label>
                    </div>

                    {modo === 'respuesta_automatica' && (
                      <div className="mt-4 p-4 rounded-2xl bg-white border border-slate-200">
                        <label className="block text-sm font-500 text-ink-700 mb-1.5">Mensaje que se enviará</label>
                        <textarea rows={2} 
                          value={respuestaAuto}
                          onChange={e => setRespuestaAuto(e.target.value)}
                          disabled={nivelPermiso !== 'escritura'}
                          placeholder="Lo sentimos, no podemos atender tu mensaje en este momento. Para cualquier consulta urgente, contáctanos por otro canal."
                          className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:opacity-50 disabled:bg-slate-50"></textarea>
                      </div>
                    )}
                  </div>
          
                  <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                    <button type="button" disabled={savingConfig} onClick={() => setIsModalOpen(false)} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                      Cancelar
                    </button>
                    <button type="submit" disabled={savingConfig || nivelPermiso !== 'escritura'} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition flex items-center gap-2 disabled:bg-brand-400 disabled:shadow-none">
                      {savingConfig ? 'Guardando...' : 'Guardar configuración'}
                    </button>
                  </div>
                </form>
              )}
        
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
