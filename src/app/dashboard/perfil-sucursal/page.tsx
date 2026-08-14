'use client'
import Loading from '@/components/Loading'

import { useState, useEffect, useMemo } from 'react'
import { getPerfilSucursal, savePerfilSucursal } from '@/app/actions/perfil'
import { getHorarios, saveHorarios } from '@/app/actions/horarios'
import { getMisPermisos } from '@/app/actions/permisos'
import { getTiposNovedad, crearTipoNovedad, actualizarTipoNovedad, eliminarTipoNovedad, TipoNovedadData } from '@/app/actions/tipos-novedad'
import { getIconSvg } from '@/components/novedades/NovedadesManager'

const AVAILABLE_ICONS = [
  'campana', 'reloj', 'caja', 'estrella', 'calendario', 'informacion',
  'megafono', 'etiqueta', 'camion', 'candado', 'check', 'alerta', 
  'corazon', 'fuego', 'regalo', 'ubicacion', 'telefono', 'email', 
  'rayo', 'usuario', 'billete', 'bolsa', 'check-calendario', 'moneda',
  'herramienta', 'chat', 'nube', 'sol', 'luna'
]

// Forzamos a Tailwind a compilar estas clases dinámicas agregándolas aquí
const TAILWIND_SAFELIST = [
  'bg-blue-500 bg-blue-100 text-blue-600', 'bg-amber-500 bg-amber-100 text-amber-600',
  'bg-purple-500 bg-purple-100 text-purple-600', 'bg-pink-500 bg-pink-100 text-pink-600',
  'bg-emerald-500 bg-emerald-100 text-emerald-600', 'bg-slate-500 bg-slate-100 text-slate-600',
  'bg-rose-500 bg-rose-100 text-rose-600', 'bg-orange-500 bg-orange-100 text-orange-600',
  'bg-yellow-500 bg-yellow-100 text-yellow-600', 'bg-green-500 bg-green-100 text-green-600',
  'bg-teal-500 bg-teal-100 text-teal-600', 'bg-cyan-500 bg-cyan-100 text-cyan-600',
  'bg-sky-500 bg-sky-100 text-sky-600', 'bg-indigo-500 bg-indigo-100 text-indigo-600',
  'bg-violet-500 bg-violet-100 text-violet-600', 'bg-fuchsia-500 bg-fuchsia-100 text-fuchsia-600',
  'bg-red-500 bg-red-100 text-red-600', 'bg-lime-500 bg-lime-100 text-lime-600'
]

const DIAS_SEMANA = [
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
  { id: 6, label: 'Sábado' },
  { id: 0, label: 'Domingo' }
]

