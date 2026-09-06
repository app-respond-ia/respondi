'use client'
import Loading from '@/components/Loading'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSucursales, getDatosSucursalParaCopiar, crearSucursalConDatos } from '@/app/actions/sucursales'
import { useToast } from '@/components/ui/Toast'
import { EditorHorarios } from '@/components/sucursales/EditorHorarios'
import { DIAS_SEMANA } from '@/lib/dias-semana'
import { PAISES } from '@/lib/paises'

// CAMBIO 1: Husos horarios completos LATAM + España, ordenados de GMT-6 a GMT+1
const TIMEZONES = [
  { id: 'America/Mexico_City', label: 'América/México (GMT-6)' },
  { id: 'America/Bogota', label: 'América/Bogotá (GMT-5)' },
  { id: 'America/Lima', label: 'América/Lima (GMT-5)' },
  { id: 'America/Guayaquil', label: 'América/Guayaquil (GMT-5)' },
  { id: 'America/Caracas', label: 'América/Caracas (GMT-4)' },
  { id: 'America/Santiago', label: 'América/Santiago (GMT-4)' },
  { id: 'America/La_Paz', label: 'América/La Paz (GMT-4)' },
  { id: 'America/Santo_Domingo', label: 'América/Santo Domingo (GMT-4)' },
  { id: 'America/Asuncion', label: 'América/Asunción (GMT-4)' },
  { id: 'America/Argentina/Buenos_Aires', label: 'América/Buenos Aires (GMT-3)' },
  { id: 'America/Montevideo', label: 'América/Montevideo (GMT-3)' },
  { id: 'America/Sao_Paulo', label: 'América/São Paulo (GMT-3)' },
  { id: 'Atlantic/Canary', label: 'Atlántico/Canarias (GMT+0)' },
  { id: 'Europe/Madrid', label: 'Europa/Madrid (GMT+1)' },
]

