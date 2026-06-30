'use client'

import { useState, useEffect } from 'react'
import { getPerfilComercio, savePerfilComercio } from '@/app/actions/perfil'
import { getHorarios, saveHorarios } from '@/app/actions/horarios'

const DIAS_SEMANA = [
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
  { id: 6, label: 'Sábado' },
  { id: 0, label: 'Domingo' }
]

export default function PerfilComercioPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  const [formData, setFormData] = useState({
    nombreSucursal: '',
    direccion: '',
    timezone: '',
    servicios: '',
    politicas: '',
    idioma_base: 'es',
    tono: 'cercano',
    msg_fuera_horario: ''
  })
  const [horarios, setHorarios] = useState<any[]>([])

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      const [resPerfil, resHorarios] = await Promise.all([
        getPerfilComercio(),
        getHorarios()
      ])
      
      if (resPerfil.success && resPerfil.data) {
        setFormData({
          nombreSucursal: resPerfil.data.sucursal?.nombre || '',
          direccion: resPerfil.data.sucursal?.direccion || '',
          timezone: resPerfil.data.sucursal?.timezone || 'America/Caracas',
          servicios: resPerfil.data.perfil?.servicios || '',
          politicas: resPerfil.data.perfil?.politicas || '',
          idioma_base: resPerfil.data.perfil?.idioma_base || 'es',
          tono: resPerfil.data.perfil?.tono || 'cercano',
          msg_fuera_horario: resPerfil.data.perfil?.msg_fuera_horario || ''
        })
      }
      
      if (resHorarios.success && resHorarios.data) {
        const ordenados = DIAS_SEMANA.map(d => {
          const bd = resHorarios.data.find((h: any) => h.dia_semana === d.id)
          return bd ? { ...bd } : { dia_semana: d.id, apertura: '09:00', cierre: '18:00', cerrado: true }
        })
        setHorarios(ordenados)
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleChangeHorario = (diaId: number, field: string, value: any) => {
    setHorarios(prev => prev.map(h => {
      if (h.dia_semana === diaId) {
        return { ...h, [field]: value }
      }
      return h
    }))
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
    
    const horariosFormatted = horarios.map(h => ({
      dia_semana: h.dia_semana,
      apertura: normalizeTime(h.apertura),
      cierre: normalizeTime(h.cierre),
      cerrado: h.cerrado
    }))

    const [resPerfil, resHorarios] = await Promise.all([
      savePerfilComercio(formData),
      saveHorarios(horariosFormatted)
    ])
    
    if (resPerfil.success && resHorarios.success) {
      setMensaje({ tipo: 'exito', texto: 'Cambios guardados correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: resPerfil.error || resHorarios.error || 'Error al guardar los cambios' })
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando perfil de la sucursal...</div>
  }

  return (
    <div className="p-6 sm:p-10 max-w-4xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 font-display">Perfil de la sucursal</h1>
        <p className="text-ink-500 mt-1">Configura los datos de tu negocio y la personalidad de tu asistente IA.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* SECCIÓN: DATOS DEL COMERCIO */}
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
                  className="w-full h-11 px-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none bg-white"
                >
                  <option value="America/Caracas">Caracas (UTC-4)</option>
                  <option value="America/Bogota">Bogotá (UTC-5)</option>
                  <option value="America/Mexico_City">Ciudad de México (UTC-6)</option>
                  <option value="America/Argentina/Buenos_Aires">Buenos Aires (UTC-3)</option>
                  <option value="Europe/Madrid">Madrid (UTC+1)</option>
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
                rows={4}
                className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none resize-y"
                placeholder="Describe qué vendes o qué servicios ofreces para que la IA sepa de qué trata el negocio..."
              ></textarea>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Políticas (Devoluciones, Envíos, etc)</label>
              <textarea 
                name="politicas"
                value={formData.politicas}
                onChange={handleChange}
                rows={4}
                className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none resize-y"
                placeholder="Tiempos de entrega, políticas de devolución, métodos de pago aceptados..."
              ></textarea>
            </div>
          </div>
        </section>

        {/* SECCIÓN: HORARIOS DE ATENCIÓN */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-slate-100">
            <h2 className="text-xl font-bold text-ink-900">Horarios de atención</h2>
          </div>
          
          <div className="divide-y divide-slate-100">
            {horarios.map(h => {
              const diaObj = DIAS_SEMANA.find(d => d.id === h.dia_semana)
              return (
                <div key={h.dia_semana} className={`p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${h.cerrado ? 'bg-slate-50' : 'bg-white'}`}>
                  <label className="flex items-center gap-4 cursor-pointer min-w-[140px]">
                    <div className="relative flex items-center justify-center w-6 h-6">
                      <input 
                        type="checkbox" 
                        checked={!h.cerrado}
                        onChange={e => handleChangeHorario(h.dia_semana, 'cerrado', !e.target.checked)}
                        className="peer sr-only" 
                      />
                      <div className="w-6 h-6 border-2 border-slate-300 rounded bg-white peer-checked:bg-brand-600 peer-checked:border-brand-600 transition"></div>
                      <svg className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className={`font-semibold ${h.cerrado ? 'text-slate-400' : 'text-ink-900'}`}>{diaObj?.label}</span>
                  </label>

                  <div className="flex items-center gap-3 ml-10 sm:ml-0">
                    <input 
                      type="time" 
                      value={h.apertura ? h.apertura.substring(0, 5) : ''} 
                      onChange={e => handleChangeHorario(h.dia_semana, 'apertura', e.target.value)}
                      disabled={h.cerrado}
                      className="w-32 h-11 px-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none disabled:bg-slate-100 disabled:text-slate-400 font-medium"
                    />
                    <span className="text-slate-400 font-medium">a</span>
                    <input 
                      type="time" 
                      value={h.cierre ? h.cierre.substring(0, 5) : ''} 
                      onChange={e => handleChangeHorario(h.dia_semana, 'cierre', e.target.value)}
                      disabled={h.cerrado}
                      className="w-32 h-11 px-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none disabled:bg-slate-100 disabled:text-slate-400 font-medium"
                    />
                  </div>
                </div>
              )
            })}
          </div>
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
                rows={3}
                className="w-full p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none resize-y"
                placeholder="¡Hola! En este momento estamos cerrados. Déjanos tu mensaje y te responderemos a primera hora."
              ></textarea>
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
            disabled={saving}
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