export default function PerfilSucursalPage() {
  const timezones = useMemo(() => {
    try {
      const tzList = Intl.supportedValuesOf('timeZone')
      return tzList.map(tz => {
        const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
        const parts = formatter.formatToParts(new Date())
        const offset = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT'
        return { id: tz, label: `${tz.replace(/_/g, ' ')} (${offset})` }
      })
    } catch (e) {
      return [
        { id: 'America/Caracas', label: 'America/Caracas (GMT-4)' },
        { id: 'America/Bogota', label: 'America/Bogota (GMT-5)' },
        { id: 'America/Mexico_City', label: 'America/Mexico City (GMT-6)' },
        { id: 'America/Argentina/Buenos_Aires', label: 'America/Argentina/Buenos Aires (GMT-3)' },
        { id: 'Europe/Madrid', label: 'Europe/Madrid (GMT+1)' }
      ]
    }
  }, [])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)
  const [nivelPermiso, setNivelPermiso] = useState<'ninguno' | 'lectura' | 'escritura' | null>(null)

  const [formData, setFormData] = useState({
    nombreSucursal: '',
    direccion: '',
    timezone: '',
    servicios: '',
    politicas: [] as {titulo: string, descripcion: string}[],
    idioma_base: 'es',
    tono: 'cercano',
    msg_fuera_horario: '',
    ia_activa_fuera_horario: false,
    caso_fuera_horario: false
  })
  const [horarios, setHorarios] = useState<any[]>([])

  const [copyPopoverOpen, setCopyPopoverOpen] = useState<number | null>(null)
  const [copyTargets, setCopyTargets] = useState<number[]>([])

  // Tipos de novedad
  const [tiposNovedad, setTiposNovedad] = useState<TipoNovedadData[]>([])
  const [tipoModalOpen, setTipoModalOpen] = useState(false)
  const [tipoEditItem, setTipoEditItem] = useState<TipoNovedadData | null>(null)
  const [tipoFormData, setTipoFormData] = useState({ nombre: '', icono: 'campana', color: 'slate' })
  const [isIconSelectorOpen, setIsIconSelectorOpen] = useState(false)
  const [savingTipo, setSavingTipo] = useState(false)

  const [politicaModalOpen, setPoliticaModalOpen] = useState(false)
  const [politicaEditIndex, setPoliticaEditIndex] = useState<number | null>(null)
  const [politicaTituloInput, setPoliticaTituloInput] = useState('')
  const [politicaDescInput, setPoliticaDescInput] = useState('')

  const openNewPolitica = () => {
    setPoliticaEditIndex(null)
    setPoliticaTituloInput('')
    setPoliticaDescInput('')
    setPoliticaModalOpen(true)
  }

  const openEditPolitica = (idx: number) => {
    setPoliticaEditIndex(idx)
    setPoliticaTituloInput(formData.politicas[idx].titulo)
    setPoliticaDescInput(formData.politicas[idx].descripcion)
    setPoliticaModalOpen(true)
  }

  const savePolitica = () => {
    const titulo = politicaTituloInput.trim()
    const descripcion = politicaDescInput.trim()
    if (!titulo || !descripcion) return
    if (politicaEditIndex !== null) {
      setFormData(prev => ({
        ...prev,
        politicas: prev.politicas.map((p, i) => i === politicaEditIndex ? { titulo, descripcion } : p)
      }))
    } else {
      setFormData(prev => ({ ...prev, politicas: [...prev.politicas, { titulo, descripcion }] }))
    }
    setPoliticaModalOpen(false)
  }

  const removePolitica = (idx: number) => {
    setFormData(prev => ({ ...prev, politicas: prev.politicas.filter((_, i) => i !== idx) }))
  }

  useEffect(() => {
    // Si venimos de un enlace con ancla (ej: /dashboard/perfil-sucursal#tipos-novedad)
    if (window.location.hash === '#tipos-novedad') {
      setTimeout(() => {
        const el = document.getElementById('tipos-novedad')
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 300) // Retraso para asegurar que la vista esté montada y el layout ajustado
    }
  }, [])

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      const [resPerfil, resHorarios, permisosRes] = await Promise.all([
        getPerfilSucursal(),
        getHorarios(),
        getMisPermisos()
      ])
      
      if (permisosRes.success) {
        if ((permisosRes as any).esAdmin) {
          setNivelPermiso('escritura')
        } else {
          const p = (permisosRes.data || []).find((p: any) => p.seccion === 'perfil')
          setNivelPermiso(p?.nivel || 'ninguno')
        }
      }
      
      if (resPerfil.success && resPerfil.data) {
        setFormData({
          nombreSucursal: resPerfil.data.sucursal?.nombre || '',
          direccion: resPerfil.data.sucursal?.direccion || '',
          timezone: resPerfil.data.sucursal?.timezone || 'America/Caracas',
          servicios: resPerfil.data.perfil?.servicios || '',
          politicas: resPerfil.data.perfil?.politicas || [],
          idioma_base: resPerfil.data.perfil?.idioma_base || 'es',
          tono: resPerfil.data.perfil?.tono || 'cercano',
          msg_fuera_horario: resPerfil.data.perfil?.msg_fuera_horario || '',
          ia_activa_fuera_horario: resPerfil.data.perfil?.ia_activa_fuera_horario ?? false,
          caso_fuera_horario: resPerfil.data.perfil?.caso_fuera_horario ?? false
        })
      }
      
      if (resHorarios.success && resHorarios.data) {
        const ordenados = DIAS_SEMANA.map(d => {
          const bd = resHorarios.data.find((h: any) => h.dia_semana === d.id)
          return bd ? { ...bd } : { dia_semana: d.id, apertura: '09:00', cierre: '18:00', cerrado: true }
        })
        setHorarios(ordenados)
      }

      const resTipos = await getTiposNovedad()
      if (resTipos.success && resTipos.data) {
        setTiposNovedad(resTipos.data)
      }

      setLoading(false)
    }
    cargar()
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleToggleCerrado = (diaId: number, cerrado: boolean) => {
    setHorarios(prev => prev.map(h =>
      h.dia_semana === diaId ? { ...h, cerrado } : h
    ))
  }

  const handleChangeFranja = (diaId: number, idx: number, field: 'apertura' | 'cierre', value: string) => {
    setHorarios(prev => prev.map(h => {
      if (h.dia_semana !== diaId) return h
      const franjas = [...h.franjas]
      franjas[idx] = { ...franjas[idx], [field]: value }
      return { ...h, franjas }
    }))
  }

  const handleAddFranja = (diaId: number) => {
    setHorarios(prev => prev.map(h => {
      if (h.dia_semana !== diaId) return h
      const franjas = [...h.franjas, { apertura: '09:00', cierre: '18:00', orden: h.franjas.length }]
      return { ...h, franjas }
    }))
  }

  const handleRemoveFranja = (diaId: number, idx: number) => {
    setHorarios(prev => prev.map(h => {
      if (h.dia_semana !== diaId) return h
      const franjas = h.franjas.filter((_: any, i: number) => i !== idx)
      return { ...h, franjas: franjas.length > 0 ? franjas : [{ apertura: '09:00', cierre: '18:00', orden: 0 }] }
    }))
  }

  const applyCopyHorario = (sourceDiaId: number) => {
    const source = horarios.find(h => h.dia_semana === sourceDiaId)
    if (!source || !source.franjas || source.franjas.length === 0) return
    setHorarios(prev => prev.map(h => {
      if (!copyTargets.includes(h.dia_semana)) return h
      return {
        ...h,
        cerrado: false,
        franjas: source.franjas.map((f: any) => ({ apertura: f.apertura, cierre: f.cierre }))
      }
    }))
    setCopyPopoverOpen(null)
    setCopyTargets([])
  }

  // Manejo de Tipos de Novedad
  const openNewTipo = () => {
    setTipoEditItem(null)
    setTipoFormData({ nombre: '', icono: 'campana', color: 'slate' })
    setTipoModalOpen(true)
  }

  const openEditTipo = (item: TipoNovedadData) => {
    setTipoEditItem(item)
    setTipoFormData({ nombre: item.nombre, icono: item.icono, color: item.color })
    setTipoModalOpen(true)
  }

  const handleSaveTipo = async () => {
    if (!tipoFormData.nombre.trim()) return
    setSavingTipo(true)
    
    let res
    if (tipoEditItem?.id) {
      res = await actualizarTipoNovedad(tipoEditItem.id, tipoFormData)
    } else {
      res = await crearTipoNovedad(tipoFormData)
    }

    if (res.success && res.data) {
      if (tipoEditItem?.id) {
        setTiposNovedad(prev => prev.map(t => t.id === tipoEditItem.id ? res.data : t))
      } else {
        setTiposNovedad(prev => [...prev, res.data])
      }
      setTipoModalOpen(false)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar tipo' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setSavingTipo(false)
  }

  const handleDeleteTipo = async (id: string) => {
    if (!confirm('¿Estás seguro? Las novedades asociadas a este tipo también se eliminarán.')) return
    const res = await eliminarTipoNovedad(id)
    if (res.success) {
      setTiposNovedad(prev => prev.filter(t => t.id !== id))
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al eliminar tipo' })
      setTimeout(() => setMensaje(null), 3000)
    }
  }

  const normalizeTime = (timeValue: string | null | undefined) => {
    if (!timeValue) return null
    if (timeValue.length === 5) return `${timeValue}:00`
    return timeValue
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMensaje(null)
    
    const [resPerfil, resHorarios] = await Promise.all([
      savePerfilSucursal(formData),
      saveHorarios(horarios)
    ])
    
    if (resPerfil.success && resHorarios.success) {
      setMensaje({ tipo: 'exito', texto: 'Cambios guardados correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: resPerfil.error || resHorarios.error || 'Error al guardar los cambios' })
    }
    setSaving(false)
  }

  if (loading || nivelPermiso === null) {
    return <Loading />
  }

  if (nivelPermiso === 'ninguno') {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-bold text-ink-900 mb-2">Acceso denegado</h2>
        <p className="text-ink-500">No tienes permisos para ver el perfil de la sucursal.</p>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-10 max-w-4xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 font-display">Perfil de la sucursal</h1>
        <p className="text-ink-500 mt-1">Configura los datos de tu negocio y la personalidad de tu asistente IA.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* SECCIÓN: DATOS DE LA SUCURSAL */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-ink-900 mb-6 border-b border-slate-100 pb-3">Datos de la sucursal</h2>
          
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre comercial</label>
                <input 
                  type="text" 
                  name="nombreSucursal"
                  value={formData.nombreSucursal}
                  onChange={handleChange}
                  disabled={nivelPermiso !== 'escritura'}
                  className="w-full h-11 px-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none"
                  placeholder="Ej: Tienda Respondi"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Huso horario</label>
                <select 
                  name="timezone"
                  value={formData.timezone}
                  onChange={handleChange}
                  disabled={nivelPermiso !== 'escritura'}
                  className="w-full h-11 px-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none bg-white"
                >
                  {timezones.map(tz => (
                    <option key={tz.id} value={tz.id}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Dirección física</label>
              <input 
                type="text" 
                name="direccion"
                value={formData.direccion}
                onChange={handleChange}
                disabled={nivelPermiso !== 'escritura'}
                className="w-full h-11 px-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none"
                placeholder="Ej: Av. Principal, Local 4, Centro Comercial..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Servicios o Productos (Resumen para la IA)</label>
              <textarea 
                name="servicios"
                value={formData.servicios}
                onChange={handleChange}
                disabled={nivelPermiso !== 'escritura'}
                rows={4}
                className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none resize-y"
                placeholder="Describe qué vendes o qué servicios ofreces para que la IA sepa de qué trata el negocio..."
              ></textarea>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Políticas (Devoluciones, Envíos, etc)</label>

              {formData.politicas.length > 0 && (
                <div className="flex flex-col gap-2 mb-3">
                  {formData.politicas.map((p, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-brand-50 border border-brand-200">
                      <div className="min-w-0">
                        <p className="text-sm font-600 text-brand-800">{p.titulo}</p>
                        <p className="text-xs text-brand-600 mt-0.5 line-clamp-2">{p.descripcion}</p>
                      </div>
                      {nivelPermiso === 'escritura' && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => openEditPolitica(i)}
                            className="p-1.5 text-brand-400 hover:text-brand-700 transition">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          <button type="button" onClick={() => removePolitica(i)}
                            className="p-1.5 text-brand-400 hover:text-red-600 transition">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {nivelPermiso === 'escritura' && (
                <button type="button" onClick={openNewPolitica}
                  className="px-4 h-11 rounded-xl border border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50 text-sm font-600 text-ink-600 hover:text-brand-700 transition w-full">
                  + Añadir política
                </button>
              )}
            </div>

            {politicaModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40" onClick={() => setPoliticaModalOpen(false)}>
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                  <h3 className="font-display font-700 text-lg text-ink-900 mb-4">
                    {politicaEditIndex !== null ? 'Editar política' : 'Nueva política'}
                  </h3>

                  <label className="block text-sm font-medium text-ink-700 mb-1.5">Título</label>
                  <input
                    type="text"
                    value={politicaTituloInput}
                    onChange={e => setPoliticaTituloInput(e.target.value)}
                    placeholder="Ej. Devoluciones"
                    className="w-full h-11 px-4 rounded-xl border border-slate-300 bg-white text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition mb-4"
                  />

                  <label className="block text-sm font-medium text-ink-700 mb-1.5">Descripción</label>
                  <textarea
                    value={politicaDescInput}
                    onChange={e => setPoliticaDescInput(e.target.value)}
                    placeholder="Explica en detalle esta política..."
                    rows={5}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white text-sm placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition resize-none mb-5"
                  />

                  <div className="flex gap-3 justify-end">
                    <button type="button" onClick={() => setPoliticaModalOpen(false)}
                      className="px-4 h-10 rounded-xl text-sm font-600 text-ink-600 hover:bg-slate-100 transition">
                      Cancelar
                    </button>
                    <button type="button" onClick={savePolitica}
                      disabled={!politicaTituloInput.trim() || !politicaDescInput.trim()}
                      className="px-4 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-600 transition">
                      Guardar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SECCIÓN: HORARIOS DE ATENCIÓN */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="p-6 sm:p-8 border-b border-slate-100 rounded-t-2xl">
            <h2 className="text-xl font-bold text-ink-900">Horarios de atención</h2>
            <p className="text-sm text-ink-500 mt-1">Puedes añadir varias franjas por día para horarios partidos.</p>
          </div>
          
          <div className="divide-y divide-slate-100">
            {horarios.map(h => {
              const diaObj = DIAS_SEMANA.find(d => d.id === h.dia_semana)
              return (
                <div key={h.dia_semana} className={`p-4 sm:p-5 transition ${h.cerrado ? 'bg-slate-50' : 'bg-white'}`}>
                  {/* Fila de cabecera del día */}
                  <div className="flex items-center gap-4 mb-3">
                    <label className="flex items-center gap-3 cursor-pointer min-w-[130px]">
                      <div className="relative flex items-center justify-center w-6 h-6">
                        <input
                          type="checkbox"
                          checked={!h.cerrado}
                          onChange={e => handleToggleCerrado(h.dia_semana, !e.target.checked)}
                          disabled={nivelPermiso !== 'escritura'}
                          className="peer sr-only"
                        />
                        <div className="w-6 h-6 border-2 border-slate-300 rounded bg-white peer-checked:bg-brand-600 peer-checked:border-brand-600 transition"></div>
                        <svg className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                        </svg>
                      </div>
                      <span className={`font-semibold text-sm ${h.cerrado ? 'text-slate-400' : 'text-ink-900'}`}>{diaObj?.label}</span>
                    </label>
                    {h.cerrado && <span className="text-xs text-slate-400 font-500">Cerrado</span>}
                  </div>
        
                  {/* Franjas horarias */}
                  {!h.cerrado && (
                    <div className="ml-9 space-y-2">
                      {h.franjas.map((franja: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 flex-wrap">
                          <input
                            type="time"
                            value={franja.apertura ? franja.apertura.substring(0, 5) : ''}
                            onChange={e => handleChangeFranja(h.dia_semana, idx, 'apertura', e.target.value)}
                            disabled={nivelPermiso !== 'escritura'}
                            className="w-32 h-10 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none disabled:bg-slate-100 disabled:text-slate-400 text-sm font-medium"
                          />
                          <span className="text-slate-400 text-sm">a</span>
                          <input
                            type="time"
                            value={franja.cierre ? franja.cierre.substring(0, 5) : ''}
                            onChange={e => handleChangeFranja(h.dia_semana, idx, 'cierre', e.target.value)}
                            disabled={nivelPermiso !== 'escritura'}
                            className="w-32 h-10 px-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none disabled:bg-slate-100 disabled:text-slate-400 text-sm font-medium"
                          />
                          {nivelPermiso === 'escritura' && h.franjas.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFranja(h.dia_semana, idx)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                              aria-label="Eliminar franja"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          )}
                        </div>
                      ))}
                      {nivelPermiso === 'escritura' && (
                        <button
                          type="button"
                          onClick={() => handleAddFranja(h.dia_semana)}
                          className="flex items-center gap-1.5 text-xs font-600 text-brand-600 hover:text-brand-700 transition mt-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                          Añadir franja
                        </button>
                      )}
                      {nivelPermiso === 'escritura' && (
                        <div className="relative pt-1">
                          <button type="button" onClick={() => {
                            setCopyPopoverOpen(copyPopoverOpen === h.dia_semana ? null : h.dia_semana)
                            setCopyTargets([])
                          }} className="text-xs font-semibold text-ink-500 hover:text-ink-700 transition flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                            Copiar a...
                          </button>

                          {copyPopoverOpen === h.dia_semana && (
                            <div className="absolute z-10 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 p-3">
                              <p className="text-xs font-semibold text-ink-700 mb-2">Copiar horario de {DIAS_SEMANA.find(d => d.id === h.dia_semana)?.label} a:</p>
                              <div className="space-y-1.5 mb-3">
                                {horarios.map(otherDay => otherDay.dia_semana !== h.dia_semana && (
                                  <label key={otherDay.dia_semana} className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                                    <input type="checkbox"
                                      checked={copyTargets.includes(otherDay.dia_semana)}
                                      onChange={e => {
                                        if (e.target.checked) {
                                          setCopyTargets(prev => [...prev, otherDay.dia_semana])
                                        } else {
                                          setCopyTargets(prev => prev.filter(id => id !== otherDay.dia_semana))
                                        }
                                      }}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                                    {DIAS_SEMANA.find(d => d.id === otherDay.dia_semana)?.label}
                                  </label>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => { setCopyPopoverOpen(null); setCopyTargets([]) }}
                                  className="flex-1 h-8 rounded-lg text-xs font-600 text-ink-600 hover:bg-slate-100 transition">
                                  Cancelar
                                </button>
                                <button type="button" onClick={() => applyCopyHorario(h.dia_semana)}
                                  disabled={copyTargets.length === 0}
                                  className="flex-1 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-600 transition">
                                  Aplicar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* SECCIÓN: TIPOS DE NOVEDADES */}
        <section id="tipos-novedad" className="scroll-mt-32 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-ink-900 mb-6 border-b border-slate-100 pb-3">Tipos de Novedades</h2>
          <p className="text-sm text-ink-500 mb-5">Crea y gestiona las categorías de las novedades del día (ej. Ofertas, Horarios, Stock).</p>
          
          {tiposNovedad.length > 0 && (
            <div className="flex flex-col gap-3 mb-5">
              {tiposNovedad.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${t.color}-100 text-${t.color}-600`}>
                      {getIconSvg(t.icono, 'w-4 h-4')}
                    </div>
                    <span className="font-600 text-sm text-ink-900">{t.nombre}</span>
                  </div>
                  {nivelPermiso === 'escritura' && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => openEditTipo(t)} className="p-1.5 text-slate-400 hover:text-brand-600 transition">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button type="button" onClick={() => handleDeleteTipo(t.id!)} className="p-1.5 text-slate-400 hover:text-red-600 transition">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {nivelPermiso === 'escritura' && (
            <button type="button" onClick={openNewTipo}
              className="px-4 h-11 rounded-xl border border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50 text-sm font-600 text-ink-600 hover:text-brand-700 transition w-full">
              + Añadir tipo de novedad
            </button>
          )}

          {tipoModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40" onClick={() => setTipoModalOpen(false)}>
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <h3 className="font-display font-700 text-lg text-ink-900 mb-4">
                  {tipoEditItem ? 'Editar tipo de novedad' : 'Nuevo tipo de novedad'}
                </h3>

                <label className="block text-sm font-medium text-ink-700 mb-1.5">Nombre</label>
                <input type="text" value={tipoFormData.nombre} onChange={e => setTipoFormData({...tipoFormData, nombre: e.target.value})}
                  placeholder="Ej. Ofertas" className="w-full h-11 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition mb-4" />

                <label className="block text-sm font-medium text-ink-700 mb-1.5">Icono</label>
                <div className="relative mb-4">
                  <button 
                    type="button" 
                    onClick={() => setIsIconSelectorOpen(!isIconSelectorOpen)}
                    className="w-full h-11 px-4 rounded-xl border border-slate-300 bg-white text-sm flex items-center justify-between hover:border-brand-500 transition focus:outline-none focus:ring-4 focus:ring-brand-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-slate-500">
                        {getIconSvg(tipoFormData.icono, 'w-5 h-5')}
                      </div>
                      <span className="text-ink-700 capitalize">{tipoFormData.icono}</span>
                    </div>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${isIconSelectorOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>

                  {isIconSelectorOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsIconSelectorOpen(false)}></div>
                      <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto grid grid-cols-5 gap-2">
                        {AVAILABLE_ICONS.map(ico => (
                          <button key={ico} type="button" onClick={() => { setTipoFormData({...tipoFormData, icono: ico}); setIsIconSelectorOpen(false); }}
                            className={`h-10 rounded-lg border flex items-center justify-center transition-all ${tipoFormData.icono === ico ? 'border-brand-600 bg-brand-50 text-brand-600 ring-2 ring-brand-100' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}
                            title={ico}
                          >
                            {getIconSvg(ico, 'w-5 h-5')}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <label className="block text-sm font-medium text-ink-700 mb-1.5">Color</label>
                <div className="grid grid-cols-6 sm:grid-cols-9 gap-2 mb-6">
                  {['blue', 'amber', 'purple', 'pink', 'emerald', 'slate', 'rose', 'orange', 'yellow', 'green', 'teal', 'cyan', 'sky', 'indigo', 'violet', 'fuchsia', 'red', 'lime'].map(col => (
                    <button key={col} type="button" onClick={() => setTipoFormData({...tipoFormData, color: col})}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${tipoFormData.color === col ? 'border-brand-600 scale-110' : 'border-transparent hover:scale-110'}`}
                      style={{ padding: '2px' }}>
                      <div className={`w-full h-full rounded-full bg-${col}-500`}></div>
                    </button>
                  ))}
                </div>

                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setTipoModalOpen(false)} disabled={savingTipo}
                    className="px-4 h-10 rounded-xl text-sm font-600 text-ink-600 hover:bg-slate-100 transition disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleSaveTipo} disabled={savingTipo || !tipoFormData.nombre.trim()}
                    className="px-4 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-600 transition">
                    {savingTipo ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* SECCIÓN: CONFIGURACIÓN DEL AGENTE IA */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-ink-900 mb-6 border-b border-slate-100 pb-3">Configuración del Agente IA</h2>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">Tono de conversación</label>
                <div className="space-y-3">
                  {['formal', 'cercano', 'muy cercano'].map(t => (
                    <label key={t} className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center w-5 h-5">
                        <input 
                          type="radio" 
                          name="tono" 
                          value={t} 
                          checked={formData.tono === t}
                          onChange={handleChange}
                          disabled={nivelPermiso !== 'escritura'}
                          className="peer sr-only" 
                        />
                        <div className="w-5 h-5 border-2 border-slate-300 rounded-full peer-checked:border-brand-600 transition group-hover:border-brand-400"></div>
                        <div className="absolute w-2.5 h-2.5 rounded-full bg-brand-600 opacity-0 peer-checked:opacity-100 transition scale-50 peer-checked:scale-100"></div>
                      </div>
                      <span className="text-sm text-slate-700 font-medium capitalize">{t}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Idioma base</label>
                <select 
                  name="idioma_base"
                  value={formData.idioma_base}
                  onChange={handleChange}
                  disabled={nivelPermiso !== 'escritura'}
                  className="w-full h-11 px-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none bg-white"
                >
                  <option value="es">Español</option>
                  <option value="en">Inglés</option>
                  <option value="pt">Portugués</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mensaje de fuera de horario</label>
              <p className="text-xs text-slate-500 mb-2">Este mensaje se enviará automáticamente si alguien escribe cuando no hay atención humana disponible.</p>
              <textarea 
                name="msg_fuera_horario"
                value={formData.msg_fuera_horario}
                onChange={handleChange}
                disabled={nivelPermiso !== 'escritura'}
                rows={3}
                className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none resize-y"
                placeholder="¡Hola! En este momento estamos cerrados. Déjanos tu mensaje y te responderemos a primera hora."
              ></textarea>
            </div>

            {/* Comportamiento fuera de horario */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700">Comportamiento fuera de horario</label>
              
              <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition">
                <div>
                  <p className="text-sm font-500 text-ink-900">La IA sigue respondiendo fuera de horario</p>
                  <p className="text-xs text-ink-500 mt-0.5">Si está desactivado, solo se enviará el mensaje de fuera de horario.</p>
                </div>
                <div className="relative ml-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={formData.ia_activa_fuera_horario}
                    onChange={e => setFormData({
                      ...formData,
                      ia_activa_fuera_horario: e.target.checked,
                      caso_fuera_horario: e.target.checked ? false : formData.caso_fuera_horario
                    })}
                    disabled={nivelPermiso !== 'escritura'}
                    className="peer sr-only"
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${formData.ia_activa_fuera_horario ? 'bg-brand-600' : 'bg-slate-300'} peer-disabled:opacity-50`}></div>
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${formData.ia_activa_fuera_horario ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </div>
              </label>

              <label className={`flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 transition ${formData.ia_activa_fuera_horario ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100'}`}>
                <div>
                  <p className="text-sm font-500 text-ink-900">Abrir caso automáticamente fuera de horario</p>
                  <p className="text-xs text-ink-500 mt-0.5">Se crea un caso para que un agente lo atienda cuando vuelva a haber horario.</p>
                </div>
                <div className="relative ml-4 shrink-0">
                  <input
                    type="checkbox"
                    checked={formData.caso_fuera_horario}
                    onChange={e => setFormData({...formData, caso_fuera_horario: e.target.checked})}
                    disabled={nivelPermiso !== 'escritura' || formData.ia_activa_fuera_horario}
                    className="peer sr-only"
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${formData.caso_fuera_horario ? 'bg-brand-600' : 'bg-slate-300'} peer-disabled:opacity-50`}></div>
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${formData.caso_fuera_horario ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </div>
              </label>
            </div>
          </div>
        </section>

        {/* CONTROLES / GUARDAR */}
        <div className="flex items-center justify-end gap-4 pt-4">
          {mensaje && (
            <div className={`text-sm font-semibold px-4 py-2 rounded-lg ${mensaje.tipo === 'exito' ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
              {mensaje.texto}
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={saving || nivelPermiso !== 'escritura'}
            className="px-6 h-12 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white font-semibold rounded-xl shadow-sm shadow-brand-600/20 transition flex items-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Guardando...
              </>
            ) : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}
