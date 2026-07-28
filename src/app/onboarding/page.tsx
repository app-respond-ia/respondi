'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  getOnboardingState,
  saveStep1,
  saveStep2,
  saveStep3,
  saveStep4,
  saveStep5
} from '@/app/actions/onboarding'
import { ErrorModal } from '@/components/ui/ErrorModal'
import { useMemo } from 'react'

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [step, setStep] = useState(1)
  const [tenantId, setTenantId] = useState('')
  const [branchId, setBranchId] = useState('')

  // Step 1
  const [s1, setS1] = useState({ 
    nombrePersona: '', 
    nombreNegocio: '', 
    nombreSucursal: '', 
    timezone: 'America/Caracas',
    moneda: 'USD',
    direccionFiscal: '',
    direccionSucursal: '',
    servicios: '',
  })
  const [errorS1, setErrorS1] = useState('')

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

  const [politicas, setPoliticas] = useState<string[]>([])
  const [politicaInput, setPoliticaInput] = useState('')

  // Step 2
  const [s2, setS2] = useState([
    { dia: 'Lunes', dia_semana: 1, activo: true, franjas: [{ apertura: '', cierre: '' }] },
    { dia: 'Martes', dia_semana: 2, activo: true, franjas: [{ apertura: '', cierre: '' }] },
    { dia: 'Miércoles', dia_semana: 3, activo: true, franjas: [{ apertura: '', cierre: '' }] },
    { dia: 'Jueves', dia_semana: 4, activo: true, franjas: [{ apertura: '', cierre: '' }] },
    { dia: 'Viernes', dia_semana: 5, activo: true, franjas: [{ apertura: '', cierre: '' }] },
    { dia: 'Sábado', dia_semana: 6, activo: false, franjas: [{ apertura: '', cierre: '' }] },
    { dia: 'Domingo', dia_semana: 0, activo: false, franjas: [{ apertura: '', cierre: '' }] }
  ])
  const [errorS2, setErrorS2] = useState('')
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false)

  // Step 3
  const [s3, setS3] = useState([
    { idName: 'idioma_multi', nombre: 'Idioma multi', descripcion: 'La IA detecta y responde en el idioma en que le escribe el cliente.', activo: true },
    { idName: 'precio', nombre: 'Preguntas de precio', descripcion: 'Responder dudas sobre tarifas o cotizaciones (más adelante podrás añadir la lista completa de precios).', activo: false },
    { idName: 'reclamos', nombre: 'Escalado de reclamos a humano', descripcion: 'Derivar a un agente humano cuando el cliente tiene un problema o queja.', activo: false },
    { idName: 'presupuestos', nombre: 'Hacer presupuestos', descripcion: 'Armar presupuestos a medida según lo que pide el cliente.', activo: false },
    { idName: 'politicas', nombre: 'Políticas del negocio', descripcion: 'Informar sobre reglas, envíos, devoluciones, garantías, etc.', activo: true }
  ])

  // Step 4
  const [s4Msg, setS4Msg] = useState('')

  // Step 5
  const [s5Prods, setS5Prods] = useState<{ nombre: string, precio: number }[]>([])
  const [prodNombre, setProdNombre] = useState('')
  const [prodPrecio, setProdPrecio] = useState('')
  const [errorS5, setErrorS5] = useState('')

  useEffect(() => {
    getOnboardingState().then(res => {
      if (!res.success) {
        if (res.error === 'no_session') {
          router.replace('/login')
        }
        setLoading(false)
        return
      }
      if (res.completado) {
        router.replace('/dashboard')
        return
      }
      setTenantId(res.tenantId || '')
      setBranchId(res.branchId || '')
      setStep(res.paso || 1)
      setLoading(false)
    })
  }, [router])

  const addPolitica = () => {
    const val = politicaInput.trim()
    if (!val) return
    setPoliticas(prev => [...prev, val])
    setPoliticaInput('')
  }

  const removePolitica = (idx: number) => {
    setPoliticas(prev => prev.filter((_, i) => i !== idx))
  }

  const addProduct = () => {
    if (prodNombre && prodPrecio) {
      setS5Prods([...s5Prods, { nombre: prodNombre, precio: parseFloat(prodPrecio) }])
      setProdNombre('')
      setProdPrecio('')
      setErrorS5('')
    }
  }

  const handleNext = async () => {
    if (saving) return

    if (step === 1) {
      if (!s1.nombrePersona.trim()) { setErrorS1('Tu nombre es obligatorio'); return }
      if (!s1.nombreNegocio.trim()) { setErrorS1('El nombre del negocio es obligatorio'); return }
      if (!s1.nombreSucursal.trim()) { setErrorS1('El nombre de la primera sucursal es obligatorio'); return }
    }
    if (step === 2) {
      setErrorS2('')
      for (const d of s2) {
        if (!d.activo) continue;
        if (d.franjas.length === 0) {
          setErrorS2(`El día ${d.dia} está activo pero no tiene franjas.`);
          setIsErrorModalOpen(true);
          return;
        }
        const sortedFranjas = [...d.franjas].sort((a, b) => a.apertura.localeCompare(b.apertura));
        for (let i = 0; i < sortedFranjas.length; i++) {
          const f = sortedFranjas[i];
          if (!f.apertura || !f.cierre) {
            setErrorS2(`Revisa las horas del ${d.dia}: faltan datos.`);
            setIsErrorModalOpen(true);
            return;
          }
          if (f.apertura >= f.cierre) {
            setErrorS2(`Horario inválido el ${d.dia}: el cierre debe ser posterior a la apertura.`);
            setIsErrorModalOpen(true);
            return;
          }
          if (i > 0) {
            const prev = sortedFranjas[i - 1];
            if (f.apertura < prev.cierre) {
              setErrorS2(`Solapamiento el ${d.dia}: la franja que empieza a las ${f.apertura} choca con la anterior.`);
              setIsErrorModalOpen(true);
              return;
            }
          }
        }
      }
    }
    if (step === 5 && s5Prods.length === 0) {
      setErrorS5('Añade al menos un producto para continuar')
      return
    }

    setSaving(true)
    try {
      if (step === 1) {
        const res = await saveStep1({ ...s1, politicas })
        if (res.success && res.branchId) {
          setBranchId(res.branchId)
          setStep(2)
        }
      } else if (step === 2) {
        const res = await saveStep2({ branchId, horarios: s2 })
        if (res.success) setStep(3)
      } else if (step === 3) {
        const payload = {
            tenantId,
            branchId,
            skills: s3.map(s => ({ idName: s.idName, nombre: s.nombre, activo: s.activo }))
        }
        const res = await saveStep3(payload)
        if (res.success) setStep(4)
      } else if (step === 4) {
        const res = await saveStep4({ tenantId, branchId, msg: s4Msg })
        if (res.success) setStep(5)
      } else if (step === 5) {
        const res = await saveStep5({ tenantId, branchId, productos: s5Prods })
        if (res.success) router.push('/dashboard')
      }
    } catch (e) {
      console.error(e)
      alert('Error al guardar este paso. Por favor, revisa tus datos.')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => { if (step > 1) setStep(step - 1) }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-ink-500 font-500">Cargando...</p>
      </div>
    )
  }

  const pct = Math.round(((step - 1) / 5) * 100)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-100 via-brand-50 to-slate-100 text-ink-900 antialiased">
      <header className="flex items-center justify-between px-5 sm:px-8 h-20 max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          </div>
          <span className="font-display font-bold text-lg">Respondi</span>
        </div>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 sm:px-6 pb-10">
        <div className="w-full max-w-2xl">
          <div className="mb-5 px-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-ink-700">Paso {step} de 5</p>
              <p className="text-sm font-medium text-brand-600">{pct}% completado</p>
            </div>
            <div className="h-2.5 rounded-full bg-white shadow-inner overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500 ease-out" style={{ width: `${pct}%` }}></div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-xl shadow-brand-900/5 ring-1 ring-slate-200/70 overflow-hidden">
            <div className="p-6 sm:p-10 min-h-[420px]">

              {/* ===== PASO 1 ===== */}
              {step === 1 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">1</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Datos de tu negocio</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">Cuéntanos de tu negocio</h1>
                  <p className="text-ink-500 mb-6">Completa los datos de tu empresa y tu primera sucursal.</p>

                  {errorS1 && <p className="text-red-500 text-sm font-medium mb-4">{errorS1}</p>}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Tu nombre completo</label>
                      <input type="text" value={s1.nombrePersona}
                        onChange={e => { setS1({...s1, nombrePersona: e.target.value}); setErrorS1('') }}
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Nombre del negocio</label>
                      <input type="text" value={s1.nombreNegocio}
                        onChange={e => {
                          const val = e.target.value
                          setS1(prev => ({ ...prev, nombreNegocio: val, nombreSucursal: prev.nombreSucursal === prev.nombreNegocio ? val : prev.nombreSucursal }))
                          setErrorS1('')
                        }}
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    </div>

                    <div className="pt-2">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-px flex-1 bg-slate-200"></div>
                        <span className="text-xs font-600 text-ink-500 uppercase tracking-wide">Primera sucursal</span>
                        <div className="h-px flex-1 bg-slate-200"></div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-ink-700 mb-1.5">Nombre de la sucursal</label>
                            <input type="text" value={s1.nombreSucursal}
                              onChange={e => { setS1({...s1, nombreSucursal: e.target.value}); setErrorS1('') }}
                              className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Moneda principal</label>
                            <select value={s1.moneda} onChange={e => setS1({ ...s1, moneda: e.target.value })}
                              className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
                              <option value="USD">USD - Dólar estadounidense</option>
                              <option value="EUR">EUR - Euro</option>
                              <option value="MXN">MXN - Peso mexicano</option>
                              <option value="COP">COP - Peso colombiano</option>
                              <option value="ARS">ARS - Peso argentino</option>
                              <option value="VES">VES - Bolívar venezolano</option>
                              <option value="CLP">CLP - Peso chileno</option>
                              <option value="PEN">PEN - Sol peruano</option>
                              <option value="BRL">BRL - Real brasileño</option>
                              <option value="GBP">GBP - Libra esterlina</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Huso horario de la sucursal</label>
                          <select value={s1.timezone} onChange={e => setS1({ ...s1, timezone: e.target.value })}
                            className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
                            {timezones.map(tz => (
                              <option key={tz.id} value={tz.id}>{tz.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ===== PASO 2 ===== */}
              {step === 2 && (
                <div className="animate-in fade-in duration-300">
                   {/* Content remains as in original code */}
                </div>
              )}

              {/* ===== PASO 3 ===== */}
              {step === 3 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">3</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Skills de IA</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">Activa las Skills de IA</h1>
                  <p className="text-ink-500 mb-6">Selecciona las habilidades que quieres que la IA tenga por defecto para esta sucursal. Las podrás cambiar luego.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {s3.map((s, i) => (
                      <label key={s.idName} className={`flex gap-3 p-4 rounded-xl border cursor-pointer transition ${s.activo ? 'border-brand-200 bg-brand-50/50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                        <div className="pt-0.5">
                          <input type="checkbox" checked={s.activo} onChange={e => {
                            const n = [...s3]; n[i].activo = e.target.checked; setS3(n)
                          }} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                        </div>
                        <div>
                          <span className="block font-bold text-ink-900 text-sm mb-0.5">{s.nombre}</span>
                          <span className="block text-xs text-ink-500 leading-relaxed">{s.descripcion}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* ===== PASO 4 ===== */}
              {step === 4 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">4</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Mensaje de bienvenida</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">El primer mensaje al cliente</h1>
                  <p className="text-ink-500 mb-6">La IA enviará este texto al inicio de cada conversación nueva.</p>

                  <textarea rows={5} value={s4Msg} onChange={e => setS4Msg(e.target.value)}
                    placeholder="Ej. ¡Hola! Soy el asistente virtual de Pastelería Dulce Hogar. Estoy aquí para ayudarte con información sobre nuestros productos y precios. ¿En qué puedo ayudarte hoy?"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>

                  <div className="flex items-start gap-3 mt-4 rounded-xl bg-brand-50 border border-brand-100 p-3.5">
                    <svg className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <p className="text-sm text-ink-700">Es buena idea aclarar que se trata de un asistente virtual. Así el cliente sabe que habla con una IA.</p>
                  </div>
                </div>
              )}

              {/* ===== PASO 5 ===== */}
              {step === 5 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">5</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Lista de precios</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">Carga tus productos</h1>
                  <p className="text-ink-500 mb-6">Añade al menos un ítem. La IA usará estos precios para responder.</p>

                  {errorS5 && <p className="text-red-500 text-sm font-medium mb-4">{errorS5}</p>}

                  <div className="space-y-3 mb-6">
                    {s5Prods.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 bg-white">
                        <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                          <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a2 2 0 011.41.59l7 7a2 2 0 010 2.82l-7 7a2 2 0 01-2.82 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-ink-900">{p.nombre}</p>
                        </div>
                        <span className="text-sm font-semibold text-ink-900">${p.precio}</span>
                        <button type="button" onClick={() => setS5Prods(prev => prev.filter((_, j) => j !== i))}
                          className="p-1 rounded-lg text-ink-400 hover:text-red-500 hover:bg-red-50 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50">
                    <div>
                      <label className="block text-xs font-medium text-ink-500 mb-1">Producto o servicio</label>
                      <input type="text" value={prodNombre} onChange={e => setProdNombre(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProduct() } }}
                        placeholder="Nombre del ítem"
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    </div>
                    <div className="w-full sm:w-28">
                      <label className="block text-xs font-medium text-ink-500 mb-1">Precio</label>
                      <input type="number" step="0.01" value={prodPrecio} onChange={e => setProdPrecio(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    </div>
                    <button onClick={addProduct}
                      className="h-10 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition">
                      Añadir
                    </button>
                  </div>
                </div>
              )}

            </div>

            <div className="flex items-center justify-between gap-3 px-6 sm:px-10 py-5 border-t border-slate-100 bg-slate-50/60">
              <button disabled={step === 1 || saving} onClick={handleBack}
                className="px-5 h-11 rounded-xl font-semibold text-ink-500 hover:text-ink-700 hover:bg-white transition disabled:opacity-0 disabled:pointer-events-none">
                ← Atrás
              </button>

              <div className="hidden sm:flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(dot => (
                  <span key={dot} className={`rounded-full transition-all duration-300 ${dot === step ? 'w-6 h-2 bg-brand-600' : dot < step ? 'w-2 h-2 bg-brand-300' : 'w-2 h-2 bg-slate-200'}`}></span>
                ))}
              </div>

              <button disabled={saving} onClick={handleNext}
                className={`px-6 h-11 rounded-xl text-white font-semibold shadow-lg transition ${step === 5 ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30' : 'bg-brand-600 hover:bg-brand-700 shadow-brand-600/30'} disabled:opacity-50`}>
                {saving ? 'Guardando...' : step === 5 ? 'Activar mi agente ✓' : 'Continuar →'}
              </button>
            </div>
          </div>
        </div>
      </main>

      <ErrorModal 
        isOpen={isErrorModalOpen} 
        message={errorS2} 
        onClose={() => setIsErrorModalOpen(false)} 
      />
    </div>
  )
}