function PreviewModuleItem({ label, countLabel, items }: { label: string, countLabel: string, items: React.ReactNode[] }) {
  const [expanded, setExpanded] = useState(false)
  const [showAll, setShowAll] = useState(false)

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-between text-sm py-1.5">
        <span className="font-500 text-brand-800">{label}</span>
        <span className="text-brand-600 font-400">{countLabel}</span>
      </div>
    )
  }

  const visibleItems = showAll ? items : items.slice(0, 5)
  const hiddenCount = items.length - 5

  return (
    <div className="text-sm border-t border-brand-200/50 py-2 first:border-0 first:pt-0">
      <div 
        className="flex items-center justify-between cursor-pointer group select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-500 text-brand-800 group-hover:text-brand-900 transition flex items-center gap-1.5">
          {label}
          <svg className={`w-3.5 h-3.5 text-brand-500 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </span>
        <span className="text-brand-600 font-500 bg-white/60 px-2 py-0.5 rounded-md text-xs border border-brand-200/50 shadow-sm">{countLabel}</span>
      </div>
      
      {expanded && (
        <div className="mt-2.5 pl-3 border-l-2 border-brand-200 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
          {visibleItems.map((item, idx) => (
            <div key={idx} className="text-xs text-brand-700/90">{item}</div>
          ))}
          {hiddenCount > 0 && !showAll && (
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
              className="text-xs font-600 text-brand-600 hover:text-brand-800 hover:underline pt-1"
            >
              Ver más ({hiddenCount})
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// CAMBIO 3: Módulos de copia completos (incluye configuracion_ia, servicios, politicas)
const MODULOS = [
  { id: 'horarios', label: 'Horarios de atención' },
  { id: 'skills', label: 'Skills de IA' },
  { id: 'precios', label: 'Lista de precios' },
  { id: 'etiquetas', label: 'Etiquetas' },
  { id: 'reglas', label: 'Escalado de casos' },
  { id: 'configuracion_ia', label: 'Configuración del agente IA' },
  { id: 'servicios', label: 'Servicios' },
  { id: 'politicas', label: 'Políticas' },
  { id: 'tipos_novedad', label: 'Tipos de novedades' },
]



import { getSkillsGlobalesBase } from '@/app/actions/skills-globales'

export default function NuevaSucursalPage() {
  const router = useRouter()
  const [step, setStep] = useState<'config' | 'onboarding'>('config')
  const [sucursales, setSucursales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  // Config inicial
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [pais, setPais] = useState('')
  const [timezone, setTimezone] = useState('America/Caracas')
  const [copiaGlobal, setCopiaGlobal] = useState<string>('')
  const [copiaAvanzada, setCopiaAvanzada] = useState(false)
  const [copiaModulos, setCopiaModulos] = useState<Record<string, string>>({
    horarios: '', skills: '', precios: '', etiquetas: '', reglas: '',
    configuracion_ia: '', servicios: '', politicas: '', tipos_novedad: ''
  })
  const [loadingCopia, setLoadingCopia] = useState(false)
  // CAMBIO 2: Estado para la vista previa de datos a copiar
  const [previewData, setPreviewData] = useState<any | null>(null)

  // Onboarding — perfil (CAMBIO 4: politicas como array de objetos, no string)
  const [servicios, setServicios] = useState('')
  const [politicas, setPoliticas] = useState<{ titulo: string, descripcion: string }[]>([])
  const [politicaModalOpen, setPoliticaModalOpen] = useState(false)
  const [politicaEditIndex, setPoliticaEditIndex] = useState<number | null>(null)
  const [politicaTituloInput, setPoliticaTituloInput] = useState('')
  const [politicaDescInput, setPoliticaDescInput] = useState('')
  const [msgFueraHorario, setMsgFueraHorario] = useState('')
  const [idiomaBase, setIdiomaBase] = useState('es')
  const [tono, setTono] = useState('cercano')
  const [iaActivaFueraHorario, setIaActivaFueraHorario] = useState(false)
  const [casoFueraHorario, setCasoFueraHorario] = useState(false)

  // Onboarding — horarios (CAMBIO 4: estructura igual a perfil-sucursal)
  const [horarios, setHorarios] = useState(
    DIAS_SEMANA.map(d => ({
      dia_semana: d.id,
      cerrado: d.id === 0 || d.id === 6,
      franjas: [{ apertura: '09:00', cierre: '18:00', orden: 0 }]
    }))
  )

  // Onboarding — skills, precios, etiquetas, reglas
  const [skills, setSkills] = useState<any[]>([])
  const [precios, setPrecios] = useState<any[]>([])
  const [etiquetas, setEtiquetas] = useState<any[]>([])
  const [reglas, setReglas] = useState<any[]>([])
  const [tiposNovedad, setTiposNovedad] = useState<any[]>([])
  const [onbStep, setOnbStep] = useState(1)
  const [prodNombre, setProdNombre] = useState('')
  const [prodPrecio, setProdPrecio] = useState('')

  useEffect(() => {
    Promise.all([
      getSucursales(),
      getSkillsGlobalesBase()
    ]).then(([sucursalesRes, skillsRes]) => {
      if (sucursalesRes.success && sucursalesRes.data?.sucursales) {
        setSucursales(sucursalesRes.data.sucursales)
      }
      if (skillsRes.success && skillsRes.data) {
        const base = skillsRes.data.map((g: any) => ({
          skill_global_id: g.id,
          idName: g.slug,
          nombre: g.nombre,
          descripcion: g.descripcion,
          activo: g.activa_por_defecto,
          fija: !g.cliente_puede_toggle
        }))
        setSkills(base)
      }
      setLoading(false)
    })
  }, [])

  const resetModuloData = (modulo: string) => {
    if (modulo === 'horarios') setHorarios(DIAS_SEMANA.map(d => ({ dia_semana: d.id, cerrado: d.id === 0 || d.id === 6, franjas: [{ apertura: '09:00', cierre: '18:00', orden: 0 }] })))
    if (modulo === 'skills') setSkills(prev => prev.map(s => ({ ...s, activo: s.fija })))
    if (modulo === 'precios') setPrecios([])
    if (modulo === 'etiquetas') setEtiquetas([])
    if (modulo === 'reglas') setReglas([])
    if (modulo === 'tipos_novedad') setTiposNovedad([])
    if (modulo === 'servicios') setServicios('')
    if (modulo === 'politicas') setPoliticas([])
    if (modulo === 'configuracion_ia') {
      setIaActivaFueraHorario(false)
      setCasoFueraHorario(false)
      setMsgFueraHorario('')
      setIdiomaBase('es')
      setTono('cercano')
    }
  }

  const cargarDatosCopia = async (branchId: string, modulo?: string) => {
    if (!branchId) return
    setLoadingCopia(true)
    const res = await getDatosSucursalParaCopiar(branchId)
    if (res.success && res.data) {
      const d = res.data
      // CAMBIO 2: Guardar datos para la vista previa (solo en copia global)
      if (!modulo) setPreviewData(d)

      if (!modulo || modulo === 'horarios') {
        if (d.horarios && d.horarios.length > 0) {
          const mapped = DIAS_SEMANA.map(def => {
            const filas = d.horarios.filter((h: any) => h.dia_semana === def.id)
            if (filas.length === 0) return { dia_semana: def.id, cerrado: true, franjas: [{apertura: '09:00', cierre: '18:00', orden: 0}] }
            const primera = filas[0]
            return {
              dia_semana: def.id,
              cerrado: primera.cerrado,
              franjas: filas.map((f: any, idx: number) => ({
                apertura: f.apertura ? f.apertura.substring(0, 5) : '09:00',
                cierre: f.cierre ? f.cierre.substring(0, 5) : '18:00',
                orden: idx
              }))
            }
          })
          setHorarios(mapped)
        }
      }
      if (!modulo || modulo === 'skills') {
        if (d.skills && d.skills.length > 0) {
          setSkills(prev => prev.map(def => {
            if (def.fija) return def
            const loaded = d.skills.find((s: any) => s.skill_global_id === def.skill_global_id)
            return loaded ? { ...def, activo: loaded.activo } : def
          }))
        }
      }
      if (!modulo || modulo === 'precios') {
        if (d.precios && d.precios.length > 0) setPrecios(d.precios)
      }
      if (!modulo || modulo === 'etiquetas') {
        if (d.etiquetas && d.etiquetas.length > 0) setEtiquetas(d.etiquetas)
      }
      if (!modulo || modulo === 'reglas') {
        if (d.reglas && d.reglas.length > 0) setReglas(d.reglas)
      }
      if (!modulo || modulo === 'tipos_novedad') {
        if (d.tipos_novedad && d.tipos_novedad.length > 0) setTiposNovedad(d.tipos_novedad)
      }
      if (!modulo || modulo === 'servicios') {
        if (d.servicios) setServicios(d.servicios)
      }
      if (!modulo || modulo === 'politicas') {
        if (d.politicas && Array.isArray(d.politicas) && d.politicas.length > 0) {
          setPoliticas(d.politicas.map((p: any) => typeof p === 'string' ? { titulo: 'Política', descripcion: p } : p))
        }
      }
      if (!modulo || modulo === 'configuracion_ia') {
        if (d.modo_horario_ia !== undefined) setIaActivaFueraHorario(d.modo_horario_ia === 'siempre_activa')
        if (d.caso_fuera_horario !== undefined) setCasoFueraHorario(d.caso_fuera_horario)
        if (d.msg_fuera_horario) setMsgFueraHorario(d.msg_fuera_horario)
        if (d.idioma_base) setIdiomaBase(d.idioma_base)
        if (d.tono) setTono(d.tono)
      }
    }
    setLoadingCopia(false)
  }

  const handleCopiaGlobalChange = (branchId: string) => {
    setCopiaGlobal(branchId)
    setPreviewData(null)
    if (branchId) {
      cargarDatosCopia(branchId)
    } else {
      MODULOS.forEach(m => resetModuloData(m.id))
    }
  }

  const handleCopiaModuloChange = (modulo: string, branchId: string) => {
    setCopiaModulos(prev => ({ ...prev, [modulo]: branchId }))
    if (branchId) {
      cargarDatosCopia(branchId, modulo)
    } else {
      resetModuloData(modulo)
    }
  }



  // CAMBIO 4: Gestión del modal de políticas
  const openNewPolitica = () => {
    setPoliticaEditIndex(null)
    setPoliticaTituloInput('')
    setPoliticaDescInput('')
    setPoliticaModalOpen(true)
  }
  const openEditPolitica = (idx: number) => {
    setPoliticaEditIndex(idx)
    setPoliticaTituloInput(politicas[idx].titulo)
    setPoliticaDescInput(politicas[idx].descripcion)
    setPoliticaModalOpen(true)
  }
  const savePolitica = () => {
    const titulo = politicaTituloInput.trim()
    const descripcion = politicaDescInput.trim()
    if (!titulo || !descripcion) return
    if (politicaEditIndex !== null) {
      setPoliticas(prev => prev.map((p, i) => i === politicaEditIndex ? { titulo, descripcion } : p))
    } else {
      setPoliticas(prev => [...prev, { titulo, descripcion }])
    }
    setPoliticaModalOpen(false)
  }
  const removePolitica = (idx: number) => {
    setPoliticas(prev => prev.filter((_, i) => i !== idx))
  }

  const handleIniciarOnboarding = () => {
    if (!nombre.trim()) {
      showToast('El nombre de la sucursal es obligatorio', 'error')
      return
    }
    setStep('onboarding')
    setOnbStep(1)
  }

  const handleGuardar = async () => {
    setSaving(true)
    
    console.log('DEBUG HORARIOS ESTADO ACTUAL:', JSON.stringify(horarios, null, 2))
    const horariosPayload = horarios.flatMap(h => {
      if (h.cerrado) return [{ dia_semana: h.dia_semana, apertura: null, cierre: null, cerrado: true, orden: 0 }] as { dia_semana: number, apertura: string | null, cierre: string | null, cerrado: boolean, orden: number }[]
      return h.franjas.map((f, i) => ({
        dia_semana: h.dia_semana,
        apertura: f.apertura.length === 5 ? `${f.apertura}:00` : f.apertura,
        cierre: f.cierre.length === 5 ? `${f.cierre}:00` : f.cierre,
        cerrado: false,
        orden: i
      })) as { dia_semana: number, apertura: string | null, cierre: string | null, cerrado: boolean, orden: number }[]
    })
    console.log('DEBUG HORARIOS PAYLOAD FINAL:', JSON.stringify(horariosPayload, null, 2))

    const res = await crearSucursalConDatos({
      nombre,
      direccion,
      pais,
      timezone,
      servicios,
      politicas,
      idioma_base: idiomaBase,
      tono,
      msg_fuera_horario: msgFueraHorario,
      caso_fuera_horario: casoFueraHorario,
      modo_horario_ia: iaActivaFueraHorario ? 'siempre_activa' : 'mismo_negocio',
      horarios: horariosPayload,
      // Enviamos solo nombre y activo para no incluir el campo 'fija' interno
      skills: skills.map(s => ({ skill_global_id: s.skill_global_id, nombre: s.nombre, activo: s.activo })),
      precios,
      etiquetas,
      reglas,
      tipos_novedad: tiposNovedad
    })
    if (res.success) {
      showToast('Sucursal creada correctamente', 'success')
      // Timeout de seguridad por si la navegación se atasca
      setTimeout(() => {
        setSaving(prev => {
          if (prev) {
            showToast('La sucursal puede haberse creado correctamente. Si no ves los cambios, recarga la página.', 'info')
            router.push('/dashboard/sucursales')
            return false
          }
          return prev
        })
      }, 8000)

      // CAMBIO 5: router.refresh() primero, y router.push con un margen para evitar race conditions
      router.refresh()
      setTimeout(() => {
        router.push('/dashboard/sucursales')
      }, 200)
    } else {
      showToast(res.error || 'Error al crear la sucursal', 'error')
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  // ── PASO CONFIG INICIAL ──────────────────────────────────────
  if (step === 'config') {
    return (
      <div className="p-6 sm:p-10 max-w-2xl mx-auto pb-20">
        <div className="mb-8">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink-700 transition mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            Volver a sucursales
          </button>
          <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Nueva sucursal</h1>
          <p className="text-ink-500 mt-1">Configura los datos básicos y elige qué copiar de otras sucursales.</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 mb-6">
          <h2 className="font-600 text-ink-900 text-lg">Datos básicos</h2>

          <div>
            <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre de la sucursal</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Ej. Sede Norte"
              className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
          </div>

          <div>
            <label className="block text-sm font-500 text-ink-700 mb-1.5">Dirección <span className="text-ink-400 font-400">· opcional</span></label>
            <input type="text" value={direccion} onChange={e => setDireccion(e.target.value)}
              placeholder="Calle, número, ciudad"
              className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
          </div>

          <div>
            <label className="block text-sm font-500 text-ink-700 mb-1.5">País</label>
            <select value={pais} onChange={e => setPais(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
              <option value="">Selecciona un país</option>
              {PAISES.map(p => <option key={p.codigo} value={p.codigo}>{p.bandera} {p.nombre}</option>)}
            </select>
          </div>

          {/* CAMBIO 1: Lista completa de husos horarios */}
          <div>
            <label className="block text-sm font-500 text-ink-700 mb-1.5">Huso horario</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
              {TIMEZONES.map(tz => (
                <option key={tz.id} value={tz.id}>{tz.label}</option>
              ))}
            </select>
          </div>
        </div>

        {sucursales.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 mb-6">
            <h2 className="font-600 text-ink-900 text-lg">Copiar configuración</h2>
            <p className="text-sm text-ink-500">Puedes copiar toda la configuración de una sucursal existente, o elegir módulo por módulo.</p>

            {/* Copia global */}
            {!copiaAvanzada && (
              <div>
                <label className="block text-sm font-500 text-ink-700 mb-1.5">Copiar todo desde</label>
                <select value={copiaGlobal} onChange={e => handleCopiaGlobalChange(e.target.value)}
                  disabled={loadingCopia}
                  className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:opacity-50">
                  <option value="">No copiar — empezar desde cero</option>
                  {sucursales.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
                {loadingCopia && (
                  <p className="text-xs text-ink-400 mt-1.5 flex items-center gap-1.5">
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Cargando datos...
                  </p>
                )}

                {/* CAMBIO 2: Vista previa de datos a copiar */}
                {previewData && copiaGlobal && !loadingCopia && (
                  <div className="mt-4 p-4 rounded-xl border border-brand-200 bg-brand-50 space-y-2">
                    <p className="text-xs font-700 text-brand-700 uppercase tracking-wide mb-2">Vista previa — datos que se copiarán</p>
                    <div className="flex flex-col">
                      <PreviewModuleItem 
                        label="Horarios" 
                        countLabel={previewData.horarios?.filter((h: any) => !h.cerrado).length > 0 ? `${previewData.horarios.filter((h: any) => !h.cerrado).length} franjas` : 'Sin horarios'} 
                        items={previewData.horarios?.filter((h: any) => !h.cerrado).map((h: any) => {
                          const dia = DIAS_SEMANA.find(d => d.id === h.dia_semana)?.label || `Día ${h.dia_semana}`;
                          return `${dia}: ${h.apertura?.substring(0,5) || ''} - ${h.cierre?.substring(0,5) || ''}`;
                        }) || []}
                      />
                      <PreviewModuleItem 
                        label="Skills de IA" 
                        countLabel={previewData.skills?.length > 0 ? `${previewData.skills.length} skills` : 'Sin skills'} 
                        items={previewData.skills?.map((s: any) => s.nombre) || []}
                      />
                      <PreviewModuleItem 
                        label="Precios" 
                        countLabel={previewData.precios?.length > 0 ? `${previewData.precios.length} productos` : 'Sin precios'} 
                        items={previewData.precios?.map((p: any) => `${p.nombre} ${p.precio ? `($${p.precio})` : ''}`) || []}
                      />
                      <PreviewModuleItem 
                        label="Etiquetas" 
                        countLabel={previewData.etiquetas?.length > 0 ? `${previewData.etiquetas.length} etiquetas` : 'Sin etiquetas'} 
                        items={previewData.etiquetas?.map((e: any) => e.nombre) || []}
                      />
                      <PreviewModuleItem 
                        label="Reglas" 
                        countLabel={previewData.reglas?.length > 0 ? `${previewData.reglas.length} reglas` : 'Sin reglas'} 
                        items={previewData.reglas?.map((r: any) => r.nombre) || []}
                      />
                      <PreviewModuleItem 
                        label="Tipos de Novedades" 
                        countLabel={previewData.tipos_novedad?.length > 0 ? `${previewData.tipos_novedad.length} tipos` : 'Sin tipos custom'} 
                        items={previewData.tipos_novedad?.map((t: any) => t.nombre) || []}
                      />
                      <PreviewModuleItem 
                        label="Configuración del agente IA" 
                        countLabel={'Configurado'} 
                        items={[
                          `Idioma base: ${previewData.idioma_base || 'es'}`,
                          `Tono: ${previewData.tono || 'cercano'}`,
                          `Modo fuera de horario: ${previewData.modo_horario_ia || 'mismo_negocio'}`
                        ]}
                      />
                      <PreviewModuleItem 
                        label="Servicios e instalaciones" 
                        countLabel={previewData.servicios ? 'Configurado' : 'Sin servicios'} 
                        items={previewData.servicios ? [previewData.servicios] : []}
                      />
                      <PreviewModuleItem 
                        label="Políticas y normas" 
                        countLabel={previewData.politicas?.length > 0 ? `${previewData.politicas.length} políticas` : 'Sin políticas'} 
                        items={previewData.politicas?.map((p: any) => typeof p === 'string' ? p : p.titulo) || []}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Toggle avanzado */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative shrink-0">
                <input type="checkbox" checked={copiaAvanzada}
                  onChange={e => { 
                    setCopiaAvanzada(e.target.checked)
                    setCopiaGlobal('')
                    setCopiaModulos(MODULOS.reduce((acc, m) => ({ ...acc, [m.id]: '' }), {}))
                    setPreviewData(null)
                    if (e.target.checked) {
                      MODULOS.forEach(m => resetModuloData(m.id))
                    }
                  }}
                  className="peer sr-only" />
                <div className={`w-11 h-6 rounded-full transition-colors ${copiaAvanzada ? 'bg-brand-600' : 'bg-slate-300'}`}></div>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${copiaAvanzada ? 'translate-x-5' : 'translate-x-0'}`}></div>
              </div>
              <span className="text-sm font-500 text-ink-700">Copiar módulo por módulo desde sucursales diferentes</span>
            </label>

            {/* CAMBIO 3: Copia avanzada por módulo — ahora con todos los módulos */}
            {copiaAvanzada && (
              <div className="space-y-3">
                {MODULOS.map(m => {
                  const tieneOrigen = copiaModulos[m.id] && copiaModulos[m.id] !== ''
                  
                  let localCount = ''
                  let localItems: React.ReactNode[] = []
                  
                  if (m.id === 'horarios') {
                    const activos = horarios.filter(h => !h.cerrado)
                    localCount = activos.length > 0 ? `${activos.length} franjas` : 'Sin horarios'
                    localItems = activos.map(h => {
                      const dia = DIAS_SEMANA.find(d => d.id === h.dia_semana)?.label || `Día ${h.dia_semana}`
                      return `${dia}: ${h.franjas.map(f => `${f.apertura} - ${f.cierre}`).join(', ')}`
                    })
                  } else if (m.id === 'skills') {
                    const activas = skills.filter(s => s.activo)
                    localCount = activas.length > 0 ? `${activas.length} skills` : 'Sin skills'
                    localItems = activas.map(s => s.nombre)
                  } else if (m.id === 'precios') {
                    localCount = precios.length > 0 ? `${precios.length} productos` : 'Sin precios'
                    localItems = precios.map(p => `${p.nombre} ${p.precio ? `($${p.precio})` : ''}`)
                  } else if (m.id === 'etiquetas') {
                    localCount = etiquetas.length > 0 ? `${etiquetas.length} etiquetas` : 'Sin etiquetas'
                    localItems = etiquetas.map(e => e.nombre)
                  } else if (m.id === 'reglas') {
                    localCount = reglas.length > 0 ? `${reglas.length} reglas` : 'Sin reglas'
                    localItems = reglas.map(r => r.nombre)
                  } else if (m.id === 'tipos_novedad') {
                    localCount = tiposNovedad.length > 0 ? `${tiposNovedad.length} tipos` : 'Sin tipos custom'
                    localItems = tiposNovedad.map(t => t.nombre)
                  } else if (m.id === 'servicios') {
                    localCount = servicios ? 'Configurado' : 'Sin servicios'
                    localItems = servicios ? [servicios] : []
                  } else if (m.id === 'politicas') {
                    localCount = politicas.length > 0 ? `${politicas.length} políticas` : 'Sin políticas'
                    localItems = politicas.map(p => p.descripcion || p.titulo)
                  } else if (m.id === 'configuracion_ia') {
                    localCount = 'Configurado'
                    localItems = [
                      `Idioma base: ${idiomaBase}`,
                      `Tono: ${tono}`,
                      `Modo fuera horario: ${iaActivaFueraHorario ? 'siempre_activa' : 'mismo_negocio'}`
                    ]
                  }

                  return (
                    <div key={m.id} className="flex flex-col gap-2 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-sm font-500 text-ink-700">{m.label}</span>
                        <select value={copiaModulos[m.id] || ''} onChange={e => handleCopiaModuloChange(m.id, e.target.value)}
                          className="text-sm border-slate-300 rounded-lg focus:ring-brand-500 focus:border-brand-500 max-w-[200px] w-full bg-slate-50">
                          <option value="">Desde cero</option>
                          {sucursales.map((s: any) => (
                            <option key={s.id} value={s.id}>{s.nombre}</option>
                          ))}
                        </select>
                      </div>
                      {tieneOrigen && (
                        <div className="mt-2 pt-2 border-t border-slate-100 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
                           <PreviewModuleItem label={m.label} countLabel={localCount} items={localItems} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <button onClick={handleIniciarOnboarding}
          className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-600 transition shadow-lg shadow-brand-600/30">
          Continuar y revisar datos →
        </button>
      </div>
    )
  }

  // ── ONBOARDING EN CASCADA (CAMBIO 4) ─────────────────────────
  const totalSteps = 4
  const pct = Math.round(((onbStep - 1) / totalSteps) * 100)

  return (
    <div className="p-6 sm:p-10 max-w-2xl mx-auto pb-20">
      <div className="mb-6">
        <button onClick={() => onbStep === 1 ? setStep('config') : setOnbStep(onbStep - 1)}
          className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink-700 transition mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          {onbStep === 1 ? 'Volver a configuración' : 'Paso anterior'}
        </button>

        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-600 text-ink-700">Paso {onbStep} de {totalSteps}</p>
          <p className="text-sm text-brand-600">{pct}% completado</p>
        </div>
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200">
        <div className="p-6 sm:p-8">

          {/* PASO 1: PERFIL (CAMBIO 4: políticas con modal, toggles con exclusión mutua, diseño premium) */}
          {onbStep === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-700 flex items-center justify-center text-sm">1</span>
                <span className="text-xs font-600 uppercase tracking-wider text-brand-600">Perfil de la sucursal</span>
              </div>
              <h2 className="font-display font-700 text-xl text-ink-900 mb-1">Información y configuración</h2>
              <p className="text-ink-500 text-sm mb-6">Revisa o edita los datos del negocio para esta sucursal.</p>

              <div className="space-y-5">
                {/* Servicios */}
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Servicios o Productos (Resumen para la IA)</label>
                  <textarea rows={3} value={servicios} onChange={e => setServicios(e.target.value)}
                    placeholder="Describe los servicios de esta sucursal..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>

                {/* Políticas — ahora con modal popup igual al onboarding principal */}
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Políticas <span className="text-ink-400 font-400">· opcional</span></label>
                  {politicas.length > 0 && (
                    <div className="flex flex-col gap-2 mb-3">
                      {politicas.map((p, i) => (
                        <div key={i} className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl bg-brand-50 border border-brand-200">
                          <div className="min-w-0">
                            <p className="text-sm font-600 text-brand-800">{p.titulo}</p>
                            <p className="text-xs text-brand-600 mt-0.5 line-clamp-2">{p.descripcion}</p>
                          </div>
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
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={openNewPolitica}
                    className="px-4 h-11 rounded-xl border border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50 text-sm font-600 text-ink-600 hover:text-brand-700 transition w-full">
                    + Añadir política
                  </button>
                </div>

                {/* Mensaje fuera de horario */}
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Mensaje fuera de horario</label>
                  <textarea rows={2} value={msgFueraHorario} onChange={e => setMsgFueraHorario(e.target.value)}
                    placeholder="Mensaje cuando el cliente escribe fuera de horario..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>

                {/* Idioma y Tono */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Idioma base</label>
                    <select value={idiomaBase} onChange={e => setIdiomaBase(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
                      <option value="es">Español</option>
                      <option value="en">English</option>
                      <option value="pt">Português</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Tono</label>
                    <select value={tono} onChange={e => setTono(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
                      <option value="formal">Formal</option>
                      <option value="cercano">Cercano</option>
                      <option value="muy cercano">Muy cercano</option>
                    </select>
                  </div>
                </div>

                {/* Comportamiento fuera de horario — con exclusión mutua igual que el onboarding principal */}
                <div className="space-y-3">
                  <label className="block text-sm font-600 text-slate-700">Comportamiento fuera de horario</label>
                  <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition">
                    <div>
                      <p className="text-sm font-500 text-ink-900">La IA sigue respondiendo fuera de horario</p>
                      <p className="text-xs text-ink-500 mt-0.5">Si está desactivado, solo se enviará el mensaje de fuera de horario.</p>
                    </div>
                    <div className="relative ml-4 shrink-0">
                      <input type="checkbox" checked={iaActivaFueraHorario}
                        onChange={e => {
                          setIaActivaFueraHorario(e.target.checked)
                          if (e.target.checked) setCasoFueraHorario(false)
                        }}
                        className="peer sr-only" />
                      <div className={`w-11 h-6 rounded-full transition-colors ${iaActivaFueraHorario ? 'bg-brand-600' : 'bg-slate-300'}`}></div>
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${iaActivaFueraHorario ? 'translate-x-5' : 'translate-x-0'}`}></div>
                    </div>
                  </label>
                  <label className={`flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 transition ${iaActivaFueraHorario ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100'}`}>
                    <div>
                      <p className="text-sm font-500 text-ink-900">Abrir caso automáticamente fuera de horario</p>
                      <p className="text-xs text-ink-500 mt-0.5">Se crea un caso para que un agente lo atienda cuando vuelva a haber horario.</p>
                    </div>
                    <div className="relative ml-4 shrink-0">
                      <input type="checkbox" checked={casoFueraHorario}
                        onChange={e => setCasoFueraHorario(e.target.checked)}
                        disabled={iaActivaFueraHorario}
                        className="peer sr-only" />
                      <div className={`w-11 h-6 rounded-full transition-colors ${casoFueraHorario ? 'bg-brand-600' : 'bg-slate-300'} peer-disabled:opacity-50`}></div>
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${casoFueraHorario ? 'translate-x-5' : 'translate-x-0'}`}></div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* PASO 2: HORARIOS (CAMBIO 4: rediseño con "Copiar a...") */}
          {onbStep === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-700 flex items-center justify-center text-sm">2</span>
                <span className="text-xs font-600 uppercase tracking-wider text-brand-600">Horarios de atención</span>
              </div>
              <h2 className="font-display font-700 text-xl text-ink-900 mb-1">¿Cuándo atiende esta sucursal?</h2>
              <p className="text-ink-500 text-sm mb-6">Añade los horarios para esta sucursal. Puedes copiar franjas entre días.</p>

              <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                <EditorHorarios 
                  horarios={horarios}
                  onChange={setHorarios}
                  nivelPermiso="escritura"
                />
              </div>
            </div>
          )}

          {/* PASO 3: SKILLS (CAMBIO 4: skills fijas + diseño de tarjetas igual al onboarding principal) */}
          {onbStep === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-700 flex items-center justify-center text-sm">3</span>
                <span className="text-xs font-600 uppercase tracking-wider text-brand-600">Skills de IA</span>
              </div>
              <h2 className="font-display font-700 text-xl text-ink-900 mb-1">¿Qué sabrá hacer el agente?</h2>
              <p className="text-ink-500 text-sm mb-6">Activa o desactiva las habilidades para esta sucursal. Las marcadas con 🔒 están siempre activas.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {skills.map((s, i) => (
                  <label key={s.idName}
                    className={`flex gap-3 p-4 rounded-xl border transition ${s.activo ? (s.fija ? 'border-brand-200 bg-brand-50/30' : 'border-brand-200 bg-brand-50/50 shadow-sm') : 'border-slate-200 hover:border-slate-300 bg-white'} ${s.fija ? 'cursor-default' : 'cursor-pointer'}`}>
                    <div className="pt-0.5">
                      <input type="checkbox" checked={s.activo} disabled={s.fija}
                        onChange={e => {
                          if (s.fija) return
                          const n = [...skills]
                          n[i] = { ...n[i], activo: e.target.checked }
                          setSkills(n)
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400 disabled:opacity-60" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="block font-700 text-ink-900 text-sm">{s.nombre}</span>
                        {s.fija && (
                          <span title="Incluido siempre" className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-100/50 text-brand-600">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                            </svg>
                          </span>
                        )}
                      </div>
                      <span className={`block text-xs leading-relaxed ${s.fija ? 'text-ink-400' : 'text-ink-500'}`}>{s.descripcion}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* PASO 4: PRECIOS */}
          {onbStep === 4 && (
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-700 flex items-center justify-center text-sm">4</span>
                <span className="text-xs font-600 uppercase tracking-wider text-brand-600">Lista de precios</span>
              </div>
              <h2 className="font-display font-700 text-xl text-ink-900 mb-1">Precios de esta sucursal</h2>
              <p className="text-ink-500 text-sm mb-6">Revisa, edita o añade productos para esta sucursal.</p>

              <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 mb-6 text-sm text-brand-800">
                Puedes continuar sin añadir productos ahora. Más adelante podrás importar la lista completa.
              </div>

              <div className="space-y-2 mb-5">
                {precios.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-600 text-ink-900 truncate">{p.nombre}</p>
                    </div>
                    <span className="text-sm font-600 text-ink-700 shrink-0">{p.precio != null ? `${p.precio}` : 'A consultar'}</span>
                    <button onClick={() => setPrecios(prev => prev.filter((_, j) => j !== i))}
                      className="p-1 rounded-lg text-ink-400 hover:text-red-500 hover:bg-red-50 transition shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[1fr_auto_auto] gap-2 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50">
                <input type="text" value={prodNombre} onChange={e => setProdNombre(e.target.value)}
                  placeholder="Nombre del producto"
                  className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition" />
                <input type="number" step="0.01" value={prodPrecio} onChange={e => setProdPrecio(e.target.value)}
                  placeholder="Precio"
                  className="w-28 h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition" />
                <button onClick={() => {
                  if (prodNombre) {
                    setPrecios(prev => [...prev, { nombre: prodNombre, precio: prodPrecio ? parseFloat(prodPrecio) : null, precio_tipo: 'exacto', tipo: 'producto' }])
                    setProdNombre(''); setProdPrecio('')
                  }
                }} className="h-10 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-600 transition">
                  Añadir
                </button>
              </div>
            </div>
          )}

        </div>

        <div className="flex items-center justify-between gap-3 px-6 sm:px-8 py-4 border-t border-slate-100 bg-slate-50/60">
          <button onClick={() => onbStep === 1 ? setStep('config') : setOnbStep(onbStep - 1)}
            className="px-5 h-11 rounded-xl font-600 text-ink-500 hover:text-ink-700 hover:bg-white transition">
            ← Atrás
          </button>

          <div className="flex items-center gap-2">
            {[1,2,3,4].map(dot => (
              <span key={dot} className={`rounded-full transition-all duration-300 ${dot === onbStep ? 'w-6 h-2 bg-brand-600' : dot < onbStep ? 'w-2 h-2 bg-brand-300' : 'w-2 h-2 bg-slate-200'}`} />
            ))}
          </div>

          {onbStep < totalSteps ? (
            <button onClick={() => setOnbStep(onbStep + 1)}
              className="px-6 h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-600 transition shadow-lg shadow-brand-600/30">
              Continuar →
            </button>
          ) : (
            <button onClick={handleGuardar} disabled={saving}
              className="px-6 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-600 transition shadow-lg shadow-emerald-600/30 disabled:opacity-50">
              {saving ? 'Creando...' : 'Activar sucursal ✓'}
            </button>
          )}
        </div>
      </div>

      {/* Modal de política (CAMBIO 4: igual al onboarding principal) */}
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
  )
}
