'use client'

import { useState } from 'react'
import { crearCuentaTrial } from '@/app/actions/superadmin'

export default function NuevoClientePage() {
  const [formData, setFormData] = useState({
    nombre_organizacion: '',
    email_admin: '',
    nombre_admin: ''
  })
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<{ tipo: 'exito' | 'error', texto: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResultado(null)

    const res = await crearCuentaTrial(formData)

    if (res.success) {
      setResultado({ tipo: 'exito', texto: `Cuenta trial creada para ${formData.nombre_organizacion}. Se ha enviado un email de acceso a ${formData.email_admin}.` })
      setFormData({ nombre_organizacion: '', email_admin: '', nombre_admin: '' })
    } else {
      setResultado({ tipo: 'error', texto: res.error || 'Error al crear la cuenta' })
    }
    setLoading(false)
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="font-display font-700 text-2xl sm:text-3xl text-ink-900">Nuevo cliente</h1>
        <p className="text-ink-500 mt-1">Crea una cuenta trial de 14 días para tu cliente. Quedará vinculada a ti automáticamente.</p>
      </div>

      {resultado && (
        <div className={`p-4 rounded-xl text-sm font-500 border ${resultado.tipo === 'exito' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {resultado.texto}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre del negocio</label>
          <input type="text" required placeholder="Ej: Restaurante La Mar"
            value={formData.nombre_organizacion}
            onChange={e => setFormData({...formData, nombre_organizacion: e.target.value})}
            className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
        </div>

        <div>
          <label className="block text-sm font-500 text-ink-700 mb-1.5">Email del administrador</label>
          <input type="email" required placeholder="admin@negocio.com"
            value={formData.email_admin}
            onChange={e => setFormData({...formData, email_admin: e.target.value})}
            className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
          <p className="text-xs text-ink-400 mt-1.5">Recibirá un email para activar su cuenta y completar el onboarding.</p>
        </div>

        <div>
          <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre del administrador <span className="text-ink-400 font-400">· opcional</span></label>
          <input type="text" placeholder="Nombre de la persona"
            value={formData.nombre_admin}
            onChange={e => setFormData({...formData, nombre_admin: e.target.value})}
            className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100 transition" />
        </div>

        <div className="p-4 rounded-xl bg-brand-50 border border-brand-100">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <div className="text-sm text-brand-800">
              <p className="font-600 mb-1">¿Qué pasa cuando creas un cliente?</p>
              <ul className="space-y-0.5 text-brand-700 text-xs">
                <li>· Se crea una cuenta trial de 14 días</li>
                <li>· El cliente recibe un email para activar su cuenta</li>
                <li>· La organización queda vinculada a ti permanentemente</li>
                <li>· Cuando convierta a pago, se generará tu comisión automáticamente</li>
              </ul>
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Creando cuenta...
            </>
          ) : 'Crear cuenta trial'}
        </button>
      </form>
    </div>
  )
}
