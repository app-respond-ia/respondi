'use client'

import { useState, useEffect } from 'react'
import { getHorarios, saveHorarios } from '@/app/actions/horarios'

// Array maestro para asegurar el orden de visualización de Lunes a Domingo
const DIAS_SEMANA = [
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
  { id: 6, label: 'Sábado' },
  { id: 0, label: 'Domingo' }
]

export default function HorariosPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  const [horarios, setHorarios] = useState<any[]>([])

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      const res = await getHorarios()
      if (res.success && res.data) {
        // Ordenar según DIAS_SEMANA
        const ordenados = DIAS_SEMANA.map(d => {
          const bd = res.data.find((h: any) => h.dia_semana === d.id)
          return bd ? { ...bd } : { dia_semana: d.id, apertura: '09:00', cierre: '18:00', cerrado: true }
        })
        setHorarios(ordenados)
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const handleChange = (diaId: number, field: string, value: any) => {
    setHorarios(prev => prev.map(h => {
      if (h.dia_semana === diaId) {
        return { ...h, [field]: value }
      }
      return h
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMensaje(null)
    
    // Preparar formato de tiempo (asegurar que Postgres lo reciba como time ej: '09:00:00')
    const formatted = horarios.map(h => ({
      dia_semana: h.dia_semana,
      apertura: h.apertura.length === 5 ? `${h.apertura}:00` : h.apertura,
      cierre: h.cierre.length === 5 ? `${h.cierre}:00` : h.cierre,
      cerrado: h.cerrado
    }))

    const res = await saveHorarios(formatted)
    
    if (res.success) {
      setMensaje({ tipo: 'exito', texto: 'Cambios guardados correctamente ✓' })
      setTimeout(() => setMensaje(null), 3000)
    } else {
      setMensaje({ tipo: 'error', texto: res.error || 'Error al guardar los horarios' })
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="p-10 text-center text-slate-500 font-medium">Cargando horarios...</div>
  }

  return (
    <div className="p-6 sm:p-10 max-w-4xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 font-display">Horarios de atención</h1>
        <p className="text-ink-500 mt-1">Configura el horario en el que la IA atenderá a tus clientes o avisará que estás cerrado.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-slate-100">
            <h2 className="text-xl font-bold text-ink-900">Días y horas de apertura</h2>
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
                        onChange={e => handleChange(h.dia_semana, 'cerrado', !e.target.checked)}
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
                      // Se hace substring para prevenir que '09:00:00' rompa el input type="time" en algunos navegadores
                      value={h.apertura ? h.apertura.substring(0, 5) : ''} 
                      onChange={e => handleChange(h.dia_semana, 'apertura', e.target.value)}
                      disabled={h.cerrado}
                      className="w-32 h-11 px-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none disabled:bg-slate-100 disabled:text-slate-400 font-medium"
                    />
                    <span className="text-slate-400 font-medium">a</span>
                    <input 
                      type="time" 
                      value={h.cierre ? h.cierre.substring(0, 5) : ''} 
                      onChange={e => handleChange(h.dia_semana, 'cierre', e.target.value)}
                      disabled={h.cerrado}
                      className="w-32 h-11 px-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition outline-none disabled:bg-slate-100 disabled:text-slate-400 font-medium"
                    />
                  </div>
                </div>
              )
            })}
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
