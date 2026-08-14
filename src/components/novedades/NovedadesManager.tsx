'use client'
import Loading from '@/components/Loading'
import Link from 'next/link'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

import { useState, useEffect } from 'react'
import {
  getNovedades,
  crearNovedad,
  actualizarNovedad,
  eliminarNovedad,
  NovedadData
} from '@/app/actions/novedades'
import { getTiposNovedad, TipoNovedadData } from '@/app/actions/tipos-novedad'
import { getMisPermisos } from '@/app/actions/permisos'

export function getIconSvg(icono: string, className = "w-6 h-6") {
  switch (icono) {
    case 'reloj': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    case 'caja': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
    case 'estrella': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
    case 'calendario': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    case 'informacion': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    case 'campana': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
    case 'megafono': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
    case 'etiqueta': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" /></svg>
    case 'camion': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>
    case 'candado': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
    case 'check': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    case 'alerta': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
    case 'corazon': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
    case 'fuego': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
    case 'regalo': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
    case 'ubicacion': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    case 'telefono': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
    case 'email': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
    case 'rayo': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    case 'usuario': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    case 'billete': return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    default:
      return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  }
}

function formatDate(isoStr: string | null) {
  if (!isoStr) return 'sin fecha límite'
  const d = new Date(isoStr)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${min}`
}

function toDatetimeLocal(isoStr: string | null) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function fromDatetimeLocal(dtLocal: string) {
  if (!dtLocal) return null
  return new Date(dtLocal).toISOString()
}

export default function NovedadesManager() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<any[]>([])
  const [tipos, setTipos] = useState<TipoNovedadData[]>([])
  const [filtro, setFiltro] = useState<'vigentes' | 'expiradas' | 'todas'>('vigentes')
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'añadir' | 'editar'>('añadir')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  // Confirm delete modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [formData, setFormData] = useState<{
    tipo_id: string
    descripcion: string
    fecha_vigencia_inicio: string
    fecha_vigencia_fin: string
  }>({
    tipo_id: '',
    descripcion: '',
    fecha_vigencia_inicio: '',
    fecha_vigencia_fin: ''
  })

  const cargar = async () => {
    setLoading(true)
    
    const [resNovedades, resTipos, permisosRes] = await Promise.all([
      getNovedades(),
      getTiposNovedad(),
      getMisPermisos()
    ])

    if (resTipos.success && resTipos.data) {
      setTipos(resTipos.data)
    }

    if (resNovedades.success && resNovedades.data) {
      setItems(resNovedades.data)
    }

    if (permisosRes.success) {
      if ((permisosRes as any).esAdmin) {
        setNivelPermiso('escritura')
      } else {
        const p = (permisosRes.data || []).find((p: any) => p.seccion === 'novedades')
        setNivelPermiso(p?.nivel || 'ninguno')
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const openAñadir = () => {
    if (tipos.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Debes configurar al menos un Tipo de Novedad en el Perfil de Sucursal antes de añadir novedades.' })
      setTimeout(() => setMensaje(null), 4000)
      return
    }

    setModalMode('añadir')
    setEditingId(null)
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    
    setFormData({
      tipo_id: tipos[0].id!,
      descripcion: '',
      fecha_vigencia_inicio: now.toISOString().slice(0, 16),
      fecha_vigencia_fin: ''
    })
    setIsModalOpen(true)
  }

  const openEditar = (item: any) => {
    setModalMode('editar')
    setEditingId(item.id)
    setFormData({
      tipo_id: item.tipo_id || (tipos.length > 0 ? tipos[0].id! : ''),
      descripcion: item.descripcion || '',
      fecha_vigencia_inicio: toDatetimeLocal(item.fecha_vigencia_inicio),
      fecha_vigencia_fin: toDatetimeLocal(item.fecha_vigencia_fin)
    })
    setIsModalOpen(true)
  }

  const openEliminar = (id: string) => {
    setDeletingId(id)
    setIsDeleteModalOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingId) return
    setIsDeleteModalOpen(false)
    setLoading(true)
    
    const res = await eliminarNovedad(deletingId)
    if (res.success) {
      setItems(prev => prev.filter(i => i.id !== deletingId))
      setMensaje({ tipo: 'exito', texto: 'Novedad eliminada correctamente ✓' })
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al eliminar la novedad' })
    }
    setTimeout(() => setMensaje(null), 3000)
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    
    // Si estamos editando, NO mandamos las fechas, usamos las que ya tenía la novedad.
    // Solo permitimos editar tipo y descripción.
    let dataToSave: Partial<NovedadData & { activo: boolean }> = {}
    
    if (modalMode === 'añadir') {
      dataToSave = { 
        tipo_id: formData.tipo_id,
        descripcion: formData.descripcion,
        fecha_vigencia_inicio: fromDatetimeLocal(formData.fecha_vigencia_inicio)!,
        fecha_vigencia_fin: fromDatetimeLocal(formData.fecha_vigencia_fin)
      }
    } else {
      dataToSave = {
        tipo_id: formData.tipo_id,
        descripcion: formData.descripcion
      }
    }

    let res
    if (modalMode === 'añadir') {
      res = await crearNovedad(dataToSave as NovedadData)
    } else {
      res = await actualizarNovedad(editingId!, dataToSave)
    }

    if (res.success && res.data) {
      if (modalMode === 'añadir') {
        setItems(prev => [res.data, ...prev])
      } else {
        setItems(prev => prev.map(it => it.id === editingId ? { ...it, ...res.data } : it))
      }
      setIsModalOpen(false)
      setMensaje({ tipo: 'exito', texto: modalMode === 'añadir' ? 'Novedad añadida correctamente ✓' : 'Novedad actualizada correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar la novedad' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setSaving(false)
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

  const filteredItems = items.filter(item => {
    if (filtro === 'vigentes') return item.activo === true
    if (filtro === 'expiradas') return item.activo === false
    return true
  })

  const countVigentes = items.filter(i => i.activo).length
  const countExpiradas = items.filter(i => !i.activo).length
  const countTodas = items.length

  return (
    <div className="p-6 sm:p-10 max-w-4xl w-full mx-auto pb-20">
      
      {mensaje && (
        <div className={`mb-6 text-sm font-semibold px-4 py-3 rounded-xl ${mensaje.tipo === 'exito' ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* Encabezado + acciones */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Novedades del día</h1>
          <p className="text-ink-500 mt-1 max-w-xl">Cambios puntuales que tu IA debe saber para responder mejor.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/perfil-sucursal#tipos-novedad" className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-600 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Gestionar tipos
          </Link>
          <button onClick={openAñadir} disabled={nivelPermiso !== 'escritura'} className="inline-flex items-center gap-2 px-4 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Nueva novedad
          </button>
        </div>
      </div>

      {items.length > 0 ? (
        <>
          {/* Pestañas de filtrado */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-6 w-fit overflow-x-auto max-w-full">
            <button
              onClick={() => setFiltro('vigentes')}
              className={`px-4 py-2 text-sm font-600 rounded-lg transition-all whitespace-nowrap ${filtro === 'vigentes' ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500 hover:text-ink-700 hover:bg-slate-200/50'}`}
            >
              Vigentes ({countVigentes})
            </button>
            <button
              onClick={() => setFiltro('expiradas')}
              className={`px-4 py-2 text-sm font-600 rounded-lg transition-all whitespace-nowrap ${filtro === 'expiradas' ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500 hover:text-ink-700 hover:bg-slate-200/50'}`}
            >
              Expiradas ({countExpiradas})
            </button>
            <button
              onClick={() => setFiltro('todas')}
              className={`px-4 py-2 text-sm font-600 rounded-lg transition-all whitespace-nowrap ${filtro === 'todas' ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500 hover:text-ink-700 hover:bg-slate-200/50'}`}
            >
              Todas ({countTodas})
            </button>
          </div>

          {/* Lista */}
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500">
              No hay novedades en esta vista.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col divide-y divide-slate-100 relative">
              {filteredItems.map((item) => {
                const tipo = tipos.find(t => t.id === item.tipo_id) || { nombre: 'Desconocido', icono: 'informacion', color: 'slate' }
                
                return (
                  <div key={item.id} className="p-4 sm:p-5 flex items-start gap-4 hover:bg-slate-50 transition-colors bg-white">
                    {/* Icono fijo */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-${tipo.color}-100 text-${tipo.color}-600`}>
                      {getIconSvg(tipo.icono)}
                    </div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-700 bg-${tipo.color}-100 text-${tipo.color}-700 uppercase`}>
                          {tipo.nombre}
                        </span>
                        
                        {/* Estado */}
                        <div className="flex items-center gap-1.5 text-xs font-500">
                          <span className={`w-2 h-2 rounded-full ${item.activo ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                          <span className={item.activo ? 'text-emerald-700' : 'text-slate-500'}>
                            {item.activo ? 'Vigente' : 'Expirada'}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-sm text-ink-700 mb-3 whitespace-pre-wrap">{item.descripcion}</p>
                      
                      {/* Pie */}
                      <p className="text-xs text-ink-400">
                        Hasta {formatDate(item.fecha_vigencia_fin)} · cargado por {item.users?.nombre || item.users?.email} el {formatDate(item.created_at)}
                      </p>
                    </div>

                    {/* Controles */}
                    <div className="flex flex-col items-center shrink-0 ml-2 gap-2">
                      <button onClick={() => openEditar(item)} disabled={nivelPermiso !== 'escritura'} className="p-2 rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Editar">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={() => openEliminar(item.id)} disabled={nivelPermiso !== 'escritura'} className="p-2 rounded-lg text-ink-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Eliminar">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        /* Estado Vacío global */
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-5 text-slate-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p className="font-semibold text-ink-900 text-lg mb-2">No tienes ninguna novedad cargada.</p>
          <p className="text-ink-500 text-sm mb-6 max-w-sm mx-auto">Añade cambios temporales en horarios, ofertas de stock o eventos para que la IA los comunique a tus clientes.</p>
          <div className="flex items-center justify-center">
            <button 
              onClick={openAñadir} 
              disabled={nivelPermiso !== 'escritura'}
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Nueva novedad
            </button>
          </div>
        </div>
      )}

      {/* Info box inferior */}
      {items.length > 0 && (
        <div className="mt-8 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 flex items-start gap-3">
          <svg className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>La IA solo usa las novedades vigentes para responder. Las novedades caducadas se archivan automáticamente cuando superan la fecha establecida.</p>
        </div>
      )}

      {/* =========================================================
           POPUP · Añadir / Editar novedad
           ========================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={() => !saving && setIsModalOpen(false)}></div>
        
          <div className="relative min-h-full flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]">
              
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 h-full">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                  <h2 className="font-display font-700 text-lg text-ink-900">{modalMode === 'editar' ? 'Editar novedad' : 'Nueva novedad'}</h2>
                  <button type="button" onClick={() => !saving && setIsModalOpen(false)} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition" aria-label="Cerrar">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
        
                <div className="flex-1 min-h-0 px-6 py-5 space-y-6 overflow-y-auto">
                  {/* Selector de Tipo */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-2">Tipo de novedad</label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                      {tipos.map((tipo) => {
                        const isSelected = formData.tipo_id === tipo.id
                        return (
                          <button
                            key={tipo.id}
                            type="button"
                            onClick={() => setFormData({...formData, tipo_id: tipo.id!})}
                            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${isSelected ? 'border-' + tipo.color + '-500 bg-' + tipo.color + '-50/40 ring-4 ring-' + tipo.color + '-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                          >
                            <div className={`${isSelected ? 'text-' + tipo.color + '-600' : 'text-slate-400'}`}>
                              {getIconSvg(tipo.icono, 'w-6 h-6')}
                            </div>
                            <span className={`text-[10px] font-700 ${isSelected ? 'text-' + tipo.color + '-700' : 'text-slate-500'} uppercase text-center line-clamp-1`}>
                              {tipo.nombre}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Descripción */}
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Descripción</label>
                    <textarea rows={4} placeholder="Ej. Hoy cerramos a las 18:00 por festivo local..." required
                      value={formData.descripcion}
                      onChange={e => setFormData({...formData, descripcion: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
                    <p className="text-xs text-ink-400 mt-1.5">
                      Esto es lo que la IA tendrá en cuenta al responder.
                    </p>
                  </div>

                  {/* Vigencia */}
                  {modalMode === 'añadir' ? (
                    <div>
                      <label className="block text-sm font-500 text-ink-700 mb-2">Vigencia</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-500 text-slate-500 mb-1">Desde</label>
                          <input type="datetime-local" required
                            value={formData.fecha_vigencia_inicio}
                            onChange={e => setFormData({...formData, fecha_vigencia_inicio: e.target.value})}
                            className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-500 text-slate-500 mb-1">Hasta (opcional)</label>
                          <input type="datetime-local"
                            value={formData.fecha_vigencia_fin}
                            onChange={e => setFormData({...formData, fecha_vigencia_fin: e.target.value})}
                            className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition text-sm" 
                          />
                        </div>
                      </div>
                      <p className="text-xs text-ink-400 mt-2">
                        Pasada la fecha de "Hasta", la novedad se archiva y deja de afectar a la IA.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <p className="text-sm font-500 text-slate-700 flex items-center gap-2">
                          <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Las fechas de una novedad no se pueden editar.
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Si necesitas cambiar la vigencia, elimina esta novedad y crea una nueva.</p>
                      </div>
                    </div>
                  )}
        
                </div>
        
                <div className="flex justify-end gap-3 px-6 pt-5 pb-6 border-t border-slate-100 shrink-0 bg-white">
                  <button type="button" disabled={saving} onClick={() => setIsModalOpen(false)} className="px-5 h-11 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-600 text-ink-700 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving} className="px-5 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 shadow-lg shadow-brand-600/30 transition flex items-center gap-2 disabled:bg-brand-400">
                    {saving ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Guardando...
                      </>
                    ) : 'Guardar novedad'}
                  </button>
                </div>
              </form>
        
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Eliminar novedad"
        message="¿Estás seguro de que deseas eliminar esta novedad de forma permanente? La IA dejará de usar esta información inmediatamente."
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </div>
  )
}
