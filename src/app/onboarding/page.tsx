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

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [step, setStep] = useState(1)
  const [tenantId, setTenantId] = useState('')
  const [branchId, setBranchId] = useState('')

  // Form states
  const [s1, setS1] = useState({
    nombrePersona: '', nombreComercio: '', direccion: '', timezone: 'America/Caracas', servicios: '', politicas: ''
  })
  
  const [s2, setS2] = useState([
    { dia: 'Lunes', dia_semana: 1, activo: true, apertura: '09:00', cierre: '18:00' },
    { dia: 'Martes', dia_semana: 2, activo: true, apertura: '09:00', cierre: '18:00' },
    { dia: 'Miércoles', dia_semana: 3, activo: true, apertura: '09:00', cierre: '18:00' },
    { dia: 'Jueves', dia_semana: 4, activo: true, apertura: '09:00', cierre: '18:00' },
    { dia: 'Viernes', dia_semana: 5, activo: true, apertura: '09:00', cierre: '18:00' },
    { dia: 'Sábado', dia_semana: 6, activo: false, apertura: '09:00', cierre: '18:00' },
    { dia: 'Domingo', dia_semana: 0, activo: false, apertura: '09:00', cierre: '18:00' }
  ])
  
  const [s3, setS3] = useState([
    { idName: 'idioma', nombre: 'Idioma y saludo inicial', activo: true },
    { idName: 'precios', nombre: 'Preguntas de precio', activo: true },
    { idName: 'reclamos', nombre: 'Manejo de reclamos', activo: false },
    { idName: 'stock', nombre: 'Disponibilidad y stock', activo: false }
  ])
  
  const [s4Msg, setS4Msg] = useState('')
  
  const [s5Prods, setS5Prods] = useState<{nombre: string, precio: number}[]>([])
  const [prodNombre, setProdNombre] = useState('')
  const [prodPrecio, setProdPrecio] = useState('')
  
  const [errorS1, setErrorS1] = useState('')
  const [errorS5, setErrorS5] = useState('')

  useEffect(() => {
    getOnboardingState().then(res => {
      if (res.success) {
        if (res.completado) {
          router.replace('/dashboard')
        } else {
          setTenantId(res.tenantId || '')
          setBranchId(res.branchId || '')
          setStep(res.paso || 1)
        }
      } else {
        // Not logged in or error
        router.replace('/login')
      }
      setLoading(false)
    })
  }, [router])

  const handleNext = async () => {
    if (saving) return

    if (step === 1 && (!s1.nombrePersona.trim() || !s1.nombreComercio.trim())) {
      if (!s1.nombrePersona.trim()) setErrorS1('Tu nombre es obligatorio')
      else setErrorS1('El nombre comercial es obligatorio')
      return
    }
    if (step === 5 && s5Prods.length === 0) {
      setErrorS5('Añade al menos un producto para continuar')
      return
    }

    setSaving(true)
    try {
      if (step === 1) {
        const res = await saveStep1(s1)
        if (res.success && res.branchId) {
          setBranchId(res.branchId)
          setStep(2)
        }
      } else if (step === 2) {
        const res = await saveStep2({ branchId, horarios: s2 })
        if (res.success) setStep(3)
      } else if (step === 3) {
        const res = await saveStep3({ tenantId, branchId, skills: s3 })
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
      alert("Error al guardar este paso. Por favor, revisa tus datos.")
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  const addProduct = () => {
    if (prodNombre && prodPrecio) {
      setS5Prods([...s5Prods, { nombre: prodNombre, precio: parseFloat(prodPrecio) }])
      setProdNombre('')
      setProdPrecio('')
      setErrorS5('')
    }
  }

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
              
              {step === 1 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">1</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Datos del comercio</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">Cuéntanos de tu negocio</h1>
                  <p className="text-ink-500 mb-6">Completa los datos comerciales de tu sucursal.</p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Tu nombre completo</label>
                      <input type="text" value={s1.nombrePersona} onChange={e => { setS1({...s1, nombrePersona: e.target.value}); setErrorS1('') }} placeholder="Ej. Ana Martínez" className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Nombre de tu comercio</label>
                      <input type="text" value={s1.nombreComercio} onChange={e => { setS1({...s1, nombreComercio: e.target.value}); setErrorS1('') }} placeholder="Ej. Pastelería Dulce Hogar" className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                      {errorS1 && <p className="text-red-500 text-xs mt-1.5">{errorS1}</p>}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-ink-700 mb-1.5">Dirección de la sucursal</label>
                        <input type="text" value={s1.direccion} onChange={e => setS1({...s1, direccion: e.target.value})} placeholder="Calle, número, ciudad" className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink-700 mb-1.5">Huso horario</label>
                        <select value={s1.timezone} onChange={e => setS1({...s1, timezone: e.target.value})} className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
                          <option value="America/Caracas">América/Caracas (GMT-4)</option>
                          <option value="Europe/Madrid">Europa/Madrid (GMT+1)</option>
                          <option value="America/Bogota">América/Bogotá (GMT-5)</option>
                          <option value="America/Mexico_City">América/México (GMT-6)</option>
                          <option value="America/Argentina/Buenos_Aires">América/Buenos Aires (GMT-3)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Servicios que ofrece</label>
                      <textarea rows={3} value={s1.servicios} onChange={e => setS1({...s1, servicios: e.target.value})} placeholder="Describe los productos o servicios de tu negocio..." className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Políticas del negocio</label>
                      <textarea rows={3} value={s1.politicas} onChange={e => setS1({...s1, politicas: e.target.value})} placeholder="Devoluciones, garantías, formas de pago..." className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">2</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Horarios de atención</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">¿Cuándo atiende tu negocio?</h1>
                  <p className="text-ink-500 mb-6">Fuera de este horario, la IA enviará un mensaje de aviso.</p>
                  
                  <div className="space-y-2.5">
                    {s2.map((h, i) => (
                      <div key={h.dia} className="flex items-center gap-3 sm:gap-4">
                        <label className="flex items-center gap-2.5 w-32 sm:w-40 shrink-0">
                          <input type="checkbox" checked={h.activo} onChange={e => {
                            const n = [...s2]
                            n[i].activo = e.target.checked
                            setS2(n)
                          }} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                          <span className={`text-sm font-medium ${h.activo ? 'text-ink-700' : 'text-ink-400'}`}>{h.dia}</span>
                        </label>
                        <input type="time" disabled={!h.activo} value={h.apertura} onChange={e => {
                            const n = [...s2]; n[i].apertura = e.target.value; setS2(n)
                          }} className="flex-1 h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:bg-slate-50 disabled:text-ink-400 disabled:border-slate-200" />
                        <span className="text-ink-400 text-sm">a</span>
                        <input type="time" disabled={!h.activo} value={h.cierre} onChange={e => {
                            const n = [...s2]; n[i].cierre = e.target.value; setS2(n)
                          }} className="flex-1 h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:bg-slate-50 disabled:text-ink-400 disabled:border-slate-200" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">3</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Skills de IA</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">¿Qué sabrá hacer tu agente?</h1>
                  <p className="text-ink-500 mb-6">Activa las habilidades que quieras. Podrás editarlas más adelante.</p>
                  
                  <div className="space-y-3">
                    {s3.map((s, i) => (
                      <label key={s.idName} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition ${s.activo ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                        <input type="checkbox" checked={s.activo} onChange={e => {
                          const n = [...s3]
                          n[i].activo = e.target.checked
                          setS3(n)
                        }} className={`w-4 h-4 rounded focus:ring-brand-400 ${s.activo ? 'border-brand-300 text-brand-600' : 'border-slate-300 text-brand-600'}`} />
                        <div>
                          <p className="text-sm font-semibold text-ink-900">{s.nombre}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">4</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Mensaje de bienvenida</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">El primer mensaje al cliente</h1>
                  <p className="text-ink-500 mb-6">La IA enviará este texto al inicio de cada conversación nueva.</p>
                  
                  <textarea rows={5} value={s4Msg} onChange={e => setS4Msg(e.target.value)} placeholder="Ej. ¡Hola! Soy el asistente virtual de Pastelería Dulce Hogar. Estoy aquí para ayudarte con información sobre nuestros productos y precios. ¿En qué puedo ayudarte hoy?" className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
                  
                  <div className="flex items-start gap-3 mt-4 rounded-xl bg-brand-50 border border-brand-100 p-3.5">
                    <svg className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <p className="text-sm text-ink-700">Es buena idea aclarar que se trata de un asistente virtual. Así el cliente sabe que habla con una IA.</p>
                  </div>
                </div>
              )}

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
                      </div>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50">
                    <div>
                      <label className="block text-xs font-medium text-ink-500 mb-1">Producto</label>
                      <input type="text" value={prodNombre} onChange={e => setProdNombre(e.target.value)} placeholder="Nombre del producto" className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    </div>
                    <div className="w-full sm:w-28">
                      <label className="block text-xs font-medium text-ink-500 mb-1">Precio</label>
                      <input type="number" step="0.01" value={prodPrecio} onChange={e => setProdPrecio(e.target.value)} placeholder="0.00" className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    </div>
                    <button onClick={addProduct} className="h-10 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition">Añadir</button>
                  </div>
                </div>
              )}

            </div>

            <div className="flex items-center justify-between gap-3 px-6 sm:px-10 py-5 border-t border-slate-100 bg-slate-50/60">
              <button disabled={step === 1 || saving} onClick={handleBack} className="px-5 h-11 rounded-xl font-semibold text-ink-500 hover:text-ink-700 hover:bg-white transition disabled:opacity-0 disabled:pointer-events-none">
                ← Atrás
              </button>
              
              <div className="hidden sm:flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(dot => (
                  <span key={dot} className={`rounded-full transition-all duration-300 ${dot === step ? 'w-6 h-2 bg-brand-600' : dot < step ? 'w-2 h-2 bg-brand-300' : 'w-2 h-2 bg-slate-200'}`}></span>
                ))}
              </div>

              <button disabled={saving} onClick={handleNext} className={`px-6 h-11 rounded-xl text-white font-semibold shadow-lg transition ${step === 5 ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30' : 'bg-brand-600 hover:bg-brand-700 shadow-brand-600/30'} disabled:opacity-50`}>
                {saving ? 'Guardando...' : step === 5 ? 'Activar mi agente ✓' : 'Continuar →'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
