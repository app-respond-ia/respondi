'use client'
import Loading from '@/components/Loading'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  getOnboardingState,
  saveStep0,
  saveStep1,
  saveStep2,
  saveStep3,
  saveStep4,
  saveStep5
} from '@/app/actions/onboarding'
import { getSkillsGlobalesBase } from '@/app/actions/skills-globales'
import { ErrorModal } from '@/components/ui/ErrorModal'
import { useMemo, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [step, setStep] = useState(0)
  const [userId, setUserId] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [branchId, setBranchId] = useState('')

  // Step 0
  const [s0, setS0] = useState({
    nombre: '',
    prefijoPais: '+34',
    telefono: '',
    avatar_url: ''
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [s1, setS1] = useState({ 
    nombreNegocio: '', 
    nombreSucursal: '', 
    timezone: 'America/Caracas',
    moneda: 'USD',
    direccionFiscal: '',
    direccionSucursal: '',
    servicios: '',
  })

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

  const [politicas, setPoliticas] = useState<{titulo: string, descripcion: string}[]>([])
  const [politicaModalOpen, setPoliticaModalOpen] = useState(false)
  const [politicaEditIndex, setPoliticaEditIndex] = useState<number | null>(null)
  const [politicaTituloInput, setPoliticaTituloInput] = useState('')
  const [politicaDescInput, setPoliticaDescInput] = useState('')

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
  const [copyPopoverOpen, setCopyPopoverOpen] = useState<number | null>(null)
  const [copyTargets, setCopyTargets] = useState<number[]>([])
  const [modalError, setModalError] = useState('')
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false)

  const showError = (msg: string) => {
    setModalError(msg)
    setIsErrorModalOpen(true)
  }

  // Step 3
  const [s3, setS3] = useState<{ idName?: string, skill_global_id: string, nombre: string, descripcion: string, activo: boolean, cliente_puede_toggle: boolean }[]>([])

  // Step 4
  const [s4Msg, setS4Msg] = useState('')
  const [s4Skip, setS4Skip] = useState(false)
  const [s4IaActiva, setS4IaActiva] = useState(false)
  const [s4AbrirCaso, setS4AbrirCaso] = useState(false)

  // Step 5
  const [s5Prods, setS5Prods] = useState<{ nombre: string, precio: number }[]>([])
  const [prodNombre, setProdNombre] = useState('')
  const [prodPrecio, setProdPrecio] = useState('')

  useEffect(() => {
    Promise.all([
      getOnboardingState(),
      getSkillsGlobalesBase()
    ]).then(([res, globalRes]) => {
      if (!res.success) {
        if (res.error === 'no_session') router.replace('/login')
        setLoading(false)
        return
      }
      if (res.data?.completado) {
        router.replace('/dashboard')
        return
      }
      
      setTenantId(res.tenantId || '')
      setBranchId(res.branchId || '')
      setStep(res.data?.paso ?? 1)

      const d = res.data || {}

      if (d.s0) {
        let prefijo = '+34'
        let num = ''
        if (d.s0.telefono) {
          const match = d.s0.telefono.match(/^(\+\d{1,4})(.*)$/)
          if (match) {
            prefijo = match[1]
            num = match[2]
          } else {
            num = d.s0.telefono
          }
        }
        setS0({
          nombre: d.s0.nombrePersona || '',
          prefijoPais: prefijo,
          telefono: num,
          avatar_url: d.s0.avatar_url || ''
        })
        if (d.s0.avatar_url) setAvatarPreview(d.s0.avatar_url)
      }

      if (d.s1) {
        setS1({
          nombreNegocio: d.s1.nombreNegocio || '',
          nombreSucursal: d.s1.nombreSucursal || '',
          timezone: d.s1.timezone || 'America/Caracas',
          moneda: d.s1.moneda || 'USD',
          direccionFiscal: d.s1.direccionFiscal || '',
          direccionSucursal: d.s1.direccionSucursal || '',
          servicios: d.s1.servicios || ''
        })
        setPoliticas(d.s1.politicas || [])
      }

      if (d.s2 && Object.keys(d.s2).length > 0) {
        const s2Array = [
          { dia: 'Lunes', dia_semana: 1 },
          { dia: 'Martes', dia_semana: 2 },
          { dia: 'Miércoles', dia_semana: 3 },
          { dia: 'Jueves', dia_semana: 4 },
          { dia: 'Viernes', dia_semana: 5 },
          { dia: 'Sábado', dia_semana: 6 },
          { dia: 'Domingo', dia_semana: 0 }
        ].map(def => {
          const loaded = d.s2[def.dia_semana]
          if (loaded) {
            return {
              ...def,
              activo: loaded.activo,
              franjas: loaded.franjas.length > 0 ? loaded.franjas : [{ apertura: '', cierre: '' }]
            }
          }
          return { ...def, activo: false, franjas: [{ apertura: '', cierre: '' }] }
        })
        setS2(s2Array)
      }

      if (globalRes.success && globalRes.data) {
        const globales = globalRes.data.map((g: any) => ({
          skill_global_id: g.id,
          nombre: g.nombre,
          descripcion: g.descripcion,
          activo: g.activa_por_defecto,
          cliente_puede_toggle: g.cliente_puede_toggle
        }))
        
        if (d.s3 && d.s3.length > 0) {
          setS3(globales.map(g => {
            const loadedSkill = d.s3.find((dbSkill: any) => dbSkill.skill_global_id === g.skill_global_id)
            return loadedSkill ? { ...g, activo: loadedSkill.activo } : g
          }))
        } else {
          setS3(globales)
        }
      }

      if (d.s4 !== undefined && d.s4 !== null) {
        if (d.s4 === "") {
          setS4Skip(true)
          setS4Msg("")
        } else {
          setS4Skip(false)
          setS4Msg(d.s4)
        }
      }
      if (d.s4_ia_activa !== undefined) setS4IaActiva(d.s4_ia_activa)
      if (d.s4_abrir_caso !== undefined) setS4AbrirCaso(d.s4_abrir_caso)
      if (d.s5 && d.s5.length > 0) setS5Prods(d.s5)

      setLoading(false)
    })
  }, [router])

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

  const addProduct = () => {
    if (prodNombre && prodPrecio) {
      setS5Prods([...s5Prods, { nombre: prodNombre, precio: parseFloat(prodPrecio) }])
      setProdNombre('')
      setProdPrecio('')
    }
  }

  const handleNext = async () => {
    if (saving) return

    if (step === 0) {
      if (!s0.nombre.trim()) { showError('Tu nombre es obligatorio'); return }
    }
    if (step === 1) {
      if (!s1.nombreNegocio.trim()) { showError('El nombre del negocio es obligatorio'); return }
      if (!s1.nombreSucursal.trim()) { showError('El nombre de la primera sucursal es obligatorio'); return }
    }
    if (step === 2) {
      for (const d of s2) {
        if (!d.activo) continue;
        if (d.franjas.length === 0) {
          showError(`El día ${d.dia} está activo pero no tiene franjas.`);
          return;
        }
        const sortedFranjas = [...d.franjas].sort((a, b) => a.apertura.localeCompare(b.apertura));
        for (let i = 0; i < sortedFranjas.length; i++) {
          const f = sortedFranjas[i];
          if (!f.apertura || !f.cierre) {
            showError(`Revisa las horas del ${d.dia}: faltan datos.`);
            return;
          }
          if (f.apertura >= f.cierre) {
            showError(`Horario inválido el ${d.dia}: el cierre debe ser posterior a la apertura.`);
            return;
          }
          if (i > 0) {
            const prev = sortedFranjas[i - 1];
            if (f.apertura < prev.cierre) {
              showError(`Solapamiento el ${d.dia}: la franja que empieza a las ${f.apertura} choca con la anterior.`);
              return;
            }
          }
        }
      }
    }
    if (step === 4) {
      if (!s4Skip && !s4Msg.trim()) {
        showError('Debes escribir un mensaje de bienvenida, o marcar la casilla de "No quiero enviar mensaje de bienvenida".');
        return;
      }
    }

    setSaving(true)
    try {
      if (step === 0) {
        let avatarUrl = s0.avatar_url
        if (avatarFile) {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const ext = avatarFile.name.split('.').pop()
            const filePath = `${user.id}/avatar`
            const { error: uploadError } = await supabase.storage
              .from('avatars')
              .upload(filePath, avatarFile, { upsert: true, contentType: avatarFile.type })
            if (uploadError) {
              showError('Error al subir la imagen de perfil: ' + uploadError.message)
              setSaving(false)
              return
            }
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)
            avatarUrl = publicUrl + '?t=' + Date.now() // Forzar refresco
          }
        }
        
        const telefonoCompleto = s0.telefono ? `${s0.prefijoPais}${s0.telefono.replace(/\s+/g, '')}` : ''
        const res = await saveStep0({
          nombre: s0.nombre,
          telefono: telefonoCompleto,
          avatar_url: avatarUrl
        })
        if (res.success) {
          setS0(prev => ({ ...prev, avatar_url: avatarUrl }))
          setStep(1)
        } else {
          showError(res.error || 'Error al guardar perfil')
        }
      } else if (step === 1) {
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
            skills: s3.map(s => ({ skill_global_id: s.skill_global_id, nombre: s.nombre, activo: s.activo }))
        }
        const res = await saveStep3(payload)
        if (res.success) setStep(4)
      } else if (step === 4) {
        const res = await saveStep4({ 
          tenantId, 
          branchId, 
          msg: s4Skip ? '' : s4Msg,
          iaActiva: s4IaActiva,
          abrirCaso: s4AbrirCaso
        })
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

  const handleBack = () => { if (step > 0) setStep(step - 1) }

  const applyCopyHorario = (sourceIndex: number) => {
    const sourceFranjas = s2[sourceIndex].franjas
    if (sourceFranjas.length === 0) return
    const n = [...s2]
    copyTargets.forEach(targetIndex => {
      n[targetIndex] = {
        ...n[targetIndex],
        activo: true,
        franjas: sourceFranjas.map(f => ({ apertura: f.apertura, cierre: f.cierre }))
      }
    })
    setS2(n)
    setCopyPopoverOpen(null)
    setCopyTargets([])
  }

  if (loading) {
    return <Loading />
  }

  const pct = Math.round((step / 5) * 100)

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gradient-to-br from-slate-100 via-brand-50 to-slate-100 text-ink-900 antialiased">
      <header className="shrink-0 flex items-center justify-between px-5 sm:px-8 h-20 max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
          </div>
          <span className="font-display font-bold text-lg">Respondi</span>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex items-start sm:items-center justify-center px-4 sm:px-6 pb-6 overflow-hidden">
        <div className="w-full max-w-2xl h-full flex flex-col">
          <div className="mb-5 px-1 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-ink-700">Paso {step + 1} de 6</p>
              <p className="text-sm font-medium text-brand-600">{pct}% completado</p>
            </div>
            <div className="h-2.5 rounded-full bg-white shadow-inner overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500 ease-out" style={{ width: `${pct}%` }}></div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-xl shadow-brand-900/5 ring-1 ring-slate-200/70 overflow-hidden flex flex-col min-h-0 flex-1">
            {saving ? (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-2xl border-[3px] border-brand-100 border-t-brand-600 animate-spin"></div>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center animate-pulse">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.7 9.7 0 01-4-.85L3 20l1.1-3.3A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                  </div>
                </div>
                <p className="text-ink-400 font-500 text-sm tracking-wide animate-pulse">Guardando...</p>
              </div>
            ) : (
            <>
              <div className="p-6 sm:p-10 overflow-y-auto flex-1 min-h-0">

              {/* ===== PASO 0 ===== */}
              {step === 0 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">1</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Perfil de usuario</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">Tu perfil personal</h1>
                  <p className="text-ink-500 mb-6">Completa tus datos antes de configurar tu negocio.</p>

                  <div className="space-y-5">
                    {/* Foto de perfil */}
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-2">Foto de perfil <span className="text-ink-400 font-normal">· opcional</span></label>
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                          {avatarPreview ? (
                            <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <svg className="w-8 h-8 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                          )}
                        </div>
                        <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" ref={fileInputRef} onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              showError('La imagen debe pesar menos de 5MB')
                              return
                            }
                            setAvatarFile(file)
                            setAvatarPreview(URL.createObjectURL(file))
                          }
                        }} />
                        <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
                          Subir imagen
                        </button>
                      </div>
                    </div>

                    {/* Tu nombre */}
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Tu nombre completo</label>
                      <input type="text" value={s0.nombre}
                        onChange={e => setS0({...s0, nombre: e.target.value})}
                        placeholder="Ej. Ana Martínez"
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    </div>

                    {/* Teléfono */}
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Teléfono <span className="text-ink-400 font-normal">· opcional</span></label>
                      <div className="flex gap-2">
                        <select value={s0.prefijoPais} onChange={e => setS0({...s0, prefijoPais: e.target.value})}
                          className="w-[120px] h-12 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition">
                          <option value="+34">🇪🇸 +34</option>
                          <option value="+52">🇲🇽 +52</option>
                          <option value="+57">🇨🇴 +57</option>
                          <option value="+54">🇦🇷 +54</option>
                          <option value="+56">🇨🇱 +56</option>
                          <option value="+51">🇵🇪 +51</option>
                          <option value="+58">🇻🇪 +58</option>
                          <option value="+593">🇪🇨 +593</option>
                          <option value="+598">🇺🇾 +598</option>
                          <option value="+595">🇵🇾 +595</option>
                          <option value="+591">🇧🇴 +591</option>
                          <option value="+1809">🇩🇴 +1809</option>
                          <option value="+502">🇬🇹 +502</option>
                          <option value="+506">🇨🇷 +506</option>
                          <option value="+507">🇵🇦 +507</option>
                        </select>
                        <input type="tel" value={s0.telefono}
                          onChange={e => setS0({...s0, telefono: e.target.value.replace(/\D/g, '')})}
                          placeholder="612 345 678"
                          className="flex-1 h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ===== PASO 1 ===== */}
              {step === 1 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">2</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Datos de tu negocio</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">Cuéntanos de tu negocio</h1>
                  <p className="text-ink-500 mb-6">Completa los datos de tu empresa y tu primera sucursal.</p>

                  <div className="space-y-4">

                    {/* Nombre del negocio */}
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Nombre del negocio</label>
                      <input type="text" value={s1.nombreNegocio}
                        onChange={e => {
                          const val = e.target.value
                          setS1(prev => ({
                            ...prev,
                            nombreNegocio: val,
                            nombreSucursal: prev.nombreSucursal === prev.nombreNegocio ? val : prev.nombreSucursal
                          }))
                        }}
                        placeholder="Ej. Pastelería Dulce Hogar"
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    </div>

                    {/* Dirección fiscal */}
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Dirección fiscal <span className="text-ink-400 font-normal">· opcional</span></label>
                      <input type="text" value={s1.direccionFiscal}
                        onChange={e => setS1({...s1, direccionFiscal: e.target.value})}
                        placeholder="Dirección fiscal de la empresa"
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                    </div>

                    {/* Separador primera sucursal */}
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
                              onChange={e => setS1({...s1, nombreSucursal: e.target.value})}
                              placeholder="Ej. Sede Central"
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
                              <option value="UYU">UYU - Peso uruguayo</option>
                              <option value="PYG">PYG - Guaraní paraguayo</option>
                              <option value="BOB">BOB - Boliviano</option>
                              <option value="GTQ">GTQ - Quetzal guatemalteco</option>
                              <option value="HNL">HNL - Lempira hondureño</option>
                              <option value="NIO">NIO - Córdoba nicaragüense</option>
                              <option value="CRC">CRC - Colón costarricense</option>
                              <option value="PAB">PAB - Balboa panameño</option>
                              <option value="DOP">DOP - Peso dominicano</option>
                              <option value="CUP">CUP - Peso cubano</option>
                              <option value="CAD">CAD - Dólar canadiense</option>
                              <option value="JPY">JPY - Yen japonés</option>
                              <option value="CNY">CNY - Yuan chino</option>
                              <option value="CHF">CHF - Franco suizo</option>
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

                        <div>
                          <label className="block text-sm font-medium text-ink-700 mb-1.5">Dirección de la sucursal <span className="text-ink-400 font-normal">· opcional</span></label>
                          <input type="text" value={s1.direccionSucursal}
                            onChange={e => setS1({...s1, direccionSucursal: e.target.value})}
                            placeholder="Calle, número, ciudad"
                            className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
                        </div>
                      </div>
                    </div>

                    {/* Servicios */}
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Servicios que ofrece</label>
                      <textarea rows={3} value={s1.servicios}
                        onChange={e => setS1({...s1, servicios: e.target.value})}
                        placeholder="Describe los productos o servicios de tu negocio..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition"></textarea>
                    </div>

                    {/* Políticas del negocio */}
                    <div>
                      <label className="block text-sm font-medium text-ink-700 mb-1.5">Políticas del negocio <span className="text-ink-400 font-normal">· opcional</span></label>
                      <p className="text-xs text-ink-500 mb-3">Añade las políticas de tu negocio (devoluciones, envíos, garantías, etc.)</p>

                      {/* Tarjetas de políticas añadidas */}
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

                    {/* Modal de política */}
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
                </div>
              )}

              {/* ===== PASO 2 ===== */}
              {step === 2 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">3</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Horarios de atención</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">¿Cuándo atiende tu negocio?</h1>
                  <p className="text-ink-500 mb-6">Añade hasta 4 franjas por día. Fuera de este horario, la IA enviará un mensaje de aviso.</p>

                  <div className="space-y-4">
                    {s2.map((h, i) => (
                      <div key={h.dia} className={`p-4 rounded-xl border transition ${h.activo ? 'border-brand-200 bg-white shadow-sm' : 'border-slate-200 bg-slate-50'}`}>
                        <label className="flex items-center gap-2.5 mb-3 cursor-pointer">
                          <input type="checkbox" checked={h.activo} onChange={e => {
                            const n = [...s2]; 
                            n[i].activo = e.target.checked; 
                            if (e.target.checked && n[i].franjas.length === 0) {
                              n[i].franjas = [{ apertura: '', cierre: '' }];
                            }
                            setS2(n);
                          }} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                          <span className={`font-semibold ${h.activo ? 'text-ink-900' : 'text-ink-400'}`}>{h.dia}</span>
                        </label>
                        
                        {h.activo && (
                          <div className="space-y-2.5 pl-6 border-l-2 border-brand-100 ml-2">
                            {h.franjas.map((f, j) => (
                              <div key={j} className="flex items-center gap-2 sm:gap-3">
                                <input type="time" value={f.apertura} onChange={e => {
                                  const n = [...s2]; n[i].franjas[j].apertura = e.target.value; setS2(n);
                                }} className="flex-1 h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition" />
                                <span className="text-ink-400 text-sm font-medium">-</span>
                                <input type="time" value={f.cierre} onChange={e => {
                                  const n = [...s2]; n[i].franjas[j].cierre = e.target.value; setS2(n);
                                }} className="flex-1 h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 transition" />
                                <button type="button" onClick={() => {
                                  const n = [...s2]; n[i].franjas.splice(j, 1); setS2(n);
                                }} className="p-2.5 text-ink-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Eliminar franja">
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                              </div>
                            ))}
                            {h.franjas.length < 4 && (
                              <button type="button" onClick={() => {
                                const n = [...s2]; n[i].franjas.push({ apertura: '', cierre: '' }); setS2(n);
                              }} className="text-xs font-semibold text-brand-600 hover:text-brand-800 transition pt-1 flex items-center gap-1">
                                + Añadir franja
                              </button>
                            )}
                            {h.franjas.length === 0 && (
                              <p className="text-xs text-red-500 font-medium">Debe haber al menos una franja si el día está activo.</p>
                            )}

                            {h.franjas.some(f => f.apertura && f.cierre) && (
                              <div className="relative pt-1">
                                <button type="button" onClick={() => {
                                  setCopyPopoverOpen(copyPopoverOpen === i ? null : i)
                                  setCopyTargets([])
                                }} className="text-xs font-semibold text-ink-500 hover:text-ink-700 transition flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                                  Copiar a...
                                </button>

                                {copyPopoverOpen === i && (
                                  <div className="absolute z-10 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 p-3">
                                    <p className="text-xs font-semibold text-ink-700 mb-2">Copiar horario de {h.dia} a:</p>
                                    <div className="space-y-1.5 mb-3">
                                      {s2.map((otherDay, otherIndex) => otherIndex !== i && (
                                        <label key={otherDay.dia} className="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                                          <input type="checkbox"
                                            checked={copyTargets.includes(otherIndex)}
                                            onChange={e => {
                                              if (e.target.checked) {
                                                setCopyTargets(prev => [...prev, otherIndex])
                                              } else {
                                                setCopyTargets(prev => prev.filter(idx => idx !== otherIndex))
                                              }
                                            }}
                                            className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                                          {otherDay.dia}
                                        </label>
                                      ))}
                                    </div>
                                    <div className="flex gap-2">
                                      <button type="button" onClick={() => { setCopyPopoverOpen(null); setCopyTargets([]) }}
                                        className="flex-1 h-8 rounded-lg text-xs font-600 text-ink-600 hover:bg-slate-100 transition">
                                        Cancelar
                                      </button>
                                      <button type="button" onClick={() => applyCopyHorario(i)}
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
                    ))}
                  </div>
                </div>
              )}

              {/* ===== PASO 3 ===== */}
              {step === 3 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">4</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Skills de IA</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">Activa las Skills de IA</h1>
                  <p className="text-ink-500 mb-6">Selecciona las habilidades que quieres que la IA tenga por defecto para esta sucursal. Las podrás cambiar luego.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {s3.map((s, i) => {
                      const isFija = !s.cliente_puede_toggle;
                      return (
                        <label key={s.skill_global_id} className={`flex gap-3 p-4 rounded-xl border transition ${s.activo ? (isFija ? 'border-brand-200 bg-brand-50/30' : 'border-brand-200 bg-brand-50/50 shadow-sm') : 'border-slate-200 hover:border-slate-300 bg-white'} ${isFija ? 'cursor-default' : 'cursor-pointer'}`}>
                          <div className="pt-0.5 relative">
                            <input type="checkbox" checked={s.activo} disabled={isFija} onChange={e => {
                              if (isFija) return;
                              const n = [...s3]; n[i].activo = e.target.checked; setS3(n)
                            }} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400 disabled:opacity-60" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className="block font-bold text-ink-900 text-sm">{s.nombre}</span>
                              {isFija && (
                                <span title="Incluido siempre" className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-100/50 text-brand-600">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                                  </svg>
                                </span>
                              )}
                            </div>
                            <span className={`block text-xs leading-relaxed ${isFija ? 'text-ink-400' : 'text-ink-500'}`}>{s.descripcion}</span>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ===== PASO 4 ===== */}
              {step === 4 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">5</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Mensaje de bienvenida</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">El primer mensaje al cliente</h1>
                  <p className="text-ink-500 mb-6">La IA enviará este texto al inicio de cada conversación nueva.</p>

                  <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
                    <input type="checkbox" checked={s4Skip} onChange={e => {
                      setS4Skip(e.target.checked);
                      if (e.target.checked) setS4Msg('');
                    }} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                    <span className="font-semibold text-ink-900 text-sm">No quiero enviar mensaje de bienvenida</span>
                  </label>

                  <textarea rows={5} value={s4Msg} onChange={e => setS4Msg(e.target.value)} disabled={s4Skip}
                    placeholder="Ej. ¡Hola! Soy el asistente virtual de Pastelería Dulce Hogar. Estoy aquí para ayudarte con información sobre nuestros productos y precios. ¿En qué puedo ayudarte hoy?"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 bg-white resize-none placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition disabled:opacity-50 disabled:bg-slate-50"></textarea>

                  <div className="flex items-start gap-3 mt-4 rounded-xl bg-brand-50 border border-brand-100 p-3.5">
                    <svg className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <p className="text-sm text-ink-700">Es buena idea aclarar que se trata de un asistente virtual. Así el cliente sabe que habla con una IA.</p>
                  </div>

                  <div className="mt-6 space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer group">
                      <input type="checkbox" checked={s4IaActiva} onChange={e => {
                        setS4IaActiva(e.target.checked);
                        if (e.target.checked) setS4AbrirCaso(false);
                      }}
                        className="w-4 h-4 mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                      <span className="text-sm font-500 text-ink-900 group-hover:text-brand-700 transition">
                        Permitir que la IA siga respondiendo fuera del horario de atención
                      </span>
                    </label>
                    <label className={`flex items-start gap-2.5 group ${s4IaActiva ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                      <input type="checkbox" checked={s4AbrirCaso} disabled={s4IaActiva} onChange={e => setS4AbrirCaso(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400 disabled:cursor-not-allowed" />
                      <span className="text-sm font-500 text-ink-900 group-hover:text-brand-700 transition">
                        Abrir un caso automáticamente cuando llega un mensaje fuera de horario
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* ===== PASO 5 ===== */}
              {step === 5 && (
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 font-display font-bold flex items-center justify-center text-sm">6</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">Lista de precios</span>
                  </div>
                  <h1 className="font-display font-bold text-2xl text-ink-900 mb-1.5">Carga tus productos</h1>
                  <p className="text-ink-500 mb-6">Añade al menos un ítem. La IA usará estos precios para responder.</p>

                  <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 mb-6 text-sm text-brand-800">
                    Puedes continuar sin añadir productos ahora. Más adelante podrás descargar una plantilla y hacer la importación masiva de tu lista completa de precios.
                  </div>

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

            <div className="shrink-0 flex items-center justify-between gap-3 px-6 sm:px-10 py-5 border-t border-slate-100 bg-slate-50/60">
              <button disabled={step === 0 || saving} onClick={handleBack}
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
            </>
            )}
          </div>
        </div>
      </main>

      <ErrorModal 
        isOpen={isErrorModalOpen} 
        message={modalError} 
        onClose={() => setIsErrorModalOpen(false)} 
      />
    </div>
  )
}
