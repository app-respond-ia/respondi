'use client'

import { useState } from 'react'
import { cambiarContrasenaSuperadmin } from '@/app/actions/superadmin'

export default function PasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)
    setMessage(null)

    if (password.length < 8) {
      setMessage({ type: 'error', text: 'La contraseña debe tener al menos 8 caracteres.' })
      setIsSaving(false)
      return
    }

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden.' })
      setIsSaving(false)
      return
    }

    const res = await cambiarContrasenaSuperadmin(password)
    setIsSaving(false)

    if (res.success) {
      setMessage({ type: 'success', text: 'Contraseña actualizada correctamente.' })
      setPassword('')
      setConfirmPassword('')
    } else {
      setMessage({ type: 'error', text: res.error || 'Error al actualizar la contraseña.' })
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-lg font-600 text-ink-900 font-display">Cambiar contraseña</h2>
        <p className="text-sm text-ink-500 mt-1">Ingresa tu nueva contraseña para actualizar el acceso a tu cuenta.</p>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-500 text-ink-700 mb-1.5">Nueva contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition outline-none"
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="block text-sm font-500 text-ink-700 mb-1.5">Confirmar contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition outline-none"
              required
              minLength={8}
            />
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
            {isSaving ? 'Guardando...' : 'Actualizar contraseña'}
          </button>
        </div>
      </form>
    </div>
  )
}
