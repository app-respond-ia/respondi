'use client'

import { useState } from 'react'
import { actualizarPerfilVendedor } from '@/app/actions/vendedor'

type VendedorData = {
  nombre: string
  email: string
  comision_conversion_pct: number
  comision_mrr_pct: number
  activo: boolean
}

export default function PerfilForm({ vendedor }: { vendedor: VendedorData }) {
  const [nombre, setNombre] = useState(vendedor.nombre || '')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)
    setMessage(null)

    const res = await actualizarPerfilVendedor(nombre)
    setIsSaving(false)

    if (res.success) {
      setMessage({ type: 'success', text: 'Perfil actualizado correctamente.' })
    } else {
      setMessage({ type: 'error', text: res.error || 'Error al actualizar el perfil.' })
    }
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-600 text-ink-900 font-display">Información personal</h2>
          <p className="text-sm text-ink-500 mt-1">Actualiza tu nombre de usuario.</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-500 text-ink-700 mb-1.5">Nombre completo</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-500 text-ink-700 mb-1.5">Email (solo lectura)</label>
              <input
                type="email"
                value={vendedor.email}
                disabled
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-ink-500 cursor-not-allowed outline-none"
              />
              <p className="text-xs text-ink-400 mt-1.5">El correo electrónico se usa para iniciar sesión y no se puede cambiar aquí.</p>
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-xl text-sm font-500 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
              {message.text}
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={isSaving}
              className={`px-4 py-2 rounded-xl text-sm font-600 transition ${isSaving ? 'bg-brand-400 text-white cursor-not-allowed' : 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm hover:shadow'}`}
            >
              {isSaving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-600 text-ink-900 font-display">Condiciones de trabajo</h2>
            <p className="text-sm text-ink-500 mt-1">Tus comisiones y estado actual.</p>
          </div>
          <span className={`px-2.5 py-1 text-xs font-600 rounded-lg ${vendedor.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {vendedor.activo ? 'Cuenta activa' : 'Cuenta inactiva'}
          </span>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-sm font-500 text-ink-500 mb-1">Comisión por Conversión</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-700 text-brand-700 font-display">{vendedor.comision_conversion_pct}%</span>
                <span className="text-sm text-ink-400">/ venta</span>
              </div>
              <p className="text-xs text-ink-500 mt-2">Aplicable a pagos iniciales (setup o un solo pago).</p>
            </div>
            
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-sm font-500 text-ink-500 mb-1">Comisión Recurrente (MRR)</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-700 text-brand-700 font-display">{vendedor.comision_mrr_pct}%</span>
                <span className="text-sm text-ink-400">/ mes</span>
              </div>
              <p className="text-xs text-ink-500 mt-2">Aplicable a mensualidades mientras el cliente siga activo.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
