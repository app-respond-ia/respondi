'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSucursales, getDatosSucursalParaCopiar, crearSucursalConDatos } from '@/app/actions/sucursales'

const MODULOS = [
  { id: 'perfil', label: 'Perfil e información' },
  { id: 'horarios', label: 'Horarios de atención' },
  { id: 'skills', label: 'Skills de IA' },
  { id: 'precios', label: 'Lista de precios' },
]

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export default function NuevaSucursalPage() {
  const router = useRouter()
  const [step, setStep] = useState<'config' | 'onboarding'>('config')
  const [sucursales, setSucursales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  // Config inicial
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [timezone, setTimezone] = useState('America/Caracas')
  const [copiaGlobal, setCopiaGlobal] = useState<string>('') // sucursal a copiar todo
  const [copiaAvanzada, setCopiaAvanzada] = useState(false)
  const [copiaModulos, setCopiaModulos] = useState<Record<string, string>>({
    perfil: '', horarios: '', skills: '', precios: ''
  })
  const [loadingCopia, setLoadingCopia] = useState(false)

  // Datos del onboarding
  const [perfil, setPerfil] = useState({
    servicios: '', politicas: '', idioma_base: 'es', tono: 'cercano',
    msg_fuera_horario: '', ia_activa_fuera_horario: false, caso_fuera_horario: false
  })
  const [horarios, setHorarios] = useState([
    { dia_semana: 1, cerrado: false, apertura: '09:00', cierre: '18:00', orden: 0 },
    { dia_semana: 2, cerrado: false, apertura: '09:00', cierre: '18:00', orden: 0 },
    { dia_semana: 3, cerrado: false, apertura: '09:00', cierre: '18:00', orden: 0 },
    { dia_semana: 4, cerrado: false, apertura: '09:00', cierre: '18:00', orden: 0 },
    { dia_semana: 5, cerrado: false, apertura: '09:00', cierre: '18:00', orden: 0 },
    { dia_semana: 6, cerrado: true, apertura: '09:00', cierre: '18:00', orden: 0 },
    { dia_semana: 0, cerrado: true, apertura: '09:00', cierre: '18:00', orden: 0 },
  ])
  const [skills, setSkills] = useState<{ nombre: string, activo: boolean }[]>([])
  const [precios, setPrecios] = useState<any[]>([])
  const [onbStep, setOnbStep] = useState(1)

  // Paso 5 precios
  const [prodNombre, setProdNombre] = useState('')
  const [prodPrecio, setProdPrecio] = useState('')

  useEffect(() => {
    getSucursales().then(res => {
      if (res.success && res.data?.sucursales) setSucursales(res.data.sucursales)
      setLoading(false)
    })
  }, [])

  const cargarDatosCopia = async (branchId: string, modulo?: string) => {
    if (!branchId) return
    setLoadingCopia(true)
    const res = await getDatosSucursalParaCopiar(branchId)
    if (res.success && res.data) {
      const d = res.data
      if (!modulo || modulo === 'perfil') {
        setPerfil({
          servicios: d.perfil?.servicios || '',
          politicas: d.perfil?.politicas || '',
          idioma_base: d.perfil?.idioma_base || 'es',
          tono: d.perfil?.tono || 'cercano',
          msg_fuera_horario: d.perfil?.msg_fuera_horario || '',
          ia_activa_fuera_horario: d.perfil?.ia_activa_fuera_horario ?? false,
          caso_fuera_horario: d.perfil?.caso_fuera_horario ?? false
        })
      }
      if (!modulo || modulo === 'horarios') {
        if (d.horarios.length > 0) {
          const horariosAgrupados = [0,1,2,3,4,5,6].map(dia => {
            const filas = d.horarios.filter((h: any) => h.dia_semana === dia)
            if (filas.length === 0) return { dia_semana: dia, cerrado: true, apertura: '09:00', cierre: '18:00', orden: 0 }
            const primera = filas[0]
            return {
              dia_semana: dia,
              cerrado: primera.cerrado,
              apertura: primera.apertura ? primera.apertura.substring(0, 5) : '09:00',
              cierre: primera.cierre ? primera.cierre.substring(0, 5) : '18:00',
              orden: 0
            }
          })
          setHorarios(horariosAgrupados)
        }
      }
      if (!modulo || modulo === 'skills') {
        if (d.skills.length > 0) setSkills(d.skills)
      }
      if (!modulo || modulo === 'precios') {
        if (d.precios.length > 0) setPrecios(d.precios)
      }
    }
    setLoadingCopia(false)
  }

  const handleCopiaGlobalChange = (branchId: string) => {
    setCopiaGlobal(branchId)
    if (branchId) cargarDatosCopia(branchId)
  }

  const handleCopiaModuloChange = (modulo: string, branchId: string) => {
    setCopiaModulos(prev => ({ ...prev, [modulo]: branchId }))
    if (branchId) cargarDatosCopia(branchId, modulo)
  }

  const handleIniciarOnboarding = () => {
    if (!nombre.trim()) {
      setMensaje({ tipo: 'error', texto: 'El nombre de la sucursal es obligatorio' })
      setTimeout(() => setMensaje(null), 3000)
      return
    }
    setStep('onboarding')
    setOnbStep(1)
  }

  const handleGuardar = async () => {
    setSaving(true)
    const res = await crearSucursalConDatos({
      nombre,
      direccion,
      timezone,
      ...perfil,
      horarios,
      skills,
      precios
    })
    if (res.success) {
      router.push('/dashboard/sucursales')
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al crear la sucursal' })
      setTimeout(() => setMensaje(null), 3000)
    }
    setSaving(false)
  }

  if (loading) return <div className="p-10 text-center text-ink-500">Cargando...</div>

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

        {mensaje && (
          <div className={`mb-6 p-4 rounded-xl font-500 text-sm border ${mensaje.tipo === 'exito' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {mensaje.texto}
          </div>
        )}

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
            <label className="block text-sm font-500 text-ink-700 mb-1.5">Huso horario</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
              <option value="America/Caracas">América/Caracas (GMT-4)</option>
              <option value="Europe/Madrid">Europa/Madrid (GMT+1)</option>
              <option value="America/Bogota">América/Bogotá (GMT-5)</option>
              <option value="America/Mexico_City">América/México (GMT-6)</option>
              <option value="America/Argentina/Buenos_Aires">América/Buenos Aires (GMT-3)</option>
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
                {loadingCopia && <p className="text-xs text-ink-400 mt-1.5">Cargando datos...</p>}
              </div>
            )}

            {/* Toggle avanzado */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative shrink-0">
                <input type="checkbox" checked={copiaAvanzada}
                  onChange={e => { setCopiaAvanzada(e.target.checked); setCopiaGlobal('') }}
                  className="peer sr-only" />
                <div className={`w-11 h-6 rounded-full transition-colors ${copiaAvanzada ? 'bg-brand-600' : 'bg-slate-300'}`}></div>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${copiaAvanzada ? 'translate-x-5' : 'translate-x-0'}`}></div>
              </div>
              <span className="text-sm font-500 text-ink-700">Copiar módulo por módulo desde sucursales diferentes</span>
            </label>

            {/* Copia avanzada por módulo */}
            {copiaAvanzada && (
              <div className="space-y-3">
                {MODULOS.map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="text-sm font-500 text-ink-700 w-44 shrink-0">{m.label}</span>
                    <select value={copiaModulos[m.id]} onChange={e => handleCopiaModuloChange(m.id, e.target.value)}
                      disabled={loadingCopia}
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition disabled:opacity-50">
                      <option value="">Desde cero</option>
                      {sucursales.map(s => (
                        <option key={s.id} value={s.id}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {loadingCopia && <p className="text-xs text-ink-400">Cargando datos...</p>}
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

  // ── ONBOARDING EN CASCADA ────────────────────────────────────
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

      {mensaje && (
        <div className={`mb-6 p-4 rounded-xl font-500 text-sm border ${mensaje.tipo === 'exito' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {mensaje.texto}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-6 sm:p-8">

          {/* PASO 1: PERFIL */}
          {onbStep === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-700 flex items-center justify-center text-sm">1</span>
                <span className="text-xs font-600 uppercase tracking-wider text-brand-600">Perfil de la sucursal</span>
              </div>
              <h2 className="font-display font-700 text-xl text-ink-900 mb-1">Información y configuración</h2>
              <p className="text-ink-500 text-sm mb-6">Revisa o edita los datos del negocio para esta sucursal.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Servicios</label>
                  <textarea rows={3} value={perfil.servicios} onChange={e => setPerfil({...perfil, servicios: e.target.value})}
                    placeholder="Describe los servicios de esta sucursal..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Políticas</label>
                  <textarea rows={3} value={perfil.politicas} onChange={e => setPerfil({...perfil, politicas: e.target.value})}
                    placeholder="Políticas de esta sucursal..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                <div>
                  <label className="block text-sm font-500 text-ink-700 mb-1.5">Mensaje fuera de horario</label>
                  <textarea rows={2} value={perfil.msg_fuera_horario} onChange={e => setPerfil({...perfil, msg_fuera_horario: e.target.value})}
                    placeholder="Mensaje cuando el cliente escribe fuera de horario..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Idioma base</label>
                    <select value={perfil.idioma_base} onChange={e => setPerfil({...perfil, idioma_base: e.target.value})}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
                      <option value="es">Español</option>
                      <option value="en">English</option>
                      <option value="pt">Português</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-500 text-ink-700 mb-1.5">Tono</label>
                    <select value={perfil.tono} onChange={e => setPerfil({...perfil, tono: e.target.value})}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition">
                      <option value="cercano">Cercano</option>
                      <option value="formal">Formal</option>
                      <option value="neutro">Neutro</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <span className="text-sm font-500 text-ink-900">IA activa fuera de horario</span>
                    <input type="checkbox" checked={perfil.ia_activa_fuera_horario}
                      onChange={e => setPerfil({...perfil, ia_activa_fuera_horario: e.target.checked})}
                      className="w-5 h-5 rounded text-brand-600 focus:ring-brand-400" />
                  </label>
                  <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <span className="text-sm font-500 text-ink-900">Abrir caso fuera de horario</span>
                    <input type="checkbox" checked={perfil.caso_fuera_horario}
                      onChange={e => setPerfil({...perfil, caso_fuera_horario: e.target.checked})}
                      className="w-5 h-5 rounded text-brand-600 focus:ring-brand-400" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* PASO 2: HORARIOS */}
          {onbStep === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-700 flex items-center justify-center text-sm">2</span>
                <span className="text-xs font-600 uppercase tracking-wider text-brand-600">Horarios de atención</span>
              </div>
              <h2 className="font-display font-700 text-xl text-ink-900 mb-1">¿Cuándo atiende esta sucursal?</h2>
              <p className="text-ink-500 text-sm mb-6">Revisa o edita los horarios para esta sucursal.</p>

              <div className="space-y-2.5">
                {horarios.map((h, i) => (
                  <div key={h.dia_semana} className="flex items-center gap-3">
                    <label className="flex items-center gap-2.5 w-36 shrink-0">
                      <input type="checkbox" checked={!h.cerrado}
                        onChange={e => {
                          const n = [...horarios]; n[i].cerrado = !e.target.checked; setHorarios(n)
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                      <span className={`text-sm font-500 ${h.cerrado ? 'text-ink-400' : 'text-ink-700'}`}>{DIAS[h.dia_semana]}</span>
                    </label>
                    <input type="time" disabled={h.cerrado} value={h.apertura}
                      onChange={e => { const n = [...horarios]; n[i].apertura = e.target.value; setHorarios(n) }}
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition disabled:bg-slate-50 disabled:text-ink-400" />
                    <span className="text-ink-400 text-sm">a</span>
                    <input type="time" disabled={h.cerrado} value={h.cierre}
                      onChange={e => { const n = [...horarios]; n[i].cierre = e.target.value; setHorarios(n) }}
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition disabled:bg-slate-50 disabled:text-ink-400" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASO 3: SKILLS */}
          {onbStep === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-700 flex items-center justify-center text-sm">3</span>
                <span className="text-xs font-600 uppercase tracking-wider text-brand-600">Skills de IA</span>
              </div>
              <h2 className="font-display font-700 text-xl text-ink-900 mb-1">¿Qué sabrá hacer el agente?</h2>
              <p className="text-ink-500 text-sm mb-6">Activa o desactiva las habilidades para esta sucursal.</p>

              {skills.length === 0 ? (
                <p className="text-sm text-ink-500 p-4 bg-slate-50 rounded-xl">No hay skills configuradas. Se usarán las globales por defecto.</p>
              ) : (
                <div className="space-y-2">
                  {skills.map((s, i) => (
                    <label key={i} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition ${s.activo ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                      <input type="checkbox" checked={s.activo}
                        onChange={e => { const n = [...skills]; n[i].activo = e.target.checked; setSkills(n) }}
                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                      <span className="text-sm font-600 text-ink-900">{s.nombre}</span>
                    </label>
                  ))}
                </div>
              )}
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
              {saving ? 'Creando...' : 'Crear sucursal ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
